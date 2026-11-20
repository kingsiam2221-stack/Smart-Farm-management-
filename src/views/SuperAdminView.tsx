import React, { useEffect, useState } from 'react';
import { Building2, Users, CreditCard, Settings, ShieldAlert, Eye } from 'lucide-react';
import type {
  BusinessDirectoryItem,
  LangMode,
  NumeralMode,
  PaymentTxRecord,
  SupportRequestRecord,
} from '../types/saas';
import { apiRequest } from '../utils/api';
import { formatCurrency, formatDateDisplay, formatNum, pickText } from '../utils/translations';
import {
  Modal,
  PageHeader,
  StatCard,
  inputCls,
  labelCls,
  primaryBtnCls,
  secondaryBtnCls,
} from '../components/UI';

interface SuperAdminOverview {
  metrics: {
    totalBusinesses: number;
    totalCustomers: number;
    totalStaff: number;
    activeSubscriptions: number;
    expiredSubscriptions: number;
    monthlyRevenue: number;
    yearlyRevenue: number;
    totalSubscriptionRevenue: number;
  };
  businesses: BusinessDirectoryItem[];
  users: Array<{
    id: string;
    businessId: string | null;
    role: string;
    name: string;
    email: string;
    phone: string;
    active: boolean;
    createdAt: string;
  }>;
  transactions: PaymentTxRecord[];
  settings: {
    monthlyPrice: number;
    yearlyPrice: number;
    trialDays: number;
    bkashMerchant: string;
    nagadMerchant: string;
    supportEmail: string;
  };
  supportRequests: SupportRequestRecord[];
}

export function SuperAdminView({
  activeTab,
  lang,
  numeralMode,
  onToast,
}: {
  activeTab: string;
  lang: LangMode;
  numeralMode: NumeralMode;
  onToast: (type: 'success' | 'error', msg: string) => void;
}) {
  const [data, setData] = useState<SuperAdminOverview | null>(null);
  const [monthlyPrice, setMonthlyPrice] = useState('50');
  const [yearlyPrice, setYearlyPrice] = useState('1000');
  const [trialDays, setTrialDays] = useState('14');
  const [bkashMerchant, setBkashMerchant] = useState('');
  const [nagadMerchant, setNagadMerchant] = useState('');

  const [reqBizId, setReqBizId] = useState('');
  const [reqReason, setReqReason] = useState('');
  const [auditedSummary, setAuditedSummary] = useState<{
    businessName: string;
    batchesCount: number;
    activeAnimals: number;
    totalInvestment: number;
    totalRevenue: number;
  } | null>(null);

  const loadOverview = async () => {
    try {
      const res = await apiRequest<SuperAdminOverview>('/api/super-admin/overview');
      setData(res);
      setMonthlyPrice(String(res.settings.monthlyPrice));
      setYearlyPrice(String(res.settings.yearlyPrice));
      setTrialDays(String(res.settings.trialDays));
      setBkashMerchant(res.settings.bkashMerchant);
      setNagadMerchant(res.settings.nagadMerchant);
      if (res.businesses.length > 0 && !reqBizId) {
        setReqBizId(res.businesses[0].id);
      }
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed to load Super Admin console');
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const handleToggleBusiness = async (b: BusinessDirectoryItem) => {
    try {
      await apiRequest(`/api/super-admin/businesses/${b.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: b.status === 'active' ? 'suspended' : 'active' }),
      });
      onToast('success', pickText(lang, 'ব্যবসার অবস্থা আপডেট হয়েছে', 'Business status updated'));
      await loadOverview();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleExtendBusiness = async (b: BusinessDirectoryItem) => {
    try {
      await apiRequest(`/api/super-admin/businesses/${b.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ subscriptionStatus: 'active', extendDays: 30 }),
      });
      onToast('success', pickText(lang, '৩০ দিন সাবস্ক্রিপশন বাড়ানো হয়েছে', 'Extended subscription by 30 days'));
      await loadOverview();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleToggleUser = async (uid: string) => {
    try {
      await apiRequest(`/api/super-admin/users/${uid}/toggle`, { method: 'PATCH' });
      await loadOverview();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/super-admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          monthlyPrice: Number(monthlyPrice),
          yearlyPrice: Number(yearlyPrice),
          trialDays: Number(trialDays),
          bkashMerchant,
          nagadMerchant,
        }),
      });
      onToast('success', pickText(lang, 'প্ল্যাটফর্ম সেটিংস সংরক্ষিত হয়েছে', 'Platform settings saved'));
      await loadOverview();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Save failed');
    }
  };

  const handleRequestSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/super-admin/support-request', {
        method: 'POST',
        body: JSON.stringify({ businessId: reqBizId, reason: reqReason }),
      });
      onToast('success', pickText(lang, 'মালিকের অনুমোদনের জন্য অনুরোধ পাঠানো হয়েছে', 'Support access request sent to business owner'));
      setReqReason('');
      await loadOverview();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Request failed');
    }
  };

  const handleAuditedInspect = async (bId: string, bName: string) => {
    try {
      const res = await apiRequest<{
        batchesCount: number;
        activeAnimals: number;
        totalInvestment: number;
        totalRevenue: number;
      }>(`/api/super-admin/businesses/${bId}/audited-view`);
      setAuditedSummary({ businessName: bName, ...res });
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Access denied by tenant privacy policy');
    }
  };

  if (!data) {
    return <div className="p-8 text-sm text-slate-500">{pickText(lang, 'লোড হচ্ছে...', 'Loading Super Admin Console...')}</div>;
  }

  const m = data.metrics;

  if (activeTab === 'overview') {
    return (
      <div className="space-y-6">
        <PageHeader
          title={pickText(lang, 'সুপার অ্যাডমিন — SaaS প্ল্যাটফর্ম ওভারভিউ', 'Super Admin — SaaS Platform Overview')}
          subtitle={pickText(
            lang,
            'নিবন্ধিত ব্যবসা, সাবস্ক্রিপশন আয় ও সিস্টেম স্বাস্থ্য (ব্যবসার ব্যক্তিগত তথ্য মালিকের অনুমতি ছাড়া গোপন থাকে)',
            'Registered businesses, subscription revenue & platform health (private tenant financials strictly isolated)'
          )}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label={pickText(lang, 'মোট নিবন্ধিত ব্যবসা', 'Total Businesses')} value={formatNum(m.totalBusinesses, numeralMode)} icon={<Building2 className="w-5 h-5" />} />
          <StatCard label={pickText(lang, 'সক্রিয় সাবস্ক্রিপশন', 'Active Subscriptions')} value={formatNum(m.activeSubscriptions, numeralMode)} tone="emerald" />
          <StatCard label={pickText(lang, 'মোট ক্রেতা ও স্টাফ', 'Total Customers / Staff')} value={`${formatNum(m.totalCustomers, numeralMode)} / ${formatNum(m.totalStaff, numeralMode)}`} icon={<Users className="w-5 h-5" />} />
          <StatCard label={pickText(lang, 'মোট সাবস্ক্রিপশন আয়', 'Subscription Revenue')} value={formatCurrency(m.totalSubscriptionRevenue, numeralMode)} icon={<CreditCard className="w-5 h-5" />} tone="emerald" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label={pickText(lang, 'মাসিক প্ল্যান আয়', 'Monthly Plan Revenue')} value={formatCurrency(m.monthlyRevenue, numeralMode)} />
          <StatCard label={pickText(lang, 'বার্ষিক প্ল্যান আয়', 'Yearly Plan Revenue')} value={formatCurrency(m.yearlyRevenue, numeralMode)} />
          <StatCard label={pickText(lang, 'মেয়াদোত্তীর্ণ ব্যবসা', 'Expired Accounts')} value={formatNum(m.expiredSubscriptions, numeralMode)} tone={m.expiredSubscriptions > 0 ? 'rose' : 'neutral'} />
        </div>
      </div>
    );
  }

  if (activeTab === 'businesses') {
    return (
      <div className="space-y-6">
        <PageHeader
          title={pickText(lang, 'নিবন্ধিত ব্যবসা ও ব্যবহারকারী পরিচালনা', 'Businesses & User Directory')}
          subtitle={pickText(lang, 'সাবস্ক্রিপশন, অ্যাকাউন্ট স্থগিত বা সক্রিয় করা এবং স্টাফ/ক্রেতা নিয়ন্ত্রণ', 'Manage tenant status, subscription renewals, and user accounts')}
        />
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="px-4 py-3">{pickText(lang, 'ব্যবসা ও মালিক', 'Business & Owner')}</th>
                <th className="px-4 py-3">{pickText(lang, 'প্ল্যান ও মেয়াদ', 'Plan & Expiry')}</th>
                <th className="px-4 py-3 text-right">{pickText(lang, 'স্টাফ / ক্রেতা', 'Staff / Customers')}</th>
                <th className="px-4 py-3 text-right">{pickText(lang, 'অ্যাকশন', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.businesses.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-900">{b.name}</p>
                    <p className="text-xs text-slate-500">{b.ownerName} • {b.phone} • {b.city}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <p className="font-semibold uppercase">
                      {b.subscriptionPlan} ({b.subscriptionStatus})
                    </p>
                    <p className="font-mono-num text-slate-500">{formatDateDisplay(b.subscriptionEndsAt || b.trialEndsAt, numeralMode)}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-mono-num">
                    {formatNum(b.staffCount || 0, numeralMode)} / {formatNum(b.customerCount || 0, numeralMode)}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <button type="button" onClick={() => handleExtendBusiness(b)} className={secondaryBtnCls + ' !min-h-[34px] !text-xs'}>
                      +30d
                    </button>
                    <button type="button" onClick={() => handleToggleBusiness(b)} className={secondaryBtnCls + ' !min-h-[34px] !text-xs'}>
                      {b.status === 'active' ? pickText(lang, 'স্থগিত করুন', 'Suspend') : pickText(lang, 'সক্রিয় করুন', 'Reactivate')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <div className="px-4 py-3 border-b border-slate-200 font-bold text-sm text-slate-900">
            {pickText(lang, 'প্ল্যাটফর্ম ব্যবহারকারী তালিকা', 'Platform Users')}
          </div>
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Contact</th>
                <th className="px-4 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2.5 font-semibold text-slate-900">{u.name}</td>
                  <td className="px-4 py-2.5 uppercase font-mono-num">{u.role}</td>
                  <td className="px-4 py-2.5">{u.email || u.phone}</td>
                  <td className="px-4 py-2.5 text-right">
                    {u.role !== 'super_admin' && (
                      <button type="button" onClick={() => handleToggleUser(u.id)} className={secondaryBtnCls + ' !min-h-[30px] !text-xs'}>
                        {u.active ? 'Active' : 'Disabled'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (activeTab === 'subscriptions') {
    return (
      <div className="space-y-6">
        <PageHeader
          title={pickText(lang, 'সাবস্ক্রিপশন লেনদেন ও আয়', 'Subscriptions & Payment Ledger')}
          subtitle={pickText(lang, 'সার্ভার-যাচাইকৃত সকল সাবস্ক্রিপশন পেমেন্টের তালিকা', 'All verified subscription payments across businesses')}
        />
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="px-4 py-3">{pickText(lang, 'ব্যবসা', 'Business')}</th>
                <th className="px-4 py-3">{pickText(lang, 'ইনভয়েস / TrxID', 'Invoice / TrxID')}</th>
                <th className="px-4 py-3">{pickText(lang, 'প্ল্যান ও গেটওয়ে', 'Plan & Gateway')}</th>
                <th className="px-4 py-3 text-right">{pickText(lang, 'পরিমাণ', 'Amount')}</th>
                <th className="px-4 py-3 text-right">{pickText(lang, 'অবস্থা', 'Status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.transactions.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-semibold text-slate-900">{t.businessName}</td>
                  <td className="px-4 py-3 font-mono-num text-xs">
                    {t.invoiceNumber || t.txRef} • {t.gatewayTrxId || '—'}
                  </td>
                  <td className="px-4 py-3 uppercase text-xs">
                    {t.plan} • {t.gateway}
                  </td>
                  <td className="px-4 py-3 text-right font-mono-num font-bold">{formatCurrency(t.amount, numeralMode)}</td>
                  <td className="px-4 py-3 text-right uppercase text-xs font-semibold">{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (activeTab === 'settings') {
    return (
      <div className="space-y-6">
        <PageHeader
          title={pickText(lang, 'প্ল্যাটফর্ম মূল্য ও গেটওয়ে সেটিংস', 'Platform Pricing & Gateway Settings')}
          subtitle={pickText(lang, 'মাসিক ও বার্ষিক সাবস্ক্রিপশন ফি এবং মার্চেন্ট নম্বর কনফিগার করুন', 'Configure trial days, Monthly & Yearly pricing, and merchant accounts')}
        />
        <form onSubmit={handleSaveSettings} className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>{pickText(lang, 'মাসিক ফি (৳)', 'Monthly Price (৳)')}</label>
              <input type="number" min={1} value={monthlyPrice} onChange={(e) => setMonthlyPrice(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'বার্ষিক ফি (৳)', 'Yearly Price (৳)')}</label>
              <input type="number" min={1} value={yearlyPrice} onChange={(e) => setYearlyPrice(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'ফ্রি ট্রায়াল (দিন)', 'Free Trial Days')}</label>
              <input type="number" min={1} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>bKash Merchant</label>
              <input value={bkashMerchant} onChange={(e) => setBkashMerchant(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Nagad Merchant</label>
              <input value={nagadMerchant} onChange={(e) => setNagadMerchant(e.target.value)} className={inputCls} />
            </div>
          </div>
          <button type="submit" className={primaryBtnCls}>
            <Settings className="w-4 h-4" />
            <span>{pickText(lang, 'সেটিংস সংরক্ষণ করুন', 'Save Platform Settings')}</span>
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={pickText(lang, 'সাপোর্ট ও মালিক-অনুমোদিত অডিট অ্যাক্সেস', 'Controlled Support & Audited Access')}
        subtitle={pickText(
          lang,
          'ব্যবসার মালিকের অনুমোদন ছাড়া কোনো ব্যবসার আর্থিক তথ্য দেখা যায় না; প্রতিটি অ্যাক্সেস অডিট লগে সংরক্ষিত হয়',
          'Strict tenant privacy: inspecting business summaries requires explicit owner approval and writes an audit entry'
        )}
      />
      <form onSubmit={handleRequestSupport} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 max-w-2xl">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-emerald-700" />
          <span>{pickText(lang, 'সাপোর্ট অ্যাক্সেস অনুরোধ পাঠান', 'Request Owner-Approved Support Access')}</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{pickText(lang, 'ব্যবসা নির্বাচন করুন', 'Select Business')}</label>
            <select value={reqBizId} onChange={(e) => setReqBizId(e.target.value)} className={inputCls}>
              {data.businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{pickText(lang, 'কারণ লিখুন *', 'Support Reason *')}</label>
            <input required value={reqReason} onChange={(e) => setReqReason(e.target.value)} placeholder="Troubleshooting batch allocation" className={inputCls} />
          </div>
        </div>
        <button type="submit" className={primaryBtnCls}>
          {pickText(lang, 'মালিকের কাছে অনুরোধ পাঠান', 'Send Access Request')}
        </button>
      </form>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
            <tr>
              <th className="px-4 py-3">{pickText(lang, 'ব্যবসা', 'Business')}</th>
              <th className="px-4 py-3">{pickText(lang, 'কারণ', 'Reason')}</th>
              <th className="px-4 py-3">{pickText(lang, 'অবস্থা', 'Status')}</th>
              <th className="px-4 py-3 text-right">{pickText(lang, 'পরিদর্শন', 'Inspect')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.supportRequests.map((sr) => (
              <tr key={sr.id}>
                <td className="px-4 py-3 font-semibold text-slate-900">{sr.businessName}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{sr.reason}</td>
                <td className="px-4 py-3 uppercase text-xs font-semibold">{sr.status}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleAuditedInspect(sr.businessId, sr.businessName || sr.businessId)}
                    className={secondaryBtnCls + ' !min-h-[34px] !text-xs'}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{pickText(lang, 'অডিট ভিউ', 'Audited View')}</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={Boolean(auditedSummary)} onClose={() => setAuditedSummary(null)} title={auditedSummary?.businessName || ''} lang={lang}>
        {auditedSummary && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <StatCard label="Batches" value={formatNum(auditedSummary.batchesCount, numeralMode)} />
            <StatCard label="Active Animals" value={formatNum(auditedSummary.activeAnimals, numeralMode)} />
            <StatCard label="Total Investment" value={formatCurrency(auditedSummary.totalInvestment, numeralMode)} />
            <StatCard label="Total Revenue" value={formatCurrency(auditedSummary.totalRevenue, numeralMode)} tone="emerald" />
          </div>
        )}
      </Modal>
    </div>
  );
}
