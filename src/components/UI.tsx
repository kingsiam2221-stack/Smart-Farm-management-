import React, { useState } from 'react';
import { X, AlertCircle, CheckCircle2, ImageOff } from 'lucide-react';
import type { LangMode } from '../types/saas';

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight text-balance">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2 shrink-0 flex-wrap">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  subtext,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  subtext?: string;
  icon?: React.ReactNode;
  tone?: 'neutral' | 'emerald' | 'amber' | 'rose' | 'sky';
}) {
  const valueTone =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : tone === 'rose'
          ? 'text-rose-700'
          : tone === 'sky'
            ? 'text-sky-700'
            : 'text-slate-900';

  const iconWrap =
    tone === 'emerald'
      ? 'bg-emerald-50 text-emerald-700'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-700'
        : tone === 'rose'
          ? 'bg-rose-50 text-rose-700'
          : tone === 'sky'
            ? 'bg-sky-50 text-sky-700'
            : 'bg-slate-100 text-slate-700';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500 truncate">{label}</p>
        <p className={`text-xl sm:text-2xl font-bold mt-1 font-mono-num tabular-nums ${valueTone}`}>{value}</p>
        {subtext && <p className="text-xs text-slate-500 mt-1 truncate">{subtext}</p>}
      </div>
      {icon && (
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconWrap}`}>{icon}</div>
      )}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
  lang = 'bn',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
  lang?: LangMode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-0 sm:p-4">
      <div
        className={`bg-white w-full ${maxWidth} rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-xl max-h-[92vh] flex flex-col`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
            aria-label={lang === 'bn' ? 'বন্ধ করুন' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
      <p className="text-base font-semibold text-slate-900">{title}</p>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ToastBanner({
  toast,
  onDismiss,
}: {
  toast: { type: 'success' | 'error'; message: string } | null;
  onDismiss: () => void;
}) {
  if (!toast) return null;
  const isErr = toast.type === 'error';
  return (
    <div
      className={`fixed top-4 right-4 z-[60] max-w-sm rounded-xl border px-4 py-3 shadow-lg flex items-start gap-3 ${
        isErr ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
      }`}
    >
      {isErr ? (
        <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
      ) : (
        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
      )}
      <p className="text-sm font-medium flex-1">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="text-slate-500 hover:text-slate-800 shrink-0 cursor-pointer"
        aria-label="Close"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ProductImage({
  src,
  alt,
  className = 'w-full h-full object-cover',
}: {
  src?: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400">
        <ImageOff className="w-8 h-8" />
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}

export const inputCls =
  'w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 transition-colors';

export const labelCls = 'block text-xs font-semibold text-slate-700 mb-1';

export const primaryBtnCls =
  'min-h-[42px] px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer';

export const secondaryBtnCls =
  'min-h-[42px] px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer';

export const dangerBtnCls =
  'min-h-[42px] px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer';
