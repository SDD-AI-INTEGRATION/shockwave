<p align="center">
  <img src="docs/assets/shockwave-1x1-dark.png" alt="Logo Shockwave dengan simbol gelombang ungu pada latar gelap" width="280">
</p>

<h1 align="center">Shockwave PMO</h1>

<p align="center">
  Platform Project Management Office PT Swadharma Duta Data untuk mengelola portofolio proyek, progres mingguan, dokumen, dan tindak lanjut.
</p>

<p align="center">
  <a href="#mulai-cepat">Mulai cepat</a> ·
  <a href="#isi-repositori">Isi repositori</a> ·
  <a href="#dokumentasi">Dokumentasi</a>
</p>

## Yang bisa dikelola

- **Portofolio proyek** — master proyek, pilar, progres, serta impor dan ekspor Excel.
- **Operasional PMO** — WBS, linimasa, laporan mingguan, dan Log Book di aplikasi workspace.
- **Rapat dan dokumen** — Rapat Korporat, Penunjukan PM, Daftar Risiko, Notulen, serta templat BAST dan Lesson Learned di aplikasi workspace.
- **Tata kelola self-hosted** — persetujuan, tindak lanjut, termin, pengelolaan dokumen dengan OCR, dan asisten PMO dengan integrasi OpenAI opsional.

## Isi repositori

Pilih folder sesuai cara menjalankan Shockwave. Keduanya dapat dijalankan secara terpisah.

| Folder | Digunakan untuk | Stack |
| --- | --- | --- |
| [`workspace-app/`](workspace-app/) | Menjalankan versi dari workspace Sites untuk uji UI/UX dan alur kerja dengan data demo. Setiap origin menyimpan sesi dan data sendiri di browser. | React, Vite, Service Worker, IndexedDB |
| [`self-hosted/`](self-hosted/) | Memasang Shockwave di lingkungan sendiri. Paket ini mencakup web, API, migrasi database, dan worker OCR. Data proyek tersimpan di PostgreSQL. | Next.js, NestJS, PostgreSQL, Python, Docker Compose |

Otomasi memeriksa revisi Sites setiap Senin–Jumat pukul 17.00 WIB dan mengajukan perubahan untuk `workspace-app/` melalui PR. `self-hosted/` punya siklus pengembangan sendiri. Aplikasi workspace menggunakan input manual dan impor Excel untuk proyek. Konektor SIMPRO aktif masih memerlukan integrasi.

## Mulai cepat

### Instalasi mandiri dengan Docker

Untuk instalasi pertama di Windows, jalankan PowerShell 7 dengan Docker Desktop aktif.

```powershell
cd self-hosted
.\scripts\start-production.ps1 -CreateAdmin
```

Buka [http://localhost:8080](http://localhost:8080). Pada penggunaan berikutnya, jalankan launcher tanpa `-CreateAdmin`. Panduan pengembangan dengan Node.js 26 ada di [README instalasi mandiri](self-hosted/README.md). Untuk konfigurasi manual, gunakan templat [root](self-hosted/.env.example), [backend](self-hosted/backend/.env.example), dan [deployment](self-hosted/deploy/production.env.example) sebagai acuan.

### Aplikasi workspace di browser

Gunakan Bash, Node.js 24 atau lebih baru, dan Python 3. Akun demo memakai email `reviewer@shockwave.test`. Siapkan kata sandi lokal sebelum build.

<details>
<summary>Siapkan kata sandi demo dan jalankan aplikasi</summary>

```bash
(
  cd workspace-app || exit 1
  read -r -s -p 'Kata sandi demo baru (minimal 12 karakter): ' demo_password
  printf '\n'
  printf '%s' "$demo_password" | node --input-type=module -e '
    import { createHash } from "node:crypto";
    import { readFileSync, writeFileSync } from "node:fs";

    const password = readFileSync(0, "utf8");
    if (password.length < 12) throw new Error("Gunakan minimal 12 karakter.");

    const path = "packages/shared/review.json";
    const review = JSON.parse(readFileSync(path, "utf8"));
    review.passwordDigest = createHash("sha256")
      .update("shockwave-review:v1:" + password)
      .digest("hex");
    writeFileSync(path, JSON.stringify(review, null, 2) + "\n");
  ' || exit 1
  unset demo_password

  npm ci && npm run build &&
    python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
)
```

Buka [http://localhost:4173](http://localhost:4173) dan masuk dengan akun demo. Gunakan data dummy dan simpan perubahan kata sandi hanya pada salinan lokal. Untuk pengujian dengan state bersih, gunakan origin baru.

Untuk hosting, sajikan isi `dist/` dari root origin HTTPS, termasuk `review-api.js` dan `fase-1/operations.html`. Isi `YOUR_SITES_PROJECT_ID` di [konfigurasi Sites](workspace-app/.openai/hosting.json) jika memakai Sites, dan batasi akses ke audiens peninjau.

</details>

## Dokumentasi

| Topik | Panduan |
| --- | --- |
| Deployment, backup, dan restore | [Operasi self-hosted](self-hosted/docs/OPERATIONS.md) |
| Asisten PMO | [Konfigurasi OpenAI](self-hosted/docs/OPENAI.md) |
| Basis data | [Migrasi PostgreSQL](self-hosted/database/) |
| Review UI dan akses workspace | [Sistem visual](workspace-app/docs/visual-system.md) · [Autentikasi aplikasi](workspace-app/docs/login-preview.md) |
| Impor proyek di workspace | [Templat dan validasi Excel](workspace-app/docs/project-module.md) |

## Revisi sumber

Paket self-hosted mengacu pada snapshot 18 November 2026, versi `0.1.0`. Aplikasi workspace mengacu pada Sites v71 (`dc462a8`) dan menyertakan pembaruan Zod 4.6.7 serta bundel ExcelJS dengan UUID 11.1.1. Revisi lengkap, hash snapshot, dan catatan sanitasi tersedia di [SOURCE-REVISIONS.json](SOURCE-REVISIONS.json).
