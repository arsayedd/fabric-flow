/**
 * صنعة — أرض المصنع وتتبع العملية (M-S2)
 *
 * الفرق بين «الإنتاج = ٥٠٠ قطعة» و**تتبع العملية** هو السؤال: القطعة
 * وصلت لفين، ومين شغّال عليها، وقعدت قد إيه. عشان كده كل تسجيل هنا
 * بيبدأ من **باندل** مش من أمر: الباندل بيتفتح على عملية، بيشتغل، ممكن
 * يتوقف، وبيخلص — والوقت بيتسجّل لوحده من الساعة، مش بيتكتب بالإيد.
 *
 * القواعد:
 *  1) **الكميات مالهاش دفترين.** لما العملية تخلص، الكميات بتتسجّل في
 *     دفتر الإنتاج (`StageEntry`) زي أي تسجيل تاني، والـ`BundleOp`
 *     بيشاور عليه. فالتقدّم والتكلفة والأجور كلها فاضلة على مصدر واحد.
 *  2) **الكفاءة مش نسبة مجاملة.** الكفاءة = الدقايق المعيارية اللي
 *     العامل طلّعها ÷ الدقايق اللي قعدها فعلًا (بعد خصم التوقف). لو
 *     العملية مالهاش زمن معياري، مافيش كفاءة — ومابنخترعش رقم.
 *  3) **مفيش هدف من السقف.** هدف الخط اليومي بيتحسب من الأوامر نفسها:
 *     الباقي ÷ أيام العمل اللي فاضلة لميعاد التسليم.
 *  4) الشاشة **مابتخزّنش حالة**. كل لون وكل رقم فيها محسوب وقت العرض.
 */

import { addDays, cairoToday } from "@/lib/utils";
import { operationById, orderStages, routingLines } from "./manufacturing";
import { capacityBase, isWorkDay, workDaysBetween } from "./planning";
import type { Bundle, BundleOp, Db, FloorIssue, Order } from "./types";

/** أسباب العيب الشائعة — قائمة مساعدة، والمشرف يقدر يكتب سبب تاني */
export const DEFECT_REASONS = [
  "غرزة مفتوحة",
  "قص غلط",
  "مقاس مش مطابق",
  "بقعة أو وسخ",
  "لون مختلف",
  "زرار أو سوستة",
  "خرم أو شرخ",
  "مكوى",
] as const;

/* ── وقت العملية ─────────────────────────────────────────────── */

const MIN = 60_000;

/** الدقايق اللي العملية قعدتها فعلًا — بعد خصم التوقف */
export function opMinutes(op: BundleOp, now = Date.now()): number {
  const end = op.endedAt ? Date.parse(op.endedAt) : op.state === "paused" && op.pausedAt ? Date.parse(op.pausedAt) : now;
  const gross = Math.max(0, (end - Date.parse(op.startedAt)) / MIN);
  return Math.max(0, gross - op.pausedMinutes);
}

/** دقايق التوقف الحالية — لو لسه واقف، الوقت بيجري */
export function pausedMinutesNow(op: BundleOp, now = Date.now()): number {
  const live = op.state === "paused" && op.pausedAt ? Math.max(0, (now - Date.parse(op.pausedAt)) / MIN) : 0;
  return op.pausedMinutes + live;
}

/* ── الباندل: هو فين دلوقتي ──────────────────────────────────── */

export type BundleStep = {
  op: BundleOp;
  operationName: string;
  workerName: string;
  minutes: number;
  stdTotal: number;
  /** الكفاءة % — null لو مفيش زمن معياري */
  efficiencyPct: number | null;
};

export function bundleTrail(db: Db, bundleId: string, now = Date.now()): BundleStep[] {
  return (db.bundleOps ?? [])
    .filter((o) => o.bundleId === bundleId)
    .sort((a, b) => (a.seq === b.seq ? a.startedAt.localeCompare(b.startedAt) : a.seq - b.seq))
    .map((op) => {
      const minutes = opMinutes(op, now);
      const stdTotal = op.stdMinutes * (op.state === "done" ? op.qtyGood + op.qtyRework : 0);
      return {
        op,
        operationName: operationById(db, op.operationId)?.name ?? "عملية",
        workerName: db.workers.find((w) => w.id === op.workerId)?.name ?? "—",
        minutes,
        stdTotal,
        efficiencyPct: op.state === "done" && op.stdMinutes > 0 && minutes > 0 ? (stdTotal / minutes) * 100 : null,
      };
    });
}

export type BundleState = {
  bundle: Bundle;
  order: Order | null;
  orderCode: string;
  /** العملية اللي شغالة أو واقفة دلوقتي */
  active: BundleOp | null;
  /** العملية الجاهزة تبدأ — أول خطوة في المسار ماخلصتش */
  nextSeq: number | null;
  nextOperationId: string | null;
  nextOperationName: string | null;
  doneSteps: number;
  totalSteps: number;
  goodOut: number;
  scrap: number;
  rework: number;
  done: boolean;
  label: string;
};

export function bundleState(db: Db, bundle: Bundle): BundleState {
  const order = db.orders.find((o) => o.id === bundle.orderId) ?? null;
  const routes = order?.productId ? routingLines(db, order.productId) : [];
  const ops = (db.bundleOps ?? []).filter((o) => o.bundleId === bundle.id);
  const active = ops.find((o) => o.state === "running" || o.state === "paused") ?? null;
  const doneSeqs = new Set(ops.filter((o) => o.state === "done").map((o) => o.seq));

  /**
   * القص **مابيتسجّلش على الباندل**: الباندل أصلًا موجود لأن الفرشة
   * اتقصّت، والقص اتسجّل مرة واحدة على الفرشة كلها. فأي عملية رقمها
   * أقل من أو يساوي عملية القص بتتحسب خالصة، وإلا كل باندل كان
   * هيستنى «قص» تاني ماحدش هيعمله.
   */
  const lay = bundle.layId ? (db.cutLays ?? []).find((l) => l.id === bundle.layId) : null;
  if (lay?.status === "cut" && lay.operationId) {
    const cutSeq = routes.find((r) => r.operationId === lay.operationId)?.seq ?? 0;
    for (const r of routes) if (r.seq <= cutSeq) doneSeqs.add(r.seq);
  }
  const next = routes.find((r) => !doneSeqs.has(r.seq) && r.seq !== active?.seq) ?? null;
  const lastDone = ops
    .filter((o) => o.state === "done")
    .sort((a, b) => b.seq - a.seq)[0];

  const done = routes.length > 0 && routes.every((r) => doneSeqs.has(r.seq));
  return {
    bundle,
    order,
    orderCode: order?.code ?? "—",
    active,
    nextSeq: next?.seq ?? null,
    nextOperationId: next?.operationId ?? null,
    nextOperationName: next?.name ?? null,
    doneSteps: doneSeqs.size,
    totalSteps: routes.length,
    goodOut: lastDone?.qtyGood ?? 0,
    scrap: ops.reduce((s, o) => s + o.qtyScrap, 0),
    rework: ops.reduce((s, o) => s + o.qtyRework, 0),
    done,
    label: active
      ? `${active.state === "paused" ? "واقف عند" : "شغّال في"} ${operationById(db, active.operationId)?.name ?? "عملية"}`
      : done
        ? "خلص كل العمليات"
        : next
          ? `مستني ${next.name}`
          : routes.length
            ? "مستني"
            : "المنتج مالوش مسار تصنيع",
  };
}

export function bundleByCode(db: Db, code: string): Bundle | undefined {
  const clean = code.trim().toUpperCase();
  return (db.bundles ?? []).find((b) => b.code.toUpperCase() === clean);
}

/**
 * أقصى كمية العملية دي تقدر تسجّلها دلوقتي، والسبب.
 *
 * الحارس اللي في الميوتيشن بيرفض التسجيل اللي بيعدّي كمية الأمر أو
 * بيعدّي المرحلة اللي قبلها. بس **الرفض بعد ما العامل يكتب أسوأ من
 * رقم مكتوب قدامه من الأول**: الباندل ٢٠ قطعة والخياطة سلّمت ١٦ بس،
 * فالمكوى مالهاش غير ١٦. الدالة دي بترجّع الرقم ده عشان الفورم
 * تبدأ بيه والشاشة تقول سببه.
 */
export function opAllowance(db: Db, op: BundleOp): { max: number; why: string } {
  const bundle = (db.bundles ?? []).find((b) => b.id === op.bundleId);
  const order = db.orders.find((o) => o.id === op.orderId);
  if (!bundle || !order) return { max: 0, why: "" };

  let max = bundle.qty;
  let why = "";

  const stages = orderStages(db, order);
  const idx = stages.findIndex((s) => s.operationId === op.operationId);
  const here = stages[idx];
  const done = (here?.good ?? 0) + (here?.scrap ?? 0);

  const byOrder = order.quantity - done;
  if (byOrder < max) {
    max = byOrder;
    why = `كمية الأمر ${order.quantity} والمرحلة دي سجّلت ${done}`;
  }
  if (idx > 0) {
    const byPrev = stages[idx - 1].good - done;
    if (byPrev < max) {
      max = byPrev;
      why = `مرحلة ${stages[idx - 1].name} سلّمت ${stages[idx - 1].good} بس`;
    }
  }
  return { max: Math.max(0, max), why };
}

/* ── الشغل الجاري بين العمليات (WIP) ─────────────────────────── */

export type WipRow = {
  operationId: string;
  name: string;
  seq: number;
  /** باندلات مستنية العملية دي */
  waiting: number;
  waitingPieces: number;
  /** باندلات شغالة فيها دلوقتي */
  running: number;
  runningPieces: number;
  /** باندلات واقفة */
  paused: number;
  doneToday: number;
};

export function wip(db: Db): WipRow[] {
  const today = cairoToday();
  const rows = new Map<string, WipRow>();
  const put = (operationId: string, seq: number): WipRow => {
    const found = rows.get(operationId);
    if (found) return found;
    const row: WipRow = {
      operationId,
      name: operationById(db, operationId)?.name ?? "عملية",
      seq,
      waiting: 0,
      waitingPieces: 0,
      running: 0,
      runningPieces: 0,
      paused: 0,
      doneToday: 0,
    };
    rows.set(operationId, row);
    return row;
  };

  for (const bundle of db.bundles ?? []) {
    const st = bundleState(db, bundle);
    if (st.active) {
      const row = put(st.active.operationId, st.active.seq);
      if (st.active.state === "paused") row.paused += 1;
      row.running += 1;
      row.runningPieces += bundle.qty;
    } else if (st.nextOperationId && st.nextSeq !== null) {
      const row = put(st.nextOperationId, st.nextSeq);
      row.waiting += 1;
      row.waitingPieces += bundle.qty;
    }
  }

  for (const op of db.bundleOps ?? []) {
    if (op.state !== "done" || !op.endedAt?.startsWith(today)) continue;
    put(op.operationId, op.seq).doneToday += op.qtyGood;
  }

  return [...rows.values()].sort((a, b) => a.seq - b.seq);
}

/* ── الكفاءة ─────────────────────────────────────────────────── */

export type EfficiencyRow = {
  id: string;
  name: string;
  pieces: number;
  /** دقايق معيارية طلعت */
  earnedMinutes: number;
  /** دقايق قعدها فعلًا */
  workedMinutes: number;
  pausedMinutes: number;
  efficiencyPct: number | null;
  rework: number;
  scrap: number;
  defectPct: number;
  ops: number;
};

function efficiencyOf(rows: BundleOp[], id: string, name: string): EfficiencyRow {
  const done = rows.filter((o) => o.state === "done");
  const pieces = done.reduce((s, o) => s + o.qtyGood, 0);
  const earned = done.reduce((s, o) => s + o.stdMinutes * (o.qtyGood + o.qtyRework), 0);
  const worked = done.reduce((s, o) => s + opMinutes(o), 0);
  const rework = done.reduce((s, o) => s + o.qtyRework, 0);
  const scrap = done.reduce((s, o) => s + o.qtyScrap, 0);
  const total = pieces + rework + scrap;
  // الكفاءة بتتحسب من التسجيلات اللي ليها زمن معياري بس — غيرها مالهاش بسط
  const hasStd = done.some((o) => o.stdMinutes > 0);
  return {
    id,
    name,
    pieces,
    earnedMinutes: earned,
    workedMinutes: worked,
    pausedMinutes: done.reduce((s, o) => s + o.pausedMinutes, 0),
    efficiencyPct: hasStd && worked > 0 ? (earned / worked) * 100 : null,
    rework,
    scrap,
    defectPct: total > 0 ? ((rework + scrap) / total) * 100 : 0,
    ops: done.length,
  };
}

export function workerEfficiency(db: Db, days = 7): EfficiencyRow[] {
  const from = addDays(cairoToday(), -days);
  const ops = (db.bundleOps ?? []).filter((o) => o.state === "done" && (o.endedAt ?? o.startedAt) >= from);
  const byWorker = new Map<string, BundleOp[]>();
  for (const op of ops) {
    if (!op.workerId) continue;
    byWorker.set(op.workerId, [...(byWorker.get(op.workerId) ?? []), op]);
  }
  return [...byWorker.entries()]
    .map(([id, rows]) => efficiencyOf(rows, id, db.workers.find((w) => w.id === id)?.name ?? "عامل"))
    .sort((a, b) => (b.efficiencyPct ?? -1) - (a.efficiencyPct ?? -1));
}

export function lineEfficiency(db: Db, days = 7): EfficiencyRow[] {
  const from = addDays(cairoToday(), -days);
  const ops = (db.bundleOps ?? []).filter((o) => o.state === "done" && (o.endedAt ?? o.startedAt) >= from);
  const byLine = new Map<string, BundleOp[]>();
  for (const op of ops) {
    const line = db.orders.find((o) => o.id === op.orderId)?.line ?? "بدون خط";
    byLine.set(line, [...(byLine.get(line) ?? []), op]);
  }
  return [...byLine.entries()]
    .map(([line, rows]) => efficiencyOf(rows, line, line))
    .sort((a, b) => (b.efficiencyPct ?? -1) - (a.efficiencyPct ?? -1));
}

export function operationEfficiency(db: Db, days = 7): EfficiencyRow[] {
  const from = addDays(cairoToday(), -days);
  const ops = (db.bundleOps ?? []).filter((o) => o.state === "done" && (o.endedAt ?? o.startedAt) >= from);
  const byOp = new Map<string, BundleOp[]>();
  for (const op of ops) byOp.set(op.operationId, [...(byOp.get(op.operationId) ?? []), op]);
  return [...byOp.entries()]
    .map(([id, rows]) => efficiencyOf(rows, id, operationById(db, id)?.name ?? "عملية"))
    .sort((a, b) => b.pieces - a.pieces);
}

/* ── العيوب: باريتو من الأسباب المسجّلة ──────────────────────── */

export type DefectRow = { reason: string; qty: number; pct: number; cumulativePct: number; operationName: string };

/**
 * باريتو العيوب: الأسباب مرتبة بالكمية، ومعاها النسبة المتراكمة — عشان
 * تبان الشوية أسباب اللي بيعملوا أغلب العيب. اللي مسجّل بكمية بلا سبب
 * بيتعرض باسمه «بدون سبب مكتوب» بدل ما يتوزّع بالتخمين على الأسباب.
 */
export function defectPareto(db: Db, days = 30): DefectRow[] {
  const from = addDays(cairoToday(), -days);
  const rows = new Map<string, { qty: number; op: string }>();
  for (const op of db.bundleOps ?? []) {
    if (op.state !== "done" || (op.endedAt ?? op.startedAt) < from) continue;
    const bad = op.qtyRework + op.qtyScrap;
    if (bad <= 0) continue;
    const reason = op.defect.trim() || "بدون سبب مكتوب";
    const prev = rows.get(reason);
    rows.set(reason, { qty: (prev?.qty ?? 0) + bad, op: prev?.op ?? (operationById(db, op.operationId)?.name ?? "عملية") });
  }
  const list = [...rows.entries()].map(([reason, v]) => ({ reason, qty: v.qty, operationName: v.op })).sort((a, b) => b.qty - a.qty);
  const total = list.reduce((s, r) => s + r.qty, 0);
  let run = 0;
  return list.map((r) => {
    run += r.qty;
    return { ...r, pct: total > 0 ? (r.qty / total) * 100 : 0, cumulativePct: total > 0 ? (run / total) * 100 : 0 };
  });
}

/* ── شاشة الخط: الهدف والفعلي ────────────────────────────────── */

export type Tone = "ok" | "warn" | "danger";

export function tone(pct: number): Tone {
  return pct >= 95 ? "ok" : pct >= 75 ? "warn" : "danger";
}

export type LineRow = {
  line: string;
  orders: { code: string; model: string; remaining: number; dueDate: string; late: boolean; progress: number }[];
  target: number;
  actual: number;
  pct: number;
  tone: Tone;
  running: number;
  pausedOps: number;
  workers: number;
  openIssues: number;
};

/** الهدف اليومي للأمر = الباقي ÷ أيام العمل لحد التسليم (واليوم منها) */
export function dailyTarget(db: Db, order: Order): number {
  const stages = orderStages(db, order);
  const done = stages.length ? stages[stages.length - 1].good : 0;
  const remaining = Math.max(0, order.quantity - done);
  if (!remaining) return 0;
  const today = cairoToday();
  const cap = capacityBase(db);
  const days = order.dueDate >= today ? Math.max(1, workDaysBetween(today, order.dueDate, cap.daysPerWeek)) : 1;
  return Math.ceil(remaining / days);
}

/** الإنتاج النهائي المسجّل اليوم للأمر — آخر عملية في المسار */
export function producedToday(db: Db, order: Order): number {
  const today = cairoToday();
  const routes = order.productId ? routingLines(db, order.productId) : [];
  const lastOp = routes.length ? routes[routes.length - 1].operationId : null;
  return db.stageEntries
    .filter((e) => e.orderId === order.id && e.date === today && (lastOp ? e.operationId === lastOp : true))
    .reduce((s, e) => s + e.qtyGood, 0);
}

export type FloorView = {
  date: string;
  workDay: boolean;
  lines: LineRow[];
  target: number;
  actual: number;
  pct: number;
  tone: Tone;
  /** الإنتاج بالساعة — من تسجيلات الباندل اللي ليها وقت */
  hours: { hour: number; pieces: number }[];
  hoursTracked: boolean;
  wip: WipRow[];
  /** أكبر تجمّع شغل جاري */
  bottleneck: WipRow | null;
  issues: FloorIssue[];
  defects: DefectRow[];
  defectPctToday: number;
  runningBundles: number;
  pausedBundles: number;
  lateOrders: { code: string; model: string; line: string; dueDate: string; days: number; remaining: number }[];
};

export function floorView(db: Db): FloorView {
  const today = cairoToday();
  const cap = capacityBase(db);
  const open = db.orders.filter((o) => o.status === "running" || o.status === "late");
  const issues = (db.floorIssues ?? []).filter((i) => i.status === "open").sort((a, b) => b.at.localeCompare(a.at));

  const lines = new Map<string, LineRow>();
  for (const order of open) {
    const key = order.line || "بدون خط";
    const row =
      lines.get(key) ??
      ({
        line: key,
        orders: [],
        target: 0,
        actual: 0,
        pct: 0,
        tone: "danger",
        running: 0,
        pausedOps: 0,
        workers: 0,
        openIssues: 0,
      } satisfies LineRow);
    const stages = orderStages(db, order);
    const done = stages.length ? stages[stages.length - 1].good : 0;
    row.orders.push({
      code: order.code,
      model: order.model,
      remaining: Math.max(0, order.quantity - done),
      dueDate: order.dueDate,
      late: order.dueDate < today,
      progress: order.quantity > 0 ? Math.round((done / order.quantity) * 100) : 0,
    });
    row.target += dailyTarget(db, order);
    row.actual += producedToday(db, order);
    lines.set(key, row);
  }

  const activeOps = (db.bundleOps ?? []).filter((o) => o.state === "running" || o.state === "paused");
  for (const op of activeOps) {
    const line = db.orders.find((o) => o.id === op.orderId)?.line ?? "بدون خط";
    const row = lines.get(line);
    if (!row) continue;
    row.running += 1;
    if (op.state === "paused") row.pausedOps += 1;
  }
  for (const [line, row] of lines) {
    row.workers = new Set(activeOps.filter((o) => (db.orders.find((x) => x.id === o.orderId)?.line ?? "بدون خط") === line && o.workerId).map((o) => o.workerId)).size;
    row.openIssues = issues.filter((i) => i.line === line).length;
    row.pct = row.target > 0 ? (row.actual / row.target) * 100 : row.actual > 0 ? 100 : 0;
    row.tone = tone(row.pct);
  }

  const doneToday = (db.bundleOps ?? []).filter((o) => o.state === "done" && o.endedAt?.startsWith(today));
  const hourMap = new Map<number, number>();
  for (const op of doneToday) {
    const hour = new Date(op.endedAt!).getHours();
    hourMap.set(hour, (hourMap.get(hour) ?? 0) + op.qtyGood);
  }
  const hours = [...hourMap.entries()].map(([hour, pieces]) => ({ hour, pieces })).sort((a, b) => a.hour - b.hour);

  const wipRows = wip(db);
  const bottleneck = wipRows.filter((w) => w.waitingPieces > 0).sort((a, b) => b.waitingPieces - a.waitingPieces)[0] ?? null;

  const target = [...lines.values()].reduce((s, l) => s + l.target, 0);
  const actual = [...lines.values()].reduce((s, l) => s + l.actual, 0);
  const badToday = doneToday.reduce((s, o) => s + o.qtyRework + o.qtyScrap, 0);
  const goodToday = doneToday.reduce((s, o) => s + o.qtyGood, 0);

  return {
    date: today,
    workDay: isWorkDay(today, cap.daysPerWeek),
    lines: [...lines.values()].sort((a, b) => a.line.localeCompare(b.line, "ar")),
    target,
    actual,
    pct: target > 0 ? (actual / target) * 100 : actual > 0 ? 100 : 0,
    tone: tone(target > 0 ? (actual / target) * 100 : 0),
    hours,
    hoursTracked: doneToday.length > 0,
    wip: wipRows,
    bottleneck,
    issues,
    defects: defectPareto(db, 30).slice(0, 6),
    defectPctToday: goodToday + badToday > 0 ? (badToday / (goodToday + badToday)) * 100 : 0,
    runningBundles: activeOps.filter((o) => o.state === "running").length,
    pausedBundles: activeOps.filter((o) => o.state === "paused").length,
    lateOrders: db.orders
      .filter((o) => (o.status === "running" || o.status === "late") && o.dueDate < today)
      .map((o) => {
        const stages = orderStages(db, o);
        const done = stages.length ? stages[stages.length - 1].good : 0;
        return {
          code: o.code,
          model: o.model,
          line: o.line || "بدون خط",
          dueDate: o.dueDate,
          days: Math.max(1, Math.round((Date.parse(today) - Date.parse(o.dueDate)) / 86_400_000)),
          remaining: Math.max(0, o.quantity - done),
        };
      })
      .sort((a, b) => b.days - a.days),
  };
}

/** الباندلات اللي العامل ده شغّال عليها دلوقتي */
export function myActiveOps(db: Db, workerId: string | null): BundleOp[] {
  return (db.bundleOps ?? []).filter(
    (o) => (o.state === "running" || o.state === "paused") && (workerId ? o.workerId === workerId : true),
  );
}
