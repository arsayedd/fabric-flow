/**
 * صنعة — التوريد والاستلام والدفعات والاستدعاء (M-V1)
 *
 * الملف ده مابيسجّلش حاجة. بيقرا من دفاتر التوريد والمخزن والمرتجعات
 * ويرد على أربع أسئلة الشراء كله قايم عليها:
 *
 *  1) **طلبنا كام ووصل كام؟** الفرق ده اسمه عجز أو زيادة، ولازم يبقى رقم
 *     بقيمة، مش إحساس إن الشحنة «كانت ناقصة شوية».
 *  2) **الشحنة دي كانت في ميعادها؟** بنقارن تاريخ الاستلام بالميعاد
 *     المتفق عليه في الأمر — وده اللي خلّى «المورّد بيتأخر» سؤال ليه
 *     إجابة بعد ما كان مكتوب في نواقص اللوحة.
 *  3) **الدفعة دي مشيت فين؟** من حركة الدخول للصرف للأمر للتوريد للعميل.
 *  4) **لو الدفعة فيها مشكلة، وصلت لمين؟** وده الاستدعاء.
 *
 * وقاعدة الملف: **اللي بيتخزّن هو اللي بيتعدّ، واللي بيتحسب مابيتخزّنش.**
 * الكمية المقبولة والمرفوضة والتالفة اتعدّت بإيد أمين المخزن فاتخزّنت.
 * الواصل والباقي والعجز والقيمة كلها بتتحسب وقت العرض، لأنها بتتغيّر مع
 * كل استلام جديد — ولو اتخزّنت هتكدب من أول شحنة.
 */

import { addDays, cairoToday } from "@/lib/utils";
import { materialById, orderRequirements, productById, stockQty, unitName } from "./manufacturing";
import { partyById } from "./parties";
import type {
  Db,
  MaterialBatch,
  Recall,
  ReturnEntry,
  SupplyOrder,
  SupplyOrderLine,
  SupplyReceiptLine,
  SupplyStatus,
} from "./types";

const EPS = 0.0001;

export const SUPPLY_TONE: Record<SupplyStatus, "gold" | "ok" | "warn" | "danger" | "muted"> = {
  open: "gold",
  partial: "gold",
  received: "ok",
  closed: "warn",
  cancelled: "muted",
};

/* ── الترقيم ────────────────────────────────────────────────────── */

/**
 * ترقيم سنوي بنفس شكل باقي النظام: `SUP-2026-000001`.
 *
 * الرقم بيتولد من أعلى رقم في نفس السنة، فمابيتكرّرش ومابيرجعش لواحد
 * أول يناير على أوامر السنة اللي فاتت.
 */
export function nextSerial(prefix: string, codes: string[], today = cairoToday()): string {
  const year = Number(today.slice(0, 4));
  const last = codes
    .filter((c) => c.includes(`-${year}-`))
    .reduce((max, c) => Math.max(max, Number(c.split("-").pop()) || 0), 0);
  return `${prefix}-${year}-${String(last + 1).padStart(6, "0")}`;
}

/* ── اسم البند ──────────────────────────────────────────────────── */

export function supplyItemName(db: Db, itemType: "material" | "product", itemId: string): string {
  if (itemType === "material") return materialById(db, itemId)?.name ?? "خامة محذوفة";
  return productById(db, itemId)?.name ?? "موديل محذوف";
}

export function supplyItemUnit(db: Db, itemType: "material" | "product", itemId: string): string {
  if (itemType === "product") return "قطعة";
  return unitName(db, materialById(db, itemId)?.unitId ?? null);
}

/* ── سطر الأمر: الكميات السبعة ──────────────────────────────────── */

export type SupplyLineView = {
  line: SupplyOrderLine;
  name: string;
  unit: string;
  /** المتفق عليه */
  ordered: number;
  /** نزل من العربية فعلًا = مقبول + مرفوض + تالف */
  received: number;
  accepted: number;
  rejected: number;
  damaged: number;
  /** تعارض في ورقة المورّد: كاتب أكتر من اللي نزل */
  missingDoc: number;
  /**
   * المطلوب − الواصل.
   *
   * ده **انتظار** طالما الأمر مفتوح، و**عجز** بعد ما يتقفل. نفس الرقم
   * ومعنيين مختلفين، والشاشة بتسمّيه حسب حالة الأمر مش حسب مزاجها.
   */
  remaining: number;
  /** موجب لو وصل أكتر من المطلوب */
  over: number;
  /** رجع للمورّد فعلًا — من دفتر المرتجعات */
  returned: number;
  /** قيمة المقبول بالسعر المتفق عليه */
  acceptedValue: number;
  /** قيمة اللي مانفعش: مرفوض + تالف + عجز (لو اتقفل) */
  lossValue: number;
};

function linesOfOrder(db: Db, supplyOrderId: string): SupplyOrderLine[] {
  return (db.supplyOrderLines ?? []).filter((l) => l.supplyOrderId === supplyOrderId);
}

/** سطور الاستلام اللي على سطر أمر معيّن، من الاستلامات غير الملغية */
function receiptLinesOf(db: Db, supplyOrderLineId: string): SupplyReceiptLine[] {
  return (db.supplyReceiptLines ?? []).filter((r) => r.supplyOrderLineId === supplyOrderLineId);
}

export function supplyLineView(db: Db, line: SupplyOrderLine, orderClosed: boolean): SupplyLineView {
  const rows = receiptLinesOf(db, line.id);
  const accepted = rows.reduce((s, r) => s + r.qtyAccepted, 0);
  const rejected = rows.reduce((s, r) => s + r.qtyRejected, 0);
  const damaged = rows.reduce((s, r) => s + r.qtyDamaged, 0);
  const missingDoc = rows.reduce((s, r) => s + r.qtyMissing, 0);
  const received = accepted + rejected + damaged;
  const gap = line.qtyOrdered - received;

  // المرتجع للمورّد بيتقرا من دفتر المرتجعات على نفس البند ونفس المورّد
  const returned = supplierReturnsOf(db, line).reduce((s, r) => s + r.qty, 0);

  const shortfall = orderClosed ? Math.max(0, gap) : 0;
  return {
    line,
    name: supplyItemName(db, line.itemType, line.itemId),
    unit: supplyItemUnit(db, line.itemType, line.itemId),
    ordered: line.qtyOrdered,
    received,
    accepted,
    rejected,
    damaged,
    missingDoc,
    remaining: Math.max(0, gap),
    over: Math.max(0, -gap),
    returned,
    acceptedValue: accepted * line.unitPrice,
    lossValue: (rejected + damaged + shortfall) * line.unitPrice,
  };
}

/** مرتجعات المورّد المرتبطة بالبند ده من نفس الأمر */
function supplierReturnsOf(db: Db, line: SupplyOrderLine): ReturnEntry[] {
  return (db.returns ?? []).filter(
    (r) =>
      r.source === "supplier" &&
      r.status !== "cancelled" &&
      r.itemType === line.itemType &&
      r.itemId === line.itemId,
  );
}

/* ── الأمر ككل ──────────────────────────────────────────────────── */

export type SupplyView = {
  order: SupplyOrder;
  partyName: string;
  lines: SupplyLineView[];
  receipts: number;
  /** قيمة الأمر بالاتفاق */
  orderedValue: number;
  acceptedValue: number;
  lossValue: number;
  /** نسبة اللي وصل من المطلوب بالكمية */
  fillPct: number | null;
  /** آخر استلام — منه بيتحسب التأخير */
  lastReceiptDate: string | null;
  /** موجب = اتأخر بكام يوم. `null` لو لسه مااستلمناش حاجة */
  lateDays: number | null;
  /** الأمر مفتوح وفات ميعاده */
  overdue: boolean;
  /** الحالة المحسوبة — بنقارنها بالمخزّنة عشان الميوتيشن تحدّثها */
  derivedStatus: SupplyStatus;
};

export function supplyView(db: Db, order: SupplyOrder): SupplyView {
  const closed = order.status === "closed";
  const lines = linesOfOrder(db, order.id).map((l) => supplyLineView(db, l, closed));
  const receipts = (db.supplyReceipts ?? []).filter((r) => r.supplyOrderId === order.id);
  const dates = receipts.map((r) => r.date).sort();
  const lastReceiptDate = dates.length ? dates[dates.length - 1] : null;

  const ordered = lines.reduce((s, l) => s + l.ordered, 0);
  const received = lines.reduce((s, l) => s + l.received, 0);
  const today = cairoToday();

  return {
    order,
    partyName: partyById(db, order.partyId)?.name ?? "مورّد محذوف",
    lines,
    receipts: receipts.length,
    orderedValue: lines.reduce((s, l) => s + l.ordered * l.line.unitPrice, 0),
    acceptedValue: lines.reduce((s, l) => s + l.acceptedValue, 0),
    lossValue: lines.reduce((s, l) => s + l.lossValue, 0),
    fillPct: ordered > EPS ? (received / ordered) * 100 : null,
    lastReceiptDate,
    lateDays: lastReceiptDate ? daysBetween(order.expectedDate, lastReceiptDate) : null,
    overdue: (order.status === "open" || order.status === "partial") && order.expectedDate < today,
    derivedStatus: deriveStatus(order, ordered, received),
  };
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

/**
 * الحالة محسوبة من الكميات، مش مكتوبة بالإيد.
 *
 * والاستثناء الوحيد: **الملغي والمقفول قرار إنسان** — مافيش كمية بتوصل
 * له، فبيفضلوا زي ما هما.
 */
function deriveStatus(order: SupplyOrder, ordered: number, received: number): SupplyStatus {
  if (order.status === "cancelled" || order.status === "closed") return order.status;
  if (received <= EPS) return "open";
  if (received >= ordered - EPS) return "received";
  return "partial";
}

export function supplyList(db: Db): SupplyView[] {
  return (db.supplyOrders ?? [])
    .map((o) => supplyView(db, o))
    .sort((a, b) =>
      a.order.date === b.order.date ? b.order.code.localeCompare(a.order.code) : b.order.date.localeCompare(a.order.date),
    );
}

export function supplyById(db: Db, id: string): SupplyView | null {
  const order = (db.supplyOrders ?? []).find((o) => o.id === id);
  return order ? supplyView(db, order) : null;
}

/* ── ملخص الشاشة ────────────────────────────────────────────────── */

export type SupplySummary = {
  open: number;
  overdue: number;
  /** قيمة اللي لسه مااستلمناهوش من الأوامر المفتوحة */
  openValue: number;
  /** قيمة المرفوض والتالف والعجز في المدة */
  lossValue: number;
  /** نسبة الالتزام بالمواعيد على الأوامر اللي خلصت */
  onTimePct: number | null;
};

export function supplySummary(db: Db, days = 90): SupplySummary {
  const from = addDays(cairoToday(), -days);
  const views = supplyList(db).filter((v) => v.order.date >= from);
  const live = views.filter((v) => v.order.status === "open" || v.order.status === "partial");
  const done = views.filter((v) => v.lateDays !== null && v.order.status !== "cancelled");
  return {
    open: live.length,
    overdue: live.filter((v) => v.overdue).length,
    openValue: live.reduce((s, v) => s + v.lines.reduce((t, l) => t + l.remaining * l.line.unitPrice, 0), 0),
    lossValue: views.reduce((s, v) => s + v.lossValue, 0),
    onTimePct: done.length ? (done.filter((v) => (v.lateDays ?? 0) <= 0).length / done.length) * 100 : null,
  };
}

/* ── التزام المورّد بالمواعيد ───────────────────────────────────── */

export type SupplierDelivery = {
  partyId: string;
  name: string;
  orders: number;
  onTime: number;
  late: number;
  /** متوسط التأخير بالأيام على اللي اتأخر */
  avgLateDays: number | null;
  onTimePct: number | null;
  /** نسبة المرفوض والتالف من اللي وصل */
  rejectPct: number | null;
  shortfallValue: number;
};

/**
 * التزام المورّد.
 *
 * دي الحاجة اللي كانت مكتوبة في نواقص اللوحة: «ميعاد توريد متوقع على أمر
 * الشراء مقابل تاريخ الاستلام». بقى فيه ميعاد متفق عليه على الأمر، وتاريخ
 * فعلي على الاستلام، فالمقارنة بقت ممكنة من الدفتر.
 *
 * والأوامر اللي لسه مااستلمناش منها حاجة **مش داخلة في النسبة**: مالهاش
 * تاريخ استلام تتقارن بيه، ولو حسبناها متأخرة هنحكم على المورّد بحاجة
 * لسه مآعادهاش جه.
 */
export function supplierDelivery(db: Db, days = 180): SupplierDelivery[] {
  const from = addDays(cairoToday(), -days);
  const views = supplyList(db).filter((v) => v.order.date >= from && v.order.status !== "cancelled");
  const ids = [...new Set(views.map((v) => v.order.partyId))];

  return ids
    .map((partyId) => {
      const mine = views.filter((v) => v.order.partyId === partyId);
      const rated = mine.filter((v) => v.lateDays !== null);
      const late = rated.filter((v) => (v.lateDays ?? 0) > 0);
      const receivedQty = mine.reduce((s, v) => s + v.lines.reduce((t, l) => t + l.received, 0), 0);
      const badQty = mine.reduce((s, v) => s + v.lines.reduce((t, l) => t + l.rejected + l.damaged, 0), 0);
      return {
        partyId,
        name: partyById(db, partyId)?.name ?? "مورّد محذوف",
        orders: mine.length,
        onTime: rated.length - late.length,
        late: late.length,
        avgLateDays: late.length ? late.reduce((s, v) => s + (v.lateDays ?? 0), 0) / late.length : null,
        onTimePct: rated.length ? ((rated.length - late.length) / rated.length) * 100 : null,
        rejectPct: receivedQty > EPS ? (badQty / receivedQty) * 100 : null,
        shortfallValue: mine.reduce((s, v) => s + v.lossValue, 0),
      };
    })
    .sort((a, b) => (a.onTimePct ?? 101) - (b.onTimePct ?? 101));
}

/* ── الدفعات ────────────────────────────────────────────────────── */

export type BatchView = {
  batch: MaterialBatch;
  name: string;
  unit: string;
  partyName: string | null;
  /** اللي دخل بالدفعة */
  qtyIn: number;
  /** اللي اتصرف أو اتهلك منها */
  consumed: number;
  /** الرصيد الحالي من الدفعة — محسوب من الحركات */
  remaining: number;
  value: number;
  /** أوامر الإنتاج اللي الدفعة نزلت فيها */
  orderCount: number;
  /** فاضل كام يوم للانتهاء — `null` لو مالهاش تاريخ انتهاء */
  daysToExpiry: number | null;
  expired: boolean;
};

/** حركات المخزن بتاعة دفعة معيّنة */
export function batchMovements(db: Db, batchId: string) {
  return db.stockMovements.filter((m) => m.batchId === batchId);
}

export function batchView(db: Db, batch: MaterialBatch): BatchView {
  const moves = batchMovements(db, batch.id);
  const inQty = moves.filter((m) => m.qty > 0).reduce((s, m) => s + m.qty, 0);
  const consumed = moves.filter((m) => m.qty < 0).reduce((s, m) => s + Math.abs(m.qty), 0);
  const today = cairoToday();
  const orderIds = new Set(moves.filter((m) => m.refType === "order" && m.refId).map((m) => m.refId));
  return {
    batch,
    name: supplyItemName(db, batch.itemType, batch.itemId),
    unit: supplyItemUnit(db, batch.itemType, batch.itemId),
    partyName: batch.partyId ? (partyById(db, batch.partyId)?.name ?? null) : null,
    qtyIn: inQty || batch.qtyIn,
    consumed,
    remaining: (inQty || batch.qtyIn) - consumed,
    value: ((inQty || batch.qtyIn) - consumed) * batch.unitCost,
    orderCount: orderIds.size,
    daysToExpiry: batch.expiryDate ? daysBetween(today, batch.expiryDate) : null,
    expired: !!batch.expiryDate && batch.expiryDate < today,
  };
}

export function batchList(db: Db): BatchView[] {
  return (db.batches ?? [])
    .map((b) => batchView(db, b))
    .sort((a, b) =>
      a.batch.receivedDate === b.batch.receivedDate
        ? b.batch.code.localeCompare(a.batch.code)
        : b.batch.receivedDate.localeCompare(a.batch.receivedDate),
    );
}

export function batchById(db: Db, id: string): BatchView | null {
  const b = (db.batches ?? []).find((x) => x.id === id);
  return b ? batchView(db, b) : null;
}

/**
 * الدفعات المتاحة للصرف من خامة، بترتيب الأقدم الأول.
 *
 * الترتيب ده هو **FIFO**، ومقصود إنه الافتراضي: الخامة الأقدم بتتصرف
 * الأول، وده اللي بيمنع المخزون الميت ويخلّي تكلفة الصرف قريبة من
 * الحقيقة. والموقوفة والمتستدعاة **مابتدخلش** — دفعة فيها شك مايصحّ
 * تنزل إنتاج جديد.
 */
export function issuableBatches(db: Db, itemType: "material" | "product", itemId: string): BatchView[] {
  return batchList(db)
    .filter(
      (v) =>
        v.batch.itemType === itemType &&
        v.batch.itemId === itemId &&
        v.batch.status === "active" &&
        !v.expired &&
        v.remaining > EPS,
    )
    .sort((a, b) => a.batch.receivedDate.localeCompare(b.batch.receivedDate));
}

/**
 * الكمية الموقوفة: رصيد في دفعات موقوفة أو متستدعاة أو منتهية.
 *
 * الرقم ده موجود في المخزن بس **ممنوع يتصرف**. ولازم يبقى صريح، لأن
 * الرصيد الكلي بيشوفه عادي — ومن غير الطرح ده، أمر إنتاج جديد يقدر
 * يستهلك دفعة إحنا بنستدعيها، وده بيوسّع المشكلة بإيدينا.
 */
export function heldQty(db: Db, itemType: "material" | "product", itemId: string): number {
  return batchList(db)
    .filter(
      (v) =>
        v.batch.itemType === itemType &&
        v.batch.itemId === itemId &&
        v.remaining > EPS &&
        (v.batch.status !== "active" || v.expired),
    )
    .reduce((s, v) => s + v.remaining, 0);
}

/** المتاح للصرف فعلًا = الموجود − الموقوف */
export function issuableQty(db: Db, itemType: "material" | "product", itemId: string): number {
  return stockQty(db, itemType, itemId) - heldQty(db, itemType, itemId);
}

/**
 * توزيع كمية مطلوبة على الدفعات بالأقدم الأول.
 *
 * بيرجّع اللي قدر يوزّعه و**الباقي بلا دفعة**. والباقي ده مش خطأ: المخزون
 * اللي اتسجّل قبل ما الدفعات تبقى موجودة رصيد حقيقي بلا دفعة، والصرف منه
 * لازم يفضل شغّال — أول حاجة كانت هتكسر المصانع الشغّالة إننا نمنع الصرف
 * لحد ما كل حبة في المخزن يبقى لها لوط.
 */
export function allocateFifo(
  db: Db,
  itemType: "material" | "product",
  itemId: string,
  need: number,
): { picks: { batchId: string; qty: number; unitCost: number }[]; unbatched: number } {
  const picks: { batchId: string; qty: number; unitCost: number }[] = [];
  let left = need;
  for (const v of issuableBatches(db, itemType, itemId)) {
    if (left <= EPS) break;
    const take = Math.min(left, v.remaining);
    picks.push({ batchId: v.batch.id, qty: take, unitCost: v.batch.unitCost });
    left -= take;
  }
  return { picks, unbatched: Math.max(0, left) };
}

/* ── تقييم المخزون ──────────────────────────────────────────────── */

export type StockValue = {
  /** قيمة الرصيد بتكلفة الدفعات اللي لسه موجودة */
  batchValue: number;
  /** الرصيد اللي مالوش دفعة — بيتقيّم بمتوسط تكلفة الخامة */
  unbatchedQty: number;
  unbatchedValue: number;
  total: number;
  /** نسبة المخزون اللي بقى متتبّع بالدفعات */
  coveragePct: number | null;
};

/**
 * قيمة المخزون.
 *
 * مقصود إنها **مقسومة**: الجزء المتتبّع بالدفعات بيتقيّم بتكلفة دفعته
 * الحقيقية، والجزء القديم بمتوسط التكلفة. وبنعرض نسبة التغطية عشان
 * القيمة تتقرا بحدودها — قيمة مبنية ٤٠٪ على متوسط مش نفس القيمة المبنية
 * ١٠٠٪ على دفعات، وإخفاء الفرق ده بيخلّي الرقم يبان أدق مما هو.
 */
export function stockValue(db: Db): StockValue {
  let batchValue = 0;
  let batchedQty = 0;
  for (const v of batchList(db)) {
    if (v.remaining <= EPS) continue;
    batchValue += v.remaining * v.batch.unitCost;
    batchedQty += v.remaining;
  }

  let unbatchedQty = 0;
  let unbatchedValue = 0;
  for (const m of db.materials) {
    const total = stockQty(db, "material", m.id);
    const inBatches = batchList(db)
      .filter((v) => v.batch.itemType === "material" && v.batch.itemId === m.id && v.remaining > EPS)
      .reduce((s, v) => s + v.remaining, 0);
    const loose = total - inBatches;
    if (loose > EPS) {
      unbatchedQty += loose;
      unbatchedValue += loose * m.avgCost;
    }
  }

  const all = batchedQty + unbatchedQty;
  return {
    batchValue,
    unbatchedQty,
    unbatchedValue,
    total: batchValue + unbatchedValue,
    coveragePct: all > EPS ? (batchedQty / all) * 100 : null,
  };
}

/* ── الاستدعاء ──────────────────────────────────────────────────── */

export type RecallOrderRow = {
  orderId: string;
  orderCode: string;
  model: string;
  /** كمية الخامة من الدفعة اللي نزلت الأمر ده */
  batchQty: number;
  /** قطع الأمر اللي اتنتجت */
  produced: number;
  clientName: string | null;
  clientId: string | null;
  /** اتسلّم للعميل كام من الأمر */
  deliveredQty: number;
  deliveredValue: number;
  /** رجع من الاستدعاء ده */
  returnedQty: number;
  /** لسه عند العميل */
  outstandingQty: number;
};

export type RecallScope = {
  recall: Recall;
  batch: BatchView | null;
  /** لسه في المخزن من الدفعة — ده أسهل جزء: بنوقفه وخلاص */
  inStock: number;
  orders: RecallOrderRow[];
  customers: number;
  /** قطع خرجت للعملاء من أوامر استخدمت الدفعة */
  exposedQty: number;
  exposedValue: number;
  returnedQty: number;
  outstandingQty: number;
  /** تكلفة الاستدعاء: أثر المرتجعات المربوطة بيه */
  recallCost: number;
  containedPct: number | null;
};

/**
 * مدى الاستدعاء — السؤال اللي القسم كله اتعمل عشانه.
 *
 * السلسلة: الدفعة → حركات الصرف اللي عليها → أوامر الإنتاج → توريدات
 * الأوامر دي → العملاء والفواتير. وكل خطوة فيها بتتقرا من دفتر موجود،
 * فالنتيجة بتتغيّر لوحدها لما أي حاجة في السلسلة تتغيّر.
 *
 * ومهم: الأرقام دي **مدى تعرّض** مش إدانة. القطعة اللي خرجت من أمر
 * استخدم الدفعة مش بالضرورة فيها العيب — بس هي اللي لازم تتراجع.
 */
export function recallScope(db: Db, recall: Recall): RecallScope {
  const batch = batchById(db, recall.batchId);
  const moves = batchMovements(db, recall.batchId);

  /*
   * ربط الدفعة بالأمر بيمشي على تلات طرق، لأن الصرف في المصنع مش شكل
   * واحد:
   *
   *  1) صرف على الأمر مباشرة (`order`) — الإكسسوار والخيط.
   *  2) صرف على **الفرشة** (`lay`) — القماش بيتصرف على فرشة القص، والفرشة
   *     هي اللي عارفة أمرها. لو مشينا على النوع الأول بس، القماش — وهو
   *     أهم خامة في الاستدعاء — مش هيبان أصلًا.
   *  3) دفعة **إنتاج تام**: الربط هنا بحركة الدخول الموجبة (`receipt_fg`)
   *     مش بالصرف، لأن الأمر هو اللي **عمل** الدفعة مش اللي استهلكها.
   */
  const byOrder = new Map<string, number>();
  const bump = (orderId: string, qty: number) => byOrder.set(orderId, (byOrder.get(orderId) ?? 0) + qty);
  for (const m of moves) {
    if (!m.refId) continue;
    if (m.qty < 0 && m.refType === "order") bump(m.refId, Math.abs(m.qty));
    else if (m.qty < 0 && m.refType === "lay") {
      const lay = (db.cutLays ?? []).find((l) => l.id === m.refId);
      if (lay) bump(lay.orderId, Math.abs(m.qty));
    } else if (m.qty > 0 && m.kind === "receipt_fg" && m.refType === "order") bump(m.refId, m.qty);
  }

  const mine = (db.returns ?? []).filter((r) => r.recallId === recall.id && r.status !== "cancelled");

  const orders: RecallOrderRow[] = [];
  for (const [orderId, batchQty] of byOrder) {
    const order = db.orders.find((o) => o.id === orderId);
    if (!order) continue;
    const produced = order.productId
      ? db.stockMovements
          .filter((m) => m.kind === "receipt_fg" && m.refType === "order" && m.refId === orderId)
          .reduce((s, m) => s + m.qty, 0)
      : 0;
    // التوريدات بالمعرّف بس. التوريد اللي مش مربوط بأمر مابيتخمّنش هنا:
    // استدعاء بيكلّم عميل غلط أسوأ من استدعاء بيقول «مش عارف».
    const dels = db.deliveries.filter((d) => d.orderId === orderId);
    const deliveredQty = dels.reduce((s, d) => s + (d.quantity ?? 0), 0);
    const returnedQty = mine.filter((r) => r.orderId === orderId).reduce((s, r) => s + r.qty, 0);
    orders.push({
      orderId,
      orderCode: order.code,
      model: order.model,
      batchQty,
      produced,
      clientId: order.clientId,
      clientName: order.clientId ? (partyById(db, order.clientId)?.name ?? null) : null,
      deliveredQty,
      deliveredValue: dels.reduce((s, d) => s + d.amount, 0),
      returnedQty,
      outstandingQty: Math.max(0, deliveredQty - returnedQty),
    });
  }

  orders.sort((a, b) => b.deliveredQty - a.deliveredQty);

  const exposedQty = orders.reduce((s, o) => s + o.deliveredQty, 0);
  const returnedQty = orders.reduce((s, o) => s + o.returnedQty, 0);
  return {
    recall,
    batch,
    inStock: batch?.remaining ?? 0,
    orders,
    customers: new Set(orders.map((o) => o.clientId).filter(Boolean)).size,
    exposedQty,
    exposedValue: orders.reduce((s, o) => s + o.deliveredValue, 0),
    returnedQty,
    outstandingQty: Math.max(0, exposedQty - returnedQty),
    recallCost: mine.reduce((s, r) => s + r.settleAmount + r.costs.reduce((t, c) => t + c.amount, 0), 0),
    containedPct: exposedQty > EPS ? (returnedQty / exposedQty) * 100 : null,
  };
}

export function recallList(db: Db): RecallScope[] {
  return (db.recalls ?? [])
    .map((r) => recallScope(db, r))
    .sort((a, b) =>
      a.recall.date === b.recall.date
        ? b.recall.code.localeCompare(a.recall.code)
        : b.recall.date.localeCompare(a.recall.date),
    );
}

/* ── المتاح فعلًا مقابل الموجود ─────────────────────────────────── */

export type Availability = {
  materialId: string;
  name: string;
  unit: string;
  /** الموجود في المخزن */
  onHand: number;
  /** محجوز لأوامر إنتاج شغّالة مااتصرفتش خاماتها */
  reserved: number;
  /** موقوف في دفعات تحت الفحص أو متستدعاة */
  held: number;
  /** الموجود − المحجوز − الموقوف */
  available: number;
  /** جاي في أوامر توريد مفتوحة */
  incoming: number;
  short: boolean;
};

/**
 * المتاح مش الموجود.
 *
 * «عندي ١٠ آلاف متر» جواب غلط لو ٦ آلاف منهم محجوزين لأوامر ماشية وألف
 * موقوف في دفعة تحت الفحص. الرقم اللي بتاخد عليه قرار بيع أو شراء هو
 * **المتاح**.
 *
 * والحجز هنا **محسوب مش مخزّن**: احتياج الأوامر الشغّالة اللي لسه
 * مااتصرفتش خاماتها. لو خزّناه، أول أمر يتقفل يخليه كذب — وده نفس السبب
 * اللي مخلّي كل رصيد في النظام محسوب من الحركات.
 */
export function availability(db: Db, days = 60): Availability[] {
  const live = db.orders.filter((o) => (o.status === "running" || o.status === "late") && !o.materialsIssuedAt);
  const need = new Map<string, number>();
  for (const order of live) {
    for (const r of orderRequirements(db, order)) {
      if (r.remaining <= EPS) continue;
      need.set(r.materialId, (need.get(r.materialId) ?? 0) + r.remaining);
    }
  }

  const from = addDays(cairoToday(), -days);
  const incoming = new Map<string, number>();
  for (const v of supplyList(db)) {
    if (v.order.status !== "open" && v.order.status !== "partial") continue;
    if (v.order.date < from) continue;
    for (const l of v.lines) {
      if (l.line.itemType !== "material") continue;
      incoming.set(l.line.itemId, (incoming.get(l.line.itemId) ?? 0) + l.remaining);
    }
  }

  const heldOf = (materialId: string) =>
    batchList(db)
      .filter(
        (v) =>
          v.batch.itemType === "material" &&
          v.batch.itemId === materialId &&
          v.remaining > EPS &&
          (v.batch.status !== "active" || v.expired),
      )
      .reduce((s, v) => s + v.remaining, 0);

  return db.materials
    .map((m) => {
      const onHand = stockQty(db, "material", m.id);
      const reserved = need.get(m.id) ?? 0;
      const held = heldOf(m.id);
      const available = onHand - reserved - held;
      return {
        materialId: m.id,
        name: m.name,
        unit: unitName(db, m.unitId),
        onHand,
        reserved,
        held,
        available,
        incoming: incoming.get(m.id) ?? 0,
        short: available < 0,
      };
    })
    .sort((a, b) => a.available - b.available);
}
