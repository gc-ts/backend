import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import chatRoutes from './routes/chat.js';
import employeeRoutes from './routes/employee.js';
import documentsRoutes from './routes/documents.js';
import knowledgeRoutes from './routes/knowledge.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN === '*' ? '*' : process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/chat', chatRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/knowledge', knowledgeRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ollama: process.env.OLLAMA_HOST
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 HR Agent Backend running on port ${PORT}`);
  console.log(`📡 Ollama host: ${process.env.OLLAMA_HOST}`);
  console.log(`🤖 Model: ${process.env.OLLAMA_MODEL}`);
});

export default app;
