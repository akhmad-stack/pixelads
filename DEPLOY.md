# PixelAds — build disesuaikan dengan Supabase kamu

Stack: HTML/CSS/JS, Node.js + Express, Supabase database/storage, Midtrans Snap.

## 1. Penyesuaian database yang sudah dibuat
Di Supabase project PixelAds → SQL Editor → New query, buka file `schema.sql`, salin seluruh isinya, lalu Run satu kali. Ini menambahkan kolom yang dibutuhkan pada tabel `ads` yang sudah ada dan tidak menghapus 48 slot di `ad_slots`.

## 2. Storage
Build ini mengharapkan nama bucket persis `ad.images` (sesuai yang kamu bilang kamu buat). Pastikan bucket itu bertipe Public agar gambar iklan yang sudah disetujui bisa dilihat pengunjung. Server mengunggah gambar memakai service-role key; key tersebut tidak boleh ditaruh di browser atau dikirim ke orang lain.

## 3. Konfigurasi server
Salin `.env.example` menjadi `.env`, lalu isi `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MIDTRANS_SERVER_KEY`, dan `MIDTRANS_CLIENT_KEY`. Gunakan kredensial Sandbox Midtrans untuk tes terlebih dahulu. Jangan pernah menaruh service-role key atau server key di file `public/`.

## 4. Jalankan
Node.js 20+ disarankan.

```sh
npm install
npm start
```

## 5. Midtrans webhook
Set Notification URL di dashboard Midtrans menjadi `https://DOMAIN-KAMU/api/midtrans/notification`. `PUBLIC_BASE_URL` harus berupa alamat website yang benar-benar dapat diakses. Pembayaran sandbox harus diuji sebelum produksi.

## Penting
File ini sudah mengunggah gambar ke bucket `ad.images`, menyimpan pesanan pending, dan hanya menampilkan iklan dengan status `paid`. Website belum menjadi live sampai dideploy ke hosting dan environment variables diisi. Sebelum menerima publik, tambahkan rate limiting/CAPTCHA, moderation/admin login, batasan konten, serta kebijakan retensi gambar.
