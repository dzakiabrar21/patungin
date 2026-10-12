import sqlite3
import csv
import sys
from datetime import datetime, timezone, timedelta

sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect("20261012_140759_AD.mmbak")
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# 1. Map Assets
asset_map = {}
cursor.execute("SELECT ZUID, ZNICNAME FROM ZASSET")
for r in cursor.fetchall():
    asset_map[str(r["ZUID"])] = r["ZNICNAME"]

# 2. Map Categories (Parent & Sub)
cat_raw = {}
cursor.execute("SELECT ZUID, ZPUID, ZNAME FROM ZCATEGORY")
for r in cursor.fetchall():
    cat_raw[str(r["ZUID"])] = {"name": r["ZNAME"], "puid": str(r["ZPUID"]) if r["ZPUID"] else "0"}

cat_map = {}
for uid, info in cat_raw.items():
    puid = info["puid"]
    if puid != "0" and puid in cat_raw:
        cat_map[uid] = f"{cat_raw[puid]['name']} > {info['name']}"
    else:
        cat_map[uid] = info["name"]

# 3. Query all non-deleted transactions
cursor.execute("""
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
    ORDER BY Z_PK DESC
""")

rows = cursor.fetchall()
wib_tz = timezone(timedelta(hours=7))

output_csv = "transaksi_money_manager.csv"
with open(output_csv, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)
    writer.writerow([
        "ID",
        "Tanggal",
        "Jam (WIB)",
        "Tipe",
        "Nominal (Rp)",
        "Dompet / Akun",
        "Tujuan Transfer",
        "Kategori",
        "Catatan / Deskripsi",
        "Memo Tambahan"
    ])

    for r in rows:
        pk = r["Z_PK"]
        tgl = r["ZTXDATESTR"] or ""

        # Hitung Jam:Menit:Detik WIB dari CoreData timestamp (ZDATE dimulai dari 2001-01-01 UTC)
        jam_str = ""
        if r["ZDATE"] is not None:
            try:
                dt_utc = datetime(2001, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=float(r["ZDATE"]))
                dt_wib = dt_utc.astimezone(wib_tz)
                jam_str = dt_wib.strftime("%H:%M:%S")
            except Exception:
                jam_str = ""

        amount = float(r["ZAMOUNT"] or 0)
        
        do_type = str(r["ZDO_TYPE"])
        if do_type == "0":
            type_str = "Pemasukan"
        elif do_type == "1":
            type_str = "Pengeluaran"
        elif do_type == "2":
            type_str = "Transfer"
        else:
            type_str = "Lainnya"

        asset_name = asset_map.get(str(r["ZASSETUID"]), str(r["ZASSETUID"]) if r["ZASSETUID"] else "Cash")
        to_asset_name = asset_map.get(str(r["ZTOASSETUID"]), "") if r["ZTOASSETUID"] else ""
        cat_name = cat_map.get(str(r["ZCATEGORYUID"]), str(r["ZCATEGORYUID"]) if r["ZCATEGORYUID"] else "Umum")
        
        content = r["ZCONTENT"] or ""
        memo = r["ZMEMO"] or ""

        writer.writerow([
            pk,
            tgl,
            jam_str,
            type_str,
            f"{int(amount)}",
            asset_name,
            to_asset_name,
            cat_name,
            content,
            memo
        ])

print(f"Berhasil memperbarui {len(rows)} data detail transaksi lengkap ke: {output_csv}")
conn.close()
