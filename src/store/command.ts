import { addDays, cairoToday, daysBetween, formatDate, moneyPlain, qty as num } from "@/lib/utils";
import { cashForecast, receivableAging } from "./cashflow";
import { allAccountBalances, payables, receivables } from "./compute";
import { costSheet, modelVolume, profitRanking, targetMarginOf } from "./costing";
import { factoryBottleneck } from "./health";
import { materialStock, orderStages, routingLines, stockQty, unitName } from "./manufacturing";
import { capacityBase, isWorkDay, mrp, openOrders, schedule, workDaysBetween } from "./planning";
import type { Db } from "./types";

/**
 * غرفة التحكم: طبقة البيانات.
 *
 * أربع قواعد ورثناها من محرّك الصحة وماشيين عليها هنا بالحرف:
 *
 * ١. **المدى الزمني حقيقي.** كل رقم في الشاشة بيتحسب على الفترة المختارة،
 *    ومفيش رقم «شهر» ثابت جوه شاشة مفتوحة على «النهارده».
 * ٢. **المقارنة من نفس الدفاتر.** الفترة السابقة بتتحسب بنفس الطول بالظبط،
 *    فـ«+١٨٪» معناها مقارنة عادلة مش مقارنة ٣٠ يوم بـ٧ أيام.
 * ٣. **المؤشر اللي مفيش له بيانات بيرجّع null** — مش صفر. صفر معناه «وحش»،
 *    وnull معناه «مش مسجّل»، والفرق بينهم هو الفرق بين قرار صح وقرار غلط.
 * ٤. **الهدف بيتعرض لو مسجّل بس.** مفيش أهداف مفترضة: هدف الهامش من
 *    الإعدادات، وهدف الإنتاج من الطاقة، وهدف الاستغلال من قرار الطاقة.
 */

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
const pctChange = (now: number, before: number): number | null =>
  before > 0 ? ((now - before) / before) * 100 : null;

/* ── ١) المدى الزمني والمقارنة ──────────────────────────────────── */

export const RANGE_KEYS = [
  "today",
  "yesterday",
  "week",
  "lastWeek",
  "month",
  "lastMonth",
  "quarter",
  "year",
  "custom",
] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export const RANGE_LABEL: Record<RangeKey, string> = {
  today: "النهارده",
  yesterday: "امبارح",
  week: "الأسبوع ده",
  lastWeek: "الأسبوع اللي فات",
  month: "الشهر ده",
  lastMonth: "الشهر اللي فات",
  quarter: "الربع ده",
  year: "السنة دي",
  custom: "مدى مخصص",
};

export type Range = { key: RangeKey; from: string; to: string; label: string; days: number };

const mk = (key: RangeKey, from: string, to: string, label?: string): Range => ({
  key,
  from,
  to,
  label: label ?? RANGE_LABEL[key],
  days: daysBetween(from, to) + 1,
});

/** بداية الأسبوع عندنا السبت — أسبوع العمل المصري */
function weekStart(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // ٠ الأحد
  const back = (dow + 1) % 7; // السبت = ٠
  return addDays(iso, -back);
}

function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function monthEnd(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return addDays(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`, -1);
}

export function rangeOf(key: RangeKey, today = cairoToday(), custom?: { from: string; to: string }): Range {
  switch (key) {
    case "today":
      return mk("today", today, today);
    case "yesterday":
      return mk("yesterday", addDays(today, -1), addDays(today, -1));
    case "week":
      return mk("week", weekStart(today), today);
    case "lastWeek": {
      const start = addDays(weekStart(today), -7);
      return mk("lastWeek", start, addDays(start, 6));
    }
    case "month":
      return mk("month", monthStart(today), today);
    case "lastMonth": {
      const prev = addDays(monthStart(today), -1);
      return mk("lastMonth", monthStart(prev), monthEnd(prev));
    }
    case "quarter": {
      const m = Number(today.slice(5, 7));
      const qStart = m - ((m - 1) % 3);
      return mk("quarter", `${today.slice(0, 4)}-${String(qStart).padStart(2, "0")}-01`, today);
    }
    case "year":
      return mk("year", `${today.slice(0, 4)}-01-01`, today);
    case "custom":
      return custom
        ? mk("custom", custom.from, custom.to, `${formatDate(custom.from)} — ${formatDate(custom.to)}`)
        : mk("month", monthStart(today), today);
  }
}

export const COMPARE_MODES = ["prev", "lastYear", "none"] as const;
export type CompareMode = (typeof COMPARE_MODES)[number];

export const COMPARE_LABEL: Record<CompareMode, string> = {
  prev: "الفترة اللي قبلها",
  lastYear: "نفس الفترة السنة اللي فاتت",
  none: "بدون مقارنة",
};

/**
 * الفترة المقارَن بيها بنفس الطول بالظبط. المقارنة بأطوال مختلفة
 * هي أشهر طريقة لتزويق رقم من غير كلمة كذب واحدة، فمش بنعملها.
 */
export function compareOf(range: Range, mode: CompareMode): Range | null {
  if (mode === "none") return null;
  if (mode === "lastYear") {
    const shift = (iso: string) => `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`;
    return mk("custom", shift(range.from), shift(range.to), COMPARE_LABEL.lastYear);
  }
  const to = addDays(range.from, -1);
  return mk("custom", addDays(to, -(range.days - 1)), to, COMPARE_LABEL.prev);
}

/* ── ٢) السلسلة المالية ────────────────────────────────────────── */

export type Grain = "day" | "week" | "month";

export const GRAIN_LABEL: Record<Grain, string> = { day: "يومي", week: "أسبوعي", month: "شهري" };

export type FinPoint = {
  key: string;
  label: string;
  from: string;
  to: string;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number | null;
  units: number;
};

/** الحبيبة المناسبة للمدى: مدى قصير يومي، وسنة شهري */
export function grainFor(range: Range): Grain {
  if (range.days <= 31) return "day";
  if (range.days <= 120) return "week";
  return "month";
}

function bucketsOf(range: Range, grain: Grain): { key: string; label: string; from: string; to: string }[] {
  const out: { key: string; label: string; from: string; to: string }[] = [];
  if (grain === "day") {
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
      out.push({ key: d, label: formatDate(d), from: d, to: d });
    }
    return out;
  }
  if (grain === "week") {
    for (let d = weekStart(range.from); d <= range.to; d = addDays(d, 7)) {
      const to = addDays(d, 6);
      out.push({ key: d, label: formatDate(d), from: d < range.from ? range.from : d, to: to > range.to ? range.to : to });
    }
    return out;
  }
  for (let d = monthStart(range.from); d <= range.to; d = addDays(monthEnd(d), 1)) {
    const to = monthEnd(d);
    out.push({
      key: d.slice(0, 7),
      label: formatDate(d),
      from: d < range.from ? range.from : d,
      to: to > range.to ? range.to : to,
    });
  }
  return out;
}

/**
 * الإيراد = التوريدات. التكلفة = بنود المصروفات + أجور العمال.
 * نفس التعريف المستخدم في قائمة الأرباح وفي نظرة النهارده، عشان
 * مايكونش «ربح الشهر» في شاشة رقم و«الربح» في شاشة تانية رقم تاني.
 */
export function finSeries(db: Db, range: Range, grain = grainFor(range)): FinPoint[] {
  const lastOps = lastOperationByOrder(db);
  return bucketsOf(range, grain).map((b) => {
    const inB = (d: string) => d >= b.from && d <= b.to;
    const revenue = sum(db.deliveries.filter((d) => inB(d.date)).map((d) => d.amount));
    const cost =
      sum(db.costEntries.filter((c) => inB(c.date)).map((c) => c.amount)) +
      sum(db.workerEarnings.filter((w) => inB(w.date)).map((w) => w.amount));
    const units = sum(
      db.stageEntries.filter((e) => inB(e.date) && lastOps.get(e.orderId) === e.operationId).map((e) => e.qtyGood),
    );
    return {
      ...b,
      revenue,
      cost,
      profit: revenue - cost,
      marginPct: revenue > 0 ? ((revenue - cost) / revenue) * 100 : null,
      units,
    };
  });
}

/** آخر مرحلة في مسار كل أمر — عشان القطعة متتعدّش وهي بتمشي بين المراحل */
function lastOperationByOrder(db: Db): Map<string, string> {
  const out = new Map<string, string>();
  for (const o of db.orders) {
    const routes = o.productId ? routingLines(db, o.productId) : [];
    if (routes.length) out.set(o.id, routes[routes.length - 1].operationId);
  }
  return out;
}

/* ── ٣) المؤشرات التنفيذية ─────────────────────────────────────── */

export type KpiFormat = "money" | "qty" | "pct";

export type Kpi = {
  key: string;
  label: string;
  format: KpiFormat;
  value: number | null;
  prev: number | null;
  deltaPct: number | null;
  /** هل الزيادة حاجة حلوة؟ التكلفة لأ، الإيراد أيوه */
  upIsGood: boolean;
  target: number | null;
  targetLabel: string | null;
  spark: number[];
  /** تعريف المؤشر بالكلام — كل رقم لازم يكون مفهوم إزاي اتحسب */
  explain: string;
  sub: string | null;
  to: string | null;
  missing: string | null;
};

type Period = { revenue: number; cost: number; profit: number; units: number };

function periodTotals(series: FinPoint[]): Period {
  return {
    revenue: sum(series.map((p) => p.revenue)),
    cost: sum(series.map((p) => p.cost)),
    profit: sum(series.map((p) => p.profit)),
    units: sum(series.map((p) => p.units)),
  };
}

/** الطاقة المتاحة بالدقايق في الفترة — أساس هدف الإنتاج وكفاءته */
export function capacityMinutes(db: Db, range: Range): number {
  const cap = capacityBase(db);
  return cap.perDay * workDaysBetween(range.from, range.to, cap.daysPerWeek);
}

/** الدقايق المكتسبة: الكمية السليمة × الزمن المعياري للمرحلة */
export function earnedMinutes(db: Db, from: string, to: string): number {
  const std = new Map<string, number>();
  for (const p of db.products) for (const r of routingLines(db, p.id)) std.set(`${p.id}:${r.operationId}`, r.stdMinutes);
  const orderProduct = new Map(db.orders.map((o) => [o.id, o.productId]));
  return sum(
    db.stageEntries
      .filter((e) => e.date >= from && e.date <= to)
      .map((e) => {
        const pid = orderProduct.get(e.orderId);
        return e.qtyGood * (pid ? std.get(`${pid}:${e.operationId}`) ?? 0 : 0);
      }),
  );
}

/** متوسط الزمن المعياري للقطعة الكاملة — بيترجم الطاقة من دقايق لقطع */
function minutesPerPiece(db: Db): number | null {
  const rows = db.products.map((p) => sum(routingLines(db, p.id).map((r) => r.stdMinutes))).filter((m) => m > 0);
  return rows.length ? sum(rows) / rows.length : null;
}

export function kpis(db: Db, range: Range, cmp: Range | null): Kpi[] {
  const grain = grainFor(range);
  const series = finSeries(db, range, grain);
  const now = periodTotals(series);
  const before = cmp ? periodTotals(finSeries(db, cmp, grainFor(cmp))) : null;

  const rec = receivables(db);
  const pay = payables(db);
  const cash = sum(allAccountBalances(db).map((a) => a.balance));
  const inR = (d: string) => d >= range.from && d <= range.to;

  const stage = db.stageEntries.filter((e) => inR(e.date));
  const good = sum(stage.map((e) => e.qtyGood));
  const bad = sum(stage.map((e) => e.qtyScrap + e.qtyRework));

  const capMin = capacityMinutes(db, range);
  const earned = earnedMinutes(db, range.from, range.to);
  const mpp = minutesPerPiece(db);

  const cap = capacityBase(db);
  const dayWorkers = db.workers.filter((w) => w.payType !== "piece");
  const today = cairoToday();
  const presentToday = new Set(
    db.workerEarnings.filter((e) => e.date === today && e.kind === "attendance").map((e) => e.workerId),
  ).size;

  const stockValue = inventoryValue(db);
  const invHealth = inventoryHealth(db);

  const margin = now.revenue > 0 ? (now.profit / now.revenue) * 100 : null;
  const marginBefore = before && before.revenue > 0 ? (before.profit / before.revenue) * 100 : null;

  const orders = db.orders;
  const open = openOrders(db);

  const out: Kpi[] = [
    {
      key: "revenue",
      label: "الإيراد",
      format: "money",
      value: now.revenue,
      prev: before?.revenue ?? null,
      deltaPct: before ? pctChange(now.revenue, before.revenue) : null,
      upIsGood: true,
      target: null,
      targetLabel: null,
      spark: series.map((p) => p.revenue),
      explain: "مجموع التوريدات المسجّلة في الفترة، بسعر التوريد وقتها.",
      sub: null,
      to: "/treasury",
      missing: null,
    },
    {
      key: "profit",
      label: "الربح",
      format: "money",
      value: now.profit,
      prev: before?.profit ?? null,
      deltaPct: before ? pctChange(now.profit, before.profit) : null,
      upIsGood: true,
      target: null,
      targetLabel: null,
      spark: series.map((p) => p.profit),
      explain: "الإيراد ناقص بنود المصروفات وأجور العمال في نفس الفترة.",
      sub: margin === null ? null : `الهامش ${num(Math.round(margin), 0)}٪`,
      to: "/costing",
      missing: null,
    },
    {
      key: "margin",
      label: "هامش الفترة",
      format: "pct",
      value: margin,
      prev: marginBefore,
      deltaPct: marginBefore !== null && margin !== null ? margin - marginBefore : null,
      upIsGood: true,
      target: targetMarginOf(db),
      targetLabel: "الهدف من الإعدادات",
      spark: series.map((p) => p.marginPct ?? 0),
      explain:
        "الربح ÷ الإيراد على حركة الفترة كلها. ده مش نفس «هامش الموديل» في لوحة التكلفة: ده على المقبوض والمنصرف فعليًا في الفترة، وده على قائمة تكاليف القطعة. الهدف جنبه هو اللي سجّلته في الإعدادات، مش رقم مفترض.",
      sub: null,
      to: "/costing",
      missing: margin === null ? "توريدات في الفترة" : null,
    },
    {
      key: "cost",
      label: "المصروف",
      format: "money",
      value: now.cost,
      prev: before?.cost ?? null,
      deltaPct: before ? pctChange(now.cost, before.cost) : null,
      upIsGood: false,
      target: null,
      targetLabel: null,
      spark: series.map((p) => p.cost),
      explain: "بنود المصروفات المسجّلة + أجور العمال المستحقة في الفترة.",
      sub: null,
      to: "/costs",
      missing: null,
    },
    {
      key: "production",
      label: "الإنتاج",
      format: "qty",
      value: now.units,
      prev: before?.units ?? null,
      deltaPct: before ? pctChange(now.units, before.units) : null,
      upIsGood: true,
      target: mpp && capMin > 0 ? Math.round(capMin / mpp) : null,
      targetLabel: mpp && capMin > 0 ? "الطاقة المتاحة في الفترة" : null,
      spark: series.map((p) => p.units),
      explain: "كمية آخر مرحلة في مسار كل أمر، عشان القطعة متتعدّش مرتين وهي بتمشي بين المراحل.",
      sub: null,
      to: "/orders",
      missing: null,
    },
    {
      key: "efficiency",
      label: "كفاءة الإنتاج",
      format: "pct",
      value: capMin > 0 && earned > 0 ? clamp((earned / capMin) * 100) : null,
      prev: cmp ? (() => {
        const c = capacityMinutes(db, cmp);
        const e = earnedMinutes(db, cmp.from, cmp.to);
        return c > 0 && e > 0 ? clamp((e / c) * 100) : null;
      })() : null,
      deltaPct: null,
      upIsGood: true,
      target: cap.utilizationPct,
      targetLabel: "نسبة الاستغلال في قرار الطاقة",
      spark: [],
      explain: "الدقايق المكتسبة (كمية سليمة × زمن معياري) ÷ الدقايق المتاحة من الطاقة.",
      sub: `${num(Math.round(earned), 0)} من ${num(Math.round(capMin), 0)} دقيقة`,
      to: "/planning",
      missing: earned > 0 ? null : "زمن معياري في مسار العمليات + مراحل مسجّلة",
    },
    {
      key: "quality",
      label: "نسبة السليم",
      format: "pct",
      value: good + bad > 0 ? (good / (good + bad)) * 100 : null,
      prev: cmp ? (() => {
        const s = db.stageEntries.filter((e) => e.date >= cmp.from && e.date <= cmp.to);
        const g = sum(s.map((e) => e.qtyGood));
        const b = sum(s.map((e) => e.qtyScrap + e.qtyRework));
        return g + b > 0 ? (g / (g + b)) * 100 : null;
      })() : null,
      deltaPct: null,
      upIsGood: true,
      target: null,
      targetLabel: null,
      spark: [],
      explain: "القطع السليمة ÷ (السليمة + المرفوضة + المعادة) من تسجيل المراحل.",
      sub: good + bad > 0 ? `مرفوض ومعاد ${num(Math.round(bad), 0)} قطعة` : null,
      to: "/orders",
      missing: good + bad > 0 ? null : "تسجيل المراحل بكميات سليم وتالف",
    },
    {
      key: "orders",
      label: "أوامر شغالة",
      format: "qty",
      value: open.length,
      prev: null,
      deltaPct: null,
      upIsGood: true,
      target: null,
      targetLabel: null,
      spark: [],
      explain: "الأوامر اللي حالتها قيد التنفيذ أو متأخرة — الحالة دلوقتي، مش في الفترة.",
      sub: `متأخر ${num(orders.filter((o) => o.status === "late").length, 0)} · متوقف ${num(
        orders.filter((o) => o.status === "stopped").length,
        0,
      )}`,
      to: "/orders",
      missing: null,
    },
    {
      key: "stock",
      label: "قيمة المخزون",
      format: "money",
      value: stockValue.total,
      prev: null,
      deltaPct: null,
      upIsGood: true,
      target: null,
      targetLabel: null,
      spark: [],
      explain: "خامات + إنتاج تحت التشغيل + تام، بمتوسط تكلفة كل بند. الحالة دلوقتي.",
      sub: invHealth.total === null ? null : `صحة المخزون ${num(invHealth.total, 0)}٪`,
      to: "/materials",
      missing: null,
    },
    {
      key: "cash",
      label: "الخزينة",
      format: "money",
      value: cash,
      prev: null,
      deltaPct: null,
      upIsGood: true,
      target: null,
      targetLabel: null,
      spark: [],
      explain: "رصيد كل الحسابات دلوقتي من حركات الخزينة المسجّلة.",
      sub: `عليك ${moneyPlain(pay.vendorTotal + pay.workerTotal)} ج`,
      to: "/treasury",
      missing: null,
    },
    {
      key: "overdue",
      label: "متأخر التحصيل",
      format: "money",
      value: sum(rec.overdue.map((r) => r.remaining)),
      prev: null,
      deltaPct: null,
      upIsGood: false,
      target: null,
      targetLabel: null,
      spark: [],
      explain: "التوريدات اللي فات ميعاد سدادها ولسه فيها باقي، بترتيب الأقدم أولًا.",
      sub: `${num(rec.overdue.length, 0)} توريد`,
      to: "/collections",
      missing: null,
    },
    {
      key: "workforce",
      label: "حضور النهارده",
      format: "qty",
      value: dayWorkers.length ? presentToday : null,
      prev: null,
      deltaPct: null,
      upIsGood: true,
      target: dayWorkers.length || null,
      targetLabel: "عمال بنظام يومي أو شهري",
      spark: [],
      explain: "عدد العمال اللي اتسجّل لهم حضور النهارده من إجمالي العمالة الثابتة.",
      sub: isWorkDay(today, cap.daysPerWeek) ? null : "النهارده مش يوم عمل بالجدول",
      to: "/workers",
      missing: dayWorkers.length ? null : "عمال بنظام يومي أو شهري",
    },
  ];

  return out;
}

/* ── ٤) الإنتاج ────────────────────────────────────────────────── */

export type LineStat = {
  line: string;
  orders: number;
  units: number;
  earnedMinutes: number;
  defectPct: number | null;
  /** نصيب الخط من الدقايق المكتسبة — مش كفاءة مطلقة، الطاقة مش مسجّلة لكل خط */
  sharePct: number;
};

/**
 * أداء خطوط الإنتاج. لاحظ: الطاقة مسجّلة للمصنع كله مش لكل خط،
 * فمبنقولش «كفاءة الخط ٩٤٪» — بنقول نصيبه من الشغل ونسبة عيوبه.
 */
export function lineStats(db: Db, range: Range): LineStat[] {
  const std = new Map<string, number>();
  for (const p of db.products) for (const r of routingLines(db, p.id)) std.set(`${p.id}:${r.operationId}`, r.stdMinutes);
  const byOrder = new Map(db.orders.map((o) => [o.id, o]));
  const map = new Map<string, LineStat>();

  for (const e of db.stageEntries.filter((x) => x.date >= range.from && x.date <= range.to)) {
    const order = byOrder.get(e.orderId);
    if (!order) continue;
    const line = order.line || "بدون خط";
    const row =
      map.get(line) ??
      ({ line, orders: 0, units: 0, earnedMinutes: 0, defectPct: null, sharePct: 0 } as LineStat);
    row.units += e.qtyGood;
    row.earnedMinutes += e.qtyGood * (order.productId ? std.get(`${order.productId}:${e.operationId}`) ?? 0 : 0);
    map.set(line, row);
  }

  for (const [line, row] of map) {
    const ids = new Set(
      db.orders.filter((o) => (o.line || "بدون خط") === line).map((o) => o.id),
    );
    const entries = db.stageEntries.filter(
      (e) => ids.has(e.orderId) && e.date >= range.from && e.date <= range.to,
    );
    row.orders = new Set(entries.map((e) => e.orderId)).size;
    const g = sum(entries.map((e) => e.qtyGood));
    const b = sum(entries.map((e) => e.qtyScrap + e.qtyRework));
    row.defectPct = g + b > 0 ? (b / (g + b)) * 100 : null;
  }

  const totalMin = sum([...map.values()].map((r) => r.earnedMinutes));
  const rows = [...map.values()];
  for (const r of rows) r.sharePct = totalMin > 0 ? (r.earnedMinutes / totalMin) * 100 : 0;
  return rows.sort((a, b) => b.earnedMinutes - a.earnedMinutes);
}

export type LiveOrder = {
  id: string;
  code: string;
  model: string;
  client: string;
  quantity: number;
  produced: number;
  progressPct: number;
  dueDate: string;
  lateDays: number;
  riskPct: number;
  reason: string;
  tone: "ok" | "warn" | "danger";
  statusLabel: string;
};

/**
 * الأوامر الشغالة ومخاطرها. نسبة الخطر مش تقدير: بتتحسب من الجدول
 * الحقيقي — أيام التأخير المتوقعة، وإن كان فيه أمر قبله بيحجزه.
 */
export function liveOrders(db: Db): LiveOrder[] {
  const plan = schedule(db);
  const req = mrp(db, plan);
  const shortages = new Set(req.shortages.map((s) => s.materialId));
  const bn = factoryBottleneck(db);

  return plan.rows
    .filter((r) => !r.isExtra)
    .map((r) => {
      const order = db.orders.find((o) => o.id === r.id);
      const stages = order ? orderStages(db, order) : [];
      const produced = stages.length ? stages[stages.length - 1].good : 0;
      const quantity = order?.quantity ?? 0;
      const needsMaterial = order?.productId
        ? req.rows.some((m) => shortages.has(m.materialId) && m.orders.some((x) => x.code === r.code))
        : false;

      const riskPct = clamp(
        r.lateDays > 0 ? Math.min(95, 45 + r.lateDays * 12) : needsMaterial ? 40 : r.afterCode ? 22 : 8,
      );
      const reason =
        r.lateDays > 0
          ? r.afterCode
            ? `واقف بعد ${r.afterCode} في ترتيب الشغل`
            : "الشغل الباقي أكبر من الوقت الفاضل"
          : needsMaterial
            ? "ناقص خامة من خاماته"
            : bn && stages.some((s) => s.operationId === bn.step.operationId && s.good < quantity)
              ? `رصيد واقف في ${bn.step.name}`
              : "ماشي في الميعاد";

      return {
        id: r.id,
        code: r.code,
        model: order?.model ?? "",
        client: order?.clientId ? db.parties.find((p) => p.id === order.clientId)?.name ?? "" : "",
        quantity,
        produced,
        progressPct: quantity > 0 ? clamp((produced / quantity) * 100) : 0,
        dueDate: r.dueDate,
        lateDays: r.lateDays,
        riskPct,
        reason,
        tone: (r.lateDays >= 3 ? "danger" : r.lateDays > 0 || needsMaterial ? "warn" : "ok") as LiveOrder["tone"],
        statusLabel: r.lateDays >= 3 ? "متأخر" : r.lateDays > 0 ? "معرّض للتأخير" : "في الميعاد",
      };
    })
    .sort((a, b) => b.riskPct - a.riskPct);
}

export type OrderMix = { key: string; label: string; count: number; tone: "ok" | "warn" | "danger" | "muted"; to: string };

export function orderMix(db: Db): OrderMix[] {
  const c = (s: string) => db.orders.filter((o) => o.status === s).length;
  return [
    { key: "done", label: "مكتمل", count: c("done"), tone: "ok", to: "/orders?status=done" },
    { key: "running", label: "قيد التنفيذ", count: c("running"), tone: "muted", to: "/orders?status=running" },
    { key: "late", label: "متأخر", count: c("late"), tone: "danger", to: "/orders?status=late" },
    { key: "stopped", label: "متوقف", count: c("stopped"), tone: "warn", to: "/orders?status=stopped" },
  ].filter((r) => r.count > 0) as OrderMix[];
}

/** الالتزام بالتسليم: آخر مرحلة اتسجّلت قبل الميعاد ولا بعده */
export type DeliveryPerf = {
  judged: number;
  onTime: number;
  onTimePct: number | null;
  avgDelayDays: number | null;
  worst: { code: string; days: number } | null;
};

export function deliveryPerformance(db: Db, range: Range): DeliveryPerf {
  const rows: { code: string; days: number }[] = [];
  for (const o of db.orders.filter((x) => x.status === "done")) {
    const entries = db.stageEntries.filter((e) => e.orderId === o.id);
    if (!entries.length) continue;
    const finished = entries.map((e) => e.date).sort().at(-1) as string;
    if (finished < range.from || finished > range.to) continue;
    rows.push({ code: o.code, days: daysBetween(o.dueDate, finished) });
  }
  if (!rows.length) return { judged: 0, onTime: 0, onTimePct: null, avgDelayDays: null, worst: null };
  const onTime = rows.filter((r) => r.days <= 0).length;
  const late = rows.filter((r) => r.days > 0);
  return {
    judged: rows.length,
    onTime,
    onTimePct: (onTime / rows.length) * 100,
    avgDelayDays: late.length ? sum(late.map((r) => r.days)) / late.length : 0,
    worst: late.sort((a, b) => b.days - a.days)[0] ?? null,
  };
}

/* ── ٥) الجودة ─────────────────────────────────────────────────── */

export type DefectRow = { operationId: string; name: string; bad: number; sharePct: number; cumulativePct: number };

/**
 * باريتو العيوب **بالمرحلة**، مش بنوع العيب — لأن نوع العيب مش
 * مسجّل في النظام. بنقول ده صريح بدل ما نلفّق تصنيف.
 */
export function defectPareto(db: Db, range: Range): DefectRow[] {
  const map = new Map<string, { name: string; bad: number }>();
  for (const e of db.stageEntries.filter((x) => x.date >= range.from && x.date <= range.to)) {
    const bad = e.qtyScrap + e.qtyRework;
    if (bad <= 0) continue;
    const name = db.operations.find((o) => o.id === e.operationId)?.name ?? "مرحلة";
    const row = map.get(e.operationId) ?? { name, bad: 0 };
    row.bad += bad;
    map.set(e.operationId, row);
  }
  const rows = [...map.entries()].map(([operationId, v]) => ({ operationId, ...v })).sort((a, b) => b.bad - a.bad);
  const total = sum(rows.map((r) => r.bad));
  let acc = 0;
  return rows.map((r) => {
    const sharePct = total > 0 ? (r.bad / total) * 100 : 0;
    acc += sharePct;
    return { ...r, sharePct, cumulativePct: acc };
  });
}

export type QualityCell = { line: string; operationId: string; name: string; defectPct: number | null; bad: number };

/** خريطة حرارية: الخط × المرحلة — بتوري العيب بيتولد فين بالظبط */
export function qualityHeat(db: Db, range: Range): { lines: string[]; ops: { id: string; name: string }[]; cells: QualityCell[] } {
  const byOrder = new Map(db.orders.map((o) => [o.id, o]));
  const agg = new Map<string, { good: number; bad: number }>();
  const lines = new Set<string>();
  const ops = new Map<string, string>();

  for (const e of db.stageEntries.filter((x) => x.date >= range.from && x.date <= range.to)) {
    const order = byOrder.get(e.orderId);
    if (!order) continue;
    const line = order.line || "بدون خط";
    lines.add(line);
    ops.set(e.operationId, db.operations.find((o) => o.id === e.operationId)?.name ?? "مرحلة");
    const k = `${line}|${e.operationId}`;
    const row = agg.get(k) ?? { good: 0, bad: 0 };
    row.good += e.qtyGood;
    row.bad += e.qtyScrap + e.qtyRework;
    agg.set(k, row);
  }

  const cells: QualityCell[] = [];
  for (const line of lines) {
    for (const [id, name] of ops) {
      const row = agg.get(`${line}|${id}`);
      cells.push({
        line,
        operationId: id,
        name,
        bad: row?.bad ?? 0,
        defectPct: row && row.good + row.bad > 0 ? (row.bad / (row.good + row.bad)) * 100 : null,
      });
    }
  }
  return { lines: [...lines], ops: [...ops].map(([id, name]) => ({ id, name })), cells };
}

/* ── ٦) المخزون ────────────────────────────────────────────────── */

export type InventoryValue = { materials: number; wip: number; finished: number; total: number };

export function inventoryValue(db: Db): InventoryValue {
  const materials = sum(
    db.materials.map((m) => Math.max(0, stockQty(db, "material", m.id)) * m.avgCost),
  );
  const finished = sum(
    db.products.map((p) => {
      const q = Math.max(0, stockQty(db, "product", p.id));
      return q * (costSheet(db, p.id).total || 0);
    }),
  );
  /** تحت التشغيل = الخامة اللي اتصرفت لأوامر لسه مخلصتش */
  const openIds = new Set(openOrders(db).map((o) => o.id));
  const wip = sum(
    db.stockMovements
      .filter((m) => m.kind === "issue" && m.refId && openIds.has(m.refId))
      .map((m) => Math.abs(m.qty) * m.unitCost),
  );
  return { materials, wip, finished, total: materials + wip + finished };
}

export type StockBand = { key: "healthy" | "low" | "over" | "dead"; label: string; count: number; value: number };

export type InventoryHealth = {
  total: number | null;
  bands: StockBand[];
  missing: string | null;
};

export function inventoryHealth(db: Db): InventoryHealth {
  const rows = materialStock(db);
  if (!rows.length) return { total: null, bands: [], missing: "خامات مسجّلة بحركات مخزن" };
  const withPoint = rows.filter((r) => r.reorderPoint > 0);
  if (!withPoint.length) return { total: null, bands: [], missing: "حد إعادة الطلب للخامات" };

  const band = (r: (typeof rows)[number]): StockBand["key"] => {
    if (r.qty > 0 && r.perDay === 0) return "dead";
    if (r.reorderPoint > 0 && r.qty < r.reorderPoint) return "low";
    if (r.reorderPoint > 0 && r.qty > r.reorderPoint * 4) return "over";
    return "healthy";
  };

  const labels: Record<StockBand["key"], string> = {
    healthy: "رصيد سليم",
    low: "تحت حد الطلب",
    over: "تكديس",
    dead: "راكد بلا استهلاك",
  };

  const bands = (["healthy", "low", "over", "dead"] as const).map((key) => {
    const xs = rows.filter((r) => band(r) === key);
    return { key, label: labels[key], count: xs.length, value: sum(xs.map((r) => r.qty * r.avgCost)) };
  });

  const healthyShare = (bands[0].count / rows.length) * 100;
  const deadShare = (bands[3].count / rows.length) * 100;
  return { total: Math.round(clamp(healthyShare - deadShare * 0.5)), bands, missing: null };
}

export type WasteRow = { materialId: string; name: string; unit: string; qty: number; cost: number };

/** الهالك على مستوى المصنع في الفترة — من حركات المخزن نوع «هالك» */
export function wasteByMaterial(db: Db, range: Range): { rows: WasteRow[]; total: number } {
  const map = new Map<string, WasteRow>();
  for (const m of db.stockMovements.filter(
    (x) => x.kind === "waste" && x.itemType === "material" && x.date >= range.from && x.date <= range.to,
  )) {
    const mat = db.materials.find((x) => x.id === m.itemId);
    if (!mat) continue;
    const row =
      map.get(m.itemId) ?? { materialId: m.itemId, name: mat.name, unit: unitName(db, mat.unitId), qty: 0, cost: 0 };
    row.qty += Math.abs(m.qty);
    row.cost += Math.abs(m.qty) * m.unitCost;
    map.set(m.itemId, row);
  }
  const rows = [...map.values()].sort((a, b) => b.cost - a.cost);
  return { rows, total: sum(rows.map((r) => r.cost)) };
}

export type DeadStockRow = { id: string; name: string; qty: number; unit: string; value: number; lastMove: string | null };

export function deadStock(db: Db): { rows: DeadStockRow[]; value: number } {
  const rows = materialStock(db)
    .filter((m) => m.qty > 0 && m.perDay === 0)
    .map((m) => {
      const moves = db.stockMovements
        .filter((x) => x.itemType === "material" && x.itemId === m.id)
        .map((x) => x.date)
        .sort();
      return {
        id: m.id,
        name: m.name,
        qty: m.qty,
        unit: unitName(db, m.unitId),
        value: m.qty * m.avgCost,
        lastMove: moves.at(-1) ?? null,
      };
    })
    .sort((a, b) => b.value - a.value);
  return { rows, value: sum(rows.map((r) => r.value)) };
}

export type TurnPoint = { key: string; label: string; issued: number; avgStock: number; turns: number | null };

/**
 * دوران المخزون = قيمة الخامة المصروفة ÷ متوسط قيمة المخزون.
 * بنحسب متوسط المخزون من حركات الدفتر نفسها، مش من رصيد مخزَّن.
 */
export function turnover(db: Db, range: Range): TurnPoint[] {
  const grain: Grain = range.days <= 62 ? "week" : "month";
  const value = (upTo: string) =>
    sum(
      db.materials.map((m) => {
        const q = sum(
          db.stockMovements
            .filter((x) => x.itemType === "material" && x.itemId === m.id && x.date <= upTo)
            .map((x) => x.qty),
        );
        return Math.max(0, q) * m.avgCost;
      }),
    );

  return bucketsOf(range, grain).map((b) => {
    const issued = sum(
      db.stockMovements
        .filter((m) => m.kind === "issue" && m.date >= b.from && m.date <= b.to)
        .map((m) => Math.abs(m.qty) * m.unitCost),
    );
    const avgStock = (value(addDays(b.from, -1)) + value(b.to)) / 2;
    return { key: b.key, label: b.label, issued, avgStock, turns: avgStock > 0 ? issued / avgStock : null };
  });
}

/* ── ٧) الموردين ───────────────────────────────────────────────── */

export type SupplierRow = {
  id: string | null;
  name: string;
  purchases: number;
  entries: number;
  items: number;
  /** فرق سعر الوحدة عن وسيط السوق الداخلي لنفس البند */
  priceGapPct: number | null;
  /** تقلّب السعر: الانحراف عن متوسط الموردّ نفسه */
  volatilityPct: number | null;
  paidPct: number;
  score: number | null;
  why: string[];
};

/**
 * سكوركارد الموردين. مبني على اللي مسجّل فعلًا: السعر مقابل باقي
 * الموردين لنفس البند، تقلّب سعره، وحجم التعامل.
 * **الالتزام بمواعيد التوريد مش مسجّل** فمش داخل في الدرجة. والمرتجعات
 * مسجّلة، بس مقاسها مكانه `supplierQuality` في طبقة الجودة: الدرجتين
 * مقصودين منفصلين — دي بتجاوب «المورّد ده غالي؟» وديك «بضاعته وحشة؟».
 * والكارت بيقول كده بالنص.
 */
export function supplierScores(db: Db): SupplierRow[] {
  type Line = { itemId: string; unitPrice: number; amount: number; date: string };
  const byVendor = new Map<string, { id: string | null; name: string; lines: Line[]; amount: number }>();

  for (const e of db.costEntries) {
    const name = e.partyId ? db.parties.find((p) => p.id === e.partyId)?.name ?? e.vendor : e.vendor;
    if (!name) continue;
    const key = e.partyId ?? name;
    const row = byVendor.get(key) ?? { id: e.partyId, name, lines: [], amount: 0 };
    row.amount += e.amount;
    if (e.quantity && e.quantity > 0) {
      row.lines.push({ itemId: e.costItemId, unitPrice: e.amount / e.quantity, amount: e.amount, date: e.date });
    }
    byVendor.set(key, row);
  }

  // وسيط سعر الوحدة لكل بند على مستوى المصنع — مرجع المقارنة
  const itemPrices = new Map<string, number[]>();
  for (const row of byVendor.values()) {
    for (const l of row.lines) {
      const xs = itemPrices.get(l.itemId) ?? [];
      xs.push(l.unitPrice);
      itemPrices.set(l.itemId, xs);
    }
  }
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  const rows: SupplierRow[] = [...byVendor.values()].map((v) => {
    const entries = db.costEntries.filter((e) => (e.partyId ?? e.vendor) === (v.id ?? v.name));
    const paid = sum(entries.map((e) => sum(db.costPayments.filter((p) => p.costEntryId === e.id).map((p) => p.amount))));

    const gaps: number[] = [];
    for (const l of v.lines) {
      const all = itemPrices.get(l.itemId) ?? [];
      if (all.length < 2) continue;
      const med = median(all);
      if (med > 0) gaps.push(((l.unitPrice - med) / med) * 100);
    }
    const priceGapPct = gaps.length ? sum(gaps) / gaps.length : null;

    const vols: number[] = [];
    const byItem = new Map<string, number[]>();
    for (const l of v.lines) {
      const xs = byItem.get(l.itemId) ?? [];
      xs.push(l.unitPrice);
      byItem.set(l.itemId, xs);
    }
    for (const xs of byItem.values()) {
      if (xs.length < 2) continue;
      const avg = sum(xs) / xs.length;
      if (avg > 0) vols.push((Math.max(...xs) - Math.min(...xs)) / avg * 100);
    }
    const volatilityPct = vols.length ? sum(vols) / vols.length : null;

    const why: string[] = [];
    let score: number | null = null;
    if (priceGapPct !== null || volatilityPct !== null) {
      const priceScore = priceGapPct === null ? null : clamp(50 - priceGapPct * 2.5);
      const stabScore = volatilityPct === null ? null : clamp(100 - volatilityPct * 2);
      const parts = [priceScore, stabScore].filter((x): x is number => x !== null);
      score = Math.round(sum(parts) / parts.length);
      if (priceGapPct !== null) {
        why.push(
          priceGapPct > 2
            ? `سعره أعلى من وسيط السوق عندك بـ${num(Math.round(priceGapPct), 0)}٪`
            : priceGapPct < -2
              ? `سعره أقل من الوسيط بـ${num(Math.round(Math.abs(priceGapPct)), 0)}٪`
              : "سعره في حدود الوسيط",
        );
      }
      if (volatilityPct !== null) {
        why.push(
          volatilityPct > 15
            ? `سعره متقلّب: فرق ${num(Math.round(volatilityPct), 0)}٪ بين أعلى وأقل فاتورة`
            : "سعره مستقر بين الفواتير",
        );
      }
    } else {
      why.push("مفيش كميات مسجّلة على فواتيره، فمش ممكن نحسب سعر وحدة");
    }

    return {
      id: v.id,
      name: v.name,
      purchases: v.amount,
      entries: entries.length,
      items: new Set(v.lines.map((l) => l.itemId)).size,
      priceGapPct,
      volatilityPct,
      paidPct: v.amount > 0 ? (paid / v.amount) * 100 : 100,
      score,
      why,
    };
  });

  return rows.sort((a, b) => b.purchases - a.purchases);
}

/* ── ٨) العمالة ────────────────────────────────────────────────── */

export type WorkerRow = {
  id: string;
  name: string;
  pieces: number;
  minutes: number;
  daysPresent: number;
  qualityPct: number | null;
  /** الدرجة من الإنتاجية والجودة والحضور — كل واحدة بتقول رقمها */
  score: number | null;
  why: string[];
};

export function workerLeaderboard(db: Db, range: Range): WorkerRow[] {
  const std = new Map<string, number>();
  for (const p of db.products) for (const r of routingLines(db, p.id)) std.set(`${p.id}:${r.operationId}`, r.stdMinutes);
  const orderProduct = new Map(db.orders.map((o) => [o.id, o.productId]));
  const cap = capacityBase(db);
  const workDays = workDaysBetween(range.from, range.to, cap.daysPerWeek);

  const rows = db.workers.map((w) => {
    const entries = db.stageEntries.filter(
      (e) => e.workerId === w.id && e.date >= range.from && e.date <= range.to,
    );
    const pieces = sum(entries.map((e) => e.qtyGood));
    const minutes = sum(
      entries.map((e) => {
        const pid = orderProduct.get(e.orderId);
        return e.qtyGood * (pid ? std.get(`${pid}:${e.operationId}`) ?? 0 : 0);
      }),
    );
    const bad = sum(entries.map((e) => e.qtyScrap + e.qtyRework));
    const daysPresent = new Set(
      db.workerEarnings
        .filter((e) => e.workerId === w.id && e.kind === "attendance" && e.date >= range.from && e.date <= range.to)
        .map((e) => e.date),
    ).size;
    return {
      id: w.id,
      name: w.name,
      pieces,
      minutes,
      daysPresent,
      qualityPct: pieces + bad > 0 ? (pieces / (pieces + bad)) * 100 : null,
      bad,
    };
  });

  const topMinutes = Math.max(...rows.map((r) => r.minutes), 0);

  return rows
    .map((r) => {
      const why: string[] = [];
      const parts: number[] = [];
      if (topMinutes > 0 && r.minutes > 0) {
        const p = clamp((r.minutes / topMinutes) * 100);
        parts.push(p);
        why.push(`${num(Math.round(r.minutes), 0)} دقيقة شغل معياري`);
      }
      if (r.qualityPct !== null) {
        parts.push(clamp(r.qualityPct));
        why.push(`${num(Math.round(r.qualityPct), 0)}٪ سليم`);
      }
      if (workDays > 0 && r.daysPresent > 0) {
        parts.push(clamp((r.daysPresent / workDays) * 100));
        why.push(`حضر ${num(r.daysPresent, 0)} من ${num(workDays, 0)} يوم عمل`);
      }
      return { ...r, score: parts.length ? Math.round(sum(parts) / parts.length) : null, why };
    })
    .filter((r) => r.score !== null)
    .sort((a, b) => (b.score as number) - (a.score as number));
}

export type DeptRow = { operationId: string; name: string; pieces: number; workers: number; perWorker: number | null };

export function productivityByDept(db: Db, range: Range): DeptRow[] {
  const map = new Map<string, { name: string; pieces: number; workers: Set<string> }>();
  for (const e of db.stageEntries.filter((x) => x.date >= range.from && x.date <= range.to)) {
    const name = db.operations.find((o) => o.id === e.operationId)?.name ?? "مرحلة";
    const row = map.get(e.operationId) ?? { name, pieces: 0, workers: new Set<string>() };
    row.pieces += e.qtyGood;
    if (e.workerId) row.workers.add(e.workerId);
    map.set(e.operationId, row);
  }
  return [...map.entries()]
    .map(([operationId, v]) => ({
      operationId,
      name: v.name,
      pieces: v.pieces,
      workers: v.workers.size,
      perWorker: v.workers.size > 0 ? v.pieces / v.workers.size : null,
    }))
    .sort((a, b) => b.pieces - a.pieces);
}

export type Attendance = { crew: number; present: number; absent: number; pieceWorkers: number; isWorkDay: boolean };

export function attendanceToday(db: Db): Attendance {
  const today = cairoToday();
  const cap = capacityBase(db);
  const crew = db.workers.filter((w) => w.payType !== "piece").length;
  const present = new Set(
    db.workerEarnings.filter((e) => e.date === today && e.kind === "attendance").map((e) => e.workerId),
  ).size;
  return {
    crew,
    present,
    absent: Math.max(0, crew - present),
    pieceWorkers: db.workers.filter((w) => w.payType === "piece").length,
    isWorkDay: isWorkDay(today, cap.daysPerWeek),
  };
}

/* ── ٩) المالية ────────────────────────────────────────────────── */

export type CostSlice = { key: string; label: string; amount: number; sharePct: number; to: string };

/** تركيب المصروف: بنود المشتريات كل واحد لوحده + أجور العمال */
export function costMix(db: Db, range: Range): CostSlice[] {
  const inR = (d: string) => d >= range.from && d <= range.to;
  const map = new Map<string, { label: string; amount: number }>();
  for (const e of db.costEntries.filter((x) => inR(x.date))) {
    const label = db.costItems.find((i) => i.id === e.costItemId)?.name ?? "بند";
    const row = map.get(e.costItemId) ?? { label, amount: 0 };
    row.amount += e.amount;
    map.set(e.costItemId, row);
  }
  const labor = sum(db.workerEarnings.filter((w) => inR(w.date)).map((w) => w.amount));
  const rows = [...map.entries()].map(([key, v]) => ({ key, ...v, to: "/costs" }));
  if (labor > 0) rows.push({ key: "labor", label: "أجور العمال", amount: labor, to: "/workers" });
  const total = sum(rows.map((r) => r.amount));
  return rows
    .map((r) => ({ ...r, sharePct: total > 0 ? (r.amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

export type WaterfallStep = { key: string; label: string; amount: number; kind: "start" | "minus" | "end" };

/** الإيراد رِحل فين: من التوريدات لصافي الربح، بند بند */
export function profitWaterfall(db: Db, range: Range): WaterfallStep[] {
  const series = finSeries(db, range);
  const t = periodTotals(series);
  const slices = costMix(db, range);
  const top = slices.slice(0, 6);
  const rest = sum(slices.slice(6).map((s) => s.amount));

  const steps: WaterfallStep[] = [{ key: "revenue", label: "الإيراد", amount: t.revenue, kind: "start" }];
  for (const s of top) steps.push({ key: s.key, label: s.label, amount: -s.amount, kind: "minus" });
  if (rest > 0) steps.push({ key: "rest", label: "بنود أخرى", amount: -rest, kind: "minus" });
  steps.push({ key: "profit", label: "صافي الربح", amount: t.profit, kind: "end" });
  return steps;
}

export type BreakEven = {
  fixed: number;
  variable: number;
  revenue: number;
  contributionPct: number | null;
  breakEvenRevenue: number | null;
  safetyPct: number | null;
  fixedItems: string[];
  note: string;
};

/**
 * التعادل. الثابت = البنود اللي وحدتها «شهر» (إيجار، كهرباء…) —
 * ده مش تخمين، ده معلومة موجودة في بنود المصروفات نفسها.
 * والباقي متغيّر مع الإنتاج. الكارت بيقول القاعدة دي صريح.
 */
export function breakEven(db: Db, range: Range): BreakEven {
  const inR = (d: string) => d >= range.from && d <= range.to;
  const monthlyItems = new Set(db.costItems.filter((i) => i.unit === "شهر").map((i) => i.id));
  const fixed = sum(db.costEntries.filter((e) => inR(e.date) && monthlyItems.has(e.costItemId)).map((e) => e.amount));
  const variable =
    sum(db.costEntries.filter((e) => inR(e.date) && !monthlyItems.has(e.costItemId)).map((e) => e.amount)) +
    sum(db.workerEarnings.filter((w) => inR(w.date)).map((w) => w.amount));
  const revenue = sum(db.deliveries.filter((d) => inR(d.date)).map((d) => d.amount));
  const contributionPct = revenue > 0 ? ((revenue - variable) / revenue) * 100 : null;
  const breakEvenRevenue = contributionPct && contributionPct > 0 ? fixed / (contributionPct / 100) : null;
  return {
    fixed,
    variable,
    revenue,
    contributionPct,
    breakEvenRevenue,
    safetyPct: breakEvenRevenue && revenue > 0 ? ((revenue - breakEvenRevenue) / revenue) * 100 : null,
    fixedItems: db.costItems.filter((i) => monthlyItems.has(i.id)).map((i) => i.name),
    note: "الثابت = البنود اللي وحدتها «شهر» في بنود المصروفات. لو عندك بند ثابت بوحدة تانية، غيّر وحدته عشان الحساب يبقى أدق.",
  };
}

export type CashPoint = { key: string; label: string; inflow: number; outflow: number; net: number };

export function cashSeries(db: Db, range: Range): CashPoint[] {
  const grain = grainFor(range);
  return bucketsOf(range, grain).map((b) => {
    const inB = (d: string) => d >= b.from && d <= b.to;
    const inflow =
      sum(db.collections.filter((c) => c.status === "confirmed" && inB(c.date)).map((c) => c.amount)) +
      sum(db.manualTx.filter((t) => inB(t.date) && t.amount > 0).map((t) => t.amount));
    const outflow =
      sum(db.costPayments.filter((p) => inB(p.date)).map((p) => p.amount)) +
      sum(db.workerPayments.filter((p) => inB(p.date) && p.kind !== "deduction").map((p) => p.amount)) +
      sum(db.manualTx.filter((t) => inB(t.date) && t.amount < 0).map((t) => Math.abs(t.amount)));
    return { key: b.key, label: b.label, inflow, outflow, net: inflow - outflow };
  });
}

export type CashOutlook = {
  cash: number;
  expectedIn: number;
  expectedOut: number;
  projected: number;
  days: number;
  shortfall: boolean;
  pendingIn: number;
};

/**
 * توقع السيولة في غرفة التحكم — **نفس محرّك شاشة الفلوس** (`cashflow.ts`).
 *
 * الدالة دي كان جواها حسابها الخاص، فكان ممكن الكارت في الداشبورد يقول
 * رقم والشاشة تقول رقم تاني على نفس اليوم. فبقت بتنده المحرّك الواحد
 * وبترجع نفس الشكل القديم.
 *
 * والتغيير الحقيقي في الأرقام اتنين، والاتنين مقصودين ومكتوبين في
 * [cashflow.md](../../docs/cashflow.md):
 *
 *  * **المتأخر مابقاش محسوب داخل.** قبل كده كل مستحق ميعاده قبل نهاية
 *    النافذة كان بيتحسب داخل — بما فيه اللي فات ميعاده بشهور. ده كان
 *    بيطمّن صاحب المصنع على فلوس محدش وعد بيها. والمتأخر بيتعرض لوحده
 *    في شاشة الفلوس تحت سطر «لو حصّلته».
 *  * **مستحقات الورش بقت محسوبة خارج.** كانت ناقصة من `expectedOut`
 *    خالص، فالمصنع اللي بيشغّل بره كان بيشوف مطلوب أقل من الحقيقة.
 */
export function cashOutlook(db: Db, days: number): CashOutlook {
  const f = cashForecast(db, days);
  const rec = receivables(db);
  return {
    cash: f.opening,
    expectedIn: f.inflow,
    expectedOut: f.outflow,
    projected: f.closing,
    days,
    shortfall: !!f.shortfall,
    pendingIn: sum(rec.pending.map((c) => c.amount)),
  };
}

export type AgingBucket = { key: string; label: string; amount: number; count: number; tone: "ok" | "warn" | "danger" };

/** نفس التبويب اللي في شاشة الفلوس بالحرف — الحدود متعرّفة مرة واحدة هناك */
export function agingBuckets(db: Db): AgingBucket[] {
  return receivableAging(db).buckets.map((b) => ({
    key: b.key,
    label: b.key === "notDue" ? "لسه في الميعاد" : b.label,
    tone: b.tone,
    amount: b.total,
    count: b.count,
  }));
}

/* ── ١٠) العملاء والموديلات ────────────────────────────────────── */

export type CustomerRow = {
  id: string;
  name: string;
  revenue: number;
  profit: number | null;
  marginPct: number | null;
  orders: number;
  outstanding: number;
};

export function customerRevenue(db: Db, range: Range): CustomerRow[] {
  const inR = (d: string) => d >= range.from && d <= range.to;
  const rec = receivables(db);
  const rows = db.parties
    .filter((p) => !p.mergedIntoId)
    .map((p) => {
      const dels = db.deliveries.filter((d) => d.clientId === p.id && inR(d.date));
      const revenue = sum(dels.map((d) => d.amount));
      if (revenue <= 0) return null;

      // الربح من أوامر العميل اللي لها تكلفة محسوبة
      const orders = db.orders.filter((o) => o.clientId === p.id);
      let cost = 0;
      let covered = 0;
      for (const o of orders) {
        if (!o.productId) continue;
        const sheet = costSheet(db, o.productId);
        if (!sheet.hasBom) continue;
        const stages = orderStages(db, o);
        const produced = stages.length ? stages[stages.length - 1].good : 0;
        if (produced <= 0) continue;
        cost += sheet.total * produced;
        covered += produced * (o.piecePrice || sheet.sellPrice);
      }
      const profit = covered > 0 ? covered - cost : null;
      return {
        id: p.id,
        name: p.name,
        revenue,
        profit,
        marginPct: profit !== null && covered > 0 ? (profit / covered) * 100 : null,
        orders: dels.length,
        outstanding: sum(
          [...rec.overdue, ...rec.today, ...rec.week, ...rec.later]
            .filter((r) => r.clientId === p.id)
            .map((r) => r.remaining),
        ),
      };
    })
    .filter((r): r is CustomerRow => r !== null);
  return rows.sort((a, b) => b.revenue - a.revenue);
}

export type ModelRow = {
  productId: string;
  name: string;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number | null;
  score: number | null;
  verdict: "expand" | "improve" | "stop" | null;
};

export function modelRanking(db: Db): ModelRow[] {
  return profitRanking(db, "totalProfit")
    .filter((r) => r.ready)
    .map((r) => ({
      productId: r.product.id,
      name: r.product.name,
      units: r.producedQty,
      revenue: r.revenue,
      cost: r.cost * r.producedQty,
      profit: r.totalProfit,
      marginPct: r.marginPct,
      score: r.score,
      verdict: r.verdict,
    }));
}

/* ── ١١) التوقعات ──────────────────────────────────────────────── */

export type Forecast = {
  days: number;
  committed: number;
  trend: number | null;
  expectedRevenue: number | null;
  expectedUnits: number | null;
  confidencePct: number | null;
  basis: string;
  missing: string | null;
};

/**
 * توقع الشهر الجاي = **مؤكد + اتجاه**.
 * المؤكد: قيمة الأوامر المفتوحة اللي ميعادها جوه النافذة.
 * الاتجاه: متوسط يومي من آخر ٩٠ يوم.
 * والثقة من تقلّب الأسابيع الماضية، مش رقم بنحطه من دماغنا.
 */
export function forecast(db: Db, days = 30): Forecast {
  const today = cairoToday();
  const until = addDays(today, days);
  const open = openOrders(db);
  const committed = sum(
    open.filter((o) => o.dueDate <= until).map((o) => o.quantity * (o.piecePrice || 0)),
  );

  const hist = finSeries(db, mk("custom", addDays(today, -90), today), "week").filter((p) => p.revenue > 0);
  if (hist.length < 3) {
    return {
      days,
      committed,
      trend: null,
      expectedRevenue: committed > 0 ? committed : null,
      expectedUnits: null,
      confidencePct: null,
      basis: committed > 0 ? "أوامر مفتوحة ميعادها جوه النافذة" : "",
      missing: "٣ أسابيع توريدات على الأقل عشان نقدر نحسب اتجاه",
    };
  }

  const weekly = hist.map((p) => p.revenue);
  const avg = sum(weekly) / weekly.length;
  const trend = (avg / 7) * days;
  const spread = Math.sqrt(sum(weekly.map((v) => (v - avg) ** 2)) / weekly.length);
  const cv = avg > 0 ? spread / avg : 1;
  const unitsHist = sum(hist.map((p) => p.units));
  const perWeekUnits = unitsHist / hist.length;

  return {
    days,
    committed,
    trend,
    expectedRevenue: Math.max(committed, trend),
    expectedUnits: perWeekUnits > 0 ? Math.round((perWeekUnits / 7) * days) : null,
    confidencePct: Math.round(clamp((1 - Math.min(1, cv)) * 100, 25, 92)),
    basis: `متوسط ${num(Math.round(avg), 0)} ج في الأسبوع على ${num(hist.length, 0)} أسبوع${
      committed > 0 ? `، ومؤكد من أوامر مفتوحة ${moneyPlain(committed)} ج` : ""
    }`,
    missing: null,
  };
}

/* ── ١٢) طبقة القرار ───────────────────────────────────────────── */

export type DecisionKind = "risk" | "opportunity" | "attention";

export type Decision = {
  key: string;
  kind: DecisionKind;
  tone: "danger" | "warn" | "ok";
  /** الجملة اللي بتقول «إيه اللي حصل» */
  headline: string;
  /** السبب — ده اللي بيفرق لوحة قرار عن لوحة أرقام */
  cause: string;
  /** الأثر بالجنيه لو قدرنا نحسبه */
  impact: number | null;
  impactLabel: string | null;
  action: string;
  to: string | null;
  evidence: string[];
};

/**
 * **الطبقة اللي بتحوّل البيانات لقرار.**
 *
 * القاعدة: مفيش سطر هنا بيقول رقم لوحده. كل سطر لازم يقول
 * **إيه اللي حصل + السبب + الأثر بالجنيه + أعمل إيه**.
 * ولو السبب مش معروف من البيانات، السطر مابيتكتبش خالص.
 */
export function decisions(db: Db, range: Range, cmp: Range | null): Decision[] {
  const out: Decision[] = [];
  const now = periodTotals(finSeries(db, range));
  const before = cmp ? periodTotals(finSeries(db, cmp)) : null;

  /* ١) الإيراد بيزيد والربح مش بيزيد زيه — وتفكيك السبب لبند بعينه */
  if (cmp && before && before.revenue > 0 && before.profit > 0 && now.revenue > before.revenue) {
    const revUp = pctChange(now.revenue, before.revenue) ?? 0;
    const profUp = pctChange(now.profit, before.profit) ?? 0;
    if (revUp - profUp > 4) {
      const mixNow = costMix(db, range);
      const mixBefore = new Map(costMix(db, cmp).map((s) => [s.key, s.amount]));
      const risers = mixNow
        .map((s) => ({ ...s, delta: s.amount - (mixBefore.get(s.key) ?? 0), ratio: pctChange(s.amount, mixBefore.get(s.key) ?? 0) }))
        .filter((s) => s.delta > 0)
        .sort((a, b) => b.delta - a.delta);
      const top = risers[0];
      if (top) {
        const perDay = top.delta / Math.max(1, range.days);
        out.push({
          key: "profit-lag",
          kind: "attention",
          tone: revUp - profUp > 12 ? "danger" : "warn",
          headline: `الإيراد زاد ${num(Math.round(revUp), 0)}٪ والربح زاد ${num(Math.round(profUp), 0)}٪ بس`,
          cause:
            top.ratio === null
              ? `أكبر بند طالع: ${top.label} بزيادة ${moneyPlain(top.delta)} ج`
              : `السبب الأكبر: ${top.label} زاد ${num(Math.round(top.ratio), 0)}٪ (${moneyPlain(top.delta)} ج)`,
          impact: top.delta,
          impactLabel: `أثر شهري متوقع ${moneyPlain(perDay * 30)} ج على الربح`,
          action: `راجع أسعار ${top.label} مع الموردين، أو مرّر الزيادة على سعر البيع`,
          to: "/costs",
          evidence: [
            `الإيراد ${moneyPlain(before.revenue)} ← ${moneyPlain(now.revenue)} ج`,
            `الربح ${moneyPlain(before.profit)} ← ${moneyPlain(now.profit)} ج`,
            `${top.label} ${moneyPlain(mixBefore.get(top.key) ?? 0)} ← ${moneyPlain(top.amount)} ج`,
          ],
        });
      }
    }
  }

  /* ٢) خامة سعرها طلع — والموديلات المتأثرة بالاسم */
  for (const row of materialPriceMoves(db, range, cmp)) {
    if (row.changePct <= 5) continue;
    out.push({
      key: `mat-price-${row.materialId}`,
      kind: "risk",
      tone: row.changePct >= 12 ? "danger" : "warn",
      headline: `${row.name} سعره طلع ${num(Math.round(row.changePct), 0)}٪`,
      cause: `من ${moneyPlain(row.before)} لـ${moneyPlain(row.after)} ج للوحدة${row.vendor ? ` — آخر شراء من ${row.vendor}` : ""}`,
      impact: row.profitImpact,
      impactLabel: row.profitImpact > 0 ? `بيقلّل الربح ${moneyPlain(row.profitImpact)} ج على حجم الفترة` : null,
      action:
        row.models.length > 0
          ? `راجع سعر ${row.models.slice(0, 2).join(" و")}${row.models.length > 2 ? ` و${num(row.models.length - 2, 0)} غيرهم` : ""} أو دوّر على مورّد بديل`
          : "دوّر على مورّد بديل قبل الشراء الجاي",
      to: `/materials/${row.materialId}`,
      evidence: [
        `${num(row.purchases, 0)} فاتورة شراء في الفترة`,
        row.models.length ? `الموديلات المتأثرة: ${row.models.join("، ")}` : "الخامة مش داخلة في أي قائمة خامات لسه",
      ],
    });
  }

  /* ٣) أقوى موديل — فرصة توسّع محسوبة */
  const models = modelRanking(db);
  const best = models.filter((m) => m.verdict === "expand" && m.marginPct !== null)[0];
  if (best) {
    const vol = modelVolume(db, best.productId);
    out.push({
      key: `expand-${best.productId}`,
      kind: "opportunity",
      tone: "ok",
      headline: `${best.name} أعلى ربحية في المصنع — هامش ${num(Math.round(best.marginPct as number), 0)}٪`,
      cause:
        vol.remaining > 0
          ? `وعليه أوامر مفتوحة فيها ${num(Math.round(vol.remaining), 0)} قطعة لسه`
          : "وربحه ثابت على أوامره المسجّلة",
      impact: best.profit,
      impactLabel: `حقّق ${moneyPlain(best.profit)} ج ربح على ${num(best.units, 0)} قطعة`,
      action: "زوّد نصيبه من الطاقة على حساب الموديلات الأقل هامشًا",
      to: `/products/${best.productId}`,
      evidence: [`سكور الربحية ${num(best.score ?? 0, 0)} من ١٠٠`, `الإيراد ${moneyPlain(best.revenue)} ج والتكلفة ${moneyPlain(best.cost)} ج`],
    });
  }

  /* ٤) موديل بيخسر أو تحت الهدف */
  const target = targetMarginOf(db);
  const worst = models.filter((m) => m.marginPct !== null && (m.marginPct as number) < target && m.units > 0).sort(
    (a, b) => (a.marginPct as number) - (b.marginPct as number),
  )[0];
  if (worst) {
    const gap = target - (worst.marginPct as number);
    const lost = (gap / 100) * worst.revenue;
    out.push({
      key: `weak-${worst.productId}`,
      kind: "risk",
      tone: (worst.marginPct as number) < 0 ? "danger" : "warn",
      headline: `${worst.name} هامشه ${num(Math.round(worst.marginPct as number), 0)}٪ والهدف ${num(Math.round(target), 0)}٪`,
      cause: `فرق ${num(Math.round(gap), 0)} نقطة على إيراد ${moneyPlain(worst.revenue)} ج`,
      impact: lost,
      impactLabel: `لو وصل للهدف كان زاد ${moneyPlain(lost)} ج`,
      action: "افتح تشخيص التكلفة: هو السعر واطي ولا الخامة غلية ولا الهالك عالي",
      to: `/products/${worst.productId}`,
      evidence: [`${num(worst.units, 0)} قطعة منتجة`, `تكلفة ${moneyPlain(worst.cost)} ج مقابل إيراد ${moneyPlain(worst.revenue)} ج`],
    });
  }

  /* ٥) الاختناق بالفلوس مش بالقطع بس */
  const bn = factoryBottleneck(db);
  if (bn && bn.waitingPct >= 15) {
    const avgPrice = db.orders.length ? sum(db.orders.map((o) => o.piecePrice)) / db.orders.length : 0;
    out.push({
      key: "bottleneck",
      kind: "risk",
      tone: bn.waitingPct >= 40 ? "danger" : "warn",
      headline: `${bn.step.name} هي الاختناق — ${num(Math.round(bn.step.waiting), 0)} قطعة واقفة`,
      cause: `${num(Math.round(bn.waitingPct), 0)}٪ من اللي وصل المرحلة دي لسه مخرجش منها`,
      impact: bn.step.waiting * avgPrice,
      impactLabel: avgPrice > 0 ? `قيمة الواقف ${moneyPlain(bn.step.waiting * avgPrice)} ج بسعر البيع` : null,
      action: "نقّل عمالة على المرحلة دي أو شغّلها وقت إضافي لحد ما الرصيد ينزل",
      to: "/planning",
      evidence: [bn.why],
    });
  }

  /* ٦) خط إنتاج عيوبه أعلى من باقي المصنع */
  const lines = lineStats(db, range).filter((l) => l.defectPct !== null && l.units > 30);
  if (lines.length >= 2) {
    const avg = sum(lines.map((l) => l.defectPct as number)) / lines.length;
    const bad = [...lines].sort((a, b) => (b.defectPct as number) - (a.defectPct as number))[0];
    if ((bad.defectPct as number) > avg * 1.4 && (bad.defectPct as number) > 4) {
      const extra = ((bad.defectPct as number) - avg) / 100 * bad.units;
      out.push({
        key: `line-${bad.line}`,
        kind: "risk",
        tone: (bad.defectPct as number) > 10 ? "danger" : "warn",
        headline: `${bad.line} نسبة عيوبه ${num(Math.round(bad.defectPct as number), 0)}٪ — الأعلى في المصنع`,
        cause: `متوسط باقي الخطوط ${num(Math.round(avg), 0)}٪`,
        impact: extra * 30,
        impactLabel: `الفرق ده يعني ${num(Math.round(extra), 0)} قطعة زيادة في التالف`,
        action: "راجع المرحلة اللي بيظهر فيها العيب على الخط ده مع المشرف",
        to: "/orders",
        evidence: [`${num(Math.round(bad.units), 0)} قطعة على الخط في الفترة`],
      });
    }
  }

  /* ٧) مخزون راكد = كاش نايم */
  const dead = deadStock(db);
  if (dead.value > 0 && dead.rows.length) {
    out.push({
      key: "dead-stock",
      kind: "opportunity",
      tone: "warn",
      headline: `${moneyPlain(dead.value)} ج مخزون راكد`,
      cause: `${num(dead.rows.length, 0)} خامة عندها رصيد ومفيش عليها أي استهلاك مسجّل`,
      impact: dead.value,
      impactLabel: `كاش نايم — أكبرهم ${dead.rows[0].name} بـ${moneyPlain(dead.rows[0].value)} ج`,
      action: "استخدمها في موديل قريب، أو رجّعها للمورّد، أو بيعها بسعر التكلفة",
      to: "/materials",
      evidence: dead.rows.slice(0, 3).map((r) => `${r.name}: ${num(r.qty, 2)} ${r.unit} بـ${moneyPlain(r.value)} ج`),
    });
  }

  /* ٨) الهالك بالفلوس */
  const waste = wasteByMaterial(db, range);
  if (waste.total > 0 && waste.rows.length) {
    const top = waste.rows[0];
    out.push({
      key: "waste",
      kind: "opportunity",
      tone: "warn",
      headline: `الهالك كلّفك ${moneyPlain(waste.total)} ج في الفترة`,
      cause: `أكبر بند: ${top.name} بـ${moneyPlain(top.cost)} ج`,
      impact: waste.total,
      impactLabel: `لو قلّ للنصف بتوفّر ${moneyPlain(waste.total / 2)} ج`,
      action: "راجع نسبة الهالك في قائمة الخامات مقابل الهالك الفعلي على الأمر",
      to: "/costing",
      evidence: waste.rows.slice(0, 3).map((r) => `${r.name}: ${num(r.qty, 2)} ${r.unit} بـ${moneyPlain(r.cost)} ج`),
    });
  }

  /* ٩) تحصيل قديم */
  const aging = agingBuckets(db);
  const old = aging[3].amount + aging[4].amount;
  if (old > 0) {
    out.push({
      key: "aging",
      kind: "risk",
      tone: aging[4].amount > 0 ? "danger" : "warn",
      headline: `${moneyPlain(old)} ج متأخرة أكتر من ٦٠ يوم`,
      cause: `منها ${moneyPlain(aging[4].amount)} ج عدّت التسعين يوم`,
      impact: old,
      impactLabel: "فلوس شغّالة عند العملاء بدل ما تكون في الخزينة",
      action: "ابدأ بأكبر رصيد: تذكير مكتوب، وبعدها وقف توريد لحد السداد",
      to: "/collections",
      evidence: aging
        .filter((b) => b.amount > 0)
        .map((b) => `${b.label}: ${moneyPlain(b.amount)} ج على ${num(b.count, 0)} توريد`),
    });
  }

  /* ١٠) مورّد سعره أعلى من الوسيط */
  const suppliers = supplierScores(db).filter((s) => s.priceGapPct !== null && s.priceGapPct > 8 && s.purchases > 0);
  for (const s of suppliers.slice(0, 2)) {
    const saving = (s.purchases * (s.priceGapPct as number)) / 100;
    out.push({
      key: `supplier-${s.id ?? s.name}`,
      kind: "opportunity",
      tone: "warn",
      headline: `${s.name} سعره أعلى من الوسيط بـ${num(Math.round(s.priceGapPct as number), 0)}٪`,
      cause: `اشتريت منه ${moneyPlain(s.purchases)} ج على ${num(s.entries, 0)} فاتورة`,
      impact: saving,
      impactLabel: `لو نزل للوسيط بتوفّر ${moneyPlain(saving)} ج`,
      action: "تفاوض على السعر أو وزّع الشراء على مورّد تاني لنفس البند",
      to: s.id ? `/parties/${s.id}` : "/costs",
      evidence: s.why,
    });
  }

  /* ١١) السيولة مش هتكفي */
  const outlook = cashOutlook(db, 30);
  if (outlook.shortfall) {
    out.push({
      key: "cash-gap",
      kind: "risk",
      tone: "danger",
      headline: `متوقع نقص سيولة ${moneyPlain(Math.abs(outlook.projected))} ج خلال ٣٠ يوم`,
      cause: `كاش ${moneyPlain(outlook.cash)} + تحصيل متوقع ${moneyPlain(outlook.expectedIn)} مقابل التزامات ${moneyPlain(outlook.expectedOut)} ج`,
      impact: Math.abs(outlook.projected),
      impactLabel: "الفرق ده لازم يتغطّى بتحصيل أسرع أو تأجيل دفع",
      action: "قدّم أقرب تحصيل، وأجّل الدفع اللي مالهوش غرامة",
      to: "/treasury",
      evidence: [
        `التزامات الموردين والعمال ${moneyPlain(outlook.expectedOut)} ج`,
        outlook.pendingIn > 0 ? `و${moneyPlain(outlook.pendingIn)} ج تحصيل مستني تأكيد مش داخل في الحساب` : "",
      ].filter(Boolean),
    });
  }

  /* ١٢) تركيز الإيراد على عميل واحد */
  const customers = customerRevenue(db, range);
  const totalRev = sum(customers.map((c) => c.revenue));
  if (customers.length >= 2 && totalRev > 0) {
    const top = customers[0];
    const share = (top.revenue / totalRev) * 100;
    if (share >= 40) {
      out.push({
        key: "concentration",
        kind: "risk",
        tone: share >= 60 ? "danger" : "warn",
        headline: `${num(Math.round(share), 0)}٪ من إيرادك من ${top.name} لوحده`,
        cause: `${moneyPlain(top.revenue)} ج من إجمالي ${moneyPlain(totalRev)} ج`,
        impact: top.revenue,
        impactLabel: "لو وقف التعامل، الإيراد ينزل بالنسبة دي",
        action: "وسّع قاعدة العملاء، ولو لأ يبقى شروط الدفع معاه لازم تبقى أضمن",
        to: `/parties/${top.id}`,
        evidence: customers.slice(0, 3).map((c) => `${c.name}: ${moneyPlain(c.revenue)} ج`),
      });
    }
  }

  const rank = { danger: 2, warn: 1, ok: 0 };
  return out.sort((a, b) => rank[b.tone] - rank[a.tone] || (b.impact ?? 0) - (a.impact ?? 0));
}

export type PriceMove = {
  materialId: string;
  name: string;
  before: number;
  after: number;
  changePct: number;
  vendor: string;
  purchases: number;
  models: string[];
  profitImpact: number;
};

/** حركة سعر الخامة بين الفترتين، وأثرها على الموديلات اللي بتستخدمها */
export function materialPriceMoves(db: Db, range: Range, cmp: Range | null): PriceMove[] {
  if (!cmp) return [];
  const avgIn = (materialId: string, from: string, to: string) => {
    const moves = db.stockMovements.filter(
      (m) => m.itemType === "material" && m.itemId === materialId && m.kind === "purchase" && m.date >= from && m.date <= to,
    );
    const q = sum(moves.map((m) => m.qty));
    return q > 0 ? { price: sum(moves.map((m) => m.qty * m.unitCost)) / q, count: moves.length } : null;
  };

  const out: PriceMove[] = [];
  for (const m of db.materials) {
    const now = avgIn(m.id, range.from, range.to);
    const past = avgIn(m.id, cmp.from, cmp.to);
    if (!now || !past || past.price <= 0) continue;
    const changePct = ((now.price - past.price) / past.price) * 100;
    if (Math.abs(changePct) < 1) continue;

    const models: string[] = [];
    let impact = 0;
    for (const p of db.products) {
      const bom = db.boms.find((b) => b.productId === p.id && b.status === "active");
      if (!bom) continue;
      const item = db.bomItems.find((i) => i.bomId === bom.id && i.materialId === m.id);
      if (!item) continue;
      models.push(p.name);
      const per = item.qtyPerUnit * (1 + item.wastePct / 100);
      const units = sum(
        db.orders
          .filter((o) => o.productId === p.id)
          .map((o) => {
            const stages = orderStages(db, o);
            const produced = stages.length ? stages[stages.length - 1].good : 0;
            return produced;
          }),
      );
      impact += per * (now.price - past.price) * units;
    }

    const lastPurchase = db.costEntries
      .filter((e) => e.date >= range.from && e.date <= range.to)
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];

    out.push({
      materialId: m.id,
      name: m.name,
      before: past.price,
      after: now.price,
      changePct,
      vendor: m.defaultVendor || lastPurchase?.vendor || "",
      purchases: now.count,
      models,
      profitImpact: Math.max(0, impact),
    });
  }
  return out.sort((a, b) => b.changePct - a.changePct);
}

/* ── ١٣) الفرص والمخاطر ────────────────────────────────────────── */

export type Opportunity = { key: string; label: string; amount: number; action: string; to: string | null };

export function opportunities(db: Db, range: Range, cmp: Range | null): { rows: Opportunity[]; total: number } {
  const rows = decisions(db, range, cmp)
    .filter((d) => d.kind === "opportunity" && d.impact !== null && d.impact > 0)
    .map((d) => ({ key: d.key, label: d.headline, amount: d.impact as number, action: d.action, to: d.to }));
  return { rows, total: sum(rows.map((r) => r.amount)) };
}

export type RiskLine = { key: string; label: string; tone: "danger" | "warn"; to: string | null };

export type RiskProfile = { score: number | null; lines: RiskLine[]; note: string };

/**
 * مؤشر الخطر — **الأقل أحسن**. بيتحسب من عدد ونوع المخاطر القايمة
 * فعلًا في البيانات، مش من تقدير. ولو مفيش بيانات كفاية بيرجّع null.
 */
export function riskProfile(db: Db, range: Range, cmp: Range | null): RiskProfile {
  const ds = decisions(db, range, cmp).filter((d) => d.kind === "risk" || d.kind === "attention");
  const lines: RiskLine[] = ds.map((d) => ({
    key: d.key,
    label: d.headline,
    tone: d.tone === "danger" ? "danger" : "warn",
    to: d.to,
  }));
  if (!db.orders.length && !db.deliveries.length) return { score: null, lines, note: "مفيش أوامر ولا توريدات لسه" };
  const weight = sum(ds.map((d) => (d.tone === "danger" ? 12 : 5)));
  return {
    score: Math.round(clamp(weight)),
    lines,
    note: "محسوب من عدد المخاطر القايمة وخطورتها. الأقل أحسن.",
  };
}

/* ── ١٤) النشاط والتقويم ───────────────────────────────────────── */

export type ActivityRow = { id: string; at: string; actor: string; text: string; to: string | null };

const TABLE_LABEL: Record<string, string> = {
  orders: "أمر إنتاج",
  deliveries: "توريد",
  collections: "تحصيل",
  costEntries: "بند مصروف",
  products: "منتج",
  materials: "خامة",
  parties: "جهة تعامل",
  workers: "عامل",
  stageEntries: "تسجيل مرحلة",
  stockMovements: "حركة مخزن",
  settings: "إعدادات",
  members: "فريق",
};

const ACTION_VERB: Record<string, string> = {
  create: "أضاف",
  update: "عدّل",
  delete: "مسح",
  restore: "رجّع",
};

export function activity(db: Db, limit = 8): ActivityRow[] {
  return [...db.auditLog]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, limit)
    .map((e) => ({
      id: e.id,
      at: e.at,
      actor: e.actorName,
      text: `${ACTION_VERB[e.action] ?? e.action} ${TABLE_LABEL[e.table] ?? e.table}`,
      to: e.table === "orders" ? `/orders/${e.recordId}` : e.table === "parties" ? `/parties/${e.recordId}` : null,
    }));
}

export type CalendarDay = {
  date: string;
  label: string;
  isToday: boolean;
  isWorkDay: boolean;
  orders: { code: string; id: string }[];
  payments: { name: string; amount: number; clientId: string }[];
  tasks: { title: string; id: string }[];
};

/** تقويم المواعيد: تسليم أوامر، استحقاق سداد، ومهام — من نفس الدفاتر */
export function calendar(db: Db, days = 14): CalendarDay[] {
  const today = cairoToday();
  const cap = capacityBase(db);
  const rec = receivables(db);
  const all = [...rec.overdue, ...rec.today, ...rec.week, ...rec.later];

  const out: CalendarDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    out.push({
      date,
      label: formatDate(date),
      isToday: date === today,
      isWorkDay: isWorkDay(date, cap.daysPerWeek),
      orders: db.orders.filter((o) => o.dueDate === date && o.status !== "done").map((o) => ({ code: o.code, id: o.id })),
      payments: all
        .filter((r) => r.dueDate === date)
        .map((r) => ({ name: r.clientName, amount: r.remaining, clientId: r.clientId })),
      tasks: db.tasks.filter((t) => t.status === "open" && t.dueDate === date).map((t) => ({ title: t.title, id: t.id })),
    });
  }
  return out;
}

/* ── ١٥) الهدف مقابل الفعلي ────────────────────────────────────── */

export type TargetRow = {
  key: string;
  label: string;
  format: KpiFormat;
  actual: number | null;
  target: number | null;
  variancePct: number | null;
  /** الفرق في مؤشر نسبته مئوية بيتقال بالنقط — «٦٦٪ مقابل هدف ٤٠٪» فرقه ٢٦ نقطة مش ٦٤٪ */
  variancePoints: number | null;
  tone: "ok" | "warn" | "danger" | "muted";
  source: string;
};

/** الأهداف المسجّلة بس. اللي مالوش هدف محفوظ مابيتعرضش له هدف مخترع. */
export function targets(db: Db, range: Range): TargetRow[] {
  const rows: TargetRow[] = [];
  for (const k of kpis(db, range, null)) {
    if (k.target === null || k.value === null) continue;
    const variancePct = k.target > 0 ? ((k.value - k.target) / k.target) * 100 : null;
    const good = k.upIsGood ? k.value >= k.target : k.value <= k.target;
    rows.push({
      key: k.key,
      label: k.label,
      format: k.format,
      actual: k.value,
      target: k.target,
      variancePct,
      variancePoints: k.format === "pct" ? k.value - k.target : null,
      tone: good ? "ok" : variancePct !== null && Math.abs(variancePct) > 15 ? "danger" : "warn",
      source: k.targetLabel ?? "",
    });
  }
  return rows;
}

/* ── ١٦) أوضاع اللوحة ──────────────────────────────────────────── */

export const DASH_MODES = ["exec", "manager", "floor"] as const;
export type DashMode = (typeof DASH_MODES)[number];

export const DASH_MODE_LABEL: Record<DashMode, string> = {
  exec: "نظرة المالك",
  manager: "إدارة التشغيل",
  floor: "أرض المصنع",
};

export const DASH_MODE_HINT: Record<DashMode, string> = {
  exec: "ربح وسيولة وعملاء — القرارات الكبيرة",
  manager: "أوامر وطاقة واختناقات وخامات",
  floor: "إنتاج النهارده وحضور وجودة",
};

/** الترتيب بيتغيّر بالوضع: كل دور بيشوف اللي بيهمه فوق */
export const MODE_SECTIONS: Record<DashMode, string[]> = {
  exec: ["health", "decisions", "kpis", "quick", "finance", "margin", "waterfall", "cash", "aging", "production", "machines", "pipeline", "customers", "models", "forecast", "targets", "timeline"],
  manager: ["health", "decisions", "kpis", "quick", "production", "pipeline", "live", "quality", "machines", "inventory", "suppliers", "workforce", "targets", "timeline"],
  floor: ["production", "live", "machines", "pipeline", "workforce", "quality", "inventory", "quick"],
};

export function modeForRole(role: string, seesFinance: boolean): DashMode {
  if (role === "supervisor") return "floor";
  if (role === "accountant") return seesFinance ? "exec" : "manager";
  return "exec";
}

/* ── ١٧) مصنع لسه فاضي ─────────────────────────────────────────── */

export type Emptiness = { isEmpty: boolean; hasAny: boolean; counts: { label: string; n: number; to: string }[] };

/**
 * مصنع جديد مايستحقش لوحة كلها أصفار. الصفر هنا معناه «لسه»،
 * ومفيش فايدة من عرض ١٥ كارت فاضي بدل خطوة واحدة واضحة.
 */
export function emptiness(db: Db): Emptiness {
  const counts = [
    { label: "منتجات", n: db.products.length, to: "/products" },
    { label: "خامات", n: db.materials.length, to: "/materials" },
    { label: "جهات تعامل", n: db.parties.length, to: "/parties" },
    { label: "عمال", n: db.workers.length, to: "/workers" },
    { label: "أوامر إنتاج", n: db.orders.length, to: "/orders" },
    { label: "توريدات", n: db.deliveries.length, to: "/collections" },
  ];
  const movement = db.orders.length + db.deliveries.length + db.stageEntries.length;
  return { isEmpty: movement === 0, hasAny: counts.some((c) => c.n > 0), counts };
}

/* ── ١٨) اللي لسه محتاج بيانات مش موجودة ───────────────────────── */

export type Gap = { label: string; needs: string };

/**
 * الصدق في الواجهة: الحاجات اللي البرومبت طلبها والبيانات
 * مابتسمحش بيها لسه. بنسمّيها بدل ما نعرض أرقام ملفّقة.
 */
export const DASHBOARD_GAPS: Gap[] = [
  // سبب العيب بقى متسجّل على الباندل (شوف «العيوب» في متابعة العمليات)، لكن
  // التسجيل اليدوي للمرحلة لسه بيدخل كمية بلا سبب — فالباريتو ناقص الجزء ده
  { label: "سبب العيب في التسجيل اليدوي للمرحلة", needs: "تصنيف عيوب على تسجيل المرحلة زي اللي على الباندل — باريتو العيوب دلوقتي بيقرأ الشغل المتتبّع بالباندل بس" },
  { label: "طاقة كل مرحلة وكل خط لوحده", needs: "طاقة على مستوى المرحلة — دلوقتي الطاقة للمصنع كله" },
  // الالتزام بمواعيد الموردين اتقفل في M-V1: بقى فيه ميعاد متفق عليه على
  // أمر التوريد وتاريخ فعلي على الاستلام، فالمقارنة بتتحسب من الدفتر
  // وبتتعرض في «التزام الموردين» جوه /supply.
  { label: "تحديث لحظي بدون تحديث الصفحة", needs: "سيرفر ببث تغييرات (Realtime) — النسخة دي بتحسب عند العرض" },
  { label: "لوحة يبنيها كل مستخدم بنفسه", needs: "تخزين تفضيلات لكل حساب على السيرفر عشان تتبع الحساب مش الجهاز" },
];

