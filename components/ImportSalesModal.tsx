
import React, { useState } from 'react';
import { User } from '../types';
import apiService from '../services/apiService';
// @ts-ignore
import * as XLSX from 'xlsx';

interface ImportSalesModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onRefresh: () => void;
}

const ImportSalesModal: React.FC<ImportSalesModalProps> = ({ isOpen, onClose, user, onRefresh }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [updateStock, setUpdateStock] = useState(false);
  const [logs, setLogs] = useState<{ type: 'success' | 'error', message: string }[]>([]);
  const [fileData, setFileData] = useState<any[] | null>(null);

  if (!isOpen) return null;

  const downloadTemplate = () => {
    const headers = [
      ['Date', 'Transaction_ID', 'SKU', 'Quantity', 'Selling_Price', 'Payment_Method', 'Customer_Name', 'Notes'],
      ['2024-01-01 10:00:00', 'TXN-001', 'SKU001', 2, 15000, 'CASH', 'Budi', 'Data Lama'],
      ['2024-01-01 10:00:00', 'TXN-001', 'SKU002', 1, 5000, 'CASH', 'Budi', 'Data Lama'],
      ['2024-01-02 14:30:00', '', 'SKU003', 5, 20000, 'DEBIT', 'Ani', '']
    ];
    const ws = XLSX.utils.aoa_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template_Import");
    XLSX.writeFile(wb, "Template_Import_Penjualan.xlsx");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);
      setFileData(data);
      setLogs([{ type: 'success', message: `File terbaca: ${data.length} baris ditemukan.` }]);
    };
    reader.readAsBinaryString(file);
  };

  const startImport = async () => {
    if (!fileData || fileData.length === 0) return;
    setIsProcessing(true);
    setProgress(0);
    setLogs([]);

    // Group items by Transaction_ID first to ensure a transaction isn't split across batches
    const groupedTransactions: Record<string, any[]> = {};
    const individualItems: any[] = [];

    fileData.forEach((item, index) => {
      const txId = item.Transaction_ID;
      if (txId) {
        if (!groupedTransactions[txId]) groupedTransactions[txId] = [];
        groupedTransactions[txId].push(item);
      } else {
        // Items without ID are treated as unique transactions
        individualItems.push([item]);
      }
    });

    const allBatches = [...Object.values(groupedTransactions), ...individualItems];
    
    // We process in batches of grouped transactions
    const batchSize = 20; // Number of transactions per request
    const totalSteps = Math.ceil(allBatches.length / batchSize);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < totalSteps; i++) {
      const currentBatchTransactions = allBatches.slice(i * batchSize, (i + 1) * batchSize);
      // Flatten the batch of transactions back into a list of items for the API
      const itemsToUpload = currentBatchTransactions.flat();
      
      try {
        const res = await apiService.request('/import_sales.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: itemsToUpload,
            updateStock,
            staffId: user.name
          })
        });

        if (res.status === 'success') {
          // Count items in this batch
          const batchItemCount = itemsToUpload.length;
          successCount += batchItemCount;
          
          if (res.details && res.details.length > 0) {
             res.details.forEach((d: any) => {
               if (d.status === 'error') {
                 // Find how many items were in this failed transaction
                 const failedTx = currentBatchTransactions.find(tx => 
                   (tx[0].Transaction_ID && tx[0].Transaction_ID === d.ref) || 
                   (!tx[0].Transaction_ID && d.ref.startsWith('IMP-'))
                 );
                 const failedCount = failedTx ? failedTx.length : 1;
                 
                 errorCount += failedCount;
                 successCount -= failedCount;
                 setLogs(prev => [...prev, { type: 'error', message: `Ref ${d.ref}: ${d.message}` }]);
               }
             });
          }
        } else {
          errorCount += itemsToUpload.length;
          setLogs(prev => [...prev, { type: 'error', message: `Batch ${i+1} Gagal: ${res.message}` }]);
        }
      } catch (err: any) {
        errorCount += itemsToUpload.length;
        setLogs(prev => [...prev, { type: 'error', message: `Error Batch ${i+1}: ${err.message}` }]);
      }
      
      const currentProgress = Math.round(((i + 1) / totalSteps) * 100);
      setProgress(currentProgress);
    }

    setLogs(prev => [...prev, { type: 'success', message: `Import Selesai! Total Item Berhasil: ${successCount}, Gagal: ${errorCount}` }]);
    setIsProcessing(false);
    // Remove automatic onRefresh() so user can see the logs
  };

  return (
    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[350] flex items-center justify-center p-4">
      <div className="bg-white rounded-[3rem] shadow-2xl max-w-2xl w-full p-10 animate-in zoom-in duration-300 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-2xl font-black uppercase text-slate-800 tracking-tight">Import Data Penjualan</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Integrasi Data Historis Ke Sistem</p>
          </div>
          <button onClick={() => { if (!isProcessing) { onClose(); onRefresh(); } }} className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-all">
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pr-2">
          {/* Step 1: Template */}
          <div className="bg-blue-50 p-6 rounded-[2rem] border border-blue-100">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center text-xl shadow-lg shadow-blue-200">
                <i className="fas fa-file-excel"></i>
              </div>
              <div className="flex-1">
                <h4 className="font-black text-blue-900 text-sm uppercase">1. Unduh Template</h4>
                <p className="text-[10px] text-blue-700/70 font-bold mt-1 leading-relaxed">Gunakan format Excel standar agar data terbaca sempurna oleh sistem.</p>
                <button onClick={downloadTemplate} className="mt-4 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:bg-blue-700 transition-all active:scale-95">
                  Download Template .xlsx
                </button>
              </div>
            </div>
          </div>

          {/* Step 2: Options */}
          <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-200">
            <h4 className="font-black text-slate-800 text-sm uppercase mb-4">2. Pengaturan Import</h4>
            <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div>
                <p className="text-xs font-black text-slate-700">Update Stok Produk?</p>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Aktifkan jika ingin stok saat ini berkurang</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={updateStock} onChange={() => setUpdateStock(!updateStock)} />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>

          {/* Step 3: Upload */}
          <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-200">
            <h4 className="font-black text-slate-800 text-sm uppercase mb-4">3. Pilih File</h4>
            <input 
              type="file" 
              accept=".xlsx, .xls" 
              onChange={handleFileChange}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:text-[10px] file:font-black file:uppercase file:bg-slate-900 file:text-white hover:file:bg-black cursor-pointer"
            />
          </div>

          {/* Progress & Logs */}
          {(isProcessing || logs.length > 0) && (
            <div className="space-y-4">
              {isProcessing && (
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                    <span>Proses Import...</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${progress}%` }}></div>
                  </div>
                </div>
              )}
              
              <div className="bg-slate-900 rounded-2xl p-4 max-h-40 overflow-y-auto custom-scrollbar font-mono text-[9px]">
                {logs.map((log, i) => (
                  <p key={i} className={log.type === 'error' ? 'text-rose-400' : 'text-emerald-400'}>
                    [{new Date().toLocaleTimeString()}] {log.message}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-slate-100">
          <button 
            disabled={!fileData || isProcessing}
            onClick={startImport}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-black transition-all active:scale-95 disabled:opacity-30 flex items-center justify-center gap-3"
          >
            {isProcessing ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-cloud-upload-alt"></i>}
            <span>{isProcessing ? 'Sedang Mengimport...' : 'Mulai Import Data'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportSalesModal;
