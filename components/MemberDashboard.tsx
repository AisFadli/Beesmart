
import React, { useMemo, useState, useRef } from 'react';
import { AppState, Transaction, Member } from '../types';
import apiService from '../services/apiService';
import MemberShopping from './MemberShopping';
import ChatInterface from './ChatInterface';
import { MemberCardModal } from './MemberCardModal';
import { TermsPrivacyModal } from './TermsPrivacyModal';
import * as XLSX from 'xlsx';

const MemberDashboard: React.FC<{ state: AppState, onRefresh: () => void }> = ({ state, onRefresh }) => {
  const isMember = state.currentUser?.role === 'MEMBER';
  const [me, setMe] = useState<Member | null>(null);

  React.useEffect(() => {
    if (state.currentUser && state.members.length > 0) {
      const cleanId = state.currentUser.id.replace('USER-', '');
      const found = state.members.find(m => 
        m.id === state.currentUser?.id || 
        m.id === cleanId || 
        m.email === state.currentUser?.email
      );
      if (found) setMe(found);
    } else if (state.currentUser && (state as any).member_profile) {
      // Fallback if members list not fully populated but profile is
      setMe((state as any).member_profile);
    }
  }, [state.currentUser, state.members, (state as any).member_profile]);

  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'SHOPPING' | 'CHAT'>('OVERVIEW');
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsModalTab, setTermsModalTab] = useState<'terms' | 'privacy'>('terms');
  const [topUpAmount, setTopUpAmount] = useState(0);
  const [topUpProof, setTopUpProof] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<Member>>({});
  
  // Top Up Multi-step states
  const [topUpStep, setTopUpStep] = useState<'METHOD' | 'DETAILS'>('METHOD');
  const [topUpMethod, setTopUpMethod] = useState<'CASH' | 'TRANSFER' | 'QRIS'>('TRANSFER');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profilePhotoRef = useRef<HTMLInputElement>(null);

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 500;
          const MAX_HEIGHT = 500;
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
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleMemberPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file);
        setEditFormData(prev => ({ ...prev, image: compressed }));
      } catch (err) {
        alert("Gagal memproses foto. Silakan coba foto lain.");
      }
    }
  };

  const unreadCountMember = useMemo(() => {
    if (!me) return 0;
    return (state.messages || []).filter(
      m => m.receiverId === me.id && m.isRead === 0
    ).length;
  }, [state.messages, me]);
  
  const myTransactions = useMemo(() => {
    if (!me) return [];
    return (state.transactions || [])
      .filter(tx => tx.memberId === me.id)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [state.transactions, me]);

  const myActivity = useMemo(() => {
     if (!me) return [];
     const purchases = myTransactions.map(t => ({
        timestamp: t.timestamp,
        type: 'PURCHASE',
        desc: t.items.map(i => i.name).join(', '),
        amount: -t.total,
        method: t.paymentMethod,
        status: t.orderStatus || (t.paymentStatus === 'PAID' ? 'APPROVED' : 'PENDING'),
        notes: t.notes
     }));
     const logs = (state.memberLogs || [])
        .filter(l => l.memberId === me.id)
        .map(l => ({
           timestamp: l.timestamp,
           type: l.type,
           desc: l.notes,
           amount: l.type === 'TOPUP' ? l.amount : -l.amount,
           method: 'DEPOSIT',
           status: l.status
        }));
     return [...purchases, ...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [myTransactions, state.memberLogs, me]);

  const exportMemberHistoryToExcel = (member: Member, history: any[]) => {
    const headers = ['Waktu', 'Tipe Aktivitas', 'Keterangan', 'Metode Pembayaran / Dana', 'Nominal (Rp)', 'Status'];
    const rows = history.map(item => [
      new Date(item.timestamp).toLocaleString('id-ID'),
      item.type,
      item.desc || item.description,
      item.method || 'DEPOSIT',
      item.amount,
      item.status || 'APPROVED'
    ]);

    const worksheetData = [
      ['RIWAYAT AKTIVITAS MEMBER'],
      ['NAMA MEMBER', member.name],
      ['EMAIL', member.email],
      ['WHATSAPP', member.whatsapp],
      ['TANGGAL EXPORT', new Date().toLocaleString('id-ID')],
      [],
      headers,
      ...rows
    ];

    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Riwayat Aktivitas");
    XLSX.writeFile(wb, `Riwayat_${member.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsSubmitting(true);
      try {
        const res = await apiService.uploadFile(file);
        setTopUpProof(res.url);
      } catch (err: any) {
        alert(err.message);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const submitTopUpRequest = async () => {
    if (!me || topUpAmount <= 0) return;
    setIsSubmitting(true);
    try {
      await apiService.topUpMember(me.id, topUpAmount, topUpProof);
      alert("Pengajuan top up berhasil dikirim. Tunggu verifikasi admin.");
      setShowTopUpModal(false);
      setTopUpAmount(0);
      setTopUpProof(undefined);
    } catch (e: any) { alert(e.message); }
    finally { setIsSubmitting(false); }
  };

  const handleEditProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me) return;
    setIsSubmitting(true);
    try {
      await apiService.saveMember({ ...me, ...editFormData } as Member);
      alert("Profil berhasil diperbarui!");
      setShowEditProfile(false);
      onRefresh();
    } catch (e: any) { alert(e.message); }
    finally { setIsSubmitting(false); }
  };

  if (!me) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center bg-white rounded-[3rem] border border-slate-100 shadow-xl mx-auto max-w-2xl px-10">
        <div className="w-24 h-24 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center text-4xl mb-6 shadow-lg shadow-rose-100 animate-pulse">
           <i className="fas fa-user-ghost"></i>
        </div>
        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-2">Akun Member Belum Sinkron</h2>
        <p className="text-slate-500 font-medium mb-8 leading-relaxed max-w-md">
          Sistem belum menemukan data profil Anda di basis data Member. Pastikan admin telah mendaftarkan email <span className="font-bold text-slate-900">{state.currentUser?.email}</span> sebagai Member.
        </p>
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 w-full text-left space-y-2 mb-8">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Detail Sesi Login:</p>
           <p className="text-xs font-bold text-slate-700">ID: <span className="text-honey-600">{state.currentUser?.id}</span></p>
           <p className="text-xs font-bold text-slate-700">Email: <span className="text-honey-600">{state.currentUser?.email}</span></p>
        </div>
        <button onClick={() => onRefresh()} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-slate-200 active:scale-95 transition-all">Muat Ulang Data</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
               <span className="p-2 bg-honey-600 text-white rounded-xl shadow-lg"><i className="fas fa-user-check"></i></span>
               Halo, {me.name}
            </h1>
            <p className="text-slate-500 font-medium text-[10px] uppercase tracking-[0.2em] mt-1 ml-12">Dashboard Member • BeeSmart</p>
          </div>
          <div className="hidden md:flex gap-2 bg-white p-1 rounded-2xl border border-slate-100 shadow-sm">
             <button 
               onClick={() => setActiveTab('OVERVIEW')}
               className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'OVERVIEW' ? 'bg-honey-600 text-white shadow-lg shadow-honey-100' : 'text-slate-400 hover:bg-slate-50'}`}
             >
               Ringkasan
             </button>
             <button 
               onClick={() => state.settings.isOpen ? setActiveTab('SHOPPING') : alert("Maaf, saat ini BeeSmart sedang TUTUP. Silakan akses kembali nanti.")}
               className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'SHOPPING' ? 'bg-honey-600 text-white shadow-lg shadow-honey-100' : state.settings.isOpen ? 'text-slate-400 hover:bg-slate-50' : 'text-slate-300 cursor-not-allowed grayscale'}`}
             >
               Shopping {!state.settings.isOpen && ' (OFF)'}
             </button>
             <button 
               onClick={() => setActiveTab('CHAT')}
               className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all relative ${activeTab === 'CHAT' ? 'bg-honey-600 text-white shadow-lg shadow-honey-100' : 'text-slate-400 hover:bg-slate-50'}`}
             >
               Diskusi Koperasi
               {unreadCountMember > 0 && (
                 <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-rose-600 border-2 border-white rounded-full text-white text-[8px] font-black flex items-center justify-center animate-pulse shadow-sm">
                   {unreadCountMember}
                 </span>
               )}
             </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button onClick={() => setShowCardModal(true)} className="bg-honey-600 text-white border border-honey-700 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-honey-700 transition-all shadow-md shadow-honey-200 flex items-center justify-center gap-2 active:scale-95">
             <i className="fas fa-id-card text-sm"></i> Kartu Member Digital
          </button>
          <button onClick={() => { setEditFormData({ name: me.name, whatsapp: me.whatsapp, address: me.address, image: me.image }); setShowEditProfile(true); }} className="bg-white text-slate-700 border border-slate-200 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center justify-center gap-1">
             <i className="fas fa-edit mr-1"></i> Edit Profil
          </button>
          <button onClick={() => setShowTopUpModal(true)} className="bg-emerald-600 text-white px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-1">
             <i className="fas fa-plus-circle mr-1"></i> Top Up
          </button>
          <button onClick={() => { setTermsModalTab('terms'); setShowTermsModal(true); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 px-3.5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1" title="Syarat & Ketentuan Legal">
             <i className="fas fa-file-contract text-honey-600"></i> Syarat & Ketentuan
          </button>
        </div>
      </div>

      <div className="md:hidden flex gap-2 bg-white p-1 rounded-2xl border border-slate-100 mb-6 overflow-x-auto no-scrollbar">
          <button 
            onClick={() => setActiveTab('OVERVIEW')}
            className={`flex-1 min-w-[75px] py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === 'OVERVIEW' ? 'bg-honey-600 text-white shadow-lg' : 'text-slate-400'}`}
          >
            Ringkasan
          </button>
          <button 
            onClick={() => state.settings.isOpen ? setActiveTab('SHOPPING') : alert("Maaf, saat ini BeeSmart sedang TUTUP.")}
            className={`flex-1 min-w-[75px] py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === 'SHOPPING' ? 'bg-honey-600 text-white shadow-lg' : state.settings.isOpen ? 'text-slate-400' : 'text-slate-200'}`}
          >
            Shopping
          </button>
          <button 
            onClick={() => setActiveTab('CHAT')}
            className={`flex-1 min-w-[75px] py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all relative ${activeTab === 'CHAT' ? 'bg-honey-600 text-white shadow-lg' : 'text-slate-400'}`}
          >
            Diskusi
            {unreadCountMember > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-600 text-white text-[7px] font-black flex items-center justify-center rounded-full border border-white animate-pulse">
                {unreadCountMember}
              </span>
            )}
          </button>
      </div>

      {activeTab === 'SHOPPING' ? (
        <MemberShopping state={state} member={me} onRefresh={onRefresh} />
      ) : activeTab === 'CHAT' ? (
        <ChatInterface state={state} onRefreshData={async () => { onRefresh(); }} />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
         <div className={`p-8 rounded-[2.5rem] shadow-2xl text-white relative overflow-hidden group transition-all ${me.status === 'SUSPENDED' ? 'bg-red-600 grayscale-[0.3]' : 'bg-honey-600'}`}>
            <div className="relative z-10">
               <div className="flex justify-between items-start mb-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">Saldo Deposit Anda</p>
                  {me.status === 'SUSPENDED' && <span className="bg-white text-red-600 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest">SUSPENDED</span>}
               </div>
               <h3 className="text-4xl font-black mb-6">Rp {Number(me.depositBalance).toLocaleString('id-ID')}</h3>
               <div className="flex items-center gap-2">
                  <span className="bg-white/20 px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest">ID: {me.id}</span>
               </div>
            </div>
            <i className="fas fa-wallet absolute -right-4 -bottom-4 text-9xl opacity-10 rotate-12"></i>
         </div>
         <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Total Kunjungan</p>
            <h3 className="text-3xl font-black text-slate-900">{myTransactions.length} <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Transaksi</span></h3>
         </div>
         <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Total Pengeluaran</p>
            <h3 className="text-3xl font-black text-honey-600">Rp {Number(myTransactions.reduce((s,t) => s + t.total, 0)).toLocaleString('id-ID')}</h3>
         </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
         <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em] flex items-center gap-2">
              <i className="fas fa-history text-honey-600"></i> Timeline Aktivitas Belanja & Saldo
            </h3>
            <button 
              onClick={() => exportMemberHistoryToExcel(me, myActivity)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-emerald-100"
            >
              <i className="fas fa-file-excel"></i> Export Excel
            </button>
         </div>
         <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-left">
               <thead className="bg-slate-50 text-[10px] uppercase font-black text-slate-400 tracking-widest">
                  <tr>
                     <th className="px-8 py-5">Waktu</th>
                     <th className="px-8 py-5">Rincian</th>
                     <th className="px-8 py-5 text-right">Nominal</th>
                     <th className="px-8 py-5 text-center">Status</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                  {myActivity.map((act, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                       <td className="px-8 py-5">
                          <p className="text-[10px] font-black text-slate-800">{new Date(act.timestamp).toLocaleDateString()}</p>
                          <p className="text-[8px] text-slate-400 font-bold">{new Date(act.timestamp).toLocaleTimeString()}</p>
                       </td>
                       <td className="px-8 py-5">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase mb-1 inline-block ${act.type === 'TOPUP' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                             {act.type}
                          </span>
                          <p className="text-[10px] font-bold text-slate-600 italic line-clamp-1">{act.desc}</p>
                       </td>
                       <td className={`px-8 py-5 text-right font-black text-sm ${act.amount > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {act.amount > 0 ? '+' : ''}Rp {Number(Math.abs(act.amount)).toLocaleString('id-ID')}
                       </td>
                       <td className="px-8 py-5 text-center">
                          <span className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase ${act.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' : 'bg-emerald-100 text-emerald-600'}`}>
                             {act.status || 'APPROVED'}
                          </span>
                       </td>
                    </tr>
                  ))}
               </tbody>
            </table>
         </div>

         {/* Mobile Card View */}
         <div className="md:hidden divide-y divide-slate-100">
            {myActivity.map((act, idx) => (
              <div key={idx} className="p-4 flex flex-col gap-2">
                <div className="flex justify-between items-start">
                  <div>
                    <span className={`px-2 py-0.5 rounded text-[7px] font-black uppercase ${act.type === 'TOPUP' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                      {act.type}
                    </span>
                    <p className="text-[8px] text-slate-400 font-bold mt-1">{new Date(act.timestamp).toLocaleString()}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${act.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' : 'bg-emerald-100 text-emerald-600'}`}>
                    {act.status || 'APPROVED'}
                  </span>
                </div>
                <div className="flex justify-between items-end">
                  <p className="text-[10px] font-bold text-slate-600 italic line-clamp-2 max-w-[60%]">{act.desc}</p>
                  <p className={`font-black text-sm ${act.amount > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {act.amount > 0 ? '+' : ''}Rp {Number(Math.abs(act.amount)).toLocaleString('id-ID')}
                  </p>
                </div>
              </div>
            ))}
            {myActivity.length === 0 && <div className="p-10 text-center text-slate-300 font-black uppercase text-[10px]">Belum ada riwayat aktivitas</div>}
         </div>
      </div>
     </>
    )}       {showEditProfile && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[200] flex items-center justify-center p-4">
           <div className="bg-white rounded-[3rem] p-8 max-w-sm w-full animate-in zoom-in duration-300 shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar flex flex-col">
              <h3 className="text-xl font-black text-slate-900 mb-6 uppercase tracking-tight">Edit Informasi Profil</h3>
              <form onSubmit={handleEditProfileSubmit} className="space-y-4">
                 
                 {/* Upload Profile Photo */}
                 <div className="space-y-1 flex flex-col items-center">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest self-start ml-2">Foto Profil Kartu Member</label>
                    <div 
                      onClick={() => profilePhotoInputRef.current?.click()} 
                      className="w-24 h-24 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:bg-honey-50 hover:border-honey-300 transition-all overflow-hidden relative shadow-inner group"
                    >
                       {editFormData.image ? (
                          <img src={editFormData.image} className="w-full h-full object-cover" alt="Member Photo" />
                       ) : (
                          <div className="text-center p-2 text-slate-300 group-hover:text-honey-500">
                             <i className="fas fa-camera text-2xl mb-1"></i>
                             <p className="text-[8px] font-black uppercase tracking-wider">Unggah Foto</p>
                          </div>
                       )}
                    </div>
                    <input type="file" ref={profilePhotoInputRef} className="hidden" accept="image/*" onChange={handleProfilePhotoChange} />
                 </div>

                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Nama Lengkap</label>
                    <input className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs" value={editFormData.name || ''} onChange={e => setEditFormData({...editFormData, name: e.target.value})} />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2">No. WhatsApp</label>
                    <input className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs" value={editFormData.whatsapp || ''} onChange={e => setEditFormData({...editFormData, whatsapp: e.target.value})} />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Alamat Lengkap</label>
                    <textarea className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs h-20 resize-none" value={editFormData.address || ''} onChange={e => setEditFormData({...editFormData, address: e.target.value})} />
                 </div>
                 <div className="flex gap-4 pt-4">
                    <button type="button" onClick={() => setShowEditProfile(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase">Batal</button>
                    <button type="submit" disabled={isSubmitting} className="flex-1 py-4 bg-honey-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl disabled:opacity-50">Simpan Profil</button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {showTopUpModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[200] flex items-center justify-center p-4">
           <div className="bg-white rounded-[3rem] p-8 max-w-md w-full animate-in zoom-in duration-300 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                    {topUpStep === 'METHOD' ? 'Pilih Metode Top Up' : 'Detail Pembayaran'}
                 </h3>
                 <button onClick={() => { setShowTopUpModal(false); setTopUpStep('METHOD'); }} className="text-slate-400 hover:text-slate-800"><i className="fas fa-times"></i></button>
              </div>

              {topUpStep === 'METHOD' ? (
                <div className="space-y-4">
                   <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Silakan pilih metode yang Anda inginkan:</p>
                   <div className="grid grid-cols-1 gap-3">
                      <button onClick={() => { setTopUpMethod('TRANSFER'); setTopUpStep('DETAILS'); }} className="flex items-center gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:border-honey-300 hover:bg-honey-50 transition-all group">
                         <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-honey-600 shadow-sm group-hover:bg-honey-600 group-hover:text-white transition-all"><i className="fas fa-university text-xl"></i></div>
                         <div className="text-left">
                            <p className="text-xs font-black text-slate-800 uppercase">Transfer Bank</p>
                            <p className="text-[9px] text-slate-400 font-bold italic">Manual Verification • 24 Jam</p>
                         </div>
                      </button>
                      <button onClick={() => { setTopUpMethod('QRIS'); setTopUpStep('DETAILS'); }} className="flex items-center gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:border-emerald-300 hover:bg-emerald-50 transition-all group">
                         <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-emerald-600 shadow-sm group-hover:bg-emerald-600 group-hover:text-white transition-all"><i className="fas fa-qrcode text-xl"></i></div>
                         <div className="text-left">
                            <p className="text-xs font-black text-slate-800 uppercase">QRIS Payment</p>
                            <p className="text-[9px] text-slate-400 font-bold italic">Scan & Upload • Cepat & Mudah</p>
                         </div>
                      </button>
                      <button onClick={() => { setTopUpMethod('CASH'); setTopUpStep('DETAILS'); }} className="flex items-center gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:border-amber-300 hover:bg-amber-50 transition-all group">
                         <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-amber-600 shadow-sm group-hover:bg-amber-600 group-hover:text-white transition-all"><i className="fas fa-money-bill-wave text-xl"></i></div>
                         <div className="text-left">
                            <p className="text-xs font-black text-slate-800 uppercase">Tunai di Kasir</p>
                            <p className="text-[9px] text-slate-400 font-bold italic">Datang Langsung Ke BeeSmart</p>
                         </div>
                      </button>
                   </div>
                </div>
              ) : (
                <div className="space-y-6 overflow-y-auto pr-2 custom-scrollbar">
                   {topUpMethod === 'CASH' ? (
                      <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100 text-center">
                         <i className="fas fa-store-alt text-4xl text-amber-500 mb-4"></i>
                         <h4 className="text-sm font-black text-slate-800 uppercase mb-2">Titip Tunai di Toko</h4>
                         <p className="text-xs text-slate-600 leading-relaxed font-medium">Silakan hubungi kasir atau staf di BeeSmart untuk melakukan pengisian saldo secara tunai. Beritahukan Member ID Anda yaitu <span className="font-black text-honey-600">{me.id}</span>.</p>
                      </div>
                   ) : (
                      <>
                        <div className="bg-slate-900 text-white p-6 rounded-[2rem] shadow-xl relative overflow-hidden">
                           <div className="relative z-10">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Instruksi Pembayaran {topUpMethod}</p>
                              <div className="text-[11px] leading-relaxed font-bold whitespace-pre-wrap opacity-90">
                                 {state.settings.topUpInstructions || 'Mohon maaf, instruksi pembayaran belum diatur oleh admin. Silakan hubungi toko.'}
                              </div>
                              {topUpMethod === 'QRIS' && state.settings.qrisImage && (
                                <div className="mt-6 flex flex-col items-center gap-4 bg-white p-6 rounded-3xl">
                                   <img src={state.settings.qrisImage} className="w-48 h-48 object-contain" />
                                   <a 
                                     href={state.settings.qrisImage} 
                                     download="QRIS-BeeSmart.png" 
                                     className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[10px] uppercase text-center transition-all"
                                   >
                                      <i className="fas fa-download mr-2"></i> Download QRIS
                                   </a>
                                </div>
                              )}
                           </div>
                           <i className="fas fa-receipt absolute -right-4 -bottom-4 text-7xl opacity-5 rotate-12"></i>
                        </div>

                        <div className="space-y-4">
                           <div>
                              <label className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest italic">Langkah Terakhir:</label>
                              <div className="grid grid-cols-1 gap-3 mt-1">
                                 <div>
                                    <label className="text-[8px] font-black text-slate-400 uppercase ml-2 mb-1 block">1. Masukkan Nominal (Rp)</label>
                                    <input type="number" placeholder="0" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-2xl text-honey-600 outline-none" value={topUpAmount} onChange={e => setTopUpAmount(Number(e.target.value))} />
                                 </div>
                                 <div className="relative">
                                    <label className="text-[8px] font-black text-slate-400 uppercase ml-2 mb-1 block">2. Upload Bukti Transaksi</label>
                                    <div onClick={() => fileInputRef.current?.click()} className="w-full aspect-video bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center overflow-hidden cursor-pointer hover:bg-slate-100 transition-all">
                                       {topUpProof ? <img src={topUpProof} className="w-full h-full object-cover" /> : <div className="text-center text-slate-300"><i className="fas fa-camera text-2xl mb-1"></i><p className="text-[8px] font-black uppercase">Ambil Gambar</p></div>}
                                    </div>
                                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleProofUpload} className="hidden" />
                                 </div>
                              </div>
                           </div>
                        </div>
                      </>
                   )}
                   
                   <div className="flex gap-4 pt-4 sticky bottom-0 bg-white pb-2">
                      <button onClick={() => setTopUpStep('METHOD')} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase hover:bg-slate-200 transition-colors">Ganti Metode</button>
                      {topUpMethod !== 'CASH' && (
                        <button onClick={submitTopUpRequest} disabled={isSubmitting || topUpAmount < 1000 || !topUpProof} className="flex-2 py-4 bg-honey-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl shadow-honey-200 active:scale-95 disabled:opacity-50 transition-all">
                           {isSubmitting ? 'Memproses...' : 'Kirim Bukti Pembayaran'}
                        </button>
                      )}
                   </div>
                </div>
              )}
           </div>
        </div>
      )}
       {/* Member Card Modal */}
       <MemberCardModal 
         isOpen={showCardModal} 
         onClose={() => setShowCardModal(false)} 
         member={me} 
         settings={state.settings} 
       />

       {/* Legal Terms & Privacy Policy Modal */}
       <TermsPrivacyModal
         isOpen={showTermsModal}
         onClose={() => setShowTermsModal(false)}
         defaultTab={termsModalTab}
       />
    </div>
  );
};

export default MemberDashboard;
