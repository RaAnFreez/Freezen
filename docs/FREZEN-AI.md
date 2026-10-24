# Frezen AI — Cloudflare Workers AI

Frezen AI adalah ruang chat privat yang hanya boleh digunakan akun dengan role **OWNER**. Gateway berada di `/`, chat di `/ai`, dan backend berjalan di Cloudflare Worker.

## Model cloud

Untuk chat biasa dan coding, Frezen memakai `@cf/qwen/qwen2.5-coder-32b-instruct`. Jika pesan memuat gambar, backend menggunakan model vision `@cf/qwen/qwen3.8-27b`, yang mendukung input gambar dan konteks panjang. Keduanya dijalankan di Cloudflare Workers AI sehingga tidak perlu memasang Ollama atau menyalakan PC.

- Model coding: https://developers.cloudflare.com/workers-ai/models/qwen2.5-coder-32b-instruct/
- Model multimodal/vision: https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/
- Harga dan kuota: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Batas layanan: https://developers.cloudflare.com/workers-ai/platform/limits/

## Lampiran

Halaman chat mendukung:
- Gambar/foto JPG, PNG, dan WebP. Gambar diubah ke JPEG dan dikompres di browser sebelum dikirim ke model vision.
- File teks/source code seperti Lua, JavaScript/TypeScript, HTML/CSS, JSON, Python, SQL, Markdown, YAML, TOML, dan format teks sejenis. Isi file dimasukkan ke konteks percakapan sebagai code block.

Batas aplikasi saat ini adalah maksimum 4 lampiran dalam satu pesan, hingga 3 gambar per permintaan AI, foto asli sampai 8 MB sebelum kompresi, dan total isi file teks 55.000 karakter per pesan. File biner, PDF, dan dokumen Office belum diproses sebagai isi dokumen pada versi ini. Batas ini dibuat untuk menghindari payload terlalu besar dan error model; batas provider, konteks model, ukuran request, dan kuota tetap berlaku.

## Riwayat percakapan

Riwayat disimpan di **IndexedDB pada browser yang sedang digunakan**, termasuk percakapan, jawaban, dan data gambar terkompresi. Sesudah refresh, chat dapat dimuat kembali. Sidebar menampilkan hingga 15 percakapan terbaru.

Penyimpanan ini bersifat lokal: riwayat tidak tersinkron antar perangkat atau browser, tidak ditulis ke D1, dan dapat hilang jika data situs/browser dibersihkan atau pengguna membuka sesi privat. Jika IndexedDB tidak tersedia, aplikasi mencoba fallback localStorage; pada fallback ini data gambar tidak dijamin tersimpan.

## Batas dan biaya

Tidak ada cara realistis untuk membuat model hosted benar-benar tanpa batas. Konteks model, batas ukuran input, kuota/rate limit layanan, waktu respons, dan biaya tetap berlaku. Aplikasi meningkatkan batas teks/output dibanding versi awal, tetapi tidak menerima input atau menghasilkan output tak terbatas. Workers AI memiliki alokasi gratis harian dan pemakaian di atas batas dapat menimbulkan biaya sesuai akun/model; pantau dashboard sebelum penggunaan intensif.

## Keamanan

- Halaman chat dan endpoint status/chat memeriksa sesi privat dan role **OWNER**.
- Endpoint chat memeriksa origin, membatasi ukuran request, memvalidasi bentuk lampiran gambar, dan membatasi ukuran gambar.
- Isi file/foto dikirim ke penyedia model ketika pengguna mengirim pesan. Jangan lampirkan rahasia, password, API key, atau data sensitif yang tidak perlu.
- Riwayat chat tidak disimpan ke D1 dan tidak dikirim ke GitHub.
- Output AI perlu ditinjau dan diuji sebelum menjalankan kode atau menerapkan perubahan produksi.

## Provider eksternal opsional

Frezen juga mendukung endpoint yang kompatibel dengan OpenAI Chat Completions jika binding Workers AI tidak digunakan. Atur secret `FREZEN_AI_ENDPOINT` dan `FREZEN_AI_API_KEY` pada environment target. Jika ingin menggunakan gambar melalui provider lain, endpoint dan model yang dipilih harus benar-benar mendukung konten gambar.

## Deploy

Perubahan kode dan konfigurasi perlu masuk ke branch produksi dan berhasil dideploy melalui proses rilis Frezen. Pastikan `/api/v1/ai/status` menampilkan `configured: true` setelah login Owner. Tidak ada migrasi atau perubahan schema D1 untuk fitur lampiran dan riwayat lokal ini.
