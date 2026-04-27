import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'hr_agent',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err.message);
});

export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const dur = Date.now() - start;
    if (dur > 250) console.log(`🐢 slow query (${dur}ms):`, text.split('\n')[0].slice(0, 80));
    return res;
  } catch (error) {
    console.error('DB query error:', error.message);
    throw error;
  }
};

export const initDatabase = async () => {
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

  await query(`
    CREATE TABLE IF NOT EXISTS vacations (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      days INTEGER NOT NULL,
      status VARCHAR(32) DEFAULT 'planned',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_vacations_employee_id ON vacations(employee_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      type VARCHAR(64),
      category VARCHAR(128),
      file_url VARCHAR(512),
      content TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
      role VARCHAR(16) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_employee_id ON chat_messages(employee_id)`);

  console.log('✅ Database schema initialized');
};

export const seedDatabase = async () => {
  // Идемпотентный seed: только если таблица пуста
  const r = await query(`SELECT COUNT(*)::int AS n FROM employees`);
  if (r.rows[0].n > 0) return;

  // bcrypt-хеш для пароля 'password123' (генерация на месте, чтобы хеш был валидным)
  const bcrypt = (await import('bcryptjs')).default;
  const pwd = await bcrypt.hash('password123', 10);

  const seed = [
    ['12345', 'a.potapov@company.ru', 'Потапов Артем Павлович', 'Senior Developer', 'IT', '1990-05-20', '2020-01-15', '+7 (999) 123-45-67', 14],
    ['67890', 'm.ivanova@company.ru', 'Иванова Мария Сергеевна', 'HR Manager', 'HR', '1988-11-15', '2019-03-10', '+7 (999) 987-65-43', 21],
    ['11111', 'p.petrov@company.ru', 'Петров Петр Петрович', 'Team Lead', 'IT', '1985-03-25', '2018-06-01', '+7 (999) 111-22-33', 28]
  ];
  for (const e of seed) {
    await query(
      `INSERT INTO employees (employee_id, email, password_hash, full_name, position, department, birth_date, hire_date, phone, vacation_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (employee_id) DO NOTHING`,
      [e[0], e[1], pwd, e[2], e[3], e[4], e[5], e[6], e[7], e[8]]
    );
  }

  await query(
    `INSERT INTO vacations (employee_id, start_date, end_date, days, status)
     SELECT id, '2026-07-01', '2026-07-14', 14, 'planned' FROM employees WHERE employee_id = '12345'
     ON CONFLICT DO NOTHING`
  );
  await query(
    `INSERT INTO vacations (employee_id, start_date, end_date, days, status)
     SELECT id, '2026-08-15', '2026-08-28', 14, 'planned' FROM employees WHERE employee_id = '67890'
     ON CONFLICT DO NOTHING`
  );

  console.log('🌱 Database seeded with sample employees / vacations (password: password123)');
};

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

export default { query, initDatabase, seedDatabase, checkConnection };
