import db from './db.js';
import crypto from 'crypto';
import { executeGutsRequest, executeGeminiRequest, CANDIDATE_TEXT_MODELS, getGutsApiKey, getApiKeys } from './geminiService.js';

// Format angka ke format Rupiah
export function formatRupiah(num) {
  return (Number(num) || 0).toLocaleString('id-ID');
}

// ==========================================
// 1. Manajemen Pemilik (Owner Management)
// ==========================================

export function getOwnerPhone() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'owner_phone'").get();
  if (row && row.value) {
    return row.value.replace(/[^0-9]/g, '');
  }
  const envPhone = (process.env.OWNER_PHONE_NUMBER || '').replace(/[^0-9]/g, '');
  return envPhone || null;
}

export function setOwnerPhone(phone) {
  const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
  if (!cleanPhone) return false;
  db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('owner_phone', ?, CURRENT_TIMESTAMP)").run(cleanPhone);
  return cleanPhone;
}

export function isOwner(senderPhone) {
  const owner = getOwnerPhone();
  if (!owner) return false;
  const cleanSender = (senderPhone || '').replace(/[^0-9]/g, '');
  return cleanSender.endsWith(owner) || owner.endsWith(cleanSender);
}

// ==========================================
// 2. Helper Akun & Kategori
// ==========================================

export function getAllAccounts() {
  return db.prepare("SELECT * FROM accounts ORDER BY name ASC").all();
}

export function getAllCategories(type = 'expense') {
  return db.prepare("SELECT * FROM categories WHERE type = ? OR type = 'transfer' ORDER BY name ASC").all(type);
}

export function findAccountByName(name) {
  if (!name) return null;
  const clean = name.trim().toLowerCase();
  return db.prepare("SELECT * FROM accounts WHERE LOWER(name) = ? OR LOWER(name) LIKE ?").get(clean, `%${clean}%`);
}

export function findCategoryByName(name, type = 'expense') {
  if (!name) return null;
  const clean = name.trim().toLowerCase();
  return db.prepare("SELECT * FROM categories WHERE LOWER(name) = ? OR LOWER(name) LIKE ?").get(clean, `%${clean}%`);
}

// ==========================================
// 3. Fast Regex Parser (Ekstraksi Cepat 0 ms)
// ==========================================

export function parseQuickRegex(text) {
  if (!text || typeof text !== 'string') return null;
  const cleanText = text.trim();

  // Pola Transfer: "tf bca ke gopay 50k", "transfer mandiri ke bca 100rb"
  const transferPattern = /^(?:tf|transfer|tarik tunai)\s+([a-zA-Z]+)(?:\s+ke\s+([a-zA-Z]+))?\s+([\d,.]+)\s*(k|rb|ribu|jt|juta)?/i;
  const tfMatch = cleanText.match(transferPattern);
  if (tfMatch) {
    const fromName = tfMatch[1];
    const toName = tfMatch[2] || (cleanText.toLowerCase().includes('tarik tunai') ? 'Cash' : null);
    const rawVal = parseFloat(tfMatch[3].replace(/[.,]/g, ''));
    const multiplier = (tfMatch[4] || '').toLowerCase();

    let amount = rawVal;
    if (multiplier === 'k' || multiplier === 'rb' || multiplier === 'ribu') amount *= 1000;
    else if (multiplier === 'jt' || multiplier === 'juta') amount *= 1000000;

    return {
      success: true,
      type: 'transfer',
      amount,
      accountName: fromName,
      toAccountName: toName || 'Cash',
      categoryName: 'Transfer Antar Dompet',
      merchant: null,
      description: cleanText,
      confidence: 0.95
    };
  }

  // Pola Pengeluaran/Pemasukan umum:
  // Contoh: "makan siang padang 35k bca", "kopi 25000 gopay", "bensin 50rb cash", "gaji 8jt mandiri"
  // Regex mencari: [keterangan...] [angka + satuan] [opsional: akun]
  const generalPattern = /^(.*?)\s+([\d,.]+)\s*(k|rb|ribu|jt|juta)\s*([a-zA-Z]+)?$/i;
  const genMatch = cleanText.match(generalPattern);

  if (genMatch) {
    const desc = genMatch[1].trim();
    const rawNum = parseFloat(genMatch[2].replace(/[.,]/g, ''));
    const unit = genMatch[3].toLowerCase();
    const accCandidate = (genMatch[4] || '').trim();

    let amount = rawNum;
    if (unit === 'k' || unit === 'rb' || unit === 'ribu') amount *= 1000;
    else if (unit === 'jt' || unit === 'juta') amount *= 1000000;

    // Deteksi Income
    const isIncome = /\b(gaji|gajian|income|masuk|bonus|cashback|transferan)\b/i.test(desc);

    // Tebak Kategori
    let categoryName = 'Lain-lain';
    if (isIncome) {
      categoryName = 'Gaji / Pemasukan';
    } else if (/\b(makan|kopi|teh|nasi|mie|roti|bakso|ayam|sate|mcd|kfc|starbucks|chatime|resto|cafe|jajan)\b/i.test(desc)) {
      categoryName = 'Makanan & Minuman';
    } else if (/\b(bensin|pertamax|pertalite|shell|solar|gojek|grab|ojol|tol|parkir|mrt|busway|kereta|angkot)\b/i.test(desc)) {
      categoryName = 'Transportasi';
    } else if (/\b(indomaret|alfamart|superindo|sayur|pasar|sabun|odol|shampoo|minyak|beras|telur)\b/i.test(desc)) {
      categoryName = 'Belanja Harian';
    } else if (/\b(listrik|pln|pdam|wifi|indihome|pulsa|paket data|netflix|spotify|youtube|iuran)\b/i.test(desc)) {
      categoryName = 'Tagihan & Langganan';
    } else if (/\b(nongkrong|nonton|bioskop|xxi|game|steam|topup|billiard)\b/i.test(desc)) {
      categoryName = 'Hiburan & Nongkrong';
    } else if (/\b(obat|dokter|klinik|apotek|panadol|vitamin|hospital)\b/i.test(desc)) {
      categoryName = 'Kesehatan & Obat';
    }

    return {
      success: true,
      type: isIncome ? 'income' : 'expense',
      amount,
      accountName: accCandidate || 'Cash',
      toAccountName: null,
      categoryName,
      merchant: desc,
      description: desc,
      confidence: 0.9
    };
  }

  return null;
}

// ==========================================
// 4. Gemini AI NLP Parser (Untuk Bahasa Alami)
// ==========================================

export async function parseWithGeminiNLP(text) {
  const accounts = getAllAccounts().map(a => a.name);
  const categories = getAllCategories('expense').map(c => c.name);

  const prompt = `
Kamu adalah asisten keuangan pribadi cerdas dan teliti.
Tugasmu adalah mengekstrak data transaksi keuangan dari chat pengguna berikut:
"${text}"

Daftar Akun/Dompet yang tersedia: [${accounts.join(', ')}]
Daftar Kategori yang tersedia: [${categories.join(', ')}, "Gaji / Pemasukan", "Transfer Antar Dompet"]

Aturan:
1. Tentukan "type": 'expense' (pengeluaran), 'income' (pemasukan), atau 'transfer' (pindah uang antar rekening).
2. "amount": integer nominal uang dalam Rupiah. Ubah satuan seperti 'k'/'rb' -> x1000, 'jt' -> x1000000.
3. "account": Nama akun sumber pembayaran (cocokkan ke daftar akun di atas, jika tidak disebut default ke "Cash" atau "BCA").
4. "toAccount": Khusus jika type adalah 'transfer', sebutkan akun tujuan. Selain itu null.
5. "category": Kategori yang paling relevan dari daftar di atas.
6. "merchant": Nama toko / tempat / pihak ketiga jika ada (contoh: "Warteg Bahari", "Kopi Kenangan", "SPBU Pertamina").
7. "description": Ringkasan singkat transaksi (1-4 kata).

KEMBALIKAN HANYA JSON DENGAN SCHEMA INI (tanpa markdown backtick):
{
  "success": true,
  "type": "expense",
  "amount": 35000,
  "account": "BCA",
  "toAccount": null,
  "category": "Makanan & Minuman",
  "merchant": "Warteg Bahari",
  "description": "Makan siang"
}
`;

  // 1. Coba Guts AI jika ada
  const gutsKey = getGutsApiKey();
  if (gutsKey) {
    const res = await executeGutsRequest({
      messages: [{ role: 'user', content: prompt }],
      isJson: true,
      maxTokens: 500,
      timeoutMs: 15000
    });
    if (res?.success && res.content) {
      try {
        const parsed = JSON.parse(res.content.trim());
        return {
          success: true,
          type: parsed.type || 'expense',
          amount: Number(parsed.amount) || 0,
          accountName: parsed.account || 'Cash',
          toAccountName: parsed.toAccount || null,
          categoryName: parsed.category || 'Lain-lain',
          merchant: parsed.merchant || parsed.description || 'Transaksi',
          description: parsed.description || text,
          confidence: 0.95
        };
      } catch (_) {}
    }
  }

  // 2. Fallback ke Google Gemini
  const apiKeys = getApiKeys();
  if (apiKeys.length > 0) {
    const requestBody = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { response_mime_type: 'application/json', temperature: 0.1 }
    };
    try {
      const { data } = await executeGeminiRequest({
        requestBody,
        candidateModels: CANDIDATE_TEXT_MODELS,
        timeoutMs: 8000
      });
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const parsed = JSON.parse(rawText.trim());
        return {
          success: true,
          type: parsed.type || 'expense',
          amount: Number(parsed.amount) || 0,
          accountName: parsed.account || 'Cash',
          toAccountName: parsed.toAccount || null,
          categoryName: parsed.category || 'Lain-lain',
          merchant: parsed.merchant || parsed.description || 'Transaksi',
          description: parsed.description || text,
          confidence: 0.95
        };
      }
    } catch (_) {}
  }

  return null;
}

// ==========================================
// 5. Eksekusi Pencatatan Transaksi (Database)
// ==========================================

export async function processFinanceText(text, source = 'wa_dm') {
  // Coba regex terlebih dahulu (super cepat)
  let parsed = parseQuickRegex(text);

  // Jika regex tidak cocok atau kurang jelas, gunakan AI NLP
  if (!parsed || parsed.amount <= 0) {
    parsed = await parseWithGeminiNLP(text);
  }

  if (!parsed || !parsed.amount || parsed.amount <= 0) {
    return {
      success: false,
      error: 'Tidak dapat mengenali nominal transaksi. Contoh ketik: "makan 25k bca" atau "bensin 50rb cash"'
    };
  }

  // Resolusi Akun Sumber
  let account = findAccountByName(parsed.accountName);
  if (!account) {
    // Buat akun baru jika belum ada
    const newAccId = 'acc_' + parsed.accountName.toLowerCase().replace(/[^a-z0-9]/g, '');
    db.prepare("INSERT OR IGNORE INTO accounts (id, name, type, balance) VALUES (?, ?, 'bank', 0)").run(newAccId, parsed.accountName);
    account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(newAccId);
  }

  // Resolusi Akun Tujuan (jika Transfer)
  let toAccount = null;
  if (parsed.type === 'transfer' && parsed.toAccountName) {
    toAccount = findAccountByName(parsed.toAccountName);
    if (!toAccount) {
      const newToId = 'acc_' + parsed.toAccountName.toLowerCase().replace(/[^a-z0-9]/g, '');
      db.prepare("INSERT OR IGNORE INTO accounts (id, name, type, balance) VALUES (?, ?, 'bank', 0)").run(newToId, parsed.toAccountName);
      toAccount = db.prepare("SELECT * FROM accounts WHERE id = ?").get(newToId);
    }
  }

  // Resolusi Kategori
  let category = findCategoryByName(parsed.categoryName, parsed.type);
  if (!category) {
    category = db.prepare("SELECT * FROM categories WHERE name = 'Lain-lain'").get() || { id: 'cat_other_expense', name: 'Lain-lain', icon: '📦' };
  }

  const txId = 'tx_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
  const nowIso = new Date().toISOString();

  // Eksekusi Atomic Transaction Database
  const logTx = db.transaction(() => {
    // 1. Simpan Transaksi
    db.prepare(`
      INSERT INTO transactions (
        id, account_id, to_account_id, category_id, type, amount,
        merchant, description, source, raw_text, transaction_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      txId,
      account ? account.id : null,
      toAccount ? toAccount.id : null,
      category ? category.id : null,
      parsed.type,
      parsed.amount,
      parsed.merchant || null,
      parsed.description || text,
      source,
      text,
      nowIso,
      nowIso
    );

    // 2. Mutasi Saldo
    if (parsed.type === 'expense' && account) {
      db.prepare("UPDATE accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(parsed.amount, account.id);
    } else if (parsed.type === 'income' && account) {
      db.prepare("UPDATE accounts SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(parsed.amount, account.id);
    } else if (parsed.type === 'transfer' && account && toAccount) {
      db.prepare("UPDATE accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(parsed.amount, account.id);
      db.prepare("UPDATE accounts SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(parsed.amount, toAccount.id);
    }
  });

  logTx();

  // Ambil saldo terbaru akun
  const updatedAcc = account ? db.prepare("SELECT * FROM accounts WHERE id = ?").get(account.id) : null;
  const updatedToAcc = toAccount ? db.prepare("SELECT * FROM accounts WHERE id = ?").get(toAccount.id) : null;

  return {
    success: true,
    transaction: {
      id: txId,
      type: parsed.type,
      amount: parsed.amount,
      account: account ? account.name : 'Cash',
      accountBalance: updatedAcc ? updatedAcc.balance : 0,
      toAccount: toAccount ? toAccount.name : null,
      toAccountBalance: updatedToAcc ? updatedToAcc.balance : null,
      category: category ? category.name : 'Lain-lain',
      categoryIcon: category ? category.icon : '🏷️',
      merchant: parsed.merchant,
      description: parsed.description,
      date: nowIso
    }
  };
}

// ==========================================
// 6. Undo Transaksi Terakhir
// ==========================================

export function undoLastTransaction() {
  const lastTx = db.prepare("SELECT * FROM transactions ORDER BY created_at DESC LIMIT 1").get();
  if (!lastTx) {
    return { success: false, error: 'Belum ada transaksi yang dapat dibatalkan.' };
  }

  // Parse ISO timestamp secara aman (baik format 'YYYY-MM-DDTHH:mm:ss.sssZ' maupun SQLite raw)
  let createdAtStr = String(lastTx.created_at || '');
  if (!createdAtStr.includes('T')) {
    createdAtStr = createdAtStr.replace(' ', 'T') + 'Z';
  } else if (!createdAtStr.endsWith('Z')) {
    createdAtStr += 'Z';
  }
  const txTime = new Date(createdAtStr).getTime();
  if (isNaN(txTime) || (Date.now() - txTime > 30 * 60 * 1000)) {
    return { success: false, error: 'Transaksi terakhir sudah lebih dari 30 menit yang lalu atau tidak valid.' };
  }

  const revert = db.transaction(() => {
    if (lastTx.type === 'expense' && lastTx.account_id) {
      db.prepare("UPDATE accounts SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(lastTx.amount, lastTx.account_id);
    } else if (lastTx.type === 'income' && lastTx.account_id) {
      db.prepare("UPDATE accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(lastTx.amount, lastTx.account_id);
    } else if (lastTx.type === 'transfer' && lastTx.account_id && lastTx.to_account_id) {
      db.prepare("UPDATE accounts SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(lastTx.amount, lastTx.account_id);
      db.prepare("UPDATE accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(lastTx.amount, lastTx.to_account_id);
    }
    db.prepare("DELETE FROM transactions WHERE id = ?").run(lastTx.id);
  });

  revert();
  return { success: true, transaction: lastTx };
}

// ==========================================
// 7. Laporan & Query Keuangan
// ==========================================

export function getTodayReport() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const rows = db.prepare(`
    SELECT t.*, c.name as category_name, c.icon as category_icon, a.name as account_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE DATE(t.transaction_date, 'localtime') = DATE('now', 'localtime')
    ORDER BY t.created_at DESC
  `).all();

  let totalExpense = 0;
  let totalIncome = 0;
  const categoryBreakdown = {};

  rows.forEach(r => {
    if (r.type === 'expense') {
      totalExpense += r.amount;
      const catName = r.category_name || 'Lain-lain';
      categoryBreakdown[catName] = (categoryBreakdown[catName] || 0) + r.amount;
    } else if (r.type === 'income') {
      totalIncome += r.amount;
    }
  });

  return {
    date: todayStr,
    totalExpense,
    totalIncome,
    transactionCount: rows.length,
    transactions: rows,
    categoryBreakdown
  };
}

export function getMonthReport() {
  const rows = db.prepare(`
    SELECT t.*, c.name as category_name, c.icon as category_icon
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE strftime('%Y-%m', t.transaction_date, 'localtime') = strftime('%Y-%m', 'now', 'localtime')
    ORDER BY t.created_at DESC
  `).all();

  let totalExpense = 0;
  let totalIncome = 0;
  const categoryBreakdown = {};

  rows.forEach(r => {
    if (r.type === 'expense') {
      totalExpense += r.amount;
      const catName = r.category_name || 'Lain-lain';
      categoryBreakdown[catName] = (categoryBreakdown[catName] || 0) + r.amount;
    } else if (r.type === 'income') {
      totalIncome += r.amount;
    }
  });

  return {
    totalExpense,
    totalIncome,
    netSavings: totalIncome - totalExpense,
    transactionCount: rows.length,
    categoryBreakdown
  };
}

export function getBalanceReport() {
  const accounts = db.prepare("SELECT * FROM accounts ORDER BY balance DESC").all();
  const totalBalance = accounts.reduce((sum, a) => sum + (a.balance || 0), 0);
  return { accounts, totalBalance };
}

// ==========================================
// 8. WhatsApp Message Formatters
// ==========================================

export function formatConfirmationMessage(tx) {
  const isTransfer = tx.type === 'transfer';
  const isIncome = tx.type === 'income';

  if (isTransfer) {
    return (
      `🔁 *Transfer Antar Dompet Tercatat!*\n` +
      `💸 Nominal: *Rp ${formatRupiah(tx.amount)}*\n` +
      `📤 Dari: *${tx.account}*\n` +
      `📥 Ke: *${tx.toAccount}*\n` +
      `-----------------------------------\n` +
      `💡 _Ketik *batal* dalam 30 menit jika salah catat_`
    );
  }

  const typeLabel = isIncome ? 'Pemasukan 💰' : 'Pengeluaran 💸';
  return (
    `✅ *${typeLabel} Tercatat!*\n` +
    `💰 Nominal: *Rp ${formatRupiah(tx.amount)}*\n` +
    `${tx.categoryIcon || '🏷️'} Kategori: *${tx.category}*\n` +
    `💳 Dompet: *${tx.account}*\n` +
    (tx.merchant ? `🏪 Tempat/Ket: *${tx.merchant}*\n` : '') +
    `-----------------------------------\n` +
    `💡 _Ketik *batal* dalam 30 menit jika mau hapus_`
  );
}

export function formatTodayMessage(report) {
  let text = `📊 *REKAP PENGELUARAN HARI INI*\n`;
  text += `📅 Tanggal: *${new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}*\n`;
  text += `💸 Total Keluar: *Rp ${formatRupiah(report.totalExpense)}*\n`;
  if (report.totalIncome > 0) {
    text += `💰 Pemasukan: *Rp ${formatRupiah(report.totalIncome)}*\n`;
  }
  text += `🔢 Jumlah Transaksi: *${report.transactionCount}*\n`;
  text += `-----------------------------------\n`;

  const cats = Object.entries(report.categoryBreakdown);
  if (cats.length > 0) {
    text += `*Rincian per Kategori:*\n`;
    cats.sort((a, b) => b[1] - a[1]).forEach(([name, amount]) => {
      text += `• ${name}: Rp ${formatRupiah(amount)}\n`;
    });
    text += `-----------------------------------\n`;
  } else {
    text += `_Belum ada pengeluaran hari ini._\n`;
  }

  text += `_Ketik */saldo* untuk cek posisi dompet_`;
  return text;
}

export function formatMonthMessage(report) {
  const monthName = new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  let text = `📈 *REKAP BULANAN — ${monthName.toUpperCase()}*\n`;
  text += `💰 Total Pemasukan: *Rp ${formatRupiah(report.totalIncome)}*\n`;
  text += `💸 Total Pengeluaran: *Rp ${formatRupiah(report.totalExpense)}*\n`;
  const netSign = report.netSavings >= 0 ? '+' : '-';
  text += `📊 Arus Kas Bersih: *${netSign}Rp ${formatRupiah(Math.abs(report.netSavings))}*\n`;
  text += `-----------------------------------\n`;

  const cats = Object.entries(report.categoryBreakdown);
  if (cats.length > 0) {
    text += `*Top Kategori Pengeluaran:*\n`;
    cats.sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([name, amount]) => {
      const pct = report.totalExpense > 0 ? Math.round((amount / report.totalExpense) * 100) : 0;
      text += `• ${name}: Rp ${formatRupiah(amount)} (${pct}%)\n`;
    });
  }

  return text;
}

export function formatBalanceMessage(balanceReport) {
  let text = `💳 *POSISI SALDO DOMPET*\n`;
  text += `-----------------------------------\n`;
  balanceReport.accounts.forEach(acc => {
    text += `• *${acc.name}*: Rp ${formatRupiah(acc.balance)}\n`;
  });
  text += `-----------------------------------\n`;
  text += `💰 *Total Kekayaan Likuid: Rp ${formatRupiah(balanceReport.totalBalance)}*\n\n`;
  text += `_Tips: Ketik misal "transfer bca ke gopay 100k" untuk pindah saldo_`;
  return text;
}

export default {
  processFinanceText,
  undoLastTransaction,
  getTodayReport,
  getMonthReport,
  getBalanceReport,
  formatConfirmationMessage,
  formatTodayMessage,
  formatMonthMessage,
  formatBalanceMessage,
  getOwnerPhone,
  setOwnerPhone,
  isOwner,
  parseQuickRegex,
  formatRupiah,
  getAllAccounts,
  getAllCategories,
  findAccountByName,
  findCategoryByName
};
