import express from 'express';
import { findEmployee, findEmployeeByName } from '../services/employee.js';
import { query } from '../config/database.js';

const router = express.Router();

function shape(employee) {
  if (!employee) return null;
  return {
    id: employee.employee_id || employee.id,
    fullName: employee.full_name,
    position: employee.position,
    department: employee.department,
    email: employee.email,
    phone: employee.phone,
    hireDate: employee.hire_date,
    birthDate: employee.birth_date,
    vacationDays: employee.vacation_days,
    nextVacation: employee.next_vacation || null,
    salary: employee.salary
  };
}

/**
 * GET /api/employee/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const emp = await findEmployee({ employeeId: req.params.id });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    res.json(shape(emp));
  } catch (error) {
    res.status(500).json({ error: 'Failed to get employee data', message: error.message });
  }
});

/**
 * GET /api/employee/:id/vacation
 */
router.get('/:id/vacation', async (req, res) => {
  try {
    const emp = await findEmployee({ employeeId: req.params.id });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    let schedule = [];
    try {
      const r = await query(
        `SELECT start_date, end_date, days, status FROM vacations
         WHERE employee_id = (SELECT id FROM employees WHERE employee_id = $1)
         ORDER BY start_date ASC`,
        [req.params.id]
      );
      schedule = r.rows.map((v) => ({
        startDate: v.start_date,
        endDate: v.end_date,
        days: v.days,
        status: v.status
      }));
    } catch {}

    if (!schedule.length && emp.next_vacation) {
      schedule = [
        {
          startDate: emp.next_vacation,
          endDate: null,
          days: emp.vacation_days,
          status: 'planned'
        }
      ];
    }

    res.json({
      remainingDays: emp.vacation_days,
      nextVacation: emp.next_vacation || schedule[0]?.startDate || null,
      vacationSchedule: schedule
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get vacation data', message: error.message });
  }
});

/**
 * POST /api/employee/auth
 * Лёгкая идентификация по табельному номеру или email — БЕЗ пароля.
 * Для полноценного логина с паролем — /api/auth/login.
 */
router.post('/auth', async (req, res) => {
  try {
    const { employeeId, email } = req.body;
    if (!employeeId && !email) {
      return res.status(400).json({ error: 'Employee ID or email is required' });
    }
    const emp = await findEmployee({ employeeId, email });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const token = `id-token-${emp.employee_id || emp.id}-${Date.now()}`;
    res.json({ token, employee: shape(emp) });
  } catch (error) {
    res.status(500).json({ error: 'Authentication failed', message: error.message });
  }
});

/**
 * GET /api/employee/:id/birthday
 */
router.get('/:id/birthday', async (req, res) => {
  try {
    const emp = await findEmployee({ employeeId: req.params.id });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const birthDate = emp.birth_date ? new Date(emp.birth_date) : null;
    let age = null;
    if (birthDate && !Number.isNaN(birthDate.getTime())) {
      const today = new Date();
      age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age -= 1;
    }
    res.json({ birthDate: emp.birth_date, age });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get birthday data', message: error.message });
  }
});

/**
 * GET /api/employee/search?name=...
 * Полнотекстовый поиск по ФИО — отвечает на «когда день рождения <имя коллеги>».
 */
router.get('/search/by-name', async (req, res) => {
  try {
    const name = req.query.name;
    if (!name) return res.status(400).json({ error: 'name query is required' });
    const list = await findEmployeeByName(name);
    res.json({ results: list.map(shape).filter(Boolean) });
  } catch (error) {
    res.status(500).json({ error: 'Search failed', message: error.message });
  }
});

export default router;
