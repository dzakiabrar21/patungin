import db from './db.js';
import crypto from 'crypto';
import fs from 'fs';
import { executeGutsRequest, executeGeminiRequest, CANDIDATE_TEXT_MODELS, CANDIDATE_VISION_MODELS, getGutsApiKey, getApiKeys } from './geminiService.js';

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

function cleanJsonString(str) {
  if (!str) return '{}';
  let cleaned = str.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  return cleaned.trim();
}

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
        const parsed = JSON.parse(cleanJsonString(res.content));
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
        const parsed = JSON.parse(cleanJsonString(rawText));
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

export function recordFinanceTransaction(parsed, source = 'wa_dm', rawInput = '') {
  if (!parsed || !parsed.amount || parsed.amount <= 0) {
    return {
      success: false,
      error: 'Tidak dapat mengenali nominal transaksi.'
    };
  }

  // Resolusi Akun Sumber
  const accountName = parsed.accountName || parsed.account || 'Cash';
  let account = findAccountByName(accountName);
  if (!account) {
    const newAccId = 'acc_' + accountName.toLowerCase().replace(/[^a-z0-9]/g, '');
    db.prepare("INSERT OR IGNORE INTO accounts (id, name, type, balance) VALUES (?, ?, 'bank', 0)").run(newAccId, accountName);
    account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(newAccId);
  }

  // Resolusi Akun Tujuan (jika Transfer)
  let toAccount = null;
  const toAccountName = parsed.toAccountName || parsed.toAccount;
  if (parsed.type === 'transfer' && toAccountName) {
    toAccount = findAccountByName(toAccountName);
    if (!toAccount) {
      const newToId = 'acc_' + toAccountName.toLowerCase().replace(/[^a-z0-9]/g, '');
      db.prepare("INSERT OR IGNORE INTO accounts (id, name, type, balance) VALUES (?, ?, 'bank', 0)").run(newToId, toAccountName);
      toAccount = db.prepare("SELECT * FROM accounts WHERE id = ?").get(newToId);
    }
  }

  // Resolusi Kategori
  const categoryName = parsed.categoryName || parsed.category || 'Lain-lain';
  let category = findCategoryByName(categoryName, parsed.type);
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
      parsed.type || 'expense',
      parsed.amount,
      parsed.merchant || null,
      parsed.description || rawInput,
      source,
      rawInput,
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
      type: parsed.type || 'expense',
      amount: parsed.amount,
      account: account ? account.name : 'Cash',
      accountBalance: updatedAcc ? updatedAcc.balance : 0,
      toAccount: toAccount ? toAccount.name : null,
      toAccountBalance: updatedToAcc ? updatedToAcc.balance : null,
      category: category ? category.name : 'Lain-lain',
      categoryIcon: category ? category.icon : '🏷️',
      merchant: parsed.merchant,
      description: parsed.description || rawInput,
      source,
      date: nowIso
    }
  };
}

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

  return recordFinanceTransaction(parsed, source, text);
}

/**
 * 5.B Ekstrak Bukti Transaksi dari Gambar (Struk / QRIS / m-Banking Transfer)
 */
export async function parseReceiptImageForFinance(filePath, mimeType = 'image/jpeg', caption = '') {
  const accounts = getAllAccounts().map(a => a.name);
  const categories = getAllCategories('expense').map(c => c.name);

  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString('base64');

  const promptText = `
Kamu adalah asisten keuangan pribadi cerdas dan teliti.
Tugasmu: Periksa apakah gambar ini merupakan bukti transaksi keuangan (struk belanja fisik, bukti pembayaran QRIS, bukti transfer m-Banking, invoice/tagihan, struk ATM/EDC, e-wallet payment proof).
${caption ? `Catatan dari pengguna: "${caption}"` : ''}

Daftar Akun/Dompet yang tersedia: [${accounts.join(', ')}]
Daftar Kategori yang tersedia: [${categories.join(', ')}, "Gaji / Pemasukan", "Transfer Antar Dompet"]

Jika gambar ini JELAS BUKAN bukti transaksi keuangan (misalnya foto selfie, meme, makanan tanpa struk/harga, pemandangan, benda biasa):
Kembalikan JSON:
{
  "isFinancial": false
}

Jika gambar ini ADALAH bukti pembayaran / struk / mutasi bank / QRIS:
1. "isFinancial": true
2. "type": 'expense' (pengeluaran), 'income' (pemasukan), atau 'transfer' (pindah saldo antar rekening).
3. "amount": total nominal pembayaran akhir yang sah (angka integer Rupiah, abaikan desimal/sen).
4. "merchant": Nama toko / merchant / penerima transfer (contoh: "Kopi Kenangan", "Indomaret", "SPBU Pertamina", "PLN", nama orang jika transfer).
5. "account": Nama bank atau e-wallet sumber pembayaran jika terlihat di struk/screenshot (misal: "BCA", "Mandiri", "GoPay", "OVO", "ShopeePay", "Cash"). Default ke "BCA" jika m-banking BCA atau tidak yakin.
6. "toAccount": Jika type 'transfer', bank tujuan. Jika bukan, null.
7. "category": Kategori paling sesuai dari daftar kategori di atas.
8. "description": Ringkasan singkat transaksi (misal: "Kopi Kenangan", "Beli Bensin", "Makan Siang", "Belanja Mingguan").

KEMBALIKAN HANYA JSON VALID (tanpa markdown backtick):
{
  "isFinancial": true,
  "type": "expense",
  "amount": 35000,
  "merchant": "Kopi Kenangan",
  "account": "BCA",
  "toAccount": null,
  "category": "Makanan & Minuman",
  "description": "Kopi Kenangan"
}
`;

  const gutsKey = getGutsApiKey();
  if (gutsKey) {
    try {
      const gutsRes = await executeGutsRequest({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${base64Data}` } }
            ]
          }
        ],
        isJson: true,
        maxTokens: 500,
        timeoutMs: 25000
      });
      if (gutsRes?.success && gutsRes.content) {
        return JSON.parse(cleanJsonString(gutsRes.content));
      }
    } catch (_) {}
  }

  const apiKeys = getApiKeys();
  if (apiKeys.length > 0) {
    const requestBody = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inline_data: {
                mime_type: mimeType || 'image/jpeg',
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0.1
      }
    };
    try {
      const { data } = await executeGeminiRequest({
        requestBody,
        candidateModels: CANDIDATE_VISION_MODELS,
        timeoutMs: 15000
      });
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        return JSON.parse(cleanJsonString(rawText));
      }
    } catch (err) {
      console.warn('[FinanceService] Error parsing receipt image:', err.message);
    }
  }

  return { isFinancial: false };
}

export async function processReceiptImage(filePath, mimeType = 'image/jpeg', caption = '', source = 'wa_image') {
  const parsed = await parseReceiptImageForFinance(filePath, mimeType, caption);
  if (!parsed || !parsed.isFinancial || !parsed.amount || parsed.amount <= 0) {
    return { isFinancial: false };
  }

  const result = recordFinanceTransaction(parsed, source, caption || parsed.description || parsed.merchant || 'Struk/QRIS');
  return {
    isFinancial: true,
    ...result
  };
}

/**
 * 5.C Ekstrak Catatan Keuangan dari Voice Note Audio (VN)
 */
export async function parseVoiceNoteForFinance(filePath, mimeType = 'audio/ogg') {
  const accounts = getAllAccounts().map(a => a.name);
  const categories = getAllCategories('expense').map(c => c.name);

  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString('base64');
  let cleanMime = (mimeType || 'audio/ogg').split(';')[0].trim();
  if (cleanMime === 'audio/opus') cleanMime = 'audio/ogg';

  const promptText = `
Kamu adalah asisten keuangan pribadi cerdas dan teliti.
Dengarkan rekaman suara / voice note pengguna berikut dengan seksama.

Tugasmu:
Cek apakah pengguna bermaksud MENCATAT PENGELUARAN, PEMASUKAN, atau TRANSFER UANG.
Contoh instruksi pencatatan keuangan yang valid:
- "Win, tolong catat tadi beli bensin seratus ribu pake bca ya"
- "tadi makan siang padang tiga puluh lima ribu gopay"
- "catat barusan beli kopi 25rb"
- "transfer bca ke gopay 100 ribu"
- "gajian masuk 8 juta mandiri"
- "beli martabak 40k cash"

Daftar Akun/Dompet yang tersedia: [${accounts.join(', ')}]
Daftar Kategori yang tersedia: [${categories.join(', ')}, "Gaji / Pemasukan", "Transfer Antar Dompet"]

Jika rekaman suara ini BUKAN instruksi mencatat keuangan (misal: obrolan santai, tanya kabar, tanya cuaca, curhat, bercanda):
Kembalikan JSON:
{
  "isFinancial": false
}

Jika rekaman suara ini ADALAH instruksi mencatat keuangan:
1. "isFinancial": true
2. "transcript": Kalimat asli yang diucapkan pengguna
3. "type": 'expense' | 'income' | 'transfer'
4. "amount": total nominal integer Rupiah (misal "seratus ribu" -> 100000, "25k" -> 25000)
5. "merchant": Nama merchant / barang / toko jika ada
6. "account": Akun sumber pembayaran (misal "BCA", "GoPay", "Cash", dll). Default "Cash" jika tidak disebut.
7. "toAccount": Akun tujuan jika type 'transfer'
8. "category": Kategori yang paling relevan dari daftar di atas
9. "description": Keterangan singkat pengeluaran

KEMBALIKAN HANYA JSON VALID (tanpa markdown backtick):
{
  "isFinancial": true,
  "transcript": "tadi beli bensin seratus ribu pake bca",
  "type": "expense",
  "amount": 100000,
  "merchant": "Bensin",
  "account": "BCA",
  "toAccount": null,
  "category": "Transportasi",
  "description": "Beli Bensin"
}
`;

  const apiKeys = getApiKeys();
  if (apiKeys.length > 0) {
    const requestBody = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inline_data: {
                mime_type: cleanMime,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0.1
      }
    };
    try {
      const { data } = await executeGeminiRequest({
        requestBody,
        candidateModels: CANDIDATE_VISION_MODELS,
        timeoutMs: 15000
      });
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        return JSON.parse(cleanJsonString(rawText));
      }
    } catch (err) {
      console.warn('[FinanceService] Error parsing voice note for finance:', err.message);
    }
  }

  return { isFinancial: false };
}

export async function processVoiceNote(filePath, mimeType = 'audio/ogg', source = 'wa_vn') {
  const parsed = await parseVoiceNoteForFinance(filePath, mimeType);
  if (!parsed || !parsed.isFinancial || !parsed.amount || parsed.amount <= 0) {
    return { isFinancial: false };
  }

  const result = recordFinanceTransaction(parsed, source, parsed.transcript || parsed.description || 'Voice Note');
  return {
    isFinancial: true,
    transcript: parsed.transcript || '',
    ...result
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

export function getFinanceOverview(monthStr = null) {
  const currentMonth = monthStr && /^\d{4}-\d{2}$/.test(monthStr)
    ? monthStr
    : new Date().toISOString().slice(0, 7);

  const accounts = db.prepare("SELECT * FROM accounts ORDER BY balance DESC, name ASC").all();
  const totalBalance = accounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);

  const rows = db.prepare(`
    SELECT t.*, 
           c.name as category_name, c.icon as category_icon,
           a.name as account_name,
           to_a.name as to_account_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN accounts to_a ON t.to_account_id = to_a.id
    WHERE strftime('%Y-%m', t.transaction_date, 'localtime') = ?
    ORDER BY t.transaction_date DESC, t.created_at DESC
  `).all(currentMonth);

  let totalExpense = 0;
  let totalIncome = 0;
  let totalTransfer = 0;
  const categoryMap = {};
  const dailyMap = {};

  rows.forEach(r => {
    const amt = Number(r.amount) || 0;
    const dayStr = String(r.transaction_date).slice(0, 10);

    if (!dailyMap[dayStr]) {
      dailyMap[dayStr] = { date: dayStr, expense: 0, income: 0 };
    }

    if (r.type === 'expense') {
      totalExpense += amt;
      dailyMap[dayStr].expense += amt;
      const catId = r.category_id || 'other';
      const catName = r.category_name || 'Lain-lain';
      const catIcon = r.category_icon || '📦';
      if (!categoryMap[catId]) {
        categoryMap[catId] = { id: catId, name: catName, icon: catIcon, amount: 0, count: 0 };
      }
      categoryMap[catId].amount += amt;
      categoryMap[catId].count += 1;
    } else if (r.type === 'income') {
      totalIncome += amt;
      dailyMap[dayStr].income += amt;
    } else if (r.type === 'transfer') {
      totalTransfer += amt;
    }
  });

  const categoryBreakdown = Object.values(categoryMap)
    .map(c => ({
      ...c,
      percentage: totalExpense > 0 ? Math.round((c.amount / totalExpense) * 100) : 0
    }))
    .sort((a, b) => b.amount - a.amount);

  const dailyTrend = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

  return {
    month: currentMonth,
    totalBalance,
    totalExpense,
    totalIncome,
    totalTransfer,
    netSavings: totalIncome - totalExpense,
    transactionCount: rows.length,
    accounts,
    categoryBreakdown,
    dailyTrend,
    recentTransactions: rows.slice(0, 15)
  };
}

export function getTransactionsList({
  month = null,
  type = null,
  accountId = null,
  categoryId = null,
  search = null,
  limit = 50,
  offset = 0
} = {}) {
  let whereClauses = [];
  let params = [];

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    whereClauses.push("strftime('%Y-%m', t.transaction_date, 'localtime') = ?");
    params.push(month);
  }

  if (type && type !== 'all') {
    whereClauses.push("t.type = ?");
    params.push(type);
  }

  if (accountId && accountId !== 'all') {
    whereClauses.push("(t.account_id = ? OR t.to_account_id = ?)");
    params.push(accountId, accountId);
  }

  if (categoryId && categoryId !== 'all') {
    whereClauses.push("t.category_id = ?");
    params.push(categoryId);
  }

  if (search && search.trim()) {
    const term = `%${search.trim().toLowerCase()}%`;
    whereClauses.push("(LOWER(t.merchant) LIKE ? OR LOWER(t.description) LIKE ? OR LOWER(t.raw_text) LIKE ?)");
    params.push(term, term, term);
  }

  const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM transactions t ${whereStr}`).get(...params);
  const total = countRow ? countRow.total : 0;

  const rows = db.prepare(`
    SELECT t.*, 
           c.name as category_name, c.icon as category_icon,
           a.name as account_name,
           to_a.name as to_account_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN accounts to_a ON t.to_account_id = to_a.id
    ${whereStr}
    ORDER BY t.transaction_date DESC, t.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit) || 50, Number(offset) || 0);

  return {
    transactions: rows,
    total,
    limit: Number(limit) || 50,
    offset: Number(offset) || 0
  };
}

export function createManualTransaction(data) {
  const {
    type = 'expense',
    amount = 0,
    accountId,
    toAccountId,
    categoryId,
    merchant,
    description,
    transactionDate
  } = data;

  const numAmount = Number(amount);
  if (!numAmount || numAmount <= 0) {
    return { success: false, error: 'Nominal transaksi harus lebih dari 0.' };
  }

  let account = accountId ? db.prepare("SELECT * FROM accounts WHERE id = ?").get(accountId) : null;
  if (!account) {
    account = db.prepare("SELECT * FROM accounts ORDER BY id ASC LIMIT 1").get();
  }

  let toAccount = null;
  if (type === 'transfer' && toAccountId) {
    toAccount = db.prepare("SELECT * FROM accounts WHERE id = ?").get(toAccountId);
    if (!toAccount) {
      return { success: false, error: 'Akun tujuan transfer tidak valid.' };
    }
  }

  let category = categoryId ? db.prepare("SELECT * FROM categories WHERE id = ?").get(categoryId) : null;
  if (!category) {
    category = db.prepare("SELECT * FROM categories WHERE type = ? LIMIT 1").get(type);
  }

  const txId = 'tx_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
  const txDate = transactionDate || new Date().toISOString();
  const nowIso = new Date().toISOString();

  const logTx = db.transaction(() => {
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
      type,
      numAmount,
      merchant || null,
      description || merchant || 'Transaksi Manual',
      'web_manual',
      description || '',
      txDate,
      nowIso
    );

    if (type === 'expense' && account) {
      db.prepare("UPDATE accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(numAmount, account.id);
    } else if (type === 'income' && account) {
      db.prepare("UPDATE accounts SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(numAmount, account.id);
    } else if (type === 'transfer' && account && toAccount) {
      db.prepare("UPDATE accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(numAmount, account.id);
      db.prepare("UPDATE accounts SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(numAmount, toAccount.id);
    }
  });

  logTx();

  const savedTx = db.prepare(`
    SELECT t.*, 
           c.name as category_name, c.icon as category_icon,
           a.name as account_name,
           to_a.name as to_account_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN accounts to_a ON t.to_account_id = to_a.id
    WHERE t.id = ?
  `).get(txId);

  return { success: true, transaction: savedTx };
}

export function deleteTransactionById(id) {
  const tx = db.prepare("SELECT * FROM transactions WHERE id = ?").get(id);
  if (!tx) {
    return { success: false, error: 'Transaksi tidak ditemukan.' };
  }

  const revert = db.transaction(() => {
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'expense' && tx.account_id) {
      db.prepare("UPDATE accounts SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(amt, tx.account_id);
    } else if (tx.type === 'income' && tx.account_id) {
      db.prepare("UPDATE accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(amt, tx.account_id);
    } else if (tx.type === 'transfer' && tx.account_id && tx.to_account_id) {
      db.prepare("UPDATE accounts SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(amt, tx.account_id);
      db.prepare("UPDATE accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(amt, tx.to_account_id);
    }
    db.prepare("DELETE FROM transactions WHERE id = ?").run(tx.id);
  });

  revert();
  return { success: true, deleted: tx };
}

export function createOrUpdateAccount(data) {
  const { id, name, type = 'bank', balance = 0 } = data;
  if (!name || !name.trim()) {
    return { success: false, error: 'Nama dompet/akun tidak boleh kosong.' };
  }

  const cleanName = name.trim();
  const numBalance = Number(balance) || 0;

  if (id) {
    db.prepare(`
      UPDATE accounts 
      SET name = ?, type = ?, balance = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(cleanName, type, numBalance, id);
    const updated = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id);
    return { success: true, account: updated };
  } else {
    const newId = 'acc_' + cleanName.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Date.now().toString(36).slice(-3);
    db.prepare(`
      INSERT INTO accounts (id, name, type, balance)
      VALUES (?, ?, ?, ?)
    `).run(newId, cleanName, type, numBalance);
    const created = db.prepare("SELECT * FROM accounts WHERE id = ?").get(newId);
    return { success: true, account: created };
  }
}

export function getAllCategoriesList() {
  return db.prepare("SELECT * FROM categories ORDER BY type ASC, name ASC").all();
}

// ==========================================
// 8. WhatsApp Message Formatters
// ==========================================

export function formatConfirmationMessage(tx, extraNote = '') {
  const isTransfer = tx.type === 'transfer';
  const isIncome = tx.type === 'income';

  let title = '✅ *Pengeluaran Tercatat!*';
  if (isTransfer) {
    title = '🔁 *Transfer Antar Dompet Tercatat!*';
  } else if (isIncome) {
    title = '💰 *Pemasukan Tercatat!*';
  } else if (tx.source === 'wa_image') {
    title = '🧾 *Struk / QRIS Tercatat!*';
  } else if (tx.source === 'wa_vn') {
    title = '🎙️ *Voice Note Tercatat!*';
  }

  if (isTransfer) {
    let msg =
      `${title}\n` +
      `💸 Nominal: *Rp ${formatRupiah(tx.amount)}*\n` +
      `📤 Dari: *${tx.account}*\n` +
      `📥 Ke: *${tx.toAccount}*\n`;
    if (extraNote) {
      msg += `🗣️ _"${extraNote}"_\n`;
    }
    msg +=
      `-----------------------------------\n` +
      `💡 _Ketik *batal* dalam 30 menit jika salah catat_`;
    return msg;
  }

  let msg =
    `${title}\n` +
    `💰 Nominal: *Rp ${formatRupiah(tx.amount)}*\n` +
    `${tx.categoryIcon || '🏷️'} Kategori: *${tx.category}*\n` +
    `💳 Dompet: *${tx.account}*\n` +
    (tx.merchant ? `🏪 Tempat/Ket: *${tx.merchant}*\n` : '');

  if (extraNote && extraNote !== tx.merchant && extraNote !== tx.description) {
    msg += `🗣️ _"${extraNote}"_\n`;
  }

  msg +=
    `-----------------------------------\n` +
    `💡 _Ketik *batal* dalam 30 menit jika mau hapus_`;
  return msg;
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

// ==========================================
// 9. Ekspor Laporan Transaksi ke CSV
// ==========================================

export function exportTransactionsCsv(monthStr = null) {
  let query = `
    SELECT t.id, t.transaction_date, t.type, t.amount,
           a.name as account_name,
           to_a.name as to_account_name,
           c.name as category_name,
           t.merchant, t.description, t.source
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN accounts to_a ON t.to_account_id = to_a.id
    LEFT JOIN categories c ON t.category_id = c.id
  `;
  const params = [];
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    query += ` WHERE strftime('%Y-%m', t.transaction_date, 'localtime') = ?`;
    params.push(monthStr);
  }
  query += ` ORDER BY t.transaction_date DESC, t.created_at DESC`;

  const rows = db.prepare(query).all(...params);

  const headers = [
    'ID Transaksi',
    'Tanggal Transaksi',
    'Jenis',
    'Nominal (IDR)',
    'Dompet Sumber',
    'Dompet Tujuan',
    'Kategori',
    'Tempat / Merchant',
    'Keterangan',
    'Sumber Input'
  ];

  function escapeCsv(val) {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  }

  const csvLines = [headers.join(',')];

  rows.forEach(r => {
    let typeName = 'Pengeluaran';
    if (r.type === 'income') typeName = 'Pemasukan';
    else if (r.type === 'transfer') typeName = 'Transfer Antar Dompet';

    let sourceName = 'Web Manual';
    if (r.source === 'wa_dm') sourceName = 'WhatsApp Chat';
    else if (r.source === 'wa_image') sourceName = 'Foto Struk/QRIS';
    else if (r.source === 'wa_vn') sourceName = 'Voice Note';
    else if (r.source === 'import_csv') sourceName = 'Import Mutasi Rekening';

    csvLines.push([
      escapeCsv(r.id),
      escapeCsv(r.transaction_date),
      escapeCsv(typeName),
      escapeCsv(r.amount),
      escapeCsv(r.account_name || 'Cash'),
      escapeCsv(r.to_account_name || '-'),
      escapeCsv(r.category_name || 'Lain-lain'),
      escapeCsv(r.merchant || '-'),
      escapeCsv(r.description || ''),
      escapeCsv(sourceName)
    ].join(','));
  });

  return '\uFEFF' + csvLines.join('\r\n');
}

// ==========================================
// 10. Import Mutasi Rekening (CSV / Statement Text)
// ==========================================

function guessCategoryForStatement(desc) {
  const d = (desc || '').toLowerCase();
  if (/\b(gaji|payroll|income|bonus|cashback|bunga tabungan|transfer masuk|topup)\b/.test(d)) return 'Gaji / Pemasukan';
  if (/\b(makan|kopi|coffee|resto|bakso|ayam|nasi|warung|mcd|kfc|starbucks|burger|chatime|snack|jajan|solaria|hokben)\b/.test(d)) return 'Makanan & Minuman';
  if (/\b(spbu|pertamina|shell|bensin|pertalite|pertamax|grab|gojek|gocar|goride|tol|parkir|mrt|kai|kereta|bus|bluebird)\b/.test(d)) return 'Transportasi';
  if (/\b(indomaret|alfamart|superindo|transmart|hypermart|sayur|buah|pasar|sabun|shampoo|minyak|beras|telur)\b/.test(d)) return 'Belanja Harian';
  if (/\b(listrik|pln|pdam|wifi|indihome|telkom|pulsa|paket data|netflix|spotify|youtube|iuran|bpjs)\b/.test(d)) return 'Tagihan & Langganan';
  if (/\b(biaya adm|adm bulanan|pajak bunga|kartu debit|materai)\b/.test(d)) return 'Tagihan & Langganan';
  if (/\b(bioskop|xxi|game|steam|playstation|topup|nonton|billiard)\b/.test(d)) return 'Hiburan & Nongkrong';
  if (/\b(apotek|obat|dokter|klinik|panadol|vitamin|hospital)\b/.test(d)) return 'Kesehatan & Obat';
  return 'Lain-lain';
}

export async function parseStatementWithAI(rawText) {
  const accounts = getAllAccounts().map(a => a.name);
  const categories = getAllCategories('expense').map(c => c.name);

  const prompt = `
Kamu adalah asisten keuangan AI cerdas dan teliti.
Pengguna memberikan data teks mutasi rekening bank / e-statement berikut:
"""
${rawText.slice(0, 10000)}
"""

Tugasmu:
Ekstrak semua baris mutasi / transaksi keuangan yang valid dari teks mutasi tersebut.
Daftar Kategori yang tersedia: [${categories.join(', ')}, "Gaji / Pemasukan", "Transfer Antar Dompet"]

Aturan:
1. "date": Format ISO "YYYY-MM-DD" atau tanggal transaksi yang tertera (gunakan tahun 2026 jika tidak ada tahun eksplisit).
2. "type": 'expense' (debit/uang keluar), 'income' (kredit/uang masuk), atau 'transfer' (pindah saldo).
3. "amount": nominal integer positif Rupiah (tanpa tanda minus).
4. "description": Keterangan asli atau nama merchant/pihak yang bertransaksi.
5. "merchant": Nama toko/tempat/rekening tujuan/sumber jika terdeteksi.
6. "category": Kategori yang paling sesuai dari daftar di atas.

KEMBALIKAN HANYA JSON VALID (tanpa markdown backtick):
{
  "transactions": [
    {
      "date": "2026-10-01",
      "type": "expense",
      "amount": 35000,
      "merchant": "Kopi Kenangan",
      "description": "QRIS Kopi Kenangan",
      "category": "Makanan & Minuman"
    }
  ]
}
`;

  const gutsKey = getGutsApiKey();
  if (gutsKey) {
    try {
      const res = await executeGutsRequest({
        messages: [{ role: 'user', content: prompt }],
        isJson: true,
        maxTokens: 2500,
        timeoutMs: 30000
      });
      if (res?.success && res.content) {
        const parsed = JSON.parse(cleanJsonString(res.content));
        if (Array.isArray(parsed.transactions)) {
          return parsed.transactions;
        }
      }
    } catch (_) {}
  }

  const apiKeys = getApiKeys();
  if (apiKeys.length > 0) {
    try {
      const { data } = await executeGeminiRequest({
        requestBody: {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { response_mime_type: 'application/json', temperature: 0.1 }
        },
        candidateModels: CANDIDATE_TEXT_MODELS,
        timeoutMs: 20000
      });
      const rawTextRes = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawTextRes) {
        const parsed = JSON.parse(cleanJsonString(rawTextRes));
        if (Array.isArray(parsed.transactions)) {
          return parsed.transactions;
        }
      }
    } catch (err) {
      console.warn('[FinanceService] Statement AI parser error:', err.message);
    }
  }

  return [];
}

export async function parseBankStatement(textOrCsv, targetAccountId = null) {
  if (!textOrCsv || typeof textOrCsv !== 'string' || !textOrCsv.trim()) {
    return { success: false, error: 'Data mutasi tidak boleh kosong.' };
  }

  const cleanRaw = textOrCsv.trim();
  const lines = cleanRaw.split(/\r?\n/).filter(l => l.trim().length > 0);
  const detected = [];

  // 1. Coba deteksi apakah ini file CSV standar dengan pemisah koma / titik koma
  let isCsvFormat = false;
  if (lines.length > 1 && (lines[0].includes(',') || lines[0].includes(';'))) {
    const delim = lines[0].includes(';') ? ';' : ',';
    const headerParts = lines[0].split(delim).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

    // Cari index kolom
    let dateIdx = headerParts.findIndex(h => /tgl|tanggal|date/i.test(h));
    let descIdx = headerParts.findIndex(h => /ket|keterangan|uraian|desc|narasi/i.test(h));
    let amountIdx = headerParts.findIndex(h => /nominal|jumlah|amount/i.test(h));
    let typeIdx = headerParts.findIndex(h => /tipe|type|d\/c|mutasi|db\/cr/i.test(h));
    let debitIdx = headerParts.findIndex(h => /debit|db|keluar/i.test(h));
    let creditIdx = headerParts.findIndex(h => /kredit|cr|masuk/i.test(h));

    if (dateIdx !== -1 && (descIdx !== -1 || amountIdx !== -1 || debitIdx !== -1)) {
      isCsvFormat = true;
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(delim).map(p => p.trim().replace(/^["']|["']$/g, ''));
        if (parts.length < 2) continue;

        const rawDate = parts[dateIdx] || '';
        const rawDesc = descIdx !== -1 ? (parts[descIdx] || 'Transaksi') : 'Transaksi';
        
        let type = 'expense';
        let amount = 0;

        if (debitIdx !== -1 && creditIdx !== -1) {
          const debVal = parseFloat((parts[debitIdx] || '0').replace(/[^\d.-]/g, '')) || 0;
          const credVal = parseFloat((parts[creditIdx] || '0').replace(/[^\d.-]/g, '')) || 0;
          if (credVal > 0) {
            type = 'income';
            amount = credVal;
          } else {
            type = 'expense';
            amount = Math.abs(debVal);
          }
        } else if (amountIdx !== -1) {
          const rawAmtStr = parts[amountIdx] || '0';
          const numVal = parseFloat(rawAmtStr.replace(/[^\d.-]/g, '')) || 0;
          if (typeIdx !== -1) {
            const typeStr = (parts[typeIdx] || '').toLowerCase();
            type = /cr|kredit|c|masuk/i.test(typeStr) ? 'income' : 'expense';
          } else {
            type = numVal < 0 || rawAmtStr.includes('-') ? 'expense' : 'income';
          }
          amount = Math.abs(numVal);
        }

        if (amount > 0) {
          detected.push({
            date: rawDate || new Date().toISOString().slice(0, 10),
            type,
            amount,
            merchant: rawDesc.split(/[-/]/)[0].trim().slice(0, 40),
            description: rawDesc,
            category: guessCategoryForStatement(rawDesc)
          });
        }
      }
    }
  }

  // 2. Jika bukan CSV standar atau hasil CSV kurang dari 1, gunakan AI Extractor cerdas
  if (detected.length === 0) {
    const aiTransactions = await parseStatementWithAI(cleanRaw);
    if (aiTransactions.length > 0) {
      detected.push(...aiTransactions);
    }
  }

  if (detected.length === 0) {
    return {
      success: false,
      error: 'Tidak ditemukan transaksi yang dapat dibaca dari data mutasi tersebut. Pastikan format teks atau CSV memuat tanggal, nominal, dan keterangan.'
    };
  }

  // Hitung ringkasan
  let totalExpense = 0;
  let totalIncome = 0;
  detected.forEach(t => {
    if (t.type === 'expense') totalExpense += t.amount;
    else if (t.type === 'income') totalIncome += t.amount;
  });

  return {
    success: true,
    count: detected.length,
    totalExpense,
    totalIncome,
    transactions: detected
  };
}

export function commitImportedTransactions(transactions, targetAccountId) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return { success: false, error: 'Tidak ada transaksi yang dipilih untuk disimpan.' };
  }

  let account = targetAccountId ? db.prepare("SELECT * FROM accounts WHERE id = ?").get(targetAccountId) : null;
  if (!account) {
    account = db.prepare("SELECT * FROM accounts WHERE name = 'BCA'").get() || db.prepare("SELECT * FROM accounts LIMIT 1").get();
  }

  const nowIso = new Date().toISOString();
  let totalInserted = 0;
  let totalExpense = 0;
  let totalIncome = 0;

  const insertBatch = db.transaction(() => {
    for (const t of transactions) {
      const amt = Number(t.amount) || 0;
      if (amt <= 0) continue;

      const txId = 'tx_imp_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
      const cat = findCategoryByName(t.category, t.type) || { id: 'cat_other_expense' };
      const txDate = t.date ? (t.date.includes('T') ? t.date : `${t.date}T12:00:00Z`) : nowIso;

      db.prepare(`
        INSERT INTO transactions (
          id, account_id, category_id, type, amount,
          merchant, description, source, raw_text, transaction_date, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'import_csv', ?, ?, ?)
      `).run(
        txId,
        account ? account.id : null,
        cat ? cat.id : null,
        t.type || 'expense',
        amt,
        t.merchant || null,
        t.description || t.merchant || 'Import Mutasi',
        t.description || '',
        txDate,
        nowIso
      );

      if (t.type === 'expense' && account) {
        db.prepare("UPDATE accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(amt, account.id);
        totalExpense += amt;
      } else if (t.type === 'income' && account) {
        db.prepare("UPDATE accounts SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(amt, account.id);
        totalIncome += amt;
      }

      totalInserted++;
    }
  });

  insertBatch();

  return {
    success: true,
    totalInserted,
    totalExpense,
    totalIncome,
    account: account ? account.name : 'Cash'
  };
}

export default {
  processFinanceText,
  recordFinanceTransaction,
  parseReceiptImageForFinance,
  processReceiptImage,
  parseVoiceNoteForFinance,
  processVoiceNote,
  undoLastTransaction,
  getTodayReport,
  getMonthReport,
  getBalanceReport,
  getFinanceOverview,
  getTransactionsList,
  createManualTransaction,
  deleteTransactionById,
  createOrUpdateAccount,
  getAllCategoriesList,
  exportTransactionsCsv,
  parseBankStatement,
  commitImportedTransactions,
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
