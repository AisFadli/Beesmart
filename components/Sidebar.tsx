
import React, { useState } from 'react';
import { User, UserRole, Member } from '../types';
import { Icons } from '../constants';
import { getStoredTheme, toggleTheme } from '../theme';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  user: User;
  familyChildren: Member[];
  selectedFamilyMemberId: string;
  onSelectFamilyMember: (memberId: string) => void;
  onMemberAction: (action: 'CARD' | 'EDIT_PROFILE' | 'TOP_UP' | 'TERMS') => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onLogout, user, familyChildren, selectedFamilyMemberId, onSelectFamilyMember, onMemberAction }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isFamilyPickerOpen, setIsFamilyPickerOpen] = useState(false);
  const [familySearch, setFamilySearch] = useState('');
  const [themeDark, setThemeDark] = useState(getStoredTheme() === 'dark');
  const rawRole = (user.role || '').toString().toUpperCase();
  const role = (rawRole === 'ADMIN' ? UserRole.ADMIN : rawRole === 'MEMBER' ? UserRole.MEMBER : rawRole === 'VISITOR' ? UserRole.VISITOR : rawRole === 'TENANT' ? UserRole.TENANT : UserRole.STAFF);
  const displayName = typeof user.name === 'string' && user.name.trim() ? user.name : 'User';
  const selectedChild = familyChildren.find(child => child.id === selectedFamilyMemberId);
  const visibleChildren = familyChildren.filter(child => child.name.toLowerCase().includes(familySearch.trim().toLowerCase()) || (child.className || '').toLowerCase().includes(familySearch.trim().toLowerCase()) || (child.nisn || child.nis || '').includes(familySearch.trim()));

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <Icons.Dashboard />, roles: [UserRole.ADMIN, UserRole.STAFF, UserRole.TENANT, UserRole.VISITOR, UserRole.MEMBER] },
    { id: 'discuss', label: 'Diskusi & Pesan', icon: <i className="fas fa-comments"></i>, roles: [UserRole.ADMIN, UserRole.STAFF, UserRole.TENANT, UserRole.MEMBER, UserRole.VISITOR] },
    { id: 'pos', label: 'Cashier (POS)', icon: <Icons.POS />, roles: [UserRole.ADMIN, UserRole.STAFF, UserRole.TENANT] },
    { id: 'inventory', label: 'Inventory Tenant', icon: <Icons.Inventory />, roles: [UserRole.ADMIN, UserRole.STAFF, UserRole.TENANT] },
    { id: 'orders', label: 'Order Barang', icon: <i className="fas fa-truck-loading"></i>, roles: [UserRole.ADMIN, UserRole.STAFF, UserRole.TENANT] },
    { id: 'reports', label: 'Reports', icon: <Icons.Reports />, roles: [UserRole.ADMIN, UserRole.STAFF, UserRole.TENANT, UserRole.VISITOR] },
    { id: 'operational', label: 'Report Operasional', icon: <i className="fas fa-chart-line"></i>, roles: [UserRole.ADMIN, UserRole.STAFF, UserRole.VISITOR] },
    { id: 'membership', label: 'Membership', icon: <i className="fas fa-id-card"></i>, roles: [UserRole.ADMIN, UserRole.STAFF] },
    { id: 'services', label: 'Layanan & Tagihan', icon: <i className="fas fa-bus"></i>, roles: [UserRole.ADMIN, UserRole.STAFF, UserRole.MEMBER] },
    { id: 'users', label: 'Manajemen User', icon: <i className="fas fa-users-cog"></i>, roles: [UserRole.ADMIN] },
    { id: 'settings', label: 'Settings', icon: <Icons.Settings />, roles: [UserRole.ADMIN, UserRole.STAFF, UserRole.TENANT] },
  ];

  const filteredMenu = menuItems.filter(item => item.roles.includes(role));

  return (
    <>
      {/* Mobile Top Header - Increased height and shadow */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 dark:bg-[#0d1424] flex items-center justify-between px-6 z-[60] shadow-2xl border-b border-slate-800 dark:border-slate-800">
        <h1 className="text-white dark:text-[#f1f5f9] font-black text-xl tracking-tighter italic flex items-center gap-2">
          <img src="/app/logo/beesmart-logo.png" alt="" className="w-9 h-9 object-contain bg-white dark:bg-slate-200 rounded-lg p-0.5" />
          Bee<span className="text-honey-500">Smart</span>
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setThemeDark(toggleTheme() === 'dark')} className="text-white dark:text-[#f1f5f9] w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 transition-transform" title={themeDark ? 'Mode Terang' : 'Mode Gelap'}>
            <i className={`fas ${themeDark ? 'fa-sun' : 'fa-moon'}`}></i>
          </button>
          <button onClick={() => setIsOpen(!isOpen)} className="text-white dark:text-[#f1f5f9] text-2xl p-2 active:scale-90 transition-transform"><i className={isOpen ? 'fas fa-times' : 'fas fa-bars'}></i></button>
        </div>
      </div>

      <aside className={`fixed left-0 top-0 bottom-0 w-72 sm:w-64 bg-slate-900 dark:bg-[#0d1424] text-slate-300 dark:text-[#b9c4d4] transition-transform duration-300 z-[70] shadow-2xl ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="p-4 sm:p-6 flex flex-col h-full">
          <div className="mb-6 pt-2 md:pt-0 flex items-center justify-between">
            <h1 className="text-white dark:text-[#f1f5f9] font-black text-2xl flex items-center gap-3 italic">
               <img src="/app/logo/beesmart-logo.png" alt="BeeSmart" className="w-11 h-11 object-contain bg-white dark:bg-slate-200 rounded-2xl p-1.5 shadow-xl shadow-honey-500/20 not-italic transform -rotate-3" />
               BeeSmart
            </h1>
            <button onClick={() => setThemeDark(toggleTheme() === 'dark')} className="hidden md:flex w-10 h-10 rounded-2xl items-center justify-center text-lg text-slate-300 hover:bg-slate-800/60 dark:text-[#cbd3e0] dark:hover:bg-slate-100 transition-all active:scale-90" title={themeDark ? 'Mode Terang' : 'Mode Gelap'}>
              <i className={`fas ${themeDark ? 'fa-sun' : 'fa-moon'}`}></i>
            </button>
          </div>

          <nav className="space-y-2 flex-1 overflow-y-auto custom-scrollbar pr-2">
            {role === UserRole.MEMBER && familyChildren.length > 0 && (
              <div className="mb-4 rounded-xl border border-slate-700 bg-slate-800/50 p-3 dark:border-slate-200 dark:bg-slate-100">
                <p className="mb-2 px-1 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Profil keluarga</p>
                <button type="button" aria-expanded={isFamilyPickerOpen} onClick={() => setIsFamilyPickerOpen(open => !open)} className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-700/60 dark:hover:bg-slate-200">
                  <span className="mt-0.5 shrink-0 text-honey-400"><i className="fas fa-users"></i></span>
                  <span className="min-w-0 flex-1">
                    <span className="block whitespace-normal break-words text-sm font-bold leading-snug text-white dark:text-slate-900">{selectedChild?.name || 'Ringkasan Keluarga'}</span>
                    {selectedChild?.className && <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">{selectedChild.className}</span>}
                  </span>
                  <i className={`fas ${isFamilyPickerOpen ? 'fa-chevron-up' : 'fa-chevron-down'} mt-1 shrink-0 text-xs text-slate-400`}></i>
                </button>
                {isFamilyPickerOpen && (
                  <div className="mt-2 border-t border-slate-700 pt-2 dark:border-slate-200">
                    {familyChildren.length > 6 && <input value={familySearch} onChange={event => setFamilySearch(event.target.value)} placeholder="Cari nama, kelas, NIS" className="mb-2 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-honey-500 dark:border-slate-300 dark:bg-white dark:text-slate-900" />}
                    <div className="max-h-64 space-y-1 overflow-y-auto">
                      <button type="button" onClick={() => { onSelectFamilyMember('FAMILY'); setFamilySearch(''); setIsFamilyPickerOpen(false); setIsOpen(false); }} className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold ${selectedFamilyMemberId === 'FAMILY' ? 'bg-honey-600 text-white' : 'text-slate-300 hover:bg-slate-700 dark:text-slate-700 dark:hover:bg-slate-200'}`}>Ringkasan Keluarga</button>
                      {visibleChildren.map(child => (
                        <button key={child.id} type="button" onClick={() => { onSelectFamilyMember(child.id); setFamilySearch(''); setIsFamilyPickerOpen(false); setIsOpen(false); }} className={`w-full rounded-lg px-3 py-2 text-left ${selectedFamilyMemberId === child.id ? 'bg-honey-600 text-white' : 'text-slate-300 hover:bg-slate-700 dark:text-slate-700 dark:hover:bg-slate-200'}`}>
                          <span className="block whitespace-normal break-words text-sm font-semibold leading-snug">{child.name}</span>
                          <span className={`mt-1 block break-all text-xs ${selectedFamilyMemberId === child.id ? 'text-white/75' : 'text-slate-500'}`}>{[child.className, child.nisn || child.nis].filter(Boolean).join(' · ')}</span>
                        </button>
                      ))}
                      {visibleChildren.length === 0 && <p className="px-3 py-4 text-center text-xs text-slate-400">Anak tidak ditemukan</p>}
                    </div>
                  </div>
                )}
              </div>
            )}
            {filteredMenu.map(item => (
              <button key={item.id} onClick={() => { setActiveTab(item.id); setIsOpen(false); }} className={`w-full flex items-center gap-4 px-4 py-4 rounded-[1.25rem] transition-all text-left group ${activeTab === item.id ? 'bg-honey-600 text-white shadow-2xl shadow-honey-600/40 translate-x-1' : 'hover:bg-slate-800/60 dark:hover:bg-slate-100 text-slate-400'}`}>
                <span className={`text-lg transition-all group-hover:scale-110 ${activeTab === item.id ? 'text-white' : 'text-slate-500'}`}>{item.icon}</span>
                <span className="font-black text-[10px] uppercase tracking-[0.15em]">{item.label}</span>
              </button>
            ))}
            {role === UserRole.TENANT && (
              <div className="pt-4 mt-4 border-t border-slate-800 dark:border-slate-100">
                <p className="px-4 mb-2 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Akun Member & Saldo</p>
                <button onClick={() => { onMemberAction('CARD'); setIsOpen(false); }} className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-left text-slate-400 hover:bg-slate-800/60 dark:hover:bg-slate-100 transition-colors">
                  <span className="w-5 text-center text-honey-500"><i className="fas fa-id-card"></i></span>
                  <span className="font-bold text-[10px] uppercase tracking-widest">Kartu Member Digital</span>
                </button>
                <button onClick={() => { onMemberAction('TOP_UP'); setIsOpen(false); }} className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-left text-slate-400 hover:bg-slate-800/60 dark:hover:bg-slate-100 transition-colors">
                  <span className="w-5 text-center text-emerald-500"><i className="fas fa-plus-circle"></i></span>
                  <span className="font-bold text-[10px] uppercase tracking-widest">Top Up Saldo</span>
                </button>
              </div>
            )}
          </nav>

          <div className="mt-auto pt-3 border-t border-slate-800 dark:border-slate-100 space-y-2">
            {/* Enhanced User Profile Info */}
            <div className="flex items-center gap-3 bg-slate-800/40 p-2.5 rounded-2xl border border-slate-700/50 dark:bg-slate-100/40 dark:border-slate-300/30">
               <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-honey-500 to-honey-600 flex items-center justify-center text-white font-black text-xs uppercase shadow-lg border border-white/10 shrink-0">
                  {displayName.slice(0,2)}
               </div>
               <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-white dark:text-slate-900 truncate leading-snug">{displayName}</p>
                  <p className={`text-[8px] font-black uppercase tracking-[0.2em] px-1.5 py-0.5 rounded-md inline-block mt-0.5 ${role === UserRole.ADMIN ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : role === UserRole.STAFF ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : role === UserRole.TENANT ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-honey-500/20 text-honey-400 border border-honey-500/30'}`}>
                    {role}
                  </p>
               </div>
            </div>

            <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition-all border border-transparent hover:border-rose-500/20 active:scale-95">
              <span className="text-base"><Icons.Logout /></span>
              <span className="font-black text-[10px] uppercase tracking-[0.15em]">Sign Out System</span>
            </button>
          </div>
        </div>
      </aside>
      {isOpen && <div className="md:hidden fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[65]" onClick={() => setIsOpen(false)}></div>}
    </>
  );
};

export default Sidebar;
