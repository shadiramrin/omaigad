# 🍽️ Mari Order - Sistem Skrin Tempahan Makanan Layan Diri & CMS Admin

Sistem skrin tempahan makanan layan diri (Self-Service Kiosk) moden lengkap dengan Panel Pentadbir CMS (Kitchen & Store Management) menggunakan **Node.js**, **HTML/CSS/JavaScript tulen (Vanilla)**, **Cloudflare Workers**, dan **Cloudflare D1**.

---

## 🌟 Ciri-ciri Utama

### 1. Skrin Tempahan Kiosk (`/`)
- **Navigasi Kategori & Menu**: Paparan kategori aktif dan kad menu interaktif dengan sokongan **fallback emoji** automatik jika gambar gagal dimuat.
- **Troli Pesanan**: Tambah/kurang kuantiti, nota khas untuk dapur, dan penunjuk jumlah bayaran masa nyata.
- **Pilihan Jenis Pesanan**: Pilihan jelas antara **Makan Sini (Dine-in)** atau **Bungkus (Takeaway)**.
- **Status Operasi Kedai**: Amaran dan sekatan checkout automatik jika kedai ditutup oleh admin.
- **Nombor Giliran & Penjejak Langsung**: Penjanaan nombor giliran berjujukan (cth: `A-001`) daripada `orderId`, modal pengesahan, dan penunjuk status langsung (Baru ➔ Sedang Disediakan ➔ Selesai) lengkap dengan notifikasi bunyi chime.

### 2. Panel CMS Pentadbir (`/admin.html`)
- **Kawalan Keselamatan**: Log masuk dilindungi pembolehubah `ADMIN_PASSWORD`. Memulangkan **HTTP 503** jika kata laluan belum dikonfigurasikan di Cloudflare.
- **Papan Pesanan Dapur**: Paparan kad pesanan secara langsung (polling automatik setiap 4 saat), penapis status, butang kemaskini status dapur (Mula Sedia / Selesai / Batal), dan amaran audio pesanan baru.
- **Pengurusan Item Menu**: Tambah, edit, padam, dan fungsi **Salin (Duplicate)** menu dengan pantas.
- **Tukar Harga Cepat & Suis Aktif**: Tukar harga terus dari jadual dan togol aktif/nyahaktif serta-merta.
- **Pengurusan Kategori**: Sekatan pemadaman kategori dengan **HTTP 409 Conflict** jika kategori masih mempunyai item menu yang berpaut.
- **Tetapan Kedai**: Ubah nama kedai, pengumuman teks banner, dan togol Buka/Tutup kedai.

---

## 🔒 Pematuhan Peraturan D1 & Keselamatan

1. **Auto-Setup & Cache `dbReady`**:
   Fungsi `ensureDb(env)` mencipta struktur jadual (settings, categories, items, orders, order_items, images) dan memasukkan tetapan lalai serta **15 hidangan menu contoh Malaysia**. Pelaksanaan di-cache menggunakan flag `dbReady = true` supaya `CREATE TABLE` tidak diulang pada setiap request.
2. **Pengesahan & Pengiraan Server**:
   Endpoint `POST /api/orders` menyemak status kedai dibuka dan mengira jumlah harga daripada harga terkini di pangkalan data D1 (tidak mempercayai harga dari client). Item pesanan disimpan serentak menggunakan `env.DB.batch()`, dan nombor giliran dijana secara berjujukan daripada `orderId` (format `A-001`, tiada nombor rawak).
3. **Mampatan Gambar & Storan D1**:
   Gambar di browser dimampatkan melalui `<canvas>` (maksimum 480px, latar belakang putih `#FFFFFF` untuk mengatasi ketelusan PNG, saiz akhir dijamin `< 95 KB`). Disimpan ke D1 sebagai `ArrayBuffer` (`BLOB`), dan dibaca dalam `GET /api/images/:id` menggunakan `Uint8Array.from(row.data || [])` untuk mengelakkan isu imej rosak.

---

## 🗄️ Konfigurasi Cloudflare D1 & Worker

Fail `wrangler.toml` telah siap dikonfigurasikan:
- **Binding**: `DB`
- **Database Name**: `mari-order-db`
- **Database ID**: `6ec50943-142f-4711-871b-fe01d8f9d2a4`
- **Assets**: `./public`

---

## 🚀 Panduan Sambungan ke GitHub & Auto-Deploy

### Langkah 1: Sambung & Push ke GitHub

Jika anda mempunyai akaun GitHub:

```bash
# Inisialisasi repo tempatan
git init
git add .
git commit -m "feat: Inisialisasi sistem Mari Order Kiosk & CMS"

# Tambah remote GitHub anda (Gantikan URL di bawah dengan repository anda)
git remote add origin https://github.com/USERNAME/mari-order.git
git branch -M main
git push -u origin main
```

### Langkah 2: Konfigurasi GitHub Secrets untuk Auto-Deploy

Dalam repositori GitHub anda, pergi ke **Settings** > **Secrets and variables** > **Actions** > **New repository secret**, dan tambah:

1. `CLOUDFLARE_API_TOKEN`: Token API Cloudflare anda (dengan kebenaran Cloudflare Workers & D1).
2. `CLOUDFLARE_ACCOUNT_ID`: Cloudflare Account ID anda.

Setiap kali anda melakukan `git push` ke branch `main`, GitHub Actions (`.github/workflows/deploy.yml`) akan membina dan mengemaskini worker anda ke Cloudflare secara automatik.

### Langkah 3: Tetapkan `ADMIN_PASSWORD` di Cloudflare

Untuk mengelakkan ralat 503 semasa log masuk ke CMS:
1. Pergi ke **Cloudflare Dashboard** > **Workers & Pages** > Pilih **mari-order**.
2. Pergi ke **Settings** > **Variables and Secrets**.
3. Tambah Secret baru:
   - Nama: `ADMIN_PASSWORD`
   - Nilai: Kata laluan pilihan anda (cth: `RahsiaAdmin2026`)
4. Klik **Deploy** atau **Save**.

---

## 💻 Pembangunan Tempatan (Local Development)

```bash
# Jalankan secara tempatan dengan Wrangler
npx wrangler dev
```
- **Skrin Kiosk Pelanggan**: `http://localhost:8787/`
- **Panel Pentadbir CMS**: `http://localhost:8787/admin.html`
