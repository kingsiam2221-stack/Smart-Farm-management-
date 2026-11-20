import type {
  AllocationMethod,
  AnimalCategory,
  ExpenseCategory,
  LangMode,
  NumeralMode,
  OrderDeliveryStatus,
  PermissionKey,
} from '../types/saas';

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBanglaDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => BN_DIGITS[Number(d)] ?? d);
}

export function toEnglishDigits(input: string): string {
  return String(input)
    .replace(/[০-৯]/g, (ch) => String(BN_DIGITS.indexOf(ch)))
    .replace(/[৳,\s]/g, '');
}

export function parseNumericInput(raw: string): number {
  const cleaned = toEnglishDigits(raw).replace(/[^0-9.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function formatNum(val: number, numeralMode: NumeralMode, decimals = 0): string {
  const safe = Number.isFinite(val) ? val : 0;
  const formatted = safe.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return numeralMode === 'bn' ? toBanglaDigits(formatted) : formatted;
}

export function formatCurrency(val: number, numeralMode: NumeralMode, decimals = 0): string {
  const safe = Number.isFinite(val) ? val : 0;
  const abs = Math.abs(safe);
  const str = formatNum(abs, numeralMode, decimals);
  return safe < 0 ? `-৳${str}` : `৳${str}`;
}

export function formatDateDisplay(iso: string | null | undefined, numeralMode: NumeralMode): string {
  if (!iso) return '—';
  const d = iso.slice(0, 10);
  return numeralMode === 'bn' ? toBanglaDigits(d) : d;
}

export const ANIMAL_CATEGORY_LABELS: Record<AnimalCategory, { bn: string; en: string }> = {
  chicken: { bn: 'মুরগি', en: 'Chicken' },
  duck: { bn: 'হাঁস', en: 'Duck' },
  birds: { bn: 'পাখি (কোয়েল/কবুতর)', en: 'Birds (Quail/Pigeon)' },
  cattle: { bn: 'গরু', en: 'Cattle' },
  goats: { bn: 'ছাগল', en: 'Goats' },
  sheep: { bn: 'ভেড়া', en: 'Sheep' },
  other: { bn: 'অন্যান্য প্রাণী', en: 'Other Animals' },
};

export const ALLOCATION_METHOD_LABELS: Record<AllocationMethod, { bn: string; en: string; descBn: string; descEn: string }> = {
  equal: {
    bn: 'প্রাণী সংখ্যা অনুযায়ী সমান',
    en: 'Equal per Living Animal',
    descBn: 'জীবিত প্রাণীর সংখ্যার অনুপাতে খরচ ভাগ হয়',
    descEn: 'Distributed proportionally by current living animal count',
  },
  weight: {
    bn: 'ওজন অনুযায়ী (কেজি)',
    en: 'By Body Weight (kg)',
    descBn: 'ব্যাচের মোট ওজনের (সংখ্যা × গড় ওজন) অনুপাতে ভাগ হয়',
    descEn: 'Weighted by remaining count × initial weight kg',
  },
  batch: {
    bn: 'ব্যাচ অনুযায়ী সমান',
    en: 'Equal per Batch',
    descBn: 'নির্বাচিত প্রতিটি ব্যাচে সমান টাকা ভাগ হয়',
    descEn: 'Split equally across each selected batch',
  },
  custom: {
    bn: 'কাস্টম শতাংশ (%)',
    en: 'Custom Percentage (%)',
    descBn: 'আপনার দেওয়া শতাংশ (মোট ১০০%) অনুযায়ী ভাগ হয়',
    descEn: 'Split by custom percentages summing to 100%',
  },
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, { bn: string; en: string }> = {
  feed_consumed: { bn: 'ব্যবহৃত খাদ্য', en: 'Feed Consumed' },
  medicine_consumed: { bn: 'ব্যবহৃত ওষুধ ও চিকিৎসা', en: 'Medicine & Treatment' },
  labor: { bn: 'শ্রমিক বেতন / মজুরি', en: 'Labor & Wages' },
  transport: { bn: 'পরিবহন খরচ', en: 'Transportation' },
  utilities: { bn: 'বিদ্যুৎ, পানি ও গ্যাস', en: 'Utilities' },
  equipment: { bn: 'সরঞ্জাম ও লিটার', en: 'Equipment & Litter' },
  other: { bn: 'অন্যান্য খরচ', en: 'Other Expenses' },
};

export const ORDER_STATUS_LABELS: Record<OrderDeliveryStatus, { bn: string; en: string; cls: string }> = {
  pending: { bn: 'অপেক্ষমাণ', en: 'Pending', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  confirmed: { bn: 'নিশ্চিত', en: 'Confirmed', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  processing: { bn: 'প্রস্তুত হচ্ছে', en: 'Processing', cls: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  ready: { bn: 'ডেলিভারির জন্য প্রস্তুত', en: 'Ready', cls: 'bg-teal-50 text-teal-800 border-teal-200' },
  shipped: { bn: 'পথে আছে', en: 'Shipped', cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  delivered: { bn: 'ডেলিভারি সম্পন্ন', en: 'Delivered', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  cancelled: { bn: 'বাতিল', en: 'Cancelled', cls: 'bg-rose-50 text-rose-800 border-rose-200' },
};

export const PERMISSION_LABELS: Record<PermissionKey, { bn: string; en: string; group: string }> = {
  'animals.view': { bn: 'প্রাণীর ব্যাচ দেখা', en: 'View Animal Batches', group: 'animals' },
  'animals.add': { bn: 'নতুন ব্যাচ তৈরি', en: 'Create Animal Batches', group: 'animals' },
  'animals.edit': { bn: 'ব্যাচ আপডেট / মৃত্যু / বিক্রয়', en: 'Edit Batch / Death / Sale', group: 'animals' },
  'animals.delete': { bn: 'ব্যাচ ও রেকর্ড মুছে ফেলা', en: 'Delete Batches & Records', group: 'animals' },
  'feed.view': { bn: 'খাদ্য মজুদ দেখা', en: 'View Feed Inventory', group: 'feed' },
  'feed.add': { bn: 'খাদ্য ক্রয় ও ব্যবহার রেকর্ড', en: 'Purchase & Log Feed Usage', group: 'feed' },
  'feed.edit': { bn: 'খাদ্য তথ্য সম্পাদনা', en: 'Edit Feed Details', group: 'feed' },
  'feed.delete': { bn: 'খাদ্য রেকর্ড মুছে ফেলা', en: 'Delete Feed Records', group: 'feed' },
  'medicine.view': { bn: 'ওষুধ ও টিকা দেখা', en: 'View Medicine & Vaccines', group: 'medicine' },
  'medicine.add': { bn: 'ওষুধ ক্রয় ও চিকিৎসা প্রদান', en: 'Purchase & Treat Batches', group: 'medicine' },
  'medicine.edit': { bn: 'টিকার অবস্থা আপডেট', en: 'Update Vaccination Status', group: 'medicine' },
  'finance.view': { bn: 'ড্যাশবোর্ড ও রিপোর্ট দেখা', en: 'View Financial Dashboard & Reports', group: 'finance' },
  'finance.add_expense': { bn: 'খরচ যোগ ও বণ্টন', en: 'Add & Allocate Expenses', group: 'finance' },
  'finance.view_profit': { bn: 'লাভ-ক্ষতি বিশ্লেষণ দেখা', en: 'View Profit & Loss Margins', group: 'finance' },
  'finance.view_sales': { bn: 'বিক্রয় তালিকা দেখা', en: 'View Sales Ledger', group: 'finance' },
  'finance.export': { bn: 'Excel ও PDF এক্সপোর্ট', en: 'Export Excel & PDF', group: 'finance' },
  'customers.view': { bn: 'ক্রেতা ও সরবরাহকারী দেখা', en: 'View Customers & Suppliers', group: 'customers' },
  'customers.add': { bn: 'নতুন ক্রেতা/সরবরাহকারী যোগ', en: 'Add Customers/Suppliers', group: 'customers' },
  'customers.edit': { bn: 'পেমেন্ট / বকেয়া আদায়', en: 'Record Party Payments', group: 'customers' },
  'orders.view': { bn: 'ক্রেতার অর্ডার দেখা', en: 'View Customer Orders', group: 'orders' },
  'orders.confirm': { bn: 'অর্ডার কনফার্ম (স্টক কর্তন)', en: 'Confirm Orders (Deduct Stock)', group: 'orders' },
  'orders.update_status': { bn: 'ডেলিভারি স্ট্যাটাস আপডেট', en: 'Update Delivery Status', group: 'orders' },
  'orders.cancel': { bn: 'অর্ডার বাতিল', en: 'Cancel Orders', group: 'orders' },
  'products.manage': { bn: 'পণ্য ক্যাটালগ প্রকাশ ও সম্পাদনা', en: 'Manage Published Catalog', group: 'orders' },
};

export const CATALOG_PRESET_IMAGES = [
  {
    id: 'chicken',
    labelBn: 'ব্রয়লার / দেশি মুরগি',
    labelEn: 'Poultry Chicken',
    url: '/src/assets/images/catalog_poultry_chicken_1795135757978.jpg',
  },
  {
    id: 'duck',
    labelBn: 'হাঁস / কোয়েল পাখি',
    labelEn: 'Ducks & Birds',
    url: '/src/assets/images/catalog_duck_birds_1795135757755.jpg',
  },
  {
    id: 'cattle',
    labelBn: 'গরু ও ছাগল',
    labelEn: 'Cattle & Goats',
    url: '/src/assets/images/catalog_cattle_goat_1795135758140.jpg',
  },
  {
    id: 'feed',
    labelBn: 'পোল্ট্রি ও গবাদি ফিড',
    labelEn: 'Animal Feed',
    url: '/src/assets/images/catalog_poultry_feed_1795135758153.jpg',
  },
];

export const TEXTS = {
  appBrand: { bn: 'স্মার্ট ফার্ম সাস', en: 'Smart Farm SaaS' },
  appSubBrand: { bn: 'পোল্ট্রি ও লাইভস্টক বিজনেস সিস্টেম', en: 'Poultry & Livestock Business Suite' },
  signIn: { bn: 'লগইন করুন', en: 'Sign In' },
  signOut: { bn: 'লগআউট', en: 'Sign Out' },
  registerOwner: { bn: 'ব্যবসার মালিক নিবন্ধন', en: 'Business Owner Sign Up' },
  registerCustomer: { bn: 'ক্রেতা পোর্টাল নিবন্ধন', en: 'Customer Registration' },
  setupSuperAdmin: { bn: 'সুপার অ্যাডমিন সেটআপ', en: 'Super Admin Setup' },
  dashboard: { bn: 'ড্যাশবোর্ড', en: 'Dashboard' },
  batches: { bn: 'প্রাণীর ব্যাচ ও কস্টিং', en: 'Animal Batches & Costing' },
  feedMedicine: { bn: 'খাদ্য, ওষুধ ও টিকা', en: 'Feed, Medicine & Vaccines' },
  expensesParties: { bn: 'খরচ বণ্টন ও পার্টি হিসাব', en: 'Expenses & Customers/Suppliers' },
  ordersCatalog: { bn: 'অর্ডার ও পণ্য ক্যাটালগ', en: 'Orders & Product Catalog' },
  staffPermissions: { bn: 'স্টাফ, অনুমতি ও অডিট', en: 'Staff, Permissions & Audit' },
  reports: { bn: 'রিপোর্ট ও এক্সপোর্ট', en: 'Reports & Export' },
  subscriptionSettings: { bn: 'সাবস্ক্রিপশন ও সেটিংস', en: 'Subscription & Settings' },
  catalogStore: { bn: 'পণ্য ক্যাটালগ', en: 'Product Catalog' },
  cartCheckout: { bn: 'কার্ট ও চেকআউট', en: 'Cart & Checkout' },
  myOrders: { bn: 'আমার অর্ডার', en: 'My Orders' },
  profileLang: { bn: 'প্রোফাইল ও ভাষা', en: 'Profile & Language' },
  platformOverview: { bn: 'প্ল্যাটফর্ম ওভারভিউ', en: 'Platform Overview' },
  businesses: { bn: 'ব্যবসা তালিকা', en: 'Businesses' },
  subRevenue: { bn: 'সাবস্ক্রিপশন ও আয়', en: 'Subscriptions & Revenue' },
  platformSettings: { bn: 'প্ল্যাটফর্ম সেটিংস', en: 'Platform Settings' },
  supportAudit: { bn: 'সাপোর্ট ও অডিট অ্যাক্সেস', en: 'Support & Audited Access' },
  save: { bn: 'সংরক্ষণ করুন', en: 'Save' },
  cancel: { bn: 'বাতিল করুন', en: 'Cancel' },
  close: { bn: 'বন্ধ করুন', en: 'Close' },
  add: { bn: 'যোগ করুন', en: 'Add' },
  delete: { bn: 'মুছে ফেলুন', en: 'Delete' },
  loading: { bn: 'তথ্য লোড হচ্ছে...', en: 'Loading data...' },
  noData: { bn: 'কোনো তথ্য পাওয়া যায়নি', en: 'No records found' },
  language: { bn: 'ভাষা', en: 'Language' },
  numerals: { bn: 'সংখ্যা প্রদর্শন', en: 'Number Format' },
  notifications: { bn: 'বিজ্ঞপ্তি', en: 'Notifications' },
  markAllRead: { bn: 'সব পঠিত চিহ্নিত করুন', en: 'Mark All Read' },
} as const;

export function tr(lang: LangMode, key: keyof typeof TEXTS): string {
  return TEXTS[key][lang];
}

export function pickText(lang: LangMode, bn: string, en: string): string {
  return lang === 'bn' ? bn : en;
}
