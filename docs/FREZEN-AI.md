# Frezen AI — Setup dan keamanan

Frezen AI adalah ruang chat pribadi yang ditujukan untuk akun dengan role **OWNER**. Halaman gerbang berada di **/**, chat berada di **/ai**, dan backend menggunakan endpoint API di Worker. Pesan percakapan aktif hanya berada di memori tab browser; tidak ada tabel D1 baru untuk riwayat chat.

## Arsitektur

Cloudflare Worker tidak menjalankan bobot model 7B atau 27B secara langsung. Worker memvalidasi sesi Owner, memvalidasi batas ukuran pesan, lalu meneruskan percakapan ke endpoint yang kompatibel dengan OpenAI Chat Completions. Endpoint harus diisi melalui konfigurasi server, bukan dari browser.

Konfigurasi yang dibaca Worker:

- **FREZEN_AI_ENABLED**: harus bernilai **true** agar chat aktif. Nilai default di worker/wrangler.toml adalah **false**.
- **FREZEN_AI_MODEL**: nama model; default awal **qwen2.5-coder:7b**.
- **FREZEN_AI_ENDPOINT**: URL lengkap endpoint chat seperti **https://ai.example.com/v1/chat/completions**.
- **FREZEN_AI_API_KEY**: bearer token untuk endpoint/proxy. Gunakan secret acak yang kuat dan jangan masukkan nilainya ke GitHub, HTML, atau chat.

Endpoint produksi wajib memakai HTTPS. Endpoint AI hanya bisa dipanggil dari API Frezen setelah sesi valid dan role OWNER diperiksa. Handler juga memeriksa origin mutasi, membatasi ukuran body dan riwayat, serta memberi timeout upstream 60 detik.

## Memilih model

### Pilihan ringan untuk mulai

Qwen2.5-Coder 7B tersedia melalui Ollama dengan kuantisasi Q4_K_M sekitar 4,7 GB. Ini lebih realistis untuk mulai diuji pada komputer dengan RAM yang cukup dibanding model 27B.

1. Instal Ollama dari situs resminya: https://ollama.com/download
2. Unduh dan jalankan model:

        ollama run qwen2.5-coder:7b

3. Untuk pengembangan lokal, endpoint OpenAI-compatible Ollama adalah:

        http://127.0.0.1:11434/v1/chat/completions

Endpoint HTTP loopback hanya diperbolehkan di lingkungan non-produksi. FREZEN_AI_API_KEY tetap harus diberi nilai dengan panjang minimal 16 karakter; Ollama lokal standar tidak memvalidasi bearer token tersebut. Jangan menganggap konfigurasi lokal ini aman untuk internet.

Model dan sumber:
- Ollama model page: https://ollama.com/library/qwen2.5-coder
- Official Qwen repository: https://github.com/QwenLM/Qwen2.5-Coder
- Model card/listing menjelaskan lisensi Apache 2.0.

### Model lebih besar untuk server yang memadai

Qwen3.6-27B juga dirilis di bawah Apache 2.0. Versi Ollama Q4 berada kira-kira pada kisaran 18–19 GB, jadi rencanakan RAM/VRAM dan ruang disk yang memadai sebelum mengunduhnya.

- Official Qwen GitHub: https://github.com/AlibabaCloud-Official/Qwen3.6
- Model di Ollama: https://ollama.com/library/qwen3.6
- Official model card: https://huggingface.co/Qwen/Qwen3.6-27B

Jangan menganggap klaim perbandingan dengan model komersial sebagai jaminan. Uji model pada tugas Frezen yang nyata sebelum memilihnya.

### Catatan model lain

- DeepSeek Coder dan DeepSeek-V3 adalah lini yang berbeda; jangan menganggap "DeepSeek Coder V3" sebagai nama rilis model tunggal yang setara dengan keduanya. Repo DeepSeek Coder: https://github.com/deepseek-ai/DeepSeek-Coder
- Llama 3.3 70B menggunakan lisensi Meta Llama, bukan Apache 2.0, dan ukuran lokalnya jauh lebih besar.
- Periksa halaman lisensi/model card masing-masing model sebelum pemakaian atau redistribusi.

## Pengembangan lokal di Windows

Jalankan Ollama dan model pada komputer pengembangan. Buat file lokal worker/.dev.vars (jangan commit file ini):

        FREZEN_AI_ENDPOINT=http://127.0.0.1:11434/v1/chat/completions
        FREZEN_AI_API_KEY=local-development-placeholder-token-123

Ubah FREZEN_AI_ENABLED menjadi true di konfigurasi lingkungan development yang sedang dipakai, lalu jalankan Worker lokal. Jika FREZEN_ENV bernilai production, endpoint HTTP loopback akan ditolak.

## Staging dan produksi

Jangan expose port Ollama tanpa perlindungan. Worker yang berada di Cloudflare tidak dapat memanggil localhost pada laptopmu sendiri. Untuk staging/produksi, jalankan model pada host yang bisa dijangkau melalui HTTPS dan letakkan di belakang reverse proxy atau tunnel privat yang memvalidasi header Authorization: Bearer ... . Jangan mengandalkan autentikasi bawaan Ollama lokal untuk endpoint publik.

Atur secrets hanya di lingkungan target:

        npx wrangler secret put FREZEN_AI_ENDPOINT --env staging
        npx wrangler secret put FREZEN_AI_API_KEY --env staging

Lalu, pada [env.staging.vars] di worker/wrangler.toml, ubah FREZEN_AI_ENABLED menjadi true dan deploy ke staging:

        npx wrangler deploy --env staging

Gunakan /api/v1/ai/status sesudah login Owner untuk memastikan status konfigurasi. Uji chat, timeout, endpoint yang mati, dan akun non-Owner sebelum mempertimbangkan produksi. Untuk production, masukkan secrets dengan --env production, ubah flag produksi ke true hanya setelah staging lolos, kemudian deploy sesuai proses rilis Frezen.

## Batasan saat ini

- Tidak ada streaming token; jawaban diterima setelah model selesai.
- Riwayat chat tidak disimpan ke D1 atau server.
- Worker hanya proxy ke OpenAI-compatible endpoint; model tidak ikut terpasang ke Cloudflare Worker.
- API key dan URL endpoint tidak pernah dikirim ke browser.
- Tetap verifikasi output model sebelum menjalankan kode atau melakukan perubahan produksi.
