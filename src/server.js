import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { initDatabase, seedDatabase, checkConnection } from './config/database.js';
import { checkOllamaHealth } from './services/ollama.js';
import { ingestStartupDocuments } from './services/knowledge.js';
import { scheduleCorporatePortalSync, syncCorporatePortalData } from './services/corporatePortal.js';
import * as store from './services/vectorStore.js';
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import employeeRoutes from './routes/employee.js';
import documentsRoutes from './routes/documents.js';
import knowledgeRoutes from './routes/knowledge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(
  cors({
    origin: process.env.CORS_ORIGIN === '*' ? '*' : process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// OpenAPI spec + Swagger UI
const OPENAPI_PATH = path.resolve(__dirname, '..', 'openapi.yaml');
let openapiDoc = null;
try {
  openapiDoc = YAML.parse(fs.readFileSync(OPENAPI_PATH, 'utf-8'));
} catch (e) {
  console.warn('⚠️  openapi.yaml not loaded:', e.message);
}
app.get('/openapi.yaml', (_req, res) => {
  res.type('text/yaml').sendFile(OPENAPI_PATH);
});
app.get('/openapi.json', (_req, res) => {
  if (!openapiDoc) return res.status(404).json({ error: 'spec not loaded' });
  res.json(openapiDoc);
});
if (openapiDoc) {
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openapiDoc, {
      customSiteTitle: 'HR Agent API',
      swaggerOptions: { persistAuthorization: true, displayRequestDuration: true }
    })
  );
}

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/knowledge', knowledgeRoutes);

app.get('/health', async (req, res) => {
  const [dbConnected, ollama] = await Promise.all([checkConnection().catch(() => false), checkOllamaHealth()]);
  const stats = store.getStats();
  res.json({
    status: ollama.ok ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    ollama,
    database: dbConnected ? 'connected' : 'disconnected',
    rag: stats
  });
});

app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

const startServer = async () => {
  try {
    const dbConnected = await checkConnection();
    if (dbConnected) {
      await initDatabase();
      await seedDatabase();
    } else {
      console.warn('⚠️  Database not available — running with in-memory fallbacks.');
    }

    const ollama = await checkOllamaHealth();
    if (!ollama.ok) {
      console.warn('⚠️  Ollama not reachable at', ollama.host, ' — chat будет недоступен.');
    } else {
      if (!ollama.chatModelAvailable) {
        console.warn(`⚠️  Chat model "${ollama.chatModel}" не загружена. Доступные:`, ollama.models.join(', '));
      }
      if (!ollama.embedModelAvailable) {
        console.warn(`⚠️  Embed model "${ollama.embedModel}" не загружена. RAG-поиск отключён.`);
      } else {
        console.log('🧠 Запускаю индексацию документов…');
        try {
          await ingestStartupDocuments();
        } catch (e) {
          console.error('Ingestion failed:', e.message);
        }

        if (String(process.env.WP_SYNC_ON_START || 'false') === 'true') {
          console.log('🏢 Запускаю первичную синхронизацию корпоративного портала…');
          try {
            const result = await syncCorporatePortalData();
            if (result.skipped) {
              console.warn(`🏢 Первичная синхронизация пропущена: ${result.reason}`);
            }
          } catch (e) {
            console.error('Corporate portal startup sync failed:', e.message);
          }
        }
      }
    }

    scheduleCorporatePortalSync();

    app.listen(PORT, HOST, () => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🚀 HR Agent Backend running on http://${HOST}:${PORT}`);
      console.log(`📖 OpenAPI:  http://${HOST}:${PORT}/docs (raw: /openapi.yaml)`);
      console.log(`📡 Ollama:   ${ollama.host}`);
      console.log(`🤖 Chat:     ${ollama.chatModel}${ollama.chatModelAvailable ? ' ✓' : ' ✗ (не загружена)'}`);
      console.log(`🔎 Embed:    ${ollama.embedModel}${ollama.embedModelAvailable ? ' ✓' : ' ✗ (не загружена)'}`);
      console.log(`💾 Database: ${dbConnected ? 'connected' : 'disconnected'}`);
      console.log(`📚 RAG:      ${store.getStats().total} чанков в индексе`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
