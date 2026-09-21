
import React, { useMemo, useState, useEffect } from 'react';
import { AppState } from '../types';
import { Icons } from '../constants';
import apiService from '../services/apiService';

const Dashboard: React.FC<{ state: AppState }> = ({ state }) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [summary, setSummary] = useState({ revenue: 0, profit: 0, unpaidCount: 0, byCategory: [] as any[], byPaymentMethod: [] as any[] });
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const rawRole = (state.currentUser?.role || '').toString().toUpperCase();
  const isTenant = rawRole === 'TENANT';
  const tenantCategories = useMemo(() => {
    if (!isTenant || !state.currentUser?.tenantCategories) return [];
    return state.currentUser.tenantCategories.map(c => c.trim());
  }, [isTenant, state.currentUser]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  useEffect(() => {
    const fetchSummary = async () => {
      setIsLoading(true);
      try {
        const userRoleParam = state.currentUser?.role ? `&role=${state.currentUser.role}` : '';
        const userIdParam = state.currentUser?.id ? `&userId=${encodeURIComponent(state.currentUser.id)}` : '';
        const res = await apiService.request(`/get_sales_summary.php?startDate=${startDate}&endDate=${endDate}${userRoleParam}${userIdParam}`);
        if (res) {
          setSummary({
            revenue: res.revenue || 0,
            profit: res.profit || 0,
            unpaidCount: res.unpaidCount || 0,
            byCategory: res.byCategory || [],
            byPaymentMethod: res.byPaymentMethod || []
          });
        }
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSummary();
  }, [startDate, endDate, state.currentUser]);

  const statsByCategory = summary.byCategory.map(item => [item.category, item.total]);

  const maxVal = Math.max(...statsByCategory.map(s => s[1]), 1);

  // For category details, we fetch on demand for precision
  const [categoryDetails, setCategoryDetails] = useState<any[]>([]);
  const [isPiutangDetail, setIsPiutangDetail] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);

  useEffect(() => {
    if (!selectedCategory && !isPiutangDetail) {
      setCategoryDetails([]);
      return;
    }
    setCurrentPage(1); // Reset to first page when category/mode changes

    const fetchDetails = async () => {
      setIsFetchingDetails(true);
      try {
        const userRoleParam = state.currentUser?.role ? `&role=${state.currentUser.role}` : '';
        const userIdParam = state.currentUser?.id ? `&userId=${encodeURIComponent(state.currentUser.id)}` : '';
        let url = `/get_transactions.php?startDate=${startDate}&endDate=${endDate}&limit=100${userRoleParam}${userIdParam}`;
        if (isPiutangDetail) {
          url += `&paymentStatus=UNPAID`;
        } else if (selectedCategory) {
          url += `&search=${encodeURIComponent(selectedCategory)}`;
        }

        const res = await apiService.request(url);
        if (res && res.transactions) {
          const entries: any[] = [];
          res.transactions.forEach((tx: any) => {
            if (isPiutangDetail) {
              tx.items.forEach((item: any) => {
                entries.push({
                  txId: tx.id,
                  timestamp: tx.timestamp,
                  staff: tx.staffId,
                  customer: tx.customerName || 'Pelanggan',
                  productName: item.name,
                  qty: item.quantity,
                  subtotal: item.subtotal,
                  paymentStatus: tx.paymentStatus
                });
              });
            } else {
              tx.items.forEach((item: any) => {
                if (item.category === selectedCategory) {
                  entries.push({
                    txId: tx.id,
                    timestamp: tx.timestamp,
                    staff: tx.staffId,
                    customer: tx.customerName || 'Pelanggan',
                    productName: item.name,
                    qty: item.quantity,
                    subtotal: item.subtotal,
                    paymentStatus: tx.paymentStatus
                  });
                }
              });
            }
          });
          setCategoryDetails(entries);
        }
      } catch (err) {
        console.error("Details fetch error:", err);
      } finally {
        setIsFetchingDetails(false);
      }
    };
    fetchDetails();
  }, [selectedCategory, isPiutangDetail, startDate, endDate, state.currentUser]);

  const totalSales = summary.revenue;

  const paginatedDetails = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return categoryDetails.slice(startIndex, startIndex + itemsPerPage);
  }, [categoryDetails, currentPage]);

  const totalPages = Math.ceil(categoryDetails.length / itemsPerPage);

  const paymentMethods = ['CASH', 'DEBIT', 'QRIS', 'DEPOSIT', 'TRANSFER'];
  const paymentMethodStats = useMemo(() => {
    const stats: Record<string, number> = {};
    paymentMethods.forEach(m => stats[m] = 0);
    summary.byPaymentMethod.forEach(item => {
      if (stats.hasOwnProperty(item.paymentMethod)) {
        stats[item.paymentMethod] = Number(item.total);
      }
    });
    return stats;
  }, [summary.byPaymentMethod]);

  return (
    <div className="space-y-6 pb-10">
      {isTenant && (
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 rounded-3xl p-5 text-white shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
              <i className="fas fa-store text-xl"></i>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-100">Mode Akses Tenant Toko</p>
              <h3 className="text-lg font-black tracking-tight">
                {tenantCategories.length > 0 ? `Kategori Dikelola: ${tenantCategories.join(', ')}` : 'Belum Ada Kategori Ditetapkan'}
              </h3>
            </div>
          </div>
          <div className="text-xs font-bold bg-black/20 px-4 py-2 rounded-xl border border-white/20">
            {tenantCategories.length > 0 ? `${state.products.length} Produk Aktif` : 'Hubungi Admin untuk Kategori'}
          </div>
        </div>
      )}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
             <span className="p-2 bg-honey-600 text-white rounded-xl shadow-lg shadow-honey-200"><Icons.Dashboard /></span>
             Dashboard BeeSmart
          </h1>
          <p className="text-slate-500 font-medium text-sm uppercase tracking-widest">Analisis Performa Penjualan</p>
        </div>
        
        <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm shrink-0">
          <div className="flex items-center gap-2 px-3 border-r border-slate-100">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Mulai</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 outline-none" />
          </div>
          <div className="flex items-center gap-2 px-3">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Selesai</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 outline-none" />
          </div>
          {isLoading && <i className="fas fa-spinner fa-spin text-honey-600 text-xs mx-2"></i>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard icon={<Icons.Reports />} label="Omzet Periode Ini" value={formatCurrency(totalSales)} color="blue" onClick={() => { setSelectedCategory(null); setIsPiutangDetail(false); }} />
        <StatCard icon={<Icons.Reports />} label="Profit Periode Ini" value={formatCurrency(summary.profit)} color="emerald" />
        <StatCard 
          icon={<Icons.Reports />} 
          label="Piutang (Belum Bayar)" 
          value={summary.unpaidCount.toString()} 
          color="rose" 
          onClick={() => { setSelectedCategory(null); setIsPiutangDetail(true); }}
          warning={summary.unpaidCount > 0} 
        />
        <StatCard icon={<Icons.Inventory />} label="Stok Kritis" value={state.products.filter(p => p.stock <= p.minStock).length.toString()} color="amber" warning={state.products.filter(p => p.stock <= p.minStock).length > 0} />
      </div>

      {/* Payment Method Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {paymentMethods.map(method => (
          <div key={method} className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{method}</p>
            <p className="text-sm font-black text-slate-800">{formatCurrency(paymentMethodStats[method])}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-200">
           <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-8 flex justify-between items-center">
             <span>Penjualan per Kategori</span>
             <span className="text-honey-600 bg-honey-50 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest">Klik Bar Rincian</span>
           </h3>
           <div className="space-y-7">
              {statsByCategory.map(([cat, val]) => (
                <div key={cat} onClick={() => setSelectedCategory(cat)} className="group cursor-pointer">
                  <div className="flex justify-between items-end mb-2">
                    <span className={`text-xs font-black uppercase tracking-wider transition-colors ${selectedCategory === cat ? 'text-honey-600' : 'text-slate-600 group-hover:text-honey-500'}`}>{cat}</span>
                    <span className="text-[11px] font-black text-slate-900">{formatCurrency(val)}</span>
                  </div>
                  <div className="h-4 bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                    <div 
                      className={`h-full transition-all duration-1000 ease-out ${selectedCategory === cat ? 'bg-gradient-to-r from-honey-600 to-honey-400 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-gradient-to-r from-slate-300 to-slate-200 group-hover:from-honey-200 group-hover:to-honey-100'}`} 
                      style={{ width: `${(val / maxVal) * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))}
              {statsByCategory.length === 0 && (
                <div className="py-20 text-center text-slate-300 font-bold uppercase text-xs tracking-widest italic border-2 border-dashed border-slate-100 rounded-3xl">
                  Tidak ada data pada periode ini
                </div>
              )}
           </div>
        </div>

        <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[450px]">
           <div className="flex items-center justify-between mb-6">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                {isPiutangDetail ? 'Rincian Penjualan: PIUTANG' : (selectedCategory ? `Rincian Penjualan: ${selectedCategory}` : 'Pilih Tab Detail')}
                {isFetchingDetails && <i className="fas fa-spinner fa-spin ml-2"></i>}
              </h3>
              {(selectedCategory || isPiutangDetail) && (
                <button onClick={() => { setSelectedCategory(null); setIsPiutangDetail(false); }} className="text-[9px] font-black uppercase text-slate-400 hover:text-red-500 transition-colors">Clear</button>
              )}
           </div>
           <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
              {paginatedDetails.length > 0 ? (
                <>
                  {paginatedDetails.map((item, idx) => (
                    <div key={`${item.txId}-${idx}`} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center hover:bg-white hover:shadow-md transition-all border-l-4 border-l-transparent hover:border-l-honey-500">
                       <div className="min-w-0 flex-1">
                         <p className="font-black text-slate-800 text-[11px] truncate uppercase tracking-tight leading-tight">{item.productName}</p>
                         <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter mt-1">
                           ID: {item.txId.slice(-8).toUpperCase()} | {new Date(item.timestamp).toLocaleString('id-ID', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})} | {item.customer}
                         </p>
                         {item.paymentStatus === 'UNPAID' && <span className="text-[8px] font-black bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded mt-1 inline-block uppercase tracking-widest">BELUM BAYAR</span>}
                       </div>
                       <div className="text-right ml-4 shrink-0">
                         <p className="font-black text-honey-600 text-xs">Rp {Number(item.subtotal).toLocaleString('id-ID')}</p>
                         <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest text-right">Qty: {item.qty}</p>
                       </div>
                    </div>
                  ))}
                  
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-slate-100">
                      <button 
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className="p-2 text-slate-400 hover:text-honey-600 disabled:opacity-30 transition-colors"
                      >
                        <i className="fas fa-chevron-left text-xs"></i>
                      </button>
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Halaman {currentPage} / {totalPages}
                      </span>
                      <button 
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        className="p-2 text-slate-400 hover:text-honey-600 disabled:opacity-30 transition-colors"
                      >
                        <i className="fas fa-chevron-right text-xs"></i>
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-200 py-20">
                   <i className="fas fa-chart-pie text-5xl mb-4 opacity-10"></i>
                   <p className="text-[10px] font-black uppercase tracking-[0.2em] text-center text-slate-300">
                     {selectedCategory ? 'Tidak ada rincian ditemukan' : 'Klik salah satu kategori pada grafik untuk melihat produk terjual'}
                   </p>
                </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ icon: any, label: string, value: string, color: string, warning?: boolean, onClick?: () => void }> = ({ icon, label, value, color, warning, onClick }) => {
  const colorClasses: any = {
    blue: "bg-honey-600 text-white shadow-honey-100",
    emerald: "bg-emerald-600 text-white shadow-emerald-100",
    amber: "bg-amber-500 text-white shadow-amber-100",
    rose: "bg-rose-600 text-white shadow-rose-100",
  };
  return (
    <div 
      onClick={onClick}
      className={`bg-white p-5 md:p-7 rounded-[2rem] md:rounded-[2.5rem] border transition-all ${onClick ? 'cursor-pointer hover:scale-105 active:scale-95' : ''} ${warning ? 'border-yellow-200 ring-4 ring-yellow-50' : 'border-slate-200 hover:shadow-xl hover:-translate-y-1'}`}
    >
      <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center text-lg md:text-xl mb-4 md:mb-5 shadow-lg ${colorClasses[color]}`}>{icon}</div>
      <p className="text-slate-400 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] mb-1">{label}</p>
      <h3 className="text-xl md:text-2xl font-black text-slate-900 truncate">{value}</h3>
    </div>
  );
};

export default Dashboard;
