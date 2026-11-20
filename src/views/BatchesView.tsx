import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Skull,
  ShoppingBag,
  Trash2,
  Eye,
  Calculator,
} from 'lucide-react';
import type {
  AnimalCategory,
  BatchDeathRecord,
  BatchSaleRecord,
  BatchWithFinancials,
  LangMode,
  NumeralMode,
  PartyRecord,
  UserAccount,
} from '../types/saas';
import { apiRequest, newIdempotencyKey } from '../utils/api';
import {
  ANIMAL_CATEGORY_LABELS,
  formatCurrency,
  formatDateDisplay,
  formatNum,
  pickText,
} from '../utils/translations';
import {
  EmptyState,
  Modal,
  PageHeader,
  StatCard,
  inputCls,
  labelCls,
  primaryBtnCls,
  secondaryBtnCls,
} from '../components/UI';

const CATEGORIES = Object.keys(ANIMAL_CATEGORY_LABELS) as AnimalCategory[];

export function BatchesView({
  lang,
  numeralMode,
  user,
  onToast,
}: {
  lang: LangMode;
  numeralMode: NumeralMode;
  user: UserAccount;
  onToast: (type: 'success' | 'error', msg: string) => void;
}) {
  const [batches, setBatches] = useState<BatchWithFinancials[]>([]);
  const [deaths, setDeaths] = useState<BatchDeathRecord[]>([]);
  const [sales, setSales] = useState<BatchSaleRecord[]>([]);
  const [parties, setParties] = useState<PartyRecord[]>([]);
  const [catFilter, setCatFilter] = useState<string>('all');
  const [subTab, setSubTab] = useState<'batches' | 'sales' | 'deaths'>('batches');

  const [createOpen, setCreateOpen] = useState(false);
  const [detailBatch, setDetailBatch] = useState<BatchWithFinancials | null>(null);
  const [deathBatch, setDeathBatch] = useState<BatchWithFinancials | null>(null);
  const [saleBatch, setSaleBatch] = useState<BatchWithFinancials | null>(null);

  // Batch creation form
  const [batchCode, setBatchCode] = useState('');
  const [category, setCategory] = useState<AnimalCategory>('chicken');
  const [breed, setBreed] = useState('');
  const [initialQuantity, setInitialQuantity] = useState('500');
  const [purchasePrice, setPurchasePrice] = useState('50');
  const [initialWeightKg, setInitialWeightKg] = useState('0.05');
  const [supplierName, setSupplierName] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  // Death form
  const [deathQty, setDeathQty] = useState('1');
  const [deathDate, setDeathDate] = useState(new Date().toISOString().slice(0, 10));
  const [deathCause, setDeathCause] = useState('');
  const [deathNotes, setDeathNotes] = useState('');

  // Sale form
  const [saleQty, setSaleQty] = useState('10');
  const [salePrice, setSalePrice] = useState('85');
  const [salePaid, setSalePaid] = useState('');
  const [saleCustId, setSaleCustId] = useState('');
  const [saleCustName, setSaleCustName] = useState('');
  const [saleCustPhone, setSaleCustPhone] = useState('');
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
  const [saleNotes, setSaleNotes] = useState('');

  const canAdd = user.role === 'business_owner' || user.permissions['animals.add'];
  const canEdit = user.role === 'business_owner' || user.permissions['animals.edit'];
  const canDelete = user.role === 'business_owner' || user.permissions['animals.delete'];
  const canViewSales = user.role === 'business_owner' || user.permissions['finance.view_sales'];
  const canViewProfit = user.role === 'business_owner' || user.permissions['finance.view_profit'];

  const loadAll = async () => {
    try {
      const bRes = await apiRequest<BatchWithFinancials[]>('/api/batches');
      setBatches(bRes);
      const dRes = await apiRequest<BatchDeathRecord[]>('/api/batch-deaths');
      setDeaths(dRes);
      if (canViewSales) {
        const sRes = await apiRequest<BatchSaleRecord[]>('/api/batch-sales');
        setSales(sRes);
      }
      if (user.role === 'business_owner' || user.permissions['customers.view']) {
        const pRes = await apiRequest<PartyRecord[]>('/api/parties');
        setParties(pRes);
      }
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed to load batches');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const filteredBatches = useMemo(
    () => (catFilter === 'all' ? batches : batches.filter((b) => b.category === catFilter)),
    [batches, catFilter]
  );

  const summary = useMemo(() => {
    const living = batches.reduce((s, b) => s + b.remainingQuantity, 0);
    const inv = batches.reduce((s, b) => s + b.totalInvestment, 0);
    const rev = batches.reduce((s, b) => s + b.totalSalesRevenue, 0);
    const prof = batches.reduce((s, b) => s + b.realizedProfit, 0);
    return { living, inv, rev, prof };
  }, [batches]);

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/batches', {
        method: 'POST',
        body: JSON.stringify({
          batchCode: batchCode.trim() || undefined,
          category,
          breed,
          initialQuantity: Number(initialQuantity),
          purchasePricePerUnit: Number(purchasePrice),
          initialWeightKg: Number(initialWeightKg),
          supplierName,
          purchaseDate,
          notes,
          idempotencyKey: newIdempotencyKey(),
        }),
      });
      onToast('success', pickText(lang, 'নতুন ব্যাচ সফলভাবে তৈরি হয়েছে', 'Animal batch created'));
      setCreateOpen(false);
      setBatchCode('');
      setBreed('');
      setNotes('');
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleRecordDeath = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deathBatch) return;
    try {
      await apiRequest('/api/batch-deaths', {
        method: 'POST',
        body: JSON.stringify({
          batchId: deathBatch.id,
          quantity: Number(deathQty),
          date: deathDate,
          cause: deathCause,
          notes: deathNotes,
          idempotencyKey: newIdempotencyKey(),
        }),
      });
      onToast('success', pickText(lang, 'মৃত্যু ও আর্থিক ক্ষতি রেকর্ড হয়েছে', 'Mortality and financial loss recorded'));
      setDeathBatch(null);
      setDeathCause('');
      setDeathNotes('');
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleRecordSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleBatch) return;
    const total = (Number(saleQty) || 0) * (Number(salePrice) || 0);
    try {
      await apiRequest('/api/batch-sales', {
        method: 'POST',
        body: JSON.stringify({
          batchId: saleBatch.id,
          quantity: Number(saleQty),
          unitSellingPrice: Number(salePrice),
          paidAmount: salePaid === '' ? total : Number(salePaid),
          customerId: saleCustId || undefined,
          customerName: saleCustName,
          customerPhone: saleCustPhone,
          date: saleDate,
          notes: saleNotes,
          idempotencyKey: newIdempotencyKey(),
        }),
      });
      onToast('success', pickText(lang, 'বিক্রয় ও প্রকৃত লাভ স্বয়ংক্রিয়ভাবে হিসাব হয়েছে', 'Batch sale & realized profit recorded'));
      setSaleBatch(null);
      setSalePaid('');
      setSaleCustId('');
      setSaleCustName('');
      setSaleCustPhone('');
      setSaleNotes('');
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleDeleteBatch = async (b: BatchWithFinancials) => {
    try {
      await apiRequest(`/api/batches/${b.id}`, { method: 'DELETE' });
      onToast('success', pickText(lang, 'ব্যাচ মুছে ফেলা হয়েছে', 'Batch deleted'));
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const customers = useMemo(() => parties.filter((p) => p.type === 'customer'), [parties]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={pickText(lang, 'প্রাণীর ব্যাচ ও স্বয়ংক্রিয় কস্টিং ইঞ্জিন', 'Animal Batches & Automatic Cost Engine')}
        subtitle={pickText(
          lang,
          'প্রতিটি ব্যাচের ক্রয়মূল্য + খাদ্য + ওষুধ + অন্যান্য খরচ, প্রতিটি প্রাণীর গড় খরচ ও লাভ-ক্ষতি',
          'Per-batch investment breakdown, real-time cost per animal, realized profit, and unsold valuation'
        )}
        action={
          canAdd && (
            <button type="button" onClick={() => setCreateOpen(true)} className={primaryBtnCls}>
              <Plus className="w-4 h-4" />
              <span>{pickText(lang, 'নতুন ব্যাচ যোগ করুন', 'New Animal Batch')}</span>
            </button>
          )
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={pickText(lang, 'মোট ব্যাচ', 'Total Batches')}
          value={formatNum(batches.length, numeralMode)}
          subtext={`${pickText(lang, 'জীবিত প্রাণী', 'Living Animals')}: ${formatNum(summary.living, numeralMode)}`}
        />
        <StatCard
          label={pickText(lang, 'মোট ব্যাচ বিনিয়োগ', 'Total Batch Investment')}
          value={formatCurrency(summary.inv, numeralMode)}
          icon={<Calculator className="w-5 h-5" />}
        />
        <StatCard
          label={pickText(lang, 'মোট ব্যাচ বিক্রয়', 'Total Batch Sales')}
          value={formatCurrency(summary.rev, numeralMode)}
          tone="emerald"
        />
        {canViewProfit && (
          <StatCard
            label={pickText(lang, 'অর্জিত প্রকৃত লাভ', 'Realized Net Profit')}
            value={formatCurrency(summary.prof, numeralMode)}
            tone={summary.prof >= 0 ? 'emerald' : 'rose'}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {(['batches', 'sales', 'deaths'] as const).map((tab) => {
            if (tab === 'sales' && !canViewSales) return null;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setSubTab(tab)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  subTab === tab ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab === 'batches'
                  ? pickText(lang, 'সব ব্যাচ', 'All Batches')
                  : tab === 'sales'
                    ? pickText(lang, 'বিক্রয় তালিকা', 'Batch Sales')
                    : pickText(lang, 'মৃত্যু রেকর্ড', 'Mortality Records')}
              </button>
            );
          })}
        </div>

        {subTab === 'batches' && (
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className={inputCls + ' !w-auto min-w-[180px]'}>
            <option value="all">{pickText(lang, 'সব ধরন (ক্যাটাগরি)', 'All Animal Categories')}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {ANIMAL_CATEGORY_LABELS[c][lang]}
              </option>
            ))}
          </select>
        )}
      </div>

      {subTab === 'batches' && (
        <>
          {filteredBatches.length === 0 ? (
            <EmptyState
              title={pickText(lang, 'কোনো প্রাণী ব্যাচ নেই', 'No Animal Batches Yet')}
              description={pickText(
                lang,
                'মুরগি, হাঁস, গরু, ছাগল বা অন্য প্রাণীর প্রথম ব্যাচ তৈরি করে স্বয়ংক্রিয় খরচ ও লাভের হিসাব শুরু করুন।',
                'Create your first animal batch to start automatic cost calculation and profit tracking.'
              )}
              action={
                canAdd && (
                  <button type="button" onClick={() => setCreateOpen(true)} className={primaryBtnCls}>
                    <Plus className="w-4 h-4" />
                    <span>{pickText(lang, 'নতুন ব্যাচ তৈরি', 'Create Batch')}</span>
                  </button>
                )
              }
            />
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {filteredBatches.map((b) => (
                <div key={b.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-bold text-slate-900 font-mono-num">{b.batchCode}</span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          {ANIMAL_CATEGORY_LABELS[b.category]?.[lang] || b.category}
                        </span>
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded ${
                            b.status === 'active' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {b.status === 'active' ? pickText(lang, 'সক্রিয়', 'Active') : b.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {b.breed || pickText(lang, 'সাধারণ জাত', 'Standard Breed')} •{' '}
                        {pickText(lang, 'ক্রয়', 'Purchased')}: {formatDateDisplay(b.purchaseDate, numeralMode)} •{' '}
                        {b.supplierName}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setDetailBatch(b)}
                        className={secondaryBtnCls + ' !min-h-[36px] !px-2.5 !text-xs'}
                        title={pickText(lang, 'বিস্তারিত খরচ দেখুন', 'Cost Breakdown')}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{pickText(lang, 'হিসাব', 'Cost')}</span>
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDeleteBatch(b)}
                          className="min-h-[36px] min-w-[36px] rounded-lg border border-slate-200 text-rose-600 hover:bg-rose-50 flex items-center justify-center cursor-pointer"
                          title={pickText(lang, 'মুছে ফেলুন', 'Delete')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 bg-slate-50 rounded-lg p-3 text-center">
                    <div>
                      <p className="text-[11px] text-slate-500">{pickText(lang, 'শুরু', 'Initial')}</p>
                      <p className="text-sm font-bold text-slate-900 font-mono-num tabular-nums">
                        {formatNum(b.initialQuantity, numeralMode)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">{pickText(lang, 'মৃত্যু', 'Deaths')}</p>
                      <p className="text-sm font-bold text-rose-600 font-mono-num tabular-nums">
                        {formatNum(b.deathsQuantity, numeralMode)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">{pickText(lang, 'বিক্রয়', 'Sold')}</p>
                      <p className="text-sm font-bold text-sky-700 font-mono-num tabular-nums">
                        {formatNum(b.soldQuantity, numeralMode)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">{pickText(lang, 'অবশিষ্ট', 'Remaining')}</p>
                      <p className="text-sm font-bold text-emerald-700 font-mono-num tabular-nums">
                        {formatNum(b.remainingQuantity, numeralMode)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <p className="text-slate-500">{pickText(lang, 'ক্রয় + অতিরিক্ত খরচ', 'Purchase + Add. Exp')}</p>
                      <p className="font-bold text-slate-900 font-mono-num tabular-nums mt-0.5">
                        {formatCurrency(b.totalPurchaseCost, numeralMode)} + {formatCurrency(b.totalAdditionalExpenses, numeralMode)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">{pickText(lang, 'মোট বিনিয়োগ', 'Total Investment')}</p>
                      <p className="font-bold text-slate-900 font-mono-num tabular-nums mt-0.5">
                        {formatCurrency(b.totalInvestment, numeralMode)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">{pickText(lang, 'প্রাণী প্রতি গড় খরচ', 'Cost / Animal')}</p>
                      <p className="font-bold text-emerald-800 font-mono-num tabular-nums mt-0.5">
                        {formatCurrency(b.costPerAnimal, numeralMode, 2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">{pickText(lang, 'অবশিষ্ট স্টক মূল্য', 'Remaining Value')}</p>
                      <p className="font-bold text-slate-900 font-mono-num tabular-nums mt-0.5">
                        {formatCurrency(b.remainingInventoryValue, numeralMode)}
                      </p>
                    </div>
                  </div>

                  {canViewProfit && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                      <span className="text-slate-600">
                        {pickText(lang, 'অর্জিত লাভ', 'Realized Profit')}:{' '}
                        <strong className={`font-mono-num ${b.realizedProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {formatCurrency(b.realizedProfit, numeralMode)}
                        </strong>
                      </span>
                      <span className="text-slate-600">
                        {pickText(lang, 'অবিক্রিতে আনুমানিক লাভ', 'Est. Unsold Profit')}:{' '}
                        <strong className="font-mono-num text-sky-700">
                          {formatCurrency(b.estimatedProfitOnUnsold, numeralMode)}
                        </strong>
                      </span>
                    </div>
                  )}

                  {canEdit && b.remainingQuantity > 0 && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSaleBatch(b);
                          setSaleQty(String(Math.min(10, b.remainingQuantity)));
                          setSalePrice(String(Math.ceil(b.costPerAnimal * 1.25)));
                        }}
                        className={primaryBtnCls + ' !min-h-[38px] flex-1 !text-xs'}
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>{pickText(lang, 'ব্যাচ থেকে বিক্রয়', 'Sell from Batch')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeathBatch(b);
                          setDeathQty('1');
                        }}
                        className={secondaryBtnCls + ' !min-h-[38px] !text-xs text-rose-700 border-rose-200 hover:bg-rose-50'}
                      >
                        <Skull className="w-3.5 h-3.5" />
                        <span>{pickText(lang, 'মৃত্যু রেকর্ড', 'Record Death')}</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {subTab === 'sales' && canViewSales && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="px-4 py-3">{pickText(lang, 'তারিখ ও কোড', 'Date & Tx')}</th>
                <th className="px-4 py-3">{pickText(lang, 'ব্যাচ', 'Batch')}</th>
                <th className="px-4 py-3">{pickText(lang, 'ক্রেতা', 'Customer')}</th>
                <th className="px-4 py-3 text-right">{pickText(lang, 'সংখ্যা × দর', 'Qty × Price')}</th>
                <th className="px-4 py-3 text-right">{pickText(lang, 'মোট আয়', 'Revenue')}</th>
                {canViewProfit && <th className="px-4 py-3 text-right">{pickText(lang, 'প্রকৃত লাভ', 'Realized Profit')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sales.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    {pickText(lang, 'কোনো বিক্রয় রেকর্ড নেই', 'No batch sales yet')}
                  </td>
                </tr>
              ) : (
                sales.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <p className="font-mono-num text-xs font-semibold text-slate-900">{s.txId}</p>
                      <p className="text-xs text-slate-500">{formatDateDisplay(s.date, numeralMode)}</p>
                    </td>
                    <td className="px-4 py-3 font-mono-num font-semibold text-slate-800">{s.batchCode}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{s.customerName}</p>
                      {s.customerPhone && <p className="text-xs text-slate-500">{s.customerPhone}</p>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num tabular-nums">
                      {formatNum(s.quantity, numeralMode)} × {formatCurrency(s.unitSellingPrice, numeralMode)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num tabular-nums font-bold text-slate-900">
                      {formatCurrency(s.totalRevenue, numeralMode)}
                    </td>
                    {canViewProfit && (
                      <td
                        className={`px-4 py-3 text-right font-mono-num tabular-nums font-bold ${
                          s.realizedProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'
                        }`}
                      >
                        {formatCurrency(s.realizedProfit, numeralMode)}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'deaths' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="px-4 py-3">{pickText(lang, 'তারিখ ও কোড', 'Date & Tx')}</th>
                <th className="px-4 py-3">{pickText(lang, 'ব্যাচ', 'Batch')}</th>
                <th className="px-4 py-3">{pickText(lang, 'কারণ', 'Cause')}</th>
                <th className="px-4 py-3 text-right">{pickText(lang, 'মৃত সংখ্যা', 'Deaths')}</th>
                <th className="px-4 py-3 text-right">{pickText(lang, 'ইউনিট খরচ', 'Unit Cost')}</th>
                <th className="px-4 py-3 text-right">{pickText(lang, 'আর্থিক ক্ষতি', 'Financial Loss')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deaths.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    {pickText(lang, 'কোনো মৃত্যু রেকর্ড নেই', 'No mortality records')}
                  </td>
                </tr>
              ) : (
                deaths.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <p className="font-mono-num text-xs font-semibold">{d.txId}</p>
                      <p className="text-xs text-slate-500">{formatDateDisplay(d.date, numeralMode)}</p>
                    </td>
                    <td className="px-4 py-3 font-mono-num font-semibold">{d.batchCode}</td>
                    <td className="px-4 py-3 text-slate-700">{d.cause}</td>
                    <td className="px-4 py-3 text-right font-mono-num font-bold text-rose-600">
                      {formatNum(d.quantity, numeralMode)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num">{formatCurrency(d.unitCostAtDeath, numeralMode, 2)}</td>
                    <td className="px-4 py-3 text-right font-mono-num font-bold text-rose-700">
                      {formatCurrency(d.financialLoss, numeralMode)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Batch Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={pickText(lang, 'নতুন প্রাণীর ব্যাচ তৈরি করুন', 'Create New Animal Batch')}
        lang={lang}
      >
        <form onSubmit={handleCreateBatch} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{pickText(lang, 'প্রাণীর ধরন *', 'Animal Category *')}</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as AnimalCategory)} className={inputCls}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {ANIMAL_CATEGORY_LABELS[c][lang]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'জাত / ব্রিড', 'Breed')}</label>
              <input value={breed} onChange={(e) => setBreed(e.target.value)} placeholder="Broiler Ross 308 / Deshi" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'ব্যাচ আইডি (ঐচ্ছিক)', 'Batch Code (Optional)')}</label>
              <input value={batchCode} onChange={(e) => setBatchCode(e.target.value)} placeholder="AUTO-BATCH" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'ক্রয়ের তারিখ *', 'Purchase Date *')}</label>
              <input type="date" required value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'মোট সংখ্যা *', 'Initial Quantity *')}</label>
              <input type="number" min={1} required value={initialQuantity} onChange={(e) => setInitialQuantity(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'প্রতি প্রাণীর ক্রয়মূল্য (৳) *', 'Purchase Price / Unit (৳) *')}</label>
              <input type="number" min={0} step="0.01" required value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'প্রাথমিক গড় ওজন (কেজি)', 'Initial Weight (kg)')}</label>
              <input type="number" min={0.01} step="0.01" value={initialWeightKg} onChange={(e) => setInitialWeightKg(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'সরবরাহকারীর নাম', 'Supplier Name')}</label>
              <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Aftab Hatchery" className={inputCls} />
            </div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900 flex items-center justify-between">
            <span>{pickText(lang, 'মোট ক্রয় খরচ:', 'Total Purchase Cost:')}</span>
            <strong className="font-mono-num text-sm">
              {formatCurrency((Number(initialQuantity) || 0) * (Number(purchasePrice) || 0), numeralMode)}
            </strong>
          </div>
          <div>
            <label className={labelCls}>{pickText(lang, 'নোট', 'Notes')}</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className={secondaryBtnCls}>
              {pickText(lang, 'বাতিল', 'Cancel')}
            </button>
            <button type="submit" className={primaryBtnCls}>
              {pickText(lang, 'ব্যাচ সংরক্ষণ করুন', 'Save Batch')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Batch Financial Cost Breakdown Modal */}
      <Modal
        open={Boolean(detailBatch)}
        onClose={() => setDetailBatch(null)}
        title={detailBatch ? `${detailBatch.batchCode} — ${pickText(lang, 'স্বয়ংক্রিয় কস্টিং বিবরণী', 'Automatic Cost Breakdown')}` : ''}
        lang={lang}
      >
        {detailBatch && (
          <div className="space-y-4 text-sm">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-600">{pickText(lang, 'প্রাণীর প্রাথমিক ক্রয় খরচ', 'Initial Animal Purchase')}</span>
                <span className="font-mono-num font-semibold">{formatCurrency(detailBatch.totalPurchaseCost, numeralMode)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">{pickText(lang, 'ব্যবহৃত খাদ্য খরচ', 'Consumed Feed Cost')}</span>
                <span className="font-mono-num">{formatCurrency(detailBatch.feedExpenses, numeralMode)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">{pickText(lang, 'ওষুধ ও চিকিৎসা খরচ', 'Medicine & Treatment')}</span>
                <span className="font-mono-num">{formatCurrency(detailBatch.medicineExpenses, numeralMode)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">{pickText(lang, 'শ্রমিক বেতন', 'Labor Allocation')}</span>
                <span className="font-mono-num">{formatCurrency(detailBatch.laborExpenses, numeralMode)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">{pickText(lang, 'পরিবহন ও অন্যান্য', 'Transport & Other')}</span>
                <span className="font-mono-num">
                  {formatCurrency(
                    detailBatch.transportExpenses + detailBatch.utilitiesExpenses + detailBatch.equipmentExpenses + detailBatch.otherExpenses,
                    numeralMode
                  )}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-300 font-bold text-slate-900">
                <span>{pickText(lang, 'সর্বমোট বিনিয়োগ', 'Total Investment')}</span>
                <span className="font-mono-num">{formatCurrency(detailBatch.totalInvestment, numeralMode)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50">
                <p className="text-xs text-emerald-800">{pickText(lang, 'প্রতি প্রাণীর প্রকৃত খরচ', 'Cost Per Animal')}</p>
                <p className="text-lg font-bold font-mono-num text-emerald-900">
                  {formatCurrency(detailBatch.costPerAnimal, numeralMode, 2)}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 bg-white">
                <p className="text-xs text-slate-500">{pickText(lang, 'গড় বিক্রয় মূল্য', 'Avg Selling Price')}</p>
                <p className="text-lg font-bold font-mono-num text-slate-900">
                  {formatCurrency(detailBatch.averageSellingPrice, numeralMode, 2)}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 bg-white">
                <p className="text-xs text-slate-500">{pickText(lang, 'বিক্রিত অংশে প্রকৃত লাভ', 'Realized Profit (Sold)')}</p>
                <p className={`text-lg font-bold font-mono-num ${detailBatch.realizedProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {formatCurrency(detailBatch.realizedProfit, numeralMode)}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 bg-white">
                <p className="text-xs text-slate-500">{pickText(lang, 'অবিক্রিত স্টকের আনুমানিক লাভ', 'Est. Profit on Unsold')}</p>
                <p className="text-lg font-bold font-mono-num text-sky-700">
                  {formatCurrency(detailBatch.estimatedProfitOnUnsold, numeralMode)}
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Record Death Modal */}
      <Modal
        open={Boolean(deathBatch)}
        onClose={() => setDeathBatch(null)}
        title={deathBatch ? `${deathBatch.batchCode} — ${pickText(lang, 'মৃত্যু রেকর্ড', 'Record Mortality')}` : ''}
        lang={lang}
      >
        {deathBatch && (
          <form onSubmit={handleRecordDeath} className="space-y-3.5">
            <p className="text-xs text-slate-600">
              {pickText(lang, 'বর্তমান জীবিত সংখ্যা', 'Current living count')}:{' '}
              <strong className="font-mono-num">{formatNum(deathBatch.remainingQuantity, numeralMode)}</strong> |{' '}
              {pickText(lang, 'প্রতি প্রাণী খরচ', 'Unit cost')}:{' '}
              <strong className="font-mono-num">{formatCurrency(deathBatch.costPerAnimal, numeralMode, 2)}</strong>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{pickText(lang, 'মৃত সংখ্যা *', 'Quantity *')}</label>
                <input
                  type="number"
                  min={1}
                  max={deathBatch.remainingQuantity}
                  required
                  value={deathQty}
                  onChange={(e) => setDeathQty(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{pickText(lang, 'তারিখ *', 'Date *')}</label>
                <input type="date" required value={deathDate} onChange={(e) => setDeathDate(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'মৃত্যুর কারণ', 'Cause')}</label>
              <input value={deathCause} onChange={(e) => setDeathCause(e.target.value)} placeholder="Heat stress / Disease" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'নোট', 'Notes')}</label>
              <input value={deathNotes} onChange={(e) => setDeathNotes(e.target.value)} className={inputCls} />
            </div>
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-900 flex justify-between">
              <span>{pickText(lang, 'হিসাবকৃত আর্থিক ক্ষতি:', 'Calculated Financial Loss:')}</span>
              <strong className="font-mono-num">
                {formatCurrency((Number(deathQty) || 0) * deathBatch.costPerAnimal, numeralMode, 2)}
              </strong>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeathBatch(null)} className={secondaryBtnCls}>
                {pickText(lang, 'বাতিল', 'Cancel')}
              </button>
              <button type="submit" className={primaryBtnCls}>
                {pickText(lang, 'রেকর্ড করুন', 'Record Death')}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Record Sale Modal */}
      <Modal
        open={Boolean(saleBatch)}
        onClose={() => setSaleBatch(null)}
        title={saleBatch ? `${saleBatch.batchCode} — ${pickText(lang, 'ব্যাচ থেকে বিক্রয়', 'Sell from Batch')}` : ''}
        lang={lang}
      >
        {saleBatch && (
          <form onSubmit={handleRecordSale} className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{pickText(lang, 'বিক্রয়ের সংখ্যা *', 'Quantity *')}</label>
                <input
                  type="number"
                  min={1}
                  max={saleBatch.remainingQuantity}
                  required
                  value={saleQty}
                  onChange={(e) => setSaleQty(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{pickText(lang, 'প্রতি প্রাণী বিক্রয়মূল্য (৳) *', 'Unit Price (৳) *')}</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{pickText(lang, 'পরিশোধিত টাকা (খালি = সম্পূর্ণ)', 'Paid Amount (blank = full)')}</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={salePaid}
                  onChange={(e) => setSalePaid(e.target.value)}
                  placeholder={String((Number(saleQty) || 0) * (Number(salePrice) || 0))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{pickText(lang, 'তারিখ', 'Date')}</label>
                <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} className={inputCls} />
              </div>
            </div>

            {customers.length > 0 && (
              <div>
                <label className={labelCls}>{pickText(lang, 'নিবন্ধিত ক্রেতা নির্বাচন (ঐচ্ছিক)', 'Existing Customer (Optional)')}</label>
                <select value={saleCustId} onChange={(e) => setSaleCustId(e.target.value)} className={inputCls}>
                  <option value="">{pickText(lang, 'নতুন / নগদ ক্রেতা', 'New / Cash Customer')}</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.shopName ? `${c.shopName} (${c.name})` : c.name} — {c.phone}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!saleCustId && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{pickText(lang, 'ক্রেতার নাম', 'Customer Name')}</label>
                  <input value={saleCustName} onChange={(e) => setSaleCustName(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{pickText(lang, 'মোবাইল', 'Phone')}</label>
                  <input value={saleCustPhone} onChange={(e) => setSaleCustPhone(e.target.value)} className={inputCls} />
                </div>
              </div>
            )}

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1 text-xs">
              <div className="flex justify-between">
                <span>{pickText(lang, 'মোট বিক্রয় আয়:', 'Total Sale Revenue:')}</span>
                <strong className="font-mono-num">
                  {formatCurrency((Number(saleQty) || 0) * (Number(salePrice) || 0), numeralMode)}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>{pickText(lang, 'প্রকৃত উৎপাদন খরচ (COGS):', 'COGS (@ Cost/Animal):')}</span>
                <strong className="font-mono-num">
                  {formatCurrency((Number(saleQty) || 0) * saleBatch.costPerAnimal, numeralMode, 2)}
                </strong>
              </div>
              <div className="flex justify-between pt-1 border-t border-emerald-200 font-bold text-emerald-900">
                <span>{pickText(lang, 'আনুমানিক প্রকৃত লাভ:', 'Realized Profit:')}</span>
                <span className="font-mono-num">
                  {formatCurrency(
                    (Number(saleQty) || 0) * ((Number(salePrice) || 0) - saleBatch.costPerAnimal),
                    numeralMode,
                    2
                  )}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setSaleBatch(null)} className={secondaryBtnCls}>
                {pickText(lang, 'বাতিল', 'Cancel')}
              </button>
              <button type="submit" className={primaryBtnCls}>
                {pickText(lang, 'বিক্রয় নিশ্চিত করুন', 'Confirm Sale')}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
