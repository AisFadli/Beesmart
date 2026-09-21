import React, { useState } from 'react';

interface TermsPrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'terms' | 'privacy';
  onAccept?: () => void;
  showAcceptButton?: boolean;
}

export const TermsPrivacyModal: React.FC<TermsPrivacyModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'terms',
  onAccept,
  showAcceptButton = false
}) => {
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy'>(defaultTab);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[250] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-100">
        
        {/* Header */}
        <div className="p-6 md:p-8 bg-slate-900 text-white flex justify-between items-start shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="p-2 bg-honey-500/20 text-honey-400 rounded-xl text-xs font-black uppercase tracking-wider border border-honey-400/30">
                Dokumen Legal & Regulasi Data
              </span>
              <span className="text-[10px] text-slate-400 font-mono">v2.0 (Agustus 2026)</span>
            </div>
            <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight">
              {activeTab === 'terms' ? 'Syarat & Ketentuan Penggunaan' : 'Kebijakan Privasi & Perlindungan Data'}
            </h2>
            <p className="text-slate-400 text-xs mt-1 font-medium">
              Koperasi Syariah AIS & BeeSmart ERP System
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-2xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-all"
          >
            <i className="fas fa-times text-lg"></i>
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="bg-slate-100 p-2 flex border-b border-slate-200 shrink-0">
          <button
            onClick={() => setActiveTab('terms')}
            className={`flex-1 py-3 text-[11px] font-black uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2 ${
              activeTab === 'terms'
                ? 'bg-white text-honey-600 shadow-md border border-slate-200/60'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <i className="fas fa-file-contract"></i>
            Syarat & Ketentuan (Terms)
          </button>
          <button
            onClick={() => setActiveTab('privacy')}
            className={`flex-1 py-3 text-[11px] font-black uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2 ${
              activeTab === 'privacy'
                ? 'bg-white text-honey-600 shadow-md border border-slate-200/60'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <i className="fas fa-user-shield"></i>
            Kebijakan Privasi (Privacy Policy)
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 text-slate-700 text-xs leading-relaxed custom-scrollbar bg-slate-50/50">
          {activeTab === 'terms' ? (
            <div className="space-y-6 bg-white p-6 md:p-8 rounded-3xl border border-slate-200/80 shadow-sm">
              <div className="p-4 bg-honey-50 border border-honey-100 rounded-2xl flex items-start gap-3">
                <i className="fas fa-info-circle text-honey-600 text-base mt-0.5"></i>
                <p className="text-[11px] text-honey-900 font-medium leading-relaxed">
                  Harap membaca Syarat dan Ketentuan berikut dengan cermat sebelum mendaftar sebagai Member atau menggunakan aplikasi BeeSmart Koperasi Syariah AIS. Dengan mendaftar, Anda menyatakan telah memahami dan menyetujui seluruh aturan yang berlaku.
                </p>
              </div>

              <section className="space-y-2">
                <h3 className="font-black text-slate-900 text-sm uppercase tracking-wide flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">1</span>
                  Ketentuan Keanggotaan & Akun Member
                </h3>
                <ul className="list-disc pl-5 space-y-1.5 text-slate-600 font-medium">
                  <li>Pendaftaran member terbuka bagi perseorangan yang memberikan data identitas diri yang sah dan akurat.</li>
                  <li>Member bertanggung jawab penuh atas kerahasiaan akun, password, dan penggunaan kartu member.</li>
                  <li>Setiap akun member bersifat pribadi dan tidak boleh dipindahtangankan tanpa persetujuan pengelola Koperasi.</li>
                  <li>Pengelola berhak menangguhkan (SUSPENDED) atau menghentikan akun jika ditemukan bukti manipulasi data atau pelanggaran hukum.</li>
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="font-black text-slate-900 text-sm uppercase tracking-wide flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">2</span>
                  Layanan Kasir (POS), Transaksi & Saldo Deposit
                </h3>
                <ul className="list-disc pl-5 space-y-1.5 text-slate-600 font-medium">
                  <li>Saldo deposit member dikelola sesuai prinsip transaksi Syariah bebas riba dan dapat digunakan untuk pembayaran belanja produk di Koperasi.</li>
                  <li>Proses Top Up saldo wajib menyertakan bukti transfer sah yang akan diverifikasi oleh Admin/Kasir sebelum saldo ditambahkan.</li>
                  <li>Setiap transaksi yang berhasil akan mencatat e-receipt (nota digital) serta riwayat audit secara real-time.</li>
                  <li>Penarikan atau pengembalian sisa saldo deposit mengikuti tata cara resmi Koperasi.</li>
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="font-black text-slate-900 text-sm uppercase tracking-wide flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">3</span>
                  Persetujuan Komunikasi & Email Resmi
                </h3>
                <ul className="list-disc pl-5 space-y-1.5 text-slate-600 font-medium">
                  <li>Dengan mendaftar, Member memberikan izin kepada Koperasi untuk mengirimkan notifikasi transaksi, konfirmasi akun, nota e-receipt, dan dokumen regulasi melalui email atau WhatsApp terdaftar.</li>
                  <li>Member dapat memperbarui alamat email atau nomor kontak melalui fitur Update Profil.</li>
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="font-black text-slate-900 text-sm uppercase tracking-wide flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">4</span>
                  Batasan Tanggung Jawab & Hak Cipta
                </h3>
                <ul className="list-disc pl-5 space-y-1.5 text-slate-600 font-medium">
                  <li>Seluruh sistem, logo, software BeeSmart, dan konten aplikasi adalah milik Koperasi Syariah AIS.</li>
                  <li>Koperasi tidak bertanggung jawab atas kerugian yang timbul akibat kelalaian member dalam menjaga keamanan password atau barcode kartu pribadi.</li>
                </ul>
              </section>
            </div>
          ) : (
            <div className="space-y-6 bg-white p-6 md:p-8 rounded-3xl border border-slate-200/80 shadow-sm">
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-start gap-3">
                <i className="fas fa-shield-alt text-emerald-600 text-base mt-0.5"></i>
                <p className="text-[11px] text-emerald-900 font-medium leading-relaxed">
                  Kebijakan Privasi ini disusun sesuai standar Perlindungan Data Pribadi (UU PDP No. 27 Tahun 2022) untuk memastikan data pribadi Anda dikumpulkan, disimpan, dan diproses secara aman, transparan, dan bertanggung jawab.
                </p>
              </div>

              <section className="space-y-2">
                <h3 className="font-black text-slate-900 text-sm uppercase tracking-wide flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">1</span>
                  Jenis Data Pribadi yang Dikumpulkan
                </h3>
                <p className="text-slate-600 font-medium">
                  Saat Anda mendaftar sebagai Member, kami mengumpulkan data pribadi berikut:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-slate-600 font-medium">
                  <li><strong>Identitas Utama:</strong> Nama Lengkap, Nomor Induk Member / Barcode.</li>
                  <li><strong>Kontak Komunikasi:</strong> Nomor WhatsApp / HP dan Alamat Email Aktif.</li>
                  <li><strong>Data Lokasi & Akses:</strong> Alamat Domisili.</li>
                  <li><strong>Dokumen Visual:</strong> Foto profil member (untuk identifikasi kartu fisik).</li>
                  <li><strong>Data Transaksi:</strong> Riwayat pembelian, saldo deposit, dan bukti transaksi top up.</li>
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="font-black text-slate-900 text-sm uppercase tracking-wide flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">2</span>
                  Tujuan Penggunaan & Pengolahan Data
                </h3>
                <ul className="list-disc pl-5 space-y-1.5 text-slate-600 font-medium">
                  <li>Memverifikasi identitas member saat transaksi di kasir POS dan layanan online.</li>
                  <li>Mengelola saldo deposit, pembuatan nota transaksi (e-receipt), dan laporan keuangan keanggotaan.</li>
                  <li>Mengirimkan email konfirmasi pendaftaran, link reset password, dan informasi resmi Koperasi.</li>
                  <li>Mencegah tindakan penipuan atau penggunaan akun tanpa izin.</li>
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="font-black text-slate-900 text-sm uppercase tracking-wide flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">3</span>
                  Perlindungan & Kerahasiaan Data
                </h3>
                <ul className="list-disc pl-5 space-y-1.5 text-slate-600 font-medium">
                  <li><strong>Bcrypt Password Hashing:</strong> Password akun Anda dienkripsi secara ketat dan tidak pernah disimpan dalam format teks polos.</li>
                  <li><strong>Non-Disclosure:</strong> Kami <strong>TIDAK PERNAH</strong> menjual, menyewakan, atau membagikan data pribadi Anda kepada pihak ketiga manapun untuk kepentingan komersial/pemasaran luar.</li>
                  <li><strong>Akses Terbatas:</strong> Hanya pengurus dan sistem internal berwenang yang dapat mengakses data untuk keperluan operasional Koperasi.</li>
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="font-black text-slate-900 text-sm uppercase tracking-wide flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">4</span>
                  Hak Anda Sebagai Subjek Data
                </h3>
                <ul className="list-disc pl-5 space-y-1.5 text-slate-600 font-medium">
                  <li>Hak untuk melihat profil dan memperbarui informasi pribadi kapan saja melalui Dashboard Member.</li>
                  <li>Hak untuk meminta salinan dokumen S&K dan Kebijakan Privasi dikirimkan ke alamat email terdaftar.</li>
                  <li>Hak untuk mengajukan penutupan akun atau penghapusan data sesuai ketentuan operasional Koperasi.</li>
                </ul>
              </section>

              <section className="p-4 bg-slate-100 rounded-2xl border border-slate-200">
                <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wider mb-1">
                  Kontak Layanan Pelanggan & Pengaduan Data:
                </p>
                <p className="text-[11px] text-slate-600 font-medium">
                  Administrasi Koperasi Syariah AIS: <span className="font-mono font-bold text-slate-900">+62 881-0257-23947</span> (Bpk. Teguh)
                </p>
              </section>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all flex items-center gap-2 shadow-sm"
            >
              <i className="fas fa-print text-slate-500"></i>
              Cetak Dokumen
            </button>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {showAcceptButton ? (
              <>
                <button
                  onClick={onClose}
                  className="flex-1 sm:flex-none px-6 py-3 bg-slate-200 text-slate-600 hover:bg-slate-300 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all"
                >
                  Tutup
                </button>
                <button
                  onClick={() => {
                    if (onAccept) onAccept();
                    onClose();
                  }}
                  className="flex-1 sm:flex-none px-8 py-3 bg-honey-600 hover:bg-honey-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-honey-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <i className="fas fa-check-circle"></i>
                  Saya Setuju
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="w-full sm:w-auto px-8 py-3 bg-slate-900 hover:bg-black text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md"
              >
                Tutup & Paham
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
