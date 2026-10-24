# Frezen AI — Cloudflare Workers AI

Frezen AI adalah ruang chat privat yang hanya boleh digunakan akun dengan role **OWNER**. Gateway berada di `/`, chat di `/ai`, dan backend berjalan di Cloudflare Worker. Percakapan hanya berada di memori tab browser; tidak ada tabel atau migrasi D1 baru untuk riwayat chat.

## Mode cloud tanpa laptop/PC

Frezen AI sekarang dapat memanggil **Cloudflare Workers AI** langsung melalui binding `env.AI`. Model awal yang digunakan:

```text
@cf/qwen/qwen2.5-coder-32b-instruct
```

Model tersebut di-host oleh Cloudflare, jadi tidak perlu memasang Ollama, mengunduh bobot model, atau menyalakan komputer pribadi. Worker memanggil binding AI langsung; tidak diperlukan `FREZEN_AI_ENDPOINT` maupun `FREZEN_AI_API_KEY` untuk mode ini.

Konfigurasi binding ditambahkan untuk root, staging, dan production di `worker/wrangler.toml`. Flag AI tetap nonaktif untuk development dan staging. Flag production diatur aktif, dengan akses chat tetap dibatasi ke Owner oleh handler Frezen.

## Catatan biaya

Workers AI memiliki alokasi gratis harian yang tercantum pada halaman harga Cloudflare. Pemakaian di atas alokasi dapat memerlukan paket Workers berbayar dan menimbulkan biaya, tergantung akun dan model. Periksa pemakaian di dashboard Workers AI sebelum penggunaan intensif.

- Harga resmi: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Katalog model: https://developers.cloudflare.com/workers-ai/models/qwen2.5-coder-32b-instruct/
- Dokumen binding: https://developers.cloudflare.com/workers-ai/configuration/bindings/

## Keamanan dan batas

- Halaman chat dan endpoint status/chat memeriksa sesi privat dan role **OWNER**.
- Endpoint chat memeriksa origin, membatasi ukuran body dan pesan, serta menolak role pesan yang tidak didukung.
- Model tidak dijalankan dalam proses Worker biasa; inferensi dilakukan oleh layanan Workers AI.
- Pesan percakapan tidak disimpan di D1.
- Jangan menambahkan credential Cloudflare ke GitHub, HTML, atau chat.
- Output AI harus ditinjau sebelum menjalankan kode atau mengubah produksi.

## Endpoint eksternal opsional

Frezen masih mendukung endpoint lain yang kompatibel dengan OpenAI Chat Completions jika binding Workers AI tidak dipakai. Untuk jalur tersebut, atur secret `FREZEN_AI_ENDPOINT` dan `FREZEN_AI_API_KEY` pada environment target, lalu sesuaikan `FREZEN_AI_MODEL`. Endpoint produksi wajib memakai HTTPS.

## Deploy

PR ini menyiapkan kode dan konfigurasi Wrangler, tetapi tidak mengubah akun Cloudflare dari GitHub. Sesudah perubahan masuk ke branch produksi dan berhasil dideploy, buka `https://frezen.my.id/`, login sebagai Owner, lalu masuk ke Frezen AI. Status backend dapat diperiksa dari `/api/v1/ai/status` setelah login Owner.

Jika deployment dilakukan manual, jalankan dari direktori `worker` dengan proses rilis Frezen yang biasa digunakan. Jangan deploy dari root tanpa environment yang benar. Tidak ada perubahan pada D1, migrasi, rahasia utama, maupun alur autentikasi.
