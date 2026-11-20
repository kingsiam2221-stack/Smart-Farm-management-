import React, { useEffect, useMemo, useState } from 'react';
import { Receipt, Users, Plus, Banknote } from 'lucide-react';
import type {
  AllocationMethod,
  BatchWithFinancials,
  ExpenseCategory,
  ExpenseRecord,
  LangMode,
  NumeralMode,
  PartyRecord,
  UserAccount,
} from '../types/saas';
import { apiRequest, newIdempotencyKey } from '../utils/api';
import {
  ALLOCATION_METHOD_LABELS,
  EXPENSE_CATEGORY_LABELS,
  formatCurrency,
  formatDateDisplay,
  pickText,
} from '../utils/translations';
import { AllocationEditor, type BatchSelectionItem } from '../components/AllocationEditor';
import {
  EmptyState,
  Modal,
  PageHeader,
  inputCls,
  labelCls,
  primaryBtnCls,
  secondaryBtnCls,
} from '../components/UI';

const MANUAL_EXP_CATEGORIES: ExpenseCategory[] = ['labor', 'transport', 'utilities', 'equipment', 'other'];

export function ExpensesPartiesView({
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
  const canViewFinance = user.role === 'business_owner' || user.permissions['finance.view'];
  const canAddExpense = user.role === 'business_owner' || user.permissions['finance.add_expense'];
  const canViewParties = user.role === 'business_owner' || user.permissions['customers.view'];
  const canAddParty = user.role === 'business_owner' || user.permissions['customers.add'];
  const canEditParty = user.role === 'business_owner' || user.permissions['customers.edit'];

  const [tab, setTab] = useState<'expenses' | 'customers' | 'suppliers'>(canViewFinance ? 'expenses' : 'customers');
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [batches, setBatches] = useState<BatchWithFinancials[]>([]);
  const [parties, setParties] = useState<PartyRecord[]>([]);

  const [expOpen, setExpOpen] = useState(false);
  const [partyOpen, setPartyOpen] = useState(false);
  const [payParty, setPayParty] = useState<PartyRecord | null>(null);

  // Expense form
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('transport');
  const [expTitle, setExpTitle] = useState('');
  const [expAmount, setExpAmount] = useState('500');
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [expMethod, setExpMethod] = useState<AllocationMethod>('equal');
  const [expSelectedBatches, setExpSelectedBatches] = useState<BatchSelectionItem[]>([]);
  const [expNotes, setExpNotes] = useState('');

  // Party form
  const [partyType, setPartyType] = useState<'customer' | 'supplier'>('customer');
  const [partyShop, setPartyShop] = useState('');
  const [partyName, setPartyName] = useState('');
  const [partyPhone, setPartyPhone] = useState('');
  const [partyCity, setPartyCity] = useState('');
  const [partyAddress, setPartyAddress] = useState('');

  // Payment form
  const [payAmt, setPayAmt] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payNotes, setPayNotes] = useState('');

  const loadAll = async () => {
    try {
      if (canViewFinance) {
        const eRes = await apiRequest<ExpenseRecord[]>('/api/expenses');
        setExpenses(eRes);
      }
      if (user.role === 'business_owner' || user.permissions['animals.view']) {
        const bRes = await apiRequest<BatchWithFinancials[]>('/api/batches');
        setBatches(bRes);
      }
      if (canViewParties) {
        const pRes = await apiRequest<PartyRecord[]>('/api/parties');
        setParties(pRes);
      }
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed to load data');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const customers = useMemo(() => parties.filter((p) => p.type === 'customer'), [parties]);
  const suppliers = useMemo(() => parties.filter((p) => p.type === 'supplier'), [parties]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          category: expCategory,
          title: expTitle,
          totalAmount: Number(expAmount),
          allocationMethod: expMethod,
          batches: expSelectedBatches.map((b) => ({ batchId: b.batchId, percentage: b.customPercentage })),
          date: expDate,
          notes: expNotes,
          idempotencyKey: newIdempotencyKey(),
        }),
      });
      onToast('success', pickText(lang, 'খরচ যুক্ত ও ব্যাচগুলোতে বণ্টন করা হয়েছে', 'Expense recorded and allocated to batches'));
      setExpOpen(false);
      setExpTitle('');
      setExpNotes('');
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleAddParty = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/parties', {
        method: 'POST',
        body: JSON.stringify({
          type: partyType,
          shopName: partyShop,
          name: partyName,
          phone: partyPhone,
          city: partyCity,
          address: partyAddress,
        }),
      });
      onToast('success', pickText(lang, 'পার্টি তথ্য সংরক্ষিত হয়েছে', 'Party added'));
      setPartyOpen(false);
      setPartyShop('');
      setPartyName('');
      setPartyPhone('');
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payParty) return;
    try {
      await apiRequest(`/api/parties/${payParty.id}/payment`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(payAmt),
          method: payMethod,
          notes: payNotes,
        }),
      });
      onToast('success', pickText(lang, 'পেমেন্ট রেকর্ড সম্পন্ন হয়েছে', 'Payment recorded'));
      setPayParty(null);
      setPayAmt('');
      setPayNotes('');
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Payment failed');
    }
  };

  const activePartyList = tab === 'customers' ? customers : suppliers;

  return (
    <div className="space-y-6">
      <PageHeader
        title={pickText(lang, 'খরচ বণ্টন ও ক্রেতা/সরবরাহকারী হিসাব', 'Expense Allocation & Customers/Suppliers')}
        subtitle={pickText(
          lang,
          'শ্রমিক, পরিবহন, বিদ্যুৎ খরচ ব্যাচে বণ্টন এবং ক্রেতা-সরবরাহকারীর বকেয়া ও লেনদেন',
          'Allocate farm expenses across batches and manage separate customer & supplier ledgers'
        )}
        action={
          <div className="flex flex-wrap gap-2">
            {tab === 'expenses' && canAddExpense && (
              <button
                type="button"
                onClick={() => {
                  if (batches.length > 0 && expSelectedBatches.length === 0) {
                    setExpSelectedBatches([{ batchId: batches[0].id, customPercentage: 100 }]);
                  }
                  setExpOpen(true);
                }}
                disabled={batches.length === 0}
                className={primaryBtnCls}
              >
                <Plus className="w-4 h-4" />
                <span>{pickText(lang, 'খরচ যোগ ও বণ্টন', 'Add & Allocate Expense')}</span>
              </button>
            )}
            {(tab === 'customers' || tab === 'suppliers') && canAddParty && (
              <button
                type="button"
                onClick={() => {
                  setPartyType(tab === 'customers' ? 'customer' : 'supplier');
                  setPartyOpen(true);
                }}
                className={primaryBtnCls}
              >
                <Plus className="w-4 h-4" />
                <span>
                  {tab === 'customers' ? pickText(lang, 'নতুন ক্রেতা', 'Add Customer') : pickText(lang, 'নতুন সরবরাহকারী', 'Add Supplier')}
                </span>
              </button>
            )}
          </div>
        }
      />

      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 w-fit flex-wrap">
        {canViewFinance && (
          <button
            type="button"
            onClick={() => setTab('expenses')}
            className={`px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer ${
              tab === 'expenses' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>{pickText(lang, 'অপরিবর্তনীয় খরচ লেজার', 'Immutable Expense Ledger')}</span>
          </button>
        )}
        {canViewParties && (
          <>
            <button
              type="button"
              onClick={() => setTab('customers')}
              className={`px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer ${
                tab === 'customers' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>{pickText(lang, 'ক্রেতা তালিকা', 'Customers')}</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('suppliers')}
              className={`px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer ${
                tab === 'suppliers' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>{pickText(lang, 'সরবরাহকারী তালিকা', 'Suppliers')}</span>
            </button>
          </>
        )}
      </div>

      {tab === 'expenses' && (
        <div className="space-y-4">
          {expenses.length === 0 ? (
            <EmptyState
              title={pickText(lang, 'কোনো খরচ রেকর্ড নেই', 'No Expenses Recorded')}
              description={pickText(
                lang,
                'শ্রমিক বেতন, পরিবহন, বিদ্যুৎ বা অন্যান্য খরচ যোগ করলে তা স্বয়ংক্রিয়ভাবে নির্বাচিত ব্যাচগুলোর মোট খরচে যুক্ত হবে।',
                'Add labor, transport, utilities, or other expenses to allocate them automatically across batches.'
              )}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                  <tr>
                    <th className="px-4 py-3">{pickText(lang, 'তারিখ ও কোড', 'Date & Tx')}</th>
                    <th className="px-4 py-3">{pickText(lang, 'খাত ও বিবরণ', 'Category & Title')}</th>
                    <th className="px-4 py-3">{pickText(lang, 'ব্যাচ বণ্টন (অপরিবর্তনীয়)', 'Batch Allocations (Immutable)')}</th>
                    <th className="px-4 py-3 text-right">{pickText(lang, 'মোট টাকা', 'Amount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenses.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <p className="font-mono-num text-xs font-semibold text-slate-900">{e.txId}</p>
                        <p className="text-xs text-slate-500">{formatDateDisplay(e.date, numeralMode)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{e.title}</p>
                        <p className="text-xs text-slate-500">
                          {EXPENSE_CATEGORY_LABELS[e.category]?.[lang] || e.category} •{' '}
                          {ALLOCATION_METHOD_LABELS[e.allocationMethod]?.[lang] || e.allocationMethod}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700 space-y-0.5">
                        {e.allocations.map((a) => (
                          <div key={a.batchId} className="font-mono-num">
                            {a.batchCode}: {formatCurrency(a.allocatedAmount, numeralMode, 2)} ({a.percentage}%)
                          </div>
                        ))}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num font-bold text-slate-900">
                        {formatCurrency(e.totalAmount, numeralMode)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {(tab === 'customers' || tab === 'suppliers') && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="px-4 py-3">{pickText(lang, 'নাম / দোকান', 'Name / Shop')}</th>
                <th className="px-4 py-3">{pickText(lang, 'যোগাযোগ ও শহর', 'Contact & City')}</th>
                <th className="px-4 py-3 text-right">{pickText(lang, 'মোট লেনদেন', 'Total Volume')}</th>
                <th className="px-4 py-3 text-right">{pickText(lang, 'পরিশোধিত', 'Total Paid')}</th>
                <th className="px-4 py-3 text-right">{pickText(lang, 'বকেয়া ব্যালেন্স', 'Outstanding Balance')}</th>
                {canEditParty && <th className="px-4 py-3 text-right">{pickText(lang, 'কার্যক্রম', 'Action')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activePartyList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    {pickText(lang, 'কোনো তথ্য পাওয়া যায়নি', 'No records found')}
                  </td>
                </tr>
              ) : (
                activePartyList.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{p.shopName || p.name}</p>
                      {p.shopName && p.shopName !== p.name && <p className="text-xs text-slate-500">{p.name}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <p>{p.phone || '—'}</p>
                      <p>{[p.city, p.address].filter(Boolean).join(', ')}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num">{formatCurrency(p.totalVolume, numeralMode)}</td>
                    <td className="px-4 py-3 text-right font-mono-num text-emerald-700">
                      {formatCurrency(p.totalPaid, numeralMode)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num font-bold text-rose-700">
                      {formatCurrency(p.outstandingBalance, numeralMode)}
                    </td>
                    {canEditParty && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setPayParty(p);
                            setPayAmt(String(p.outstandingBalance || ''));
                          }}
                          className={secondaryBtnCls + ' !min-h-[34px] !px-2.5 !text-xs'}
                        >
                          <Banknote className="w-3.5 h-3.5" />
                          <span>{pickText(lang, 'পেমেন্ট', 'Payment')}</span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add & Allocate Expense Modal */}
      <Modal
        open={expOpen}
        onClose={() => setExpOpen(false)}
        title={pickText(lang, 'নতুন খরচ যোগ ও ব্যাচে বণ্টন', 'Add & Allocate Farm Expense')}
        maxWidth="max-w-2xl"
        lang={lang}
      >
        <form onSubmit={handleAddExpense} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{pickText(lang, 'খরচের খাত *', 'Category *')}</label>
              <select value={expCategory} onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)} className={inputCls}>
                {MANUAL_EXP_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {EXPENSE_CATEGORY_LABELS[c][lang]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'বিবরণ *', 'Title / Description *')}</label>
              <input
                required
                value={expTitle}
                onChange={(e) => setExpTitle(e.target.value)}
                placeholder={pickText(lang, 'পরিবহন ভাড়া / শ্রমিক মজুরি', 'Transport / Labor wages')}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'মোট টাকা (৳) *', 'Total Amount (৳) *')}</label>
              <input
                type="number"
                min={0.01}
                step="0.01"
                required
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'তারিখ *', 'Date *')}</label>
              <input type="date" required value={expDate} onChange={(e) => setExpDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          <AllocationEditor
            lang={lang}
            numeralMode={numeralMode}
            batches={batches}
            totalAmount={Number(expAmount) || 0}
            method={expMethod}
            onMethodChange={setExpMethod}
            selected={expSelectedBatches}
            onSelectedChange={setExpSelectedBatches}
          />

          <div>
            <label className={labelCls}>{pickText(lang, 'নোট', 'Notes')}</label>
            <input value={expNotes} onChange={(e) => setExpNotes(e.target.value)} className={inputCls} />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setExpOpen(false)} className={secondaryBtnCls}>
              {pickText(lang, 'বাতিল', 'Cancel')}
            </button>
            <button type="submit" className={primaryBtnCls}>
              {pickText(lang, 'খরচ সংরক্ষণ ও বণ্টন করুন', 'Save & Allocate Expense')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Party Modal */}
      <Modal
        open={partyOpen}
        onClose={() => setPartyOpen(false)}
        title={partyType === 'customer' ? pickText(lang, 'নতুন ক্রেতা যোগ করুন', 'Add Customer') : pickText(lang, 'নতুন সরবরাহকারী যোগ করুন', 'Add Supplier')}
        lang={lang}
      >
        <form onSubmit={handleAddParty} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{pickText(lang, 'দোকান / প্রতিষ্ঠানের নাম', 'Shop / Company Name')}</label>
              <input value={partyShop} onChange={(e) => setPartyShop(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'যোগাযোগকারীর নাম *', 'Contact Name *')}</label>
              <input required value={partyName} onChange={(e) => setPartyName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'মোবাইল নম্বর', 'Phone')}</label>
              <input value={partyPhone} onChange={(e) => setPartyPhone(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'শহর', 'City')}</label>
              <input value={partyCity} onChange={(e) => setPartyCity(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>{pickText(lang, 'ঠিকানা', 'Address')}</label>
            <input value={partyAddress} onChange={(e) => setPartyAddress(e.target.value)} className={inputCls} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPartyOpen(false)} className={secondaryBtnCls}>
              {pickText(lang, 'বাতিল', 'Cancel')}
            </button>
            <button type="submit" className={primaryBtnCls}>
              {pickText(lang, 'সংরক্ষণ করুন', 'Save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Record Party Payment Modal */}
      <Modal
        open={Boolean(payParty)}
        onClose={() => setPayParty(null)}
        title={payParty ? `${payParty.shopName || payParty.name} — ${pickText(lang, 'পেমেন্ট রেকর্ড', 'Record Payment')}` : ''}
        lang={lang}
      >
        {payParty && (
          <form onSubmit={handleRecordPayment} className="space-y-3.5">
            <p className="text-xs text-slate-600">
              {pickText(lang, 'বর্তমান বকেয়া:', 'Current Balance:')}{' '}
              <strong className="font-mono-num text-rose-700">{formatCurrency(payParty.outstandingBalance, numeralMode)}</strong>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{pickText(lang, 'টাকার পরিমাণ (৳) *', 'Amount (৳) *')}</label>
                <input type="number" min={1} step="0.01" required value={payAmt} onChange={(e) => setPayAmt(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{pickText(lang, 'মাধ্যম', 'Method')}</label>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className={inputCls}>
                  <option value="cash">{pickText(lang, 'নগদ (Cash)', 'Cash')}</option>
                  <option value="bkash">bKash</option>
                  <option value="nagad">Nagad</option>
                  <option value="bank">{pickText(lang, 'ব্যাংক ট্রান্সফার', 'Bank Transfer')}</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'নোট', 'Notes')}</label>
              <input value={payNotes} onChange={(e) => setPayNotes(e.target.value)} className={inputCls} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPayParty(null)} className={secondaryBtnCls}>
                {pickText(lang, 'বাতিল', 'Cancel')}
              </button>
              <button type="submit" className={primaryBtnCls}>
                {pickText(lang, 'পেমেন্ট সংরক্ষণ', 'Save Payment')}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
