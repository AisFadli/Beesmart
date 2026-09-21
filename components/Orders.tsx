
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Order, OrderItem, Product, User, OrderStatus, Transaction, StockAdjustment, Category } from '../types';
import apiService from '../services/apiService';
// @ts-ignore
import * as XLSX from 'xlsx';

interface OrdersProps {
  orders: Order[];
  products: Product[];
  categories: Category[];
  transactions: Transaction[];
  stockAdjustments: StockAdjustment[];
  user: User;
  onSaveOrder: (order: Order) => Promise<void>;
  onRefreshData: () => Promise<void>;
  auditProductId: string;
  setAuditProductId: (id: string) => void;
}

const Orders: React.FC<OrdersProps> = ({ orders, products, categories, transactions, stockAdjustments, user, onSaveOrder, onRefreshData, auditProductId, setAuditProductId }) => {
  const [activeSubTab, setActiveSubTab] = useState<'manage' | 'stock' | 'member' | 'proposals'>('manage');
  
  // Pagination & Filtering States
  const [managePage, setManagePage] = useState(1);
  const [memberPage, setMemberPage] = useState(1);
  const [proposalsPage, setProposalsPage] = useState(1);
  const itemsPerPage = 20;

  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setManagePage(1);
    setMemberPage(1);
    setAuditPage(1);
    setProposalsPage(1);
  }, [dateStart, dateEnd, searchQuery, activeSubTab]);

  useEffect(() => {
    if (auditProductId) {
      setActiveSubTab('stock');
    }
  }, [auditProductId]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [isViewOrderModalOpen, setIsViewOrderModalOpen] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<any>(null);
  const [receiveData, setReceiveData] = useState<Order | null>(null);
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Member Order Progress Update States
  const [memberUpdateDate, setMemberUpdateDate] = useState(new Date().toISOString().split('T')[0]);
  const [memberUpdateNotes, setMemberUpdateNotes] = useState('');
  const [memberPayConfirm, setMemberPayConfirm] = useState(false);
  const [isUpdatingMemberStatus, setIsUpdatingMemberStatus] = useState(false);
  
  const rawRole = (user?.role || '').toString().toUpperCase();
  const isTenant = rawRole === 'TENANT';
  const tenantCategories = useMemo(() => {
    if (!isTenant || !user?.tenantCategories) return [];
    let raw: any = user.tenantCategories;
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
  }, [isTenant, user]);

  const availableProducts = useMemo(() => {
    if (isTenant) {
      if (tenantCategories.length === 0) return [];
      return products.filter(p => tenantCategories.includes((p.category || '').trim().toUpperCase()));
    }
    return products;
  }, [products, isTenant, tenantCategories]);

  // Filtered and Paginated Manage Orders
  const filteredManageOrders = useMemo(() => {
    return orders.filter(o => {
      if (isTenant) {
        if (tenantCategories.length === 0) return false;
        const hasTenantProduct = (o.items || []).some(item => {
          const prod = products.find(p => p.id === item.productId);
          const cat = prod?.category || (item as any).category || '';
          return tenantCategories.includes(cat.trim().toUpperCase());
        });
        if (!hasTenantProduct) return false;
      }
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
                           o.id.toLowerCase().includes(q) || 
                           o.staffId.toLowerCase().includes(q) ||
                           (o.notes || '').toLowerCase().includes(q);
                           
      const orderDate = new Date(o.createdAt).getTime();
      const matchesStart = dateStart ? orderDate >= new Date(dateStart + 'T00:00:00').getTime() : true;
      const matchesEnd = dateEnd ? orderDate <= new Date(dateEnd + 'T23:59:59').getTime() : true;
      return matchesSearch && matchesStart && matchesEnd;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, searchQuery, dateStart, dateEnd, isTenant, tenantCategories, products]);

  const paginatedManageOrders = useMemo(() => {
    const start = (managePage - 1) * itemsPerPage;
    return filteredManageOrders.slice(start, start + itemsPerPage);
  }, [filteredManageOrders, managePage]);

  const totalManagePages = Math.ceil(filteredManageOrders.length / itemsPerPage);

  // Member Orders Searchable
  const filteredMemberOrders = useMemo(() => {
    return transactions.filter(t => {
      const isMemberOrder = (t.id.startsWith('ORD-') || t.transactionType === 'ORDER') && t.memberId;
      if (!isMemberOrder) return false;

      if (isTenant) {
        if (tenantCategories.length === 0) return false;
        const hasTenantProduct = (t.items || []).some(item => {
          const prod = products.find(p => p.id === item.productId);
          const cat = prod?.category || item.category || '';
          return tenantCategories.includes(cat.trim().toUpperCase());
        });
        if (!hasTenantProduct) return false;
      }

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
                           t.id.toLowerCase().includes(q) || 
                           (t.customerName || '').toLowerCase().includes(q) ||
                           (t.memberId || '').toLowerCase().includes(q);

      const txDate = new Date(t.timestamp).getTime();
      const matchesStart = dateStart ? txDate >= new Date(dateStart + 'T00:00:00').getTime() : true;
      const matchesEnd = dateEnd ? txDate <= new Date(dateEnd + 'T23:59:59').getTime() : true;
      return matchesSearch && matchesStart && matchesEnd;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [transactions, searchQuery, dateStart, dateEnd, isTenant, tenantCategories, products]);

  const paginatedMemberOrders = useMemo(() => {
    const start = (memberPage - 1) * itemsPerPage;
    return filteredMemberOrders.slice(start, start + itemsPerPage);
  }, [filteredMemberOrders, memberPage]);

  const totalMemberPages = Math.ceil(filteredMemberOrders.length / itemsPerPage);
  
  // Searchable Product for New Order
  const [selectedProductId, setSelectedProductId] = useState('');
  const [orderSearchTerm, setOrderSearchTerm] = useState('');
  const [showOrderDropdown, setShowOrderDropdown] = useState(false);
  const [orderQty, setOrderQty] = useState(1);
  const [orderCost, setOrderCost] = useState(0);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  
  // Audit Search
  const [auditSearchTerm, setAuditSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showAuditDropdown, setShowAuditDropdown] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const auditItemsPerPage = 25;

  // Audit Edit Modal
  const [isAuditEditModalOpen, setIsAuditEditModalOpen] = useState(false);
  const [editingAuditItem, setEditingAuditItem] = useState<any>(null);
  const [editAuditDate, setEditAuditDate] = useState('');
  const [editAuditQty, setEditAuditQty] = useState(0);
  const [isAuditProcessing, setIsAuditProcessing] = useState(false);
  
  // Real-time server-side audit data
  const [serverAuditData, setServerAuditData] = useState<any[]>([]);
  const [isFetchingAudit, setIsFetchingAudit] = useState(false);

  useEffect(() => {
    if (auditProductId) {
      const fetchAudit = async () => {
        setIsFetchingAudit(true);
        try {
          const res = await apiService.request(`/get_product_audit.php?productId=${auditProductId}`);
          if (res && res.auditData) {
            setServerAuditData(res.auditData);
          }
        } catch (err) {
          console.error("Audit fetch error:", err);
        } finally {
          setIsFetchingAudit(false);
        }
      };
      fetchAudit();
    } else {
      setServerAuditData([]);
    }
  }, [auditProductId]);

  // Stock Adjustment Form
  const [adjQty, setAdjQty] = useState(1);
  const [adjType, setAdjType] = useState<'DAMAGE' | 'LOSS' | 'EXPIRED'>('DAMAGE');
  const [adjNotes, setAdjNotes] = useState('');
  const [adjDate, setAdjDate] = useState(new Date().toISOString().split('T')[0]);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const orderDropdownRef = useRef<HTMLDivElement>(null);

  const isAdmin = (user.role || '').toString().toUpperCase() === 'ADMIN';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setShowAuditDropdown(false);
      if (orderDropdownRef.current && !orderDropdownRef.current.contains(event.target as Node)) setShowOrderDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleUpdateMemberOrder = async (newStatus: string) => {
    if (!viewingOrder || isUpdatingMemberStatus) return;
    setIsUpdatingMemberStatus(true);
    try {
      const updatedTx = {
        ...viewingOrder,
        orderStatus: newStatus,
        notes: memberUpdateNotes || viewingOrder.notes,
        receivedAt: `${memberUpdateDate}T${new Date().toLocaleTimeString('en-GB')}`,
        paymentStatus: memberPayConfirm ? 'PAID' : viewingOrder.paymentStatus
      };
      
      await apiService.request('/transactions.php', {
        method: 'PUT',
        body: JSON.stringify(updatedTx)
      });
      
      alert(`Berhasil memperbarui progres pesanan ke ${newStatus}`);
      setIsViewOrderModalOpen(false);
      setMemberUpdateNotes('');
      setMemberPayConfirm(false);
      if (onRefreshData) await onRefreshData();
    } catch (e: any) {
      alert("Gagal update: " + e.message);
    } finally {
      setIsUpdatingMemberStatus(false);
    }
  };

  const addOrderItem = () => {
    const product = availableProducts.find(p => p.id === selectedProductId);
    if (!product || orderItems.some(i => i.productId === product.id)) return;
    setOrderItems([...orderItems, {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      quantity: orderQty,
      estimatedCost: orderCost || product.costPrice,
      subtotal: orderQty * (orderCost || product.costPrice),
      // @ts-ignore
      currentStock: product.stock,
      // @ts-ignore
      avgMonthlySales: product.avgMonthlySales || 0
    }]);
    setSelectedProductId('');
    setOrderSearchTerm('');
    setOrderQty(1);
    setOrderCost(0);
  };

  const handleStockAdjustment = async () => {
    if (!auditProductId || adjQty <= 0) return;
    try {
      await apiService.request('/stock_adjustments.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: auditProductId,
          quantity: adjQty,
          type: adjType,
          staffId: user.name,
          userRole: user.role,
          notes: adjNotes,
          timestamp: `${adjDate}T${new Date().toLocaleTimeString('en-GB')}`
        })
      });
      alert("Laporan penyesuaian stok berhasil disimpan.");
      setIsAdjustmentModalOpen(false);
      setAdjQty(1);
      setAdjNotes('');
      // Memperbaiki error "o is not a function" dengan pengecekan fungsi yang lebih aman
      if (onRefreshData && typeof onRefreshData === 'function') {
        await onRefreshData();
      }
    } catch (e: any) { alert(e.message); }
  };

  const handleReceiveSubmit = async () => {
    if (!receiveData) return;
    try {
      const updatedOrder = {
        ...receiveData,
        status: OrderStatus.RECEIVED,
        receivedAt: new Date(receiveDate + 'T' + new Date().toLocaleTimeString('en-GB')).toISOString(),
        receivedBy: user.name
      };
      await apiService.request('/orders.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedOrder)
      });
      setIsReceiveModalOpen(false);
      if (onRefreshData) await onRefreshData();
      alert("Barang berhasil diterima dan stok telah diperbarui.");
    } catch (e: any) {
      alert(e.message);
    }
  };

  const exportOrderToExcel = (order: Order) => {
    const headers = ['SKU', 'Nama Produk', 'Stok Saat Ini', 'Rerata Jual/Bulan', 'Quantity Order', 'Harga Satuan', 'Subtotal'];
    const rows = order.items.map(item => {
      const product = products.find(p => p.id === item.productId);
      return [
        product?.sku || '-',
        item.name,
        product?.stock ?? '-',
        product?.avgMonthlySales ?? '-',
        item.quantity,
        item.estimatedCost,
        item.subtotal
      ];
    });

    const finalData = [
      ['ID ORDER', order.id],
      ['TANGGAL', new Date(order.createdAt).toLocaleString()],
      ['STAFF', order.staffId],
      ['STATUS', order.status],
      [],
      headers,
      ...rows,
      [],
      ['', '', '', 'TOTAL BIAYA', order.totalCost]
    ];

    const ws = XLSX.utils.aoa_to_sheet(finalData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Detail Order");
    XLSX.writeFile(wb, `Order_${order.id}_Detail.xlsx`);
  };

  const filteredOrderProducts = useMemo(() => 
    availableProducts.filter(p => p.name.toLowerCase().includes(orderSearchTerm.toLowerCase()) || p.sku.toLowerCase().includes(orderSearchTerm.toLowerCase())),
  [availableProducts, orderSearchTerm]);

  const auditData = useMemo(() => {
    return serverAuditData;
  }, [serverAuditData]);

  const paginatedAuditData = useMemo(() => {
    const start = (auditPage - 1) * auditItemsPerPage;
    return auditData.slice(start, start + auditItemsPerPage);
  }, [auditData, auditPage]);

  const totalAuditPages = Math.ceil(auditData.length / auditItemsPerPage);

  const exportAuditToExcel = () => {
    if (!auditProductId || auditData.length === 0) return;
    const product = products.find(p => p.id === auditProductId);
    if (!product) return;

    const headers = ['TANGGAL', 'REF', 'TIPE MUTASI', 'MASUK/KELUAR', 'SALDO AKHIR', 'PIC', 'HPP', 'TOTAL HPP'];
    const rows = auditData.map(h => [
      h.timestamp,
      h.ref,
      h.type,
      h.qty,
      h.endingBalance,
      h.staffId,
      h.cost,
      h.totalHpp
    ]);

    const finalData = [
      ['LAPORAN AUDIT STOK PRODUK'],
      ['NAMA PRODUK', product.name],
      ['SKU', product.sku],
      ['KATEGORI', product.category],
      ['TANGGAL CETAK', new Date().toLocaleString()],
      [],
      headers,
      ...rows
    ];

    const ws = XLSX.utils.aoa_to_sheet(finalData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Audit Log");
    XLSX.writeFile(wb, `Audit_${product.sku}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportCategoryAuditToExcel = async () => {
    if (!selectedCategory) return;
    
    setIsAuditProcessing(true);
    try {
      const res = await apiService.request(`/get_category_audit.php?category=${encodeURIComponent(selectedCategory)}`);
      if (!res || !res.summary) {
        throw new Error("Gagal mengambil data ringkasan kategori");
      }

      const summaryData = res.summary;
      const headers = ['SKU', 'NAMA PRODUK', 'STOK AWAL', 'TOTAL MASUK', 'TOTAL KELUAR', 'PENYESUAIAN', 'STOK AKHIR', 'NILAI STOK (HPP)'];
      
      const rows = summaryData.map((p: any) => [
        p.sku,
        p.name,
        p.initialStock,
        p.totalIn,
        p.totalOut,
        p.adjustment,
        p.calculatedStock,
        p.stockValue
      ]);

      const finalData = [
        ['LAPORAN RINGKASAN STOK PER KATEGORI'],
        ['KATEGORI', selectedCategory],
        ['TANGGAL CETAK', new Date().toLocaleString()],
        [],
        headers,
        ...rows,
        [],
        ['', '', '', '', '', 'TOTAL NILAI ASET', rows.reduce((sum, r) => sum + (r[7] as number), 0)]
      ];

      const ws = XLSX.utils.aoa_to_sheet(finalData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Ringkasan Kategori");
      XLSX.writeFile(wb, `Audit_Kategori_${selectedCategory}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsAuditProcessing(false);
    }
  };

  const handleAuditAction = async (action: 'edit' | 'cancel' | 'approve_adjustment', item: any) => {
    if (action === 'cancel' && !window.confirm("Batalkan mutasi stok ini? Stok akan dikembalikan.")) return;
    if (action === 'approve_adjustment' && !window.confirm("Setujui laporan penyesuaian stok ini? Stok akan diperbarui.")) return;
    
    setIsAuditProcessing(true);
    try {
      const targetProductId = item.productId || auditProductId;
      await apiService.request('/audit_action.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ref: item.ref,
          productId: targetProductId,
          date: action === 'edit' ? editAuditDate : undefined,
          qty: action === 'edit' ? editAuditQty : undefined
        })
      });
      
      setIsAuditEditModalOpen(false);
      if (onRefreshData) await onRefreshData();
      alert(action === 'approve_adjustment' ? "Laporan penyesuaian stok berhasil disetujui." : "Berhasil memperbarui data audit.");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsAuditProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <span className="p-2 bg-honey-600 text-white rounded-xl shadow-lg"><i className="fas fa-truck-loading"></i></span>
            Supply Chain & Audit
          </h1>
          <p className="text-slate-500 font-medium text-sm">Monitor pengadaan barang dan mutasi stok fisik</p>
        </div>
        <div className="flex bg-white p-1 rounded-2xl border shadow-sm flex-wrap">
          <button onClick={() => setActiveSubTab('manage')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'manage' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Kelola Order</button>
          <button onClick={() => setActiveSubTab('member')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'member' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Pesanan Member</button>
          <button onClick={() => setActiveSubTab('proposals')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'proposals' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Daftar Pengajuan</button>
          <button onClick={() => setActiveSubTab('stock')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'stock' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Laporan Audit Stok</button>
        </div>
      </div>

      {activeSubTab !== 'stock' && (
        <div className="bg-white p-6 rounded-[2.5rem] border shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block ml-2">Cari ID / Nama</label>
              <div className="relative">
                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                <input 
                  type="text" 
                  placeholder="ID Transaksi / Staff / Member..." 
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-honey-500/10 transition-all"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full md:w-auto">
               <div className="min-w-[140px]">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block ml-2">Dari</label>
                  <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" />
               </div>
               <div className="min-w-[140px]">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block ml-2">Sampai</label>
                  <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" />
               </div>
            </div>
            <button onClick={() => { setSearchQuery(''); setDateStart(''); setDateEnd(''); }} className="p-3.5 bg-slate-100 text-slate-400 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all" title="Reset Filter">
              <i className="fas fa-undo-alt"></i>
            </button>
          </div>
        </div>
      )}

      {activeSubTab === 'manage' ? (
        <div className="space-y-4">
          <div className="flex justify-end">
              <button onClick={() => setIsModalOpen(true)} className="bg-honey-600 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-honey-100 hover:bg-honey-700 transition-all">+ Buat Pengajuan Baru</button>
          </div>
          <div className="bg-white rounded-[2rem] border overflow-hidden shadow-sm hidden md:block">
             <table className="w-full text-left">
                <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-400 border-b">
                   <tr><th className="px-8 py-4">Ref / Tanggal</th><th className="px-8 py-4">Status</th><th className="px-8 py-4 text-center">Admin Note</th><th className="px-8 py-4">Total Biaya</th><th className="px-8 py-4 text-right">Aksi</th></tr>
                </thead>
                <tbody className="divide-y text-sm font-bold">
                   {paginatedManageOrders.map(o => (
                     <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-8 py-5">
                           <p className="font-black text-honey-600 text-xs">#{o.id.toUpperCase()}</p>
                           <p className="text-[9px] text-slate-400 uppercase tracking-widest">{o.staffId} | {new Date(o.createdAt).toLocaleDateString()}</p>
                        </td>
                        <td className="px-8 py-5">
                           <span className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase ${o.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' : o.status === 'RECEIVED' ? 'bg-emerald-100 text-emerald-600' : o.status === 'DECLINED' ? 'bg-rose-100 text-rose-600' : 'bg-honey-100 text-honey-600'}`}>{o.status}</span>
                        </td>
                        <td className="px-8 py-5 text-center text-[10px] text-slate-500 uppercase">{o.notes || '-'}</td>
                        <td className="px-8 py-5 font-black text-slate-700">Rp {Number(o.totalCost).toLocaleString('id-ID')}</td>
                        <td className="px-8 py-5 text-right">
                           <div className="flex justify-end gap-2">
                              <button onClick={() => { setViewingOrder(o); setIsViewOrderModalOpen(true); }} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-all" title="Review Order"><i className="fas fa-eye"></i></button>
                              {isAdmin && o.status === 'PENDING' && (
                                <div className="flex gap-2">
                                  <button onClick={() => onSaveOrder({...o, status: OrderStatus.APPROVED, approvedAt: new Date().toISOString(), approvedBy: user.name})} className="bg-honey-600 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase shadow-md hover:bg-honey-700">Approve</button>
                                  <button onClick={() => { 
                                    const reason = window.prompt("Alasan penolakan:", "");
                                    if(reason !== null) onSaveOrder({...o, status: OrderStatus.DECLINED, notes: reason}); 
                                  }} className="bg-rose-600 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase shadow-md hover:bg-rose-700">Decline</button>
                                </div>
                              )}
                              {o.status === 'APPROVED' && <button onClick={() => { setReceiveData(JSON.parse(JSON.stringify(o))); setIsReceiveModalOpen(true); }} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase shadow-md hover:bg-emerald-700">Terima Barang</button>}
                           </div>
                        </td>
                     </tr>
                   ))}
                </tbody>
             </table>
             {filteredManageOrders.length === 0 && <div className="p-20 text-center text-slate-300 font-black uppercase text-[10px] tracking-widest">Tidak ada data order ditemukan</div>}
             {totalManagePages > 1 && (
               <div className="p-6 bg-slate-50 border-t flex items-center justify-between">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Halaman {managePage} dari {totalManagePages}</p>
                  <div className="flex gap-2">
                      <button disabled={managePage === 1} onClick={() => setManagePage(prev => prev - 1)} className="p-2 px-4 bg-white border rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-30 transition-all active:scale-95">Prev</button>
                      <button disabled={managePage === totalManagePages} onClick={() => setManagePage(prev => prev + 1)} className="p-2 px-4 bg-white border rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-30 transition-all active:scale-95">Next</button>
                  </div>
               </div>
             )}
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-slate-100 bg-white rounded-[2rem] border overflow-hidden shadow-sm">
            {paginatedManageOrders.map(o => (
              <div key={o.id} className="p-4 flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-black text-honey-600 text-xs">#{o.id.slice(-8).toUpperCase()}</p>
                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">{new Date(o.createdAt).toLocaleDateString()}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${o.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' : o.status === 'RECEIVED' ? 'bg-emerald-100 text-emerald-600' : o.status === 'DECLINED' ? 'bg-rose-100 text-rose-600' : 'bg-honey-100 text-honey-600'}`}>
                    {o.status}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <p className="font-black text-slate-700 text-sm">Rp {o.totalCost.toLocaleString()}</p>
                  <div className="flex gap-2">
                    <button onClick={() => { setViewingOrder(o); setIsViewOrderModalOpen(true); }} className="p-2 bg-slate-50 text-slate-400 rounded-lg border border-slate-200"><i className="fas fa-eye"></i></button>
                    {isAdmin && o.status === 'PENDING' && (
                      <div className="flex gap-2">
                        <button onClick={() => onSaveOrder({...o, status: OrderStatus.APPROVED, approvedAt: new Date().toISOString(), approvedBy: user.name})} className="bg-honey-600 text-white px-3 py-1.5 rounded-lg text-[8px] font-black uppercase">Approve</button>
                        <button onClick={() => { 
                          const reason = window.prompt("Alasan penolakan:", "");
                          if(reason !== null) onSaveOrder({...o, status: OrderStatus.DECLINED, notes: reason}); 
                        }} className="bg-rose-600 text-white px-3 py-1.5 rounded-lg text-[8px] font-black uppercase">Decline</button>
                      </div>
                    )}
                    {o.status === 'APPROVED' && <button onClick={() => { setReceiveData(JSON.parse(JSON.stringify(o))); setIsReceiveModalOpen(true); }} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[8px] font-black uppercase">Terima</button>}
                  </div>
                </div>
              </div>
             ))}
             {filteredManageOrders.length === 0 && <div className="p-10 text-center text-slate-300 font-black uppercase text-[10px]">Belum ada data order ditemukan</div>}
             {totalManagePages > 1 && (
               <div className="p-4 bg-slate-50 border-t flex justify-center gap-4">
                  <button disabled={managePage === 1} onClick={() => setManagePage(prev => prev - 1)} className="p-2 px-4 bg-white border rounded-xl text-[10px] font-black uppercase disabled:opacity-30 transition-all active:scale-95">Prev</button>
                  <button disabled={managePage === totalManagePages} onClick={() => setManagePage(prev => prev + 1)} className="p-2 px-4 bg-white border rounded-xl text-[10px] font-black uppercase disabled:opacity-30 transition-all active:scale-95">Next</button>
               </div>
             )}
          </div>
        </div>
      ) : activeSubTab === 'member' ? (
        <div className="space-y-4">
          <div className="bg-white rounded-[2rem] border overflow-hidden shadow-sm hidden md:block">
             <table className="w-full text-left">
                <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-400 border-b">
                   <tr><th className="px-8 py-4">Ref / Tanggal</th><th className="px-8 py-4">Status Bayar</th><th className="px-8 py-4">Pelanggan</th><th className="px-8 py-4">Total</th><th className="px-8 py-4 text-right">Aksi</th></tr>
                </thead>
                <tbody className="divide-y text-sm font-bold">
                   {paginatedMemberOrders.map(t => (
                     <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-8 py-5">
                           <p className="font-black text-rose-600 text-xs">#{t.id.toUpperCase()}</p>
                           <p className="text-[9px] text-slate-400 uppercase tracking-widest">{new Date(t.timestamp).toLocaleDateString()}</p>
                        </td>
                        <td className="px-8 py-5">
                           <span className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase ${t.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                             {t.paymentStatus === 'PAID' ? 'TERBAYAR' : 'BELUM BAYAR'}
                           </span>
                        </td>
                        <td className="px-8 py-5 text-slate-700 uppercase text-xs">{t.customerName || 'UMUM'}</td>
                        <td className="px-8 py-5 font-black text-honey-600">Rp {Number(t.total).toLocaleString('id-ID')}</td>
                        <td className="px-8 py-5 text-right">
                           <button onClick={() => { setViewingOrder(t); setIsViewOrderModalOpen(true); }} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-all"><i className="fas fa-eye"></i></button>
                        </td>
                     </tr>
                   ))}
                </tbody>
             </table>
             {filteredMemberOrders.length === 0 && <div className="p-20 text-center text-slate-300 font-black uppercase text-[10px] tracking-widest">Tidak ada pesanan member ditemukan</div>}
             {totalMemberPages > 1 && (
                <div className="p-6 bg-slate-50 border-t flex items-center justify-between">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Halaman {memberPage} dari {totalMemberPages}</p>
                   <div className="flex gap-2">
                       <button disabled={memberPage === 1} onClick={() => setMemberPage(prev => prev - 1)} className="p-2 px-4 bg-white border rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-30 transition-all active:scale-95">Prev</button>
                       <button disabled={memberPage === totalMemberPages} onClick={() => setMemberPage(prev => prev + 1)} className="p-2 px-4 bg-white border rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-30 transition-all active:scale-95">Next</button>
                   </div>
                </div>
             )}
          </div>
          
          <div className="md:hidden divide-y divide-slate-100 bg-white rounded-[2rem] border overflow-hidden shadow-sm">
             {paginatedMemberOrders.map(t => (
                <div key={t.id} className="p-4 flex flex-col gap-2">
                   <div className="flex justify-between">
                      <p className="font-black text-rose-600 text-xs">#{t.id.slice(-8).toUpperCase()}</p>
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${t.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>{t.paymentStatus}</span>
                   </div>
                   <p className="text-xs font-black text-slate-800 uppercase">{t.customerName || 'PELANGGAN UMUM'}</p>
                   <div className="flex justify-between items-center">
                      <p className="font-black text-honey-600 text-sm">Rp {Number(t.total).toLocaleString('id-ID')}</p>
                      <button onClick={() => { setViewingOrder(t); setIsViewOrderModalOpen(true); }} className="p-2 bg-slate-50 text-slate-400 rounded-lg border border-slate-200"><i className="fas fa-eye"></i></button>
                   </div>
                </div>
             ))}
             {filteredMemberOrders.length === 0 && <div className="p-10 text-center text-slate-300 font-black uppercase text-[10px]">Belum ada pesanan member ditemukan</div>}
             {totalMemberPages > 1 && (
                <div className="p-4 bg-slate-50 border-t flex justify-center gap-4">
                   <button disabled={memberPage === 1} onClick={() => setMemberPage(prev => prev - 1)} className="p-2 px-4 bg-white border rounded-xl text-[10px] font-black uppercase disabled:opacity-30 transition-all active:scale-95">Prev</button>
                   <button disabled={memberPage === totalMemberPages} onClick={() => setMemberPage(prev => prev + 1)} className="p-2 px-4 bg-white border rounded-xl text-[10px] font-black uppercase disabled:opacity-30 transition-all active:scale-95">Next</button>
                </div>
             )}
          </div>
        </div>
      ) : activeSubTab === 'proposals' ? (
        <div className="space-y-6">
           <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {stockAdjustments
                 .filter(adj => {
                   const q = searchQuery.toLowerCase().trim();
                   const product = products.find(p => p.id === adj.productId);
                   const matchesSearch = !q || (product?.name.toLowerCase().includes(q) || product?.sku.toLowerCase().includes(q) || adj.staffId.toLowerCase().includes(q));
                   return matchesSearch;
                 })
                 .sort((a,b) => {
                   // Put PENDING at top for Admin
                   if (isAdmin) {
                     if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
                     if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
                   }
                   return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
                 })
                 .slice((proposalsPage - 1) * itemsPerPage, proposalsPage * itemsPerPage)
                 .map(adj => {
                    const product = products.find(p => p.id === adj.productId);
                    return (
                      <div key={adj.id} className="bg-white rounded-[2rem] border border-slate-200 p-6 hover:border-honey-300 transition-all shadow-sm flex flex-col relative overflow-hidden group">
                        <div className="flex justify-between items-start mb-4">
                          <span className={`px-2.5 py-1 text-[8px] font-black rounded-lg uppercase tracking-widest ${
                            adj.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' : 
                            adj.status === 'NORMAL' || adj.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                          }`}>
                            {adj.status === 'PENDING' ? 'Menunggu Approval' : adj.status === 'NORMAL' || adj.status === 'APPROVED' ? 'Disetujui' : 'Dibatalkan/Ditolak'}
                          </span>
                          <span className="text-[8px] font-bold text-slate-400 uppercase">{new Date(adj.timestamp).toLocaleDateString('id-ID', {day:'2-digit', month:'short'})}</span>
                        </div>

                        <div className="flex items-center gap-4 mb-4">
                          <div className="w-12 h-12 bg-slate-50 border rounded-xl flex items-center justify-center text-slate-300 overflow-hidden shrink-0">
                            {product?.image ? <img src={product.image} className="w-full h-full object-cover" alt="Product" /> : <i className="fas fa-box text-xl"></i>}
                          </div>
                          <div className="min-w-0">
                             <p className="font-black text-slate-800 text-sm truncate uppercase">{product?.name || 'Produk Tidak Dikenal'}</p>
                             <p className="text-[9px] font-mono text-slate-400 font-bold uppercase tracking-tighter">Oleh: {adj.staffId}</p>
                          </div>
                        </div>

                        <div className="bg-slate-50 rounded-2xl p-4 mb-4 space-y-2 border border-slate-100">
                           <div className="flex justify-between items-center">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Tipe Masalah</span>
                              <span className="text-[9px] font-black text-rose-600 uppercase">{adj.type || 'ADJUSTMENT'}</span>
                           </div>
                           <div className="flex justify-between items-center pt-2 border-t border-slate-200/50">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Jumlah Unit</span>
                              <span className="text-xs font-black text-slate-700">{adj.quantity} Unit</span>
                           </div>
                        </div>

                        <div className="mb-6 flex-1">
                           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Keterangan:</p>
                           <p className="text-[10px] text-slate-600 font-bold leading-relaxed line-clamp-3 italic">"{adj.notes || '-'}"</p>
                        </div>

                        {isAdmin && adj.status === 'PENDING' ? (
                          <div className="grid grid-cols-2 gap-3 mt-auto">
                            <button 
                              onClick={() => handleAuditAction('cancel', { ref: `ADJ-${adj.id}`, productId: adj.productId })} 
                              className="py-3 bg-slate-100 text-slate-500 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-rose-50 hover:text-rose-600 transition-all"
                            >
                              Tolak
                            </button>
                            <button 
                              onClick={() => handleAuditAction('approve_adjustment', { ref: `ADJ-${adj.id}`, productId: adj.productId })} 
                              className="py-3 bg-honey-600 text-white rounded-2xl font-black text-[9px] uppercase tracking-widest shadow-lg shadow-honey-100 hover:bg-honey-700 transition-all"
                            >
                              Setujui
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => { setAuditProductId(adj.productId); setActiveSubTab('stock'); }}
                            className="w-full py-3 bg-slate-50 text-slate-400 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-100 transition-all border border-slate-100 mt-auto"
                          >
                            Lihat Audit Produk
                          </button>
                        )}
                      </div>
                    );
                 })}
             </div>
             {stockAdjustments.length === 0 && (
               <div className="py-20 text-center text-slate-300 font-black uppercase text-[10px] tracking-widest">Tidak ada pengajuan masalah stok</div>
             )}
             {Math.ceil(stockAdjustments.length / itemsPerPage) > 1 && (
               <div className="mt-8 flex items-center justify-between border-t pt-6">
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Halaman {proposalsPage} dari {Math.ceil(stockAdjustments.length / itemsPerPage)}</p>
                 <div className="flex gap-2">
                   <button disabled={proposalsPage === 1} onClick={() => setProposalsPage(p => p - 1)} className="px-4 py-2 bg-white border rounded-lg text-[10px] font-black uppercase disabled:opacity-30">Prev</button>
                   <button disabled={proposalsPage === Math.ceil(stockAdjustments.length / itemsPerPage)} onClick={() => setProposalsPage(p => p + 1)} className="px-4 py-2 bg-white border rounded-lg text-[10px] font-black uppercase disabled:opacity-30">Next</button>
                 </div>
               </div>
             )}
           </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm flex flex-col lg:flex-row gap-6 items-end">
             <div className="flex-1 w-full relative" ref={dropdownRef}>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block ml-2">Audit Produk Spesifik</label>
                <div className="flex gap-2">
                  <div onClick={() => setShowAuditDropdown(!showAuditDropdown)} className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold cursor-pointer hover:bg-white transition-all shadow-inner">
                    {auditProductId ? products.find(p => p.id === auditProductId)?.name : "-- Cari & Pilih Produk --"}
                  </div>
                  {auditProductId && (
                    <button onClick={() => setAuditProductId('')} className="p-4 bg-white border rounded-2xl text-rose-500 hover:bg-rose-50 transition-all shadow-sm" title="Hapus Pilihan">
                      <i className="fas fa-times"></i>
                    </button>
                  )}
                </div>
                {showAuditDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border z-[120] overflow-hidden">
                    <div className="p-3 border-b bg-slate-50"><input autoFocus type="text" placeholder="Ketik Nama atau SKU..." className="w-full p-2 bg-white border rounded-xl text-xs font-bold outline-none" value={auditSearchTerm} onChange={e => setAuditSearchTerm(e.target.value)} /></div>
                    <div className="max-h-60 overflow-y-auto">
                      {availableProducts.filter(p => p.name.toLowerCase().includes(auditSearchTerm.toLowerCase()) || p.sku.toLowerCase().includes(auditSearchTerm.toLowerCase())).map(p => (
                        <div key={p.id} onClick={() => { setAuditProductId(p.id); setShowAuditDropdown(false); }} className="px-4 py-3 hover:bg-honey-50 cursor-pointer text-xs font-bold border-b last:border-0 flex justify-between uppercase">
                           <span>{p.name}</span>
                           <span className="text-[9px] text-slate-400">{p.sku}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
             </div>

             <div className="w-full lg:w-64">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block ml-2">Filter Kategori</label>
                <select 
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none shadow-inner"
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                >
                  <option value="">-- Semua Kategori --</option>
                  {categories.filter(c => !isTenant || tenantCategories.length === 0 || tenantCategories.includes(c.name.trim().toUpperCase())).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
             </div>

             <div className="flex items-center gap-2 w-full lg:w-auto">
               <button onClick={onRefreshData} className="p-4 bg-white border rounded-2xl text-slate-400 hover:text-honey-600 transition-all shadow-sm active:scale-95" title="Refresh Data">
                 <i className="fas fa-sync-alt"></i>
               </button>
               
               {auditProductId && (
                 <button onClick={exportAuditToExcel} className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all shadow-sm active:scale-95" title="Export Audit Produk">
                   <i className="fas fa-file-excel"></i>
                 </button>
               )}

               {selectedCategory && (
                 <button onClick={exportCategoryAuditToExcel} className="p-4 bg-honey-50 border border-honey-100 rounded-2xl text-honey-600 hover:bg-honey-600 hover:text-white transition-all shadow-sm active:scale-95 flex items-center gap-2" title="Export Ringkasan Kategori">
                   <i className="fas fa-file-download"></i>
                   <span className="text-[10px] font-black uppercase hidden sm:inline">Export Kategori</span>
                 </button>
               )}

               {auditProductId && (
                 <button onClick={() => setIsAdjustmentModalOpen(true)} className="bg-rose-600 text-white px-6 py-4 rounded-2xl font-black uppercase text-[10px] shadow-lg shadow-rose-100 flex items-center gap-2 active:scale-95 transition-all whitespace-nowrap">
                   <i className="fas fa-exclamation-triangle"></i> Laporkan Masalah Stok
                 </button>
               )}
             </div>
          </div>
          {auditProductId && (
             <div className="bg-white rounded-[2.5rem] border overflow-hidden shadow-sm">
                <div className="overflow-x-auto hidden md:block">
                  <table className="w-full text-left">
                     <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-400 border-b">
                        <tr>
                          <th className="px-6 py-4">Waktu</th>
                          <th className="px-6 py-4">Aktivitas</th>
                          <th className="px-6 py-4">PIC</th>
                          <th className="px-6 py-4 text-center">Mutasi</th>
                          <th className="px-6 py-4 text-center bg-honey-50">Saldo Akhir</th>
                          {isAdmin && <th className="px-6 py-4 text-right">Aksi</th>}
                        </tr>
                     </thead>
                     <tbody className="text-[11px] font-bold">
                        {isFetchingAudit ? (
                          <tr><td colSpan={7} className="px-6 py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]"><i className="fas fa-spinner fa-spin text-honey-600 text-2xl mb-2 block"></i>Memuat Riwayat Lengkap...</td></tr>
                        ) : paginatedAuditData.map((h, i) => (
                          <tr key={i} className={`border-b last:border-0 hover:bg-slate-50 transition-colors ${h.status === 'CANCELLED' ? 'opacity-40 grayscale' : ''}`}>
                             <td className="px-6 py-4 text-slate-500 font-mono uppercase">
                               {h.date}
                               {h.status !== 'NORMAL' && <span className={`block text-[7px] font-black mt-1 ${h.status === 'REVISED' ? 'text-honey-500' : 'text-red-500'}`}>{h.status}</span>}
                             </td>
                             <td className="px-6 py-4">
                                <p className="text-[9px] font-black uppercase tracking-widest">{h.type}</p>
                                <p className="text-[8px] text-slate-300">Ref: #{h.ref.slice(-10).toUpperCase()}</p>
                             </td>
                             <td className="px-6 py-4 text-slate-600 uppercase text-[10px] font-black">{h.staffId}</td>
                             <td className={`px-6 py-4 text-center font-black ${h.qty > 0 ? 'text-emerald-600' : h.qty < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                {h.qty > 0 ? `+${h.qty}` : h.qty}
                             </td>
                             <td className="px-6 py-4 text-center bg-honey-50/30 font-black text-xs text-honey-700">{h.endingBalance}</td>
                             {isAdmin && (
                               <td className="px-6 py-4 text-right">
                                 {h.status === 'PENDING' ? (
                                   <button onClick={() => handleAuditAction('approve_adjustment', h)} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all text-[9px] font-black uppercase flex items-center gap-2 ml-auto">
                                     <i className="fas fa-check"></i> Setujui
                                   </button>
                                 ) : h.status !== 'CANCELLED' && (
                                   <div className="flex justify-end gap-2">
                                     <button onClick={() => { setEditingAuditItem(h); setEditAuditDate(h.timestamp.split(' ')[0]); setEditAuditQty(h.qty); setIsAuditEditModalOpen(true); }} className="p-2 bg-honey-50 text-honey-600 rounded-lg hover:bg-honey-600 hover:text-white transition-all"><i className="fas fa-edit"></i></button>
                                     <button onClick={() => handleAuditAction('cancel', h)} className="p-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-600 hover:text-white transition-all"><i className="fas fa-trash-alt"></i></button>
                                   </div>
                                 )}
                               </td>
                             )}
                          </tr>
                        ))}
                     </tbody>
                  </table>
                </div>

                {/* Mobile Card View for Audit */}
                <div className="md:hidden divide-y divide-slate-100">
                  {isFetchingAudit ? (
                    <div className="py-20 text-center"><i className="fas fa-spinner fa-spin text-honey-600 text-2xl mb-2 block"></i><span className="text-[10px] text-slate-400 uppercase font-black uppercase tracking-widest font-bold">Memuat Riwayat Lengkap...</span></div>
                  ) : paginatedAuditData.map((h, i) => (
                    <div key={i} className={`p-4 flex flex-col gap-2 ${h.status === 'CANCELLED' ? 'opacity-40 grayscale bg-slate-50' : ''}`}>
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col">
                          <span className="text-[8px] font-mono text-slate-400 uppercase">{h.date}</span>
                          {h.status !== 'NORMAL' && <span className={`text-[7px] font-black uppercase ${h.status === 'REVISED' ? 'text-honey-500' : 'text-red-500'}`}>{h.status}</span>}
                        </div>
                        <span className={`text-[10px] font-black ${h.qty > 0 ? 'text-emerald-600' : h.qty < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                          {h.qty > 0 ? `+${h.qty}` : h.qty}
                        </span>
                      </div>
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-800">{h.type}</p>
                          <p className="text-[8px] text-slate-400">PIC: {h.staffId}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[8px] font-black text-slate-400 uppercase">Saldo</p>
                          <p className="text-xs font-black text-honey-700">{h.endingBalance}</p>
                        </div>
                      </div>
                      {isAdmin && h.status === 'PENDING' && (
                        <button onClick={() => handleAuditAction('approve_adjustment', h)} className="w-full py-2 mt-2 bg-emerald-600 text-white rounded-lg font-black text-[8px] uppercase flex items-center justify-center gap-2">
                          <i className="fas fa-check"></i> Setujui
                        </button>
                      )}
                      {isAdmin && h.status !== 'CANCELLED' && h.status !== 'PENDING' && (
                        <div className="flex gap-2 mt-2 pt-2 border-t border-slate-50">
                          <button onClick={() => { setEditingAuditItem(h); setEditAuditDate(h.timestamp.split(' ')[0]); setEditAuditQty(h.qty); setIsAuditEditModalOpen(true); }} className="flex-1 py-2 bg-honey-50 text-honey-600 rounded-lg font-black text-[8px] uppercase">Edit</button>
                          <button onClick={() => handleAuditAction('cancel', h)} className="flex-1 py-2 bg-rose-50 text-rose-600 rounded-lg font-black text-[8px] uppercase">Batal</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {auditData.length === 0 && <div className="p-10 text-center text-slate-300 font-black uppercase text-[10px]">Belum ada riwayat mutasi</div>}
                </div>

                {/* Audit Pagination */}
                {totalAuditPages > 1 && (
                  <div className="p-4 bg-slate-50 border-t flex items-center justify-center gap-2">
                    <button disabled={auditPage === 1} onClick={() => setAuditPage(p => p - 1)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-honey-600 disabled:opacity-30"><i className="fas fa-chevron-left"></i></button>
                    <div className="flex gap-1">
                       {[...Array(totalAuditPages)].map((_, i) => (
                         <button key={i} onClick={() => setAuditPage(i + 1)} className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${auditPage === i + 1 ? 'bg-honey-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-100'}`}>{i + 1}</button>
                       )).slice(Math.max(0, auditPage - 3), Math.min(totalAuditPages, auditPage + 2))}
                    </div>
                    <button disabled={auditPage === totalAuditPages} onClick={() => setAuditPage(p => p + 1)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-honey-600 disabled:opacity-30"><i className="fas fa-chevron-right"></i></button>
                  </div>
                )}
             </div>
          )}
        </div>
      )}

      {/* Receive Modal */}
      {isReceiveModalOpen && receiveData && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-10 max-w-md w-full shadow-2xl animate-in zoom-in duration-200">
            <h3 className="text-xl font-black mb-6 uppercase tracking-tight text-emerald-600">Terima Barang</h3>
            <div className="space-y-5">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1 block">Tanggal Penerimaan</label>
                <input type="date" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={receiveDate} onChange={e => setReceiveDate(e.target.value)} />
              </div>
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                <p className="text-[9px] font-black text-emerald-600 uppercase mb-1">Ringkasan Order</p>
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {receiveData.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-[10px] font-bold text-slate-600 uppercase">
                      <span>{item.name}</span>
                      <span>{item.quantity} Unit</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={() => setIsReceiveModalOpen(false)} className="flex-1 py-4 bg-slate-100 rounded-2xl font-black text-[10px] uppercase text-slate-500">Batal</button>
              <button onClick={handleReceiveSubmit} className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-emerald-100">Konfirmasi Terima</button>
            </div>
          </div>
        </div>
      )}

      {/* View Order Modal */}
      {isViewOrderModalOpen && viewingOrder && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-10 max-w-2xl w-full shadow-2xl animate-in zoom-in duration-200 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">Review Order</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ref: #{viewingOrder.id.toUpperCase()}</p>
              </div>
              <button onClick={() => exportOrderToExcel(viewingOrder)} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-emerald-50"><i className="fas fa-file-excel mr-2"></i> Export Detail</button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {viewingOrder.id.startsWith('ORD-') && (
                <div className="p-6 bg-honey-50 border border-honey-200 rounded-[2rem] space-y-4">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[10px] font-black text-honey-600 uppercase tracking-widest">Update Progres & Validasi</p>
                    <div className="flex items-center gap-2">
                       <input 
                         type="checkbox" 
                         id="pay_confirm" 
                         className="w-4 h-4 rounded text-honey-600 focus:ring-honey-500"
                         checked={memberPayConfirm || viewingOrder.paymentStatus === 'PAID'}
                         disabled={viewingOrder.paymentStatus === 'PAID'}
                         onChange={(e) => setMemberPayConfirm(e.target.checked)}
                       />
                       <label htmlFor="pay_confirm" className="text-[10px] font-black text-slate-600 uppercase cursor-pointer">
                         {viewingOrder.paymentStatus === 'PAID' ? 'PEMBAYARAN VALID' : 'KONFIRMASI PEMBAYARAN'}
                       </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[8px] font-black text-slate-400 uppercase ml-2 mb-1 block">Tanggal Update</label>
                      <input 
                        type="date" 
                        className="w-full p-3 bg-white border border-honey-100 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-honey-500/20" 
                        value={memberUpdateDate} 
                        onChange={e => setMemberUpdateDate(e.target.value)} 
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-[8px] font-black text-slate-400 uppercase ml-2 mb-1 block">Status Unit</label>
                      <div className="flex flex-wrap gap-1">
                        {(['PENDING', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED'] as const).map(s => (
                          <button 
                            key={s}
                            onClick={() => {
                              // Just set localized state as visual hint, actual update button below
                              // But user might expect immediate update. Let's make it a button that triggers the full update
                              handleUpdateMemberOrder(s);
                            }}
                            disabled={isUpdatingMemberStatus}
                            className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase transition-all flex-1 ${viewingOrder.orderStatus === s ? 'bg-honey-600 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-100 hover:border-honey-300'}`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                     <label className="text-[8px] font-black text-slate-400 uppercase ml-2 mb-1 block">Catatan Progres</label>
                     <textarea 
                       placeholder="Contoh: Barang sedang dikemas atau Pesanan sudah di kurir..." 
                       className="w-full p-4 bg-white border border-honey-100 rounded-2xl font-bold text-xs outline-none focus:ring-2 focus:ring-honey-500/20 resize-none h-20"
                       value={memberUpdateNotes}
                       onChange={e => setMemberUpdateNotes(e.target.value)}
                     />
                  </div>
                  
                  <p className="text-[8px] text-honey-400 font-bold italic">* Klik salah satu status di atas untuk menyimpan pembaruan.</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-2xl border">
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{viewingOrder.staffId ? 'PIC' : 'Pelanggan'}</p>
                  <p className="text-xs font-black text-slate-700 uppercase">{viewingOrder.staffId || viewingOrder.customerName || 'UMUM'}</p>
                  <p className="text-[9px] text-slate-400">{new Date(viewingOrder.createdAt || viewingOrder.timestamp).toLocaleString()}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border">
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Status</p>
                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${viewingOrder.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' : viewingOrder.status === 'RECEIVED' || viewingOrder.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-600' : viewingOrder.status === 'DECLINED' ? 'bg-rose-100 text-rose-600' : 'bg-honey-100 text-honey-600'}`}>
                    {viewingOrder.status || viewingOrder.paymentStatus}
                  </span>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl border overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-[8px] font-black uppercase text-slate-400 border-b">
                    <tr>
                      <th className="px-4 py-3">Produk</th>
                      <th className="px-4 py-3 text-center">Stok</th>
                      <th className="px-4 py-3 text-center">Avg / Bln</th>
                      <th className="px-4 py-3 text-center">Qty</th>
                      <th className="px-4 py-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-[10px] font-bold">
                    {viewingOrder.items.map((item: any, idx: number) => {
                      const product = products.find((p: any) => p.id === item.productId);
                      return (
                      <tr key={idx}>
                        <td className="px-4 py-3 uppercase">
                          {item.name}
                          <p className="text-[7px] text-slate-400">{item.sku}</p>
                        </td>
                        <td className="px-4 py-3 text-center font-black">{product?.stock || 0}</td>
                        <td className="px-4 py-3 text-center text-honey-600 font-black">{product?.avgMonthlySales || 0}</td>
                        <td className="px-4 py-3 text-center">{item.quantity}</td>
                        <td className="px-4 py-3 text-right font-black">Rp {Number(item.subtotal).toLocaleString('id-ID')}</td>
                      </tr>
                    );})}
                  </tbody>
                  <tfoot className="bg-slate-100 font-black text-[10px]">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-right uppercase">Total {viewingOrder.totalCost ? 'Biaya' : 'Pesanan'}</td>
                      <td className="px-4 py-3 text-right text-honey-600">Rp {Number(viewingOrder.totalCost || viewingOrder.total).toLocaleString('id-ID')}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="mt-8">
              <button onClick={() => setIsViewOrderModalOpen(false)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl">Tutup Review</button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {isAdjustmentModalOpen && auditProductId && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[150] flex items-center justify-center p-4">
           <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-10 max-w-sm w-full shadow-2xl animate-in zoom-in duration-200">
              <h3 className="text-lg md:text-xl font-black mb-4 md:mb-6 uppercase tracking-tight text-rose-600">Laporan Masalah Stok</h3>
              <div className="space-y-5">
                 <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1 block">Tanggal Laporan</label>
                    <input type="date" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={adjDate} onChange={e => setAdjDate(e.target.value)} />
                 </div>
                 <div>
                   <label className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1 block">Jumlah (Qty Rusak/Hilang)</label>
                   <input type="number" min="1" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xl shadow-inner outline-none" value={adjQty} onChange={e => setAdjQty(Number(e.target.value))} />
                 </div>
                 <div>
                   <label className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1 block">Tipe Masalah</label>
                   <select className="w-full p-4 bg-slate-50 border rounded-2xl font-bold uppercase text-xs" value={adjType} onChange={e => setAdjType(e.target.value as any)}>
                      <option value="DAMAGE">Barang Rusak</option>
                      <option value="LOSS">Barang Hilang / Selisih</option>
                      <option value="EXPIRED">Sudah Kadaluwarsa</option>
                      <option value="IN">Stok Masuk (Lain-lain)</option>
                      <option value="RESTOCK">Restock Manual</option>
                      <option value="RETURN">Retur Pelanggan</option>
                      <option value="OTHER">Lainnya</option>
                   </select>
                 </div>
                 <textarea placeholder="Tulis catatan rincian..." className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-medium text-xs h-24 shadow-inner resize-none" value={adjNotes} onChange={e => setAdjNotes(e.target.value)} />
              </div>
              <div className="flex gap-4 mt-8">
                 <button onClick={() => setIsAdjustmentModalOpen(false)} className="flex-1 py-4 bg-slate-100 rounded-2xl font-black text-[10px] uppercase text-slate-500">Batal</button>
                 <button onClick={handleStockAdjustment} className="flex-1 py-4 bg-rose-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-rose-100">Kirim Laporan</button>
              </div>
           </div>
        </div>
      )}

      {/* New Order Modal (Searchable) remains same */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[110] flex items-center justify-center p-4">
           <div className="bg-white rounded-[2rem] md:rounded-[3rem] p-6 md:p-10 max-w-xl w-full flex flex-col max-h-[90vh] shadow-2xl animate-in zoom-in duration-200">
              <h3 className="text-lg md:text-xl font-black mb-6 md:mb-8 uppercase text-slate-900 tracking-tight">Form Pengajuan Stok Baru</h3>
              <div className="grid grid-cols-2 gap-5 mb-6" ref={orderDropdownRef}>
                 <div className="col-span-2 relative">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Cari Produk Katalog</label>
                    <div onClick={() => setShowOrderDropdown(!showOrderDropdown)} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold cursor-pointer shadow-inner">
                      {selectedProductId ? availableProducts.find(p => p.id === selectedProductId)?.name : "-- Klik untuk mencari produk --"}
                    </div>
                    {showOrderDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border z-[120] overflow-hidden">
                        <div className="p-3 border-b bg-slate-50"><input autoFocus type="text" placeholder="Ketik Nama atau SKU..." className="w-full p-2 bg-white border rounded-xl text-xs font-bold outline-none" value={orderSearchTerm} onChange={e => setOrderSearchTerm(e.target.value)} /></div>
                        <div className="max-h-60 overflow-y-auto">
                          {filteredOrderProducts.map(p => (
                            <div key={p.id} onClick={() => { setSelectedProductId(p.id); setOrderCost(p.costPrice); setShowOrderDropdown(false); setOrderSearchTerm(''); }} className="px-4 py-3 hover:bg-honey-50 cursor-pointer text-xs font-bold border-b last:border-0 flex justify-between items-center group">
                               <div className="flex flex-col">
                                 <span className="text-xs font-black text-slate-800 uppercase">{p.name}</span>
                                 <span className="text-[9px] text-slate-400 font-bold uppercase">{p.sku} | Stok: {p.stock} | Avg: {p.avgMonthlySales || 0}/Bln</span>
                               </div>
                               <i className="fas fa-plus text-slate-300 group-hover:text-honey-500 transition-colors"></i>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                 </div>
                 <div><label className="text-[10px] font-black ml-2 uppercase text-slate-400">Kuantitas</label><input type="number" className="w-full p-4 bg-slate-50 border rounded-2xl font-black shadow-inner" value={orderQty} onChange={e => setOrderQty(Number(e.target.value))} /></div>
                 <div><label className="text-[10px] font-black ml-2 uppercase text-slate-400">Harga Satuan (HPP)</label><input type="number" className="w-full p-4 bg-slate-50 border rounded-2xl font-black shadow-inner" value={orderCost} onChange={e => setOrderCost(Number(e.target.value))} /></div>
              </div>
              <button onClick={addOrderItem} disabled={!selectedProductId} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase mb-8 shadow-xl disabled:opacity-30">Tambahkan Ke Daftar</button>
              
              <div className="flex-1 overflow-y-auto mb-8 bg-slate-50 rounded-2xl p-6 shadow-inner custom-scrollbar">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-200 pb-2">Daftar Item Pengajuan:</p>
                 {orderItems.length === 0 ? <p className="text-center py-10 text-slate-300 font-black uppercase text-[10px] tracking-widest italic">Belum ada item ditambahkan</p> : 
                   orderItems.map((it, idx) => (
                    <div key={idx} className="flex justify-between items-center py-3 border-b border-slate-100 last:border-0">
                       <div>
                          <p className="text-xs font-black uppercase text-slate-800 leading-none">{it.name}</p>
                          <p className="text-[9px] text-slate-400 mt-1 uppercase font-bold">{it.quantity} Unit @ Rp {it.estimatedCost.toLocaleString()}</p>
                       </div>
                       <button onClick={() => setOrderItems(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 transition-colors"><i className="fas fa-times-circle"></i></button>
                    </div>
                 ))}
              </div>
              
              <div className="flex gap-4 shrink-0">
                 <button onClick={() => setIsModalOpen(false)} className="flex-1 py-4 bg-slate-100 rounded-2xl font-black text-[10px] uppercase text-slate-500">Batal</button>
                 <button onClick={async() => { 
                   if(orderItems.length === 0) return;
                   if(onSaveOrder && typeof onSaveOrder === 'function') {
                      await onSaveOrder({ id: `ORD-${Date.now()}`, staffId: user.name, status: OrderStatus.PENDING, items: orderItems, totalCost: orderItems.reduce((s,i)=>s+i.subtotal,0), createdAt: new Date().toISOString() }); 
                   }
                   setIsModalOpen(false); 
                   setOrderItems([]); 
                 }} className="flex-1 py-4 bg-honey-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl shadow-honey-100">Kirim Pengajuan</button>
              </div>
           </div>
        </div>
      )}
      {/* Audit Edit Modal */}
      {isAuditEditModalOpen && editingAuditItem && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl animate-in zoom-in duration-200">
            <h3 className="text-xl font-black mb-6 uppercase tracking-tight text-honey-600">Edit Mutasi Stok</h3>
            <div className="space-y-5">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1 block">Tanggal Transaksi</label>
                <input type="date" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={editAuditDate} onChange={e => setEditAuditDate(e.target.value)} />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1 block">Mutasi (Quantity)</label>
                <div className="flex items-center gap-3">
                  <input type="number" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xl shadow-inner outline-none" value={editAuditQty} onChange={e => setEditAuditQty(Number(e.target.value))} />
                  <span className="text-[10px] font-black text-slate-400 uppercase w-20 leading-tight">Gunakan (-) untuk pengurangan</span>
                </div>
              </div>
              <div className="p-4 bg-honey-50 rounded-2xl border border-honey-100">
                <p className="text-[9px] font-black text-honey-600 uppercase mb-1">Info Transaksi</p>
                <p className="text-[10px] font-bold text-slate-600 uppercase">{editingAuditItem.type}</p>
                <p className="text-[8px] text-slate-400 mt-1">REF: #{editingAuditItem.ref.toUpperCase()}</p>
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button disabled={isAuditProcessing} onClick={() => setIsAuditEditModalOpen(false)} className="flex-1 py-4 bg-slate-100 rounded-2xl font-black text-[10px] uppercase text-slate-500 disabled:opacity-50">Batal</button>
              <button disabled={isAuditProcessing} onClick={() => handleAuditAction('edit', editingAuditItem)} className="flex-1 py-4 bg-honey-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-honey-100 disabled:opacity-50 flex items-center justify-center gap-2">
                {isAuditProcessing && <i className="fas fa-spinner fa-spin"></i>}
                <span>Simpan Perubahan</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;
