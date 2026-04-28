import express from 'express';
import {
  getAllKnowledge,
  searchKnowledge,
  ingestStartupDocuments
} from '../services/knowledge.js';
import {
  getCorporatePortalSyncState,
  syncCorporatePortalData
} from '../services/corporatePortal.js';
import * as store from '../services/vectorStore.js';
import { authMiddleware, requireAdmin } from '../services/auth.js';

const router = express.Router();
router.use(authMiddleware);

/**
 * GET /api/knowledge
 * Возвращает статичный «быстрый» справочник + статистику RAG-индекса.
 */
router.get('/', async (_req, res) => {
  try {
    const knowledge = getAllKnowledge();
    const stats = store.getStats();
    const documents = store.listDocuments();
    res.json({ knowledge, rag: { ...stats, documents } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get knowledge base', message: error.message });
  }
});

/**
 * POST /api/knowledge/search
 * Body: { query, topK?, minScore? }
 */
router.post('/search', async (req, res) => {
  try {
    const { query, topK, minScore } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    const result = await searchKnowledge(query);
    if (!result) {
      return res.status(404).json({
        error: 'No relevant information found',
        message: 'Информация по данному запросу не найдена'
      });
    }

    // Дополнительно — сырые векторные хиты, если запрошены параметры
    let raw = result.hits;
    if (topK || minScore) {
      raw = await store.search(query, { topK, minScore });
    }
    res.json({ result, hits: raw });
  } catch (error) {
    res.status(500).json({ error: 'Failed to search knowledge base', message: error.message });
  }
});

/**
 * POST /api/knowledge/reindex
 * Принудительная переиндексация папки RAG_DOCS_DIR.
 */
router.post('/reindex', requireAdmin, async (_req, res) => {
  try {
    const result = await ingestStartupDocuments();
    res.json({ message: 'Reindex done', ...result, total: store.getStats().total });
  } catch (error) {
    res.status(500).json({ error: 'Reindex failed', message: error.message });
  }
});

/**
 * POST /api/knowledge/sync-corporate
 * Принудительная синхронизация сотрудников и новостей с корпоративного портала.
 */
router.post('/sync-corporate', requireAdmin, async (_req, res) => {
  try {
    const result = await syncCorporatePortalData();
    res.json({ message: 'Corporate portal sync done', ...result, total: store.getStats().total });
  } catch (error) {
    res.status(500).json({ error: 'Corporate portal sync failed', message: error.message });
  }
});

/**
 * GET /api/knowledge/corporate-sync
 * Состояние расписания синхронизации корпоративного портала.
 */
router.get('/corporate-sync', requireAdmin, (_req, res) => {
  res.json(getCorporatePortalSyncState());
});

/**
 * GET /api/knowledge/index
 * Состояние векторного индекса.
 */
router.get('/index', (_req, res) => {
  res.json({ stats: store.getStats(), documents: store.listDocuments() });
});

export default router;
