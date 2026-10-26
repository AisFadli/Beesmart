# BeeSmart ERP & Operational System — Comprehensive AI Memory Recap

*Rekapitulasi lengkap seluruh instruksi, percakapan, perbaikan, dan aksi operasional proyek BeeSmart ERP serta sistem pendukung.*

---

## 1. Ringkasan Proyek & Infrastruktur
- **Lokasi Proyek**: `/home/protechid/App/beesmart/` (Git repository branch `main`).
- **Port Alokasi**:
  - `3006`: Frontend Vite React (BeeSmart ERP)
  - `8088`: Backend PHP API lokal
  - `3005`: WhatsApp Autoreply Gateway (Express/TypeScript, SQLite WAL mode, Google Gemini)
  - `3307`: Docker MariaDB (`beesmart-dev`)
- **Domain & Tunnel**: `https://beesmart.protechid.cloud/` (Cloudflare Tunnel aktif).
- **Hosting Online**: `https://beesmart.id/app` (Sumber data laporan keuangan & operasional utama).

---

## 2. Poin-Poin Instruksi Pengguna & Riwayat Penanganan

### A. Pengelolaan Keuangan & Input Pengeluaran
- **Pengeluaran Operasional (Katering, Vendor, Layanan Jemputan, Sewa Lapak, Admin Transfer)**:
  - Seluruh bukti transfer/struk dari aplikasi perbankan (BSI/BYOND) yang dikirimkan oleh pengguna (Fadli Rifai) telah diverifikasi dan di-input secara otomatis ke database hosting online `beesmart.id/app/api/expenses.php` menggunakan skrip sinkronisasi aman berbasis token HMAC-SHA256 (`issueAuthToken`).
  - Pos akun yang dicatat:
    - **KATERING / KATERING VENDOR**: Belanja dapur, minyak, gas, vendor ayam, vendor Andi, tambahan belanja dapur.
    - **LAYANAN JEMPUTAN**: Bensin mobil jemputan.
    - **SEWA LAPAK**: Belanja kebersihan dapur.
    - **GENERAL**: Biaya administrasi transfer BI Fast (Rp 2.500 per transaksi).

### B. Pengembangan & Perbaikan Sistem BeeSmart PWA & API
1. **Perbaikan Whitescreen & Error Rendering (PWA)**:
   - Menambahkan validasi `Array.isArray(...)` pada komponen `MemberServicesView.tsx` dan `MemberDashboard.tsx` untuk mencegah *TypeError* dan *whitescreen* saat data belum ter-load atau kosong.
   - Mengatasi error konstruktor `Notification` (`Failed to construct 'Notification': Illegal constructor`) dengan menggantinya menggunakan `ServiceWorkerRegistration.showNotification()`.
   - Mengamankan konversi casting `depositBalance` dan memperbarui Error Boundary di `index.tsx` dengan penanganan diagnostik ke `localStorage`.
2. **Koreksi URL API Frontend (`apiService.ts`)**:
   - Memastikan fungsi `getApiBaseUrl()` secara konsisten mengarah ke `${origin}/app/api` di lingkungan hosting agar tidak terjadi kegagalan fetch data (*404 Not Found*).
3. **Perbaikan Query Offerings CMS Admin (`services_api.php`)**:
   - Memperbarui query SQL `get_offerings` menjadi `WHERE (status = 'ACTIVE' OR status != 'DELETED' OR status IS NULL)` agar penawaran layanan buatan Admin/Staff tampil sempurna di dashboard member.
4. **Fitur Pelunasan Piutang dengan Metode DEPOSIT**:
   - Menambahkan opsi pembayaran `DEPOSIT` pada modal konfirmasi pelunasan piutang di `Reports.tsx` dan backend `api/transactions.php`.
   - Dilengkapi pencarian ID/nama member, pemindaian barcode (*scanner*), pop-up konfirmasi lanjut/batal, pemotongan saldo deposit member secara real-time, serta pencatatan log transaksi `[PELUNASAN DEPOSIT: id_member/nama_member]`.
5. **Optimasi Mobile Scanner & Sidebar UI**:
   - Memperbaiki tampilan modal scanner kamera (menghilangkan *whitescreen*, menyelaraskan video *object-fit: cover*, dan menempatkan tombol fokus di depan dengan `z-[100]`).
   - Merapikan padding/spacing sidebar mobile serta memposisikan menu *Settings* di bagian paling bawah dan *Membership/User* di atasnya.
   - Membatasi akses menu *Layanan & Tagihan* agar tidak dapat diakses oleh role `TENANT`.
6. **Sinkronisasi Membership & Manajemen User**:
   - Mensinkronkan data tabel `members` (`APPROVED`) ke endpoint `users` (`api/get_app_data.php`) sehingga seluruh member dapat dikelola oleh Admin dalam satu menu *Manajemen User*.
7. **Fitur Layanan Jemputan & Katering Terpadu**:
   - Membangun tabel database, API `services_api.php`, pendaftaran terpadu (`MemberServicesView.tsx`), CMS penawaran & approval admin (`AdminServicesManagement.tsx`) dengan penentuan wilayah jemputan (A/B/C/D) dan hari efektif katering berbasis multi-vendor.
   - Menambahkan fitur upload foto dengan kompresi client-side canvas pada CMS admin dan modal fullscreen preview dengan tombol close di dashboard member.
   - Memperluas query `get_bills` di `api/services_api.php` untuk mencakup relasi keluarga (`member_guardians`) agar tagihan anak/siswa otomatis tampil di akun orang tua.
   - Menambahkan endpoint backend (`api/member_deposit_transfer.php`) dan tombol UI bagi role `Parent` untuk menarik kembali saldo deposit dari akun anak/siswa.
8. **Hardening Keamanan Server PHP & API**:
   - Memasang firewall HTTP request (`api/security.php`), menonaktifkan fungsi RCE berbahaya via `.user.ini` (`disable_functions`), validasi magic bytes pada `api/upload.php`, serta proteksi `.htaccess`.

### C. WhatsApp Report Automation & Spam Prevention
- **Skrip Laporan Live Hosting**:
  - `live_report_cli.php` dan `send_live_report.php` dikonfigurasi untuk menarik rekapitulasi penjualan harian dan mingguan secara otomatis dari hosting online `beesmart.id/app`.
- **Penghentian Otomatisasi (Anti-Spam)**:
  - Atas permintaan pengguna untuk menghentikan spam laporan harian/mingguan di WhatsApp Group (**PENGURUS KARYAWAN KOPERASI 2025-2026**), seluruh cron job terkait laporan otomatis (`6351da985992` & `73dec362b98d`) telah dihapus secara permanen dari sistem penjadwalan.

---
*Dokumentasi memori ini disusun secara komprehensif sebagai acuan lintas sesi.*
