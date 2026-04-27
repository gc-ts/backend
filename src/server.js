import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDatabase, seedDatabase, checkConnection } from './config/database.js';
import { checkOllamaHealth } from './services/ollama.js';
import { ingestStartupDocuments } from './services/knowledge.js';
import * as store from './services/vectorStore.js';
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import employeeRoutes from './routes/employee.js';
import documentsRoutes from './routes/documents.js';
import knowledgeRoutes from './routes/knowledge.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

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
      }
    }

    app.listen(PORT, () => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🚀 HR Agent Backend running on port ${PORT}`);
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
