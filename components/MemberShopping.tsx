
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AppState, Product, Transaction, TransactionItem, Member, ShippingRate } from '../types';
import apiService from '../services/apiService';
import { Icons } from '../constants';

interface MemberShoppingProps {
  state: AppState;
  member: Member;
  onRefresh: () => void;
}

const MemberShopping: React.FC<MemberShoppingProps> = ({ state, member, onRefresh }) => {
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<TransactionItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState(false);
  
  // Checkout States
  const [paymentMethod, setPaymentMethod] = useState<'TRANSFER' | 'QRIS' | 'DEPOSIT' | 'CASH'>('CASH');
  const [deliveryType, setDeliveryType] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [isChoosingMethod, setIsChoosingMethod] = useState(false);
  const [notes, setNotes] = useState('');
  const [paymentProof, setPaymentProof] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [location, setLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [shippingCost, setShippingCost] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredProducts = useMemo(() => {
    const s = search.trim().toLowerCase();
    return state.products.filter(p => 
      p.name.toLowerCase().includes(s) || 
      p.sku.toLowerCase().includes(s)
    );
  }, [state.products, search]);

  const total = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const grandTotal = Number(total) + Number(shippingCost);

  // Shipping details state initialized with member info
  const [receiverName, setReceiverName] = useState(member.name);
  const [receiverPhone, setReceiverPhone] = useState(member.whatsapp);
  const [receiverAddress, setReceiverAddress] = useState(member.address);
  const [shippingNotes, setShippingNotes] = useState('');

  // Sync with member props if they change
  useEffect(() => {
    setReceiverName(member.name);
    setReceiverPhone(member.whatsapp);
    setReceiverAddress(member.address);
  }, [member.id, member.name, member.whatsapp, member.address]);

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

  // Haversine formula to calculate distance between two points in KM
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; // Distance in km
  };

  const deg2rad = (deg: number) => deg * (Math.PI/180);

  useEffect(() => {
    if (deliveryType === 'DELIVERY' && !location) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setLocation(loc);
          if (state.settings.latitude && state.settings.longitude) {
            const d = calculateDistance(loc.lat, loc.lng, state.settings.latitude, state.settings.longitude);
            setDistance(d);
            updateShippingCost(d);
          }
        },
        (err) => {
          console.error("Geolocation failed:", err);
          alert("Gagal mendapatkan lokasi. Silakan pilih lokasi secara manual atau cek pengaturan GPS Anda.");
        }
      );
    } else if (deliveryType === 'PICKUP') {
      setDistance(null);
      setShippingCost(0);
    }
  }, [deliveryType, state.settings]);

  // @ts-ignore
  const shippingRates = state.shipping_rates as ShippingRate[] || [];

  const updateShippingCost = (dist: number) => {
    const rate = shippingRates.find(r => dist >= r.minDistance && dist <= r.maxDistance);
    if (rate) {
      setShippingCost(Number(rate.rate));
    } else {
      // Check if exceeds max
      const maxRange = Math.max(...shippingRates.map(r => r.maxDistance));
      if (dist > maxRange) {
        alert("Lokasi Anda di luar jangkauan pengiriman kami.");
        setShippingCost(0);
      }
    }
  };

  const addToCart = (product: Product) => {
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
    setCart(prev => {
      const newItems = prev.map(item => {
        if (item.productId === productId) {
          let newQty: number;
          if (typeof delta === 'number') {
            newQty = item.quantity + delta;
          } else {
            // Manual typing
            if (delta === '') return { ...item, quantity: 0, subtotal: 0 };
            newQty = parseInt(delta);
          }
          
          if (isNaN(newQty)) return item;
          newQty = Math.max(0, newQty);
          return { ...item, quantity: newQty, subtotal: newQty * item.price };
        }
        return item;
      });
      
      // Only filter out items with 0 qty if we are NOT in manual typing mode or if the change comes from +/- buttons
      if (typeof delta === 'number') {
        return newItems.filter(item => item.quantity > 0);
      }
      return newItems;
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploading(true);
      try {
        const res = await apiService.uploadFile(file);
        setPaymentProof(res.url);
      } catch (err: any) {
        alert(err.message);
      } finally {
        setIsUploading(false);
      }
    }
  };

  const submitOrder = async () => {
    if (cart.length === 0 || isProcessing) return;
    if ((paymentMethod === 'TRANSFER' || paymentMethod === 'QRIS') && !paymentProof) {
      alert("Wajib melampirkan bukti pembayaran untuk metode ini!");
      return;
    }
    if (deliveryType === 'DELIVERY' && !location) {
      alert("Lokasi pengiriman belum ditentukan.");
      return;
    }

    setIsProcessing(true);
    
    // Safety check for deposit balance
    if (paymentMethod === 'DEPOSIT' && grandTotal > member.depositBalance) {
      alert("Saldo deposit Anda tidak mencukupi untuk pesanan ini.");
      setIsProcessing(false);
      return;
    }

    const transaction: Transaction = {
      id: `ORD-${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').split('.')[0],
      items: cart,
      total: grandTotal,
      paymentMethod,
      paymentStatus: paymentMethod === 'DEPOSIT' ? 'PAID' : 'UNPAID', 
      staffId: 'MEMBER-SELF',
      memberId: member.id,
      customerName: receiverName || member.name,
      notes: notes + (shippingNotes ? ` | Info Pengiriman: ${shippingNotes} (Alamat: ${receiverAddress}, HP: ${receiverPhone})` : ''),
      deliveryType,
      shippingCost,
      latitude: location?.lat,
      longitude: location?.lng,
      paymentProof: paymentProof || undefined,
      transactionType: 'NORMAL',
      orderStatus: 'PENDING'
    };

    try {
      await apiService.saveTransaction(transaction);
      alert("Pesanan berhasil dikirim. Silakan tunggu konfirmasi dari staf kami.");
      setCart([]);
      setCheckoutMode(false);
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (checkoutMode) {
    return (
      <div className="space-y-6">
        <button onClick={() => setCheckoutMode(false)} className="flex items-center gap-2 text-indigo-600 font-black text-[10px] uppercase">
          <i className="fas fa-arrow-left"></i> Kembali Belanja
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
               <h3 className="text-sm font-black uppercase text-slate-800 mb-6">Metode Pengiriman</h3>
               <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setDeliveryType('PICKUP')}
                    className={`p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-2 ${deliveryType === 'PICKUP' ? 'border-indigo-600 bg-indigo-50 text-indigo-600 shadow-lg' : 'border-slate-100 text-slate-400 group hover:border-indigo-200'}`}
                  >
                    <i className="fas fa-store text-2xl group-hover:scale-110 transition-transform"></i>
                    <span className="text-[10px] font-black uppercase tracking-widest">Ambil Sendiri</span>
                  </button>
                  <button 
                    onClick={() => setDeliveryType('DELIVERY')}
                    className={`p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-2 ${deliveryType === 'DELIVERY' ? 'border-indigo-600 bg-indigo-50 text-indigo-600 shadow-lg' : 'border-slate-100 text-slate-400 group hover:border-indigo-200'}`}
                  >
                    <i className="fas fa-truck text-2xl group-hover:scale-110 transition-transform"></i>
                    <span className="text-[10px] font-black uppercase tracking-widest">Kirim Ke Alamat</span>
                  </button>
               </div>
               {deliveryType === 'DELIVERY' && (
                 <div className="mt-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex justify-between items-center mb-2">
                       <span className="text-[10px] font-black text-slate-400 uppercase">Estimasi Jarak</span>
                       <span className="text-xs font-black text-indigo-600">{distance ? `${distance.toFixed(2)} KM` : 'Menghitung...'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                       <span className="text-[10px] font-black text-slate-400 uppercase">Biaya Ongkir</span>
                       <span className="text-xs font-black text-indigo-600">Rp {Number(shippingCost).toLocaleString('id-ID')}</span>
                    </div>
                 </div>
               )}
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
               <h3 className="text-sm font-black uppercase text-slate-800 mb-6 flex items-center gap-2">
                 <i className="fas fa-wallet text-indigo-600"></i> Metode Pembayaran
               </h3>
               
               {!isChoosingMethod ? (
                 <div className="grid grid-cols-2 gap-4">
                   <div 
                     onClick={() => { setPaymentMethod('CASH'); setIsChoosingMethod(true); }}
                     className={`p-6 rounded-[2rem] border-2 cursor-pointer transition-all flex flex-col items-center gap-3 ${paymentMethod === 'CASH' ? 'border-indigo-600 bg-indigo-50 text-indigo-600 shadow-lg' : 'border-slate-100 text-slate-400 opacity-60 hover:opacity-100 hover:border-indigo-200'}`}
                   >
                     <i className="fas fa-money-bill-wave text-2xl"></i>
                     <span className="text-[10px] font-black uppercase tracking-widest text-center">Tunai di Toko</span>
                   </div>
                   <div 
                     onClick={() => { setPaymentMethod('TRANSFER'); setIsChoosingMethod(true); }}
                     className={`p-6 rounded-[2rem] border-2 cursor-pointer transition-all flex flex-col items-center gap-3 ${paymentMethod === 'TRANSFER' ? 'border-indigo-600 bg-indigo-50 text-indigo-600 shadow-lg' : 'border-slate-100 text-slate-400 opacity-60 hover:opacity-100 hover:border-indigo-200'}`}
                   >
                     <i className="fas fa-university text-2xl"></i>
                     <span className="text-[10px] font-black uppercase tracking-widest text-center">Transfer Bank</span>
                   </div>
                   <div 
                     onClick={() => { setPaymentMethod('QRIS'); setIsChoosingMethod(true); }}
                     className={`p-6 rounded-[2rem] border-2 cursor-pointer transition-all flex flex-col items-center gap-3 ${paymentMethod === 'QRIS' ? 'border-indigo-600 bg-indigo-50 text-indigo-600 shadow-lg' : 'border-slate-100 text-slate-400 opacity-60 hover:opacity-100 hover:border-indigo-200'}`}
                   >
                     <i className="fas fa-qrcode text-2xl"></i>
                     <span className="text-[10px] font-black uppercase tracking-widest text-center">QRIS Koperasi</span>
                   </div>
                   <div 
                     onClick={() => { setPaymentMethod('DEPOSIT'); setIsChoosingMethod(true); }}
                     className={`p-6 rounded-[2rem] border-2 cursor-pointer transition-all flex flex-col items-center gap-3 ${paymentMethod === 'DEPOSIT' ? 'border-indigo-600 bg-indigo-50 text-indigo-600 shadow-lg' : 'border-slate-100 text-slate-400 opacity-60 hover:opacity-100 hover:border-indigo-200'}`}
                   >
                     <i className="fas fa-piggy-bank text-2xl"></i>
                     <div className="flex flex-col items-center">
                       <span className="text-[10px] font-black uppercase tracking-widest text-center">Deposit Saya</span>
                       <span className="text-[8px] font-bold mt-1 text-slate-400">Saldo: Rp {member.depositBalance.toLocaleString()}</span>
                     </div>
                   </div>
                 </div>
               ) : (
                 <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center text-sm">
                           <i className={paymentMethod === 'CASH' ? 'fas fa-money-bill-wave' : paymentMethod === 'TRANSFER' ? 'fas fa-university' : paymentMethod === 'QRIS' ? 'fas fa-qrcode' : 'fas fa-piggy-bank'}></i>
                         </div>
                         <div>
                            <p className="text-[10px] font-black uppercase text-slate-400">Metode Terpilih</p>
                            <p className="text-xs font-black text-slate-700">{paymentMethod === 'CASH' ? 'Tunai' : paymentMethod}</p>
                         </div>
                      </div>
                      <button onClick={() => setIsChoosingMethod(false)} className="text-[10px] font-black uppercase text-indigo-600 hover:text-indigo-700">Ganti</button>
                    </div>

                    {(paymentMethod === 'TRANSFER' || paymentMethod === 'QRIS') && (
                      <div className="space-y-4">
                        {state.settings.topUpInstructions && (
                          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                            <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Instruksi Pembayaran</h4>
                            <div className="text-[11px] font-medium text-slate-600 whitespace-pre-wrap leading-relaxed">{state.settings.topUpInstructions}</div>
                          </div>
                        )}

                        {paymentMethod === 'QRIS' && state.settings.qrisImage && (
                          <div className="flex flex-col items-center gap-4 bg-indigo-50/30 p-6 rounded-3xl border border-indigo-100">
                             <div className="bg-white p-4 rounded-3xl shadow-xl w-48 h-48 border border-white flex items-center justify-center overflow-hidden">
                               <img src={state.settings.qrisImage} alt="Store QRIS" className="w-full h-full object-contain" />
                             </div>
                             <a 
                               href={state.settings.qrisImage} 
                               download="QRIS-KOPERASI.png"
                               className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2 hover:indigo-700"
                             >
                               <i className="fas fa-download"></i> Simpan QRIS
                             </a>
                          </div>
                        )}

                        <div className="space-y-3">
                           <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                             <i className="fas fa-cloud-upload-alt text-indigo-500"></i> Upload Bukti Bayar
                           </h4>
                           <div 
                              onClick={() => fileInputRef.current?.click()}
                              className="w-full aspect-video bg-slate-50 border-2 border-dashed border-slate-100 rounded-[2rem] flex flex-col items-center justify-center cursor-pointer hover:bg-white hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-500/5 transition-all overflow-hidden relative group"
                           >
                              {paymentProof ? (
                                <img src={paymentProof.startsWith('data:') ? paymentProof : (window as any).location.origin + '/' + paymentProof} className="w-full h-full object-cover" />
                              ) : (
                                <>
                                  {isUploading ? <i className="fas fa-spinner fa-spin text-2xl text-indigo-600"></i> : <i className="fas fa-camera text-4xl text-slate-200 mb-3 group-hover:scale-110 transition-transform"></i>}
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isUploading ? 'Sedang Mengunggah...' : 'Pilih Foto / Screenshot'}</span>
                                </>
                              )}
                           </div>
                           <input ref={fileInputRef} type="file" hidden accept="image/*" onChange={handleFileUpload} />
                        </div>
                      </div>
                    )}

                    {paymentMethod === 'DEPOSIT' && (
                      <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-100 flex items-center gap-4">
                         <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center text-xl">
                            <i className="fas fa-check-circle"></i>
                         </div>
                         <div>
                            <p className="text-[10px] font-black text-emerald-800 uppercase">Saldo Mencukupi</p>
                            <p className="text-xs font-bold text-emerald-600 leading-tight">Pesanan akan memotong saldo deposit Anda saat dikonfirmasi staf.</p>
                         </div>
                      </div>
                    )}

                    {paymentMethod === 'CASH' && (
                      <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center gap-4">
                         <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center text-xl">
                            <i className="fas fa-info-circle"></i>
                         </div>
                         <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase">Bayar Di Toko</p>
                            <p className="text-xs font-bold text-slate-500 leading-tight">Silakan selesaikan pembayaran tunai di kasir saat mengambil pesanan.</p>
                         </div>
                      </div>
                    )}
                 </div>
               )}
            </div>
          </div>

          <div className="bg-slate-900 text-white p-8 rounded-[3rem] shadow-2xl flex flex-col items-center">
             <h3 className="text-lg font-black uppercase mb-8 tracking-tighter">Ringkasan Pesanan</h3>
             <div className="w-full space-y-4 mb-8 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {cart.map(item => (
                  <div key={item.productId} className="flex justify-between items-center text-xs group">
                    <div className="flex flex-col min-w-0 flex-1 mr-2">
                      <span className="opacity-70 line-clamp-2 leading-tight mb-1 break-all [overflow-wrap:anywhere] whitespace-normal">{item.name}</span>
                      <div className="flex items-center gap-2 mt-auto">
                        <button onClick={() => updateQuantity(item.productId, -1)} className="w-5 h-5 flex items-center justify-center bg-white/10 rounded-lg hover:bg-indigo-500 transition-colors"><i className="fas fa-minus text-[8px]"></i></button>
                        <input 
                          type="number" 
                          className="w-10 bg-transparent text-center font-black focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                          value={item.quantity} 
                          onChange={(e) => updateQuantity(item.productId, e.target.value)} 
                        />
                        <button onClick={() => updateQuantity(item.productId, 1)} className="w-5 h-5 flex items-center justify-center bg-white/10 rounded-lg hover:bg-indigo-500 transition-colors"><i className="fas fa-plus text-[8px]"></i></button>
                      </div>
                    </div>
                    <span className="font-black">Rp {Number(item.subtotal).toLocaleString('id-ID')}</span>
                  </div>
                ))}
             </div>
             
             <div className="w-full border-t border-white/10 pt-6 space-y-4 mb-10">
                <div className="flex justify-between items-center opacity-60 text-[10px] font-black uppercase tracking-widest">
                   <span>Subtotal Belanja</span>
                   <span>Rp {Number(total).toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between items-center opacity-60 text-[10px] font-black uppercase tracking-widest">
                   <span>Ongkos Kirim</span>
                   <span>Rp {Number(shippingCost).toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between items-center pt-2">
                   <span className="text-xs font-black uppercase tracking-[0.2em] text-indigo-400">Total Akhir</span>
                   <span className="text-3xl font-black text-white">Rp {Number(grandTotal).toLocaleString('id-ID')}</span>
                </div>
             </div>

             {deliveryType === 'DELIVERY' && (
                <div className="w-full mb-6 space-y-4">
                   <h4 className="text-[10px] font-black uppercase text-indigo-400 tracking-widest border-b border-white/10 pb-2">Detail Pengiriman</h4>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-500 uppercase">Nama Penerima</label>
                        <input className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold outline-none" value={receiverName} onChange={e => setReceiverName(e.target.value)} placeholder="Nama" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-500 uppercase">Telp / WhatsApp</label>
                        <input className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold outline-none" value={receiverPhone} onChange={e => setReceiverPhone(e.target.value)} placeholder="08..." />
                      </div>
                   </div>
                   <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-500 uppercase">Alamat Pengiriman</label>
                      <textarea className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold outline-none h-20 resize-none" value={receiverAddress} onChange={e => setReceiverAddress(e.target.value)} placeholder="Detail Alamat" />
                   </div>
                </div>
             )}

             <div className="w-full mb-4">
                <textarea 
                  placeholder="Catatan Pengiriman (Opsional)..."
                  className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-bold outline-none focus:ring-4 focus:ring-indigo-500/20 transition-all shadow-inner h-20 resize-none"
                  value={shippingNotes}
                  onChange={e => setShippingNotes(e.target.value)}
                />
             </div>

             <div className="w-full p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl mb-8">
                <p className="text-[9px] font-bold text-amber-200 leading-relaxed italic">
                  <i className="fas fa-info-circle mr-2"></i>
                  Pengiriman Pesanan akan dilakukan diproses setelah pesanan dikonfirmasi (oleh staff atau admin). Jika produk tidak tersedia atau pesanan tidak dapat dilanjutkan maka staff atau admin akan menolak pesanan. Jika pesanan sudah dibayarkan maka staff atau admin akan mengirimkan bukti refund pembayaran atau mengembalikan dananya menjadi deposit member dan otomatis membatalkan transaksi.
                </p>
             </div>

             <button 
               onClick={submitOrder}
               disabled={isProcessing || isUploading || cart.length === 0}
               className="w-full bg-indigo-600 hover:bg-indigo-700 py-6 rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-900/50 active:scale-95 transition-all disabled:opacity-30 disabled:scale-100"
             >
                {isProcessing ? 'Mengirim Pesanan...' : 'Konfirmasi Pesanan'}
             </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="relative w-full md:w-96 flex-1 group">
           <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-400 group-focus-within:text-indigo-600 transition-colors">
              <Icons.Search />
           </span>
           <input 
             type="text" 
             placeholder="Cari Produk Minimart..." 
             className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-xs focus:ring-4 focus:ring-indigo-500/5 transition-all"
             value={search}
             onChange={e => setSearch(e.target.value)}
           />
        </div>
        <button 
          onClick={() => cart.length > 0 && setCheckoutMode(true)}
          className={`px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center gap-3 ${cart.length > 0 ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
        >
          <i className="fas fa-shopping-cart"></i>
          Keranjang ({cart.length})
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {filteredProducts.map(p => (
          <div key={p.id} className="bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-xl hover:border-indigo-100 transition-all flex flex-col relative group overflow-hidden">
             <div className="w-full aspect-square bg-slate-50 rounded-2xl mb-4 flex items-center justify-center overflow-hidden relative grayscale-[0.2] group-hover:grayscale-0 transition-all">
                {p.image ? (
                  <img src={p.image} className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500" referrerPolicy="no-referrer" />
                ) : (
                  <Icons.Inventory />
                )}
                {p.stock <= 0 && (
                   <div className="absolute top-2 right-2 bg-amber-600 text-white text-[8px] font-black px-2 py-1 rounded-lg shadow-lg">INDENT</div>
                )}
             </div>
             <p className="text-[11px] font-black text-slate-800 leading-tight uppercase mb-1 group-hover:text-indigo-600 line-clamp-2 min-h-[2.6em] break-all [overflow-wrap:anywhere] whitespace-normal">{p.name}</p>
             <div className="text-[9px] font-extrabold mb-2 text-slate-400 uppercase tracking-wider">
                Stok: <span className={p.stock <= 0 ? "text-rose-500" : p.stock <= (p.minStock || 5) ? "text-amber-500" : "text-emerald-600"}>{p.stock}</span>
             </div>
             <div className="flex justify-between items-center mt-auto">
                <div className="flex flex-col">
                   {getDiscountedPrice(p) < p.price && (
                     <span className="text-[8px] text-rose-400 line-through font-bold">Rp {p.price.toLocaleString()}</span>
                   )}
                   <p className="text-xs font-black text-indigo-600 tracking-tight">Rp {getDiscountedPrice(p).toLocaleString('id-ID')}</p>
                </div>
                <button 
                  onClick={() => addToCart(p)}
                  className="w-8 h-8 bg-slate-900 text-white rounded-xl flex items-center justify-center text-[10px] active:scale-90 transition-transform shadow-lg shadow-black/10 hover:bg-indigo-600"
                >
                  <i className="fas fa-plus"></i>
                </button>
             </div>
          </div>
        ))}
        {filteredProducts.length === 0 && (
          <div className="col-span-full py-20 text-center text-slate-300 font-black uppercase text-xs tracking-[0.3em]">Produk tidak ditemukan</div>
        )}
      </div>

      {cart.length > 0 && !checkoutMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
           <button 
             onClick={() => setCheckoutMode(true)}
             className="w-full bg-slate-900 text-white py-5 rounded-[2.5rem] shadow-2xl flex items-center justify-between px-8 group active:scale-95 transition-all animate-bounce-slow"
           >
              <div className="flex items-center gap-4">
                 <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-sm"><i className="fas fa-shopping-basket"></i></div>
                 <div className="text-left">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Siap Checkout</p>
                <p className="text-sm font-black tracking-tight">Rp {Number(total).toLocaleString('id-ID')}</p>
                 </div>
              </div>
              <i className="fas fa-arrow-right group-hover:translate-x-2 transition-transform"></i>
           </button>
        </div>
      )}
    </div>
  );
};

export default MemberShopping;
