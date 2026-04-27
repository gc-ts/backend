# HR AGENT AI - Backend

Backend для HR AGENT AI с локальной моделью Ollama для обработки запросов сотрудников.

## Технологии

- **Node.js** + Express
- **Ollama** - локальная LLM модель
- **Multer** - загрузка файлов
- **PDF-parse** - парсинг PDF документов
- **Mammoth** - парсинг DOCX документов

## Установка

### 1. Установка зависимостей

```bash
npm install
```

### 2. Установка Ollama

Скачайте и установите Ollama с официального сайта: https://ollama.ai

```bash
# Для macOS
brew install ollama

# Запуск Ollama
ollama serve

# Загрузка модели llama3.2
ollama pull llama3.2
```

### 3. Настройка окружения

Скопируйте `.env.example` в `.env` и настройте переменные:

```bash
cp .env.example .env
```

Отредактируйте `.env`:
```env
PORT=3000
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.2
CORS_ORIGIN=http://localhost:5173
```

## Запуск

### Development режим

```bash
npm run dev
```

### Production режим

```bash
npm start
```

Сервер запустится на `http://localhost:3000`

## API Endpoints

### Health Check

**GET** `/health`

Проверка работоспособности сервера и Ollama.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-04-27T10:03:18.200Z",
  "ollama": "http://localhost:11434"
}
```

---

## Chat API

### Отправка сообщения

**POST** `/api/chat/message`

Отправка вопроса в чат и получение ответа от AI.

**Request Body:**
```json
{
  "message": "Как оформить отпуск?",
  "employeeId": "12345"
}
```

**Response:**
```json
{
  "response": "Для оформления отпуска необходимо подать заявление за 14 дней...",
  "source": "Правила внутреннего трудового распорядка, п. 4.2",
  "timestamp": "2026-04-27T10:03:18.200Z"
}
```

**Примеры запросов:**

```bash
# Вопрос об отпуске
curl -X POST http://localhost:3000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Сколько у меня дней отпуска?", "employeeId": "12345"}'

# Вопрос о зарплате
curl -X POST http://localhost:3000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Когда аванс?"}'

# Вопрос о ДМС
curl -X POST http://localhost:3000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Какие программы ДМС есть?"}'
```

### Получение истории чата

**GET** `/api/chat/history/:employeeId`

Получение истории сообщений сотрудника.

**Response:**
```json
{
  "history": [
    {
      "id": "1",
      "message": "Когда аванс?",
      "response": "Аванс выплачивается 20 числа каждого месяца.",
      "timestamp": "2026-04-26T14:30:00.000Z"
    }
  ]
}
```

---

## Employee API

### Получение информации о сотруднике

**GET** `/api/employee/:id`

Получение полной информации о сотруднике по табельному номеру.

**Response:**
```json
{
  "id": "12345",
  "fullName": "Потапов Артем Павлович",
  "position": "Senior Developer",
  "department": "IT",
  "email": "a.potapov@company.ru",
  "phone": "+7 (999) 123-45-67",
  "hireDate": "2020-01-15",
  "birthDate": "1990-05-20",
  "vacationDays": 14,
  "nextVacation": "2026-07-01",
  "salary": 150000
}
```

### Получение информации об отпуске

**GET** `/api/employee/:id/vacation`

Получение информации об отпуске сотрудника.

**Response:**
```json
{
  "remainingDays": 14,
  "nextVacation": "2026-07-01",
  "vacationSchedule": [
    {
      "startDate": "2026-07-01",
      "endDate": "2026-07-14",
      "days": 14,
      "status": "planned"
    }
  ]
}
```

### Аутентификация сотрудника

**POST** `/api/employee/auth`

Аутентификация по табельному номеру или email.

**Request Body:**
```json
{
  "employeeId": "12345",
  "email": "a.potapov@company.ru"
}
```

**Response:**
```json
{
  "token": "jwt-token-12345-1714212198200",
  "employee": {
    "id": "12345",
    "fullName": "Потапов Артем Павлович",
    ...
  }
}
```

### Получение даты рождения

**GET** `/api/employee/:id/birthday`

Получение даты рождения сотрудника.

**Response:**
```json
{
  "birthDate": "1990-05-20",
  "age": 35
}
```

---

## Documents API

### Получение списка документов

**GET** `/api/documents`

Получение списка всех документов в базе знаний.

**Query Parameters:**
- `category` - фильтр по категории
- `type` - фильтр по типу документа

**Response:**
```json
{
  "documents": [
    {
      "id": "1",
      "title": "Правила внутреннего трудового распорядка",
      "type": "ЛНА",
      "category": "Общие положения",
      "uploadDate": "2026-01-15",
      "fileUrl": "/documents/pvtr.pdf"
    }
  ]
}
```

**Примеры:**
```bash
# Все документы
curl http://localhost:3000/api/documents

# Фильтр по категории
curl http://localhost:3000/api/documents?category=Отпуска

# Фильтр по типу
curl http://localhost:3000/api/documents?type=ЛНА
```

### Получение документа по ID

**GET** `/api/documents/:id`

Получение информации о конкретном документе.

**Response:**
```json
{
  "id": "1",
  "title": "Правила внутреннего трудового распорядка",
  "type": "ЛНА",
  "category": "Общие положения",
  "uploadDate": "2026-01-15",
  "fileUrl": "/documents/pvtr.pdf"
}
```

### Загрузка документа

**POST** `/api/documents/upload`

Загрузка нового документа в базу знаний.

**Request:** `multipart/form-data`
- `file` - файл документа (PDF, DOCX, DOC, TXT)
- `title` - название документа
- `category` - категория
- `type` - тип документа

**Response:**
```json
{
  "id": "5",
  "title": "Новый документ",
  "type": "Инструкция",
  "category": "Отпуска",
  "uploadDate": "2026-04-27",
  "fileUrl": "/uploads/1714212198200-123456789.pdf",
  "message": "Document uploaded successfully"
}
```

**Пример:**
```bash
curl -X POST http://localhost:3000/api/documents/upload \
  -F "file=@document.pdf" \
  -F "title=Инструкция по отпускам" \
  -F "category=Отпуска" \
  -F "type=Инструкция"
```

### Удаление документа

**DELETE** `/api/documents/:id`

Удаление документа из базы знаний.

**Response:**
```json
{
  "message": "Document deleted successfully"
}
```

### Получение категорий

**GET** `/api/documents/meta/categories`

Получение списка всех категорий документов.

**Response:**
```json
{
  "categories": [
    "Общие положения",
    "Заработная плата",
    "Льготы и компенсации",
    "Отпуска"
  ]
}
```

---

## Knowledge Base API

### Получение базы знаний

**GET** `/api/knowledge`

Получение всей базы знаний.

**Response:**
```json
{
  "knowledge": {
    "vacation": {
      "title": "Отпуска",
      "content": "...",
      "source": "Правила внутреннего трудового распорядка, п. 4.2"
    },
    "salary": {...},
    "sickLeave": {...},
    "dms": {...},
    "merch": {...},
    "referral": {...}
  }
}
```

### Поиск в базе знаний

**POST** `/api/knowledge/search`

Поиск релевантной информации по запросу.

**Request Body:**
```json
{
  "query": "отпуск"
}
```

**Response:**
```json
{
  "result": {
    "title": "Отпуска",
    "content": "Правила предоставления отпусков...",
    "source": "Правила внутреннего трудового распорядка, п. 4.2"
  }
}
```

---

## Структура проекта

```
backend/
├── src/
│   ├── routes/
│   │   ├── chat.js           # Эндпоинты чата
│   │   ├── employee.js        # Эндпоинты сотрудников
│   │   ├── documents.js       # Эндпоинты документов
│   │   └── knowledge.js       # Эндпоинты базы знаний
│   ├── services/
│   │   ├── ollama.js          # Интеграция с Ollama
│   │   └── knowledge.js       # База знаний
│   └── server.js              # Главный файл сервера
├── uploads/                   # Загруженные файлы
├── .env.example               # Пример конфигурации
├── .gitignore
├── package.json
└── README.md
```

## Что нужно сделать для продакшена

### 1. База данных
Сейчас используются заглушки в памяти. Необходимо:
- Подключить PostgreSQL или MongoDB
- Создать схемы для сотрудников, документов, истории чатов
- Реализовать миграции

### 2. Векторная база данных
Для улучшения поиска по документам:
- Установить Qdrant, Pinecone или Weaviate
- Создать эмбеддинги документов
- Реализовать семантический поиск

### 3. Аутентификация
- Реализовать полноценный JWT
- Добавить refresh tokens
- Интеграция с корпоративным SSO/LDAP

### 4. Парсинг документов
- Реализовать парсинг PDF (pdf-parse)
- Реализовать парсинг DOCX (mammoth)
- Разбивка на чанки для векторизации

### 5. Логирование и мониторинг
- Winston или Pino для логов
- Prometheus + Grafana для метрик
- Sentry для отслеживания ошибок

### 6. Тесты
- Unit тесты (Jest)
- Integration тесты
- E2E тесты

### 7. Docker
- Создать Dockerfile
- Docker Compose для всего стека (backend + Ollama + DB)

## Примеры использования

### Интеграция с фронтендом

```javascript
// Отправка сообщения в чат
const sendMessage = async (message, employeeId) => {
  const response = await fetch('http://localhost:3000/api/chat/message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, employeeId })
  });
  
  const data = await response.json();
  return data;
};

// Получение информации о сотруднике
const getEmployee = async (employeeId) => {
  const response = await fetch(`http://localhost:3000/api/employee/${employeeId}`);
  const data = await response.json();
  return data;
};

// Загрузка документа
const uploadDocument = async (file, title, category, type) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', title);
  formData.append('category', category);
  formData.append('type', type);
  
  const response = await fetch('http://localhost:3000/api/documents/upload', {
    method: 'POST',
    body: formData
  });
  
  const data = await response.json();
  return data;
};
```

## Лицензия

MIT
