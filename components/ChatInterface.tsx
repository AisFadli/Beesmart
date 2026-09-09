import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AppState, User, AppMessage, Member, UserRole } from '../types';
import apiService from '../services/apiService';

interface ChatInterfaceProps {
  state: AppState;
  onRefreshData: () => Promise<void>;
  preSelectedMemberId?: string;
}

const matchIds = (id1?: string | number, id2?: string | number) => {
  if (id1 === undefined || id1 === null || id2 === undefined || id2 === null) return false;
  if (id1 === id2) return true;
  const clean1 = id1.toString().replace(/^(USER-|USR-)/i, '').trim().toLowerCase();
  const clean2 = id2.toString().replace(/^(USER-|USR-)/i, '').trim().toLowerCase();
  return clean1 === clean2;
};

// Helper to normalize any user / member ID for consistent Map indexing
const normalizeId = (id?: string | number): string => {
  if (id === undefined || id === null) return '';
  return id.toString().replace(/^(USER-|USR-)/i, '').trim().toLowerCase();
};

// Safe helper to find message from lastMsgMap
const getFromMsgMap = (map: Map<string, AppMessage>, id?: string | number): AppMessage | undefined => {
  if (id === undefined || id === null) return undefined;
  const norm = normalizeId(id);
  if (map.has(norm)) return map.get(norm);
  const raw = id.toString();
  if (map.has(raw)) return map.get(raw);
  for (const [k, v] of map.entries()) {
    if (matchIds(k, id)) return v;
  }
  return undefined;
};

// Safe helper to get unread count
const getFromCountMap = (map: Map<string, number>, id?: string | number): number => {
  if (id === undefined || id === null) return 0;
  const norm = normalizeId(id);
  if (map.has(norm)) return map.get(norm) || 0;
  const raw = id.toString();
  if (map.has(raw)) return map.get(raw) || 0;
  for (const [k, v] of map.entries()) {
    if (matchIds(k, id)) return v;
  }
  return 0;
};

// Safe timestamp parser to avoid NaN in sorting
const safeGetTime = (timeStr?: string): number => {
  if (!timeStr) return 0;
  try {
    const t = new Date(timeStr).getTime();
    return isNaN(t) ? 0 : t;
  } catch (e) {
    return 0;
  }
};

// Safe date formatter for short preview
const formatShortDate = (timeStr?: string): string => {
  if (!timeStr) return '';
  try {
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  } catch (e) {
    return '';
  }
};

type InternalChatTarget = 
  | { type: 'ROOM'; roomId: 'TENANT_ROOM' | 'INTERNAL' }
  | { type: 'USER'; userId: string };

const ChatInterface: React.FC<ChatInterfaceProps> = ({ state, onRefreshData, preSelectedMemberId }) => {
  const currentUser = state.currentUser;
  const rawRole = (currentUser?.role || '').toString().toUpperCase();
  const isMember = rawRole === 'MEMBER';
  const isTenant = rawRole === 'TENANT';
  const isVisitor = rawRole === 'VISITOR';
  const isAdminOrStaff = rawRole === 'ADMIN' || rawRole === 'STAFF';

  // Directory of Internal Users (Admin, Staff, Tenant, Visitor)
  const [internalUsers, setInternalUsers] = useState<User[]>(state.users || []);
  useEffect(() => {
    if (state.users && state.users.length > 0) {
      setInternalUsers(state.users);
    } else if (!isMember) {
      apiService.request('/users.php')
        .then((res: any) => {
          if (Array.isArray(res)) setInternalUsers(res);
        })
        .catch(err => console.error("Gagal mengambil data user internal:", err));
    }
  }, [state.users, isMember]);

  // Main Tabs: 'MEMBERS' (Diskusi Member) or 'INTERNAL' (Koordinasi Internal)
  // Visitor is strictly restricted to 'INTERNAL'
  const [activeMainTab, setActiveMainTab] = useState<'MEMBERS' | 'INTERNAL'>(
    isVisitor ? 'INTERNAL' : (preSelectedMemberId ? 'MEMBERS' : (isMember ? 'MEMBERS' : 'INTERNAL'))
  );

  useEffect(() => {
    if (isVisitor && activeMainTab !== 'INTERNAL') {
      setActiveMainTab('INTERNAL');
    }
  }, [isVisitor, activeMainTab]);
  
  // Selected Member state for 'MEMBERS' tab
  const [selectedMemberId, setSelectedMemberId] = useState<string>(preSelectedMemberId || '');

  // Selected Target for 'INTERNAL' tab
  // Visitor defaults to 'INTERNAL' (Room Staff)
  const [selectedInternal, setSelectedInternal] = useState<InternalChatTarget>(
    isTenant 
      ? { type: 'ROOM', roomId: 'TENANT_ROOM' } 
      : { type: 'ROOM', roomId: 'INTERNAL' }
  );

  // Selected Target for Member (Chat with Admin vs Tenant)
  const [selectedMemberChatTarget, setSelectedMemberChatTarget] = useState<'ADMIN' | string>('ADMIN');

  // Input & search states
  const [messageInput, setMessageInput] = useState('');
  const [searchMemberQuery, setSearchMemberQuery] = useState('');
  const [searchUserQuery, setSearchUserQuery] = useState('');
  const [isSending, setIsSending] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto select preselected member if provided (only if not visitor)
  useEffect(() => {
    if (preSelectedMemberId && !isVisitor) {
      setSelectedMemberId(preSelectedMemberId);
      setActiveMainTab('MEMBERS');
    }
  }, [preSelectedMemberId, isVisitor]);

  // Scroll to bottom on conversation change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages, selectedMemberId, selectedInternal, activeMainTab, selectedMemberChatTarget]);

  // Mark messages as read based on active conversation
  useEffect(() => {
    if (!currentUser) return;

    const handleMarkAsRead = async () => {
      try {
        if (isMember) {
          if (selectedMemberChatTarget === 'ADMIN') {
            const unread = (state.messages || []).filter(
              m => m && matchIds(m.receiverId, currentUser.id) && (m.senderRole === 'ADMIN' || m.senderRole === 'STAFF') && m.isRead === 0
            );
            if (unread.length > 0) {
              await apiService.markMessagesAsRead('ADMIN', currentUser.id);
              onRefreshData();
            }
          } else {
            const unread = (state.messages || []).filter(
              m => m && matchIds(m.receiverId, currentUser.id) && matchIds(m.senderId, selectedMemberChatTarget) && m.isRead === 0
            );
            if (unread.length > 0) {
              await apiService.markMessagesAsRead(selectedMemberChatTarget, currentUser.id);
              onRefreshData();
            }
          }
        } else {
          if (activeMainTab === 'MEMBERS' && selectedMemberId && !isVisitor) {
            const targetReceiver = isTenant ? currentUser.id : 'ADMIN';
            const unread = (state.messages || []).filter(
              m => m && matchIds(m.senderId, selectedMemberId) && 
                   (isTenant ? matchIds(m.receiverId, currentUser.id) : (m.receiverId === 'ADMIN' || matchIds(m.receiverId, currentUser.id))) && 
                   m.isRead === 0
            );
            if (unread.length > 0) {
              await apiService.markMessagesAsRead(selectedMemberId, targetReceiver);
              onRefreshData();
            }
          } else if (activeMainTab === 'INTERNAL') {
            if (selectedInternal.type === 'ROOM') {
              const roomId = selectedInternal.roomId;
              const unread = (state.messages || []).filter(
                m => m && m.receiverId === roomId && !matchIds(m.senderId, currentUser.id) && m.isRead === 0
              );
              if (unread.length > 0) {
                await apiService.markMessagesAsRead('ANY', roomId);
                onRefreshData();
              }
            } else if (selectedInternal.type === 'USER') {
              const unread = (state.messages || []).filter(
                m => m && matchIds(m.senderId, selectedInternal.userId) && matchIds(m.receiverId, currentUser.id) && m.isRead === 0
              );
              if (unread.length > 0) {
                await apiService.markMessagesAsRead(selectedInternal.userId, currentUser.id);
                onRefreshData();
              }
            }
          }
        }
      } catch (e) {
        // silent fail for mark as read
      }
    };

    handleMarkAsRead();
  }, [state.messages, selectedMemberId, selectedInternal, activeMainTab, isMember, isVisitor, selectedMemberChatTarget, currentUser]);

  // Messages in the active conversation
  const activeConversationMessages = useMemo(() => {
    if (!currentUser) return [];

    const safeMessages = Array.isArray(state.messages) ? state.messages : [];

    if (isMember) {
      if (selectedMemberChatTarget === 'ADMIN') {
        return safeMessages.filter(
          m => m && ((matchIds(m.senderId, currentUser.id) && m.receiverId === 'ADMIN') ||
               (matchIds(m.receiverId, currentUser.id) && (m.senderRole === 'ADMIN' || m.senderRole === 'STAFF' || m.senderId === 'ADMIN')))
        );
      } else {
        return safeMessages.filter(
          m => m && ((matchIds(m.senderId, currentUser.id) && matchIds(m.receiverId, selectedMemberChatTarget)) ||
               (matchIds(m.receiverId, currentUser.id) && matchIds(m.senderId, selectedMemberChatTarget)))
        );
      }
    }

    if (activeMainTab === 'MEMBERS') {
      if (isVisitor) return []; // Visitor has NO access to member messages
      if (!selectedMemberId) return [];

      if (isTenant) {
        // TENANT HANYA DAPAT MELIHAT CHAT YANG DIKIRIM OLEH TENANT ITU SENDIRI KEPADA MEMBER & BALASANNYA
        return safeMessages.filter(
          m => m && ((matchIds(m.senderId, currentUser.id) && matchIds(m.receiverId, selectedMemberId)) ||
               (matchIds(m.senderId, selectedMemberId) && matchIds(m.receiverId, currentUser.id)))
        );
      } else {
        // Admin / Staff sees member conversation with cooperative
        return safeMessages.filter(
          m => m && ((matchIds(m.senderId, selectedMemberId) && (m.receiverId === 'ADMIN' || matchIds(m.receiverId, currentUser.id))) ||
               (matchIds(m.receiverId, selectedMemberId) && (m.senderId === 'ADMIN' || m.senderRole === 'ADMIN' || m.senderRole === 'STAFF')))
        );
      }
    }

    if (activeMainTab === 'INTERNAL') {
      if (selectedInternal.type === 'ROOM') {
        if (selectedInternal.roomId === 'TENANT_ROOM') {
          if (isVisitor) return []; // Visitor cannot access Tenant room
          return safeMessages.filter(m => m && m.receiverId === 'TENANT_ROOM');
        } else {
          // Room Koordinasi Staff (Admin, Staff, and Visitor)
          return safeMessages.filter(m => m && m.receiverId === 'INTERNAL');
        }
      } else {
        // Chat Personal 1-on-1 antar User Internal
        return safeMessages.filter(
          m => m && ((matchIds(m.senderId, currentUser.id) && matchIds(m.receiverId, selectedInternal.userId)) ||
               (matchIds(m.senderId, selectedInternal.userId) && matchIds(m.receiverId, currentUser.id)))
        );
      }
    }

    return [];
  }, [state.messages, selectedMemberId, selectedInternal, activeMainTab, isMember, isTenant, isVisitor, selectedMemberChatTarget, currentUser]);

  // List of Members for 'MEMBERS' tab
  const membersListInBox = useMemo(() => {
    if (isMember || isVisitor) return [];

    const lastMsgMap = new Map<string, AppMessage>();
    const unreadCountMap = new Map<string, number>();

    const safeMessages = Array.isArray(state.messages) ? state.messages : [];

    for (const msg of safeMessages) {
      if (!msg) continue;

      if (isTenant) {
        // Tenant only tracks messages between this tenant and the member
        const isFromMemberToMe = msg.senderRole === 'MEMBER' && matchIds(msg.receiverId, currentUser?.id);
        const isFromMeToMember = matchIds(msg.senderId, currentUser?.id) && msg.receiverRole === 'MEMBER';

        if (isFromMemberToMe) {
          const key = normalizeId(msg.senderId);
          const existing = lastMsgMap.get(key);
          if (!existing || safeGetTime(msg.timestamp) >= safeGetTime(existing.timestamp)) {
            lastMsgMap.set(key, msg);
          }
          if (msg.isRead === 0) {
            unreadCountMap.set(key, (unreadCountMap.get(key) || 0) + 1);
          }
        } else if (isFromMeToMember) {
          const key = normalizeId(msg.receiverId);
          const existing = lastMsgMap.get(key);
          if (!existing || safeGetTime(msg.timestamp) >= safeGetTime(existing.timestamp)) {
            lastMsgMap.set(key, msg);
          }
        }
      } else {
        // Admin & Staff tracks member conversations with ADMIN
        const isMemberInvolved = msg.senderRole === 'MEMBER' || msg.receiverRole === 'MEMBER';
        if (!isMemberInvolved) continue;

        const memberId = msg.senderRole === 'MEMBER' ? msg.senderId : msg.receiverId;
        if (!memberId || memberId === 'ADMIN' || memberId === 'INTERNAL' || memberId === 'TENANT_ROOM') {
          continue;
        }

        const key = normalizeId(memberId);
        const existing = lastMsgMap.get(key);
        if (!existing || safeGetTime(msg.timestamp) >= safeGetTime(existing.timestamp)) {
          lastMsgMap.set(key, msg);
        }

        if (msg.senderRole === 'MEMBER' && (msg.receiverId === 'ADMIN' || matchIds(msg.receiverId, currentUser?.id)) && msg.isRead === 0) {
          unreadCountMap.set(key, (unreadCountMap.get(key) || 0) + 1);
        }
      }
    }

    const activeMembers = Array.isArray(state.members) ? state.members.filter(m => m && m.status === 'APPROVED') : [];
    const q = (searchMemberQuery || '').toLowerCase().trim();

    return activeMembers
      .map(m => {
        const lastMsg = getFromMsgMap(lastMsgMap, m.id);
        const unread = getFromCountMap(unreadCountMap, m.id);
        return {
          member: m,
          lastMessage: lastMsg,
          unreadCount: unread,
          hasHistory: !!lastMsg
        };
      })
      .filter(item => {
        if (isTenant && !q && !item.hasHistory) {
          return false;
        }
        if (!q) return true;
        const m = item.member;
        return (m.name || '').toLowerCase().includes(q) || 
               (m.whatsapp && m.whatsapp.includes(q)) || 
               (m.email && m.email.toLowerCase().includes(q)) ||
               (m.id && m.id.toLowerCase().includes(q));
      })
      .sort((a, b) => {
        if (a.unreadCount !== b.unreadCount) {
          return b.unreadCount - a.unreadCount;
        }
        const aTime = safeGetTime(a.lastMessage?.timestamp);
        const bTime = safeGetTime(b.lastMessage?.timestamp);
        return bTime - aTime;
      });
  }, [state.members, state.messages, searchMemberQuery, isMember, isTenant, isVisitor, currentUser]);

  // List of Internal Users for Chat Personal
  const internalUsersList = useMemo(() => {
    if (isMember) return [];

    const lastMsgMap = new Map<string, AppMessage>();
    const unreadCountMap = new Map<string, number>();

    const safeMessages = Array.isArray(state.messages) ? state.messages : [];

    for (const msg of safeMessages) {
      if (!msg) continue;
      if (msg.receiverId === 'INTERNAL' || msg.receiverId === 'TENANT_ROOM' || msg.senderRole === 'MEMBER' || msg.receiverRole === 'MEMBER') {
        continue;
      }
      // Personal 1-on-1 message between currentUser and another user
      if (matchIds(msg.senderId, currentUser?.id) && !matchIds(msg.receiverId, currentUser?.id)) {
        const key = normalizeId(msg.receiverId);
        const existing = lastMsgMap.get(key);
        if (!existing || safeGetTime(msg.timestamp) >= safeGetTime(existing.timestamp)) {
          lastMsgMap.set(key, msg);
        }
      } else if (matchIds(msg.receiverId, currentUser?.id) && !matchIds(msg.senderId, currentUser?.id)) {
        const key = normalizeId(msg.senderId);
        const existing = lastMsgMap.get(key);
        if (!existing || safeGetTime(msg.timestamp) >= safeGetTime(existing.timestamp)) {
          lastMsgMap.set(key, msg);
        }
        if (msg.isRead === 0) {
          unreadCountMap.set(key, (unreadCountMap.get(key) || 0) + 1);
        }
      }
    }

    const q = (searchUserQuery || '').toLowerCase().trim();
    const safeUsers = Array.isArray(internalUsers) ? internalUsers : [];

    return safeUsers
      .filter(u => u && !matchIds(u.id, currentUser?.id))
      .filter(u => {
        // VISITOR HANYA DIBERIKAN AKSES UNTUK CHAT DENGAN ADMIN DAN STAFF
        if (isVisitor) {
          const uRole = (u.role || '').toString().toUpperCase();
          return uRole === 'ADMIN' || uRole === 'STAFF';
        }
        return true;
      })
      .filter(u => {
        if (!q) return true;
        return (u.name || '').toLowerCase().includes(q) || 
               (u.email || '').toLowerCase().includes(q) || 
               (u.role || '').toLowerCase().includes(q);
      })
      .map(u => ({
        user: u,
        lastMessage: getFromMsgMap(lastMsgMap, u.id),
        unreadCount: getFromCountMap(unreadCountMap, u.id)
      }))
      .sort((a, b) => {
        if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
        const aTime = safeGetTime(a.lastMessage?.timestamp);
        const bTime = safeGetTime(b.lastMessage?.timestamp);
        if (aTime || bTime) return bTime - aTime;
        return (a.user.name || '').localeCompare(b.user.name || '');
      });
  }, [internalUsers, state.messages, searchUserQuery, currentUser, isMember, isVisitor]);

  // Unread badge calculations
  const unreadCountTenantRoom = useMemo(() => {
    if (isVisitor) return 0;
    return (state.messages || []).filter(
      m => m && m.receiverId === 'TENANT_ROOM' && !matchIds(m.senderId, currentUser?.id) && m.isRead === 0
    ).length;
  }, [state.messages, currentUser, isVisitor]);

  const unreadCountStaffRoom = useMemo(() => {
    if (isTenant) return 0;
    return (state.messages || []).filter(
      m => m && m.receiverId === 'INTERNAL' && !matchIds(m.senderId, currentUser?.id) && m.isRead === 0
    ).length;
  }, [state.messages, currentUser, isTenant]);

  const unreadCountPersonalTotal = useMemo(() => {
    return (state.messages || []).filter(
      m => m && matchIds(m.receiverId, currentUser?.id) && 
           m.senderRole !== 'MEMBER' && 
           m.receiverId !== 'INTERNAL' && 
           m.receiverId !== 'TENANT_ROOM' && 
           m.isRead === 0
    ).length;
  }, [state.messages, currentUser]);

  const unreadCountMembersTab = useMemo(() => {
    if (isMember || isVisitor) return 0;
    if (isTenant) {
      return (state.messages || []).filter(
        m => m && m.senderRole === 'MEMBER' && matchIds(m.receiverId, currentUser?.id) && m.isRead === 0
      ).length;
    } else {
      return (state.messages || []).filter(
        m => m && m.senderRole === 'MEMBER' && (m.receiverId === 'ADMIN' || matchIds(m.receiverId, currentUser?.id)) && m.isRead === 0
      ).length;
    }
  }, [state.messages, isMember, isTenant, isVisitor, currentUser]);

  const unreadCountInternalTab = (isVisitor ? 0 : unreadCountTenantRoom) + unreadCountStaffRoom + unreadCountPersonalTotal;

  // Member's available chat channels (Admin or Tenants who contacted them)
  const memberContactTenants = useMemo(() => {
    if (!isMember) return [];
    const tenantMap = new Map<string, { id: string; name: string; lastMsg?: AppMessage; unread: number }>();

    const safeMessages = Array.isArray(state.messages) ? state.messages : [];

    for (const msg of safeMessages) {
      if (!msg) continue;

      if (msg.senderRole === 'TENANT' && matchIds(msg.receiverId, currentUser?.id)) {
        const key = normalizeId(msg.senderId);
        const existing = tenantMap.get(key) || { id: msg.senderId, name: msg.senderName || 'Tenant', unread: 0 };
        if (!existing.lastMsg || safeGetTime(msg.timestamp) >= safeGetTime(existing.lastMsg.timestamp)) {
          existing.lastMsg = msg;
        }
        if (msg.senderName && (!existing.name || existing.name === 'Tenant')) {
          existing.name = msg.senderName;
        }
        if (msg.isRead === 0) existing.unread++;
        tenantMap.set(key, existing);
      } else if (msg.receiverRole === 'TENANT' && matchIds(msg.senderId, currentUser?.id)) {
        const key = normalizeId(msg.receiverId);
        const existing = tenantMap.get(key) || { id: msg.receiverId, name: msg.receiverName || 'Tenant', unread: 0 };
        if (!existing.lastMsg || safeGetTime(msg.timestamp) >= safeGetTime(existing.lastMsg.timestamp)) {
          existing.lastMsg = msg;
        }
        if (msg.receiverName && (!existing.name || existing.name === 'Tenant')) {
          existing.name = msg.receiverName;
        }
        tenantMap.set(key, existing);
      }
    }

    return Array.from(tenantMap.values());
  }, [state.messages, currentUser, isMember]);

  // Send message handler
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !currentUser || isSending) return;

    setIsSending(true);
    try {
      if (isMember) {
        const cleanId = currentUser.id.replace('USER-', '');
        if (selectedMemberChatTarget === 'ADMIN') {
          await apiService.sendMessage({
            senderId: cleanId,
            senderRole: 'MEMBER',
            senderName: currentUser.name,
            receiverId: 'ADMIN',
            receiverRole: 'ADMIN',
            receiverName: 'Admin Koperasi',
            message: messageInput.trim()
          });
        } else {
          const tenantInfo = memberContactTenants.find(t => matchIds(t.id, selectedMemberChatTarget));
          await apiService.sendMessage({
            senderId: cleanId,
            senderRole: 'MEMBER',
            senderName: currentUser.name,
            receiverId: selectedMemberChatTarget,
            receiverRole: 'TENANT',
            receiverName: tenantInfo?.name || 'Tenant',
            message: messageInput.trim()
          });
        }
      } else {
        if (activeMainTab === 'MEMBERS') {
          if (isVisitor) {
            alert('Akses tidak diizinkan untuk role Visitor.');
            setIsSending(false);
            return;
          }
          if (!selectedMemberId) {
            alert('Silakan pilih member terlebih dahulu.');
            setIsSending(false);
            return;
          }
          const targetMember = state.members.find(m => matchIds(m.id, selectedMemberId));

          if (isTenant) {
            // Tenant sends directly from Tenant account to Member
            await apiService.sendMessage({
              senderId: currentUser.id,
              senderRole: 'TENANT',
              senderName: currentUser.name,
              receiverId: selectedMemberId,
              receiverRole: 'MEMBER',
              receiverName: targetMember?.name || 'Member',
              message: messageInput.trim()
            });
          } else {
            // Admin / Staff sends to Member
            await apiService.sendMessage({
              senderId: 'ADMIN',
              senderRole: currentUser.role,
              senderName: currentUser.name,
              receiverId: selectedMemberId,
              receiverRole: 'MEMBER',
              receiverName: targetMember?.name || 'Member',
              message: messageInput.trim()
            });
          }
        } else {
          // INTERNAL TAB
          if (selectedInternal.type === 'ROOM') {
            if (selectedInternal.roomId === 'TENANT_ROOM') {
              if (isVisitor) {
                alert('Akses tidak diizinkan untuk Room Tenant.');
                setIsSending(false);
                return;
              }
              // Room Koordinasi Tenant
              await apiService.sendMessage({
                senderId: currentUser.id,
                senderRole: currentUser.role,
                senderName: currentUser.name,
                receiverId: 'TENANT_ROOM',
                receiverRole: 'TENANT_GROUP',
                receiverName: 'Room Koordinasi Tenant',
                message: messageInput.trim()
              });
            } else {
              // Room Koordinasi Staff
              await apiService.sendMessage({
                senderId: currentUser.id,
                senderRole: currentUser.role,
                senderName: currentUser.name,
                receiverId: 'INTERNAL',
                receiverRole: 'STAFF',
                receiverName: 'Komunitas Internal Staff',
                message: messageInput.trim()
              });
            }
          } else {
            // Chat Personal 1-on-1 antar User Internal
            const targetUser = internalUsers.find(u => matchIds(u.id, selectedInternal.userId));
            if (!targetUser) {
              alert('User tujuan tidak ditemukan.');
              setIsSending(false);
              return;
            }
            if (isVisitor) {
              const targetRole = (targetUser.role || '').toString().toUpperCase();
              if (targetRole !== 'ADMIN' && targetRole !== 'STAFF') {
                alert('Role Visitor hanya diizinkan untuk berkomunikasi dengan Admin dan Staff.');
                setIsSending(false);
                return;
              }
            }
            await apiService.sendMessage({
              senderId: currentUser.id,
              senderRole: currentUser.role,
              senderName: currentUser.name,
              receiverId: targetUser.id,
              receiverRole: targetUser.role,
              receiverName: targetUser.name,
              message: messageInput.trim()
            });
          }
        }
      }
      setMessageInput('');
      await onRefreshData();
    } catch (err: any) {
      alert("Gagal mengirim pesan: " + err.message);
    } finally {
      setIsSending(false);
    }
  };

  const formatMessageTime = (timeStr?: string) => {
    if (!timeStr) return '';
    try {
      const d = new Date(timeStr);
      if (isNaN(d.getTime())) return timeStr;
      return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' - ' + d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    } catch (e) {
      return timeStr || '';
    }
  };

  const selectedMemberObj = useMemo(() => {
    return (state.members || []).find(m => matchIds(m.id, selectedMemberId));
  }, [state.members, selectedMemberId]);

  const selectedPersonalUserObj = useMemo(() => {
    if (selectedInternal.type !== 'USER') return null;
    return internalUsers.find(u => matchIds(u.id, selectedInternal.userId));
  }, [internalUsers, selectedInternal]);

  // Render role badge helper
  const renderRoleBadge = (roleStr: string) => {
    const r = (roleStr || '').toUpperCase();
    if (r === 'ADMIN') {
      return <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase bg-rose-50 text-rose-600 border border-rose-200">Admin</span>;
    }
    if (r === 'STAFF') {
      return <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">Staff</span>;
    }
    if (r === 'TENANT') {
      return <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1"><i className="fas fa-store text-[7px]"></i> Tenant</span>;
    }
    if (r === 'VISITOR') {
      return <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1"><i className="fas fa-eye text-[7px]"></i> Visitor</span>;
    }
    return <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">Member</span>;
  };

  return (
    <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm h-[700px] flex flex-col md:flex-row">
      
      {/* LEFT SIDEBAR (MEMBER LIST, INTERNAL ROOMS & PERSONAL CHAT) */}
      {!isMember ? (
        <div className="w-full md:w-84 border-b md:border-r border-slate-200 flex flex-col h-[320px] md:h-full bg-slate-50/50">
          
          {/* TOP CONTROLS & SUB-TABS */}
          <div className="p-4 border-b border-slate-200 space-y-3 bg-white">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <i className="fas fa-comments text-indigo-600 text-sm"></i> Diskusi & Pesan
              </h3>
              {isTenant && (
                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                  Akses Tenant
                </span>
              )}
              {isVisitor && (
                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                  Akses Visitor
                </span>
              )}
            </div>
            
            {/* TABS: DISKUSI MEMBER vs KOORDINASI INTERNAL */}
            {isVisitor ? (
              <div className="bg-slate-100 p-2 rounded-xl flex items-center justify-between shadow-inner">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <i className="fas fa-users-cog text-indigo-600"></i> Koordinasi Internal
                </span>
                <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-200">
                  Admin & Staff
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl">
                <button 
                  type="button"
                  onClick={() => setActiveMainTab('MEMBERS')}
                  className={`py-2 px-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${activeMainTab === 'MEMBERS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <span>Diskusi Member</span>
                  {unreadCountMembersTab > 0 && (
                    <span className="w-4 h-4 rounded-full bg-rose-600 text-white text-[8px] font-black flex items-center justify-center">
                      {unreadCountMembersTab}
                    </span>
                  )}
                </button>
                
                <button 
                  type="button"
                  onClick={() => setActiveMainTab('INTERNAL')}
                  className={`py-2 px-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${activeMainTab === 'INTERNAL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <span>Koordinasi Internal</span>
                  {unreadCountInternalTab > 0 && (
                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[8px] font-black flex items-center justify-center">
                      {unreadCountInternalTab}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* SEARCH INPUT */}
            {activeMainTab === 'MEMBERS' && !isVisitor ? (
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                  <i className="fas fa-search text-xs"></i>
                </span>
                <input 
                  type="text" 
                  placeholder={isTenant ? "Cari member untuk chat..." : "Cari member..."}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 text-xs font-bold border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-inner"
                  value={searchMemberQuery}
                  onChange={e => setSearchMemberQuery(e.target.value)}
                />
              </div>
            ) : (
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                  <i className="fas fa-search text-xs"></i>
                </span>
                <input 
                  type="text" 
                  placeholder={isVisitor ? "Cari staf & admin..." : "Cari staf, admin, tenant..."} 
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 text-xs font-bold border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-inner"
                  value={searchUserQuery}
                  onChange={e => setSearchUserQuery(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* TAB CONTENTS (MEMBERS LIST OR INTERNAL ROOMS & DIRECT CHAT) */}
          <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-100 bg-white md:bg-transparent">
            
            {/* VIEW A: DISKUSI MEMBER */}
            {activeMainTab === 'MEMBERS' && !isVisitor && (
              <div>
                {isTenant && (
                  <div className="px-4 py-2 bg-amber-50/70 border-b border-amber-100 text-[10px] font-bold text-amber-800 flex items-center gap-2">
                    <i className="fas fa-shield-alt text-amber-600"></i>
                    <span>Hanya menampilkan pesan langsung antara Anda dan Member.</span>
                  </div>
                )}

                {membersListInBox.map(({ member, lastMessage, unreadCount }) => (
                  <div 
                    key={member.id}
                    onClick={() => setSelectedMemberId(member.id)}
                    className={`p-3.5 flex items-center gap-3 cursor-pointer hover:bg-white transition-all border-l-4 ${selectedMemberId === member.id ? 'bg-white border-l-indigo-600 shadow-sm' : 'border-l-transparent'}`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 font-black flex items-center justify-center text-xs shrink-0 relative shadow-inner">
                      {member.name.slice(0, 2).toUpperCase()}
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white text-[8px] font-black flex items-center justify-center border border-white animate-pulse">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between items-baseline">
                        <p className="font-black text-slate-800 text-[11px] uppercase truncate">{member.name}</p>
                        {lastMessage && (
                          <span className="text-[7px] font-extrabold text-slate-400 uppercase shrink-0">
                            {formatShortDate(lastMessage.timestamp)}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold truncate mt-0.5">
                        {lastMessage?.message ? lastMessage.message : (isTenant ? 'Mulai chat dengan member...' : 'Mulai diskusi...')}
                      </p>
                    </div>
                  </div>
                ))}

                {membersListInBox.length === 0 && (
                  <div className="p-8 text-center text-slate-400 font-bold text-xs">
                    <i className="fas fa-inbox text-slate-300 text-2xl mb-2 block"></i>
                    {isTenant ? (
                      <div>
                        <p className="font-black uppercase text-[10px] text-slate-600">Belum Ada Chat dengan Member</p>
                        <p className="text-[10px] text-slate-400 mt-1">Ketik nama atau nomor WhatsApp member pada kolom pencarian di atas untuk memulai chat baru.</p>
                      </div>
                    ) : (
                      <p className="font-black uppercase text-[10px]">Tidak ada member ditemukan</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* VIEW B: KOORDINASI INTERNAL */}
            {activeMainTab === 'INTERNAL' && (
              <div className="space-y-3 p-2">
                
                {/* 1. SEKSI ROOM KOORDINASI GRUP */}
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2.5 py-1">
                    Room Koordinasi Grup
                  </p>
                  <div className="space-y-1">
                    
                    {/* ROOM KOORDINASI TENANT (UNTUK TENANT, STAFF, ADMIN - TIDAK UNTUK VISITOR) */}
                    {!isVisitor && (
                      <div 
                        onClick={() => setSelectedInternal({ type: 'ROOM', roomId: 'TENANT_ROOM' })}
                        className={`p-3 rounded-2xl flex items-center gap-3 cursor-pointer transition-all border ${
                          selectedInternal.type === 'ROOM' && selectedInternal.roomId === 'TENANT_ROOM' 
                            ? 'bg-amber-500 text-white border-amber-600 shadow-md shadow-amber-500/20' 
                            : 'bg-white hover:bg-slate-50 border-slate-200/80 text-slate-800'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0 relative ${
                          selectedInternal.type === 'ROOM' && selectedInternal.roomId === 'TENANT_ROOM'
                            ? 'bg-white text-amber-600 shadow-inner'
                            : 'bg-amber-50 border border-amber-200 text-amber-700'
                        }`}>
                          <i className="fas fa-store-alt"></i>
                          {unreadCountTenantRoom > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white text-[8px] font-black flex items-center justify-center border border-white animate-pulse">
                              {unreadCountTenantRoom}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <p className="font-black text-xs uppercase truncate leading-tight">Room Koordinasi Tenant</p>
                          </div>
                          <p className={`text-[9px] font-black uppercase tracking-wider truncate mt-0.5 ${
                            selectedInternal.type === 'ROOM' && selectedInternal.roomId === 'TENANT_ROOM' ? 'text-amber-100' : 'text-slate-400'
                          }`}>
                            Tenant, Staff & Pengurus
                          </p>
                        </div>
                      </div>
                    )}

                    {/* ROOM KOORDINASI STAFF (ADMIN, STAFF, DAN VISITOR) */}
                    {(isAdminOrStaff || isVisitor) && (
                      <div 
                        onClick={() => setSelectedInternal({ type: 'ROOM', roomId: 'INTERNAL' })}
                        className={`p-3 rounded-2xl flex items-center gap-3 cursor-pointer transition-all border ${
                          selectedInternal.type === 'ROOM' && selectedInternal.roomId === 'INTERNAL' 
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-md shadow-emerald-600/20' 
                            : 'bg-white hover:bg-slate-50 border-slate-200/80 text-slate-800'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0 relative ${
                          selectedInternal.type === 'ROOM' && selectedInternal.roomId === 'INTERNAL'
                            ? 'bg-white text-emerald-600 shadow-inner'
                            : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                        }`}>
                          <i className="fas fa-users-cog"></i>
                          {unreadCountStaffRoom > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white text-[8px] font-black flex items-center justify-center border border-white animate-pulse">
                              {unreadCountStaffRoom}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <p className="font-black text-xs uppercase truncate leading-tight">Room Koordinasi Staff</p>
                          </div>
                          <p className={`text-[9px] font-black uppercase tracking-wider truncate mt-0.5 ${
                            selectedInternal.type === 'ROOM' && selectedInternal.roomId === 'INTERNAL' ? 'text-emerald-100' : 'text-slate-400'
                          }`}>
                            {isVisitor ? 'Internal Pengurus, Staff & Visitor' : 'Internal Admin & Staff'}
                          </p>
                        </div>
                      </div>
                    )}

                  </div>
                </div>

                {/* 2. SEKSI CHAT PERSONAL REKAN INTERNAL */}
                <div className="pt-2">
                  <div className="flex items-center justify-between px-2.5 py-1">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      {isVisitor ? 'Chat Personal (Admin & Staff)' : 'Chat Personal Rekan'}
                    </p>
                    <span className="text-[8px] font-black text-slate-400 uppercase">
                      {internalUsersList.length} User
                    </span>
                  </div>

                  <div className="space-y-1 mt-1">
                    {internalUsersList.map(({ user, lastMessage, unreadCount }) => {
                      const isSelected = selectedInternal.type === 'USER' && matchIds(selectedInternal.userId, user.id);
                      return (
                        <div 
                          key={user.id}
                          onClick={() => setSelectedInternal({ type: 'USER', userId: user.id })}
                          className={`p-2.5 rounded-2xl flex items-center gap-3 cursor-pointer transition-all border ${
                            isSelected 
                              ? 'bg-slate-900 text-white border-slate-900 shadow-md' 
                              : 'bg-white hover:bg-slate-50 border-slate-200/80 text-slate-800'
                          }`}
                        >
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0 relative ${
                            user.role === 'ADMIN' ? 'bg-rose-100 text-rose-700' :
                            user.role === 'TENANT' ? 'bg-amber-100 text-amber-700' :
                            user.role === 'VISITOR' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {user.name.slice(0, 2).toUpperCase()}
                            {unreadCount > 0 && (
                              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white text-[8px] font-black flex items-center justify-center border border-white animate-pulse">
                                {unreadCount}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <p className="font-black text-[11px] uppercase truncate">{user.name}</p>
                              <div className="flex items-center gap-1">
                                {lastMessage && (
                                  <span className="text-[7px] font-extrabold text-slate-400 uppercase shrink-0">
                                    {formatShortDate(lastMessage.timestamp)}
                                  </span>
                                )}
                                <span className={`text-[7px] font-black px-1.5 py-0.5 rounded uppercase ${
                                  isSelected ? 'bg-white/20 text-white' : (
                                    user.role === 'ADMIN' ? 'bg-rose-50 text-rose-600' :
                                    user.role === 'TENANT' ? 'bg-amber-50 text-amber-700' :
                                    user.role === 'VISITOR' ? 'bg-purple-50 text-purple-700' : 'bg-emerald-50 text-emerald-700'
                                  )
                                }`}>
                                  {user.role}
                                </span>
                              </div>
                            </div>
                            <p className={`text-[9px] font-bold truncate mt-0.5 ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
                              {lastMessage?.message ? lastMessage.message : 'Klik untuk chat personal...'}
                            </p>
                          </div>
                        </div>
                      );
                    })}

                    {internalUsersList.length === 0 && (
                      <div className="p-4 text-center text-slate-400 text-[10px] font-bold">
                        {isVisitor ? 'Belum ada kontak Admin atau Staff.' : 'Tidak ada user internal ditemukan.'}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}

          </div>
        </div>
      ) : (
        /* LEFT SIDEBAR FOR MEMBER */
        <div className="w-full md:w-80 border-b md:border-r border-slate-200 flex flex-col h-[260px] md:h-full bg-slate-50/50">
          <div className="p-4 border-b border-slate-200 bg-white">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <i className="fas fa-comments text-indigo-600 text-sm"></i> Layanan Bantuan & Chat
            </h3>
            <p className="text-[10px] text-slate-400 font-bold mt-1">Pilih saluran percakapan Anda:</p>
          </div>

          <div className="p-3 space-y-2 flex-1 overflow-y-auto custom-scrollbar">
            {/* Default Channel: Layanan Pengurus Koperasi */}
            <div 
              onClick={() => setSelectedMemberChatTarget('ADMIN')}
              className={`p-3.5 rounded-2xl flex items-center gap-3 cursor-pointer transition-all border ${
                selectedMemberChatTarget === 'ADMIN' 
                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-md shadow-indigo-600/20' 
                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0 ${
                selectedMemberChatTarget === 'ADMIN' ? 'bg-white text-indigo-600' : 'bg-indigo-50 text-indigo-600'
              }`}>
                <i className="fas fa-university"></i>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-black text-xs uppercase truncate">Layanan Koperasi AIS</p>
                <p className={`text-[9px] font-bold truncate mt-0.5 ${selectedMemberChatTarget === 'ADMIN' ? 'text-indigo-100' : 'text-slate-400'}`}>
                  Admin & Staf Koperasi
                </p>
              </div>
            </div>

            {/* Tenant Channels (If tenants contacted member) */}
            {memberContactTenants.map(t => (
              <div 
                key={t.id}
                onClick={() => setSelectedMemberChatTarget(t.id)}
                className={`p-3.5 rounded-2xl flex items-center gap-3 cursor-pointer transition-all border ${
                  matchIds(selectedMemberChatTarget, t.id) 
                    ? 'bg-amber-500 text-white border-amber-600 shadow-md shadow-amber-500/20' 
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0 relative ${
                  matchIds(selectedMemberChatTarget, t.id) ? 'bg-white text-amber-600' : 'bg-amber-50 text-amber-700'
                }`}>
                  <i className="fas fa-store"></i>
                  {t.unread > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white text-[8px] font-black flex items-center justify-center border border-white animate-pulse">
                      {t.unread}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-black text-xs uppercase truncate">{t.name}</p>
                    {t.lastMsg && (
                      <span className={`text-[7px] font-extrabold uppercase shrink-0 ${matchIds(selectedMemberChatTarget, t.id) ? 'text-amber-100' : 'text-slate-400'}`}>
                        {formatShortDate(t.lastMsg.timestamp)}
                      </span>
                    )}
                  </div>
                  <p className={`text-[9px] font-bold truncate mt-0.5 ${matchIds(selectedMemberChatTarget, t.id) ? 'text-amber-100' : 'text-slate-400'}`}>
                    {t.lastMsg?.message || 'Tenant Toko'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RIGHT SIDE: CHAT CONVERSATION SPACE */}
      <div className="flex-1 flex flex-col h-full bg-slate-50/40">
        
        {/* HEADER SECTION */}
        <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm shrink-0">
          
          {isMember ? (
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg shrink-0 ${
                selectedMemberChatTarget === 'ADMIN' ? 'bg-indigo-600' : 'bg-amber-500'
              }`}>
                {selectedMemberChatTarget === 'ADMIN' ? <i className="fas fa-university"></i> : <i className="fas fa-store"></i>}
              </div>
              <div>
                <p className="font-black text-slate-900 text-sm uppercase tracking-tight">
                  {selectedMemberChatTarget === 'ADMIN' 
                    ? 'Pusat Diskusi & Layanan Koperasi AIS' 
                    : `Chat dengan Tenant: ${memberContactTenants.find(t => matchIds(t.id, selectedMemberChatTarget))?.name || 'Tenant'}`}
                </p>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                  {selectedMemberChatTarget === 'ADMIN' ? 'Tim Admin & Staff Siap Membantu' : 'Komunikasi Langsung dengan Merchant Tenant'}
                </p>
              </div>
            </div>
          ) : activeMainTab === 'MEMBERS' && !isVisitor ? (
            selectedMemberId ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shrink-0">
                  <i className="fas fa-id-card"></i>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-black text-slate-900 text-sm uppercase tracking-tight">
                      {selectedMemberObj?.name || 'Member Koperasi'}
                    </p>
                    <span className="text-[8px] font-black px-2 py-0.5 rounded uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                      Member #{selectedMemberObj?.id}
                    </span>
                  </div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                    {isTenant 
                      ? 'Percakapan Langsung Tenant - Member (Privat)' 
                      : `WhatsApp: ${selectedMemberObj?.whatsapp || '-'} • Saldo: Rp ${(selectedMemberObj?.depositBalance || 0).toLocaleString('id-ID')}`}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-slate-500 text-xs font-black uppercase tracking-wider">
                <i className="fas fa-hand-pointer text-indigo-500"></i> Silakan pilih member di samping
              </div>
            )
          ) : (
            /* INTERNAL TAB HEADER */
            selectedInternal.type === 'ROOM' ? (
              selectedInternal.roomId === 'TENANT_ROOM' ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/20 shrink-0">
                    <i className="fas fa-store-alt"></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-black text-slate-900 text-sm uppercase tracking-tight">Room Koordinasi Tenant</p>
                      <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase bg-amber-50 text-amber-700 border border-amber-200">
                        Forum Terbuka
                      </span>
                    </div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                      Grup Koordinasi Antara Tenant, Staff & Pengurus Koperasi
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-600/20 shrink-0">
                    <i className="fas fa-users-cog"></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-black text-slate-900 text-sm uppercase tracking-tight">Room Koordinasi Staff</p>
                      <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {isVisitor ? 'Internal Pengurus, Staff & Visitor' : 'Khusus Staff & Admin'}
                      </span>
                    </div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                      {isVisitor ? 'Forum Koordinasi Bersama Pengurus & Staf Koperasi' : 'Internal Pengurus & Staf Operasional Koperasi'}
                    </p>
                  </div>
                </div>
              )
            ) : (
              /* PERSONAL CHAT HEADER */
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-xs uppercase shadow-lg shrink-0 ${
                  selectedPersonalUserObj?.role === 'ADMIN' ? 'bg-rose-600' :
                  selectedPersonalUserObj?.role === 'TENANT' ? 'bg-amber-500' :
                  selectedPersonalUserObj?.role === 'VISITOR' ? 'bg-purple-600' : 'bg-emerald-600'
                }`}>
                  {selectedPersonalUserObj?.name.slice(0, 2).toUpperCase() || 'US'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-black text-slate-900 text-sm uppercase tracking-tight">
                      Chat Personal: {selectedPersonalUserObj?.name || 'Rekan'}
                    </p>
                    {selectedPersonalUserObj && renderRoleBadge(selectedPersonalUserObj.role)}
                  </div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                    Percakapan Langsung Pribadi (Direct Message 1-on-1)
                  </p>
                </div>
              </div>
            )
          )}

          <button 
            type="button"
            onClick={() => onRefreshData()} 
            title="Refresh Pesan"
            className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-all"
          >
            <i className="fas fa-sync-alt"></i>
          </button>
        </div>

        {/* CHAT MESSAGES BODY */}
        {!isMember && activeMainTab === 'MEMBERS' && !selectedMemberId && !isVisitor ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white/60">
            <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center text-2xl mb-4 border border-slate-200 shadow-inner">
              <i className="fas fa-comments"></i>
            </div>
            <h4 className="font-black text-slate-700 text-sm uppercase tracking-wider">
              {isTenant ? 'Pilih Member untuk Chat' : 'Mulai Diskusi Member'}
            </h4>
            <p className="text-slate-400 text-xs max-w-sm mt-2 leading-relaxed font-bold">
              {isTenant 
                ? 'Pilih salah satu member dari daftar di panel kiri, atau gunakan kolom pencarian untuk mengirim pesan langsung kepada member toko Anda.' 
                : 'Silakan pilih member di panel kiri untuk membaca pertanyaan, menyetujui permintaan, atau memberikan bantuan layanan.'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar bg-slate-50/50">
              {activeConversationMessages.map((msg: AppMessage) => {
                const isMyMessage = matchIds(msg.senderId, currentUser?.id) || 
                  (!isMember && !isTenant && !isVisitor && msg.senderId === 'ADMIN');

                return (
                  <div 
                    key={msg.id} 
                    className={`flex flex-col max-w-[82%] ${isMyMessage ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[9px] font-black text-slate-600 uppercase">{msg.senderName}</span>
                      {renderRoleBadge(msg.senderRole)}
                    </div>

                    <div className={`p-4 rounded-3xl text-xs font-bold leading-relaxed shadow-sm ${
                      isMyMessage 
                        ? 'bg-slate-900 text-white rounded-tr-none' 
                        : 'bg-white text-slate-800 rounded-tl-none border border-slate-200/80 shadow-slate-100'
                    }`}>
                      <p className="whitespace-pre-line">{msg.message}</p>
                    </div>

                    <span className="text-[8px] font-extrabold text-slate-400 uppercase mt-1 px-1">
                      {formatMessageTime(msg.timestamp)}
                    </span>
                  </div>
                );
              })}
              
              {activeConversationMessages.length === 0 && (
                <div className="py-24 text-center text-slate-300 font-black uppercase text-[10px] tracking-widest italic">
                  Belum ada pesan pada percakapan ini. Ketik pesan pertama Anda di bawah!
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>

            {/* QUICK RESPONSE BUTTONS BAR FOR MEMBERS */}
            {activeMainTab === 'MEMBERS' && selectedMemberId && !isVisitor && (
              <div className="px-4 py-2 bg-white border-t border-slate-100 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
                {isTenant ? (
                  <>
                    <button 
                      type="button"
                      onClick={() => setMessageInput("Halo kak, pesanan Anda di tenant kami sedang disiapkan. Mohon ditunggu ya!")} 
                      className="bg-slate-50 border hover:border-amber-300 text-[9px] font-black text-slate-600 hover:text-amber-700 px-3 py-1.5 rounded-lg shrink-0 uppercase tracking-wider"
                    >
                      ⏳ Sedang Disiapkan
                    </button>
                    <button 
                      type="button"
                      onClick={() => setMessageInput("Halo kak, pesanan Anda sudah siap diambil di outlet tenant kami. Terima kasih!")} 
                      className="bg-slate-50 border hover:border-emerald-300 text-[9px] font-black text-slate-600 hover:text-emerald-700 px-3 py-1.5 rounded-lg shrink-0 uppercase tracking-wider"
                    >
                      📦 Pesanan Siap Diambil
                    </button>
                    <button 
                      type="button"
                      onClick={() => setMessageInput("Terima kasih banyak telah berbelanja di tenant kami!")} 
                      className="bg-slate-50 border hover:border-indigo-300 text-[9px] font-black text-slate-600 hover:text-indigo-600 px-3 py-1.5 rounded-lg shrink-0 uppercase tracking-wider"
                    >
                      🙏 Terima Kasih
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      type="button"
                      onClick={() => setMessageInput("Halo, mohon ditunggu. Kami sedang memproses pengajuan Anda.")} 
                      className="bg-slate-50 border hover:border-indigo-300 text-[9px] font-black text-slate-600 hover:text-indigo-600 px-3 py-1.5 rounded-lg shrink-0 uppercase tracking-wider"
                    >
                      ⏳ Sedang Diproses
                    </button>
                    <button 
                      type="button"
                      onClick={() => setMessageInput("Halo! Top Up saldo Anda sudah berhasil disetujui dan ditambahkan. Terima kasih!")} 
                      className="bg-slate-50 border hover:border-emerald-300 text-[9px] font-black text-slate-600 hover:text-emerald-700 px-3 py-1.5 rounded-lg shrink-0 uppercase tracking-wider"
                    >
                      ✅ Top Up Berhasil
                    </button>
                    <button 
                      type="button"
                      onClick={() => setMessageInput("Halo member terhormat, ada lagi yang bisa kami bantu hari ini?")} 
                      className="bg-slate-50 border hover:border-indigo-300 text-[9px] font-black text-slate-600 hover:text-indigo-600 px-3 py-1.5 rounded-lg shrink-0 uppercase tracking-wider"
                    >
                      💬 Ada Lainnya?
                    </button>
                  </>
                )}
              </div>
            )}

            {/* QUICK RESPONSE BUTTONS BAR FOR INTERNAL */}
            {activeMainTab === 'INTERNAL' && (
              <div className="px-4 py-2 bg-white border-t border-slate-100 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
                {isVisitor ? (
                  <>
                    <button 
                      type="button"
                      onClick={() => setMessageInput("Halo Admin & Staff, konfirmasi terkait peninjauan laporan operasional hari ini.")} 
                      className="bg-slate-50 border hover:border-purple-300 text-[9px] font-black text-slate-600 hover:text-purple-700 px-3 py-1.5 rounded-lg shrink-0 uppercase tracking-wider"
                    >
                      📄 Konfirmasi Laporan
                    </button>
                    <button 
                      type="button"
                      onClick={() => setMessageInput("Baik, terima kasih banyak atas informasi dan bantuannya.")} 
                      className="bg-slate-50 border hover:border-emerald-300 text-[9px] font-black text-slate-600 hover:text-emerald-700 px-3 py-1.5 rounded-lg shrink-0 uppercase tracking-wider"
                    >
                      👍 Terima Kasih
                    </button>
                    <button 
                      type="button"
                      onClick={() => setMessageInput("Mohon arahan dan petunjuk terkait agenda berikutnya.")} 
                      className="bg-slate-50 border hover:border-indigo-300 text-[9px] font-black text-slate-600 hover:text-indigo-600 px-3 py-1.5 rounded-lg shrink-0 uppercase tracking-wider"
                    >
                      💬 Mohon Petunjuk
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      type="button"
                      onClick={() => setMessageInput("Baik, siap dilaksanakan.")} 
                      className="bg-slate-50 border hover:border-emerald-300 text-[9px] font-black text-slate-600 hover:text-emerald-700 px-3 py-1.5 rounded-lg shrink-0 uppercase tracking-wider"
                    >
                      👍 Siap Dilaksanakan
                    </button>
                    <button 
                      type="button"
                      onClick={() => setMessageInput("Mohon update status operasional terkini.")} 
                      className="bg-slate-50 border hover:border-indigo-300 text-[9px] font-black text-slate-600 hover:text-indigo-600 px-3 py-1.5 rounded-lg shrink-0 uppercase tracking-wider"
                    >
                      📊 Update Status
                    </button>
                    <button 
                      type="button"
                      onClick={() => setMessageInput("Terima kasih atas koordinasinya rekan-rekan.")} 
                      className="bg-slate-50 border hover:border-amber-300 text-[9px] font-black text-slate-600 hover:text-amber-700 px-3 py-1.5 rounded-lg shrink-0 uppercase tracking-wider"
                    >
                      🤝 Terima Kasih
                    </button>
                  </>
                )}
              </div>
            )}

            {/* MESSAGE INPUT CONSOLE */}
            <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-slate-200 flex items-center gap-3 shrink-0">
              <input 
                type="text" 
                placeholder={
                  isMember 
                    ? "Tulis pesan Anda untuk bantuan..."
                    : activeMainTab === 'MEMBERS' && !isVisitor
                    ? `Tulis pesan untuk ${selectedMemberObj?.name || 'Member'}...`
                    : selectedInternal.type === 'ROOM'
                    ? (selectedInternal.roomId === 'TENANT_ROOM' ? 'Tulis pesan di Room Koordinasi Tenant...' : 'Tulis pesan di Room Koordinasi Staff...')
                    : `Tulis pesan personal untuk ${selectedPersonalUserObj?.name || 'Rekan'}...`
                }
                className="flex-1 px-5 py-3.5 bg-slate-50 font-bold text-xs border border-transparent rounded-2xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-inner"
                value={messageInput}
                onChange={e => setMessageInput(e.target.value)}
                disabled={isSending}
              />
              <button 
                type="submit" 
                disabled={isSending || !messageInput.trim()}
                className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center transition-all hover:bg-indigo-600 active:scale-95 disabled:opacity-30 shrink-0 shadow-lg shadow-slate-200"
              >
                {isSending ? <i className="fas fa-spinner animate-spin"></i> : <i className="fas fa-paper-plane"></i>}
              </button>
            </form>
          </>
        )}

      </div>
    </div>
  );
};

export default ChatInterface;
