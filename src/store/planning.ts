/**
 * صنعة — طبقة التخطيط والطاقة (M3)
 *
 * القواعد الحاكمة، نفس قواعد طبقة الذكاء:
 *  1) مفيش جدول بيتخزَّن. الجدول بيتحسب من أوامر الإنتاج ومراحلها وقت العرض،
 *     فأي حركة إنتاج أو أمر جديد بيعيد الجدولة لوحده (Auto Rescheduling).
 *  2) اللي بيتخزّن هو **قرار الطاقة** بس: ساعات اليوم، أيام الأسبوع، الاستغلال، وعدد العمالة
 *     المعتمد — لأنها قرارات إدارية مش نتيجة حساب.
 *  3) الأمر اللي مفيش له مسار تصنيع أو زمن معياري **مش بيتخمّن له زمن** — بيتعرض في قائمة
 *     «برّه الجدولة» مع سبب واضح.
 *  4) نموذج الطاقة الحالي: المصنع Pool واحد من الدقايق بيتوزّع بالأولوية حسب تاريخ التسليم.
 *     التوزيع على الخطوط بيتعرض كحمل، مش كجدولة مستقلة لكل خط.
 */

import { addDays, cairoToday } from "@/lib/utils";
import {
  activeBom,
  bomLines,
  orderRequirements,
  orderStages,
  productById,
  productCost,
  routingLines,
  stockQty,
} from "./manufacturing";
import type { Db, Order } from "./types";

/* ── قرار الطاقة ─────────────────────────────────────────────── */

export type CapacitySettings = {
  /** ساعات العمل الفعلية في اليوم */
  hoursPerDay: number;
  /** أيام العمل في الأسبوع — الجمعة أول يوم راحة، بعدها السبت */
  daysPerWeek: number;
  /** نسبة الاستغلال: الوقت اللي فعلًا بينتَج فيه بعد التجهيز والراحة والتعطل */
  utilizationPct: number;
  /** عدد العمالة المعتمد للطاقة — null معناها «عدّ العمال المسجّلين» */
  crewSize: number | null;
};

export const DEFAULT_CAPACITY: CapacitySettings = {
  hoursPerDay: 8,
  daysPerWeek: 6,
  utilizationPct: 85,
  crewSize: null,
};

export function capacityOf(db: Db): CapacitySettings {
  return { ...DEFAULT_CAPACITY, ...(db.settings?.capacity ?? {}) };
}

/** أيام الراحة بالترتيب: الجمعة، السبت، الخميس… حسب أيام العمل المعتمدة */
const OFF_ORDER = [5, 6, 4, 3, 2, 1, 0];

export function isWorkDay(iso: string, daysPerWeek: number): boolean {
  const off = OFF_ORDER.slice(0, Math.max(0, 7 - Math.round(daysPerWeek)));
  const [y, m, d] = iso.split("-").map(Number);
  return !off.includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay());
}

export function nextWorkDay(iso: string, daysPerWeek: number): string {
  let day = iso;
  for (let i = 0; i < 14 && !isWorkDay(day, daysPerWeek); i++) day = addDays(day, 1);
  return day;
}

export function workDaysBetween(from: string, to: string, daysPerWeek: number): number {
  if (to < from) return 0;
  let count = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (isWorkDay(day, daysPerWeek)) count++;
    if (count > 5000) break;
  }
  return count;
}

export type CapacityBase = CapacitySettings & {
  crew: number;
  crewFromWorkers: boolean;
  /** دقايق الفرد في اليوم بعد الاستغلال */
  minutesPerWorker: number;
  /** دقايق المصنع في اليوم قبل الاستغلال */
  grossPerDay: number;
  /** دقايق المصنع المتاحة فعلًا في اليوم */
  perDay: number;
};

export function capacityBase(db: Db): CapacityBase {
  const set = capacityOf(db);
  const crew = set.crewSize ?? db.workers.length;
  const grossPerWorker = set.hoursPerDay * 60;
  const minutesPerWorker = grossPerWorker * (set.utilizationPct / 100);
  return {
    ...set,
    crew,
    crewFromWorkers: set.crewSize === null,
    minutesPerWorker,
    grossPerDay: crew * grossPerWorker,
    perDay: crew * minutesPerWorker,
  };
}

/* ── حمل أمر الإنتاج: الدقايق اللي لسه ناقصة ──────────────────── */

export const OPEN_STATUSES = ["running", "late"] as const;

export type OrderLoad = {
  order: Order;
  plannable: boolean;
  /** سبب الخروج من الجدولة — بدل ما نخمّن زمن */
  reason: string | null;
  remainingPieces: number;
  /** دقايق داخلية باقية */
  minutes: number;
  /** دقايق عمليات خارجية — مش بتاخد من طاقة المصنع */
  outsourcedMinutes: number;
  stdMinutesPerPiece: number;
};

/**
 * الدقايق الباقية = لكل عملية داخلية: (كمية الأمر − اللي خلص فيها) × الزمن المعياري.
 * فالأمر اللي قصّ ٣٠٠ وخيّط ١٩٠ بياخد باقي الخياطة بس، مش الأمر كله من الأول.
 */
export function orderLoad(db: Db, order: Order): OrderLoad {
  const product = productById(db, order.productId);
  const routes = order.productId ? routingLines(db, order.productId) : [];
  const stages = orderStages(db, order);
  const done = stages.length ? stages[stages.length - 1].good : 0;
  const remainingPieces = Math.max(0, order.quantity - done);

  const base: OrderLoad = {
    order,
    plannable: false,
    reason: null,
    remainingPieces,
    minutes: 0,
    outsourcedMinutes: 0,
    stdMinutesPerPiece: routes.filter((r) => !r.isOutsourced).reduce((s, r) => s + r.stdMinutes, 0),
  };

  if (!order.productId) return { ...base, reason: "الأمر مش مربوط بمنتج، فمفيش مسار تصنيع نحسب منه الزمن." };
  if (!routes.length) {
    return { ...base, reason: `${product?.name ?? "المنتج"} مالهوش مسار تصنيع — ضيف العمليات وزمنها المعياري.` };
  }
  if (!routes.some((r) => r.stdMinutes > 0)) {
    return { ...base, reason: `عمليات ${product?.name ?? "المنتج"} مسجّلة بزمن معياري صفر — الزمن مطلوب للجدولة.` };
  }

  let minutes = 0;
  let outsourced = 0;
  for (const step of routes) {
    const stage = stages.find((s) => s.operationId === step.operationId);
    const left = Math.max(0, order.quantity - (stage?.good ?? 0));
    if (step.isOutsourced) outsourced += left * step.stdMinutes;
    else minutes += left * step.stdMinutes;
  }

  return { ...base, plannable: true, minutes, outsourcedMinutes: outsourced };
}

export function openOrders(db: Db): Order[] {
  return db.orders.filter((o) => (OPEN_STATUSES as readonly string[]).includes(o.status));
}

/* ── الجدولة المحدودة بالطاقة ─────────────────────────────────── */

export type ExtraDemand = {
  code: string;
  name: string;
  minutes: number;
  dueDate: string;
};

export type ScheduleBlock = { date: string; minutes: number };

export type ScheduleRow = {
  id: string;
  code: string;
  name: string;
  line: string;
  minutes: number;
  dueDate: string;
  start: string;
  finish: string;
  workDays: number;
  lateDays: number;
  onTime: boolean;
  /** الأمر اللي قبله في الأولوية — سبب إن دوره جه متأخر */
  afterCode: string | null;
  isExtra: boolean;
  blocks: ScheduleBlock[];
};

type Demand = { id: string; code: string; name: string; line: string; minutes: number; dueDate: string; isExtra: boolean };

function demandsOf(db: Db, extra?: ExtraDemand): { demands: Demand[]; excluded: OrderLoad[]; stopped: OrderLoad[] } {
  const loads = openOrders(db).map((o) => orderLoad(db, o));
  const demands: Demand[] = loads
    .filter((l) => l.plannable && l.minutes > 0)
    .map((l) => ({
      id: l.order.id,
      code: l.order.code,
      name: l.order.model || productById(db, l.order.productId)?.name || "أمر إنتاج",
      line: l.order.line,
      minutes: l.minutes,
      dueDate: l.order.dueDate,
      isExtra: false,
    }));

  if (extra && extra.minutes > 0) {
    demands.push({
      id: "extra",
      code: extra.code,
      name: extra.name,
      line: "غير محدد",
      minutes: extra.minutes,
      dueDate: extra.dueDate,
      isExtra: true,
    });
  }

  demands.sort((a, b) => (a.dueDate === b.dueDate ? a.code.localeCompare(b.code) : a.dueDate.localeCompare(b.dueDate)));

  return {
    demands,
    excluded: loads.filter((l) => !l.plannable),
    stopped: db.orders.filter((o) => o.status === "stopped").map((o) => orderLoad(db, o)),
  };
}

/** توزيع الدقايق على أيام العمل بالأولوية: الأقرب تسليمًا الأول */
function runSchedule(demands: Demand[], cap: CapacityBase, from: string): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  if (cap.perDay <= 0) {
    return demands.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      line: d.line,
      minutes: d.minutes,
      dueDate: d.dueDate,
      start: from,
      finish: from,
      workDays: 0,
      lateDays: 0,
      onTime: false,
      afterCode: null,
      isExtra: d.isExtra,
      blocks: [],
    }));
  }

  let day = nextWorkDay(from, cap.daysPerWeek);
  let left = cap.perDay;
  let prevCode: string | null = null;

  for (const d of demands) {
    let need = d.minutes;
    const blocks: ScheduleBlock[] = [];
    let start = day;
    let guard = 0;
    while (need > 0.01 && guard++ < 2000) {
      if (left <= 0.01) {
        day = nextWorkDay(addDays(day, 1), cap.daysPerWeek);
        left = cap.perDay;
      }
      if (!blocks.length) start = day;
      const take = Math.min(left, need);
      blocks.push({ date: day, minutes: take });
      need -= take;
      left -= take;
    }
    const finish = blocks.length ? blocks[blocks.length - 1].date : day;
    const lateDays = finish > d.dueDate ? workDaysBetween(addDays(d.dueDate, 1), finish, cap.daysPerWeek) : 0;
    rows.push({
      id: d.id,
      code: d.code,
      name: d.name,
      line: d.line,
      minutes: d.minutes,
      dueDate: d.dueDate,
      start,
      finish,
      workDays: new Set(blocks.map((b) => b.date)).size,
      lateDays,
      onTime: lateDays === 0,
      afterCode: prevCode,
      isExtra: d.isExtra,
      blocks,
    });
    prevCode = d.code;
  }

  return rows;
}

export type Schedule = {
  rows: ScheduleRow[];
  excluded: OrderLoad[];
  stopped: OrderLoad[];
  cap: CapacityBase;
  from: string;
  totalMinutes: number;
  lateRows: ScheduleRow[];
  horizon: string | null;
};

export function schedule(db: Db, extra?: ExtraDemand): Schedule {
  const cap = capacityBase(db);
  const from = cairoToday();
  const { demands, excluded, stopped } = demandsOf(db, extra);
  const rows = runSchedule(demands, cap, from);
  return {
    rows,
    excluded,
    stopped,
    cap,
    from,
    totalMinutes: rows.reduce((s, r) => s + r.minutes, 0),
    lateRows: rows.filter((r) => !r.onTime),
    horizon: rows.length ? rows.reduce((max, r) => (r.finish > max ? r.finish : max), rows[0].finish) : null,
  };
}

/* ── الطاقة: متاح / مستخدم / متبقي ───────────────────────────── */

export type CapacityWindow = {
  key: "today" | "week" | "month";
  label: string;
  to: string;
  days: number;
  available: number;
  used: number;
  remaining: number;
  pct: number;
};

export type CapacityOutlook = {
  cap: CapacityBase;
  windows: CapacityWindow[];
  lines: { line: string; minutes: number; share: number; finish: string | null }[];
  backlogDays: number | null;
};

export function capacityOutlook(db: Db, plan = schedule(db)): CapacityOutlook {
  const { cap, from, rows } = plan;
  const spans: { key: CapacityWindow["key"]; label: string; to: string }[] = [
    { key: "today", label: "النهارده", to: from },
    { key: "week", label: "الأسبوع الجاي", to: addDays(from, 6) },
    { key: "month", label: "الشهر الجاي", to: addDays(from, 29) },
  ];

  const windows = spans.map(({ key, label, to }) => {
    const days = workDaysBetween(from, to, cap.daysPerWeek);
    const available = days * cap.perDay;
    const used = rows.reduce((s, r) => s + r.blocks.filter((b) => b.date <= to).reduce((x, b) => x + b.minutes, 0), 0);
    return {
      key,
      label,
      to,
      days,
      available,
      used: Math.min(used, available),
      remaining: Math.max(0, available - used),
      pct: available > 0 ? Math.min(100, (used / available) * 100) : 0,
    };
  });

  const byLine = new Map<string, { minutes: number; finish: string }>();
  for (const r of rows) {
    const cur = byLine.get(r.line) ?? { minutes: 0, finish: r.finish };
    byLine.set(r.line, { minutes: cur.minutes + r.minutes, finish: r.finish > cur.finish ? r.finish : cur.finish });
  }
  const total = plan.totalMinutes || 1;

  return {
    cap,
    windows,
    lines: [...byLine.entries()]
      .map(([line, v]) => ({ line, minutes: v.minutes, share: (v.minutes / total) * 100, finish: v.finish }))
      .sort((a, b) => b.minutes - a.minutes),
    backlogDays: cap.perDay > 0 ? plan.totalMinutes / cap.perDay : null,
  };
}

/** هل المصنع يقدر ينفّذ كمية معيّنة قبل تاريخ؟ — إجابة بالدقايق مش بالإحساس */
export function canDeliverBy(db: Db, minutes: number, date: string, plan = schedule(db)): {
  ok: boolean;
  availableUntil: number;
  committedBefore: number;
  freeBefore: number;
  shortfall: number;
  workDays: number;
  extraWorkers: number | null;
} {
  const { cap, from } = plan;
  const workDays = workDaysBetween(from, date, cap.daysPerWeek);
  const availableUntil = workDays * cap.perDay;
  const committedBefore = plan.rows
    .filter((r) => r.dueDate <= date)
    .reduce((s, r) => s + r.minutes, 0);
  const freeBefore = Math.max(0, availableUntil - committedBefore);
  const shortfall = Math.max(0, minutes - freeBefore);
  return {
    ok: shortfall <= 0.01,
    availableUntil,
    committedBefore,
    freeBefore,
    shortfall,
    workDays,
    extraWorkers:
      shortfall > 0 && workDays > 0 && cap.minutesPerWorker > 0
        ? Math.ceil(shortfall / (workDays * cap.minutesPerWorker))
        : shortfall > 0
          ? null
          : 0,
  };
}

/* ── MRP: احتياج الخامات عبر كل الأوامر المفتوحة ──────────────── */

export type MrpRow = {
  materialId: string;
  name: string;
  unit: string;
  required: number;
  onHand: number;
  reserved: number;
  free: number;
  shortage: number;
  leadTimeDays: number;
  /** أقرب تاريخ الخامة مطلوبة فيه حسب الجدول */
  neededBy: string | null;
  arrival: string;
  lateArrival: boolean;
  unitCost: number;
  suggestedQty: number;
  cost: number;
  vendor: string;
  orders: { code: string; qty: number }[];
};

export type Mrp = {
  rows: MrpRow[];
  shortages: MrpRow[];
  shortageCost: number;
  /** أوامر مفتوحة مفيش لها قائمة خامات — مش داخلة في الحساب */
  blind: Order[];
};

export function mrp(db: Db, plan = schedule(db)): Mrp {
  const map = new Map<string, MrpRow>();
  const blind: Order[] = [];
  const today = cairoToday();

  for (const order of openOrders(db)) {
    const bomId = order.bomId ?? (order.productId ? activeBom(db, order.productId)?.id ?? null : null);
    if (!bomLines(db, bomId).length) {
      blind.push(order);
      continue;
    }
    const start = plan.rows.find((r) => r.id === order.id)?.start ?? order.dueDate;
    for (const req of orderRequirements(db, order)) {
      if (req.remaining <= 0.0001) continue;
      const material = db.materials.find((m) => m.id === req.materialId);
      const row =
        map.get(req.materialId) ??
        ({
          materialId: req.materialId,
          name: req.name,
          unit: req.unit,
          required: 0,
          onHand: stockQty(db, "material", req.materialId),
          reserved: 0,
          free: 0,
          shortage: 0,
          leadTimeDays: material?.leadTimeDays ?? 0,
          neededBy: null,
          arrival: addDays(today, material?.leadTimeDays ?? 0),
          lateArrival: false,
          unitCost: req.unitCost,
          suggestedQty: 0,
          cost: 0,
          vendor: material?.defaultVendor ?? "",
          orders: [],
        } satisfies MrpRow);
      row.required += req.remaining;
      row.orders.push({ code: order.code, qty: req.remaining });
      if (!row.neededBy || start < row.neededBy) row.neededBy = start;
      map.set(req.materialId, row);
    }
  }

  const rows = [...map.values()]
    .map((r) => {
      const reserved = Math.min(r.onHand, r.required);
      const shortage = Math.max(0, r.required - r.onHand);
      const suggestedQty = shortage > 0 ? Math.ceil(shortage) : 0;
      return {
        ...r,
        reserved,
        free: Math.max(0, r.onHand - reserved),
        shortage,
        suggestedQty,
        cost: suggestedQty * r.unitCost,
        lateArrival: shortage > 0 && r.neededBy !== null && r.arrival > r.neededBy,
      };
    })
    .sort((a, b) => b.shortage - a.shortage || a.name.localeCompare(b.name, "ar"));

  const shortages = rows.filter((r) => r.shortage > 0.0001);
  return { rows, shortages, shortageCost: shortages.reduce((s, r) => s + r.cost, 0), blind };
}

/* ── محاكي «لو…؟» ────────────────────────────────────────────── */

export type SimInput = { productId: string; quantity: number; dueDate: string };

export type SimMaterial = {
  name: string;
  unit: string;
  required: number;
  available: number;
  shortage: number;
  cost: number;
};

export type Simulation = {
  ok: boolean;
  blockers: string[];
  minutes: number;
  outsourcedMinutes: number;
  perPiece: number;
  finish: string | null;
  meetsDue: boolean;
  lateDays: number;
  extraWorkers: number | null;
  feasibility: ReturnType<typeof canDeliverBy>;
  materials: SimMaterial[];
  materialShortageCost: number;
  cost: number;
  revenue: number;
  profit: number;
  marginPct: number | null;
  priceKnown: boolean;
  impact: { code: string; name: string; before: string; after: string; slipDays: number; becameLate: boolean }[];
};

/**
 * «لو دخلت ٥٠٠٠ قطعة إضافية؟» — الإجابة من نفس بيانات المصنع:
 * الطاقة، الخامات، تاريخ التسليم المتوقع، التكلفة، الربح، وتأثيره على الأوامر الشغالة.
 */
export function simulate(db: Db, input: SimInput): Simulation {
  const blockers: string[] = [];
  const product = productById(db, input.productId);
  const routes = input.productId ? routingLines(db, input.productId) : [];
  const bom = input.productId ? activeBom(db, input.productId) : undefined;
  const lines = bomLines(db, bom?.id);
  const cost = productCost(db, input.productId);
  const qty = Math.max(0, Math.round(input.quantity));

  if (!product) blockers.push("اختار المنتج الأول.");
  if (!qty) blockers.push("اكتب الكمية.");
  if (product && !routes.length) blockers.push(`${product.name} مالهوش مسار تصنيع — مش ممكن نحسب الطاقة المطلوبة.`);
  if (product && routes.length && !routes.some((r) => r.stdMinutes > 0)) {
    blockers.push(`عمليات ${product.name} بزمن معياري صفر — سجّل الزمن الأول.`);
  }
  if (product && !lines.length) blockers.push(`${product.name} مالهوش قائمة خامات — احتياج الخامات مش محسوب.`);

  const internal = routes.filter((r) => !r.isOutsourced).reduce((s, r) => s + r.stdMinutes, 0);
  const minutes = internal * qty;
  const plan = schedule(db);
  const feasibility = canDeliverBy(db, minutes, input.dueDate, plan);

  const withExtra = minutes > 0
    ? schedule(db, { code: "جديد", name: product?.name ?? "طلب مقترح", minutes, dueDate: input.dueDate })
    : plan;
  const extraRow = withExtra.rows.find((r) => r.isExtra) ?? null;

  const impact = plan.rows
    .map((before) => {
      const after = withExtra.rows.find((r) => r.id === before.id);
      if (!after) return null;
      const slipDays = workDaysBetween(addDays(before.finish, 1), after.finish, plan.cap.daysPerWeek);
      if (slipDays <= 0) return null;
      return {
        code: before.code,
        name: before.name,
        before: before.finish,
        after: after.finish,
        slipDays,
        becameLate: before.onTime && !after.onTime,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const materials: SimMaterial[] = lines.map((l) => {
    const required = l.effectiveQty * qty;
    const available = stockQty(db, "material", l.materialId);
    const shortage = Math.max(0, required - available);
    return { name: l.name, unit: l.unit, required, available, shortage, cost: shortage * l.unitCost };
  });

  const totalCost = cost.total * qty;
  const revenue = (product?.sellPrice ?? 0) * qty;
  const priceKnown = (product?.sellPrice ?? 0) > 0;

  return {
    ok: blockers.length === 0,
    blockers,
    minutes,
    outsourcedMinutes: routes.filter((r) => r.isOutsourced).reduce((s, r) => s + r.stdMinutes, 0) * qty,
    perPiece: internal,
    finish: extraRow?.finish ?? null,
    meetsDue: extraRow ? extraRow.onTime : false,
    lateDays: extraRow?.lateDays ?? 0,
    extraWorkers: feasibility.extraWorkers,
    feasibility,
    materials,
    materialShortageCost: materials.reduce((s, m) => s + m.cost, 0),
    cost: totalCost,
    revenue,
    profit: revenue - totalCost,
    marginPct: priceKnown ? ((revenue - totalCost) / revenue) * 100 : null,
    priceKnown,
    impact,
  };
}

/* ── ملخص للصفحة الرئيسية ────────────────────────────────────── */

export type PlanningPulse = {
  hasPlan: boolean;
  lateCount: number;
  firstLate: ScheduleRow | null;
  shortageCount: number;
  loadPct: number;
  excludedCount: number;
};

export function planningPulse(db: Db): PlanningPulse {
  const plan = schedule(db);
  const out = capacityOutlook(db, plan);
  const shortages = mrp(db, plan).shortages;
  return {
    hasPlan: plan.rows.length > 0,
    lateCount: plan.lateRows.length,
    firstLate: plan.lateRows[0] ?? null,
    shortageCount: shortages.length,
    loadPct: out.windows.find((w) => w.key === "week")?.pct ?? 0,
    excludedCount: plan.excluded.length,
  };
}

/** الدقايق بصيغة مقروءة: ساعات وأيام عمل */
export function minutesLabel(minutes: number, cap: CapacityBase): string {
  if (minutes <= 0) return "٠";
  const hours = minutes / 60;
  if (cap.perDay > 0 && minutes >= cap.perDay) {
    const days = minutes / cap.perDay;
    return `${days.toLocaleString("ar-EG", { maximumFractionDigits: 1 })} يوم عمل`;
  }
  return `${hours.toLocaleString("ar-EG", { maximumFractionDigits: 1 })} ساعة`;
}
