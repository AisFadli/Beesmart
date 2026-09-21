import React from 'react';

interface RegistrationConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onOpenTermsModal: () => void;
  data: {
    name: string;
    whatsapp: string;
    email: string;
    address?: string;
    barcode?: string;
  };
  isLoading?: boolean;
}

export const RegistrationConfirmModal: React.FC<RegistrationConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onOpenTermsModal,
  data,
  isLoading = false
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[220] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-[2.5rem] p-6 md:p-8 max-w-md w-full shadow-2xl border border-honey-100 text-left space-y-5 animate-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-honey-100 text-honey-600 rounded-2xl flex items-center justify-center text-xl shrink-0 shadow-inner">
            <i className="fas fa-[#000] fa-user-check"></i>
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
              Konfirmasi Pendaftaran Member
            </h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              Verifikasi Data & Persetujuan Layanan
            </p>
          </div>
        </div>

        {/* Summary Card */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2.5 text-xs">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1">
            Ringkasan Profil Member:
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">Nama Lengkap:</span>
            <span className="font-bold text-slate-900 uppercase">{data.name || '-'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">Email Akun:</span>
            <span className="font-bold text-honey-600">{data.email || '-'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">WhatsApp:</span>
            <span className="font-bold text-slate-900">{data.whatsapp || '-'}</span>
          </div>
          {data.barcode && (
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">No. Kartu Member:</span>
              <span className="font-mono font-bold text-honey-600">{data.barcode}</span>
            </div>
          )}
          {data.address && (
            <div className="pt-1 border-t border-slate-200/60">
              <span className="text-slate-500 font-medium block text-[10px] mb-0.5">Alamat:</span>
              <span className="font-bold text-slate-800 text-[11px] block line-clamp-2">{data.address}</span>
            </div>
          )}
        </div>

        {/* Consent Notice */}
        <div className="p-4 bg-emerald-50/80 border border-emerald-100 rounded-2xl space-y-2">
          <div className="flex items-center gap-2 text-emerald-800 font-black text-[10px] uppercase tracking-wider">
            <i className="fas fa-shield-alt text-emerald-600"></i>
            Pernyataan Persetujuan Data (UU PDP)
          </div>
          <p className="text-[10px] text-emerald-900 leading-relaxed font-medium">
            Dengan menekan tombol <strong className="font-black text-emerald-950">"Konfirmasi & Kirim"</strong>, Anda menyetujui pengolahan data pribadi di atas dan menyetujui seluruh <button type="button" onClick={onOpenTermsModal} className="font-black text-honey-700 underline hover:text-honey-900">Syarat & Ketentuan serta Kebijakan Privasi</button> Koperasi Syariah AIS. Dokumen resmi S&K juga akan dilampirkan ke email <span className="font-bold text-slate-900">{data.email}</span>.
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-2.5 pt-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <i className="fas fa-spinner fa-spin"></i>
                Memproses Pendaftaran...
              </>
            ) : (
              <>
                <i className="fas fa-paper-plane"></i>
                Konfirmasi & Kirim Pendaftaran
              </>
            )}
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all"
            >
              <i className="fas fa-edit mr-1"></i> Ubah Data
            </button>
            <button
              type="button"
              onClick={onOpenTermsModal}
              disabled={isLoading}
              className="py-3 bg-honey-50 hover:bg-honey-100 text-honey-700 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all border border-honey-200/60"
            >
              <i className="fas fa-file-alt mr-1"></i> Baca S&K
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
