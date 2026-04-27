import express from 'express';
import { getAllKnowledge, searchKnowledge } from '../services/knowledge.js';

const router = express.Router();

/**
 * GET /api/knowledge
 * Получение всей базы знаний
 *
 * Response:
 * {
 *   "knowledge": {
 *     "vacation": {...},
 *     "salary": {...},
 *     ...
 *   }
 * }
 */
router.get('/', async (req, res) => {
  try {
    const knowledge = getAllKnowledge();
    res.json({ knowledge });

  } catch (error) {
    console.error('Knowledge error:', error);
    res.status(500).json({
      error: 'Failed to get knowledge base',
      message: error.message
    });
  }
});

/**
 * POST /api/knowledge/search
 * Поиск в базе знаний
 *
 * Body:
 * {
 *   "query": "отпуск"
 * }
 *
 * Response:
 * {
 *   "result": {
 *     "title": "Отпуска",
 *     "content": "...",
 *     "source": "..."
 *   }
 * }
 */
router.post('/search', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const result = searchKnowledge(query);

    if (!result) {
      return res.status(404).json({
        error: 'No relevant information found',
        message: 'Информация по данному запросу не найдена'
      });
    }

    res.json({ result });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Failed to search knowledge base',
      message: error.message
    });
  }
});

export default router;
