# Status implementasi dan bukti validasi

Tanggal: **17 November 2026**. Target: **Docker localhost**, sesuai pilihan pengguna. Palet V62 dan logo SDD tetap dipertahankan.

| Roadmap | Status teknis | Bukti / batas |
|---|---|---|
| Fase 1 — Core Platform | Terimplementasi | Authentication/RBAC, administrasi akun, master/anggota/arsip proyek, PostgreSQL, WBS, dependency/lag/aktivitas kritis, timeline dan baseline; tes API dan browser lulus. |
| Fase 2 — Monitoring & Reporting | Terimplementasi | Laporan mingguan, progres/issues, Corporate Meeting, carry-forward, finalisasi terkunci, Summary & Memo, PM Assignment, Risk Register, MOM, ekspor Word/Excel dan cetak/PDF. |
| Fase 3 — Document Management & OCR | Terimplementasi dan diuji dengan fixture sintetis | Upload/private original/versioning, worker PaddleOCR, klasifikasi, kandidat field/bukti sumber, verifikasi manual, pencarian dan retry. Scan perusahaan belum tersedia. |
| Fase 4 — Hardening & deployment lokal | Pemeriksaan teknis lokal selesai; penerimaan bisnis menunggu pengguna | Integration/browser/security checks, pengurangan dependensi runtime, Docker lokal, uji beban, backup terenkripsi dan restore drill. UAT bisnis belum ditandatangani; belum ada deployment server eksternal. |

## Pemeriksaan yang dijalankan

| Pemeriksaan | Hasil |
|---|---|
| Typecheck frontend/backend | Lulus |
| Build produksi Next/Nest dalam Docker | Lulus; runtime Node 26.13.1, non-root, tanpa dependensi pengembangan |
| Backend unit/integration | **30 lulus, 0 gagal, 0 skip**, termasuk tujuh skenario regresi integritas keuangan/dokumen/penutupan, governance, tracker tindakan, health/workload, pembatasan akses asisten, serta request/error/redaksi kredensial OpenAI; database PostgreSQL dengan schema tes terisolasi |
| Launcher/dependency checks | **6 lulus**; instalasi tidak lengkap/versi/integrity tidak sesuai ditolak |
| Python extraction checks | **5 lulus**, termasuk SPK/PKS/invoice/termin, bukti koordinat/confidence dan dokumen tidak dikenali |
| Browser smoke Chrome | Lulus: login/proyek, WBS/dependency/baseline, XLSX round-trip, laporan/issues, ekspor, rapat final, Asisten PMO (menu dan tanya jawab aturan lokal), administrasi, keanggotaan, password wajib ganti, upload/verifikasi/pencarian, mobile dan logout |
| npm audit dependensi produksi | **0 kerentanan tercatat** pada saat pemeriksaan; bukan pentest atau jaminan bebas kerentanan |
| Kontrol akses/security | Viewer dan proyek lain ditolak saat mutasi/akses file; unduhan tanpa sesi 401; Origin asing 403; signature/MIME/path file diperiksa; CSP/nosniff/frame protection tersedia; sesi dicabut saat perubahan password/akses |
| Konflik/versi | Versi unggahan bersamaan konsisten; verifikasi hasil belum siap/revisi lama ditolak; data rapat final dan baseline terlindungi |
| Docker | Database, backend dan frontend healthy; worker berjalan; upload ke worker nyata berhasil |
| Backup-restore drill | Database dan **3 original sintetis** dipulihkan ke project terpisah; seluruh SHA-256 cocok; resource drill dibersihkan |
| Pemulihan deployment | Recovery ke project baru/port 8081 berhasil, API sehat, sesi lama dicabut; project pengujian dibersihkan setelah pemeriksaan |
| Passphrase salah | Restore ditolak; hanya resource drill sementara yang dibersihkan, deployment utama tetap sehat |
| Migrasi data lokal lama | Akun/proyek dipindahkan ke database Docker kosong tanpa mengubah sumber; percobaan impor ulang ditolak agar tidak menimpa data |

## OCR dan performa lokal

Ketiga fixture melewati **HTTP upload → queue PostgreSQL → worker asli → needs_review → verifikasi → pencarian dan download**. Semua original cocok byte demi byte. Kelima kandidat field yang terdeteksi: nomor dokumen, nama proyek, tanggal, pelanggan, dan nilai kontrak. Tidak ada dokumen pelanggan asli yang digunakan.

| Fixture | Status akhir | Durasi alur pada image final |
|---|---|---|
| PDF text layer | verified | 3,4 detik |
| PNG scan | verified | 35,0 detik, termasuk inisialisasi model |
| PDF scan | verified | 11,5 detik |

Inference PDF scan langsung dengan model sudah siap pernah terukur sekitar 6,4 detik. Durasi alur HTTP juga mencakup antrean, polling dan verifikasi; hasil tersebut bukan SLA. Model memakai PP-OCRv6 small dan CPU dua thread dengan MKLDNN dinonaktifkan setelah masalah kompatibilitas ditemukan dan diperbaiki.

Uji endpoint daftar proyek: **100 permintaan, konkurensi 10, 0 kegagalan**, median **8 ms**, p95 **390 ms**, maksimum **394 ms** pada image final. Ini benchmark lokal dengan data kecil, bukan pengujian kapasitas seluruh organisasi atau throughput OCR paralel.

## Artefak

Pembaruan runtime 17 November 2026: salinan pengembangan `localhost:3000` dan image Docker `localhost:8080` sudah disamakan dengan kode terbaru serta migrasi `004`. Menu **Insight → Asisten PMO** dan tanya jawab lokal sudah diuji. Provider kemudian diganti ke OpenAI dan konfigurasi/badge `OpenAI · gpt-6-luna` dikonfirmasi pada kedua runtime. Uji nyata Responses API memakai input sintetis menerima HTTP 429 `credit_balance_exhausted`; keberhasilan jawaban model masih menunggu saldo API. Pengujian port 8080 dilakukan melalui localhost, sehingga akses dari komputer LAN lain tetap belum terverifikasi.

- `%LOCALAPPDATA%\ShockwavePMO\artifacts\production-smoke.json`: hasil OCR terintegrasi dan benchmark HTTP.
- `%LOCALAPPDATA%\ShockwavePMO\artifacts\backup-drill\restore-report.json`: pemulihan database serta 3 original sintetis.
- `%LOCALAPPDATA%\ShockwavePMO\artifacts\recovery-validation.json`: penolakan passphrase salah dan kesehatan API pada deployment hasil recovery.
- `%TEMP%\shockwave-pmo-release-validation\artifacts\backend-validation.log` dan `browser-validation.log`: hasil tes terbaru.
- `%TEMP%\shockwave-pmo-release-validation\artifacts\assistant-backend-validation.log`, `assistant-browser.log`, dan `assistant-live-3000.json`: pemeriksaan 18 tes, browser Asisten PMO, serta tanya jawab pada runtime pengembangan yang dipakai pengguna. Screenshot: `assistant-live-3000.png`.
- `%TEMP%\shockwave-pmo-release-validation\artifacts\lan-smoke.json`: menu/tanya jawab Asisten PMO pada Docker, sesi dan exact Origin; dijalankan dengan `--localhost-only --assistant`. Screenshot: `assistant-live-docker.png`.
- `%TEMP%\shockwave-pmo-release-validation\artifacts\openai-backend-validation.log`, `openai-browser.log`, `openai-live-3000.json`, serta `openai-provider-probe.json`: 22 tes, UI OpenAI dan kuota sintetis, konfigurasi runtime, dan hasil uji API nyata. Kunci API tidak disimpan dalam artefak tersebut. Panduan penggantian kunci: [OPENAI.md](OPENAI.md).
- Folder `artifacts` runtime pengujian juga menyimpan screenshot desktop/mobile, Word, dan workbook hasil uji. Schema tes sementara dibersihkan; dataset `[DEMO]` yang diminta pengguna tetap tersedia pada kedua aplikasi. Panduan: [DEMO.md](DEMO.md).

Artefak backup pengujian memakai kunci sementara; buat backup operasional dengan passphrase milik operator. Akun/proyek lama tetap tersedia pada deployment utama. Pengujian otomatis tidak melakukan penerimaan atas nama pengguna.

## Perbaikan setelah pengisian data demo — 17 November 2026

Uji regresi pada schema terisolasi mereproduksi tujuh kegagalan sebelum perbaikan. Seluruh skenario tersebut lulus sesudah perbaikan:

- Verifikasi OCR memakai validasi termin yang sama dengan formulir keuangan. Total termin yang melampaui kontrak ditolak secara atomik, termasuk dua verifikasi bersamaan; kegagalan tidak menyimpan status verified atau termin parsial.
- Penerapan kontrak dari OCR mengikuti izin admin/manager. Dokumen selain PKS/SPK tidak dapat menerapkan kontrak/termin. Pilihan pada UI mengikuti izin dan kategori tersebut.
- Penurunan nilai kontrak melalui formulir, OCR atau approval change request ditolak bila berada di bawah total termin yang tercatat.
- Referensi aktivitas WBS harus milik proyek tersebut. Dokumen invoice yang ditautkan harus sudah diverifikasi sebagai invoice; pencatatan nomor/dokumen invoice memerlukan tanggal invoice.
- Penghapusan dokumen yang dipakai termin, approval pending/disetujui, atau bukti tindak lanjut ditolak. Pengaitan dan penghapusan memakai penguncian proyek yang sama agar tidak saling mendahului.
- Checklist wajib penutupan tidak dapat dihapus, diduplikasi atau diubah menjadi opsional melalui request browser. Data tersimpan divalidasi lagi ketika diajukan.
- Dua penyimpanan awal checklist dengan versi 0 menghasilkan satu keberhasilan dan satu konflik, sehingga versi dan perubahan pengguna tidak ditimpa diam-diam.

Tampilan laporan juga membuka minggu berjalan yang dibatasi periode proyek, sehingga data demo proyek yang sudah berjalan tidak selalu dibuka pada W0. Browser smoke mencakup alur inti dan ekspor/impor dengan schema tes terisolasi. Artefak tambahan: `integrity-before.log`, `integrity-after.log`, `integrity-backend.log`, `integrity-typecheck-final.log`, `integrity-build.log`, dan `integrity-browser.log` di `%TEMP%\shockwave-pmo-release-validation\artifacts`.

## Batas yang masih berlaku

UAT bisnis dilakukan pengguna memakai [UAT.md](UAT.md). Foto/tanda tangan MOM memerlukan pemeriksaan visual pengguna. Adaptor S3 tersedia tetapi belum diuji ke penyedia eksternal. Kualitas OCR pada scan nyata, tulisan tangan, tabel kompleks, serta stempel belum dibenchmark. HTTPS server, SSO, SIMPRO, alerting perusahaan dan kebijakan retensi memerlukan target/konfigurasi berikutnya; target saat ini tetap localhost. PDF ekspor menggunakan fasilitas cetak browser. Tidak ada klaim pentest independen, sertifikasi keamanan, atau persetujuan go-live perusahaan.
