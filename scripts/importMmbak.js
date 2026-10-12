import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// 1. Cari file backup *.mmbak di root folder
let mmbakPath = path.join(rootDir, '20261012_140759_AD.mmbak');
if (!fs.existsSync(mmbakPath)) {
  const files = fs.readdirSync(rootDir);
  const found = files.find(f => f.endsWith('.mmbak'));
  if (found) {
    mmbakPath = path.join(rootDir, found);
  } else {
    console.error('❌ File backup *.mmbak tidak ditemukan di folder root project!');
    process.exit(1);
  }
}

console.log(`📂 Menggunakan backup file: ${path.basename(mmbakPath)}`);

const patunginDbPath = path.join(rootDir, 'data', 'patungin.db');
const destDb = new Database(patunginDbPath);
const srcDb = new Database(mmbakPath);

destDb.pragma('journal_mode = WAL');
destDb.pragma('foreign_keys = ON');

console.log('1. Menyiapkan Akun (Accounts)...');
const defaultAccounts = [
  { id: 'acc_bank_accounts', name: 'Bank Accounts', type: 'bank', bal: 0 },
  { id: 'acc_bsi', name: 'BSI', type: 'bank', bal: 0 },
  { id: 'acc_mandiri', name: 'Mandiri', type: 'bank', bal: 0 },
  { id: 'acc_jago', name: 'Jago', type: 'bank', bal: 0 },
  { id: 'acc_gopay', name: 'GoPay', type: 'ewallet', bal: 0 },
  { id: 'acc_rdn_stockbit', name: 'RDN Stockbit', type: 'investment', bal: 0 },
  { id: 'acc_cash', name: 'Cash', type: 'cash', bal: 0 },
  { id: 'acc_bca', name: 'BCA', type: 'bank', bal: 0 },
  { id: 'acc_ovo', name: 'OVO', type: 'ewallet', bal: 0 },
  { id: 'acc_shopeepay', name: 'ShopeePay', type: 'ewallet', bal: 0 }
];

const upsertAccount = destDb.prepare(`
  INSERT INTO accounts (id, name, type, balance, created_at, updated_at)
  VALUES (@id, @name, @type, @bal, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT(name) DO UPDATE SET type=excluded.type, updated_at=CURRENT_TIMESTAMP
`);

for (const acc of defaultAccounts) {
  upsertAccount.run(acc);
}

const accNameMap = {};
for (const r of destDb.prepare("SELECT id, LOWER(name) as lname FROM accounts").all()) {
  accNameMap[r.lname] = r.id;
}

const assetToAccId = {
  "1": accNameMap["cash"] || "acc_cash",
  "2": accNameMap["bank accounts"] || "acc_bank_accounts",
  "3": accNameMap["bank accounts"] || "acc_bank_accounts"
};

console.log('2. Menyiapkan Kategori (Categories)...');
destDb.prepare("DELETE FROM debts_ledger").run();
destDb.prepare("DELETE FROM transactions").run();
destDb.prepare("DELETE FROM categories").run();

const categoriesData = [
  { id: 'cat_snack_drink', name: 'Snack and drink', icon: '🧃', type: 'expense' },
  { id: 'cat_food', name: 'Makanan & Minuman', icon: '🍜', type: 'expense' },
  { id: 'cat_shopping', name: 'Shopping', icon: '🛍️', type: 'expense' },
  { id: 'cat_transport', name: 'Transportasi', icon: '🚖', type: 'expense' },
  { id: 'cat_hiburan', name: 'Hiburan', icon: '🎮', type: 'expense' },
  { id: 'cat_social_life', name: 'Social Life', icon: '👬🏻', type: 'expense' },
  { id: 'cat_bensin', name: 'Bensin', icon: '⛽', type: 'expense' },
  { id: 'cat_air_minum', name: 'Air minum', icon: '💧', type: 'expense' },
  { id: 'cat_laundry', name: 'Laundry', icon: '🧺', type: 'expense' },
  { id: 'cat_belanja', name: 'Belanja Harian', icon: '🛒', type: 'expense' },
  { id: 'cat_motor_services', name: 'Motor services', icon: '🛵', type: 'expense' },
  { id: 'cat_parkir', name: 'Parkir', icon: '🅿️', type: 'expense' },
  { id: 'cat_internet', name: 'Internet', icon: '📶', type: 'expense' },
  { id: 'cat_barber', name: 'Barber', icon: '💈', type: 'expense' },
  { id: 'cat_kereta', name: 'Kereta', icon: '🚆', type: 'expense' },
  { id: 'cat_education', name: 'Pendidikan & Buku', icon: '📙', type: 'expense' },
  { id: 'cat_obat_herbal', name: 'Obat dan herbal', icon: '💊', type: 'expense' },
  { id: 'cat_pasar', name: 'Pasar', icon: '🥬', type: 'expense' },
  { id: 'cat_health', name: 'Kesehatan & Olahraga', icon: '🧘🏼', type: 'expense' },
  { id: 'cat_household', name: 'Household', icon: '🪑', type: 'expense' },
  { id: 'cat_apparel', name: 'Apparel & Pakaian', icon: '🧥', type: 'expense' },
  { id: 'cat_other_expense', name: 'Lain-lain', icon: '📦', type: 'expense' },
  { id: 'cat_it_project', name: 'IT Project', icon: '💻', type: 'expense' },
  { id: 'cat_tabungan', name: 'Tabungan', icon: '🏦', type: 'expense' },
  { id: 'cat_buah', name: 'Buah', icon: '🍎', type: 'expense' },
  { id: 'cat_beauty', name: 'Beauty & Perawatan', icon: '💄', type: 'expense' },
  { id: 'cat_darurat', name: 'Darurat', icon: '🚨', type: 'expense' },
  { id: 'cat_listrik', name: 'Listrik & Tagihan', icon: '⚡', type: 'expense' },
  { id: 'cat_salary', name: 'Gaji / Pemasukan', icon: '💰', type: 'income' },
  { id: 'cat_transfer', name: 'Transfer Antar Dompet', icon: '🔁', type: 'transfer' }
];

const insertCat = destDb.prepare(`
  INSERT INTO categories (id, name, icon, type, created_at)
  VALUES (@id, @name, @icon, @type, CURRENT_TIMESTAMP)
`);
for (const cat of categoriesData) {
  insertCat.run(cat);
}

const mmCatMapping = {
  "2612A63A-17E1-425A-883A-EEAA4B3FB9CD": "cat_snack_drink",
  "6": "cat_food",
  "62CF2A7F-FF20-4374-A0D0-B30DF0DE15BA": "cat_shopping",
  "9": "cat_transport",
  "EF301EE9-272C-4DD5-865D-5A0F6FF92E10": "cat_hiburan",
  "7": "cat_social_life",
  "84E413B8-A891-4380-BBD0-4D5D539FAD71": "cat_bensin",
  "81AA1B66-2F75-4CDA-99E6-E39B3DA84590": "cat_air_minum",
  "4F493119-BA48-434D-8881-05F7229323CB": "cat_laundry",
  "A943F1F4-9971-444C-9F0C-2D15CA797AB7": "cat_belanja",
  "B456C876-F7AE-41F6-B4D8-F0986CED8FAF": "cat_motor_services",
  "985A8F03-39D8-4393-8743-AA271BE37908": "cat_parkir",
  "94B1EE54-0224-45FD-9677-3608E87FEC01": "cat_internet",
  "1FAE6C4C-E796-40D3-8669-998371A98F82": "cat_barber",
  "9D8BAF07-5041-4B18-A482-1C5A9EF4D9D1": "cat_kereta",
  "15": "cat_education",
  "224BA6CC-505B-4A8E-8A92-591A75F3F6E1": "cat_obat_herbal",
  "B28C77BD-3984-4722-BE1F-492BF518E871": "cat_pasar",
  "14": "cat_health",
  "11": "cat_household",
  "12": "cat_apparel",
  "17": "cat_other_expense",
  "2": "cat_salary",
  "052EC0D2-1C27-4931-9ADA-0BCA1C76485A": "cat_it_project",
  "1A5E9782-9B62-44C5-BAA4-1E7667472C04": "cat_tabungan",
  "B297E392-A6E5-4BE5-A499-D8ACB1E35F23": "cat_buah",
  "13": "cat_beauty",
  "1AF160AE-E347-4E16-B633-EF3E342511A7": "cat_darurat",
  "B7957E83-AB3E-4F5D-9AEE-A64FB8B2C68F": "cat_listrik"
};

console.log('3. Mengimpor 2.238 transaksi Money Manager...');
const rows = srcDb.prepare(`
  SELECT 
    Z_PK,
    ZDATE,
    ZTXDATESTR,
    ZDO_TYPE,
    ZAMOUNT,
    ZASSETUID,
    ZTOASSETUID,
    ZCATEGORYUID,
    ZCONTENT,
    ZMEMO
  FROM ZINOUTCOME 
  WHERE ZISDEL = 0 OR ZISDEL IS NULL
  ORDER BY ZDATE ASC, Z_PK ASC
`).all();

const insertTx = destDb.prepare(`
  INSERT INTO transactions (
    id, account_id, to_account_id, category_id, type, amount,
    merchant, description, source, raw_text, transaction_date, created_at
  ) VALUES (
    @id, @account_id, NULL, @category_id, @type, @amount,
    @merchant, @description, 'money_manager_import', @raw_text, @transaction_date, @created_at
  )
`);

let totalIncome = 0;
let totalExpense = 0;
const accountBalances = {};
for (const accId of Object.values(assetToAccId)) {
  accountBalances[accId] = 0.0;
}

const COCOA_OFFSET_MS = Date.UTC(2001, 0, 1, 0, 0, 0);

const importAll = destDb.transaction((txRows) => {
  for (const r of txRows) {
    const pk = r.Z_PK;
    const amount = Number(r.ZAMOUNT) || 0;
    const doType = String(r.ZDO_TYPE);

    let txType = 'expense';
    if (doType === '0') {
      txType = 'income';
      totalIncome += amount;
    } else if (doType === '1') {
      txType = 'expense';
      totalExpense += amount;
    } else {
      txType = 'transfer';
    }

    const cocoaSec = Number(r.ZDATE) || 0;
    const epochMs = COCOA_OFFSET_MS + (cocoaSec * 1000);
    const isoUtc = new Date(epochMs).toISOString();

    const assetUid = r.ZASSETUID ? String(r.ZASSETUID) : '2';
    const accId = assetToAccId[assetUid] || 'acc_bank_accounts';

    const catUid = r.ZCATEGORYUID ? String(r.ZCATEGORYUID) : '';
    const catId = mmCatMapping[catUid] || 'cat_other_expense';

    const content = (r.ZCONTENT || '').trim();
    const memo = (r.ZMEMO || '').trim();

    let desc = content;
    if (memo && memo !== content) {
      desc = content ? `${content} (${memo})` : memo;
    } else if (!desc) {
      desc = 'Transaksi';
    }

    const merchant = content || 'Transaksi';
    const txId = `tx_mm_${pk}`;

    insertTx.run({
      id: txId,
      account_id: accId,
      category_id: catId,
      type: txType,
      amount,
      merchant: merchant.slice(0, 100),
      description: desc.slice(0, 255),
      raw_text: `${content} ${memo}`.trim(),
      transaction_date: isoUtc,
      created_at: isoUtc
    });

    if (txType === 'income') {
      accountBalances[accId] = (accountBalances[accId] || 0) + amount;
    } else if (txType === 'expense') {
      accountBalances[accId] = (accountBalances[accId] || 0) - amount;
    }
  }
});

importAll(rows);

console.log('4. Memperbarui saldo akun...');
const updateBal = destDb.prepare("UPDATE accounts SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
for (const [accId, bal] of Object.entries(accountBalances)) {
  updateBal.run(bal, accId);
}

console.log('\n=== HASIL IMPORT SELESAI ===');
console.log(`Total transaksi diimpor : ${rows.length}`);
console.log(`Total Pemasukan          : Rp ${totalIncome.toLocaleString('id-ID')}`);
console.log(`Total Pengeluaran        : Rp ${totalExpense.toLocaleString('id-ID')}`);

const accList = destDb.prepare("SELECT name, type, balance FROM accounts WHERE balance != 0 OR name IN ('Cash', 'Bank Accounts') ORDER BY balance DESC").all();
console.log('\nSaldo Akun:');
for (const acc of accList) {
  console.log(`• ${acc.name} (${acc.type}): Rp ${acc.balance.toLocaleString('id-ID')}`);
}

srcDb.close();
destDb.close();
console.log('\n✅ Database PatungIn berhasil diperbarui dengan data Money Manager!');
