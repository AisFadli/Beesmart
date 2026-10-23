import React, { useState, useEffect } from 'react';
import { User } from '../types';
import apiService from '../services/apiService';

interface AdminServicesManagementProps {
  user: User;
}

export const AdminServicesManagement: React.FC<AdminServicesManagementProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'REQUESTS' | 'OFFERINGS' | 'TARIFFS'>('REQUESTS');
  const [requests, setRequests] = useState<any[]>([]);
  const [offerings, setOfferings] = useState<any[]>([]);
  const [tariffs, setTariffs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Approval modal state
  const [approveModalReq, setApproveModalReq] = useState<any>(null);
  const [assignedWilayah, setAssignedWilayah] = useState('Wilayah A');
  const [effectiveDays, setEffectiveDays] = useState(20);
  const [customAmount, setCustomAmount] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  // CMS Offering modal state
  const [offeringModal, setOfferingModal] = useState<any>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const reqRes = await apiService.getServiceRequests();
      if (reqRes.status === 'success') setRequests(reqRes.requests || []);

      const offRes = await apiService.getServiceOfferings();
      if (offRes.status === 'success') setOfferings(offRes.offerings || []);

      const tarRes = await apiService.getServiceTariffs();
      if (tarRes.status === 'success') setTariffs(tarRes.tariffs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleApproveSubmit = async () => {
    if (!approveModalReq) return;
    try {
      const res = await apiService.approveServiceRequest({
        request_id: approveModalReq.id,
        assigned_wilayah: assignedWilayah,
        effective_days: effectiveDays,
        final_amount: customAmount ? parseFloat(customAmount) : null,
        admin_notes: adminNotes
      });
      if (res.status === 'success') {
        alert(res.message);
        setApproveModalReq(null);
        setCustomAmount('');
        setAdminNotes('');
        loadAll();
      } else {
        alert(res.message);
      }
    } catch (e: any) {
      alert('Gagal menyetujui pengajuan: ' + e.message);
    }
  };

  const handleDeleteRequest = async (id: number) => {
    if (!confirm('Hapus pengajuan ini (soft delete)? Data tetap tersimpan di audit log.')) return;
    try {
      const res = await apiService.deleteServiceRequest(id);
      if (res.status === 'success') {
        alert(res.message);
        loadAll();
      } else {
        alert(res.message);
      }
    } catch (e: any) {
      alert('Gagal menghapus: ' + e.message);
    }
  };

  const handleSaveOffering = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offeringModal) return;
    try {
      const res = await apiService.saveServiceOffering(offeringModal);
      if (res.status === 'success') {
        alert(res.message);
        setOfferingModal(null);
        loadAll();
      } else {
        alert(res.message);
      }
    } catch (e: any) {
      alert('Gagal menyimpan konten: ' + e.message);
    }
  };

  const handleDeleteOffering = async (id: number) => {
    if (!confirm('Hapus konten penawaran ini?')) return;
    try {
      const res = await apiService.deleteServiceOffering(id);
      if (res.status === 'success') {
        alert(res.message);
        loadAll();
      } else {
        alert(res.message);
      }
    } catch (e: any) {
      alert('Gagal menghapus: ' + e.message);
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800">
        <div>
          <span className="bg-honey-50 text-honey-700 dark:bg-honey-950/50 dark:text-honey-400 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
            Modul Operasional Admin
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1">Manajemen Layanan Sekolah</h2>
          <p className="text-xs text-slate-500 font-medium">Kelola pengajuan layanan, kustomisasi konten penawaran, &amp; tarif</p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl gap-1 w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('REQUESTS')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'REQUESTS' ? 'bg-honey-600 text-white shadow-md' : 'text-slate-600 dark:text-slate-300'}`}
          >
            Pengajuan ({requests.filter(r => r.status === 'PENDING').length})
          </button>
          <button
            onClick={() => setActiveTab('OFFERINGS')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'OFFERINGS' ? 'bg-honey-600 text-white shadow-md' : 'text-slate-600 dark:text-slate-300'}`}
          >
            CMS Penawaran
          </button>
          <button
            onClick={() => setActiveTab('TARIFFS')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'TARIFFS' ? 'bg-honey-600 text-white shadow-md' : 'text-slate-600 dark:text-slate-300'}`}
          >
            Tarif &amp; Biaya
          </button>
        </div>
      </div>

      {/* REQUESTS TAB */}
      {activeTab === 'REQUESTS' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-100 dark:border-slate-800 space-y-4">
          <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <i className="fas fa-clipboard-list text-honey-500"></i>
            Daftar Pengajuan Layanan Masuk
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-400 font-black uppercase tracking-wider">
                  <th className="p-3 rounded-l-xl">Siswa / Kelas</th>
                  <th className="p-3">Layanan &amp; Detail</th>
                  <th className="p-3">Bulan Layanan</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 rounded-r-xl text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold">
                {requests.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="p-3">
                      <div className="font-black text-slate-900 dark:text-white">{r.member_name}</div>
                      <div className="text-[11px] text-slate-400">Kelas: {r.class_name} · HP: {r.phone}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-black text-honey-600 dark:text-honey-400">{r.service_type}</div>
                      <div className="text-[11px] text-slate-500">{r.vendor_name || r.sub_category} ({r.address})</div>
                    </td>
                    <td className="p-3 font-bold text-slate-700 dark:text-slate-300">{r.target_month}</td>
                    <td className="p-3">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                        r.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' :
                        r.status === 'PENDING' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400' :
                        'bg-rose-100 text-rose-700'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-2">
                      {r.status === 'PENDING' && (
                        <button
                          onClick={() => setApproveModalReq(r)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black shadow-md transition-all"
                        >
                          <i className="fas fa-check mr-1"></i> Approve &amp; Tagih
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteRequest(r.id)}
                        className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white rounded-xl text-[10px] font-black transition-all"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))}
                {requests.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">Belum ada pengajuan layanan masuk.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CMS OFFERINGS TAB */}
      {activeTab === 'OFFERINGS' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-100 dark:border-slate-800 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <i className="fas fa-images text-honey-500"></i>
              Kelola Konten Penawaran &amp; Foto Vendor/Armada
            </h3>
            <button
              onClick={() => setOfferingModal({ service_type: 'CATERING', vendor_or_fleet: 'Vendor Baru', title: '', description: '', image_url: '', menu_or_facilities: '' })}
              className="px-4 py-2 bg-honey-600 hover:bg-honey-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5"
            >
              <i className="fas fa-plus"></i> Tambah Konten
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {offerings.map(off => (
              <div key={off.id} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-700 flex gap-4 items-center">
                <img src={off.image_url || '/app/logo/beesmart-logo.png'} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0 bg-white" />
                <div className="flex-1 min-w-0 space-y-1">
                  <span className="text-[9px] font-black uppercase tracking-wider bg-honey-100 text-honey-800 dark:bg-honey-950 dark:text-honey-400 px-2 py-0.5 rounded">
                    {off.service_type} · {off.vendor_or_fleet}
                  </span>
                  <h4 className="text-xs font-black text-slate-900 dark:text-white truncate">{off.title}</h4>
                  <p className="text-[11px] text-slate-500 truncate">{off.description}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <button onClick={() => setOfferingModal(off)} className="p-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs">
                    <i className="fas fa-edit"></i>
                  </button>
                  <button onClick={() => handleDeleteOffering(off.id)} className="p-2 bg-rose-500/10 text-rose-500 rounded-xl text-xs">
                    <i className="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TARIFFS TAB */}
      {activeTab === 'TARIFFS' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-100 dark:border-slate-800 space-y-4">
          <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <i className="fas fa-tags text-honey-500"></i>
            Pengaturan Tarif Wilayah &amp; Vendor
          </h3>
          <p className="text-xs text-slate-500">Tarif otomatis digunakan saat pengajuan disetujui (Admin dapat menyesuaikan saat approval).</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {tariffs.map(t => (
              <div key={t.id} className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-700 space-y-1">
                <span className="text-[9px] font-black uppercase tracking-wider text-honey-600">{t.service_type}</span>
                <div className="text-xs font-black text-slate-900 dark:text-white">{t.category_key} - {t.sub_category}</div>
                <div className="text-sm font-black text-emerald-600">Rp {Number(t.price).toLocaleString('id-ID')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approval Modal */}
      {approveModalReq && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-6 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-4 border border-slate-100 dark:border-slate-800 relative">
            <button onClick={() => setApproveModalReq(null)} className="absolute top-6 right-6 w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center font-bold">
              <i className="fas fa-times"></i>
            </button>
            <div>
              <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                Approval &amp; Terbit Tagihan
              </span>
              <h3 className="text-lg font-black text-slate-900 dark:text-white mt-1">Konfirmasi Pengajuan {approveModalReq.member_name}</h3>
              <p className="text-xs text-slate-500">Layanan: <span className="font-bold">{approveModalReq.service_type}</span> ({approveModalReq.target_month})</p>
            </div>

            <div className="space-y-3">
              {approveModalReq.service_type === 'TRANSPORT' ? (
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Pilih Wilayah Jemputan</label>
                  <select
                    value={assignedWilayah}
                    onChange={e => setAssignedWilayah(e.target.value)}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border rounded-2xl text-xs font-bold text-slate-900 dark:text-white outline-none"
                  >
                    <option value="Wilayah A">Wilayah A (Terdekat)</option>
                    <option value="Wilayah B">Wilayah B (Sedang)</option>
                    <option value="Wilayah C">Wilayah C (Jauh)</option>
                    <option value="Wilayah D">Wilayah D (Terjauh)</option>
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Jumlah Hari Efektif (Katering {approveModalReq.vendor_name})</label>
                  <input
                    type="number"
                    value={effectiveDays}
                    onChange={e => setEffectiveDays(parseInt(e.target.value) || 0)}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border rounded-2xl text-xs font-bold text-slate-900 dark:text-white outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Custom / Override Nominal Tarif (Opsional)</label>
                <input
                  type="number"
                  placeholder="Kosongkan jika sesuai kalkulasi sistem"
                  value={customAmount}
                  onChange={e => setCustomAmount(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border rounded-2xl text-xs font-bold text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Catatan Staff</label>
                <input
                  type="text"
                  placeholder="Catatan tambahan..."
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border rounded-2xl text-xs font-bold text-slate-900 dark:text-white outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleApproveSubmit}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 mt-4"
              >
                <i className="fas fa-check-circle"></i>
                <span>Setujui &amp; Terbitkan Tagihan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CMS Offering Modal */}
      {offeringModal && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-6 animate-fade-in">
          <form onSubmit={handleSaveOffering} className="bg-white dark:bg-slate-900 rounded-[2.5rem] max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-4 border relative max-h-[92vh] overflow-y-auto">
            <button type="button" onClick={() => setOfferingModal(null)} className="absolute top-6 right-6 w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center font-bold">
              <i className="fas fa-times"></i>
            </button>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Edit / Tambah Konten Penawaran</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Jenis Layanan</label>
                <select
                  value={offeringModal.service_type}
                  onChange={e => setOfferingModal({ ...offeringModal, service_type: e.target.value })}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border rounded-2xl text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="CATERING">CATERING</option>
                  <option value="TRANSPORT">TRANSPORT (JEMPUTAN)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Nama Vendor / Armada</label>
                <input
                  type="text"
                  required
                  value={offeringModal.vendor_or_fleet}
                  onChange={e => setOfferingModal({ ...offeringModal, vendor_or_fleet: e.target.value })}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border rounded-2xl text-xs font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Judul Penawaran</label>
                <input
                  type="text"
                  required
                  value={offeringModal.title}
                  onChange={e => setOfferingModal({ ...offeringModal, title: e.target.value })}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border rounded-2xl text-xs font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">URL Foto / Gambar (Contoh: /app/logo/...)</label>
                <input
                  type="text"
                  required
                  value={offeringModal.image_url}
                  onChange={e => setOfferingModal({ ...offeringModal, image_url: e.target.value })}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border rounded-2xl text-xs font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Deskripsi Singkat</label>
                <textarea
                  rows={2}
                  value={offeringModal.description}
                  onChange={e => setOfferingModal({ ...offeringModal, description: e.target.value })}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border rounded-2xl text-xs font-bold text-slate-900 dark:text-white"
                ></textarea>
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Detail Menu / Fasilitas Unit</label>
                <textarea
                  rows={2}
                  value={offeringModal.menu_or_facilities}
                  onChange={e => setOfferingModal({ ...offeringModal, menu_or_facilities: e.target.value })}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border rounded-2xl text-xs font-bold text-slate-900 dark:text-white"
                ></textarea>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-honey-600 hover:bg-honey-700 text-white rounded-2xl text-xs font-black shadow-lg transition-all"
              >
                Simpan Konten Penawaran
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
