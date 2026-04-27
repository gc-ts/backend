import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Создание пула подключений к PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'hr_agent',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Обработка ошибок подключения
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

/**
 * Выполнение SQL запроса
 */
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

/**
 * Инициализация схемы базы данных
 */
export const initDatabase = async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        position VARCHAR(255),
        department VARCHAR(255),
        birth_date DATE,
        hire_date DATE,
        phone VARCHAR(50),
        vacation_days INTEGER DEFAULT 28,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_employees_employee_id ON employees(employee_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email)`);

    console.log('✅ Database schema initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    throw error;
  }
};

/**
 * Проверка подключения к базе данных
 */
export const checkConnection = async () => {
  try {
    const result = await query('SELECT NOW()');
    console.log('✅ Database connected:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
};

export default { query, initDatabase, checkConnection };
