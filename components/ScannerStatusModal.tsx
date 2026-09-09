import React, { useState, useEffect } from 'react';
import { useHardwareScanner } from '../hooks/useHardwareScanner';

interface ScannerStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ScannerStatusModal: React.FC<ScannerStatusModalProps> = ({ isOpen, onClose }) => {
  const [testLog, setTestLog] = useState<{ code: string; time: string; speed: string }[]>([]);
  const [manualInput, setManualInput] = useState('');
  const [isTestedOk, setIsTestedOk] = useState(false);

  const { lastScannedCode, lastScanTimestamp } = useHardwareScanner({
    enabled: isOpen,
    onScan: (scanned) => {
      const nowStr = new Date().toLocaleTimeString('id-ID');
      setTestLog(prev => [{ code: scanned, time: nowStr, speed: 'Sangat Cepat (Hardware HID)' }, ...prev.slice(0, 4)]);
      setIsTestedOk(true);
    }
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[2.5rem] max-w-lg w-full p-8 shadow-2xl border border-slate-100 flex flex-col space-y-6">
        
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-inner ${isTestedOk ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
              <i className="fas fa-barcode"></i>
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Status Scanner Barcode</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Deteksi Alat Scanner Hardware (USB / Wireless)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-800 transition-colors">
            <i className="fas fa-times text-lg"></i>
          </button>
        </div>

        {/* Live Connectivity Badge */}
        <div className={`p-5 rounded-3xl border flex items-center justify-between ${isTestedOk ? 'bg-emerald-50/80 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center gap-3">
            <span className="relative flex h-3.5 w-3.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isTestedOk ? 'bg-emerald-400' : 'bg-blue-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${isTestedOk ? 'bg-emerald-500' : 'bg-blue-500'}`}></span>
            </span>
            <div>
              <p className="text-xs font-black uppercase text-slate-800">
                {isTestedOk ? 'Alat Scanner Terverifikasi & Aktif' : 'Sistem Siap Menerima Sinyal Scanner'}
              </p>
              <p className="text-[9px] text-slate-500 font-medium mt-0.5">
                {isTestedOk ? 'Sinyal input dari alat scanner berhasil diterima.' : 'Gunakan alat scanner fisik untuk membaca barcode di bawah ini.'}
              </p>
            </div>
          </div>
          {isTestedOk && (
            <span className="px-3 py-1 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-md shadow-emerald-200">
              OK
            </span>
          )}
        </div>

        {/* Test Scanner Area */}
        <div className="space-y-3">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">
            Area Uji Coba Input Barcode Hardware:
          </label>
          <div className="relative">
            <input 
              autoFocus
              data-barcode-input="true"
              placeholder="Arahkan scanner & tembak barcode apapun ke sini..."
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && manualInput.trim()) {
                  const nowStr = new Date().toLocaleTimeString('id-ID');
                  setTestLog(prev => [{ code: manualInput.trim(), time: nowStr, speed: 'Input Keyboard / Scanner' }, ...prev.slice(0, 4)]);
                  setIsTestedOk(true);
                  setManualInput('');
                }
              }}
              className="w-full p-4 pl-12 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-sm font-bold text-slate-800 outline-none focus:ring-4 focus:ring-blue-500/10 shadow-inner"
            />
            <i className="fas fa-barcode absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg"></i>
          </div>
          <p className="text-[9px] text-slate-400 italic">
            * Alat scanner fisik (Barcode Gun / Desktop Scanner) bekerja otomatis memicu tombol Enter setelah membaca barcode.
          </p>
        </div>

        {/* Scan Log History */}
        {testLog.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Riwayat Sinyal Terakhir:</p>
            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
              {testLog.map((log, idx) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                  <span className="font-mono font-bold text-slate-800">{log.code}</span>
                  <div className="text-right">
                    <span className="text-[9px] font-bold text-emerald-600 block">{log.speed}</span>
                    <span className="text-[8px] text-slate-400">{log.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Informational Footer */}
        <div className="p-4 bg-amber-50/70 border border-amber-100 rounded-2xl text-[10px] text-amber-800 space-y-1">
          <p className="font-black uppercase flex items-center gap-1.5">
            <i className="fas fa-info-circle"></i> Catatan Konfigurasi Scanner HID:
          </p>
          <p className="leading-relaxed opacity-90">
            Aplikasi secara otomatis mendeteksi input cepat dari alat scanner di semua menu (Kasir POS, Invetaris, Membership). Tidak memerlukan driver khusus.
          </p>
        </div>

        {/* Footer Buttons */}
        <div className="flex justify-end pt-2">
          <button 
            onClick={onClose}
            className="w-full py-3.5 bg-slate-900 hover:bg-black text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-slate-900/10 active:scale-95"
          >
            Selesai
          </button>
        </div>

      </div>
    </div>
  );
};
