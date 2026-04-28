import express from 'express';
import { generateResponse, streamResponse } from '../services/ollama.js';
import { searchKnowledge } from '../services/knowledge.js';
import { findEmployee } from '../services/employee.js';
import { query } from '../config/database.js';
import { authMiddleware } from '../services/auth.js';

const router = express.Router();
router.use(authMiddleware);

const HR_FALLBACK_HINT =
  '\n\nЕсли вам нужна точная информация — напишите в отдел кадров: hr@company.ru, +7 (495) 123-45-67.';

async function getEmployeeContext(employeeId) {
  if (!employeeId) return null;
  try {
    return await findEmployee({ employeeId });
  } catch {
    return null;
  }
}

async function getRecentHistory(employeeId, limit = 6) {
  if (!employeeId) return [];
  try {
    const res = await query(
      `SELECT role, content FROM chat_messages
       WHERE employee_id = (SELECT id FROM employees WHERE employee_id = $1)
       ORDER BY created_at DESC LIMIT $2`,
      [employeeId, limit]
    );
    return res.rows.reverse().map((r) => ({ role: r.role, content: r.content }));
  } catch {
    return [];
  }
}

async function persistMessage(employeeId, role, content) {
  if (!employeeId) return;
  try {
    await query(
      `INSERT INTO chat_messages (employee_id, role, content)
       SELECT id, $2, $3 FROM employees WHERE employee_id = $1`,
      [employeeId, role, content]
    );
  } catch {
    // БД может быть недоступна
  }
}

/**
 * POST /api/chat/message
 * Body: { message, employeeId? }
 * Response: { response, source, hits, timestamp }
 */
router.post('/message', async (req, res) => {
  try {
    const { message } = req.body;
    // Админ может явно указать employeeId в body, обычный юзер — только себя
    const employeeId =
      req.user.role === 'admin' && req.body.employeeId
        ? req.body.employeeId
        : req.user.employeeId;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const [employee, history, knowledge] = await Promise.all([
      getEmployeeContext(employeeId),
      getRecentHistory(employeeId),
      searchKnowledge(message)
    ]);

    const context = knowledge?.content || '';
    const source = knowledge?.source || null;
    const hits = knowledge?.hits || [];

    let answer = await generateResponse(message, context, employee, history);
    if (!knowledge) answer += HR_FALLBACK_HINT;

    // Async persist (fire-and-forget)
    persistMessage(employeeId, 'user', message);
    persistMessage(employeeId, 'assistant', answer);

    res.json({
      response: answer,
      source,
      hits: hits.map((h) => ({ score: h.score, doc: h.docTitle, section: h.section })),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process message', message: error.message });
  }
});

/**
 * POST /api/chat/stream
 * Server-Sent Events. Body: { message, employeeId? }
 * Stream: { type: 'context', source, hits } | { type: 'token', delta } | { type: 'done' }
 */
router.post('/stream', async (req, res) => {
  const { message } = req.body;
  const employeeId =
    req.user.role === 'admin' && req.body.employeeId
      ? req.body.employeeId
      : req.user.employeeId;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const [employee, history, knowledge] = await Promise.all([
      getEmployeeContext(employeeId),
      getRecentHistory(employeeId),
      searchKnowledge(message)
    ]);

    send({
      type: 'context',
      source: knowledge?.source || null,
      hits: (knowledge?.hits || []).map((h) => ({
        score: h.score,
        doc: h.docTitle,
        section: h.section
      }))
    });

    let full = '';
    for await (const delta of streamResponse(
      message,
      knowledge?.content || '',
      employee,
      history
    )) {
      full += delta;
      send({ type: 'token', delta });
    }

    if (!knowledge) {
      full += HR_FALLBACK_HINT;
      send({ type: 'token', delta: HR_FALLBACK_HINT });
    }

    persistMessage(employeeId, 'user', message);
    persistMessage(employeeId, 'assistant', full);

    send({ type: 'done' });
    res.end();
  } catch (error) {
    console.error('Stream error:', error);
    send({ type: 'error', error: error.message });
    res.end();
  }
});

/**
 * GET /api/chat/history/:employeeId
 */
router.get('/history/:employeeId', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && String(req.user.employeeId) !== String(req.params.employeeId)) {
      return res.status(403).json({ error: 'Forbidden: cannot access another employee history' });
    }
    const { employeeId } = req.params;
    try {
      const result = await query(
        `SELECT id, role, content, created_at FROM chat_messages
         WHERE employee_id = (SELECT id FROM employees WHERE employee_id = $1)
         ORDER BY created_at ASC LIMIT 100`,
        [employeeId]
      );
      return res.json({
        history: result.rows.map((r) => ({
          id: String(r.id),
          role: r.role,
          content: r.content,
          timestamp: r.created_at
        }))
      });
    } catch {
      return res.json({ history: [] });
    }
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Failed to get chat history', message: error.message });
  }
});

export default router;
