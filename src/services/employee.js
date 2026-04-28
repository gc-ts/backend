import { query } from '../config/database.js';
import { hashPassword } from './auth.js';

const FALLBACK = {
  '12345': {
    id: '12345',
    employee_id: '12345',
    full_name: 'Потапов Артем Павлович',
    position: 'Senior Developer',
    department: 'IT',
    email: 'a.potapov@company.ru',
    phone: '+7 (999) 123-45-67',
    hire_date: '2020-01-15',
    birth_date: '1990-05-20',
    vacation_days: 14,
    next_vacation: '2026-07-01',
    salary: 150000,
    bonus_balance: 12
  },
  '67890': {
    id: '67890',
    employee_id: '67890',
    full_name: 'Иванова Мария Сергеевна',
    position: 'HR Manager',
    department: 'HR',
    email: 'm.ivanova@company.ru',
    phone: '+7 (999) 987-65-43',
    hire_date: '2019-03-10',
    birth_date: '1988-11-15',
    vacation_days: 21,
    next_vacation: '2026-08-15',
    salary: 120000,
    bonus_balance: 25
  },
  '11111': {
    id: '11111',
    employee_id: '11111',
    full_name: 'Петров Петр Петрович',
    position: 'Team Lead',
    department: 'IT',
    email: 'p.petrov@company.ru',
    phone: '+7 (999) 111-22-33',
    hire_date: '2018-06-01',
    birth_date: '1985-03-25',
    vacation_days: 28,
    next_vacation: '2026-09-01',
    salary: 200000,
    bonus_balance: 40
  }
};

const EMPLOYEE_COLUMNS = `
  id, employee_id, email, full_name, position, department,
  birth_date, hire_date, phone, vacation_days, salary, bonus_balance,
  middle_name, city, telegram, additional_email, one_c_code,
  medical_exam_date, sanitary_minimum_date, role, created_at, updated_at
`;

export async function findEmployee({ employeeId, email }) {
  // 1. Попытка через БД
  try {
    let res;
    if (employeeId) {
      res = await query(
        `SELECT ${EMPLOYEE_COLUMNS}
         FROM employees WHERE employee_id = $1`,
        [employeeId]
      );
    } else if (email) {
      res = await query(
        `SELECT ${EMPLOYEE_COLUMNS}
         FROM employees WHERE lower(email) = lower($1) OR lower(additional_email) = lower($1)`,
        [email]
      );
    }
    if (res && res.rows && res.rows.length > 0) {
      const emp = res.rows[0];
      // Подгружаем ближайший отпуск
      try {
        const vac = await query(
          `SELECT start_date, end_date, days, status FROM vacations
           WHERE employee_id = $1 AND start_date >= CURRENT_DATE
           ORDER BY start_date ASC LIMIT 1`,
          [emp.id]
        );
        if (vac.rows.length) {
          emp.next_vacation = vac.rows[0].start_date;
        }
      } catch {}
      return emp;
    }
  } catch (e) {
    // БД недоступна — используем fallback
  }

  // 2. Fallback in-memory
  if (employeeId && FALLBACK[employeeId]) return FALLBACK[employeeId];
  if (email) {
    return Object.values(FALLBACK).find((e) => e.email === email) || null;
  }
  return null;
}

export async function findEmployeeByName(name) {
  const term = `%${String(name || '').trim()}%`;
  try {
    const res = await query(
      `SELECT ${EMPLOYEE_COLUMNS}
       FROM employees WHERE full_name ILIKE $1 LIMIT 10`,
      [term]
    );
    if (res.rows.length) return res.rows;
  } catch {}
  // fallback
  const lower = String(name || '').toLowerCase();
  return Object.values(FALLBACK).filter((e) => e.full_name.toLowerCase().includes(lower));
}

export function getFallbackEmployees() {
  return FALLBACK;
}

function normalizeDate(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function normalizeNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function listEmployees({ search, limit = 100, offset = 0 } = {}) {
  const params = [];
  let where = '';
  if (search) {
    params.push(`%${String(search).trim()}%`);
    where = `WHERE employee_id ILIKE $1 OR email ILIKE $1 OR full_name ILIKE $1 OR department ILIKE $1 OR position ILIKE $1`;
  }
  params.push(Math.min(Number(limit) || 100, 500), Number(offset) || 0);

  const res = await query(
    `SELECT ${EMPLOYEE_COLUMNS}
     FROM employees
     ${where}
     ORDER BY full_name ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return res.rows;
}

export async function createEmployee(data) {
  const employeeId = String(data.employeeId || data.employee_id || '').trim();
  const email = String(data.email || '').trim();
  const fullName = String(data.fullName || data.full_name || '').trim();
  if (!employeeId || !email || !fullName) {
    throw new Error('employeeId, email and fullName are required');
  }

  const passwordHash = await hashPassword(data.password || 'password123');
  const res = await query(
    `INSERT INTO employees (
       employee_id, email, password_hash, full_name, position, department,
       birth_date, hire_date, phone, vacation_days, salary, bonus_balance,
       middle_name, city, telegram, additional_email, one_c_code,
       medical_exam_date, sanitary_minimum_date, role
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING ${EMPLOYEE_COLUMNS}`,
    [
      employeeId,
      email,
      passwordHash,
      fullName,
      data.position || null,
      data.department || null,
      normalizeDate(data.birthDate || data.birth_date),
      normalizeDate(data.hireDate || data.hire_date),
      data.phone || null,
      normalizeNumber(data.vacationDays ?? data.vacation_days) ?? 28,
      normalizeNumber(data.salary),
      normalizeNumber(data.bonusBalance ?? data.bonus_balance) ?? 0,
      data.middleName || data.middle_name || null,
      data.city || null,
      data.telegram || null,
      data.additionalEmail || data.additional_email || null,
      data.oneCCode || data.one_c_code || null,
      normalizeDate(data.medicalExamDate || data.medical_exam_date),
      normalizeDate(data.sanitaryMinimumDate || data.sanitary_minimum_date),
      data.role || 'employee'
    ]
  );
  return res.rows[0];
}

export async function updateEmployee(employeeId, data) {
  const current = await findEmployee({ employeeId });
  if (!current) return null;

  const fields = [];
  const add = (column, keys, transform = (v) => v) => {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        fields.push([column, transform(data[key])]);
        return;
      }
    }
  };

  add('email', ['email']);
  add('full_name', ['fullName', 'full_name']);
  add('position', ['position']);
  add('department', ['department']);
  add('birth_date', ['birthDate', 'birth_date'], normalizeDate);
  add('hire_date', ['hireDate', 'hire_date'], normalizeDate);
  add('phone', ['phone']);
  add('vacation_days', ['vacationDays', 'vacation_days'], normalizeNumber);
  add('salary', ['salary'], normalizeNumber);
  add('bonus_balance', ['bonusBalance', 'bonus_balance'], normalizeNumber);
  add('middle_name', ['middleName', 'middle_name']);
  add('city', ['city']);
  add('telegram', ['telegram']);
  add('additional_email', ['additionalEmail', 'additional_email']);
  add('one_c_code', ['oneCCode', 'one_c_code']);
  add('medical_exam_date', ['medicalExamDate', 'medical_exam_date'], normalizeDate);
  add('sanitary_minimum_date', ['sanitaryMinimumDate', 'sanitary_minimum_date'], normalizeDate);
  add('role', ['role']);

  if (data.employeeId || data.employee_id) {
    fields.unshift(['employee_id', String(data.employeeId || data.employee_id).trim()]);
  }

  if (!fields.length) return current;

  const sets = fields.map(([field], i) => `${field} = $${i + 1}`);
  const values = fields.map(([, value]) => value);
  values.push(employeeId);

  const res = await query(
    `UPDATE employees
     SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
     WHERE employee_id = $${values.length}
     RETURNING ${EMPLOYEE_COLUMNS}`,
    values
  );
  return res.rows[0] || null;
}

export async function deleteEmployee(employeeId) {
  const res = await query(
    `DELETE FROM employees WHERE employee_id = $1 AND role <> 'admin' RETURNING ${EMPLOYEE_COLUMNS}`,
    [employeeId]
  );
  return res.rows[0] || null;
}

export async function upsertVacation(employeeId, data) {
  const emp = await findEmployee({ employeeId });
  if (!emp) return null;
  const res = await query(
    `INSERT INTO vacations (employee_id, start_date, end_date, days, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, start_date, end_date, days, status, created_at`,
    [
      emp.id,
      normalizeDate(data.startDate || data.start_date),
      normalizeDate(data.endDate || data.end_date),
      normalizeNumber(data.days),
      data.status || 'planned'
    ]
  );
  return res.rows[0];
}
