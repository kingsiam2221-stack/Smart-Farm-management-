import React, { useEffect, useMemo, useState } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, CheckCircle2, Globe, Package } from 'lucide-react';
import type { LangMode, NumeralMode, OrderRecord, ProductRecord, UserAccount } from '../types/saas';
import { apiRequest, newIdempotencyKey } from '../utils/api';
import {
  ORDER_STATUS_LABELS,
  formatCurrency,
  formatDateDisplay,
  formatNum,
  pickText,
} from '../utils/translations';
import {
  EmptyState,
  PageHeader,
  ProductImage,
  inputCls,
  labelCls,
  primaryBtnCls,
  secondaryBtnCls,
} from '../components/UI';

export function CustomerPortalView({
  activeTab,
  lang,
  numeralMode,
  user,
  onLangChange,
  onNumeralChange,
  onToast,
}: {
  activeTab: string;
  lang: LangMode;
  numeralMode: NumeralMode;
  user: UserAccount;
  onLangChange: (l: LangMode) => Promise<void>;
  onNumeralChange: (n: NumeralMode) => void;
  onToast: (type: 'success' | 'error', msg: string) => void;
}) {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [cart, setCart] = useState<Array<{ product: ProductRecord; quantity: number }>>([]);

  // Checkout fields
  const [deliveryAddress, setDeliveryAddress] = useState(user.address || '');
  const [city, setCity] = useState(user.city || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'bkash' | 'nagad' | 'card'>('cod');
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);

  const loadAll = async () => {
    try {
      const [pRes, oRes] = await Promise.all([
        apiRequest<ProductRecord[]>('/api/products'),
        apiRequest<OrderRecord[]>('/api/orders'),
      ]);
      setProducts(pRes);
      setOrders(oRes);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed to load portal data');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const addToCart = (product: ProductRecord) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: Math.min(product.stockQty, i.quantity + 1) } : i
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    onToast('success', pickText(lang, 'কার্টে যোগ হয়েছে', 'Added to cart'));
  };

  const updateCartQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => i.product.id !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, quantity: Math.min(i.product.stockQty, qty) } : i))
    );
  };

  const cartTotal = useMemo(
    () => cart.reduce((s, i) => s + i.product.price * i.quantity, 0),
    [cart]
  );

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;
    setPlacing(true);
    try {
      const res = await apiRequest<{ orderNumber: string }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          businessId: user.businessId,
          items: cart.map((c) => ({ productId: c.product.id, quantity: c.quantity })),
          deliveryAddress,
          city,
          phone,
          paymentMethod,
          notes,
          idempotencyKey: newIdempotencyKey(),
        }),
      });
      onToast('success', pickText(lang, `অর্ডার সম্পন্ন হয়েছে (${res.orderNumber})`, `Order placed (${res.orderNumber})`));
      setCart([]);
      setNotes('');
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Order failed');
    } finally {
      setPlacing(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    try {
      await apiRequest(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ deliveryStatus: 'cancelled' }),
      });
      onToast('success', pickText(lang, 'অর্ডার বাতিল করা হয়েছে', 'Order cancelled'));
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Cancel failed');
    }
  };

  if (activeTab === 'catalog') {
    return (
      <div className="space-y-6">
        <PageHeader
          title={pickText(lang, `${user.businessName || ''} — প্রকাশিত পণ্য ক্যাটালগ`, `${user.businessName || ''} — Product Catalog`)}
          subtitle={pickText(
            lang,
            'তাজা মুরগি, হাঁস, গরু, ছাগল, ডিম ও খামার পণ্য কার্টে যোগ করে অর্ডার করুন',
            'Browse published poultry, livestock, and farm products and add them to your cart'
          )}
        />
        {products.length === 0 ? (
          <EmptyState
            title={pickText(lang, 'বর্তমানে কোনো পণ্য প্রকাশিত নেই', 'No Published Products Available')}
            description={pickText(lang, 'ব্যবসার মালিক পণ্য প্রকাশ করলে এখানে দেখতে পাবেন।', 'Check back soon when the farm publishes new stock.')}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {products.map((p) => (
              <div key={p.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
                <div className="aspect-[4/3] bg-slate-100">
                  <ProductImage src={p.imageUrl} alt={p.nameEn} />
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">{lang === 'bn' ? p.nameBn : p.nameEn}</h3>
                    <p className="text-xs text-slate-500 mt-1">{lang === 'bn' ? p.descriptionBn : p.descriptionEn}</p>
                  </div>
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="font-mono-num font-bold text-lg text-emerald-700">
                        {formatCurrency(p.price, numeralMode)} / {p.unitLabel}
                      </span>
                      <span className="text-xs font-mono-num text-slate-600">
                        {pickText(lang, 'মজুদ', 'In Stock')}: {formatNum(p.stockQty, numeralMode)}
                      </span>
                    </div>
                    <button type="button" onClick={() => addToCart(p)} className={primaryBtnCls + ' w-full'}>
                      <ShoppingCart className="w-4 h-4" />
                      <span>{pickText(lang, 'কার্টে যোগ করুন', 'Add to Cart')}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'cart') {
    return (
      <div className="space-y-6">
        <PageHeader
          title={pickText(lang, 'শপিং কার্ট ও অর্ডার চেকআউট', 'Shopping Cart & Checkout')}
          subtitle={pickText(lang, 'ডেলিভারির ঠিকানা ও পেমেন্ট মাধ্যম নিশ্চিত করে অর্ডার পাঠান', 'Review quantities and submit your order')}
        />
        {cart.length === 0 ? (
          <EmptyState
            title={pickText(lang, 'আপনার কার্ট খালি', 'Your Cart is Empty')}
            description={pickText(lang, 'ক্যাটালগ থেকে পণ্য কার্টে যোগ করুন।', 'Add products from the Product Catalog first.')}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-3">
              {cart.map((item) => (
                <div key={item.product.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">
                      {lang === 'bn' ? item.product.nameBn : item.product.nameEn}
                    </p>
                    <p className="text-xs text-slate-500 font-mono-num">
                      {formatCurrency(item.product.price, numeralMode)} × {formatNum(item.quantity, numeralMode)} ={' '}
                      <strong className="text-slate-900">{formatCurrency(item.product.price * item.quantity, numeralMode)}</strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateCartQty(item.product.id, item.quantity - 1)}
                      className="w-8 h-8 rounded border border-slate-300 flex items-center justify-center cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={item.product.stockQty}
                      value={item.quantity}
                      onChange={(e) => updateCartQty(item.product.id, Number(e.target.value))}
                      className="w-16 text-center border border-slate-300 rounded py-1 text-sm font-mono-num"
                    />
                    <button
                      type="button"
                      onClick={() => updateCartQty(item.product.id, item.quantity + 1)}
                      className="w-8 h-8 rounded border border-slate-300 flex items-center justify-center cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCartQty(item.product.id, 0)}
                      className="text-rose-600 p-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handlePlaceOrder} className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <h2 className="font-bold text-slate-900">{pickText(lang, 'ডেলিভারি ও পেমেন্ট তথ্য', 'Delivery & Payment Details')}</h2>
              <div>
                <label className={labelCls}>{pickText(lang, 'মোবাইল নম্বর *', 'Phone *')}</label>
                <input required value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{pickText(lang, 'শহর *', 'City *')}</label>
                <input required value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{pickText(lang, 'ডেলিভারির ঠিকানা *', 'Delivery Address *')}</label>
                <input required value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{pickText(lang, 'পেমেন্ট মাধ্যম', 'Payment Method')}</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as 'cod' | 'bkash' | 'nagad' | 'card')} className={inputCls}>
                  <option value="cod">{pickText(lang, 'ক্যাশ অন ডেলিভারি (COD)', 'Cash on Delivery')}</option>
                  <option value="bkash">bKash</option>
                  <option value="nagad">Nagad</option>
                  <option value="card">Card</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>{pickText(lang, 'বিশেষ নির্দেশনা', 'Order Notes')}</label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
              </div>
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-base font-bold">
                <span>{pickText(lang, 'সর্বমোট মূল্য:', 'Order Total:')}</span>
                <span className="font-mono-num text-emerald-700">{formatCurrency(cartTotal, numeralMode)}</span>
              </div>
              <button type="submit" disabled={placing} className={primaryBtnCls + ' w-full'}>
                <CheckCircle2 className="w-4 h-4" />
                <span>{placing ? pickText(lang, 'অর্ডার পাঠানো হচ্ছে...', 'Submitting...') : pickText(lang, 'অর্ডার নিশ্চিত করুন', 'Place Order')}</span>
              </button>
            </form>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'orders') {
    const steps = ['pending', 'confirmed', 'processing', 'ready', 'shipped', 'delivered'] as const;
    return (
      <div className="space-y-6">
        <PageHeader
          title={pickText(lang, 'আমার অর্ডার ও ডেলিভারি ট্র্যাকিং', 'My Orders & Live Tracking')}
          subtitle={pickText(lang, 'প্রতিটি অর্ডারের বর্তমান অবস্থা রিয়েল-টাইমে দেখুন', 'Track delivery milestones for your orders')}
        />
        {orders.length === 0 ? (
          <EmptyState
            title={pickText(lang, 'কোনো অর্ডার করা হয়নি', 'No Orders Yet')}
            description={pickText(lang, 'কার্ট থেকে আপনার প্রথম অর্ডার করুন।', 'Place an order from the Product Catalog.')}
          />
        ) : (
          <div className="space-y-4">
            {orders.map((o) => {
              const st = ORDER_STATUS_LABELS[o.deliveryStatus];
              const stepIdx = steps.indexOf(o.deliveryStatus as (typeof steps)[number]);
              return (
                <div key={o.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-emerald-700" />
                        <span className="font-mono-num font-bold text-slate-900">{o.orderNumber}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${st.cls}`}>{st[lang]}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{formatDateDisplay(o.createdAt, numeralMode)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono-num font-bold text-lg text-emerald-700">
                        {formatCurrency(o.totalAmount, numeralMode)}
                      </span>
                      {o.deliveryStatus === 'pending' && (
                        <button
                          type="button"
                          onClick={() => handleCancelOrder(o.id)}
                          className={secondaryBtnCls + ' !min-h-[34px] !text-xs text-rose-700 border-rose-200'}
                        >
                          {pickText(lang, 'অর্ডার বাতিল', 'Cancel')}
                        </button>
                      )}
                    </div>
                  </div>

                  {o.deliveryStatus !== 'cancelled' && (
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-2">
                      {steps.map((s, idx) => (
                        <div
                          key={s}
                          className={`text-center p-2 rounded-lg border text-[11px] font-semibold ${
                            idx <= stepIdx ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-400'
                          }`}
                        >
                          {ORDER_STATUS_LABELS[s][lang]}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={pickText(lang, 'প্রোফাইল ও ভাষা সেটিংস', 'Customer Profile & Language')}
        subtitle={pickText(lang, 'আপনার দোকানের তথ্য ও পছন্দের ভাষা', 'Your registered shop profile and language')}
      />
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-500">{pickText(lang, 'দোকানের নাম', 'Shop Name')}</p>
            <p className="font-bold text-slate-900">{user.shopName}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{pickText(lang, 'মালিকের নাম', 'Owner Name')}</p>
            <p className="font-bold text-slate-900">{user.name}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{pickText(lang, 'মোবাইল', 'Mobile')}</p>
            <p className="font-mono-num font-semibold text-slate-900">{user.phone}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{pickText(lang, 'ঠিকানা', 'Address')}</p>
            <p className="text-slate-900">{user.address}, {user.city}</p>
          </div>
        </div>
        <div className="pt-4 border-t border-slate-200 flex flex-wrap gap-3 items-center">
          <Globe className="w-4 h-4 text-emerald-700" />
          <button type="button" onClick={() => onLangChange('bn')} className={lang === 'bn' ? primaryBtnCls : secondaryBtnCls}>
            বাংলা
          </button>
          <button type="button" onClick={() => onLangChange('en')} className={lang === 'en' ? primaryBtnCls : secondaryBtnCls}>
            English
          </button>
          <button type="button" onClick={() => onNumeralChange(numeralMode === 'bn' ? 'en' : 'bn')} className={secondaryBtnCls}>
            {numeralMode === 'bn' ? 'Switch Digits: 123' : 'সংখ্যা: ১২৩'}
          </button>
        </div>
      </div>
    </div>
  );
}
