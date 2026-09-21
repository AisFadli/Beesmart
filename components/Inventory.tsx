
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Product, Category, UserRole, Transaction, ProductProposal, User, StoreSettings, Member } from '../types';
import { Icons } from '../constants';
import printService from '../services/printService';
import apiService from '../services/apiService';
import { BarcodeDisplay } from './BarcodeDisplay';
import { CameraScannerModal } from './CameraScannerModal';
// @ts-ignore
import * as XLSX from 'xlsx';

interface InventoryProps {
  products: Product[];
  members?: Member[];
  categories: Category[];
  transactions: Transaction[];
  productProposals: ProductProposal[];
  stockAdjustments?: any[];
  onSaveProduct: (product: Product) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onSaveCategory: (category: Category) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  onViewAudit?: (id: string) => void;
  onProcessProposal: (id: number, status: 'APPROVED' | 'DECLINED', adminNote: string) => Promise<void>;
  onProposeProductChange: (productId: string | undefined, type: 'UPDATE' | 'CREATE' | 'DISCOUNT', productData: Partial<Product>, reason: string) => Promise<void>;
  userRole: UserRole;
  currentUser: User | null;
  settings: StoreSettings;
}

const Inventory: React.FC<InventoryProps> = ({ 
  products, members = [] as Member[], categories, productProposals, stockAdjustments, onSaveProduct, onDeleteProduct, 
  onSaveCategory, onDeleteCategory, onViewAudit, onProcessProposal, onProposeProductChange, userRole, currentUser, settings
}) => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'proposals'>('inventory');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [newCatName, setNewCatName] = useState('');
  const [catWarning, setCatWarning] = useState('');
  const [suggestedCat, setSuggestedCat] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatValue, setEditingCatValue] = useState('');

  const [skuWarning, setSkuWarning] = useState('');
  const [suggestedSku, setSuggestedSku] = useState('');

  const [isPreviewPriceTagOpen, setIsPreviewPriceTagOpen] = useState(false);
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);
  const [showBarcodeScannerModal, setShowBarcodeScannerModal] = useState(false);

  const [tenantUsersList, setTenantUsersList] = useState<User[]>([]);

  const rawRole = (userRole || '').toString().toUpperCase();
  const isAdmin = rawRole === 'ADMIN';
  const isTenant = rawRole === 'TENANT';

  const fetchTenantUsers = async () => {
    try {
      const res = await apiService.request('/users.php');
      if (Array.isArray(res)) {
        const tenants = res.filter((u: User) => (u.role || '').toString().toUpperCase() === 'TENANT');
        setTenantUsersList(tenants);
      }
    } catch (e) {
      console.error("Failed to fetch tenant users:", e);
    }
  };

  useEffect(() => {
    if (isCategoryModalOpen && isAdmin) {
      fetchTenantUsers();
    }
  }, [isCategoryModalOpen, isAdmin]);

  const handleToggleCategoryForTenant = async (tenantUser: User, categoryName: string) => {
    const currentCats = tenantUser.tenantCategories || [];
    const catUpper = categoryName.trim().toUpperCase();
    const exists = currentCats.some(c => c.trim().toUpperCase() === catUpper);
    
    let updatedCats: string[];
    if (exists) {
      updatedCats = currentCats.filter(c => c.trim().toUpperCase() !== catUpper);
    } else {
      updatedCats = [...currentCats, categoryName.trim()];
    }

    try {
      await apiService.request('/users.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...tenantUser,
          tenantCategories: updatedCats
        })
      });

      setTenantUsersList(prev => prev.map(u => u.id === tenantUser.id ? { ...u, tenantCategories: updatedCats } : u));
    } catch (e: any) {
      alert("Gagal memperbarui kategori tenant: " + e.message);
    }
  };

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

  const categoriesList = useMemo(() => {
    if (isTenant) {
      if (tenantCategories.length === 0) return [];
      return categories.filter(c => tenantCategories.includes(c.name.trim().toUpperCase())).map(c => c.name);
    }
    return categories.map(c => c.name);
  }, [categories, isTenant, tenantCategories]);

  const [formData, setFormData] = useState<Partial<Product>>({
    sku: '', barcode: '', name: '', category: categoriesList[0] || categories[0]?.name || 'General',
    price: 0, costPrice: 0, stock: 0, minStock: 5, image: '',
    initialStockDate: new Date().toISOString().split('T')[0],
    discountValue: 0, discountType: 'FIXED', discountStart: '', discountEnd: '',
    status: 'ACTIVE'
  });
  const [proposalReason, setProposalReason] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 24;

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    setCurrentPage(1);
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s) || (p.barcode && p.barcode.toLowerCase().includes(s));
      const matchesCategory = !selectedCategory || p.category === selectedCategory;
      const matchesTenant = !isTenant ? true : (tenantCategories.length > 0 && tenantCategories.includes((p.category || '').trim().toUpperCase()));
      return matchesSearch && matchesCategory && matchesTenant;
    });
  }, [products, search, selectedCategory, isTenant, tenantCategories]);

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, currentPage]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);

  const displayProposals = useMemo(() => {
    const baseProposals = isAdmin 
      ? productProposals.filter(p => p.status === 'PENDING')
      : productProposals.filter(p => p.staffId === currentUser?.name);
      
    const adjProposals = (stockAdjustments || [])
      .filter(adj => isAdmin ? adj.status === 'PENDING' : adj.staffId === currentUser?.name)
      .map(adj => {
        const product = products.find(p => p.id === adj.productId);
        return {
          id: adj.id,
          productId: adj.productId,
          type: 'STOCK_REPORT' as const,
          data: { 
            name: product?.name || 'Produk Tidak Dikenal', 
            stock: adj.quantity, 
            category: adj.type,
            price: product?.price || 0,
            costPrice: product?.costPrice || 0
          },
          staffId: adj.staffId,
          status: adj.status as any,
          reason: adj.notes || 'Laporan Masalah Stok',
          createdAt: adj.timestamp
        };
      });

    // @ts-ignore
    return [...baseProposals, ...adjProposals].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [productProposals, stockAdjustments, isAdmin, currentUser, products]);

  const pendingCount = (isAdmin ? productProposals.filter(p => p.status === 'PENDING').length + (stockAdjustments || []).filter(a => a.status === 'PENDING').length : 0);

  // Fungsi Kompresi Gambar
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(dataUrl);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file);
        setFormData(prev => ({ ...prev, image: compressed }));
      } catch (err) {
        alert("Gagal memproses gambar. Pastikan format file benar.");
      }
    }
  };

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setFormData({ 
      sku: '', barcode: '', name: '', category: categoriesList[0] || categories[0]?.name || 'General', 
      price: 0, costPrice: 0, stock: 0, initialStock: 0, minStock: 5, image: '',
      initialStockDate: new Date().toISOString().split('T')[0],
      discountValue: 0, discountType: 'FIXED', discountStart: '', discountEnd: '',
      status: 'ACTIVE'
    });
    setProposalReason('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({ 
      ...product,
      barcode: product.barcode || product.sku,
      initialStockDate: product.initialStockDate ? product.initialStockDate.split(' ')[0] : new Date().toISOString().split('T')[0]
    });
    setProposalReason('');
    setIsModalOpen(true);
  };

  const generateRandomSku = () => {
    const prefix = "PRD";
    const random = Math.floor(1000 + Math.random() * 9000);
    const newSku = `${prefix}-${random}`;
    setFormData(prev => ({ 
      ...prev, 
      sku: newSku,
      barcode: prev.barcode || newSku
    }));
    setSkuWarning('');
    setSuggestedSku('');
  };

  const generateRandomBarcode = () => {
    // Generate 12-digit standard ean barcode style prefix 899 ensuring no collisions with products or members
    let newBarcode = '';
    let attempts = 0;
    while (attempts < 100) {
      const randomDigits = Math.floor(100000000 + Math.random() * 900000000);
      newBarcode = `899${randomDigits}`;
      const inProducts = products.some(p => p.id !== editingProduct?.id && (p.barcode === newBarcode || p.sku === newBarcode));
      const inMembers = (members || []).some((m: Member) => m.barcode === newBarcode || m.id === newBarcode);
      if (!inProducts && !inMembers) break;
      attempts++;
    }
    setFormData(prev => ({ ...prev, barcode: newBarcode }));
  };

  const handleSkuChange = (val: string) => {
    const sku = val.trim().toUpperCase();
    setFormData(prev => ({ ...prev, sku }));
    
    if (!sku) {
      setSkuWarning('');
      setSuggestedSku('');
      return;
    }

    const exists = products.find(p => p.sku.toUpperCase() === sku && p.id !== editingProduct?.id);
    if (exists) {
      setSkuWarning(`SKU "${sku}" sudah digunakan oleh produk: ${exists.name}`);
      const random = Math.floor(1000 + Math.random() * 9000);
      setSuggestedSku(`PRD-${random}`);
    } else {
      setSkuWarning('');
      setSuggestedSku('');
    }
  };

  const handleCatNameChange = (val: string) => {
    setNewCatName(val);
    const name = val.trim();
    if (!name) {
      setCatWarning('');
      setSuggestedCat('');
      return;
    }

    const exists = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      setCatWarning(`Kategori "${name}" sudah ada.`);
      let suffix = 1;
      let suggested = `${name} ${suffix}`;
      while (categories.find(c => c.name.toLowerCase() === suggested.toLowerCase())) {
        suffix++;
        suggested = `${name} ${suffix}`;
      }
      setSuggestedCat(suggested);
    } else {
      setCatWarning('');
      setSuggestedCat('');
    }
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    const name = newCatName.trim().toUpperCase();
    const exists = categories.find(c => c.name.toUpperCase() === name);
    if (exists) {
      alert(`Gagal: Kategori "${name}" sudah ada.`);
      return;
    }
    await onSaveCategory({ id: `CAT-${Date.now()}`, name: name });
    setNewCatName('');
    setCatWarning('');
    setSuggestedCat('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Final check for SKU
      const sku = formData.sku?.trim().toUpperCase();
      const barcode = formData.barcode?.trim();

      const existsSku = products.find(p => p.sku.toUpperCase() === sku && p.id !== editingProduct?.id);
      if (existsSku) {
        alert(`Gagal: SKU "${sku}" sudah digunakan oleh produk lain (${existsSku.name}). Silakan gunakan SKU yang berbeda.`);
        return;
      }

      // Check if Barcode is already used by another Product
      if (barcode) {
        const existsBarcode = products.find(p => p.id !== editingProduct?.id && p.barcode && p.barcode.trim().toLowerCase() === barcode.toLowerCase());
        if (existsBarcode) {
          alert(`Gagal: Barcode "${barcode}" sudah digunakan oleh produk lain (${existsBarcode.name}).`);
          return;
        }

        // Check if Barcode or SKU collides with any Member Barcode or Member ID
        if (members && members.length > 0) {
          const memberConflict = members.find((m: Member) => 
            (m.barcode && m.barcode.trim().toLowerCase() === barcode.toLowerCase()) ||
            m.id.trim().toLowerCase() === barcode.toLowerCase() ||
            (sku && m.barcode && m.barcode.trim().toLowerCase() === sku.toLowerCase()) ||
            (sku && m.id.trim().toLowerCase() === sku.toLowerCase())
          );
          if (memberConflict) {
            alert(`Gagal: Barcode/SKU "${barcode}" sudah digunakan oleh Member "${memberConflict.name}" (ID: ${memberConflict.id}). Barcode produk dan barcode member harus berbeda!`);
            return;
          }
        }
      }

      if (isTenant && tenantCategories.length > 0) {
        const catUpper = (formData.category || '').trim().toUpperCase();
        if (!tenantCategories.includes(catUpper)) {
          alert(`Gagal: Sebagai Tenant, Anda hanya dapat mengelola produk pada kategori yang diizinkan Admin (${tenantCategories.join(', ')}).`);
          return;
        }
      }

      const productData: Product = {
        ...formData,
        sku: sku,
        id: editingProduct ? editingProduct.id : `PRD-${Date.now()}`,
      } as Product;

      if (isAdmin) {
        await onSaveProduct(productData);
      } else {
        if (!proposalReason.trim()) {
          alert("Alasan perubahan harus diisi untuk pengajuan ke Admin.");
          return;
        }
        await onProposeProductChange(editingProduct?.id, editingProduct ? 'UPDATE' : 'CREATE', productData, proposalReason);
      }

      setIsModalOpen(false);
      setSkuWarning('');
      setSuggestedSku('');
      setProposalReason('');
    } catch (err: any) {
      alert("Gagal menyimpan produk: " + (err.message || "Terjadi kesalahan."));
    }
  };

  const exportProductsToExcel = () => {
    const headers = [
      'SKU', 
      'Nama Produk', 
      'Kategori', 
      'HPP (Modal)', 
      'Harga Jual', 
      'Stok Saat Ini', 
      'Stok Min', 
      'Rerata Jual/Bulan',
      'Nilai Diskon',
      'Tipe Diskon',
      'Mulai Diskon',
      'Selesai Diskon'
    ];
    const rows = filtered.map(p => [
      p.sku,
      p.name,
      p.category,
      p.costPrice,
      p.price,
      p.stock,
      p.minStock,
      p.avgMonthlySales || 0,
      p.discountValue || 0,
      p.discountType || 'FIXED',
      p.discountStart || '-',
      p.discountEnd || '-'
    ]);

    const worksheetData = [
      ['DATA INVENTORY PRODUK'],
      ['KATEGORI', selectedCategory || 'Semua Kategori'],
      ['TANGGAL EXPORT', new Date().toLocaleString('id-ID')],
      [],
      headers,
      ...rows
    ];

    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory");
    XLSX.writeFile(wb, `Inventory_${selectedCategory || 'All'}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
       {/* Modal Konfirmasi Hapus Produk */}
       {productToDelete && (
         <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[150] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full p-8 animate-in zoom-in duration-200">
               <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-3xl mb-4 shadow-xl shadow-rose-900/10">
                     <i className="fas fa-exclamation-triangle"></i>
                  </div>
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-wide">Konfirmasi Hapus Produk</h3>
                  <p className="text-slate-500 mt-2 text-xs font-semibold leading-relaxed">
                    Apakah Anda yakin ingin menghapus produk ini?
                  </p>
               </div>

               <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-6 text-left">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Detail Produk:</div>
                  <div className="font-bold text-slate-800 text-xs uppercase">{productToDelete.name}</div>
                  <div className="font-mono text-[10px] text-slate-500 uppercase mt-0.5">SKU: {productToDelete.sku}</div>
                  
                  <div className="mt-4 p-3 bg-yellow-50 rounded-xl border border-yellow-200 flex items-start gap-2.5">
                     <i className="fas fa-info-circle text-yellow-600 text-xs mt-0.5"></i>
                     <p className="text-[9px] text-yellow-800 font-bold leading-normal uppercase tracking-wider">
                       Status produk akan menjadi <span className="font-black text-rose-600">INACTIVE</span>. Produk tidak akan muncul di aplikasi, namun SKU ini tetap tersimpan sehingga tidak bisa digunakan untuk produk baru.
                     </p>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setProductToDelete(null)}
                    className="py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all"
                  >
                    Batal (Close)
                  </button>
                  <button 
                    onClick={async () => {
                       await onDeleteProduct(productToDelete.id);
                       setProductToDelete(null);
                    }}
                    className="py-4 bg-rose-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-rose-100 hover:bg-rose-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    Ya, Hapus
                  </button>
               </div>
            </div>
         </div>
       )}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
             <span className="p-2 bg-honey-600 text-white rounded-xl shadow-lg"><Icons.Inventory /></span>
             Katalog Inventory
          </h1>
          <p className="text-slate-500 font-medium text-xs uppercase tracking-widest mt-1 ml-1">Manajemen Produk & Kategori</p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'inventory' && (
            <button 
              onClick={exportProductsToExcel}
              className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all"
            >
              <i className="fas fa-file-excel mr-2"></i> Export Data
            </button>
          )}
          <button 
            onClick={() => setActiveTab(activeTab === 'inventory' ? 'proposals' : 'inventory')}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all shadow-sm ${activeTab === 'proposals' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 relative'}`}
          >
            <i className={`fas ${activeTab === 'proposals' ? 'fa-boxes' : 'fa-clipboard-check'} mr-2`}></i> 
            {activeTab === 'proposals' ? (isAdmin ? 'Kelola Catalog' : 'Kembali Ke Catalog') : (isAdmin ? 'Pengajuan Perubahan' : 'Riwayat Pengajuan')}
            {activeTab === 'inventory' && isAdmin && pendingCount > 0 && (
              <span className="absolute -top-2 -right-2 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center text-[8px] animate-bounce">{pendingCount}</span>
            )}
          </button>
          <button onClick={() => setIsCategoryModalOpen(true)} className="bg-white px-5 py-2.5 rounded-xl text-slate-700 text-[10px] font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-all shadow-sm">
            <i className="fas fa-tags mr-2"></i> Kategori
          </button>
          <button onClick={handleOpenAdd} className="bg-honey-600 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-honey-100 hover:bg-honey-700 transition-all">
            <i className="fas fa-plus mr-2"></i> Tambah Produk
          </button>
        </div>
      </div>

      {isTenant && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-4 text-amber-900">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-amber-500 text-white rounded-xl shadow-sm"><i className="fas fa-store"></i></span>
            <div>
              <p className="font-black text-xs uppercase tracking-wider">Akses User Tenant: {currentUser?.name}</p>
              <p className="text-[11px] font-medium text-amber-700 mt-0.5">
                Kategori Produk Managed: {tenantCategories.length > 0 ? tenantCategories.join(', ') : 'Semua Kategori (Belum dibatasi)'}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest bg-amber-200 text-amber-800 px-3 py-1 rounded-lg shrink-0">
            Akses Terbatas
          </span>
        </div>
      )}

      {activeTab === 'inventory' ? (
        <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row gap-4">
            <div className="relative group flex-1">
              <span className="absolute inset-y-0 left-0 pl-5 flex items-center text-slate-400 group-focus-within:text-honey-500 transition-all"><Icons.Search /></span>
              <input type="text" placeholder="Cari Berdasarkan SKU atau Nama Produk..." className="w-full pl-12 pr-6 py-4 rounded-2xl border border-transparent outline-none focus:bg-white focus:ring-4 focus:ring-honey-500/10 font-bold transition-all bg-slate-50 shadow-inner" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="w-full md:w-64">
              <select 
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none shadow-inner text-slate-700"
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
              >
                <option value="">Semua Kategori</option>
                {categoriesList.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[10px] uppercase font-black tracking-[0.2em] text-slate-400">
                <tr>
                  <th className="px-8 py-5">Informasi Produk</th>
                  <th className="px-8 py-5">Kategori</th>
                  <th className="px-8 py-5">Harga Jual</th>
                  <th className="px-8 py-5 text-center">Stok</th>
                  <th className="px-8 py-5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedProducts.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition-all">
                    <td className="px-8 py-5">
                       <div className="flex items-center gap-4">
                         <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-300 border border-slate-200 overflow-hidden shrink-0">
                            {p.image ? <img src={p.image} className="w-full h-full object-cover" alt={p.name} /> : <i className="fas fa-box"></i>}
                         </div>
                         <div className="min-w-0">
                           <p className="font-black text-slate-800 text-sm line-clamp-2 uppercase break-all whitespace-normal">{p.name}</p>
                           <p className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-tighter">{p.sku}</p>
                         </div>
                       </div>
                    </td>
                    <td className="px-8 py-5"><span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[9px] font-black rounded-lg uppercase tracking-widest border border-slate-200">{p.category}</span></td>
                    <td className="px-8 py-5">
                       <div className="flex flex-col">
                         <p className="text-sm font-black text-honey-600">Rp {Number(p.price).toLocaleString('id-ID')}</p>
                         {p.discountValue && p.discountValue > 0 ? (
                           <span className="text-[8px] font-black bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded mt-0.5 inline-block w-fit">DISKON {p.discountType === 'PERCENT' ? `${p.discountValue}%` : `Rp${Number(p.discountValue).toLocaleString('id-ID')}`}</span>
                         ) : (
                           <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Modal: {Number(p.costPrice).toLocaleString('id-ID')}</p>
                         )}
                       </div>
                    </td>
                    <td className="px-8 py-5 text-center">
                       <span className={`px-3 py-1 rounded-lg text-xs font-black ${p.stock <= p.minStock ? 'bg-red-100 text-red-600 border border-red-200' : 'bg-slate-100 text-slate-800 border border-slate-200'}`}>{p.stock}</span>
                    </td>
                    <td className="px-8 py-5 text-right">
                       <div className="flex justify-end gap-1">
                         <button onClick={() => { setPreviewProduct(p); setIsPreviewPriceTagOpen(true); }} className="p-2 text-slate-400 hover:text-slate-900 rounded-xl transition-all" title="Cetak Price Tag"><i className="fas fa-print"></i></button>
                         <button onClick={() => onViewAudit?.(p.id)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all" title="Audit Stok"><i className="fas fa-history"></i></button>
                         <button onClick={() => handleOpenEdit(p)} className="p-2 text-honey-600 hover:bg-honey-50 rounded-xl transition-all" title="Edit"><i className="fas fa-edit"></i></button>
                         {isAdmin && <button onClick={() => setProductToDelete(p)} className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-all" title="Hapus"><i className="fas fa-trash"></i></button>}
                       </div>
                    </td>
                  </tr>
                ))}
                {paginatedProducts.length === 0 && <tr><td colSpan={5} className="p-20 text-center text-slate-300 font-black uppercase tracking-[0.2em] text-xs">Produk Tidak Ditemukan</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-slate-100">
            {paginatedProducts.map(p => (
              <div key={p.id} className="p-4 flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-300 border border-slate-200 overflow-hidden shrink-0">
                    {p.image ? <img src={p.image} className="w-full h-full object-cover" alt={p.name} /> : <i className="fas fa-box text-2xl"></i>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-slate-800 text-sm uppercase line-clamp-2 break-all whitespace-normal">{p.name}</p>
                    <p className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-tighter">{p.sku}</p>
                    <div className="mt-1 flex gap-1">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[8px] font-black rounded uppercase tracking-widest border border-slate-200">{p.category}</span>
                      {p.discountValue && p.discountValue > 0 && <span className="px-2 py-0.5 bg-rose-50 text-rose-600 text-[8px] font-black rounded uppercase tracking-widest border border-rose-100">DISKON</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-honey-600">Rp {Number(p.price).toLocaleString('id-ID')}</p>
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black mt-1 ${p.stock <= p.minStock ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-800'}`}>Stok: {p.stock}</span>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => { setPreviewProduct(p); setIsPreviewPriceTagOpen(true); }} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-widest" title="Cetak Price Tag"><i className="fas fa-print mr-1"></i> Label</button>
                  <button onClick={() => onViewAudit?.(p.id)} className="flex-1 py-2 bg-emerald-50 text-emerald-600 rounded-xl font-black text-[10px] uppercase tracking-widest">Audit</button>
                  <button onClick={() => handleOpenEdit(p)} className="flex-1 py-2 bg-honey-50 text-honey-600 rounded-xl font-black text-[10px] uppercase tracking-widest">Edit</button>
                  {isAdmin && <button onClick={() => setProductToDelete(p)} className="flex-1 py-2 bg-red-50 text-red-600 rounded-xl font-black text-[10px] uppercase tracking-widest">Hapus</button>}
                </div>
              </div>
            ))}
            {paginatedProducts.length === 0 && <div className="p-10 text-center text-slate-300 font-black uppercase text-[10px]">Produk Tidak Ditemukan</div>}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-600 disabled:opacity-30 hover:bg-slate-50 rounded-lg transition-all"
              >
                Prev
              </button>
              <div className="flex items-center gap-2">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .map((p, i, arr) => (
                    <React.Fragment key={p}>
                      {i > 0 && arr[i-1] !== p - 1 && <span className="text-slate-300">...</span>}
                      <button 
                        onClick={() => setCurrentPage(p)}
                        className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${currentPage === p ? 'bg-honey-600 text-white shadow-md shadow-honey-200' : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                        {p}
                      </button>
                    </React.Fragment>
                  ))}
              </div>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-600 disabled:opacity-30 hover:bg-slate-50 rounded-lg transition-all"
              >
                Next
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Proposals View */
        <div className="space-y-4">
           {displayProposals.length === 0 ? (
             <div className="bg-white p-20 rounded-[2.5rem] border border-slate-200 text-center">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mx-auto mb-4">
                  <i className="fas fa-clipboard-list text-3xl"></i>
                </div>
                <p className="text-slate-400 font-black uppercase text-xs tracking-[0.2em]">Tidak Ada Pengajuan Ditemukan</p>
             </div>
           ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayProposals.map(proposal => (
                  <div key={proposal.id} className="bg-white rounded-[2.5rem] border border-slate-200 p-6 shadow-sm flex flex-col hover:border-honey-200 transition-all group overflow-hidden">
                     <div className="flex items-start justify-between mb-4">
                        <div className="flex gap-2">
                          <span className={`px-2.5 py-1 text-[8px] font-black rounded-lg uppercase tracking-widest ${
                            proposal.type === 'CREATE' ? 'bg-emerald-100 text-emerald-600' : 
                            proposal.type === 'STOCK_REPORT' ? 'bg-rose-100 text-rose-600' :
                            'bg-honey-100 text-honey-600'
                          }`}>
                            {proposal.type === 'CREATE' ? 'Produk Baru' : 
                             proposal.type === 'STOCK_REPORT' ? 'Masalah Stok' : 'Update Produk'}
                          </span>
                          {!isAdmin && (
                            <span className={`px-2.5 py-1 text-[8px] font-black rounded-lg uppercase tracking-widest ${
                              proposal.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' : 
                              proposal.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                            }`}>
                              {proposal.status === 'PENDING' ? 'Menunggu' : proposal.status === 'APPROVED' ? 'Disetujui' : 'Ditolak'}
                            </span>
                          )}
                        </div>
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">{new Date(proposal.createdAt).toLocaleDateString('id-ID', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})}</span>
                     </div>

                     <div className="flex items-center gap-4 mb-6">
                        <div className="w-14 h-14 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center text-slate-300 overflow-hidden shrink-0">
                           {proposal.data.image ? <img src={proposal.data.image} className="w-full h-full object-cover" alt="Preview" /> : <i className="fas fa-box text-2xl"></i>}
                        </div>
                        <div className="min-w-0">
                           <p className="font-black text-slate-800 text-sm truncate uppercase leading-tight">{proposal.data.name}</p>
                           <p className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-tighter mt-0.5">By {proposal.staffId}</p>
                        </div>
                     </div>

                     {/* Detail Produk Lengkap */}
                     <div className="space-y-3 mb-6 bg-slate-50/50 p-4 rounded-2xl border border-slate-100/50">
                        <div className="grid grid-cols-2 gap-3">
                           <div>
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">SKU</p>
                              <p className="text-[10px] font-mono font-bold text-slate-700 uppercase">{proposal.data.sku || '-'}</p>
                           </div>
                           <div>
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Kategori</p>
                              <p className="text-[10px] font-bold text-slate-700 uppercase">{proposal.data.category || '-'}</p>
                           </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/50">
                           <div>
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{proposal.type === 'STOCK_REPORT' ? 'Tipe Masalah' : 'Harga Jual'}</p>
                              <p className="text-[10px] font-black text-honey-600 uppercase">{proposal.type === 'STOCK_REPORT' ? proposal.data.category : `Rp ${Number(proposal.data.price || 0).toLocaleString('id-ID')}`}</p>
                           </div>
                           <div>
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{proposal.type === 'STOCK_REPORT' ? 'Stok Bermasalah' : 'Stok Diajukan'}</p>
                              <p className={`text-[10px] font-black ${proposal.type === 'STOCK_REPORT' ? 'text-rose-600' : 'text-emerald-600'}`}>{proposal.data.stock || 0} Unit</p>
                           </div>
                        </div>
                        <div className="pt-2 border-t border-slate-200/50">
                           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">HPP (Modal)</p>
                           <p className="text-[10px] font-black text-slate-700">Rp {Number(proposal.data.costPrice || 0).toLocaleString('id-ID')}</p>
                        </div>
                     </div>

                     <div className="bg-white rounded-xl p-3 mb-6 border border-slate-100 flex-1">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Alasan Staf:</p>
                        <p className="text-[10px] text-slate-700 font-bold leading-relaxed">"{proposal.reason}"</p>
                     </div>

                     {proposal.adminNote && (
                       <div className="bg-amber-50/50 rounded-xl p-3 mb-6 border border-amber-100/50">
                          <p className="text-[8px] font-black text-amber-600 uppercase tracking-widest mb-1">Catatan Admin:</p>
                          <p className="text-[10px] text-amber-700 font-bold leading-relaxed italic">"{proposal.adminNote}"</p>
                       </div>
                     )}

                     {isAdmin && proposal.status === 'PENDING' && (
                       <div className="grid grid-cols-2 gap-3">
                          <button 
                            onClick={() => {
                              const note = prompt("Berikan alasan penolakan (opsional):");
                              if (note !== null) onProcessProposal(proposal.id, 'DECLINED', note);
                            }}
                            className="py-3 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-50 hover:text-rose-600 transition-all border border-transparent shadow-sm"
                          >
                            Tolak
                          </button>
                          <button 
                            onClick={() => onProcessProposal(proposal.id, 'APPROVED', '')}
                            className="py-3 bg-honey-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-honey-100 hover:bg-honey-700 transition-all border border-transparent"
                          >
                            Setujui
                          </button>
                       </div>
                     )}
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      {/* Modal Kategori */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[110] flex items-center justify-center p-4">
           <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-2xl max-w-md w-full p-6 md:p-8 animate-in zoom-in duration-200">
              <div className="flex justify-between items-center mb-4 md:mb-6">
                <h3 className="text-lg md:text-xl font-black text-slate-900 uppercase tracking-tight">Kelola Kategori</h3>
                <button onClick={() => setIsCategoryModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors"><i className="fas fa-times"></i></button>
              </div>
              
              <div className="flex flex-col gap-2 mb-8">
                 <div className="flex gap-2">
                    <input type="text" placeholder="Nama Kategori Baru" className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-honey-500/10 font-bold text-sm shadow-inner" value={newCatName} onChange={e => handleCatNameChange(e.target.value)} />
                    <button onClick={handleAddCategory} className="bg-honey-600 text-white px-6 rounded-2xl shadow-lg shadow-honey-100 hover:bg-honey-700 transition-all active:scale-95"><i className="fas fa-plus"></i></button>
                 </div>
                 {catWarning && (
                   <div className="px-4 py-2 bg-amber-50 border border-amber-100 rounded-xl animate-in fade-in slide-in-from-top-1">
                      <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest flex items-center gap-2">
                        <i className="fas fa-exclamation-triangle"></i> {catWarning}
                      </p>
                      {suggestedCat && (
                        <button 
                          onClick={() => handleCatNameChange(suggestedCat)}
                          className="mt-1 text-[10px] font-black text-honey-600 uppercase hover:underline"
                        >
                          Gunakan Saran: {suggestedCat}
                        </button>
                      )}
                   </div>
                 )}
              </div>
              
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {categories.map(c => (
                  <div key={c.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-honey-200 transition-all space-y-2.5">
                     <div className="flex justify-between items-center">
                        {editingCatId === c.id ? (
                           <div className="flex-1 flex gap-2">
                              <input value={editingCatValue} onChange={e => setEditingCatValue(e.target.value)} className="flex-1 p-2 font-bold border rounded-xl outline-none focus:ring-2 focus:ring-honey-500/30 text-xs" autoFocus />
                              <button onClick={async() => { 
                                 const name = editingCatValue.trim();
                                 if (!name) return;
                                 const exists = categories.find(cat => cat.name.toLowerCase() === name.toLowerCase() && cat.id !== c.id);
                                 if (exists) {
                                   alert(`Gagal: Nama kategori "${name}" sudah digunakan.`);
                                   return;
                                 }
                                 await onSaveCategory({id: c.id, name: name}); 
                                 setEditingCatId(null); 
                              }} className="text-emerald-500 px-2"><i className="fas fa-check"></i></button>
                           </div>
                        ) : (
                           <>
                             <span className="font-black text-slate-700 text-xs uppercase tracking-widest">{c.name}</span>
                             {isAdmin && (
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                  <button onClick={() => { setEditingCatId(c.id); setEditingCatValue(c.name); }} className="p-2 text-honey-500 hover:bg-honey-50 rounded-lg transition-colors"><i className="fas fa-pen text-[10px]"></i></button>
                                  <button onClick={() => onDeleteCategory(c.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><i className="fas fa-trash text-[10px]"></i></button>
                                </div>
                             )}
                           </>
                        )}
                     </div>

                     {/* Quick Tenant Assignment (Admin Only) */}
                     {isAdmin && (
                       <div className="pt-2 border-t border-slate-200/60">
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                           <i className="fas fa-store text-amber-500"></i> Tenant Pengelola Kategori Ini:
                         </p>
                         {tenantUsersList.length === 0 ? (
                           <p className="text-[10px] text-slate-400 italic">Belum ada user bertipe TENANT. Tambahkan user Tenant di menu Pengaturan.</p>
                         ) : (
                           <div className="flex flex-wrap gap-1.5">
                             {tenantUsersList.map(tu => {
                               const isAssigned = (tu.tenantCategories || []).some(tc => tc.trim().toUpperCase() === c.name.trim().toUpperCase());
                               return (
                                 <button
                                   key={tu.id}
                                   type="button"
                                   onClick={() => handleToggleCategoryForTenant(tu, c.name)}
                                   className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border flex items-center gap-1.5 ${
                                     isAssigned 
                                       ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-sm' 
                                       : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-100'
                                   }`}
                                   title={isAssigned ? `Klik untuk mencabut ${c.name} dari ${tu.name}` : `Klik untuk menetapkan ${c.name} ke ${tu.name}`}
                                 >
                                   <i className={`fas ${isAssigned ? 'fa-check-circle text-amber-600' : 'fa-plus-circle text-slate-300'}`}></i>
                                   {tu.name}
                                 </button>
                               );
                             })}
                           </div>
                         )}
                       </div>
                     )}
                  </div>
                ))}
              </div>
           </div>
        </div>
      )}

      {/* Modal Produk */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
           <div className="bg-white rounded-[2rem] md:rounded-[3rem] p-6 md:p-10 max-w-2xl w-full animate-in zoom-in duration-200 shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar">
              <div className="flex justify-between items-start mb-6 md:mb-8">
                <div>
                  <h3 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tight leading-none">{editingProduct ? 'Perbarui Produk' : 'Tambah Produk Baru'}</h3>
                  {!editingProduct && <p className="text-[9px] font-bold text-slate-400 mt-2 uppercase tracking-widest">ID Produk akan dibuat otomatis </p>}
                </div>
                {!isAdmin && <span className="bg-yellow-100 text-yellow-700 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">Membutuhkan Persetujuan Admin</span>}
              </div>
              
              <form onSubmit={handleSubmit} className="space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Left Column: Image & Basic Info */}
                    <div className="space-y-6">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Foto Produk</label>
                          <div onClick={() => fileInputRef.current?.click()} className="w-full aspect-square bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center justify-center cursor-pointer hover:bg-honey-50 hover:border-honey-300 transition-all group overflow-hidden relative shadow-inner">
                            {formData.image ? <img src={formData.image} className="w-full h-full object-cover" alt="Preview" /> : <div className="text-center p-6 text-slate-300 group-hover:text-honey-400"><i className="fas fa-cloud-upload-alt text-4xl mb-3"></i><p className="text-[10px] font-black uppercase tracking-widest">Pilih Gambar</p></div>}
                          </div>
                          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                       </div>

                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Nama Produk</label>
                          <input required placeholder="Contoh: Aqua 600ml" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none uppercase focus:ring-4 focus:ring-honey-500/10 shadow-inner" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                       </div>
                    </div>

                    {/* Right Column: Pricing, Inventory & Discounts */}
                    <div className="space-y-6">
                       <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">SKU Produk</label>
                            <div className="flex gap-2">
                              <input required placeholder="SKU" className={`flex-1 p-4 bg-slate-50 border rounded-2xl font-bold outline-none text-sm shadow-inner ${skuWarning ? 'border-yellow-300 ring-4 ring-yellow-500/10' : 'border-slate-200'}`} value={formData.sku} onChange={e => handleSkuChange(e.target.value)} />
                              <button type="button" onClick={generateRandomSku} className="px-4 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-honey-600 transition-all" title="Generate SKU">
                                <i className="fas fa-random"></i>
                              </button>
                            </div>
                            {skuWarning && (
                              <div className="mt-2 space-y-1">
                                <p className="text-[9px] font-bold text-yellow-700 flex items-center gap-1">
                                  <i className="fas fa-exclamation-triangle"></i> {skuWarning}
                                </p>
                                {suggestedSku && (
                                  <button type="button" onClick={() => handleSkuChange(suggestedSku)} className="text-[9px] font-black text-honey-600 uppercase tracking-widest hover:underline">
                                    Pakai Saran: {suggestedSku}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Kategori</label>
                            <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none text-sm shadow-inner" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                               {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                            </select>
                          </div>
                       </div>

                       {/* Barcode Field (Kemasan Bawaan / Generated) */}
                       <div className="space-y-2 p-4 bg-honey-50/50 rounded-2xl border border-honey-100">
                          <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black text-honey-700 uppercase tracking-widest flex items-center gap-1.5">
                              <i className="fas fa-barcode"></i> Barcode Kemasan / Auto
                            </label>
                            <span className="text-[9px] font-bold text-slate-400">Barcode Bawaan Pabrik / System</span>
                          </div>
                          <div className="flex gap-2">
                            <input 
                              placeholder="Barcode Produk (EAN-13/UPC/Custom)" 
                              className="flex-1 p-3.5 bg-white border border-honey-200 rounded-xl font-mono text-xs font-bold outline-none shadow-sm text-slate-800" 
                              value={formData.barcode || ''} 
                              onChange={e => setFormData({...formData, barcode: e.target.value})} 
                            />
                            <button 
                              type="button" 
                              onClick={() => setShowBarcodeScannerModal(true)} 
                              className="px-3.5 py-2.5 bg-honey-600 text-white rounded-xl font-black text-[10px] uppercase flex items-center gap-1.5 hover:bg-honey-700 transition-all shadow-md" 
                              title="Scan Barcode Kemasan dengan Kamera HP"
                            >
                              <i className="fas fa-camera"></i>
                              <span className="hidden sm:inline">Scan Kamera</span>
                            </button>
                            <button 
                              type="button" 
                              onClick={generateRandomBarcode} 
                              className="px-3.5 py-2.5 bg-slate-800 text-white rounded-xl font-black text-[10px] uppercase flex items-center gap-1.5 hover:bg-black transition-all shadow-md" 
                              title="Generate Barcode Otomatis"
                            >
                              <i className="fas fa-magic"></i>
                              <span className="hidden sm:inline">Auto</span>
                            </button>
                          </div>
                          {formData.barcode && (
                            <div className="pt-2 flex justify-center bg-white p-2 rounded-xl border border-slate-100">
                              <BarcodeDisplay value={formData.barcode} type="barcode" height={35} fontSize={10} />
                            </div>
                          )}
                       </div>

                       <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">HPP (Modal)</label>
                            <input type="number" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none shadow-inner" value={formData.costPrice} onChange={e => setFormData({...formData, costPrice: Number(e.target.value)})} />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Harga Jual</label>
                            <input type="number" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none text-honey-600 shadow-inner" value={formData.price} onChange={e => setFormData({...formData, price: Number(e.target.value)})} />
                          </div>
                       </div>

                       <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2 mb-2">Manajemen Diskon</h4>
                          <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Tipe</label>
                                <select className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold outline-none text-[11px]" value={formData.discountType} onChange={e => setFormData({...formData, discountType: e.target.value as any})}>
                                   <option value="FIXED">Nominal (Rp)</option>
                                   <option value="PERCENT">Persentase (%)</option>
                                </select>
                             </div>
                             <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Nilai</label>
                                <input type="number" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold outline-none text-[11px]" value={formData.discountValue} onChange={e => setFormData({...formData, discountValue: Number(e.target.value)})} />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Mulai Periode</label>
                                <input type="date" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold outline-none text-[11px]" value={formData.discountStart ? formData.discountStart.split(' ')[0] : ''} onChange={e => setFormData({...formData, discountStart: e.target.value})} />
                             </div>
                             <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Berakhir Periode</label>
                                <input type="date" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold outline-none text-[11px]" value={formData.discountEnd ? formData.discountEnd.split(' ')[0] : ''} onChange={e => setFormData({...formData, discountEnd: e.target.value})} />
                             </div>
                          </div>
                       </div>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Stok Saat Ini</label>
                      <input type="number" disabled={!isAdmin} className={`w-full p-4 rounded-2xl font-bold outline-none shadow-inner ${isAdmin ? 'bg-slate-50 border border-slate-200' : 'bg-slate-100 border-transparent text-slate-400 cursor-not-allowed'}`} value={formData.stock} onChange={e => setFormData({...formData, stock: Number(e.target.value)})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Min. Stok</label>
                      <input type="number" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none shadow-inner" value={formData.minStock} onChange={e => setFormData({...formData, minStock: Number(e.target.value)})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Stok Awal</label>
                      <input type="number" disabled={!isAdmin} className={`w-full p-4 rounded-2xl font-bold outline-none shadow-inner ${isAdmin ? 'bg-slate-50 border border-slate-200' : 'bg-slate-100 border-transparent text-slate-400 cursor-not-allowed'}`} value={formData.initialStock} onChange={e => setFormData({...formData, initialStock: Number(e.target.value)})} />
                    </div>
                 </div>

                 {!isAdmin && (
                   <div className="space-y-2 p-6 bg-amber-50 rounded-3xl border border-amber-100">
                      <label className="text-[10px] font-black text-amber-600 uppercase ml-1 tracking-widest flex items-center gap-2">
                        <i className="fas fa-comment-alt"></i> Alasan Perubahan Data
                      </label>
                      <textarea required placeholder="Jelaskan alasan Anda merubah data produk ini..." className="w-full p-4 bg-white border border-amber-200 rounded-2xl font-bold outline-none text-sm shadow-inner placeholder:text-amber-200 min-h-[100px]" value={proposalReason} onChange={e => setProposalReason(e.target.value)} />
                   </div>
                 )}

                 <div className="flex gap-4 mt-12">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-5 bg-slate-100 rounded-2xl font-black text-[10px] uppercase text-slate-500 tracking-widest hover:bg-slate-200 transition-all">Batal</button>
                    <button type="submit" className="flex-1 py-5 bg-honey-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-honey-100 hover:bg-honey-700 transition-all active:scale-[0.98]">
                      {isAdmin ? (editingProduct ? 'Perbarui Produk' : 'Tambah Produk') : (editingProduct ? 'Ajukan Perubahan' : 'Ajukan Produk Baru')}
                    </button>
                 </div>
              </form>
           </div>
        </div>
      )}
      {/* Modal Price Tag Preview */}
      {isPreviewPriceTagOpen && previewProduct && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[150] flex items-center justify-center p-4">
           <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-sm w-full p-6 animate-in zoom-in duration-200">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Tampilan Label Harga</h3>
                <button onClick={() => setIsPreviewPriceTagOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors"><i className="fas fa-times"></i></button>
              </div>

              <div className="bg-slate-50 p-6 rounded-3xl border border-dashed border-slate-300">
                 <div className={`mx-auto bg-white border border-slate-200 shadow-sm p-4 font-mono text-[10px] text-slate-800 text-center space-y-2 ${settings.printerType === '58mm' ? 'w-[180px]' : 'w-[240px]'}`}>
                    {(() => {
                        const now = new Date();
                        let isPromo = false;
                        let finalPrice = previewProduct.price;
                        if (previewProduct.discountValue && previewProduct.discountValue > 0) {
                          const start = previewProduct.discountStart ? new Date(previewProduct.discountStart) : null;
                          const end = previewProduct.discountEnd ? new Date(previewProduct.discountEnd) : null;
                          if (end) end.setHours(23, 59, 59, 999);
                          if ((!start || start <= now) && (!end || end >= now)) {
                            isPromo = true;
                            const dType = (previewProduct.discountType || 'FIXED').toString().toUpperCase();
                            if (dType === 'PERCENT' || dType === 'PERCENTAGE') {
                              finalPrice = previewProduct.price * (1 - previewProduct.discountValue / 100);
                            } else {
                              finalPrice = Math.max(0, previewProduct.price - previewProduct.discountValue);
                            }
                          }
                        }

                        return (
                          <>
                            {isPromo ? (
                              <div className="space-y-1">
                                <p className="font-black bg-slate-900 text-white inline-block px-2 py-0.5 rounded text-[8px]">[ PROMO ]</p>
                                {previewProduct.discountEnd && <p className="text-[7px]">s.d {new Date(previewProduct.discountEnd).toLocaleDateString('id-ID', {day:'2-digit', month:'2-digit', year:'2-digit'})}</p>}
                                <p className="text-[7px] text-slate-400 line-through">Rp {previewProduct.price.toLocaleString()} (NORMAL)</p>
                              </div>
                            ) : (
                              <div className="h-[42px]"></div> // Matched height of promo header
                            )}
                            
                            <p className="text-xl font-black leading-none py-1">Rp {finalPrice.toLocaleString()}</p>
                            <p className="font-black uppercase break-words leading-tight text-[9px]">{previewProduct.name}</p>
                            <p className="text-[8px] uppercase tracking-tighter opacity-70 mt-1">{previewProduct.sku}</p>
                            
                            <div className="pt-2 flex justify-center bg-white p-1 rounded">
                              <BarcodeDisplay value={previewProduct.barcode || previewProduct.sku} type="barcode" height={38} fontSize={9} width={1.8} displayValue={true} background="#ffffff" lineColor="#000000" margin={2} />
                            </div>

                            <div className="mt-2 pt-2 border-t border-dashed border-slate-200 flex justify-between items-center text-[7px] font-bold opacity-60">
                               <span>F RH-90</span>
                               <span>{new Date().toLocaleDateString('id-ID', {day:'2-digit', month:'2-digit', year:'2-digit'}).replace(/\//g,'')}</span>
                            </div>

                            {isPromo && (
                               <p className="text-[7px] font-black border-t border-dashed border-slate-200 mt-1 pt-1">--- PROMO --- PROMO ---</p>
                            )}
                          </>
                        );
                    })()}
                 </div>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-3">
                 <button 
                   onClick={() => setIsPreviewPriceTagOpen(false)}
                   className="py-3 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all"
                 >
                   Tutup
                 </button>
                 <button 
                   onClick={async () => {
                      await printService.printPriceTag(previewProduct, settings);
                      setIsPreviewPriceTagOpen(false);
                   }}
                   className="py-3 bg-honey-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-honey-100 hover:bg-honey-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                 >
                   <i className="fas fa-print"></i> Cetak Sekarang
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Camera Barcode Scanner Modal for Product Registration */}
      <CameraScannerModal 
        isOpen={showBarcodeScannerModal} 
        onClose={() => setShowBarcodeScannerModal(false)} 
        onScan={(scannedBarcode) => {
          setFormData(prev => ({ ...prev, barcode: scannedBarcode }));
          setShowBarcodeScannerModal(false);
        }} 
        title="Scan Barcode Kemasan Produk"
        description="Arahkan kamera ke barcode bawaan pabrik pada kemasan produk"
      />
    </div>
  );
};

export default Inventory;
