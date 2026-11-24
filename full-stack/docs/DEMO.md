# Data dummy untuk pengujian PMO

Dataset `pmo-demo-v1` tersedia di `http://localhost:3000` dan `http://localhost:8080`. Kedua aplikasi memakai database terpisah; perubahan pada satu port tidak tersalin otomatis ke port lain. Login dengan akun administrator yang biasa dipakai, lalu muat ulang halaman. Cari proyek berawalan `DEMO-` atau nama `[DEMO]`. Terdapat tujuh proyek pada daftar utama dan satu proyek pada arsip Administrasi.

Semua dokumen, nominal, pelanggan, foto dan gambar tanda tangan merupakan fixture sintetis yang diberi penanda dummy. Data proyek yang sudah ada tidak ditimpa. Tanggal contoh dihitung dari tanggal pertama dataset dibuat, yang tersimpan di manifest.

| Proyek | Skenario yang dapat dicoba |
| --- | --- |
| `DEMO-APP-01` | WBS dan laporan, kontrak hasil verifikasi OCR, tiga termin, BAST dan invoice terkait, pembayaran parsial, serta PKS versi kedua yang belum diverifikasi. Nilai kontrak Rp1,2 miliar; tertagih Rp840 juta; dibayar Rp340 juta; outstanding Rp500 juta. |
| `DEMO-BTN-01` | Proyek simulasi terlambat dengan RAG merah, kendala akses server, risiko tinggi, laporan lama, termin tanpa BAST, approval ditolak, dan contoh PDF rusak untuk uji kegagalan OCR/retry. Bukan data proyek BTN yang sebenarnya. |
| `DEMO-NET-01` | Peringatan aktivitas, change request disetujui, perpanjangan jadwal, dua versi baseline, dan approval dokumen yang masih menunggu PMO. |
| `DEMO-SEC-01` | Proyek perencanaan, draft change request, serta PNG, JPEG dan PDF scan yang sudah diproses OCR dan menunggu verifikasi pengguna. |
| `DEMO-REVIEW-01` | Baseline menunggu PM, laporan menunggu PMO, dokumen dan perubahan jadwal menunggu persetujuan. |
| `DEMO-CLOSED-01` | Proyek ditutup melalui approval, pembayaran lunas, dokumen akhir dan dua lessons learned yang tampil di Knowledge Base. |
| `DEMO-CLOSING-01` | Checklist dan serah terima lengkap, pembayaran lunas, penutupan masih menunggu approval PMO. |
| `DEMO-ARCHIVE-01` | Proyek sudah diarsipkan. Buka Administrasi untuk mencoba pemulihan. |

Semua proyek memiliki enam aktivitas WBS dengan dependency dan baseline awal, laporan, Risk Register, PM Assignment, serta MOM dengan gambar dokumentasi dan tanda tangan contoh. Kapasitas PM dibuat bervariasi agar beban berlebih terlihat pada Kapasitas Resource.

## Rapat dan persetujuan

Corporate Meeting berisi rapat final **[DEMO] Corporate Meeting - Review Portofolio** dan rapat draft **[DEMO] Corporate Meeting - Tindak Lanjut**. Tugas terbuka dibawa ke rapat berikutnya; tugas yang sudah selesai memiliki bukti penyelesaian dan tidak dibawa lagi. Action Items juga berisi contoh tugas manual. Rapat final dapat diekspor menjadi ringkasan atau memo.

Buka **Persetujuan → Perlu keputusan saya** dengan akun administrator untuk mencoba keputusan PMO. Untuk contoh baseline pada `DEMO-REVIEW-01`, login sebagai Andi (PM1) untuk menyetujui tahap PM, lalu login administrator untuk tahap PMO. Pengaju tidak dapat menyetujui permintaannya sendiri. Data mencakup approval yang sudah disetujui, ditolak, dan masih menunggu tahap 1 maupun tahap 2.

## Akun uji

Password akun administrator tidak diubah dan tidak disimpan oleh installer. Lima akun dummy memakai password acak. Untuk melihat password dummy, jalankan dari folder proyek:

```powershell
.\scripts\show-demo-accounts.ps1
```

| Email | Peran / tujuan |
| --- | --- |
| `pmo-demo.pm1@example.test` | Andi: PM aplikasi, proyek terlambat dan portal; kapasitas dua proyek. |
| `pmo-demo.pm2@example.test` | Sari: PM jaringan dan proyek yang sudah ditutup. |
| `pmo-demo.pm3@example.test` | Rina: PM keamanan, penutupan dan proyek arsip. |
| `pmo-demo.viewer@example.test` | Viewer: membaca proyek demo, tidak boleh menulis atau membuka Administrasi. |
| `pmo-demo.new@example.test` | Viewer baru: wajib mengganti password pada login pertama. |

Password dummy disimpan terenkripsi menggunakan Windows DPAPI di `%LOCALAPPDATA%\ShockwavePMO\demo-data\pmo-demo-v1\accounts.dpapi`. Berkas hanya dapat dibuka oleh pengguna Windows yang membuatnya. Setelah mengganti password akun dummy secara manual, gunakan password baru tersebut; perintah penampil tidak mengambil password dari database.

## Menjalankan kembali

```powershell
# Kedua aplikasi harus sudah menyala dan dapat diakses.
.\scripts\seed-demo.ps1

# Atau hanya satu aplikasi:
.\scripts\seed-demo.ps1 -Origins http://localhost:8080

# Verifikasi API, akses, tampilan dan ekspor tanpa mengisi ulang data:
.\scripts\seed-demo.ps1 -VerifyOnly
```

Password administrator diminta secara tersembunyi. Checkpoint disimpan setiap langkah sehingga proses terputus dapat dilanjutkan. Dataset yang sudah selesai dilewati agar perubahan pengujian pengguna tetap tersimpan. Script tidak mereset database, menghapus proyek, atau mengatur ulang password akun yang tidak dimilikinya. Jangan menghapus manifest untuk memaksakan pengisian ulang; benturan kode/email sengaja dihentikan.

Manifest dan ringkasan per port ada di `%LOCALAPPDATA%\ShockwavePMO\demo-data\pmo-demo-v1\3000` dan `8080`. Password administrator dan session cookie tidak ditulis ke manifest, ringkasan atau laporan verifikasi.

Verifikasi 17 November 2026 berhasil pada kedua port: delapan proyek per aplikasi, status OCR terverifikasi/perlu review/gagal, role PM dan viewer, kewajiban ganti password, 18 halaman, serta enam ekspor Word/Excel per aplikasi. Hasil pemeriksaan ada di `verification.json` pada direktori setiap port. Verifier mengharapkan kondisi awal fixture; perubahan selama UAT dapat mengubah hasil pemeriksaan.

## Batas pengujian

OCR benar-benar berjalan pada worker; hasil kandidat pada dokumen scan tetap menunggu verifikasi manual. PDF rusak sengaja menghasilkan status gagal. Dokumen BAST dummy dipakai untuk OCR, billing dan approval; fixture ini tidak menambahkan generator BAST yang mengikuti template perusahaan.

Data proyek sudah dapat menjadi konteks Asisten PMO. Panggilan OpenAI sebelumnya ditolak karena saldo API habis; pengisian dan verifikasi dataset tidak menjalankan panggilan AI berbayar. Jawaban AI langsung memerlukan saldo API tersedia. Notifikasi contoh ada di dalam aplikasi; pengujian ini tidak mengirim email atau pesan Microsoft Teams.
