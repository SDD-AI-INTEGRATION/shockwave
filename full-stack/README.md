# Shockwave — PMO PT Swadharma Duta Data

Implementasi PMO dengan login, administrasi pengguna, akses berdasarkan role/proyek, portofolio, Corporate Meeting, PM Assignment, Risk Register, WBS, dependency jadwal, laporan/issues, MOM, serta pengelolaan dokumen dan OCR. Fitur dipetakan dari `Fase 1.html` yang diberikan pengguna. Palet Perso SDD V62 tetap dipakai. Logo SDD asli dipasang di UI dan dokumen tanpa perubahan warna atau bentuk.

## Docker lokal — penggunaan utama

```powershell
.\scripts\start-production.ps1
```

Buka **http://localhost:8080**. Backend, frontend, PostgreSQL, dan OCR berjalan di Docker; Node/Python tidak perlu dipasang di host untuk menjalankan aplikasi. Docker Desktop harus aktif. Sumber disalin ke `%LOCALAPPDATA%\ShockwavePMO`; password database dibuat acak dan disimpan di `.env` runtime. Database dan dokumen memakai volume yang persisten. Launcher tidak menghapus data.

Untuk akses teman pada jaringan yang sama, jalankan `./scripts/start-production.ps1 -Lan`; alamat IP host dicetak setelah deployment. Panduan firewall, akun teman, dan pengembalian ke mode lokal tersedia di [docs/LAN.md](docs/LAN.md).

Pada mesin pengembangan ini, akun dan proyek dari database lokal sebelumnya sudah dipindahkan ke deployment Docker: gunakan **email dan password sebelumnya**, lalu login kembali. Data sumber tetap dipertahankan. Instalasi baru tidak memiliki password bawaan; jalankan `./scripts/start-production.ps1 -CreateAdmin` untuk membuat admin dengan kredensial pilihan sendiri. Pengguna berikutnya dikelola melalui menu **Administrasi**. Jangan memakai `-CreateAdmin` untuk email yang sudah terdaftar.

Secara default deployment membuka port web pada loopback `127.0.0.1`. Opsi `-Lan` mengaktifkan HTTP LAN dengan IP privat dan daftar Origin yang eksplisit; `-LocalOnly` memulihkan mode loopback. Panduan operasi, backup, restore, dan penghentian tersedia di [docs/OPERATIONS.md](docs/OPERATIONS.md). Hasil pemeriksaan dan status roadmap ada di [docs/VALIDATION.md](docs/VALIDATION.md), serta skenario penerimaan bisnis di [docs/UAT.md](docs/UAT.md).

## Fitur dari prototype

| Area | Implementasi |
|---|---|
| Login, dashboard, master proyek, pencarian, filter, histori progres | Dipertahankan dari implementasi sebelumnya. |
| Portofolio | Pilar/subpilar, prognosa/realisasi pendapatan, filter pilar/pendapatan, ekspor Excel. Metadata diisi PMO; tidak dibuat dari tebakan nama proyek. |
| Corporate Meeting | Draf, metadata rapat, pencarian, pemilihan proyek, review pending/updated/unchanged, kondisi proyek, kategori pembaruan, tindakan/PIC/target/status, referensi historis, carry-forward tindakan belum selesai, ringkasan dan memo. |
| Finalisasi rapat | Seluruh proyek harus direview; moderator/notulis/peserta wajib. Rapat final terkunci di server dan tidak dapat diedit/dihapus. Detail proyek dan catatan sebelumnya disimpan sebagai snapshot. |
| PM Assignment | Surat penunjukan PM per proyek, nomor/tanggal/tempat, penandatangan, unit/jabatan, klasifikasi Small/Medium/Big, simpan/buka/hapus surat dan pratinjau. |
| Risk Register | Identifikasi, dampak, severity/probability, response plan, PIC, status, prepared by/tanggal, CRUD dan pratinjau. |
| WBS | Activity/subactivity, bobot, urutan, tambah/hapus, validasi bobot total 100%, template Application/Manage Service/Infrastructure. Template tidak memasukkan realisasi dummy. |
| Timeline WBS | Grid mingguan, mulai/durasi, dependency finish-to-start, lag, penyusunan jadwal, deteksi siklus, aktivitas kritis/slack, pola rata/kustom, dan baseline tetap. |
| Laporan | Realisasi kumulatif per minggu dengan carry-forward, rencana/realisasi/deviasi berbobot, catatan, pekerjaan di luar WBS, target minggu berikutnya, kendala/PIC/tindakan/target/status. Penyimpanan operasi memperbarui progres portofolio. |
| Operations Excel | Template kosong, ekspor dan impor workbook Project/WBS/Timeline/Actual/Issues/Reports/Guide. ID dipertahankan saat round-trip. Validasi seluruh workbook sebelum penyimpanan. Impor kosong tidak diterapkan. |
| MOM | Nomor, tanggal, tujuan, waktu/tempat/media, peserta internal/eksternal, hasil lalu/kini, tindak lanjut, batas tanggapan, notulis/pengesah, foto, gambar tanda tangan, simpan/buka/hapus dan pratinjau. |
| Ekspor dokumen | Word, Excel, dan cetak/PDF melalui browser untuk surat, register, MOM, ringkasan/memo; Word dan PDF memakai logo SDD. Tata letak mengikuti aplikasi sekarang, tidak menyalin pixel template Excel lama. |
| Asisten PMO | Menu **Asisten PMO** menjawab pertanyaan lintas proyek ("proyek mana yang berisiko terlambat bulan ini?", "apa blocker proyek BTN?", "ringkas progres minggu ini") hanya dari proyek dan dokumen yang boleh diakses penanya. Tanpa `OPENAI_API_KEY` memakai aturan lokal; dengan kunci memakai OpenAI Responses API (model default `gpt-6-luna`, dapat diubah melalui `OPENAI_MODEL`) dan kembali ke aturan lokal dengan alasan yang jelas bila API gagal atau saldo habis. Asisten tidak mengubah data. Asisten per proyek berbasis aturan tetap tersedia di modul operasional. |
| Approval workflow | Persetujuan berjenjang (PM proyek → PMO/admin) untuk baseline WBS, laporan mingguan, dokumen/BAST terverifikasi, change request, dan penutupan proyek. Pengaju tidak dapat menyetujui sendiri, satu orang tidak memutuskan dua tahap, penolakan wajib beralasan; semua keputusan, waktu, dan catatan tersimpan. |
| Early warning & notifikasi | Job backend (default tiap 60 menit, `EARLY_WARNING_INTERVAL_MINUTES`) mendeteksi keterlambatan, deviasi rencana/realisasi, deadline ≤ 30 hari, aktivitas WBS jatuh tempo ≤ 2 minggu, laporan > 14 hari tidak diperbarui, BAST/termin/invoice tertunda, risiko tinggi, tindak lanjut terlambat, dan persetujuan > 7 hari. Notifikasi di lonceng topbar (maksimal sekali per minggu per peringatan); peringatan merah opsional ke Microsoft Teams melalui `TEAMS_WEBHOOK_URL`. Email belum dikirim karena SMTP belum dikonfigurasi. |
| Portfolio Health | RAG otomatis per proyek dari aturan early warning, ringkasan merah/kuning/hijau, keterlambatan, nilai kontrak/ditagih/dibayar/outstanding, risiko, tindak lanjut, dokumen, dan persetujuan menunggu. Panel peringatan dini juga tampil di Dashboard. |
| Action Items | Tindakan dari review Corporate Meeting (saat finalisasi) dan MOM (saat disimpan) masuk ke tracker terpusat dengan PIC, target, status, dan bukti penyelesaian (catatan atau dokumen proyek). Status selesai wajib berbukti; tindakan selesai/dibatalkan di tracker tidak dibawa ke rapat berikutnya. |
| Keuangan & termin | Nomor/nilai kontrak, termin (persen/nilai, jatuh tempo, tautan aktivitas WBS), BAST wajib sebelum invoice, invoice, pembayaran, outstanding. Realisasi pendapatan proyek = total pembayaran. Nilai kontrak yang sudah ditetapkan hanya diubah admin atau change request. |
| Change request & baseline | CR scope/timeline/biaya/PIC dengan alasan dan dampak; setelah disetujui, tanggal selesai, nilai kontrak, manager, dan (opsional) baseline baru diterapkan otomatis. Riwayat baseline dibandingkan dengan jadwal saat ini. |
| Kapasitas resource | Beban PM/admin (kelola = 1, anggota = 0,5) terhadap kapasitas per orang (diatur admin), tindak lanjut terbuka/terlambat, dan heatmap 6 bulan untuk benturan jadwal. Admin melihat semua; pengguna lain hanya dirinya. |
| Penutupan & knowledge base | Checklist penutupan (item wajib), kesiapan otomatis (BAST, tagihan, risiko, tindak lanjut, dokumen), serah terima, ringkasan, dan lessons learned; penutupan melalui persetujuan lalu proyek berstatus selesai. Lessons learned proyek yang ditutup dapat dicari seluruh pengguna; dokumen terverifikasi tetap dibatasi akses proyek. |
| Navigasi | Sidebar desktop dapat diciutkan; preferensinya disimpan di browser. Data bisnis tetap di PostgreSQL. Navigasi mobile tetap tersedia. |
| Dokumen & OCR | Upload PDF/PNG/JPEG, versi original, antrean dan retry OCR, klasifikasi SPK/PKS/BAST/invoice/MOM/surat/laporan, ekstraksi kandidat field (nomor dokumen/kontrak/invoice, nilai, tanggal, jatuh tempo, pelanggan, termin_N) dengan bukti sumber, koreksi/verifikasi manual, serta pencarian isi dokumen. Saat pengesahan, hasil dapat diterapkan ke kontrak/termin proyek atau ditautkan sebagai BAST/invoice termin; tidak ada yang diterapkan sebelum diverifikasi manusia. Dokumen terverifikasi dapat diajukan untuk persetujuan. Belum ada workflow tanda tangan digital. |
| Administrasi | Pembuatan/nonaktivasi pengguna, role, reset password oleh admin, wajib ganti password sementara, penggantian password sendiri, anggota/manager proyek, arsip/pulihkan proyek, audit dan status antrean dokumen. |
| SIMPRO | Prototype berisi simulasi/konfigurasi klien. Tidak dibuat sinkronisasi palsu; konektor nyata memerlukan API dan konfigurasi layanan. |

### Konfigurasi opsional

Isi di `.env` runtime (`%LOCALAPPDATA%\ShockwavePMO\.env` untuk Docker, lihat `deploy/production.env.example`), lalu jalankan ulang launcher:

- `EARLY_WARNING_INTERVAL_MINUTES` — interval pemeriksaan early warning (default 60; `0` menonaktifkan job; admin tetap dapat menjalankan manual dari Portfolio Health).
- `TEAMS_WEBHOOK_URL` — URL webhook Teams Workflows ("Post to a channel when a webhook request is received"); kode, nama proyek, dan teks peringatan merah dikirim ke kanal tersebut.
- `OPENAI_API_KEY` — mengaktifkan Asisten PMO melalui OpenAI. **Privasi:** setiap pertanyaan mengirim ringkasan proyek yang boleh diakses penanya (metrik, peringatan, risiko, kendala, laporan terakhir, field dokumen terverifikasi) ke OpenAI API. Kosongkan bila data tidak boleh keluar dari jaringan perusahaan; `ASSISTANT_AI=off` memaksa mode aturan lokal.
| Tema/aksen prototype | Pilihan warna alternatif tidak diadopsi karena pengguna meminta palet saat ini tetap digunakan. |

Setiap modul memiliki akses proyek dan audit. Penyimpanan memeriksa versi data: jika pengguna lain menyimpan terlebih dahulu, server mengembalikan konflik tanpa menimpa data terbaru. Perubahan operasi belum disimpan tetap bisa diedit sebelum bobot mencapai 100%; tombol Simpan akan memvalidasi seluruh struktur. Baseline yang sudah disimpan tidak ditimpa oleh impor berikutnya.

## Mode pengembangan di Windows

Prasyarat: PowerShell 7, Node/npm untuk bootstrap, dan Docker Desktop yang berjalan. Karena proses Node/PowerShell tidak bisa menulis ke folder OneDrive workspace pada lingkungan ini, launcher menyalin sumber ke `%TEMP%\shockwave-pmo-validation` dan menjalankan aplikasi di sana. Kode sumber tetap diedit di workspace. Konfigurasi rahasia dan database lokal tetap dipertahankan saat launcher dijalankan ulang.

```powershell
# Pertama kali: masukkan email, nama, dan password admin Anda sendiri.
.\scripts\start-local.ps1 -CreateAdmin

# Pemakaian berikutnya
.\scripts\start-local.ps1
```

Buka **http://localhost:3000**. Tidak ada akun atau password bawaan. Password admin minimal 12 karakter. Jika email sudah ada, jangan ulangi `-CreateAdmin`. Launcher memakai Node 26.13.1 dan npm 12.2.2 khusus proyek, tanpa mengganti instalasi global. Hentikan aplikasi dengan Ctrl+C. Database memakai volume Docker dan tidak dihapus oleh launcher.

Launcher menggunakan kembali dependensi yang lengkap dan sesuai lockfile. `npm ci` hanya dijalankan bila instalasi belum lengkap/berubah, atau dengan opsi `-RepairDependencies`. Saat aplikasi masih memakai runtime, pemasangan ulang diblokir sebelum file dihapus. Pembuatan admin dapat dijalankan ketika aplikasi sudah aktif; launcher tidak membuka server kedua.

Server `localhost:3000` membaca salinan kode di runtime sementara. Perubahan baru di workspace masuk saat launcher dijalankan kembali. Jika menu yang ada di kode belum tampil, hentikan launcher lama dengan Ctrl+C, jalankan `./scripts/start-local.ps1`, lalu refresh browser. Menu asisten berada di **Insight → Asisten PMO**; mode aturan lokal dapat dipakai tanpa API key.

Jika muncul `EPERM unlink ... next-swc...node`, hentikan aplikasi melalui Ctrl+C di terminal yang menjalankannya, lalu ulangi `./scripts/start-local.ps1 -CreateAdmin`. File native SWC sedang dipakai sehingga tidak bisa diganti di Windows. Jangan hapus database atau konfigurasi `.env`. Launcher akan memulihkan instalasi yang terputus secara otomatis. Jalankan tes pemeriksaan dependensi dengan `node --test scripts/check-dependencies.test.mjs`.

Di direktori yang bisa ditulis dan sudah memakai Node 26, alternatif manual:

```powershell
npm ci
Copy-Item .env.example .env
# Ganti POSTGRES_PASSWORD di .env, lalu isi backend/.env sesuai backend/.env.example.
docker compose up -d --wait database
# Isi ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD lewat environment sementara.
npm run admin:create -w backend
npm run dev
```

## Palet V62

| Token | Nilai |
|---|---|
| Brand 950 / 900 / 800 / 700 | `#000A50` / `#071162` / `#132583` / `#2031A7` |
| Brand 600 / 400 / 100 / 50 | `#266FF1` / `#78AAFF` / `#E8EEFF` / `#F2F5FF` |
| Teks utama / sekunder / tersier | `#1C2940` / `#526079` / `#67748B` |
| Border / border kuat | `#E1E7F1` / `#C5D0E2` |
| Surface / muted / canvas | `#FFFFFF` / `#F8FAFD` / `#F3F6FC` |
| Success / warning / danger | `#087443` / `#996300` / `#B42318` |

Font Plus Jakarta Sans variable dibundel lokal; form memakai tinggi 46px, radius 10px, dan focus ring biru sesuai spesifikasi. Gradien brand: `linear-gradient(114deg,#07105C 0%,#142D96 56%,#2D69E5 100%)`.

## Stack dan penguncian versi

Versi stabil dipilih lewat registry npm/PyPI pada 17 November 2026, lalu dikunci secara exact di package.json, package-lock.json, dan requirements.txt. Tidak menggunakan prerelease atau tag `latest` untuk runtime Docker.

- Frontend: Next.js 16.4.6, React 19.3.1, TypeScript 7.0.2, Lucide, docx 9.15.4, read-excel-file 9.3.17, write-excel-file 4.1.1. ExcelJS bawaan prototype tidak digunakan; dependensi deprecated-nya tidak dibawa ke aplikasi.
- Backend: NestJS 12.5.1, TypeScript, node-postgres, Zod, Argon2, `openai` 7.57.0 (hanya dipakai bila `OPENAI_API_KEY` diisi).
- Runtime: Node.js 26.13.1 LTS. Node 22 global tidak diganti.
- Database: PostgreSQL 18.7, query berparameter, constraint dan transaksi SQL. Migrasi `001` memuat platform inti, `002` fitur prototype, `003` administrasi/dokumen, dan `004` approval, change request, termin, tindak lanjut, notifikasi, kapasitas, serta penutupan proyek. Kolom `DATE` dibaca sebagai string `YYYY-MM-DD` agar tanggal tidak bergeser pada server non-UTC. Backend menerapkan migrasi sebelum membuka API, dengan transaksi dan lock.
- OCR: Python 3.13 dengan PaddleOCR 3.7.0, PaddlePaddle 3.3.1, pypdfium2 5.15.2, psycopg 3.3.9, Pillow 13.0.0. Python dipilih berdasarkan dukungan wheel Paddle; pembaruan interpreter harus melewati pemeriksaan kompatibilitas.

Referensi: [Node releases](https://nodejs.org/en/about/previous-releases), [PostgreSQL release](https://www.postgresql.org/docs/release/18.7/), [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), [Next.js](https://nextjs.org/blog).

Dokumentasi library Excel: [write-excel-file](https://github.com/catamphetamine/write-excel-file), [read-excel-file](https://github.com/catamphetamine/read-excel-file). API yang digunakan mengikuti versi terkini, termasuk worksheet jamak dan pemrosesan browser.

## Keamanan dan alur data

Login memverifikasi hash Argon2id. Token sesi acak 256-bit hanya disimpan sebagai SHA-256 di database; browser mendapat cookie HttpOnly, SameSite Strict, berumur 8 jam. Cookie memakai Secure pada production, dengan pengecualian eksplisit untuk Docker localhost di atas. Logout, perubahan akses, dan perubahan password mencabut sesi server. Mutasi memeriksa Origin; Next.js mem-proxy API agar browser memakai origin yang sama. Lima percobaan per kombinasi IP/email selama 15 menit sebelum pembatasan. Pesan kredensial salah tidak mengungkap keberadaan akun.

Role `admin` melihat semua proyek; `pm` dapat membuat proyek dan mengubah operasi/dokumen proyek yang dapat diakses; `viewer` hanya membaca. Pengaturan master/anggota dan pengarsipan dibatasi kepada admin atau manager proyek; penggantian manager khusus admin. Administrator mengelola pengguna dan reset password lewat UI. Pengguna baru atau yang direset wajib mengganti password sebelum mengakses data. Minimal satu admin aktif dipertahankan. Tidak ada registrasi publik, pemulihan melalui email, atau SSO.

Perubahan progres dan pembuatan proyek menyimpan histori serta audit dalam satu transaksi. Data bisnis dan autentikasi disimpan di PostgreSQL. Database baru dimulai kosong; data uji dapat ditambahkan secara eksplisit melalui `scripts/seed-demo.ps1`. Panduan proyek contoh, akun dummy, dan skenario pengujian ada di [docs/DEMO.md](docs/DEMO.md).

## Dokumen dan OCR

`ocr/worker.py` memakai antrean PostgreSQL dengan claim atomik `FOR UPDATE SKIP LOCKED` dan token lease agar worker lama tidak menimpa hasil terbaru. Worker mencoba maksimal tiga kali, memulihkan job yang tertinggal selama 30 menit, membaca text layer PDF sebelum OCR, serta menyimpan versi engine, nama model, halaman, koordinat, dan confidence bila tersedia. Hasil selalu `needs_review`. Pengguna membandingkan original, mengoreksi field/kategori, lalu mengesahkan dengan catatan; OCR tidak memvalidasi tanda tangan.

Docker lokal menjalankan worker secara otomatis. Model PP-OCRv6 small diunduh saat pertama digunakan lalu dicache pada volume. CPU memakai dua thread dan MKLDNN dinonaktifkan untuk menghindari ketidakcocokan inference yang ditemukan saat pengujian. Unggahan maksimal 20 MB, 50 halaman, dan 25 megapiksel per gambar/hasil render. Original memakai key UUID, checksum SHA-256, dan penyimpanan private; download wajib melewati autentikasi serta pemeriksaan akses proyek. Nama, tipe MIME, signature file, ukuran, versi, dan revisi verifikasi diperiksa server.

PDF teks, PNG scan, dan PDF scan sintetis sudah diuji melalui upload → worker asli → review → verifikasi → pencarian/download. Akurasi pada dokumen perusahaan belum diukur karena sampel belum tersedia. Adaptor S3 opsional sudah tersedia untuk backend/worker; deployment yang diuji memakai volume lokal, bukan layanan S3 eksternal. Backup yang disediakan mencakup database dan volume lokal tersebut.

SIMPRO, SSO, pemulihan password melalui email, serta tanda tangan digital memerlukan layanan/kebutuhan tersendiri dan tidak disimulasikan. MOM mendukung maksimal tiga foto, 300 KB PNG per gambar dan 1,5 MB total JSON per modul; gambar tanda tangan bukan tanda tangan digital. Server perusahaan dengan HTTPS dan penerimaan bisnis berada di luar target Docker localhost yang dipilih saat ini.

## Pemeriksaan

Jalankan dari runtime lokal dengan Node 26 dan database aktif:

```powershell
npm run typecheck
npm test
npm run build
npm run test:browser
```

Tes integrasi menggunakan schema PostgreSQL sementara yang terisolasi, menguji login, cookie, logout/revocation, Origin, RBAC, akses proyek, validasi, audit, histori progres, pembatasan login, migrasi berulang, konflik penyimpanan bersamaan, baseline, carry-forward, dan penguncian rapat final. Tes database dilewati bila `DATABASE_URL` tidak disediakan. `backend/.env` dimuat saat menjalankan skrip backend.

Tes browser memerlukan Chrome (atau `BROWSER_CHANNEL=msedge`), build terbaru, serta port kosong. Default 3000/4000; `TEST_WEB_PORT` dan `TEST_API_PORT` dapat memisahkan pengujian dari aplikasi pengguna. Saat build, arahkan `API_ORIGIN` ke port API tes. Tes mencakup alur inti, dependency WBS, ekspor/impor, laporan, rapat, administrasi, anggota, penggantian password wajib, serta upload/verifikasi/pencarian dokumen. Schema tes dibersihkan setelahnya. Screenshot dan dokumen uji disimpan di `artifacts/` runtime. Fixture pada browser hanya menguji UI; inference OCR asli diuji terpisah melalui Docker.

Verifikasi 17 November 2026: build/typecheck, 30 tes backend tanpa skip (termasuk regresi integritas keuangan, referensi dokumen, dan penutupan), browser smoke termasuk menu/tanya jawab Asisten PMO aturan lokal, inference OCR asli pada tiga fixture, pemeriksaan akses/security headers, uji beban lokal, dan backup-restore drill. Rincian dan batas bukti ada di [docs/VALIDATION.md](docs/VALIDATION.md). UAT bisnis masih harus dijalankan pengguna melalui [docs/UAT.md](docs/UAT.md).
