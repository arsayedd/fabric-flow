/**
 * صنعة — محرك التكلفة والربحية (M-C1)
 *
 * القواعد الحاكمة، نفس قواعد طبقتي الذكاء والتخطيط:
 *  1) **مفيش تكلفة بتتخزَّن.** كل رقم بيتحسب وقت العرض من قائمة الخامات ومسار العمليات
 *     ودفتر المخزون وحركات الإنتاج. فلو سعر متر القماش اتغيّر، تكلفة كل موديل بيستخدمه
 *     تتغيّر في نفس اللحظة — من غير إعادة إدخال ومن غير زر «أعد الحساب».
 *  2) **اللي بيتخزّن قرارات بس**: سعر البيع، وهامش الهدف. والباقي نتيجة حساب.
 *  3) **الرقم اللي مالوش بيانات مبيتخمّنش.** الموديل اللي مالوش قائمة خامات أو مسار
 *     عمليات بيتقال عليه كده صريح، والمؤشر اللي بياناته ناقصة بيتشال من الحساب
 *     ووزنه بيتوزّع على الباقي.
 *  4) **كل رقم Explainable**: أي سطر تكلفة بيقول اتكوّن من إيه، وأي فرق بيقول سببه.
 */

import { cairoToday, addDays, daysBetween } from "@/lib/utils";
import {
  activeBom,
  bomLines,
  categoryName,
  operationById,
  orderStages,
  productById,
  routingLines,
  stockQty,
} from "./manufacturing";
import type { Db, Order, Product } from "./types";

/* ── قرار الهامش المستهدف ────────────────────────────────────── */

export const DEFAULT_TARGET_MARGIN = 40;

export function targetMarginOf(db: Db): number {
  const v = db.settings?.targetMarginPct;
  return typeof v === "number" && v > 0 && v < 100 ? v : DEFAULT_TARGET_MARGIN;
}

/* ── ورقة تكلفة الموديل ──────────────────────────────────────── */

export type CostLineKind = "material" | "waste" | "operation" | "outsourced" | "overhead";

export type CostLine = {
  key: string;
  label: string;
  kind: CostLineKind;
  amount: number;
  sharePct: number;
  detail: string;
};

export type CostSheet = {
  product: Product | undefined;
  lines: CostLine[];
  materials: number;
  waste: number;
  labor: number;
  outsourced: number;
  overhead: number;
  total: number;
  sellPrice: number;
  priceKnown: boolean;
  profit: number;
  marginPct: number | null;
  markup: number | null;
  /** سعر التعادل = تكلفة القطعة بالكامل */
  breakEven: number;
  /** أقل سعر يحقّق هامش الهدف */
  minPrice: number;
  targetMarginPct: number;
  targetCost: number | null;
  /** التكلفة أعلى من الهدف بنسبة كام */
  overTargetPct: number | null;
  minutes: number;
  hasBom: boolean;
  hasRouting: boolean;
  biggest: CostLine | null;
  missing: string[];
};

/**
 * بنود الورقة بتتولّد من بيانات المصنع نفسها: الخامات بتتجمّع بفئتها
 * (أقمشة، إكسسوار، تغليف… أو أي فئات المصنع عرّفها)، وكل عملية في المسار سطر
 * لوحدها (قص، خياطة، مكوى، طباعة، تطريز…). مفيش بنود متشرّبة في الكود،
 * عشان صنعة مش للملابس بس.
 */
export function costSheet(db: Db, productId: string): CostSheet {
  const product = productById(db, productId);
  const bom = activeBom(db, productId);
  const lines = bomLines(db, bom?.id);
  const routes = routingLines(db, productId);
  const overhead = db.settings?.overheadPerUnit ?? 0;
  const targetMarginPct = targetMarginOf(db);

  const byCategory = new Map<string, { amount: number; parts: string[] }>();
  let wasteAmount = 0;
  const wasteParts: string[] = [];

  for (const l of lines) {
    const material = db.materials.find((m) => m.id === l.materialId);
    const label = categoryName(db, material?.categoryId ?? null);
    const base = l.qtyPerUnit * l.unitCost;
    const extra = (l.effectiveQty - l.qtyPerUnit) * l.unitCost;
    const row = byCategory.get(label) ?? { amount: 0, parts: [] };
    row.amount += base;
    row.parts.push(`${l.name} ${round(l.qtyPerUnit)} ${l.unit} × ${round(l.unitCost)} ج`);
    byCategory.set(label, row);
    if (extra > 0) {
      wasteAmount += extra;
      wasteParts.push(`${l.name} هالك ${round(l.wastePct)}٪`);
    }
  }

  const costLines: CostLine[] = [];
  for (const [label, row] of byCategory) {
    costLines.push({ key: `mat:${label}`, label, kind: "material", amount: row.amount, sharePct: 0, detail: row.parts.join(" · ") });
  }
  if (wasteAmount > 0) {
    costLines.push({
      key: "waste",
      label: "الهالك المخطط",
      kind: "waste",
      amount: wasteAmount,
      sharePct: 0,
      detail: wasteParts.join(" · "),
    });
  }
  for (const r of routes) {
    costLines.push({
      key: `op:${r.id}`,
      label: r.name,
      kind: r.isOutsourced ? "outsourced" : "operation",
      amount: r.rate,
      sharePct: 0,
      detail: r.isOutsourced ? `تشغيل خارجي · ${round(r.stdMinutes)} دقيقة` : `${round(r.stdMinutes)} دقيقة معيارية`,
    });
  }
  if (overhead > 0) {
    costLines.push({
      key: "overhead",
      label: "أوفرهيد",
      kind: "overhead",
      amount: overhead,
      sharePct: 0,
      detail: "نصيب القطعة من مصاريف المصنع الثابتة",
    });
  }

  const materials = costLines.filter((l) => l.kind === "material").reduce((s, l) => s + l.amount, 0);
  const labor = costLines.filter((l) => l.kind === "operation").reduce((s, l) => s + l.amount, 0);
  const outsourced = costLines.filter((l) => l.kind === "outsourced").reduce((s, l) => s + l.amount, 0);
  const total = materials + wasteAmount + labor + outsourced + overhead;
  for (const l of costLines) l.sharePct = total > 0 ? (l.amount / total) * 100 : 0;
  costLines.sort((a, b) => b.amount - a.amount);

  const sellPrice = product?.sellPrice ?? 0;
  const priceKnown = sellPrice > 0;
  const profit = sellPrice - total;
  const missing: string[] = [];
  if (!lines.length) missing.push("قائمة خامات الموديل");
  if (!routes.length) missing.push("مسار العمليات وسعر كل عملية");
  if (!priceKnown) missing.push("سعر البيع");
  if (overhead <= 0) missing.push("نصيب القطعة من الأوفرهيد");

  return {
    product,
    lines: costLines,
    materials,
    waste: wasteAmount,
    labor,
    outsourced,
    overhead,
    total,
    sellPrice,
    priceKnown,
    profit,
    marginPct: priceKnown ? (profit / sellPrice) * 100 : null,
    markup: total > 0 && priceKnown ? sellPrice / total : null,
    breakEven: total,
    minPrice: total / (1 - targetMarginPct / 100),
    targetMarginPct,
    targetCost: priceKnown ? sellPrice * (1 - targetMarginPct / 100) : null,
    overTargetPct: priceKnown && sellPrice > 0 ? ((total - sellPrice * (1 - targetMarginPct / 100)) / (sellPrice * (1 - targetMarginPct / 100))) * 100 : null,
    minutes: routes.reduce((s, r) => s + r.stdMinutes, 0),
    hasBom: lines.length > 0,
    hasRouting: routes.length > 0,
    biggest: costLines[0] ?? null,
    missing,
  };
}

/* ── كميات الموديل: إنتاج، بيع، متبقي ────────────────────────── */

export type ModelVolume = {
  orders: Order[];
  plannedQty: number;
  producedQty: number;
  scrapQty: number;
  reworkQty: number;
  /** الكمية المباعة — من التوريدات المطابقة لاسم الموديل */
  soldQty: number;
  soldRevenue: number;
  /** التوريدات لسه مش مربوطة بالمنتج بمفتاح، فالمطابقة بالاسم */
  soldByName: boolean;
  stock: number;
  remaining: number;
};

export function modelVolume(db: Db, productId: string): ModelVolume {
  const product = productById(db, productId);
  const orders = db.orders.filter((o) => o.productId === productId);
  let produced = 0;
  let scrap = 0;
  let rework = 0;
  for (const o of orders) {
    const stages = orderStages(db, o);
    produced += stages.length ? stages[stages.length - 1].good : 0;
    scrap += stages.reduce((s, x) => s + x.scrap, 0);
    rework += stages.reduce((s, x) => s + x.rework, 0);
  }
  const name = product?.name?.trim() ?? "";
  const matched = name ? db.deliveries.filter((d) => d.model.trim() === name) : [];
  const soldQty = matched.reduce((s, d) => s + (d.quantity ?? 0), 0);

  return {
    orders,
    plannedQty: orders.reduce((s, o) => s + o.quantity, 0),
    producedQty: produced,
    scrapQty: scrap,
    reworkQty: rework,
    soldQty,
    soldRevenue: matched.reduce((s, d) => s + d.amount, 0),
    soldByName: matched.length > 0,
    stock: stockQty(db, "product", productId),
    remaining: Math.max(0, produced - soldQty),
  };
}

/* ── الفعلي مقابل المتوقع لأمر الإنتاج ───────────────────────── */

export type VarianceReason = { label: string; amount: number; why: string };

export type OrderProfit = {
  order: Order;
  produced: number;
  scrap: number;
  rework: number;
  /** متوقع للقطعة من ورقة التكلفة */
  estPerPiece: number;
  estTotal: number;
  /** فعلي: خامات مصروفة + أجور مسجّلة + أوفرهيد على المنتَج */
  actMaterials: number;
  /** الكمية اللي الخامات اتصرفت عليها — أكبر من المنتَج لو الصرف كان للأمر كله */
  materialBaseQty: number;
  actLabor: number;
  actOverhead: number;
  actTotal: number;
  actPerPiece: number | null;
  variance: number;
  variancePct: number | null;
  revenue: number;
  profit: number;
  marginPct: number | null;
  reasons: VarianceReason[];
  hasActuals: boolean;
};

/**
 * الكمية اللي الخامات اتصرفت عليها فعلًا. لو خامات الأمر اتصرفت كلها مرة واحدة،
 * المقارنة لازم تكون على كمية الأمر — وإلا الخامة اللي لسه في الشغل تبان هالك.
 */
function materialBase(order: Order, produced: number): number {
  return order.materialsIssuedAt ? order.quantity : produced || order.quantity;
}

export function orderProfit(db: Db, order: Order): OrderProfit {
  const sheet = order.productId ? costSheet(db, order.productId) : null;
  const stages = orderStages(db, order);
  const produced = stages.length ? stages[stages.length - 1].good : 0;
  const scrap = stages.reduce((s, x) => s + x.scrap, 0);
  const rework = stages.reduce((s, x) => s + x.rework, 0);
  const overheadRate = db.settings?.overheadPerUnit ?? 0;

  const estPerPiece = sheet?.total ?? order.pieceCost;
  const estTotal = estPerPiece * order.quantity;

  const moves = db.stockMovements.filter((m) => m.refType === "order" && m.refId === order.id);
  const actMaterials = moves
    .filter((m) => m.kind === "issue" || m.kind === "waste")
    .reduce((s, m) => s + Math.abs(m.qty) * m.unitCost, 0);
  const actLabor = db.stageEntries.filter((e) => e.orderId === order.id).reduce((s, e) => s + e.qtyGood * e.rate, 0);
  const actOverhead = overheadRate * produced;
  const matBase = materialBase(order, produced);
  // الخامات اتصرفت للأمر كله، فاللي خلّص يتحمّل نصيبه بس — الباقي لسه في الشغل
  const matShare = matBase > 0 && produced > 0 ? Math.min(1, produced / matBase) : 1;
  const actMaterialsOnProduced = actMaterials * matShare;
  const actTotal = actMaterialsOnProduced + actLabor + actOverhead;
  const revenue = order.piecePrice * produced;

  /* أسباب الفرق — كل سبب برقمه، مش تفسير عام */
  const reasons: VarianceReason[] = [];
  if (sheet && order.productId) {
    const lines = bomLines(db, order.bomId ?? activeBom(db, order.productId)?.id);
    for (const l of lines) {
      const issued = moves
        .filter((m) => m.itemId === l.materialId && m.kind === "issue")
        .reduce((s, m) => s + Math.abs(m.qty), 0);
      const wasted = moves
        .filter((m) => m.itemId === l.materialId && m.kind === "waste")
        .reduce((s, m) => s + Math.abs(m.qty), 0);
      if (!issued && !wasted) continue;
      const expected = l.effectiveQty * matBase;
      const over = issued - expected;
      if (over > 0.01) {
        reasons.push({
          label: `استهلاك زيادة في ${l.name}`,
          amount: over * l.unitCost,
          why: `المصروف ${round(issued)} ${l.unit} والمخطط ${round(expected)} ${l.unit} لـ${round(matBase)} قطعة`,
        });
      }
      if (wasted > 0.01) {
        reasons.push({
          label: `هالك ${l.name}`,
          amount: wasted * l.unitCost,
          why: `${round(wasted)} ${l.unit} اتسجلت هالك فوق الهالك المخطط في قائمة الخامات`,
        });
      }
      const issuedCost = moves
        .filter((m) => m.itemId === l.materialId && m.kind === "issue")
        .reduce((s, m) => s + Math.abs(m.qty) * m.unitCost, 0);
      const priceDiff = issued > 0 ? issuedCost / issued - l.unitCost : 0;
      if (Math.abs(priceDiff) > 0.01 && issued > 0) {
        reasons.push({
          label: `سعر ${l.name} وقت الصرف`,
          amount: priceDiff * issued,
          why: `اتصرفت بـ${round(issuedCost / issued)} ج للوحدة، والتكلفة الحالية ${round(l.unitCost)} ج`,
        });
      }
    }

    const stdLabor = routingLines(db, order.productId).reduce((s, r) => s + r.rate, 0);
    const laborDiff = actLabor - stdLabor * produced;
    if (Math.abs(laborDiff) > 1 && produced > 0) {
      reasons.push({
        label: laborDiff > 0 ? "أجور أعلى من المعياري" : "أجور أقل من المعياري",
        amount: laborDiff,
        why: `المسجّل ${round(actLabor)} ج على ${round(produced)} قطعة، والمعياري ${round(stdLabor)} ج للقطعة`,
      });
    }
    if (rework > 0) {
      const reworkCost = db.stageEntries
        .filter((e) => e.orderId === order.id && e.qtyRework > 0)
        .reduce((s, e) => s + e.qtyRework * e.rate, 0);
      reasons.push({
        label: "إعادة تشغيل",
        amount: reworkCost,
        why: `${round(rework)} قطعة رجعت تتصلّح — دي تكلفة جودة رديئة مش تكلفة إنتاج`,
      });
    }
    if (scrap > 0) {
      reasons.push({
        label: "قطع مرفوضة",
        amount: scrap * (sheet.materials + sheet.waste),
        why: `${round(scrap)} قطعة اترفضت وخاماتها اتحمّلت على الأمر`,
      });
    }
  }
  reasons.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  return {
    order,
    produced,
    scrap,
    rework,
    estPerPiece,
    estTotal,
    actMaterials: actMaterialsOnProduced,
    materialBaseQty: matBase,
    actLabor,
    actOverhead,
    actTotal,
    actPerPiece: produced > 0 ? actTotal / produced : null,
    variance: actTotal - estPerPiece * (produced || order.quantity),
    variancePct:
      estPerPiece > 0 && (produced || order.quantity) > 0
        ? ((actTotal - estPerPiece * (produced || order.quantity)) / (estPerPiece * (produced || order.quantity))) * 100
        : null,
    revenue,
    profit: revenue - actTotal,
    marginPct: revenue > 0 ? ((revenue - actTotal) / revenue) * 100 : null,
    reasons,
    hasActuals: moves.length > 0 || actLabor > 0,
  };
}

/** ربحية أوامر الموديل مجمّعة */
export function modelOrderProfits(db: Db, productId: string): OrderProfit[] {
  return db.orders.filter((o) => o.productId === productId).map((o) => orderProfit(db, o));
}

/* ── تاريخ التكلفة — من أسعار الشراء الحقيقية ────────────────── */

export type CostPoint = { date: string; materials: number; total: number; changed: string };

/**
 * التكلفة التاريخية مش مخزَّنة، بتتعاد بناءً على المتوسط المرجّح لأسعار الشراء
 * لحد كل تاريخ. فلو سعر خامة طلع، بيبان في السلسلة إمتى وبكام.
 */
export function costHistory(db: Db, productId: string): CostPoint[] {
  const lines = bomLines(db, activeBom(db, productId)?.id);
  if (!lines.length) return [];
  const routes = routingLines(db, productId);
  const labor = routes.reduce((s, r) => s + r.rate, 0);
  const overhead = db.settings?.overheadPerUnit ?? 0;

  const ins = db.stockMovements
    .filter(
      (m) =>
        m.itemType === "material" &&
        lines.some((l) => l.materialId === m.itemId) &&
        (m.kind === "purchase" || m.kind === "opening") &&
        m.qty > 0,
    )
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
  if (!ins.length) return [];

  const running = new Map<string, { qty: number; value: number }>();
  const points: CostPoint[] = [];
  let lastTotal: number | null = null;

  for (const m of ins) {
    const cur = running.get(m.itemId) ?? { qty: 0, value: 0 };
    const before = cur.qty > 0 ? cur.value / cur.qty : null;
    cur.qty += m.qty;
    cur.value += m.qty * m.unitCost;
    running.set(m.itemId, cur);
    const after = cur.value / cur.qty;

    const materials = lines.reduce((s, l) => {
      const r = running.get(l.materialId);
      const unit = r && r.qty > 0 ? r.value / r.qty : l.unitCost;
      return s + l.effectiveQty * unit;
    }, 0);
    const total = materials + labor + overhead;
    if (lastTotal !== null && Math.abs(total - lastTotal) < 0.01) continue;

    const name = db.materials.find((x) => x.id === m.itemId)?.name ?? "خامة";
    points.push({
      date: m.date,
      materials,
      total,
      changed:
        before === null
          ? `أول سعر مسجّل لـ${name}: ${round(after)} ج`
          : `${name} من ${round(before)} لـ${round(after)} ج`,
    });
    lastTotal = total;
  }

  return points;
}

/* ── ذكاء الهالك ─────────────────────────────────────────────── */

export type WasteRow = {
  materialId: string;
  name: string;
  unit: string;
  issued: number;
  expected: number;
  waste: number;
  wastePct: number;
  plannedPct: number;
  cost: number;
};

export type WasteIntel = {
  rows: WasteRow[];
  cost: number;
  scrapQty: number;
  scrapPct: number | null;
  reworkQty: number;
  hasData: boolean;
};

export function wasteIntel(db: Db, productId: string): WasteIntel {
  const lines = bomLines(db, activeBom(db, productId)?.id);
  const vol = modelVolume(db, productId);
  const orderIds = vol.orders.map((o) => o.id);
  const moves = db.stockMovements.filter((m) => m.refType === "order" && orderIds.includes(m.refId ?? ""));
  const base = vol.producedQty || 0;
  // المقارنة على الكمية اللي الخامات اتصرفت عليها، مش على اللي خلّص لحد دلوقتي
  const matBase = vol.orders.reduce((s, o) => {
    const stages = orderStages(db, o);
    return s + materialBase(o, stages.length ? stages[stages.length - 1].good : 0);
  }, 0);

  const rows: WasteRow[] = lines
    .map((l) => {
      const issued = moves
        .filter((m) => m.itemId === l.materialId && (m.kind === "issue" || m.kind === "waste"))
        .reduce((s, m) => s + Math.abs(m.qty), 0);
      const expected = l.qtyPerUnit * matBase;
      const waste = issued - expected;
      return {
        materialId: l.materialId,
        name: l.name,
        unit: l.unit,
        issued,
        expected,
        waste,
        wastePct: expected > 0 ? (waste / expected) * 100 : 0,
        plannedPct: l.wastePct,
        cost: waste > 0 ? waste * l.unitCost : 0,
      };
    })
    .filter((r) => r.issued > 0)
    .sort((a, b) => b.cost - a.cost);

  return {
    rows,
    cost: rows.reduce((s, r) => s + r.cost, 0),
    scrapQty: vol.scrapQty,
    scrapPct: base > 0 ? (vol.scrapQty / (base + vol.scrapQty)) * 100 : null,
    reworkQty: vol.reworkQty,
    hasData: rows.length > 0 && base > 0,
  };
}

/* ── سكور ربحية الموديل ──────────────────────────────────────── */

export type ProfitBlockKey = "margin" | "demand" | "waste" | "consumption" | "speed" | "returns";

export const PROFIT_LABEL: Record<ProfitBlockKey, string> = {
  margin: "الربحية",
  demand: "الطلب على الموديل",
  waste: "الهالك",
  consumption: "استهلاك الخامات",
  speed: "سرعة الإنتاج",
  returns: "المرتجعات",
};

export const PROFIT_WEIGHTS: Record<ProfitBlockKey, number> = {
  margin: 30,
  demand: 20,
  waste: 15,
  consumption: 15,
  speed: 10,
  returns: 10,
};

export type ProfitBlock = {
  key: ProfitBlockKey;
  label: string;
  weight: number;
  value: number | null;
  why: string;
  missing: string | null;
};

export type ProfitScore = {
  total: number | null;
  blocks: ProfitBlock[];
  /** نسبة الأوزان اللي فيها بيانات فعلًا */
  coverage: number;
  verdict: "expand" | "improve" | "stop" | null;
  verdictLabel: string;
  up: ProfitBlock[];
  down: ProfitBlock[];
};

export const VERDICT: Record<"expand" | "improve" | "stop", { label: string; tone: "ok" | "warn" | "danger" }> = {
  expand: { label: "موديل ممتاز للتوسّع", tone: "ok" },
  improve: { label: "يحتاج تحسين", tone: "warn" },
  stop: { label: "يفضل إيقافه أو إعادة تسعيره", tone: "danger" },
};

export function profitScore(db: Db, productId: string): ProfitScore {
  const sheet = costSheet(db, productId);
  const waste = wasteIntel(db, productId);
  const blocks: ProfitBlock[] = [];

  // ١) الربحية مقابل هامش الهدف
  if (sheet.priceKnown && sheet.hasBom) {
    const ratio = (sheet.marginPct ?? 0) / sheet.targetMarginPct;
    blocks.push({
      key: "margin",
      label: PROFIT_LABEL.margin,
      weight: PROFIT_WEIGHTS.margin,
      value: clamp(ratio * 80),
      why: `هامش ${round(sheet.marginPct ?? 0)}٪ والهدف ${round(sheet.targetMarginPct)}٪`,
      missing: null,
    });
  } else {
    blocks.push(missingBlock("margin", sheet.priceKnown ? "قائمة خامات الموديل" : "سعر بيع الموديل"));
  }

  // ٢) الطلب: كميات آخر سنة مقارنة بباقي الموديلات
  const demand = productDemand(db, productId);
  const peers = db.products.map((p) => productDemand(db, p.id).year).filter((v) => v > 0);
  if (demand.year > 0 && peers.length >= 2) {
    const rank = peers.filter((v) => v < demand.year).length / (peers.length - 1);
    const trend = demand.prev > 0 ? demand.year / demand.prev : null;
    blocks.push({
      key: "demand",
      label: PROFIT_LABEL.demand,
      weight: PROFIT_WEIGHTS.demand,
      value: clamp(rank * 100 * 0.7 + (trend === null ? 30 : clamp((trend - 0.5) * 60) * 0.3)),
      why: `${round(demand.year)} قطعة في أوامر آخر سنة${demand.prev > 0 ? ` مقابل ${round(demand.prev)} السنة اللي قبلها` : ""}`,
      missing: null,
    });
  } else {
    blocks.push(missingBlock("demand", demand.year > 0 ? "موديلات تانية للمقارنة" : "أوامر إنتاج للموديل"));
  }

  // ٣) الهالك الفعلي مقابل المخطط
  if (waste.hasData) {
    const worst = waste.rows[0];
    const planned = worst.plannedPct;
    const actual = worst.wastePct;
    blocks.push({
      key: "waste",
      label: PROFIT_LABEL.waste,
      weight: PROFIT_WEIGHTS.waste,
      value: clamp(actual <= planned ? 100 : 100 - (actual - planned) * 6),
      why: `${worst.name}: هالك فعلي ${round(actual)}٪ والمخطط ${round(planned)}٪`,
      missing: null,
    });
  } else {
    blocks.push(missingBlock("waste", "صرف خامات على أوامر الموديل"));
  }

  // ٤) الاستهلاك الكلي: الفعلي مقابل قائمة الخامات
  const profits = modelOrderProfits(db, productId).filter((p) => p.hasActuals && p.produced > 0);
  if (profits.length) {
    const act = profits.reduce((s, p) => s + p.actMaterials, 0);
    const exp = profits.reduce((s, p) => s + (sheet.materials + sheet.waste) * p.produced, 0);
    const ratio = exp > 0 ? act / exp : 1;
    blocks.push({
      key: "consumption",
      label: PROFIT_LABEL.consumption,
      weight: PROFIT_WEIGHTS.consumption,
      value: clamp(ratio <= 1 ? 100 : 100 - (ratio - 1) * 300),
      why: `خامات فعلية ${round(act)} ج مقابل ${round(exp)} ج مخططة على ${round(profits.reduce((s, p) => s + p.produced, 0))} قطعة`,
      missing: null,
    });
  } else {
    blocks.push(missingBlock("consumption", "أوامر منتَجة بخامات مصروفة"));
  }

  // ٥) السرعة: الزمن المعياري مقارنة بباقي الموديلات
  const minutesPeers = db.products
    .map((p) => costSheet(db, p.id).minutes)
    .filter((v) => v > 0);
  if (sheet.minutes > 0 && minutesPeers.length >= 2) {
    const slower = minutesPeers.filter((v) => v > sheet.minutes).length;
    blocks.push({
      key: "speed",
      label: PROFIT_LABEL.speed,
      weight: PROFIT_WEIGHTS.speed,
      value: clamp((slower / (minutesPeers.length - 1)) * 100),
      why: `${round(sheet.minutes)} دقيقة للقطعة، ومتوسط باقي الموديلات ${round(avg(minutesPeers))} دقيقة`,
      missing: null,
    });
  } else {
    blocks.push(missingBlock("speed", sheet.minutes > 0 ? "موديلات تانية للمقارنة" : "زمن معياري في مسار العمليات"));
  }

  // ٦) المرتجعات: مفيش تسجيل مرتجعات في النظام لسه
  blocks.push(missingBlock("returns", "تسجيل المرتجعات (موديول البيع والتسليم)"));

  const scored = blocks.filter((b) => b.value !== null);
  const weight = scored.reduce((s, b) => s + b.weight, 0);
  const allWeight = blocks.reduce((s, b) => s + b.weight, 0);
  const total = weight > 0 ? Math.round(scored.reduce((s, b) => s + (b.value ?? 0) * b.weight, 0) / weight) : null;
  const verdict = total === null ? null : total >= 75 ? "expand" : total >= 50 ? "improve" : "stop";

  return {
    total,
    blocks,
    coverage: allWeight > 0 ? (weight / allWeight) * 100 : 0,
    verdict,
    verdictLabel: verdict ? VERDICT[verdict].label : "البيانات لسه مش كفاية",
    up: scored.filter((b) => (b.value ?? 0) >= 70).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
    down: scored.filter((b) => (b.value ?? 0) < 55).sort((a, b) => (a.value ?? 0) - (b.value ?? 0)),
  };
}

function productDemand(db: Db, productId: string): { year: number; prev: number; days90: number } {
  const today = cairoToday();
  const y1 = addDays(today, -365);
  const y2 = addDays(today, -730);
  const d90 = addDays(today, -90);
  const orders = db.orders.filter((o) => o.productId === productId);
  const sum = (from: string, to: string) =>
    orders.filter((o) => o.dueDate >= from && o.dueDate <= to).reduce((s, o) => s + o.quantity, 0);
  return { year: sum(y1, today), prev: sum(y2, y1), days90: sum(d90, today) };
}

/* ── من الأرقام لقرار ────────────────────────────────────────── */

export type Diagnosis = {
  problems: { title: string; why: string }[];
  suggestions: { title: string; why: string }[];
};

export function diagnose(db: Db, productId: string): Diagnosis {
  const sheet = costSheet(db, productId);
  const waste = wasteIntel(db, productId);
  const score = profitScore(db, productId);
  const history = costHistory(db, productId);
  const problems: Diagnosis["problems"] = [];
  const suggestions: Diagnosis["suggestions"] = [];

  if (sheet.priceKnown && sheet.overTargetPct !== null && sheet.overTargetPct > 0) {
    problems.push({
      title: `التكلفة أعلى من الهدف بـ${round(sheet.overTargetPct)}٪`,
      why: `تكلفة القطعة ${round(sheet.total)} ج، وهدف ${round(sheet.targetMarginPct)}٪ هامش معناه تكلفة ${round(sheet.targetCost ?? 0)} ج`,
    });
  }
  if (sheet.profit < 0 && sheet.priceKnown) {
    problems.push({
      title: "الموديل بيخسر في كل قطعة",
      why: `سعر البيع ${round(sheet.sellPrice)} ج وتكلفة القطعة ${round(sheet.total)} ج`,
    });
  }
  if (sheet.biggest && sheet.biggest.sharePct >= 40) {
    problems.push({
      title: `${sheet.biggest.label} لوحده ${round(sheet.biggest.sharePct)}٪ من التكلفة`,
      why: sheet.biggest.detail,
    });
  }
  if (waste.hasData && waste.rows[0] && waste.rows[0].wastePct > waste.rows[0].plannedPct + 1) {
    problems.push({
      title: `هالك ${waste.rows[0].name} أعلى من المخطط`,
      why: `فعلي ${round(waste.rows[0].wastePct)}٪ مقابل ${round(waste.rows[0].plannedPct)}٪، بتكلفة ${round(waste.rows[0].cost)} ج`,
    });
  }
  if (history.length >= 2) {
    const first = history[0];
    const last = history[history.length - 1];
    if (last.total > first.total * 1.03) {
      problems.push({
        title: `تكلفة الموديل طلعت ${round(((last.total - first.total) / first.total) * 100)}٪ مع الوقت`,
        why: `من ${round(first.total)} ج لـ${round(last.total)} ج — آخر تغيير: ${last.changed}`,
      });
    }
  }

  if (sheet.priceKnown && sheet.sellPrice < sheet.minPrice) {
    suggestions.push({
      title: `ارفع السعر لـ${round(sheet.minPrice)} ج على الأقل`,
      why: `ده أقل سعر يحقّق هامش ${round(sheet.targetMarginPct)}٪ بتكلفة ${round(sheet.total)} ج`,
    });
  }
  const bigMaterial = sheet.lines.find((l) => l.kind === "material");
  if (bigMaterial && bigMaterial.sharePct >= 35) {
    suggestions.push({
      title: `راجع سعر ${bigMaterial.label} أو قلّل استهلاكه`,
      why: `أي ١٠٪ توفير في ${bigMaterial.label} بينزّل تكلفة القطعة ${round(bigMaterial.amount * 0.1)} ج`,
    });
  }
  if (waste.hasData && waste.cost > 0) {
    suggestions.push({
      title: "قلّل الهالك في القص",
      why: `الهالك الزيادة كلّف ${round(waste.cost)} ج على إنتاج الموديل لحد دلوقتي`,
    });
  }
  if (!sheet.hasRouting) {
    suggestions.push({ title: "سجّل مسار العمليات وسعر كل عملية", why: "من غيره المصنعية مش داخلة في التكلفة أصلًا" });
  }
  if (score.verdict === "stop") {
    suggestions.push({
      title: "قرار: إعادة تسعير أو إيقاف",
      why: "السكور واطي بسبب " + (score.down[0]?.label ?? "أكتر من مؤشر") + " — والقرار المالي لازم يتأكد من الأرقام نفسها مش من السكور لوحده",
    });
  }

  return { problems, suggestions };
}

/* ── محاكي السعر و«لو…؟» ─────────────────────────────────────── */

export type PriceScenario = {
  price: number;
  profit: number;
  marginPct: number;
  markup: number;
  at100: number;
  at500: number;
  at1000: number;
  belowMin: boolean;
};

export function priceScenarios(db: Db, productId: string, prices: number[]): PriceScenario[] {
  const sheet = costSheet(db, productId);
  return prices
    .filter((p) => p > 0)
    .map((price) => {
      const profit = price - sheet.total;
      return {
        price,
        profit,
        marginPct: (profit / price) * 100,
        markup: sheet.total > 0 ? price / sheet.total : 0,
        at100: profit * 100,
        at500: profit * 500,
        at1000: profit * 1000,
        belowMin: price < sheet.minPrice,
      };
    });
}

export type CostDeltas = {
  materialPct: number;
  laborPct: number;
  wastePct: number;
  priceDelta: number;
  quantity: number;
};

export type CostWhatIf = {
  before: { total: number; price: number; profit: number; marginPct: number | null; totalProfit: number };
  after: { total: number; price: number; profit: number; marginPct: number | null; totalProfit: number };
  deltaTotal: number;
  deltaMargin: number | null;
};

export function costWhatIf(db: Db, productId: string, d: CostDeltas): CostWhatIf {
  const sheet = costSheet(db, productId);
  const qtyN = Math.max(0, Math.round(d.quantity));
  const materials = sheet.materials * (1 + d.materialPct / 100);
  const waste = sheet.waste * (1 + d.wastePct / 100);
  const labor = (sheet.labor + sheet.outsourced) * (1 + d.laborPct / 100);
  const afterTotal = materials + waste + labor + sheet.overhead;
  const afterPrice = Math.max(0, sheet.sellPrice + d.priceDelta);
  const beforeProfit = sheet.sellPrice - sheet.total;
  const afterProfit = afterPrice - afterTotal;

  return {
    before: {
      total: sheet.total,
      price: sheet.sellPrice,
      profit: beforeProfit,
      marginPct: sheet.sellPrice > 0 ? (beforeProfit / sheet.sellPrice) * 100 : null,
      totalProfit: beforeProfit * qtyN,
    },
    after: {
      total: afterTotal,
      price: afterPrice,
      profit: afterProfit,
      marginPct: afterPrice > 0 ? (afterProfit / afterPrice) * 100 : null,
      totalProfit: afterProfit * qtyN,
    },
    deltaTotal: afterTotal - sheet.total,
    deltaMargin:
      afterPrice > 0 && sheet.sellPrice > 0 ? (afterProfit / afterPrice) * 100 - (beforeProfit / sheet.sellPrice) * 100 : null,
  };
}

/* ── الترتيب ولوحة الربحية ───────────────────────────────────── */

export type RankRow = {
  product: Product;
  cost: number;
  price: number;
  profit: number;
  marginPct: number | null;
  markup: number | null;
  producedQty: number;
  revenue: number;
  totalProfit: number;
  materialCost: number;
  score: number | null;
  verdict: ProfitScore["verdict"];
  belowTarget: boolean;
  ready: boolean;
};

export const RANK_SORTS = [
  { key: "profit", label: "ربح القطعة" },
  { key: "margin", label: "الهامش" },
  { key: "markup", label: "Markup" },
  { key: "cost", label: "أقل تكلفة" },
  { key: "revenue", label: "الإيراد" },
  { key: "totalProfit", label: "إجمالي الربح" },
  { key: "materials", label: "استهلاك الخامات" },
  { key: "score", label: "سكور الربحية" },
] as const;

export type RankSort = (typeof RANK_SORTS)[number]["key"];

export function profitRanking(db: Db, sort: RankSort = "totalProfit"): RankRow[] {
  const rows: RankRow[] = db.products.map((product) => {
    const sheet = costSheet(db, product.id);
    const vol = modelVolume(db, product.id);
    const score = profitScore(db, product.id);
    const profit = sheet.profit;
    return {
      product,
      cost: sheet.total,
      price: sheet.sellPrice,
      profit,
      marginPct: sheet.marginPct,
      markup: sheet.markup,
      producedQty: vol.producedQty,
      revenue: sheet.sellPrice * vol.producedQty,
      totalProfit: profit * vol.producedQty,
      materialCost: (sheet.materials + sheet.waste) * Math.max(vol.producedQty, 1),
      score: score.total,
      verdict: score.verdict,
      belowTarget: sheet.priceKnown && (sheet.marginPct ?? 0) < sheet.targetMarginPct,
      ready: sheet.hasBom && sheet.priceKnown,
    };
  });

  const pick = (r: RankRow): number => {
    switch (sort) {
      case "profit":
        return r.profit;
      case "margin":
        return r.marginPct ?? -Infinity;
      case "markup":
        return r.markup ?? -Infinity;
      case "cost":
        return -r.cost;
      case "revenue":
        return r.revenue;
      case "materials":
        return r.materialCost;
      case "score":
        return r.score ?? -Infinity;
      default:
        return r.totalProfit;
    }
  };

  return rows.sort((a, b) => pick(b) - pick(a));
}

export type ProfitDashboard = {
  products: number;
  ready: number;
  productionValue: number;
  productionCost: number;
  salesValue: number;
  grossProfit: number;
  avgMarginPct: number | null;
  avgCostPerPiece: number | null;
  best: RankRow[];
  worst: RankRow[];
  belowTarget: RankRow[];
  topMaterials: { name: string; cost: number; sharePct: number }[];
  topStages: { name: string; cost: number; sharePct: number }[];
  topWaste: { name: string; product: string; cost: number }[];
  targetMarginPct: number;
};

export function profitDashboard(db: Db): ProfitDashboard {
  const rows = profitRanking(db, "totalProfit");
  const ready = rows.filter((r) => r.ready);
  const productionValue = rows.reduce((s, r) => s + r.revenue, 0);
  const productionCost = rows.reduce((s, r) => s + r.cost * r.producedQty, 0);
  const salesValue = db.products.reduce((s, p) => s + modelVolume(db, p.id).soldRevenue, 0);

  const materialTotals = new Map<string, number>();
  const stageTotals = new Map<string, number>();
  for (const r of rows) {
    const vol = Math.max(r.producedQty, 0);
    if (!vol) continue;
    for (const l of bomLines(db, activeBom(db, r.product.id)?.id)) {
      materialTotals.set(l.name, (materialTotals.get(l.name) ?? 0) + l.lineCost * vol);
    }
    for (const step of routingLines(db, r.product.id)) {
      const name = operationById(db, step.operationId)?.name ?? step.name;
      stageTotals.set(name, (stageTotals.get(name) ?? 0) + step.rate * vol);
    }
  }
  const matSum = [...materialTotals.values()].reduce((s, v) => s + v, 0) || 1;
  const stageSum = [...stageTotals.values()].reduce((s, v) => s + v, 0) || 1;

  const topWaste = db.products
    .flatMap((p) =>
      wasteIntel(db, p.id).rows.filter((r) => r.cost > 0).map((r) => ({ name: r.name, product: p.name, cost: r.cost })),
    )
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);

  const margins = ready.map((r) => r.marginPct ?? 0);

  return {
    products: rows.length,
    ready: ready.length,
    productionValue,
    productionCost,
    salesValue,
    grossProfit: productionValue - productionCost,
    avgMarginPct: margins.length ? avg(margins) : null,
    avgCostPerPiece: ready.length ? avg(ready.map((r) => r.cost)) : null,
    best: ready.filter((r) => (r.score ?? 0) > 0).slice(0, 10),
    worst: [...ready].reverse().slice(0, 10),
    belowTarget: ready.filter((r) => r.belowTarget),
    topMaterials: [...materialTotals.entries()]
      .map(([name, cost]) => ({ name, cost, sharePct: (cost / matSum) * 100 }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5),
    topStages: [...stageTotals.entries()]
      .map(([name, cost]) => ({ name, cost, sharePct: (cost / stageSum) * 100 }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5),
    topWaste,
    targetMarginPct: targetMarginOf(db),
  };
}

/* ── تنبيهات الربحية ─────────────────────────────────────────── */

export type ProfitAlert = {
  productId: string;
  name: string;
  tone: "danger" | "warn" | "ok";
  text: string;
  why: string;
  /** الخطوة المقترحة — بتختلف باختلاف نوع التنبيه */
  action: string;
};

export function profitAlerts(db: Db): ProfitAlert[] {
  const alerts: ProfitAlert[] = [];
  for (const p of db.products) {
    const sheet = costSheet(db, p.id);
    if (!sheet.hasBom) continue;
    const history = costHistory(db, p.id);
    const waste = wasteIntel(db, p.id);

    if (sheet.priceKnown && sheet.profit < 0) {
      alerts.push({
        productId: p.id,
        name: p.name,
        tone: "danger",
        text: "الموديل بقى خسران",
        action: "أوقف الإنتاج أو أعِد التسعير قبل أي دفعة جديدة",
        why: `سعر البيع ${round(sheet.sellPrice)} ج وتكلفة القطعة ${round(sheet.total)} ج`,
      });
    } else if (sheet.priceKnown && sheet.sellPrice < sheet.minPrice) {
      alerts.push({
        productId: p.id,
        name: p.name,
        tone: "danger",
        text: "سعر البيع أقل من أقل سعر مقبول",
        action: "ارفع السعر للحد الأدنى أو خفّض أكبر بند في التكلفة",
        why: `أقل سعر يحقّق هامش ${round(sheet.targetMarginPct)}٪ هو ${round(sheet.minPrice)} ج`,
      });
    } else if (sheet.priceKnown && (sheet.marginPct ?? 0) < sheet.targetMarginPct) {
      alerts.push({
        productId: p.id,
        name: p.name,
        tone: "warn",
        text: `الهامش تحت الهدف`,
        action: "شوف أكبر بند في ورقة التكلفة وقرّر: سعر أعلى ولا تكلفة أقل",
        why: `${round(sheet.marginPct ?? 0)}٪ مقابل هدف ${round(sheet.targetMarginPct)}٪`,
      });
    } else if (sheet.priceKnown) {
      alerts.push({
        productId: p.id,
        name: p.name,
        tone: "ok",
        text: "فوق الهامش المستهدف",
        action: "موديل يستاهل كميات أكبر",
        why: `${round(sheet.marginPct ?? 0)}٪ مقابل هدف ${round(sheet.targetMarginPct)}٪`,
      });
    }

    if (history.length >= 2) {
      const first = history[0];
      const last = history[history.length - 1];
      if (last.total > first.total * 1.1) {
        alerts.push({
          productId: p.id,
          name: p.name,
          tone: "warn",
          text: `التكلفة ارتفعت ${round(((last.total - first.total) / first.total) * 100)}٪`,
          action: "راجع سعر الخامة اللي طلعت، أو دوّر على مورّد تاني",
          why: last.changed,
        });
      }
    }
    if (waste.hasData && waste.rows[0] && waste.rows[0].wastePct > waste.rows[0].plannedPct + 2) {
      alerts.push({
        productId: p.id,
        name: p.name,
        tone: "warn",
        text: `الهالك أعلى من المخطط`,
        action: "راجع القص ونسبة الهالك في قائمة الخامات",
        why: `${waste.rows[0].name}: ${round(waste.rows[0].wastePct)}٪ مقابل ${round(waste.rows[0].plannedPct)}٪`,
      });
    }
  }
  const rank = { danger: 0, warn: 1, ok: 2 };
  return alerts.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

/** الموديلات المتأثرة بسعر خامة — الدليل إن الرقم بيتحدث لوحده */
export function modelsUsingMaterial(db: Db, materialId: string) {
  return db.products
    .map((product) => {
      const lines = bomLines(db, activeBom(db, product.id)?.id);
      const line = lines.find((l) => l.materialId === materialId);
      if (!line) return null;
      const sheet = costSheet(db, product.id);
      return {
        product,
        qtyPerUnit: line.qtyPerUnit,
        effectiveQty: line.effectiveQty,
        unit: line.unit,
        lineCost: line.lineCost,
        sharePct: sheet.total > 0 ? (line.lineCost / sheet.total) * 100 : 0,
        total: sheet.total,
        marginPct: sheet.marginPct,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.sharePct - a.sharePct);
}

/* ── الربحية على مستويات ─────────────────────────────────────── */

export type LevelRow = { key: string; label: string; revenue: number; cost: number; profit: number; marginPct: number | null };

/** ربحية بالخط وبالأمر وبالعميل — نفس البيانات، تجميع مختلف */
export function profitByLevel(db: Db, level: "line" | "order" | "customer"): LevelRow[] {
  const map = new Map<string, LevelRow>();
  for (const order of db.orders) {
    const p = orderProfit(db, order);
    const base = p.produced || order.quantity;
    const revenue = order.piecePrice * base;
    const cost = p.hasActuals && p.produced > 0 ? p.actTotal : p.estPerPiece * base;
    let key = order.line || "بدون خط";
    let label = key;
    if (level === "order") {
      key = order.id;
      label = `${order.code} — ${order.model}`;
    } else if (level === "customer") {
      key = order.clientId ?? "stock";
      label = order.clientId ? db.parties.find((x) => x.id === order.clientId)?.name ?? "عميل محذوف" : "مخزون المصنع";
    }
    const row = map.get(key) ?? { key, label, revenue: 0, cost: 0, profit: 0, marginPct: null };
    row.revenue += revenue;
    row.cost += cost;
    row.profit = row.revenue - row.cost;
    row.marginPct = row.revenue > 0 ? (row.profit / row.revenue) * 100 : null;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.profit - a.profit);
}

/* ── أدوات ──────────────────────────────────────────────────── */

function missingBlock(key: ProfitBlockKey, needs: string): ProfitBlock {
  return {
    key,
    label: PROFIT_LABEL[key],
    weight: PROFIT_WEIGHTS[key],
    value: null,
    why: "",
    missing: needs,
  };
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function avg(list: number[]): number {
  return list.length ? list.reduce((s, v) => s + v, 0) / list.length : 0;
}

function round(v: number): string {
  return new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(v);
}

/** عدد أيام تشغيل الموديل — للاستخدام في التقارير الزمنية */
export function modelAgeDays(db: Db, productId: string): number | null {
  const dates = db.orders.filter((o) => o.productId === productId).map((o) => o.dueDate).sort();
  return dates.length ? daysBetween(dates[0], cairoToday()) : null;
}
