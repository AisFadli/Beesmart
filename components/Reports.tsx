
import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, Product, StoreSettings, UserRole, User } from '../types';
import { Icons } from '../constants';
import printService from '../services/printService';
import apiService from '../services/apiService';
// @ts-ignore
import * as XLSX from 'xlsx';

interface ReportsProps {
  transactions: Transaction[]; // Still kept for initial/small data, but we'll fetch more
  products: Product[];
  settings: StoreSettings;
  userRole: UserRole;
  currentUser?: User | null;
  onDeleteTransaction: (id: string) => void;
  onUpdateTransaction: (tx: Transaction) => void;
}

const Reports: React.FC<ReportsProps> = ({ transactions: initialTransactions, products, settings, userRole, currentUser, onDeleteTransaction, onUpdateTransaction }) => {
  const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  
  const [selectedTxForPrint, setSelectedTxForPrint] = useState<Transaction | null>(null);
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);
  
  // Pagination & Server Data State
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState({ revenue: 0, profit: 0, unpaidCount: 0, indentCount: 0 });
  const [filterType, setFilterType] = useState<'ALL' | 'INDENT' | 'UNPAID'>('ALL');
  const limit = 20;

  // Confirm Payment Modal State
  const [txToConfirm, setTxToConfirm] = useState<Transaction | null>(null);
  
  // Confirm Indent Fulfillment State
  const [txToFulfill, setTxToFulfill] = useState<Transaction | null>(null);
  const [fulfillmentDate, setFulfillmentDate] = useState(new Date().toISOString().split('T')[0]);
  const [confDate, setConfDate] = useState(new Date().toISOString().split('T')[0]);
  const [confMethod, setConfMethod] = useState<'CASH' | 'DEBIT' | 'QRIS' | 'TRANSFER'>('CASH');
  const [confNotes, setConfNotes] = useState('');

  const rawRole = (userRole || '').toString().toUpperCase();
  const isAdmin = rawRole === 'ADMIN';
  const isStaff = rawRole === 'STAFF';
  const isTenant = rawRole === 'TENANT';
  const canConfirm = isAdmin || isStaff;

  const tenantCategories = useMemo(() => {
    if (!isTenant || !currentUser?.tenantCategories) return [];
    let raw: any = currentUser.tenantCategories;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch (e) {
        raw = raw.split(',').map(s => s.trim());
      }
    }
    if (Array.isArray(raw)) {
      return raw.map(c => String(c).trim().toUpperCase()).filter(Boolean);
    }
    return [];
  }, [isTenant, currentUser]);

  // Fetch Summary & Transactions when filters change
  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const userRoleParam = currentUser?.role ? `&role=${currentUser.role}` : '';
        const userIdParam = currentUser?.id ? `&userId=${encodeURIComponent(currentUser.id)}` : '';

        // Fetch Summary
        const summaryRes = await apiService.request(`/get_sales_summary.php?startDate=${startDate}&endDate=${endDate}${userRoleParam}${userIdParam}`);
        if (!active) return;
        if (summaryRes) {
          let calcRev = summaryRes.revenue || 0;
          let calcProf = summaryRes.profit || 0;
          if (isTenant && tenantCategories.length > 0 && Array.isArray(summaryRes.byCategory)) {
            const filteredCat = summaryRes.byCategory.filter((i: any) => tenantCategories.includes((i.category || '').trim().toUpperCase()));
            calcRev = filteredCat.reduce((s: number, i: any) => s + Number(i.total || 0), 0);
            const calcCost = filteredCat.reduce((s: number, i: any) => s + Number(i.cost || 0), 0);
            calcProf = calcRev - calcCost;
          }

          setSummary({
            revenue: calcRev,
            profit: calcProf,
            unpaidCount: summaryRes.unpaidCount || 0,
            indentCount: summaryRes.indentCount || 0
          });
        }

        // Fetch Paginated Transactions
        let url = `/get_transactions.php?startDate=${startDate}&endDate=${endDate}&page=${currentPage}&limit=${limit}&search=${encodeURIComponent(searchTerm)}&paymentMethod=${encodeURIComponent(paymentMethod)}${userRoleParam}${userIdParam}`;
        if (filterType === 'INDENT') url += '&transactionType=INDENT';
        if (filterType === 'UNPAID') url += '&paymentStatus=UNPAID';
        
        const txRes = await apiService.request(url);
        if (!active) return;
        if (txRes) {
          let rawTxs = txRes.transactions || [];
          if (isTenant && tenantCategories.length > 0) {
            rawTxs = rawTxs.filter((tx: Transaction) => {
              return (tx.items || []).some(item => {
                const prod = products.find(p => p.id === item.productId);
                const cat = prod?.category || item.category || '';
                return tenantCategories.includes(cat.trim().toUpperCase());
              });
            });
            setTransactions(rawTxs);
            setTotalCount(rawTxs.length);
            setTotalPages(Math.ceil(rawTxs.length / limit) || 1);
          } else {
            setTransactions(rawTxs);
            setTotalCount(txRes.totalCount ?? rawTxs.length);
            setTotalPages(txRes.totalPages ?? (Math.ceil((txRes.totalCount ?? rawTxs.length) / limit) || 1));
          }
        }
      } catch (err) {
        console.error("Failed to fetch report data:", err);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    fetchData();
    return () => { active = false; };
  }, [startDate, endDate, searchTerm, currentPage, paymentMethod, filterType, isTenant, tenantCategories, products, currentUser]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [startDate, endDate, searchTerm, filterType, paymentMethod]);

  const totalRevenue = summary.revenue;
  const totalProfit = summary.profit;
  const unpaidCount = summary.unpaidCount;

  const handleConfirmPaymentSubmit = async () => {
    if (!txToConfirm || !canConfirm) return;
    setIsUpdatingStatus(true);
    try {
      const updatedTx = {
        ...txToConfirm,
        paymentStatus: 'PAID' as const,
        paymentMethod: confMethod as any,
        timestamp: `${confDate}T${new Date().toLocaleTimeString('en-GB')}`,
        notes: (txToConfirm.notes || '') + (confNotes ? ` | Pelunasan: ${confNotes}` : " [LUNAS DI KONFIRMASI]")
      };
      
      await apiService.updateTransaction(updatedTx);
      onUpdateTransaction(updatedTx);
      
      // Update local state
      setTransactions(prev => prev.map(t => t.id === updatedTx.id ? updatedTx : t));
      
      setTxToConfirm(null);
      setConfNotes('');
      alert("Pelunasan berhasil disimpan!");
    } catch (e: any) { alert(e.message); }
    finally { setIsUpdatingStatus(false); }
  };

  const handleFulfillIndent = async () => {
    if (!txToFulfill || !canConfirm) return;
    setIsUpdatingStatus(true);
    try {
      const updatedTx = {
        ...txToFulfill,
        receivedAt: `${fulfillmentDate}T${new Date().toLocaleTimeString('en-GB')}`,
        notes: (txToFulfill.notes || '') + ` [PESANAN DITERIMA: ${fulfillmentDate}]`
      };
      
      await apiService.updateTransaction(updatedTx);
      onUpdateTransaction(updatedTx);
      
      setTransactions(prev => prev.map(t => t.id === updatedTx.id ? updatedTx : t));
      setTxToFulfill(null);
      alert("Konfirmasi penerimaan barang berhasil!");
    } catch (e: any) { alert(e.message); }
    finally { setIsUpdatingStatus(false); }
  };

  const exportToExcel = async () => {
    setIsLoading(true);
    try {
      // Fetch all data for export from the server
      const exportData = await apiService.request(`/get_export_data.php?startDate=${startDate}&endDate=${endDate}&search=${encodeURIComponent(searchTerm)}&paymentMethod=${encodeURIComponent(paymentMethod)}`);
      
      if (!exportData || !Array.isArray(exportData)) {
        throw new Error("Gagal mengambil data untuk export");
      }

      const headers = ['TANGGAL', 'ID TRANSAKSI', 'PELANGGAN', 'SKU', 'PRODUK', 'KATEGORI', 'QTY', 'HARGA JUAL', 'SUBTOTAL', 'HPP SATUAN', 'TOTAL HPP', 'PROFIT', 'STAFF', 'STATUS', 'METODE', 'CATATAN'];
      
      const rows = exportData.map((row: any) => {
        const isCancelled = row.status === 'CANCELLED';
        const qty = isCancelled ? 0 : Number(row.quantity);
        const subtotal = isCancelled ? 0 : Number(row.subtotal);
        const totalHpp = isCancelled ? 0 : Number(row.totalHpp);
        const profit = isCancelled ? 0 : (subtotal - totalHpp);
        
        return [
          row.timestamp,
          row.transactionId,
          row.customerName || 'Pelanggan Umum',
          row.sku || '-',
          row.productName,
          row.category,
          qty,
          Number(row.price),
          subtotal,
          Number(row.costPrice),
          totalHpp,
          profit,
          row.staffId,
          row.status,
          row.paymentMethod,
          row.notes || '-'
        ];
      });

      const worksheetData = [headers, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(worksheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Laporan Penjualan");
      
      // Save the file as .xlsx
      XLSX.writeFile(wb, `Laporan_Penjualan_${startDate}_sd_${endDate}.xlsx`);
    } catch (err: any) {
      console.error("Export failed:", err);
      alert("Gagal melakukan export: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <span className="p-2 bg-blue-600 text-white rounded-xl shadow-lg"><Icons.Reports /></span>
            Laporan & Profit
          </h1>
        </div>
        <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border shadow-sm">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 text-xs font-bold" />
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 text-xs font-bold" />
          <button onClick={exportToExcel} className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-xs font-black shadow-lg shadow-emerald-50 active:scale-95 transition-all"><i className="fas fa-file-excel mr-2"></i> Export Excel</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard label="Total Omzet" value={`Rp ${Number(totalRevenue).toLocaleString('id-ID')}`} color="blue" onClick={() => setFilterType('ALL')} active={filterType === 'ALL'} />
        <StatCard label="Keuntungan Bersih" value={`Rp ${Number(totalProfit).toLocaleString('id-ID')}`} color="emerald" isProfit onClick={() => setFilterType('ALL')} active={filterType === 'ALL'} />
        <StatCard label="Piutang" value={unpaidCount.toString()} color="amber" onClick={() => setFilterType('UNPAID')} active={filterType === 'UNPAID'} />
        <StatCard label="Pesanan Indent" value={summary.indentCount.toString()} color="rose" onClick={() => setFilterType('INDENT')} active={filterType === 'INDENT'} />
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-8 border-b bg-slate-50/30 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <h2 className="font-black text-slate-800 text-[10px] uppercase tracking-[0.2em]">Riwayat Transaksi</h2>
            {isLoading && <i className="fas fa-spinner fa-spin text-blue-600 text-xs"></i>}
            {filterType !== 'ALL' && (
              <button 
                onClick={() => setFilterType('ALL')} 
                className="bg-slate-200 text-slate-500 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest hover:bg-slate-300 transition-all"
              >
                Clear Filter: {filterType} <i className="fas fa-times ml-1"></i>
              </button>
            )}
          </div>
          <div className="relative w-full md:w-96">
            <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-400"><i className="fas fa-search"></i></span>
            <input 
              type="text" 
              placeholder="Cari ID, Nama Pelanggan, Produk, atau Kategori..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-2xl outline-none font-bold text-xs bg-white focus:ring-4 focus:ring-blue-500/5 transition-all" 
            />
          </div>
          <div className="w-full md:w-48">
            <select 
              value={paymentMethod} 
              onChange={e => setPaymentMethod(e.target.value)} 
              className="w-full p-3 border border-slate-200 rounded-2xl outline-none font-bold text-[10px] uppercase tracking-widest bg-white focus:ring-4 focus:ring-blue-500/5 transition-all"
            >
              <option value="">Semua Metode</option>
              <option value="CASH">CASH</option>
              <option value="TRANSFER">TRANSFER</option>
              <option value="QRIS">QRIS</option>
              <option value="DEBIT">DEBIT CARD</option>
              <option value="DEPOSIT">DEPOSIT MEMBER</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b text-slate-400 text-[9px] uppercase font-black tracking-widest">
                <th className="px-8 py-5">Identitas</th>
                <th className="px-8 py-5">Item Jual</th>
                <th className="px-8 py-5">Total Omzet</th>
                <th className="px-8 py-5">Status Bayar</th>
                <th className="px-8 py-5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {transactions.map(t => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-8 py-6">
                    <p className="font-black text-slate-800 uppercase text-xs">{t.customerName || 'Pelanggan Umum'}</p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{t.id} • {t.timestamp.split('T')[0]}</p>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {t.items.map((i, idx) => (
                        <span key={idx} className="bg-slate-100 text-slate-600 text-[8px] font-black px-1.5 py-0.5 rounded border border-slate-200 uppercase truncate">
                          {i.name} (x{i.quantity})
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-8 py-6 font-black text-blue-600">Rp {Number(t.total).toLocaleString('id-ID')}</td>
                  <td className="px-8 py-6">
                    <div className="flex flex-col gap-1">
                      <span className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest text-center ${t.status === 'CANCELLED' ? 'bg-slate-100 text-slate-400 border border-slate-200' : (t.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-600 border border-emerald-200' : 'bg-rose-100 text-rose-600 border border-rose-200 animate-pulse')}`}>
                        {t.status === 'CANCELLED' ? 'CANCELED' : (t.paymentStatus === 'PAID' ? 'TERBAYAR' : 'BELUM BAYAR')}
                      </span>
                      {t.transactionType === 'INDENT' && (
                        <span className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest text-center ${t.receivedAt ? 'bg-blue-100 text-blue-600 border border-blue-200' : 'bg-amber-100 text-amber-600 border border-amber-200'}`}>
                          {t.receivedAt ? 'INDENT SELESAI' : 'MENUNGGU STOK'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right space-x-2">
                    {t.paymentStatus === 'UNPAID' && canConfirm && (
                      <button onClick={() => setTxToConfirm(t)} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase shadow-lg shadow-emerald-50 hover:bg-emerald-700 transition-all">Pelunasan</button>
                    )}
                    {t.transactionType === 'INDENT' && !t.receivedAt && canConfirm && (
                      <button onClick={() => setTxToFulfill(t)} className="bg-rose-600 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase shadow-lg shadow-rose-50 hover:bg-rose-700 transition-all">Barang Diterima</button>
                    )}
                    <button onClick={() => setSelectedTxForPrint(t)} className="p-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm" title="Print Struk"><i className="fas fa-print"></i></button>
                    {isAdmin && <button onClick={() => setDeletingTxId(t.id)} className="p-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm" title="Hapus"><i className="fas fa-trash"></i></button>}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-20 text-center text-slate-300 font-black uppercase tracking-widest text-xs italic">Data transaksi tidak ditemukan</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-slate-100">
          {transactions.map(t => (
            <div key={t.id} className="p-4 flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-black text-slate-800 uppercase text-xs">{t.customerName || 'Pelanggan Umum'}</p>
                  <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">{t.id.slice(-8)} • {t.timestamp.split('T')[0]}</p>
                </div>
                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${t.status === 'CANCELLED' ? 'bg-slate-100 text-slate-400' : (t.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600')}`}>
                  {t.status === 'CANCELLED' ? 'CANCELED' : (t.paymentStatus === 'PAID' ? 'PAID' : 'UNPAID')}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {t.items.map((i, idx) => (
                  <span key={idx} className="bg-slate-50 text-slate-500 text-[7px] font-black px-1.5 py-0.5 rounded border border-slate-100 uppercase">
                    {i.name} (x{i.quantity})
                  </span>
                ))}
              </div>
              <div className="flex justify-between items-center">
                <p className="font-black text-blue-600 text-sm">Rp {Number(t.total).toLocaleString('id-ID')}</p>
                <div className="flex gap-2">
                  {t.paymentStatus === 'UNPAID' && canConfirm && (
                    <button onClick={() => setTxToConfirm(t)} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[8px] font-black uppercase">Lunas</button>
                  )}
                  <button onClick={() => setSelectedTxForPrint(t)} className="p-2 bg-slate-50 text-slate-400 rounded-lg border border-slate-200"><i className="fas fa-print"></i></button>
                  {isAdmin && <button onClick={() => setDeletingTxId(t.id)} className="p-2 bg-slate-50 text-slate-400 rounded-lg border border-slate-200"><i className="fas fa-trash"></i></button>}
                </div>
              </div>
            </div>
          ))}
          {transactions.length === 0 && <div className="p-10 text-center text-slate-300 font-black uppercase text-[10px]">Data tidak ditemukan</div>}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-8 bg-slate-50/50 border-t flex items-center justify-between">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Menampilkan {transactions.length} dari {totalCount} transaksi</p>
            <div className="flex items-center gap-2">
              <button 
                disabled={currentPage === 1 || isLoading} 
                onClick={() => setCurrentPage(p => p - 1)}
                className="w-10 h-10 flex items-center justify-center bg-white border rounded-xl text-slate-400 hover:text-blue-600 disabled:opacity-30 transition-all"
              >
                <i className="fas fa-chevron-left"></i>
              </button>
              <div className="flex gap-1">
                {[...Array(totalPages)].map((_, i) => (
                  <button 
                    key={i} 
                    onClick={() => setCurrentPage(i + 1)}
                    className={`w-10 h-10 rounded-xl text-[10px] font-black transition-all ${currentPage === i + 1 ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-white border text-slate-500 hover:bg-slate-50'}`}
                  >
                    {i + 1}
                  </button>
                )).slice(Math.max(0, currentPage - 3), Math.min(totalPages, currentPage + 2))}
              </div>
              <button 
                disabled={currentPage === totalPages || isLoading} 
                onClick={() => setCurrentPage(p => p + 1)}
                className="w-10 h-10 flex items-center justify-center bg-white border rounded-xl text-slate-400 hover:text-blue-600 disabled:opacity-30 transition-all"
              >
                <i className="fas fa-chevron-right"></i>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Indent Fulfillment Modal */}
      {txToFulfill && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-2xl z-[200] flex items-center justify-center p-4">
           <div className="bg-white rounded-[2rem] md:rounded-[3rem] p-10 max-w-sm w-full shadow-2xl animate-in zoom-in duration-300">
              <div className="flex flex-col items-center text-center mb-8">
                 <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center text-2xl mb-4 shadow-lg shadow-rose-50">
                    <i className="fas fa-box-open"></i>
                 </div>
                 <h3 className="text-xl font-black uppercase text-slate-900">Konfirmasi Barang</h3>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Pesanan Indent #{txToFulfill.id.slice(-8).toUpperCase()}</p>
              </div>

              <div className="space-y-6">
                 <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block ml-2">Tanggal Penerimaan</label>
                    <input type="date" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold shadow-inner" value={fulfillmentDate} onChange={e => setFulfillmentDate(e.target.value)} />
                 </div>
                 <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 italic text-[9px] text-amber-700 leading-relaxed font-bold">
                    Konfirmasi ini menandakan bahwa barang telah tersedia dan telah diserahkan kepada pelanggan.
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-10">
                 <button onClick={() => setTxToFulfill(null)} className="py-4 bg-slate-100 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-500">Batal</button>
                 <button onClick={handleFulfillIndent} disabled={isUpdatingStatus} className="py-4 bg-rose-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl shadow-rose-100">Konfirmasi</button>
              </div>
           </div>
        </div>
      )}

      {/* Confirmation Payment Modal */}
      {txToConfirm && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-2xl z-[200] flex items-center justify-center p-4">
           <div className="bg-white rounded-[2rem] md:rounded-[3rem] p-6 md:p-10 max-w-md w-full shadow-2xl animate-in zoom-in duration-300">
              <h3 className="text-lg md:text-xl font-black uppercase text-slate-900 mb-1 md:mb-2">Pelunasan Piutang</h3>
              <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6 md:mb-8 border-b pb-4">ID Transaksi: #{txToConfirm.id.slice(-8).toUpperCase()}</p>
              
              <div className="space-y-5">
                 <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 mb-1 block ml-2">Tanggal Bayar</label>
                    <input type="date" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={confDate} onChange={e => setConfDate(e.target.value)} />
                 </div>
                 <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 mb-1 block ml-2">Metode Pelunasan</label>
                    <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={confMethod} onChange={e => setConfMethod(e.target.value as any)}>
                       <option value="CASH">Tunai (Cash)</option>
                       <option value="TRANSFER">Transfer Bank</option>
                       <option value="QRIS">QRIS</option>
                       <option value="DEBIT">Debit Card</option>
                    </select>
                 </div>
                 <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 mb-1 block ml-2">Catatan (Opsional)</label>
                    <textarea placeholder="Detail pelunasan..." className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold h-20 resize-none shadow-inner" value={confNotes} onChange={e => setConfNotes(e.target.value)} />
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-10">
                 <button onClick={() => setTxToConfirm(null)} className="py-4 bg-slate-100 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-500">Batal</button>
                 <button onClick={handleConfirmPaymentSubmit} disabled={isUpdatingStatus} className="py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl shadow-emerald-100">Simpan Lunas</button>
              </div>
           </div>
        </div>
      )}

      {/* Reprint Receipt Modal */}
      {selectedTxForPrint && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-2xl z-[150] flex items-center justify-center p-4">
           <div className="bg-white rounded-[2rem] md:rounded-[3rem] p-6 md:p-8 max-w-sm w-full shadow-2xl animate-in zoom-in duration-300 flex flex-col max-h-[90vh]">
              <h3 className="text-center font-black uppercase text-slate-900 mb-4 md:mb-6 tracking-widest shrink-0">Reprint Struk</h3>
              
              <div id="printable-area" className="p-6 bg-slate-50 border border-slate-200 rounded-[2rem] mb-6 font-mono text-[10px] text-slate-800 shadow-inner flex flex-col items-center overflow-y-auto custom-scrollbar flex-1">
                  <p className="font-black text-xs uppercase leading-tight mb-1 text-center">{settings.name}</p>
                  <p className="text-[8px] opacity-70 leading-tight text-center mb-4">{settings.address}</p>
                  
                  <div className="w-full border-t border-dashed border-slate-300 my-2"></div>
                  <div className="w-full bg-slate-100 py-1 px-2 rounded-lg mb-2 flex justify-between uppercase font-black text-[9px]"><span>TGL/WAKTU:</span><span>{new Date(selectedTxForPrint.timestamp).toLocaleString('id-ID')}</span></div>
                  <div className="w-full flex justify-between uppercase"><span>ID:</span><span>#{selectedTxForPrint.id.slice(-8)}</span></div>
                  <div className="w-full flex justify-between uppercase"><span>STATUS:</span><span className="font-black">{selectedTxForPrint.status === 'CANCELLED' ? 'CANCELED' : (selectedTxForPrint.paymentStatus === 'PAID' ? 'TERBAYAR' : 'BELUM BAYAR')}</span></div>
                  <div className="w-full flex justify-between uppercase"><span>CUST:</span><span className="font-black truncate max-w-[100px]">{selectedTxForPrint.customerName || '-'}</span></div>
                  <div className="w-full flex justify-between uppercase mb-2"><span>METODE:</span><span>{selectedTxForPrint.paymentMethod}</span></div>
                  
                  <div className="w-full border-t border-dashed border-slate-300 my-2"></div>
                  {selectedTxForPrint.items.map((i, idx) => {
                    const hasDiscount = i.originalPrice > i.price;
                    const itemDiscountTotal = (i.originalPrice - i.price) * i.quantity;
                    return (
                      <div key={idx} className="w-full mb-1">
                        <div className="flex justify-between uppercase"><span>{i.name}</span><span>{i.subtotal.toLocaleString()}</span></div>
                        <div className="flex justify-between items-center text-[8px] opacity-60 italic leading-tight">
                          <div className="flex flex-col">
                            <span>{i.quantity} x {i.price.toLocaleString()}</span>
                            {hasDiscount && (
                              <span className="text-rose-500 font-bold line-through ml-1 opacity-50">Rp{i.originalPrice.toLocaleString()}</span>
                            )}
                          </div>
                          {hasDiscount && (
                            <span className="text-rose-600 font-black text-[7px] bg-rose-50 px-1 rounded border border-rose-100 italic">Diskon Rp{itemDiscountTotal.toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  
                  <div className="w-full border-t border-dashed border-slate-300 my-2"></div>
                  <div className="w-full border-t border-dashed pt-2 font-black text-xs uppercase flex justify-between">
                    <span>TOTAL AKHIR:</span>
                    <span>Rp{selectedTxForPrint.total.toLocaleString()}</span>
                  </div>
                  {selectedTxForPrint.notes && (
                    <div className="w-full mt-2 pt-2 border-t border-dashed border-slate-200">
                      <p className="text-[7px] font-black text-slate-400 uppercase">Catatan:</p>
                      <p className="text-[8px] text-slate-600 uppercase italic leading-tight">{selectedTxForPrint.notes}</p>
                    </div>
                  )}
                  <div className="w-full text-center mt-6 italic opacity-70 uppercase tracking-widest leading-relaxed whitespace-pre-wrap">{settings.footer}</div>
              </div>

              <div className="grid grid-cols-2 gap-4 shrink-0">
                 <button onClick={() => setSelectedTxForPrint(null)} className="py-4 bg-slate-100 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-500">Tutup</button>
                 <button onClick={() => { printService.printReceipt(selectedTxForPrint, settings); setSelectedTxForPrint(null); }} className="py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl">Cetak</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<{ label: string, value: string, color: string, isProfit?: boolean, onClick?: () => void, active?: boolean }> = ({ label, value, color, isProfit, onClick, active }) => (
  <div 
    onClick={onClick}
    className={`p-8 rounded-[2.5rem] shadow-sm border transition-all cursor-pointer hover:shadow-lg relative overflow-hidden ${active ? 'ring-4 ring-blue-500 opacity-100' : 'opacity-90 hover:opacity-100'} ${isProfit ? 'bg-slate-900 text-white shadow-xl' : 'bg-white border-slate-200'}`}
  >
    {active && <div className="absolute top-4 right-4 text-blue-500 animate-pulse"><i className="fas fa-filter"></i></div>}
    <p className={`text-[10px] mb-3 uppercase tracking-[0.2em] font-black ${isProfit ? 'text-blue-300' : 'text-slate-400'}`}>{label}</p>
    <h3 className={`text-3xl font-black ${isProfit ? 'text-white' : 'text-slate-900'}`}>{value}</h3>
  </div>
);

export default Reports;
