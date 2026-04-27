# HR AGENT AI - Backend с PostgreSQL и авторизацией

Backend для HR AGENT AI с локальной моделью Ollama, PostgreSQL базой данных и JWT авторизацией.

## Новые возможности

✅ **PostgreSQL база данных** - хранение сотрудников, чатов, сообщений, документов
✅ **JWT авторизация** - безопасная аутентификация с токенами
✅ **Регистрация и логин** - полноценная система управления пользователями
✅ **Хеширование паролей** - bcrypt для безопасного хранения
✅ **Middleware авторизации** - защита приватных эндпоинтов

## Установка PostgreSQL

### macOS
```bash
brew install postgresql@16
brew services start postgresql@16
```

### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### Windows
Скачайте установщик с https://www.postgresql.org/download/windows/

## Настройка базы данных

### 1. Создание базы данных

```bash
# Подключение к PostgreSQL
psql postgres

# Создание базы данных
CREATE DATABASE hr_agent;

# Создание пользователя (опционально)
CREATE USER hr_admin WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE hr_agent TO hr_admin;

# Выход
\q
```

### 2. Настройка .env

Отредактируйте `.env` файл:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hr_agent
DB_USER=postgres
DB_PASSWORD=your_password

# JWT Secret (измените на свой!)
JWT_SECRET=your-super-secret-key-change-this-in-production
```

### 3. Инициализация схемы

При первом запуске сервера схема БД создастся автоматически.

Или вручную:
```bash
psql -U postgres -d hr_agent -f src/config/seed.sql
```

## Запуск

```bash
# Установка зависимостей
npm install

# Запуск в dev режиме
npm run dev
```

## API Endpoints - Авторизация

### Регистрация сотрудника

**POST** `/api/auth/register`

```json
{
  "employeeId": "12345",
  "email": "user@company.ru",
  "password": "password123",
  "fullName": "Иванов Иван Иванович",
  "position": "Developer",
  "department": "IT",
  "birthDate": "1990-01-01",
  "hireDate": "2020-01-01",
  "phone": "+7 (999) 123-45-67"
}
```

**Response:**
```json
{
  "message": "Employee registered successfully",
  "employee": {
    "id": 1,
    "employee_id": "12345",
    "email": "user@company.ru",
    "full_name": "Иванов Иван Иванович",
    ...
  }
}
```

### Логин

**POST** `/api/auth/login`

```json
{
  "login": "12345",
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "employee": {
    "id": 1,
    "employee_id": "12345",
    "email": "user@company.ru",
    ...
  }
}
```

### Проверка токена

**POST** `/api/auth/verify`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "valid": true,
  "user": {
    "id": 1,
    "employeeId": "12345",
    "email": "user@company.ru"
  }
}
```

## Использование авторизации

### Защищенные эндпоинты

Для доступа к защищенным эндпоинтам добавьте заголовок:

```
Authorization: Bearer <your-jwt-token>
```

Пример с curl:
```bash
curl -X GET http://localhost:3001/api/employee/12345 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

Пример с JavaScript:
```javascript
const response = await fetch('http://localhost:3001/api/employee/12345', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

## Структура базы данных

### Таблицы

- **employees** - сотрудники (с хешированными паролями)
- **chats** - чаты сотрудников
- **messages** - сообщения в чатах
- **documents** - документы базы знаний
- **vacations** - отпуска сотрудников

### Схема employees

```sql
CREATE TABLE employees (
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
);
```

## Тестовые данные

После инициализации БД доступны тестовые аккаунты:

| Employee ID | Email | Password | Position |
|------------|-------|----------|----------|
| 12345 | a.potapov@company.ru | password123 | Senior Developer |
| 67890 | m.ivanova@company.ru | password123 | HR Manager |
| 11111 | p.petrov@company.ru | password123 | Team Lead |

## Безопасность

### Хеширование паролей

Используется bcrypt с salt rounds = 10:

```javascript
import bcrypt from 'bcryptjs';

const hash = await bcrypt.hash(password, 10);
const isValid = await bcrypt.compare(password, hash);
```

### JWT токены

Токены действительны 7 дней:

```javascript
import jwt from 'jsonwebtoken';

const token = jwt.sign(payload, process.env.JWT_SECRET, {
  expiresIn: '7d'
});
```

### Middleware защиты

```javascript
import { authMiddleware } from './services/auth.js';

router.get('/protected', authMiddleware, (req, res) => {
  // req.user содержит данные из токена
  res.json({ user: req.user });
});
```

## Миграция с заглушек на БД

Старые эндпоинты продолжают работать с заглушками для обратной совместимости.

Для использования БД обновите роуты:

```javascript
// Было (заглушка)
const employee = employees['12345'];

// Стало (БД)
import { getEmployeeByEmployeeId } from '../services/auth.js';
const employee = await getEmployeeByEmployeeId('12345');
```

## Troubleshooting

### Ошибка подключения к БД

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Решение:**
1. Проверьте что PostgreSQL запущен: `pg_isready`
2. Проверьте настройки в `.env`
3. Проверьте что база данных создана: `psql -l`

### Ошибка "relation does not exist"

**Решение:**
Схема не инициализирована. Перезапустите сервер или выполните:
```bash
psql -U postgres -d hr_agent -f src/config/seed.sql
```

### JWT токен невалиден

**Решение:**
1. Проверьте что `JWT_SECRET` одинаковый при создании и проверке токена
2. Проверьте что токен не истек (7 дней)
3. Проверьте формат заголовка: `Authorization: Bearer <token>`

## Production рекомендации

1. **Измените JWT_SECRET** на случайную строку
2. **Используйте HTTPS** для всех запросов
3. **Настройте rate limiting** для защиты от брутфорса
4. **Включите логирование** всех попыток авторизации
5. **Настройте backup** базы данных
6. **Используйте connection pooling** (уже настроен в database.js)
7. **Добавьте refresh tokens** для длительных сессий

## Лицензия

MIT
