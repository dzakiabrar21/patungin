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
import { initWhatsAppBot, sendSplitBillToGroup, getBotStatus, logoutWhatsAppBot, getAppBaseUrl } from './services/whatsappBot.js';
import financeService from './services/financeService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Prevent process crash from async tunnel or network drops
process.on('unhandledRejection', (reason) => {
  console.warn('[Server Guard] Unhandled Rejection caught:', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.warn('[Server Guard] Uncaught Exception caught:', err?.message || err);
});

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
// Serve Service Worker without aggressive cache
app.get('/sw.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

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

// ==========================================
// Finance Dashboard & Expenses Tracker Endpoints
// ==========================================

app.get('/finance', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'finance.html'));
});

app.get('/api/finance/overview', (req, res) => {
  try {
    const data = financeService.getFinanceOverview(req.query.month);
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Error fetching finance overview:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/finance/transactions', (req, res) => {
  try {
    const { month, type, accountId, categoryId, search, limit, offset } = req.query;
    const data = financeService.getTransactionsList({
      month,
      type,
      accountId,
      categoryId,
      search,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0
    });
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Error fetching transactions list:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/finance/transactions', (req, res) => {
  try {
    const result = financeService.createManualTransaction(req.body);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('Error creating manual transaction:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/finance/transactions/:id', (req, res) => {
  try {
    const result = financeService.deleteTransactionById(req.params.id);
    if (!result.success) {
      return res.status(404).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('Error deleting transaction:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/finance/accounts', (req, res) => {
  try {
    const accounts = financeService.getAllAccounts();
    res.json({ success: true, accounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/finance/accounts', (req, res) => {
  try {
    const result = financeService.createOrUpdateAccount(req.body);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/finance/categories', (req, res) => {
  try {
    const categories = financeService.getAllCategoriesList();
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/finance/quick-text', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, error: 'Teks tidak boleh kosong.' });
    }
    const result = await financeService.processFinanceText(text, 'web_text');
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/finance/export', (req, res) => {
  try {
    const month = req.query.month || null;
    const csvData = financeService.exportTransactionsCsv(month);
    const filename = `Laporan_Keuangan_PatungIn_${month || 'Semua'}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvData);
  } catch (err) {
    console.error('Error exporting finance CSV:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/finance/import/preview', upload.single('statementFile'), async (req, res) => {
  try {
    let content = req.body.rawText || '';
    if (req.file) {
      content = fs.readFileSync(req.file.path, 'utf8');
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'File CSV atau teks mutasi tidak boleh kosong.' });
    }

    const result = await financeService.parseBankStatement(content, req.body.targetAccountId);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('Error parsing bank statement:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/finance/import/commit', (req, res) => {
  try {
    const { transactions, targetAccountId } = req.body;
    const result = financeService.commitImportedTransactions(transactions, targetAccountId);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('Error committing imported transactions:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/finance/google-sheet', (req, res) => {
  try {
    const url = financeService.getGoogleSheetUrl();
    const viewUrl = financeService.getGoogleSheetViewUrl();
    res.json({ success: true, url, viewUrl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/finance/google-sheet', (req, res) => {
  try {
    const { url } = req.body;
    const saved = financeService.setGoogleSheetUrl(url);
    res.json({ success: true, url: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/finance/google-sheet/sync-all', async (req, res) => {
  try {
    const result = await financeService.syncAllTransactionsToGoogleSheet();
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// iOS Shortcuts / Android Widget Endpoints
// ==========================================

app.get('/api/finance/shortcut/info', async (req, res) => {
  try {
    const baseUrl = await getAppBaseUrl();
    res.json({
      success: true,
      baseUrl,
      endpoint: `${baseUrl}/api/finance/shortcut`,
      scanEndpoint: `${baseUrl}/api/finance/shortcut/scan`,
      summaryEndpoint: `${baseUrl}/api/finance/shortcut/summary`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/finance/shortcut', async (req, res) => {
  try {
    const text = req.body.text || req.body.query || req.body.input || req.query.text || '';
    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        title: '⚠️ Gagal Catat',
        message: 'Teks pengeluaran tidak boleh kosong. Contoh: "makan siang 35k bca"'
      });
    }

    const result = await financeService.processFinanceText(text.trim(), 'ios_shortcut');
    if (!result.success) {
      return res.status(400).json({
        success: false,
        title: '⚠️ Tidak Dikenali',
        message: result.error || 'Format tidak dikenali. Contoh: "kopi 25k bca"'
      });
    }

    const tx = result.transaction;
    const amtStr = `Rp ${(Number(tx.amount) || 0).toLocaleString('id-ID')}`;
    const balStr = `Rp ${(Number(tx.accountBalance) || 0).toLocaleString('id-ID')}`;

    let title = '✅ Pengeluaran Dicatat';
    let message = `${amtStr} (${tx.category}) via ${tx.account}. Sisa saldo: ${balStr}`;

    if (tx.type === 'income') {
      title = '💰 Pemasukan Dicatat';
      message = `+${amtStr} via ${tx.account}. Total saldo: ${balStr}`;
    } else if (tx.type === 'transfer') {
      title = '🔁 Transfer Dicatat';
      message = `${amtStr} dari ${tx.account} ke ${tx.toAccount}.`;
    }

    return res.json({
      success: true,
      title,
      message,
      amount: tx.amount,
      formattedAmount: amtStr,
      account: tx.account,
      accountBalance: tx.accountBalance,
      category: tx.category,
      transaction: tx
    });
  } catch (err) {
    console.error('Error processing shortcut:', err);
    return res.status(500).json({
      success: false,
      title: '⚠️ Server Error',
      message: err.message
    });
  }
});

app.post('/api/finance/shortcut/scan', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        title: '⚠️ Gambar Tidak Ditemukan',
        message: 'Kirim foto struk atau screenshot pembayaran QRIS.'
      });
    }

    const caption = req.body.caption || req.body.text || '';
    const result = await financeService.processReceiptImage(
      file.path,
      file.mimetype,
      caption,
      'shortcut_image'
    );

    try { fs.unlinkSync(file.path); } catch (_) {}

    if (!result || !result.isFinancial || !result.success) {
      return res.status(400).json({
        success: false,
        title: '⚠️ Bukan Bukti Pembayaran',
        message: 'Gambar tidak terdeteksi sebagai struk belanja atau bukti transfer yang sah.'
      });
    }

    const tx = result.transaction;
    const amtStr = `Rp ${(Number(tx.amount) || 0).toLocaleString('id-ID')}`;
    const balStr = `Rp ${(Number(tx.accountBalance) || 0).toLocaleString('id-ID')}`;

    return res.json({
      success: true,
      title: '🧾 Struk Berhasil Dicatat!',
      message: `${amtStr} (${tx.category}) di ${tx.merchant || 'Merchant'}. Sisa saldo: ${balStr}`,
      amount: tx.amount,
      formattedAmount: amtStr,
      merchant: tx.merchant,
      account: tx.account,
      category: tx.category,
      transaction: tx
    });
  } catch (err) {
    console.error('Error in shortcut scan:', err);
    return res.status(500).json({
      success: false,
      title: '⚠️ Error Server',
      message: err.message
    });
  }
});

app.get('/api/finance/shortcut/summary', (req, res) => {
  try {
    const todayRep = financeService.getTodayReport();
    const balRep = financeService.getBalanceReport();

    const expStr = `Rp ${(Number(todayRep.totalExpense) || 0).toLocaleString('id-ID')}`;
    const totalBalStr = `Rp ${(Number(balRep.totalBalance) || 0).toLocaleString('id-ID')}`;

    const text = `Pengeluaran hari ini: ${expStr} (${todayRep.transactionCount} transaksi). Total saldo likuid: ${totalBalStr}.`;

    return res.json({
      success: true,
      title: '📊 Ringkasan Hari Ini',
      message: text,
      todayExpense: todayRep.totalExpense,
      totalBalance: balRep.totalBalance
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Bill Session Endpoints (Hybrid WA + Web)
app.post('/api/bill/create', (req, res) => {
  try {
    const { receipt, allMembers, payer, groupName, createdByName, paymentInfo } = req.body;
    if (!receipt || !receipt.items) {
      return res.status(400).json({ success: false, error: 'Data struk tidak valid.' });
    }

    const session = sessionStore.createSession({
      groupName: groupName || 'Sesi Patungan',
      createdByName: createdByName || (payer ? payer.name : 'Host'),
      receipt,
      allMembers: allMembers || [],
      payer: payer || null,
      paymentInfo: paymentInfo || null
    });

    return res.json({ success: true, session });
  } catch (err) {
    console.error('Error creating bill session:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

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

  // Individual member claim (Self-Claim mode from phone)
  if (req.body.itemIndices !== undefined || (req.body.memberName && req.body.isIndividualClaim)) {
    const result = sessionStore.setMemberClaims(req.params.id, {
      memberId: req.body.memberId,
      memberName: req.body.memberName,
      itemIndices: req.body.itemIndices || []
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  }

  // Full session update (Host mode / settings)
  const updated = sessionStore.updateSession(req.params.id, {
    receipt: req.body.receipt || session.receipt,
    allMembers: req.body.allMembers || session.allMembers,
    payer: req.body.payer !== undefined ? req.body.payer : session.payer,
    multiPayers: req.body.multiPayers !== undefined ? req.body.multiPayers : session.multiPayers,
    roundingMode: req.body.roundingMode || session.roundingMode,
    taxSplitMode: req.body.taxSplitMode || session.taxSplitMode,
    paymentInfo: req.body.paymentInfo !== undefined ? req.body.paymentInfo : session.paymentInfo
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
