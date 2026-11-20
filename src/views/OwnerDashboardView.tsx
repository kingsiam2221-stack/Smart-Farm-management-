import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  TrendingUp,
  Wallet,
  Package,
  AlertTriangle,
  Users,
  ShoppingCart,
  RefreshCw,
} from 'lucide-react';
import type { FinancialDashboardData, LangMode, NumeralMode, UserAccount } from '../types/saas';
import { apiRequest } from '../utils/api';
import {
  ANIMAL_CATEGORY_LABELS,
  formatCurrency,
  formatNum,
  pickText,
} from '../utils/translations';
import { PageHeader, StatCard, secondaryBtnCls } from '../components/UI';

export function OwnerDashboardView({
  lang,
  numeralMode,
  user,
  onNavigate,
  onToast,
}: {
  lang: LangMode;
  numeralMode: NumeralMode;
  user: UserAccount;
  onNavigate: (tab: string) => void;
  onToast: (type: 'success' | 'error', msg: string) => void;
}) {
  const [data, setData] = useState<FinancialDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<FinancialDashboardData>('/api/dashboard');
      setData(res);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Dashboard load failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading && !data) {
    return <div className="p-8 text-sm text-slate-500">{pickText(lang, 'ড্যাশবোর্ড লোড হচ্ছে...', 'Loading dashboard...')}</div>;
  }

  if (!data) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-600">
        {pickText(lang, 'ড্যাশবোর্ড দেখার অনুমতি নেই বা তথ্য লোড করা যায়নি।', 'Unable to load financial dashboard.')}
      </div>
    );
  }

  const k = data.kpis;
  const canViewProfit = user.role === 'business_owner' || user.permissions['finance.view_profit'];

  const categoryChartData = data.categoryBreakdown.map((c) => ({
    name: ANIMAL_CATEGORY_LABELS[c.category]?.[lang] || c.category,
    investment: c.investment,
    revenue: c.revenue,
    profit: c.profit,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={pickText(lang, `${user.businessName || ''} — আর্থিক ড্যাশবোর্ড`, `${user.businessName || ''} — Financial Dashboard`)}
        subtitle={pickText(
          lang,
          'বিনিয়োগ, ব্যবহৃত খরচ, বিক্রয় আয়, মৃত্যু ক্ষতি ও অবশিষ্ট মজুদের সম্পূর্ণ রিয়েল-টাইম বিশ্লেষণ',
          'Real-time investment, consumed expenses, sales revenue, mortality loss, and inventory valuation'
        )}
        action={
          <button type="button" onClick={load} className={secondaryBtnCls}>
            <RefreshCw className="w-4 h-4" />
            <span>{pickText(lang, 'রিফ্রেশ', 'Refresh')}</span>
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={pickText(lang, 'মোট বিনিয়োগ (ক্রয় + খরচ)', 'Total Investment (Purchase + Exp)')}
          value={formatCurrency(k.totalInvestment, numeralMode)}
          subtext={`${pickText(lang, 'ক্রয়', 'Purchase')}: ${formatCurrency(k.totalAnimalPurchases, numeralMode)} + ${pickText(lang, 'খরচ', 'Exp')}: ${formatCurrency(k.totalAdditionalExpenses, numeralMode)}`}
          icon={<Wallet className="w-5 h-5" />}
        />
        <StatCard
          label={pickText(lang, 'মোট বিক্রয় আয়', 'Total Sales Revenue')}
          value={formatCurrency(k.totalSalesRevenue, numeralMode)}
          subtext={`${pickText(lang, 'আজ', 'Today')}: ${formatCurrency(k.dailyRevenue, numeralMode)} | ${pickText(lang, 'মাস', 'Month')}: ${formatCurrency(k.monthlyRevenue, numeralMode)}`}
          icon={<TrendingUp className="w-5 h-5" />}
          tone="emerald"
        />
        {canViewProfit ? (
          <StatCard
            label={pickText(lang, 'নিট লাভ / ক্ষতি', 'Net Profit / Loss')}
            value={formatCurrency(k.netProfit, numeralMode)}
            subtext={`${pickText(lang, 'গ্রস লাভ', 'Gross')}: ${formatCurrency(k.grossProfit, numeralMode)}`}
            icon={<TrendingUp className="w-5 h-5" />}
            tone={k.netProfit >= 0 ? 'emerald' : 'rose'}
          />
        ) : (
          <StatCard
            label={pickText(lang, 'সক্রিয় ব্যাচ ও প্রাণী', 'Active Batches & Animals')}
            value={formatNum(k.totalAnimalsRemaining, numeralMode)}
            subtext={`${pickText(lang, 'সক্রিয় ব্যাচ', 'Active Batches')}: ${formatNum(k.activeBatches, numeralMode)}`}
            icon={<Package className="w-5 h-5" />}
          />
        )}
        <StatCard
          label={pickText(lang, 'মৃত্যুজনিত আর্থিক ক্ষতি', 'Mortality Financial Loss')}
          value={formatCurrency(k.mortalityLoss, numeralMode)}
          subtext={`${pickText(lang, 'অপেক্ষমাণ অর্ডার', 'Pending Orders')}: ${formatNum(k.pendingOrdersCount, numeralMode)}`}
          icon={<AlertTriangle className="w-5 h-5" />}
          tone={k.mortalityLoss > 0 ? 'rose' : 'neutral'}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={pickText(lang, 'অবশিষ্ট মোট স্টক মূল্য', 'Available Stock Valuation')}
          value={formatCurrency(k.availableStockValue, numeralMode)}
          subtext={`${pickText(lang, 'অব্যবহৃত খাদ্য', 'Unused Feed')}: ${formatCurrency(k.unusedFeedValue, numeralMode)}`}
          icon={<Package className="w-5 h-5" />}
          tone="sky"
        />
        <StatCard
          label={pickText(lang, 'অবিক্রিত পণ্যে আনুমানিক লাভ', 'Est. Profit on Unsold Stock')}
          value={formatCurrency(k.estimatedProfitOnUnsold, numeralMode)}
          subtext={`${pickText(lang, 'জীবিত প্রাণী', 'Living Animals')}: ${formatNum(k.totalAnimalsRemaining, numeralMode)}`}
          tone="emerald"
        />
        <StatCard
          label={pickText(lang, 'ক্রেতাদের কাছে পাওনা', 'Customer Receivables')}
          value={formatCurrency(k.customerReceivables, numeralMode)}
          icon={<Users className="w-5 h-5" />}
          tone={k.customerReceivables > 0 ? 'amber' : 'neutral'}
        />
        <StatCard
          label={pickText(lang, 'সরবরাহকারীদের দেনা', 'Supplier Payables')}
          value={formatCurrency(k.supplierPayables, numeralMode)}
          icon={<ShoppingCart className="w-5 h-5" />}
          tone={k.supplierPayables > 0 ? 'rose' : 'neutral'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900">
              {pickText(lang, 'মাসিক আয় বনাম খরচ প্রবণতা', 'Monthly Revenue vs Expenses')}
            </h2>
            <span className="text-xs font-mono-num text-slate-500">
              {pickText(lang, 'বার্ষিক আয়', 'Yearly')}: {formatCurrency(k.yearlyRevenue, numeralMode)}
            </span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(val) => formatCurrency(Number(val ?? 0), numeralMode)} />
                <Legend />
                <Bar dataKey="revenue" name={pickText(lang, 'বিক্রয় আয়', 'Revenue')} fill="#047857" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name={pickText(lang, 'ব্যবহৃত খরচ', 'Expenses')} fill="#d97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900">
              {pickText(lang, 'প্রাণী ক্যাটাগরি অনুযায়ী বিনিয়োগ ও আয়', 'Investment & Revenue by Category')}
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('batches')}
              className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
            >
              {pickText(lang, 'ব্যাচ দেখুন →', 'View Batches →')}
            </button>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(val) => formatCurrency(Number(val ?? 0), numeralMode)} />
                <Legend />
                <Bar dataKey="investment" name={pickText(lang, 'বিনিয়োগ', 'Investment')} fill="#334155" radius={[4, 4, 0, 0]} />
                <Bar dataKey="revenue" name={pickText(lang, 'বিক্রয় আয়', 'Revenue')} fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
