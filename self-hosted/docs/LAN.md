# Akses dari komputer lain pada jaringan yang sama

Mode LAN ditambahkan pada 17 November 2026. Contoh IP Wi-Fi komputer host: **192.0.2.10**, port web **8080**. Alamat dapat berubah saat berganti Wi-Fi atau mendapat lease DHCP baru.

## Host

Jalankan dari folder sumber:

```powershell
.\scripts\start-production.ps1 -Lan
# Bila komputer memiliki beberapa adapter:
.\scripts\start-production.ps1 -Lan -LanAddress 192.0.2.10
```

Launcher memilih IP privat adapter yang mempunyai default gateway, memverifikasi IP terpasang pada host, mempublikasikan port web pada semua interface, dan menyimpan origin login yang eksplisit. Localhost tetap dapat dipakai. API, database dan worker tidak membuka port host. Mode ini memakai HTTP untuk uji bersama pada LAN tepercaya; gunakan HTTPS untuk pemakaian server dengan data perusahaan.

Jika alamat LAN tidak terbuka, buka **PowerShell → Run as administrator**, lalu:

```powershell
Set-Location 'C:\Users\DICKY\OneDrive\Dokumen\Folder SDD\PMO Software'
.\scripts\enable-lan-firewall.ps1 -Address 192.0.2.10 -Port 8080
```

Aturan hanya mengizinkan TCP 8080 pada alamat/interface tersebut dari subnet lokal. Skrip tidak mematikan firewall atau mengubah kategori jaringan Windows. Profil Wi-Fi host saat diperiksa adalah Public, sehingga aturan berlaku pada semua profil tetapi tetap dibatasi alamat, interface, port dan subnet. Perubahan firewall memerlukan hak Administrator; terminal agen tidak memilikinya, sehingga aturan ini belum dibuat otomatis.

## Komputer teman

1. Hubungkan ke Wi-Fi/LAN yang sama dengan host.
2. Buka **http://192.0.2.10:8080** di browser.
3. Login memakai akun tersendiri. Admin host dapat membuat akun melalui **Administrasi**, memilih PM/viewer, dan menambahkan pengguna ke proyek yang diperlukan. Pengguna baru wajib mengganti password sementara.

Komputer host serta Docker Desktop harus tetap menyala. Komputer teman tidak perlu menginstal Docker, Node, Python atau PostgreSQL. `localhost` pada komputer teman menunjuk komputer teman sendiri, sehingga gunakan alamat IP host.

## Bila belum bisa terhubung

- Pastikan launcher mencetak IP yang masih sama dengan `ipconfig`; jalankan kembali `-Lan` bila IP berubah, lalu perbarui aturan firewall.
- Dari komputer teman, coba `Test-NetConnection 192.0.2.10 -Port 8080`. Jika gagal walaupun container sehat dan aturan sudah aktif, periksa pembatasan guest Wi-Fi, client/AP isolation, VLAN atau VPN bersama administrator jaringan.
- Bila halaman terbuka tetapi login ditolak karena Origin, gunakan IP/port persis yang dicetak launcher. Origin tambahan tidak memakai wildcard.
- Browser/API melalui localhost dan kebijakan Origin LAN sudah dapat diuji terpisah. Itu belum membuktikan paket jaringan dari komputer teman mencapai host.

## Kembali ke akses satu komputer

```powershell
.\scripts\start-production.ps1 -LocalOnly
```

Mode ini mengembalikan bind port ke loopback dan menonaktifkan pengecualian HTTP LAN. Data dan akun tetap dipertahankan. Jika ingin menghapus aturan firewall yang dibuat helper, jalankan PowerShell Administrator:

```powershell
Remove-NetFirewallRule -Name 'ShockwavePMO-LAN-8080'
```

## Verifikasi teknis

Typecheck dan 17 tes backend lulus, termasuk IP privat, pengecualian transport yang eksplisit, exact origin/port, penolakan wildcard/path/userinfo, serta Origin asing. Image Docker dibangun ulang dan service database/backend/frontend healthy. Uji browser koneksi langsung ke IP LAN mengalami timeout; akses lintas komputer belum dapat dinyatakan lulus sebelum firewall/jalur jaringan diperiksa dan dicoba dari perangkat kedua.

Browser localhost pada image LAN sudah lulus login, refresh dengan sesi yang tetap aktif, penolakan Origin asing dan logout. Login/logout dengan header Origin LAN yang eksplisit juga diterima melalui loopback. Hasil tersimpan di `%TEMP%\shockwave-pmo-release-validation\artifacts\lan-smoke.json` dengan `lan_network_tested: false`.

`scripts/lan-smoke.mjs <origin>` menjalankan browser dengan akun sementara dan membersihkannya. Opsi `--localhost-only` memeriksa browser localhost serta header Origin LAN tanpa mengklaim konektivitas jaringan. Skrip memerlukan dependensi pengembangan Playwright dan Chrome pada runtime validasi.
