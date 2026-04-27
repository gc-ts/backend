import express from 'express';
import { generateResponse } from '../services/ollama.js';
import { searchKnowledge } from '../services/knowledge.js';

const router = express.Router();

/**
 * POST /api/chat/message
 * Отправка сообщения в чат
 *
 * Body:
 * {
 *   "message": "Как оформить отпуск?",
 *   "employeeId": "12345" (optional)
 * }
 *
 * Response:
 * {
 *   "response": "Ответ от AI",
 *   "source": "Источник информации",
 *   "timestamp": "2026-04-27T10:03:18.200Z"
 * }
 */
router.post('/message', async (req, res) => {
  try {
    const { message, employeeId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Поиск контекста в базе знаний
    const knowledge = searchKnowledge(message);

    let response;
    let source = null;

    if (knowledge) {
      // Генерация ответа с контекстом
      response = await generateResponse(message, knowledge.content);
      source = knowledge.source;
    } else {
      // Ответ без контекста
      response = await generateResponse(
        message,
        'Информация по данному вопросу отсутствует в базе знаний.'
      );
      response += '\n\nК сожалению, я не нашел информацию по вашему вопросу. Пожалуйста, обратитесь в отдел кадров: hr@company.ru или по телефону +7 (495) 123-45-67';
    }

    res.json({
      response,
      source,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: 'Failed to process message',
      message: error.message
    });
  }
});

/**
 * GET /api/chat/history/:employeeId
 * Получение истории чата сотрудника (заглушка)
 *
 * Response:
 * {
 *   "history": [
 *     {
 *       "id": "1",
 *       "message": "Вопрос",
 *       "response": "Ответ",
 *       "timestamp": "2026-04-27T10:03:18.200Z"
 *     }
 *   ]
 * }
 */
router.get('/history/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;

    // Заглушка - в продакшене здесь будет запрос к БД
    res.json({
      history: [
        {
          id: '1',
          message: 'Когда аванс?',
          response: 'Аванс выплачивается 20 числа каждого месяца.',
          timestamp: '2026-04-26T14:30:00.000Z'
        }
      ]
    });

  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({
      error: 'Failed to get chat history',
      message: error.message
    });
  }
});

export default router;
