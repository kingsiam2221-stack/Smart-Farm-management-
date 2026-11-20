import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Layers,
  Wheat,
  Receipt,
  PackageCheck,
  Shield,
  BarChart3,
  Settings,
  Bell,
  LogOut,
  Globe,
  ShoppingCart,
  Store,
  User as UserIcon,
  Building2,
  CreditCard,
  ShieldAlert,
  Menu,
  X,
  AlertTriangle,
} from 'lucide-react';
import type { LangMode, NotificationRecord, NumeralMode, UserAccount } from './types/saas';
import { apiRequest } from './utils/api';
import { formatNum, pickText, tr } from './utils/translations';
import { ToastBanner, primaryBtnCls, secondaryBtnCls } from './components/UI';
import { AuthPortalView } from './views/AuthPortalView';
import { OwnerDashboardView } from './views/OwnerDashboardView';
import { BatchesView } from './views/BatchesView';
import { FeedMedicineView } from './views/FeedMedicineView';
import { ExpensesPartiesView } from './views/ExpensesPartiesView';
import { OrdersProductsView } from './views/OrdersProductsView';
import { StaffView } from './views/StaffView';
import { ReportsView } from './views/ReportsView';
import { SubscriptionSettingsView } from './views/SubscriptionSettingsView';
import { CustomerPortalView } from './views/CustomerPortalView';
import { SuperAdminView } from './views/SuperAdminView';

interface AuthStatusResponse {
  hasSuperAdmin: boolean;
  businesses: Array<{ id: string; name: string; city: string }>;
  plans: { monthlyPrice: number; yearlyPrice: number; trialDays: number };
  user: UserAccount | null;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [user, setUser] = useState<UserAccount | null>(null);

  const [lang, setLang] = useState<LangMode>('bn');
  const [numeralMode, setNumeralMode] = useState<NumeralMode>('bn');
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const getDefaultTabForUser = (u: UserAccount): string => {
    if (u.role === 'super_admin') return 'overview';
    if (u.role === 'customer') return 'catalog';
    if (u.role === 'business_owner') return 'dashboard';
    if (u.permissions['finance.view']) return 'dashboard';
    if (u.permissions['animals.view']) return 'batches';
    if (u.permissions['feed.view'] || u.permissions['medicine.view']) return 'feed_med';
    if (u.permissions['orders.view']) return 'orders_catalog';
    return 'settings';
  };

  const fetchAuthStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<AuthStatusResponse>('/api/auth/status');
      setAuthStatus(res);
      setUser(res.user);
      if (res.user) {
        setLang(res.user.preferredLang);
        setNumeralMode(res.user.preferredLang);
        setActiveTab(getDefaultTabForUser(res.user));
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAuthStatus();
  }, [fetchAuthStatus]);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const list = await apiRequest<NotificationRecord[]>('/api/notifications');
      setNotifications(list);
    } catch {
      // ignore
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadNotifications();
    }
  }, [user, loadNotifications]);

  const handleAuthenticated = (u: UserAccount) => {
    setUser(u);
    setLang(u.preferredLang);
    setNumeralMode(u.preferredLang);
    setActiveTab(getDefaultTabForUser(u));
  };

  const handleLangChange = async (nextLang: LangMode) => {
    setLang(nextLang);
    setNumeralMode(nextLang);
    if (user) {
      try {
        const res = await apiRequest<{ user: UserAccount }>('/api/auth/preferences', {
          method: 'PATCH',
          body: JSON.stringify({ preferredLang: nextLang }),
        });
        if (res.user) setUser(res.user);
      } catch {
        // non-fatal
      }
    }
  };

  const handleLogout = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setNotifications([]);
    await fetchAuthStatus();
  };

  const handleMarkNotificationsRead = async () => {
    try {
      await apiRequest('/api/notifications/mark-read', { method: 'POST' });
      await loadNotifications();
    } catch {
      // ignore
    }
  };

  const navItems: NavItem[] = useMemo(() => {
    if (!user) return [];
    if (user.role === 'super_admin') {
      return [
        { id: 'overview', label: tr(lang, 'platformOverview'), icon: LayoutDashboard },
        { id: 'businesses', label: tr(lang, 'businesses'), icon: Building2 },
        { id: 'subscriptions', label: tr(lang, 'subRevenue'), icon: CreditCard },
        { id: 'settings', label: tr(lang, 'platformSettings'), icon: Settings },
        { id: 'support', label: tr(lang, 'supportAudit'), icon: ShieldAlert },
      ];
    }
    if (user.role === 'customer') {
      return [
        { id: 'catalog', label: tr(lang, 'catalogStore'), icon: Store },
        { id: 'cart', label: tr(lang, 'cartCheckout'), icon: ShoppingCart },
        { id: 'orders', label: tr(lang, 'myOrders'), icon: PackageCheck },
        { id: 'profile', label: tr(lang, 'profileLang'), icon: UserIcon },
      ];
    }

    const items: NavItem[] = [];
    const p = user.permissions;
    const isOwner = user.role === 'business_owner';
    if (isOwner || p['finance.view']) items.push({ id: 'dashboard', label: tr(lang, 'dashboard'), icon: LayoutDashboard });
    if (isOwner || p['animals.view']) items.push({ id: 'batches', label: tr(lang, 'batches'), icon: Layers });
    if (isOwner || p['feed.view'] || p['medicine.view']) items.push({ id: 'feed_med', label: tr(lang, 'feedMedicine'), icon: Wheat });
    if (isOwner || p['finance.view'] || p['customers.view']) items.push({ id: 'expenses_parties', label: tr(lang, 'expensesParties'), icon: Receipt });
    if (isOwner || p['orders.view'] || p['products.manage']) items.push({ id: 'orders_catalog', label: tr(lang, 'ordersCatalog'), icon: PackageCheck });
    if (isOwner) items.push({ id: 'staff', label: tr(lang, 'staffPermissions'), icon: Shield });
    if (isOwner || p['finance.view']) items.push({ id: 'reports', label: tr(lang, 'reports'), icon: BarChart3 });
    items.push({ id: 'settings', label: tr(lang, 'subscriptionSettings'), icon: Settings });
    return items;
  }, [user, lang]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);

  if (loading || !authStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm font-semibold text-slate-600">
        {tr(lang, 'loading')}
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />
        <AuthPortalView
          lang={lang}
          onLangChange={(l) => {
            setLang(l);
            setNumeralMode(l);
          }}
          status={authStatus}
          onAuthenticated={handleAuthenticated}
          onToast={showToast}
        />
      </>
    );
  }

  const isExpiredBiz =
    (user.role === 'business_owner' || user.role === 'staff') && user.subscriptionStatus === 'expired';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-68 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 no-print">
        <div className="h-16 px-5 border-b border-slate-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-700 text-white font-bold flex items-center justify-center shrink-0">
            SF
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm text-slate-900 truncate">{user.businessName || tr(lang, 'appBrand')}</p>
            <p className="text-[11px] text-slate-500 truncate uppercase font-semibold">{user.role.replace('_', ' ')}</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full min-h-[42px] px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-3 transition-colors cursor-pointer ${
                  active ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-2">
          <div className="text-xs">
            <p className="font-bold text-slate-900 truncate">{user.name}</p>
            <p className="text-slate-500 truncate">{user.email || user.phone || user.username}</p>
          </div>
          <button type="button" onClick={handleLogout} className={secondaryBtnCls + ' w-full !min-h-[36px] !text-xs'}>
            <LogOut className="w-3.5 h-3.5" />
            <span>{tr(lang, 'signOut')}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex bg-slate-900/50 no-print">
          <div className="w-72 bg-white h-full border-r border-slate-200 flex flex-col">
            <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between">
              <span className="font-bold text-sm text-slate-900 truncate">{user.businessName || tr(lang, 'appBrand')}</span>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="p-2 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full min-h-[42px] px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-3 cursor-pointer ${
                      active ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200">
              <button type="button" onClick={handleLogout} className={secondaryBtnCls + ' w-full !text-xs'}>
                <LogOut className="w-3.5 h-3.5" />
                <span>{tr(lang, 'signOut')}</span>
              </button>
            </div>
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 lg:pl-68 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-14 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden min-h-[38px] min-w-[38px] rounded-lg border border-slate-200 flex items-center justify-center text-slate-700"
              aria-label="Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-semibold text-sm text-slate-800 truncate">
              {navItems.find((n) => n.id === activeTab)?.label}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleLangChange(lang === 'bn' ? 'en' : 'bn')}
              className={secondaryBtnCls + ' !min-h-[38px] !px-3 !text-xs'}
            >
              <Globe className="w-3.5 h-3.5 text-emerald-700" />
              <span>{lang === 'bn' ? 'English' : 'বাংলা'}</span>
            </button>
            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              className={secondaryBtnCls + ' !min-h-[38px] !px-3 !text-xs'}
            >
              <Bell className="w-3.5 h-3.5 text-emerald-700" />
              <span className="hidden sm:inline">{tr(lang, 'notifications')}</span>
              {unreadCount > 0 && (
                <span className="font-mono-num text-rose-700 font-bold">({formatNum(unreadCount, numeralMode)})</span>
              )}
            </button>
          </div>
        </header>

        {isExpiredBiz && (
          <div className="bg-rose-50 border-b border-rose-200 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-900 no-print">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                {pickText(
                  lang,
                  'আপনার সাবস্ক্রিপশনের মেয়াদ শেষ হয়েছে — নতুন ডেটা এন্ট্রি বন্ধ আছে। অনুগ্রহ করে প্ল্যান নবায়ন করুন।',
                  'Your subscription has expired — new write operations are blocked until you renew.'
                )}
              </span>
            </div>
            {user.role === 'business_owner' && (
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className={primaryBtnCls + ' !min-h-[34px] !px-3 !text-xs'}
              >
                {pickText(lang, 'প্ল্যান নবায়ন করুন', 'Renew Plan')}
              </button>
            )}
          </div>
        )}

        <main className="flex-1 px-4 sm:px-6 py-6 max-w-7xl w-full mx-auto">
          {user.role === 'super_admin' && (
            <SuperAdminView activeTab={activeTab} lang={lang} numeralMode={numeralMode} onToast={showToast} />
          )}

          {user.role === 'customer' && (
            <CustomerPortalView
              activeTab={activeTab}
              lang={lang}
              numeralMode={numeralMode}
              user={user}
              onLangChange={handleLangChange}
              onNumeralChange={setNumeralMode}
              onToast={showToast}
            />
          )}

          {(user.role === 'business_owner' || user.role === 'staff') && (
            <>
              {activeTab === 'dashboard' && (
                <OwnerDashboardView
                  lang={lang}
                  numeralMode={numeralMode}
                  user={user}
                  onNavigate={setActiveTab}
                  onToast={showToast}
                />
              )}
              {activeTab === 'batches' && (
                <BatchesView lang={lang} numeralMode={numeralMode} user={user} onToast={showToast} />
              )}
              {activeTab === 'feed_med' && (
                <FeedMedicineView lang={lang} numeralMode={numeralMode} user={user} onToast={showToast} />
              )}
              {activeTab === 'expenses_parties' && (
                <ExpensesPartiesView lang={lang} numeralMode={numeralMode} user={user} onToast={showToast} />
              )}
              {activeTab === 'orders_catalog' && (
                <OrdersProductsView lang={lang} numeralMode={numeralMode} user={user} onToast={showToast} />
              )}
              {activeTab === 'staff' && user.role === 'business_owner' && (
                <StaffView lang={lang} numeralMode={numeralMode} onToast={showToast} />
              )}
              {activeTab === 'reports' && (
                <ReportsView lang={lang} numeralMode={numeralMode} user={user} onToast={showToast} />
              )}
              {activeTab === 'settings' && (
                <SubscriptionSettingsView
                  lang={lang}
                  numeralMode={numeralMode}
                  user={user}
                  onLangChange={handleLangChange}
                  onNumeralChange={setNumeralMode}
                  onUserUpdated={setUser}
                  onToast={showToast}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Notifications Drawer */}
      {notifOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[1px] no-print">
          <div className="w-full max-w-md bg-white h-full border-l border-slate-200 flex flex-col shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <Bell className="w-4 h-4 text-emerald-700" />
                <span>{tr(lang, 'notifications')}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleMarkNotificationsRead}
                  className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                >
                  {tr(lang, 'markAllRead')}
                </button>
                <button
                  type="button"
                  onClick={() => setNotifOpen(false)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {notifications.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">{tr(lang, 'noData')}</p>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-3.5 rounded-xl border text-xs ${
                      n.severity === 'critical'
                        ? 'bg-rose-50 border-rose-200 text-rose-900'
                        : n.severity === 'warning'
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  >
                    <p className="font-bold">{lang === 'bn' ? n.titleBn : n.titleEn}</p>
                    <p className="mt-1 opacity-90">{lang === 'bn' ? n.bodyBn : n.bodyEn}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
