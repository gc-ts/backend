# HR Agent AI — Backend

Локальный backend для AI-ассистента «Техна» компании **1221 Системс**.
Отвечает на вопросы сотрудников по HR-процессам, опираясь на загруженные ЛНА
(ПВТР, положения, инструкции). Полностью офлайн: без обращений к внешним
сервисам.

## Стек

| Компонент | Что используется |
| --- | --- |
| Runtime | Node.js 18+, Express |
| LLM | **Ollama** + `qwen2.5:32b-instruct-q4_K_M` (генерация) |
| Эмбеддинги | **Ollama** + `bge-m3:latest` (1024-мерные) |
| Векторное хранилище | in-process cosine search, persist в `data/vector-index.json` |
| База данных | PostgreSQL 14 (сотрудники, отпуска, история чата, документы) |
| Парсинг документов | `pdf-parse`, `mammoth` (PDF / DOCX / TXT / MD) |
| Auth | bcryptjs + JWT |
| Документация API | OpenAPI 3.0 + Swagger UI на `/docs` |

## Архитектура запроса в чат

```
        ┌────────────┐    1. message + employeeId
client →│ /api/chat/ │────────────────────────────────┐
        │  message   │                                ▼
        └────────────┘     ┌──────────────────────────────────────┐
                           │ 2. RAG: bge-m3 embed → cosine top-K  │
                           │    из data/vector-index.json         │
                           └──────────────────────────────────────┘
                                                ▼
                           ┌──────────────────────────────────────┐
                           │ 3. собираем системный промпт:        │
                           │    • строгие правила (источник, ТК)  │
                           │    • ДАННЫЕ СОТРУДНИКА (из БД)       │
                           │    • КОНТЕКСТ (top-K чанков ЛНА)     │
                           │    • история диалога (chat_messages) │
                           └──────────────────────────────────────┘
                                                ▼
                           ┌──────────────────────────────────────┐
                           │ 4. ollama.chat({ model: qwen2.5:32b })│
                           └──────────────────────────────────────┘
                                                ▼
                           ┌──────────────────────────────────────┐
                           │ 5. сохраняем (user, assistant) →     │
                           │    chat_messages, отдаём JSON / SSE  │
                           └──────────────────────────────────────┘
```

Соответствие ТЗ:

* идентификация сотрудника по табельному / e-mail — `findEmployee()` (БД + fallback);
* персонализация ответа («мой остаток отпуска» → реальные цифры) — блок
  «ДАННЫЕ СОТРУДНИКА» в системном промпте;
* поиск по PDF/DOCX — `services/docLoader.js` + `services/vectorStore.js`;
* «не выдумывай факты» — жёсткие правила в промпте + fallback-сообщение с
  контактом HR (`hr@company.ru`), если хитов нет;
* указание источника (ЛНА, пункт) — секция `chunkText()` распознаёт нумерацию
  «4.2», «10.1» и кладёт в `section`, который потом цитируется моделью;
* всё локально — единственный внешний домен в коде это URL Ollama, который
  по умолчанию `http://localhost:11434`.

## Быстрый старт

### 1. Зависимости

```bash
# Ollama (один раз)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:32b-instruct-q4_K_M
ollama pull bge-m3
ollama serve   # запуск демона (если не systemd)

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'password'; CREATE DATABASE hr_agent;"

# Backend
cd backend
npm install
cp .env.example .env   # при желании отредактируйте
```

### 2. Документы для базы знаний

Положите PDF/DOCX/TXT в `data/docs/`. На старте сервер автоматически
проиндексирует всё, что там есть. Если папки нет — она создастся, и сервер
дополнительно подсадит из `~/`:

* `ПВТР от 07.03.2025 №07.03.2025-1.docx`
* `1221 Системс.pdf`

### 3. Запуск

```bash
npm run dev    # nodemon
npm start      # прод
```

При успешном старте:

```
✅ Database connected: ...
✅ Database schema initialized
🌱 Database seeded with sample employees / vacations (password: password123)
🧠 Запускаю индексацию документов…
  📖 ПВТР.docx → "Правила внутреннего трудового распорядка" [ЛНА/Общие положения]
  ✂️  Правила внутреннего трудового распорядка: 108 чанков, эмбеддинг…
💾 Vector index saved: 109 chunks → ./data/vector-index.json
✅ Индексация завершена: документов 2, чанков добавлено 109
🚀 HR Agent Backend running on port 3000
📖 OpenAPI:  http://localhost:3000/docs
🤖 Chat:     qwen2.5:32b-instruct-q4_K_M ✓
🔎 Embed:    bge-m3:latest ✓
💾 Database: connected
📚 RAG:      109 чанков в индексе
```

## Конфигурация (`.env`)

| Переменная | По умолчанию | Что делает |
| --- | --- | --- |
| `PORT` | `3000` | Порт HTTP-сервера |
| `OLLAMA_HOST` | `http://localhost:11434` | URL Ollama |
| `OLLAMA_MODEL` | `qwen2.5:32b-instruct-q4_K_M` | LLM для чата |
| `OLLAMA_EMBED_MODEL` | `bge-m3:latest` | Модель эмбеддингов |
| `DB_*` | `localhost:5432 hr_agent / postgres / password` | PostgreSQL |
| `JWT_SECRET` | `hr-agent-secret-change-me-in-prod` | Секрет JWT |
| `RAG_TOP_K` | `4` | Сколько чанков подмешивать в контекст |
| `RAG_MIN_SCORE` | `0.35` | Порог cosine — ниже считаем «не нашли» |
| `RAG_CHUNK_SIZE` / `RAG_CHUNK_OVERLAP` | `900` / `150` | Параметры чанкера |
| `RAG_DOCS_DIR` | `./data/docs` | Папка-источник документов |
| `RAG_INDEX_PATH` | `./data/vector-index.json` | Куда писать индекс |
| `MAX_FILE_SIZE` | `20971520` (20 MB) | Лимит загрузки |
| `CORS_ORIGIN` | `*` | CORS |

Если БД недоступна — сервер работает с in-memory заглушками сотрудников
(12345, 67890, 11111). Если Ollama не отвечает — чат-эндпоинты вернут 500,
остальные продолжают работать.

## API

Полная спецификация: **`http://localhost:3000/docs`** (Swagger UI),
сырой YAML — `/openapi.yaml`, JSON — `/openapi.json`.

### Сводка по группам

| Метод | Путь | Описание |
| --- | --- | --- |
| GET  | `/health` | Состояние сервиса, моделей и RAG-индекса |
| POST | `/api/auth/register` | Регистрация (email + пароль) |
| POST | `/api/auth/login` | Логин → JWT |
| POST | `/api/auth/verify` | Проверка JWT |
| POST | `/api/chat/message` | Вопрос → ответ с источниками |
| POST | `/api/chat/stream` | То же через Server-Sent Events |
| GET  | `/api/chat/history/:employeeId` | История диалога из БД |
| GET  | `/api/employee/:id` | Карточка сотрудника |
| GET  | `/api/employee/:id/vacation` | Отпуск + график |
| GET  | `/api/employee/:id/birthday` | День рождения и возраст |
| GET  | `/api/employee/search/by-name?name=` | Поиск по ФИО |
| POST | `/api/employee/auth` | Лёгкая идентификация (без пароля) |
| GET  | `/api/documents` | Список документов (RAG + БД) |
| POST | `/api/documents/upload` | Загрузка + авто-индексация |
| DELETE | `/api/documents/:id` | Удаление + удаление чанков |
| GET  | `/api/documents/meta/categories` | Список категорий |
| POST | `/api/knowledge/search` | Поиск по KB (вектор + keyword) |
| POST | `/api/knowledge/reindex` | Принудительная переиндексация |
| GET  | `/api/knowledge/index` | Статистика индекса |

### Примеры

```bash
# Состояние
curl http://localhost:3000/health | jq

# Чат с персонализацией
curl -X POST http://localhost:3000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message":"Сколько у меня дней отпуска?","employeeId":"12345"}' | jq

# Стриминг (SSE)
curl -N -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message":"Когда аванс?","employeeId":"12345"}'

# Загрузка нового ЛНА — мгновенно появляется в RAG
curl -X POST http://localhost:3000/api/documents/upload \
  -F "file=@policy.pdf" \
  -F "title=Положение о премировании" \
  -F "category=Заработная плата" \
  -F "type=ЛНА"

# Полный поиск по индексу
curl -X POST http://localhost:3000/api/knowledge/search \
  -H "Content-Type: application/json" \
  -d '{"query":"перенос отпуска","topK":6}' | jq
```

### Ответ чата (структура)

```json
{
  "response": "У вас остаток отпуска 14 дней, ближайший — 1 июля 2026 …\n\nОснование: Правила внутреннего трудового распорядка, п. 7.6",
  "source": "Правила внутреннего трудового распорядка, п. 7.6",
  "hits": [
    { "score": 0.66, "doc": "Правила внутреннего трудового распорядка", "section": "п. 7.6 …" }
  ],
  "timestamp": "2026-04-27T12:46:01.123Z"
}
```

### Стриминг (SSE)

```
data: {"type":"context","source":"ПВТР, п. 7.6","hits":[…]}
data: {"type":"token","delta":"У вас "}
data: {"type":"token","delta":"14 дней."}
data: {"type":"done"}
```

## Структура проекта

```
backend/
├── data/
│   ├── docs/                     # сюда кладём PDF/DOCX для индексации
│   └── vector-index.json         # persist векторов (auto)
├── openapi.yaml                  # OpenAPI 3.0 спецификация
├── src/
│   ├── config/
│   │   ├── database.js           # пул pg + initDatabase + seedDatabase
│   │   └── seed.sql              # справочный seed (используется опционально)
│   ├── routes/
│   │   ├── auth.js               # /api/auth/* (register/login/verify)
│   │   ├── chat.js               # /api/chat/* (message, stream, history)
│   │   ├── employee.js           # /api/employee/*
│   │   ├── documents.js          # /api/documents/* (+ загрузка → RAG)
│   │   └── knowledge.js          # /api/knowledge/* (search/index/reindex)
│   ├── services/
│   │   ├── ollama.js             # generate / stream / embed + системный промпт
│   │   ├── vectorStore.js        # чанкер, cosine search, persist
│   │   ├── docLoader.js          # PDF / DOCX / TXT → text
│   │   ├── knowledge.js          # гибридный search + ingest при старте
│   │   ├── employee.js           # БД + in-memory fallback
│   │   └── auth.js               # bcrypt + JWT
│   └── server.js                 # инициализация, /docs, ingest на старте
├── uploads/                      # загруженные файлы
├── package.json
└── .env / .env.example
```

## Тестовые сотрудники

После `seedDatabase()` доступны (пароль для логина — `password123`):

| Табельный | Email | ФИО | Должность |
| --- | --- | --- | --- |
| 12345 | a.potapov@company.ru | Потапов Артем Павлович | Senior Developer |
| 67890 | m.ivanova@company.ru | Иванова Мария Сергеевна | HR Manager |
| 11111 | p.petrov@company.ru | Петров Петр Петрович | Team Lead |

## Что осталось «на потом»

* Векторный индекс in-memory — для < 10 000 чанков это ок; при росте перенести
  на pgvector / Qdrant / Weaviate.
* Загрузка `.doc` (старый формат Word) — сейчас поддерживается только `.docx`
  через mammoth.
* Refresh-токены, OIDC/SSO интеграция.
* Rate-limiting и метрики (Prometheus / Sentry).
* Dockerfile + docker-compose (backend + Ollama + Postgres) для one-shot
  развёртывания.

## Лицензия

MIT
