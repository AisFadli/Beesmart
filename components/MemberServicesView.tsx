import React, { useState, useEffect } from 'react';
import { User, Member } from '../types';
import apiService, { resolveMediaUrl } from '../services/apiService';

interface MemberServicesViewProps {
  user: User;
  familyChildren: Member[];
  selectedFamilyMemberId: string;
  onRefreshData?: () => void;
}

const FALLBACK_IMAGE = '/app/logo/beesmart-logo.png';

export const MemberServicesView: React.FC<MemberServicesViewProps> = ({
  user,
  familyChildren,
  selectedFamilyMemberId,
  onRefreshData,
}) => {
  const [offerings, setOfferings] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedServiceType, setSelectedServiceType] = useState<'CATERING' | 'TRANSPORT'>('CATERING');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    member_id: user.id || '',
    member_name: user.name || '',
    class_name: '',
    address: '',
    phone: '',
    service_type: 'CATERING',
    sub_category: 'Pulang Pergi (PP)',
    vendor_name: '',
    target_month: '',
  });

  const [agreedTerms, setAgreedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [payModalBill, setPayModalBill] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<'DEPOSIT' | 'TRANSFER'>('DEPOSIT');
  const [paymentProof, setPaymentProof] = useState('');

  // Saat orang tua memilih anak di sidebar, pengajuan & tagihan mengikuti anak tersebut.
  const targetMember: any = (selectedFamilyMemberId && selectedFamilyMemberId !== 'FAMILY')
    ? (familyChildren.find(child => child.id === selectedFamilyMemberId) || user)
    : user;

  const cateringOfferings = Array.isArray(offerings) ? offerings.filter(o => o && o.service_type === 'CATERING') : [];
  const transportOfferings = Array.isArray(offerings) ? offerings.filter(o => o && o.service_type === 'TRANSPORT') : [];
  const monthNow = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date());
  const defaultVendor = cateringOfferings[0]?.vendor_or_fleet || '';

  const openForm = (type: 'CATERING' | 'TRANSPORT', vendorOverride?: string) => {
    setSelectedServiceType(type);
    setFormData({
      member_id: targetMember.id || '',
      member_name: targetMember.name || user.name || '',
      class_name: (targetMember as any).className || '',
      address: (targetMember as any).address || '',
      phone: (targetMember as any).whatsapp || '',
      service_type: type,
      sub_category: 'Pulang Pergi (PP)',
      vendor_name: vendorOverride || defaultVendor,
      target_month: monthNow,
    });
    setAgreedTerms(false);
    setIsFormOpen(true);
  };

  // Profil bisa berubah setelah refresh data; sinkronkan ulang field yang berasal dari profil.
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      member_id: targetMember.id || '',
      member_name: targetMember.name || user.name || '',
      class_name: (targetMember as any).className || '',
      address: (targetMember as any).address || '',
      phone: (targetMember as any).whatsapp || '',
      vendor_name: prev.vendor_name || defaultVendor,
      target_month: prev.target_month || monthNow,
    }));
  }, [targetMember.id, targetMember.name, (targetMember as any).className, (targetMember as any).address, (targetMember as any).whatsapp, selectedFamilyMemberId]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const offRes = await apiService.getServiceOfferings();
      if (offRes && offRes.status === 'success') {
        setOfferings(offRes.offerings || []);
      } else {
        setError(offRes?.message || 'Gagal memuat penawaran layanan.');
      }

      if (targetMember.id) {
        const billRes = await apiService.getServiceBills(targetMember.id);
        if (billRes && billRes.status === 'success') {
          setBills(billRes.bills || []);
        } else {
          setBills([]);
          setError(prev => prev || billRes?.message || 'Gagal memuat tagihan layanan.');
        }
      } else {
        setBills([]);
      }
    } catch (e: any) {
      setError('Gagal memuat data layanan: ' + (e?.message || ' Kesalahan jaringan.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => { loadData(); }, 15000);
    return () => clearInterval(interval);
  }, [targetMember.id, selectedFamilyMemberId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreedTerms) {
      alert('Mohon setujui Syarat & Ketentuan layanan terlebih dahulu.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiService.submitServiceRequest(formData);
      if (res.status === 'success') {
        alert(res.message);
        setIsFormOpen(false);
        loadData();
        if (onRefreshData) onRefreshData();
      } else {
        alert(res.message || 'Gagal mengirim pengajuan.');
      }
    } catch (e: any) {
      alert('Terjadi kesalahan: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePayBill = async () => {
    if (!payModalBill) return;
    try {
      const res = await apiService.payServiceBill({
        bill_id: payModalBill.id,
        payment_method: paymentMethod,
        payment_proof: paymentProof,
      });
      if (res.status === 'success') {
        alert(res.message);
        setPayModalBill(null);
        setPaymentProof('');
        loadData();
        if (onRefreshData) onRefreshData();
      } else {
        alert(res.message);
      }
    } catch (e: any) {
      alert('Gagal membayar tagihan: ' + e.message);
    }
  };

  const imageError = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const element = event.currentTarget;
    if (!element.src.endsWith(FALLBACK_IMAGE)) element.src = FALLBACK_IMAGE;
  };

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      {loading && offerings.length === 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-2xl p-4 text-center text-amber-800 dark:text-amber-300 text-xs font-bold animate-pulse">
          <i className="fas fa-spinner fa-spin mr-2"></i> Memuat data penawaran dan tagihan layanan...
        </div>
      )}
      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl p-4 text-rose-800 dark:text-rose-300 text-xs font-bold">
          <i className="fas fa-circle-exclamation mr-2"></i> {error}
        </div>
      )}
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 bottom-0 translate-x-6 translate-y-6 opacity-10 text-9xl">
          <i className="fas fa-concierge-bell"></i>
        </div>
        <div className="relative z-10 max-w-2xl space-y-3">
          <span className="bg-honey-500/20 text-honey-400 border border-honey-500/30 px-3 py-1 rounded-full text-[10px] font-black tracking-wider uppercase">
            Fasilitas & Layanan Sekolah
          </span>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight">Layanan Jemputan & Katering Eksklusif</h2>
          <p className="text-xs sm:text-sm text-slate-300 font-medium leading-relaxed">
            Nikmati kemudahan antar-jemput aman dan pilihan menu katering sehat bergizi dari vendor terpercaya langsung untuk buah hati Anda di sekolah.
          </p>
          {selectedFamilyMemberId !== 'FAMILY' && targetMember.id !== user.id && (
            <p className="text-[11px] font-bold text-honey-400">
              <i className="fas fa-child mr-1.5"></i> Pengajuan untuk: {targetMember.name}
            </p>
          )}
          <div className="pt-2 flex flex-wrap gap-3">
            <button
              onClick={() => openForm('CATERING')}
              className="px-5 py-3 bg-honey-600 hover:bg-honey-700 text-white rounded-2xl text-xs font-black shadow-lg shadow-honey-600/30 transition-all flex items-center gap-2"
            >
              <i className="fas fa-utensils"></i>
              <span>Daftar Katering</span>
            </button>
            <button
              onClick={() => openForm('TRANSPORT')}
              className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-2xl text-xs font-black backdrop-blur-md transition-all flex items-center gap-2"
            >
              <i className="fas fa-bus"></i>
              <span>Daftar Jemputan</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tagihan Layanan Section */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 shadow-xl border border-slate-100 dark:border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <i className="fas fa-file-invoice-dollar text-honey-500"></i>
              Tagihan Layanan Aktif
            </h3>
            <p className="text-xs text-slate-500 font-medium">Pantau dan konfirmasi pembayaran tagihan layanan bulanan Anda</p>
          </div>
          <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1 rounded-xl text-xs font-bold">
            {bills.length} Tagihan
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bills.map(bill => {
            if (!bill) return null;
            const ownerName = bill.member_id === user.id
              ? null
              : (familyChildren.find(child => child.id === bill.member_id)?.name || bill.member_id);
            const status = String(bill.status || '').toUpperCase();
            const canPay = status === 'UNPAID' || status === 'PENDING';
            return (
              <div key={bill.id || `${bill.member_id}-${bill.month}`} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-700 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-honey-600 dark:text-honey-400 bg-honey-50 dark:bg-honey-950/50 px-2 py-0.5 rounded-md border border-honey-200">
                      Bulan: {bill.month}
                    </span>
                    <h4 className="text-sm font-black text-slate-900 dark:text-white mt-1.5">{bill.details}</h4>
                    {ownerName && (
                      <p className="mt-0.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        <i className="fas fa-child mr-1"></i> Untuk: {ownerName}
                      </p>
                    )}
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                    status === 'PAID' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' :
                    status === 'PENDING' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400' :
                    'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400'
                  }`}>
                    {status}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-200/60 dark:border-slate-700">
                  <span className="text-xs font-bold text-slate-500">Total Tagihan:</span>
                  <span className="text-base font-black text-slate-900 dark:text-white">Rp {Number(bill.amount).toLocaleString('id-ID')}</span>
                </div>
                {status === 'PENDING' && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                    <i className="fas fa-clock mr-1"></i> Menunggu verifikasi staff. Anda dapat memperbarui referensi transfer.
                  </p>
                )}
                {bill.admin_notes && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    <i className="fas fa-note-sticky mr-1"></i> Catatan staff: {bill.admin_notes}
                  </p>
                )}
                {canPay && (
                  <button
                    onClick={() => {
                      setPayModalBill(bill);
                      setPaymentMethod(String(bill.payment_method || 'DEPOSIT').toUpperCase() === 'TRANSFER' ? 'TRANSFER' : 'DEPOSIT');
                      setPaymentProof(bill.payment_proof || '');
                    }}
                    className="w-full py-2.5 bg-honey-600 hover:bg-honey-700 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    <i className="fas fa-credit-card"></i>
                    <span>{status === 'PENDING' ? 'Perbarui Bukti Transfer' : 'Bayar / Konfirmasi Tagihan'}</span>
                  </button>
                )}
              </div>
            );
          })}
          {bills.length === 0 && !error && (
            <div className="col-span-full py-8 text-center text-slate-400 text-xs font-medium">
              Belum ada tagihan layanan aktif saat ini.
            </div>
          )}
        </div>
      </div>

      {/* Catering Offerings Showcase with Photos */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <i className="fas fa-utensils text-honey-500"></i>
            Pilihan Vendor Katering
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cateringOfferings.map(item => (
            <div key={item.id} className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-xl border border-slate-100 dark:border-slate-800 flex flex-col group hover:shadow-2xl transition-all">
              <div
                onClick={() => setPreviewImage(resolveMediaUrl(item.image_url) || FALLBACK_IMAGE)}
                className="relative h-52 sm:h-56 overflow-hidden bg-slate-100 dark:bg-slate-800 cursor-pointer group/img"
              >
                <img
                  src={resolveMediaUrl(item.image_url) || FALLBACK_IMAGE}
                  alt={item.title}
                  onError={imageError}
                  className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-slate-950/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="px-3 py-1.5 bg-slate-900/80 backdrop-blur-md text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg">
                    <i className="fas fa-search-plus"></i> Ketuk untuk Preview
                  </span>
                </div>
                <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md text-white px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider shadow">
                  {item.vendor_or_fleet}
                </div>
              </div>
              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <h4 className="text-base font-black text-slate-900 dark:text-white">{item.title}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{item.description}</p>
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-700/60 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    <i className="fas fa-concierge-bell text-honey-500 mr-1.5"></i>
                    {item.menu_or_facilities}
                  </div>
                </div>
                <button
                  onClick={() => openForm('CATERING', item.vendor_or_fleet)}
                  className="w-full py-3 bg-slate-900 hover:bg-honey-600 text-white rounded-2xl text-xs font-black shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <span>Pilih Vendor Ini</span>
                  <i className="fas fa-arrow-right"></i>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transport Fleet Showcase with Photos */}
      <div className="space-y-4">
        <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
          <i className="fas fa-bus text-honey-500"></i>
          Armada Jemputan Sekolah
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {transportOfferings.map(item => (
            <div key={item.id} className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-xl border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row group hover:shadow-2xl transition-all">
              <div
                onClick={() => setPreviewImage(resolveMediaUrl(item.image_url) || FALLBACK_IMAGE)}
                className="relative md:w-1/2 h-56 md:h-auto overflow-hidden bg-slate-100 dark:bg-slate-800 cursor-pointer group/img"
              >
                <img
                  src={resolveMediaUrl(item.image_url) || FALLBACK_IMAGE}
                  alt={item.title}
                  onError={imageError}
                  className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-slate-950/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="px-3 py-1.5 bg-slate-900/80 backdrop-blur-md text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg">
                    <i className="fas fa-search-plus"></i> Ketuk untuk Preview
                  </span>
                </div>
              </div>
              <div className="p-6 md:w-1/2 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <span className="bg-honey-50 text-honey-700 dark:bg-honey-950/50 dark:text-honey-400 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                    {item.vendor_or_fleet}
                  </span>
                  <h4 className="text-lg font-black text-slate-900 dark:text-white">{item.title}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{item.description}</p>
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-700/60 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    <i className="fas fa-shield-alt text-emerald-500 mr-1.5"></i>
                    {item.menu_or_facilities}
                  </div>
                </div>
                <button
                  onClick={() => openForm('TRANSPORT')}
                  className="w-full py-3 bg-honey-600 hover:bg-honey-700 text-white rounded-2xl text-xs font-black shadow-lg shadow-honey-600/30 transition-all flex items-center justify-center gap-2"
                >
                  <span>Daftar Jemputan Sekarang</span>
                  <i className="fas fa-arrow-right"></i>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fullscreen Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-fade-in" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center justify-center" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-12 right-0 sm:right-4 w-11 h-11 rounded-full bg-slate-800 hover:bg-honey-600 text-white flex items-center justify-center font-black shadow-2xl transition-all z-10"
              title="Tutup Preview"
            >
              <i className="fas fa-times text-lg"></i>
            </button>
            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-800 max-w-full max-h-[85vh] p-3">
              <img
                src={resolveMediaUrl(previewImage)}
                alt="Preview Detail"
                onError={imageError}
                className="max-w-full max-h-[75vh] object-contain rounded-2xl mx-auto"
              />
              <div className="py-3 px-4 text-center">
                <button
                  onClick={() => setPreviewImage(null)}
                  className="px-6 py-2.5 bg-slate-900 dark:bg-slate-800 hover:bg-honey-600 text-white rounded-xl text-xs font-black shadow"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unified Registration Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-6 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-5 border border-slate-100 dark:border-slate-800 relative max-h-[92vh] overflow-y-auto custom-scrollbar">
            <button
              onClick={() => setIsFormOpen(false)}
              className="absolute top-6 right-6 w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 flex items-center justify-center font-bold transition-all"
            >
              <i className="fas fa-times"></i>
            </button>

            <div>
              <span className="bg-honey-50 text-honey-700 dark:bg-honey-950/50 dark:text-honey-400 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                Formulir Pendaftaran
              </span>
              <h3 className="text-xl font-black text-slate-900 dark:text-white mt-1">
                {selectedServiceType === 'CATERING' ? 'Pendaftaran Layanan Katering' : 'Pendaftaran Layanan Jemputan'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Lengkapi data di bawah ini untuk pengajuan layanan sekolah
                {targetMember.id !== user.id ? ` — atas nama ${targetMember.name}` : ''}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Nama Lengkap Siswa</label>
                <input
                  type="text"
                  required
                  value={formData.member_name}
                  onChange={e => setFormData({ ...formData, member_name: e.target.value })}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-honey-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Kelas & Rombel</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 4A"
                    value={formData.class_name}
                    onChange={e => setFormData({ ...formData, class_name: e.target.value })}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold text-slate-900 dark:text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Bulan Layanan</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: November 2026"
                    value={formData.target_month}
                    onChange={e => setFormData({ ...formData, target_month: e.target.value })}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Alamat Lengkap / Titik Jemput</label>
                <textarea
                  required
                  rows={2}
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold text-slate-900 dark:text-white outline-none"
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">No HP Ortu / Wali</label>
                  <input
                    type="text"
                    required
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold text-slate-900 dark:text-white outline-none"
                  />
                </div>

                {selectedServiceType === 'TRANSPORT' ? (
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Sub-Kategori Jemputan</label>
                    <select
                      value={formData.sub_category}
                      onChange={e => setFormData({ ...formData, sub_category: e.target.value })}
                      className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold text-slate-900 dark:text-white outline-none"
                    >
                      <option value="Pulang Pergi (PP)">Pulang Pergi (PP)</option>
                      <option value="Hanya Berangkat / Pulang Saja">Hanya Berangkat / Pulang Saja (One-Way)</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Pilih Vendor Katering</label>
                    <select
                      value={formData.vendor_name}
                      onChange={e => setFormData({ ...formData, vendor_name: e.target.value })}
                      className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold text-slate-900 dark:text-white outline-none"
                    >
                      {cateringOfferings.map(c => (
                        <option key={c.id} value={c.vendor_or_fleet}>{c.vendor_or_fleet}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Terms & Conditions Box */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                <h5 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                  <i className="fas fa-file-contract text-honey-500"></i>
                  Syarat &amp; Ketentuan Layanan
                </h5>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  1. Pembayaran tagihan layanan diterbitkan setiap awal bulan.<br/>
                  2. Ketentuan pembatalan/refund: 1-5 hari (50%), 6-12 hari (75%), &gt;12 hari (100%).<br/>
                  3. Siswa diharapkan siap 10 menit sebelum jadwal penjemputan/pengantaran.
                </p>
                <label className="flex items-center gap-2 pt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedTerms}
                    onChange={e => setAgreedTerms(e.target.checked)}
                    className="w-4 h-4 accent-honey-600 rounded"
                  />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Saya menyetujui seluruh Syarat &amp; Ketentuan di atas</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 bg-honey-600 hover:bg-honey-700 text-white rounded-2xl text-xs font-black shadow-lg shadow-honey-600/30 transition-all flex items-center justify-center gap-2"
              >
                {submitting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
                <span>Kirim Pengajuan Layanan</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Payment Confirmation Modal */}
      {payModalBill && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-6 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-5 border border-slate-100 dark:border-slate-800 relative">
            <button
              onClick={() => setPayModalBill(null)}
              className="absolute top-6 right-6 w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 flex items-center justify-center font-bold"
            >
              <i className="fas fa-times"></i>
            </button>

            <div>
              <span className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                Pembayaran Tagihan
              </span>
              <h3 className="text-xl font-black text-slate-900 dark:text-white mt-1">Konfirmasi Pembayaran</h3>
              <p className="text-xs text-slate-500 font-medium">{payModalBill.details} — Rp {Number(payModalBill.amount).toLocaleString('id-ID')}</p>
            </div>

            <div className="space-y-3">
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500">Pilih Metode Pembayaran</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('DEPOSIT')}
                  className={`p-4 rounded-2xl border text-left transition-all ${paymentMethod === 'DEPOSIT' ? 'bg-honey-50 dark:bg-honey-950/40 border-honey-500 text-honey-700 dark:text-honey-400 font-black' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold'}`}
                >
                  <i className="fas fa-wallet text-lg mb-1 block"></i>
                  <span className="text-xs">Potong Saldo Deposit</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('TRANSFER')}
                  className={`p-4 rounded-2xl border text-left transition-all ${paymentMethod === 'TRANSFER' ? 'bg-honey-50 dark:bg-honey-950/40 border-honey-500 text-honey-700 dark:text-honey-400 font-black' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold'}`}
                >
                  <i className="fas fa-university text-lg mb-1 block"></i>
                  <span className="text-xs">Transfer / Bukti Bayar</span>
                </button>
              </div>

              {paymentMethod === 'TRANSFER' && (
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Keterangan / Nomor Referensi Transfer</label>
                  <input
                    type="text"
                    placeholder="Contoh: Transfer BCA a.n Ortu Najla"
                    value={paymentProof}
                    onChange={e => setPaymentProof(e.target.value)}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold text-slate-900 dark:text-white outline-none"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={handlePayBill}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 mt-4"
              >
                <i className="fas fa-check-circle"></i>
                <span>Proses Pembayaran Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
