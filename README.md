# BagiPromo - Kalkulator Patungan Diskon Makanan

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Framework: Alpine.js](https://img.shields.io/badge/Alpine.js-3.14-8bc0d0.svg)](https://alpinejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.x-38bdf8.svg)](https://tailwindcss.com/)
[![OCR: Tesseract.js](https://img.shields.io/badge/OCR-Tesseract.js-5c6ac4.svg)](https://tesseract.projectnaptha.com/)

Aplikasi web mobile-first (~15 kB JS) untuk menghitung pembagian patungan diskon makanan secara proporsional saat memesan bersama di GoFood, GrabFood, atau ShopeeFood. Dilengkapi pemindai struk (OCR) langsung di browser tanpa server pemrosesan tambahan.

---

## Fitur

### 1. Pindai Struk (Client-Side OCR)
- **Kamera Langsung**: Di smartphone, langsung membuka kamera belakang (`capture="environment"`).
- **Galeri & Berkas**: Mendukung unggahan foto struk fisik atau tangkapan layar (screenshot) aplikasi delivery.
- **Ekstraksi Data**: Mengurai teks struk untuk mendeteksi Subtotal, Total Akhir, dan daftar menu makanan.
- **Verifikasi Sebelum Diterapkan**: Modal peninjauan hasil pembacaan struk dengan input masking Rupiah real-time.
- **Gratis & Lokal**: Menggunakan Tesseract.js yang diproses 100% di browser pengguna tanpa pengiriman berkas ke server eksternal.

### 2. Perhitungan Proporsional
- **Diskon Proporsional**: Diskon dihitung berdasarkan persentase nominal belanja tiap orang, bukan dibagi rata (split equal).
- **Auto-Fill Nilai Struk**: Tombol untuk menyamakan total struk dengan akumulasi nominal menu.
- **Koreksi Pembulatan (Pas-kan)**: Menyesuaikan selisih pembulatan (Rp 1 – Rp 5) ke item pertama agar total bagi hasil tepat sama dengan total bayar.
- **Indikator Hemat**: Menampilkan persentase diskon efektif dan nominal yang dihemat.

### 3. Antarmuka & UX
- **Input Masking Rupiah**: Pemisah ribuan titik otomatis saat mengetik (`Rp 66.000`) dengan keyboard `numeric` di perangkat mobile.
- **Reset Terarah**: Mengosongkan data kalkulasi tanpa menghapus teks rekening/info pembayaran.
- **Penyimpanan Lokal**: Data tersimpan otomatis di `localStorage` peramban.
- **Sticky Bar**: Rangkuman total dan tombol aksi tetap terlihat di bagian bawah layar smartphone.

### 4. Ekspor & Pembagian
- **Teks WhatsApp**: Format pesan teks terstruktur per orang beserta rincian rekening tujuan transfer.
- **Ekspor Gambar**: Mengonversi rincian patungan menjadi gambar struk (.png) via `html2canvas`.

---

## Teknologi

| Komponen | Pilihan | Keterangan |
|---|---|---|
| **Logic** | [Alpine.js 3.x](https://alpinejs.dev/) | Reaktif, deklaratif, tanpa build step |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) | Utilitas CSS responsif |
| **OCR Engine** | [Tesseract.js](https://tesseract.projectnaptha.com/) | Multi-bahasa (`ind+eng`), WebAssembly |
| **Receipt Export** | [html2canvas](https://html2canvas.hertzen.com/) | Render elemen DOM ke kanvas gambar |
| **Interaksi** | Canvas Confetti | Notifikasi visual |

---

## SEO & Metadata

- **Metadata**: Title, description, keywords, dan canonical URL terstruktur.
- **Open Graph & Twitter Cards**: Pratinjau tautan untuk WhatsApp, Telegram, dan media sosial.
- **Schema.org (JSON-LD)**: Format terstruktur `WebApplication` tipe `FinanceApplication`.

---

## Menjalankan dengan Docker

### 1. Docker Compose
```bash
docker compose up -d --build
```
Port default: `8080` (dapat disesuaikan via variabel `PORT`).

### 2. Docker CLI
```bash
# Build image Nginx
docker build -t bagi-promo .

# Jalankan container
docker run -d --name bagi-promo-app -p 80:80 --restart unless-stopped bagi-promo
```

### 3. Log Container
```bash
docker logs -f bagi-promo-app
```

---

## Menjalankan Lokal

Jalankan HTTP server sederhana dari direktori proyek:

```bash
# Python 3
python3 -m http.server 3000

# Atau npx
npx serve .
```

Akses melalui `http://localhost:3000`.

---

## Kredit & Atribusi
Proyek ini dikembangkan dari ide dan basis awal [armnugraha/calculator-discount-gojek](https://github.com/armnugraha/calculator-discount-gojek) dengan refaktorisasi arsitektur ke Alpine.js, penambahan modul OCR pemindai struk lokal, koreksi pembulatan otomatis, dan optimasi mobile.

## Lisensi
[MIT](LICENSE)
