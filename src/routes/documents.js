import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { extractText, inferTitle } from '../services/docLoader.js';
import * as store from '../services/vectorStore.js';
import { query } from '../config/database.js';
import { authMiddleware, requireAdmin } from '../services/auth.js';

const router = express.Router();
router.use(authMiddleware);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const stamp = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, stamp + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.pdf', '.docx', '.doc', '.txt', '.md'];
    cb(
      ok.includes(path.extname(file.originalname).toLowerCase())
        ? null
        : new Error('Invalid file type. Only PDF, DOCX, DOC, TXT, MD are allowed.'),
      true
    );
  }
});

const FALLBACK_DOCS = [
  { id: '1', title: 'Правила внутреннего трудового распорядка', type: 'ЛНА', category: 'Общие положения', uploadDate: '2026-01-15', fileUrl: '/documents/pvtr.pdf' },
  { id: '2', title: 'Положение об оплате труда', type: 'ЛНА', category: 'Заработная плата', uploadDate: '2026-01-20', fileUrl: '/documents/salary.pdf' },
  { id: '3', title: 'Положение о социальных льготах', type: 'ЛНА', category: 'Льготы и компенсации', uploadDate: '2026-02-01', fileUrl: '/documents/benefits.pdf' },
  { id: '4', title: 'Инструкция по оформлению отпуска', type: 'Инструкция', category: 'Отпуска', uploadDate: '2026-02-10', fileUrl: '/documents/vacation-guide.pdf' }
];

async function loadDocuments() {
  // 1. Реальные документы из RAG-индекса (из ./data/docs)
  const indexed = store.listDocuments().map((d) => ({
    id: d.id,
    title: d.title,
    type: d.type,
    category: d.category,
    uploadDate: null,
    fileUrl: d.sourcePath,
    chunkCount: d.chunkCount,
    indexed: true
  }));

  // 2. Документы из БД (если есть)
  let dbDocs = [];
  try {
    const r = await query(
      `SELECT id, title, type, category, file_url, created_at FROM documents ORDER BY id ASC`
    );
    dbDocs = r.rows.map((d) => ({
      id: 'db-' + d.id,
      title: d.title,
      type: d.type,
      category: d.category,
      uploadDate: d.created_at,
      fileUrl: d.file_url,
      indexed: false
    }));
  } catch {}

  if (indexed.length || dbDocs.length) return [...indexed, ...dbDocs];
  return FALLBACK_DOCS;
}

router.get('/', async (req, res) => {
  try {
    const { category, type } = req.query;
    let docs = await loadDocuments();
    if (category) docs = docs.filter((d) => d.category === category);
    if (type) docs = docs.filter((d) => d.type === type);
    res.json({ documents: docs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get documents', message: error.message });
  }
});

router.get('/meta/categories', async (_req, res) => {
  try {
    const docs = await loadDocuments();
    const categories = [...new Set(docs.map((d) => d.category).filter(Boolean))];
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get categories', message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const docs = await loadDocuments();
    const document = docs.find((d) => d.id === req.params.id);
    if (!document) return res.status(404).json({ error: 'Document not found' });
    res.json(document);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get document', message: error.message });
  }
});

/**
 * POST /api/documents/upload
 * multipart/form-data: file, title, category, type
 * Загружает файл, парсит, индексирует в RAG, сохраняет метаданные в БД.
 */
router.post('/upload', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const title = req.body.title || inferTitle(req.file.originalname);
    const category = req.body.category || 'Прочее';
    const type = req.body.type || 'Документ';

    let chunkCount = 0;
    let id = store.hashId(`${req.file.originalname}:${req.file.size}:${Date.now()}`);

    try {
      const text = await extractText(req.file.path);
      if (text && text.trim().length >= 50) {
        chunkCount = await store.indexDocument({
          id,
          title,
          type,
          category,
          sourcePath: req.file.path,
          text
        });
      }
    } catch (e) {
      console.warn('Document text extraction failed:', e.message);
    }

    // Сохранить метаданные в БД (best-effort)
    try {
      await query(
        `INSERT INTO documents (title, type, category, file_url) VALUES ($1, $2, $3, $4)`,
        [title, type, category, `/uploads/${req.file.filename}`]
      );
    } catch {}

    res.status(201).json({
      id,
      title,
      type,
      category,
      uploadDate: new Date().toISOString().split('T')[0],
      fileUrl: `/uploads/${req.file.filename}`,
      chunkCount,
      message: chunkCount
        ? `Document uploaded and indexed (${chunkCount} chunks)`
        : 'Document uploaded (no chunks indexed)'
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload document', message: error.message });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const removed = store.removeDocument(req.params.id);
    if (req.params.id.startsWith('db-')) {
      try {
        await query(`DELETE FROM documents WHERE id = $1`, [req.params.id.slice(3)]);
      } catch {}
    }
    res.json({ message: 'Document deleted successfully', removedChunks: removed });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete document', message: error.message });
  }
});

export default router;
