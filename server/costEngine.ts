import type { DatabaseSync } from 'node:sqlite';
import { generateId } from './db.ts';

export type AllocationMethod = 'equal' | 'weight' | 'batch' | 'custom';

export interface BatchAllocationInput {
  batchId: string;
  percentage?: number;
}

export interface BatchFinancialSummary {
  id: string;
  businessId: string;
  batchCode: string;
  category: 'chicken' | 'duck' | 'birds' | 'cattle' | 'goats' | 'sheep' | 'other';
  breed: string;
  initialQuantity: number;
  purchaseDate: string;
  purchasePricePerUnit: number;
  totalPurchaseCost: number;
  supplierId: string | null;
  supplierName: string;
  initialWeightKg: number;
  deathsQuantity: number;
  soldQuantity: number;
  remainingQuantity: number;
  status: 'active' | 'completed' | 'closed';
  notes: string;
  createdBy: string;
  createdAt: string;
  // Cost breakdown
  feedExpenses: number;
  medicineExpenses: number;
  laborExpenses: number;
  transportExpenses: number;
  utilitiesExpenses: number;
  equipmentExpenses: number;
  otherExpenses: number;
  totalAdditionalExpenses: number;
  totalInvestment: number;
  costPerAnimal: number;
  deathFinancialLoss: number;
  // Revenue & Profit
  totalSalesRevenue: number;
  averageSellingPrice: number;
  cogsOfSold: number;
  realizedProfit: number;
  profitPerAnimal: number;
  remainingInventoryValue: number;
  estimatedProfitOnUnsold: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function recomputeBatchQuantities(db: DatabaseSync, batchId: string): { remaining: number; deaths: number; sold: number } {
  const batch = db.prepare('SELECT initial_quantity FROM batches WHERE id = ?').get(batchId) as
    | { initial_quantity: number }
    | undefined;
  if (!batch) throw new Error('ব্যাচ খুঁজে পাওয়া যায়নি / Batch not found.');

  const dRow = db.prepare('SELECT COALESCE(SUM(quantity), 0) as qty FROM batch_deaths WHERE batch_id = ?').get(batchId) as { qty: number };
  const sRow = db.prepare('SELECT COALESCE(SUM(quantity), 0) as qty FROM batch_sales WHERE batch_id = ?').get(batchId) as { qty: number };

  const deaths = Number(dRow.qty);
  const sold = Number(sRow.qty);
  const remaining = Number(batch.initial_quantity) - deaths - sold;

  if (remaining < 0) {
    throw new Error('মজুদ ঋণাত্মক হতে পারবে না / Remaining batch quantity cannot be negative.');
  }

  const nextStatus = remaining === 0 ? 'completed' : 'active';
  db.prepare('UPDATE batches SET deaths_quantity = ?, sold_quantity = ?, remaining_quantity = ?, status = CASE WHEN status = ? THEN status ELSE ? END WHERE id = ?').run(
    deaths,
    sold,
    remaining,
    'closed',
    nextStatus,
    batchId
  );

  return { remaining, deaths, sold };
}

export function allocateExpenseToBatches(
  db: DatabaseSync,
  params: {
    businessId: string;
    expenseId: string;
    totalAmount: number;
    method: AllocationMethod;
    batches: BatchAllocationInput[];
  }
): Array<{ batchId: string; allocatedAmount: number; percentage: number }> {
  const { businessId, expenseId, totalAmount, method, batches } = params;
  if (!batches || batches.length === 0) {
    throw new Error('অন্তত একটি ব্যাচ নির্বাচন করুন / Select at least one animal batch.');
  }
  const cleanTotal = round2(Math.max(0, totalAmount));
  if (cleanTotal <= 0) {
    throw new Error('সঠিক খরচের পরিমাণ দিন (> ০) / Expense amount must be positive.');
  }

  const loadedBatches = batches.map((input) => {
    const row = db
      .prepare('SELECT id, business_id, initial_quantity, remaining_quantity, initial_weight_kg FROM batches WHERE id = ? AND business_id = ?')
      .get(input.batchId, businessId) as
      | { id: string; business_id: string; initial_quantity: number; remaining_quantity: number; initial_weight_kg: number }
      | undefined;
    if (!row) {
      throw new Error('নির্বাচিত ব্যাচ খুঁজে পাওয়া যায়নি / Selected batch does not belong to this business.');
    }
    const livingCount = Number(row.remaining_quantity) > 0 ? Number(row.remaining_quantity) : Number(row.initial_quantity);
    const weightSnapshot = round2(livingCount * Number(row.initial_weight_kg || 1));
    return {
      batchId: row.id,
      animalCount: livingCount,
      weightSnapshot,
      requestedPct: Number(input.percentage ?? 0),
    };
  });

  let weights: number[] = [];

  if (method === 'equal') {
    weights = loadedBatches.map((b) => Math.max(1, b.animalCount));
  } else if (method === 'weight') {
    weights = loadedBatches.map((b) => Math.max(0.01, b.weightSnapshot));
  } else if (method === 'batch') {
    weights = loadedBatches.map(() => 1);
  } else if (method === 'custom') {
    const sumPct = loadedBatches.reduce((acc, b) => acc + b.requestedPct, 0);
    if (Math.abs(sumPct - 100) > 0.1) {
      throw new Error(`কাস্টম শতাংশের যোগফল অবশ্যই ১০০% হতে হবে (বর্তমান: ${round2(sumPct)}%) / Custom percentages must sum to 100%.`);
    }
    if (loadedBatches.some((b) => b.requestedPct < 0)) {
      throw new Error('শতাংশ ঋণাত্মক হতে পারবে না / Percentages cannot be negative.');
    }
    weights = loadedBatches.map((b) => b.requestedPct);
  } else {
    throw new Error('অবৈধ খরচ বণ্টন পদ্ধতি / Invalid allocation method.');
  }

  const totalWeight = weights.reduce((a, w) => a + w, 0);
  if (totalWeight <= 0) {
    throw new Error('বণ্টনের জন্য বৈধ ভিত্তি নেই / Invalid allocation base.');
  }

  const now = new Date().toISOString();
  const results: Array<{ batchId: string; allocatedAmount: number; percentage: number }> = [];
  let runningAllocated = 0;

  for (let i = 0; i < loadedBatches.length; i++) {
    const item = loadedBatches[i];
    const pct = round2((weights[i] / totalWeight) * 100);
    const amount = i === loadedBatches.length - 1 ? round2(cleanTotal - runningAllocated) : round2((cleanTotal * weights[i]) / totalWeight);
    runningAllocated = round2(runningAllocated + amount);

    db.prepare(
      `INSERT INTO expense_allocations (id, business_id, expense_id, batch_id, animal_count_snapshot, weight_kg_snapshot, percentage, allocated_amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(generateId('ealc'), businessId, expenseId, item.batchId, item.animalCount, item.weightSnapshot, pct, amount, now);

    results.push({ batchId: item.batchId, allocatedAmount: amount, percentage: pct });
  }

  return results;
}

export function getBatchCostPerAnimal(db: DatabaseSync, businessId: string, batchId: string): number {
  const b = db.prepare('SELECT initial_quantity, total_purchase_cost FROM batches WHERE id = ? AND business_id = ?').get(batchId, businessId) as
    | { initial_quantity: number; total_purchase_cost: number }
    | undefined;
  if (!b) return 0;
  const expRow = db
    .prepare('SELECT COALESCE(SUM(allocated_amount), 0) as total FROM expense_allocations WHERE batch_id = ? AND business_id = ?')
    .get(batchId, businessId) as { total: number };
  const totalInv = Number(b.total_purchase_cost) + Number(expRow.total);
  return b.initial_quantity > 0 ? round2(totalInv / b.initial_quantity) : 0;
}

export function computeBatchFinancialsList(db: DatabaseSync, businessId: string, batchId?: string): BatchFinancialSummary[] {
  const batchRows = batchId
    ? (db.prepare('SELECT * FROM batches WHERE business_id = ? AND id = ? ORDER BY purchase_date DESC, created_at DESC').all(businessId, batchId) as Record<string, unknown>[])
    : (db.prepare('SELECT * FROM batches WHERE business_id = ? ORDER BY purchase_date DESC, created_at DESC').all(businessId) as Record<string, unknown>[]);

  const allocRows = db
    .prepare(
      `SELECT ea.batch_id, se.category, COALESCE(SUM(ea.allocated_amount), 0) as total
       FROM expense_allocations ea
       JOIN saas_expenses se ON se.id = ea.expense_id
       WHERE ea.business_id = ?
       GROUP BY ea.batch_id, se.category`
    )
    .all(businessId) as Array<{ batch_id: string; category: string; total: number }>;

  const deathRows = db
    .prepare('SELECT batch_id, COALESCE(SUM(financial_loss), 0) as loss FROM batch_deaths WHERE business_id = ? GROUP BY batch_id')
    .all(businessId) as Array<{ batch_id: string; loss: number }>;

  const salesRows = db
    .prepare('SELECT batch_id, COALESCE(SUM(quantity), 0) as qty, COALESCE(SUM(total_revenue), 0) as rev, COALESCE(SUM(cogs_amount), 0) as cogs, COALESCE(SUM(realized_profit), 0) as profit FROM batch_sales WHERE business_id = ? GROUP BY batch_id')
    .all(businessId) as Array<{ batch_id: string; qty: number; rev: number; cogs: number; profit: number }>;

  const allocMap = new Map<string, Record<string, number>>();
  for (const r of allocRows) {
    const cur = allocMap.get(r.batch_id) || {};
    cur[r.category] = round2((cur[r.category] || 0) + Number(r.total));
    allocMap.set(r.batch_id, cur);
  }

  const deathLossMap = new Map<string, number>();
  for (const r of deathRows) {
    deathLossMap.set(r.batch_id, round2(Number(r.loss)));
  }

  const salesMap = new Map<string, { qty: number; rev: number; cogs: number; profit: number }>();
  for (const r of salesRows) {
    salesMap.set(r.batch_id, {
      qty: Number(r.qty),
      rev: round2(Number(r.rev)),
      cogs: round2(Number(r.cogs)),
      profit: round2(Number(r.profit)),
    });
  }

  return batchRows.map((b) => {
    const id = String(b.id);
    const cats = allocMap.get(id) || {};
    const feedExpenses = round2(cats.feed_consumed || 0);
    const medicineExpenses = round2(cats.medicine_consumed || 0);
    const laborExpenses = round2(cats.labor || 0);
    const transportExpenses = round2(cats.transport || 0);
    const utilitiesExpenses = round2(cats.utilities || 0);
    const equipmentExpenses = round2(cats.equipment || 0);
    const otherExpenses = round2(cats.other || 0);

    const totalAdditionalExpenses = round2(
      feedExpenses + medicineExpenses + laborExpenses + transportExpenses + utilitiesExpenses + equipmentExpenses + otherExpenses
    );
    const totalPurchaseCost = round2(Number(b.total_purchase_cost));
    const totalInvestment = round2(totalPurchaseCost + totalAdditionalExpenses);
    const initialQty = Number(b.initial_quantity);
    const costPerAnimal = initialQty > 0 ? round2(totalInvestment / initialQty) : 0;

    const deathFinancialLoss = round2(deathLossMap.get(id) || 0);
    const saleAgg = salesMap.get(id) || { qty: 0, rev: 0, cogs: 0, profit: 0 };
    const soldQuantity = Number(b.sold_quantity);
    const remainingQuantity = Number(b.remaining_quantity);
    const averageSellingPrice = saleAgg.qty > 0 ? round2(saleAgg.rev / saleAgg.qty) : 0;

    // Recompute COGS dynamically using latest costPerAnimal so subsequent expenses also reflect accurately in P&L
    const cogsOfSold = round2(soldQuantity * costPerAnimal);
    const realizedProfit = round2(saleAgg.rev - cogsOfSold - deathFinancialLoss);
    const profitPerAnimal = averageSellingPrice > 0 ? round2(averageSellingPrice - costPerAnimal) : 0;
    const remainingInventoryValue = round2(remainingQuantity * costPerAnimal);
    const estimatedProfitOnUnsold = averageSellingPrice > 0 ? round2(remainingQuantity * (averageSellingPrice - costPerAnimal)) : 0;

    return {
      id,
      businessId: String(b.business_id),
      batchCode: String(b.batch_code),
      category: String(b.category) as BatchFinancialSummary['category'],
      breed: String(b.breed),
      initialQuantity: initialQty,
      purchaseDate: String(b.purchase_date),
      purchasePricePerUnit: round2(Number(b.purchase_price_per_unit)),
      totalPurchaseCost,
      supplierId: b.supplier_id ? String(b.supplier_id) : null,
      supplierName: String(b.supplier_name),
      initialWeightKg: round2(Number(b.initial_weight_kg)),
      deathsQuantity: Number(b.deaths_quantity),
      soldQuantity,
      remainingQuantity,
      status: String(b.status) as BatchFinancialSummary['status'],
      notes: String(b.notes),
      createdBy: String(b.created_by),
      createdAt: String(b.created_at),
      feedExpenses,
      medicineExpenses,
      laborExpenses,
      transportExpenses,
      utilitiesExpenses,
      equipmentExpenses,
      otherExpenses,
      totalAdditionalExpenses,
      totalInvestment,
      costPerAnimal,
      deathFinancialLoss,
      totalSalesRevenue: saleAgg.rev,
      averageSellingPrice,
      cogsOfSold,
      realizedProfit,
      profitPerAnimal,
      remainingInventoryValue,
      estimatedProfitOnUnsold,
    };
  });
}
