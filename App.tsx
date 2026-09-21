import React, { useState, useEffect, useRef } from 'react';
import { User, Product, Category, Transaction, AppState, StoreSettings, Order, Member, UserRole, StockAdjustment } from './types';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import MemberDashboard from './components/MemberDashboard';
import Inventory from './components/Inventory';
import POS from './components/POS';
import Reports from './components/Reports';
import OperationalReport from './components/OperationalReport';
import Orders from './components/Orders';
import Auth from './components/Auth';
import Settings from './components/Settings';
import Membership from './components/Membership';
import ChatInterface from './components/ChatInterface';
import apiService from './services/apiService';

const DEFAULT_SETTINGS: StoreSettings = {
  name: "BeeSmart Store", address: "Jl. Raya Ciangsana Km.07 Gunung Putri, Bogor", phone: "0881-0257-23947",
  footer: "Terima Kasih Atas Kunjungan Anda", autoPrint: true, printerType: '58mm',
  isOpen: true
};

import { DashboardSkeleton, Skeleton } from './components/LoadingSkeleton';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    currentUser: null, products: [], categories: [], members: [], transactions: [], memberLogs: [], stockAdjustments: [], orders: [], expenses: [], productProposals: [], messages: [], settings: DEFAULT_SETTINGS, isLoading: true
  });
  const [activeTab, setActiveTab] = useState('dashboard');
  const [auditProductId, setAuditProductId] = useState('');
  const [preSelectedMemberId, setPreSelectedMemberId] = useState('');

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
          transactions: data.transactions || [],
          memberLogs: data.member_logs || [],
          stockAdjustments: data.stock_adjustments || [],
          orders: data.orders || [], 
          expenses: data.expenses || [],
          productProposals: data.product_proposals || [],
          messages: data.messages || [],
          users: data.users || [],
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

        // Load data with the saved user's role immediately
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

    // Auto-refresh data every 30 seconds using latest currentUserRef to prevent stale closure bug
    const interval = setInterval(() => {
      const curUser = currentUserRef.current;
      if (curUser) {
        refreshData(curUser.role, curUser.id);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const handleSaveMember = async (m: Member) => {
    await apiService.saveMember(m);
    await refreshData();
  };

  const handleTopUp = async (id: string, amount: number, proofImage?: string) => {
    try {
      await apiService.request('/members_topup.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, amount, proofImage, userRole: state.currentUser?.role }),
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
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={() => { apiService.setToken(''); localStorage.removeItem('beesmart_user'); setState(prev => ({ ...prev, currentUser: null })); }} user={state.currentUser} />
      <div className="flex-1 md:ml-64 w-full h-full overflow-hidden flex flex-col relative">
        <main className="flex-1 overflow-y-auto p-4 md:p-10 pt-20 md:pt-10 custom-scrollbar bg-slate-50">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'dashboard' && (isMember ? <MemberDashboard state={state} onRefresh={refreshData} /> : <Dashboard state={state} />)}
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
                 {activeTab === 'reports' && <Reports transactions={state.transactions} products={state.products} settings={state.settings} userRole={state.currentUser.role} currentUser={state.currentUser} onDeleteTransaction={async id => { await apiService.deleteTransaction(id); refreshData(); }} onUpdateTransaction={async tx => { await apiService.updateTransaction(tx); refreshData(); }} />}
                 {activeTab === 'settings' && <Settings settings={state.settings} userRole={state.currentUser.role} onSave={async s => { await apiService.saveSettings(s); refreshData(); }} onRefresh={refreshData} shippingRates={(state as any).shipping_rates || []} categories={state.categories} />}
               </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
