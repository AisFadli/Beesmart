
import React, { useState } from 'react';
import { User, UserRole, Member } from '../types';
import { Icons } from '../constants';
import apiService from '../services/apiService';
import { TermsPrivacyModal } from './TermsPrivacyModal';
import { RegistrationConfirmModal } from './RegistrationConfirmModal';

interface AuthProps {
  onLogin: (user: User) => void;
}

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [view, setView] = useState<'login' | 'register' | 'forgot_password' | 'reset_password'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Password reset states
  const [resetToken, setResetToken] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');

  // Form Registrasi
  const [regData, setRegData] = useState({ name: '', whatsapp: '', address: '', email: '', password: '' });
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Legal & Confirmation Modal States
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsModalTab, setTermsModalTab] = useState<'terms' | 'privacy'>('terms');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Show/Hide Password States
  const [showPassword, setShowPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset_token');
    if (token) {
      setResetToken(token);
      setView('reset_password');
    }
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const data: any = await apiService.login({ email, password });
      const userId = data.id || data.user_id;
      let rawRole = (data.role?.toString().toUpperCase() || 'STAFF');
      if (rawRole === 'USER') rawRole = 'STAFF';
      
      const normalizedUser: User = {
        id: userId.toString(),
        email: data.email,
        role: rawRole as UserRole,
        name: data.name || 'User Minimart'
      };
      onLogin(normalizedUser);
    } catch (err: any) {
      setError(err.message || "Gagal autentikasi.");
    } finally { setIsLoading(false); }
  };

  const handleRegisterFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptedTerms) {
      setError("Anda wajib menyetujui Syarat & Ketentuan serta Kebijakan Privasi untuk mendaftar sebagai Member.");
      return;
    }
    setError(null);
    setShowConfirmModal(true);
  };

  const executeRegister = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const newMember: Member = {
        id: `MEM-${Date.now()}`,
        ...regData,
        registrationDate: new Date().toISOString(),
        depositBalance: 0,
        status: 'APPROVED'
      };
      await apiService.saveMember(newMember);
      setShowConfirmModal(false);
      setSuccess("Pendaftaran berhasil! Akun Anda telah aktif & salinan Syarat & Ketentuan telah dikirim ke email " + regData.email + ". Silakan login.");
      setRegData({ name: '', whatsapp: '', address: '', email: '', password: '' });
      setAcceptedTerms(false);
      setTimeout(() => {
        setSuccess(null);
        setView('login');
      }, 4000);
    } catch (err: any) {
      setError(err.message || "Gagal mendaftar.");
    } finally { 
      setIsLoading(false); 
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await apiService.requestPasswordReset(forgotEmail);
      setSuccess("Link konfirmasi perubahan password telah dikirim ke email " + forgotEmail + ".");
      setForgotEmail('');
    } catch (err: any) {
      setError(err.message || "Gagal mengirim link reset password.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await apiService.resetPassword(resetToken, resetPassword, resetConfirmPassword);
      setSuccess("Password berhasil diubah secara aman & terhashing! Mengarahkan ke login...");
      setResetPassword('');
      setResetConfirmPassword('');
      setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete('reset_token');
        window.history.replaceState({}, '', url.pathname + url.search);
        setView('login');
        setSuccess(null);
      }, 3000);
    } catch (err: any) {
      setError(err.message || "Gagal mengubah password.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl overflow-hidden">
        <div className="p-10">
          <div className="text-center mb-10">
             <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl text-white text-3xl mb-4 shadow-xl shadow-blue-900/40 transform -rotate-6">
                <Icons.POS />
             </div>
             <h2 className="text-2xl font-black text-slate-900">MinimartPro ERP</h2>
             <p className="text-slate-400 mt-1 text-[9px] font-black uppercase tracking-[0.2em]">Sistem Manajemen Cerdas</p>
          </div>

          {error && <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-[10px] font-black text-center border border-red-100 mb-5">{error}</div>}
          {success && <div className="bg-emerald-50 text-emerald-600 p-4 rounded-2xl text-[10px] font-black text-center border border-emerald-100 mb-5">{success}</div>}

          {view === 'login' && (
            <form onSubmit={handleSignIn} className="space-y-5">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Email / Username</label>
                <input type="text" required value={email} onChange={(e) => setEmail(e.target.value)} className="block w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm" placeholder="admin@minimart.com" />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Password</label>
                  <button type="button" onClick={() => setView('forgot_password')} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600 transition-colors">Lupa Password?</button>
                </div>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} className="block w-full px-5 py-4 pr-14 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm" placeholder="••••••••" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 px-1 py-1">
                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>

              <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl transition-all active:scale-95 text-[10px] uppercase tracking-widest">
                {isLoading ? 'Loading...' : 'Masuk Dashboard'}
              </button>

              <div className="text-center mt-6">
                <button type="button" onClick={() => setView('register')} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600 transition-colors">Belum punya akun? Daftar Member</button>
              </div>
            </form>
          )}

          {view === 'register' && (
            <form onSubmit={handleRegisterFormSubmit} className="space-y-4">
               <h3 className="text-center font-black text-slate-800 text-xs uppercase mb-6">Pendaftaran Member Baru</h3>
               <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Nama Lengkap</label>
                  <input required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-xs" value={regData.name} onChange={e => setRegData({...regData, name: e.target.value})} />
               </div>
               <div className="grid grid-cols-2 gap-3">
                  <div>
                     <label className="text-[9px] font-black text-slate-400 uppercase ml-1">No WhatsApp</label>
                     <input required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-xs" value={regData.whatsapp} onChange={e => setRegData({...regData, whatsapp: e.target.value})} />
                  </div>
                  <div>
                     <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Email</label>
                     <input required type="email" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-xs" value={regData.email} onChange={e => setRegData({...regData, email: e.target.value})} />
                  </div>
               </div>
               <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Alamat</label>
                  <textarea className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-xs" rows={2} value={regData.address} onChange={e => setRegData({...regData, address: e.target.value})} />
               </div>
               <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Password Akun</label>
                  <div className="relative">
                     <input required type={showRegPassword ? "text" : "password"} placeholder="Minimal 6 karakter" className="w-full px-4 py-3 pr-10 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-xs" value={regData.password} onChange={e => setRegData({...regData, password: e.target.value})} />
                     <button type="button" onClick={() => setShowRegPassword(!showRegPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 px-1 py-1">
                        <i className={`fas ${showRegPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                     </button>
                  </div>
               </div>

               {/* Checkbox Syarat & Ketentuan & Kebijakan Privasi */}
               <div className="pt-2">
                 <label className="flex items-start gap-2.5 cursor-pointer group">
                   <input
                     type="checkbox"
                     required
                     checked={acceptedTerms}
                     onChange={(e) => setAcceptedTerms(e.target.checked)}
                     className="mt-0.5 w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                   />
                   <span className="text-[10px] text-slate-600 font-medium leading-relaxed group-hover:text-slate-900 transition-colors">
                     Saya menyetujui{' '}
                     <button
                       type="button"
                       onClick={() => {
                         setTermsModalTab('terms');
                         setShowTermsModal(true);
                       }}
                       className="font-bold text-blue-600 hover:underline"
                     >
                       Syarat & Ketentuan
                     </button>{' '}
                     serta{' '}
                     <button
                       type="button"
                       onClick={() => {
                         setTermsModalTab('privacy');
                         setShowTermsModal(true);
                       }}
                       className="font-bold text-emerald-600 hover:underline"
                     >
                       Kebijakan Privasi
                     </button>{' '}
                     penggunaan data pribadi untuk pendaftaran member Koperasi Syariah AIS.
                   </span>
                 </label>
               </div>

               <button type="submit" disabled={isLoading} className="w-full bg-emerald-600 text-white font-black py-4 rounded-2xl shadow-xl transition-all active:scale-95 text-[10px] uppercase tracking-widest mt-2">
                 Kirim Pendaftaran
               </button>
               <button type="button" onClick={() => setView('login')} className="w-full text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">
                 Kembali ke Login
               </button>
            </form>
          )}

          {view === 'forgot_password' && (
            <form onSubmit={handleRequestReset} className="space-y-5">
              <h3 className="text-center font-black text-slate-800 text-xs uppercase mb-4">Lupa Password</h3>
              <p className="text-xs text-slate-500 text-center leading-relaxed mb-6 font-semibold uppercase">
                Masukkan email Anda yang terdaftar untuk menerima link konfirmasi reset password.
              </p>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Email Anda</label>
                <input type="email" required value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} className="block w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm" placeholder="member@email.com" />
              </div>

              <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl transition-all active:scale-95 text-[10px] uppercase tracking-widest">
                {isLoading ? 'Mengirim...' : 'Kirim Link Konfirmasi'}
              </button>

              <button type="button" onClick={() => setView('login')} className="w-full text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Kembali ke Login</button>
            </form>
          )}

          {view === 'reset_password' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <h3 className="text-center font-black text-slate-800 text-xs uppercase mb-4">Reset Password Baru</h3>
              <p className="text-xs text-slate-500 text-center leading-relaxed mb-6 font-semibold uppercase">
                Silakan masukkan password baru Anda dan konfirmasikan di bawah ini.
              </p>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Password Baru</label>
                <div className="relative">
                  <input required type={showResetPassword ? "text" : "password"} placeholder="Minimal 6 karakter" className="w-full px-4 py-3 pr-10 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-xs" value={resetPassword} onChange={e => setResetPassword(e.target.value)} />
                  <button type="button" onClick={() => setShowResetPassword(!showResetPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 px-1 py-1">
                    <i className={`fas ${showResetPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Konfirmasi Password Baru</label>
                <div className="relative">
                  <input required type={showConfirmPassword ? "text" : "password"} placeholder="Sama dengan password baru" className="w-full px-4 py-3 pr-10 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-xs" value={resetConfirmPassword} onChange={e => setResetConfirmPassword(e.target.value)} />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 px-1 py-1">
                    <i className={`fas ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>

              <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl transition-all active:scale-95 text-[10px] uppercase tracking-widest">
                {isLoading ? 'Menyimpan...' : 'Konfirmasi & Hash Password'}
              </button>
            </form>
          )}

          {/* Footer Legal Terms Link */}
          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={() => {
                setTermsModalTab('terms');
                setShowTermsModal(true);
              }}
              className="text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-1.5 mx-auto"
            >
              <i className="fas fa-balance-scale"></i>
              Syarat & Ketentuan & Kebijakan Privasi Data
            </button>
          </div>
        </div>
      </div>

      {/* Legal Document Modal */}
      <TermsPrivacyModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        defaultTab={termsModalTab}
        showAcceptButton={view === 'register'}
        onAccept={() => setAcceptedTerms(true)}
      />

      {/* Pop-up Registration Confirmation Modal */}
      <RegistrationConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={executeRegister}
        onOpenTermsModal={() => {
          setTermsModalTab('terms');
          setShowTermsModal(true);
        }}
        data={{
          name: regData.name,
          whatsapp: regData.whatsapp,
          email: regData.email,
          address: regData.address
        }}
        isLoading={isLoading}
      />
    </div>
  );
};

export default Auth;
