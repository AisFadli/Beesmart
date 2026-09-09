
import React, { useState, useRef } from 'react';
import { StoreSettings, UserRole, ShippingRate, Category, User } from '../types';
import { Icons } from '../constants';
import printService from '../services/printService';
import apiService from '../services/apiService';
import { ScannerStatusModal } from './ScannerStatusModal';

interface SettingsProps {
  settings: StoreSettings;
  userRole: UserRole;
  shippingRates: ShippingRate[];
  categories?: Category[];
  onSave: (settings: StoreSettings) => void;
  onRefresh: () => void;
}

const Settings: React.FC<SettingsProps> = ({ settings, userRole, shippingRates, categories = [] as Category[], onSave, onRefresh }) => {
  const [formData, setFormData] = useState<StoreSettings>(settings);
  const [isSaved, setIsSaved] = useState(false);
  const [btStatus, setBtStatus] = useState(printService.isConnected ? "Terhubung" : "Terputus");
  const [isConnecting, setIsConnecting] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);

  // User & Tenant Management State
  const [usersList, setUsersList] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [userForm, setUserForm] = useState({
    id: '',
    name: '',
    email: '',
    role: 'STAFF' as 'ADMIN' | 'STAFF' | 'TENANT',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
    password: '',
    tenantCategories: [] as string[]
  });

  const rawRole = (userRole || '').toString().toUpperCase();
  const isAdmin = rawRole === 'ADMIN';

  const fetchUsers = async () => {
    if (!isAdmin) return;
    setIsLoadingUsers(true);
    try {
      const res = await apiService.request('/users.php');
      if (Array.isArray(res)) {
        setUsersList(res);
      }
    } catch (err) {
      console.error("Gagal mengambil data user:", err);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  React.useEffect(() => {
    fetchUsers();
  }, [isAdmin]);

  const handleOpenAddUser = () => {
    setUserForm({
      id: '',
      name: '',
      email: '',
      role: 'TENANT',
      status: 'ACTIVE',
      password: '',
      tenantCategories: []
    });
    setShowUserModal(true);
  };

  const handleOpenEditUser = (u: User) => {
    setUserForm({
      id: u.id,
      name: u.name,
      email: u.email,
      role: (u.role as any) || 'STAFF',
      status: (u.status as any) || 'ACTIVE',
      password: '',
      tenantCategories: u.tenantCategories || []
    });
    setShowUserModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.name || !userForm.email) {
      alert("Nama dan Email wajib diisi!");
      return;
    }
    try {
      const payload = {
        id: userForm.id || undefined,
        name: userForm.name,
        email: userForm.email,
        role: userForm.role,
        status: userForm.status,
        password: userForm.password || undefined,
        tenantCategories: userForm.role === 'TENANT' ? userForm.tenantCategories : []
      };
      await apiService.request('/users.php', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      alert("Data user berhasil disimpan!");
      setShowUserModal(false);
      fetchUsers();
    } catch (err: any) {
      alert("Gagal menyimpan user: " + (err.message || 'Error'));
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus user ini?")) return;
    try {
      await apiService.request(`/users.php?id=${id}`, { method: 'DELETE' });
      fetchUsers();
    } catch (err: any) {
      alert(err.message || "Gagal menghapus user");
    }
  };

  const toggleCategoryForTenant = (catName: string) => {
    setUserForm(prev => {
      const exists = prev.tenantCategories.includes(catName);
      let updated = exists 
        ? prev.tenantCategories.filter(c => c !== catName)
        : [...prev.tenantCategories, catName];
      return { ...prev, tenantCategories: updated };
    });
  };

  React.useEffect(() => {
    const interval = setInterval(() => {
      const currentStatus = printService.isConnected;
      if (currentStatus && !btStatus.startsWith("Terhubung")) {
        setBtStatus("Terhubung");
      } else if (!currentStatus && btStatus.startsWith("Terhubung")) {
        setBtStatus("Terputus");
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [btStatus]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Shipping Rate Form State
  const [newRate, setNewRate] = useState({ minDistance: 0, maxDistance: 0, rate: 0 });
  const [isSavingRate, setIsSavingRate] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleToggleStore = () => {
    if (!isAdmin) return;
    setFormData(prev => ({ ...prev, isOpen: !prev.isOpen }));
  };

  const handleConnectBluetooth = async () => {
    if (!('bluetooth' in navigator)) {
      alert("Browser Anda tidak mendukung Web Bluetooth.");
      return;
    }
    setIsConnecting(true);
    try {
      const name = await printService.connect();
      setBtStatus(`Terhubung: ${name}`);
    } catch (error) {
      setBtStatus("Koneksi Gagal");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let val: any = value;
    if (type === 'checkbox') {
      val = (e.target as HTMLInputElement).checked;
    }
    setFormData(prev => ({ ...prev, [name]: val }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin) return;
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, qrisImage: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const detectLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData(prev => ({ ...prev, latitude: pos.coords.latitude, longitude: pos.coords.longitude }));
      },
      (err) => alert("Gagal mendeteksi lokasi: " + err.message)
    );
  };

  const handleAddRate = async () => {
    if (newRate.maxDistance <= newRate.minDistance || newRate.rate < 0) {
      alert("Input tarif tidak valid!");
      return;
    }
    setIsSavingRate(true);
    try {
      await apiService.request('/shipping_rates.php', {
        method: 'POST',
        body: JSON.stringify(newRate)
      });
      setNewRate({ minDistance: 0, maxDistance: 0, rate: 0 });
      onRefresh();
    } catch (e: any) { alert(e.message); }
    finally { setIsSavingRate(false); }
  };

  const handleDeleteRate = async (id: number) => {
    if (!confirm("Hapus tarif ini?")) return;
    try {
      await apiService.request(`/shipping_rates.php?id=${id}`, { method: 'DELETE' });
      onRefresh();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 px-4 md:px-0">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">System Settings</h1>
          <p className="text-slate-500 font-medium">Konfigurasi profil toko, perangkat, dan QRIS</p>
        </div>
        {isSaved && (
          <div className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl text-sm font-bold animate-bounce border border-emerald-200">
            <i className="fas fa-check-circle"></i> Berhasil Disimpan!
          </div>
        )}
      </div>

      {!isAdmin && (
        <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex items-center gap-4 text-blue-700">
          <i className="fas fa-info-circle text-xl"></i>
          <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">Role Staff: Anda hanya diperbolehkan mengatur konfigurasi printer bluetooth dan auto-print.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className={`bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 space-y-4 ${!isAdmin ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-2">
                <i className="fas fa-store text-blue-500"></i> Informasi Toko
              </h2>
              {!isAdmin && <span className="text-[8px] font-black uppercase bg-slate-100 px-2 py-1 rounded">Locked</span>}
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 mb-4">
               <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status Operasional Toko</p>
                  <div className="flex items-center gap-3">
                     <span className={`w-3 h-3 rounded-full animate-pulse ${formData.isOpen ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]'}`}></span>
                     <span className={`text-sm font-black uppercase tracking-widest ${formData.isOpen ? 'text-emerald-600' : 'text-rose-600'}`}>{formData.isOpen ? 'BUKA (Open)' : 'TUTUP (Closed)'}</span>
                  </div>
               </div>
               <button 
                 type="button" 
                 onClick={handleToggleStore}
                 className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${formData.isOpen ? 'bg-rose-100 text-rose-600 hover:bg-rose-600 hover:text-white' : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-600 hover:text-white'}`}
               >
                  {formData.isOpen ? 'Tutup Toko' : 'Buka Toko'}
               </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Nama Toko</label>
                <input name="name" value={formData.name} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Alamat</label>
                <textarea name="address" value={formData.address} onChange={handleChange} rows={2} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Footer Struk (Pesan Penutup)</label>
                <input name="footer" value={formData.footer} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-blue-600" placeholder="Contoh: Terima Kasih Atas Kunjungan Anda" />
              </div>
              <div className="md:col-span-1">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Latitude Lokasi Toko</label>
                <input name="latitude" type="number" step="any" value={formData.latitude || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold" />
              </div>
              <div className="md:col-span-1">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Longitude Lokasi Toko</label>
                <div className="flex gap-2">
                   <input name="longitude" type="number" step="any" value={formData.longitude || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold" />
                   <button type="button" onClick={detectLocation} className="p-3 bg-blue-100 text-blue-600 rounded-xl hover:bg-blue-200 transition-colors" title="Deteksi Lokasi"><i className="fas fa-location-arrow"></i></button>
                </div>
              </div>
            </div>
          </div>


          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 space-y-4">
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-2">
              <span className="text-blue-600"><i className="fas fa-barcode"></i></span> Alat Scanner Barcode Hardware (USB / Bluetooth)
            </h2>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status Deteksi Alat Scanner</p>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-sm font-black text-slate-700">HID Keyboard Listener Aktif</span>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowScannerModal(true)} 
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-md shadow-emerald-200 active:scale-95"
              >
                <i className="fas fa-[#]"></i> Uji Sinyal Scanner Hardware
              </button>
            </div>
            <p className="text-[9px] font-bold text-slate-400 italic">
              * Alat scanner fisik USB atau Bluetooth berfungsi langsung sebagai perangkat input keyboard. Klik tombol di atas untuk menguji sinyal tembak barcode.
            </p>
          </div>

          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 space-y-4">
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-2">
              <span className="text-emerald-500"><Icons.Printer /></span> Konfigurasi Printer Bluetooth
            </h2>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status Koneksi</p>
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${printService.isConnected ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                  <span className="text-sm font-black text-slate-700">{btStatus}</span>
                </div>
              </div>
              <button type="button" onClick={handleConnectBluetooth} disabled={isConnecting} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2">
                {isConnecting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-bluetooth"></i>} 
                Printer
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ukuran Kertas</label>
                <select name="printerType" value={formData.printerType} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700">
                  <option value="58mm">Thermal 58mm (Kecil)</option>
                  <option value="80mm">Thermal 80mm (Besar)</option>
                </select>
              </div>
              <div className="flex items-center gap-3 pt-6">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" name="autoPrint" checked={formData.autoPrint} onChange={handleChange} className="sr-only peer" />
                  <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
                <span className="text-sm font-bold text-slate-700">Auto-Print</span>
              </div>
            </div>
          </div>

          {isAdmin && (
             <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-200 space-y-6">
                <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <i className="fas fa-truck-loading text-rose-500"></i> Pengaturan Tarif Pengiriman (Radius KM)
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                   <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Dari (KM)</label>
                      <input type="number" step="0.1" value={newRate.minDistance} onChange={e => setNewRate(prev => ({ ...prev, minDistance: parseFloat(e.target.value) }))} className="w-full px-4 py-2 border rounded-xl font-bold" />
                   </div>
                   <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Sampai (KM)</label>
                      <input type="number" step="0.1" value={newRate.maxDistance} onChange={e => setNewRate(prev => ({ ...prev, maxDistance: parseFloat(e.target.value) }))} className="w-full px-4 py-2 border rounded-xl font-bold" />
                   </div>
                   <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Tarif (Rp)</label>
                      <input type="number" value={newRate.rate} onChange={e => setNewRate(prev => ({ ...prev, rate: parseInt(e.target.value) }))} className="w-full px-4 py-2 border rounded-xl font-bold" />
                   </div>
                   <div className="flex items-end">
                      <button type="button" onClick={handleAddRate} disabled={isSavingRate} className="w-full bg-slate-900 text-white py-2 rounded-xl font-black text-[10px] uppercase shadow-lg shadow-black/10 active:scale-95 transition-all">Tambah</button>
                   </div>
                </div>

                <div className="overflow-x-auto">
                   <table className="w-full text-left">
                      <thead>
                        <tr className="text-[9px] uppercase font-black text-slate-400 tracking-widest px-4 border-b">
                           <th className="py-4 px-4">Radius Jarak (KM)</th>
                           <th className="py-4">Tarif Ongkir</th>
                           <th className="py-4 text-right pr-4">Opsi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y text-[11px] font-bold text-slate-700">
                         {shippingRates.map(r => (
                           <tr key={r.id}>
                              <td className="py-4 px-4">{r.minDistance} KM - {r.maxDistance} KM</td>
                              <td className="py-4">Rp {r.rate.toLocaleString()}</td>
                              <td className="py-4 text-right pr-4">
                                 <button type="button" onClick={() => handleDeleteRate(r.id)} className="text-rose-500 hover:text-rose-700"><i className="fas fa-trash"></i></button>
                              </td>
                           </tr>
                         ))}
                         {shippingRates.length === 0 && <tr><td colSpan={3} className="py-10 text-center text-slate-300 uppercase tracking-widest italic">Belum ada tarif radius</td></tr>}
                      </tbody>
                   </table>
                </div>
                <p className="text-[9px] font-bold text-slate-400 italic bg-blue-50 p-4 rounded-2xl border border-blue-100 leading-relaxed">PENTING: Jarak dihitung berdasarkan radius KM dari koordinat toko. Jika jarak member melebihi radius terjauh yang terdaftar, maka sistem akan menganggap alamat tidak terjangkau.</p>
             </div>
          )}

          {isAdmin && (
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 space-y-4">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-2">
                <i className="fas fa-wallet text-amber-500"></i> Panduan & Instruksi Top Up Saldo
              </h2>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Instruksi Pembayaran (Tampil di Member App)</label>
                <textarea 
                  name="topUpInstructions" 
                  value={formData.topUpInstructions || ''} 
                  onChange={handleChange} 
                  rows={8} 
                  className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-medium text-xs leading-relaxed" 
                  placeholder="Tuliskan nomor rekening, nama bank, dan cara transfer di sini..."
                />
                <p className="text-[9px] font-bold text-slate-400 mt-2 px-2 italic">Teks ini akan muncul saat member melakukan pengajuan top up sebagai panduan pembayaran.</p>
              </div>
            </div>
          )}

          {isAdmin && (
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 space-y-4">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-2">
                <i className="fas fa-qrcode text-emerald-500"></i> QRIS Statis (.PNG)
              </h2>
              <div className="flex flex-col md:flex-row gap-6 items-center">
                <div onClick={() => fileInputRef.current?.click()} className="w-32 h-32 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center overflow-hidden cursor-pointer group hover:bg-emerald-50 hover:border-emerald-200 transition-all">
                  {formData.qrisImage ? <img src={formData.qrisImage} className="w-full h-full object-contain" /> : <i className="fas fa-cloud-upload-alt text-2xl text-slate-300 group-hover:text-emerald-400"></i>}
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Petunjuk:</p>
                  <p className="text-xs text-slate-500 leading-relaxed mb-4">Upload gambar QRIS statis toko Anda untuk ditampilkan pada struk digital dan fisik jika menggunakan pembayaran QRIS.</p>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700">Ganti Gambar QRIS</button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/png" onChange={handleImageUpload} className="hidden" />
              </div>
            </div>
          )}

          {isAdmin && (
            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-200 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <i className="fas fa-users-cog text-indigo-600"></i> Manajemen User, Staff & Tenant
                  </h2>
                  <p className="text-slate-500 font-medium text-xs mt-1">Kelola akun akses Staff & Tenant serta pembatasan kategori produk untuk Tenant</p>
                </div>
                <button 
                  type="button" 
                  onClick={handleOpenAddUser} 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-200 transition-all active:scale-95 flex items-center gap-2 self-start sm:self-auto"
                >
                  <i className="fas fa-user-plus"></i> Tambah User / Tenant
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[9px] uppercase font-black text-slate-400 tracking-widest px-4 border-b">
                      <th className="py-4 px-4">Pengguna</th>
                      <th className="py-4">Role</th>
                      <th className="py-4">Status</th>
                      <th className="py-4">Kategori Tenant Managed</th>
                      <th className="py-4 text-right pr-4">Opsi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-[11px] font-bold text-slate-700">
                    {usersList.map(u => (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="py-4 px-4">
                          <div>
                            <p className="font-black text-slate-800">{u.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{u.email}</p>
                          </div>
                        </td>
                        <td className="py-4">
                          <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${
                            u.role === 'ADMIN' ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                            u.role === 'TENANT' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="py-4">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${u.status === 'INACTIVE' ? 'bg-slate-100 text-slate-400' : 'bg-emerald-50 text-emerald-600'}`}>
                            {u.status || 'ACTIVE'}
                          </span>
                        </td>
                        <td className="py-4">
                          {u.role === 'TENANT' ? (
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {u.tenantCategories && u.tenantCategories.length > 0 ? (
                                u.tenantCategories.map(cat => (
                                  <span key={cat} className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-[9px] font-black border border-amber-200 uppercase">
                                    {cat}
                                  </span>
                                ))
                              ) : (
                                <span className="text-slate-400 italic text-[10px]">Semua / Belum diatur</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="py-4 text-right pr-4">
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => handleOpenEditUser(u)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Edit User">
                              <i className="fas fa-edit"></i>
                            </button>
                            {u.role !== 'ADMIN' && (
                              <button type="button" onClick={() => handleDeleteUser(u.id)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-all" title="Hapus User">
                                <i className="fas fa-trash"></i>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {usersList.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-slate-300 uppercase tracking-widest italic">
                          {isLoadingUsers ? 'Memuat data user...' : 'Belum ada data user'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black shadow-xl transition-all active:scale-95 text-sm uppercase tracking-widest hover:bg-black">
            Simpan Pengaturan Ke Database
          </button>
        </div>

        <div className="space-y-4">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">Preview Struk Thermal</h2>
          <div className={`bg-white shadow-2xl border border-slate-200 mx-auto transition-all overflow-hidden sticky top-8 rounded-xl ${formData.printerType === '58mm' ? 'w-52' : 'w-64'}`}>
            <div className="p-4 font-mono text-[10px] text-slate-800 space-y-2 text-center">
              <p className="font-black text-xs uppercase leading-tight mb-1">{formData.name || 'NAMA TOKO'}</p>
              <p className="text-[8px] opacity-70 leading-tight">{formData.address || 'Alamat...'}</p>
              <p className="border-b border-dashed border-slate-300 py-1"></p>
              <div className="flex justify-between"><span>CONTOH ITEM x1</span><span>10.000</span></div>
              <div className="border-t border-dashed border-slate-300 pt-1 font-black flex justify-between"><span>TOTAL</span><span>10.000</span></div>
              <p className="italic pt-4 opacity-70 font-black uppercase">{formData.footer || 'Terima Kasih Atas Kunjungan Anda'}</p>
            </div>
          </div>
        </div>
      </form>

      <ScannerStatusModal 
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
      />

      {/* User / Tenant Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-800">
                  {userForm.id ? 'Edit User / Tenant' : 'Tambah User / Tenant Baru'}
                </h3>
                <p className="text-xs text-slate-400 font-medium">Atur role dan hak akses kategori untuk Tenant</p>
              </div>
              <button type="button" onClick={() => setShowUserModal(false)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Nama Lengkap / Nama Tenant</label>
                <input 
                  type="text" 
                  required 
                  value={userForm.name} 
                  onChange={e => setUserForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500" 
                  placeholder="Contoh: Tenant Makanan A / Staff Kasir"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Email Access Login</label>
                <input 
                  type="email" 
                  required 
                  value={userForm.email} 
                  onChange={e => setUserForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500" 
                  placeholder="email@domain.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Role Akun</label>
                  <select 
                    value={userForm.role} 
                    onChange={e => setUserForm(prev => ({ ...prev, role: e.target.value as any }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="TENANT">TENANT (Akses Terbatas Kategori)</option>
                    <option value="STAFF">STAFF (Kasir / Operasional)</option>
                    <option value="ADMIN">ADMIN (Full Access)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</label>
                  <select 
                    value={userForm.status} 
                    onChange={e => setUserForm(prev => ({ ...prev, status: e.target.value as any }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  Password {userForm.id ? '(Kosongkan jika tidak diubah)' : '(Default: 123456 jika kosong)'}
                </label>
                <input 
                  type="password" 
                  value={userForm.password} 
                  onChange={e => setUserForm(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500" 
                  placeholder="******"
                />
              </div>

              {userForm.role === 'TENANT' && (
                <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 space-y-3">
                  <div>
                    <label className="block text-[10px] font-black text-amber-800 uppercase tracking-widest">
                      <i className="fas fa-store mr-1"></i> Pilih Kategori Produk Managed oleh Tenant Ini:
                    </label>
                    <p className="text-[10px] text-amber-600">User Tenant ini hanya dapat melihat dan mengelola produk dalam kategori yang dicentang di bawah.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-2 bg-white rounded-xl border border-amber-100">
                    {categories.map((cat: Category) => {
                      const isChecked = userForm.tenantCategories.includes(cat.name);
                      return (
                        <label key={cat.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border transition-all text-xs font-bold ${isChecked ? 'bg-amber-100/80 border-amber-300 text-amber-900' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                          <input 
                            type="checkbox" 
                            checked={isChecked} 
                            onChange={() => toggleCategoryForTenant(cat.name)}
                            className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                          />
                          <span className="uppercase">{cat.name}</span>
                        </label>
                      );
                    })}
                    {categories.length === 0 && (
                      <p className="col-span-2 text-center text-slate-400 text-xs italic py-2">Belum ada data kategori terdaftar</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowUserModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">
                  Batal
                </button>
                <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95">
                  Simpan User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
