# BagiPromo - Kalkulator Patungan Diskon Makanan (Gojek / Grab / ShopeeFood)

Aplikasi web mobile-first untuk menghitung pembagian patungan diskon makanan secara proporsional dan adil saat pesan bareng di GoFood, GrabFood, atau ShopeeFood.

## ✨ Fitur Utama
- **Mobile-First & Responsif**: Nyaman diakses di layar smartphone maupun desktop dengan tap target lega.
- **Keyboard Numeric**: Mengaktifkan numpad langsung di HP (`inputmode="numeric"`).
- **Format Rupiah Otomatis**: Pemisah ribuan otomatis saat mengetik.
- **Auto-Fill Struk**: Tombol cepat untuk mengisi "Total Sebelum Diskon" langsung dari akumulasi harga menu.
- **Koreksi Selisih Pembulatan (Pas-kan)**: Fitur 1-klik untuk menyerap selisih pembulatan (Rp 1 - Rp 5) ke salah satu item agar total pas 100%.
- **Bagikan ke WhatsApp**: Menghasilkan format pesan rapi beserta tujuan rekening/e-wallet untuk langsung dikirim ke grup chat.
- **Riwayat Akumulasi**: Melacak total tagihan dan diskon yang pernah dihitung secara otomatis.
- **LocalStorage Auto-Save**: Data tersimpan otomatis dan tidak hilang saat halaman browser direfresh atau tertutup.
- **Data Contoh**: Tombol demo cepat untuk mencoba simulasi.

---

## 🐳 Deployment via Docker (Server)

### 1. Jalankan via Docker Compose (Rekomendasi)
```bash
docker compose up -d --build
```
Aplikasi akan aktif di port `8080` (atau ubah via env `PORT=3000 docker compose up -d`).

### 2. Jalankan via Docker CLI
```bash
# Build image
docker build -t calculator-discount .

# Jalankan container (port 80 host -> port 80 container)
docker run -d --name calculator-discount -p 80:80 --restart unless-stopped calculator-discount
```

### 3. Cek Status Container
```bash
docker ps
# Cek log
docker logs -f calculator-discount-app
```

---

## 💻 Cara Menjalankan Lokal (Tanpa Docker)
Buka file `index.html` langsung di browser, atau jalankan menggunakan live server:

```bash
python3 -m http.server 3000
# atau npx serve .
```
