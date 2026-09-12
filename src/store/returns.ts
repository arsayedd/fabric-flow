/**
 * المرتجعات والشكاوى — الحساب
 * ----------------------------
 * كل رقم هنا **محسوب** من سطور المرتجعات نفسها. المخزَّن هو الحركة والقرار
 * بس: رجع كام، بأي حال، بأي سبب، واتقرر فيه إيه. وأي «تكلفة مرتجع» أو
 * «نسبة إرجاع» بتتحسب وقت العرض، فمفيش رقم بيقدم.
 *
 * والقاعدة الحاكمة في الملف ده: **الأثر بيتحسب من القرار مش من الوصول.**
 * المرتجع اللي لسه مستني فحص أثره على الفلوس صفر — لأن محدش قرر حاجة لسه.
 */

import { addDays, cairoToday } from "@/lib/utils";
import { customerCredits, customerRefunds, deliveriesOfModel, isEffective } from "./compute";
import type {
  Complaint,
  ComplaintKind,
  Db,
  ReturnEntry,
  ReturnReason,
  ReturnSource,
} from "./types";
import { RETURN_REASON_DEFS } from "./types";
import type { PermModule } from "./permissions";

/**
 * المرتجع بيتبع صلاحية **الطرف اللي جه منه**، مش صلاحية واحدة اسمها
 * «مرتجعات». مرتجع العميل شغل مبيعات، ومرتجع المورّد شغل مشتريات، ورجوع
 * الخامة من الخط شغل مخازن — فاللي معاه المخزن مايقدرش يعمل إشعار خصم
 * لعميل، واللي معاه المبيعات مايقدرش يرجّع خامة لمورّد.
 */
export const RETURN_MODULE: Record<ReturnSource, PermModule> = {
  customer: "sales",
  supplier: "purchasing",
  production: "inventory",
};

export function nextReturnCode(rows: ReturnEntry[], today = cairoToday()): string {
  const year = Number(today.slice(0, 4));
  const last = rows
    .filter((r) => r.code.includes(`-${year}-`))
    .reduce((max, r) => Math.max(max, Number(r.code.split("-").pop()) || 0), 0);
  return `RET-${year}-${String(last + 1).padStart(6, "0")}`;
}

export function nextComplaintCode(rows: Complaint[], today = cairoToday()): string {
  const year = Number(today.slice(0, 4));
  const last = rows
    .filter((r) => r.code.includes(`-${year}-`))
    .reduce((max, r) => Math.max(max, Number(r.code.split("-").pop()) || 0), 0);
  return `CMP-${year}-${String(last + 1).padStart(6, "0")}`;
}

export function returnById(db: Db, id: string): ReturnEntry | null {
  return db.returns.find((r) => r.id === id) ?? null;
}

export function itemName(db: Db, r: ReturnEntry): string {
  if (r.itemType === "product") return db.products.find((p) => p.id === r.itemId)?.name ?? "منتج محذوف";
  return db.materials.find((m) => m.id === r.itemId)?.name ?? "خامة محذوفة";
}

export function partyName(db: Db, r: ReturnEntry): string {
  if (!r.partyId) return "المصنع نفسه";
  return db.parties.find((p) => p.id === r.partyId)?.name ?? "جهة محذوفة";
}

/* ── تكلفة القطعة ──────────────────────────────────────────────
 *
 * قيمة القطعة الراجعة لها **رقمين مختلفين**: اللي العميل دفعه (`unitValue`
 * المخزَّن في المرتجع) واللي المصنع دفعه لينتجها. والتاني هو اللي بيحدد
 * المصنع استرجع إيه لما القطعة تدخل المخزن تاني.
 *
 * وبنجيبه من أمر الإنتاج لو المرتجع متربط بواحد (`pieceCost` مكتوبة على
 * الأمر)، وإلا من آخر استلام إنتاج تام للمنتج ده في دفتر المخزون. الاتنين
 * أرقام موجودة في الدفتر فعلًا — ومابنقدّرش رقم لو مش موجود، بنرجّع صفر
 * ونقول في سطر الأثر إن الاسترجاع مش محسوب.
 */
export function unitCostOf(db: Db, r: ReturnEntry): number {
  if (r.orderId) {
    const order = db.orders.find((o) => o.id === r.orderId);
    if (order?.pieceCost) return order.pieceCost;
  }
  if (r.itemType === "material") {
    return db.materials.find((m) => m.id === r.itemId)?.avgCost ?? 0;
  }
  const moves = db.stockMovements
    .filter((m) => m.itemType === "product" && m.itemId === r.itemId && m.kind === "receipt_fg" && m.unitCost > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  return moves.length ? moves[0].unitCost : 0;
}

/* ── أثر المرتجع على الربح ─────────────────────────────────────── */

export type ImpactLine = { label: string; amount: number; why: string };

export type ReturnImpact = {
  /** الأثر على الربح بالجنيه — موجب معناه خسارة */
  total: number;
  lines: ImpactLine[];
  /** لسه مافيش قرار، فالأثر صفر مش مجهول */
  pending: boolean;
  /** حاجة محتاجة رقم مش موجود في الدفتر */
  unknown: string | null;
};

/**
 * أثر المرتجع الواحد على الربح.
 *
 * والمعادلة مختلفة حسب مين رجّع، والفرق ده هو كل الموضوع:
 *
 *   **عميل**: المصنع رجّع فلوس (أو خصمها) ودفع مصاريف، ولو القطعة رجعت
 *   المخزن سليمة يبقى استرجع **تكلفتها** — فالخسارة الحقيقية هي الهامش،
 *   مش الفاتورة كلها. ولو القطعة تالفة، الفاتورة كلها ضاعت.
 *
 *   **مورّد**: المصنع رجّع خامة قيمتها كذا وأخد إشعار خصم بكذا — والفرق
 *   بينهم خسارة عليه، زائد الشحن.
 *
 *   **الخط**: خامة راجعة للمخزن مش خسارة أصلًا — إلا لو رجعت تالفة.
 */
export function returnImpact(db: Db, r: ReturnEntry): ReturnImpact {
  const lines: ImpactLine[] = [];
  if (!isEffective(r)) {
    return {
      total: 0,
      lines: [],
      pending: r.status !== "cancelled" && r.resolution !== "reject",
      unknown: null,
    };
  }

  const unitCost = unitCostOf(db, r);
  const goodsValue = r.qty * r.unitValue;
  let unknown: string | null = null;

  if (r.source === "customer") {
    if (r.settleAmount > 0) {
      lines.push({
        label: r.resolution === "refund" ? "فلوس اترجعت" : "خصم على الحساب",
        amount: r.settleAmount,
        why: `${r.qty} × ${Math.round(r.unitValue)} ج قيمة البيع`,
      });
    }
    if (r.resolution === "replacement" && r.replacementQty > 0) {
      if (unitCost > 0) {
        lines.push({
          label: "تكلفة إنتاج البديل",
          amount: r.replacementQty * unitCost,
          why: `${r.replacementQty} قطعة × ${Math.round(unitCost)} ج تكلفة`,
        });
      } else {
        unknown = "تكلفة إنتاج القطعة مش معروفة — ربط المرتجع بأمر الإنتاج بيحسبها";
      }
    }
    if (r.restock && unitCost > 0) {
      lines.push({
        label: "رجع للمخزن",
        amount: -r.qty * unitCost,
        why: `${r.qty} قطعة سليمة × ${Math.round(unitCost)} ج تكلفة — ينفع تتباع تاني`,
      });
    } else if (!r.restock && r.resolution !== "reject") {
      lines.push({
        label: "قطع ماينفعش تتباع",
        amount: 0,
        why: `${r.qty} قطعة خرجت من المخزون خلاص — قيمتها داخلة في الخصم فوق`,
      });
    }
  } else if (r.source === "supplier") {
    if (goodsValue > 0) {
      lines.push({ label: "خامة رجعت للمورّد", amount: goodsValue, why: `${r.qty} × ${Math.round(r.unitValue)} ج سعر الشراء` });
    }
    if (r.settleAmount > 0) {
      lines.push({
        label: r.resolution === "refund" ? "المورّد رجّع فلوس" : "إشعار خصم من المورّد",
        amount: -r.settleAmount,
        why: "بيقلّل المستحق للمورّد",
      });
    }
    if (r.resolution === "replacement" && r.replacementQty > 0) {
      lines.push({
        label: "المورّد باعت بديل",
        amount: -Math.min(goodsValue, r.replacementQty * r.unitValue),
        why: `${r.replacementQty} بديل بنفس السعر`,
      });
    }
  } else {
    if (!r.restock && goodsValue > 0) {
      lines.push({ label: "خامة تالفة مادخلتش المخزن", amount: goodsValue, why: `${r.qty} × ${Math.round(r.unitValue)} ج` });
    }
    if (r.restock) {
      lines.push({ label: "رجعت المخزن", amount: 0, why: "نقل بين الخط والمخزن — مش خسارة" });
    }
  }

  if (r.extraCost > 0) {
    lines.push({ label: r.extraNote.trim() || "مصاريف المرتجع", amount: r.extraCost, why: "شحن رجوع أو إصلاح أو إعادة تعبئة" });
  }

  return {
    total: lines.reduce((s, l) => s + l.amount, 0),
    lines,
    pending: false,
    unknown,
  };
}

/* ── تحليل: أكثر الموديلات إرجاعًا ───────────────────────────── */

export type ModelReturns = {
  productId: string;
  name: string;
  sku: string;
  /** الكمية الراجعة من العملاء */
  qty: number;
  /** أثر المرتجعات على الربح */
  impact: number;
  /** الكمية المتسلّمة للعملاء */
  soldQty: number;
  /** نسبة الإرجاع % — فاضية لو مافيش بيع مسجّل نقارن عليه */
  ratePct: number | null;
  /** أشهر سبب، بالكمية */
  topReason: { reason: ReturnReason; label: string; qty: number } | null;
  count: number;
};

export function modelReturns(db: Db, productId: string): ModelReturns {
  const product = db.products.find((p) => p.id === productId);
  const rows = db.returns.filter(
    (r) => r.source === "customer" && r.itemType === "product" && r.itemId === productId && r.status !== "cancelled",
  );
  const qty = rows.reduce((s, r) => s + r.qty, 0);
  const sold = deliveriesOfModel(db, product?.name ?? "").reduce((s, d) => s + (d.quantity ?? 0), 0);

  const byReason = new Map<ReturnReason, number>();
  for (const r of rows) byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + r.qty);
  const top = [...byReason.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    productId,
    name: product?.name ?? "منتج محذوف",
    sku: product?.sku ?? "",
    qty,
    impact: rows.reduce((s, r) => s + returnImpact(db, r).total, 0),
    soldQty: sold,
    ratePct: sold > 0 ? (qty / sold) * 100 : null,
    topReason: top ? { reason: top[0], label: RETURN_REASON_DEFS[top[0]].label, qty: top[1] } : null,
    count: rows.length,
  };
}

/** الموديلات مرتبة بالكمية الراجعة — واللي مالوش مرتجعات مابيظهرش */
export function topReturnedModels(db: Db): ModelReturns[] {
  return db.products
    .map((p) => modelReturns(db, p.id))
    .filter((r) => r.qty > 0)
    .sort((a, b) => (b.ratePct ?? 0) - (a.ratePct ?? 0) || b.qty - a.qty);
}

/* ── تحليل: باريتو الأسباب ───────────────────────────────────── */

export type ReasonRow = {
  reason: ReturnReason;
  label: string;
  qty: number;
  count: number;
  impact: number;
  pct: number;
  cumPct: number;
};

/**
 * أسباب المرتجعات مرتبة، ومعاها النسبة المتراكمة.
 *
 * والنسبة المتراكمة هي الفايدة الحقيقية: بتقول «تلات أسباب بيعملوا ٨٠٪ من
 * المرتجعات» — فصاحب المصنع يشتغل على التلاتة دول بدل ما يوزّع مجهوده على
 * عشرة أسباب واحد منهم بيعمل ٢٪.
 */
export function reasonPareto(db: Db, source: ReturnSource | "all" = "all"): ReasonRow[] {
  const rows = db.returns.filter((r) => r.status !== "cancelled" && (source === "all" || r.source === source));
  const total = rows.reduce((s, r) => s + r.qty, 0);
  const map = new Map<ReturnReason, { qty: number; count: number; impact: number }>();
  for (const r of rows) {
    const cur = map.get(r.reason) ?? { qty: 0, count: 0, impact: 0 };
    cur.qty += r.qty;
    cur.count += 1;
    cur.impact += returnImpact(db, r).total;
    map.set(r.reason, cur);
  }
  let cum = 0;
  return [...map.entries()]
    .sort((a, b) => b[1].qty - a[1].qty)
    .map(([reason, v]) => {
      const pct = total > 0 ? (v.qty / total) * 100 : 0;
      cum += pct;
      return { reason, label: RETURN_REASON_DEFS[reason].label, qty: v.qty, count: v.count, impact: v.impact, pct, cumPct: cum };
    });
}

/* ── الملخص ────────────────────────────────────────────────────── */

export type ReturnsSummary = {
  open: number;
  inspected: number;
  settledQty: number;
  qty30: number;
  impact30: number;
  impactAll: number;
  /** نسبة الإرجاع على مستوى المصنع في آخر ٩٠ يوم */
  ratePct: number | null;
  bySource: { source: ReturnSource; count: number; qty: number; impact: number }[];
  /** مرتجعات قاعدة أكتر من ٣ أيام بدون قرار */
  stale: ReturnEntry[];
};

export function returnsSummary(db: Db): ReturnsSummary {
  const today = cairoToday();
  const from30 = addDays(today, -30);
  const from90 = addDays(today, -90);
  const live = db.returns.filter((r) => r.status !== "cancelled");
  const recent = live.filter((r) => r.date >= from30);

  const sold90 = db.deliveries
    .filter((d) => d.date >= from90)
    .reduce((s, d) => s + (d.quantity ?? 0), 0);
  const returned90 = live
    .filter((r) => r.source === "customer" && r.date >= from90)
    .reduce((s, r) => s + r.qty, 0);

  const sources: ReturnSource[] = ["customer", "supplier", "production"];

  return {
    open: live.filter((r) => r.status === "open").length,
    inspected: live.filter((r) => r.status === "inspected").length,
    settledQty: live.filter((r) => r.status === "settled").reduce((s, r) => s + r.qty, 0),
    qty30: recent.reduce((s, r) => s + r.qty, 0),
    impact30: recent.reduce((s, r) => s + returnImpact(db, r).total, 0),
    impactAll: live.reduce((s, r) => s + returnImpact(db, r).total, 0),
    ratePct: sold90 > 0 ? (returned90 / sold90) * 100 : null,
    bySource: sources.map((source) => {
      const rows = live.filter((r) => r.source === source);
      return {
        source,
        count: rows.length,
        qty: rows.reduce((s, r) => s + r.qty, 0),
        impact: rows.reduce((s, r) => s + returnImpact(db, r).total, 0),
      };
    }),
    stale: live.filter((r) => r.status !== "settled" && r.date < addDays(today, -3)),
  };
}

/* ── جهة التعامل ──────────────────────────────────────────────── */

export type PartyReturns = {
  count: number;
  qty: number;
  impact: number;
  credits: number;
  refunds: number;
  /** نسبة الإرجاع من كمية التوريدات له */
  ratePct: number | null;
  complaints: number;
  openComplaints: number;
  rows: ReturnEntry[];
};

export function partyReturns(db: Db, partyId: string): PartyReturns {
  const rows = db.returns.filter((r) => r.partyId === partyId && r.status !== "cancelled");
  const qty = rows.reduce((s, r) => s + r.qty, 0);
  const delivered = db.deliveries.filter((d) => d.clientId === partyId).reduce((s, d) => s + (d.quantity ?? 0), 0);
  const complaints = db.complaints.filter((c) => c.partyId === partyId);
  return {
    count: rows.length,
    qty,
    impact: rows.reduce((s, r) => s + returnImpact(db, r).total, 0),
    credits: customerCredits(db).filter((c) => c.partyId === partyId).reduce((s, c) => s + c.amount, 0),
    refunds: customerRefunds(db).filter((c) => c.partyId === partyId).reduce((s, c) => s + c.amount, 0),
    ratePct: delivered > 0 ? (rows.filter((r) => r.source === "customer").reduce((s, r) => s + r.qty, 0) / delivered) * 100 : null,
    complaints: complaints.length,
    openComplaints: complaints.filter((c) => c.status === "open" || c.status === "investigating").length,
    rows,
  };
}

/* ── الشكاوى ──────────────────────────────────────────────────── */

export type ComplaintSummary = {
  open: number;
  investigating: number;
  overdue: Complaint[];
  claimTotal: number;
  byKind: { kind: ComplaintKind; count: number }[];
  /** متوسط أيام الحل للشكاوى اللي اتحلّت */
  avgDays: number | null;
};

export function complaintSummary(db: Db): ComplaintSummary {
  const today = cairoToday();
  const rows = db.complaints;
  const kinds = [...new Set(rows.map((c) => c.kind))];
  const closed = rows.filter((c) => c.resolvedAt);
  const days = closed.map((c) => {
    const from = new Date(c.date).getTime();
    const to = new Date((c.resolvedAt as string).slice(0, 10)).getTime();
    return Math.max(0, Math.round((to - from) / 86400000));
  });
  return {
    open: rows.filter((c) => c.status === "open").length,
    investigating: rows.filter((c) => c.status === "investigating").length,
    overdue: rows.filter((c) => c.dueDate && c.dueDate < today && c.status !== "resolved" && c.status !== "closed"),
    claimTotal: rows.filter((c) => c.status !== "closed").reduce((s, c) => s + c.claimAmount, 0),
    byKind: kinds
      .map((kind) => ({ kind, count: rows.filter((c) => c.kind === kind).length }))
      .sort((a, b) => b.count - a.count),
    avgDays: days.length ? Math.round(days.reduce((s, d) => s + d, 0) / days.length) : null,
  };
}

/** الأسباب اللي تنفع مع المصدر ده — القايمة مش واحدة لكل المصادر */
export function reasonsFor(source: ReturnSource): { reason: ReturnReason; label: string }[] {
  return (Object.entries(RETURN_REASON_DEFS) as [ReturnReason, { label: string; sources: ReturnSource[] }][])
    .filter(([, def]) => def.sources.includes(source))
    .map(([reason, def]) => ({ reason, label: def.label }));
}
