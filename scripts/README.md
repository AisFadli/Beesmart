# Script Operasional BeeSmart

Folder ini berisi script CLI sekali pakai / operasional yang **bukan** bagian dari aplikasi web BeeSmart (`App.tsx`, `components/`, `api/`). Tujuannya menjaga root repository tetap bersih dan rilis aplikasi hanya berisi source yang diperlukan.

## Struktur

| Folder | Isi |
| --- | --- |
| `reports/` | Penarikan rekap penjualan, generator laporan OCR/Excel, dan pengirim laporan (`live_report_cli.php`, `send_live_report.php`, dll). |
| `operations/` | Sinkronisasi expense/titipan, seed data, cleanup n8n, dan script diagnostik. **Di-gitignore** — khusus mesin lokal, tidak ikut di-push. |
| `checks/` | Verifikasi otomatis: `php_lint.mjs`, `check_build_urls.mjs`, dan `smoke_test.php`. |
| `_incomplete/` | Script laporan yang isinya terpotong (literal `…`) sehingga tidak bisa dijalankan. **Di-gitignore**, disimpan sebagai arsip lokal. |

Semua script PHP di sini meng-includes backend melalui:

```php
require_once dirname(__DIR__, 2) . '/api/db.php';
```

Jadi script tetap bisa dijalankan dari direktori mana pun.

## Contoh menjalankan

```bash
# Rekap penjualan harian (kemarin)
php scripts/reports/live_report_cli.php

# Rekap rentang tanggal tertentu
php scripts/reports/send_live_report.php 2026-10-26 2026-10-31

# Rekap mingguan (Senin–Jumat minggu berjalan)
php scripts/reports/send_live_report.php weekly

# Smoke test API (jalankan PHP server dulu: php -S 127.0.0.1:8088 router.php)
php scripts/checks/smoke_test.php http://127.0.0.1:8088

# Atau langsung ke produksi
BEESMART_BASE_URL=https://beesmart.id/app php scripts/checks/smoke_test.php
```

## Verifikasi sebelum commit

```bash
npm run verify          # tsc + php -l + build produksi + cek URL build
npm run verify:staging  # tsc + php -l + build staging + cek URL build
```

`npm run dev` memakai mode **staging** (URL tester tunnel). `npm run build` memakai mode **production** (URL `beesmart.id`). Detail ada di [`docs/DEPLOYMENT_ENVIRONMENTS.md`](../docs/DEPLOYMENT_ENVIRONMENTS.md).

Pre-commit hook sudah dipasang lewat `core.hooksPath = .githooks`. Untuk commit darurat: `git commit --no-verify`.

## Catatan penting

- `send_live_report.php` dan `send_test_reports.php` mengirim ke WhatsApp Gateway. **Jangan dijadwalkan otomatis ke grup** tanpa approval — lihat [`docs/CRON_JOB_POLICY.md`](../docs/CRON_JOB_POLICY.md).
- Script dengan awalan `test_` hanya untuk diagnostik lokal dan tidak boleh dipakai di produksi.
- File arsip build (`.zip`) tidak boleh di-commit; sudah masuk `.gitignore`.
