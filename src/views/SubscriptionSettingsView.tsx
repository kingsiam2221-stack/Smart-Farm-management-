import React, { useEffect, useState } from 'react';
import { Globe, CreditCard, ShieldCheck, Printer, CheckCircle2 } from 'lucide-react';
import type {
  LangMode,
  NumeralMode,
  PaymentTxRecord,
  SupportRequestRecord,
  UserAccount,
} from '../types/saas';
import { apiRequest } from '../utils/api';
import { printReportAsPdf } from '../utils/export';
import { formatCurrency, formatDateDisplay, pickText } from '../utils/translations';
import { Modal, PageHeader, inputCls, labelCls, primaryBtnCls, secondaryBtnCls } from '../components/UI';

interface SubInfoResponse {
  plans: {
    monthlyPrice: number;
    yearlyPrice: number;
    trialDays: number;
    bkashMerchant: string;
    nagadMerchant: string;
  };
  transactions: PaymentTxRecord[];
  supportRequests: SupportRequestRecord[];
}

export function SubscriptionSettingsView({
  lang,
  numeralMode,
  user,
  onLangChange,
  onNumeralChange,
  onUserUpdated,
  onToast,
}: {
  lang: LangMode;
  numeralMode: NumeralMode;
  user: UserAccount;
  onLangChange: (l: LangMode) => Promise<void>;
  onNumeralChange: (n: NumeralMode) => void;
  onUserUpdated: (u: UserAccount) => void;
  onToast: (type: 'success' | 'error', msg: string) => void;
}) {
  const [info, setInfo] = useState<SubInfoResponse | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [gateway, setGateway] = useState<'bkash' | 'nagad' | 'card' | 'international'>('bkash');
  const [challenge, setChallenge] = useState<{
    txRef: string;
    plan: 'monthly' | 'yearly';
    gateway: string;
    amount: number;
    verificationSignature: string;
  } | null>(null);
  const [gatewayTrxId, setGatewayTrxId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadInfo = async () => {
    try {
      const res = await apiRequest<SubInfoResponse>('/api/subscriptions/info');
      setInfo(res);
    } catch {
      // ignore for roles without access
    }
  };

  useEffect(() => {
    if (user.role === 'business_owner' || user.role === 'staff') {
      loadInfo();
    }
  }, [user.role]);

  const handleInitiate = async (plan: 'monthly' | 'yearly') => {
    setSelectedPlan(plan);
    setSubmitting(true);
    try {
      const res = await apiRequest<{
        txRef: string;
        plan: 'monthly' | 'yearly';
        gateway: string;
        amount: number;
        verificationSignature: string;
      }>('/api/subscriptions/initiate', {
        method: 'POST',
        body: JSON.stringify({ plan, gateway }),
      });
      setChallenge(res);
      setGatewayTrxId('');
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Payment initiation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    setSubmitting(true);
    try {
      const res = await apiRequest<{ invoiceNumber: string; user: UserAccount }>('/api/subscriptions/verify', {
        method: 'POST',
        body: JSON.stringify({
          txRef: challenge.txRef,
          gatewayTrxId,
          verificationSignature: challenge.verificationSignature,
        }),
      });
      onToast(
        'success',
        pickText(
          lang,
          `পেমেন্ট যাচাই ও সাবস্ক্রিপশন সক্রিয় হয়েছে (${res.invoiceNumber})`,
          `Payment verified & subscription activated (${res.invoiceNumber})`
        )
      );
      if (res.user) onUserUpdated(res.user);
      setChallenge(null);
      await loadInfo();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSupportRespond = async (reqId: string, decision: 'approved' | 'revoked') => {
    try {
      await apiRequest(`/api/support-access/${reqId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      onToast('success', pickText(lang, 'সাপোর্ট অ্যাক্সেস সিদ্ধান্ত সংরক্ষিত হয়েছে', 'Support access updated'));
      await loadInfo();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={pickText(lang, 'ভাষা, সাবস্ক্রিপশন ও নিরাপত্তা সেটিংস', 'Language, Subscription & Security Settings')}
        subtitle={pickText(
          lang,
          'ভাষা পরিবর্তন করলে আপনার কোনো তথ্য মুছে যাবে না; প্রতিটি ব্যবহারকারীর ভাষা আলাদাভাবে সংরক্ষিত হয়',
          'Language preferences are saved per user without resetting data; manage billing and support permissions here'
        )}
      />

      {/* Language & Numerals */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
            <Globe className="w-4 h-4 text-emerald-700" />
            <span>{pickText(lang, 'পছন্দের ভাষা (ডাটাবেসে সংরক্ষিত)', 'Preferred Language (Persisted in DB)')}</span>
          </div>
          <p className="text-xs text-slate-500">
            {pickText(lang, 'সিস্টেমের সব মেনু, ফর্ম, রিপোর্ট এবং ড্যাশবোর্ড তাৎক্ষণিক পরিবর্তন হবে।', 'Switches all menus, forms, reports, and dashboards.')}
          </p>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => onLangChange('bn')}
              className={lang === 'bn' ? primaryBtnCls : secondaryBtnCls}
            >
              বাংলা (Bengali)
            </button>
            <button
              type="button"
              onClick={() => onLangChange('en')}
              className={lang === 'en' ? primaryBtnCls : secondaryBtnCls}
            >
              English
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="font-bold text-slate-900 text-sm">
            {pickText(lang, 'সংখ্যা ও টাকার অঙ্ক প্রদর্শন', 'Number & Currency Format')}
          </p>
          <p className="text-xs text-slate-500">
            {pickText(lang, 'বাংলা (১২৩) অথবা ইংরেজি (123) অঙ্ক নির্বাচন করুন।', 'Choose Bengali or English digits.')}
          </p>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => onNumeralChange('bn')}
              className={numeralMode === 'bn' ? primaryBtnCls : secondaryBtnCls}
            >
              ১২৩ (বাংলা)
            </button>
            <button
              type="button"
              onClick={() => onNumeralChange('en')}
              className={numeralMode === 'en' ? primaryBtnCls : secondaryBtnCls}
            >
              123 (English)
            </button>
          </div>
        </div>
      </div>

      {/* Subscription Management (Owner) */}
      {user.role === 'business_owner' && info && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <p className="text-xs text-slate-500 font-semibold uppercase">
                {pickText(lang, 'বর্তমান সাবস্ক্রিপশন', 'Current Subscription')}
              </p>
              <p className="text-lg font-bold text-slate-900 mt-0.5">
                {user.subscriptionPlan?.toUpperCase()} —{' '}
                <span className={user.subscriptionStatus === 'expired' ? 'text-rose-600' : 'text-emerald-700'}>
                  {user.subscriptionStatus?.toUpperCase()}
                </span>
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {pickText(lang, 'মেয়াদ শেষ:', 'Valid until:')}{' '}
                <strong className="font-mono-num">{formatDateDisplay(user.subscriptionEndsAt, numeralMode)}</strong>
              </p>
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'পেমেন্ট মাধ্যম', 'Payment Gateway')}</label>
              <select
                value={gateway}
                onChange={(e) => setGateway(e.target.value as 'bkash' | 'nagad' | 'card' | 'international')}
                className={inputCls}
              >
                <option value="bkash">bKash ({info.plans.bkashMerchant})</option>
                <option value="nagad">Nagad ({info.plans.nagadMerchant})</option>
                <option value="card">{pickText(lang, 'ডেবিট / ক্রেডিট কার্ড', 'Debit / Credit Card')}</option>
                <option value="international">{pickText(lang, 'আন্তর্জাতিক কার্ড / পেমেন্ট', 'International Payment')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
              <div>
                <p className="text-xs font-bold uppercase text-emerald-700">{pickText(lang, 'মাসিক প্ল্যান', 'Monthly Plan')}</p>
                <p className="text-3xl font-bold font-mono-num text-slate-900 mt-1">
                  {formatCurrency(info.plans.monthlyPrice, numeralMode)}{' '}
                  <span className="text-sm font-normal text-slate-500">/ {pickText(lang, 'মাস', 'month')}</span>
                </p>
                <p className="text-xs text-slate-600 mt-2">
                  {pickText(lang, 'সকল ফিচার, আনলিমিটেড ব্যাচ, ক্রেতা পোর্টাল ও স্টাফ অনুমতি।', 'All modules, unlimited batches, customer portal, and staff roles.')}
                </p>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleInitiate('monthly')}
                className={primaryBtnCls + ' w-full'}
              >
                <CreditCard className="w-4 h-4" />
                <span>{pickText(lang, 'মাসিক প্ল্যান নবায়ন / আপগ্রেড', 'Subscribe Monthly')}</span>
              </button>
            </div>

            <div className="border-2 border-emerald-700 rounded-xl p-5 flex flex-col justify-between space-y-4 bg-emerald-50/30">
              <div>
                <p className="text-xs font-bold uppercase text-emerald-800">{pickText(lang, 'বার্ষিক প্ল্যান (প্রিমিয়াম)', 'Yearly Plan')}</p>
                <p className="text-3xl font-bold font-mono-num text-slate-900 mt-1">
                  {formatCurrency(info.plans.yearlyPrice, numeralMode)}{' '}
                  <span className="text-sm font-normal text-slate-500">/ {pickText(lang, 'বছর', 'year')}</span>
                </p>
                <p className="text-xs text-slate-600 mt-2">
                  {pickText(lang, 'পূর্ণ ৩৬৫ দিন নিরবচ্ছিন্ন বাণিজ্যিক সেবা ও অগ্রাধিকার সাপোর্ট।', 'Full 365 days uninterrupted access & priority support.')}
                </p>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleInitiate('yearly')}
                className={primaryBtnCls + ' w-full'}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{pickText(lang, 'বার্ষিক প্ল্যান সক্রিয় করুন', 'Subscribe Yearly')}</span>
              </button>
            </div>
          </div>

          {/* Payment History & Invoices */}
          {info.transactions.length > 0 && (
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-slate-900">{pickText(lang, 'পেমেন্ট ও ইনভয়েস ইতিহাস', 'Payment & Invoice History')}</h3>
                <button type="button" onClick={printReportAsPdf} className={secondaryBtnCls + ' !min-h-[34px] !text-xs no-print'}>
                  <Printer className="w-3.5 h-3.5" />
                  <span>{pickText(lang, 'ইনভয়েস প্রিন্ট', 'Print Invoice')}</span>
                </button>
              </div>
              <div className="border border-slate-200 rounded-lg overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">{pickText(lang, 'ইনভয়েস / রেফ', 'Invoice / Ref')}</th>
                      <th className="px-3 py-2">{pickText(lang, 'প্ল্যান ও মাধ্যম', 'Plan & Gateway')}</th>
                      <th className="px-3 py-2">TrxID</th>
                      <th className="px-3 py-2 text-right">{pickText(lang, 'পরিমাণ', 'Amount')}</th>
                      <th className="px-3 py-2 text-right">{pickText(lang, 'অবস্থা', 'Status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {info.transactions.map((t) => (
                      <tr key={t.id}>
                        <td className="px-3 py-2 font-mono-num">{t.invoiceNumber || t.txRef}</td>
                        <td className="px-3 py-2 uppercase">{t.plan} • {t.gateway}</td>
                        <td className="px-3 py-2 font-mono-num">{t.gatewayTrxId || '—'}</td>
                        <td className="px-3 py-2 text-right font-mono-num font-bold">{formatCurrency(t.amount, numeralMode)}</td>
                        <td className="px-3 py-2 text-right font-semibold uppercase">{t.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Support Access Requests from Super Admin */}
          {info.supportRequests.length > 0 && (
            <div className="pt-2 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                <span>{pickText(lang, 'সুপার অ্যাডমিন সাপোর্ট অ্যাক্সেস অনুরোধ', 'Super Admin Support Access Requests')}</span>
              </div>
              {info.supportRequests.map((sr) => (
                <div key={sr.id} className="border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <p className="font-semibold text-slate-900">{sr.superAdminName || 'Super Admin'}</p>
                    <p className="text-slate-600">{sr.reason}</p>
                    <p className="text-slate-400">Status: {sr.status}</p>
                  </div>
                  <div className="flex gap-2">
                    {sr.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => handleSupportRespond(sr.id, 'approved')}
                        className={primaryBtnCls + ' !min-h-[32px] !text-xs'}
                      >
                        {pickText(lang, 'অনুমোদন দিন (৪৮ ঘণ্টা)', 'Approve (48h)')}
                      </button>
                    )}
                    {sr.status !== 'revoked' && (
                      <button
                        type="button"
                        onClick={() => handleSupportRespond(sr.id, 'revoked')}
                        className={secondaryBtnCls + ' !min-h-[32px] !text-xs text-rose-700'}
                      >
                        {pickText(lang, 'বাতিল করুন', 'Revoke')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Backend-verified Payment Challenge Modal */}
      <Modal
        open={Boolean(challenge)}
        onClose={() => setChallenge(null)}
        title={pickText(lang, 'সার্ভার-যাচাইকৃত পেমেন্ট সম্পন্ন করুন', 'Complete Server-Verified Payment')}
        lang={lang}
      >
        {challenge && (
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1.5 text-xs">
              <p>
                {pickText(lang, 'রেফারেন্স কোড:', 'Reference:')} <strong className="font-mono-num">{challenge.txRef}</strong>
              </p>
              <p>
                {pickText(lang, 'প্ল্যান:', 'Plan:')} <strong className="uppercase">{selectedPlan}</strong> ({challenge.gateway.toUpperCase()})
              </p>
              <p>
                {pickText(lang, 'পরিশোধযোগ্য টাকা:', 'Payable Amount:')}{' '}
                <strong className="font-mono-num text-emerald-700 text-sm">{formatCurrency(challenge.amount, numeralMode)}</strong>
              </p>
            </div>
            <div>
              <label className={labelCls}>
                {pickText(lang, 'Gateway Transaction ID (TrxID — কমপক্ষে ৬ অক্ষর) *', 'Gateway Transaction ID (min 6 chars) *')}
              </label>
              <input
                required
                minLength={6}
                value={gatewayTrxId}
                onChange={(e) => setGatewayTrxId(e.target.value)}
                placeholder="BKS9X84K2M"
                className={inputCls}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setChallenge(null)} className={secondaryBtnCls}>
                {pickText(lang, 'বাতিল', 'Cancel')}
              </button>
              <button type="submit" disabled={submitting} className={primaryBtnCls}>
                {submitting ? pickText(lang, 'যাচাই হচ্ছে...', 'Verifying...') : pickText(lang, 'পেমেন্ট যাচাই ও সক্রিয় করুন', 'Verify & Activate')}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
