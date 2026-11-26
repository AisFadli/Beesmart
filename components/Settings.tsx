
import React, { useState, useRef } from 'react';
import { StoreSettings, UserRole, ShippingRate, Category } from '../types';
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

  const isAdmin = (userRole || '').toString().toUpperCase() === 'ADMIN';

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
        <div className="bg-honey-50 border border-honey-100 p-4 rounded-2xl flex items-center gap-4 text-honey-700">
          <i className="fas fa-info-circle text-xl"></i>
          <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">Role Staff: Anda hanya diperbolehkan mengatur konfigurasi printer bluetooth dan auto-print.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className={`bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 space-y-4 ${!isAdmin ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-2">
                <i className="fas fa-store text-honey-500"></i> Informasi Toko
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
                <input name="footer" value={formData.footer} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-honey-600" placeholder="Contoh: Terima Kasih Atas Kunjungan Anda" />
              </div>
              <div className="md:col-span-1">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Latitude Lokasi Toko</label>
                <input name="latitude" type="number" step="any" value={formData.latitude || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold" />
              </div>
              <div className="md:col-span-1">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Longitude Lokasi Toko</label>
                <div className="flex gap-2">
                   <input name="longitude" type="number" step="any" value={formData.longitude || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold" />
                   <button type="button" onClick={detectLocation} className="p-3 bg-honey-100 text-honey-600 rounded-xl hover:bg-honey-200 transition-colors" title="Deteksi Lokasi"><i className="fas fa-location-arrow"></i></button>
                </div>
              </div>
            </div>
          </div>


          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 space-y-4">
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-2">
              <span className="text-honey-600"><i className="fas fa-barcode"></i></span> Alat Scanner Barcode Hardware (USB / Bluetooth)
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
              <button type="button" onClick={handleConnectBluetooth} disabled={isConnecting} className="bg-honey-600 text-white px-6 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2">
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
                  <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-honey-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
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
                <p className="text-[9px] font-bold text-slate-400 italic bg-honey-50 p-4 rounded-2xl border border-honey-100 leading-relaxed">PENTING: Jarak dihitung berdasarkan radius KM dari koordinat toko. Jika jarak member melebihi radius terjauh yang terdaftar, maka sistem akan menganggap alamat tidak terjangkau.</p>
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
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="text-[10px] font-black uppercase tracking-widest text-honey-600 hover:text-honey-700">Ganti Gambar QRIS</button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/png" onChange={handleImageUpload} className="hidden" />
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

    </div>
  );
};

export default Settings;
