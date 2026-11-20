export type LangMode = 'bn' | 'en';
export type NumeralMode = 'bn' | 'en';

export type UserRole = 'super_admin' | 'business_owner' | 'staff' | 'customer';
export type AnimalCategory = 'chicken' | 'duck' | 'birds' | 'cattle' | 'goats' | 'sheep' | 'other';
export type AllocationMethod = 'equal' | 'weight' | 'batch' | 'custom';
export type ExpenseCategory =
  | 'feed_consumed'
  | 'medicine_consumed'
  | 'labor'
  | 'transport'
  | 'utilities'
  | 'equipment'
  | 'other';
export type OrderDeliveryStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'ready'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export interface StaffPermissions {
  'animals.view': boolean;
  'animals.add': boolean;
  'animals.edit': boolean;
  'animals.delete': boolean;
  'feed.view': boolean;
  'feed.add': boolean;
  'feed.edit': boolean;
  'feed.delete': boolean;
  'medicine.view': boolean;
  'medicine.add': boolean;
  'medicine.edit': boolean;
  'finance.view': boolean;
  'finance.add_expense': boolean;
  'finance.view_profit': boolean;
  'finance.view_sales': boolean;
  'finance.export': boolean;
  'customers.view': boolean;
  'customers.add': boolean;
  'customers.edit': boolean;
  'orders.view': boolean;
  'orders.confirm': boolean;
  'orders.update_status': boolean;
  'orders.cancel': boolean;
  'products.manage': boolean;
}

export type PermissionKey = keyof StaffPermissions;

export interface UserAccount {
  id: string;
  businessId: string | null;
  businessName: string | null;
  businessStatus: 'active' | 'suspended' | null;
  subscriptionPlan: 'trial' | 'monthly' | 'yearly' | null;
  subscriptionStatus: 'trial' | 'active' | 'expired' | null;
  subscriptionEndsAt: string | null;
  role: UserRole;
  name: string;
  username: string;
  email: string;
  phone: string;
  preferredLang: LangMode;
  assignedRoleTitle: string;
  permissions: StaffPermissions;
  active: boolean;
  shopName: string;
  city: string;
  address: string;
  createdAt: string;
}

export interface BatchWithFinancials {
  id: string;
  businessId: string;
  batchCode: string;
  category: AnimalCategory;
  breed: string;
  initialQuantity: number;
  purchaseDate: string;
  purchasePricePerUnit: number;
  totalPurchaseCost: number;
  supplierId: string | null;
  supplierName: string;
  initialWeightKg: number;
  deathsQuantity: number;
  soldQuantity: number;
  remainingQuantity: number;
  status: 'active' | 'completed' | 'closed';
  notes: string;
  createdBy: string;
  createdAt: string;
  feedExpenses: number;
  medicineExpenses: number;
  laborExpenses: number;
  transportExpenses: number;
  utilitiesExpenses: number;
  equipmentExpenses: number;
  otherExpenses: number;
  totalAdditionalExpenses: number;
  totalInvestment: number;
  costPerAnimal: number;
  deathFinancialLoss: number;
  totalSalesRevenue: number;
  averageSellingPrice: number;
  cogsOfSold: number;
  realizedProfit: number;
  profitPerAnimal: number;
  remainingInventoryValue: number;
  estimatedProfitOnUnsold: number;
}

export interface BatchDeathRecord {
  id: string;
  txId: string;
  batchId: string;
  batchCode: string;
  category: AnimalCategory;
  date: string;
  quantity: number;
  cause: string;
  unitCostAtDeath: number;
  financialLoss: number;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export interface BatchSaleRecord {
  id: string;
  txId: string;
  batchId: string;
  batchCode: string;
  category: AnimalCategory;
  orderId: string | null;
  date: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  quantity: number;
  unitSellingPrice: number;
  totalRevenue: number;
  paidAmount: number;
  dueAmount: number;
  paymentStatus: 'paid' | 'partial' | 'due';
  costPerAnimalSnapshot: number;
  cogsAmount: number;
  realizedProfit: number;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export interface ExpenseAllocationDetail {
  batchId: string;
  batchCode: string;
  percentage: number;
  allocatedAmount: number;
}

export interface ExpenseRecord {
  id: string;
  txId: string;
  date: string;
  category: ExpenseCategory;
  title: string;
  totalAmount: number;
  allocationMethod: AllocationMethod;
  notes: string;
  createdBy: string;
  createdAt: string;
  allocations: ExpenseAllocationDetail[];
}

export interface FeedItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  supplierName: string;
  purchasedQty: number;
  consumedQty: number;
  remainingQty: number;
  avgUnitCost: number;
  minThreshold: number;
  updatedAt: string;
}

export interface FeedPurchaseRecord {
  id: string;
  txId: string;
  feedId: string;
  feedName: string;
  date: string;
  supplierName: string;
  quantity: number;
  unitPrice: number;
  totalCost: number;
  paidAmount: number;
  dueAmount: number;
  paymentStatus: 'paid' | 'partial' | 'due';
  notes: string;
  createdBy: string;
}

export interface FeedConsumptionRecord {
  id: string;
  txId: string;
  feedId: string;
  feedName: string;
  date: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  allocationMethod: AllocationMethod;
  notes: string;
  createdBy: string;
}

export interface MedicineItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  supplierName: string;
  purchasedQty: number;
  usedQty: number;
  remainingQty: number;
  avgUnitCost: number;
  expiryDate: string;
  vetName: string;
  vetPhone: string;
  minThreshold: number;
  updatedAt: string;
}

export interface MedicineTreatmentRecord {
  id: string;
  txId: string;
  medicineId: string;
  medicineName: string;
  batchId: string;
  batchCode: string;
  date: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  diagnosis: string;
  vetName: string;
  notes: string;
  createdBy: string;
}

export interface VaccinationRecord {
  id: string;
  batchId: string;
  batchCode: string;
  vaccineName: string;
  scheduledDate: string;
  status: 'pending' | 'completed';
  completedDate: string | null;
  vetName: string;
  notes: string;
}

export interface PartyRecord {
  id: string;
  type: 'customer' | 'supplier';
  userId: string | null;
  shopName: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  notes: string;
  totalVolume: number;
  totalPaid: number;
  outstandingBalance: number;
  createdAt: string;
}

export interface ProductRecord {
  id: string;
  businessId: string;
  businessName?: string;
  category: AnimalCategory | 'feed' | 'eggs' | 'other';
  linkedType: 'batch' | 'feed' | 'standalone';
  linkedId: string | null;
  nameBn: string;
  nameEn: string;
  descriptionBn: string;
  descriptionEn: string;
  unitLabel: string;
  price: number;
  stockQty: number;
  imageUrl: string;
  isPublished: boolean;
  createdAt: string;
}

export interface OrderItemRecord {
  id: string;
  productId: string;
  productName: string;
  linkedType: 'batch' | 'feed' | 'standalone';
  linkedId: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderRecord {
  id: string;
  businessId: string;
  businessName?: string;
  orderNumber: string;
  customerUserId: string | null;
  customerName: string;
  shopName: string;
  phone: string;
  deliveryAddress: string;
  city: string;
  subtotal: number;
  deliveryFee: number;
  totalAmount: number;
  paymentMethod: 'cod' | 'bkash' | 'nagad' | 'card';
  paymentStatus: 'pending' | 'paid' | 'failed';
  deliveryStatus: OrderDeliveryStatus;
  stockDeducted: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
  items: OrderItemRecord[];
}

export interface FinancialDashboardData {
  kpis: {
    totalBatches: number;
    activeBatches: number;
    totalAnimalsRemaining: number;
    totalAnimalPurchases: number;
    totalAdditionalExpenses: number;
    totalInvestment: number;
    totalSalesRevenue: number;
    grossProfit: number;
    netProfit: number;
    mortalityLoss: number;
    availableStockValue: number;
    unusedFeedValue: number;
    unusedMedicineValue: number;
    estimatedProfitOnUnsold: number;
    customerReceivables: number;
    supplierPayables: number;
    dailyRevenue: number;
    monthlyRevenue: number;
    yearlyRevenue: number;
    pendingOrdersCount: number;
  };
  categoryBreakdown: Array<{
    category: AnimalCategory;
    remainingQty: number;
    investment: number;
    revenue: number;
    profit: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    revenue: number;
    expenses: number;
    profit: number;
  }>;
}

export interface PaymentTxRecord {
  id: string;
  businessId: string;
  businessName?: string;
  txRef: string;
  invoiceNumber: string;
  plan: 'monthly' | 'yearly';
  gateway: 'bkash' | 'nagad' | 'card' | 'international';
  amount: number;
  gatewayTrxId: string;
  status: 'initiated' | 'verified' | 'rejected';
  verifiedBy: string | null;
  createdAt: string;
  verifiedAt: string | null;
}

export interface SupportRequestRecord {
  id: string;
  businessId: string;
  businessName?: string;
  superAdminId: string;
  superAdminName?: string;
  reason: string;
  status: 'pending' | 'approved' | 'revoked' | 'expired';
  expiresAt: string | null;
  createdAt: string;
}

export interface NotificationRecord {
  id: string;
  category: string;
  severity: 'info' | 'warning' | 'critical';
  titleBn: string;
  titleEn: string;
  bodyBn: string;
  bodyEn: string;
  isRead: boolean;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  businessId: string | null;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  createdAt: string;
}

export interface BusinessDirectoryItem {
  id: string;
  name: string;
  ownerName: string;
  city: string;
  phone: string;
  status: 'active' | 'suspended';
  subscriptionPlan: 'trial' | 'monthly' | 'yearly';
  subscriptionStatus: 'trial' | 'active' | 'expired';
  trialEndsAt: string;
  subscriptionEndsAt: string | null;
  customerCount?: number;
  staffCount?: number;
  createdAt: string;
}
