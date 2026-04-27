import express from 'express';
import { registerEmployee, authenticateEmployee, verifyToken } from '../services/auth.js';

const router = express.Router();

/**
 * POST /api/auth/register
 * Регистрация нового сотрудника
 */
router.post('/register', async (req, res) => {
  try {
    const employee = await registerEmployee(req.body);

    res.status(201).json({
      message: 'Employee registered successfully',
      employee
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({
      error: 'Registration failed',
      message: error.message
    });
  }
});

/**
 * POST /api/auth/login
 * Аутентификация сотрудника
 */
router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({ error: 'Login and password are required' });
    }

    const result = await authenticateEmployee(login, password);

    res.json(result);

  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({
      error: 'Authentication failed',
      message: error.message
    });
  }
});

/**
 * POST /api/auth/verify
 * Проверка валидности токена
 */
router.post('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = verifyToken(token);

    res.json({
      valid: true,
      user: decoded
    });

  } catch (error) {
    res.status(401).json({
      valid: false,
      error: 'Invalid token'
    });
  }
});

export default router;
