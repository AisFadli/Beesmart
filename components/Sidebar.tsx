
import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { Icons } from '../constants';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  user: User;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onLogout, user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const rawRole = (user.role || '').toString().toUpperCase();
  const role = (rawRole === 'ADMIN' ? UserRole.ADMIN : rawRole === 'MEMBER' ? UserRole.MEMBER : rawRole === 'VISITOR' ? UserRole.VISITOR : rawRole === 'TENANT' ? UserRole.TENANT : UserRole.STAFF);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <Icons.Dashboard />, roles: [UserRole.ADMIN, UserRole.STAFF, UserRole.TENANT, UserRole.VISITOR, UserRole.MEMBER] },
    { id: 'discuss', label: 'Diskusi & Pesan', icon: <i className="fas fa-comments"></i>, roles: [UserRole.ADMIN, UserRole.STAFF, UserRole.TENANT, UserRole.MEMBER, UserRole.VISITOR] },
    { id: 'pos', label: 'Cashier (POS)', icon: <Icons.POS />, roles: [UserRole.ADMIN, UserRole.STAFF, UserRole.TENANT] },
    { id: 'membership', label: 'Membership', icon: <i className="fas fa-id-card"></i>, roles: [UserRole.ADMIN, UserRole.STAFF] },
    { id: 'inventory', label: 'Inventory Tenant', icon: <Icons.Inventory />, roles: [UserRole.ADMIN, UserRole.STAFF, UserRole.TENANT] },
    { id: 'orders', label: 'Order Barang', icon: <i className="fas fa-truck-loading"></i>, roles: [UserRole.ADMIN, UserRole.STAFF, UserRole.TENANT] },
    { id: 'operational', label: 'Report Operasional', icon: <i className="fas fa-chart-line"></i>, roles: [UserRole.ADMIN, UserRole.STAFF, UserRole.VISITOR] },
    { id: 'reports', label: 'Reports', icon: <Icons.Reports />, roles: [UserRole.ADMIN, UserRole.STAFF, UserRole.TENANT, UserRole.VISITOR] },
    { id: 'settings', label: 'Settings', icon: <Icons.Settings />, roles: [UserRole.ADMIN, UserRole.STAFF, UserRole.TENANT] },
  ];

  const filteredMenu = menuItems.filter(item => item.roles.includes(role));

  return (
    <>
      {/* Mobile Top Header - Increased height and shadow */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 flex items-center justify-between px-6 z-[60] shadow-2xl border-b border-slate-800">
        <h1 className="text-white font-black text-xl tracking-tighter italic">Minimart<span className="text-blue-500">Pro</span></h1>
        <button onClick={() => setIsOpen(!isOpen)} className="text-white text-2xl p-2 active:scale-90 transition-transform"><i className={isOpen ? 'fas fa-times' : 'fas fa-bars'}></i></button>
      </div>

      <aside className={`fixed left-0 top-0 bottom-0 w-64 bg-slate-900 text-slate-300 transition-transform duration-300 z-[70] shadow-2xl ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="p-6 flex flex-col h-full">
          <div className="mb-10 pt-4 md:pt-0">
            <h1 className="text-white font-black text-2xl flex items-center gap-3 italic">
               <span className="p-2.5 bg-blue-600 rounded-2xl text-white shadow-xl shadow-blue-500/30 not-italic transform -rotate-3"><Icons.POS /></span> 
               MinimartPro
            </h1>
          </div>

          <nav className="space-y-2 flex-1 overflow-y-auto custom-scrollbar pr-2">
            {filteredMenu.map(item => (
              <button key={item.id} onClick={() => { setActiveTab(item.id); setIsOpen(false); }} className={`w-full flex items-center gap-4 px-4 py-4 rounded-[1.25rem] transition-all text-left group ${activeTab === item.id ? 'bg-blue-600 text-white shadow-2xl shadow-blue-600/40 translate-x-1' : 'hover:bg-slate-800/60 text-slate-400'}`}>
                <span className={`text-lg transition-all group-hover:scale-110 ${activeTab === item.id ? 'text-white' : 'text-slate-500'}`}>{item.icon}</span>
                <span className="font-black text-[10px] uppercase tracking-[0.15em]">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-6 border-t border-slate-800 space-y-4">
            {/* Enhanced User Profile Info */}
            <div className="flex items-center gap-4 bg-slate-800/40 p-3 rounded-2xl border border-slate-700/50">
               <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-xs uppercase shadow-lg border border-white/10">
                  {user.name.slice(0,2)}
               </div>
               <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-white truncate leading-none mb-1">{user.name}</p>
                  <p className={`text-[8px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-md inline-block ${role === UserRole.ADMIN ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : role === UserRole.STAFF ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : role === UserRole.TENANT ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
                    {role}
                  </p>
               </div>
            </div>

            <button onClick={onLogout} className="w-full flex items-center gap-4 px-4 py-4 rounded-[1.25rem] text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition-all border border-transparent hover:border-rose-500/20 active:scale-95">
              <span className="text-lg"><Icons.Logout /></span>
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
