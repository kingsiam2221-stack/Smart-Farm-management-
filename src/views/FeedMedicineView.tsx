import React, { useEffect, useMemo, useState } from 'react';
import { Wheat, Pill, Syringe, Plus, ArrowUpRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import type {
  AllocationMethod,
  BatchWithFinancials,
  FeedConsumptionRecord,
  FeedItem,
  FeedPurchaseRecord,
  LangMode,
  MedicineItem,
  MedicineTreatmentRecord,
  NumeralMode,
  PartyRecord,
  UserAccount,
  VaccinationRecord,
} from '../types/saas';
import { apiRequest, newIdempotencyKey } from '../utils/api';
import {
  ALLOCATION_METHOD_LABELS,
  formatCurrency,
  formatDateDisplay,
  formatNum,
  pickText,
} from '../utils/translations';
import { AllocationEditor, type BatchSelectionItem } from '../components/AllocationEditor';
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

export function FeedMedicineView({
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
  const canViewFeed = user.role === 'business_owner' || user.permissions['feed.view'];
  const canAddFeed = user.role === 'business_owner' || user.permissions['feed.add'];
  const canViewMed = user.role === 'business_owner' || user.permissions['medicine.view'];
  const canAddMed = user.role === 'business_owner' || user.permissions['medicine.add'];
  const canEditMed = user.role === 'business_owner' || user.permissions['medicine.edit'];

  const [tab, setTab] = useState<'feed' | 'medicine' | 'vaccines'>(canViewFeed ? 'feed' : 'medicine');

  const [feeds, setFeeds] = useState<FeedItem[]>([]);
  const [feedPurchases, setFeedPurchases] = useState<FeedPurchaseRecord[]>([]);
  const [feedConsumptions, setFeedConsumptions] = useState<FeedConsumptionRecord[]>([]);
  const [medicines, setMedicines] = useState<MedicineItem[]>([]);
  const [treatments, setTreatments] = useState<MedicineTreatmentRecord[]>([]);
  const [vaccinations, setVaccinations] = useState<VaccinationRecord[]>([]);
  const [batches, setBatches] = useState<BatchWithFinancials[]>([]);
  const [suppliers, setSuppliers] = useState<PartyRecord[]>([]);

  // Modals
  const [fpOpen, setFpOpen] = useState(false);
  const [fcOpen, setFcOpen] = useState(false);
  const [mpOpen, setMpOpen] = useState(false);
  const [mtOpen, setMtOpen] = useState(false);
  const [vacOpen, setVacOpen] = useState(false);

  // Feed Purchase Form
  const [fpExistingId, setFpExistingId] = useState('');
  const [fpName, setFpName] = useState('');
  const [fpUnit, setFpUnit] = useState('kg');
  const [fpSupplierId, setFpSupplierId] = useState('');
  const [fpSupplierName, setFpSupplierName] = useState('');
  const [fpQty, setFpQty] = useState('100');
  const [fpPrice, setFpPrice] = useState('50');
  const [fpPaid, setFpPaid] = useState('');
  const [fpThreshold, setFpThreshold] = useState('50');
  const [fpDate, setFpDate] = useState(new Date().toISOString().slice(0, 10));

  // Feed Consume Form
  const [fcFeedId, setFcFeedId] = useState('');
  const [fcQty, setFcQty] = useState('20');
  const [fcDate, setFcDate] = useState(new Date().toISOString().slice(0, 10));
  const [fcMethod, setFcMethod] = useState<AllocationMethod>('equal');
  const [fcSelectedBatches, setFcSelectedBatches] = useState<BatchSelectionItem[]>([]);
  const [fcNotes, setFcNotes] = useState('');

  // Medicine Purchase Form
  const [mpExistingId, setMpExistingId] = useState('');
  const [mpName, setMpName] = useState('');
  const [mpUnit, setMpUnit] = useState('ml');
  const [mpSupplier, setMpSupplier] = useState('');
  const [mpQty, setMpQty] = useState('50');
  const [mpPrice, setMpPrice] = useState('20');
  const [mpExpiry, setMpExpiry] = useState('');
  const [mpVetName, setMpVetName] = useState('');
  const [mpVetPhone, setMpVetPhone] = useState('');

  // Medicine Treatment Form
  const [mtMedId, setMtMedId] = useState('');
  const [mtBatchId, setMtBatchId] = useState('');
  const [mtQty, setMtQty] = useState('10');
  const [mtDiagnosis, setMtDiagnosis] = useState('');
  const [mtVetName, setMtVetName] = useState('');
  const [mtDate, setMtDate] = useState(new Date().toISOString().slice(0, 10));

  // Vaccination Form
  const [vacBatchId, setVacBatchId] = useState('');
  const [vacName, setVacName] = useState('');
  const [vacDate, setVacDate] = useState(new Date().toISOString().slice(0, 10));
  const [vacVet, setVacVet] = useState('');

  const loadAll = async () => {
    try {
      if (canViewFeed) {
        const fRes = await apiRequest<{
          feeds: FeedItem[];
          purchases: FeedPurchaseRecord[];
          consumptions: FeedConsumptionRecord[];
        }>('/api/feeds');
        setFeeds(fRes.feeds);
        setFeedPurchases(fRes.purchases);
        setFeedConsumptions(fRes.consumptions);
      }
      if (canViewMed) {
        const mRes = await apiRequest<{
          medicines: MedicineItem[];
          treatments: MedicineTreatmentRecord[];
          vaccinations: VaccinationRecord[];
        }>('/api/medicines');
        setMedicines(mRes.medicines);
        setTreatments(mRes.treatments);
        setVaccinations(mRes.vaccinations);
      }
      if (user.role === 'business_owner' || user.permissions['animals.view']) {
        const bRes = await apiRequest<BatchWithFinancials[]>('/api/batches');
        setBatches(bRes);
      }
      if (user.role === 'business_owner' || user.permissions['customers.view']) {
        const pRes = await apiRequest<PartyRecord[]>('/api/parties');
        setSuppliers(pRes.filter((p) => p.type === 'supplier'));
      }
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed to load inventory');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const selectedFeedForConsume = useMemo(() => feeds.find((f) => f.id === fcFeedId) || feeds[0], [feeds, fcFeedId]);
  const estimatedConsumeCost = useMemo(() => {
    if (!selectedFeedForConsume) return 0;
    return Math.round((Number(fcQty) || 0) * selectedFeedForConsume.avgUnitCost * 100) / 100;
  }, [selectedFeedForConsume, fcQty]);

  const feedSummary = useMemo(() => {
    const unusedValue = feeds.reduce((s, f) => s + f.remainingQty * f.avgUnitCost, 0);
    const consumedValue = feedConsumptions.reduce((s, c) => s + c.totalCost, 0);
    const lowStock = feeds.filter((f) => f.remainingQty <= f.minThreshold).length;
    return { unusedValue, consumedValue, lowStock };
  }, [feeds, feedConsumptions]);

  const medSummary = useMemo(() => {
    const unusedValue = medicines.reduce((s, m) => s + m.remainingQty * m.avgUnitCost, 0);
    const consumedValue = treatments.reduce((s, t) => s + t.totalCost, 0);
    const pendingVaccines = vaccinations.filter((v) => v.status === 'pending').length;
    return { unusedValue, consumedValue, pendingVaccines };
  }, [medicines, treatments, vaccinations]);

  const handlePurchaseFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    const total = (Number(fpQty) || 0) * (Number(fpPrice) || 0);
    try {
      await apiRequest('/api/feeds/purchase', {
        method: 'POST',
        body: JSON.stringify({
          feedId: fpExistingId || undefined,
          name: fpExistingId ? undefined : fpName,
          unit: fpUnit,
          supplierId: fpSupplierId || undefined,
          supplierName: fpSupplierName,
          quantity: Number(fpQty),
          unitPrice: Number(fpPrice),
          paidAmount: fpPaid === '' ? total : Number(fpPaid),
          minThreshold: Number(fpThreshold),
          date: fpDate,
          idempotencyKey: newIdempotencyKey(),
        }),
      });
      onToast(
        'success',
        pickText(
          lang,
          'খাদ্য ইনভেন্টরি স্টকে যোগ হয়েছে (ব্যবহার না করা পর্যন্ত ব্যাচ খরচে যুক্ত হবে না)',
          'Feed added to inventory asset (not charged to batches until consumed)'
        )
      );
      setFpOpen(false);
      setFpName('');
      setFpPaid('');
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Feed purchase failed');
    }
  };

  const handleConsumeFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    const fid = fcFeedId || feeds[0]?.id;
    if (!fid) return;
    try {
      await apiRequest('/api/feeds/consume', {
        method: 'POST',
        body: JSON.stringify({
          feedId: fid,
          quantity: Number(fcQty),
          allocationMethod: fcMethod,
          batches: fcSelectedBatches.map((b) => ({ batchId: b.batchId, percentage: b.customPercentage })),
          date: fcDate,
          notes: fcNotes,
          idempotencyKey: newIdempotencyKey(),
        }),
      });
      onToast('success', pickText(lang, 'ব্যবহৃত খাদ্য খরচ ব্যাচে বণ্টন করা হয়েছে', 'Consumed feed allocated to selected batches'));
      setFcOpen(false);
      setFcNotes('');
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Feed consumption failed');
    }
  };

  const handlePurchaseMed = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/medicines/purchase', {
        method: 'POST',
        body: JSON.stringify({
          medicineId: mpExistingId || undefined,
          name: mpExistingId ? undefined : mpName,
          unit: mpUnit,
          supplierName: mpSupplier,
          quantity: Number(mpQty),
          unitPrice: Number(mpPrice),
          expiryDate: mpExpiry,
          vetName: mpVetName,
          vetPhone: mpVetPhone,
          idempotencyKey: newIdempotencyKey(),
        }),
      });
      onToast('success', pickText(lang, 'ওষুধ স্টকে যোগ হয়েছে', 'Medicine added to stock'));
      setMpOpen(false);
      setMpName('');
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Medicine purchase failed');
    }
  };

  const handleTreatBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const mid = mtMedId || medicines[0]?.id;
    const bid = mtBatchId || batches[0]?.id;
    if (!mid || !bid) return;
    try {
      await apiRequest('/api/medicines/treat', {
        method: 'POST',
        body: JSON.stringify({
          medicineId: mid,
          batchId: bid,
          quantity: Number(mtQty),
          date: mtDate,
          diagnosis: mtDiagnosis,
          vetName: mtVetName,
          idempotencyKey: newIdempotencyKey(),
        }),
      });
      onToast('success', pickText(lang, 'চিকিৎসা রেকর্ড ও ব্যাচ খরচ আপডেট হয়েছে', 'Treatment logged & charged to batch'));
      setMtOpen(false);
      setMtDiagnosis('');
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Treatment failed');
    }
  };

  const handleCreateVaccination = async (e: React.FormEvent) => {
    e.preventDefault();
    const bid = vacBatchId || batches[0]?.id;
    if (!bid) return;
    try {
      await apiRequest('/api/vaccinations', {
        method: 'POST',
        body: JSON.stringify({
          batchId: bid,
          vaccineName: vacName,
          scheduledDate: vacDate,
          vetName: vacVet,
        }),
      });
      onToast('success', pickText(lang, 'টিকার সময়সূচি যোগ হয়েছে', 'Vaccination scheduled'));
      setVacOpen(false);
      setVacName('');
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleToggleVaccination = async (v: VaccinationRecord) => {
    try {
      await apiRequest(`/api/vaccinations/${v.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: v.status === 'completed' ? 'pending' : 'completed' }),
      });
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Update failed');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={pickText(lang, 'খাদ্য, ওষুধ ও টিকা ব্যবস্থাপনা', 'Feed, Medicine & Vaccination Management')}
        subtitle={pickText(
          lang,
          'অব্যবহৃত মজুদ আলাদা সম্পদ হিসেবে থাকে — কেবল ব্যবহৃত অংশ ব্যাচের খরচে যুক্ত হয়',
          'Unused stock stays an inventory asset — only consumed feed and treatments add to batch costs'
        )}
        action={
          <div className="flex flex-wrap gap-2">
            {tab === 'feed' && canAddFeed && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setFpExistingId('');
                    setFpOpen(true);
                  }}
                  className={secondaryBtnCls}
                >
                  <Plus className="w-4 h-4" />
                  <span>{pickText(lang, 'খাদ্য ক্রয়', 'Purchase Feed')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (feeds.length > 0 && !fcFeedId) setFcFeedId(feeds[0].id);
                    if (batches.length > 0 && fcSelectedBatches.length === 0) {
                      setFcSelectedBatches([{ batchId: batches[0].id, customPercentage: 100 }]);
                    }
                    setFcOpen(true);
                  }}
                  className={primaryBtnCls}
                  disabled={feeds.length === 0 || batches.length === 0}
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>{pickText(lang, 'দৈনিক খাদ্য ব্যবহার', 'Log Feed Usage')}</span>
                </button>
              </>
            )}
            {tab === 'medicine' && canAddMed && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMpExistingId('');
                    setMpOpen(true);
                  }}
                  className={secondaryBtnCls}
                >
                  <Plus className="w-4 h-4" />
                  <span>{pickText(lang, 'ওষুধ ক্রয়', 'Purchase Medicine')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (medicines.length > 0 && !mtMedId) setMtMedId(medicines[0].id);
                    if (batches.length > 0 && !mtBatchId) setMtBatchId(batches[0].id);
                    setMtOpen(true);
                  }}
                  className={primaryBtnCls}
                  disabled={medicines.length === 0 || batches.length === 0}
                >
                  <Syringe className="w-4 h-4" />
                  <span>{pickText(lang, 'ব্যাচে চিকিৎসা প্রদান', 'Treat Batch')}</span>
                </button>
              </>
            )}
            {tab === 'vaccines' && canAddMed && (
              <button
                type="button"
                onClick={() => {
                  if (batches.length > 0 && !vacBatchId) setVacBatchId(batches[0].id);
                  setVacOpen(true);
                }}
                className={primaryBtnCls}
                disabled={batches.length === 0}
              >
                <Plus className="w-4 h-4" />
                <span>{pickText(lang, 'নতুন টিকা সময়সূচি', 'Schedule Vaccine')}</span>
              </button>
            )}
          </div>
        }
      />

      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 w-fit">
        {canViewFeed && (
          <button
            type="button"
            onClick={() => setTab('feed')}
            className={`px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer ${
              tab === 'feed' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Wheat className="w-4 h-4" />
            <span>{pickText(lang, 'খাদ্য মজুদ ও ব্যবহার', 'Feed Inventory & Usage')}</span>
          </button>
        )}
        {canViewMed && (
          <>
            <button
              type="button"
              onClick={() => setTab('medicine')}
              className={`px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer ${
                tab === 'medicine' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Pill className="w-4 h-4" />
              <span>{pickText(lang, 'ওষুধ ও চিকিৎসা', 'Medicine & Treatments')}</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('vaccines')}
              className={`px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer ${
                tab === 'vaccines' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Syringe className="w-4 h-4" />
              <span>{pickText(lang, 'টিকা সময়সূচি', 'Vaccination Schedule')}</span>
            </button>
          </>
        )}
      </div>

      {tab === 'feed' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label={pickText(lang, 'অব্যবহৃত খাদ্য মজুদ মূল্য (সম্পদ)', 'Unused Feed Inventory Asset')}
              value={formatCurrency(feedSummary.unusedValue, numeralMode)}
              tone="sky"
            />
            <StatCard
              label={pickText(lang, 'ব্যাচে ব্যবহৃত মোট খাদ্য খরচ', 'Consumed Feed Charged to Batches')}
              value={formatCurrency(feedSummary.consumedValue, numeralMode)}
              tone="emerald"
            />
            <StatCard
              label={pickText(lang, 'কম মজুদ সতর্কতা', 'Low Stock Alerts')}
              value={formatNum(feedSummary.lowStock, numeralMode)}
              tone={feedSummary.lowStock > 0 ? 'amber' : 'neutral'}
            />
          </div>

          {feeds.length === 0 ? (
            <EmptyState
              title={pickText(lang, 'খাদ্য মজুদ শূন্য', 'No Feed Items')}
              description={pickText(
                lang,
                'প্রথমে খাদ্য ক্রয় করুন, তারপর দৈনিক ব্যবহারের সময় ব্যাচগুলোতে স্বয়ংক্রিয়ভাবে বণ্টন করুন।',
                'Purchase feed stock first, then log daily consumption to allocate cost across batches.'
              )}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                  <tr>
                    <th className="px-4 py-3">{pickText(lang, 'খাদ্যের নাম', 'Feed Name')}</th>
                    <th className="px-4 py-3 text-right">{pickText(lang, 'মোট ক্রয়', 'Purchased')}</th>
                    <th className="px-4 py-3 text-right">{pickText(lang, 'ব্যবহৃত', 'Consumed')}</th>
                    <th className="px-4 py-3 text-right">{pickText(lang, 'অবশিষ্ট মজুদ', 'Remaining')}</th>
                    <th className="px-4 py-3 text-right">{pickText(lang, 'গড় দর', 'Avg Cost')}</th>
                    <th className="px-4 py-3 text-right">{pickText(lang, 'অবশিষ্ট মূল্য', 'Stock Value')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {feeds.map((f) => {
                    const isLow = f.remainingQty <= f.minThreshold;
                    return (
                      <tr key={f.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{f.name}</span>
                            {isLow && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">
                                <AlertTriangle className="w-3 h-3" />
                                {pickText(lang, 'কম মজুদ', 'Low')}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">{f.supplierName}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num">
                          {formatNum(f.purchasedQty, numeralMode, 1)} {f.unit}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num">
                          {formatNum(f.consumedQty, numeralMode, 1)} {f.unit}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num font-bold text-emerald-700">
                          {formatNum(f.remainingQty, numeralMode, 1)} {f.unit}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num">
                          {formatCurrency(f.avgUnitCost, numeralMode, 2)}/{f.unit}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num font-semibold">
                          {formatCurrency(f.remainingQty * f.avgUnitCost, numeralMode)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {feedConsumptions.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
              <div className="px-4 py-3 border-b border-slate-200 font-bold text-sm text-slate-900">
                {pickText(lang, 'সাম্প্রতিক খাদ্য ব্যবহার ও বণ্টন লগ', 'Recent Feed Consumptions')}
              </div>
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5">{pickText(lang, 'তারিখ', 'Date')}</th>
                    <th className="px-4 py-2.5">{pickText(lang, 'খাদ্য', 'Feed')}</th>
                    <th className="px-4 py-2.5">{pickText(lang, 'বণ্টন পদ্ধতি', 'Method')}</th>
                    <th className="px-4 py-2.5 text-right">{pickText(lang, 'পরিমাণ', 'Qty')}</th>
                    <th className="px-4 py-2.5 text-right">{pickText(lang, 'মোট খরচ', 'Total Cost')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {feedConsumptions.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2.5 text-xs font-mono-num">{formatDateDisplay(c.date, numeralMode)}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-900">{c.feedName}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">
                        {ALLOCATION_METHOD_LABELS[c.allocationMethod]?.[lang] || c.allocationMethod}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono-num">{formatNum(c.quantity, numeralMode, 1)}</td>
                      <td className="px-4 py-2.5 text-right font-mono-num font-bold text-emerald-700">
                        {formatCurrency(c.totalCost, numeralMode)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'medicine' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label={pickText(lang, 'অব্যবহৃত ওষুধ মজুদ মূল্য', 'Unused Medicine Asset')}
              value={formatCurrency(medSummary.unusedValue, numeralMode)}
              tone="sky"
            />
            <StatCard
              label={pickText(lang, 'চিকিৎসায় ব্যবহৃত খরচ', 'Medicine Consumed in Batches')}
              value={formatCurrency(medSummary.consumedValue, numeralMode)}
              tone="emerald"
            />
            <StatCard
              label={pickText(lang, 'অপেক্ষমাণ টিকা', 'Pending Vaccinations')}
              value={formatNum(medSummary.pendingVaccines, numeralMode)}
              tone={medSummary.pendingVaccines > 0 ? 'amber' : 'neutral'}
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-3">{pickText(lang, 'ওষুধ / ভ্যাকসিন', 'Medicine / Vaccine')}</th>
                  <th className="px-4 py-3">{pickText(lang, 'মেয়াদ উত্তীর্ণ', 'Expiry Date')}</th>
                  <th className="px-4 py-3">{pickText(lang, 'ভেট ডাক্তার', 'Veterinarian')}</th>
                  <th className="px-4 py-3 text-right">{pickText(lang, 'অবশিষ্ট', 'Remaining')}</th>
                  <th className="px-4 py-3 text-right">{pickText(lang, 'গড় মূল্য', 'Avg Cost')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {medicines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                      {pickText(lang, 'কোনো ওষুধ মজুদ নেই', 'No medicines in inventory')}
                    </td>
                  </tr>
                ) : (
                  medicines.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{m.name}</p>
                        <p className="text-xs text-slate-500">{m.supplierName}</p>
                      </td>
                      <td className="px-4 py-3 font-mono-num text-xs">{formatDateDisplay(m.expiryDate, numeralMode)}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {m.vetName || '—'} {m.vetPhone ? `(${m.vetPhone})` : ''}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num font-bold text-emerald-700">
                        {formatNum(m.remainingQty, numeralMode, 1)} {m.unit}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num">
                        {formatCurrency(m.avgUnitCost, numeralMode, 2)}/{m.unit}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'vaccines' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="px-4 py-3">{pickText(lang, 'ব্যাচ', 'Batch')}</th>
                <th className="px-4 py-3">{pickText(lang, 'টিকার নাম', 'Vaccine Name')}</th>
                <th className="px-4 py-3">{pickText(lang, 'নির্ধারিত তারিখ', 'Scheduled Date')}</th>
                <th className="px-4 py-3">{pickText(lang, 'ডাক্তার', 'Vet')}</th>
                <th className="px-4 py-3 text-right">{pickText(lang, 'অবস্থা', 'Status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vaccinations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    {pickText(lang, 'কোনো টিকা সময়সূচি নেই', 'No vaccination schedules')}
                  </td>
                </tr>
              ) : (
                vaccinations.map((v) => (
                  <tr key={v.id}>
                    <td className="px-4 py-3 font-mono-num font-semibold">{v.batchCode}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{v.vaccineName}</td>
                    <td className="px-4 py-3 font-mono-num text-xs">{formatDateDisplay(v.scheduledDate, numeralMode)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{v.vetName || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={!canEditMed}
                        onClick={() => handleToggleVaccination(v)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                          v.status === 'completed' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          {v.status === 'completed' ? pickText(lang, 'সম্পন্ন', 'Completed') : pickText(lang, 'অপেক্ষমাণ', 'Pending')}
                        </span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Purchase Feed Modal */}
      <Modal open={fpOpen} onClose={() => setFpOpen(false)} title={pickText(lang, 'খাদ্য ক্রয় করুন', 'Purchase Feed Stock')} lang={lang}>
        <form onSubmit={handlePurchaseFeed} className="space-y-3.5">
          {feeds.length > 0 && (
            <div>
              <label className={labelCls}>{pickText(lang, 'বিদ্যমান খাদ্য বা নতুন যোগ', 'Existing Feed or New')}</label>
              <select value={fpExistingId} onChange={(e) => setFpExistingId(e.target.value)} className={inputCls}>
                <option value="">{pickText(lang, '+ নতুন খাদ্য আইটেম', '+ New Feed Item')}</option>
                {feeds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.remainingQty} {f.unit})
                  </option>
                ))}
              </select>
            </div>
          )}
          {!fpExistingId && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{pickText(lang, 'খাদ্যের নাম *', 'Feed Name *')}</label>
                <input required value={fpName} onChange={(e) => setFpName(e.target.value)} placeholder="Broiler Starter" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{pickText(lang, 'একক (kg/bag)', 'Unit')}</label>
                <input value={fpUnit} onChange={(e) => setFpUnit(e.target.value)} className={inputCls} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{pickText(lang, 'পরিমাণ *', 'Quantity *')}</label>
              <input type="number" min={0.1} step="0.01" required value={fpQty} onChange={(e) => setFpQty(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'দর / একক (৳) *', 'Unit Price (৳) *')}</label>
              <input type="number" min={0} step="0.01" required value={fpPrice} onChange={(e) => setFpPrice(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'পরিশোধিত টাকা', 'Paid Amount')}</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={fpPaid}
                onChange={(e) => setFpPaid(e.target.value)}
                placeholder={String((Number(fpQty) || 0) * (Number(fpPrice) || 0))}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'সর্বনিম্ন সতর্কতা স্তর', 'Min Alert Threshold')}</label>
              <input type="number" min={0} value={fpThreshold} onChange={(e) => setFpThreshold(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{pickText(lang, 'সরবরাহকারী', 'Supplier')}</label>
              {suppliers.length > 0 ? (
                <select value={fpSupplierId} onChange={(e) => setFpSupplierId(e.target.value)} className={inputCls}>
                  <option value="">{pickText(lang, 'নতুন সরবরাহকারী লিখুন', 'Custom Supplier')}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={fpSupplierName} onChange={(e) => setFpSupplierName(e.target.value)} className={inputCls} />
              )}
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'তারিখ', 'Date')}</label>
              <input type="date" value={fpDate} onChange={(e) => setFpDate(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setFpOpen(false)} className={secondaryBtnCls}>
              {pickText(lang, 'বাতিল', 'Cancel')}
            </button>
            <button type="submit" className={primaryBtnCls}>
              {pickText(lang, 'স্টকে যোগ করুন', 'Add to Stock')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Consume Feed Modal (with 4 allocation engines) */}
      <Modal
        open={fcOpen}
        onClose={() => setFcOpen(false)}
        title={pickText(lang, 'দৈনিক খাদ্য ব্যবহার ও ব্যাচে বণ্টন', 'Log Consumed Feed & Allocate to Batches')}
        maxWidth="max-w-2xl"
        lang={lang}
      >
        <form onSubmit={handleConsumeFeed} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>{pickText(lang, 'খাদ্য নির্বাচন *', 'Select Feed *')}</label>
              <select value={fcFeedId || feeds[0]?.id || ''} onChange={(e) => setFcFeedId(e.target.value)} className={inputCls}>
                {feeds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.remainingQty} {f.unit} @ ৳{f.avgUnitCost})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'ব্যবহৃত পরিমাণ *', 'Consumed Qty *')}</label>
              <input
                type="number"
                min={0.1}
                step="0.01"
                max={selectedFeedForConsume?.remainingQty || 999999}
                required
                value={fcQty}
                onChange={(e) => setFcQty(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'তারিখ', 'Date')}</label>
              <input type="date" value={fcDate} onChange={(e) => setFcDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex justify-between text-xs text-emerald-900">
            <span>{pickText(lang, 'ব্যাচে যোগ হবে (ব্যবহৃত খাদ্যের মূল্য):', 'Consumed Cost to Allocate:')}</span>
            <strong className="font-mono-num text-sm">{formatCurrency(estimatedConsumeCost, numeralMode, 2)}</strong>
          </div>

          <AllocationEditor
            lang={lang}
            numeralMode={numeralMode}
            batches={batches}
            totalAmount={estimatedConsumeCost}
            method={fcMethod}
            onMethodChange={setFcMethod}
            selected={fcSelectedBatches}
            onSelectedChange={setFcSelectedBatches}
          />

          <div>
            <label className={labelCls}>{pickText(lang, 'নোট', 'Notes')}</label>
            <input value={fcNotes} onChange={(e) => setFcNotes(e.target.value)} className={inputCls} />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setFcOpen(false)} className={secondaryBtnCls}>
              {pickText(lang, 'বাতিল', 'Cancel')}
            </button>
            <button type="submit" className={primaryBtnCls}>
              {pickText(lang, 'খাদ্য ব্যবহার নিশ্চিত করুন', 'Confirm Feed Consumption')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Purchase Medicine Modal */}
      <Modal open={mpOpen} onClose={() => setMpOpen(false)} title={pickText(lang, 'ওষুধ ও ভ্যাকসিন ক্রয়', 'Purchase Medicine')} lang={lang}>
        <form onSubmit={handlePurchaseMed} className="space-y-3.5">
          {medicines.length > 0 && (
            <div>
              <label className={labelCls}>{pickText(lang, 'বিদ্যমান ওষুধ বা নতুন', 'Existing or New Medicine')}</label>
              <select value={mpExistingId} onChange={(e) => setMpExistingId(e.target.value)} className={inputCls}>
                <option value="">{pickText(lang, '+ নতুন ওষুধ', '+ New Medicine')}</option>
                {medicines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.remainingQty} {m.unit})
                  </option>
                ))}
              </select>
            </div>
          )}
          {!mpExistingId && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{pickText(lang, 'ওষুধের নাম *', 'Medicine Name *')}</label>
                <input required value={mpName} onChange={(e) => setMpName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{pickText(lang, 'একক', 'Unit')}</label>
                <input value={mpUnit} onChange={(e) => setMpUnit(e.target.value)} className={inputCls} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{pickText(lang, 'পরিমাণ *', 'Quantity *')}</label>
              <input type="number" min={0.1} step="0.01" required value={mpQty} onChange={(e) => setMpQty(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'দর / একক (৳) *', 'Unit Price (৳) *')}</label>
              <input type="number" min={0} step="0.01" required value={mpPrice} onChange={(e) => setMpPrice(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'মেয়াদ উত্তীর্ণ তারিখ', 'Expiry Date')}</label>
              <input type="date" value={mpExpiry} onChange={(e) => setMpExpiry(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'সরবরাহকারী', 'Supplier')}</label>
              <input value={mpSupplier} onChange={(e) => setMpSupplier(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'ডাক্তারের নাম', 'Vet Name')}</label>
              <input value={mpVetName} onChange={(e) => setMpVetName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'ডাক্তারের ফোন', 'Vet Phone')}</label>
              <input value={mpVetPhone} onChange={(e) => setMpVetPhone(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMpOpen(false)} className={secondaryBtnCls}>
              {pickText(lang, 'বাতিল', 'Cancel')}
            </button>
            <button type="submit" className={primaryBtnCls}>
              {pickText(lang, 'সংরক্ষণ করুন', 'Save Medicine')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Treat Batch Modal */}
      <Modal open={mtOpen} onClose={() => setMtOpen(false)} title={pickText(lang, 'ব্যাচে চিকিৎসা ও ওষুধ ব্যবহার', 'Treat Batch with Medicine')} lang={lang}>
        <form onSubmit={handleTreatBatch} className="space-y-3.5">
          <div>
            <label className={labelCls}>{pickText(lang, 'ওষুধ নির্বাচন *', 'Select Medicine *')}</label>
            <select value={mtMedId || medicines[0]?.id || ''} onChange={(e) => setMtMedId(e.target.value)} className={inputCls}>
              {medicines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.remainingQty} {m.unit} @ ৳{m.avgUnitCost})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{pickText(lang, 'ব্যাচ নির্বাচন *', 'Select Batch *')}</label>
            <select value={mtBatchId || batches[0]?.id || ''} onChange={(e) => setMtBatchId(e.target.value)} className={inputCls}>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batchCode} ({b.remainingQuantity} living)
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{pickText(lang, 'পরিমাণ *', 'Quantity *')}</label>
              <input type="number" min={0.1} step="0.01" required value={mtQty} onChange={(e) => setMtQty(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'তারিখ', 'Date')}</label>
              <input type="date" value={mtDate} onChange={(e) => setMtDate(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{pickText(lang, 'রোগ / কারণ', 'Diagnosis')}</label>
              <input value={mtDiagnosis} onChange={(e) => setMtDiagnosis(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'ডাক্তার', 'Vet Name')}</label>
              <input value={mtVetName} onChange={(e) => setMtVetName(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMtOpen(false)} className={secondaryBtnCls}>
              {pickText(lang, 'বাতিল', 'Cancel')}
            </button>
            <button type="submit" className={primaryBtnCls}>
              {pickText(lang, 'চিকিৎসা নিশ্চিত করুন', 'Record Treatment')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Vaccination Modal */}
      <Modal open={vacOpen} onClose={() => setVacOpen(false)} title={pickText(lang, 'নতুন টিকা সময়সূচি', 'Schedule Vaccination')} lang={lang}>
        <form onSubmit={handleCreateVaccination} className="space-y-3.5">
          <div>
            <label className={labelCls}>{pickText(lang, 'ব্যাচ *', 'Batch *')}</label>
            <select value={vacBatchId || batches[0]?.id || ''} onChange={(e) => setVacBatchId(e.target.value)} className={inputCls}>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batchCode}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{pickText(lang, 'টিকার নাম *', 'Vaccine Name *')}</label>
            <input required value={vacName} onChange={(e) => setVacName(e.target.value)} placeholder="Gumboro / Ranikhet" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{pickText(lang, 'তারিখ *', 'Scheduled Date *')}</label>
              <input type="date" required value={vacDate} onChange={(e) => setVacDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'ডাক্তারের নাম', 'Vet Name')}</label>
              <input value={vacVet} onChange={(e) => setVacVet(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setVacOpen(false)} className={secondaryBtnCls}>
              {pickText(lang, 'বাতিল', 'Cancel')}
            </button>
            <button type="submit" className={primaryBtnCls}>
              {pickText(lang, 'সংরক্ষণ করুন', 'Schedule')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
