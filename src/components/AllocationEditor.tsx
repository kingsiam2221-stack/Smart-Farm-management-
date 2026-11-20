import React, { useMemo } from 'react';
import type { AllocationMethod, BatchWithFinancials, LangMode, NumeralMode } from '../types/saas';
import {
  ALLOCATION_METHOD_LABELS,
  ANIMAL_CATEGORY_LABELS,
  formatCurrency,
  formatNum,
  pickText,
} from '../utils/translations';
import { inputCls, labelCls } from './UI';

export interface BatchSelectionItem {
  batchId: string;
  customPercentage: number;
}

export function AllocationEditor({
  lang,
  numeralMode,
  batches,
  totalAmount,
  method,
  onMethodChange,
  selected,
  onSelectedChange,
}: {
  lang: LangMode;
  numeralMode: NumeralMode;
  batches: BatchWithFinancials[];
  totalAmount: number;
  method: AllocationMethod;
  onMethodChange: (m: AllocationMethod) => void;
  selected: BatchSelectionItem[];
  onSelectedChange: (items: BatchSelectionItem[]) => void;
}) {
  const activeBatches = useMemo(() => batches.filter((b) => b.remainingQuantity > 0 || b.status === 'active'), [batches]);
  const selectedIds = useMemo(() => new Set(selected.map((s) => s.batchId)), [selected]);

  const toggleBatch = (batchId: string) => {
    if (selectedIds.has(batchId)) {
      onSelectedChange(selected.filter((s) => s.batchId !== batchId));
    } else {
      const next = [...selected, { batchId, customPercentage: 0 }];
      if (method === 'custom' && next.length > 0) {
        const even = Math.floor((10000 / next.length)) / 100;
        const remainder = Math.round((100 - even * next.length) * 100) / 100;
        onSelectedChange(
          next.map((item, idx) => ({
            ...item,
            customPercentage: idx === 0 ? Math.round((even + remainder) * 100) / 100 : even,
          }))
        );
      } else {
        onSelectedChange(next);
      }
    }
  };

  const selectAll = () => {
    const count = activeBatches.length;
    if (count === 0) return;
    const even = Math.floor(10000 / count) / 100;
    const rem = Math.round((100 - even * count) * 100) / 100;
    onSelectedChange(
      activeBatches.map((b, idx) => ({
        batchId: b.id,
        customPercentage: idx === 0 ? Math.round((even + rem) * 100) / 100 : even,
      }))
    );
  };

  const previewRows = useMemo(() => {
    const targetBatches = activeBatches.filter((b) => selectedIds.has(b.id));
    if (targetBatches.length === 0 || totalAmount <= 0) return [];

    let weights: number[] = [];
    if (method === 'batch') {
      weights = targetBatches.map(() => 1);
    } else if (method === 'equal') {
      weights = targetBatches.map((b) => Math.max(0, b.remainingQuantity));
      if (weights.every((w) => w === 0)) weights = targetBatches.map(() => 1);
    } else if (method === 'weight') {
      weights = targetBatches.map((b) => Math.max(0, b.remainingQuantity) * Math.max(0.01, b.initialWeightKg));
      if (weights.every((w) => w === 0)) weights = targetBatches.map(() => 1);
    } else {
      const customMap = new Map(selected.map((s) => [s.batchId, Number(s.customPercentage) || 0]));
      weights = targetBatches.map((b) => customMap.get(b.id) || 0);
    }

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    if (totalWeight <= 0) return [];

    return targetBatches.map((b, i) => {
      const pct = (weights[i] / totalWeight) * 100;
      const amt = Math.round(((totalAmount * weights[i]) / totalWeight) * 100) / 100;
      const perAnimal = b.remainingQuantity > 0 ? Math.round((amt / b.remainingQuantity) * 100) / 100 : amt;
      return { batch: b, pct, amt, perAnimal };
    });
  }, [activeBatches, selectedIds, selected, totalAmount, method]);

  const customSum = useMemo(
    () => Math.round(selected.reduce((s, item) => s + (Number(item.customPercentage) || 0), 0) * 100) / 100,
    [selected]
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className={labelCls + ' mb-0'}>
          {pickText(lang, 'ব্যাচ খরচ বণ্টন পদ্ধতি', 'Batch Cost Allocation Method')}
        </span>
        <button
          type="button"
          onClick={selectAll}
          className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
        >
          {pickText(lang, 'সব সক্রিয় ব্যাচ নির্বাচন করুন', 'Select All Active Batches')}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(Object.keys(ALLOCATION_METHOD_LABELS) as AllocationMethod[]).map((m) => {
          const info = ALLOCATION_METHOD_LABELS[m];
          const active = method === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onMethodChange(m)}
              className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                active ? 'bg-white border-emerald-600 ring-1 ring-emerald-600' : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <p className={`text-xs font-bold ${active ? 'text-emerald-800' : 'text-slate-800'}`}>
                {lang === 'bn' ? info.bn : info.en}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">{lang === 'bn' ? info.descBn : info.descEn}</p>
            </button>
          );
        })}
      </div>

      <div>
        <p className={labelCls}>{pickText(lang, 'ব্যাচ নির্বাচন করুন', 'Select Batches')}</p>
        {activeBatches.length === 0 ? (
          <p className="text-xs text-rose-600">
            {pickText(lang, 'কোনো সক্রিয় ব্যাচ নেই। আগে একটি ব্যাচ তৈরি করুন।', 'No active batches available. Create a batch first.')}
          </p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {activeBatches.map((b) => {
              const isChecked = selectedIds.has(b.id);
              const selItem = selected.find((s) => s.batchId === b.id);
              const catLabel = ANIMAL_CATEGORY_LABELS[b.category]?.[lang] || b.category;
              return (
                <div
                  key={b.id}
                  className={`flex items-center justify-between gap-2 p-2 rounded-lg border ${
                    isChecked ? 'bg-emerald-50/60 border-emerald-200' : 'bg-white border-slate-200'
                  }`}
                >
                  <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleBatch(b.id)}
                      className="w-4 h-4 rounded accent-emerald-700 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {b.batchCode} — {catLabel} {b.breed ? `(${b.breed})` : ''}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono-num tabular-nums">
                        {pickText(lang, 'জীবিত', 'Living')}: {formatNum(b.remainingQuantity, numeralMode)} |{' '}
                        {pickText(lang, 'গড় ওজন', 'Avg Wt')}: {formatNum(b.initialWeightKg, numeralMode, 2)} kg
                      </p>
                    </div>
                  </label>

                  {method === 'custom' && isChecked && (
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={selItem?.customPercentage ?? 0}
                        onChange={(e) => {
                          const v = Number(e.target.value) || 0;
                          onSelectedChange(selected.map((s) => (s.batchId === b.id ? { ...s, customPercentage: v } : s)));
                        }}
                        className={inputCls + ' !w-20 !min-h-[34px] !py-1 text-right font-mono-num'}
                      />
                      <span className="text-xs font-semibold text-slate-600">%</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {method === 'custom' && selected.length > 0 && (
        <p className={`text-xs font-semibold ${Math.abs(customSum - 100) <= 0.1 ? 'text-emerald-700' : 'text-rose-600'}`}>
          {pickText(lang, 'মোট শতাংশ', 'Total Percentage')}: {formatNum(customSum, numeralMode, 2)}%{' '}
          {Math.abs(customSum - 100) > 0.1 && pickText(lang, '(অবশ্যই ১০০% হতে হবে)', '(Must equal 100%)')}
        </p>
      )}

      {previewRows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {pickText(lang, 'স্বয়ংক্রিয় খরচ বণ্টন প্রিভিউ', 'Automatic Allocation Preview')}
          </p>
          {previewRows.map((p) => (
            <div key={p.batch.id} className="flex items-center justify-between text-xs gap-2">
              <span className="font-medium text-slate-800 truncate">
                {p.batch.batchCode} ({formatNum(p.pct, numeralMode, 1)}%)
              </span>
              <span className="font-mono-num tabular-nums font-bold text-emerald-800 shrink-0">
                {formatCurrency(p.amt, numeralMode, 2)} (+{formatCurrency(p.perAnimal, numeralMode, 2)}/{pickText(lang, 'টি', 'unit')})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
