import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { SAMPLE_PRESETS, parseReceiptWithGemini, parseMultipleReceipts } from './services/geminiService.js';
import sessionStore from './services/sessionStore.js';
import { initWhatsAppBot, sendSplitBillToGroup, getBotStatus, logoutWhatsAppBot } from './services/whatsappBot.js';

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

// ==========================================
// API Routes
// ==========================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/presets', (req, res) => {
  res.json({ success: true, presets: SAMPLE_PRESETS });
});

// WhatsApp Bot Endpoints
app.get('/wa-login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'wa-login.html'));
});

app.post('/api/wa/logout', async (req, res) => {
  const result = await logoutWhatsAppBot();
  res.json(result);
});

app.get('/api/wa/status', (req, res) => {
  const statusInfo = getBotStatus();
  res.json(statusInfo);
});

// Bill Session Endpoints (Hybrid WA + Web)
app.get('/api/bill/:id', (req, res) => {
  const session = sessionStore.getSession(req.params.id);
  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Sesi tagihan tidak ditemukan atau telah kedaluwarsa.'
    });
  }
  return res.json({ success: true, session });
});

app.post('/api/bill/:id/claim', (req, res) => {
  const session = sessionStore.getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Sesi tagihan tidak ditemukan.' });
  }

  const updated = sessionStore.updateSession(req.params.id, {
    receipt: req.body.receipt || session.receipt,
    allMembers: req.body.allMembers || session.allMembers,
    roundingMode: req.body.roundingMode || session.roundingMode
  });

  return res.json({ success: true, session: updated });
});

app.post('/api/bill/:id/send-to-wa', async (req, res) => {
  try {
    const session = sessionStore.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Sesi tagihan tidak ditemukan.' });
    }

    if (!session.groupId) {
      return res.status(400).json({
        success: false,
        error: 'Sesi ini tidak terhubung ke grup WhatsApp.'
      });
    }

    const { messageText } = req.body;
    if (!messageText) {
      return res.status(400).json({ success: false, error: 'Pesan rincian tagihan tidak boleh kosong.' });
    }

    console.log(`[send-to-wa] Mengirim rincian untuk sesi ${req.params.id} ke ${session.groupId}...`);
    const result = await sendSplitBillToGroup(session.groupId, messageText);
    if (result.success) {
      sessionStore.updateSession(req.params.id, { status: 'completed' });
    }

    return res.json(result);
  } catch (err) {
    console.error('[send-to-wa] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Scan Receipt via Web Upload
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
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 PatungIn Server berjalan di port ${PORT} (0.0.0.0)`);
    // Initialize WhatsApp Bot
    initWhatsAppBot(PORT);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const ALT_PORT = Number(PORT) + 1;
      console.log(`Port ${PORT} terpakai, mencoba port alternatif ${ALT_PORT}...`);
      app.listen(ALT_PORT, '0.0.0.0', () => {
        console.log(`🚀 PatungIn Server berjalan di port ${ALT_PORT} (0.0.0.0)`);
        initWhatsAppBot(ALT_PORT);
      });
    } else {
      console.error('Server error:', err);
    }
  });
}

export default app;
