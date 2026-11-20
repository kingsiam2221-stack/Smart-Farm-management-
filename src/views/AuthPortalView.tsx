import React, { useState } from 'react';
import { ShieldCheck, Building2, ShoppingBag, LogIn, Globe, CheckCircle2 } from 'lucide-react';
import type { LangMode, UserAccount } from '../types/saas';
import { apiRequest } from '../utils/api';
import { inputCls, labelCls, primaryBtnCls, secondaryBtnCls } from '../components/UI';
import { pickText } from '../utils/translations';

interface AuthStatusPayload {
  hasSuperAdmin: boolean;
  businesses: Array<{ id: string; name: string; city: string }>;
  plans: { monthlyPrice: number; yearlyPrice: number; trialDays: number };
}

export function AuthPortalView({
  lang,
  onLangChange,
  status,
  onAuthenticated,
  onToast,
}: {
  lang: LangMode;
  onLangChange: (l: LangMode) => void;
  status: AuthStatusPayload;
  onAuthenticated: (user: UserAccount) => void;
  onToast: (type: 'success' | 'error', message: string) => void;
}) {
  const [mode, setMode] = useState<'login' | 'owner' | 'customer' | 'super_admin'>(
    !status.hasSuperAdmin ? 'super_admin' : 'login'
  );
  const [loading, setLoading] = useState(false);

  // Login form
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Owner signup
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerCity, setOwnerCity] = useState('');
  const [ownerAddress, setOwnerAddress] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [ownerLang, setOwnerLang] = useState<LangMode>(lang);

  // Customer signup
  const [cusBusinessId, setCusBusinessId] = useState(status.businesses[0]?.id || '');
  const [shopName, setShopName] = useState('');
  const [cusOwnerName, setCusOwnerName] = useState('');
  const [cusPhone, setCusPhone] = useState('');
  const [cusCity, setCusCity] = useState('');
  const [cusAddress, setCusAddress] = useState('');
  const [cusEmail, setCusEmail] = useState('');
  const [cusPassword, setCusPassword] = useState('');
  const [cusLang, setCusLang] = useState<LangMode>(lang);

  // Super Admin setup
  const [saName, setSaName] = useState('');
  const [saEmail, setSaEmail] = useState('');
  const [saPhone, setSaPhone] = useState('');
  const [saPassword, setSaPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiRequest<{ user: UserAccount }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password: loginPassword }),
      });
      onToast('success', pickText(lang, 'সফলভাবে লগইন হয়েছে', 'Signed in successfully'));
      onAuthenticated(res.user);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiRequest<{ user: UserAccount }>('/api/auth/register-owner', {
        method: 'POST',
        body: JSON.stringify({
          businessName,
          ownerName,
          phone: ownerPhone,
          email: ownerEmail,
          city: ownerCity,
          address: ownerAddress,
          password: ownerPassword,
          preferredLang: ownerLang,
        }),
      });
      onToast(
        'success',
        pickText(ownerLang, 'ব্যবসা নিবন্ধিত হয়েছে ও ১৪ দিনের ফ্রি ট্রায়াল শুরু হয়েছে', 'Business registered with 14-day trial')
      );
      onAuthenticated(res.user);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiRequest<{ user: UserAccount }>('/api/auth/register-customer', {
        method: 'POST',
        body: JSON.stringify({
          businessId: cusBusinessId || status.businesses[0]?.id,
          shopName,
          ownerName: cusOwnerName,
          phone: cusPhone,
          city: cusCity,
          address: cusAddress,
          email: cusEmail,
          password: cusPassword,
          preferredLang: cusLang,
        }),
      });
      onToast('success', pickText(cusLang, 'ক্রেতা অ্যাকাউন্ট তৈরি হয়েছে', 'Customer account created'));
      onAuthenticated(res.user);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Customer signup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSetupSuperAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiRequest<{ user: UserAccount }>('/api/auth/setup-super-admin', {
        method: 'POST',
        body: JSON.stringify({
          name: saName,
          email: saEmail,
          phone: saPhone,
          password: saPassword,
          preferredLang: lang,
        }),
      });
      onToast('success', pickText(lang, 'সুপার অ্যাডমিন তৈরি হয়েছে', 'Super Admin initialized'));
      onAuthenticated(res.user);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white font-bold flex items-center justify-center text-lg">
            SF
          </div>
          <div>
            <p className="font-bold text-slate-900 text-base leading-tight">
              {pickText(lang, 'স্মার্ট পোল্ট্রি ও লাইভস্টক SaaS', 'Smart Poultry & Livestock SaaS')}
            </p>
            <p className="text-xs text-slate-500">
              {pickText(lang, 'বাণিজ্যিক খামার, ট্রেডিং ও ক্রেতা পোর্টাল প্ল্যাটফর্ম', 'Commercial Farm, Trading & Customer Portal')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onLangChange(lang === 'bn' ? 'en' : 'bn')}
          className={secondaryBtnCls + ' !min-h-[38px] !px-3'}
        >
          <Globe className="w-4 h-4 text-emerald-700" />
          <span>{lang === 'bn' ? 'English' : 'বাংলা'}</span>
        </button>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <section className="lg:col-span-5 space-y-5 pt-2">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              {pickText(lang, 'মাল্টি-টেন্যান্ট বাণিজ্যিক প্ল্যাটফর্ম', 'Multi-Tenant Commercial SaaS')}
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-snug text-balance">
              {pickText(
                lang,
                'প্রতিটি প্রাণী ব্যাচের আসল খরচ ও লাভ-ক্ষতি স্বয়ংক্রিয়ভাবে হিসাব করুন',
                'Automatically Calculate Real Per-Animal Cost & Profit Across Every Batch'
              )}
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              {pickText(
                lang,
                'মুরগি, হাঁস, কোয়েল, গরু ও ছাগলের খামার এবং পোল্ট্রি ট্রেডিং ব্যবসার সম্পূর্ণ হিসাব — অব্যবহৃত খাদ্য/ওষুধের মজুদ আলাদা রেখে শুধুমাত্র ব্যবহৃত খরচ প্রতিটি ব্যাচে স্বয়ংক্রিয়ভাবে যুক্ত হয়।',
                'Complete operations for poultry, livestock farms, and animal trading — separating unused feed/medicine assets from consumed costs and allocating expenses accurately to batches.'
              )}
            </p>

            <div className="grid grid-cols-1 gap-2.5 pt-2 text-sm text-slate-700">
              {[
                pickText(lang, '৪টি খরচ বণ্টন পদ্ধতি (সমান, ওজন, ব্যাচ ও কাস্টম %)', '4 Cost Allocation Engines (Equal, Weight, Batch, Custom %)'),
                pickText(lang, 'ক্রেতা পোর্টাল, অনলাইন অর্ডার ও স্টক সুরক্ষা', 'Dedicated Customer Portal, Orders & Oversell Protection'),
                pickText(lang, '২৪টি সূক্ষ্ম স্টাফ পারমিশন ও সম্পূর্ণ অডিট লগ', '24 Granular Staff Permissions & Immutable Audit Logs'),
                pickText(
                  lang,
                  `${status.plans.trialDays} দিনের ফ্রি ট্রায়াল | মাসিক ৳${status.plans.monthlyPrice} | বার্ষিক ৳${status.plans.yearlyPrice}`,
                  `${status.plans.trialDays}-Day Free Trial | Monthly ৳${status.plans.monthlyPrice} | Yearly ৳${status.plans.yearlyPrice}`
                ),
              ].map((line) => (
                <div key={line} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <span>{line}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <img
              src="/src/assets/images/catalog_poultry_chicken_1795135757978.jpg"
              alt="Poultry farm"
              className="w-full aspect-[4/3] object-cover rounded-xl border border-slate-200"
            />
            <img
              src="/src/assets/images/catalog_cattle_goat_1795135758140.jpg"
              alt="Cattle and goats"
              className="w-full aspect-[4/3] object-cover rounded-xl border border-slate-200"
            />
          </div>
        </section>

        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-slate-200 bg-slate-50">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`px-3 py-3 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                mode === 'login' ? 'border-emerald-700 text-emerald-800 bg-white' : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <LogIn className="w-4 h-4 shrink-0" />
              <span className="truncate">{pickText(lang, 'লগইন', 'Sign In')}</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('owner')}
              className={`px-3 py-3 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                mode === 'owner' ? 'border-emerald-700 text-emerald-800 bg-white' : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-4 h-4 shrink-0" />
              <span className="truncate">{pickText(lang, 'ব্যবসা নিবন্ধন', 'Business Sign Up')}</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('customer')}
              className={`px-3 py-3 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                mode === 'customer' ? 'border-emerald-700 text-emerald-800 bg-white' : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShoppingBag className="w-4 h-4 shrink-0" />
              <span className="truncate">{pickText(lang, 'ক্রেতা নিবন্ধন', 'Customer Sign Up')}</span>
            </button>
            {!status.hasSuperAdmin && (
              <button
                type="button"
                onClick={() => setMode('super_admin')}
                className={`px-3 py-3 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                  mode === 'super_admin' ? 'border-emerald-700 text-emerald-800 bg-white' : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span className="truncate">{pickText(lang, 'সুপার অ্যাডমিন', 'Super Admin')}</span>
              </button>
            )}
          </div>

          <div className="p-6">
            {mode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {pickText(lang, 'অ্যাকাউন্টে প্রবেশ করুন', 'Sign In to Your Account')}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {pickText(
                      lang,
                      'সুপার অ্যাডমিন, ব্যবসার মালিক, স্টাফ বা ক্রেতা — আপনার ইমেইল, মোবাইল বা ইউজারনেম দিন',
                      'Enter your email, mobile number, or staff username'
                    )}
                  </p>
                </div>
                <div>
                  <label className={labelCls}>
                    {pickText(lang, 'ইমেইল / মোবাইল / ইউজারনেম', 'Email / Mobile / Username')}
                  </label>
                  <input
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="owner@farm.com / 017..."
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>{pickText(lang, 'পাসওয়ার্ড', 'Password')}</label>
                  <input
                    required
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••"
                    className={inputCls}
                  />
                </div>
                <button type="submit" disabled={loading} className={primaryBtnCls + ' w-full'}>
                  {loading ? pickText(lang, 'যাচাই হচ্ছে...', 'Signing in...') : pickText(lang, 'লগইন করুন', 'Sign In')}
                </button>
              </form>
            )}

            {mode === 'owner' && (
              <form onSubmit={handleRegisterOwner} className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {pickText(lang, 'নতুন ব্যবসা নিবন্ধন (১৪ দিন ফ্রি ট্রায়াল)', 'Register New Business (14-Day Free Trial)')}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {pickText(lang, 'প্রতিটি ব্যবসার ডেটা সম্পূর্ণ আলাদা ও সুরক্ষিত থাকে', 'Every business workspace is strictly isolated')}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>{pickText(lang, 'ব্যবসা / খামারের নাম *', 'Business / Farm Name *')}</label>
                    <input
                      required
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder={pickText(lang, 'সবুজ পোল্ট্রি ফার্ম', 'Green Valley Poultry')}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>{pickText(lang, 'মালিকের নাম *', 'Owner Name *')}</label>
                    <input
                      required
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>{pickText(lang, 'ইমেইল *', 'Email *')}</label>
                    <input
                      required
                      type="email"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>{pickText(lang, 'মোবাইল নম্বর', 'Mobile Number')}</label>
                    <input
                      value={ownerPhone}
                      onChange={(e) => setOwnerPhone(e.target.value)}
                      placeholder="017XXXXXXXX"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>{pickText(lang, 'শহর / জেলা', 'City / District')}</label>
                    <input value={ownerCity} onChange={(e) => setOwnerCity(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{pickText(lang, 'ডিফল্ট ভাষা', 'Default Language')}</label>
                    <select
                      value={ownerLang}
                      onChange={(e) => setOwnerLang(e.target.value as LangMode)}
                      className={inputCls}
                    >
                      <option value="bn">বাংলা (Bengali)</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>{pickText(lang, 'ঠিকানা', 'Address')}</label>
                  <input value={ownerAddress} onChange={(e) => setOwnerAddress(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{pickText(lang, 'পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর) *', 'Password (min 6 chars) *')}</label>
                  <input
                    required
                    minLength={6}
                    type="password"
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <button type="submit" disabled={loading} className={primaryBtnCls + ' w-full'}>
                  {loading
                    ? pickText(lang, 'অ্যাকাউন্ট তৈরি হচ্ছে...', 'Creating business...')
                    : pickText(lang, 'ব্যবসা তৈরি করুন ও ট্রায়াল শুরু করুন', 'Create Business & Start Trial')}
                </button>
              </form>
            )}

            {mode === 'customer' && (
              <form onSubmit={handleRegisterCustomer} className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {pickText(lang, 'ক্রেতা পোর্টাল নিবন্ধন', 'Customer Portal Registration')}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {pickText(lang, 'প্রকাশিত পণ্য দেখতে ও অনলাইনে অর্ডার করতে নিবন্ধন করুন', 'Register to browse published products and place orders')}
                  </p>
                </div>

                {status.businesses.length === 0 ? (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                    {pickText(
                      lang,
                      'এখনো কোনো সক্রিয় খামার বা ব্যবসা নিবন্ধিত হয়নি। আগে একটি ব্যবসা নিবন্ধন করুন।',
                      'No active businesses available yet. Register a Business Owner first.'
                    )}
                  </div>
                ) : (
                  <>
                    <div>
                      <label className={labelCls}>{pickText(lang, 'ব্যবসা / খামার নির্বাচন করুন *', 'Select Supplier Business *')}</label>
                      <select
                        required
                        value={cusBusinessId || status.businesses[0]?.id || ''}
                        onChange={(e) => setCusBusinessId(e.target.value)}
                        className={inputCls}
                      >
                        {status.businesses.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} {b.city ? `(${b.city})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>{pickText(lang, 'দোকানের নাম *', 'Shop Name *')}</label>
                        <input required value={shopName} onChange={(e) => setShopName(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{pickText(lang, 'মালিকের নাম *', 'Owner Name *')}</label>
                        <input required value={cusOwnerName} onChange={(e) => setCusOwnerName(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{pickText(lang, 'মোবাইল নম্বর *', 'Mobile Number *')}</label>
                        <input required value={cusPhone} onChange={(e) => setCusPhone(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{pickText(lang, 'পাসওয়ার্ড (৬+ অক্ষর) *', 'Password (6+ chars) *')}</label>
                        <input
                          required
                          minLength={6}
                          type="password"
                          value={cusPassword}
                          onChange={(e) => setCusPassword(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>{pickText(lang, 'শহর *', 'City *')}</label>
                        <input required value={cusCity} onChange={(e) => setCusCity(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{pickText(lang, 'ইমেইল (ঐচ্ছিক)', 'Email (Optional)')}</label>
                        <input type="email" value={cusEmail} onChange={(e) => setCusEmail(e.target.value)} className={inputCls} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>{pickText(lang, 'ডেলিভারির ঠিকানা *', 'Address *')}</label>
                        <input required value={cusAddress} onChange={(e) => setCusAddress(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{pickText(lang, 'পছন্দের ভাষা', 'Preferred Language')}</label>
                        <select value={cusLang} onChange={(e) => setCusLang(e.target.value as LangMode)} className={inputCls}>
                          <option value="bn">বাংলা (Bengali)</option>
                          <option value="en">English</option>
                        </select>
                      </div>
                    </div>
                    <button type="submit" disabled={loading} className={primaryBtnCls + ' w-full'}>
                      {loading
                        ? pickText(lang, 'নিবন্ধন হচ্ছে...', 'Registering...')
                        : pickText(lang, 'ক্রেতা অ্যাকাউন্ট তৈরি করুন', 'Register as Customer')}
                    </button>
                  </>
                )}
              </form>
            )}

            {mode === 'super_admin' && !status.hasSuperAdmin && (
              <form onSubmit={handleSetupSuperAdmin} className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {pickText(lang, 'প্ল্যাটফর্ম সুপার অ্যাডমিন সেটআপ', 'Initialize Platform Super Admin')}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {pickText(
                      lang,
                      'প্রথমবার প্ল্যাটফর্ম চালু করার জন্য একজন সুপার অ্যাডমিন তৈরি করুন',
                      'One-time setup for the SaaS Platform Owner account'
                    )}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>{pickText(lang, 'পূর্ণ নাম *', 'Full Name *')}</label>
                    <input required value={saName} onChange={(e) => setSaName(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{pickText(lang, 'ইমেইল *', 'Email *')}</label>
                    <input required type="email" value={saEmail} onChange={(e) => setSaEmail(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{pickText(lang, 'মোবাইল', 'Mobile')}</label>
                    <input value={saPhone} onChange={(e) => setSaPhone(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{pickText(lang, 'পাসওয়ার্ড (৬+ অক্ষর) *', 'Password (6+ chars) *')}</label>
                    <input
                      required
                      minLength={6}
                      type="password"
                      value={saPassword}
                      onChange={(e) => setSaPassword(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>
                <button type="submit" disabled={loading} className={primaryBtnCls + ' w-full'}>
                  {loading
                    ? pickText(lang, 'সেটআপ হচ্ছে...', 'Initializing...')
                    : pickText(lang, 'সুপার অ্যাডমিন তৈরি করুন', 'Create Super Admin Account')}
                </button>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
