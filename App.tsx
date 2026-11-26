import React, { lazy, Suspense, useState, useRef } from 'react';
import { Member, Transaction, UserRole } from './types';
import Sidebar from './components/Sidebar';
import Auth from './components/Auth';
import apiService from './services/apiService';
import { useAppData } from './hooks/useAppData';

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
  const { state, refreshData, login, logout } = useAppData();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedFamilyMemberId, setSelectedFamilyMemberId] = useState('FAMILY');
  const [auditProductId, setAuditProductId] = useState('');
  const [preSelectedMemberId, setPreSelectedMemberId] = useState('');
  const [memberActionRequest, setMemberActionRequest] = useState<{ id: number; action: 'CARD' | 'EDIT_PROFILE' | 'TOP_UP' | 'TERMS' } | null>(null);
  const memberActionIdRef = useRef(0);

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
  if (!state.currentUser) return <Auth onLogin={login} />;

  const isMember = state.currentUser.role === UserRole.MEMBER;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={() => { logout(); setSelectedFamilyMemberId('FAMILY'); }} user={state.currentUser} familyChildren={state.familyChildren || []} selectedFamilyMemberId={selectedFamilyMemberId} onSelectFamilyMember={setSelectedFamilyMemberId} onMemberAction={action => setMemberActionRequest({ id: ++memberActionIdRef.current, action })} />
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
                 {activeTab === 'services' && state.currentUser.role !== 'TENANT' && (isMember ? <MemberServicesView user={state.currentUser} familyChildren={state.familyChildren || []} selectedFamilyMemberId={selectedFamilyMemberId} onRefreshData={refreshData} /> : <AdminServicesManagement user={state.currentUser} />)}
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
