# Dokumentasi & Kebijakan Cron Job BeeSmart ERP

Dokumen ini mendefinisikan standar, aturan, dan arsitektur pengelolaan *cron job* pada proyek BeeSmart ERP untuk mencegah terjadinya *spam* pesan (seperti pengiriman laporan kosong atau pengiriman otomatis tanpa izin ke WhatsApp Group) serta memastikan alur *approval* berjalan dengan benar.

---

## 1. Latar Belakang & Masalah Sebelumnya
- **Insiden**: Sebelumnya, cron job otomatis mengirimkan rekapitulasi penjualan harian dan mingguan langsung ke Group WhatsApp Pengurus Karyawan Koperasi (`120363421424271082@g.us`).
- **Kendala**: Terjadi kesalahan otorisasi token (`Authorization: Bearer` vs `***`) dan kegagalan enkapsulasi path CLI yang mengakibatkan laporan terkirim dalam kondisi **kosong** secara berulang (spam).
- **Keputusan Pengguna**: Menghentikan seluruh pengiriman otomatis langsung ke grup dan mewajibkan **alur approval (persetujuan manual)** melalui chat Telegram pribadi sebelum laporan dapat dikirimkan ke WhatsApp Group.

---

## 2. Aturan & Kebijakan Eksekusi Cron Job

1. **Larangan Pengiriman Otomatis ke Grup WhatsApp**:
   - Dilarang keras membuat cron job atau skrip yang langsung melakukan *post* HTTP POST ke endpoint WhatsApp Gateway (`http://localhost:3005/api/whatsapp/send`) untuk grup publik/operasional tanpa persetujuan eksplisit (*approval*) dari user (Fadli Rifai).

2. **Alur Approval Telegram (Approval Workflow)**:
   - Setiap jadwal laporan harian (pukul **08:05 pagi**) atau laporan mingguan (Jumat sore):
     1. Skrip/cron job berjalan secara otonom di latar belakang.
     2. Laporan ditarik dari API live hosting `beesmart.id/app/api/get_sales_summary.php` menggunakan token dinamis (`issueAuthToken`).
     3. Hasil rekap laporan dikirimkan **hanya ke chat pribadi Telegram user (`8707154100`)**.
     4. Sistem/agen berhenti dan menunggu respon user (`reject` atau `approve`/`kirim`).
     5. Pengiriman ke WhatsApp Group hanya dieksekusi jika user memberikan instruksi/persetujuan secara langsung.

3. **Standar Teknis Skrip Laporan (`live_report_cli.php` & `send_live_report.php`)**:
   - Skrip CLI harus menggunakan header autentikasi standar:
     ```php
     'Authorization: Bearer ' . $token
     ```
   - Skrip wajib memiliki mekanisme *fallback* ke database lokal apabila koneksi ke hosting online terkendala, namun tetap memastikan data yang direkap valid dan tidak bernilai nol (`Rp 0`) jika transaksi ada.

---

## 3. Daftar Cron Job Aktif

Saat ini cron job yang terdaftar di sistem adalah:
- **ID**: `02c4fa014892`
- **Nama**: `BeeSmart Daily Report Approval`
- **Jadwal**: Setiap hari pukul `08:05 AM` (`every day at 8:05am`)
- **Target Deliver**: Telegram pribadi user (`telegram:8707154100`)
- **Fungsi**: Menarik rekap penjualan harian dan meminta approval dari user sebelum dikirim ke WhatsApp Group.

---
*Dokumentasi ini dibuat untuk dipatuhi pada setiap sesi pengembangan dan pemeliharaan sistem BeeSmart ERP.*
