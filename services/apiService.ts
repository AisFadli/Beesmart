
import { Product, Category, Transaction, StoreSettings, User, Order, Member } from '../types';

const getApiBaseUrl = () => {
  const origin = window.location.origin;
  const path = window.location.pathname;
  
  // Jika path mengandung /minimartpro, gunakan subfolder tersebut
  if (path.includes('/minimartpro')) {
    return `${origin}/minimartpro/api`;
  }
  
  // Default untuk environment ini adalah /api di root
  return `${origin}/api`;
};

const API_BASE_URL = getApiBaseUrl(); 

export class ApiService {
  // Changed from private to public so it can be accessed directly from components as needed
  public async request(endpoint: string, options: RequestInit = {}) {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${API_BASE_URL}${cleanEndpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: { 'Accept': 'application/json', ...options.headers },
      });
      
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("Invalid JSON response from " + url, text);
        throw new Error("Respon server tidak valid. Pastikan folder /minimartpro/api/ tersedia.");
      }
      
      if (data.status === 'error') throw new Error(data.message);
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
    return response.user || response;
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
    const response = await fetch(`${API_BASE_URL}/upload.php`, {
      method: 'POST',
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
