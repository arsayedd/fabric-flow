import { cairoToday, addDays } from "@/lib/utils";
import type { Bom, Db, Material, Operation, Order, Product, StockMovement } from "./types";

/* ── أدوات صغيرة ─────────────────────────────────────────────── */

export function unitName(db: Db, unitId: string | null): string {
  return db.units.find((u) => u.id === unitId)?.name ?? "وحدة";
}

export function categoryName(db: Db, categoryId: string | null): string {
  return db.categories.find((c) => c.id === categoryId)?.name ?? "بدون فئة";
}

export function materialById(db: Db, id: string): Material | undefined {
  return db.materials.find((m) => m.id === id);
}

export function productById(db: Db, id: string | null): Product | undefined {
  return id ? db.products.find((p) => p.id === id) : undefined;
}

export function operationById(db: Db, id: string): Operation | undefined {
  return db.operations.find((o) => o.id === id);
}

/* ── دفتر المخزون: الرصيد محسوب من الحركات، مش مخزّن ─────────── */

export function itemMovements(db: Db, itemType: "material" | "product", itemId: string): StockMovement[] {
  return db.stockMovements
    .filter((m) => m.itemType === itemType && m.itemId === itemId)
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : b.date.localeCompare(a.date)));
}

export function stockQty(db: Db, itemType: "material" | "product", itemId: string): number {
  return db.stockMovements
    .filter((m) => m.itemType === itemType && m.itemId === itemId)
    .reduce((s, m) => s + m.qty, 0);
}

/** متوسط الاستهلاك اليومي من حركات الصرف والهالك في آخر 30 يوم */
export function dailyUsage(db: Db, materialId: string, days = 30): number {
  const from = addDays(cairoToday(), -days);
  const used = db.stockMovements
    .filter((m) => m.itemType === "material" && m.itemId === materialId && m.date >= from && (m.kind === "issue" || m.kind === "waste"))
    .reduce((s, m) => s + Math.abs(m.qty), 0);
  return used / days;
}

export type MaterialStock = Material & {
  qty: number;
  value: number;
  perDay: number;
  /** أيام التغطية — كام يوم الخامة دي تكفي */
  daysOfCover: number | null;
  state: "out" | "low" | "ok";
};

export function materialStock(db: Db): MaterialStock[] {
  return db.materials
    .map((m) => {
      const qty = stockQty(db, "material", m.id);
      const perDay = dailyUsage(db, m.id);
      const daysOfCover = perDay > 0 ? qty / perDay : null;
      const low = (m.reorderPoint > 0 && qty <= m.reorderPoint) || (daysOfCover !== null && daysOfCover <= m.leadTimeDays);
      return {
        ...m,
        qty,
        value: qty * m.avgCost,
        perDay,
        daysOfCover,
        state: qty <= 0 ? ("out" as const) : low ? ("low" as const) : ("ok" as const),
      };
    })
    .sort((a, b) => (a.state === b.state ? a.name.localeCompare(b.name, "ar") : rank(a.state) - rank(b.state)));
}

function rank(s: MaterialStock["state"]): number {
  return s === "out" ? 0 : s === "low" ? 1 : 2;
}

/** كمية الشراء المقترحة = استهلاك مدة التوريد + مخزون أمان أسبوع − المتاح */
export function suggestedPurchase(row: MaterialStock): number {
  const need = row.perDay * (row.leadTimeDays + 7);
  const target = Math.max(need, row.reorderPoint);
  return Math.max(0, Math.ceil(target - row.qty));
}

/* ── قوائم الخامات والتكلفة ──────────────────────────────────── */

export function activeBom(db: Db, productId: string): Bom | undefined {
  const list = db.boms.filter((b) => b.productId === productId);
  return list.find((b) => b.status === "active") ?? list.sort((a, b) => b.version - a.version)[0];
}

export type BomLine = {
  id: string;
  materialId: string;
  name: string;
  unit: string;
  qtyPerUnit: number;
  wastePct: number;
  /** الكمية الفعلية المطلوبة بعد الهالك */
  effectiveQty: number;
  unitCost: number;
  lineCost: number;
};

export function bomLines(db: Db, bomId: string | null | undefined): BomLine[] {
  if (!bomId) return [];
  return db.bomItems
    .filter((i) => i.bomId === bomId)
    .map((i) => {
      const m = materialById(db, i.materialId);
      const effectiveQty = i.qtyPerUnit * (1 + i.wastePct / 100);
      const unitCost = m?.avgCost ?? 0;
      return {
        id: i.id,
        materialId: i.materialId,
        name: m?.name ?? "خامة محذوفة",
        unit: unitName(db, m?.unitId ?? null),
        qtyPerUnit: i.qtyPerUnit,
        wastePct: i.wastePct,
        effectiveQty,
        unitCost,
        lineCost: effectiveQty * unitCost,
      };
    });
}

export type RoutingLine = {
  id: string;
  operationId: string;
  name: string;
  seq: number;
  rate: number;
  stdMinutes: number;
  isOutsourced: boolean;
};

export function routingLines(db: Db, productId: string): RoutingLine[] {
  return db.routingSteps
    .filter((r) => r.productId === productId)
    .sort((a, b) => a.seq - b.seq)
    .map((r) => {
      const o = operationById(db, r.operationId);
      return {
        id: r.id,
        operationId: r.operationId,
        name: o?.name ?? "عملية محذوفة",
        seq: r.seq,
        rate: r.rate,
        stdMinutes: r.stdMinutes,
        isOutsourced: o?.isOutsourced ?? false,
      };
    });
}

export type ProductCost = {
  materials: number;
  labor: number;
  overhead: number;
  total: number;
  sellPrice: number;
  profit: number;
  margin: number;
  minutes: number;
  hasBom: boolean;
  hasRouting: boolean;
};

/** تكلفة القطعة = خامات (بالهالك) + عمليات + أوفرهيد */
export function productCost(db: Db, productId: string): ProductCost {
  const product = productById(db, productId);
  const bom = activeBom(db, productId);
  const lines = bomLines(db, bom?.id);
  const routes = routingLines(db, productId);
  const materials = lines.reduce((s, l) => s + l.lineCost, 0);
  const labor = routes.reduce((s, r) => s + r.rate, 0);
  const overhead = db.settings?.overheadPerUnit ?? 0;
  const total = materials + labor + overhead;
  const sellPrice = product?.sellPrice ?? 0;
  return {
    materials,
    labor,
    overhead,
    total,
    sellPrice,
    profit: sellPrice - total,
    margin: sellPrice > 0 ? ((sellPrice - total) / sellPrice) * 100 : 0,
    minutes: routes.reduce((s, r) => s + r.stdMinutes, 0),
    hasBom: lines.length > 0,
    hasRouting: routes.length > 0,
  };
}

/* ── أوامر الإنتاج ───────────────────────────────────────────── */

export type Requirement = {
  materialId: string;
  name: string;
  unit: string;
  required: number;
  issued: number;
  remaining: number;
  available: number;
  shortage: number;
  unitCost: number;
};

/** احتياج أمر الإنتاج من الخامات، والمصروف منها فعليًا، والعجز */
export function orderRequirements(db: Db, order: Order): Requirement[] {
  const bomId = order.bomId ?? (order.productId ? activeBom(db, order.productId)?.id : null);
  return bomLines(db, bomId).map((l) => {
    const required = l.effectiveQty * order.quantity;
    const issued = db.stockMovements
      .filter((m) => m.refType === "order" && m.refId === order.id && m.itemId === l.materialId && m.kind === "issue")
      .reduce((s, m) => s + Math.abs(m.qty), 0);
    const remaining = Math.max(0, required - issued);
    const available = stockQty(db, "material", l.materialId);
    return {
      materialId: l.materialId,
      name: l.name,
      unit: l.unit,
      required,
      issued,
      remaining,
      available,
      shortage: Math.max(0, remaining - available),
      unitCost: l.unitCost,
    };
  });
}

export type StageRow = {
  operationId: string;
  name: string;
  seq: number;
  rate: number;
  good: number;
  rework: number;
  scrap: number;
  pct: number;
  earnings: number;
};

/** متابعة المراحل بالكميات — مش نسبة مكتوبة بالإيد */
export function orderStages(db: Db, order: Order): StageRow[] {
  const routes = order.productId ? routingLines(db, order.productId) : [];
  const entries = db.stageEntries.filter((e) => e.orderId === order.id);
  const source = routes.length
    ? routes
    : [...new Set(entries.map((e) => e.operationId))].map((id, i) => ({
        id,
        operationId: id,
        name: operationById(db, id)?.name ?? "عملية",
        seq: i + 1,
        rate: 0,
        stdMinutes: 0,
        isOutsourced: false,
      }));

  return source.map((r) => {
    const own = entries.filter((e) => e.operationId === r.operationId);
    const good = own.reduce((s, e) => s + e.qtyGood, 0);
    return {
      operationId: r.operationId,
      name: r.name,
      seq: r.seq,
      rate: r.rate,
      good,
      rework: own.reduce((s, e) => s + e.qtyRework, 0),
      scrap: own.reduce((s, e) => s + e.qtyScrap, 0),
      pct: order.quantity > 0 ? Math.min(100, (good / order.quantity) * 100) : 0,
      earnings: own.reduce((s, e) => s + e.qtyGood * e.rate, 0),
    };
  });
}

/** نسبة الإنجاز المحسوبة = كمية آخر مرحلة ÷ كمية الأمر */
export function computedProgress(db: Db, order: Order): number | null {
  const stages = orderStages(db, order);
  if (!stages.length || order.quantity <= 0) return null;
  const last = stages[stages.length - 1];
  return Math.round(Math.min(100, (last.good / order.quantity) * 100));
}

export type OrderCost = {
  estMaterials: number;
  estLabor: number;
  estOverhead: number;
  estTotal: number;
  actMaterials: number;
  actLabor: number;
  actOverhead: number;
  actTotal: number;
  revenue: number;
  variance: number;
};

/** المتوقع من الـBOM مقابل الفعلي من الخامات المصروفة والأجور المسجّلة */
export function orderCost(db: Db, order: Order): OrderCost {
  const reqs = orderRequirements(db, order);
  const estMaterials = reqs.reduce((s, r) => s + r.required * r.unitCost, 0);
  const routes = order.productId ? routingLines(db, order.productId) : [];
  const estLabor = routes.reduce((s, r) => s + r.rate, 0) * order.quantity;
  const overheadRate = db.settings?.overheadPerUnit ?? 0;
  const estOverhead = overheadRate * order.quantity;

  const actMaterials = db.stockMovements
    .filter((m) => m.refType === "order" && m.refId === order.id && (m.kind === "issue" || m.kind === "waste"))
    .reduce((s, m) => s + Math.abs(m.qty) * m.unitCost, 0);
  const actLabor = db.stageEntries
    .filter((e) => e.orderId === order.id)
    .reduce((s, e) => s + e.qtyGood * e.rate, 0);
  const done = orderStages(db, order).slice(-1)[0]?.good ?? 0;
  const actOverhead = overheadRate * done;

  const estTotal = estMaterials + estLabor + estOverhead;
  const actTotal = actMaterials + actLabor + actOverhead;
  return {
    estMaterials,
    estLabor,
    estOverhead,
    estTotal,
    actMaterials,
    actLabor,
    actOverhead,
    actTotal,
    revenue: order.piecePrice * order.quantity,
    variance: actTotal - estTotal,
  };
}

/** الاختناق: المرحلة اللي فيها أكبر فرق بين اللي دخلها واللي خرج منها */
export function bottleneck(db: Db, order: Order): StageRow | null {
  const stages = orderStages(db, order);
  if (stages.length < 2) return null;
  let worst: StageRow | null = null;
  let gap = 0;
  for (let i = 1; i < stages.length; i++) {
    const d = stages[i - 1].good - stages[i].good;
    if (d > gap) {
      gap = d;
      worst = stages[i];
    }
  }
  return gap > 0 ? worst : null;
}
