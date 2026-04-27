import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { embed } from './ollama.js';
import dotenv from 'dotenv';

dotenv.config();

const INDEX_PATH = process.env.RAG_INDEX_PATH || './data/vector-index.json';
const TOP_K = parseInt(process.env.RAG_TOP_K) || 4;
const MIN_SCORE = parseFloat(process.env.RAG_MIN_SCORE) || 0.35;

let chunks = [];
let loaded = false;

function ensureDir(p) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export function loadIndex() {
  if (loaded) return chunks.length;
  try {
    if (fs.existsSync(INDEX_PATH)) {
      const raw = fs.readFileSync(INDEX_PATH, 'utf-8');
      chunks = JSON.parse(raw);
      console.log(`📚 Vector index loaded: ${chunks.length} chunks from ${INDEX_PATH}`);
    } else {
      chunks = [];
    }
  } catch (e) {
    console.error('Failed to load vector index:', e.message);
    chunks = [];
  }
  loaded = true;
  return chunks.length;
}

export function saveIndex() {
  ensureDir(INDEX_PATH);
  fs.writeFileSync(INDEX_PATH, JSON.stringify(chunks), 'utf-8');
  console.log(`💾 Vector index saved: ${chunks.length} chunks → ${INDEX_PATH}`);
}

export function getStats() {
  loadIndex();
  const byDoc = {};
  for (const c of chunks) {
    byDoc[c.docTitle] = (byDoc[c.docTitle] || 0) + 1;
  }
  return { total: chunks.length, byDocument: byDoc };
}

export function listDocuments() {
  loadIndex();
  const docs = new Map();
  for (const c of chunks) {
    if (!docs.has(c.docId)) {
      docs.set(c.docId, {
        id: c.docId,
        title: c.docTitle,
        type: c.docType,
        category: c.docCategory,
        sourcePath: c.sourcePath,
        chunkCount: 0
      });
    }
    docs.get(c.docId).chunkCount += 1;
  }
  return Array.from(docs.values());
}

export async function search(query, opts = {}) {
  loadIndex();
  if (!chunks.length) return [];

  const topK = opts.topK ?? TOP_K;
  const minScore = opts.minScore ?? MIN_SCORE;

  const q = await embed(query);
  if (!q) return [];

  const scored = chunks.map((c) => ({ chunk: c, score: cosine(q, c.embedding) }));
  scored.sort((a, b) => b.score - a.score);

  return scored
    .filter((s) => s.score >= minScore)
    .slice(0, topK)
    .map((s) => ({
      score: s.score,
      text: s.chunk.text,
      docId: s.chunk.docId,
      docTitle: s.chunk.docTitle,
      docCategory: s.chunk.docCategory,
      section: s.chunk.section
    }));
}

export function buildContext(results) {
  if (!results.length) return '';
  return results
    .map((r, i) => {
      const head = `[Фрагмент ${i + 1}] Источник: ${r.docTitle}${r.section ? `, ${r.section}` : ''} (релевантность ${r.score.toFixed(2)})`;
      return `${head}\n${r.text}`;
    })
    .join('\n\n---\n\n');
}

export function chunkText(text, { chunkSize = 900, overlap = 150 } = {}) {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];

  const paragraphs = clean.split(/\n\n+/);
  const chunks = [];
  let current = '';
  let currentSection = '';

  const sectionRe = /^(\d+(?:\.\d+)*\.?)\s+([^\n]{3,120})$/;

  for (const p of paragraphs) {
    const m = p.split('\n')[0].match(sectionRe);
    if (m) currentSection = `п. ${m[1]} ${m[2]}`.trim();

    if ((current + '\n\n' + p).length > chunkSize && current.length > 0) {
      chunks.push({ text: current.trim(), section: currentSection });
      const tail = current.slice(-overlap);
      current = tail + '\n\n' + p;
    } else {
      current = current ? current + '\n\n' + p : p;
    }
  }
  if (current.trim()) chunks.push({ text: current.trim(), section: currentSection });

  return chunks;
}

export async function indexDocument({ id, title, type, category, sourcePath, text }) {
  loadIndex();
  // Удалить предыдущие чанки этого документа
  chunks = chunks.filter((c) => c.docId !== id);

  const chunkSize = parseInt(process.env.RAG_CHUNK_SIZE) || 900;
  const overlap = parseInt(process.env.RAG_CHUNK_OVERLAP) || 150;
  const pieces = chunkText(text, { chunkSize, overlap });

  console.log(`  ✂️  ${title}: ${pieces.length} чанков, эмбеддинг…`);

  let added = 0;
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    if (!piece.text || piece.text.length < 30) continue;
    const vector = await embed(piece.text);
    if (!vector) continue;
    chunks.push({
      id: `${id}#${i}`,
      docId: id,
      docTitle: title,
      docType: type,
      docCategory: category,
      sourcePath,
      section: piece.section || '',
      text: piece.text,
      embedding: vector
    });
    added += 1;
  }
  saveIndex();
  return added;
}

export function removeDocument(docId) {
  loadIndex();
  const before = chunks.length;
  chunks = chunks.filter((c) => c.docId !== docId);
  saveIndex();
  return before - chunks.length;
}

export function hashId(input) {
  return crypto.createHash('sha1').update(input).digest('hex').slice(0, 12);
}

export default { loadIndex, saveIndex, search, buildContext, indexDocument, removeDocument, listDocuments, getStats, hashId };
