# HR Agent AI — Backend

Локальный backend для AI-ассистента «Техна» компании **1221 Системс**.
Отвечает на вопросы сотрудников по HR-процессам, опираясь на загруженные ЛНА
(ПВТР, положения, инструкции). Полностью офлайн: без обращений к внешним
сервисам.

## Возможности

### AI-Чат с RAG
- 🤖 Интеграция с локальной моделью Ollama (qwen2.5:32b)
- 🔍 RAG (Retrieval-Augmented Generation) для точных ответов из документов
- 📚 Векторный поиск по базе знаний с использованием эмбеддингов (bge-m3)
- 💬 История диалогов с сохранением контекста
- 🎯 Персонализированные ответы на основе данных сотрудника
- 📖 Цитирование источников (документ, раздел, пункт)
- 🌊 Поддержка стриминга ответов через Server-Sent Events

### Управление документами
- 📄 Загрузка документов (PDF, DOCX, TXT, MD)
- 🔄 Автоматическая индексация при загрузке
- 🗂️ Категоризация документов (ЛНА, Инструкции, Положения)
- 🔎 Полнотекстовый и векторный поиск
- 🗑️ Удаление документов с очисткой индекса
- 📊 Метаданные и статистика по документам

### Аутентификация и авторизация
- 🔐 JWT-токены для безопасной аутентификации
- 🔑 Хеширование паролей с bcrypt
- 👥 Система ролей (employee, admin)
- 🛡️ Middleware для защиты эндпоинтов
- ✅ Проверка и валидация токенов

### База данных
- 💾 PostgreSQL для хранения данных
- 👤 Управление сотрудниками (профили, должности, отделы)
- 📅 Учет отпусков и графиков
- 💬 История чатов и сообщений
- 📑 Метаданные документов
- 🌱 Автоматический seed тестовыми данными

### API
- 📖 OpenAPI 3.0 спецификация
- 🎨 Swagger UI на `/docs`
- 🔄 RESTful архитектура
- 📊 Health check эндпоинт
- 🌐 CORS поддержка

## Стек технологий

| Компонент | Технология |
| --- | --- |
| Runtime | Node.js 18+, Express 4.18 |
| LLM | **Ollama** + `qwen2.5:32b-instruct-q4_K_M` (генерация) |
| Эмбеддинги | **Ollama** + `bge-m3:latest` (1024-мерные векторы) |
| Векторное хранилище | In-process cosine search, persist в `data/vector-index.json` |
| База данных | PostgreSQL 14+ (сотрудники, отпуска, история чата, документы) |
| Парсинг документов | `pdf-parse`, `mammoth` (PDF / DOCX / TXT / MD) |
<<<<<<< HEAD
| Аутентификация | bcryptjs + JWT (jsonwebtoken) |
| Загрузка файлов | Multer |
| Документация API | OpenAPI 3.0 + Swagger UI Express |
=======
| Корпоративные данные | WordPress REST API (`users`, `posts`) с ежедневной индексацией |
| Auth | bcryptjs + JWT |
| Документация API | OpenAPI 3.0 + Swagger UI на `/docs` |
>>>>>>> b937773 (Added a sync with WP corp portal. Added some mock data like salary or birthday. New endpoints for admin)

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
| `WP_URL` | — | URL корпоративного WordPress-портала, например `https://portal-test.1221systems.ru` |
| `WP_USER` / `WP_APP_PASS` | — | Пользователь и application password WordPress REST API |
| `WP_SYNC_HOUR_MSK` / `WP_SYNC_MINUTE_MSK` | `18` / `0` | Ежедневное обновление корпоративных данных по московскому времени |
| `WP_SYNC_ON_START` | `false` | Запустить синхронизацию WordPress сразу при старте сервера |
| `WP_ALLOW_INSECURE_TLS` | `true` | Разрешить тестовый TLS-сертификат, аналогично `curl -k` |
| `WP_USERS_FIELDS` / `WP_POSTS_FIELDS` | см. код | Переопределение `_fields`, если на портале есть кастомные поля (`meta`, `acf`, дата рождения и т.п.) |
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
| PUT  | `/api/employee/:id` | Сотрудник редактирует свою mock-карточку; admin может редактировать любую |
| GET  | `/api/employee/:id/vacation` | Отпуск + график |
| GET  | `/api/employee/:id/birthday` | День рождения и возраст |
| GET  | `/api/employee/search/by-name?name=` | Поиск по ФИО |
| POST | `/api/employee/auth` | Лёгкая идентификация (без пароля) |
| GET  | `/api/employee/admin/list` | Admin: список редактируемых mock-карточек сотрудников |
| GET  | `/api/employee/admin/:id` | Admin: получить любую mock-карточку сотрудника |
| POST | `/api/employee/admin` | Admin: создать mock-карточку сотрудника |
| PUT  | `/api/employee/admin/:id` | Admin: обновить персональные данные сотрудника |
| POST | `/api/employee/admin/:id/vacations` | Admin: добавить плановый отпуск |
| DELETE | `/api/employee/admin/:id` | Admin: удалить mock-карточку сотрудника |
| GET  | `/api/documents` | Список документов (RAG + БД) |
| POST | `/api/documents/upload` | Загрузка + авто-индексация |
| DELETE | `/api/documents/:id` | Удаление + удаление чанков |
| GET  | `/api/documents/meta/categories` | Список категорий |
| POST | `/api/knowledge/search` | Поиск по KB (вектор + keyword) |
| POST | `/api/knowledge/reindex` | Принудительная переиндексация |
| GET  | `/api/knowledge/corporate-sync` | Состояние расписания синхронизации WordPress |
| POST | `/api/knowledge/sync-corporate` | Принудительная синхронизация WordPress |
| GET  | `/api/knowledge/index` | Статистика индекса |

### Примеры

```bash
# Состояние
curl http://localhost:3000/health | jq

# Чат с персонализацией
curl -X POST http://localhost:3000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message":"Сколько у меня дней отпуска?","employeeId":"12345"}' | jq

# Лёгкая идентификация по табельному номеру или email возвращает JWT для чата
curl -X POST http://localhost:3000/api/employee/auth \
  -H "Content-Type: application/json" \
  -d '{"employeeId":"11111111111"}' | jq

# Admin: обновить mock-данные сотрудника
curl -X PUT http://localhost:3000/api/employee/admin/11111111111 \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"vacationDays":27,"salary":91000,"birthDate":"1997-09-18"}' | jq

# Сотрудник: обновить свои поля по JWT, полученному через /api/employee/auth
curl -X PUT http://localhost:3000/api/employee/11111111111 \
  -H "Authorization: Bearer <employee-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"birthDate":"1997-09-19","salary":92000,"telegram":"@anastasia_test"}' | jq

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

# Принудительно подтянуть сотрудников и новости с корпоративного портала
curl -X POST http://localhost:3000/api/knowledge/sync-corporate \
  -H "Authorization: Bearer <admin-jwt>" | jq
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

## Безопасность

### Аутентификация
- JWT токены с настраиваемым секретом (`JWT_SECRET` в `.env`)
- Хеширование паролей с использованием bcrypt (10 раундов)
- Проверка токенов через middleware `authenticateToken`

### Авторизация по ролям
- **employee** - обычный сотрудник:
  - Доступ к своим данным (профиль, отпуска, история чатов)
  - Чтение документов и поиск по базе знаний
  - Отправка сообщений в чат от своего имени
- **admin** - администратор:
  - Полный доступ ко всем данным сотрудников
  - Загрузка и удаление документов
  - Переиндексация базы знаний
  - Просмотр истории чатов любого сотрудника

### Защита эндпоинтов
- Middleware проверяет наличие и валидность JWT токена
- Проверка прав доступа на уровне роутов
- Возврат 401 для неавторизованных запросов
- Возврат 403 для запросов без необходимых прав

## Мониторинг и отладка

### Health Check
```bash
curl http://localhost:3000/health | jq
```

Возвращает:
- Статус сервиса (healthy/degraded)
- Доступность Ollama моделей
- Статус подключения к БД
- Количество чанков в RAG-индексе
- Версию API

### Логирование
Сервер выводит подробные логи:
- ✅ Успешные операции (подключение к БД, индексация)
- ⚠️ Предупреждения (fallback на in-memory данные)
- ❌ Ошибки (недоступность Ollama, ошибки БД)
- 📊 Статистика индексации документов

## Производительность

### RAG оптимизация
- Векторный индекс хранится в памяти для быстрого поиска
- Персистентность в `data/vector-index.json` для быстрого старта
- Настраиваемые параметры чанкинга (`RAG_CHUNK_SIZE`, `RAG_CHUNK_OVERLAP`)
- Порог релевантности (`RAG_MIN_SCORE`) для фильтрации нерелевантных результатов

### База данных
- Connection pooling для PostgreSQL
- Индексы на часто используемых полях
- Оптимизированные запросы с JOIN'ами

### Кэширование
- Векторный индекс загружается один раз при старте
- Эмбеддинги документов переиспользуются

## Развертывание

### Требования к системе
- **CPU**: 4+ ядра (для Ollama qwen2.5:32b)
- **RAM**: 16+ GB (модель занимает ~12 GB)
- **Диск**: 20+ GB свободного места
- **ОС**: Linux, macOS, Windows (с WSL2)

### Production рекомендации
1. Измените `JWT_SECRET` на случайную строку
2. Настройте `CORS_ORIGIN` на конкретный домен фронтенда
3. Используйте HTTPS (reverse proxy через nginx/caddy)
4. Настройте регулярные бэкапы PostgreSQL
5. Мониторинг через Prometheus/Grafana
6. Rate limiting через nginx или express-rate-limit
7. Логирование в файлы или централизованную систему (ELK, Loki)

### Docker (опционально)
```bash
# Создайте Dockerfile и docker-compose.yml
docker-compose up -d
```

## Troubleshooting

### Ollama не отвечает
```bash
# Проверьте статус
curl http://localhost:11434/api/tags

# Перезапустите Ollama
ollama serve

# Проверьте модели
ollama list
```

### PostgreSQL недоступен
```bash
# Проверьте статус
pg_isready -h localhost -p 5432

# Проверьте подключение
psql -h localhost -U postgres -d hr_agent

# Проверьте логи
tail -f /var/log/postgresql/postgresql-14-main.log
```

### Ошибки индексации документов
- Проверьте формат файла (поддерживаются PDF, DOCX, TXT, MD)
- Убедитесь, что файл не поврежден
- Проверьте размер файла (лимит `MAX_FILE_SIZE`)
- Проверьте права доступа к папке `data/docs/`

### Медленные ответы чата
- Уменьшите `RAG_TOP_K` (меньше контекста)
- Используйте более быструю модель Ollama
- Увеличьте `RAG_MIN_SCORE` (меньше результатов)
- Проверьте загрузку CPU/RAM

## Roadmap

### Планируется
- [ ] Векторная БД (pgvector / Qdrant) вместо in-memory индекса
- [ ] Поддержка `.doc` (старый формат Word)
- [ ] Refresh-токены для JWT
- [ ] OIDC/SSO интеграция
- [ ] Rate limiting
- [ ] Метрики (Prometheus)
- [ ] Dockerfile + docker-compose
- [ ] Поддержка Excel файлов (.xlsx)
- [ ] Webhook уведомления
- [ ] Аудит логи действий пользователей

### В разработке
- ✅ OpenAPI документация
- ✅ Система ролей и прав доступа
- ✅ Векторный поиск с RAG
- ✅ Стриминг ответов

## Поддержка

### Документация
- **API**: http://localhost:3000/docs (Swagger UI)
- **OpenAPI спецификация**: `/openapi.yaml` или `/openapi.json`
- **База данных**: см. `DATABASE.md`

### Контакты
- **Email**: hr@company.ru
- **GitHub Issues**: для багов и feature requests

## Лицензия

MIT
