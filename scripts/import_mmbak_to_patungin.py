import sqlite3
import sys
from datetime import datetime, timezone, timedelta

sys.stdout.reconfigure(encoding='utf-8')

MM_FILE = "20261012_140759_AD.mmbak"
PATUNGIN_DB = "data/patungin.db"

src_conn = sqlite3.connect(MM_FILE)
src_conn.row_factory = sqlite3.Row
src_c = src_conn.cursor()

dest_conn = sqlite3.connect(PATUNGIN_DB)
dest_c = dest_conn.cursor()

print("1. Menyiapkan Akun (Accounts)...")
# Pastikan semua akun standar dan akun dari Money Manager terdaftar
default_accounts = [
    ("acc_bank_accounts", "Bank Accounts", "bank", 0),
    ("acc_cash", "Cash", "cash", 0),
    ("acc_bca", "BCA", "bank", 0),
    ("acc_mandiri", "Mandiri", "bank", 0),
    ("acc_gopay", "GoPay", "ewallet", 0),
    ("acc_ovo", "OVO", "ewallet", 0),
    ("acc_shopeepay", "ShopeePay", "ewallet", 0)
]

for acc_id, name, acc_type, bal in default_accounts:
    dest_c.execute("""
        INSERT INTO accounts (id, name, type, balance, created_at, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(name) DO UPDATE SET type=excluded.type, updated_at=CURRENT_TIMESTAMP
    """, (acc_id, name, acc_type, bal))

# Buat mapping case-insensitive nama akun -> id akun
acc_name_to_id = {}
for r in dest_c.execute("SELECT id, LOWER(name) FROM accounts").fetchall():
    acc_name_to_id[r[1]] = r[0]

asset_to_acc_id = {
    "1": acc_name_to_id.get("cash", "acc_cash"),
    "2": acc_name_to_id.get("bank accounts", "acc_bank_accounts"),
    "3": acc_name_to_id.get("bank accounts", "acc_bank_accounts")
}

print("2. Menyiapkan Kategori (Categories)...")
# Kosongkan tabel kategori agar rapi dan tidak ada duplikasi ID / Nama
dest_c.execute("DELETE FROM debts_ledger")
dest_c.execute("DELETE FROM transactions")
dest_c.execute("DELETE FROM categories")

categories_data = [
    # Kategori dari Money Manager
    ("cat_snack_drink", "Snack and drink", "🧃", "expense"),
    ("cat_food", "Makanan & Minuman", "🍜", "expense"),
    ("cat_shopping", "Shopping", "🛍️", "expense"),
    ("cat_transport", "Transportasi", "🚖", "expense"),
    ("cat_hiburan", "Hiburan", "🎮", "expense"),
    ("cat_social_life", "Social Life", "👬🏻", "expense"),
    ("cat_bensin", "Bensin", "⛽", "expense"),
    ("cat_air_minum", "Air minum", "💧", "expense"),
    ("cat_laundry", "Laundry", "🧺", "expense"),
    ("cat_belanja", "Belanja Harian", "🛒", "expense"),
    ("cat_motor_services", "Motor services", "🛵", "expense"),
    ("cat_parkir", "Parkir", "🅿️", "expense"),
    ("cat_internet", "Internet", "📶", "expense"),
    ("cat_barber", "Barber", "💈", "expense"),
    ("cat_kereta", "Kereta", "🚆", "expense"),
    ("cat_education", "Pendidikan & Buku", "📙", "expense"),
    ("cat_obat_herbal", "Obat dan herbal", "💊", "expense"),
    ("cat_pasar", "Pasar", "🥬", "expense"),
    ("cat_health", "Kesehatan & Olahraga", "🧘🏼", "expense"),
    ("cat_household", "Household", "🪑", "expense"),
    ("cat_apparel", "Apparel & Pakaian", "🧥", "expense"),
    ("cat_other_expense", "Lain-lain", "📦", "expense"),
    ("cat_it_project", "IT Project", "💻", "expense"),
    ("cat_tabungan", "Tabungan", "🏦", "expense"),
    ("cat_buah", "Buah", "🍎", "expense"),
    ("cat_beauty", "Beauty & Perawatan", "💄", "expense"),
    ("cat_darurat", "Darurat", "🚨", "expense"),
    ("cat_listrik", "Listrik & Tagihan", "⚡", "expense"),
    ("cat_salary", "Gaji / Pemasukan", "💰", "income"),
    ("cat_transfer", "Transfer Antar Dompet", "🔁", "transfer")
]

for c_id, name, icon, c_type in categories_data:
    dest_c.execute("""
        INSERT INTO categories (id, name, icon, type, created_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    """, (c_id, name, icon, c_type))

# Mapping ZCATEGORYUID Money Manager ke id kategori PatungIn
mm_cat_mapping = {
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
}

print("3. Mengimpor 2.238 transaksi Money Manager...")
src_c.execute("""
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
""")
rows = src_c.fetchall()

inserted_count = 0
total_income = 0
total_expense = 0

account_balances = {}
for acc_id in set(asset_to_acc_id.values()):
    account_balances[acc_id] = 0.0

for r in rows:
    pk = r["Z_PK"]
    amount = float(r["ZAMOUNT"] or 0)
    do_type = str(r["ZDO_TYPE"])
    
    if do_type == "0":
        tx_type = "income"
        total_income += amount
    elif do_type == "1":
        tx_type = "expense"
        total_expense += amount
    else:
        tx_type = "transfer"

    # ZDATE = Apple Cocoa CoreData timestamp (seconds since 2001-01-01 UTC)
    cocoa_sec = float(r["ZDATE"])
    dt_utc = datetime(2001, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=cocoa_sec)
    iso_utc = dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ")

    # Akun
    asset_uid = str(r["ZASSETUID"]) if r["ZASSETUID"] else "2"
    acc_id = asset_to_acc_id.get(asset_uid, "acc_bank_accounts")

    # Kategori
    cat_uid = str(r["ZCATEGORYUID"]) if r["ZCATEGORYUID"] else ""
    cat_id = mm_cat_mapping.get(cat_uid, "cat_other_expense")

    # Deskripsi & Merchant
    content = (r["ZCONTENT"] or "").strip()
    memo = (r["ZMEMO"] or "").strip()
    
    desc = content
    if memo and memo != content:
        desc = f"{content} ({memo})" if content else memo
    elif not desc:
        desc = "Transaksi"

    merchant = content if content else "Transaksi"

    tx_id = f"tx_mm_{pk}"

    dest_c.execute("""
        INSERT INTO transactions (
            id, account_id, to_account_id, category_id, type, amount,
            merchant, description, source, raw_text, transaction_date, created_at
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'money_manager_import', ?, ?, ?)
    """, (
        tx_id,
        acc_id,
        cat_id,
        tx_type,
        amount,
        merchant[:100],
        desc[:255],
        f"{content} {memo}".strip(),
        iso_utc,
        iso_utc
    ))

    # Update saldo
    if tx_type == "income":
        account_balances[acc_id] = account_balances.get(acc_id, 0.0) + amount
    elif tx_type == "expense":
        account_balances[acc_id] = account_balances.get(acc_id, 0.0) - amount

    inserted_count += 1

print("4. Memperbarui saldo akun...")
for acc_id, bal in account_balances.items():
    dest_c.execute("""
        UPDATE accounts 
        SET balance = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
    """, (bal, acc_id))

dest_conn.commit()

print("\n=== HASIL IMPORT SELESAI ===")
print(f"Total transaksi diimpor : {inserted_count}")
print(f"Total Pemasukan          : Rp {total_income:,.0f}")
print(f"Total Pengeluaran        : Rp {total_expense:,.0f}")
print("\nSaldo Akun:")
for r in dest_c.execute("SELECT name, type, balance FROM accounts WHERE balance != 0 OR name IN ('Cash', 'Bank Accounts') ORDER BY balance DESC").fetchall():
    print(f"• {r[0]} ({r[1]}): Rp {r[2]:,.0f}")

src_conn.close()
dest_conn.close()
print("\nDatabase PatungIn berhasil diperbarui dengan data Money Manager!")
