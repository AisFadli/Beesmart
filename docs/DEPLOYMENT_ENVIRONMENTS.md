# Profil Environment BeeSmart

Ada tiga lingkungan yang memakai **satu repository yang sama**. Pemisahan dilakukan lewat mode build dan file konfigurasi yang di-gitignore — bukan dengan meng-clone folder.

| Lingkungan | URL publik | Perintah | Database |
| --- | --- | --- | --- |
| Lokal | `http://localhost:3006/app/` | `npm run dev` | `beesmart_dev` @ Docker MariaDB `:3307` |
| Tester online | `https://beesmart.protechid.cloud/app/` | `npm run dev` di mesin tester, tunnel → port 3006 | `beesmart_dev` @ `:3307` (sama dengan lokal, sesuai keputusan) |
| Produksi | `https://beesmart.id/app/` | `npm run build`, lalu `dist/` di-upload ke hosting | database hosting (konfigurasi di server) |

Hosting **tidak menjalankan `npm run dev`**; yang dipakai adalah hasil build statis di `dist/`.

## 1. URL publik (canonical, OG, sitemap, robots)

Ditentukan oleh `mode` di `vite.config.ts`:

- `npm run dev` → `--mode staging` → `https://beesmart.protechid.cloud/app/`
- `npm run build:staging` → staging → URL tunnel
- `npm run build` → `production` → `https://beesmart.id/app/`

Nilai default bisa di-override dengan `VITE_APP_URL` (misal di CI). Lihat `.env.example`.

`index.html` memakai placeholder `__APP_URL__` dan `__APP_ROBOTS__`; keduanya disuntikkan saat dev maupun build. `sitemap.xml` dan `robots.txt` dihasilkan otomatis oleh plugin Vite, jadi tidak ada URL tunnel di build produksi.

- Staging: `robots` = `noindex, nofollow`, `robots.txt` = `Disallow: /`
- Produksi: `robots` = `index, follow`, `robots.txt` mengarah ke sitemap produksi

Cek otomatis: `npm run check:build` (atau lewat `npm run verify` / `npm run verify:staging`).

## 2. Link email

Semua email memakai satu helper: `api/app_url.php` → `getAppBaseUrl()`. Helper membaca `base_url` dari `api/app_config.php` (file gitignored, berbeda di tiap mesin):

- Mesin tester → `https://beesmart.protechid.cloud/app`
- Hosting produksi → `https://beesmart.id/app`

Yang memakai helper ini:

- `api/forgot_password.php` → `.../?reset_token=<token>`
- `api/member_activation.php` → `.../?activation_token=<token>`
- `api/register.php` dan `api/members.php` → link login dashboard

Frontend `components/Auth.tsx` membaca `reset_token` / `activation_token` dari query string, sehingga format link di atas tetap kompatibel. Alur reset: `request` mengirim link → pengguna klik → `Auth.tsx` membuka form `reset_password` → `reset` memvalidasi token, mengubah password, dan mencabut token lama (one-time).

## 3. File yang sengaja tidak di-commit

- `api/db_config.php`, `api/auth_config.php`, `api/app_config.php`, `api/mail_config.php`
- `.env.local` (polanya `*.local`)
- `dokumentasi-report/`, `scripts/_incomplete/`, `scripts/operations/`
- `uploads/`, `logs/`, `*.zip`, `dist/`

Template aman yang **ikut** di-commit: `.env.example`, `api/db_config.example.php`, `api/app_config.example.php`.

## 4. Cara deploy produksi

```bash
npm run verify        # TypeScript + PHP lint + build produksi + cek URL build
# unggah isi dist/ ke document root beesmart.id/app
# pastikan api/app_config.php di hosting berisi base_url produksi
```

Jangan menyalin `api/db_config.php`, `.env.local`, atau folder `scripts/` ke hosting.
