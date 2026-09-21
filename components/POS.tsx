
import React, { useState, useMemo, useEffect } from 'react';
import { Product, Transaction, User, TransactionItem, StoreSettings, Member } from '../types';
import { Icons } from '../constants';
import printService from '../services/printService';
import ImportSalesModal from './ImportSalesModal';
import { CameraScannerModal } from './CameraScannerModal';
import { ScannerStatusModal } from './ScannerStatusModal';
import { useHardwareScanner } from '../hooks/useHardwareScanner';

interface POSProps {
  products: Product[];
  members: Member[];
  onCompleteTransaction: (tx: Transaction) => void;
  user: User;
  settings: StoreSettings;
}

const POS: React.FC<POSProps> = ({ products, members, onCompleteTransaction, user, settings }) => {
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<TransactionItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [showQRISPopup, setShowQRISPopup] = useState(false);
  const [lastTx, setLastTx] = useState<Transaction | null>(null);
  const [viewMode, setViewMode] = useState<'products' | 'cart'>('products');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [showScannerStatus, setShowScannerStatus] = useState(false);
  const [scanToast, setScanToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [scannerModalTitle, setScannerModalTitle] = useState('Scan Barcode / QR Code (HP)');
  const [scannerModalDesc, setScannerModalDesc] = useState('Arahkan kamera ke barcode produk atau QR Code kartu member');

  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

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

  const handleScannedCode = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    const trimmedLow = trimmed.toLowerCase();

    // 1. FIRST PRIORITY: CHECK PRODUCT BARCODE, SKU OR ID
    const matchedProduct = availableProducts.find(
      p => (p.barcode && p.barcode.trim().toLowerCase() === trimmedLow) ||
           p.sku.trim().toLowerCase() === trimmedLow ||
           p.id.trim().toLowerCase() === trimmedLow
    );

    if (matchedProduct) {
      addToCart(matchedProduct);
      // Direct to cart view so cashier can review items and adjust qty safely
      setViewMode('cart');
      setScanToast({
        message: `Produk Ditambahkan: ${matchedProduct.name}`,
        type: 'success'
      });
      setTimeout(() => setScanToast(null), 3000);
      return;
    }

    // 2. SECOND PRIORITY: CHECK MEMBER BARCODE OR ID
    // Match member ONLY if no product matched, and code matches exact member barcode/ID/WA/email or explicit member prefix
    const memberPrefixes = ['mbr-', 'mem-', 'br-', 'id:'];
    const hasMemberPrefix = memberPrefixes.some(prefix => trimmedLow.startsWith(prefix));

    const matchedMember = members.find(m => {
      if (!m || m.status === 'SUSPENDED') return false;
      const mBarcode = (m.barcode || '').trim().toLowerCase();
      const mId = (m.id || '').trim().toLowerCase();
      const mWa = (m.whatsapp || '').trim();
      const mEmail = (m.email || '').trim().toLowerCase();

      // Direct exact match
      if (mBarcode && mBarcode === trimmedLow) return true;
      if (mId && mId === trimmedLow) return true;
      if (mWa && mWa === trimmed) return true;
      if (mEmail && mEmail === trimmedLow) return true;

      // Match with explicit member prefix stripped
      if (hasMemberPrefix) {
        const cleanCode = trimmedLow.replace(/^(mbr-|mem-|br-|id:\s*|id-)/gi, '');
        if (mId && mId.replace(/^(mbr-|mem-|br-|id:\s*|id-)/gi, '') === cleanCode) return true;
        if (mBarcode && mBarcode.replace(/^(mbr-|mem-|br-|id:\s*|id-)/gi, '') === cleanCode) return true;
      }

      return false;
    });

    if (matchedMember) {
      setSelectedMember(matchedMember);
      setScanToast({
        message: `Member Terdeteksi: ${matchedMember.name} (${matchedMember.id})`,
        type: 'info'
      });
      setTimeout(() => setScanToast(null), 3500);
      return;
    }

    // 3. UNRECOGNIZED
    setScanToast({
      message: `Barcode/QR Code "${trimmed}" tidak terdaftar pada produk maupun member.`,
      type: 'error'
    });
    setTimeout(() => setScanToast(null), 3500);
  };

  useHardwareScanner({
    onScan: handleScannedCode,
    enabled: true
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const filteredProducts = useMemo(() => {
    const s = search.trim().toLowerCase();
    return availableProducts.filter(p => 
      p.name.toLowerCase().includes(s) || 
      p.sku.toLowerCase().includes(s) ||
      (p.barcode && p.barcode.toLowerCase().includes(s))
    );
  }, [availableProducts, search]);

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(start, start + itemsPerPage);
  }, [filteredProducts, currentPage]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const total = cart.reduce((sum, item) => sum + item.subtotal, 0);

  const getDiscountedPrice = (product: Product): number => {
    if (!product.discountValue || product.discountValue <= 0) return product.price;
    
    // Check if discount is within date range
    const now = new Date();
    if (product.discountStart) {
      const start = new Date(product.discountStart);
      if (start > now) return product.price;
    }
    if (product.discountEnd) {
      const end = new Date(product.discountEnd);
      // Ensure the end date includes the whole day
      end.setHours(23, 59, 59, 999);
      if (end < now) return product.price;
    }
    
    const dType = (product.discountType || 'FIXED').toString().toUpperCase();
    if (dType === 'PERCENT' || dType === 'PERCENTAGE') {
      return product.price * (1 - product.discountValue / 100);
    } else {
      return Math.max(0, product.price - product.discountValue);
    }
  };

  const addToCart = (product: Product) => {
    // Memberikan kebebasan input meski stok 0 (Indent)
    const finalPrice = getDiscountedPrice(product);
    const hasDiscount = finalPrice < product.price;
    
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) {
        return prev.map(i => i.productId === product.id 
          ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * finalPrice } 
          : i
        );
      }
      return [...prev, {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category,
        quantity: 1,
        price: finalPrice,
        costPrice: product.costPrice,
        originalPrice: product.price,
        discountValue: hasDiscount ? (product.discountValue || 0) : 0,
        discountType: (product.discountType as any) || 'FIXED',
        subtotal: finalPrice
      }];
    });
  };

  const updateQuantity = (productId: string, delta: number | string) => {
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        let newQty = typeof delta === 'number' ? item.quantity + delta : parseInt(delta);
        if (isNaN(newQty)) newQty = 0;
        newQty = Math.max(0, newQty);
        return { ...item, quantity: newQty, subtotal: newQty * item.price };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const handleCheckout = async (method: 'CASH' | 'DEBIT' | 'QRIS' | 'DEPOSIT' | 'TRANSFER' | 'UNPAID') => {
    if (cart.length === 0 || isProcessing) return;
    
    // Cek apakah ada item yang indent (qty > stok)
    const hasIndent = cart.some(item => {
      const p = products.find(prod => prod.id === item.productId);
      return p ? item.quantity > p.stock : false;
    });

    if (method === 'DEPOSIT') {
      if (!selectedMember) { alert("Pilih member terlebih dahulu!"); return; }
      if (selectedMember.status === 'SUSPENDED') { alert("Status member SUSPENDED."); return; }
      if (selectedMember.depositBalance < total) { alert("Saldo tidak cukup!"); return; }
    }

    setIsProcessing(true);
    
    const transaction: Transaction = {
      id: `TXN-${Date.now()}`,
      timestamp: `${txDate}T${new Date().toLocaleTimeString('en-GB')}`,
      items: [...cart],
      total,
      paymentMethod: method,
      paymentStatus: (method === 'UNPAID') ? 'UNPAID' : 'PAID',
      staffId: user.name,
      memberId: selectedMember?.id,
      customerName: selectedMember ? selectedMember.name : (customerName || 'UMUM'),
      notes: notes || undefined,
      transactionType: hasIndent ? 'INDENT' : 'NORMAL'
    };

    try {
      await onCompleteTransaction(transaction);
      setLastTx(transaction);
      
      // RESET POS FORM
      setCart([]);
      setCustomerName('');
      setSelectedMember(null);
      setNotes('');
      setTxDate(new Date().toISOString().split('T')[0]);
      
      // CLOSE ANY POPUPS
      setShowQRISPopup(false);
      
      // SHOW PRINT SUCCESS DIALOG FOR ALL METHODS
      setShowPrintDialog(true);
      
      setIsProcessing(false);
      
      // AUTO PRINT IF ENABLED
      if (settings.autoPrint) {
        printService.printReceipt(transaction, settings);
      }
    } catch (err: any) {
      alert("Gagal memproses transaksi: " + err.message);
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full max-h-full overflow-hidden relative">
      {/* Mobile View Toggle */}
      <div className="lg:hidden fixed bottom-6 right-6 z-50">
        <button 
          onClick={() => setViewMode(viewMode === 'products' ? 'cart' : 'products')}
          className="w-16 h-16 bg-honey-600 text-white rounded-full shadow-2xl flex items-center justify-center text-2xl active:scale-90 transition-transform border-4 border-white"
        >
          <i className={`fas ${viewMode === 'products' ? 'fa-shopping-cart' : 'fa-th-large'}`}></i>
          {viewMode === 'products' && cart.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-white animate-bounce">
              {cart.length}
            </span>
          )}
        </button>
      </div>

      {/* Product List Section */}
      <div className={`flex-1 flex flex-col gap-3 min-h-0 ${viewMode === 'cart' ? 'hidden lg:flex' : 'flex'}`}>
        
        {/* Toast Scan Feedback Notification */}
        {scanToast && (
          <div className={`p-3.5 rounded-2xl border text-xs font-black flex items-center justify-between shadow-lg animate-bounce ${
            scanToast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
            scanToast.type === 'info' ? 'bg-honey-50 border-honey-200 text-honey-800' :
            'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            <span className="flex items-center gap-2">
              <i className={`fas ${scanToast.type === 'success' ? 'fa-check-circle' : scanToast.type === 'info' ? 'fa-id-card' : 'fa-exclamation-circle'}`}></i>
              {scanToast.message}
            </span>
            <button onClick={() => setScanToast(null)} className="opacity-60 hover:opacity-100"><i className="fas fa-times"></i></button>
          </div>
        )}

        <div className="shrink-0 flex items-center gap-3">
          <div className="relative group flex-1">
            <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-400 group-focus-within:text-honey-500 transition-colors">
              <Icons.Search />
            </span>
            <input 
              type="text" 
              data-barcode-input="true"
              placeholder="Cari Produk atau Scan Barcode (SKU/Nama/Barcode)..." 
              className="block w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-[1.25rem] outline-none shadow-sm font-bold focus:ring-4 focus:ring-honey-500/10 transition-all" 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
            />
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowScannerStatus(true)}
              className="px-3.5 py-3.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-[1.25rem] font-black text-[10px] uppercase tracking-widest shadow-sm hover:bg-emerald-100 transition-all active:scale-95 flex items-center gap-1.5"
              title="Cek & Uji Status Alat Scanner Hardware (USB/Bluetooth)"
            >
              <i className="fas fa-barcode text-sm"></i>
              <span className="hidden md:inline">Cek Scanner</span>
            </button>
            <button 
              onClick={() => {
                setScannerModalTitle("Scan Barcode / QR Code (HP)");
                setScannerModalDesc("Arahkan kamera ke barcode produk atau QR Code kartu member");
                setShowCameraScanner(true);
              }}
              className="px-4 py-3.5 bg-honey-600 text-white rounded-[1.25rem] font-black text-[10px] uppercase tracking-widest shadow-lg shadow-honey-500/20 hover:bg-honey-700 transition-all active:scale-95 flex items-center gap-2"
              title="Scan Barcode / QR via Kamera Device / HP"
            >
              <i className="fas fa-camera text-sm"></i>
              <span className="hidden sm:inline">Scan Kamera HP</span>
            </button>
            <button 
              onClick={async () => {
                const connected = await printService.connect();
                if (connected) alert("Printer Berhasil Terhubung!");
              }}
              className="px-4 py-3.5 bg-honey-50 text-honey-600 rounded-[1.25rem] font-black text-[10px] uppercase tracking-widest shadow-sm hover:bg-black hover:text-white transition-all active:scale-95 flex items-center gap-2 border border-honey-100"
              title="Hubungkan Ulang Printer Bluetooth"
            >
              <i className="fas fa-print"></i>
              <span className="hidden xl:inline">Connect Printer</span>
            </button>
            {user.role === 'ADMIN' && (
              <button 
                onClick={() => setShowImportModal(true)}
                className="px-6 py-3.5 bg-slate-900 text-white rounded-[1.25rem] font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-black transition-all active:scale-95 flex items-center gap-2"
              >
                <i className="fas fa-cloud-upload-alt text-sm"></i>
                <span className="hidden sm:inline">Import Historis</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 pb-4 custom-scrollbar">
          {paginatedProducts.map(p => (
            <button key={p.id} onClick={() => addToCart(p)} className={`bg-white p-3 rounded-2xl border border-slate-200 text-left transition-all hover:shadow-xl hover:border-honey-300 flex flex-col h-fit active:scale-95 group relative ${p.stock <= 0 ? 'border-yellow-300 bg-yellow-50' : ''}`}>
               <div className="w-full aspect-square bg-slate-50 rounded-xl mb-2 flex items-center justify-center text-slate-200 relative overflow-hidden">
                  {p.image ? <img src={p.image} className="w-full h-full object-cover" /> : <Icons.Inventory />}
                  {p.discountValue && p.discountValue > 0 && (
                    <div className="absolute top-0 right-0 bg-rose-600 text-white text-[8px] font-black px-2 py-1 rounded-bl-xl shadow-lg">
                      {p.discountType === 'PERCENT' ? `${p.discountValue}% OFF` : `DISKON Rp ${Number(p.discountValue).toLocaleString('id-ID')}`}
                    </div>
                  )}
                  {p.stock <= 0 && (
                    <div className="absolute bottom-0 inset-x-0 bg-yellow-600 text-white text-[8px] font-black py-1 text-center uppercase tracking-widest">
                      Indent
                    </div>
                  )}
               </div>
               <p className="text-[10px] font-black text-slate-800 leading-tight block uppercase group-hover:text-honey-600 transition-colors line-clamp-2 mb-1 min-h-[2.4em] break-all [overflow-wrap:anywhere] whitespace-normal">{p.name}</p>
               <div className="flex justify-between items-end">
                 <div className="flex flex-col">
                   {p.discountValue && p.discountValue > 0 && (
                     <p className="text-[9px] text-slate-400 line-through">Rp{p.price.toLocaleString()}</p>
                   )}
                   <p className="text-honey-600 font-black text-xs">Rp{getDiscountedPrice(p).toLocaleString()}</p>
                 </div>
                 <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${p.stock < p.minStock ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>S: {p.stock}</span>
               </div>
            </button>
          ))}
          {paginatedProducts.length === 0 && <div className="col-span-full py-20 text-center text-slate-300 font-black uppercase tracking-widest text-xs">Produk tidak ditemukan</div>}
        </div>

        {totalPages > 1 && (
          <div className="shrink-0 flex items-center justify-center gap-2 py-3 bg-white border rounded-2xl shadow-sm mb-2">
            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-honey-600 disabled:opacity-30"><i className="fas fa-chevron-left"></i></button>
            <div className="flex gap-1">
               {[...Array(totalPages)].map((_, i) => (
                 <button key={i} onClick={() => setCurrentPage(i + 1)} className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${currentPage === i + 1 ? 'bg-honey-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{i + 1}</button>
               )).slice(Math.max(0, currentPage - 3), Math.min(totalPages, currentPage + 2))}
            </div>
            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-honey-600 disabled:opacity-30"><i className="fas fa-chevron-right"></i></button>
          </div>
        )}
      </div>

      {/* Checkout Sidebar Section */}
      <div className={`w-full lg:w-[28rem] bg-white rounded-[2rem] shadow-2xl border border-slate-100 flex flex-col overflow-hidden ${viewMode === 'products' ? 'hidden lg:flex' : 'flex'}`}>
        
        <div className="p-6 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <span className="text-honey-600 text-2xl"><i className="fas fa-cash-register"></i></span>
             <h2 className="text-xl font-black text-slate-900">Checkout</h2>
          </div>
          <span className="bg-honey-600 text-white text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-lg shadow-honey-100">
            {cart.length} ITEM
          </span>
        </div>

        <div className="px-6 mb-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              {selectedMember ? (
                <div className="w-full px-5 py-4 bg-honey-50 border border-honey-200 rounded-[1.25rem] font-black text-honey-700 text-sm flex items-center justify-between shadow-sm">
                   <div className="flex items-center gap-2 truncate">
                     <i className="fas fa-id-card text-honey-500"></i>
                     <span className="truncate">{selectedMember.name}</span>
                   </div>
                   <button onClick={() => setSelectedMember(null)} className="text-slate-400 hover:text-red-500 ml-2" title="Hapus Member"><i className="fas fa-times-circle"></i></button>
                </div>
              ) : (
                <input 
                  type="text" 
                  value={customerName} 
                  onChange={(e) => setCustomerName(e.target.value)} 
                  placeholder={isTenant ? "Nama Pelanggan Umum..." : "Nama Pelanggan..."} 
                  className="w-full px-6 py-4 bg-white border border-slate-200 rounded-[1.25rem] text-sm font-bold outline-none focus:ring-4 focus:ring-honey-500/5 transition-all shadow-sm" 
                />
              )}
            </div>
            {isTenant ? (
              <button 
                type="button"
                onClick={() => {
                  setScannerModalTitle("Scan Kartu Member (Tenant)");
                  setScannerModalDesc("Arahkan kamera ke Barcode atau QR Code pada kartu member");
                  setShowCameraScanner(true);
                }} 
                title="Scan Barcode / QR Kartu Member"
                className="w-14 h-14 bg-honey-50 text-honey-600 rounded-[1.25rem] border border-honey-100 flex items-center justify-center text-xl shadow-sm hover:bg-honey-600 hover:text-white transition-all active:scale-95"
              >
                <i className="fas fa-qrcode"></i>
              </button>
            ) : (
              <button 
                type="button"
                onClick={() => setShowMemberPicker(true)} 
                title="Cari Data Member Manual"
                className="w-14 h-14 bg-honey-50 text-honey-600 rounded-[1.25rem] border border-honey-100 flex items-center justify-center text-xl shadow-sm hover:bg-honey-600 hover:text-white transition-all active:scale-95"
              >
                <i className="fas fa-search"></i>
              </button>
            )}
          </div>
        </div>

        {/* Optional Notes Section */}
        <div className="px-6 mb-4">
          <textarea 
            placeholder="Tambahkan catatan transaksi (opsional)..."
            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-[10px] font-bold outline-none focus:ring-4 focus:ring-honey-500/5 transition-all shadow-inner h-16 resize-none"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Item List Section */}
        <div className="flex-1 overflow-y-auto px-6 py-2 space-y-3 custom-scrollbar">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-200 py-10">
               <i className="fas fa-shopping-basket text-5xl mb-3 opacity-30"></i>
               <p className="font-black uppercase text-[10px] tracking-widest opacity-40 italic">Keranjang Belanja Kosong</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.productId} className="flex items-center gap-4 p-4 bg-slate-50/50 border border-slate-100 rounded-2xl hover:bg-white transition-all hover:shadow-md group">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black text-slate-800 line-clamp-2 uppercase mb-1 leading-tight group-hover:text-honey-600 transition-colors break-all [overflow-wrap:anywhere] whitespace-normal">{item.name}</p>
                  <p className="text-[10px] text-honey-600 font-black">Rp{Number(item.price).toLocaleString('id-ID')}</p>
                </div>
                <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-100">
                  <button onClick={() => updateQuantity(item.productId, -1)} className="w-8 h-8 flex items-center justify-center bg-slate-50 hover:bg-rose-50 text-slate-600 rounded-lg transition-colors"><i className="fas fa-minus text-[8px]"></i></button>
                  <input 
                    type="number" 
                    value={item.quantity} 
                    onChange={(e) => updateQuantity(item.productId, e.target.value)}
                    className="w-10 text-center text-xs font-black bg-transparent outline-none appearance-none"
                  />
                  <button onClick={() => updateQuantity(item.productId, 1)} className="w-8 h-8 flex items-center justify-center bg-slate-50 hover:bg-emerald-50 text-slate-600 rounded-lg transition-colors"><i className="fas fa-plus text-[8px]"></i></button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Total & Payment Buttons Section */}
        <div className="p-6 bg-[#0f172a] text-white rounded-t-[3.5rem] shadow-[0_-20px_60px_rgba(0,0,0,0.15)]">
          <div className="flex justify-between items-center mb-8 px-2">
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-honey-400">Total Tagihan</span>
            <span className="text-white text-3xl font-black tracking-tighter">Rp{Number(total).toLocaleString('id-ID')}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button disabled={cart.length === 0 || isProcessing} onClick={() => handleCheckout('CASH')} className="bg-honey-500 h-28 rounded-[2rem] font-black flex flex-col items-center justify-center gap-3 text-[10px] uppercase tracking-widest shadow-xl shadow-honey-900/40 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-30">
              <i className="fas fa-money-bill-wave text-3xl"></i>
              <span>Tunai</span>
            </button>
            <button disabled={cart.length === 0 || isProcessing} onClick={() => setShowQRISPopup(true)} className="bg-[#059669] h-28 rounded-[2rem] font-black flex flex-col items-center justify-center gap-3 text-[10px] uppercase tracking-widest shadow-xl shadow-emerald-900/40 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-30">
              <i className="fas fa-qrcode text-3xl"></i>
              <span>QRIS</span>
            </button>
            <button disabled={cart.length === 0 || isProcessing} onClick={() => handleCheckout('DEPOSIT')} className="bg-honey-600 h-28 rounded-[2rem] font-black flex flex-col items-center justify-center gap-3 text-[10px] uppercase tracking-widest shadow-xl shadow-amber-900/40 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-30">
              <i className="fas fa-wallet text-3xl"></i>
              <span>Deposit</span>
            </button>
            <button disabled={cart.length === 0 || isProcessing} onClick={() => handleCheckout('UNPAID')} className="bg-[#e11d48] h-28 rounded-[2rem] font-black flex flex-col items-center justify-center gap-3 text-[10px] uppercase tracking-widest shadow-xl shadow-rose-900/40 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-30">
              <i className="fas fa-file-invoice-dollar text-3xl"></i>
              <span>Piutang</span>
            </button>
            <button disabled={cart.length === 0 || isProcessing} onClick={() => handleCheckout('TRANSFER')} className="col-span-2 bg-[#4f46e5] h-20 rounded-[2rem] font-black flex flex-row items-center justify-center gap-4 text-[10px] uppercase tracking-widest shadow-xl shadow-honey-900/40 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-30 mt-2">
              <i className="fas fa-exchange-alt text-2xl"></i>
              <span>Transfer Bank / Mobile</span>
            </button>
          </div>
        </div>
      </div>

      {/* Success Dialog */}
      {showPrintDialog && lastTx && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-2xl z-[300] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[95vh]">
            <div className={`p-6 text-white text-center shrink-0 ${lastTx.paymentStatus === 'UNPAID' ? 'bg-rose-600' : 'bg-emerald-600'}`}>
              <i className={`fas ${lastTx.paymentStatus === 'UNPAID' ? 'fa-file-invoice-dollar' : 'fa-check-circle'} text-3xl mb-2`}></i>
              <h3 className="text-lg font-black uppercase tracking-widest">Transaksi Selesai</h3>
              <p className="text-white/70 text-[9px] mt-1 font-black uppercase tracking-[0.2em]">{lastTx.paymentStatus === 'UNPAID' ? 'PIUTANG DICATAT' : 'PEMBAYARAN LUNAS'}</p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              {/* Receipt Preview */}
              <div id="printable-area" className="p-6 bg-slate-50 border border-slate-200 rounded-[2rem] font-mono text-[10px] text-slate-800 shadow-inner flex flex-col items-center">
                <p className="font-black text-xs uppercase leading-tight mb-1 text-center">{settings.name}</p>
                <p className="text-[8px] opacity-70 leading-tight text-center mb-4">{settings.address}</p>
                
                <div className="w-full border-t border-dashed border-slate-300 my-2"></div>
                <div className="w-full bg-slate-100 py-1 px-2 rounded-lg mb-2 flex justify-between uppercase font-black text-[9px]"><span>TGL/WAKTU:</span><span>{new Date(lastTx.timestamp).toLocaleString('id-ID')}</span></div>
                <div className="w-full flex justify-between uppercase"><span>ID:</span><span>#{lastTx.id.slice(-8).toUpperCase()}</span></div>
                <div className="w-full flex justify-between uppercase"><span>STATUS:</span><span className="font-black">{lastTx.paymentStatus === 'PAID' ? 'TERBAYAR' : 'BELUM BAYAR'}</span></div>
                <div className="w-full flex justify-between uppercase"><span>CUST:</span><span className="font-black truncate max-w-[100px]">{lastTx.customerName || '-'}</span></div>
                <div className="w-full flex justify-between uppercase mb-2"><span>METODE:</span><span>{lastTx.paymentMethod}</span></div>
                
                <div className="w-full border-t border-dashed border-slate-300 my-2"></div>
                {lastTx.items.map((i, idx) => {
                  const hasDiscount = i.originalPrice > i.price;
                  const itemDiscountTotal = (i.originalPrice - i.price) * i.quantity;
                  return (
                    <div key={idx} className="w-full mb-1">
                      <div className="flex justify-between uppercase gap-2">
                        <span className="flex-1 text-left break-all [overflow-wrap:anywhere] whitespace-normal leading-tight">{i.name}</span>
                        <span className="shrink-0">{i.subtotal.toLocaleString()}</span>
                      </div>
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
                  <span>Rp{lastTx.total.toLocaleString()}</span>
                </div>
                {lastTx.notes && (
                  <div className="w-full mt-2 pt-2 border-t border-dashed border-slate-200">
                    <p className="text-[7px] font-black text-slate-400 uppercase">Catatan:</p>
                    <p className="text-[8px] text-slate-600 uppercase italic leading-tight">{lastTx.notes}</p>
                  </div>
                )}
                <div className="w-full text-center mt-6 italic opacity-70 uppercase tracking-widest leading-relaxed whitespace-pre-wrap">{settings.footer}</div>
              </div>
            </div>

            <div className="p-6 pt-0 shrink-0">
              <div className="flex flex-col gap-3">
                <button onClick={() => printService.printReceipt(lastTx, settings)} className="w-full bg-honey-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-honey-100 hover:bg-honey-700 transition-all active:scale-95">Cetak Struk Thermal</button>
                <button onClick={() => setShowPrintDialog(false)} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all active:scale-95">Lanjut Kasir Baru</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Other Modals (Member Picker, QRIS, etc.) remain the same */}
      {showQRISPopup && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[250] flex items-center justify-center p-4">
           <div className="bg-white rounded-[3rem] shadow-2xl max-w-sm w-full p-10 animate-in zoom-in duration-300 flex flex-col items-center text-center">
              <h3 className="text-xl font-black uppercase text-slate-800 mb-2">Pembayaran QRIS</h3>
              <p className="text-[10px] font-bold text-slate-500 mb-8 uppercase tracking-widest italic">Scan QRIS nominal Rp {Number(total).toLocaleString('id-ID')}</p>
              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-inner mb-8 w-full aspect-square flex items-center justify-center overflow-hidden">
                 {settings.qrisImage ? <img src={settings.qrisImage} className="max-w-full max-h-full object-contain" /> : <div className="text-slate-200 text-6xl"><Icons.POS /></div>}
              </div>
              <div className="grid grid-cols-2 gap-4 w-full">
                 <button disabled={isProcessing} onClick={() => setShowQRISPopup(false)} className="py-4 bg-slate-100 rounded-2xl font-black text-[10px] uppercase text-slate-500 disabled:opacity-50">Batal</button>
                 <button disabled={isProcessing} onClick={() => handleCheckout('QRIS')} className="py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl shadow-emerald-500/30 disabled:opacity-50 flex items-center justify-center gap-2">
                   {isProcessing && <i className="fas fa-spinner fa-spin"></i>}
                   <span>{isProcessing ? 'Memproses...' : 'Konfirmasi'}</span>
                 </button>
              </div>
           </div>
        </div>
      )}

      {showMemberPicker && !isTenant && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[150] flex items-center justify-center p-4">
           <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-sm w-full p-8 animate-in zoom-in duration-200">
              <h3 className="text-xl font-black uppercase mb-6 text-center tracking-tight">Pilih Member</h3>
              <div className="relative mb-6">
                <input autoFocus type="text" placeholder="Cari Nama Member..." className="w-full px-5 py-4 bg-slate-50 rounded-2xl border font-bold outline-none shadow-inner" value={memberSearch} onChange={e => setMemberSearch(e.target.value)} />
              </div>
              <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-3 mb-8">
                {members.filter(m => {
                  const q = memberSearch.trim().toLowerCase();
                  if (!q) return true;
                  return m.name.toLowerCase().includes(q) ||
                         m.id.toLowerCase().includes(q) ||
                         (m.barcode && m.barcode.toLowerCase().includes(q)) ||
                         (m.whatsapp && m.whatsapp.includes(q));
                }).slice(0, 50).map(m => (
                  <button key={m.id} disabled={m.status === 'SUSPENDED'} onClick={() => { setSelectedMember(m); setShowMemberPicker(false); setMemberSearch(''); }} className={`w-full text-left p-4 rounded-2xl border transition-all ${m.status === 'SUSPENDED' ? 'opacity-40 grayscale cursor-not-allowed bg-slate-100' : 'bg-white hover:bg-honey-50 border-slate-100 hover:border-honey-200 shadow-sm'}`}>
                    <div className="flex justify-between items-center">
                       <div>
                          <p className="font-black text-sm uppercase text-slate-800">{m.name}</p>
                          <p className="text-[10px] font-bold text-slate-400">{m.whatsapp}</p>
                       </div>
                       <p className="text-[10px] font-black text-honey-600">Rp{Number(m.depositBalance).toLocaleString('id-ID')}</p>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={() => setShowMemberPicker(false)} className="w-full py-4 bg-slate-100 rounded-2xl font-black text-[10px] uppercase text-slate-600">Tutup</button>
           </div>
        </div>
      )}

      <CameraScannerModal 
        isOpen={showCameraScanner} 
        onClose={() => setShowCameraScanner(false)} 
        onScan={(code) => {
          handleScannedCode(code);
        }} 
        title={scannerModalTitle}
        description={scannerModalDesc}
      />

      <ScannerStatusModal 
        isOpen={showScannerStatus}
        onClose={() => setShowScannerStatus(false)}
      />

      <ImportSalesModal 
        isOpen={showImportModal} 
        onClose={() => setShowImportModal(false)} 
        user={user}
        onRefresh={() => window.location.reload()} // Simple refresh to update all reports
      />
    </div>
  );
};

export default POS;
