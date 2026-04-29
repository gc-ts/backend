import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { extractText, inferTitle } from './docLoader.js';
import * as store from './vectorStore.js';

dotenv.config();

const DOCS_DIR = process.env.RAG_DOCS_DIR || './data/docs';
const PORTAL_URL = (process.env.WP_URL || 'https://portal-test.1221systems.ru').replace(/\/+$/, '');
const PORTAL_LINKS = {
  store: `${PORTAL_URL}/store/`,
  benefits: `${PORTAL_URL}/cafeteria/`,
  recommendations: `${PORTAL_URL}/career/recommendations/`,
  vacancyApplications: `${PORTAL_URL}/career/vacancies/`,
  vacancies: 'https://nn.hh.ru/search/vacancy?from=employerPage&employer_id=6067730&hhtmFrom=employer',
  training: `${PORTAL_URL}/training/`,
  contacts: `${PORTAL_URL}/contact/`
};

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
    content: `Программы ДМС и другие льготы доступны в разделе «Кафетерий льгот» корпоративного портала.\nСсылка: ${PORTAL_LINKS.benefits}\n\nКратко:\n- Откройте кафетерий льгот на портале.\n- Выберите доступную программу ДМС или другую льготу.\n- Если условия программы непонятны, обратитесь в HR через раздел контактов: ${PORTAL_LINKS.contacts}\n\nОснование: Корпоративный портал, Кафетерий льгот`,
    source: 'Корпоративный портал, Кафетерий льгот'
  },
  merch: {
    title: 'Магазин мерча',
    content: `Заказ корпоративного мерча оформляется в магазине на корпоративном портале.\nСсылка: ${PORTAL_LINKS.store}\n\nКратко:\n- Перейдите в магазин мерча.\n- Выберите нужный товар.\n- Оформите заказ на портале; если товар недоступен или есть вопрос по оплате/доставке, обратитесь в HR через контакты: ${PORTAL_LINKS.contacts}\n\nОснование: Корпоративный портал, Магазин мерча`,
    source: 'Корпоративный портал, Магазин мерча'
  },
  referral: {
    title: 'Реферальная программа',
    content: `Рекомендовать друга на вакансию можно через раздел рекомендаций на корпоративном портале.\nСсылка: ${PORTAL_LINKS.recommendations}\n\nКратко:\n- Откройте форму рекомендаций.\n- Укажите данные кандидата и вакансию, если она известна.\n- Открытые вакансии компании можно посмотреть здесь: ${PORTAL_LINKS.vacancies}\n- По дополнительным вопросам обратитесь в HR через контакты: ${PORTAL_LINKS.contacts}\n\nОснование: Корпоративный портал, Рекомендации`,
    source: 'Корпоративный портал, Рекомендации'
  },
  vacancies: {
    title: 'Вакансии и заявки на вакансии',
    content: `Открытые вакансии и заявки доступны по ссылкам:\n- Вакансии на hh.ru: ${PORTAL_LINKS.vacancies}\n- Заявки на вакансии на корпоративном портале: ${PORTAL_LINKS.vacancyApplications}\n\nКратко:\n- Для просмотра актуальных вакансий откройте страницу работодателя на hh.ru.\n- Для внутренних заявок используйте раздел «Вакансии» на корпоративном портале.\n- Если нужна помощь с откликом или рекомендацией кандидата, используйте форму рекомендаций: ${PORTAL_LINKS.recommendations}\n\nОснование: Корпоративный портал, Вакансии`,
    source: 'Корпоративный портал, Вакансии'
  },
  training: {
    title: 'Обучение и курсы',
    content: `Обучение и курсы доступны в разделе «Обучение» корпоративного портала.\nСсылка: ${PORTAL_LINKS.training}\n\nКратко:\n- Откройте раздел обучения.\n- Выберите доступный курс или учебный материал.\n- Если нужен доступ к курсу, обратитесь к ответственному за обучение или в HR через контакты: ${PORTAL_LINKS.contacts}\n\nОснование: Корпоративный портал, Обучение`,
    source: 'Корпоративный портал, Обучение'
  },
  contacts: {
    title: 'Контакты',
    content: `Контакты компании и ответственных сотрудников доступны на корпоративном портале.\nСсылка: ${PORTAL_LINKS.contacts}\n\nКратко:\n- Используйте раздел контактов для связи с HR и другими ответственными.\n- Если вопрос связан с вакансией, рекомендацией, льготами, мерчем или обучением, начните с профильного раздела портала и при необходимости обратитесь через контакты.\n\nОснование: Корпоративный портал, Контакты`,
    source: 'Корпоративный портал, Контакты'
  },
  portal: {
    title: 'Корпоративный портал',
    content: `Основные разделы корпоративного портала:\n- Магазин мерча: ${PORTAL_LINKS.store}\n- Кафетерий льгот и ДМС: ${PORTAL_LINKS.benefits}\n- Рекомендовать друга: ${PORTAL_LINKS.recommendations}\n- Заявки на вакансии: ${PORTAL_LINKS.vacancyApplications}\n- Открытые вакансии на hh.ru: ${PORTAL_LINKS.vacancies}\n- Обучение и курсы: ${PORTAL_LINKS.training}\n- Контакты: ${PORTAL_LINKS.contacts}\n\nОснование: Корпоративный портал`,
    source: 'Корпоративный портал'
  }
};

const KEYWORD_MAP = [
  { keys: ['отпуск', 'vacation', 'отдых'], entry: STATIC_KNOWLEDGE.vacation },
  { keys: ['зарплат', 'аванс', 'оклад', 'расчетный лист', 'расчётный лист'], entry: STATIC_KNOWLEDGE.salary },
  { keys: ['больнич', 'sick'], entry: STATIC_KNOWLEDGE.sickLeave },
  { keys: ['дмс', 'страхован', 'медицин', 'стоматолог'], entry: STATIC_KNOWLEDGE.dms },
  { keys: ['мерч', 'merch', 'мерчандайз', 'магазин'], entry: STATIC_KNOWLEDGE.merch },
  { keys: ['рекоменд', 'реферал', 'referral', 'друга на вакан', 'порекомендовать друга'], entry: STATIC_KNOWLEDGE.referral },
  { keys: ['ваканс', 'hh.ru', 'hh ', 'отклик', 'заявк'], entry: STATIC_KNOWLEDGE.vacancies },
  { keys: ['обучен', 'курс', 'тренинг', 'training'], entry: STATIC_KNOWLEDGE.training },
  { keys: ['контакт', 'адрес', 'телефон', 'связаться'], entry: STATIC_KNOWLEDGE.contacts },
  { keys: ['корпоративный портал', 'корп портал', 'портал', 'раздел портала'], entry: STATIC_KNOWLEDGE.portal }
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
  const kw = searchKnowledgeKeyword(query);
  if (kw?.source?.startsWith('Корпоративный портал')) {
    return { title: kw.title, content: kw.content, source: kw.source, hits: [] };
  }

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
