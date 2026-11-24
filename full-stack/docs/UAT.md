# Skenario penerimaan pengguna

Status: **belum disetujui pemilik proses bisnis**. Pemeriksaan otomatis menggunakan data sintetis sudah dilakukan; pengguna belum menyediakan scan BAST/MOM/laporan perusahaan. Dokumen ini disiapkan agar penerimaan bisnis dapat dilaksanakan pada Docker lokal.

Pelaksana: admin PMO, manager proyek, PM anggota, dan viewer. Gunakan proyek uji terpisah; jangan mengubah rapat final atau histori proyek operasional hanya untuk pengujian. Catat hasil aktual, bukti, dan kendala pada tabel di bawah.

| No. | Skenario | Hasil yang diharapkan | Hasil pengguna |
|---|---|---|---|
| 1 | Login dengan akun sebelumnya; logout dan refresh | Data proyek tersedia; logout mencabut akses | Belum diuji |
| 2 | Admin membuat PM/viewer dan memberi password sementara | Login pertama hanya membuka penggantian password; harus login lagi setelah mengganti | Belum diuji |
| 3 | Nonaktifkan atau reset password pengguna uji | Semua sesi pengguna dicabut; admin aktif terakhir tidak bisa dihilangkan | Belum diuji |
| 4 | Buat/edit master proyek dan keanggotaan | Field, periode dan manager benar; PM tanpa keanggotaan tidak melihat proyek | Belum diuji |
| 5 | Login viewer dan PM anggota | Viewer tidak dapat mengubah; PM anggota dapat mengubah operasi tetapi tidak mengelola master/anggota | Belum diuji |
| 6 | Susun WBS, bobot 100%, dependency/lag, timeline dan baseline | Jadwal konsisten; siklus ditolak; baseline tersimpan tetap | Belum diuji |
| 7 | Isi laporan/realisasi beberapa minggu dan issues | Carry-forward, bobot, deviasi dan progres portofolio sesuai perhitungan PMO | Belum diuji |
| 8 | Ekspor/impor Operations XLSX | Nilai, ID, jadwal, dependency dan histori tetap sesuai; workbook tidak valid ditolak | Belum diuji |
| 9 | Review setiap proyek di Corporate Meeting; finalisasi | Proyek pending memblokir finalisasi; rapat final terkunci; tindakan tertunda terbawa ke rapat berikutnya | Belum diuji |
| 10 | Buat PM Assignment, Risk Register, MOM, Summary & Memo | Istilah, nomor, isi, logo, Word/Excel dan hasil cetak/PDF sesuai kebutuhan perusahaan | Belum diuji |
| 11 | Tambahkan foto dan gambar tanda tangan pada MOM | Gambar sesuai, batas ukuran diterapkan, ekspor/cetak terbaca | Belum diuji |
| 12 | Upload PDF teks, scan PDF, PNG/JPEG | Original dapat diunduh identik; antrean/status berubah; hasil menunggu verifikasi | Belum diuji |
| 13 | Bandingkan kategori dan field OCR dengan original | Field dapat dikoreksi, bukti halaman/teks tersedia, catatan wajib sebelum pengesahan | Belum diuji |
| 14 | Cari dokumen berdasarkan nama/isi, unggah versi baru | Hasil dibatasi proyek; versi lama tetap ada; viewer tidak dapat upload/mengesahkan | Belum diuji |
| 15 | Upload file salah tipe/rusak dan dokumen tidak dikenali | Salah tipe ditolak; parsing gagal tercatat/retry; field tidak dikenali tidak dikarang | Belum diuji |
| 16 | Arsipkan/pulihkan proyek uji | Akses operasional tertutup saat arsip; histori dan dokumen tetap ada setelah pulih | Belum diuji |
| 17 | Periksa audit, status layanan dan navigasi mobile | Aktivitas penting tercatat; tampilan dapat dipakai pada perangkat pengguna | Belum diuji |
| 18 | Backup dan recover ke project/port baru | Akun, proyek dan original tersedia; checksum sesuai; deployment utama tidak berubah | Belum diuji |

Untuk OCR, tambahkan sampel perusahaan bila tersedia: scan miring/gelap, stempel menutupi teks, tabel, beberapa halaman, dan tulisan tangan. Catat akurasi per field serta waktu proses. Keberhasilan fixture sintetis tidak menentukan akurasi semua format perusahaan. Hasil OCR maupun gambar tanda tangan tidak menggantikan validasi dokumen oleh pihak berwenang.

Kriteria penerimaan: skenario yang relevan lulus, masalah penghambat ditutup, format laporan/dokumen disetujui PMO, dan prosedur backup diketahui operator.

| Persetujuan | Nama | Tanggal | Keputusan / catatan |
|---|---|---|---|
| Pemilik proses PMO | — | — | Menunggu UAT |
| Administrator/operator | — | — | Menunggu UAT |
