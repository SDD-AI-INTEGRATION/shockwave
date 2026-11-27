# Operasi Docker lokal

Target: Docker pada komputer lokal. URL utama **http://localhost:8080**. Default Compose mengikat port web ke loopback; API dan database tidak membuka port host. Pengguna kemudian meminta akses pada jaringan yang sama: gunakan opsi `-Lan` sesuai [LAN.md](LAN.md). Untuk server perusahaan gunakan HTTPS dan origin yang sesuai.

## Menyalakan dan memperbarui

Dari folder sumber, dengan Docker Desktop aktif dan PowerShell 7:

```powershell
.\scripts\start-production.ps1
```

Launcher menyalin sumber ke `%LOCALAPPDATA%\ShockwavePMO`, mempertahankan `.env`, membangun image, dan menunggu layanan siap. Migrasi database berjalan sebelum API menerima permintaan. Tidak ada `npm ci` di host sehingga binary SWC Windows yang sedang dipakai tidak diganti. Runtime aplikasi Node 26.13.1 berada di dalam image; dependensi pengembangan tidak dibawa ke image final.

Untuk instalasi baru tanpa akun, gunakan `-CreateAdmin`; email, nama dan password diminta secara interaktif. Minimal password 12 karakter. Pada deployment yang disiapkan pada 17 November 2026, akun dan proyek lama sudah disalin, sehingga login memakai kredensial sebelumnya. Tidak ada password bawaan atau registrasi publik.

Salinan pengembangan di port 3000 dan deployment Docker di port 8080 memakai database terpisah. Setelah perpindahan, gunakan port 8080 untuk pekerjaan selanjutnya; perubahan pada kedua database tidak disinkronkan otomatis.

## Status, log, dan penghentian

Jalankan perintah operasi dari runtime:

```powershell
Set-Location "$env:LOCALAPPDATA\ShockwavePMO"
docker compose -f compose.production.yaml ps
docker compose -f compose.production.yaml logs --tail 100 backend ocr
docker stats --no-stream
```

API `/api/health` memeriksa database. Compose memeriksa kesehatan database, backend, dan frontend. Worker OCR mempunyai status proses/restart dan mencatat ID pekerjaan selesai/gagal; status container berjalan belum membuktikan model sudah selesai diunduh. Menu **Administrasi → Status layanan** menampilkan pool database dan jumlah dokumen per status. Log request memuat ID request, method, path, status dan durasi; tidak memuat password, cookie, isi unggahan, atau query pencarian. Audit perubahan tersedia di Administrasi.

Hentikan sementara tanpa menghapus data:

```powershell
docker compose -f compose.production.yaml stop
# Menyalakan kembali tanpa build
docker compose -f compose.production.yaml up -d --wait
```

`down` tanpa `-v` menghapus container/network tetapi mempertahankan volume. Jangan menggunakan `down -v` pada deployment yang datanya ingin dipertahankan.

## Pengguna dan proyek

Admin dapat membuat pengguna, mengubah role/status, mereset password, melihat audit, dan memulihkan arsip proyek. Password sementara wajib diganti sebelum pengguna mengakses data. Perubahan password atau akses mencabut semua sesi pengguna; login kembali diperlukan. Sistem menolak penonaktifan/penurunan role admin aktif terakhir.

Admin atau manager proyek mengelola master, anggota, dan arsip. Penggantian manager hanya oleh admin. PM anggota dapat mengubah operasi/dokumen proyek yang dapat diakses; viewer hanya membaca. Arsip memblokir akses operasional sambil mempertahankan histori dan original.

## Dokumen dan OCR

Unggah PDF, PNG, atau JPEG melalui **Dokumen & OCR**. Batas: 20 MB, PDF 50 halaman, gambar/hasil render 25 megapiksel. Proses: queued → processing → needs_review → verified. Dokumen gagal dicoba otomatis maksimal tiga kali; tombol **Coba OCR ulang** tersedia setelah status failed. Lease yang tertinggal dipulihkan setelah 30 menit. Hapus dari daftar adalah soft delete, bukan pemusnahan original.

Model PP-OCRv6 small dicache di volume setelah unduhan pertama. Inference CPU menggunakan dua thread. Jika antrean bertambah, periksa log, kapasitas memori/disk, koneksi database, serta akses unduhan model; jangan menghapus volume dokumen. Hasil verifikasi wajib dibandingkan dengan original. Nama/kategori/field kandidat tidak membuktikan keabsahan tanda tangan atau penerimaan pekerjaan.

Original lokal disimpan secara immutable memakai UUID dan SHA-256; versi baru menghasilkan file baru. Akses download memeriksa sesi/proyek dan checksum. Backup database diikuti salinan volume tetap dapat memulihkan semua original yang dirujuk snapshot karena file tidak ditimpa/dihapus oleh UI. File baru yang masuk setelah snapshot mungkin ikut sebagai file tanpa referensi; tidak mengubah snapshot database.

## Backup terenkripsi

Skrip administrasi backup/restore memerlukan Node yang mendukung API Node modern; pengujian memakai Node 26.13.1 di host. Instalasi pengembangan yang sudah ada menyediakan executable di `%TEMP%\shockwave-pmo-validation\.tools\node_modules\node\bin\node.exe`. Gunakan executable tersebut bila Node global berbeda.

```powershell
Set-Location "$env:LOCALAPPDATA\ShockwavePMO"
$taskBackupSecret = Read-Host 'Passphrase backup (minimal 16 karakter)' -AsSecureString
$env:BACKUP_PASSPHRASE = [Net.NetworkCredential]::new('', $taskBackupSecret).Password
try {
  node scripts/backup.mjs
} finally {
  Remove-Item Env:BACKUP_PASSPHRASE -ErrorAction SilentlyContinue
}
```

Hasil berada di `backups/<timestamp>/`: database custom-format dan tar original dienkripsi terpisah dengan AES-256-GCM, salt acak, scrypt, IV acak, serta authentication tag. Manifest menyimpan checksum file terenkripsi. Simpan passphrase di password manager secara terpisah dari backup dan salin backup ke media lain. Backup tidak bisa dipulihkan tanpa passphrase. Backup dalam `artifacts/` selama pengujian memakai kunci sementara dan bukan cadangan operasional pengguna.

Volume database/original aktif memakai kontrol akses filesystem Docker, bukan enkripsi aplikasi. Gunakan enkripsi disk host bila data perusahaan memerlukannya. Hanya backup yang dienkripsi oleh skrip ini. Tentukan jadwal dan retensi backup sesuai kebijakan perusahaan; belum ada scheduler otomatis.

## Drill restore

Isi `BACKUP_PASSPHRASE` melalui prompt seperti di atas, lalu:

```powershell
node scripts/restore-drill.mjs 'backups/<timestamp>'
```

Skrip memeriksa checksum, mendekripsi ke project Compose acak yang terpisah, memulihkan PostgreSQL dan original, memeriksa checksum setiap file yang dirujuk database, dan menulis `restore-report.json`. Container/volume drill dihapus setelah pemeriksaan. Database aplikasi utama tidak ditimpa. Jalankan setelah perubahan format dan secara berkala.

## Pemulihan yang dapat dipakai

Untuk memulihkan backup ke deployment baru yang tetap tersedia:

```powershell
# Isi BACKUP_PASSPHRASE dahulu melalui prompt aman.
node scripts/recover-backup.mjs 'backups/<timestamp>' shockwave-recovery-uat1 8081
```

Nama harus `shockwave-recovery-` diikuti 4–16 huruf kecil/angka dan belum mempunyai container/volume. Port harus kosong. Skrip membuat password database baru di file konfigurasi dalam folder backup, memulihkan data/original, mencabut sesi lama, menjalankan seluruh layanan, dan memeriksa checksum file. Login di **http://localhost:8081** dengan akun dari backup. Deployment utama pada 8080 tetap tersedia. Jika pemulihan gagal, hanya resource project pemulihan baru tersebut yang dibersihkan.

Perintah pengelolaan deployment hasil pemulihan harus memakai `--env-file <file-konfigurasi-yang-dicetak>` dan `-p <nama-project>`, misalnya:

```powershell
docker compose --env-file 'backups/<timestamp>/shockwave-recovery-uat1.env' -p shockwave-recovery-uat1 -f compose.production.yaml ps
```

Pastikan data dan akses pengguna benar sebelum memilih deployment pemulihan sebagai tempat kerja. Jangan menjalankan launcher utama untuk mengelola project recovery; launcher mengarah ke `shockwave-local`.

## Penyimpanan S3 dan server berikutnya

Adaptor backend/worker mendukung `S3_BUCKET`, `S3_ENDPOINT`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, dan `AWS_SECRET_ACCESS_KEY`; backend mendukung `S3_ENCRYPTION=AES256`. Konfigurasi harus diterapkan pada kedua layanan dan bucket tetap private. Adaptor ini belum diuji ke penyedia eksternal; paket lokal yang divalidasi menggunakan volume. Skrip backup original lokal tidak mencadangkan bucket S3.

Untuk server di luar localhost, gunakan terminasi TLS, `APP_ORIGIN=https://...`, cookie Secure, hapus pengecualian LOCAL_HTTP, dan tentukan aturan jaringan, retensi, monitoring/alerting, serta backup di luar mesin. Jangan mengekspos port HTTP localhost ke LAN sebagai konfigurasi server. SSO dan integrasi sistem perusahaan belum dikonfigurasi karena endpoint/kredensialnya belum diberikan.
