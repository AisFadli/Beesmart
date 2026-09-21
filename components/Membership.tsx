
import React, { useState, useMemo, useRef } from 'react';
import { Member, AppState, Transaction, UserRole, MemberLog } from '../types';
import { Icons } from '../constants';
import apiService from '../services/apiService';
import { MemberCardModal } from './MemberCardModal';
import { TermsPrivacyModal } from './TermsPrivacyModal';
import { RegistrationConfirmModal } from './RegistrationConfirmModal';
import * as XLSX from 'xlsx';

interface MembershipProps {
  state: AppState;
  onSaveMember: (member: Member) => Promise<void>;
  onDeleteMember: (id: string) => Promise<void>;
  onTopUp: (memberId: string, amount: number, proofImage?: string) => Promise<void>;
  onRefreshData: () => Promise<void>;
  onOpenChat: (memberId: string) => void;
}

const Membership: React.FC<MembershipProps> = ({ state, onSaveMember, onTopUp, onRefreshData, onOpenChat }) => {
  const [activeTab, setActiveTab] = useState<'approved' | 'pending' | 'topup_approval'>('approved');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [cardMember, setCardMember] = useState<Member | null>(null);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [topUpAmount, setTopUpAmount] = useState(0);
  const [topUpProof, setTopUpProof] = useState<string | undefined>(undefined);
  const [isUploading, setIsUploading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = state.currentUser?.role === UserRole.ADMIN;

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const [formData, setFormData] = useState<Partial<Member>>({
    name: '', whatsapp: '', email: '', address: '', password: '', depositBalance: 0, image: '', barcode: ''
  });

  // Modal state for barcode regeneration warning
  const [showBarcodeConfirmModal, setShowBarcodeConfirmModal] = useState(false);

  // Legal & Registration Confirmation States
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsModalTab, setTermsModalTab] = useState<'terms' | 'privacy'>('terms');
  const [showSaveConfirmModal, setShowSaveConfirmModal] = useState(false);
  const [isSavingMember, setIsSavingMember] = useState(false);

  const generateNewMemberBarcode = () => {
    let newBarcode = '';
    let attempts = 0;
    while (attempts < 100) {
      newBarcode = 'MBR-' + Math.floor(100000 + Math.random() * 900000);
      const inMembers = (state.members || []).some(m => m.id !== selectedMember?.id && (m.barcode === newBarcode || m.id === newBarcode));
      const inProducts = (state.products || []).some(p => p.barcode === newBarcode || p.sku === newBarcode || p.id === newBarcode);
      if (!inMembers && !inProducts) break;
      attempts++;
    }
    return newBarcode;
  };

  const handleAutoGenerateBarcodeClick = () => {
    if (formData.barcode && formData.barcode.trim() !== '') {
      setShowBarcodeConfirmModal(true);
    } else {
      setFormData(prev => ({ ...prev, barcode: generateNewMemberBarcode() }));
    }
  };

  const confirmGenerateNewBarcode = () => {
    setFormData(prev => ({ ...prev, barcode: generateNewMemberBarcode() }));
    setShowBarcodeConfirmModal(false);
  };

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
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleProfilePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file);
        setFormData(prev => ({ ...prev, image: compressed }));
      } catch (err) {
        alert("Gagal mengunggah foto. Coba gunakan foto lain.");
      }
    }
  };

  const filteredMembers = useMemo(() => {
    setCurrentPage(1);
    return (state.members || []).filter(m => {
      // Member APPROVED dan SUSPENDED digabung dalam satu list agar data tidak "hilang" dari pandangan
      const isCorrectTab = activeTab === 'pending' ? m.status === 'PENDING' : (m.status === 'APPROVED' || m.status === 'SUSPENDED');
      const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase()) || 
                           m.whatsapp.includes(search) || 
                           m.email.toLowerCase().includes(search.toLowerCase());
      return isCorrectTab && matchesSearch;
    });
  }, [state.members, search, activeTab]);

  const paginatedMembers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredMembers.slice(start, start + itemsPerPage);
  }, [filteredMembers, currentPage]);

  const totalPages = Math.ceil(filteredMembers.length / itemsPerPage);

  const pendingTopUps = useMemo(() => {
    return (state.memberLogs || []).filter(l => l.status === 'PENDING' && l.type === 'TOPUP');
  }, [state.memberLogs]);

  const exportMemberHistoryToExcel = (member: Member, history: any[]) => {
    const headers = ['Waktu', 'Tipe Aktivitas', 'Keterangan', 'Nominal (Rp)', 'Status'];
    const rows = history.map(item => [
      new Date(item.timestamp).toLocaleString('id-ID'),
      item.type,
      item.description,
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

  const memberUnifiedHistory = useMemo(() => {
    if (!selectedMember) return [];
    const purchases = (state.transactions || [])
      .filter(t => t.memberId === selectedMember.id)
      .map(t => ({
        id: t.id,
        timestamp: t.timestamp,
        type: 'PURCHASE',
        description: t.items.map(i => i.name).join(', '),
        amount: -t.total,
        method: t.paymentMethod,
        status: 'APPROVED'
      }));
    const logs = (state.memberLogs || [])
      .filter(l => l.memberId === selectedMember.id)
      .map(l => ({
        id: `LOG-${l.id}`,
        timestamp: l.timestamp,
        type: l.type === 'TOPUP' ? 'TOPUP' : 'USAGE',
        description: l.notes,
        amount: l.type === 'TOPUP' ? l.amount : -l.amount,
        method: 'DEPOSIT',
        status: l.status
      }));
    return [...purchases, ...logs].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [state.transactions, state.memberLogs, selectedMember]);

  const handleToggleSuspend = async (member: Member) => {
    if (!isAdmin) {
      alert("Hanya Admin yang dapat mengubah status Suspend.");
      return;
    }
    const newStatus = member.status === 'SUSPENDED' ? 'APPROVED' : 'SUSPENDED';
    if (!confirm(`Ubah status member ${member.name} menjadi ${newStatus}?`)) return;
    try {
      await apiService.saveMember({ ...member, status: newStatus });
      await onRefreshData();
    } catch (e: any) { alert(e.message); }
  };

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setIsUploading(true);
        const url = await apiService.uploadFile(file);
        setTopUpProof(url);
      } catch (err: any) {
        alert("Gagal upload bukti: " + err.message);
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleApproveTopUp = async (logId: number) => {
    if (!isAdmin) return;
    if (!confirm("Konfirmasi penerimaan dana dan tambahkan saldo member?")) return;
    try {
      await apiService.request('/approve_topup.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId }),
      });
      await onRefreshData();
    } catch (e: any) { alert(e.message); }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedBarcode = (formData.barcode || '').trim();
    if (trimmedBarcode) {
      // 1. Check against Products
      const productConflict = (state.products || []).find(p => 
        (p.barcode && p.barcode.trim().toLowerCase() === trimmedBarcode.toLowerCase()) ||
        p.sku.trim().toLowerCase() === trimmedBarcode.toLowerCase() ||
        p.id.trim().toLowerCase() === trimmedBarcode.toLowerCase()
      );
      if (productConflict) {
        alert(`Gagal: Barcode/ID Member "${trimmedBarcode}" sudah digunakan oleh produk "${productConflict.name}". Barcode member dan barcode produk harus berbeda!`);
        return;
      }

      // 2. Check against other Members
      const memberConflict = (state.members || []).find(m => 
        m.id !== selectedMember?.id &&
        ((m.barcode && m.barcode.trim().toLowerCase() === trimmedBarcode.toLowerCase()) ||
         m.id.trim().toLowerCase() === trimmedBarcode.toLowerCase())
      );
      if (memberConflict) {
        alert(`Gagal: Barcode/ID Member "${trimmedBarcode}" sudah digunakan oleh member lain (${memberConflict.name}).`);
        return;
      }
    }

    setShowSaveConfirmModal(true);
  };

  const executeSaveMember = async () => {
    if (isSavingMember) return;
    setIsSavingMember(true);
    try {
      const memberData: Member = {
        ...(formData as Member),
        id: selectedMember ? selectedMember.id : `MEM-${Date.now()}`,
        registrationDate: selectedMember ? selectedMember.registrationDate : new Date().toISOString(),
        depositBalance: selectedMember ? selectedMember.depositBalance : (formData.depositBalance || 0),
        status: selectedMember ? selectedMember.status : 'APPROVED'
      };
      await onSaveMember(memberData);
      setShowSaveConfirmModal(false);
      setIsModalOpen(false);
    } catch (err: any) {
      alert("Gagal menyimpan data member: " + err.message);
    } finally {
      setIsSavingMember(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-3">
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-4">
             <span className="p-3 bg-honey-600 text-white rounded-2xl shadow-xl shadow-honey-100"><i className="fas fa-id-card"></i></span>
             Management Membership & Deposit
          </h1>
          <div className="flex flex-wrap gap-2">
             <button onClick={() => setActiveTab('approved')} className={`px-5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${activeTab === 'approved' ? 'bg-honey-600 border-honey-600 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-400 hover:border-honey-200'}`}>Member Aktif</button>
             <button onClick={() => setActiveTab('pending')} className={`px-5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all relative ${activeTab === 'pending' ? 'bg-amber-500 border-amber-500 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-400 hover:border-amber-200'}`}>
                Persetujuan Member
                {state.members.filter(m => m.status === 'PENDING').length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-600 text-white text-[7px] flex items-center justify-center rounded-full animate-pulse font-black border border-white">{state.members.filter(m => m.status === 'PENDING').length}</span>}
             </button>
             {isAdmin && (
               <button onClick={() => setActiveTab('topup_approval')} className={`px-5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all relative ${activeTab === 'topup_approval' ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-400 hover:border-emerald-200'}`}>
                  Persetujuan Top Up
                  {pendingTopUps.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-600 text-white text-[7px] flex items-center justify-center rounded-full animate-pulse font-black border border-white">{pendingTopUps.length}</span>}
               </button>
             )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              setTermsModalTab('terms');
              setShowTermsModal(true);
            }}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-slate-200 flex items-center gap-2 transition-all"
          >
            <i className="fas fa-file-contract text-honey-600"></i> Syarat & Ketentuan Legal
          </button>
          <button onClick={() => { 
            setSelectedMember(null); 
            setFormData({
              name: '', whatsapp: '', email: '', address: '', password: '', depositBalance: 0, image: '',
              barcode: generateNewMemberBarcode()
            }); 
            setIsModalOpen(true); 
          }} className="bg-honey-600 hover:bg-honey-700 text-white px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-honey-100 flex items-center gap-2 active:scale-95 transition-all">
            <i className="fas fa-user-plus"></i> Tambah Member
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
        {activeTab === 'topup_approval' ? (
          <div className="p-8">
             <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-6">Antrian Verifikasi Dana Top Up</h3>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {pendingTopUps.map(log => {
                 const member = state.members.find(m => m.id === log.memberId);
                 return (
                   <div key={log.id} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex flex-col gap-4">
                      <div className="flex justify-between items-start">
                         <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Dari Member:</p>
                            <p className="font-black text-slate-900 text-sm uppercase">{member?.name || 'Unknown'}</p>
                            <p className="text-[9px] text-slate-500">{new Date(log.timestamp).toLocaleString()}</p>
                         </div>
                         <div className="text-right">
                            <p className="text-xl font-black text-emerald-600 leading-none mb-1">Rp {Number(log.amount).toLocaleString()}</p>
                            <p className="text-[8px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full inline-block uppercase">Pending</p>
                         </div>
                      </div>
                      <div className="flex-1 min-h-[100px] bg-white rounded-2xl border border-slate-200 overflow-hidden flex items-center justify-center">
                         {log.proof_image ? <img src={log.proof_image} className="w-full h-full object-cover" /> : <p className="text-[10px] text-slate-300 font-black italic">Tanpa Bukti Gambar</p>}
                      </div>
                      <button onClick={() => handleApproveTopUp(log.id)} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-100">Approve & Tambah Saldo</button>
                   </div>
                 );
               })}
               {pendingTopUps.length === 0 && <div className="col-span-2 py-20 text-center text-slate-300 font-black uppercase text-xs">Belum ada antrian top up.</div>}
             </div>
          </div>
        ) : (
          <>
            <div className="p-8 border-b border-slate-100 bg-slate-50/40">
              <div className="relative group max-w-2xl">
                 <span className="absolute inset-y-0 left-0 pl-6 flex items-center text-slate-400 group-focus-within:text-honey-600 transition-colors"><Icons.Search /></span>
                 <input type="text" placeholder="Cari Nama atau WhatsApp Member..." className="w-full pl-14 pr-8 py-3.5 rounded-2xl border border-transparent outline-none focus:bg-white focus:ring-4 focus:ring-honey-500/10 font-bold transition-all bg-white shadow-inner" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[10px] uppercase font-black text-slate-400 tracking-[0.2em]">
                  <tr>
                    <th className="px-8 py-6">Identitas & Kontak</th>
                    <th className="px-8 py-6">Status Akun</th>
                    <th className="px-8 py-6 text-right">Saldo Deposit</th>
                    <th className="px-8 py-6 text-center">Tindakan Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedMembers.map(m => (
                    <tr key={m.id} className="hover:bg-slate-50/80 transition-all group">
                      <td className="px-8 py-6">
                         <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-honey-50 border border-honey-100 flex items-center justify-center text-honey-600 font-black text-xs uppercase shadow-sm">
                               {m.name.slice(0, 2)}
                            </div>
                            <div className="min-w-0">
                               <p className="font-black text-slate-900 text-sm leading-none mb-1 uppercase truncate">{m.name}</p>
                               <p className="text-[10px] text-slate-400 font-bold">{m.whatsapp}</p>
                            </div>
                         </div>
                      </td>
                      <td className="px-8 py-6">
                         <span className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${
                           m.status === 'SUSPENDED' ? 'bg-red-100 text-red-600 font-bold' : 
                           m.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-600 font-bold' : 'bg-yellow-100 text-yellow-700 font-bold'
                         }`}>
                           {m.status}
                         </span>
                      </td>
                      <td className="px-8 py-6 text-right">
                         <p className="text-sm font-black text-honey-600 leading-none mb-1">Rp {Number(m.depositBalance).toLocaleString('id-ID')}</p>
                         {m.status !== 'PENDING' && (
                           <button onClick={() => { setSelectedMember(m); setTopUpAmount(0); setTopUpProof(undefined); setIsTopUpModalOpen(true); }} className="text-[8px] font-black text-emerald-600 uppercase tracking-widest hover:bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">Top Up</button>
                         )}
                      </td>
                      <td className="px-8 py-6 text-center">
                         <div className="flex justify-center gap-2">
                            {m.status === 'PENDING' ? (
                               <button onClick={async() => { await apiService.approveMember(m.id); onRefreshData(); }} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest">Verify & Approve</button>
                            ) : (
                               <>
                                 <button onClick={() => { setSelectedMember(m); setIsHistoryModalOpen(true); }} className="p-2.5 text-slate-400 hover:text-honey-600 hover:bg-honey-50 rounded-xl border border-slate-100" title="History"><i className="fas fa-history"></i></button>
                                 <button onClick={() => { setCardMember(m); setIsCardModalOpen(true); }} className="p-2.5 text-slate-400 hover:text-honey-600 hover:bg-honey-50 rounded-xl border border-slate-100" title="Cetak Kartu Member ID"><i className="fas fa-id-card text-honey-600"></i></button>
                                 
                                 {isAdmin && (
                                   <button onClick={() => handleToggleSuspend(m)} className={`p-2.5 rounded-xl border transition-all ${m.status === 'SUSPENDED' ? 'text-emerald-600 border-emerald-100 bg-emerald-50' : 'text-amber-600 border-amber-100 bg-amber-50'}`} title={m.status === 'SUSPENDED' ? 'Aktifkan' : 'Suspend'}>
                                      <i className={m.status === 'SUSPENDED' ? 'fas fa-user-check' : 'fas fa-user-slash'}></i>
                                   </button>
                                 )}
                                 
                                 <button onClick={() => { setSelectedMember(m); setFormData({...m}); setIsModalOpen(true); }} className="p-2.5 text-slate-400 hover:text-honey-600 hover:bg-honey-50 rounded-xl border border-slate-100" title="Edit"><i className="fas fa-edit"></i></button>
                                 <button onClick={() => onOpenChat(m.id)} className="p-2.5 text-slate-400 hover:text-honey-600 hover:bg-honey-50 rounded-xl border border-slate-100" title="Kirim Pesan (Chat)"><i className="fas fa-comments text-honey-500 shadow-sm"></i></button>
                               </>
                            )}
                         </div>
                      </td>
                    </tr>
                  ))}
                  {paginatedMembers.length === 0 && <tr><td colSpan={4} className="p-32 text-center text-slate-300 font-black uppercase text-xs tracking-[0.2em]">Data Tidak Ditemukan</td></tr>}
                </tbody>
              </table>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="p-4 bg-slate-50 border-t flex items-center justify-between">
                  <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 text-[9px] font-black uppercase bg-white border rounded-xl disabled:opacity-30 hover:bg-slate-50 transition-all shadow-sm"
                  >
                    Prev
                  </button>
                  <div className="flex gap-1 overflow-x-auto max-w-[200px] no-scrollbar">
                     {[...Array(totalPages)].map((_, i) => (
                       <button 
                         key={i} 
                         onClick={() => setCurrentPage(i + 1)}
                         className={`w-8 h-8 rounded-lg text-[9px] font-black transition-all ${currentPage === i + 1 ? 'bg-honey-600 text-white shadow-md' : 'bg-white border text-slate-400 hover:bg-slate-50'}`}
                       >
                         {i + 1}
                       </button>
                     ))}
                  </div>
                  <button 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 text-[9px] font-black uppercase bg-white border rounded-xl disabled:opacity-30 hover:bg-slate-50 transition-all shadow-sm"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-slate-100">
              {paginatedMembers.map(m => (
                <div key={m.id} className="p-4 flex flex-col gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-honey-50 border border-honey-100 flex items-center justify-center text-honey-600 font-black text-xs uppercase shadow-sm">
                      {m.name.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-900 text-sm uppercase truncate">{m.name}</p>
                      <p className="text-[10px] text-slate-400 font-bold">{m.whatsapp}</p>
                      <div className="mt-1">
                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                          m.status === 'SUSPENDED' ? 'bg-red-100 text-red-600' : 
                          m.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-600' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {m.status}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-honey-600">Rp {Number(m.depositBalance).toLocaleString('id-ID')}</p>
                      {m.status !== 'PENDING' && (
                        <button onClick={() => { setSelectedMember(m); setTopUpAmount(0); setTopUpProof(undefined); setIsTopUpModalOpen(true); }} className="text-[8px] font-black text-emerald-600 uppercase mt-1">Top Up</button>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {m.status === 'PENDING' ? (
                      <button onClick={async() => { await apiService.approveMember(m.id); onRefreshData(); }} className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest">Approve</button>
                    ) : (
                      <>
                        <button onClick={() => { setCardMember(m); setIsCardModalOpen(true); }} className="flex-1 py-2 bg-honey-600 text-white rounded-xl font-black text-[9px] uppercase tracking-wider shadow-sm flex items-center justify-center gap-1">
                          <i className="fas fa-id-card text-[10px]"></i> Kartu
                        </button>
                        <button onClick={() => { setSelectedMember(m); setIsHistoryModalOpen(true); }} className="flex-1 py-2 bg-slate-50 text-slate-600 rounded-xl font-black text-[9px] uppercase border border-slate-200">History</button>
                        <button onClick={() => { setSelectedMember(m); setFormData({...m}); setIsModalOpen(true); }} className="flex-1 py-2 bg-honey-50 text-honey-600 rounded-xl font-black text-[9px] uppercase border border-honey-200">Edit</button>
                        {isAdmin && (
                          <button onClick={() => handleToggleSuspend(m)} className={`flex-1 py-2 rounded-xl font-black text-[9px] uppercase border ${m.status === 'SUSPENDED' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                            {m.status === 'SUSPENDED' ? 'Aktif' : 'Suspend'}
                          </button>
                        )}
                        <button onClick={() => onOpenChat(m.id)} className="flex-1 py-2 bg-emerald-50 text-emerald-700 rounded-xl font-black text-[9px] uppercase border border-emerald-200">Chat</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {filteredMembers.length === 0 && <div className="p-10 text-center text-slate-300 font-black uppercase text-[10px]">Data Tidak Ditemukan</div>}
            </div>
          </>
        )}
      </div>

      {/* Modal Top Up - Dengan Upload Bukti */}
      {isTopUpModalOpen && selectedMember && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[200] flex items-center justify-center p-4">
           <div className="bg-white rounded-[2rem] md:rounded-[3rem] p-6 md:p-10 max-w-sm w-full animate-in zoom-in duration-300 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <h3 className="text-lg md:text-xl font-black text-slate-900 mb-1 md:mb-2 uppercase tracking-tight">Pengajuan Top Up</h3>
              <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 md:mb-6 leading-none">{selectedMember.name}</p>
              
              <div className="space-y-5 overflow-y-auto custom-scrollbar flex-1 pr-2">
                 <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest">Nominal Saldo (Rp)</label>
                    <input type="number" placeholder="0" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-2xl text-honey-600 outline-none focus:ring-4 focus:ring-honey-500/10 shadow-inner" value={topUpAmount} onChange={e => setTopUpAmount(Number(e.target.value))} />
                 </div>
                 
                 <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest">Bukti Transfer (Upload)</label>
                    <div onClick={() => fileInputRef.current?.click()} className="mt-1 w-full aspect-video bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center overflow-hidden cursor-pointer hover:bg-honey-50 hover:border-honey-300 transition-all">
                       {topUpProof ? <img src={topUpProof} className="w-full h-full object-cover" /> : <div className="text-center text-slate-300"><i className="fas fa-cloud-upload-alt text-2xl mb-1"></i><p className="text-[8px] font-black uppercase">Klik Untuk Ambil Gambar Bukti</p></div>}
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleProofUpload} className="hidden" />
                 </div>
                 
                 <div className="p-4 bg-yellow-50 rounded-2xl border border-yellow-200">
                    <p className="text-[9px] font-black text-yellow-800 uppercase tracking-widest leading-relaxed text-center">
                       {isAdmin ? 'ADMIN: Saldo langsung bertambah.' : 'STAFF/MEMBER: Perlu persetujuan Admin.'}
                    </p>
                 </div>
              </div>
              
              <div className="flex gap-4 pt-6 border-t mt-4 shrink-0">
                 <button onClick={() => setIsTopUpModalOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-500">Batal</button>
                 <button onClick={async () => { await onTopUp(selectedMember.id, topUpAmount, topUpProof); setIsTopUpModalOpen(false); }} className="flex-1 py-4 bg-honey-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl shadow-honey-100">Kirim Ajuan</button>
              </div>
           </div>
        </div>
      )}

      {/* Modal Riwayat - Timeline Tetap Ada Meskipun Suspend */}
      {isHistoryModalOpen && selectedMember && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[120] flex items-center justify-center p-4">
           <div className="bg-white rounded-[2rem] md:rounded-[3rem] p-6 md:p-10 max-w-4xl w-full animate-in zoom-in duration-300 shadow-2xl flex flex-col max-h-[85vh]">
              <div className="flex justify-between items-center mb-6 md:mb-8">
                 <h3 className="text-lg md:text-xl font-black text-slate-900 uppercase tracking-tight">Riwayat Aktivitas Member</h3>
                 <div className="flex items-center gap-3">
                     <button 
                       onClick={() => exportMemberHistoryToExcel(selectedMember!, memberUnifiedHistory)}
                       className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-emerald-100"
                     >
                       <i className="fas fa-file-excel"></i> Export Excel
                     </button>
                     <button onClick={() => setIsHistoryModalOpen(false)} className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-xl md:rounded-2xl transition-all"><i className="fas fa-times"></i></button>
                  </div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                 <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[10px] uppercase font-black text-slate-400 border-b">
                       <tr><th className="px-8 py-4">Waktu</th><th className="px-8 py-4">Keterangan</th><th className="px-8 py-4 text-right">Nominal</th><th className="px-8 py-4 text-center">Status</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {memberUnifiedHistory.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                             <td className="px-8 py-5 text-[10px] font-bold text-slate-500">{new Date(item.timestamp).toLocaleString()}</td>
                             <td className="px-8 py-5">
                                <p className="text-[11px] font-black text-slate-800 uppercase">{item.type}</p>
                                <p className="text-[10px] text-slate-400 italic line-clamp-1">{item.description}</p>
                             </td>
                             <td className={`px-8 py-5 text-right font-black text-sm ${item.amount > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {item.amount > 0 ? '+' : ''} Rp {Number(Math.abs(item.amount)).toLocaleString('id-ID')}
                             </td>
                             <td className="px-8 py-5 text-center">
                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${item.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' : 'bg-emerald-100 text-emerald-600'}`}>
                                   {item.status || 'APPROVED'}
                                </span>
                             </td>
                          </tr>
                       ))}
                       {memberUnifiedHistory.length === 0 && <tr><td colSpan={4} className="py-20 text-center text-slate-200 font-black uppercase text-xs tracking-widest">Belum ada riwayat tercatat.</td></tr>}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}

      {/* Modal Add/Edit Member */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[150] flex items-center justify-center p-4">
           <div className="bg-white rounded-[3rem] p-10 max-w-lg w-full animate-in zoom-in duration-300 shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar">
              <h3 className="text-xl font-black text-slate-900 mb-8 uppercase tracking-tight">{selectedMember ? 'Update Profil Member' : 'Pendaftaran Member Baru'}</h3>
              <form onSubmit={handleSubmit} className="space-y-5">
                 
                 {/* Upload Foto Member */}
                 <div className="space-y-1.5 flex flex-col items-center">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest self-start ml-2">Foto Member (Kartu Member)</label>
                    <div 
                      onClick={() => profilePhotoInputRef.current?.click()} 
                      className="w-24 h-24 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:bg-honey-50 hover:border-honey-300 transition-all overflow-hidden relative shadow-inner group"
                    >
                       {formData.image ? (
                          <img src={formData.image} className="w-full h-full object-cover" alt="Member Photo" />
                       ) : (
                          <div className="text-center p-2 text-slate-300 group-hover:text-honey-500">
                             <i className="fas fa-camera text-2xl mb-1"></i>
                             <p className="text-[8px] font-black uppercase tracking-wider">Foto Profil</p>
                          </div>
                       )}
                    </div>
                    <input type="file" ref={profilePhotoInputRef} className="hidden" accept="image/*" onChange={handleProfilePhotoChange} />
                 </div>

                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Nama Lengkap</label>
                    <input required className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none text-sm shadow-inner" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                 </div>

                 {/* Barcode / No. Kartu Member Field */}
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Barcode / No. Kartu Member</label>
                    <div className="flex gap-2">
                       <input 
                         placeholder="Contoh: MBR-10023 / Barcode Kartu" 
                         className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-sm font-bold outline-none shadow-inner" 
                         value={formData.barcode || ''} 
                         onChange={e => setFormData({...formData, barcode: e.target.value})} 
                       />
                       <button 
                         type="button" 
                         onClick={handleAutoGenerateBarcodeClick} 
                         className="px-4 py-4 bg-slate-800 text-white rounded-2xl font-black text-[10px] uppercase hover:bg-black transition-all shadow-md flex items-center gap-1.5"
                         title="Generate Barcode Otomatis"
                       >
                          <i className="fas fa-magic"></i> Auto
                       </button>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">WhatsApp</label>
                      <input required className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none text-sm shadow-inner" value={formData.whatsapp} onChange={e => setFormData({...formData, whatsapp: e.target.value})} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Email Akun</label>
                      <input required type="email" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none text-sm shadow-inner" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                    </div>
                 </div>

                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Alamat Domisili</label>
                    <textarea className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none text-sm shadow-inner h-20 resize-none" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                 </div>

                 {!selectedMember && (
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Password Default</label>
                       <div className="relative">
                          <input required type={showPassword ? "text" : "password"} placeholder="Minimal 6 karakter" className="w-full p-4 pr-12 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none text-sm shadow-inner" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 px-1 py-1">
                             <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                          </button>
                       </div>
                    </div>
                 )}

                 <div className="flex gap-4 mt-8 pt-6 border-t">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 bg-slate-100 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-500">Batal</button>
                    <button type="submit" className="flex-1 py-4 bg-honey-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-honey-100">Simpan Member</button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {/* Barcode Regeneration Warning Modal */}
      {showBarcodeConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[220] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 border border-rose-100 text-center relative">
            <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto text-2xl shadow-inner">
              <i className="fas fa-exclamation-triangle"></i>
            </div>
            
            <div className="space-y-1.5">
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Ganti Barcode Member?</h3>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Member ini sudah memiliki kode barcode: <span className="font-mono font-bold text-yellow-800 bg-yellow-50 px-2 py-0.5 rounded border border-yellow-200">{formData.barcode}</span>. 
                Jika Anda membuat barcode baru, kode barcode lama akan terhapus dan tidak berlaku lagi di kartu fisik.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowBarcodeConfirmModal(false)}
                className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmGenerateNewBarcode}
                className="py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black text-[10px] uppercase tracking-wider shadow-lg shadow-amber-600/20 active:scale-95 transition-all"
              >
                Ya, Buat Barcode Baru
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Member Card Modal */}
      <MemberCardModal 
        isOpen={isCardModalOpen} 
        onClose={() => setIsCardModalOpen(false)} 
        member={cardMember} 
        settings={state.settings} 
      />

      {/* Legal Document Modal */}
      <TermsPrivacyModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        defaultTab={termsModalTab}
      />

      {/* Pop-up Save Member Confirmation Modal */}
      <RegistrationConfirmModal
        isOpen={showSaveConfirmModal}
        onClose={() => setShowSaveConfirmModal(false)}
        onConfirm={executeSaveMember}
        onOpenTermsModal={() => {
          setTermsModalTab('terms');
          setShowTermsModal(true);
        }}
        data={{
          name: formData.name || '',
          whatsapp: formData.whatsapp || '',
          email: formData.email || '',
          address: formData.address || '',
          barcode: formData.barcode || ''
        }}
        isLoading={isSavingMember}
      />
    </div>
  );
};

export default Membership;
