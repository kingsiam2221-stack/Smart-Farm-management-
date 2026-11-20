import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, Printer, Filter } from 'lucide-react';
import type {
  AnimalCategory,
  BatchWithFinancials,
  LangMode,
  NumeralMode,
  PartyRecord,
  UserAccount,
} from '../types/saas';
import { apiRequest } from '../utils/api';
import { exportToExcel, printReportAsPdf } from '../utils/export';
import {
  ANIMAL_CATEGORY_LABELS,
  formatCurrency,
  formatDateDisplay,
  formatNum,
  pickText,
} from '../utils/translations';
import { PageHeader, inputCls, labelCls, primaryBtnCls, secondaryBtnCls } from '../components/UI';

interface ReportResponse {
  batches: BatchWithFinancials[];
  sales: Array<{
    id: string;
    txId: string;
    date: string;
    batchCode: string;
    category: string;
    customerName: string;
    quantity: number;
    unitPrice: number;
    totalRevenue: number;
    realizedProfit: number;
    createdBy: string;
  }>;
  expenses: Array<{
    id: string;
    txId: string;
    date: string;
    category: string;
    title: string;
    totalAmount: number;
    allocationMethod: string;
    createdBy: string;
  }>;
  deaths: Array<{
    id: string;
    txId: string;
    date: string;
    batchCode: string;
    category: string;
    quantity: number;
    cause: string;
    financialLoss: number;
  }>;
}

export function ReportsView({
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
  const [from, setFrom] = useState('2020-01-01');
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState('');
  const [batchId, setBatchId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [staffName, setStaffName] = useState('');

  const [report, setReport] = useState<ReportResponse | null>(null);
  const [allBatches, setAllBatches] = useState<BatchWithFinancials[]>([]);
  const [customers, setCustomers] = useState<PartyRecord[]>([]);

  const canExport = user.role === 'business_owner' || user.permissions['finance.export'];

  const loadReport = async () => {
    try {
      const qs = new URLSearchParams({ from, to });
      if (category) qs.set('category', category);
      if (batchId) qs.set('batchId', batchId);
      if (customerId) qs.set('customerId', customerId);
      if (supplierName.trim()) qs.set('supplierName', supplierName.trim());
      if (staffName.trim()) qs.set('staffName', staffName.trim());

      const res = await apiRequest<ReportResponse>(`/api/reports?${qs.toString()}`);
      setReport(res);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Report load failed');
    }
  };

  useEffect(() => {
    apiRequest<BatchWithFinancials[]>('/api/batches').then(setAllBatches).catch(() => {});
    if (user.role === 'business_owner' || user.permissions['customers.view']) {
      apiRequest<PartyRecord[]>('/api/parties')
        .then((p) => setCustomers(p.filter((x) => x.type === 'customer')))
        .catch(() => {});
    }
    loadReport();
  }, []);

  const handleExcel = () => {
    if (!report) return;
    exportToExcel(`smart_farm_report_${to}`, [
      {
        sheetName: 'Batch P&L',
        rows: report.batches.map((b) => ({
          Batch: b.batchCode,
          Category: b.category,
          Initial: b.initialQuantity,
          Living: b.remainingQuantity,
          TotalInvestment: b.totalInvestment,
          CostPerAnimal: b.costPerAnimal,
          SalesRevenue: b.totalSalesRevenue,
          RealizedProfit: b.realizedProfit,
          MortalityLoss: b.deathFinancialLoss,
        })),
      },
      {
        sheetName: 'Sales',
        rows: report.sales.map((s) => ({
          TxID: s.txId,
          Date: s.date,
          Batch: s.batchCode,
          Customer: s.customerName,
          Quantity: s.quantity,
          UnitPrice: s.unitPrice,
          TotalRevenue: s.totalRevenue,
          RealizedProfit: s.realizedProfit,
          Staff: s.createdBy,
        })),
      },
      {
        sheetName: 'Expenses',
        rows: report.expenses.map((e) => ({
          TxID: e.txId,
          Date: e.date,
          Category: e.category,
          Title: e.title,
          Method: e.allocationMethod,
          Amount: e.totalAmount,
          Staff: e.createdBy,
        })),
      },
      {
        sheetName: 'Deaths',
        rows: report.deaths.map((d) => ({
          TxID: d.txId,
          Date: d.date,
          Batch: d.batchCode,
          Quantity: d.quantity,
          Cause: d.cause,
          FinancialLoss: d.financialLoss,
        })),
      },
    ]);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={pickText(lang, 'বিস্তারিত রিপোর্ট ও এক্সপোর্ট', 'Business Reports & Export')}
        subtitle={pickText(
          lang,
          'তারিখ, প্রাণী, ব্যাচ, ক্রেতা, সরবরাহকারী ও স্টাফ অনুযায়ী ফিল্টার করে Excel ও PDF প্রিন্ট নিন',
          'Filter financial performance by date, animal, batch, customer, supplier, and staff with Excel & PDF export'
        )}
        action={
          canExport && (
            <div className="flex gap-2 no-print">
              <button type="button" onClick={handleExcel} className={secondaryBtnCls}>
                <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                <span>{pickText(lang, 'Excel (.xlsx)', 'Export Excel')}</span>
              </button>
              <button type="button" onClick={printReportAsPdf} className={primaryBtnCls}>
                <Printer className="w-4 h-4" />
                <span>{pickText(lang, 'PDF / প্রিন্ট', 'Export PDF / Print')}</span>
              </button>
            </div>
          )
        }
      />

      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 no-print">
        <div>
          <label className={labelCls}>{pickText(lang, 'শুরুর তারিখ', 'From Date')}</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{pickText(lang, 'শেষ তারিখ', 'To Date')}</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{pickText(lang, 'প্রাণীর ধরন', 'Animal Category')}</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
            <option value="">{pickText(lang, 'সব ধরন', 'All Categories')}</option>
            {(Object.keys(ANIMAL_CATEGORY_LABELS) as AnimalCategory[]).map((c) => (
              <option key={c} value={c}>
                {ANIMAL_CATEGORY_LABELS[c][lang]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>{pickText(lang, 'নির্দিষ্ট ব্যাচ', 'Specific Batch')}</label>
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className={inputCls}>
            <option value="">{pickText(lang, 'সব ব্যাচ', 'All Batches')}</option>
            {allBatches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.batchCode}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>{pickText(lang, 'ক্রেতা', 'Customer')}</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputCls}>
            <option value="">{pickText(lang, 'সব ক্রেতা', 'All Customers')}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.shopName || c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>{pickText(lang, 'সরবরাহকারী নাম', 'Supplier Filter')}</label>
          <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Hatchery / Supplier" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{pickText(lang, 'স্টাফের নাম', 'Staff Filter')}</label>
          <input value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Staff name" className={inputCls} />
        </div>
        <div className="flex items-end">
          <button type="button" onClick={loadReport} className={primaryBtnCls + ' w-full'}>
            <Filter className="w-4 h-4" />
            <span>{pickText(lang, 'ফিল্টার প্রয়োগ করুন', 'Apply Filters')}</span>
          </button>
        </div>
      </div>

      {report && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <div className="px-4 py-3 border-b border-slate-200 font-bold text-sm text-slate-900">
              {pickText(lang, 'ব্যাচভিত্তিক লাভ-ক্ষতি ও কস্টিং বিবরণী', 'Batch Costing & P&L Summary')}
            </div>
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-2.5">{pickText(lang, 'ব্যাচ', 'Batch')}</th>
                  <th className="px-4 py-2.5 text-right">{pickText(lang, 'জীবিত / মোট', 'Living / Init')}</th>
                  <th className="px-4 py-2.5 text-right">{pickText(lang, 'বিনিয়োগ', 'Investment')}</th>
                  <th className="px-4 py-2.5 text-right">{pickText(lang, 'খরচ/টি', 'Cost/Unit')}</th>
                  <th className="px-4 py-2.5 text-right">{pickText(lang, 'বিক্রয় আয়', 'Revenue')}</th>
                  <th className="px-4 py-2.5 text-right">{pickText(lang, 'প্রকৃত লাভ', 'Realized Profit')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.batches.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-2.5 font-mono-num font-semibold">{b.batchCode}</td>
                    <td className="px-4 py-2.5 text-right font-mono-num">
                      {formatNum(b.remainingQuantity, numeralMode)} / {formatNum(b.initialQuantity, numeralMode)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono-num">{formatCurrency(b.totalInvestment, numeralMode)}</td>
                    <td className="px-4 py-2.5 text-right font-mono-num">{formatCurrency(b.costPerAnimal, numeralMode, 2)}</td>
                    <td className="px-4 py-2.5 text-right font-mono-num">{formatCurrency(b.totalSalesRevenue, numeralMode)}</td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono-num font-bold ${
                        b.realizedProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {formatCurrency(b.realizedProfit, numeralMode)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <div className="px-4 py-3 border-b border-slate-200 font-bold text-sm text-slate-900">
              {pickText(lang, 'ফিল্টারকৃত বিক্রয় ও খরচ', 'Filtered Sales & Expenses')}
            </div>
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-2.5">{pickText(lang, 'তারিখ ও কোড', 'Date & Tx')}</th>
                  <th className="px-4 py-2.5">{pickText(lang, 'ধরন / বিবরণ', 'Type / Description')}</th>
                  <th className="px-4 py-2.5">{pickText(lang, 'স্টাফ', 'Recorded By')}</th>
                  <th className="px-4 py-2.5 text-right">{pickText(lang, 'পরিমাণ (৳)', 'Amount (৳)')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.sales.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2.5 text-xs font-mono-num">
                      {formatDateDisplay(s.date, numeralMode)} • {s.txId}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {pickText(lang, 'বিক্রয়', 'Sale')}: {s.batchCode} → {s.customerName}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{s.createdBy}</td>
                    <td className="px-4 py-2.5 text-right font-mono-num font-bold text-emerald-700">
                      +{formatCurrency(s.totalRevenue, numeralMode)}
                    </td>
                  </tr>
                ))}
                {report.expenses.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2.5 text-xs font-mono-num">
                      {formatDateDisplay(e.date, numeralMode)} • {e.txId}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {pickText(lang, 'খরচ', 'Expense')}: {e.title} ({e.allocationMethod})
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{e.createdBy}</td>
                    <td className="px-4 py-2.5 text-right font-mono-num font-bold text-rose-700">
                      -{formatCurrency(e.totalAmount, numeralMode)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
