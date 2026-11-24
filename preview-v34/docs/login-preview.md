# Autentikasi Shockwave PMO Preview

Preview privat menggunakan proyek fiktif untuk peninjauan. Service worker melayani API Preview dan menyimpan data serta perubahan aplikasi di IndexedDB pada browser dan origin yang sama.

| Fitur | Perilaku di Preview |
| --- | --- |
| Email dan kata sandi | Menggunakan akun Preview, validasi, batas percobaan, dan penyimpanan sesi yang sudah ada. |
| Google Sign-In | Belum dikonfigurasi di Preview. Tombol menyampaikan status saat dipilih. Pada lingkungan yang mengaktifkannya, alur menggunakan endpoint Google dan verifikasi MFA yang sudah ada. |
| Lupa kata sandi | Pengiriman email belum dikonfigurasi di Preview. Kontrol menyampaikan status saat dipilih. Form pengiriman tautan dan form reset tetap menangani alur yang tersedia pada aplikasi server. |
| Passkey | Menggunakan WebAuthn serta endpoint registrasi dan login yang sudah ada. Browser harus mendukung WebAuthn pada koneksi aman. Pengelola mendaftarkan passkey dari Pengaturan pada browser Preview yang dipakai. |
| Ingat perangkat untuk MFA | Checkbox meneruskan pilihan 30 hari ke formulir challenge MFA bila layanan meminta verifikasi. Preview tidak mengeluarkan challenge MFA dan tidak menyimpan status perangkat tepercaya. |

Ikon mata, mata tertutup, dan kunci memakai koleksi [Solar oleh 480 Design](https://icon-sets.iconify.design/solar/) dengan lisensi [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Logo Google berasal dari [panduan merek Google Identity](https://developers.google.com/identity/branding-guidelines).
