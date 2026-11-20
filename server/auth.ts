import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type express from 'express';
import { getDb } from './db.ts';

const SECRET_FILE = path.resolve(process.cwd(), 'data', '.session_secret');
export const SESSION_COOKIE_NAME = 'saas_session';

export interface StaffPermissions {
  'animals.view': boolean;
  'animals.add': boolean;
  'animals.edit': boolean;
  'animals.delete': boolean;
  'feed.view': boolean;
  'feed.add': boolean;
  'feed.edit': boolean;
  'feed.delete': boolean;
  'medicine.view': boolean;
  'medicine.add': boolean;
  'medicine.edit': boolean;
  'finance.view': boolean;
  'finance.add_expense': boolean;
  'finance.view_profit': boolean;
  'finance.view_sales': boolean;
  'finance.export': boolean;
  'customers.view': boolean;
  'customers.add': boolean;
  'customers.edit': boolean;
  'orders.view': boolean;
  'orders.confirm': boolean;
  'orders.update_status': boolean;
  'orders.cancel': boolean;
  'products.manage': boolean;
}

export const ALL_OWNER_PERMISSIONS: StaffPermissions = {
  'animals.view': true,
  'animals.add': true,
  'animals.edit': true,
  'animals.delete': true,
  'feed.view': true,
  'feed.add': true,
  'feed.edit': true,
  'feed.delete': true,
  'medicine.view': true,
  'medicine.add': true,
  'medicine.edit': true,
  'finance.view': true,
  'finance.add_expense': true,
  'finance.view_profit': true,
  'finance.view_sales': true,
  'finance.export': true,
  'customers.view': true,
  'customers.add': true,
  'customers.edit': true,
  'orders.view': true,
  'orders.confirm': true,
  'orders.update_status': true,
  'orders.cancel': true,
  'products.manage': true,
};

export const DEFAULT_STAFF_PERMISSIONS: StaffPermissions = {
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

export type PermissionKey = keyof StaffPermissions;

export interface SessionUser {
  id: string;
  businessId: string | null;
  businessName: string | null;
  businessStatus: 'active' | 'suspended' | null;
  subscriptionPlan: 'trial' | 'monthly' | 'yearly' | null;
  subscriptionStatus: 'trial' | 'active' | 'expired' | null;
  subscriptionEndsAt: string | null;
  role: 'super_admin' | 'business_owner' | 'staff' | 'customer';
  name: string;
  username: string;
  email: string;
  phone: string;
  preferredLang: 'bn' | 'en';
  assignedRoleTitle: string;
  permissions: StaffPermissions;
  active: boolean;
  shopName: string;
  city: string;
  address: string;
  createdAt: string;
}

export interface AuthedRequest extends express.Request {
  user?: SessionUser;
}

export function getSessionSecret(): string {
  const dir = path.dirname(SECRET_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (fs.existsSync(SECRET_FILE)) {
    return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
  return generated;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function signSessionToken(userId: string): string {
  const secret = getSessionSecret();
  const payload = Buffer.from(JSON.stringify({ uid: userId, iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function signPaymentChallenge(txRef: string, plan: string, amount: number, businessId: string): string {
  const secret = getSessionSecret();
  return crypto
    .createHmac('sha256', secret)
    .update(`${txRef}:${plan}:${amount}:${businessId}`)
    .digest('hex');
}

export function verifySessionToken(token: string): { uid: string } | null {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expected = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { uid?: string };
    return parsed.uid ? { uid: parsed.uid } : null;
  } catch {
    return null;
  }
}

function parseCookies(req: express.Request): Record<string, string> {
  const header = req.headers.cookie;
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) {
      cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return cookies;
}

export function setSessionCookie(res: express.Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: express.Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}

export function parsePermissions(jsonStr: string | null | undefined, role: string): StaffPermissions {
  if (role === 'business_owner' || role === 'super_admin') {
    return { ...ALL_OWNER_PERMISSIONS };
  }
  if (role === 'customer') {
    return {
      ...DEFAULT_STAFF_PERMISSIONS,
      'animals.view': false,
      'feed.view': false,
      'feed.add': false,
      'medicine.view': false,
      'customers.view': false,
      'orders.view': false,
    };
  }
  try {
    const parsed = JSON.parse(jsonStr || '{}') as Partial<StaffPermissions>;
    return { ...DEFAULT_STAFF_PERMISSIONS, ...parsed };
  } catch {
    return { ...DEFAULT_STAFF_PERMISSIONS };
  }
}

export function syncBusinessSubscriptionStatus(businessId: string): void {
  const db = getDb();
  const biz = db.prepare('SELECT id, subscription_plan, subscription_status, trial_ends_at, subscription_ends_at FROM businesses WHERE id = ?').get(businessId) as
    | { id: string; subscription_plan: string; subscription_status: string; trial_ends_at: string; subscription_ends_at: string | null }
    | undefined;
  if (!biz) return;
  const now = Date.now();
  const expiryDate = biz.subscription_plan === 'trial' ? biz.trial_ends_at : biz.subscription_ends_at;
  if (expiryDate && new Date(expiryDate).getTime() < now && biz.subscription_status !== 'expired') {
    db.prepare("UPDATE businesses SET subscription_status = 'expired' WHERE id = ?").run(businessId);
  }
}

export function loadUserById(userId: string): SessionUser | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.*, b.name as biz_name, b.status as biz_status, b.subscription_plan, b.subscription_status, b.trial_ends_at, b.subscription_ends_at
       FROM saas_users u
       LEFT JOIN businesses b ON b.id = u.business_id
       WHERE u.id = ?`
    )
    .get(userId) as Record<string, unknown> | undefined;

  if (!row || !row.active) return null;

  const businessId = row.business_id ? String(row.business_id) : null;
  if (businessId) {
    syncBusinessSubscriptionStatus(businessId);
  }

  const freshBiz = businessId
    ? (db.prepare('SELECT name, status, subscription_plan, subscription_status, trial_ends_at, subscription_ends_at FROM businesses WHERE id = ?').get(businessId) as
        | Record<string, unknown>
        | undefined)
    : undefined;

  const role = String(row.role) as SessionUser['role'];
  const subEndsAt = freshBiz
    ? String(freshBiz.subscription_plan === 'trial' ? freshBiz.trial_ends_at : freshBiz.subscription_ends_at || freshBiz.trial_ends_at)
    : null;

  return {
    id: String(row.id),
    businessId,
    businessName: freshBiz ? String(freshBiz.name) : null,
    businessStatus: freshBiz ? (String(freshBiz.status) as 'active' | 'suspended') : null,
    subscriptionPlan: freshBiz ? (String(freshBiz.subscription_plan) as 'trial' | 'monthly' | 'yearly') : null,
    subscriptionStatus: freshBiz ? (String(freshBiz.subscription_status) as 'trial' | 'active' | 'expired') : null,
    subscriptionEndsAt: subEndsAt,
    role,
    name: String(row.name),
    username: String(row.username || ''),
    email: String(row.email || ''),
    phone: String(row.phone || ''),
    preferredLang: String(row.preferred_lang) === 'en' ? 'en' : 'bn',
    assignedRoleTitle: String(row.assigned_role_title || ''),
    permissions: parsePermissions(String(row.permissions_json || '{}'), role),
    active: Boolean(row.active),
    shopName: String(row.shop_name || ''),
    city: String(row.city || ''),
    address: String(row.address || ''),
    createdAt: String(row.created_at),
  };
}

export function getUserFromRequest(req: express.Request): SessionUser | null {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;
  const decoded = verifySessionToken(token);
  if (!decoded) return null;
  return loadUserById(decoded.uid);
}

export function requireAuth(req: AuthedRequest, res: express.Response, next: express.NextFunction): void {
  const user = getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'অনুগ্রহ করে প্রথমে লগইন করুন / Please sign in first.' });
    return;
  }
  if (user.businessStatus === 'suspended' && user.role !== 'super_admin') {
    res.status(403).json({ error: 'আপনার ব্যবসার অ্যাকাউন্ট সাময়িকভাবে স্থগিত করা হয়েছে / Business account suspended.' });
    return;
  }
  req.user = user;
  next();
}

export function requireRoles(roles: SessionUser['role'][]) {
  return (req: AuthedRequest, res: express.Response, next: express.NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'এই কাজের অনুমতি আপনার নেই / Permission denied.' });
      return;
    }
    next();
  };
}

export function requirePermission(perm: PermissionKey) {
  return (req: AuthedRequest, res: express.Response, next: express.NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'অনুগ্রহ করে প্রথমে লগইন করুন / Please sign in first.' });
      return;
    }
    if (user.role === 'business_owner') {
      next();
      return;
    }
    if (user.role === 'staff' && user.permissions[perm]) {
      next();
      return;
    }
    res.status(403).json({ error: `অনুমতি নেই (${perm}) / Insufficient permission (${perm}).` });
  };
}

export function requireActiveSubscription(req: AuthedRequest, res: express.Response, next: express.NextFunction): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (user.role === 'super_admin') {
    next();
    return;
  }
  if (user.subscriptionStatus === 'expired') {
    res.status(402).json({
      error: 'আপনার সাবস্ক্রিপশনের মেয়াদ শেষ হয়েছে। অনুগ্রহ করে প্ল্যান নবায়ন করুন / Subscription expired. Please renew your plan.',
    });
    return;
  }
  next();
}
