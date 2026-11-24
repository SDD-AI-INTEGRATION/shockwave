# OpenAI untuk Asisten PMO

Asisten PMO memakai OpenAI Responses API di backend. SDK dikunci pada `openai` **7.57.0** (diperiksa dari registry npm, 17 November 2026). Model default **gpt-6-luna**, sesuai [katalog model resmi](https://developers.openai.com/api/docs/models/gpt-6-luna). Provider Claude sebelumnya telah diganti; kredensial Anthropic tidak digunakan lagi.

## Menyimpan atau mengganti API key

Dari folder sumber proyek, jalankan:

```powershell
.\scripts\configure-openai.ps1 -Restart
```

Masukkan kunci baru pada prompt tersembunyi. Kunci tidak menjadi argumen command line, tidak dicetak, dan tidak disimpan pada kode sumber. Skrip memperbarui `%TEMP%\shockwave-pmo-validation\backend\.env` dan `%LOCALAPPDATA%\ShockwavePMO\.env`, lalu memuat ulang backend Docker serta launcher pengembangan. Database, akun dan dokumen dipertahankan. Opsi `-Restart` digunakan setelah dependensi/image OpenAI terpasang.

Jika kunci pernah dikirim ke chat atau tempat publik, cabut melalui [pengaturan API keys](https://platform.openai.com/settings/organization/api-keys), buat pengganti, dan masukkan melalui prompt lokal tersebut. Jangan mengirim kunci pengganti di chat. File `.env` runtime berisi rahasia dan tidak boleh dibagikan.

Untuk menyimpan tanpa restart, hilangkan `-Restart`. Untuk memilih model lain yang diizinkan akun, gunakan `-Model <model-id>`. `-FromEnvironment` membaca `OPENAI_API_KEY` dari environment untuk otomasi lokal; jangan menaruh nilai kunci di command line atau dokumentasi.

## Konfigurasi

| Variabel | Kegunaan |
|---|---|
| `OPENAI_API_KEY` | Kunci backend. Kosong = aturan lokal. |
| `OPENAI_MODEL` | Default `gpt-6-luna`; pilih model yang tersedia untuk proyek API Anda. |
| `ASSISTANT_AI` | `off` memaksa aturan lokal; `on` memakai OpenAI bila kunci tersedia. |

Buka **Insight → Asisten PMO** pada `http://localhost:3000` atau `http://localhost:8080`, lalu refresh setelah restart. Badge menampilkan provider/model. Setiap jawaban menunjukkan apakah berasal dari OpenAI atau aturan lokal beserta kode proyek sumbernya.

## Data dan perilaku

Akses proyek diperiksa sebelum konteks dibuat. Yang dikirim adalah ringkasan terstruktur dari proyek yang boleh diakses pengguna: progres, health, risiko/issues, laporan, tindak lanjut dan field dokumen terverifikasi. File original tidak diunggah ke OpenAI oleh integrasi ini. Tidak ada tools/function calling atau operasi mengubah proyek dalam permintaan model. Isi dokumen diperlakukan sebagai data, bukan instruksi.

Permintaan memakai endpoint resmi `https://api.openai.com/v1/responses`, `store:false`, reasoning low, maksimal 2.000 output tokens, timeout 30 detik dan tanpa retry otomatis. API key hanya tersedia di backend. `store:false` menonaktifkan penyimpanan state respons; ini bukan klaim Zero Data Retention untuk seluruh layanan. Lihat [kontrol data OpenAI](https://developers.openai.com/api/docs/guides/your-data).

Bila model menolak, hasil kosong/gagal, autentikasi tidak valid, timeout, batas pemakaian atau saldo habis, aplikasi memberikan jawaban lokal dan penjelasan. Error mentah provider tidak dicetak ke log atau browser karena dapat memuat bagian kredensial/input. Jika tidak ada proyek yang dapat diakses, asisten menjawab lokal tanpa memanggil API.

## Saldo API habis

Uji koneksi langsung pada 17 November 2026 menerima **HTTP 429, `credit_balance_exhausted`**. Kode ini berarti organisasi API tidak mempunyai prepaid credits tersisa, sesuai [panduan error OpenAI](https://developers.openai.com/api/docs/guides/error-codes). Integrasi sudah dapat dikonfigurasi, tetapi jawaban model nyata belum dapat diverifikasi sampai saldo tersedia.

Pemilik akun dapat memeriksa dan menambah saldo di [API billing](https://platform.openai.com/settings/organization/billing). Ikuti [panduan prepaid billing](https://help.openai.com/en/articles/8264644-setting-up-and-managing-prepaid-api-billing). Setelah saldo diperbarui, coba lagi dari Asisten PMO; tidak perlu memasang ulang aplikasi. Tidak ada pembelian kredit atau perubahan batas belanja otomatis oleh aplikasi.

## Pengujian

SDK/request, `store:false`, model, refusal, jawaban terpotong/kosong, penanganan kuota dan penyamaran error diuji dengan mock HTTP. Tes backend juga memeriksa pembatasan akses konteks proyek. Tes browser memakai respons AI/kuota sintetis untuk memeriksa label OpenAI dan perpindahan ke jawaban lokal tanpa biaya API. Tes tersebut tidak menggantikan keberhasilan inferensi model sungguhan, yang saat pemeriksaan terhalang saldo.
