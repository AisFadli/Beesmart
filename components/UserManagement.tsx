import React, { useState, useEffect } from 'react';
import { User, Category, UserRole } from '../types';
import apiService from '../services/apiService';

interface UserManagementProps {
  categories?: Category[];
  userRole: UserRole | string;
  currentUser: User;
}

export const UserManagement: React.FC<UserManagementProps> = ({ categories = [], userRole, currentUser }) => {
  const [usersList, setUsersList] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  const [showModal, setShowModal] = useState(false);
  const [userForm, setUserForm] = useState({
    id: '',
    name: '',
    email: '',
    role: 'TENANT' as 'ADMIN' | 'STAFF' | 'TENANT',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
    password: '',
    tenantCategories: [] as string[]
  });

  const rawRole = (userRole || '').toString().toUpperCase();
  const isAdmin = rawRole === 'ADMIN';

  const fetchUsers = async () => {
    if (!isAdmin) return;
    setIsLoading(true);
    try {
      const res = await apiService.request('/users.php');
      if (Array.isArray(res)) {
        setUsersList(res);
      }
    } catch (err) {
      console.error("Gagal mengambil data user:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [isAdmin]);

  const handleOpenAdd = () => {
    setUserForm({
      id: '',
      name: '',
      email: '',
      role: 'TENANT',
      status: 'ACTIVE',
      password: '',
      tenantCategories: []
    });
    setShowModal(true);
  };

  const handleOpenEdit = (u: User) => {
    setUserForm({
      id: u.id,
      name: u.name,
      email: u.email,
      role: (u.role as any) || 'STAFF',
      status: (u.status as any) || 'ACTIVE',
      password: '',
      tenantCategories: u.tenantCategories || []
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.name || !userForm.email) {
      alert("Nama dan Email wajib diisi!");
      return;
    }

    try {
      const payload: any = { ...userForm };
      if (!payload.password && payload.id) {
        delete payload.password;
      }
      await apiService.request('/users.php', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      alert("Data user berhasil disimpan!");
      setShowModal(false);
      fetchUsers();
    } catch (err: any) {
      alert("Gagal menyimpan user: " + (err.message || 'Error'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus user ini?")) return;
    try {
      await apiService.request(`/users.php?id=${id}`, { method: 'DELETE' });
      fetchUsers();
    } catch (err: any) {
      alert(err.message || "Gagal menghapus user");
    }
  };

  const toggleCategoryForTenant = (catName: string) => {
    setUserForm(prev => {
      const exists = prev.tenantCategories.includes(catName);
      const updated = exists 
        ? prev.tenantCategories.filter(c => c !== catName)
        : [...prev.tenantCategories, catName];
      return { ...prev, tenantCategories: updated };
    });
  };

  // Filter & Pagination
  const filteredUsers = usersList.filter(u => 
    (u.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.role || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage) || 1;
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (!isAdmin) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center">
        <div className="bg-rose-50 border border-rose-200 rounded-[2.5rem] p-10 space-y-4 shadow-sm">
          <div className="w-16 h-16 bg-rose-500 text-white rounded-2xl mx-auto flex items-center justify-center text-2xl">
            <i className="fas fa-lock"></i>
          </div>
          <h2 className="text-xl font-black text-rose-900">Akses Terbatas (Khusus Admin)</h2>
          <p className="text-sm font-medium text-rose-600">Menu Manajemen User, Staff & Tenant hanya dapat diakses oleh akun dengan hak akses Administrator.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {/* Header Banner */}
      <div className="bg-white dark:bg-[#111c30] p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-honey-500/10 dark:bg-honey-500/20 text-honey-600 dark:text-honey-400 flex items-center justify-center text-xl shadow-inner">
              <i className="fas fa-users-cog"></i>
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Manajemen User, Staff & Tenant</h1>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Kelola akun akses sistem, staff operasional, dan pembatasan kategori tenant</p>
            </div>
          </div>
        </div>
        <button 
          type="button" 
          onClick={handleOpenAdd} 
          className="bg-honey-600 hover:bg-honey-700 text-white px-6 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-honey-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <i className="fas fa-user-plus text-sm"></i> Tambah User / Tenant
        </button>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white dark:bg-[#111c30] p-4 md:p-6 rounded-[2rem] shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-96">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <i className="fas fa-search"></i>
          </span>
          <input 
            type="text" 
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            placeholder="Cari nama, email, atau role..."
            className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-honey-500"
          />
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <span className="text-xs font-bold text-slate-400">Tampilkan:</span>
          <select 
            value={itemsPerPage} 
            onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
            className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white outline-none"
          >
            <option value={5}>5 baris</option>
            <option value={10}>10 baris</option>
            <option value={20}>20 baris</option>
            <option value={50}>50 baris</option>
          </select>
        </div>
      </div>

      {/* Users Table / Cards Container */}
      <div className="bg-white dark:bg-[#111c30] rounded-[2.5rem] shadow-sm border border-slate-200/80 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/75 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="py-4 px-6">Nama &amp; Email</th>
                <th className="py-4 px-4">Role / Akses</th>
                <th className="py-4 px-4">Status</th>
                <th className="py-4 px-4">Kategori Tenant</th>
                <th className="py-4 px-6 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {paginatedUsers.map(u => (
                <tr key={u.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-4 px-6">
                    <div className="font-black text-slate-900 dark:text-white">{u.name}</div>
                    <div className="text-[11px] font-medium text-slate-400">{u.email}</div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex flex-col gap-1 items-start">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-wider uppercase inline-block ${
                        u.role === 'ADMIN' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' :
                        u.role === 'STAFF' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                        'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                      }`}>
                        {u.role}
                      </span>
                      <span className="bg-sky-500/10 text-sky-500 border border-sky-500/20 px-2 py-0.5 rounded-md text-[9px] font-black tracking-wider uppercase">
                        ROOT: MEMBER
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider inline-block ${
                      (u.status || 'ACTIVE') === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                      {u.status || 'ACTIVE'}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    {u.role === 'TENANT' && u.tenantCategories && u.tenantCategories.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {u.tenantCategories.map((c, i) => (
                          <span key={i} className="bg-honey-50 dark:bg-honey-950/50 text-honey-700 dark:text-honey-400 px-2 py-0.5 rounded-md text-[10px] font-bold border border-honey-200 dark:border-honey-800/40">
                            {c}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600 italic">-</span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        type="button" 
                        onClick={() => handleOpenEdit(u)} 
                        className="w-9 h-9 bg-honey-50 dark:bg-honey-950/40 text-honey-600 dark:text-honey-400 hover:bg-honey-100 rounded-xl flex items-center justify-center transition-all shadow-sm" 
                        title="Edit User"
                      >
                        <i className="fas fa-edit text-xs"></i>
                      </button>
                      {u.role !== 'ADMIN' && (
                        <button 
                          type="button" 
                          onClick={() => handleDelete(u.id)} 
                          className="w-9 h-9 bg-rose-50 dark:bg-rose-950/40 text-rose-500 hover:bg-rose-100 rounded-xl flex items-center justify-center transition-all shadow-sm" 
                          title="Hapus User"
                        >
                          <i className="fas fa-trash text-xs"></i>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400 uppercase tracking-widest italic font-semibold">
                    {isLoading ? 'Memuat data user...' : 'Tidak ada data user yang ditemukan'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 md:p-6 bg-slate-50/50 dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Menampilkan <span className="font-bold text-slate-800 dark:text-white">{filteredUsers.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> sampai <span className="font-bold text-slate-800 dark:text-white">{Math.min(currentPage * itemsPerPage, filteredUsers.length)}</span> dari <span className="font-bold text-slate-800 dark:text-white">{filteredUsers.length}</span> total user
          </div>
          <div className="flex items-center gap-2">
            <button 
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
            >
              <i className="fas fa-chevron-left mr-1"></i> Prev
            </button>
            <div className="px-3 py-1 bg-honey-500 text-white rounded-xl text-xs font-black shadow-sm">
              {currentPage} / {totalPages || 1}
            </div>
            <button 
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
            >
              Next <i className="fas fa-chevron-right ml-1"></i>
            </button>
          </div>
        </div>
      </div>

      {/* Add / Edit User Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111c30] w-full max-w-lg rounded-[2.5rem] p-6 md:p-8 shadow-2xl border border-slate-100 dark:border-slate-800 space-y-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  {userForm.id ? 'Edit User / Tenant' : 'Tambah User / Tenant Baru'}
                </h3>
                <p className="text-xs text-slate-400 font-medium">Atur role dan hak akses kategori untuk Tenant</p>
              </div>
              <button type="button" onClick={() => setShowModal(false)} className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Nama Lengkap / Nama Tenant</label>
                <input 
                  type="text" 
                  required 
                  value={userForm.name} 
                  onChange={e => setUserForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-honey-500" 
                  placeholder="Contoh: Tenant Makanan A / Staff Kasir"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Email Access Login</label>
                <input 
                  type="email" 
                  required 
                  value={userForm.email} 
                  onChange={e => setUserForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-honey-500" 
                  placeholder="email@domain.com"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Role Akun</label>
                  <select 
                    value={userForm.role} 
                    onChange={e => setUserForm(prev => ({ ...prev, role: e.target.value as any }))}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-honey-500"
                  >
                    <option value="TENANT">TENANT (Akses Kategori)</option>
                    <option value="STAFF">STAFF (Kasir/Ops)</option>
                    <option value="ADMIN">ADMIN (Full Access)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status Akun</label>
                  <select 
                    value={userForm.status} 
                    onChange={e => setUserForm(prev => ({ ...prev, status: e.target.value as any }))}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-honey-500"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  Password {userForm.id && '(Kosongkan jika tidak diubah)'}
                </label>
                <input 
                  type="password" 
                  required={!userForm.id}
                  minLength={8}
                  value={userForm.password} 
                  onChange={e => setUserForm(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-honey-500" 
                  placeholder="Min. 8 karakter"
                />
              </div>

              {userForm.role === 'TENANT' && (
                <div className="bg-amber-50 dark:bg-amber-950/30 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/50 space-y-3">
                  <div>
                    <label className="block text-[10px] font-black text-amber-800 dark:text-amber-400 uppercase tracking-widest">
                      <i className="fas fa-store mr-1"></i> Pilih Kategori Produk Managed oleh Tenant Ini:
                    </label>
                    <p className="text-[10px] text-amber-600 dark:text-amber-500">Tenant ini hanya dapat melihat dan mengelola produk dalam kategori yang dicentang di bawah.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-2 bg-white dark:bg-slate-900 rounded-xl border border-amber-100 dark:border-slate-800">
                    {categories.map((cat: Category) => {
                      const isChecked = userForm.tenantCategories.includes(cat.name);
                      return (
                        <label key={cat.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={() => toggleCategoryForTenant(cat.name)}
                            className="w-4 h-4 rounded text-honey-600 focus:ring-honey-500 border-slate-300"
                          />
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{cat.name}</span>
                        </label>
                      );
                    })}
                    {categories.length === 0 && (
                      <p className="text-xs text-slate-400 col-span-2 text-center py-2">Belum ada kategori produk</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">
                  Batal
                </button>
                <button type="submit" className="flex-1 py-3 bg-honey-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-honey-500/20 hover:bg-honey-700 transition-all active:scale-95">
                  Simpan User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
