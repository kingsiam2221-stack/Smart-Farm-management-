import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'smart_farm.db');

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!dbInstance) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    dbInstance = new DatabaseSync(DB_PATH);
    dbInstance.exec('PRAGMA journal_mode = WAL;');
    dbInstance.exec('PRAGMA foreign_keys = ON;');
    dbInstance.exec('PRAGMA busy_timeout = 5000;');
    initSchema(dbInstance);
  }
  return dbInstance;
}

export function withTransaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = fn(db);
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // ignore rollback errors
    }
    throw err;
  }
}

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(7).toString('hex')}`;
}

export function generateTxId(prefix: string): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rnd = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}-${ymd}-${rnd}`;
}

export function claimIdempotencyKey(db: DatabaseSync, key: string | undefined, action: string): void {
  if (!key || !key.trim()) return;
  const existing = db.prepare('SELECT key_id FROM idempotency_keys WHERE key_id = ?').get(key.trim());
  if (existing) {
    throw new Error('এই লেনদেনটি ইতিমধ্যেই সম্পন্ন হয়েছে (Duplicate submission prevented) / Duplicate transaction blocked.');
  }
  db.prepare('INSERT INTO idempotency_keys (key_id, action, created_at) VALUES (?, ?, ?)').run(
    key.trim(),
    action,
    new Date().toISOString()
  );
}

export function writeAuditLog(
  db: DatabaseSync,
  actor: { id: string; name: string; role: string; businessId?: string | null },
  action: string,
  entityType: string,
  entityId: string,
  details: string,
  overrideBusinessId?: string | null
): void {
  const bizId = overrideBusinessId !== undefined ? overrideBusinessId : actor.businessId ?? null;
  db.prepare(
    `INSERT INTO saas_audit_logs (id, business_id, user_id, user_name, user_role, action, entity_type, entity_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    generateId('aud'),
    bizId,
    actor.id,
    actor.name,
    actor.role,
    action,
    entityType,
    entityId,
    details,
    new Date().toISOString()
  );
}

export function createNotification(
  db: DatabaseSync,
  params: {
    businessId: string | null;
    targetUserId?: string | null;
    category: string;
    severity: 'info' | 'warning' | 'critical';
    titleBn: string;
    titleEn: string;
    bodyBn: string;
    bodyEn: string;
  }
): void {
  db.prepare(
    `INSERT INTO saas_notifications (id, business_id, target_user_id, category, severity, title_bn, title_en, body_bn, body_en, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(
    generateId('ntf'),
    params.businessId,
    params.targetUserId ?? null,
    params.category,
    params.severity,
    params.titleBn,
    params.titleEn,
    params.bodyBn,
    params.bodyEn,
    new Date().toISOString()
  );
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key_id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platform_settings (
      id TEXT PRIMARY KEY,
      monthly_price REAL NOT NULL DEFAULT 50,
      yearly_price REAL NOT NULL DEFAULT 1000,
      trial_days INTEGER NOT NULL DEFAULT 14,
      bkash_merchant TEXT NOT NULL DEFAULT '01700-000001',
      nagad_merchant TEXT NOT NULL DEFAULT '01700-000002',
      support_email TEXT NOT NULL DEFAULT 'support@smartfarm.saas',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended')),
      subscription_plan TEXT NOT NULL DEFAULT 'trial' CHECK(subscription_plan IN ('trial', 'monthly', 'yearly')),
      subscription_status TEXT NOT NULL DEFAULT 'trial' CHECK(subscription_status IN ('trial', 'active', 'expired')),
      trial_ends_at TEXT NOT NULL,
      subscription_ends_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saas_users (
      id TEXT PRIMARY KEY,
      business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('super_admin', 'business_owner', 'staff', 'customer')),
      name TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      preferred_lang TEXT NOT NULL DEFAULT 'bn' CHECK(preferred_lang IN ('bn', 'en')),
      assigned_role_title TEXT NOT NULL DEFAULT '',
      permissions_json TEXT NOT NULL DEFAULT '{}',
      active INTEGER NOT NULL DEFAULT 1,
      shop_name TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_saas_users_email ON saas_users(email);
    CREATE INDEX IF NOT EXISTS idx_saas_users_phone ON saas_users(phone);
    CREATE INDEX IF NOT EXISTS idx_saas_users_username ON saas_users(username);

    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      batch_code TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('chicken', 'duck', 'birds', 'cattle', 'goats', 'sheep', 'other')),
      breed TEXT NOT NULL DEFAULT '',
      initial_quantity INTEGER NOT NULL CHECK(initial_quantity > 0),
      purchase_date TEXT NOT NULL,
      purchase_price_per_unit REAL NOT NULL CHECK(purchase_price_per_unit >= 0),
      total_purchase_cost REAL NOT NULL CHECK(total_purchase_cost >= 0),
      supplier_id TEXT,
      supplier_name TEXT NOT NULL DEFAULT '',
      initial_weight_kg REAL NOT NULL DEFAULT 1 CHECK(initial_weight_kg > 0),
      deaths_quantity INTEGER NOT NULL DEFAULT 0 CHECK(deaths_quantity >= 0),
      sold_quantity INTEGER NOT NULL DEFAULT 0 CHECK(sold_quantity >= 0),
      remaining_quantity INTEGER NOT NULL CHECK(remaining_quantity >= 0),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'closed')),
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_batches_biz ON batches(business_id);

    CREATE TABLE IF NOT EXISTS batch_deaths (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      tx_id TEXT NOT NULL,
      batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      cause TEXT NOT NULL DEFAULT '',
      unit_cost_at_death REAL NOT NULL DEFAULT 0,
      financial_loss REAL NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saas_expenses (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      tx_id TEXT NOT NULL,
      date TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('feed_consumed', 'medicine_consumed', 'labor', 'transport', 'utilities', 'equipment', 'other')),
      title TEXT NOT NULL,
      total_amount REAL NOT NULL CHECK(total_amount >= 0),
      allocation_method TEXT NOT NULL CHECK(allocation_method IN ('equal', 'weight', 'batch', 'custom')),
      ref_type TEXT,
      ref_id TEXT,
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expense_allocations (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      expense_id TEXT NOT NULL REFERENCES saas_expenses(id) ON DELETE CASCADE,
      batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      animal_count_snapshot INTEGER NOT NULL DEFAULT 0,
      weight_kg_snapshot REAL NOT NULL DEFAULT 0,
      percentage REAL NOT NULL DEFAULT 0,
      allocated_amount REAL NOT NULL CHECK(allocated_amount >= 0),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_exp_alloc_batch ON expense_allocations(batch_id);

    CREATE TABLE IF NOT EXISTS feeds (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Poultry Feed',
      unit TEXT NOT NULL DEFAULT 'kg',
      supplier_id TEXT,
      supplier_name TEXT NOT NULL DEFAULT '',
      purchased_qty REAL NOT NULL DEFAULT 0,
      consumed_qty REAL NOT NULL DEFAULT 0,
      remaining_qty REAL NOT NULL DEFAULT 0 CHECK(remaining_qty >= 0),
      avg_unit_cost REAL NOT NULL DEFAULT 0,
      min_threshold REAL NOT NULL DEFAULT 50,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feed_purchases (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      tx_id TEXT NOT NULL,
      feed_id TEXT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      supplier_id TEXT,
      supplier_name TEXT NOT NULL DEFAULT '',
      quantity REAL NOT NULL CHECK(quantity > 0),
      unit_price REAL NOT NULL CHECK(unit_price >= 0),
      total_cost REAL NOT NULL CHECK(total_cost >= 0),
      paid_amount REAL NOT NULL DEFAULT 0,
      due_amount REAL NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'paid' CHECK(payment_status IN ('paid', 'partial', 'due')),
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feed_consumptions (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      tx_id TEXT NOT NULL,
      feed_id TEXT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
      expense_id TEXT REFERENCES saas_expenses(id) ON DELETE SET NULL,
      date TEXT NOT NULL,
      quantity REAL NOT NULL CHECK(quantity > 0),
      unit_cost REAL NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0,
      allocation_method TEXT NOT NULL CHECK(allocation_method IN ('equal', 'weight', 'batch', 'custom')),
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS medicines (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Antibiotic / Vaccine',
      unit TEXT NOT NULL DEFAULT 'ml',
      supplier_id TEXT,
      supplier_name TEXT NOT NULL DEFAULT '',
      purchased_qty REAL NOT NULL DEFAULT 0,
      used_qty REAL NOT NULL DEFAULT 0,
      remaining_qty REAL NOT NULL DEFAULT 0 CHECK(remaining_qty >= 0),
      avg_unit_cost REAL NOT NULL DEFAULT 0,
      expiry_date TEXT NOT NULL DEFAULT '',
      vet_name TEXT NOT NULL DEFAULT '',
      vet_phone TEXT NOT NULL DEFAULT '',
      min_threshold REAL NOT NULL DEFAULT 10,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS medicine_purchases (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      tx_id TEXT NOT NULL,
      medicine_id TEXT NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      supplier_id TEXT,
      supplier_name TEXT NOT NULL DEFAULT '',
      quantity REAL NOT NULL CHECK(quantity > 0),
      unit_price REAL NOT NULL CHECK(unit_price >= 0),
      total_cost REAL NOT NULL CHECK(total_cost >= 0),
      paid_amount REAL NOT NULL DEFAULT 0,
      due_amount REAL NOT NULL DEFAULT 0,
      expiry_date TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS medicine_treatments (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      tx_id TEXT NOT NULL,
      medicine_id TEXT NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
      batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      expense_id TEXT REFERENCES saas_expenses(id) ON DELETE SET NULL,
      date TEXT NOT NULL,
      quantity REAL NOT NULL CHECK(quantity > 0),
      unit_cost REAL NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0,
      diagnosis TEXT NOT NULL DEFAULT '',
      vet_name TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vaccinations (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      vaccine_name TEXT NOT NULL,
      scheduled_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed')),
      completed_date TEXT,
      vet_name TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saas_parties (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('customer', 'supplier')),
      user_id TEXT REFERENCES saas_users(id) ON DELETE SET NULL,
      shop_name TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS party_payments (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      tx_id TEXT NOT NULL,
      party_id TEXT NOT NULL REFERENCES saas_parties(id) ON DELETE CASCADE,
      direction TEXT NOT NULL CHECK(direction IN ('received_from_customer', 'paid_to_supplier')),
      amount REAL NOT NULL CHECK(amount > 0),
      date TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'cash',
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS batch_sales (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      tx_id TEXT NOT NULL,
      batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      order_id TEXT,
      date TEXT NOT NULL,
      customer_id TEXT,
      customer_name TEXT NOT NULL DEFAULT '',
      customer_phone TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      unit_selling_price REAL NOT NULL CHECK(unit_selling_price >= 0),
      total_revenue REAL NOT NULL CHECK(total_revenue >= 0),
      paid_amount REAL NOT NULL DEFAULT 0,
      due_amount REAL NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'paid' CHECK(payment_status IN ('paid', 'partial', 'due')),
      cost_per_animal_snapshot REAL NOT NULL DEFAULT 0,
      cogs_amount REAL NOT NULL DEFAULT 0,
      realized_profit REAL NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      linked_type TEXT NOT NULL DEFAULT 'standalone' CHECK(linked_type IN ('batch', 'feed', 'standalone')),
      linked_id TEXT,
      name_bn TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_bn TEXT NOT NULL DEFAULT '',
      description_en TEXT NOT NULL DEFAULT '',
      unit_label TEXT NOT NULL DEFAULT 'piece',
      price REAL NOT NULL CHECK(price >= 0),
      stock_qty INTEGER NOT NULL DEFAULT 0 CHECK(stock_qty >= 0),
      image_url TEXT NOT NULL DEFAULT '',
      is_published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      order_number TEXT NOT NULL,
      customer_user_id TEXT REFERENCES saas_users(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL,
      shop_name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL,
      delivery_address TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT '',
      subtotal REAL NOT NULL DEFAULT 0,
      delivery_fee REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'cod' CHECK(payment_method IN ('cod', 'bkash', 'nagad', 'card')),
      payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending', 'paid', 'failed')),
      delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK(delivery_status IN ('pending', 'confirmed', 'processing', 'ready', 'shipped', 'delivered', 'cancelled')),
      stock_deducted INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      product_name TEXT NOT NULL,
      linked_type TEXT NOT NULL,
      linked_id TEXT,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      unit_price REAL NOT NULL CHECK(unit_price >= 0),
      line_total REAL NOT NULL CHECK(line_total >= 0)
    );

    CREATE TABLE IF NOT EXISTS payment_transactions (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      tx_ref TEXT NOT NULL UNIQUE,
      invoice_number TEXT NOT NULL DEFAULT '',
      plan TEXT NOT NULL CHECK(plan IN ('monthly', 'yearly')),
      gateway TEXT NOT NULL CHECK(gateway IN ('bkash', 'nagad', 'card', 'international')),
      amount REAL NOT NULL CHECK(amount > 0),
      gateway_trx_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'initiated' CHECK(status IN ('initiated', 'verified', 'rejected')),
      verification_signature TEXT NOT NULL,
      verified_by TEXT,
      created_at TEXT NOT NULL,
      verified_at TEXT
    );

    CREATE TABLE IF NOT EXISTS support_access_requests (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      super_admin_id TEXT NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'revoked', 'expired')),
      expires_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saas_notifications (
      id TEXT PRIMARY KEY,
      business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
      target_user_id TEXT REFERENCES saas_users(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info', 'warning', 'critical')),
      title_bn TEXT NOT NULL,
      title_en TEXT NOT NULL,
      body_bn TEXT NOT NULL,
      body_en TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saas_audit_logs (
      id TEXT PRIMARY KEY,
      business_id TEXT,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_role TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const settingsExists = db.prepare("SELECT id FROM platform_settings WHERE id = 'default'").get();
  if (!settingsExists) {
    db.prepare(
      `INSERT INTO platform_settings (id, monthly_price, yearly_price, trial_days, bkash_merchant, nagad_merchant, support_email, updated_at)
       VALUES ('default', 50, 1000, 14, '01700-000001', '01700-000002', 'support@smartfarm.saas', ?)`
    ).run(new Date().toISOString());
  }
}
