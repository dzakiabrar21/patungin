# PatungIn — Split Bill & Finance Tracker

**Subtitle:** Web App (PWA) untuk patungan dari foto struk dan pencatatan keuangan pribadi, terhubung dengan WhatsApp Bot & Gemini AI

**Kategori:** Web App / Fintech
**Stack:** Node.js · Express · SQLite · Gemini API · Baileys (WhatsApp)

**Tombol:** GitHub → https://github.com/dzakiabrar21/patungin · Live Demo → *(isi dengan URL deploy kamu)*

**Judul halaman (SEO):** PatungIn — Split Bill & Finance Tracker (Node.js, Gemini AI) – Muhammad Dzaki Abrar
**Meta description:** Aplikasi web untuk membagi tagihan dari foto struk secara proporsional dan mencatat keuangan pribadi lewat web atau WhatsApp, dengan bantuan Gemini AI.

---

## 01 Overview

PatungIn adalah aplikasi web mobile-first (PWA) dengan dua fungsi utama. Yang pertama adalah **split bill**: foto struk restoran dibaca oleh Gemini Vision, lalu tagihan dibagi secara proporsional sesuai pesanan tiap orang. Yang kedua adalah **finance tracker** pribadi: saldo banyak dompet, pencatatan transaksi, dan analitik pengeluaran. Keduanya memakai satu backend Express dan database SQLite yang sama. Transaksi bisa dicatat dari web, dari chat WhatsApp (teks, voice note, atau foto struk), maupun dari pintasan iPhone.

## 02 Introduction & Problem

Setelah makan bersama, membagi tagihan sering jadi tidak adil. Biasanya total dibagi rata, padahal pesanan tiap orang berbeda, dan pajak serta service charge jarang dihitung sesuai porsi. Di sisi lain, mencatat pengeluaran harian sering terlewat karena harus membuka aplikasi dan mengisi form satu per satu.

PatungIn menjawab dua masalah itu sekaligus:
- Struk cukup difoto. AI membaca item, harga, pajak, dan diskon, lalu pajak dan service dibagi proporsional dengan konsumsi masing-masing.
- Pencatatan keuangan bisa dilakukan dari tempat yang paling sering dibuka, yaitu chat WhatsApp, dan hasilnya langsung tampil di dashboard web.

## 03 Tools & Technologies

**Node.js & Express** — *Backend & REST API*
Satu server untuk API split bill, keuangan, sesi patungan, import mutasi, dan integrasi Google Sheets.

**SQLite (better-sqlite3)** — *Database*
Tabel dompet, kategori, transaksi, dan pengaturan. Saldo diperbarui di dalam transaksi database, dan agregasi bulanan (per kategori, harian, tren 6 bulan) dihitung langsung dengan SQL.

**Gemini API** — *Multimodal AI*
Membaca foto struk (vision), voice note (audio), dan kalimat bebas seperti "makan siang padang 35rb bca" menjadi data transaksi terstruktur. Parser regex cepat dipakai lebih dulu, dan AI menjadi jalur cadangan.

**Baileys** — *WhatsApp Bot*
Bot pribadi untuk mencatat transaksi, melihat rekap (`/saldo`, `/hariini`, `/bulanini`), membatalkan catatan terakhir, dan memulai split bill di grup lewat `/hitungin`.

**Vanilla JS, CSS & PWA** — *Frontend*
Tanpa framework. Finance tracker memakai design system dari aplikasi Android Stash (token warna, Plus Jakarta Sans, ikon Material Rounded), bisa dipasang ke home screen, dan memiliki service worker untuk cache offline.

## 04 Key Features & Architecture

**1. Split Bill Proporsional dalam 4 Langkah**
Upload struk → cek hasil AI (item, PB1, service, diskon) → tentukan siapa memesan apa dan siapa yang menalangi → rincian akhir per orang yang siap dikirim ke grup WhatsApp. Pajak dan service dibagi sesuai porsi konsumsi, bukan dibagi rata.

**2. Satu Data, Banyak Pintu Masuk**
Web, WhatsApp, pintasan iPhone (Siri / Action Button), import mutasi bank, dan scan struk semuanya menulis ke service yang sama (`financeService`). Karena itu saldo dan riwayat selalu konsisten di semua kanal.

**3. Finance Tracker dengan Design System Stash**
Beranda dengan kartu total saldo, aksi cepat (Catat, Scan struk, Transfer), dan transaksi yang dikelompokkan per hari. Form catat memakai numpad kalkulator (`+ − × ÷`, `000`). Halaman Dompet menampilkan riwayat per dompet, Analitik berisi donut chart per kategori dan tren 6 bulan, dan tampilan responsif memakai bottom nav di HP serta sidebar di desktop.

**4. AI yang Hemat & Terkendali**
Teks dicoba dengan regex dulu (mis. `+50rb gaji`, `kopi 18k gopay`). Gemini hanya dipanggil untuk input yang ambigu, gambar, atau suara. Bot juga menyaring pesan non-keuangan supaya obrolan biasa tidak tercatat sebagai transaksi, dan setiap catatan bisa dibatalkan dalam 30 menit.

**5. Integrasi Data**
Sinkronisasi real-time ke Google Spreadsheet lewat Apps Script (lengkap dengan tab dashboard otomatis), import mutasi bank dari teks atau CSV dengan pratinjau sebelum disimpan, serta ekspor CSV per bulan.

## 05 Results & Impact

| Nilai | Label | Keterangan |
|---|---|---|
| **3** | Kanal Input | Web, WhatsApp (teks / suara / foto), dan pintasan iPhone |
| **4** | Langkah Split Bill | Dari foto struk sampai rincian per orang |
| **105** | Commit | Dikembangkan bertahap sejak September 2026 |

*(Opsional sebagai metrik keempat: **PWA** — bisa dipasang ke home screen Android & iOS.)*

## 06 Project Gallery

Urutan gambar yang disarankan (berkas di `docs/portfolio/`):

1. `01-cover.png` — Cover aplikasi
2. `02-fitur-utama.png` — Fitur utama
3. `03-split-bill.png` — Alur split bill 4 langkah
4. `04-bot-whatsapp.png` — Catat lewat WhatsApp bot
5. `05-finance-tracker.png` — Dompet & catat cepat
6. `06-analitik-responsif.png` — Analitik, tampilan HP & desktop
7. `07-arsitektur.png` — Arsitektur & teknologi

Screenshot mentah (1080×2400 untuk HP, 2880×1800 untuk desktop) ada di `docs/portfolio/screens/`. Semua gambar memakai **data demo fiktif**, bukan data keuangan asli.

---

## Bagian tambahan (opsional): Challenges & Lessons

- **Membagi pajak secara adil.** Pajak dan service charge dihitung per orang berdasarkan subtotal konsumsinya. Diskon dan pembulatan juga perlu ditangani supaya total per orang tetap sama dengan grand total struk.
- **Bot yang tidak terlalu agresif.** Versi awal sering mencatat obrolan biasa atau hitungan matematika sebagai transaksi. Masalah ini diatasi dengan deteksi niat keuangan yang lebih ketat, prefix cepat `+/-`, dan perintah `batal`.
- **Model AI yang terus berganti.** Nama model Gemini beberapa kali berubah atau dinonaktifkan, sehingga dibuat daftar model kandidat dengan fallback otomatis.
- **Konsistensi desain lintas platform.** Tampilan finance tracker disamakan dengan aplikasi Android Stash: token warna, font yang di-bundle, dan komponen yang sama (hero card, numpad, chip kategori, bottom sheet). Hasilnya, kedua produk terasa seperti satu keluarga.

## Versi singkat (untuk caption LinkedIn)

> PatungIn: aplikasi web untuk patungan dan mencatat keuangan. Foto struk, Gemini AI membaca item dan pajaknya, lalu tagihan dibagi proporsional ke tiap teman. Transaksi pribadi bisa dicatat lewat web atau langsung dari chat WhatsApp (teks, voice note, atau foto struk). Dibangun dengan Node.js, Express, SQLite, Gemini API, dan Baileys, dengan tampilan yang mengikuti design system aplikasi Stash.

## Get In Touch

Tertarik berdiskusi tentang PatungIn atau proyek web lainnya? Hubungi saya lewat email, LinkedIn, atau GitHub.
