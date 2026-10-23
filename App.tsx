import React, { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { User, Product, Category, Transaction, AppState, StoreSettings, Order, Member, UserRole, StockAdjustment } from './types';
import Sidebar from './components/Sidebar';
import Auth from './components/Auth';
import apiService from './services/apiService';

const DEFAULT_SETTINGS: StoreSettings = {
  name: "BeeSmart Store", address: "Jl. Raya Ciangsana Km.07 Gunung Putri, Bogor", phone: "0881-0257-23947",
  footer: "Terima Kasih Atas Kunjungan Anda", autoPrint: true, printerType: '58mm',
  isOpen: true
};

import { DashboardSkeleton, Skeleton } from './components/LoadingSkeleton';

const Dashboard = lazy(() => import('./components/Dashboard'));
const MemberDashboard = lazy(() => import('./components/MemberDashboard'));
const Inventory = lazy(() => import('./components/Inventory'));
const POS = lazy(() => import('./components/POS'));
const Reports = lazy(() => import('./components/Reports'));
const OperationalReport = lazy(() => import('./components/OperationalReport'));
const Orders = lazy(() => import('./components/Orders'));
const Settings = lazy(() => import('./components/Settings'));
const UserManagement = lazy(() => import('./components/UserManagement'));
const Membership = lazy(() => import('./components/Membership'));
const ChatInterface = lazy(() => import('./components/ChatInterface'));
const AdminServicesManagement = lazy(() => import('./components/AdminServicesManagement').then(m => ({ default: m.AdminServicesManagement })));
const MemberServicesView = lazy(() => import('./components/MemberServicesView').then(m => ({ default: m.MemberServicesView })));

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    currentUser: null, products: [], categories: [], members: [], familyChildren: [], transactions: [], memberLogs: [], stockAdjustments: [], orders: [], expenses: [], productProposals: [], messages: [], users: [], chat_contacts: [], settings: DEFAULT_SETTINGS, isLoading: true
  });
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedFamilyMemberId, setSelectedFamilyMemberId] = useState('FAMILY');
  const [auditProductId, setAuditProductId] = useState('');
  const [preSelectedMemberId, setPreSelectedMemberId] = useState('');
  const [memberActionRequest, setMemberActionRequest] = useState<{ id: number; action: 'CARD' | 'EDIT_PROFILE' | 'TOP_UP' | 'TERMS' } | null>(null);
  const memberActionIdRef = useRef(0);

  const notifiedIdsRef = useRef<{
    proposals: string[];
    orders: string[];
    messages: string[];
    orderStatuses: { [orderId: string]: string };
  }>({
    proposals: [],
    orders: [],
    messages: [],
    orderStatuses: {}
  });

  const isFirstLoadRef = useRef(true);
  const isFetchingRef = useRef(false);
  const currentUserRef = useRef<User | null>(null);

  useEffect(() => {
    currentUserRef.current = state.currentUser;
  }, [state.currentUser]);

  useEffect(() => {
    if (!state.currentUser) return;
    const userId = state.currentUser.id;
    try {
      const proposals = JSON.parse(localStorage.getItem(`notified_proposals_${userId}`) || '[]');
      const orders = JSON.parse(localStorage.getItem(`notified_orders_${userId}`) || '[]');
      const messages = JSON.parse(localStorage.getItem(`notified_messages_${userId}`) || '[]');
      const orderStatuses = JSON.parse(localStorage.getItem(`notified_statuses_${userId}`) || '{}');
      notifiedIdsRef.current = { proposals, orders, messages, orderStatuses };
    } catch (e) {
      console.error("Error reading notifications storage:", e);
    }
  }, [state.currentUser]);

  useEffect(() => {
    // Logic for Notifications
    if (!state.currentUser || state.isLoading) return;
    const user = state.currentUser;
    const userId = user.id;
    const role = user.role;
    const isMember = role === UserRole.MEMBER;

    let { proposals, orders, messages, orderStatuses } = notifiedIdsRef.current;
    let updated = false;

    // Helper to send browser notification
    const triggerNotification = (title: string, body: string) => {
      if ("Notification" in window) {
        if (Notification.permission === "granted") {
          new Notification(title, { body, icon: '/app/logo/beesmart-favicon.png' });
        } else if (Notification.permission !== "denied") {
          Notification.requestPermission().then(permission => {
            if (permission === "granted") {
              new Notification(title, { body, icon: '/app/logo/beesmart-favicon.png' });
            }
          });
        }
      }
    };

    // If it's the very first load of data in the session/lifecycle, 
    // mark all existing objects as seen so we don't spam historical notifications.
    if (isFirstLoadRef.current) {
      isFirstLoadRef.current = false;
      
      state.productProposals.forEach(p => {
        const idStr = `PROP-${p.id}`;
        if (!proposals.includes(idStr)) proposals.push(idStr);
      });
      state.stockAdjustments.forEach(s => {
        const idStr = `ADJ-${s.id}`;
        if (!proposals.includes(idStr)) proposals.push(idStr);
      });
      state.transactions.forEach(t => {
        if (t.id.startsWith('ORD-')) {
          if (!orders.includes(t.id)) orders.push(t.id);
          orderStatuses[t.id] = t.orderStatus || 'PENDING';
        }
      });
      state.messages.forEach(m => {
        const idStr = `MSG-${m.id}`;
        if (!messages.includes(idStr)) messages.push(idStr);
      });

      localStorage.setItem(`notified_proposals_${userId}`, JSON.stringify(proposals));
      localStorage.setItem(`notified_orders_${userId}`, JSON.stringify(orders));
      localStorage.setItem(`notified_messages_${userId}`, JSON.stringify(messages));
      localStorage.setItem(`notified_statuses_${userId}`, JSON.stringify(orderStatuses));
      return;
    }

    // 1. PENGAJUAN PERUBAHAN (Product proposals & stock reports - Admin & Staff only)
    if (!isMember) {
      state.productProposals.forEach(p => {
        const idStr = `PROP-${p.id}`;
        if (p.status === 'PENDING' && !proposals.includes(idStr)) {
          triggerNotification(
            "Pengajuan Perubahan Produk",
            `Staf ${p.staffId} mengajukan perubahan untuk produk: ${p.data.name || 'Produk'}`
          );
          proposals.push(idStr);
          updated = true;
        }
      });

      state.stockAdjustments.forEach(s => {
        const idStr = `ADJ-${s.id}`;
        if (s.status === 'PENDING' && !proposals.includes(idStr)) {
          triggerNotification(
            "Laporan Penyesuaian Stok",
            `Staf ${s.staffId} mengajukan penyesuaian stok baru.`
          );
          proposals.push(idStr);
          updated = true;
        }
      });
    }

    // 2. PENGAJUAN ORDER (New orders pending approval - Admin & Staff only)
    if (!isMember) {
      state.transactions.forEach(t => {
        if (t.id.startsWith('ORD-') && t.orderStatus === 'PENDING' && !orders.includes(t.id)) {
          triggerNotification(
            "Pesanan Baru Masuk!",
            `Pesanan #${t.id.slice(-6)} dari ${t.customerName || 'Member'} menunggu persetujuan.`
          );
          orders.push(t.id);
          orderStatuses[t.id] = 'PENDING';
          updated = true;
        }
      });
    }

    // 3. CHAT DARI MEMBER (Real-time incoming message notifications based on role)
    state.messages.forEach(m => {
      const idStr = `MSG-${m.id}`;
      if (!messages.includes(idStr)) {
        messages.push(idStr);
        updated = true;

        let shouldNotifyChat = false;
        const cleanMyId = userId.replace('USER-', '');
        if (isMember) {
          if ((m.receiverId === cleanMyId || m.receiverId === userId) && m.senderRole !== 'MEMBER') {
            shouldNotifyChat = true;
          }
        } else {
          // Direct Personal Chat to this user
          if ((m.receiverId === userId || m.receiverId === cleanMyId) && m.senderId !== userId) {
            shouldNotifyChat = true;
          } else if (m.receiverId === 'TENANT_ROOM' && m.senderId !== userId && state.currentUser?.role !== UserRole.VISITOR) {
            // Room Koordinasi Tenant (Tenant, Staff, Admin)
            shouldNotifyChat = true;
          } else if (m.receiverId === 'INTERNAL' && m.senderId !== userId && state.currentUser?.role !== UserRole.TENANT) {
            // Room Koordinasi Staff (Staff, Admin, Visitor)
            shouldNotifyChat = true;
          } else if (m.receiverId === 'ADMIN' && m.senderRole === 'MEMBER' && (state.currentUser?.role === UserRole.ADMIN || state.currentUser?.role === UserRole.STAFF)) {
            // Message from member to Admin
            shouldNotifyChat = true;
          }
        }

        if (shouldNotifyChat) {
          triggerNotification(
            `Pesan Baru dari ${m.senderName}`,
            m.message
          );
        }
      }
    });

    // 4. UPDATE PESANAN (Status changes - Members only)
    if (isMember) {
      state.transactions.forEach(t => {
        if (t.id.startsWith('ORD-') && t.memberId === userId) {
          const prevStatus = orderStatuses[t.id];
          const currentStatus = t.orderStatus || 'PENDING';

          if (prevStatus && prevStatus !== currentStatus) {
            triggerNotification(
              "Update Status Pesanan",
              `Pesanan #${t.id.slice(-6)} Anda diupdate menjadi: ${currentStatus}`
            );
            orderStatuses[t.id] = currentStatus;
            updated = true;
          } else if (!prevStatus) {
            orderStatuses[t.id] = currentStatus;
            updated = true;
          }
        }
      });
    }

    if (updated) {
      notifiedIdsRef.current = { proposals, orders, messages, orderStatuses };
      localStorage.setItem(`notified_proposals_${userId}`, JSON.stringify(proposals));
      localStorage.setItem(`notified_orders_${userId}`, JSON.stringify(orders));
      localStorage.setItem(`notified_messages_${userId}`, JSON.stringify(messages));
      localStorage.setItem(`notified_statuses_${userId}`, JSON.stringify(orderStatuses));
    }
  }, [state.productProposals, state.stockAdjustments, state.transactions, state.messages, state.currentUser, state.isLoading]);

  const refreshData = async (role?: string, userId?: string) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const activeRole = role || currentUserRef.current?.role;
      const activeId = userId || currentUserRef.current?.id;
      const data = await apiService.getAppData(activeRole, activeId);
      
      // Simpan cache lokal agar saat reload berikutnya aplikasi langsung tampil instan
      try {
        localStorage.setItem('beesmart_cached_products', JSON.stringify(data.products || []));
        localStorage.setItem('beesmart_cached_categories', JSON.stringify(data.categories || []));
        localStorage.setItem('beesmart_cached_settings', JSON.stringify(data.settings || {}));
        localStorage.setItem('beesmart_cached_members', JSON.stringify(data.members || []));
        localStorage.setItem('beesmart_cached_orders', JSON.stringify(data.orders || []));
      } catch (err) {}

      setState(prev => {
        let updatedUser = prev.currentUser;
        if (data.user_profile) {
          updatedUser = { ...prev.currentUser, ...data.user_profile };
        } else if (data.member_profile) {
          updatedUser = { ...prev.currentUser, ...data.member_profile };
        }
        if (updatedUser && prev.currentUser) {
          localStorage.setItem('beesmart_user', JSON.stringify(updatedUser));
        }
        return {
          ...prev, 
          currentUser: updatedUser,
          products: data.products || [], 
          categories: data.categories || [], 
          members: data.members || [],
          familyChildren: data.family_children || [],
          transactions: data.transactions || [],
          memberLogs: data.member_logs || [],
          stockAdjustments: data.stock_adjustments || [],
          orders: data.orders || [], 
          expenses: data.expenses || [],
          productProposals: data.product_proposals || [],
          messages: data.messages || [],
          users: data.users || [],
          chat_contacts: data.chat_contacts || [],
          settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
          // @ts-ignore
          shipping_rates: data.shipping_rates || []
        };
      });
    } catch (e) { 
      console.error("Refresh Error:", e); 
    } finally {
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    const initApp = async () => {
      try {
        // Request Notification Permission
        if ("Notification" in window && Notification.permission === "default") {
          Notification.requestPermission();
        }

        const savedUserStr = localStorage.getItem('beesmart_user');
        const savedUser = savedUserStr ? JSON.parse(savedUserStr) : null;

        // Migrasi keamanan: tanpa token API, sesi lama tidak valid — paksa login ulang
        if (savedUser && !localStorage.getItem('beesmart_token')) {
          localStorage.removeItem('beesmart_user');
          setState(prev => ({ ...prev, currentUser: null, isLoading: false }));
          return;
        }

        // INSTANT CACHE HYDRATION: Tampilkan data dari cache lokal seketika agar tidak ada loading kosong saat reload
        try {
          const cachedProducts = localStorage.getItem('beesmart_cached_products');
          const cachedCategories = localStorage.getItem('beesmart_cached_categories');
          const cachedSettings = localStorage.getItem('beesmart_cached_settings');
          const cachedMembers = localStorage.getItem('beesmart_cached_members');
          const cachedOrders = localStorage.getItem('beesmart_cached_orders');

          if (cachedProducts || cachedCategories) {
            setState(prev => ({
              ...prev,
              currentUser: savedUser,
              products: cachedProducts ? JSON.parse(cachedProducts) : prev.products,
              categories: cachedCategories ? JSON.parse(cachedCategories) : prev.categories,
              members: cachedMembers ? JSON.parse(cachedMembers) : prev.members,
              orders: cachedOrders ? JSON.parse(cachedOrders) : prev.orders,
              settings: cachedSettings ? { ...DEFAULT_SETTINGS, ...JSON.parse(cachedSettings) } : prev.settings,
              isLoading: false
            }));
          }
        } catch (err) {}

        // Fetch fresh data in background
        await refreshData(savedUser?.role, savedUser?.id);
        
        setState(prev => ({ 
          ...prev, 
          currentUser: savedUser, 
          isLoading: false 
        }));
      } catch (e) { 
        setState(prev => ({ ...prev, isLoading: false })); 
      }
    };
    initApp();

    // Auto-refresh data every 20 seconds or when user focuses back on the PWA/app window
    const interval = setInterval(() => {
      const curUser = currentUserRef.current;
      if (curUser) {
        refreshData(curUser.role, curUser.id);
      }
    }, 20000);

    const handleVisibilitySync = () => {
      if (document.visibilityState === 'visible') {
        const curUser = currentUserRef.current;
        if (curUser) {
          refreshData(curUser.role, curUser.id);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilitySync);
    window.addEventListener('focus', handleVisibilitySync);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilitySync);
      window.removeEventListener('focus', handleVisibilitySync);
    };
  }, []);

  const handleSaveMember = async (m: Member) => {
    await apiService.saveMember(m);
    await refreshData();
  };

  const handleTopUp = async (id: string, amount: number, proofImage?: string, method?: string) => {
    try {
      await apiService.request('/members_topup.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, amount, proofImage, method }),
      });
      await refreshData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const addTransaction = async (tx: Transaction) => {
    await apiService.saveTransaction(tx);
    await refreshData();
  };

  if (state.isLoading) return (
    <div className="min-h-screen bg-slate-50 p-10 flex flex-col gap-10">
      <div className="flex justify-between items-center">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-64 rounded-2xl" />
      </div>
      <DashboardSkeleton />
    </div>
  );
  if (!state.currentUser) return (
    <Auth onLogin={u => { 
      localStorage.setItem('beesmart_user', JSON.stringify(u)); 
      setState(prev => ({ ...prev, currentUser: u })); 
      // Refresh data with the new user's role
      refreshData(u.role, u.id);
    }} />
  );

  const isMember = state.currentUser.role === UserRole.MEMBER;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={() => { apiService.setToken(''); localStorage.removeItem('beesmart_user'); setSelectedFamilyMemberId('FAMILY'); setState(prev => ({ ...prev, currentUser: null, familyChildren: [] })); }} user={state.currentUser} familyChildren={state.familyChildren || []} selectedFamilyMemberId={selectedFamilyMemberId} onSelectFamilyMember={setSelectedFamilyMemberId} onMemberAction={action => setMemberActionRequest({ id: ++memberActionIdRef.current, action })} />
      <div className="flex-1 md:ml-64 w-full h-full overflow-hidden flex flex-col relative">
        <main className="flex-1 overflow-y-auto p-3 sm:p-6 md:p-10 pt-20 md:pt-10 custom-scrollbar bg-slate-50">
          <div className="max-w-7xl mx-auto">
            <Suspense fallback={<div className="py-12"><DashboardSkeleton /></div>}>
            {activeTab === 'dashboard' && (isMember ? <MemberDashboard state={state} onRefresh={refreshData} selectedFamilyMemberId={selectedFamilyMemberId} onSelectFamilyMember={setSelectedFamilyMemberId} memberActionRequest={memberActionRequest} onMemberActionHandled={id => setMemberActionRequest(current => current?.id === id ? null : current)} /> : <Dashboard state={state} />)}
            {activeTab === 'discuss' && <ChatInterface state={state} onRefreshData={refreshData} preSelectedMemberId={preSelectedMemberId} />}
            {!isMember && (
               <>
                 {activeTab === 'pos' && <POS products={state.products} members={state.members} onCompleteTransaction={addTransaction} user={state.currentUser} settings={state.settings} />}
                 {activeTab === 'membership' && (state.currentUser.role === UserRole.ADMIN || state.currentUser.role === UserRole.STAFF) && <Membership state={state} onSaveMember={handleSaveMember} onDeleteMember={async id => { /* Delete disabled per request */ }} onTopUp={handleTopUp} onRefreshData={refreshData} onOpenChat={(id) => { setPreSelectedMemberId(id); setActiveTab('discuss'); }} />}
                 {activeTab === 'inventory' && (
                    <Inventory 
                      products={state.products}
                      members={state.members}
                      categories={state.categories}
                      transactions={state.transactions}
                      productProposals={state.productProposals}
                      onRefreshData={refreshData}
                      onSaveProduct={async p => { await apiService.saveProduct(p); refreshData(); }}
                      onDeleteProduct={async id => { await apiService.deleteProduct(id); refreshData(); }}
                      userRole={state.currentUser.role}
                      currentUser={state.currentUser}
                      settings={state.settings}
                      onSaveCategory={async c => { await apiService.saveCategory(c); refreshData(); }}
                      onDeleteCategory={async id => { await apiService.deleteCategory(id); refreshData(); }}
                      onViewAudit={id => { setAuditProductId(id); setActiveTab('orders'); }}
                      onProcessProposal={async (proposalId, status, adminNote) => {
                        try {
                          const idStr = proposalId.toString();
                          if (idStr.startsWith('ADJ-') || (state.stockAdjustments || []).some(a => String(a.id) === idStr)) {
                            // Ini adalah stock adjustment (bisa berupa ID murni atau yang diprefix)
                            const cleanId = idStr.replace('ADJ-', '');
                            const adjObj = (state.stockAdjustments || []).find(a => String(a.id) === cleanId || String(a.id) === idStr);
                            await apiService.request('/audit_action.php', {
                              method: 'POST',
                              body: JSON.stringify({ 
                                action: status === 'APPROVED' ? 'approve_adjustment' : 'cancel', 
                                ref: `ADJ-${cleanId}`,
                                productId: adjObj?.productId || ''
                              })
                            });
                          } else {
                            await apiService.request(status === 'APPROVED' ? '/approve_proposal.php' : '/reject_proposal.php', {
                              method: 'POST',
                              body: JSON.stringify({ id: proposalId, adminNote })
                            });
                          }
                          await refreshData();
                          alert(status === 'APPROVED' ? "Pengajuan disetujui!" : "Pengajuan ditolak!");
                        } catch (e: any) {
                          console.error("Proposal Processing Error:", e);
                          alert("Gagal memproses pengajuan: " + e.message);
                        }
                      }}
                      onProposeProductChange={async (productId, type, productData, reason) => {
                        await apiService.request('/products_proposals.php', {
                          method: 'POST',
                          body: JSON.stringify({ productId, type, productData, staffId: state.currentUser?.name, reason })
                        });
                        refreshData();
                      }}
                    />
                 )}
                 {activeTab === 'orders' && <Orders orders={state.orders} products={state.products} categories={state.categories} transactions={state.transactions} stockAdjustments={state.stockAdjustments} user={state.currentUser} onSaveOrder={async o => { await apiService.saveOrder(o); refreshData(); }} onRefreshData={refreshData} auditProductId={auditProductId} setAuditProductId={setAuditProductId} />}
                 {activeTab === 'operational' && (state.currentUser.role === UserRole.ADMIN || state.currentUser.role === UserRole.STAFF || state.currentUser.role === UserRole.VISITOR) && <OperationalReport state={state} onRefreshData={refreshData} />}
                 {activeTab === 'reports' && <Reports transactions={state.transactions} products={state.products} members={state.members} settings={state.settings} userRole={state.currentUser.role} currentUser={state.currentUser} onDeleteTransaction={async id => { await apiService.deleteTransaction(id); refreshData(); }} onUpdateTransaction={async tx => { await apiService.updateTransaction(tx); refreshData(); }} />}
                 {activeTab === 'users' && <UserManagement categories={state.categories} userRole={state.currentUser.role} currentUser={state.currentUser} />}
                 {activeTab === 'services' && (isMember ? <MemberServicesView user={state.currentUser} onRefreshData={refreshData} /> : <AdminServicesManagement user={state.currentUser} />)}
                 {activeTab === 'settings' && <Settings settings={state.settings} userRole={state.currentUser.role} onSave={async s => { await apiService.saveSettings(s); refreshData(); }} onRefresh={refreshData} shippingRates={(state as any).shipping_rates || []} categories={state.categories} />}
               </>
            )}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
