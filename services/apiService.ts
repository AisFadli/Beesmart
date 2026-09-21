
import { Product, Category, Transaction, StoreSettings, User, Order, Member } from '../types';

const getApiBaseUrl = () => {
  const origin = window.location.origin;
  const path = window.location.pathname;
  
  // Jika path berada di subfolder /app, gunakan subfolder tersebut
  if (path === '/app' || path.startsWith('/app/')) {
    return `${origin}/app/api`;
  }
  
  // Default untuk environment ini adalah /api di root
  return `${origin}/api`;
};

const API_BASE_URL = getApiBaseUrl(); 

export class ApiService {
  private token: string = (() => {
    try { return localStorage.getItem('beesmart_token') || ''; } catch (e) { return ''; }
  })();

  public setToken(token: string) {
    this.token = token || '';
    try {
      if (this.token) localStorage.setItem('beesmart_token', this.token);
      else localStorage.removeItem('beesmart_token');
    } catch (e) {}
  }

  public getToken() { return this.token; }

  private handleUnauthorized() {
    this.token = '';
    try {
      localStorage.removeItem('beesmart_token');
      localStorage.removeItem('beesmart_user');
    } catch (e) {}
    window.location.reload();
  }

  // Changed from private to public so it can be accessed directly from components as needed
  public async request(endpoint: string, options: RequestInit = {}) {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${API_BASE_URL}${cleanEndpoint}`;

    const headers: Record<string, string> = { 'Accept': 'application/json', ...(options.headers as Record<string, string> || {}) };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });
      
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("Invalid JSON response from " + url, text);
        throw new Error("Respon server tidak valid. Pastikan folder /app/api/ tersedia.");
      }

      if (response.status === 401 && this.token) {
        this.handleUnauthorized();
        throw new Error(data.message || "Sesi berakhir. Silakan login kembali.");
      }
      
      if (data.status === 'error') {
        const err: any = new Error(data.message);
        err.status = response.status;
        throw err;
      }
      return data;
    } catch (error: any) {
      console.error("API Request Error:", error);
      throw error;
    }
  }

  async login(credentials: { email: string; password: string }): Promise<User> {
    const response = await this.request('/auth.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    const user = response.user || response;
    if (user.token) this.setToken(user.token);
    return user;
  }

  async getAppData(role?: string, userId?: string) { 
    const query = role ? `?role=${role}&userId=${encodeURIComponent(userId || '')}` : '';
    return this.request(`/get_app_data.php${query}`); 
  }

  async saveProduct(product: Product) {
    return this.request('/products.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product),
    });
  }

  async deleteProduct(id: string) { return this.request('/products.php?id=' + id, { method: 'DELETE' }); }
  
  async saveMember(member: Member) {
    return this.request('/members.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(member),
    });
  }

  async registerMember(member: Member) {
    return this.request('/register.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(member),
    });
  }

  async approveMember(memberId: string) {
    return this.request('/approve_member.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId }),
    });
  }

  async deleteMember(id: string) { return this.request('/members.php?id=' + id, { method: 'DELETE' }); }

  // Updated to include optional proofImage as requested by component usage
  async topUpMember(id: string, amount: number, proofImage?: string) {
    return this.request('/members_topup.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, amount, proofImage }),
    });
  }

  async saveCategory(category: Category) {
    return this.request('/categories.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(category),
    });
  }

  async deleteCategory(id: string) { return this.request('/categories.php?id=' + id, { method: 'DELETE' }); }

  async saveTransaction(transaction: Transaction) {
    return this.request('/transactions.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transaction),
    });
  }

  async saveOrder(order: Order) {
    return this.request('/orders.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
    });
  }

  async updateTransaction(transaction: Transaction) {
    return this.request('/transactions.php', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transaction),
    });
  }

  async deleteTransaction(id: string) { return this.request('/transactions.php?id=' + id, { method: 'DELETE' }); }
  
  async uploadFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const response = await fetch(`${API_BASE_URL}/upload.php`, {
      method: 'POST',
      headers,
      body: formData
    });
    const data = await response.json();
    if (data.status === 'error') throw new Error(data.message);
    return data;
  }

  async saveSettings(settings: StoreSettings) {
    return this.request('/settings.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
  }

  async sendMessage(msg: any) {
    return this.request('/messages.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send', ...msg }),
    });
  }

  async markMessagesAsRead(senderId: string, receiverId: string) {
    return this.request('/messages.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_read', senderId, receiverId }),
    });
  }

  async requestPasswordReset(email: string) {
    return this.request('/forgot_password.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'request', email }),
    });
  }

  async resetPassword(token: string, password: string, confirmPassword: string) {
    return this.request('/forgot_password.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset', token, password, confirm_password: confirmPassword }),
    });
  }
}

export default new ApiService();
