import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, User, UserRole } from '../types';
import apiService from '../services/apiService';
import { notifyUser, requestNotificationPermission } from '../services/notificationService';

export const DEFAULT_SETTINGS = {
  name: 'BeeSmart Store',
  address: 'Jl. Raya Ciangsana Km.07 Gunung Putri, Bogor',
  phone: '0881-0257-23947',
  footer: 'Terima Kasih Atas Kunjungan Anda',
  autoPrint: true,
  printerType: '58mm' as const,
  isOpen: true,
};

interface NotifiedIds {
  proposals: string[];
  orders: string[];
  messages: string[];
  orderStatuses: { [orderId: string]: string };
}

const EMPTY_NOTIFIED: NotifiedIds = { proposals: [], orders: [], messages: [], orderStatuses: {} };

const CACHE_KEYS = {
  products: 'beesmart_cached_products',
  categories: 'beesmart_cached_categories',
  settings: 'beesmart_cached_settings',
  members: 'beesmart_cached_members',
  orders: 'beesmart_cached_orders',
} as const;

function readNotified(userId: string): NotifiedIds {
  try {
    return {
      proposals: JSON.parse(localStorage.getItem(`notified_proposals_${userId}`) || '[]'),
      orders: JSON.parse(localStorage.getItem(`notified_orders_${userId}`) || '[]'),
      messages: JSON.parse(localStorage.getItem(`notified_messages_${userId}`) || '[]'),
      orderStatuses: JSON.parse(localStorage.getItem(`notified_statuses_${userId}`) || '{}'),
    };
  } catch (e) {
    console.error('Error reading notifications storage:', e);
    return { ...EMPTY_NOTIFIED };
  }
}

function persistNotified(userId: string, ids: NotifiedIds): void {
  localStorage.setItem(`notified_proposals_${userId}`, JSON.stringify(ids.proposals));
  localStorage.setItem(`notified_orders_${userId}`, JSON.stringify(ids.orders));
  localStorage.setItem(`notified_messages_${userId}`, JSON.stringify(ids.messages));
  localStorage.setItem(`notified_statuses_${userId}`, JSON.stringify(ids.orderStatuses));
}

/**
 * Satu-satunya tempat untuk: hidrasi cache, fetch berkala, sinkronisasi saat tab
 * aktif, dan notifikasi. Komponen hanya mengonsumsi state + refreshData/login/logout.
 */
export function useAppData() {
  const [state, setState] = useState<AppState>({
    currentUser: null,
    products: [],
    categories: [],
    members: [],
    familyChildren: [],
    transactions: [],
    memberLogs: [],
    stockAdjustments: [],
    orders: [],
    expenses: [],
    productProposals: [],
    messages: [],
    users: [],
    chat_contacts: [],
    shipping_rates: [],
    settings: DEFAULT_SETTINGS,
    isLoading: true,
  });

  const notifiedIdsRef = useRef<NotifiedIds>({ ...EMPTY_NOTIFIED });
  const isFirstLoadRef = useRef(true);
  const isFetchingRef = useRef(false);
  const currentUserRef = useRef<User | null>(null);

  useEffect(() => {
    currentUserRef.current = state.currentUser;
  }, [state.currentUser]);

  useEffect(() => {
    if (!state.currentUser) return;
    notifiedIdsRef.current = readNotified(state.currentUser.id);
  }, [state.currentUser]);

  const refreshData = useCallback(async (role?: string, userId?: string) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const activeRole = role || currentUserRef.current?.role;
      const activeId = userId || currentUserRef.current?.id;
      const data = await apiService.getAppData(activeRole, activeId);

      try {
        localStorage.setItem(CACHE_KEYS.products, JSON.stringify(data.products || []));
        localStorage.setItem(CACHE_KEYS.categories, JSON.stringify(data.categories || []));
        localStorage.setItem(CACHE_KEYS.settings, JSON.stringify(data.settings || {}));
        localStorage.setItem(CACHE_KEYS.members, JSON.stringify(data.members || []));
        localStorage.setItem(CACHE_KEYS.orders, JSON.stringify(data.orders || []));
      } catch (err) {
        // Cache opsional; gagal localStorage tidak boleh menggagal fetch.
      }

      setState(prev => {
        const profile = data.user_profile || data.member_profile;
        const updatedUser = profile ? { ...(prev.currentUser as User), ...profile } : prev.currentUser;
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
          shipping_rates: data.shipping_rates || [],
        };
      });
    } catch (e) {
      console.error('Refresh Error:', e);
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const initApp = async () => {
      try {
        requestNotificationPermission();

        const savedUserStr = localStorage.getItem('beesmart_user');
        const savedUser: User | null = savedUserStr ? JSON.parse(savedUserStr) : null;

        // Migrasi keamanan: tanpa token API, sesi lama tidak valid.
        if (savedUser && !localStorage.getItem('beesmart_token')) {
          localStorage.removeItem('beesmart_user');
          setState(prev => ({ ...prev, currentUser: null, isLoading: false }));
          return;
        }

        try {
          const cached = (key: string) => {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
          };
          if (savedUser) {
            setState(prev => ({
              ...prev,
              currentUser: savedUser,
              products: cached(CACHE_KEYS.products) || prev.products,
              categories: cached(CACHE_KEYS.categories) || prev.categories,
              members: cached(CACHE_KEYS.members) || prev.members,
              orders: cached(CACHE_KEYS.orders) || prev.orders,
              settings: cached(CACHE_KEYS.settings)
                ? { ...DEFAULT_SETTINGS, ...cached(CACHE_KEYS.settings) }
                : prev.settings,
              isLoading: false,
            }));
          }
        } catch (err) {
          console.warn('Cache hydration skipped:', err);
        }

        await refreshData(savedUser?.role, savedUser?.id);
        setState(prev => ({ ...prev, currentUser: savedUser, isLoading: false }));
      } catch (e) {
        console.error('Init App Error:', e);
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };
    void initApp();

    const interval = window.setInterval(() => {
      const curUser = currentUserRef.current;
      const isInputActive = document.querySelector('input:focus, textarea:focus, select:focus, [role="dialog"]');
      if (curUser && !isInputActive) {
        void refreshData(curUser.role, curUser.id);
      }
    }, 45000);

    const handleVisibilitySync = () => {
      if (document.visibilityState === 'visible') {
        const curUser = currentUserRef.current;
        if (curUser) void refreshData(curUser.role, curUser.id);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilitySync);
    window.addEventListener('focus', handleVisibilitySync);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilitySync);
      window.removeEventListener('focus', handleVisibilitySync);
    };
  }, [refreshData]);

  useEffect(() => {
    if (!state.currentUser || state.isLoading) return;
    const user = state.currentUser;
    const userId = user.id;
    const isMember = user.role === UserRole.MEMBER;

    const ids = notifiedIdsRef.current;
    let { proposals, orders, messages, orderStatuses } = ids;
    let updated = false;

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
      persistNotified(userId, { proposals, orders, messages, orderStatuses });
      return;
    }

    if (!isMember) {
      state.productProposals.forEach(p => {
        const idStr = `PROP-${p.id}`;
        if (p.status === 'PENDING' && !proposals.includes(idStr)) {
          notifyUser('Pengajuan Perubahan Produk', `Staf ${p.staffId} mengajukan perubahan untuk produk: ${p.data.name || 'Produk'}`);
          proposals.push(idStr);
          updated = true;
        }
      });
      state.stockAdjustments.forEach(s => {
        const idStr = `ADJ-${s.id}`;
        if (s.status === 'PENDING' && !proposals.includes(idStr)) {
          notifyUser('Laporan Penyesuaian Stok', `Staf ${s.staffId} mengajukan penyesuaian stok baru.`);
          proposals.push(idStr);
          updated = true;
        }
      });
      state.transactions.forEach(t => {
        if (t.id.startsWith('ORD-') && t.orderStatus === 'PENDING' && !orders.includes(t.id)) {
          notifyUser('Pesanan Baru Masuk!', `Pesanan #${t.id.slice(-6)} dari ${t.customerName || 'Member'} menunggu persetujuan.`);
          orders.push(t.id);
          orderStatuses[t.id] = 'PENDING';
          updated = true;
        }
      });
    }

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
          if ((m.receiverId === userId || m.receiverId === cleanMyId) && m.senderId !== userId) {
            shouldNotifyChat = true;
          } else if (m.receiverId === 'TENANT_ROOM' && m.senderId !== userId && user.role !== UserRole.VISITOR) {
            shouldNotifyChat = true;
          } else if (m.receiverId === 'INTERNAL' && m.senderId !== userId && user.role !== UserRole.TENANT) {
            shouldNotifyChat = true;
          } else if (m.receiverId === 'ADMIN' && m.senderRole === 'MEMBER' && (user.role === UserRole.ADMIN || user.role === UserRole.STAFF)) {
            shouldNotifyChat = true;
          }
        }
        if (shouldNotifyChat) notifyUser(`Pesan Baru dari ${m.senderName}`, m.message);
      }
    });

    if (isMember) {
      state.transactions.forEach(t => {
        if (t.id.startsWith('ORD-') && t.memberId === userId) {
          const prevStatus = orderStatuses[t.id];
          const currentStatus = t.orderStatus || 'PENDING';
          if (prevStatus && prevStatus !== currentStatus) {
            notifyUser('Update Status Pesanan', `Pesanan #${t.id.slice(-6)} Anda diupdate menjadi: ${currentStatus}`);
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
      persistNotified(userId, { proposals, orders, messages, orderStatuses });
    }
  }, [state.productProposals, state.stockAdjustments, state.transactions, state.messages, state.currentUser, state.isLoading]);

  const login = useCallback((user: User) => {
    localStorage.setItem('beesmart_user', JSON.stringify(user));
    setState(prev => ({ ...prev, currentUser: user }));
    void refreshData(user.role, user.id);
  }, [refreshData]);

  const logout = useCallback(() => {
    apiService.setToken('');
    localStorage.removeItem('beesmart_user');
    setState(prev => ({ ...prev, currentUser: null, familyChildren: [] }));
  }, []);

  return { state, setState, refreshData, login, logout };
}

export default useAppData;
