import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { extractText, inferTitle } from './docLoader.js';
import * as store from './vectorStore.js';

dotenv.config();

const DOCS_DIR = process.env.RAG_DOCS_DIR || './data/docs';

// Быстрые, статичные ответы по типовым кейсам из ТЗ — используются как fallback
// и как seed-документы, если папка с документами пуста.
const STATIC_KNOWLEDGE = {
  vacation: {
    title: 'Отпуска',
    content: `Правила предоставления отпусков:\n- Ежегодный оплачиваемый отпуск составляет 28 календарных дней.\n- Отпуск предоставляется согласно графику отпусков.\n- Для переноса отпуска необходимо подать заявление за 14 дней.\n\nОснование: Правила внутреннего трудового распорядка, п. 4.2`,
    source: 'Правила внутреннего трудового распорядка, п. 4.2'
  },
  salary: {
    title: 'Заработная плата',
    content: `Выплата заработной платы:\n- Аванс: 20 числа каждого месяца.\n- Основная часть: 5 числа следующего месяца.\n- Расчётный лист доступен в личном кабинете на портале.\n\nОснование: Положение об оплате труда, п. 5.1`,
    source: 'Положение об оплате труда, п. 5.1'
  },
  sickLeave: {
    title: 'Больничный лист',
    content: `Оформление больничного:\n- Больничный лист оплачивается согласно ТК РФ.\n- Электронный больничный передаётся в отдел кадров.\n- Оплата производится в ближайшую зарплату после предоставления документов.\n\nОснование: Положение об оплате труда, п. 6.3`,
    source: 'Положение об оплате труда, п. 6.3'
  },
  dms: {
    title: 'ДМС (Добровольное медицинское страхование)',
    content: `Программы ДМС:\n- Базовая программа: амбулаторное и стационарное лечение.\n- Расширенная программа: дополнительно стоматология.\n- Подключение — через отдел кадров.\nПодробнее: https://portal.company.ru/benefits/dms\n\nОснование: Положение о социальных льготах, раздел 3`,
    source: 'Положение о социальных льготах, раздел 3'
  },
  merch: {
    title: 'Магазин мерча',
    content: `Заказ корпоративного мерча:\n- Магазин: https://merch.company.ru\n- Доставка в офис бесплатная.\n- Оплата — внутренние бонусы или банковская карта.\n\nОснование: Положение о корпоративной культуре`,
    source: 'Положение о корпоративной культуре'
  },
  referral: {
    title: 'Реферальная программа',
    content: `Рекомендация кандидатов:\n- Форма: https://portal.company.ru/referral\n- Бонус за успешный найм: 50 000 ₽.\n- Контакт рекрутера: hr@company.ru\n\nОснование: Положение о реферальной программе`,
    source: 'Положение о реферальной программе'
  }
};

const KEYWORD_MAP = [
  { keys: ['отпуск', 'vacation', 'отдых'], entry: STATIC_KNOWLEDGE.vacation },
  { keys: ['зарплат', 'аванс', 'оклад', 'расчетный лист', 'расчётный лист'], entry: STATIC_KNOWLEDGE.salary },
  { keys: ['больнич', 'sick'], entry: STATIC_KNOWLEDGE.sickLeave },
  { keys: ['дмс', 'страхован', 'медицин', 'стоматолог'], entry: STATIC_KNOWLEDGE.dms },
  { keys: ['мерч', 'merch', 'мерчандайз'], entry: STATIC_KNOWLEDGE.merch },
  { keys: ['рекоменд', 'реферал', 'referral', 'друга на вакан'], entry: STATIC_KNOWLEDGE.referral }
];

export function searchKnowledgeKeyword(query) {
  const q = String(query || '').toLowerCase();
  for (const { keys, entry } of KEYWORD_MAP) {
    if (keys.some((k) => q.includes(k))) return entry;
  }
  return null;
}

export function getAllKnowledge() {
  return STATIC_KNOWLEDGE;
}

/**
 * Гибридный поиск: вектор + (если ничего не найдено) быстрый keyword-fallback.
 */
export async function searchKnowledge(query) {
  try {
    const hits = await store.search(query);
    if (hits.length) {
      return {
        title: hits[0].docTitle,
        content: store.buildContext(hits),
        source: hits.map((h) => `${h.docTitle}${h.section ? ', ' + h.section : ''}`).join('; '),
        hits
      };
    }
  } catch (e) {
    console.warn('Vector search failed, falling back to keyword:', e.message);
  }

  const kw = searchKnowledgeKeyword(query);
  if (kw) return { title: kw.title, content: kw.content, source: kw.source, hits: [] };

  return null;
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

const DEFAULT_CATEGORY_BY_NAME = [
  { re: /пвтр|правила.*трудов/i, type: 'ЛНА', category: 'Общие положения', title: 'Правила внутреннего трудового распорядка' },
  { re: /оплат.*труд|зарплат|премир/i, type: 'ЛНА', category: 'Заработная плата', title: 'Положение об оплате труда' },
  { re: /льгот|дмс|социал/i, type: 'ЛНА', category: 'Льготы и компенсации', title: 'Положение о социальных льготах' },
  { re: /отпуск/i, type: 'Инструкция', category: 'Отпуска', title: 'Инструкция по оформлению отпуска' }
];

function classify(filename) {
  for (const r of DEFAULT_CATEGORY_BY_NAME) {
    if (r.re.test(filename)) return { type: r.type, category: r.category, title: r.title };
  }
  return { type: 'Документ', category: 'Прочее', title: inferTitle(filename) };
}

/**
 * Скан папки RAG_DOCS_DIR и индексация новых/изменённых файлов.
 * Для исходных файлов из ТЗ делает sym-link/копию из домашней папки, если их нет.
 */
export async function ingestStartupDocuments() {
  ensureDir(DOCS_DIR);
  store.loadIndex();

  // Авто-подсев: скопировать ПВТР и ТЗ из домашней папки, если в RAG_DOCS_DIR пусто
  const seeds = [
    { src: path.resolve(process.env.HOME || '/root', 'ПВТР от 07.03.2025 №07.03.2025-1.docx'), dst: 'ПВТР.docx' },
    { src: path.resolve(process.env.HOME || '/root', '1221 Системс.pdf'), dst: '1221_Системс_ТЗ.pdf' }
  ];

  for (const s of seeds) {
    const target = path.join(DOCS_DIR, s.dst);
    if (!fs.existsSync(target) && fs.existsSync(s.src)) {
      try {
        fs.copyFileSync(s.src, target);
        console.log(`  📥 seed: ${s.src} → ${target}`);
      } catch (e) {
        console.warn(`  ⚠️  не удалось скопировать ${s.src}: ${e.message}`);
      }
    }
  }

  const files = fs.readdirSync(DOCS_DIR).filter((f) => /\.(pdf|docx|txt|md)$/i.test(f));
  if (!files.length) {
    console.log('📂 Документов для индексации нет (data/docs пуста).');
    return { indexed: 0 };
  }

  const existing = new Set(store.listDocuments().map((d) => d.id));
  let indexed = 0;
  let chunks = 0;

  for (const f of files) {
    const fp = path.join(DOCS_DIR, f);
    const stat = fs.statSync(fp);
    const id = store.hashId(`${f}:${stat.size}:${stat.mtimeMs}`);

    if (existing.has(id)) {
      console.log(`  ✓ ${f} — уже в индексе`);
      continue;
    }

    const meta = classify(f);
    console.log(`  📖 ${f} → "${meta.title}" [${meta.type}/${meta.category}]`);

    try {
      const text = await extractText(fp);
      if (!text || text.trim().length < 50) {
        console.warn(`    ⚠️  ${f}: пустой/слишком короткий текст`);
        continue;
      }
      const added = await store.indexDocument({
        id,
        title: meta.title,
        type: meta.type,
        category: meta.category,
        sourcePath: fp,
        text
      });
      indexed += 1;
      chunks += added;
    } catch (e) {
      console.error(`    ❌ ошибка индексации ${f}:`, e.message);
    }
  }

  console.log(`✅ Индексация завершена: документов ${indexed}, чанков добавлено ${chunks}`);
  return { indexed, chunks };
}

export default {
  searchKnowledge,
  searchKnowledgeKeyword,
  getAllKnowledge,
  ingestStartupDocuments
};
