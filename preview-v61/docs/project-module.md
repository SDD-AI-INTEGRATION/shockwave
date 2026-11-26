# Refinement menu Proyek

## Alur dan komponen

| Area | Perubahan |
| --- | --- |
| Menu Proyek | Status dipilih satu per satu dan beberapa pilar dapat dipilih bersama. Pencarian, filter, urutan, halaman dan posisi gulir bertahan saat berpindah menu dalam sesi yang sama. Nomor baris mengikuti urutan tampilan, sedangkan ID proyek tetap. Ekspor mengikuti seluruh hasil pencarian/filter dan urutan daftar. Impor tersedia untuk administrator yang memiliki akses Proyek. Tambah tersedia bagi pengguna dengan izin edit Proyek. |
| Tambah dan Ubah | Modal Tambah dan mode Edit di drawer Detail memakai field dan validasi yang sama. Semuanya memakai Pilar dari katalog dan pilihan status Aktif/Selesai. |
| Detail | Drawer tunggal mempertahankan navigasi dari daftar yang sudah difilter dan diurutkan. Setelah simpan, drawer, tabel, dan ringkasan memakai data terbaru. |
| Data | ID dan nomor proyek existing tetap dipakai. Entri baru mencatat asal Manual atau Excel dan waktu pembuatan/pembaruan. Tanggal terstruktur, referensi katalog, serta nilai Rupiah dan jumlah sumber daya numerik disimpan bersama representasi lama yang masih dipakai antarmodul. Data lama tanpa bukti asal dibiarkan tanpa label asal. |
| Integrasi | Dialog dan tombol sinkronisasi, metadata simulasi, tab impor lama di Pengaturan, pengaturan/polling sinkronisasi, dan endpoint SIMPRO simulasi dihapus. Catatan proyek dan data historis yang sudah tersimpan di IndexedDB tetap tersedia. |

## Impor Excel

Unduh templat dari dialog Impor Excel. Lembar **Proyek** menerima hingga 200 baris data dalam file **.xlsx** maksimal 5 MB. Lembar **Panduan** menjelaskan tipe isian. Lembar **Referensi** memuat pilihan yang sama dengan form, termasuk dropdown di kolom Pilar, Pelanggan, Project Manager, Sales, dan Status.

| Kolom | Ketentuan |
| --- | --- |
| Nama proyek, Pilar | Wajib. Pilar harus ada di katalog. |
| Pelanggan, Project Manager, Sales | Opsional mengikuti kewajiban isian lama. Jika diisi, nilai harus cocok dengan referensi. |
| Status | Opsional. Kosong menggunakan Aktif. Pilihan yang tersedia adalah Aktif dan Selesai. |
| Tanggal mulai, Tanggal akhir | Isi berpasangan. Gunakan tanggal Excel atau YYYY-MM-DD. |
| Nilai kontrak (Rp), Jumlah sumber daya | Opsional. Gunakan angka Rupiah nonnegatif dengan maksimal dua desimal, dan jumlah sumber daya dalam bilangan bulat nonnegatif. |
| Ketentuan penagihan, Catatan SPK/PKS | Opsional. Belum ada pilihan baku penagihan di katalog existing. |
| Prognosa 2026 (Rp), Realisasi 2026 (Rp) | Kolom angka opsional yang dipertahankan dari templat lama. |

Pratinjau menunjukkan proyek baru, baris gagal beserta alasannya, referensi yang tidak tersedia, kemungkinan duplikat, dan baris kosong. Nama yang sama setelah normalisasi ditandai untuk diperiksa, tanpa penggabungan data. Setelah konfirmasi, API memeriksa ulang seluruh baris yang disetujui dan menambahkannya pada satu transaksi. Jika ada konflik baru saat konfirmasi, seluruh batch yang dikonfirmasi gagal disimpan. Ringkasan hasil dan laporan Excel tersedia setelah proses. File dari templat lama perlu dipindahkan ke templat terbaru karena Pilar wajib dan tanggal menjadi dua kolom.

## Kompatibilitas dan keputusan terbuka

- Pilar memakai urutan IT Infrastructure, Managed Services, dan Software Development. ID kategori existing dipertahankan dan label lama tetap diterima saat impor Excel. Belum ada master resmi Pelanggan, PM, dan Sales dalam repositori Preview. Daftar sementara memakai nilai dari proyek existing yang telah dideduplikasi dan diberi ID konsisten. Data Pelanggan yang ditandai tertukar pada P004 tidak dipakai sebagai opsi. Pemilihan tidak membuat entri master baru. Integrasi ke master resmi tetap memerlukan sumber yang ditetapkan.
- Status proyek lama yang belum punya status tersimpan dibaca dari status kontrak pada tanggal perubahan model, 24 November 2026. Setelah itu, habisnya kontrak tidak mengubah status. Perubahan status memakai izin edit Proyek yang sudah ada.
- Hak edit mengikuti izin existing untuk kedua sumber masukan. Aturan khusus per sumber dan rekonsiliasi dengan SIMPRO masih terbuka.
- Ringkasan dan ekspor Proyek hanya menggunakan prognosa/realisasi yang tercatat. Angka yang belum tersedia ditampilkan sebagai tanda kosong. Persentase portofolio memakai proyek yang memiliki kedua angka. Nilai kontrak dan rumus historis yang dipakai modul lain tetap tersedia. Sumber resmi pendapatan, target, dan realisasi masih perlu ditetapkan.
- Verifikasi sumber SIMPRO dilepas dari alur aktif Proyek dan Rapat Korporat. Validasi form, Excel dan kelengkapan tinjauan tetap berlaku. Data historis dan materi rapat yang sudah final tetap dapat dibaca.
- Peninjauan dependensi mencakup Penunjukan PM, Rapat Korporat, Daftar risiko, Operasional, MOM, dan BAST. ID proyek dan field tampilan yang dipakai modul tersebut tetap tersedia. Pembaruan snapshot tetap mengikuti perilaku existing untuk rapat draf.
- API Preview berjalan di service worker dengan data dalam IndexedDB per browser. Pemeriksaan hak edit berlaku di API Preview lokal. Otorisasi dan penyimpanan server produksi belum tercakup.

Ikon aksi proyek memakai koleksi [Solar oleh 480 Design](https://icon-sets.iconify.design/solar/) dengan lisensi [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
