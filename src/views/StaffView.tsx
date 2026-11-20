import React, { useEffect, useState } from 'react';
import { UserPlus, Shield, History, Check, X } from 'lucide-react';
import type {
  AuditLogRecord,
  LangMode,
  NumeralMode,
  PermissionKey,
  StaffPermissions,
} from '../types/saas';
import { apiRequest } from '../utils/api';
import { PERMISSION_LABELS, formatDateDisplay, pickText } from '../utils/translations';
import {
  EmptyState,
  Modal,
  PageHeader,
  inputCls,
  labelCls,
  primaryBtnCls,
  secondaryBtnCls,
} from '../components/UI';

interface StaffRow {
  id: string;
  name: string;
  username: string;
  phone: string;
  assignedRoleTitle: string;
  permissions: StaffPermissions;
  active: boolean;
  createdAt: string;
}

const DEFAULT_STAFF_PERMS: StaffPermissions = {
  'animals.view': true,
  'animals.add': false,
  'animals.edit': false,
  'animals.delete': false,
  'feed.view': true,
  'feed.add': true,
  'feed.edit': false,
  'feed.delete': false,
  'medicine.view': true,
  'medicine.add': false,
  'medicine.edit': false,
  'finance.view': false,
  'finance.add_expense': false,
  'finance.view_profit': false,
  'finance.view_sales': false,
  'finance.export': false,
  'customers.view': true,
  'customers.add': false,
  'customers.edit': false,
  'orders.view': true,
  'orders.confirm': false,
  'orders.update_status': false,
  'orders.cancel': false,
  'products.manage': false,
};

const ALL_PERM_KEYS = Object.keys(PERMISSION_LABELS) as PermissionKey[];

export function StaffView({
  lang,
  numeralMode,
  onToast,
}: {
  lang: LangMode;
  numeralMode: NumeralMode;
  onToast: (type: 'success' | 'error', msg: string) => void;
}) {
  const [tab, setTab] = useState<'staff' | 'audit'>('staff');
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editStaff, setEditStaff] = useState<StaffRow | null>(null);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [roleTitle, setRoleTitle] = useState('Farm Manager');
  const [password, setPassword] = useState('');
  const [perms, setPerms] = useState<StaffPermissions>({ ...DEFAULT_STAFF_PERMS });

  const loadAll = async () => {
    try {
      const [sRes, lRes] = await Promise.all([
        apiRequest<StaffRow[]>('/api/staff'),
        apiRequest<AuditLogRecord[]>('/api/audit-logs'),
      ]);
      setStaffList(sRes);
      setLogs(lRes);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed to load staff');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/staff', {
        method: 'POST',
        body: JSON.stringify({
          name,
          username,
          phone,
          assignedRoleTitle: roleTitle,
          password,
          permissions: perms,
        }),
      });
      onToast('success', pickText(lang, 'স্টাফ অ্যাকাউন্ট তৈরি হয়েছে', 'Staff account created'));
      setCreateOpen(false);
      setName('');
      setUsername('');
      setPhone('');
      setPassword('');
      setPerms({ ...DEFAULT_STAFF_PERMS });
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Create staff failed');
    }
  };

  const handleUpdateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editStaff) return;
    try {
      await apiRequest(`/api/staff/${editStaff.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editStaff.name,
          phone: editStaff.phone,
          assignedRoleTitle: editStaff.assignedRoleTitle,
          active: editStaff.active,
          permissions: editStaff.permissions,
        }),
      });
      onToast('success', pickText(lang, 'স্টাফ পারমিশন আপডেট হয়েছে', 'Staff permissions updated'));
      setEditStaff(null);
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Update failed');
    }
  };

  const handleToggleActive = async (s: StaffRow) => {
    try {
      await apiRequest(`/api/staff/${s.id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: !s.active }),
      });
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed');
    }
  };

  const renderPermissionMatrix = (
    current: StaffPermissions,
    onChange: (next: StaffPermissions) => void
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={labelCls + ' mb-0'}>
          {pickText(lang, '২৪টি সূক্ষ্ম অনুমতি (Backend Enforced)', '24 Granular Permissions (Backend Enforced)')}
        </span>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => {
              const all = { ...current };
              ALL_PERM_KEYS.forEach((k) => {
                all[k] = true;
              });
              onChange(all);
            }}
            className="text-emerald-700 font-semibold cursor-pointer"
          >
            {pickText(lang, 'সব অনুমতি দিন', 'Grant All')}
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_STAFF_PERMS })}
            className="text-slate-600 font-semibold cursor-pointer"
          >
            {pickText(lang, 'ডিফল্ট', 'Default')}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
        {ALL_PERM_KEYS.map((key) => (
          <label
            key={key}
            className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-200 text-xs cursor-pointer"
          >
            <input
              type="checkbox"
              checked={Boolean(current[key])}
              onChange={(e) => onChange({ ...current, [key]: e.target.checked })}
              className="w-4 h-4 accent-emerald-700 shrink-0"
            />
            <span className="text-slate-800 font-medium">{PERMISSION_LABELS[key][lang]}</span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={pickText(lang, 'স্টাফ / কর্মচারী ও অডিট লগ', 'Staff Permissions & Activity Audit')}
        subtitle={pickText(
          lang,
          'প্রতিটি কর্মচারীর জন্য ২৪টি আলাদা অনুমতি এবং প্রতিটি কাজের অপরিবর্তনীয় অডিট লগ',
          'Assign 24 granular permissions per employee and monitor every login and action in the audit log'
        )}
        action={
          tab === 'staff' && (
            <button type="button" onClick={() => setCreateOpen(true)} className={primaryBtnCls}>
              <UserPlus className="w-4 h-4" />
              <span>{pickText(lang, 'নতুন স্টাফ যোগ করুন', 'Create Staff Account')}</span>
            </button>
          )
        }
      />

      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 w-fit">
        <button
          type="button"
          onClick={() => setTab('staff')}
          className={`px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer ${
            tab === 'staff' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>{pickText(lang, 'স্টাফ ও পারমিশন', 'Staff & Permissions')}</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('audit')}
          className={`px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer ${
            tab === 'audit' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <History className="w-4 h-4" />
          <span>{pickText(lang, 'কার্যকলাপ ও অডিট লগ', 'Activity & Audit Logs')}</span>
        </button>
      </div>

      {tab === 'staff' && (
        <>
          {staffList.length === 0 ? (
            <EmptyState
              title={pickText(lang, 'কোনো স্টাফ অ্যাকাউন্ট নেই', 'No Staff Accounts Yet')}
              description={pickText(
                lang,
                'ম্যানেজার বা কর্মচারী অ্যাকাউন্ট তৈরি করে তাদের দেখার, যোগ করার বা অনুমোদনের সীমা নির্ধারণ করুন।',
                'Create staff accounts and assign exact view, create, edit, or financial permissions.'
              )}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {staffList.map((s) => {
                const grantedCount = ALL_PERM_KEYS.filter((k) => s.permissions[k]).length;
                return (
                  <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-900 text-base">{s.name}</p>
                        <p className="text-xs text-slate-500">
                          @{s.username} • {s.assignedRoleTitle} {s.phone ? `• ${s.phone}` : ''}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          s.active ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {s.active ? pickText(lang, 'সক্রিয়', 'Active') : pickText(lang, 'নিষ্ক্রিয়', 'Disabled')}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600">
                      {pickText(lang, 'সক্রিয় অনুমতি:', 'Granted Permissions:')}{' '}
                      <strong className="font-mono-num">
                        {grantedCount}/{ALL_PERM_KEYS.length}
                      </strong>
                    </p>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setEditStaff({ ...s })}
                        className={secondaryBtnCls + ' !min-h-[36px] !text-xs flex-1'}
                      >
                        <Shield className="w-3.5 h-3.5" />
                        <span>{pickText(lang, 'অনুমতি সম্পাদনা', 'Edit Permissions')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(s)}
                        className={secondaryBtnCls + ' !min-h-[36px] !text-xs'}
                      >
                        {s.active ? <X className="w-3.5 h-3.5 text-rose-600" /> : <Check className="w-3.5 h-3.5 text-emerald-600" />}
                        <span>{s.active ? pickText(lang, 'নিষ্ক্রিয় করুন', 'Disable') : pickText(lang, 'সক্রিয় করুন', 'Enable')}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="px-4 py-3">{pickText(lang, 'সময়', 'Time')}</th>
                <th className="px-4 py-3">{pickText(lang, 'ব্যবহারকারী', 'User')}</th>
                <th className="px-4 py-3">{pickText(lang, 'কাজ', 'Action')}</th>
                <th className="px-4 py-3">{pickText(lang, 'বিবরণ', 'Details')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-2.5 text-xs font-mono-num text-slate-500">
                    {formatDateDisplay(l.createdAt, numeralMode)} {l.createdAt.slice(11, 19)}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-semibold text-slate-900">
                    {l.userName} ({l.userRole})
                  </td>
                  <td className="px-4 py-2.5 font-mono-num text-xs font-semibold text-emerald-700">
                    {l.action} · {l.entityType}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-700">{l.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Staff Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={pickText(lang, 'নতুন স্টাফ অ্যাকাউন্ট তৈরি', 'Create Staff Account')}
        maxWidth="max-w-2xl"
        lang={lang}
      >
        <form onSubmit={handleCreateStaff} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{pickText(lang, 'পূর্ণ নাম *', 'Full Name *')}</label>
              <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'ইউজারনেম *', 'Username *')}</label>
              <input required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="rahim_staff" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'পদবি / রোল', 'Role Title')}</label>
              <input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'পাসওয়ার্ড (৬+ অক্ষর) *', 'Password (6+ chars) *')}</label>
              <input required minLength={6} type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
            </div>
          </div>
          {renderPermissionMatrix(perms, setPerms)}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreateOpen(false)} className={secondaryBtnCls}>
              {pickText(lang, 'বাতিল', 'Cancel')}
            </button>
            <button type="submit" className={primaryBtnCls}>
              {pickText(lang, 'স্টাফ তৈরি করুন', 'Create Staff')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Staff Permissions Modal */}
      <Modal
        open={Boolean(editStaff)}
        onClose={() => setEditStaff(null)}
        title={editStaff ? `${editStaff.name} — ${pickText(lang, 'অনুমতি নিয়ন্ত্রণ', 'Edit Permissions')}` : ''}
        maxWidth="max-w-2xl"
        lang={lang}
      >
        {editStaff && (
          <form onSubmit={handleUpdateStaff} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{pickText(lang, 'নাম', 'Name')}</label>
                <input
                  value={editStaff.name}
                  onChange={(e) => setEditStaff({ ...editStaff, name: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{pickText(lang, 'পদবি', 'Role Title')}</label>
                <input
                  value={editStaff.assignedRoleTitle}
                  onChange={(e) => setEditStaff({ ...editStaff, assignedRoleTitle: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>
            {renderPermissionMatrix(editStaff.permissions, (next) =>
              setEditStaff({ ...editStaff, permissions: next })
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditStaff(null)} className={secondaryBtnCls}>
                {pickText(lang, 'বাতিল', 'Cancel')}
              </button>
              <button type="submit" className={primaryBtnCls}>
                {pickText(lang, 'আপডেট সংরক্ষণ', 'Save Changes')}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
