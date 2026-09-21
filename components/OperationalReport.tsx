
import React, { useState, useMemo, useEffect } from 'react';
import { AppState, UserRole, Expense, Category, Transaction, OrderStatus } from '../types';
import apiService from '../services/apiService';
// @ts-ignore
import * as XLSX from 'xlsx';

interface OperationalReportProps {
  state: AppState;
  onRefreshData: () => Promise<void>;
}

const OperationalReport: React.FC<OperationalReportProps> = ({ state, onRefreshData }) => {
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  
  const [summary, setSummary] = useState({ omzet: 0, hpp: 0, grossProfit: 0, totalExpenses: 0, netProfit: 0, byCategory: [] as any[] });
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState<Partial<Expense>>({
    date: new Date().toISOString().split('T')[0],
    description: '',
    category: 'General',
    amount: 0
  });

  const rawRole = (state.currentUser?.role || '').toString().toUpperCase();
  const isAdmin = rawRole === 'ADMIN';
  const isTenant = rawRole === 'TENANT';
  const tenantCategories = useMemo(() => {
    if (!isTenant || !state.currentUser?.tenantCategories) return [];
    return state.currentUser.tenantCategories.map(c => c.trim().toUpperCase());
  }, [isTenant, state.currentUser]);

  const canView = isAdmin || rawRole === 'STAFF' || rawRole === 'VISITOR' || isTenant;

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const filteredExpenses = useMemo(() => {
    setCurrentPage(1);
    return (state.expenses || []).filter(e => {
      const d = e.date;
      const matchesDate = d >= startDate && d <= endDate;
      if (!matchesDate) return false;
      if (isTenant && tenantCategories.length > 0) {
        return tenantCategories.includes((e.category || 'General').trim().toUpperCase());
      }
      return true;
    });
  }, [state.expenses, startDate, endDate, isTenant, tenantCategories]);

  const paginatedExpenses = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredExpenses.slice(start, start + itemsPerPage);
  }, [filteredExpenses, currentPage]);

  const totalPages = Math.ceil(filteredExpenses.length / itemsPerPage);

  useEffect(() => {
    const fetchSummary = async () => {
      setIsLoading(true);
      try {
        const res = await apiService.request(`/get_sales_summary.php?startDate=${startDate}&endDate=${endDate}`);
        if (res) {
          const totalExpenses = filteredExpenses.filter(e => e.status !== 'CANCELLED').reduce((sum, e) => sum + e.amount, 0);
          let rawByCategory = res.byCategory || [];
          if (isTenant && tenantCategories.length > 0) {
            rawByCategory = rawByCategory.filter((item: any) => tenantCategories.includes((item.category || '').trim().toUpperCase()));
          }
          const calcOmzet = isTenant && tenantCategories.length > 0 ? rawByCategory.reduce((s: number, i: any) => s + Number(i.total || 0), 0) : (res.revenue || 0);
          const calcHpp = isTenant && tenantCategories.length > 0 ? rawByCategory.reduce((s: number, i: any) => s + Number(i.cost || 0), 0) : (res.cost || 0);
          const calcProfit = calcOmzet - calcHpp;

          setSummary({
            omzet: calcOmzet,
            hpp: calcHpp,
            grossProfit: calcProfit,
            totalExpenses: totalExpenses,
            netProfit: calcOmzet - totalExpenses,
            byCategory: rawByCategory
          });
        }
      } catch (err) {
        console.error("Operational Report fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSummary();
  }, [startDate, endDate, filteredExpenses, isTenant, tenantCategories]);

  const stats = summary;

  const categoryStats = useMemo(() => {
    const catStats: Record<string, { revenue: number; hpp: number; expenses: number }> = {};
    
    // Initialize categories
    const visibleCategories = isTenant && tenantCategories.length > 0 
      ? state.categories.filter(c => tenantCategories.includes(c.name.trim().toUpperCase()))
      : state.categories;

    visibleCategories.forEach(c => {
      catStats[c.name] = { revenue: 0, hpp: 0, expenses: 0 };
    });
    if (!isTenant && !catStats['General']) catStats['General'] = { revenue: 0, hpp: 0, expenses: 0 };

    // Add revenue and HPP from summary
    summary.byCategory.forEach(item => {
      const cat = item.category || 'General';
      if (isTenant && tenantCategories.length > 0 && !tenantCategories.includes(cat.trim().toUpperCase())) return;
      if (!catStats[cat]) catStats[cat] = { revenue: 0, hpp: 0, expenses: 0 };
      catStats[cat].revenue = Number(item.total);
      catStats[cat].hpp = Number(item.cost);
    });

    // Add expenses
    filteredExpenses.filter(e => e.status !== 'CANCELLED').forEach(e => {
      const cat = e.category || 'General';
      if (isTenant && tenantCategories.length > 0 && !tenantCategories.includes(cat.trim().toUpperCase())) return;
      if (!catStats[cat]) catStats[cat] = { revenue: 0, hpp: 0, expenses: 0 };
      catStats[cat].expenses += e.amount;
    });

    return catStats;
  }, [summary, filteredExpenses, state.categories, isTenant, tenantCategories]);

  const handleSaveExpense = async () => {
    if (!formData.description || !formData.amount) {
      alert("Deskripsi dan nominal harus diisi!");
      return;
    }
    setIsProcessing(true);
    try {
      await apiService.request('/expenses.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          action: 'save',
          staffId: state.currentUser?.name || 'Unknown'
        })
      });
      await onRefreshData();
      setIsModalOpen(false);
      setEditingExpense(null);
      setFormData({ date: new Date().toISOString().split('T')[0], description: '', category: 'General', amount: 0 });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelExpense = async (id: string) => {
    if (!window.confirm("Batalkan transaksi pengeluaran ini?")) return;
    setIsProcessing(true);
    try {
      await apiService.request('/expenses.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', id })
      });
      await onRefreshData();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const exportToExcel = () => {
    const headers = ['TANGGAL', 'ID', 'DESKRIPSI', 'KATEGORI', 'NOMINAL', 'STAFF', 'STATUS'];
    const rows = filteredExpenses.map(e => [
      e.date,
      e.id,
      e.description,
      e.category,
      e.amount,
      e.staffId,
      e.status
    ]);

    const summaryData = [
      ['RINGKASAN OPERASIONAL'],
      ['PERIODE', `${startDate} s/d ${endDate}`],
      [],
      ['TOTAL OMZET', stats.omzet],
      ['TOTAL HPP', stats.hpp],
      ['GROSS PROFIT', stats.grossProfit],
      ['TOTAL BIAYA OPERASIONAL', stats.totalExpenses],
      ['NET PROFIT (OMZET - BIAYA OP)', stats.netProfit],
      [],
      ['DATA PENGELUARAN'],
      headers,
      ...rows
    ];

    const ws = XLSX.utils.aoa_to_sheet(summaryData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Operasional");
    XLSX.writeFile(wb, `Laporan_Operasional_${startDate}_${endDate}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <span className="p-2 bg-rose-600 text-white rounded-xl shadow-lg"><i className="fas fa-chart-line"></i></span>
            Report Operasional
          </h1>
          <p className="text-slate-500 font-medium text-sm">Analisis laba rugi dan manajemen biaya operasional</p>
        </div>
        <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border shadow-sm">
          <input type="date" className="p-2 text-xs font-bold border-none outline-none" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <span className="text-slate-300 font-black">/</span>
          <input type="date" className="p-2 text-xs font-bold border-none outline-none" value={endDate} onChange={e => setEndDate(e.target.value)} />
          <button onClick={exportToExcel} className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm" title="Export Laporan">
             <i className="fas fa-file-excel"></i>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-[2rem] border shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Omzet</p>
          <p className="text-2xl font-black text-slate-800">Rp {Number(stats.omzet).toLocaleString('id-ID')}</p>
          <div className="mt-2 flex items-center gap-1 text-[10px] font-bold text-slate-400">
            <i className="fas fa-shopping-cart"></i> Dari Penjualan POS
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Gross Profit</p>
          <p className="text-2xl font-black text-honey-600">Rp {Number(stats.grossProfit).toLocaleString('id-ID')}</p>
          <p className="text-[10px] font-bold text-slate-400 mt-2">Margin: {stats.omzet > 0 ? ((stats.grossProfit / stats.omzet) * 100).toFixed(1) : 0}%</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Biaya Operasional</p>
          <p className="text-2xl font-black text-rose-600">Rp {Number(stats.totalExpenses).toLocaleString('id-ID')}</p>
          <div className="mt-2 flex items-center gap-1 text-[10px] font-bold text-slate-400">
            <i className="fas fa-receipt"></i> Total Pengeluaran
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border shadow-sm bg-gradient-to-br from-slate-900 to-slate-800 border-none">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Net Profit (Laba Bersih)</p>
          <p className={`text-2xl font-black ${stats.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>Rp {Number(stats.netProfit).toLocaleString('id-ID')}</p>
          <p className="text-[10px] font-bold text-slate-500 mt-2">Omzet - Biaya Operasional</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Expense Management */}
        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Daftar Pengeluaran</h2>
            <div className="flex gap-2">
              <button onClick={() => setShowComparison(!showComparison)} className="px-4 py-2 bg-white border rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
                {showComparison ? 'Lihat Daftar' : 'Lihat Persandingan'}
              </button>
              {isAdmin && (
                <button onClick={() => { setEditingExpense(null); setFormData({ date: new Date().toISOString().split('T')[0], description: '', category: 'General', amount: 0 }); setIsModalOpen(true); }} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all">
                  + Input Pengeluaran
                </button>
              )}
            </div>
          </div>

          {!showComparison ? (
            <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-400 border-b">
                    <tr>
                      <th className="px-6 py-4">ID / Tanggal</th>
                      <th className="px-6 py-4">Deskripsi</th>
                      <th className="px-6 py-4">Kategori</th>
                      <th className="px-6 py-4 text-right">Nominal</th>
                      <th className="px-6 py-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="text-[11px] font-bold divide-y">
                    {paginatedExpenses.map(e => (
                      <tr key={e.id} className={`hover:bg-slate-50 transition-colors ${e.status === 'CANCELLED' ? 'opacity-40 grayscale' : ''}`}>
                        <td className="px-6 py-4">
                          <p className="text-honey-600 font-black">#{e.id}</p>
                          <p className="text-[9px] text-slate-400 uppercase">{e.date}</p>
                        </td>
                        <td className="px-6 py-4 text-slate-700 uppercase">{e.description}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 bg-slate-100 rounded-md text-[8px] uppercase">{e.category}</span>
                        </td>
                        <td className="px-6 py-4 text-right text-rose-600 font-black">Rp {e.amount.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right">
                          {isAdmin && e.status !== 'CANCELLED' && (
                            <div className="flex justify-end gap-2">
                              <button onClick={() => { setEditingExpense(e); setFormData(e); setIsModalOpen(true); }} className="p-2 bg-honey-50 text-honey-600 rounded-lg hover:bg-honey-600 hover:text-white transition-all"><i className="fas fa-edit"></i></button>
                              <button onClick={() => handleCancelExpense(e.id)} className="p-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-600 hover:text-white transition-all"><i className="fas fa-trash-alt"></i></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {paginatedExpenses.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-10 text-center text-slate-300 font-black uppercase text-[10px]">Belum ada data pengeluaran</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="p-4 bg-slate-50 border-t flex items-center justify-between">
                  <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-[8px] font-black uppercase bg-white border rounded-lg disabled:opacity-30"
                  >
                    Prev
                  </button>
                  <span className="text-[8px] font-black text-slate-400 uppercase">Halaman {currentPage} dari {totalPages}</span>
                  <button 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-[8px] font-black uppercase bg-white border rounded-lg disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-400 border-b">
                    <tr>
                      <th className="px-6 py-4">Kategori Produk</th>
                      <th className="px-6 py-4 text-right">Omzet</th>
                      <th className="px-6 py-4 text-right">Gross Profit</th>
                      <th className="px-6 py-4 text-right">Biaya Operasional</th>
                      <th className="px-6 py-4 text-right bg-honey-50">Net Profit</th>
                    </tr>
                  </thead>
                  <tbody className="text-[11px] font-bold divide-y">
                    {(Object.entries(categoryStats) as [string, { revenue: number; hpp: number; expenses: number }][]).map(([cat, s]) => {
                      const gp = s.revenue - s.hpp;
                      const np = s.revenue - s.expenses;
                      if (s.revenue === 0 && s.expenses === 0) return null;
                      return (
                        <tr key={cat} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 uppercase font-black">{cat}</td>
                          <td className="px-6 py-4 text-right">Rp {s.revenue.toLocaleString()}</td>
                          <td className="px-6 py-4 text-right text-honey-600">Rp {gp.toLocaleString()}</td>
                          <td className="px-6 py-4 text-right text-rose-600">Rp {s.expenses.toLocaleString()}</td>
                          <td className={`px-6 py-4 text-right bg-honey-50/30 font-black ${np >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>Rp {np.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-10 max-w-md w-full shadow-2xl animate-in zoom-in duration-200">
            <h3 className="text-xl font-black mb-6 uppercase tracking-tight text-slate-800">
              {editingExpense ? 'Edit Pengeluaran' : 'Input Pengeluaran Baru'}
            </h3>
            <div className="space-y-5">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1 block">Tanggal</label>
                <input type="date" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1 block">Deskripsi Pengeluaran</label>
                <input type="text" placeholder="Misal: Bayar Listrik, Gaji, dll" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1 block">Kategori Terkait</label>
                <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold uppercase text-xs" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                  <option value="General">General / Umum</option>
                  {state.categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
                <p className="text-[8px] text-slate-400 mt-1 ml-2 italic">*Biaya ini akan mengurangi net profit kategori terpilih</p>
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1 block">Nominal (Rp)</label>
                <input type="number" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-rose-600" value={formData.amount} onChange={e => setFormData({...formData, amount: Number(e.target.value)})} />
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 py-4 bg-slate-100 rounded-2xl font-black text-[10px] uppercase text-slate-500">Batal</button>
              <button onClick={handleSaveExpense} disabled={isProcessing} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-slate-200 disabled:opacity-50">
                {isProcessing ? 'Memproses...' : 'Simpan Transaksi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperationalReport;
