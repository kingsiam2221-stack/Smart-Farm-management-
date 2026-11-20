import express from 'express';
import {
  ALL_OWNER_PERMISSIONS,
  DEFAULT_STAFF_PERMISSIONS,
  clearSessionCookie,
  hashPassword,
  loadUserById,
  parsePermissions,
  requireActiveSubscription,
  requireAuth,
  requirePermission,
  requireRoles,
  setSessionCookie,
  signPaymentChallenge,
  signSessionToken,
  verifyPassword,
  type AuthedRequest,
  type StaffPermissions,
} from './auth.ts';
import {
  allocateExpenseToBatches,
  computeBatchFinancialsList,
  getBatchCostPerAnimal,
  recomputeBatchQuantities,
  type AllocationMethod,
  type BatchAllocationInput,
} from './costEngine.ts';
import {
  claimIdempotencyKey,
  createNotification,
  generateId,
  generateTxId,
  getDb,
  withTransaction,
  writeAuditLog,
} from './db.ts';

export const apiRouter = express.Router();

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysISO(days: number, fromDate = new Date()): string {
  const d = new Date(fromDate.getTime());
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function sendErr(res: express.Response, err: unknown, status = 400): void {
  const msg = err instanceof Error ? err.message : String(err);
  res.status(status).json({ error: msg });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================================
// 1. AUTHENTICATION & MULTI-ROLE REGISTRATION
// ============================================================================
apiRouter.get('/auth/status', (req, res) => {
  const db = getDb();
  const saRow = db.prepare("SELECT COUNT(*) as c FROM saas_users WHERE role = 'super_admin'").get() as { c: number };
  const bizRows = db
    .prepare("SELECT id, name, city FROM businesses WHERE status = 'active' ORDER BY created_at DESC")
    .all() as Array<{ id: string; name: string; city: string }>;
  const settings = db.prepare("SELECT monthly_price, yearly_price, trial_days FROM platform_settings WHERE id = 'default'").get() as
    | { monthly_price: number; yearly_price: number; trial_days: number }
    | undefined;

  let user = null;
  try {
    // Soft read of session without failing if unauthenticated
    const header = req.headers.cookie || '';
    if (header.includes('saas_session=')) {
      const cookies: Record<string, string> = {};
      for (const part of header.split(';')) {
        const idx = part.indexOf('=');
        if (idx > -1) cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
      }
      const token = cookies.saas_session;
      if (token) {
        const [payload] = token.split('.');
        if (payload) {
          const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { uid?: string };
          if (decoded.uid) {
            user = loadUserById(decoded.uid);
          }
        }
      }
    }
  } catch {
    user = null;
  }

  res.json({
    hasSuperAdmin: saRow.c > 0,
    businesses: bizRows,
    plans: {
      monthlyPrice: settings?.monthly_price ?? 50,
      yearlyPrice: settings?.yearly_price ?? 1000,
      trialDays: settings?.trial_days ?? 14,
    },
    user,
  });
});

apiRouter.post('/auth/setup-super-admin', (req, res) => {
  try {
    const { name, email, phone, password, preferredLang } = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      password?: string;
      preferredLang?: 'bn' | 'en';
    };
    if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
      throw new Error('নাম, ইমেইল এবং কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড দিন / Name, email, and 6+ char password required.');
    }
    const cleanEmail = email.trim().toLowerCase();
    const lang = preferredLang === 'en' ? 'en' : 'bn';

    const userId = withTransaction((db) => {
      const exists = db.prepare("SELECT COUNT(*) as c FROM saas_users WHERE role = 'super_admin'").get() as { c: number };
      if (exists.c > 0) {
        throw new Error('সুপার অ্যাডমিন ইতিমধ্যেই তৈরি করা হয়েছে / Super Admin already exists.');
      }
      const id = generateId('usr');
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO saas_users (id, business_id, role, name, username, email, phone, password_hash, preferred_lang, assigned_role_title, permissions_json, active, shop_name, city, address, created_at)
         VALUES (?, NULL, 'super_admin', ?, ?, ?, ?, ?, ?, 'Platform Owner', ?, 1, '', '', '', ?)`
      ).run(id, name.trim(), cleanEmail, cleanEmail, phone?.trim() || '', hashPassword(password), lang, JSON.stringify(ALL_OWNER_PERMISSIONS), now);
      writeAuditLog(db, { id, name: name.trim(), role: 'super_admin', businessId: null }, 'CREATE', 'super_admin', id, `Super Admin initialized: ${cleanEmail}`, null);
      return id;
    });

    setSessionCookie(res, signSessionToken(userId));
    res.json({ user: loadUserById(userId) });
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.post('/auth/register-owner', (req, res) => {
  try {
    const { businessName, ownerName, phone, email, city, address, password, preferredLang } = req.body as {
      businessName?: string;
      ownerName?: string;
      phone?: string;
      email?: string;
      city?: string;
      address?: string;
      password?: string;
      preferredLang?: 'bn' | 'en';
    };
    if (!businessName?.trim() || !ownerName?.trim() || !email?.trim() || !password || password.length < 6) {
      throw new Error('ব্যবসার নাম, মালিকের নাম, ইমেইল এবং ৬+ অক্ষরের পাসওয়ার্ড আবশ্যক / Business name, owner name, email, and 6+ char password required.');
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone?.trim() || '';
    const lang = preferredLang === 'en' ? 'en' : 'bn';

    const userId = withTransaction((db) => {
      const dup = db.prepare('SELECT id FROM saas_users WHERE LOWER(email) = ?').get(cleanEmail);
      if (dup) throw new Error('এই ইমেইল দিয়ে ইতিমধ্যেই অ্যাকাউন্ট আছে / Email already registered.');

      const settings = db.prepare("SELECT trial_days FROM platform_settings WHERE id = 'default'").get() as { trial_days: number } | undefined;
      const trialDays = settings?.trial_days ?? 14;
      const now = new Date().toISOString();
      const trialEnds = addDaysISO(trialDays);
      const bizId = generateId('biz');
      const usrId = generateId('usr');

      db.prepare(
        `INSERT INTO businesses (id, name, owner_name, phone, email, city, address, status, subscription_plan, subscription_status, trial_ends_at, subscription_ends_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'trial', 'trial', ?, ?, ?)`
      ).run(bizId, businessName.trim(), ownerName.trim(), cleanPhone, cleanEmail, city?.trim() || '', address?.trim() || '', trialEnds, trialEnds, now);

      db.prepare(
        `INSERT INTO saas_users (id, business_id, role, name, username, email, phone, password_hash, preferred_lang, assigned_role_title, permissions_json, active, shop_name, city, address, created_at)
         VALUES (?, ?, 'business_owner', ?, ?, ?, ?, ?, ?, 'Business Owner', ?, 1, ?, ?, ?, ?)`
      ).run(
        usrId,
        bizId,
        ownerName.trim(),
        cleanEmail,
        cleanEmail,
        cleanPhone,
        hashPassword(password),
        lang,
        JSON.stringify(ALL_OWNER_PERMISSIONS),
        businessName.trim(),
        city?.trim() || '',
        address?.trim() || '',
        now
      );

      createNotification(db, {
        businessId: bizId,
        category: 'subscription',
        severity: 'info',
        titleBn: `${trialDays} দিনের ফ্রি ট্রায়াল শুরু হয়েছে`,
        titleEn: `${trialDays}-day Free Trial Started`,
        bodyBn: `স্বাগতম ${ownerName.trim()}! আপনার ব্যবসা "${businessName.trim()}" সফলভাবে নিবন্ধিত হয়েছে।`,
        bodyEn: `Welcome ${ownerName.trim()}! Your business "${businessName.trim()}" is registered with a ${trialDays}-day trial.`,
      });

      writeAuditLog(db, { id: usrId, name: ownerName.trim(), role: 'business_owner', businessId: bizId }, 'REGISTER', 'business', bizId, `New business registered: ${businessName.trim()}`, bizId);
      return usrId;
    });

    setSessionCookie(res, signSessionToken(userId));
    res.json({ user: loadUserById(userId) });
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.post('/auth/register-customer', (req, res) => {
  try {
    const { businessId, shopName, ownerName, phone, password, address, city, email, preferredLang } = req.body as {
      businessId?: string;
      shopName?: string;
      ownerName?: string;
      phone?: string;
      password?: string;
      address?: string;
      city?: string;
      email?: string;
      preferredLang?: 'bn' | 'en';
    };

    if (!businessId || !shopName?.trim() || !ownerName?.trim() || !phone?.trim() || !address?.trim() || !city?.trim() || !password || password.length < 6) {
      throw new Error('দোকানের নাম, মালিকের নাম, মোবাইল, ঠিকানা, শহর, ব্যবসা এবং ৬+ অক্ষরের পাসওয়ার্ড আবশ্যক / All required customer registration fields must be filled.');
    }

    const cleanPhone = phone.trim();
    const cleanEmail = email?.trim().toLowerCase() || '';
    const lang = preferredLang === 'en' ? 'en' : 'bn';

    const userId = withTransaction((db) => {
      const biz = db.prepare("SELECT id, name, status FROM businesses WHERE id = ? AND status = 'active'").get(businessId) as
        | { id: string; name: string; status: string }
        | undefined;
      if (!biz) throw new Error('নির্বাচিত ব্যবসা খুঁজে পাওয়া যায়নি / Selected business not found.');

      const dupPhone = db.prepare('SELECT id FROM saas_users WHERE phone = ? AND business_id = ?').get(cleanPhone, businessId);
      if (dupPhone) throw new Error('এই মোবাইল নম্বর দিয়ে ইতিমধ্যেই অ্যাকাউন্ট রয়েছে / Mobile number already registered.');

      if (cleanEmail) {
        const dupEmail = db.prepare('SELECT id FROM saas_users WHERE LOWER(email) = ?').get(cleanEmail);
        if (dupEmail) throw new Error('এই ইমেইল ইতিমধ্যেই ব্যবহৃত হয়েছে / Email already in use.');
      }

      const usrId = generateId('cus');
      const prtId = generateId('prt');
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO saas_users (id, business_id, role, name, username, email, phone, password_hash, preferred_lang, assigned_role_title, permissions_json, active, shop_name, city, address, created_at)
         VALUES (?, ?, 'customer', ?, ?, ?, ?, ?, ?, 'Customer', '{}', 1, ?, ?, ?, ?)`
      ).run(usrId, businessId, ownerName.trim(), cleanPhone, cleanEmail, cleanPhone, hashPassword(password), lang, shopName.trim(), city.trim(), address.trim(), now);

      db.prepare(
        `INSERT INTO saas_parties (id, business_id, type, user_id, shop_name, name, phone, email, city, address, notes, created_at)
         VALUES (?, ?, 'customer', ?, ?, ?, ?, ?, ?, ?, 'Registered via Customer Portal', ?)`
      ).run(prtId, businessId, usrId, shopName.trim(), ownerName.trim(), cleanPhone, cleanEmail, city.trim(), address.trim(), now);

      createNotification(db, {
        businessId,
        category: 'customer_registration',
        severity: 'info',
        titleBn: `নতুন ক্রেতা নিবন্ধন: ${shopName.trim()}`,
        titleEn: `New Customer Registered: ${shopName.trim()}`,
        bodyBn: `${ownerName.trim()} (${cleanPhone}, ${city.trim()}) আপনার ক্রেতা পোর্টালে নিবন্ধন করেছেন।`,
        bodyEn: `${ownerName.trim()} (${cleanPhone}, ${city.trim()}) registered on your Customer Portal.`,
      });

      writeAuditLog(db, { id: usrId, name: ownerName.trim(), role: 'customer', businessId }, 'REGISTER', 'customer', usrId, `Customer registered: ${shopName.trim()} (${cleanPhone})`, businessId);
      return usrId;
    });

    setSessionCookie(res, signSessionToken(userId));
    res.json({ user: loadUserById(userId) });
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.post('/auth/login', (req, res) => {
  try {
    const { identifier, password } = req.body as { identifier?: string; password?: string };
    const clean = identifier?.trim().toLowerCase();
    if (!clean || !password) {
      throw new Error('ইমেইল / মোবাইল / ইউজারনেম এবং পাসওয়ার্ড দিন / Credentials required.');
    }

    const db = getDb();
    const row = db
      .prepare('SELECT id, password_hash, active, business_id, role, name FROM saas_users WHERE LOWER(email) = ? OR LOWER(username) = ? OR phone = ? LIMIT 1')
      .get(clean, clean, identifier!.trim()) as Record<string, unknown> | undefined;

    if (!row || !verifyPassword(password, String(row.password_hash))) {
      res.status(401).json({ error: 'লগইন তথ্য সঠিক নয় / Invalid credentials.' });
      return;
    }
    if (!row.active) {
      res.status(403).json({ error: 'আপনার অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে / Account is inactive.' });
      return;
    }

    const user = loadUserById(String(row.id));
    if (!user) {
      res.status(401).json({ error: 'User load error.' });
      return;
    }
    if (user.businessStatus === 'suspended' && user.role !== 'super_admin') {
      res.status(403).json({ error: 'আপনার ব্যবসার অ্যাকাউন্ট স্থগিত রয়েছে / Business suspended.' });
      return;
    }

    if (user.role === 'staff' && user.businessId) {
      writeAuditLog(db, user, 'LOGIN', 'session', user.id, `Staff logged in: ${user.name} (${user.username})`);
    }

    setSessionCookie(res, signSessionToken(user.id));
    res.json({ user });
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.post('/auth/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// Protected routes below
apiRouter.use(requireAuth);

apiRouter.patch('/auth/preferences', (req: AuthedRequest, res) => {
  try {
    const { preferredLang, name, phone, shopName, city, address } = req.body as {
      preferredLang?: 'bn' | 'en';
      name?: string;
      phone?: string;
      shopName?: string;
      city?: string;
      address?: string;
    };
    const db = getDb();
    const u = req.user!;
    const nextLang = preferredLang === 'en' ? 'en' : preferredLang === 'bn' ? 'bn' : u.preferredLang;
    db.prepare('UPDATE saas_users SET preferred_lang = ?, name = ?, phone = ?, shop_name = ?, city = ?, address = ? WHERE id = ?').run(
      nextLang,
      name?.trim() || u.name,
      phone !== undefined ? phone.trim() : u.phone,
      shopName !== undefined ? shopName.trim() : u.shopName,
      city !== undefined ? city.trim() : u.city,
      address !== undefined ? address.trim() : u.address,
      u.id
    );
    res.json({ user: loadUserById(u.id) });
  } catch (err) {
    sendErr(res, err);
  }
});

// ============================================================================
// 2. DASHBOARD & REPORTS (TENANT-SCOPED)
// ============================================================================
apiRouter.get('/dashboard', requirePermission('finance.view'), (req: AuthedRequest, res) => {
  try {
    const db = getDb();
    const bizId = req.user!.businessId!;
    const batches = computeBatchFinancialsList(db, bizId);

    const today = todayISO();
    const monthPrefix = today.slice(0, 7);
    const yearPrefix = today.slice(0, 4);

    let totalAnimalPurchases = 0;
    let totalAdditionalExpenses = 0;
    let totalInvestment = 0;
    let totalSalesRevenue = 0;
    let mortalityLoss = 0;
    let availableStockValue = 0;
    let estimatedProfitOnUnsold = 0;
    let totalAnimalsRemaining = 0;
    let activeBatches = 0;

    const catMap = new Map<string, { category: string; remainingQty: number; investment: number; revenue: number; profit: number }>();

    for (const b of batches) {
      if (b.status === 'active') activeBatches += 1;
      totalAnimalsRemaining += b.remainingQuantity;
      totalAnimalPurchases = round2(totalAnimalPurchases + b.totalPurchaseCost);
      totalAdditionalExpenses = round2(totalAdditionalExpenses + b.totalAdditionalExpenses);
      totalInvestment = round2(totalInvestment + b.totalInvestment);
      totalSalesRevenue = round2(totalSalesRevenue + b.totalSalesRevenue);
      mortalityLoss = round2(mortalityLoss + b.deathFinancialLoss);
      availableStockValue = round2(availableStockValue + b.remainingInventoryValue);
      estimatedProfitOnUnsold = round2(estimatedProfitOnUnsold + b.estimatedProfitOnUnsold);

      const cur = catMap.get(b.category) || { category: b.category, remainingQty: 0, investment: 0, revenue: 0, profit: 0 };
      cur.remainingQty += b.remainingQuantity;
      cur.investment = round2(cur.investment + b.totalInvestment);
      cur.revenue = round2(cur.revenue + b.totalSalesRevenue);
      cur.profit = round2(cur.profit + b.realizedProfit);
      catMap.set(b.category, cur);
    }

    const feedValRow = db
      .prepare('SELECT COALESCE(SUM(remaining_qty * avg_unit_cost), 0) as v FROM feeds WHERE business_id = ?')
      .get(bizId) as { v: number };
    const medValRow = db
      .prepare('SELECT COALESCE(SUM(remaining_qty * avg_unit_cost), 0) as v FROM medicines WHERE business_id = ?')
      .get(bizId) as { v: number };

    const unusedFeedValue = round2(Number(feedValRow.v));
    const unusedMedicineValue = round2(Number(medValRow.v));

    const salesStats = db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN date = ? THEN total_revenue ELSE 0 END), 0) as daily_rev,
          COALESCE(SUM(CASE WHEN substr(date, 1, 7) = ? THEN total_revenue ELSE 0 END), 0) as monthly_rev,
          COALESCE(SUM(CASE WHEN substr(date, 1, 4) = ? THEN total_revenue ELSE 0 END), 0) as yearly_rev,
          COALESCE(SUM(due_amount), 0) as customer_due,
          COALESCE(SUM(cogs_amount), 0) as total_cogs
         FROM batch_sales WHERE business_id = ?`
      )
      .get(today, monthPrefix, yearPrefix, bizId) as Record<string, number>;

    const deliveredOrdersRev = db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN substr(created_at, 1, 10) = ? THEN total_amount ELSE 0 END), 0) as daily_rev,
          COALESCE(SUM(CASE WHEN substr(created_at, 1, 7) = ? THEN total_amount ELSE 0 END), 0) as monthly_rev,
          COALESCE(SUM(CASE WHEN substr(created_at, 1, 4) = ? THEN total_amount ELSE 0 END), 0) as yearly_rev
         FROM orders WHERE business_id = ? AND delivery_status = 'delivered' AND id NOT IN (SELECT COALESCE(order_id, '') FROM batch_sales WHERE business_id = ?)`
      )
      .get(today, monthPrefix, yearPrefix, bizId, bizId) as Record<string, number>;

    const fpDueRow = db
      .prepare('SELECT COALESCE(SUM(due_amount), 0) as due FROM feed_purchases WHERE business_id = ?')
      .get(bizId) as { due: number };
    const mpDueRow = db
      .prepare('SELECT COALESCE(SUM(due_amount), 0) as due FROM medicine_purchases WHERE business_id = ?')
      .get(bizId) as { due: number };
    const pendingOrdersRow = db
      .prepare("SELECT COUNT(*) as c FROM orders WHERE business_id = ? AND delivery_status IN ('pending', 'confirmed', 'processing', 'ready', 'shipped')")
      .get(bizId) as { c: number };

    const grossProfit = round2(totalSalesRevenue - Number(salesStats.total_cogs || 0));
    const netProfit = round2(grossProfit - mortalityLoss);

    // 6-month trend
    const trendRows = db
      .prepare(
        `SELECT substr(date, 1, 7) as m,
                COALESCE(SUM(total_revenue), 0) as rev,
                COALESCE(SUM(realized_profit), 0) as prof
         FROM batch_sales WHERE business_id = ? GROUP BY substr(date, 1, 7) ORDER BY m DESC LIMIT 6`
      )
      .all(bizId) as Array<{ m: string; rev: number; prof: number }>;
    const expTrendRows = db
      .prepare(
        `SELECT substr(date, 1, 7) as m, COALESCE(SUM(total_amount), 0) as exp
         FROM saas_expenses WHERE business_id = ? GROUP BY substr(date, 1, 7)`
      )
      .all(bizId) as Array<{ m: string; exp: number }>;
    const expTrendMap = new Map(expTrendRows.map((e) => [e.m, round2(Number(e.exp))]));

    const monthlyTrend = trendRows
      .slice()
      .reverse()
      .map((r) => ({
        month: r.m,
        revenue: round2(Number(r.rev)),
        expenses: expTrendMap.get(r.m) || 0,
        profit: round2(Number(r.prof)),
      }));

    res.json({
      kpis: {
        totalBatches: batches.length,
        activeBatches,
        totalAnimalsRemaining,
        totalAnimalPurchases,
        totalAdditionalExpenses,
        totalInvestment,
        totalSalesRevenue,
        grossProfit,
        netProfit,
        mortalityLoss,
        availableStockValue: round2(availableStockValue + unusedFeedValue + unusedMedicineValue),
        unusedFeedValue,
        unusedMedicineValue,
        estimatedProfitOnUnsold,
        customerReceivables: round2(Number(salesStats.customer_due || 0)),
        supplierPayables: round2(Number(fpDueRow.due || 0) + Number(mpDueRow.due || 0)),
        dailyRevenue: round2(Number(salesStats.daily_rev || 0) + Number(deliveredOrdersRev.daily_rev || 0)),
        monthlyRevenue: round2(Number(salesStats.monthly_rev || 0) + Number(deliveredOrdersRev.monthly_rev || 0)),
        yearlyRevenue: round2(Number(salesStats.yearly_rev || 0) + Number(deliveredOrdersRev.yearly_rev || 0)),
        pendingOrdersCount: Number(pendingOrdersRow.c || 0),
      },
      categoryBreakdown: Array.from(catMap.values()),
      monthlyTrend,
    });
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.get('/reports', requirePermission('finance.view'), (req: AuthedRequest, res) => {
  try {
    const db = getDb();
    const bizId = req.user!.businessId!;
    const from = req.query.from ? String(req.query.from) : '2000-01-01';
    const to = req.query.to ? String(req.query.to) : '2099-12-31';
    const category = req.query.category ? String(req.query.category) : '';
    const batchId = req.query.batchId ? String(req.query.batchId) : '';
    const customerId = req.query.customerId ? String(req.query.customerId) : '';
    const supplierName = req.query.supplierName ? String(req.query.supplierName) : '';
    const staffName = req.query.staffName ? String(req.query.staffName) : '';

    let batches = computeBatchFinancialsList(db, bizId, batchId || undefined);
    if (category) batches = batches.filter((b) => b.category === category);
    if (supplierName) batches = batches.filter((b) => b.supplierName.toLowerCase().includes(supplierName.toLowerCase()));

    const batchIdSet = new Set(batches.map((b) => b.id));

    let sales = db
      .prepare(
        `SELECT bs.*, b.batch_code, b.category FROM batch_sales bs
         JOIN batches b ON b.id = bs.batch_id
         WHERE bs.business_id = ? AND bs.date >= ? AND bs.date <= ?
         ORDER BY bs.date DESC, bs.created_at DESC`
      )
      .all(bizId, from, to) as Record<string, unknown>[];

    if (category || batchId) sales = sales.filter((s) => batchIdSet.has(String(s.batch_id)));
    if (customerId) sales = sales.filter((s) => String(s.customer_id || '') === customerId);
    if (staffName) sales = sales.filter((s) => String(s.created_by).toLowerCase().includes(staffName.toLowerCase()));

    let expenses = db
      .prepare('SELECT * FROM saas_expenses WHERE business_id = ? AND date >= ? AND date <= ? ORDER BY date DESC, created_at DESC')
      .all(bizId, from, to) as Record<string, unknown>[];
    if (staffName) expenses = expenses.filter((e) => String(e.created_by).toLowerCase().includes(staffName.toLowerCase()));

    let deaths = db
      .prepare(
        `SELECT bd.*, b.batch_code, b.category FROM batch_deaths bd
         JOIN batches b ON b.id = bd.batch_id
         WHERE bd.business_id = ? AND bd.date >= ? AND bd.date <= ?
         ORDER BY bd.date DESC`
      )
      .all(bizId, from, to) as Record<string, unknown>[];
    if (category || batchId) deaths = deaths.filter((d) => batchIdSet.has(String(d.batch_id)));

    res.json({
      batches,
      sales: sales.map((s) => ({
        id: s.id,
        txId: s.tx_id,
        date: s.date,
        batchCode: s.batch_code,
        category: s.category,
        customerName: s.customer_name,
        quantity: Number(s.quantity),
        unitPrice: Number(s.unit_selling_price),
        totalRevenue: Number(s.total_revenue),
        realizedProfit: Number(s.realized_profit),
        createdBy: s.created_by,
      })),
      expenses: expenses.map((e) => ({
        id: e.id,
        txId: e.tx_id,
        date: e.date,
        category: e.category,
        title: e.title,
        totalAmount: Number(e.total_amount),
        allocationMethod: e.allocation_method,
        createdBy: e.created_by,
      })),
      deaths: deaths.map((d) => ({
        id: d.id,
        txId: d.tx_id,
        date: d.date,
        batchCode: d.batch_code,
        category: d.category,
        quantity: Number(d.quantity),
        cause: d.cause,
        financialLoss: Number(d.financial_loss),
      })),
    });
  } catch (err) {
    sendErr(res, err);
  }
});

// ============================================================================
// 3. ANIMAL BATCHES, DEATHS, AND PARTIAL/FULL BATCH SALES
// ============================================================================
apiRouter.get('/batches', requirePermission('animals.view'), (req: AuthedRequest, res) => {
  try {
    const db = getDb();
    res.json(computeBatchFinancialsList(db, req.user!.businessId!));
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.post('/batches', requireActiveSubscription, requirePermission('animals.add'), (req: AuthedRequest, res) => {
  try {
    const {
      batchCode,
      category,
      breed,
      initialQuantity,
      purchaseDate,
      purchasePricePerUnit,
      supplierId,
      supplierName,
      initialWeightKg,
      notes,
      idempotencyKey,
    } = req.body as Record<string, unknown>;

    const qty = Math.floor(Number(initialQuantity) || 0);
    const price = Math.max(0, Number(purchasePricePerUnit) || 0);
    const weight = Math.max(0.01, Number(initialWeightKg) || 1);
    if (!category || qty <= 0) {
      throw new Error('প্রাণীর ধরন এবং সঠিক সংখ্যা (> ০) দিন / Animal category and positive quantity required.');
    }

    const created = withTransaction((db) => {
      claimIdempotencyKey(db, idempotencyKey ? String(idempotencyKey) : undefined, 'create_batch');
      const bizId = req.user!.businessId!;
      const id = generateId('bth');
      const code = String(batchCode || '').trim() || generateTxId('BATCH');
      const totalPurchaseCost = round2(qty * price);
      const now = new Date().toISOString();
      const dStr = String(purchaseDate || todayISO());

      let supId = supplierId ? String(supplierId) : null;
      let supName = String(supplierName || '').trim() || 'Direct Supplier';
      if (supId) {
        const supRow = db.prepare('SELECT name FROM saas_parties WHERE id = ? AND business_id = ?').get(supId, bizId) as { name: string } | undefined;
        if (supRow) supName = supRow.name;
      } else if (supName && supName !== 'Direct Supplier') {
        const ex = db
          .prepare("SELECT id FROM saas_parties WHERE business_id = ? AND type = 'supplier' AND LOWER(name) = ?")
          .get(bizId, supName.toLowerCase()) as { id: string } | undefined;
        if (ex) {
          supId = ex.id;
        } else {
          supId = generateId('prt');
          db.prepare(
            `INSERT INTO saas_parties (id, business_id, type, shop_name, name, phone, email, city, address, notes, created_at)
             VALUES (?, ?, 'supplier', ?, ?, '', '', '', '', 'Auto-added from batch purchase', ?)`
          ).run(supId, bizId, supName, supName, now);
        }
      }

      db.prepare(
        `INSERT INTO batches (id, business_id, batch_code, category, breed, initial_quantity, purchase_date, purchase_price_per_unit, total_purchase_cost, supplier_id, supplier_name, initial_weight_kg, deaths_quantity, sold_quantity, remaining_quantity, status, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'active', ?, ?, ?)`
      ).run(
        id,
        bizId,
        code,
        String(category),
        String(breed || '').trim(),
        qty,
        dStr,
        price,
        totalPurchaseCost,
        supId,
        supName,
        weight,
        qty,
        String(notes || '').trim(),
        req.user!.name,
        now
      );

      writeAuditLog(db, req.user!, 'CREATE', 'batch', id, `Batch created: ${code} (${qty} ${category} @ ৳${price})`);
      return { id, batchCode: code };
    });

    res.json(created);
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.put('/batches/:id', requireActiveSubscription, requirePermission('animals.edit'), (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const { breed, initialQuantity, purchasePricePerUnit, initialWeightKg, supplierName, status, notes } = req.body as Record<string, unknown>;
    withTransaction((db) => {
      const bizId = req.user!.businessId!;
      const old = db.prepare('SELECT * FROM batches WHERE id = ? AND business_id = ?').get(id, bizId) as Record<string, unknown> | undefined;
      if (!old) throw new Error('ব্যাচ পাওয়া যায়নি / Batch not found.');
      const nextQty = initialQuantity !== undefined ? Math.floor(Number(initialQuantity)) : Number(old.initial_quantity);
      const nextPrice = purchasePricePerUnit !== undefined ? Math.max(0, Number(purchasePricePerUnit)) : Number(old.purchase_price_per_unit);
      const nextWeight = initialWeightKg !== undefined ? Math.max(0.01, Number(initialWeightKg)) : Number(old.initial_weight_kg);
      const totalCost = round2(nextQty * nextPrice);

      db.prepare(
        `UPDATE batches SET breed = ?, initial_quantity = ?, purchase_price_per_unit = ?, total_purchase_cost = ?, initial_weight_kg = ?, supplier_name = ?, status = ?, notes = ? WHERE id = ? AND business_id = ?`
      ).run(
        breed !== undefined ? String(breed).trim() : String(old.breed),
        nextQty,
        nextPrice,
        totalCost,
        nextWeight,
        supplierName !== undefined ? String(supplierName).trim() : String(old.supplier_name),
        status !== undefined ? String(status) : String(old.status),
        notes !== undefined ? String(notes).trim() : String(old.notes),
        id,
        bizId
      );
      recomputeBatchQuantities(db, id);
      writeAuditLog(db, req.user!, 'UPDATE', 'batch', id, `Batch updated: ${old.batch_code}`);
    });
    res.json({ ok: true });
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.delete('/batches/:id', requireActiveSubscription, requirePermission('animals.delete'), (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    withTransaction((db) => {
      const bizId = req.user!.businessId!;
      const old = db.prepare('SELECT batch_code FROM batches WHERE id = ? AND business_id = ?').get(id, bizId) as { batch_code: string } | undefined;
      if (!old) throw new Error('ব্যাচ পাওয়া যায়নি / Batch not found.');
      db.prepare('DELETE FROM batches WHERE id = ? AND business_id = ?').run(id, bizId);
      writeAuditLog(db, req.user!, 'DELETE', 'batch', id, `Batch deleted: ${old.batch_code}`);
    });
    res.json({ ok: true });
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.get('/batch-deaths', requirePermission('animals.view'), (req: AuthedRequest, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT bd.*, b.batch_code, b.category
       FROM batch_deaths bd JOIN batches b ON b.id = bd.batch_id
       WHERE bd.business_id = ? ORDER BY bd.date DESC, bd.created_at DESC`
    )
    .all(req.user!.businessId!) as Record<string, unknown>[];
  res.json(
    rows.map((r) => ({
      id: r.id,
      txId: r.tx_id,
      batchId: r.batch_id,
      batchCode: r.batch_code,
      category: r.category,
      date: r.date,
      quantity: Number(r.quantity),
      cause: r.cause,
      unitCostAtDeath: Number(r.unit_cost_at_death),
      financialLoss: Number(r.financial_loss),
      notes: r.notes,
      createdBy: r.created_by,
      createdAt: r.created_at,
    }))
  );
});

apiRouter.post('/batch-deaths', requireActiveSubscription, requirePermission('animals.edit'), (req: AuthedRequest, res) => {
  try {
    const { batchId, quantity, date, cause, notes, idempotencyKey } = req.body as {
      batchId?: string;
      quantity?: number;
      date?: string;
      cause?: string;
      notes?: string;
      idempotencyKey?: string;
    };
    const qty = Math.floor(Number(quantity) || 0);
    if (!batchId || qty <= 0) throw new Error('ব্যাচ এবং সঠিক মৃত্যুর সংখ্যা দিন / Batch and valid death quantity required.');

    const created = withTransaction((db) => {
      claimIdempotencyKey(db, idempotencyKey, 'create_batch_death');
      const bizId = req.user!.businessId!;
      const batch = db.prepare('SELECT * FROM batches WHERE id = ? AND business_id = ?').get(batchId, bizId) as Record<string, unknown> | undefined;
      if (!batch) throw new Error('ব্যাচ পাওয়া যায়নি / Batch not found.');
      if (Number(batch.remaining_quantity) < qty) {
        throw new Error(`ব্যাচের অবশিষ্ট সংখ্যার (${batch.remaining_quantity}) চেয়ে বেশি মৃত্যু রেকর্ড করা যাবে না / Death quantity exceeds remaining stock.`);
      }

      const unitCost = getBatchCostPerAnimal(db, bizId, batchId);
      const financialLoss = round2(unitCost * qty);
      const id = generateId('dth');
      const txId = generateTxId('DTH');
      const dStr = date || todayISO();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO batch_deaths (id, business_id, tx_id, batch_id, date, quantity, cause, unit_cost_at_death, financial_loss, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, bizId, txId, batchId, dStr, qty, cause?.trim() || 'Disease / Unknown', unitCost, financialLoss, notes?.trim() || '', req.user!.name, now);

      const { remaining } = recomputeBatchQuantities(db, batchId);

      createNotification(db, {
        businessId: bizId,
        category: 'mortality',
        severity: qty >= 10 || remaining <= 20 ? 'critical' : 'warning',
        titleBn: `মৃত্যু রেকর্ড (${batch.batch_code}): ${qty}টি`,
        titleEn: `Mortality Recorded (${batch.batch_code}): ${qty}`,
        bodyBn: `আর্থিক ক্ষতি: ৳${financialLoss} (প্রতিটি ৳${unitCost})। অবশিষ্ট: ${remaining}টি।`,
        bodyEn: `Financial loss: ৳${financialLoss} (৳${unitCost}/animal). Remaining: ${remaining}.`,
      });

      writeAuditLog(db, req.user!, 'CREATE', 'batch_death', id, `Death in ${batch.batch_code}: -${qty} (Loss ৳${financialLoss})`);
      return { id, txId, financialLoss };
    });
    res.json(created);
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.delete('/batch-deaths/:id', requireActiveSubscription, requirePermission('animals.delete'), (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    withTransaction((db) => {
      const bizId = req.user!.businessId!;
      const old = db.prepare('SELECT * FROM batch_deaths WHERE id = ? AND business_id = ?').get(id, bizId) as Record<string, unknown> | undefined;
      if (!old) throw new Error('রেকর্ড পাওয়া যায়নি / Record not found.');
      db.prepare('DELETE FROM batch_deaths WHERE id = ?').run(id);
      recomputeBatchQuantities(db, String(old.batch_id));
      writeAuditLog(db, req.user!, 'DELETE', 'batch_death', id, `Death record reversed: ${old.tx_id}`);
    });
    res.json({ ok: true });
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.get('/batch-sales', requirePermission('finance.view_sales'), (req: AuthedRequest, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT bs.*, b.batch_code, b.category
       FROM batch_sales bs JOIN batches b ON b.id = bs.batch_id
       WHERE bs.business_id = ? ORDER BY bs.date DESC, bs.created_at DESC`
    )
    .all(req.user!.businessId!) as Record<string, unknown>[];
  res.json(
    rows.map((r) => ({
      id: r.id,
      txId: r.tx_id,
      batchId: r.batch_id,
      batchCode: r.batch_code,
      category: r.category,
      orderId: r.order_id,
      date: r.date,
      customerId: r.customer_id,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      quantity: Number(r.quantity),
      unitSellingPrice: Number(r.unit_selling_price),
      totalRevenue: Number(r.total_revenue),
      paidAmount: Number(r.paid_amount),
      dueAmount: Number(r.due_amount),
      paymentStatus: r.payment_status,
      costPerAnimalSnapshot: Number(r.cost_per_animal_snapshot),
      cogsAmount: Number(r.cogs_amount),
      realizedProfit: Number(r.realized_profit),
      notes: r.notes,
      createdBy: r.created_by,
      createdAt: r.created_at,
    }))
  );
});

apiRouter.post('/batch-sales', requireActiveSubscription, requirePermission('animals.edit'), (req: AuthedRequest, res) => {
  try {
    const {
      batchId,
      quantity,
      unitSellingPrice,
      paidAmount,
      paymentStatus,
      customerId,
      customerName,
      customerPhone,
      date,
      notes,
      idempotencyKey,
    } = req.body as Record<string, unknown>;

    const qty = Math.floor(Number(quantity) || 0);
    const price = Math.max(0, Number(unitSellingPrice) || 0);
    if (!batchId || qty <= 0) throw new Error('ব্যাচ এবং সঠিক বিক্রয় সংখ্যা দিন / Batch and positive quantity required.');

    const created = withTransaction((db) => {
      claimIdempotencyKey(db, idempotencyKey ? String(idempotencyKey) : undefined, 'create_batch_sale');
      const bizId = req.user!.businessId!;
      const batch = db.prepare('SELECT * FROM batches WHERE id = ? AND business_id = ?').get(String(batchId), bizId) as Record<string, unknown> | undefined;
      if (!batch) throw new Error('ব্যাচ পাওয়া যায়নি / Batch not found.');
      if (Number(batch.remaining_quantity) < qty) {
        throw new Error(`ব্যাচে পর্যাপ্ত প্রাণী নেই (অবশিষ্ট: ${batch.remaining_quantity}) / Insufficient batch stock.`);
      }

      const costPerAnimal = getBatchCostPerAnimal(db, bizId, String(batchId));
      const totalRev = round2(qty * price);
      const cogs = round2(qty * costPerAnimal);
      const profit = round2(totalRev - cogs);

      let paid = paidAmount !== undefined ? Math.max(0, Number(paidAmount)) : paymentStatus === 'due' ? 0 : totalRev;
      if (paid > totalRev) paid = totalRev;
      const due = round2(totalRev - paid);
      const pStatus = due <= 0 ? 'paid' : paid === 0 ? 'due' : 'partial';

      let custId = customerId ? String(customerId) : null;
      let custName = String(customerName || '').trim() || 'Cash Customer';
      let custPhone = String(customerPhone || '').trim();
      const now = new Date().toISOString();

      if (custId) {
        const p = db.prepare('SELECT name, phone FROM saas_parties WHERE id = ? AND business_id = ?').get(custId, bizId) as { name: string; phone: string } | undefined;
        if (p) {
          custName = p.name;
          custPhone = p.phone;
        }
      } else if (custName && custName !== 'Cash Customer') {
        const ex = db
          .prepare("SELECT id FROM saas_parties WHERE business_id = ? AND type = 'customer' AND LOWER(name) = ?")
          .get(bizId, custName.toLowerCase()) as { id: string } | undefined;
        if (ex) {
          custId = ex.id;
        } else {
          custId = generateId('prt');
          db.prepare(
            `INSERT INTO saas_parties (id, business_id, type, shop_name, name, phone, email, city, address, notes, created_at)
             VALUES (?, ?, 'customer', ?, ?, ?, '', '', '', 'Auto-added from batch sale', ?)`
          ).run(custId, bizId, custName, custName, custPhone, now);
        }
      }

      const id = generateId('bsl');
      const txId = generateTxId('SAL');
      const dStr = String(date || todayISO());

      db.prepare(
        `INSERT INTO batch_sales (id, business_id, tx_id, batch_id, order_id, date, customer_id, customer_name, customer_phone, quantity, unit_selling_price, total_revenue, paid_amount, due_amount, payment_status, cost_per_animal_snapshot, cogs_amount, realized_profit, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        bizId,
        txId,
        String(batchId),
        dStr,
        custId,
        custName,
        custPhone,
        qty,
        price,
        totalRev,
        paid,
        due,
        pStatus,
        costPerAnimal,
        cogs,
        profit,
        String(notes || '').trim(),
        req.user!.name,
        now
      );

      recomputeBatchQuantities(db, String(batchId));
      writeAuditLog(db, req.user!, 'CREATE', 'batch_sale', id, `Batch sale (${batch.batch_code}): ${qty} @ ৳${price} = ৳${totalRev} (Profit ৳${profit})`);
      return { id, txId, totalRevenue: totalRev, realizedProfit: profit };
    });

    res.json(created);
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.delete('/batch-sales/:id', requireActiveSubscription, requirePermission('animals.delete'), (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    withTransaction((db) => {
      const bizId = req.user!.businessId!;
      const old = db.prepare('SELECT * FROM batch_sales WHERE id = ? AND business_id = ?').get(id, bizId) as Record<string, unknown> | undefined;
      if (!old) throw new Error('বিক্রয় রেকর্ড পাওয়া যায়নি / Sale not found.');
      db.prepare('DELETE FROM batch_sales WHERE id = ?').run(id);
      recomputeBatchQuantities(db, String(old.batch_id));
      writeAuditLog(db, req.user!, 'DELETE', 'batch_sale', id, `Batch sale deleted & stock restored: ${old.tx_id}`);
    });
    res.json({ ok: true });
  } catch (err) {
    sendErr(res, err);
  }
});

// ============================================================================
// 4. AUTOMATIC EXPENSE ALLOCATION ENGINE (HISTORICAL IMMUTABLE LEDGER)
// ============================================================================
apiRouter.get('/expenses', requirePermission('finance.view'), (req: AuthedRequest, res) => {
  const db = getDb();
  const bizId = req.user!.businessId!;
  const rows = db
    .prepare('SELECT * FROM saas_expenses WHERE business_id = ? ORDER BY date DESC, created_at DESC LIMIT 300')
    .all(bizId) as Record<string, unknown>[];

  const allocRows = db
    .prepare(
      `SELECT ea.expense_id, ea.batch_id, b.batch_code, ea.percentage, ea.allocated_amount
       FROM expense_allocations ea
       JOIN batches b ON b.id = ea.batch_id
       WHERE ea.business_id = ?`
    )
    .all(bizId) as Array<Record<string, unknown>>;

  const allocMap = new Map<string, Array<{ batchId: string; batchCode: string; percentage: number; allocatedAmount: number }>>();
  for (const a of allocRows) {
    const eid = String(a.expense_id);
    const list = allocMap.get(eid) || [];
    list.push({
      batchId: String(a.batch_id),
      batchCode: String(a.batch_code),
      percentage: Number(a.percentage),
      allocatedAmount: Number(a.allocated_amount),
    });
    allocMap.set(eid, list);
  }

  res.json(
    rows.map((r) => ({
      id: r.id,
      txId: r.tx_id,
      date: r.date,
      category: r.category,
      title: r.title,
      totalAmount: Number(r.total_amount),
      allocationMethod: r.allocation_method,
      notes: r.notes,
      createdBy: r.created_by,
      createdAt: r.created_at,
      allocations: allocMap.get(String(r.id)) || [],
    }))
  );
});

apiRouter.post('/expenses', requireActiveSubscription, requirePermission('finance.add_expense'), (req: AuthedRequest, res) => {
  try {
    const { category, title, totalAmount, allocationMethod, batches, date, notes, idempotencyKey } = req.body as {
      category?: string;
      title?: string;
      totalAmount?: number;
      allocationMethod?: AllocationMethod;
      batches?: BatchAllocationInput[];
      date?: string;
      notes?: string;
      idempotencyKey?: string;
    };

    const amt = round2(Math.max(0, Number(totalAmount) || 0));
    if (!category || !title?.trim() || amt <= 0) {
      throw new Error('খরচের খাত, বিবরণ এবং সঠিক পরিমাণ (> ০) দিন / Category, title, and positive amount required.');
    }

    const created = withTransaction((db) => {
      claimIdempotencyKey(db, idempotencyKey, 'create_saas_expense');
      const bizId = req.user!.businessId!;
      const expId = generateId('exp');
      const txId = generateTxId('EXP');
      const dStr = date || todayISO();
      const now = new Date().toISOString();
      const method: AllocationMethod = allocationMethod || 'equal';

      db.prepare(
        `INSERT INTO saas_expenses (id, business_id, tx_id, date, category, title, total_amount, allocation_method, ref_type, ref_id, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', NULL, ?, ?, ?)`
      ).run(expId, bizId, txId, dStr, category, title.trim(), amt, method, notes?.trim() || '', req.user!.name, now);

      const allocs = allocateExpenseToBatches(db, {
        businessId: bizId,
        expenseId: expId,
        totalAmount: amt,
        method,
        batches: batches || [],
      });

      writeAuditLog(db, req.user!, 'CREATE', 'expense', expId, `Expense (${txId}): ${title.trim()} ৳${amt} [${method}] across ${allocs.length} batch(es)`);
      return { id: expId, txId, allocations: allocs };
    });

    res.json(created);
  } catch (err) {
    sendErr(res, err);
  }
});

// ============================================================================
// 5. FEED INVENTORY & CONSUMPTION (SEPARATED ASSET vs CONSUMED COST!)
// ============================================================================
apiRouter.get('/feeds', requirePermission('feed.view'), (req: AuthedRequest, res) => {
  const db = getDb();
  const bizId = req.user!.businessId!;
  const feeds = db.prepare('SELECT * FROM feeds WHERE business_id = ? ORDER BY updated_at DESC').all(bizId) as Record<string, unknown>[];
  const purchases = db
    .prepare(
      `SELECT fp.*, f.name as feed_name FROM feed_purchases fp JOIN feeds f ON f.id = fp.feed_id WHERE fp.business_id = ? ORDER BY fp.date DESC, fp.created_at DESC`
    )
    .all(bizId) as Record<string, unknown>[];
  const consumptions = db
    .prepare(
      `SELECT fc.*, f.name as feed_name FROM feed_consumptions fc JOIN feeds f ON f.id = fc.feed_id WHERE fc.business_id = ? ORDER BY fc.date DESC, fc.created_at DESC`
    )
    .all(bizId) as Record<string, unknown>[];

  res.json({
    feeds: feeds.map((f) => ({
      id: f.id,
      name: f.name,
      category: f.category,
      unit: f.unit,
      supplierName: f.supplier_name,
      purchasedQty: Number(f.purchased_qty),
      consumedQty: Number(f.consumed_qty),
      remainingQty: Number(f.remaining_qty),
      avgUnitCost: Number(f.avg_unit_cost),
      minThreshold: Number(f.min_threshold),
      updatedAt: f.updated_at,
    })),
    purchases: purchases.map((p) => ({
      id: p.id,
      txId: p.tx_id,
      feedId: p.feed_id,
      feedName: p.feed_name,
      date: p.date,
      supplierName: p.supplier_name,
      quantity: Number(p.quantity),
      unitPrice: Number(p.unit_price),
      totalCost: Number(p.total_cost),
      paidAmount: Number(p.paid_amount),
      dueAmount: Number(p.due_amount),
      paymentStatus: p.payment_status,
      notes: p.notes,
      createdBy: p.created_by,
    })),
    consumptions: consumptions.map((c) => ({
      id: c.id,
      txId: c.tx_id,
      feedId: c.feed_id,
      feedName: c.feed_name,
      date: c.date,
      quantity: Number(c.quantity),
      unitCost: Number(c.unit_cost),
      totalCost: Number(c.total_cost),
      allocationMethod: c.allocation_method,
      notes: c.notes,
      createdBy: c.created_by,
    })),
  });
});

apiRouter.post('/feeds/purchase', requireActiveSubscription, requirePermission('feed.add'), (req: AuthedRequest, res) => {
  try {
    const {
      feedId,
      name,
      category,
      unit,
      supplierId,
      supplierName,
      quantity,
      unitPrice,
      paidAmount,
      paymentStatus,
      minThreshold,
      date,
      notes,
      idempotencyKey,
    } = req.body as Record<string, unknown>;

    const qty = Math.max(0, Number(quantity) || 0);
    const price = Math.max(0, Number(unitPrice) || 0);
    if (qty <= 0 || (!feedId && !String(name || '').trim())) {
      throw new Error('খাদ্যের নাম এবং সঠিক ক্রয় পরিমাণ (> ০) দিন / Feed name and positive quantity required.');
    }

    const created = withTransaction((db) => {
      claimIdempotencyKey(db, idempotencyKey ? String(idempotencyKey) : undefined, 'feed_purchase');
      const bizId = req.user!.businessId!;
      const now = new Date().toISOString();
      const dStr = String(date || todayISO());
      const totalCost = round2(qty * price);

      let paid = paidAmount !== undefined ? Math.max(0, Number(paidAmount)) : paymentStatus === 'due' ? 0 : totalCost;
      if (paid > totalCost) paid = totalCost;
      const due = round2(totalCost - paid);
      const pStatus = due <= 0 ? 'paid' : paid === 0 ? 'due' : 'partial';

      let targetFeedId = feedId ? String(feedId) : '';
      let resolvedSupName = String(supplierName || '').trim() || 'Feed Supplier';

      if (supplierId) {
        const supRow = db.prepare('SELECT name FROM saas_parties WHERE id = ? AND business_id = ?').get(String(supplierId), bizId) as { name: string } | undefined;
        if (supRow) resolvedSupName = supRow.name;
      }

      if (targetFeedId) {
        const existing = db.prepare('SELECT * FROM feeds WHERE id = ? AND business_id = ?').get(targetFeedId, bizId) as Record<string, unknown> | undefined;
        if (!existing) throw new Error('খাদ্য আইটেম পাওয়া যায়নি / Feed item not found.');
        const curRem = Number(existing.remaining_qty);
        const curAvg = Number(existing.avg_unit_cost);
        const nextRem = round2(curRem + qty);
        const nextAvg = nextRem > 0 ? round2((curRem * curAvg + totalCost) / nextRem) : price;

        db.prepare(
          `UPDATE feeds SET purchased_qty = purchased_qty + ?, remaining_qty = ?, avg_unit_cost = ?, supplier_name = ?, updated_at = ? WHERE id = ?`
        ).run(qty, nextRem, nextAvg, resolvedSupName, now, targetFeedId);
      } else {
        targetFeedId = generateId('fed');
        db.prepare(
          `INSERT INTO feeds (id, business_id, name, category, unit, supplier_id, supplier_name, purchased_qty, consumed_qty, remaining_qty, avg_unit_cost, min_threshold, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
        ).run(
          targetFeedId,
          bizId,
          String(name).trim(),
          String(category || 'Poultry Feed').trim(),
          String(unit || 'kg').trim(),
          supplierId ? String(supplierId) : null,
          resolvedSupName,
          qty,
          qty,
          price,
          Math.max(0, Number(minThreshold) || 50),
          now
        );
      }

      const fpId = generateId('fpr');
      const txId = generateTxId('FPR');
      db.prepare(
        `INSERT INTO feed_purchases (id, business_id, tx_id, feed_id, date, supplier_id, supplier_name, quantity, unit_price, total_cost, paid_amount, due_amount, payment_status, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        fpId,
        bizId,
        txId,
        targetFeedId,
        dStr,
        supplierId ? String(supplierId) : null,
        resolvedSupName,
        qty,
        price,
        totalCost,
        paid,
        due,
        pStatus,
        String(notes || '').trim(),
        req.user!.name,
        now
      );

      writeAuditLog(db, req.user!, 'CREATE', 'feed_purchase', fpId, `Feed inventory purchased (${txId}): ${qty} @ ৳${price} = ৳${totalCost}`);
      return { id: fpId, feedId: targetFeedId, txId };
    });

    res.json(created);
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.post('/feeds/consume', requireActiveSubscription, requirePermission('feed.add'), (req: AuthedRequest, res) => {
  try {
    const { feedId, quantity, allocationMethod, batches, date, notes, idempotencyKey } = req.body as {
      feedId?: string;
      quantity?: number;
      allocationMethod?: AllocationMethod;
      batches?: BatchAllocationInput[];
      date?: string;
      notes?: string;
      idempotencyKey?: string;
    };

    const qty = Math.max(0, Number(quantity) || 0);
    if (!feedId || qty <= 0) {
      throw new Error('খাদ্য এবং সঠিক ব্যবহার পরিমাণ (> ০) দিন / Feed item and positive consumption quantity required.');
    }

    const created = withTransaction((db) => {
      claimIdempotencyKey(db, idempotencyKey, 'feed_consume');
      const bizId = req.user!.businessId!;
      const feed = db.prepare('SELECT * FROM feeds WHERE id = ? AND business_id = ?').get(feedId, bizId) as Record<string, unknown> | undefined;
      if (!feed) throw new Error('খাদ্য আইটেম পাওয়া যায়নি / Feed not found.');

      const rem = Number(feed.remaining_qty);
      if (rem < qty) {
        throw new Error(`পর্যাপ্ত খাদ্য মজুদ নেই (বর্তমান: ${rem} ${feed.unit}) / Insufficient feed stock.`);
      }

      const unitCost = Number(feed.avg_unit_cost);
      const consumedCost = round2(qty * unitCost);
      const nextRem = round2(rem - qty);
      const now = new Date().toISOString();
      const dStr = date || todayISO();
      const method: AllocationMethod = allocationMethod || 'equal';

      db.prepare('UPDATE feeds SET consumed_qty = consumed_qty + ?, remaining_qty = ?, updated_at = ? WHERE id = ?').run(qty, nextRem, now, feedId);

      // Create immutable expense & allocate across batches ONLY for consumed feed!
      const expId = generateId('exp');
      const fcId = generateId('fcs');
      const txId = generateTxId('FCS');

      db.prepare(
        `INSERT INTO saas_expenses (id, business_id, tx_id, date, category, title, total_amount, allocation_method, ref_type, ref_id, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, 'feed_consumed', ?, ?, ?, 'feed_consumption', ?, ?, ?, ?)`
      ).run(expId, bizId, txId, dStr, `খাদ্য ব্যবহার: ${feed.name} (${qty} ${feed.unit})`, consumedCost, method, fcId, notes?.trim() || '', req.user!.name, now);

      const allocs = allocateExpenseToBatches(db, {
        businessId: bizId,
        expenseId: expId,
        totalAmount: consumedCost,
        method,
        batches: batches || [],
      });

      db.prepare(
        `INSERT INTO feed_consumptions (id, business_id, tx_id, feed_id, expense_id, date, quantity, unit_cost, total_cost, allocation_method, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(fcId, bizId, txId, feedId, expId, dStr, qty, unitCost, consumedCost, method, notes?.trim() || '', req.user!.name, now);

      if (nextRem <= Number(feed.min_threshold)) {
        createNotification(db, {
          businessId: bizId,
          category: 'low_feed',
          severity: 'warning',
          titleBn: `খাদ্যের মজুদ কম: ${feed.name}`,
          titleEn: `Low Feed Stock: ${feed.name}`,
          bodyBn: `অবশিষ্ট মজুদ মাত্র ${nextRem} ${feed.unit}। দ্রুত ক্রয় করুন।`,
          bodyEn: `Only ${nextRem} ${feed.unit} remaining in inventory.`,
        });
      }

      writeAuditLog(db, req.user!, 'CREATE', 'feed_consumption', fcId, `Feed consumed (${txId}): ${feed.name} ${qty} ${feed.unit} = ৳${consumedCost}`);
      return { id: fcId, txId, consumedCost, allocations: allocs };
    });

    res.json(created);
  } catch (err) {
    sendErr(res, err);
  }
});

// ============================================================================
// 6. MEDICINE, TREATMENTS & VACCINATIONS
// ============================================================================
apiRouter.get('/medicines', requirePermission('medicine.view'), (req: AuthedRequest, res) => {
  const db = getDb();
  const bizId = req.user!.businessId!;
  const meds = db.prepare('SELECT * FROM medicines WHERE business_id = ? ORDER BY updated_at DESC').all(bizId) as Record<string, unknown>[];
  const treatments = db
    .prepare(
      `SELECT mt.*, m.name as med_name, b.batch_code
       FROM medicine_treatments mt
       JOIN medicines m ON m.id = mt.medicine_id
       JOIN batches b ON b.id = mt.batch_id
       WHERE mt.business_id = ? ORDER BY mt.date DESC, mt.created_at DESC`
    )
    .all(bizId) as Record<string, unknown>[];
  const vaccinations = db
    .prepare(
      `SELECT v.*, b.batch_code FROM vaccinations v JOIN batches b ON b.id = v.batch_id WHERE v.business_id = ? ORDER BY v.scheduled_date ASC`
    )
    .all(bizId) as Record<string, unknown>[];

  res.json({
    medicines: meds.map((m) => ({
      id: m.id,
      name: m.name,
      category: m.category,
      unit: m.unit,
      supplierName: m.supplier_name,
      purchasedQty: Number(m.purchased_qty),
      usedQty: Number(m.used_qty),
      remainingQty: Number(m.remaining_qty),
      avgUnitCost: Number(m.avg_unit_cost),
      expiryDate: m.expiry_date,
      vetName: m.vet_name,
      vetPhone: m.vet_phone,
      minThreshold: Number(m.min_threshold),
      updatedAt: m.updated_at,
    })),
    treatments: treatments.map((t) => ({
      id: t.id,
      txId: t.tx_id,
      medicineId: t.medicine_id,
      medicineName: t.med_name,
      batchId: t.batch_id,
      batchCode: t.batch_code,
      date: t.date,
      quantity: Number(t.quantity),
      unitCost: Number(t.unit_cost),
      totalCost: Number(t.total_cost),
      diagnosis: t.diagnosis,
      vetName: t.vet_name,
      notes: t.notes,
      createdBy: t.created_by,
    })),
    vaccinations: vaccinations.map((v) => ({
      id: v.id,
      batchId: v.batch_id,
      batchCode: v.batch_code,
      vaccineName: v.vaccine_name,
      scheduledDate: v.scheduled_date,
      status: v.status,
      completedDate: v.completed_date,
      vetName: v.vet_name,
      notes: v.notes,
    })),
  });
});

apiRouter.post('/medicines/purchase', requireActiveSubscription, requirePermission('medicine.add'), (req: AuthedRequest, res) => {
  try {
    const { medicineId, name, category, unit, supplierName, quantity, unitPrice, paidAmount, expiryDate, vetName, vetPhone, minThreshold, date, notes, idempotencyKey } =
      req.body as Record<string, unknown>;

    const qty = Math.max(0, Number(quantity) || 0);
    const price = Math.max(0, Number(unitPrice) || 0);
    if (qty <= 0 || (!medicineId && !String(name || '').trim())) {
      throw new Error('ওষুধের নাম এবং সঠিক পরিমাণ (> ০) দিন / Medicine name and positive quantity required.');
    }

    const created = withTransaction((db) => {
      claimIdempotencyKey(db, idempotencyKey ? String(idempotencyKey) : undefined, 'med_purchase');
      const bizId = req.user!.businessId!;
      const now = new Date().toISOString();
      const dStr = String(date || todayISO());
      const totalCost = round2(qty * price);
      const paid = paidAmount !== undefined ? Math.min(totalCost, Math.max(0, Number(paidAmount))) : totalCost;
      const due = round2(totalCost - paid);

      let targetMedId = medicineId ? String(medicineId) : '';
      const supName = String(supplierName || '').trim() || 'Vet Pharmacy';

      if (targetMedId) {
        const existing = db.prepare('SELECT * FROM medicines WHERE id = ? AND business_id = ?').get(targetMedId, bizId) as Record<string, unknown> | undefined;
        if (!existing) throw new Error('ওষুধ পাওয়া যায়নি / Medicine not found.');
        const curRem = Number(existing.remaining_qty);
        const curAvg = Number(existing.avg_unit_cost);
        const nextRem = round2(curRem + qty);
        const nextAvg = nextRem > 0 ? round2((curRem * curAvg + totalCost) / nextRem) : price;
        db.prepare(
          `UPDATE medicines SET purchased_qty = purchased_qty + ?, remaining_qty = ?, avg_unit_cost = ?, expiry_date = COALESCE(NULLIF(?, ''), expiry_date), updated_at = ? WHERE id = ?`
        ).run(qty, nextRem, nextAvg, String(expiryDate || ''), now, targetMedId);
      } else {
        targetMedId = generateId('med');
        db.prepare(
          `INSERT INTO medicines (id, business_id, name, category, unit, supplier_name, purchased_qty, used_qty, remaining_qty, avg_unit_cost, expiry_date, vet_name, vet_phone, min_threshold, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          targetMedId,
          bizId,
          String(name).trim(),
          String(category || 'Medicine / Vaccine').trim(),
          String(unit || 'ml').trim(),
          supName,
          qty,
          qty,
          price,
          String(expiryDate || ''),
          String(vetName || '').trim(),
          String(vetPhone || '').trim(),
          Math.max(0, Number(minThreshold) || 10),
          now
        );
      }

      const mpId = generateId('mpr');
      const txId = generateTxId('MPR');
      db.prepare(
        `INSERT INTO medicine_purchases (id, business_id, tx_id, medicine_id, date, supplier_name, quantity, unit_price, total_cost, paid_amount, due_amount, expiry_date, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(mpId, bizId, txId, targetMedId, dStr, supName, qty, price, totalCost, paid, due, String(expiryDate || ''), String(notes || '').trim(), req.user!.name, now);

      writeAuditLog(db, req.user!, 'CREATE', 'medicine_purchase', mpId, `Medicine purchased (${txId}): ${qty} @ ৳${price}`);
      return { id: mpId, medicineId: targetMedId, txId };
    });

    res.json(created);
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.post('/medicines/treat', requireActiveSubscription, requirePermission('medicine.add'), (req: AuthedRequest, res) => {
  try {
    const { medicineId, batchId, quantity, date, diagnosis, vetName, notes, idempotencyKey } = req.body as Record<string, unknown>;
    const qty = Math.max(0, Number(quantity) || 0);
    if (!medicineId || !batchId || qty <= 0) {
      throw new Error('ওষুধ, ব্যাচ এবং সঠিক পরিমাণ (> ০) দিন / Medicine, batch, and positive quantity required.');
    }

    const created = withTransaction((db) => {
      claimIdempotencyKey(db, idempotencyKey ? String(idempotencyKey) : undefined, 'med_treat');
      const bizId = req.user!.businessId!;
      const med = db.prepare('SELECT * FROM medicines WHERE id = ? AND business_id = ?').get(String(medicineId), bizId) as Record<string, unknown> | undefined;
      if (!med) throw new Error('ওষুধ পাওয়া যায়নি / Medicine not found.');
      if (Number(med.remaining_qty) < qty) {
        throw new Error(`পর্যাপ্ত ওষুধ মজুদ নেই (বর্তমান: ${med.remaining_qty} ${med.unit}) / Insufficient medicine stock.`);
      }

      const unitCost = Number(med.avg_unit_cost);
      const totalCost = round2(qty * unitCost);
      const nextRem = round2(Number(med.remaining_qty) - qty);
      const now = new Date().toISOString();
      const dStr = String(date || todayISO());

      db.prepare('UPDATE medicines SET used_qty = used_qty + ?, remaining_qty = ?, updated_at = ? WHERE id = ?').run(qty, nextRem, now, String(medicineId));

      const expId = generateId('exp');
      const trtId = generateId('trt');
      const txId = generateTxId('TRT');

      db.prepare(
        `INSERT INTO saas_expenses (id, business_id, tx_id, date, category, title, total_amount, allocation_method, ref_type, ref_id, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, 'medicine_consumed', ?, ?, 'batch', 'medicine_treatment', ?, ?, ?, ?)`
      ).run(expId, bizId, txId, dStr, `ওষুধ ও চিকিৎসা: ${med.name} (${qty} ${med.unit})`, totalCost, trtId, String(notes || '').trim(), req.user!.name, now);

      allocateExpenseToBatches(db, {
        businessId: bizId,
        expenseId: expId,
        totalAmount: totalCost,
        method: 'batch',
        batches: [{ batchId: String(batchId) }],
      });

      db.prepare(
        `INSERT INTO medicine_treatments (id, business_id, tx_id, medicine_id, batch_id, expense_id, date, quantity, unit_cost, total_cost, diagnosis, vet_name, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(trtId, bizId, txId, String(medicineId), String(batchId), expId, dStr, qty, unitCost, totalCost, String(diagnosis || '').trim(), String(vetName || med.vet_name || '').trim(), String(notes || '').trim(), req.user!.name, now);

      writeAuditLog(db, req.user!, 'CREATE', 'medicine_treatment', trtId, `Treatment (${txId}): ${med.name} -> batch ${batchId} (৳${totalCost})`);
      return { id: trtId, txId, totalCost };
    });

    res.json(created);
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.post('/vaccinations', requireActiveSubscription, requirePermission('medicine.add'), (req: AuthedRequest, res) => {
  try {
    const { batchId, vaccineName, scheduledDate, vetName, notes } = req.body as Record<string, string>;
    if (!batchId || !vaccineName?.trim() || !scheduledDate) throw new Error('ব্যাচ, ভ্যাকসিনের নাম ও তারিখ আবশ্যক।');
    const db = getDb();
    const id = generateId('vac');
    db.prepare(
      `INSERT INTO vaccinations (id, business_id, batch_id, vaccine_name, scheduled_date, status, completed_date, vet_name, notes, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', NULL, ?, ?, ?)`
    ).run(id, req.user!.businessId!, batchId, vaccineName.trim(), scheduledDate, vetName?.trim() || '', notes?.trim() || '', new Date().toISOString());
    res.json({ id });
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.patch('/vaccinations/:id', requireActiveSubscription, requirePermission('medicine.edit'), (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body as { status?: 'pending' | 'completed' };
    const db = getDb();
    db.prepare('UPDATE vaccinations SET status = ?, completed_date = ? WHERE id = ? AND business_id = ?').run(
      status || 'completed',
      status === 'completed' ? todayISO() : null,
      id,
      req.user!.businessId!
    );
    res.json({ ok: true });
  } catch (err) {
    sendErr(res, err);
  }
});

// ============================================================================
// 7. CUSTOMERS & SUPPLIERS DIRECTORY + PAYMENTS
// ============================================================================
apiRouter.get('/parties', requirePermission('customers.view'), (req: AuthedRequest, res) => {
  const db = getDb();
  const bizId = req.user!.businessId!;
  const rows = db.prepare('SELECT * FROM saas_parties WHERE business_id = ? ORDER BY created_at DESC').all(bizId) as Record<string, unknown>[];

  const saleAgg = db
    .prepare(
      `SELECT customer_id, COALESCE(SUM(total_revenue), 0) as vol, COALESCE(SUM(paid_amount), 0) as paid, COALESCE(SUM(due_amount), 0) as due
       FROM batch_sales WHERE business_id = ? AND customer_id IS NOT NULL GROUP BY customer_id`
    )
    .all(bizId) as Array<{ customer_id: string; vol: number; paid: number; due: number }>;
  const saleMap = new Map(saleAgg.map((s) => [s.customer_id, s]));

  const payAgg = db
    .prepare('SELECT party_id, direction, COALESCE(SUM(amount), 0) as amt FROM party_payments WHERE business_id = ? GROUP BY party_id, direction')
    .all(bizId) as Array<{ party_id: string; direction: string; amt: number }>;
  const payMap = new Map<string, number>();
  for (const p of payAgg) {
    payMap.set(p.party_id, round2((payMap.get(p.party_id) || 0) + Number(p.amt)));
  }

  const batchSupAgg = db
    .prepare('SELECT supplier_id, COALESCE(SUM(total_purchase_cost), 0) as vol FROM batches WHERE business_id = ? AND supplier_id IS NOT NULL GROUP BY supplier_id')
    .all(bizId) as Array<{ supplier_id: string; vol: number }>;
  const supBatchMap = new Map(batchSupAgg.map((x) => [x.supplier_id, round2(Number(x.vol))]));

  const fpSupAgg = db
    .prepare('SELECT supplier_id, COALESCE(SUM(total_cost), 0) as vol, COALESCE(SUM(paid_amount), 0) as paid, COALESCE(SUM(due_amount), 0) as due FROM feed_purchases WHERE business_id = ? AND supplier_id IS NOT NULL GROUP BY supplier_id')
    .all(bizId) as Array<{ supplier_id: string; vol: number; paid: number; due: number }>;
  const fpMap = new Map(fpSupAgg.map((x) => [x.supplier_id, x]));

  res.json(
    rows.map((r) => {
      const id = String(r.id);
      const isCus = r.type === 'customer';
      const sAgg = saleMap.get(id);
      const fp = fpMap.get(id);
      const bVol = supBatchMap.get(id) || 0;
      const directPaid = payMap.get(id) || 0;
      const totalVolume = isCus ? round2(sAgg?.vol || 0) : round2(bVol + (fp?.vol || 0));
      const totalPaid = isCus ? round2((sAgg?.paid || 0) + directPaid) : round2((fp?.paid || 0) + directPaid);
      const outstandingBalance = isCus ? Math.max(0, round2((sAgg?.due || 0) - directPaid)) : Math.max(0, round2((fp?.due || 0) - directPaid));

      return {
        id,
        type: r.type,
        userId: r.user_id,
        shopName: r.shop_name,
        name: r.name,
        phone: r.phone,
        email: r.email,
        city: r.city,
        address: r.address,
        notes: r.notes,
        totalVolume,
        totalPaid,
        outstandingBalance,
        createdAt: r.created_at,
      };
    })
  );
});

apiRouter.post('/parties', requireActiveSubscription, requirePermission('customers.add'), (req: AuthedRequest, res) => {
  try {
    const { type, shopName, name, phone, email, city, address, notes } = req.body as Record<string, string>;
    if (!type || !name?.trim()) throw new Error('নাম ও ধরন আবশ্যক / Name and type required.');
    const db = getDb();
    const id = generateId('prt');
    db.prepare(
      `INSERT INTO saas_parties (id, business_id, type, shop_name, name, phone, email, city, address, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, req.user!.businessId!, type, shopName?.trim() || name.trim(), name.trim(), phone?.trim() || '', email?.trim() || '', city?.trim() || '', address?.trim() || '', notes?.trim() || '', new Date().toISOString());
    res.json({ id });
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.post('/parties/:id/payment', requireActiveSubscription, requirePermission('customers.edit'), (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const { amount, date, method, notes } = req.body as { amount?: number; date?: string; method?: string; notes?: string };
    const amt = round2(Math.max(0, Number(amount) || 0));
    if (amt <= 0) throw new Error('সঠিক পরিমাণ দিন / Positive amount required.');

    withTransaction((db) => {
      const bizId = req.user!.businessId!;
      const p = db.prepare('SELECT * FROM saas_parties WHERE id = ? AND business_id = ?').get(id, bizId) as Record<string, unknown> | undefined;
      if (!p) throw new Error('গ্রাহক/সরবরাহকারী পাওয়া যায়নি / Party not found.');
      const dir = p.type === 'customer' ? 'received_from_customer' : 'paid_to_supplier';
      const payId = generateId('pay');
      const txId = generateTxId('PAY');
      db.prepare(
        `INSERT INTO party_payments (id, business_id, tx_id, party_id, direction, amount, date, method, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(payId, bizId, txId, id, dir, amt, date || todayISO(), method || 'cash', notes?.trim() || '', req.user!.name, new Date().toISOString());

      writeAuditLog(db, req.user!, 'PAYMENT', 'party', id, `Party payment (${txId}): ${p.name} ৳${amt}`);
    });
    res.json({ ok: true });
  } catch (err) {
    sendErr(res, err);
  }
});

// ============================================================================
// 8. PUBLISHED PRODUCTS CATALOG & CUSTOMER ORDERS
// ============================================================================
apiRouter.get('/products', (req: AuthedRequest, res) => {
  try {
    const db = getDb();
    const u = req.user!;
    const targetBizId = u.role === 'customer' ? String(req.query.businessId || u.businessId || '') : u.businessId!;
    if (!targetBizId) {
      res.json([]);
      return;
    }

    const sql =
      u.role === 'customer'
        ? `SELECT p.*, b.name as business_name FROM products p JOIN businesses b ON b.id = p.business_id WHERE p.business_id = ? AND p.is_published = 1 AND p.stock_qty > 0 ORDER BY p.created_at DESC`
        : `SELECT p.*, b.name as business_name FROM products p JOIN businesses b ON b.id = p.business_id WHERE p.business_id = ? ORDER BY p.created_at DESC`;

    const rows = db.prepare(sql).all(targetBizId) as Record<string, unknown>[];
    res.json(
      rows.map((r) => ({
        id: r.id,
        businessId: r.business_id,
        businessName: r.business_name,
        category: r.category,
        linkedType: r.linked_type,
        linkedId: r.linked_id,
        nameBn: r.name_bn,
        nameEn: r.name_en,
        descriptionBn: r.description_bn,
        descriptionEn: r.description_en,
        unitLabel: r.unit_label,
        price: Number(r.price),
        stockQty: Number(r.stock_qty),
        imageUrl: r.image_url,
        isPublished: Boolean(r.is_published),
        createdAt: r.created_at,
      }))
    );
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.post('/products', requireActiveSubscription, requirePermission('products.manage'), (req: AuthedRequest, res) => {
  try {
    const { category, linkedType, linkedId, nameBn, nameEn, descriptionBn, descriptionEn, unitLabel, price, stockQty, imageUrl, isPublished } =
      req.body as Record<string, unknown>;
    if (!String(nameBn || '').trim() && !String(nameEn || '').trim()) {
      throw new Error('পণ্যের নাম আবশ্যক / Product name required.');
    }
    const id = generateId('prd');
    const db = getDb();
    const bn = String(nameBn || nameEn).trim();
    const en = String(nameEn || nameBn).trim();
    db.prepare(
      `INSERT INTO products (id, business_id, category, linked_type, linked_id, name_bn, name_en, description_bn, description_en, unit_label, price, stock_qty, image_url, is_published, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      req.user!.businessId!,
      String(category || 'chicken'),
      String(linkedType || 'standalone'),
      linkedId ? String(linkedId) : null,
      bn,
      en,
      String(descriptionBn || '').trim(),
      String(descriptionEn || '').trim(),
      String(unitLabel || 'piece').trim(),
      Math.max(0, Number(price) || 0),
      Math.max(0, Math.floor(Number(stockQty) || 0)),
      String(imageUrl || '').trim(),
      isPublished === false ? 0 : 1,
      new Date().toISOString()
    );
    writeAuditLog(db, req.user!, 'CREATE', 'product', id, `Product published: ${en}`);
    res.json({ id });
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.put('/products/:id', requireActiveSubscription, requirePermission('products.manage'), (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const { nameBn, nameEn, descriptionBn, descriptionEn, price, stockQty, imageUrl, isPublished } = req.body as Record<string, unknown>;
    const db = getDb();
    const bizId = req.user!.businessId!;
    const old = db.prepare('SELECT * FROM products WHERE id = ? AND business_id = ?').get(id, bizId) as Record<string, unknown> | undefined;
    if (!old) throw new Error('পণ্য পাওয়া যায়নি / Product not found.');

    db.prepare(
      `UPDATE products SET name_bn = ?, name_en = ?, description_bn = ?, description_en = ?, price = ?, stock_qty = ?, image_url = ?, is_published = ? WHERE id = ? AND business_id = ?`
    ).run(
      nameBn !== undefined ? String(nameBn).trim() : String(old.name_bn),
      nameEn !== undefined ? String(nameEn).trim() : String(old.name_en),
      descriptionBn !== undefined ? String(descriptionBn).trim() : String(old.description_bn),
      descriptionEn !== undefined ? String(descriptionEn).trim() : String(old.description_en),
      price !== undefined ? Math.max(0, Number(price)) : Number(old.price),
      stockQty !== undefined ? Math.max(0, Math.floor(Number(stockQty))) : Number(old.stock_qty),
      imageUrl !== undefined ? String(imageUrl).trim() : String(old.image_url),
      isPublished !== undefined ? (isPublished ? 1 : 0) : Number(old.is_published),
      id,
      bizId
    );
    res.json({ ok: true });
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.delete('/products/:id', requireActiveSubscription, requirePermission('products.manage'), (req: AuthedRequest, res) => {
  const db = getDb();
  db.prepare('DELETE FROM products WHERE id = ? AND business_id = ?').run(req.params.id, req.user!.businessId!);
  res.json({ ok: true });
});

apiRouter.get('/orders', (req: AuthedRequest, res) => {
  try {
    const db = getDb();
    const u = req.user!;
    let orders: Record<string, unknown>[] = [];
    if (u.role === 'customer') {
      orders = db
        .prepare('SELECT o.*, b.name as business_name FROM orders o JOIN businesses b ON b.id = o.business_id WHERE o.customer_user_id = ? ORDER BY o.created_at DESC')
        .all(u.id) as Record<string, unknown>[];
    } else if (u.role === 'business_owner' || (u.role === 'staff' && u.permissions['orders.view'])) {
      orders = db
        .prepare('SELECT o.*, b.name as business_name FROM orders o JOIN businesses b ON b.id = o.business_id WHERE o.business_id = ? ORDER BY o.created_at DESC')
        .all(u.businessId!) as Record<string, unknown>[];
    } else {
      res.status(403).json({ error: 'অনুমতি নেই / Permission denied.' });
      return;
    }

    const orderIds = orders.map((o) => String(o.id));
    const itemsMap = new Map<string, Record<string, unknown>[]>();
    if (orderIds.length > 0) {
      const items = db
        .prepare(`SELECT * FROM order_items WHERE order_id IN (${orderIds.map(() => '?').join(',')})`)
        .all(...orderIds) as Record<string, unknown>[];
      for (const it of items) {
        const oid = String(it.order_id);
        const list = itemsMap.get(oid) || [];
        list.push(it);
        itemsMap.set(oid, list);
      }
    }

    res.json(
      orders.map((o) => ({
        id: o.id,
        businessId: o.business_id,
        businessName: o.business_name,
        orderNumber: o.order_number,
        customerUserId: o.customer_user_id,
        customerName: o.customer_name,
        shopName: o.shop_name,
        phone: o.phone,
        deliveryAddress: o.delivery_address,
        city: o.city,
        subtotal: Number(o.subtotal),
        deliveryFee: Number(o.delivery_fee),
        totalAmount: Number(o.total_amount),
        paymentMethod: o.payment_method,
        paymentStatus: o.payment_status,
        deliveryStatus: o.delivery_status,
        stockDeducted: Boolean(o.stock_deducted),
        notes: o.notes,
        createdAt: o.created_at,
        updatedAt: o.updated_at,
        items: (itemsMap.get(String(o.id)) || []).map((it) => ({
          id: it.id,
          productId: it.product_id,
          productName: it.product_name,
          linkedType: it.linked_type,
          linkedId: it.linked_id,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unit_price),
          lineTotal: Number(it.line_total),
        })),
      }))
    );
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.post('/orders', requireRoles(['customer']), (req: AuthedRequest, res) => {
  try {
    const { businessId, items, deliveryAddress, city, phone, paymentMethod, notes, idempotencyKey } = req.body as {
      businessId?: string;
      items?: Array<{ productId: string; quantity: number }>;
      deliveryAddress?: string;
      city?: string;
      phone?: string;
      paymentMethod?: 'cod' | 'bkash' | 'nagad' | 'card';
      notes?: string;
      idempotencyKey?: string;
    };

    const u = req.user!;
    const targetBizId = businessId || u.businessId!;
    if (!targetBizId || !items || items.length === 0) {
      throw new Error('অর্ডার করতে অন্তত ১টি পণ্য কার্টে যোগ করুন / Cart cannot be empty.');
    }

    const created = withTransaction((db) => {
      claimIdempotencyKey(db, idempotencyKey, 'create_customer_order');
      const now = new Date().toISOString();
      let subtotal = 0;
      const resolvedItems: Array<{
        productId: string;
        productName: string;
        linkedType: string;
        linkedId: string | null;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
      }> = [];

      for (const reqItem of items) {
        const qty = Math.floor(Number(reqItem.quantity) || 0);
        if (qty <= 0) throw new Error('পণ্যের সঠিক পরিমাণ দিন / Invalid quantity.');
        const prod = db
          .prepare('SELECT * FROM products WHERE id = ? AND business_id = ? AND is_published = 1')
          .get(reqItem.productId, targetBizId) as Record<string, unknown> | undefined;
        if (!prod) throw new Error('পণ্যটি বর্তমানে উপলব্ধ নয় / Product unavailable.');
        if (Number(prod.stock_qty) < qty) {
          throw new Error(`পর্যাপ্ত স্টক নেই (${prod.name_en}: উপলব্ধ ${prod.stock_qty}) / Insufficient stock.`);
        }
        const price = Number(prod.price);
        const lineTotal = round2(price * qty);
        subtotal = round2(subtotal + lineTotal);
        resolvedItems.push({
          productId: String(prod.id),
          productName: u.preferredLang === 'bn' ? String(prod.name_bn) : String(prod.name_en),
          linkedType: String(prod.linked_type),
          linkedId: prod.linked_id ? String(prod.linked_id) : null,
          quantity: qty,
          unitPrice: price,
          lineTotal,
        });
      }

      const orderId = generateId('ord');
      const orderNumber = generateTxId('ORD');

      db.prepare(
        `INSERT INTO orders (id, business_id, order_number, customer_user_id, customer_name, shop_name, phone, delivery_address, city, subtotal, delivery_fee, total_amount, payment_method, payment_status, delivery_status, stock_deducted, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'pending', 'pending', 0, ?, ?, ?)`
      ).run(
        orderId,
        targetBizId,
        orderNumber,
        u.id,
        u.name,
        u.shopName || u.name,
        phone?.trim() || u.phone,
        deliveryAddress?.trim() || u.address,
        city?.trim() || u.city,
        subtotal,
        subtotal,
        paymentMethod || 'cod',
        notes?.trim() || '',
        now,
        now
      );

      for (const item of resolvedItems) {
        db.prepare(
          `INSERT INTO order_items (id, order_id, product_id, product_name, linked_type, linked_id, quantity, unit_price, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(generateId('oit'), orderId, item.productId, item.productName, item.linkedType, item.linkedId, item.quantity, item.unitPrice, item.lineTotal);
      }

      createNotification(db, {
        businessId: targetBizId,
        category: 'new_order',
        severity: 'info',
        titleBn: `নতুন অর্ডার এসেছে: ${orderNumber}`,
        titleEn: `New Order Received: ${orderNumber}`,
        bodyBn: `${u.shopName || u.name} থেকে ৳${subtotal} টাকার নতুন অর্ডার করা হয়েছে।`,
        bodyEn: `${u.shopName || u.name} placed an order of ৳${subtotal}.`,
      });

      writeAuditLog(db, u, 'CREATE', 'order', orderId, `Customer placed order ${orderNumber}: ৳${subtotal}`, targetBizId);
      return { id: orderId, orderNumber, totalAmount: subtotal };
    });

    res.json(created);
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.patch('/orders/:id/status', requireActiveSubscription, (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const { deliveryStatus, paymentStatus } = req.body as { deliveryStatus?: string; paymentStatus?: string };
    const u = req.user!;

    withTransaction((db) => {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Record<string, unknown> | undefined;
      if (!order) throw new Error('অর্ডার পাওয়া যায়নি / Order not found.');

      if (u.role === 'customer') {
        if (String(order.customer_user_id) !== u.id) throw new Error('অনুমতি নেই / Forbidden.');
        if (deliveryStatus !== 'cancelled' || order.delivery_status !== 'pending') {
          throw new Error('শুধুমাত্র Pending অবস্থায় থাকা অর্ডার বাতিল করা যাবে / Only pending orders can be cancelled.');
        }
      } else if (u.role === 'staff') {
        if (String(order.business_id) !== u.businessId) throw new Error('Forbidden.');
        if (deliveryStatus === 'confirmed' && !u.permissions['orders.confirm']) throw new Error('অর্ডার কনফার্ম করার অনুমতি নেই / No confirm permission.');
        if (deliveryStatus === 'cancelled' && !u.permissions['orders.cancel']) throw new Error('অর্ডার বাতিলের অনুমতি নেই / No cancel permission.');
        if (deliveryStatus && !['confirmed', 'cancelled'].includes(deliveryStatus) && !u.permissions['orders.update_status']) {
          throw new Error('অর্ডার স্ট্যাটাস আপডেটের অনুমতি নেই / No update permission.');
        }
      } else if (u.role === 'business_owner') {
        if (String(order.business_id) !== u.businessId) throw new Error('Forbidden.');
      } else {
        throw new Error('Forbidden.');
      }

      const bizId = String(order.business_id);
      const nextDelivery = deliveryStatus || String(order.delivery_status);
      const nextPayment = paymentStatus || String(order.payment_status);
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id) as Record<string, unknown>[];
      let stockDeducted = Number(order.stock_deducted);
      const now = new Date().toISOString();

      // Prevent overselling and deduct inventory upon confirmation (or later status if skipped straight to processing/delivered)
      const needsDeduction = ['confirmed', 'processing', 'ready', 'shipped', 'delivered'].includes(nextDelivery) && stockDeducted === 0;
      if (needsDeduction) {
        for (const it of items) {
          const qty = Number(it.quantity);
          const prod = db.prepare('SELECT stock_qty, name_en FROM products WHERE id = ?').get(String(it.product_id)) as { stock_qty: number; name_en: string } | undefined;
          if (!prod || prod.stock_qty < qty) {
            throw new Error(`স্টক অপর্যাপ্ত (${prod?.name_en || it.product_name}) — ওভারসেলিং প্রতিরোধ করা হয়েছে / Insufficient stock to confirm order.`);
          }
          db.prepare('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?').run(qty, String(it.product_id));

          if (it.linked_type === 'batch' && it.linked_id) {
            const b = db.prepare('SELECT remaining_quantity, batch_code FROM batches WHERE id = ?').get(String(it.linked_id)) as
              | { remaining_quantity: number; batch_code: string }
              | undefined;
            if (!b || b.remaining_quantity < qty) {
              throw new Error(`ব্যাচে পর্যাপ্ত প্রাণী নেই (${b?.batch_code || ''}) / Insufficient live batch stock.`);
            }
            const unitCost = getBatchCostPerAnimal(db, bizId, String(it.linked_id));
            const lineRev = Number(it.line_total);
            const cogs = round2(unitCost * qty);
            const profit = round2(lineRev - cogs);
            db.prepare(
              `INSERT INTO batch_sales (id, business_id, tx_id, batch_id, order_id, date, customer_id, customer_name, customer_phone, quantity, unit_selling_price, total_revenue, paid_amount, due_amount, payment_status, cost_per_animal_snapshot, cogs_amount, realized_profit, notes, created_by, created_at)
               VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              generateId('bsl'),
              bizId,
              String(order.order_number),
              String(it.linked_id),
              id,
              todayISO(),
              String(order.customer_name),
              String(order.phone),
              qty,
              Number(it.unit_price),
              lineRev,
              nextPayment === 'paid' ? lineRev : 0,
              nextPayment === 'paid' ? 0 : lineRev,
              nextPayment === 'paid' ? 'paid' : 'due',
              unitCost,
              cogs,
              profit,
              `Portal Order ${order.order_number}`,
              u.name,
              now
            );
            recomputeBatchQuantities(db, String(it.linked_id));
          }
        }
        stockDeducted = 1;
      }

      // Restore stock if cancelled after deduction
      if (nextDelivery === 'cancelled' && stockDeducted === 1) {
        for (const it of items) {
          db.prepare('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?').run(Number(it.quantity), String(it.product_id));
        }
        const linkedSales = db.prepare('SELECT DISTINCT batch_id FROM batch_sales WHERE order_id = ?').all(id) as Array<{ batch_id: string }>;
        db.prepare('DELETE FROM batch_sales WHERE order_id = ?').run(id);
        for (const ls of linkedSales) {
          recomputeBatchQuantities(db, ls.batch_id);
        }
        stockDeducted = 0;
      }

      db.prepare('UPDATE orders SET delivery_status = ?, payment_status = ?, stock_deducted = ?, updated_at = ? WHERE id = ?').run(
        nextDelivery,
        nextPayment,
        stockDeducted,
        now,
        id
      );

      if (order.customer_user_id) {
        createNotification(db, {
          businessId: bizId,
          targetUserId: String(order.customer_user_id),
          category: 'order_status',
          severity: nextDelivery === 'cancelled' ? 'warning' : 'info',
          titleBn: `অর্ডার ${order.order_number}: ${nextDelivery}`,
          titleEn: `Order ${order.order_number}: ${nextDelivery}`,
          bodyBn: `আপনার অর্ডারের অবস্থা এখন "${nextDelivery}"।`,
          bodyEn: `Your order status is now "${nextDelivery}".`,
        });
      }

      writeAuditLog(db, u, 'UPDATE', 'order', id, `Order ${order.order_number} -> ${nextDelivery} (Payment: ${nextPayment})`, bizId);
    });

    res.json({ ok: true });
  } catch (err) {
    sendErr(res, err);
  }
});

// ============================================================================
// 9. STAFF MANAGEMENT & GRANULAR PERMISSIONS + AUDIT LOGS
// ============================================================================
apiRouter.get('/staff', requireRoles(['business_owner']), (req: AuthedRequest, res) => {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM saas_users WHERE business_id = ? AND role = 'staff' ORDER BY created_at DESC")
    .all(req.user!.businessId!) as Record<string, unknown>[];

  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      username: r.username,
      phone: r.phone,
      email: r.email,
      assignedRoleTitle: r.assigned_role_title,
      permissions: parsePermissions(String(r.permissions_json || '{}'), 'staff'),
      active: Boolean(r.active),
      createdAt: r.created_at,
    }))
  );
});

apiRouter.post('/staff', requireActiveSubscription, requireRoles(['business_owner']), (req: AuthedRequest, res) => {
  try {
    const { name, phone, username, password, assignedRoleTitle, permissions } = req.body as {
      name?: string;
      phone?: string;
      username?: string;
      password?: string;
      assignedRoleTitle?: string;
      permissions?: Partial<StaffPermissions>;
    };
    if (!name?.trim() || !username?.trim() || !password || password.length < 6) {
      throw new Error('নাম, ইউজারনেম এবং কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড দিন / Name, username, and 6+ char password required.');
    }
    const cleanUser = username.trim().toLowerCase();
    const db = getDb();
    const dup = db.prepare('SELECT id FROM saas_users WHERE LOWER(username) = ? OR LOWER(email) = ?').get(cleanUser, cleanUser);
    if (dup) throw new Error('এই ইউজারনেম ইতিমধ্যেই ব্যবহৃত হয়েছে / Username already exists.');

    const id = generateId('stf');
    const mergedPerms: StaffPermissions = { ...DEFAULT_STAFF_PERMISSIONS, ...(permissions || {}) };
    db.prepare(
      `INSERT INTO saas_users (id, business_id, role, name, username, email, phone, password_hash, preferred_lang, assigned_role_title, permissions_json, active, shop_name, city, address, created_at)
       VALUES (?, ?, 'staff', ?, ?, '', ?, ?, ?, ?, ?, 1, '', '', '', ?)`
    ).run(
      id,
      req.user!.businessId!,
      name.trim(),
      cleanUser,
      phone?.trim() || '',
      hashPassword(password),
      req.user!.preferredLang,
      assignedRoleTitle?.trim() || 'Farm Staff',
      JSON.stringify(mergedPerms),
      new Date().toISOString()
    );

    writeAuditLog(db, req.user!, 'CREATE', 'staff', id, `Staff account created: ${name.trim()} (${cleanUser})`);
    res.json({ id });
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.put('/staff/:id', requireActiveSubscription, requireRoles(['business_owner']), (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const { name, phone, assignedRoleTitle, active, permissions, password } = req.body as {
      name?: string;
      phone?: string;
      assignedRoleTitle?: string;
      active?: boolean;
      permissions?: Partial<StaffPermissions>;
      password?: string;
    };
    const db = getDb();
    const bizId = req.user!.businessId!;
    const old = db.prepare("SELECT * FROM saas_users WHERE id = ? AND business_id = ? AND role = 'staff'").get(id, bizId) as
      | Record<string, unknown>
      | undefined;
    if (!old) throw new Error('স্টাফ অ্যাকাউন্ট পাওয়া যায়নি / Staff account not found.');

    const oldPerms = parsePermissions(String(old.permissions_json || '{}'), 'staff');
    const nextPerms = permissions ? { ...oldPerms, ...permissions } : oldPerms;
    const nextHash = password && password.length >= 6 ? hashPassword(password) : String(old.password_hash);

    db.prepare(
      `UPDATE saas_users SET name = ?, phone = ?, assigned_role_title = ?, active = ?, permissions_json = ?, password_hash = ? WHERE id = ? AND business_id = ?`
    ).run(
      name?.trim() || String(old.name),
      phone !== undefined ? phone.trim() : String(old.phone),
      assignedRoleTitle?.trim() || String(old.assigned_role_title),
      active !== undefined ? (active ? 1 : 0) : Number(old.active),
      JSON.stringify(nextPerms),
      nextHash,
      id,
      bizId
    );
    writeAuditLog(db, req.user!, 'UPDATE', 'staff', id, `Staff permissions/profile updated: ${name?.trim() || old.name}`);
    res.json({ ok: true });
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.get('/audit-logs', requireRoles(['business_owner', 'super_admin']), (req: AuthedRequest, res) => {
  const db = getDb();
  const rows =
    req.user!.role === 'super_admin'
      ? (db.prepare('SELECT * FROM saas_audit_logs ORDER BY created_at DESC LIMIT 200').all() as Record<string, unknown>[])
      : (db.prepare('SELECT * FROM saas_audit_logs WHERE business_id = ? ORDER BY created_at DESC LIMIT 200').all(req.user!.businessId!) as Record<string, unknown>[]);
  res.json(
    rows.map((r) => ({
      id: r.id,
      businessId: r.business_id,
      userId: r.user_id,
      userName: r.user_name,
      userRole: r.user_role,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      details: r.details,
      createdAt: r.created_at,
    }))
  );
});

// ============================================================================
// 10. NOTIFICATIONS (STORED + LIVE STOCK/EXPIRY/SUBSCRIPTION REMINDERS)
// ============================================================================
apiRouter.get('/notifications', (req: AuthedRequest, res) => {
  const db = getDb();
  const u = req.user!;
  const stored =
    u.role === 'customer'
      ? (db.prepare('SELECT * FROM saas_notifications WHERE target_user_id = ? ORDER BY created_at DESC LIMIT 40').all(u.id) as Record<string, unknown>[])
      : u.role === 'super_admin'
        ? (db.prepare('SELECT * FROM saas_notifications WHERE business_id IS NULL ORDER BY created_at DESC LIMIT 40').all() as Record<string, unknown>[])
        : (db.prepare('SELECT * FROM saas_notifications WHERE business_id = ? AND target_user_id IS NULL ORDER BY created_at DESC LIMIT 40').all(u.businessId!) as Record<string, unknown>[]);

  const list = stored.map((r) => ({
    id: String(r.id),
    category: String(r.category),
    severity: String(r.severity) as 'info' | 'warning' | 'critical',
    titleBn: String(r.title_bn),
    titleEn: String(r.title_en),
    bodyBn: String(r.body_bn),
    bodyEn: String(r.body_en),
    isRead: Boolean(r.is_read),
    createdAt: String(r.created_at),
  }));

  if ((u.role === 'business_owner' || u.role === 'staff') && u.businessId) {
    const lowFeeds = db
      .prepare('SELECT id, name, remaining_qty, unit FROM feeds WHERE business_id = ? AND remaining_qty <= min_threshold')
      .all(u.businessId) as Array<{ id: string; name: string; remaining_qty: number; unit: string }>;
    for (const f of lowFeeds) {
      list.unshift({
        id: `dyn_feed_${f.id}`,
        category: 'low_feed',
        severity: 'warning',
        titleBn: `খাদ্যের মজুদ কম: ${f.name}`,
        titleEn: `Low Feed Stock: ${f.name}`,
        bodyBn: `অবশিষ্ট ${f.remaining_qty} ${f.unit}`,
        bodyEn: `${f.remaining_qty} ${f.unit} remaining`,
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    }

    const soon = new Date();
    soon.setDate(soon.getDate() + 30);
    const soonStr = soon.toISOString().slice(0, 10);
    const expMeds = db
      .prepare("SELECT id, name, expiry_date FROM medicines WHERE business_id = ? AND expiry_date != '' AND expiry_date <= ? AND remaining_qty > 0")
      .all(u.businessId, soonStr) as Array<{ id: string; name: string; expiry_date: string }>;
    for (const m of expMeds) {
      list.unshift({
        id: `dyn_med_${m.id}`,
        category: 'medicine_expiry',
        severity: 'critical',
        titleBn: `ওষুধের মেয়াদ সতর্কতা: ${m.name}`,
        titleEn: `Medicine Expiry Alert: ${m.name}`,
        bodyBn: `মেয়াদ শেষের তারিখ: ${m.expiry_date}`,
        bodyEn: `Expires on ${m.expiry_date}`,
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    }

    if (u.subscriptionEndsAt) {
      const daysLeft = Math.ceil((new Date(u.subscriptionEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 5) {
        list.unshift({
          id: 'dyn_sub_expiry',
          category: 'subscription',
          severity: daysLeft <= 0 ? 'critical' : 'warning',
          titleBn: daysLeft <= 0 ? 'সাবস্ক্রিপশনের মেয়াদ শেষ হয়েছে' : `সাবস্ক্রিপশন মেয়াদ আর ${daysLeft} দিন`,
          titleEn: daysLeft <= 0 ? 'Subscription Expired' : `Subscription expires in ${daysLeft} days`,
          bodyBn: 'নিরবচ্ছিন্ন সেবার জন্য সাবস্ক্রিপশন নবায়ন করুন।',
          bodyEn: 'Please renew your subscription plan to continue uninterrupted access.',
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  res.json(list);
});

apiRouter.post('/notifications/mark-read', (req: AuthedRequest, res) => {
  const db = getDb();
  const u = req.user!;
  if (u.role === 'customer') {
    db.prepare('UPDATE saas_notifications SET is_read = 1 WHERE target_user_id = ?').run(u.id);
  } else if (u.businessId) {
    db.prepare('UPDATE saas_notifications SET is_read = 1 WHERE business_id = ?').run(u.businessId);
  }
  res.json({ ok: true });
});

// ============================================================================
// 11. SUBSCRIPTIONS, BACKEND-VERIFIED PAYMENTS & SUPPORT ACCESS GRANTS
// ============================================================================
apiRouter.get('/subscriptions/info', requireRoles(['business_owner', 'staff']), (req: AuthedRequest, res) => {
  const db = getDb();
  const bizId = req.user!.businessId!;
  const settings = db.prepare("SELECT * FROM platform_settings WHERE id = 'default'").get() as Record<string, unknown>;
  const txs = db
    .prepare('SELECT * FROM payment_transactions WHERE business_id = ? ORDER BY created_at DESC')
    .all(bizId) as Record<string, unknown>[];
  const supportReqs = db
    .prepare(
      `SELECT sr.*, u.name as super_admin_name FROM support_access_requests sr JOIN saas_users u ON u.id = sr.super_admin_id WHERE sr.business_id = ? ORDER BY sr.created_at DESC`
    )
    .all(bizId) as Record<string, unknown>[];

  res.json({
    plans: {
      monthlyPrice: Number(settings.monthly_price),
      yearlyPrice: Number(settings.yearly_price),
      trialDays: Number(settings.trial_days),
      bkashMerchant: String(settings.bkash_merchant),
      nagadMerchant: String(settings.nagad_merchant),
    },
    transactions: txs.map((t) => ({
      id: t.id,
      businessId: t.business_id,
      txRef: t.tx_ref,
      invoiceNumber: t.invoice_number,
      plan: t.plan,
      gateway: t.gateway,
      amount: Number(t.amount),
      gatewayTrxId: t.gateway_trx_id,
      status: t.status,
      verifiedBy: t.verified_by,
      createdAt: t.created_at,
      verifiedAt: t.verified_at,
    })),
    supportRequests: supportReqs.map((sr) => ({
      id: sr.id,
      businessId: sr.business_id,
      superAdminId: sr.super_admin_id,
      superAdminName: sr.super_admin_name,
      reason: sr.reason,
      status: sr.status,
      expiresAt: sr.expires_at,
      createdAt: sr.created_at,
    })),
  });
});

apiRouter.post('/subscriptions/initiate', requireRoles(['business_owner']), (req: AuthedRequest, res) => {
  try {
    const { plan, gateway } = req.body as { plan?: 'monthly' | 'yearly'; gateway?: 'bkash' | 'nagad' | 'card' | 'international' };
    if (!plan || !['monthly', 'yearly'].includes(plan)) throw new Error('সঠিক প্ল্যান নির্বাচন করুন / Select Monthly or Yearly plan.');
    if (!gateway || !['bkash', 'nagad', 'card', 'international'].includes(gateway)) {
      throw new Error('সঠিক পেমেন্ট মাধ্যম নির্বাচন করুন / Select valid payment gateway.');
    }

    const db = getDb();
    const settings = db.prepare("SELECT monthly_price, yearly_price FROM platform_settings WHERE id = 'default'").get() as {
      monthly_price: number;
      yearly_price: number;
    };
    const amount = plan === 'monthly' ? Number(settings.monthly_price) : Number(settings.yearly_price);
    const bizId = req.user!.businessId!;
    const id = generateId('ptx');
    const txRef = generateTxId('PAYREF');
    const sig = signPaymentChallenge(txRef, plan, amount, bizId);

    db.prepare(
      `INSERT INTO payment_transactions (id, business_id, tx_ref, invoice_number, plan, gateway, amount, gateway_trx_id, status, verification_signature, verified_by, created_at, verified_at)
       VALUES (?, ?, ?, '', ?, ?, ?, '', 'initiated', ?, NULL, ?, NULL)`
    ).run(id, bizId, txRef, plan, gateway, amount, sig, new Date().toISOString());

    res.json({ id, txRef, plan, gateway, amount, verificationSignature: sig });
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.post('/subscriptions/verify', requireRoles(['business_owner']), (req: AuthedRequest, res) => {
  try {
    const { txRef, gatewayTrxId, verificationSignature } = req.body as {
      txRef?: string;
      gatewayTrxId?: string;
      verificationSignature?: string;
    };
    if (!txRef?.trim() || !gatewayTrxId?.trim() || gatewayTrxId.trim().length < 6 || !verificationSignature?.trim()) {
      throw new Error('সঠিক Transaction Reference এবং কমপক্ষে ৬ অক্ষরের Gateway TrxID দিন / Valid TrxID and server signature required.');
    }

    const result = withTransaction((db) => {
      const bizId = req.user!.businessId!;
      const tx = db
        .prepare('SELECT * FROM payment_transactions WHERE tx_ref = ? AND business_id = ?')
        .get(txRef.trim(), bizId) as Record<string, unknown> | undefined;
      if (!tx) throw new Error('পেমেন্ট রেকর্ড পাওয়া যায়নি / Payment transaction not found.');
      if (tx.status === 'verified') throw new Error('এই পেমেন্টটি ইতিমধ্যেই যাচাইকৃত হয়েছে / Payment already verified.');

      const expectedSig = signPaymentChallenge(String(tx.tx_ref), String(tx.plan), Number(tx.amount), bizId);
      if (verificationSignature.trim() !== expectedSig || verificationSignature.trim() !== String(tx.verification_signature)) {
        throw new Error('সার্ভার পেমেন্ট সিগনেচার যাচাই ব্যর্থ হয়েছে / Payment signature verification failed.');
      }

      const cleanGatewayTrx = gatewayTrxId.trim().toUpperCase();
      const reused = db
        .prepare("SELECT id FROM payment_transactions WHERE gateway_trx_id = ? AND status = 'verified'")
        .get(cleanGatewayTrx);
      if (reused) {
        throw new Error('এই TrxID ইতিমধ্যেই ব্যবহৃত হয়েছে / Gateway TrxID already used.');
      }

      const daysToAdd = tx.plan === 'yearly' ? 365 : 30;
      const endsAt = addDaysISO(daysToAdd);
      const now = new Date().toISOString();
      const invoiceNumber = generateTxId('INV');

      db.prepare(
        `UPDATE payment_transactions SET gateway_trx_id = ?, invoice_number = ?, status = 'verified', verified_by = 'backend_gateway_verifier', verified_at = ? WHERE id = ?`
      ).run(cleanGatewayTrx, invoiceNumber, now, String(tx.id));

      db.prepare("UPDATE businesses SET subscription_plan = ?, subscription_status = 'active', subscription_ends_at = ? WHERE id = ?").run(
        String(tx.plan),
        endsAt,
        bizId
      );

      createNotification(db, {
        businessId: bizId,
        category: 'payment_confirmed',
        severity: 'info',
        titleBn: `সাবস্ক্রিপশন সক্রিয় হয়েছে (${invoiceNumber})`,
        titleEn: `Subscription Activated (${invoiceNumber})`,
        bodyBn: `${tx.plan === 'yearly' ? 'বার্ষিক' : 'মাসিক'} প্ল্যান (৳${tx.amount}) সফলভাবে যাচাই ও সক্রিয় করা হয়েছে।`,
        bodyEn: `${tx.plan} plan (৳${tx.amount}) verified and activated.`,
      });

      writeAuditLog(db, req.user!, 'SUBSCRIPTION_VERIFIED', 'payment', String(tx.id), `Verified ${tx.gateway} TrxID ${cleanGatewayTrx} (${invoiceNumber}) -> ৳${tx.amount}`);
      return { invoiceNumber, endsAt, plan: tx.plan };
    });

    res.json({ ok: true, ...result, user: loadUserById(req.user!.id) });
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.post('/support-access/:id/respond', requireRoles(['business_owner']), (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const { decision } = req.body as { decision?: 'approved' | 'revoked' };
    if (!decision || !['approved', 'revoked'].includes(decision)) throw new Error('Invalid decision.');
    const db = getDb();
    const bizId = req.user!.businessId!;
    const sr = db.prepare('SELECT * FROM support_access_requests WHERE id = ? AND business_id = ?').get(id, bizId);
    if (!sr) throw new Error('Support request not found.');
    const expires = decision === 'approved' ? addDaysISO(2) : null;
    db.prepare('UPDATE support_access_requests SET status = ?, expires_at = ? WHERE id = ?').run(decision, expires, id);
    writeAuditLog(db, req.user!, 'SUPPORT_ACCESS', 'support_request', id, `Owner ${decision} Super Admin support access`);
    res.json({ ok: true });
  } catch (err) {
    sendErr(res, err);
  }
});

// ============================================================================
// 12. SUPER ADMIN PORTAL (STRICTLY SEPARATE FROM BUSINESS PRIVATE RECORDS)
// ============================================================================
apiRouter.get('/super-admin/overview', requireRoles(['super_admin']), (_req, res) => {
  const db = getDb();
  const businesses = db.prepare('SELECT * FROM businesses ORDER BY created_at DESC').all() as Record<string, unknown>[];
  const users = db.prepare('SELECT id, business_id, role, name, email, phone, active, created_at FROM saas_users ORDER BY created_at DESC').all() as Record<string, unknown>[];
  const transactions = db
    .prepare(
      `SELECT pt.*, b.name as business_name FROM payment_transactions pt JOIN businesses b ON b.id = pt.business_id ORDER BY pt.created_at DESC`
    )
    .all() as Record<string, unknown>[];
  const settings = db.prepare("SELECT * FROM platform_settings WHERE id = 'default'").get() as Record<string, unknown>;
  const supportRequests = db
    .prepare(
      `SELECT sr.*, b.name as business_name FROM support_access_requests sr JOIN businesses b ON b.id = sr.business_id ORDER BY sr.created_at DESC`
    )
    .all() as Record<string, unknown>[];

  const cusCountMap = new Map<string, number>();
  const stfCountMap = new Map<string, number>();
  let totalCustomers = 0;
  let totalStaff = 0;

  for (const u of users) {
    const bid = u.business_id ? String(u.business_id) : '';
    if (u.role === 'customer') {
      totalCustomers += 1;
      if (bid) cusCountMap.set(bid, (cusCountMap.get(bid) || 0) + 1);
    } else if (u.role === 'staff') {
      totalStaff += 1;
      if (bid) stfCountMap.set(bid, (stfCountMap.get(bid) || 0) + 1);
    }
  }

  let activeSubscriptions = 0;
  let expiredSubscriptions = 0;
  for (const b of businesses) {
    if (b.subscription_status === 'expired') expiredSubscriptions += 1;
    else activeSubscriptions += 1;
  }

  let monthlyRevenue = 0;
  let yearlyRevenue = 0;
  for (const t of transactions) {
    if (t.status === 'verified') {
      if (t.plan === 'monthly') monthlyRevenue = round2(monthlyRevenue + Number(t.amount));
      if (t.plan === 'yearly') yearlyRevenue = round2(yearlyRevenue + Number(t.amount));
    }
  }

  res.json({
    metrics: {
      totalBusinesses: businesses.length,
      totalCustomers,
      totalStaff,
      activeSubscriptions,
      expiredSubscriptions,
      monthlyRevenue,
      yearlyRevenue,
      totalSubscriptionRevenue: round2(monthlyRevenue + yearlyRevenue),
    },
    businesses: businesses.map((b) => ({
      id: b.id,
      name: b.name,
      ownerName: b.owner_name,
      city: b.city,
      phone: b.phone,
      status: b.status,
      subscriptionPlan: b.subscription_plan,
      subscriptionStatus: b.subscription_status,
      trialEndsAt: b.trial_ends_at,
      subscriptionEndsAt: b.subscription_ends_at,
      customerCount: cusCountMap.get(String(b.id)) || 0,
      staffCount: stfCountMap.get(String(b.id)) || 0,
      createdAt: b.created_at,
    })),
    users: users.map((u) => ({
      id: u.id,
      businessId: u.business_id,
      role: u.role,
      name: u.name,
      email: u.email,
      phone: u.phone,
      active: Boolean(u.active),
      createdAt: u.created_at,
    })),
    transactions: transactions.map((t) => ({
      id: t.id,
      businessId: t.business_id,
      businessName: t.business_name,
      txRef: t.tx_ref,
      invoiceNumber: t.invoice_number,
      plan: t.plan,
      gateway: t.gateway,
      amount: Number(t.amount),
      gatewayTrxId: t.gateway_trx_id,
      status: t.status,
      verifiedBy: t.verified_by,
      createdAt: t.created_at,
      verifiedAt: t.verified_at,
    })),
    settings: {
      monthlyPrice: Number(settings.monthly_price),
      yearlyPrice: Number(settings.yearly_price),
      trialDays: Number(settings.trial_days),
      bkashMerchant: String(settings.bkash_merchant),
      nagadMerchant: String(settings.nagad_merchant),
      supportEmail: String(settings.support_email),
    },
    supportRequests: supportRequests.map((sr) => ({
      id: sr.id,
      businessId: sr.business_id,
      businessName: sr.business_name,
      superAdminId: sr.super_admin_id,
      reason: sr.reason,
      status: sr.status,
      expiresAt: sr.expires_at,
      createdAt: sr.created_at,
    })),
  });
});

apiRouter.patch('/super-admin/businesses/:id', requireRoles(['super_admin']), (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const { status, subscriptionStatus, subscriptionPlan, extendDays } = req.body as {
      status?: 'active' | 'suspended';
      subscriptionStatus?: 'trial' | 'active' | 'expired';
      subscriptionPlan?: 'trial' | 'monthly' | 'yearly';
      extendDays?: number;
    };
    const db = getDb();
    const biz = db.prepare('SELECT * FROM businesses WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!biz) throw new Error('Business not found.');
    const nextEnds = extendDays ? addDaysISO(extendDays) : (biz.subscription_ends_at as string | null);
    db.prepare('UPDATE businesses SET status = ?, subscription_status = ?, subscription_plan = ?, subscription_ends_at = ? WHERE id = ?').run(
      status || String(biz.status),
      subscriptionStatus || String(biz.subscription_status),
      subscriptionPlan || String(biz.subscription_plan),
      nextEnds,
      id
    );
    writeAuditLog(db, req.user!, 'ADMIN_UPDATE', 'business', id, `Super Admin updated business ${biz.name} (status=${status || biz.status})`, null);
    res.json({ ok: true });
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.patch('/super-admin/users/:id/toggle', requireRoles(['super_admin']), (req: AuthedRequest, res) => {
  const db = getDb();
  const target = db.prepare('SELECT id, active, role FROM saas_users WHERE id = ?').get(req.params.id) as
    | { id: string; active: number; role: string }
    | undefined;
  if (!target || target.role === 'super_admin') {
    res.status(400).json({ error: 'Cannot toggle super admin.' });
    return;
  }
  db.prepare('UPDATE saas_users SET active = ? WHERE id = ?').run(target.active ? 0 : 1, target.id);
  writeAuditLog(db, req.user!, 'TOGGLE_USER', 'user', target.id, `Toggled active -> ${!target.active}`, null);
  res.json({ ok: true });
});

apiRouter.put('/super-admin/settings', requireRoles(['super_admin']), (req: AuthedRequest, res) => {
  try {
    const { monthlyPrice, yearlyPrice, trialDays, bkashMerchant, nagadMerchant, supportEmail } = req.body as Record<string, unknown>;
    const db = getDb();
    db.prepare(
      `UPDATE platform_settings SET monthly_price = ?, yearly_price = ?, trial_days = ?, bkash_merchant = ?, nagad_merchant = ?, support_email = ?, updated_at = ? WHERE id = 'default'`
    ).run(
      Math.max(1, Number(monthlyPrice) || 50),
      Math.max(1, Number(yearlyPrice) || 1000),
      Math.max(1, Math.floor(Number(trialDays) || 14)),
      String(bkashMerchant || '01700-000001').trim(),
      String(nagadMerchant || '01700-000002').trim(),
      String(supportEmail || 'support@smartfarm.saas').trim(),
      new Date().toISOString()
    );
    writeAuditLog(db, req.user!, 'UPDATE', 'platform_settings', 'default', 'Platform subscription pricing/settings updated', null);
    res.json({ ok: true });
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.post('/super-admin/support-request', requireRoles(['super_admin']), (req: AuthedRequest, res) => {
  try {
    const { businessId, reason } = req.body as { businessId?: string; reason?: string };
    if (!businessId || !reason?.trim()) throw new Error('ব্যবসা এবং সাপোর্ট অ্যাক্সেসের কারণ লিখুন / Business and reason required.');
    const db = getDb();
    const id = generateId('sup');
    db.prepare(
      `INSERT INTO support_access_requests (id, business_id, super_admin_id, reason, status, expires_at, created_at)
       VALUES (?, ?, ?, ?, 'pending', NULL, ?)`
    ).run(id, businessId, req.user!.id, reason.trim(), new Date().toISOString());

    createNotification(db, {
      businessId,
      category: 'support_access',
      severity: 'info',
      titleBn: 'সুপার অ্যাডমিন সাপোর্ট অ্যাক্সেস অনুরোধ',
      titleEn: 'Super Admin Support Access Request',
      bodyBn: `কারণ: ${reason.trim()} — সেটিংস থেকে অনুমোদন বা বাতিল করুন।`,
      bodyEn: `Reason: ${reason.trim()} — Approve or revoke in Settings.`,
    });
    res.json({ id });
  } catch (err) {
    sendErr(res, err);
  }
});

apiRouter.get('/super-admin/businesses/:id/audited-view', requireRoles(['super_admin']), (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const db = getDb();
    const grant = db
      .prepare(
        `SELECT * FROM support_access_requests WHERE business_id = ? AND super_admin_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 1`
      )
      .get(id, req.user!.id) as { id: string; expires_at: string | null } | undefined;

    if (!grant || (grant.expires_at && new Date(grant.expires_at).getTime() < Date.now())) {
      res.status(403).json({
        error: 'ব্যবসার মালিকের অনুমোদিত সাপোর্ট অ্যাক্সেস নেই / Support access not approved by business owner.',
      });
      return;
    }

    const batches = computeBatchFinancialsList(db, id);
    writeAuditLog(db, req.user!, 'CONTROLLED_SUPPORT_VIEW', 'business', id, `Super Admin inspected batch summary via grant ${grant.id}`, id);
    res.json({
      batchesCount: batches.length,
      activeAnimals: batches.reduce((a, b) => a + b.remainingQuantity, 0),
      totalInvestment: round2(batches.reduce((a, b) => a + b.totalInvestment, 0)),
      totalRevenue: round2(batches.reduce((a, b) => a + b.totalSalesRevenue, 0)),
    });
  } catch (err) {
    sendErr(res, err);
  }
});
