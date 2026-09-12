/**
 * الجودة والمرتجعات — التحليل
 * -----------------------------
 * الملف ده مابيسجّلش حاجة. بيقرا من تلات دفاتر موجودة — الباندلات
 * (`bundleOps`)، والمرتجعات (`returns`)، وأوامر الإصلاح (`repairs`) —
 * ويرد على سؤال واحد: **الجودة بتكلّفنا كام، وليه، ومنين؟**
 *
 * والقاعدة اللي بتحكم الملف: **العيب اللي اتمسك جوه والعيب اللي رجع من
 * برّه نفس المشكلة.** عشان كده الاتنين بيتحسبوا بنفس تصنيف المشاكل
 * (`ProblemKind`)، والباريتو بتاعهم واحد. لو فضلوا في قايمتين، «أكتر
 * مشكلة عندنا» بيبقى ليها إجابتين، وكل واحدة صح لوحدها ومالهاش لازمة.
 *
 * وحاجة تانية مهمة: **أكتر مشكلة في العدد مش أكتر مشكلة في الفلوس.**
 * عشان كده كل باريتو هنا بيترتّب مرتين: مرة بالكمية ومرة بالتكلفة.
 */

import { addDays, cairoToday, moneyPlain, qty as num } from "@/lib/utils";
import { problemOfDefect } from "./floor";
import { operationById } from "./manufacturing";
import { costBreakdown, repairCost, returnImpact, unitCostOf } from "./returns";
import { PROBLEM_DEFS, PROBLEM_LABEL, PROBLEM_ORIGIN_LABEL, ROOT_CAUSE_LABEL } from "./types";
import type { Db, ProblemKind, ProblemOrigin, RepairOrder, ReturnEntry, RootCause } from "./types";

const live = (db: Db) => db.returns.filter((r) => r.status !== "cancelled");

/* ── مركز قيادة الجودة ────────────────────────────────────────── */

export type QualityCenter = {
  days: number;
  /** عدد الحالات */
  cases: number;
  /** قطع المنتجات الراجعة — الخامات وحدتها مختلفة فمابتتجمعش معاها */
  pieces: number;
  /** قيمة البضاعة الراجعة بسعرها وقت المرتجع */
  value: number;
  repairCost: number;
  shippingCost: number;
  scrapCost: number;
  otherCost: number;
  /** صافي الخسارة: أثر كل الحالات على الربح */
  netLoss: number;
  /** نسبة الإرجاع: قطع راجعة من عملاء ÷ قطع متسلّمة، في نفس المدة */
  returnRatePct: number | null;
  /** نسبة الإصلاح من القطع اللي اتقرر فيها إصلاح أو إهلاك */
  repairRatePct: number | null;
  scrapRatePct: number | null;
  /** القطع اللي لسه في دورة الإصلاح */
  inRepair: number;
  /** حالات قاعدة بدون قرار */
  waiting: number;
};

export function qualityCenter(db: Db, days = 30): QualityCenter {
  const from = addDays(cairoToday(), -days);
  const rows = live(db).filter((r) => r.date >= from);
  const reps = (db.repairs ?? []).filter((x) => x.status !== "cancelled" && x.date >= from);

  let repairs = 0;
  let shipping = 0;
  let scrap = 0;
  let other = 0;
  for (const r of rows) {
    for (const c of costBreakdown(db, r).lines) {
      if (c.kind === "repair_labor" || c.kind === "spare_materials" || c.kind === "rework") repairs += c.amount;
      else if (c.kind === "shipping_in" || c.kind === "shipping_out") shipping += c.amount;
      else if (c.kind === "scrap") scrap += c.amount;
      else other += c.amount;
    }
  }

  const delivered = db.deliveries.filter((d) => d.date >= from).reduce((s, d) => s + (d.quantity ?? 0), 0);
  const returnedPieces = rows
    .filter((r) => r.source === "customer" && r.itemType === "product")
    .reduce((s, r) => s + r.qty, 0);

  /*
   * نسبة الإصلاح مقامها **القطع اللي اتقرر فيها إصلاح أو إهلاك** — مش كل
   * المرتجعات. القطعة اللي رجعت سليمة واترجّعت المخزن مالهاش علاقة بسؤال
   * «بنقدر نصلّح قد إيه مما بيتلف»، ولو حطيناها في المقام النسبة بتطلع
   * عالية على طول والرقم بيبقى مطمّن وكاذب.
   */
  const decided = rows.filter((r) => r.resolution === "repair" || r.resolution === "scrap");
  const decidedQty = decided.reduce((s, r) => s + r.qty, 0);
  const repairedQty = decided.filter((r) => r.resolution === "repair").reduce((s, r) => s + r.qty, 0);
  const scrappedQty = decided.filter((r) => r.resolution === "scrap").reduce((s, r) => s + r.qty, 0);

  return {
    days,
    cases: rows.length,
    pieces: rows.filter((r) => r.itemType === "product").reduce((s, r) => s + r.qty, 0),
    value: rows.reduce((s, r) => s + r.qty * r.unitValue, 0),
    repairCost: repairs,
    shippingCost: shipping,
    scrapCost: scrap,
    otherCost: other,
    netLoss: rows.reduce((s, r) => s + returnImpact(db, r).total, 0),
    returnRatePct: delivered > 0 ? (returnedPieces / delivered) * 100 : null,
    repairRatePct: decidedQty > 0 ? (repairedQty / decidedQty) * 100 : null,
    scrapRatePct: decidedQty > 0 ? (scrappedQty / decidedQty) * 100 : null,
    inRepair: reps.filter((x) => x.status === "queued" || x.status === "repairing" || x.status === "qc").reduce((s, x) => s + x.qty, 0),
    waiting: rows.filter((r) => r.status === "open" || r.status === "inspected").length,
  };
}

/* ── باريتو المشاكل: جوه وبرّه في جدول واحد ──────────────────── */

export type ProblemRow = {
  kind: ProblemKind;
  label: string;
  category: string;
  /** قطع اتمسكت جوه المصنع (إعادة تشغيل + هالك على الباندلات) */
  inside: number;
  /** قطع رجعت من العملاء أو من المورّدين */
  outside: number;
  qty: number;
  /** تكلفة المشكلة: أثر مرتجعاتها + تكلفة اللي اتمسك جوه */
  cost: number;
  cases: number;
  pct: number;
  cumPct: number;
};

/**
 * باريتو المشاكل.
 *
 * تكلفة العيب الداخلي بتتحسب بتكلفة القطعة في أمر الإنتاج: القطعة اللي
 * اتهلكت خسارة بتكلفتها، واللي اترجعت للتشغيل بتتحسب **نص** تكلفتها —
 * لأنها مااتلفتش، بس اتشتغلت مرتين. والنص ده تقدير مكتوب هنا بصراحة
 * وموحّد لكل الأسطر، مش رقم مخفي في الحساب.
 */
const REWORK_SHARE = 0.5;

export function problemPareto(db: Db, days = 30): ProblemRow[] {
  const from = addDays(cairoToday(), -days);
  const map = new Map<ProblemKind, { inside: number; outside: number; cost: number; cases: number }>();
  const bump = (k: ProblemKind) => {
    const cur = map.get(k) ?? { inside: 0, outside: 0, cost: 0, cases: 0 };
    map.set(k, cur);
    return cur;
  };

  for (const op of db.bundleOps ?? []) {
    if (op.state !== "done") continue;
    const at = (op.endedAt ?? op.startedAt).slice(0, 10);
    if (at < from) continue;
    const bad = op.qtyRework + op.qtyScrap;
    if (bad <= 0) continue;
    const kind = problemOfDefect(op.defect) ?? "other_problem";
    const cur = bump(kind);
    cur.inside += bad;
    cur.cases += 1;
    const pieceCost = db.orders.find((o) => o.id === op.orderId)?.pieceCost ?? 0;
    cur.cost += op.qtyScrap * pieceCost + op.qtyRework * pieceCost * REWORK_SHARE;
  }

  for (const r of live(db)) {
    if (r.date < from || !r.problem) continue;
    const cur = bump(r.problem);
    cur.outside += r.qty;
    cur.cases += 1;
    cur.cost += returnImpact(db, r).total;
  }

  const rows = [...map.entries()].map(([kind, v]) => ({
    kind,
    label: PROBLEM_LABEL[kind],
    category: PROBLEM_DEFS[kind].category,
    inside: v.inside,
    outside: v.outside,
    qty: v.inside + v.outside,
    cost: v.cost,
    cases: v.cases,
    pct: 0,
    cumPct: 0,
  }));

  const total = rows.reduce((s, r) => s + r.qty, 0);
  rows.sort((a, b) => b.qty - a.qty);
  let cum = 0;
  for (const r of rows) {
    r.pct = total > 0 ? (r.qty / total) * 100 : 0;
    cum += r.pct;
    r.cumPct = cum;
  }
  return rows;
}

/** نفس المشاكل مرتبة **بالفلوس** — لأن أكتر مشكلة في العدد مش أكتر واحدة في التكلفة */
export function costlyProblems(db: Db, days = 30): ProblemRow[] {
  return problemPareto(db, days)
    .filter((r) => r.cost > 0)
    .sort((a, b) => b.cost - a.cost);
}

/* ── جذور المشاكل ─────────────────────────────────────────────── */

export type CauseRow = { cause: RootCause | null; label: string; qty: number; cases: number; pct: number };

/**
 * جذور مشكلة معيّنة.
 *
 * والحالات اللي مالهاش جذر مكتوب **بتتعرض باسمها** «لسه مش محدَّد» بدل ما
 * تتوزّع على الجذور المعروفة بالنسبة. لو وزّعناها، المصنع اللي بيكتب
 * الجذر في ربع الحالات بس هيشوف تحليل واثق مبني على تخمين تلات أرباعه.
 */
export function causesOf(db: Db, problem: ProblemKind | "all" = "all", days = 90): CauseRow[] {
  const from = addDays(cairoToday(), -days);
  const rows = live(db).filter((r) => r.date >= from && r.problem && (problem === "all" || r.problem === problem));
  const map = new Map<RootCause | "none", { qty: number; cases: number }>();
  for (const r of rows) {
    const key = r.rootCause ?? "none";
    const cur = map.get(key) ?? { qty: 0, cases: 0 };
    cur.qty += r.qty;
    cur.cases += 1;
    map.set(key, cur);
  }
  const total = rows.reduce((s, r) => s + r.qty, 0);
  return [...map.entries()]
    .map(([k, v]) => ({
      cause: k === "none" ? null : k,
      label: k === "none" ? "لسه مش محدَّد" : ROOT_CAUSE_LABEL[k],
      qty: v.qty,
      cases: v.cases,
      pct: total > 0 ? (v.qty / total) * 100 : 0,
    }))
    .sort((a, b) => b.qty - a.qty);
}

/* ── مصدر المشكلة ─────────────────────────────────────────────── */

export type OriginRow = { origin: ProblemOrigin | null; label: string; qty: number; cost: number; cases: number; pct: number };

export function originBreakdown(db: Db, days = 90): OriginRow[] {
  const from = addDays(cairoToday(), -days);
  const rows = live(db).filter((r) => r.date >= from);
  const map = new Map<ProblemOrigin | "none", { qty: number; cost: number; cases: number }>();
  for (const r of rows) {
    const key = r.origin ?? "none";
    const cur = map.get(key) ?? { qty: 0, cost: 0, cases: 0 };
    cur.qty += r.qty;
    cur.cost += returnImpact(db, r).total;
    cur.cases += 1;
    map.set(key, cur);
  }
  const total = rows.reduce((s, r) => s + r.qty, 0);
  return [...map.entries()]
    .map(([k, v]) => ({
      origin: k === "none" ? null : k,
      label: k === "none" ? "المصدر مش مكتوب" : PROBLEM_ORIGIN_LABEL[k],
      qty: v.qty,
      cost: v.cost,
      cases: v.cases,
      pct: total > 0 ? (v.qty / total) * 100 : 0,
    }))
    .sort((a, b) => b.qty - a.qty);
}

/* ── الخطوط ───────────────────────────────────────────────────── */

export type LineQuality = {
  line: string;
  /** قطع خرجت من الخط في المدة */
  produced: number;
  /** عيب اتمسك جوه */
  defects: number;
  /** قطع رجعت من العميل من أوامر الخط ده */
  returned: number;
  defectPct: number | null;
  returnPct: number | null;
  cost: number;
};

/**
 * جودة كل خط.
 *
 * والمقارنة بتبقى ليها معنى بشرط واحد: **الخط له إنتاج كفاية**. الخط
 * اللي طلّع ٢٠ قطعة ورجع منها ٢ نسبته ١٠٪ ومالهاش دلالة، فالنسبة
 * بتترجّع `null` تحت حد أدنى بدل ما يطلع في قايمة «أسوأ الخطوط».
 */
const MIN_LINE_PIECES = 50;

export function lineQuality(db: Db, days = 90): LineQuality[] {
  const from = addDays(cairoToday(), -days);
  const lines = new Map<string, { produced: number; defects: number; returned: number; cost: number }>();
  const get = (line: string) => {
    const key = line.trim() || "بدون خط";
    const cur = lines.get(key) ?? { produced: 0, defects: 0, returned: 0, cost: 0 };
    lines.set(key, cur);
    return cur;
  };

  for (const op of db.bundleOps ?? []) {
    if (op.state !== "done") continue;
    const at = (op.endedAt ?? op.startedAt).slice(0, 10);
    if (at < from) continue;
    const order = db.orders.find((o) => o.id === op.orderId);
    const cur = get(order?.line ?? "");
    cur.produced += op.qtyGood;
    cur.defects += op.qtyRework + op.qtyScrap;
    cur.cost += (op.qtyScrap + op.qtyRework * REWORK_SHARE) * (order?.pieceCost ?? 0);
  }

  for (const r of live(db)) {
    if (r.date < from || r.source !== "customer") continue;
    const line = r.line.trim() || db.orders.find((o) => o.id === r.orderId)?.line || "";
    if (!line) continue;
    const cur = get(line);
    cur.returned += r.qty;
    cur.cost += returnImpact(db, r).total;
  }

  return [...lines.entries()]
    .map(([line, v]) => ({
      line,
      produced: v.produced,
      defects: v.defects,
      returned: v.returned,
      defectPct: v.produced + v.defects >= MIN_LINE_PIECES ? (v.defects / (v.produced + v.defects)) * 100 : null,
      returnPct: v.produced >= MIN_LINE_PIECES ? (v.returned / v.produced) * 100 : null,
      cost: v.cost,
    }))
    .sort((a, b) => (b.defectPct ?? -1) - (a.defectPct ?? -1));
}

/** الخط اللي نسبة عيبه أعلى من متوسط المصنع بفرق يستاهل الكلام */
export function lineAlerts(db: Db, days = 90): { line: string; pct: number; avg: number; cost: number }[] {
  const rows = lineQuality(db, days).filter((l) => l.defectPct !== null);
  if (rows.length < 2) return [];
  const avg = rows.reduce((s, l) => s + (l.defectPct ?? 0), 0) / rows.length;
  return rows
    .filter((l) => (l.defectPct ?? 0) > avg * 1.5 && (l.defectPct ?? 0) - avg >= 1)
    .map((l) => ({ line: l.line, pct: l.defectPct as number, avg, cost: l.cost }));
}

/* ── العمال ───────────────────────────────────────────────────── */

export type WorkerQuality = {
  workerId: string;
  name: string;
  produced: number;
  defects: number;
  rework: number;
  scrap: number;
  defectPct: number | null;
  /** تكلفة عيوبه بالجنيه */
  cost: number;
  /** درجة من ١٠٠ — قياس مش تقييم، ومالهاش معنى تحت حد أدنى من الإنتاج */
  score: number | null;
  topProblem: { kind: ProblemKind; label: string; qty: number } | null;
};

const MIN_WORKER_PIECES = 100;

/**
 * ملف جودة العامل.
 *
 * والرقم ده **قياس مش تقييم**: بيقول العيب في شغله كام في المية، مش
 * بيقول هو كويس ولا وحش. والفرق مهم لأن العامل اللي على عملية صعبة
 * نسبة عيبه أعلى بطبيعتها — وعشان كده الشاشة بتعرض العملية جنب الرقم.
 *
 * والدرجة بتترجّع `null` تحت مية قطعة: العامل اللي طلّع ٣٠ قطعة وفيهم
 * ٢ عيب مايتحطش في ترتيب قدام واحد طلّع ٣٠٠٠.
 */
export function workerQuality(db: Db, days = 90): WorkerQuality[] {
  const from = addDays(cairoToday(), -days);
  const map = new Map<string, { produced: number; rework: number; scrap: number; cost: number; problems: Map<ProblemKind, number> }>();

  for (const op of db.bundleOps ?? []) {
    if (op.state !== "done" || !op.workerId) continue;
    const at = (op.endedAt ?? op.startedAt).slice(0, 10);
    if (at < from) continue;
    const cur = map.get(op.workerId) ?? { produced: 0, rework: 0, scrap: 0, cost: 0, problems: new Map() };
    cur.produced += op.qtyGood;
    cur.rework += op.qtyRework;
    cur.scrap += op.qtyScrap;
    const pieceCost = db.orders.find((o) => o.id === op.orderId)?.pieceCost ?? 0;
    cur.cost += (op.qtyScrap + op.qtyRework * REWORK_SHARE) * pieceCost;
    const kind = problemOfDefect(op.defect);
    if (kind && op.qtyRework + op.qtyScrap > 0) cur.problems.set(kind, (cur.problems.get(kind) ?? 0) + op.qtyRework + op.qtyScrap);
    map.set(op.workerId, cur);
  }

  /* والمرتجع اللي اتحدد إن مصدره عامل معيّن بيتحسب عليه كمان */
  for (const r of live(db)) {
    if (r.date < from || !r.workerId || r.origin !== "worker") continue;
    const cur = map.get(r.workerId) ?? { produced: 0, rework: 0, scrap: 0, cost: 0, problems: new Map() };
    cur.scrap += r.qty;
    cur.cost += returnImpact(db, r).total;
    if (r.problem) cur.problems.set(r.problem, (cur.problems.get(r.problem) ?? 0) + r.qty);
    map.set(r.workerId, cur);
  }

  return [...map.entries()]
    .map(([workerId, v]) => {
      const defects = v.rework + v.scrap;
      const base = v.produced + defects;
      const pct = base >= MIN_WORKER_PIECES ? (defects / base) * 100 : null;
      const top = [...v.problems.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        workerId,
        name: db.workers.find((w) => w.id === workerId)?.name ?? "عامل محذوف",
        produced: v.produced,
        defects,
        rework: v.rework,
        scrap: v.scrap,
        defectPct: pct,
        cost: v.cost,
        // ٢٪ عيب = ١٠٠، و١٢٪ = صفر
        score: pct === null ? null : Math.max(0, Math.min(100, Math.round(100 - Math.max(0, pct - 2) * 10))),
        topProblem: top ? { kind: top[0], label: PROBLEM_LABEL[top[0]], qty: top[1] } : null,
      };
    })
    .sort((a, b) => (b.defectPct ?? -1) - (a.defectPct ?? -1));
}

/* ── المورّدين ────────────────────────────────────────────────── */

export type SupplierQuality = {
  partyId: string;
  name: string;
  /** خامة اتسلّمناها منه في المدة، بقيمتها */
  received: number;
  /** قطع أو أمتار رجعناها له */
  returnedQty: number;
  returnedValue: number;
  /** مشاكل مصدرها المورّد أو خامته */
  attributedCases: number;
  costImpact: number;
  returnPct: number | null;
  score: number | null;
};

/**
 * جودة المورّد.
 *
 * والسكور هنا **مش نفس** التكلفة الحقيقية في طبقة الاستنتاجات: ده بيقيس
 * الجودة لوحدها (رجع قد إيه، وكلّف قد إيه)، والتكلفة الحقيقية بتضيف
 * عليها السعر والهالك. الاتنين مقصودين: واحد بيجاوب «المورّد ده بضاعته
 * كويسة؟» والتاني «المورّد ده أرخص فعلًا؟».
 */
export function supplierQuality(db: Db, days = 180): SupplierQuality[] {
  const from = addDays(cairoToday(), -days);
  const out: SupplierQuality[] = [];

  for (const p of db.parties) {
    if (!p.roles.includes("supplier")) continue;
    const received = db.costEntries
      .filter((e) => e.partyId === p.id && e.date >= from)
      .reduce((s, e) => s + e.amount, 0);
    if (received <= 0) continue;

    const rows = live(db).filter((r) => r.date >= from && r.partyId === p.id && r.source === "supplier");
    const attributed = live(db).filter(
      (r) => r.date >= from && (r.origin === "supplier" || r.origin === "material") && r.partyId === p.id,
    );
    const returnedValue = rows.reduce((s, r) => s + r.qty * r.unitValue, 0);
    const cost = [...new Set([...rows, ...attributed])].reduce((s, r) => s + returnImpact(db, r).total, 0);
    const pct = received > 0 ? (returnedValue / received) * 100 : null;

    out.push({
      partyId: p.id,
      name: p.name,
      received,
      returnedQty: rows.reduce((s, r) => s + r.qty, 0),
      returnedValue,
      attributedCases: attributed.length,
      costImpact: cost,
      returnPct: pct,
      // ١٪ رجوع من قيمة المشتريات = ١٠٠، و٦٪ = صفر
      score: pct === null ? null : Math.max(0, Math.min(100, Math.round(100 - Math.max(0, pct - 1) * 20))),
    });
  }

  return out.sort((a, b) => (a.score ?? 101) - (b.score ?? 101));
}

/* ── تكلفة الجودة الرديئة ─────────────────────────────────────── */

export type CopqBlock = {
  key: "prevention" | "appraisal" | "internal" | "external";
  label: string;
  amount: number | null;
  why: string;
  missing: string | null;
};

export type Copq = {
  blocks: CopqBlock[];
  total: number;
  /** نسبة المحسوب من الإيراد في نفس المدة */
  ofRevenuePct: number | null;
  revenue: number;
  coverage: number;
};

/**
 * تكلفة الجودة الرديئة (COPQ).
 *
 * أربع بنود متعارف عليهم، واتنين منهم بس اللي المصنع بيسجّل بياناتهم
 * دلوقتي. والاتنين التانيين **بيتقالوا بالاسم إنهم مش محسوبين** بدل ما
 * نحط صفر — الصفر هنا كذب، معناه «مابنصرفش على المنع» وده مش صحيح،
 * الصح إن الصرف ده مش بيتسجّل في النظام أصلًا.
 */
export function copq(db: Db, days = 30): Copq {
  const from = addDays(cairoToday(), -days);

  let internal = 0;
  for (const op of db.bundleOps ?? []) {
    if (op.state !== "done") continue;
    const at = (op.endedAt ?? op.startedAt).slice(0, 10);
    if (at < from) continue;
    const pieceCost = db.orders.find((o) => o.id === op.orderId)?.pieceCost ?? 0;
    internal += (op.qtyScrap + op.qtyRework * REWORK_SHARE) * pieceCost;
  }
  for (const m of db.stockMovements) {
    if (m.kind !== "waste" || m.date < from) continue;
    internal += Math.abs(m.qty) * m.unitCost;
  }

  const rows = live(db).filter((r) => r.date >= from && r.source === "customer");
  const external = rows.reduce((s, r) => s + returnImpact(db, r).total, 0);

  const appraisal = live(db)
    .filter((r) => r.date >= from)
    .reduce((s, r) => s + (r.costs ?? []).filter((c) => c.kind === "inspection").reduce((x, c) => x + c.amount, 0), 0);

  const revenue = db.deliveries.filter((d) => d.date >= from).reduce((s, d) => s + d.amount, 0);

  const blocks: CopqBlock[] = [
    {
      key: "prevention",
      label: "تكلفة المنع",
      amount: null,
      why: "التدريب والصيانة الوقائية وضبط الماكينات",
      missing: "مفيش سجل تدريب ولا صيانة في النظام — الرقم ده مايتخمّنش",
    },
    {
      key: "appraisal",
      label: "تكلفة الفحص",
      amount: appraisal,
      why: "بنود الفحص المسجّلة على حالات المرتجع",
      missing: "وقت الفحص جوه المصنع مش مسجّل كعملية، فاللي هنا الفحص المدفوع بس",
    },
    {
      key: "internal",
      label: "فشل داخلي",
      amount: internal,
      why: "الهالك وإعادة التشغيل على الباندلات، وهالك الخامات في دفتر المخزون",
      missing: null,
    },
    {
      key: "external",
      label: "فشل خارجي",
      amount: external,
      why: "أثر مرتجعات العملاء على الربح",
      missing: null,
    },
  ];

  const known = blocks.filter((b) => b.amount !== null);
  const total = known.reduce((s, b) => s + (b.amount ?? 0), 0);

  return {
    blocks,
    total,
    revenue,
    ofRevenuePct: revenue > 0 ? (total / revenue) * 100 : null,
    coverage: (known.length / blocks.length) * 100,
  };
}

/* ── تنبيهات الجودة ───────────────────────────────────────────── */

export type QualityAlert = {
  key: string;
  headline: string;
  why: string[];
  action: string;
  cost: number;
  to: string;
};

/**
 * التنبيهات.
 *
 * الشرط الوحيد هنا إن التنبيه **يكون مبني على مقارنة**، مش على رقم
 * لوحده. «رجع ٤٠ قطعة» مش تنبيه؛ «الموديل ده لوحده عامل ٣٧٪ من مرتجعات
 * الشهر، ونسبته طلعت من ٢٫١٪ لـ٥٫٨٪» تنبيه، لأن فيه حاجة اتغيّرت.
 */
export function qualityAlerts(db: Db, days = 30): QualityAlert[] {
  const today = cairoToday();
  const from = addDays(today, -days);
  const prevFrom = addDays(today, -days * 2);
  const rows = live(db).filter((r) => r.date >= from && r.source === "customer" && r.itemType === "product");
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const out: QualityAlert[] = [];

  /* ١) موديل بيغطّي نصيب كبير من مرتجعات الفترة */
  const byModel = new Map<string, ReturnEntry[]>();
  for (const r of rows) byModel.set(r.itemId, [...(byModel.get(r.itemId) ?? []), r]);

  for (const [productId, list] of byModel) {
    const qty = list.reduce((s, r) => s + r.qty, 0);
    const share = totalQty > 0 ? (qty / totalQty) * 100 : 0;
    if (share < 30 || list.length < 2) continue;

    const product = db.products.find((p) => p.id === productId);
    const delivered = db.deliveries
      .filter((d) => d.date >= from && d.model.trim() === (product?.name ?? "").trim())
      .reduce((s, d) => s + (d.quantity ?? 0), 0);
    const prevDelivered = db.deliveries
      .filter((d) => d.date >= prevFrom && d.date < from && d.model.trim() === (product?.name ?? "").trim())
      .reduce((s, d) => s + (d.quantity ?? 0), 0);
    const prevQty = live(db)
      .filter((r) => r.date >= prevFrom && r.date < from && r.itemId === productId && r.source === "customer")
      .reduce((s, r) => s + r.qty, 0);

    const rate = delivered > 0 ? (qty / delivered) * 100 : null;
    const prevRate = prevDelivered > 0 ? (prevQty / prevDelivered) * 100 : null;

    const problems = new Map<ProblemKind, number>();
    for (const r of list) if (r.problem) problems.set(r.problem, (problems.get(r.problem) ?? 0) + r.qty);
    const topProblem = [...problems.entries()].sort((a, b) => b[1] - a[1])[0];

    const lines = new Map<string, number>();
    for (const r of list) {
      const line = r.line.trim() || db.orders.find((o) => o.id === r.orderId)?.line || "";
      if (line) lines.set(line, (lines.get(line) ?? 0) + r.qty);
    }
    const topLine = [...lines.entries()].sort((a, b) => b[1] - a[1])[0];

    const why = [`${num(qty, 0)} قطعة في ${num(list.length, 0)} حالة من إجمالي ${num(totalQty, 0)} قطعة راجعة`];
    if (topProblem) why.push(`أشهر مشكلة: ${PROBLEM_LABEL[topProblem[0]]} — ${num(topProblem[1], 0)} قطعة`);
    if (topLine) why.push(`أكتر خط متأثر: ${topLine[0]}`);
    if (rate !== null && prevRate !== null) {
      why.push(`نسبة الإرجاع للموديل ده ${num(prevRate, 1)}٪ → ${num(rate, 1)}٪`);
    } else if (rate !== null) {
      why.push(`نسبة الإرجاع للموديل ده ${num(rate, 1)}٪ في المدة دي`);
    }

    out.push({
      key: `model-${productId}`,
      headline: `${product?.name ?? "موديل"} لوحده عامل ${num(Math.round(share), 0)}٪ من مرتجعات آخر ${num(days, 0)} يوم.`,
      why,
      action: topProblem
        ? `ابص على ${PROBLEM_LABEL[topProblem[0]]} في ${topLine ? topLine[0] : "خط الإنتاج"} قبل ما تشغّل الدفعة الجاية.`
        : "اكتب المشكلة على الحالات دي عشان نعرف نوجّه الفحص.",
      cost: list.reduce((s, r) => s + returnImpact(db, r).total, 0),
      /* تحليل الموديلات هو المكان اللي بيقول نسبة الإرجاع لكل موديل بمقامها */
      to: "/returns?tab=models",
    });
  }

  /* ٢) خط نسبة عيبه أعلى من متوسط المصنع */
  for (const a of lineAlerts(db, 90)) {
    out.push({
      key: `line-${a.line}`,
      headline: `${a.line}: نسبة العيب ${num(a.pct, 1)}٪ والمتوسط ${num(a.avg, 1)}٪.`,
      why: [
        `الفرق ${num(a.pct - a.avg, 1)} نقطة فوق متوسط باقي الخطوط`,
        `كلّف ${moneyPlain(a.cost)} في ٩٠ يوم`,
      ],
      action: "قارن العمليات على الخط ده بنفس العمليات على خط تاني — الفرق بيبان في عملية واحدة غالبًا.",
      cost: a.cost,
      to: "/floor",
    });
  }

  /* ٣) مشكلة غالية مش أكتر مشكلة في العدد — الترتيبين مختلفين */
  const byQty = problemPareto(db, days);
  const byCost = costlyProblems(db, days);
  if (byQty.length >= 3 && byCost.length >= 1 && byQty[0].kind !== byCost[0].kind) {
    const q = byQty[0];
    const c = byCost[0];
    out.push({
      key: "cost-vs-count",
      headline: `أكتر مشكلة بالعدد «${q.label}»، وأغلى مشكلة «${c.label}».`,
      why: [
        `${q.label}: ${num(q.qty, 0)} قطعة وتكلفتها ${moneyPlain(q.cost)}`,
        `${c.label}: ${num(c.qty, 0)} قطعة وتكلفتها ${moneyPlain(c.cost)}`,
      ],
      action: `لو هتشتغل على حاجة واحدة الشهر ده، «${c.label}» بتوفّر أكتر رغم إنها أقل في العدد.`,
      cost: c.cost,
      to: "/quality?tab=problems",
    });
  }

  return out.sort((a, b) => b.cost - a.cost);
}

/* ── أوامر الإصلاح ────────────────────────────────────────────── */

export type RepairSummary = {
  open: number;
  inQc: number;
  ready: number;
  piecesInRepair: number;
  cost: number;
  /** متوسط تكلفة إصلاح القطعة */
  perPiece: number | null;
  /** نسبة اللي عدّى الفحص من اللي اتفحص */
  passPct: number | null;
  /** متوسط دقايق إصلاح القطعة */
  minutesPerPiece: number | null;
};

export function repairSummary(db: Db): RepairSummary {
  const rows = (db.repairs ?? []).filter((r) => r.status !== "cancelled");
  const costs = rows.map(repairCost);
  const totalCost = costs.reduce((s, c) => s + c.total, 0);
  const qty = rows.reduce((s, r) => s + r.qty, 0);
  const checked = rows.filter((r) => r.qcAt);
  const passed = checked.reduce((s, r) => s + r.qtyPassed, 0);
  const failed = checked.reduce((s, r) => s + r.qtyFailed, 0);
  const timed = rows.filter((r) => r.minutes > 0 && r.qty > 0);

  return {
    open: rows.filter((r) => r.status === "queued" || r.status === "repairing").length,
    inQc: rows.filter((r) => r.status === "qc").length,
    ready: rows.filter((r) => r.status === "ready").length,
    piecesInRepair: rows
      .filter((r) => r.status === "queued" || r.status === "repairing" || r.status === "qc")
      .reduce((s, r) => s + r.qty, 0),
    cost: totalCost,
    perPiece: qty > 0 ? totalCost / qty : null,
    passPct: passed + failed > 0 ? (passed / (passed + failed)) * 100 : null,
    minutesPerPiece: timed.length ? timed.reduce((s, r) => s + r.minutes, 0) / timed.reduce((s, r) => s + r.qty, 0) : null,
  };
}

/**
 * هل الإصلاح كان يستاهل؟
 *
 * السؤال ده مالوش شاشة في أي نظام تقريبًا، وهو أهم سؤال في الإصلاح:
 * تكلفة إصلاح القطعة مقابل تكلفة إنتاجها من الأول. لو الإصلاح بيقرّب من
 * التكلفة، الإهلاك أرخص — وده قرار برقم مش بإحساس.
 */
export function repairWorth(db: Db, rep: RepairOrder): { repair: number; make: number; worth: boolean | null } {
  const r = db.returns.find((x) => x.id === rep.returnId);
  const make = r ? unitCostOf(db, r) : 0;
  const repair = repairCost(rep).perPiece;
  return { repair, make, worth: make > 0 ? repair < make * 0.6 : null };
}


/** اسم العملية المرتبطة بالحالة، لو مكتوبة */
export function operationName(db: Db, id: string | null): string | null {
  return id ? (operationById(db, id)?.name ?? null) : null;
}
