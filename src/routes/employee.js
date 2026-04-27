import express from 'express';

const router = express.Router();

// Заглушка для данных сотрудников
const employees = {
  '12345': {
    id: '12345',
    fullName: 'Потапов Артем Павлович',
    position: 'Senior Developer',
    department: 'IT',
    email: 'a.potapov@company.ru',
    phone: '+7 (999) 123-45-67',
    hireDate: '2020-01-15',
    birthDate: '1990-05-20',
    vacationDays: 14,
    nextVacation: '2026-07-01',
    salary: 150000
  },
  '67890': {
    id: '67890',
    fullName: 'Иванова Мария Сергеевна',
    position: 'HR Manager',
    department: 'HR',
    email: 'm.ivanova@company.ru',
    phone: '+7 (999) 987-65-43',
    hireDate: '2019-03-10',
    birthDate: '1988-11-15',
    vacationDays: 21,
    nextVacation: '2026-08-15',
    salary: 120000
  }
};

/**
 * GET /api/employee/:id
 * Получение информации о сотруднике
 *
 * Response:
 * {
 *   "id": "12345",
 *   "fullName": "Потапов Артем Павлович",
 *   "position": "Senior Developer",
 *   ...
 * }
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const employee = employees[id];

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(employee);

  } catch (error) {
    console.error('Employee error:', error);
    res.status(500).json({
      error: 'Failed to get employee data',
      message: error.message
    });
  }
});

/**
 * GET /api/employee/:id/vacation
 * Получение информации об отпуске сотрудника
 *
 * Response:
 * {
 *   "remainingDays": 14,
 *   "nextVacation": "2026-07-01",
 *   "vacationSchedule": [...]
 * }
 */
router.get('/:id/vacation', async (req, res) => {
  try {
    const { id } = req.params;
    const employee = employees[id];

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json({
      remainingDays: employee.vacationDays,
      nextVacation: employee.nextVacation,
      vacationSchedule: [
        {
          startDate: '2026-07-01',
          endDate: '2026-07-14',
          days: 14,
          status: 'planned'
        }
      ]
    });

  } catch (error) {
    console.error('Vacation error:', error);
    res.status(500).json({
      error: 'Failed to get vacation data',
      message: error.message
    });
  }
});

/**
 * POST /api/employee/auth
 * Аутентификация сотрудника (заглушка)
 *
 * Body:
 * {
 *   "employeeId": "12345",
 *   "email": "a.potapov@company.ru"
 * }
 *
 * Response:
 * {
 *   "token": "jwt-token",
 *   "employee": {...}
 * }
 */
router.post('/auth', async (req, res) => {
  try {
    const { employeeId, email } = req.body;

    if (!employeeId && !email) {
      return res.status(400).json({ error: 'Employee ID or email is required' });
    }

    // Поиск сотрудника
    let employee = null;
    if (employeeId) {
      employee = employees[employeeId];
    } else {
      employee = Object.values(employees).find(e => e.email === email);
    }

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Заглушка для JWT токена
    const token = `jwt-token-${employee.id}-${Date.now()}`;

    res.json({
      token,
      employee
    });

  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({
      error: 'Authentication failed',
      message: error.message
    });
  }
});

/**
 * GET /api/employee/:id/birthday
 * Получение даты рождения сотрудника
 *
 * Response:
 * {
 *   "birthDate": "1990-05-20",
 *   "age": 35
 * }
 */
router.get('/:id/birthday', async (req, res) => {
  try {
    const { id } = req.params;
    const employee = employees[id];

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const birthDate = new Date(employee.birthDate);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();

    res.json({
      birthDate: employee.birthDate,
      age
    });

  } catch (error) {
    console.error('Birthday error:', error);
    res.status(500).json({
      error: 'Failed to get birthday data',
      message: error.message
    });
  }
});

export default router;
