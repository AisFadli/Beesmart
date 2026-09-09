
export enum UserRole {
  ADMIN = 'ADMIN',
  STAFF = 'STAFF',
  TENANT = 'TENANT',
  MEMBER = 'MEMBER',
  VISITOR = 'VISITOR'
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  tenantCategories?: string[];
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface StoreSettings {
  name: string;
  address: string;
  phone: string;
  footer: string;
  autoPrint: boolean;
  printerType: '58mm' | '80mm';
  qrisImage?: string;
  latitude?: number;
  longitude?: number;
  isOpen: boolean;
  topUpInstructions?: string;
}

export interface Product {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  category: string;
  price: number;
  costPrice: number;
  stock: number;
  initialStock: number;
  minStock: number;
  image?: string;
  initialStockDate?: string;
  discountValue?: number;
  discountType?: 'FIXED' | 'PERCENT';
  discountStart?: string;
  discountEnd?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  avgMonthlySales?: number;
}

export interface Category {
  id: string;
  name: string;
}

export interface Member {
  id: string;
  barcode?: string;
  name: string;
  email: string;
  address: string;
  password?: string;
  whatsapp: string;
  image?: string;
  registrationDate: string;
  depositBalance: number;
  status: 'PENDING' | 'APPROVED' | 'SUSPENDED';
}

export interface TransactionItem {
  productId: string;
  sku: string;
  name: string;
  category: string;
  quantity: number;
  price: number;
  costPrice: number;
  originalPrice: number;
  discountValue: number;
  discountType: 'FIXED' | 'PERCENT';
  subtotal: number;
}

export interface ShippingRate {
  id: number;
  minDistance: number;
  maxDistance: number;
  rate: number;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface Transaction {
  id: string;
  timestamp: string;
  items: TransactionItem[];
  total: number;
  paidAmount?: number;
  changeAmount?: number;
  paymentMethod: 'CASH' | 'DEBIT' | 'QRIS' | 'DEPOSIT' | 'TRANSFER' | 'UNPAID';
  paymentStatus: 'PAID' | 'UNPAID';
  status?: 'NORMAL' | 'REVISED' | 'CANCELLED' | 'ACTIVE' | 'INACTIVE';
  orderStatus?: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED';
  staffId: string;
  memberId?: string;
  customerName?: string;
  notes?: string;
  transactionType?: 'NORMAL' | 'INDENT';
  receivedAt?: string;
  deliveryType?: 'PICKUP' | 'DELIVERY';
  shippingCost?: number;
  paymentProof?: string;
  latitude?: number;
  longitude?: number;
}

export interface StockAdjustment {
  id: number;
  productId: string;
  quantity: number;
  type: 'DAMAGE' | 'LOSS' | 'EXPIRED' | 'IN' | 'RESTOCK' | 'RETURN' | 'OTHER';
  timestamp: string;
  staffId: string;
  notes: string;
  status?: 'NORMAL' | 'REVISED' | 'CANCELLED' | 'PENDING';
}

export interface MemberLog {
  id: number;
  memberId: string;
  type: 'TOPUP' | 'USAGE';
  amount: number;
  timestamp: string;
  notes: string;
  status: 'PENDING' | 'APPROVED';
  proof_image?: string;
}

export enum OrderStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED',
  DECLINED = 'DECLINED'
}

export interface OrderItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  estimatedCost: number;
  subtotal: number;
}

export interface Order {
  id: string;
  staffId: string;
  status: OrderStatus;
  items: OrderItem[];
  totalCost: number;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  receivedAt?: string;
  receivedBy?: string;
  notes?: string;
}

export interface Expense {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  staffId: string;
  status: 'NORMAL' | 'CANCELLED';
  createdAt?: string;
}

export interface ProductProposal {
  id: number;
  productId?: string;
  type: 'UPDATE' | 'CREATE' | 'DISCOUNT' | 'STOCK_REPORT';
  data: Partial<Product>;
  staffId: string;
  status: 'PENDING' | 'APPROVED' | 'DECLINED';
  reason: string;
  notes?: string;
  adminNote?: string;
  createdAt: string;
}

export interface AppMessage {
  id: number;
  senderId: string;
  senderRole: string;
  senderName: string;
  receiverId: string;
  receiverRole: string;
  receiverName: string;
  message: string;
  timestamp: string;
  isRead: number;
}

export interface AppState {
  currentUser: User | null;
  products: Product[];
  categories: Category[];
  members: Member[];
  transactions: Transaction[];
  memberLogs: MemberLog[];
  stockAdjustments: StockAdjustment[];
  orders: Order[];
  expenses: Expense[];
  productProposals: ProductProposal[];
  messages: AppMessage[];
  users?: User[];
  settings: StoreSettings;
  isLoading: boolean;
}
