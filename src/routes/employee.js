import express from 'express';
import {
  createEmployee,
  deleteEmployee,
  findEmployee,
  findEmployeeByName,
  listEmployees,
  updateEmployee,
  upsertVacation
} from '../services/employee.js';
import { query } from '../config/database.js';
import { authMiddleware, generateToken, requireAdmin, requireSelf } from '../services/auth.js';

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
    salary: employee.salary == null ? null : Number(employee.salary),
    bonusBalance: employee.bonus_balance ?? null,
    middleName: employee.middle_name || null,
    city: employee.city || null,
    telegram: employee.telegram || null,
    additionalEmail: employee.additional_email || null,
    oneCCode: employee.one_c_code || null,
    medicalExamDate: employee.medical_exam_date || null,
    sanitaryMinimumDate: employee.sanitary_minimum_date || null,
    role: employee.role || 'employee',
    createdAt: employee.created_at || null,
    updatedAt: employee.updated_at || null
  };
}

function selfEditablePayload(body) {
  const allowed = [
    'email',
    'fullName',
    'full_name',
    'position',
    'department',
    'birthDate',
    'birth_date',
    'hireDate',
    'hire_date',
    'phone',
    'vacationDays',
    'vacation_days',
    'salary',
    'bonusBalance',
    'bonus_balance',
    'middleName',
    'middle_name',
    'city',
    'telegram',
    'additionalEmail',
    'additional_email',
    'oneCCode',
    'one_c_code',
    'medicalExamDate',
    'medical_exam_date',
    'sanitaryMinimumDate',
    'sanitary_minimum_date'
  ];
  return Object.fromEntries(
    allowed
      .filter((key) => Object.prototype.hasOwnProperty.call(body, key))
      .map((key) => [key, body[key]])
  );
}

/**
 * GET /api/employee/admin/list
 * Admin: список редактируемых mock-карточек сотрудников.
 */
router.get('/admin/list', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const employees = await listEmployees({
      search: req.query.search,
      limit: req.query.limit,
      offset: req.query.offset
    });
    res.json({ employees: employees.map(shape).filter(Boolean) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list employees', message: error.message });
  }
});

/**
 * POST /api/employee/admin
 * Admin: создать mock-карточку сотрудника.
 */
router.post('/admin', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const employee = await createEmployee(req.body);
    res.status(201).json({ employee: shape(employee) });
  } catch (error) {
    const status = /required|duplicate|unique/i.test(error.message) ? 400 : 500;
    res.status(status).json({ error: 'Failed to create employee', message: error.message });
  }
});

/**
 * PUT /api/employee/admin/:id
 * Admin: обновить mock-карточку сотрудника.
 */
router.put('/admin/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const employee = await updateEmployee(req.params.id, req.body);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    res.json({ employee: shape(employee) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update employee', message: error.message });
  }
});

/**
 * GET /api/employee/admin/:id
 * Admin: получить любую mock-карточку сотрудника.
 */
router.get('/admin/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const emp = await findEmployee({ employeeId: req.params.id });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    res.json(shape(emp));
  } catch (error) {
    res.status(500).json({ error: 'Failed to get employee data', message: error.message });
  }
});

/**
 * DELETE /api/employee/admin/:id
 * Admin: удалить mock-карточку сотрудника. Admin-пользователь защищен от удаления.
 */
router.delete('/admin/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const employee = await deleteEmployee(req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found or protected' });
    res.json({ deleted: shape(employee) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete employee', message: error.message });
  }
});

/**
 * POST /api/employee/admin/:id/vacations
 * Admin: добавить плановый отпуск сотруднику.
 */
router.post('/admin/:id/vacations', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const vacation = await upsertVacation(req.params.id, req.body);
    if (!vacation) return res.status(404).json({ error: 'Employee not found' });
    res.status(201).json({ vacation });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create vacation', message: error.message });
  }
});

/**
 * PUT /api/employee/:id
 * Сотрудник редактирует свою mock-карточку. Admin может редактировать любую.
 * Для self-запроса role и employeeId не меняются.
 */
router.put('/:id', authMiddleware, requireSelf('id'), async (req, res) => {
  try {
    const isAdminRequest = req.user.role === 'admin';
    const payload = isAdminRequest ? req.body : selfEditablePayload(req.body);
    const employee = await updateEmployee(req.params.id, payload);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    res.json({ employee: shape(employee) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update employee', message: error.message });
  }
});

/**
 * GET /api/employee/:id
 */
router.get('/:id', authMiddleware, requireSelf('id'), async (req, res) => {
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
router.get('/:id/vacation', authMiddleware, requireSelf('id'), async (req, res) => {
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

    const token = generateToken({
      id: emp.id,
      employeeId: emp.employee_id || emp.id,
      email: emp.email,
      role: emp.role || 'employee'
    });
    res.json({ token, employee: shape(emp) });
  } catch (error) {
    res.status(500).json({ error: 'Authentication failed', message: error.message });
  }
});

/**
 * GET /api/employee/:id/birthday
 */
router.get('/:id/birthday', authMiddleware, requireSelf('id'), async (req, res) => {
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
router.get('/search/by-name', authMiddleware, async (req, res) => {
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
