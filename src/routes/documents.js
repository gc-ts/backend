import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.docx', '.doc', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOCX, DOC, TXT are allowed.'));
    }
  }
});

// Заглушка для списка документов
const documents = [
  {
    id: '1',
    title: 'Правила внутреннего трудового распорядка',
    type: 'ЛНА',
    category: 'Общие положения',
    uploadDate: '2026-01-15',
    fileUrl: '/documents/pvtr.pdf'
  },
  {
    id: '2',
    title: 'Положение об оплате труда',
    type: 'ЛНА',
    category: 'Заработная плата',
    uploadDate: '2026-01-20',
    fileUrl: '/documents/salary.pdf'
  },
  {
    id: '3',
    title: 'Положение о социальных льготах',
    type: 'ЛНА',
    category: 'Льготы и компенсации',
    uploadDate: '2026-02-01',
    fileUrl: '/documents/benefits.pdf'
  },
  {
    id: '4',
    title: 'Инструкция по оформлению отпуска',
    type: 'Инструкция',
    category: 'Отпуска',
    uploadDate: '2026-02-10',
    fileUrl: '/documents/vacation-guide.pdf'
  }
];

/**
 * GET /api/documents
 * Получение списка всех документов
 *
 * Query params:
 * - category: фильтр по категории
 * - type: фильтр по типу документа
 *
 * Response:
 * {
 *   "documents": [...]
 * }
 */
router.get('/', async (req, res) => {
  try {
    const { category, type } = req.query;

    let filteredDocs = documents;

    if (category) {
      filteredDocs = filteredDocs.filter(doc => doc.category === category);
    }

    if (type) {
      filteredDocs = filteredDocs.filter(doc => doc.type === type);
    }

    res.json({ documents: filteredDocs });

  } catch (error) {
    console.error('Documents error:', error);
    res.status(500).json({
      error: 'Failed to get documents',
      message: error.message
    });
  }
});

/**
 * GET /api/documents/:id
 * Получение информации о конкретном документе
 *
 * Response:
 * {
 *   "id": "1",
 *   "title": "...",
 *   ...
 * }
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const document = documents.find(doc => doc.id === id);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(document);

  } catch (error) {
    console.error('Document error:', error);
    res.status(500).json({
      error: 'Failed to get document',
      message: error.message
    });
  }
});

/**
 * POST /api/documents/upload
 * Загрузка нового документа в базу знаний
 *
 * Body: multipart/form-data
 * - file: файл документа
 * - title: название документа
 * - category: категория
 * - type: тип документа
 *
 * Response:
 * {
 *   "id": "5",
 *   "title": "...",
 *   "fileUrl": "/uploads/...",
 *   "message": "Document uploaded successfully"
 * }
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { title, category, type } = req.body;

    if (!title || !category || !type) {
      return res.status(400).json({ error: 'Title, category and type are required' });
    }

    const newDocument = {
      id: String(documents.length + 1),
      title,
      type,
      category,
      uploadDate: new Date().toISOString().split('T')[0],
      fileUrl: `/uploads/${req.file.filename}`
    };

    documents.push(newDocument);

    res.status(201).json({
      ...newDocument,
      message: 'Document uploaded successfully'
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'Failed to upload document',
      message: error.message
    });
  }
});

/**
 * DELETE /api/documents/:id
 * Удаление документа
 *
 * Response:
 * {
 *   "message": "Document deleted successfully"
 * }
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const index = documents.findIndex(doc => doc.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'Document not found' });
    }

    documents.splice(index, 1);

    res.json({ message: 'Document deleted successfully' });

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      error: 'Failed to delete document',
      message: error.message
    });
  }
});

/**
 * GET /api/documents/categories
 * Получение списка всех категорий документов
 *
 * Response:
 * {
 *   "categories": ["Общие положения", "Заработная плата", ...]
 * }
 */
router.get('/meta/categories', async (req, res) => {
  try {
    const categories = [...new Set(documents.map(doc => doc.category))];
    res.json({ categories });

  } catch (error) {
    console.error('Categories error:', error);
    res.status(500).json({
      error: 'Failed to get categories',
      message: error.message
    });
  }
});

export default router;
