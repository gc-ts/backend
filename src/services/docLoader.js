import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { createRequire } from 'module';

// pdf-parse v1 ships an awkward CJS entry that auto-runs a debug block on import.
// Use createRequire + the lib subpath to avoid that.
const require = createRequire(import.meta.url);

let pdfParse = null;
function getPdfParse() {
  if (!pdfParse) pdfParse = require('pdf-parse/lib/pdf-parse.js');
  return pdfParse;
}

export async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const buf = fs.readFileSync(filePath);

  switch (ext) {
    case '.pdf': {
      const data = await getPdfParse()(buf);
      return data.text || '';
    }
    case '.docx': {
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return value || '';
    }
    case '.doc':
      // mammoth не поддерживает .doc; вернуть как есть, но предупредить
      console.warn('  ⚠️  .doc не поддерживается, конвертируйте в .docx');
      return '';
    case '.txt':
    case '.md':
      return buf.toString('utf-8');
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}

export function inferTitle(filePath, fallback = '') {
  const base = path.basename(filePath, path.extname(filePath));
  return fallback || base.replace(/[_-]+/g, ' ').trim();
}
