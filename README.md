# Shockwave PMO

Repositori ini berisi dua sumber Shockwave PMO yang bisa dijalankan secara terpisah.

| Folder | Revisi | Isi |
| --- | --- | --- |
| [full-stack](full-stack/) | Paket 0.1.0, snapshot 18 November 2026 | Frontend Next.js, backend NestJS, empat migrasi PostgreSQL, adaptor OpenAI, OCR, logo, konfigurasi contoh, Docker, dan panduan operasional |
| [preview-v34](preview-v34/) | Sites v34, commit `40832d6ffd9cd300d0ea8053a676a65c8a2d85a0` | Frontend React, API service worker, penyimpanan IndexedDB, fitur asisten preview, aset, dan logo |

Detail revisi dan sanitasi tercatat di [SOURCE-REVISIONS.json](SOURCE-REVISIONS.json). Versi full-stack berasal dari snapshot folder tanpa riwayat Git yang tersedia. Hash snapshot mengidentifikasi sumber tersebut.

Ekspor ini menerapkan perbaikan keamanan di atas v34. Preview memakai Zod 4.6.7 dan membangun ulang bundel ExcelJS dengan UUID 11.1.1. Jalankan `npm run build` untuk membuat bundel browser dari dependency lockfile.

Repositori ini belum memuat konektor SIMPRO aktif. Full-stack mendokumentasikan kebutuhan konektor eksternal. Preview v34 menggunakan input dan impor data proyek setelah sinkronisasi simulasi dihapus.

## Menjalankan full-stack

Ikuti [README full-stack](full-stack/README.md) untuk Docker, bootstrap admin, dan mode pengembangan dengan Node 26. Konfigurasi contoh tersedia di [root](full-stack/.env.example), [backend](full-stack/backend/.env.example), dan [deployment](full-stack/deploy/production.env.example). Buat nilai rahasia di lingkungan masing-masing.

- [Deployment, backup, dan restore](full-stack/docs/OPERATIONS.md)
- [Konfigurasi asisten OpenAI](full-stack/docs/OPENAI.md)
- [Migrasi PostgreSQL](full-stack/database/)

## Menjalankan preview v34

Preview memakai akun demo `reviewer@shockwave.test`. Tetapkan password lokal baru sebelum build karena verifier bawaan dikosongkan di ekspor ini. Dari Bash dan dengan Node.js 24 atau lebih baru, jalankan berikut setelah mengekstrak ZIP.

```bash
cd preview-v34
read -r -s -p 'Password demo baru: ' preview_password
printf '\n'
printf '%s' "$preview_password" | node --input-type=module -e '
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
'
unset preview_password

npm ci
npm run build
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Buka `http://localhost:4173`. Gunakan origin baru untuk pengujian bersih karena preview menyimpan sesi dan data di IndexedDB per origin. Untuk deployment preview, sajikan isi `dist/` dari root origin HTTPS, termasuk `review-api.js` dan `fase-1/operations.html`. Isi `YOUR_SITES_PROJECT_ID` di [konfigurasi Sites](preview-v34/.openai/hosting.json) bila menggunakan Sites. Simpan akses preview pada audiens peninjau dan gunakan data dummy.

[Dokumentasi autentikasi preview](preview-v34/docs/login-preview.md) menjelaskan dukungan email, Google Sign-In, dan passkey.
