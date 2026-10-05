import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, 'patungin.db');
const db = new Database(dbPath);

// Enable WAL mode & foreign keys for high performance and integrity
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize database schema
export function initDatabase() {
  db.exec(`
    -- 1. Tabel Akun / Rekening / Dompet
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      type TEXT NOT NULL DEFAULT 'bank', -- 'bank', 'ewallet', 'cash'
      balance REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Tabel Kategori Pengeluaran & Pemasukan
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      icon TEXT DEFAULT '🏷️',
      type TEXT NOT NULL DEFAULT 'expense', -- 'expense', 'income'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. Tabel Transaksi Keuangan Utama
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      bill_id TEXT, -- Referensi sesi split bill jika ada
      account_id TEXT REFERENCES accounts(id),
      to_account_id TEXT REFERENCES accounts(id), -- Khusus transaksi tipe 'transfer' antar dompet
      category_id TEXT REFERENCES categories(id),
      type TEXT NOT NULL, -- 'expense', 'income', 'transfer'
      amount REAL NOT NULL,
      merchant TEXT,
      description TEXT,
      source TEXT NOT NULL DEFAULT 'wa_dm', -- 'wa_dm', 'ios_shortcut', 'split_bill', 'manual'
      raw_text TEXT,
      transaction_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 4. Tabel Buku Piutang & Utang (Disiapkan untuk Split Bill)
    CREATE TABLE IF NOT EXISTS debts_ledger (
      id TEXT PRIMARY KEY,
      bill_id TEXT NOT NULL,
      debtor_name TEXT NOT NULL,
      amount REAL NOT NULL,
      direction TEXT DEFAULT 'receivable', -- 'receivable' | 'payable'
      status TEXT DEFAULT 'unpaid', -- 'unpaid' | 'paid'
      settled_at DATETIME,
      settlement_transaction_id TEXT REFERENCES transactions(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 5. Tabel Konfigurasi / Pengaturan Kunci-Nilai
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Indeks performa query laporan
    CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id);
  `);

  seedInitialData();
}

function seedInitialData() {
  // Default Accounts
  const defaultAccounts = [
    { id: 'acc_bca', name: 'BCA', type: 'bank', balance: 0 },
    { id: 'acc_mandiri', name: 'Mandiri', type: 'bank', balance: 0 },
    { id: 'acc_gopay', name: 'GoPay', type: 'ewallet', balance: 0 },
    { id: 'acc_ovo', name: 'OVO', type: 'ewallet', balance: 0 },
    { id: 'acc_shopeepay', name: 'ShopeePay', type: 'ewallet', balance: 0 },
    { id: 'acc_cash', name: 'Cash', type: 'cash', balance: 0 }
  ];

  const insertAccount = db.prepare(`
    INSERT OR IGNORE INTO accounts (id, name, type, balance)
    VALUES (@id, @name, @type, @balance)
  `);

  const insertManyAccounts = db.transaction((accounts) => {
    for (const acc of accounts) insertAccount.run(acc);
  });
  insertManyAccounts(defaultAccounts);

  // Default Categories
  const defaultCategories = [
    { id: 'cat_food', name: 'Makanan & Minuman', icon: '🍔', type: 'expense' },
    { id: 'cat_transport', name: 'Transportasi', icon: '🛵', type: 'expense' },
    { id: 'cat_groceries', name: 'Belanja Harian', icon: '🛒', type: 'expense' },
    { id: 'cat_bills', name: 'Tagihan & Langganan', icon: '⚡', type: 'expense' },
    { id: 'cat_hangout', name: 'Hiburan & Nongkrong', icon: '☕', type: 'expense' },
    { id: 'cat_health', name: 'Kesehatan & Obat', icon: '💊', type: 'expense' },
    { id: 'cat_education', name: 'Pendidikan & Buku', icon: '📚', type: 'expense' },
    { id: 'cat_other_expense', name: 'Lain-lain', icon: '📦', type: 'expense' },
    { id: 'cat_salary', name: 'Gaji / Pemasukan', icon: '💰', type: 'income' },
    { id: 'cat_transfer', name: 'Transfer Antar Dompet', icon: '🔁', type: 'transfer' }
  ];

  const insertCategory = db.prepare(`
    INSERT OR IGNORE INTO categories (id, name, icon, type)
    VALUES (@id, @name, @icon, @type)
  `);

  const insertManyCategories = db.transaction((categories) => {
    for (const cat of categories) insertCategory.run(cat);
  });
  insertManyCategories(defaultCategories);
}

// Inisialisasi otomatis saat modul di-import
initDatabase();

export default db;
