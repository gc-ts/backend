import { query } from '../config/database.js';

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
    salary: 150000
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
    salary: 120000
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
    salary: 200000
  }
};

export async function findEmployee({ employeeId, email }) {
  // 1. Попытка через БД
  try {
    let res;
    if (employeeId) {
      res = await query(
        `SELECT id, employee_id, email, full_name, position, department,
         birth_date, hire_date, phone, vacation_days
         FROM employees WHERE employee_id = $1`,
        [employeeId]
      );
    } else if (email) {
      res = await query(
        `SELECT id, employee_id, email, full_name, position, department,
         birth_date, hire_date, phone, vacation_days
         FROM employees WHERE email = $1`,
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
      `SELECT employee_id, full_name, position, department, email, phone, birth_date
       FROM employees WHERE full_name ILIKE $1 LIMIT 5`,
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
