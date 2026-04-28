import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';

/**
 * Хеширование пароля
 */
export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

/**
 * Проверка пароля
 */
export const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

/**
 * Генерация JWT токена
 */
export const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET || 'your-secret-key-here', {
    expiresIn: '7d'
  });
};

/**
 * Верификация JWT токена
 */
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-here');
  } catch (error) {
    throw new Error('Invalid token');
  }
};

/**
 * Регистрация нового сотрудника
 */
export const registerEmployee = async (employeeData) => {
  const {
    employeeId,
    email,
    password,
    fullName,
    position,
    department,
    birthDate,
    hireDate,
    phone
  } = employeeData;

  // Проверка существования
  const existing = await query(
    'SELECT id FROM employees WHERE employee_id = $1 OR email = $2',
    [employeeId, email]
  );

  if (existing.rows.length > 0) {
    throw new Error('Employee with this ID or email already exists');
  }

  // Хеширование пароля
  const passwordHash = await hashPassword(password);

  // Создание сотрудника
  const result = await query(
    `INSERT INTO employees
    (employee_id, email, password_hash, full_name, position, department, birth_date, hire_date, phone)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, employee_id, email, full_name, position, department, birth_date, hire_date, phone, vacation_days, created_at`,
    [employeeId, email, passwordHash, fullName, position, department, birthDate, hireDate, phone]
  );

  return result.rows[0];
};

/**
 * Аутентификация сотрудника
 */
export const authenticateEmployee = async (login, password) => {
  const result = await query(
    `SELECT * FROM employees WHERE email = $1 OR employee_id = $1`,
    [login]
  );

  if (result.rows.length === 0) {
    throw new Error('Employee not found');
  }

  const employee = result.rows[0];

  // Проверка пароля
  const isValid = await comparePassword(password, employee.password_hash);

  if (!isValid) {
    throw new Error('Invalid password');
  }

  // Генерация токена
  const token = generateToken({
    id: employee.id,
    employeeId: employee.employee_id,
    email: employee.email,
    role: employee.role || 'employee'
  });

  delete employee.password_hash;

  return { token, employee };
};

/**
 * Получение сотрудника по employee_id
 */
export const getEmployeeByEmployeeId = async (employeeId) => {
  const result = await query(
    `SELECT id, employee_id, email, full_name, position, department,
     birth_date, hire_date, phone, vacation_days, created_at, updated_at
     FROM employees WHERE employee_id = $1`,
    [employeeId]
  );

  if (result.rows.length === 0) {
    throw new Error('Employee not found');
  }

  return result.rows[0];
};

/**
 * Middleware для проверки аутентификации
 */
export const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = verifyToken(token);
    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

/**
 * Middleware: запрашиваемый employeeId должен совпадать с employeeId из JWT.
 * Защищает от IDOR на ресурсах, привязанных к сотруднику.
 */
export const isAdmin = (user) => user?.role === 'admin';

export const requireSelf = (paramName = 'id') => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
  if (isAdmin(req.user)) return next(); // админ имеет доступ к любому id
  const requested = req.params?.[paramName];
  if (requested == null) return res.status(400).json({ error: `Missing :${paramName}` });
  if (String(req.user.employeeId) !== String(requested)) {
    return res.status(403).json({ error: 'Forbidden: cannot access another employee' });
  }
  next();
};

/**
 * Middleware: только для пользователей с role = 'admin'.
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Forbidden: admin only' });
  next();
};

export default {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  registerEmployee,
  authenticateEmployee,
  getEmployeeByEmployeeId,
  authMiddleware,
  requireSelf,
  requireAdmin,
  isAdmin
};
