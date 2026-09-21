import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { SAMPLE_PRESETS, parseReceiptWithGemini } from './services/geminiService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Setup upload directory in OS temporary directory (compatible with Vercel serverless and local)
const uploadDir = path.join(os.tmpdir(), 'patungin_uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `receipt-${Date.now()}-${Math.round(Math.random() * 1e5)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/presets', (req, res) => {
  res.json({ success: true, presets: SAMPLE_PRESETS });
});

app.post('/api/scan-receipt', upload.any(), async (req, res) => {
  try {
    const customApiKey = req.body.apiKey || null;
    const files = req.files || (req.file ? [req.file] : []);

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Tidak ada gambar yang diunggah.'
      });
    }

    let result;
    if (files.length === 1) {
      result = await parseReceiptWithGemini(files[0].path, files[0].mimetype, customApiKey);
    } else {
      result = await parseMultipleReceipts(files, customApiKey);
    }

    // Clean up temporary files asynchronously
    files.forEach(f => {
      fs.unlink(f.path, (err) => {
        if (err) console.error('Failed to remove temp file:', err);
      });
    });

    return res.json(result);
  } catch (err) {
    console.error('Error handling /api/scan-receipt:', err);
    return res.status(500).json({
      success: false,
      error: 'Gagal memproses struk: ' + err.message
    });
  }
});

// Start local server if not running in Vercel serverless environment
if (!process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    console.log(`🚀 PatungIn Server berjalan di http://localhost:${PORT}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const ALT_PORT = Number(PORT) + 1;
      console.log(`Port ${PORT} terpakai, mencoba port alternatif ${ALT_PORT}...`);
      app.listen(ALT_PORT, () => {
        console.log(`🚀 PatungIn Server berjalan di http://localhost:${ALT_PORT}`);
      });
    } else {
      console.error('Server error:', err);
    }
  });
}

export default app;
