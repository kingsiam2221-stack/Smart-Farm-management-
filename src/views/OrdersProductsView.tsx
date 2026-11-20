import React, { useEffect, useState } from 'react';
import { PackageCheck, Plus, Store, Trash2, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import type {
  BatchWithFinancials,
  LangMode,
  NumeralMode,
  OrderDeliveryStatus,
  OrderRecord,
  ProductRecord,
  UserAccount,
} from '../types/saas';
import { apiRequest } from '../utils/api';
import {
  CATALOG_PRESET_IMAGES,
  ORDER_STATUS_LABELS,
  formatCurrency,
  formatDateDisplay,
  formatNum,
  pickText,
} from '../utils/translations';
import {
  EmptyState,
  Modal,
  PageHeader,
  ProductImage,
  inputCls,
  labelCls,
  primaryBtnCls,
  secondaryBtnCls,
} from '../components/UI';

const ORDER_FLOW: OrderDeliveryStatus[] = ['pending', 'confirmed', 'processing', 'ready', 'shipped', 'delivered', 'cancelled'];

export function OrdersProductsView({
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
  const canViewOrders = user.role === 'business_owner' || user.permissions['orders.view'];
  const canConfirmOrder = user.role === 'business_owner' || user.permissions['orders.confirm'];
  const canUpdateStatus = user.role === 'business_owner' || user.permissions['orders.update_status'];
  const canCancelOrder = user.role === 'business_owner' || user.permissions['orders.cancel'];
  const canManageProducts = user.role === 'business_owner' || user.permissions['products.manage'];

  const [tab, setTab] = useState<'orders' | 'products'>(canViewOrders ? 'orders' : 'products');
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [batches, setBatches] = useState<BatchWithFinancials[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [prodOpen, setProdOpen] = useState(false);
  const [linkedType, setLinkedType] = useState<'batch' | 'standalone'>('batch');
  const [linkedId, setLinkedId] = useState('');
  const [category, setCategory] = useState('chicken');
  const [nameBn, setNameBn] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [descBn, setDescBn] = useState('');
  const [descEn, setDescEn] = useState('');
  const [unitLabel, setUnitLabel] = useState('piece');
  const [price, setPrice] = useState('180');
  const [stockQty, setStockQty] = useState('100');
  const [imageUrl, setImageUrl] = useState(CATALOG_PRESET_IMAGES[0].url);
  const [isPublished, setIsPublished] = useState(true);

  const loadAll = async () => {
    try {
      if (canViewOrders) {
        const oRes = await apiRequest<OrderRecord[]>('/api/orders');
        setOrders(oRes);
      }
      const pRes = await apiRequest<ProductRecord[]>('/api/products');
      setProducts(pRes);
      if (user.role === 'business_owner' || user.permissions['animals.view']) {
        const bRes = await apiRequest<BatchWithFinancials[]>('/api/batches');
        setBatches(bRes.filter((b) => b.remainingQuantity > 0));
      }
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed to load orders/catalog');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleUpdateOrder = async (orderId: string, deliveryStatus: OrderDeliveryStatus, paymentStatus?: string) => {
    try {
      await apiRequest(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ deliveryStatus, paymentStatus }),
      });
      onToast('success', pickText(lang, 'অর্ডারের অবস্থা আপডেট হয়েছে', 'Order status updated'));
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/products', {
        method: 'POST',
        body: JSON.stringify({
          category,
          linkedType,
          linkedId: linkedType === 'batch' ? linkedId || batches[0]?.id || null : null,
          nameBn,
          nameEn: nameEn || nameBn,
          descriptionBn: descBn,
          descriptionEn: descEn || descBn,
          unitLabel,
          price: Number(price),
          stockQty: Number(stockQty),
          imageUrl,
          isPublished,
        }),
      });
      onToast('success', pickText(lang, 'পণ্য ক্যাটালগে সংরক্ষিত হয়েছে', 'Product saved to catalog'));
      setProdOpen(false);
      setNameBn('');
      setNameEn('');
      setDescBn('');
      setDescEn('');
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Product save failed');
    }
  };

  const handleTogglePublish = async (p: ProductRecord) => {
    try {
      await apiRequest(`/api/products/${p.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isPublished: !p.isPublished }),
      });
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      await apiRequest(`/api/products/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const filteredOrders = statusFilter === 'all' ? orders : orders.filter((o) => o.deliveryStatus === statusFilter);

  return (
    <div className="space-y-6">
      <PageHeader
        title={pickText(lang, 'অর্ডার ম্যানেজমেন্ট ও পণ্য ক্যাটালগ', 'Order Management & Published Catalog')}
        subtitle={pickText(
          lang,
          'ক্রেতার অর্ডার কনফার্ম করলে স্বয়ংক্রিয়ভাবে স্টক কর্তন ও ব্যাচ বিক্রয় রেকর্ড হয়',
          'Confirming orders validates inventory atomically to prevent overselling and updates batch revenue'
        )}
        action={
          tab === 'products' &&
          canManageProducts && (
            <button
              type="button"
              onClick={() => {
                if (batches.length > 0 && !linkedId) {
                  setLinkedId(batches[0].id);
                  setStockQty(String(batches[0].remainingQuantity));
                }
                setProdOpen(true);
              }}
              className={primaryBtnCls}
            >
              <Plus className="w-4 h-4" />
              <span>{pickText(lang, 'নতুন পণ্য প্রকাশ করুন', 'Publish Product')}</span>
            </button>
          )
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {canViewOrders && (
            <button
              type="button"
              onClick={() => setTab('orders')}
              className={`px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer ${
                tab === 'orders' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <PackageCheck className="w-4 h-4" />
              <span>{pickText(lang, 'ক্রেতার অর্ডার', 'Customer Orders')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setTab('products')}
            className={`px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer ${
              tab === 'products' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>{pickText(lang, 'প্রকাশিত পণ্য ক্যাটালগ', 'Product Catalog')}</span>
          </button>
        </div>

        {tab === 'orders' && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls + ' !w-auto min-w-[160px]'}>
            <option value="all">{pickText(lang, 'সব অর্ডার', 'All Orders')}</option>
            {ORDER_FLOW.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s][lang]}
              </option>
            ))}
          </select>
        )}
      </div>

      {tab === 'orders' && (
        <div className="space-y-4">
          {filteredOrders.length === 0 ? (
            <EmptyState
              title={pickText(lang, 'কোনো অর্ডার নেই', 'No Orders Found')}
              description={pickText(
                lang,
                'ক্রেতা পোর্টাল থেকে অর্ডার করলে এখানে স্বয়ংক্রিয়ভাবে তালিকাভুক্ত হবে।',
                'Orders placed by registered customers in the Customer Portal will appear here.'
              )}
            />
          ) : (
            filteredOrders.map((o) => {
              const st = ORDER_STATUS_LABELS[o.deliveryStatus];
              return (
                <div key={o.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono-num font-bold text-slate-900">{o.orderNumber}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${st.cls}`}>{st[lang]}</span>
                        <span className="text-xs font-medium text-slate-500">
                          {formatDateDisplay(o.createdAt, numeralMode)}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-900 mt-1">
                        {o.shopName} ({o.customerName}) • {o.phone}
                      </p>
                      <p className="text-xs text-slate-500">
                        {o.deliveryAddress}, {o.city}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold font-mono-num text-emerald-700">
                        {formatCurrency(o.totalAmount, numeralMode)}
                      </p>
                      <p className="text-xs text-slate-500 uppercase">
                        {o.paymentMethod} • {o.paymentStatus}
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-3 space-y-1 text-xs">
                    {o.items.map((it) => (
                      <div key={it.id} className="flex justify-between">
                        <span className="text-slate-700">
                          {it.productName} × {formatNum(it.quantity, numeralMode)} ({formatCurrency(it.unitPrice, numeralMode)})
                        </span>
                        <strong className="font-mono-num">{formatCurrency(it.lineTotal, numeralMode)}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <div className="flex flex-wrap gap-2">
                      {o.deliveryStatus === 'pending' && canConfirmOrder && (
                        <button
                          type="button"
                          onClick={() => handleUpdateOrder(o.id, 'confirmed', o.paymentStatus)}
                          className={primaryBtnCls + ' !min-h-[36px] !text-xs'}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{pickText(lang, 'কনফার্ম করুন (স্টক কর্তন)', 'Confirm & Deduct Stock')}</span>
                        </button>
                      )}
                      {canUpdateStatus && o.deliveryStatus !== 'cancelled' && o.deliveryStatus !== 'delivered' && o.deliveryStatus !== 'pending' && (
                        <>
                          {(['processing', 'ready', 'shipped', 'delivered'] as OrderDeliveryStatus[])
                            .filter((next) => ORDER_FLOW.indexOf(next) > ORDER_FLOW.indexOf(o.deliveryStatus))
                            .slice(0, 2)
                            .map((next) => (
                              <button
                                key={next}
                                type="button"
                                onClick={() =>
                                  handleUpdateOrder(o.id, next, next === 'delivered' ? 'paid' : o.paymentStatus)
                                }
                                className={secondaryBtnCls + ' !min-h-[36px] !text-xs'}
                              >
                                {pickText(lang, 'পরবর্তী ধাপ:', 'Mark')} {ORDER_STATUS_LABELS[next][lang]}
                              </button>
                            ))}
                        </>
                      )}
                      {canCancelOrder && o.deliveryStatus !== 'cancelled' && o.deliveryStatus !== 'delivered' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateOrder(o.id, 'cancelled')}
                          className={secondaryBtnCls + ' !min-h-[36px] !text-xs text-rose-700 border-rose-200 hover:bg-rose-50'}
                        >
                          {pickText(lang, 'অর্ডার বাতিল', 'Cancel Order')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'products' && (
        <>
          {products.length === 0 ? (
            <EmptyState
              title={pickText(lang, 'ক্যাটালগে কোনো পণ্য প্রকাশিত নেই', 'No Products Published')}
              description={pickText(
                lang,
                'প্রকাশিত পণ্যগুলো শুধুমাত্র নিবন্ধিত ক্রেতাদের পোর্টালে প্রদর্শিত হবে।',
                'Published products become visible to your registered wholesale & retail customers.'
              )}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((p) => (
                <div key={p.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
                  <div className="aspect-[4/3] bg-slate-100 relative">
                    <ProductImage src={p.imageUrl} alt={p.nameEn} />
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-slate-900 text-sm">
                          {lang === 'bn' ? p.nameBn : p.nameEn}
                        </h3>
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded shrink-0 ${
                            p.isPublished ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {p.isPublished ? pickText(lang, 'প্রকাশিত', 'Published') : pickText(lang, 'অপ্রকাশিত', 'Hidden')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                        {lang === 'bn' ? p.descriptionBn : p.descriptionEn}
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <div>
                        <p className="font-mono-num font-bold text-emerald-700 text-base">
                          {formatCurrency(p.price, numeralMode)} / {p.unitLabel}
                        </p>
                        <p className="text-xs text-slate-500 font-mono-num">
                          {pickText(lang, 'স্টক', 'Stock')}: {formatNum(p.stockQty, numeralMode)}
                        </p>
                      </div>
                      {canManageProducts && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleTogglePublish(p)}
                            className={secondaryBtnCls + ' !min-h-[34px] !px-2.5 !text-xs'}
                            title={p.isPublished ? 'Hide' : 'Publish'}
                          >
                            {p.isPublished ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(p.id)}
                            className="min-h-[34px] min-w-[34px] rounded-lg border border-slate-200 text-rose-600 hover:bg-rose-50 flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Publish Product Modal */}
      <Modal open={prodOpen} onClose={() => setProdOpen(false)} title={pickText(lang, 'ক্যাটালগে নতুন পণ্য প্রকাশ', 'Publish Product to Catalog')} maxWidth="max-w-xl" lang={lang}>
        <form onSubmit={handleCreateProduct} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{pickText(lang, 'স্টক উৎস', 'Inventory Link')}</label>
              <select value={linkedType} onChange={(e) => setLinkedType(e.target.value as 'batch' | 'standalone')} className={inputCls}>
                <option value="batch">{pickText(lang, 'প্রাণী ব্যাচের সাথে যুক্ত', 'Link to Active Batch')}</option>
                <option value="standalone">{pickText(lang, 'পৃথক পণ্য (ডিম / ফিড / মাংস)', 'Standalone Product')}</option>
              </select>
            </div>
            {linkedType === 'batch' ? (
              <div>
                <label className={labelCls}>{pickText(lang, 'ব্যাচ নির্বাচন', 'Select Batch')}</label>
                <select
                  value={linkedId || batches[0]?.id || ''}
                  onChange={(e) => {
                    const b = batches.find((x) => x.id === e.target.value);
                    setLinkedId(e.target.value);
                    if (b) {
                      setCategory(b.category);
                      setStockQty(String(b.remainingQuantity));
                    }
                  }}
                  className={inputCls}
                >
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.batchCode} ({b.remainingQuantity} living)
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className={labelCls}>{pickText(lang, 'ক্যাটাগরি', 'Category')}</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                  <option value="chicken">Chicken</option>
                  <option value="duck">Duck</option>
                  <option value="birds">Birds</option>
                  <option value="cattle">Cattle</option>
                  <option value="goats">Goats</option>
                  <option value="eggs">Eggs</option>
                  <option value="feed">Feed</option>
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{pickText(lang, 'পণ্যের নাম (বাংলা) *', 'Product Name (Bangla) *')}</label>
              <input required value={nameBn} onChange={(e) => setNameBn(e.target.value)} placeholder="ব্রয়লার মুরগি (জীবিত)" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'পণ্যের নাম (English)', 'Product Name (English)')}</label>
              <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Live Broiler Chicken" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'বিক্রয়মূল্য (৳) *', 'Selling Price (৳) *')}</label>
              <input type="number" min={0} step="0.01" required value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'বিক্রয়যোগ্য স্টক *', 'Available Stock *')}</label>
              <input type="number" min={1} required value={stockQty} onChange={(e) => setStockQty(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'একক (piece / kg / crate)', 'Unit Label')}</label>
              <input value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} className={inputCls} />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} className="w-4 h-4 accent-emerald-700" />
                <span>{pickText(lang, 'ক্রেতা পোর্টালে প্রকাশ করুন', 'Publish to Customer Portal')}</span>
              </label>
            </div>
          </div>

          <div>
            <label className={labelCls}>{pickText(lang, 'পণ্যের ছবি নির্বাচন করুন', 'Select Product Photo')}</label>
            <div className="grid grid-cols-4 gap-2">
              {CATALOG_PRESET_IMAGES.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setImageUrl(img.url)}
                  className={`rounded-lg border overflow-hidden cursor-pointer ${
                    imageUrl === img.url ? 'border-emerald-700 ring-2 ring-emerald-600/30' : 'border-slate-200'
                  }`}
                >
                  <img src={img.url} alt={img.labelEn} className="w-full aspect-[4/3] object-cover" />
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{pickText(lang, 'বিবরণ (বাংলা)', 'Description (BN)')}</label>
              <input value={descBn} onChange={(e) => setDescBn(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{pickText(lang, 'বিবরণ (English)', 'Description (EN)')}</label>
              <input value={descEn} onChange={(e) => setDescEn(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setProdOpen(false)} className={secondaryBtnCls}>
              {pickText(lang, 'বাতিল', 'Cancel')}
            </button>
            <button type="submit" className={primaryBtnCls}>
              {pickText(lang, 'পণ্য সংরক্ষণ করুন', 'Save Product')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
