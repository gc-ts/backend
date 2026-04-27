-- Скрипт для создания тестовых данных

-- Создание тестовых сотрудников
-- Пароль для всех: password123

INSERT INTO employees (employee_id, email, password_hash, full_name, position, department, birth_date, hire_date, phone, vacation_days)
VALUES
  ('12345', 'a.potapov@company.ru', '$2a$10$rZ8qH9X5Y3K4L6M7N8O9P0Q1R2S3T4U5V6W7X8Y9Z0A1B2C3D4E5F', 'Потапов Артем Павлович', 'Senior Developer', 'IT', '1990-05-20', '2020-01-15', '+7 (999) 123-45-67', 14),
  ('67890', 'm.ivanova@company.ru', '$2a$10$rZ8qH9X5Y3K4L6M7N8O9P0Q1R2S3T4U5V6W7X8Y9Z0A1B2C3D4E5F', 'Иванова Мария Сергеевна', 'HR Manager', 'HR', '1988-11-15', '2019-03-10', '+7 (999) 987-65-43', 21),
  ('11111', 'p.petrov@company.ru', '$2a$10$rZ8qH9X5Y3K4L6M7N8O9P0Q1R2S3T4U5V6W7X8Y9Z0A1B2C3D4E5F', 'Петров Петр Петрович', 'Team Lead', 'IT', '1985-03-25', '2018-06-01', '+7 (999) 111-22-33', 28)
ON CONFLICT (employee_id) DO NOTHING;

-- Создание тестовых отпусков
INSERT INTO vacations (employee_id, start_date, end_date, days, status)
SELECT id, '2026-07-01', '2026-07-14', 14, 'planned'
FROM employees WHERE employee_id = '12345'
ON CONFLICT DO NOTHING;

INSERT INTO vacations (employee_id, start_date, end_date, days, status)
SELECT id, '2026-08-15', '2026-08-28', 14, 'planned'
FROM employees WHERE employee_id = '67890'
ON CONFLICT DO NOTHING;

-- Создание тестовых документов
INSERT INTO documents (title, type, category, file_url, content)
VALUES
  ('Правила внутреннего трудового распорядка', 'ЛНА', 'Общие положения', '/documents/pvtr.pdf', 'Правила предоставления отпусков: Ежегодный оплачиваемый отпуск составляет 28 календарных дней...'),
  ('Положение об оплате труда', 'ЛНА', 'Заработная плата', '/documents/salary.pdf', 'Выплата заработной платы: Аванс - 20 числа каждого месяца, основная часть - 5 числа следующего месяца...'),
  ('Положение о социальных льготах', 'ЛНА', 'Льготы и компенсации', '/documents/benefits.pdf', 'Программы ДМС: Базовая программа включает амбулаторное и стационарное лечение...'),
  ('Инструкция по оформлению отпуска', 'Инструкция', 'Отпуска', '/documents/vacation-guide.pdf', 'Для оформления отпуска необходимо подать заявление за 14 дней...')
ON CONFLICT DO NOTHING;
