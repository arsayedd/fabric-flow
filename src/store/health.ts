import { addDays, cairoToday, formatDate, moneyPlain, qty as num } from "@/lib/utils";
import { allAccountBalances, payables, receivables } from "./compute";
import { costSheet, profitAlerts, profitDashboard } from "./costing";
import { customerScore, riskScore } from "./intelligence";
import { orderStages, routingLines, materialStock, productById } from "./manufacturing";
import { machineSummary, machinesDownNow } from "./machines";
import { capacityBase, isWorkDay, mrp, openOrders, schedule, workDaysBetween } from "./planning";
import type { Db } from "./types";
import { MACHINE_STATE_LABEL } from "./types";

/**
 * صحة المصنع والإدارة بالاستثناء.
 *
 * أربع قواعد:
 * ١. مفيش رقم بيتخزَّن — كل درجة بتتحسب وقت العرض من نفس الحركات المسجّلة.
 * ٢. المؤشر اللي مفيش له بيانات بيتشال ووزنه يتوزّع على الباقي، ومبيتحسبش صفر.
 *    صفر معناه «وحش»، والفاضي معناه «مش مسجّل» — وفرق بينهم مهم.
 * ٣. كل درجة بتقول الأرقام اللي اتبنت عليها بالنص.
 * ٤. الاستثناءات مرتّبة بأثرها الفعلي (فلوس أو أيام تأخير)، مش بترتيب الكود.
 */

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const round = (v: number) => Math.round(v * 100) / 100;

/* ── نظرة النهارده ─────────────────────────────────────────────── */

export type Overview = {
  producedToday: number;
  producedWeek: number;
  openOrders: number;
  lateOrders: number;
  stoppedOrders: number;
  revenueMonth: number;
  costMonth: number;
  profitMonth: number;
  wasteCostMonth: number;
  defectsMonth: number;
  goodMonth: number;
  defectPct: number | null;
  presentToday: number;
  crewSize: number;
  cash: number;
  collectedMonth: number;
  overdueAmount: number;
  dueToVendors: number;
};

export function overview(db: Db): Overview {
  const today = cairoToday();
  const weekAgo = addDays(today, -7);
  const monthAgo = addDays(today, -30);

  const entries = db.stageEntries;
  const lastOps = new Map<string, string>();
  for (const o of db.orders) {
    const routes = o.productId ? routingLines(db, o.productId) : [];
    if (routes.length) lastOps.set(o.id, routes[routes.length - 1].operationId);
  }
  /** المنتَج = آخر مرحلة في المسار، عشان القطعة متتعدّش أكتر من مرة */
  const producedIn = (from: string) =>
    entries
      .filter((e) => e.date >= from && lastOps.get(e.orderId) === e.operationId)
      .reduce((s, e) => s + e.qtyGood, 0);

  const monthEntries = entries.filter((e) => e.date >= monthAgo);
  const good = monthEntries.reduce((s, e) => s + e.qtyGood, 0);
  const defects = monthEntries.reduce((s, e) => s + e.qtyScrap + e.qtyRework, 0);

  const rec = receivables(db);
  const pay = payables(db);
  const open = openOrders(db);

  return {
    producedToday: producedIn(today),
    producedWeek: producedIn(weekAgo),
    openOrders: open.length,
    lateOrders: db.orders.filter((o) => o.status === "late").length,
    stoppedOrders: db.orders.filter((o) => o.status === "stopped").length,
    revenueMonth: db.deliveries.filter((d) => d.date >= monthAgo).reduce((s, d) => s + d.amount, 0),
    costMonth:
      db.costEntries.filter((c) => c.date >= monthAgo).reduce((s, c) => s + c.amount, 0) +
      db.workerEarnings.filter((w) => w.date >= monthAgo).reduce((s, w) => s + w.amount, 0),
    profitMonth:
      db.deliveries.filter((d) => d.date >= monthAgo).reduce((s, d) => s + d.amount, 0) -
      db.costEntries.filter((c) => c.date >= monthAgo).reduce((s, c) => s + c.amount, 0) -
      db.workerEarnings.filter((w) => w.date >= monthAgo).reduce((s, w) => s + w.amount, 0),
    wasteCostMonth: db.stockMovements
      .filter((m) => m.kind === "waste" && m.date >= monthAgo)
      .reduce((s, m) => s + Math.abs(m.qty) * m.unitCost, 0),
    defectsMonth: defects,
    goodMonth: good,
    defectPct: good + defects > 0 ? (defects / (good + defects)) * 100 : null,
    presentToday: new Set(
      db.workerEarnings.filter((e) => e.date === today && e.kind === "attendance").map((e) => e.workerId),
    ).size,
    crewSize: db.workers.filter((w) => w.payType !== "piece").length,
    cash: allAccountBalances(db).reduce((s, a) => s + a.balance, 0),
    collectedMonth: db.collections
      .filter((c) => c.status === "confirmed" && c.date >= monthAgo)
      .reduce((s, c) => s + c.amount, 0),
    overdueAmount: rec.overdue.reduce((s, r) => s + r.remaining, 0),
    dueToVendors: pay.vendorTotal + pay.workerTotal,
  };
}

/* ── مسار القطع في المصنع كله ──────────────────────────────────── */

export type FunnelStep = {
  operationId: string;
  name: string;
  seq: number;
  /** كمية وصلت للمرحلة دي (خرجت من اللي قبلها، أو كمية الأوامر لأول مرحلة) */
  arrived: number;
  done: number;
  waiting: number;
  scrap: number;
  rework: number;
};

/**
 * القطع واقفة فين. بتتجمّع على كل الأوامر المفتوحة بترتيب المسار.
 * «واقفة» = وصلت المرحلة ولسه مخرجتش منها.
 */
export function factoryFunnel(db: Db): FunnelStep[] {
  const orders = openOrders(db);
  const map = new Map<string, FunnelStep>();

  // الموديلات ممكن يكون ترتيب مراحلها مختلف، فترتيب العرض هو المتوسط المرجّح بالكمية
  const seqWeight = new Map<string, { sum: number; weight: number }>();

  for (const order of orders) {
    const stages = orderStages(db, order);
    stages.forEach((s, i) => {
      const prev = i === 0 ? order.quantity : stages[i - 1].good;
      const row =
        map.get(s.operationId) ??
        ({ operationId: s.operationId, name: s.name, seq: s.seq, arrived: 0, done: 0, waiting: 0, scrap: 0, rework: 0 } as FunnelStep);
      row.arrived += prev;
      row.done += s.good;
      row.scrap += s.scrap;
      row.rework += s.rework;
      row.waiting += Math.max(0, prev - s.good);
      map.set(s.operationId, row);

      const w = seqWeight.get(s.operationId) ?? { sum: 0, weight: 0 };
      w.sum += s.seq * Math.max(1, order.quantity);
      w.weight += Math.max(1, order.quantity);
      seqWeight.set(s.operationId, w);
    });
  }

  for (const [id, w] of seqWeight) {
    const row = map.get(id);
    if (row) row.seq = w.sum / w.weight;
  }

  return [...map.values()].sort((a, b) => a.seq - b.seq);
}

export type Bottleneck = {
  step: FunnelStep;
  /** نسبة الواقف من اللي وصل */
  waitingPct: number;
  why: string;
};

/**
 * الاختناق على مستوى المصنع = المرحلة اللي فيها أكبر رصيد واقف.
 * مفيش طاقة مسجّلة لكل مرحلة، فمبنقولش «طاقتها ٧٠٠ في اليوم» — بنقول
 * الواقف قد إيه، وده اللي البيانات بتسمح بيه فعلًا.
 */
export function factoryBottleneck(db: Db): Bottleneck | null {
  const steps = factoryFunnel(db);
  if (steps.length < 2) return null;
  const worst = [...steps].sort((a, b) => b.waiting - a.waiting)[0];
  if (!worst || worst.waiting <= 0) return null;
  return {
    step: worst,
    waitingPct: worst.arrived > 0 ? (worst.waiting / worst.arrived) * 100 : 0,
    why: `${num(Math.round(worst.waiting), 0)} قطعة وصلت ${worst.name} ولسه مخرجتش منها، من إجمالي ${num(Math.round(worst.arrived), 0)} وصلت`,
  };
}

/* ── سكور صحة المصنع ───────────────────────────────────────────── */

export type HealthKey =
  | "production"
  | "cost"
  | "quality"
  | "inventory"
  | "workforce"
  | "delivery"
  | "profitability"
  | "cash";

export const HEALTH_LABEL: Record<HealthKey, string> = {
  production: "كفاءة الإنتاج",
  cost: "التحكم في التكلفة",
  quality: "الجودة",
  inventory: "المخزون",
  workforce: "العمالة",
  delivery: "الالتزام بالتسليم",
  profitability: "الربحية",
  cash: "السيولة",
};

export const HEALTH_WEIGHTS: Record<HealthKey, number> = {
  production: 15,
  cost: 15,
  quality: 15,
  delivery: 15,
  inventory: 10,
  workforce: 10,
  profitability: 10,
  cash: 10,
};

export type HealthBlock = {
  key: HealthKey;
  label: string;
  weight: number;
  value: number | null;
  why: string;
  missing: string | null;
};

export type Health = {
  total: number | null;
  blocks: HealthBlock[];
  coverage: number;
  label: string;
  tone: "ok" | "gold" | "warn" | "danger";
};

const missingBlock = (key: HealthKey, missing: string): HealthBlock => ({
  key,
  label: HEALTH_LABEL[key],
  weight: HEALTH_WEIGHTS[key],
  value: null,
  why: "",
  missing,
});

export function factoryHealth(db: Db): Health {
  const today = cairoToday();
  const monthAgo = addDays(today, -30);
  const blocks: HealthBlock[] = [];

  /* ١) كفاءة الإنتاج: الدقايق المنتَجة مقابل الطاقة المتاحة */
  const cap = capacityBase(db);
  const entries = db.stageEntries.filter((e) => e.date >= monthAgo);
  const stdMinutes = new Map<string, number>();
  for (const p of db.products) for (const r of routingLines(db, p.id)) stdMinutes.set(`${p.id}:${r.operationId}`, r.stdMinutes);
  const orderProduct = new Map(db.orders.map((o) => [o.id, o.productId]));
  const earnedMinutes = entries.reduce((s, e) => {
    const pid = orderProduct.get(e.orderId);
    const m = pid ? stdMinutes.get(`${pid}:${e.operationId}`) ?? 0 : 0;
    return s + e.qtyGood * m;
  }, 0);
  const workDays = workDaysBetween(monthAgo, today, cap.daysPerWeek);
  const availableMinutes = cap.perDay * workDays;
  if (earnedMinutes > 0 && availableMinutes > 0) {
    const util = (earnedMinutes / availableMinutes) * 100;
    blocks.push({
      key: "production",
      label: HEALTH_LABEL.production,
      weight: HEALTH_WEIGHTS.production,
      value: clamp(util),
      why: `${num(Math.round(earnedMinutes), 0)} دقيقة شغل مسجّلة في ${num(workDays, 0)} يوم عمل، والطاقة المتاحة ${num(Math.round(availableMinutes), 0)} دقيقة`,
      missing: null,
    });
  } else {
    blocks.push(missingBlock("production", "زمن معياري في مسار العمليات + مراحل مسجّلة"));
  }

  /* ٢) التحكم في التكلفة: الفعلي مقابل المتوقع */
  const costed = db.orders
    .filter((o) => o.productId)
    .map((o) => {
      const stages = orderStages(db, o);
      const produced = stages.length ? stages[stages.length - 1].good : 0;
      const act = db.stageEntries.filter((e) => e.orderId === o.id).reduce((s, e) => s + e.qtyGood * e.rate, 0);
      const sheet = costSheet(db, o.productId!);
      return { order: o, produced, act, est: sheet.labor * produced };
    })
    .filter((r) => r.produced > 0 && r.est > 0);
  if (costed.length) {
    const act = costed.reduce((s, r) => s + r.act, 0);
    const est = costed.reduce((s, r) => s + r.est, 0);
    const ratio = act / est;
    blocks.push({
      key: "cost",
      label: HEALTH_LABEL.cost,
      weight: HEALTH_WEIGHTS.cost,
      value: clamp(ratio <= 1 ? 100 : 100 - (ratio - 1) * 250),
      why: `أجور فعلية ${moneyPlain(act)} ج مقابل ${moneyPlain(est)} ج معيارية على ${num(costed.length, 0)} أمر`,
      missing: null,
    });
  } else {
    blocks.push(missingBlock("cost", "أوامر بمسار عمليات وإنتاج مسجّل"));
  }

  /* ٣) الجودة: السليم من إجمالي اللي اتشغّل */
  const good = entries.reduce((s, e) => s + e.qtyGood, 0);
  const bad = entries.reduce((s, e) => s + e.qtyScrap + e.qtyRework, 0);
  if (good + bad > 0) {
    blocks.push({
      key: "quality",
      label: HEALTH_LABEL.quality,
      weight: HEALTH_WEIGHTS.quality,
      value: clamp((good / (good + bad)) * 100),
      why: `${num(Math.round(good), 0)} قطعة سليمة و${num(Math.round(bad), 0)} مرفوضة أو معادة في آخر ٣٠ يوم`,
      missing: null,
    });
  } else {
    blocks.push(missingBlock("quality", "تسجيل المراحل بكميات سليم وتالف"));
  }

  /* ٤) الالتزام بالتسليم: الأوامر اللي بتلحق ميعادها */
  const plan = schedule(db);
  const judged = plan.rows.length;
  if (judged > 0) {
    const late = plan.rows.filter((r) => r.lateDays > 0).length;
    const lateDays = plan.rows.reduce((s, r) => s + r.lateDays, 0);
    blocks.push({
      key: "delivery",
      label: HEALTH_LABEL.delivery,
      weight: HEALTH_WEIGHTS.delivery,
      value: clamp(((judged - late) / judged) * 100 - Math.min(20, lateDays)),
      why: `${num(judged - late, 0)} أمر من ${num(judged, 0)} هيلحق ميعاده بالجدول الحالي${late ? `، وإجمالي التأخير ${num(lateDays, 0)} يوم عمل` : ""}`,
      missing: null,
    });
  } else {
    blocks.push(missingBlock("delivery", "أوامر مفتوحة بمواعيد وزمن معياري"));
  }

  /* ٥) المخزون: الخامات فوق حد إعادة الطلب، وناقص المخزون الراكد */
  const stocks = materialStock(db).filter((m) => m.reorderPoint > 0);
  if (stocks.length) {
    const okCount = stocks.filter((m) => m.qty >= m.reorderPoint).length;
    const dead = materialStock(db).filter((m) => m.qty > 0 && m.perDay === 0).length;
    const allMats = db.materials.length || 1;
    blocks.push({
      key: "inventory",
      label: HEALTH_LABEL.inventory,
      weight: HEALTH_WEIGHTS.inventory,
      value: clamp((okCount / stocks.length) * 100 - (dead / allMats) * 30),
      why: `${num(okCount, 0)} خامة من ${num(stocks.length, 0)} فوق حد إعادة الطلب${dead ? `، و${num(dead, 0)} خامة راكدة بلا استهلاك` : ""}`,
      missing: null,
    });
  } else {
    blocks.push(missingBlock("inventory", "حد إعادة الطلب للخامات"));
  }

  /* ٦) العمالة: الحضور في أيام العمل الأخيرة */
  const dayWorkers = db.workers.filter((w) => w.payType !== "piece");
  if (dayWorkers.length) {
    const days: string[] = [];
    for (let i = 0; i < 21 && days.length < 14; i++) {
      const d = addDays(today, -i);
      if (isWorkDay(d, cap.daysPerWeek)) days.push(d);
    }
    const recorded = days.filter((d) => db.workerEarnings.some((e) => e.date === d && e.kind === "attendance"));
    if (recorded.length) {
      const presents = recorded.map(
        (d) => new Set(db.workerEarnings.filter((e) => e.date === d && e.kind === "attendance").map((e) => e.workerId)).size,
      );
      const avg = presents.reduce((s, v) => s + v, 0) / presents.length;
      blocks.push({
        key: "workforce",
        label: HEALTH_LABEL.workforce,
        weight: HEALTH_WEIGHTS.workforce,
        value: clamp((avg / dayWorkers.length) * 100),
        why: `متوسط الحضور ${num(round(avg))} من ${num(dayWorkers.length, 0)} عامل في ${num(recorded.length, 0)} يوم عمل مسجّل`,
        missing: null,
      });
    } else {
      blocks.push(missingBlock("workforce", "تسجيل الحضور في أيام العمل"));
    }
  } else {
    blocks.push(missingBlock("workforce", "عمال بنظام يومي أو شهري"));
  }

  /* ٧) الربحية: متوسط الهامش مقابل الهدف */
  const dash = profitDashboard(db);
  if (dash.avgMarginPct !== null && dash.targetMarginPct > 0) {
    blocks.push({
      key: "profitability",
      label: HEALTH_LABEL.profitability,
      weight: HEALTH_WEIGHTS.profitability,
      value: clamp((dash.avgMarginPct / dash.targetMarginPct) * 100),
      why: `متوسط الهامش ${num(Math.round(dash.avgMarginPct), 0)}٪ والهدف ${num(Math.round(dash.targetMarginPct), 0)}٪`,
      missing: null,
    });
  } else {
    blocks.push(missingBlock("profitability", "أسعار بيع وقوائم خامات للموديلات"));
  }

  /* ٨) السيولة: الكاش والمتوقع تحصيله مقابل اللي عليك */
  const cash = allAccountBalances(db).reduce((s, a) => s + a.balance, 0);
  const pay = payables(db);
  const obligations = pay.vendorTotal + pay.workerTotal;
  if (cash !== 0 || obligations > 0) {
    const rec = receivables(db);
    const soon = [...rec.overdue, ...rec.today, ...rec.week].reduce((s, r) => s + r.remaining, 0);
    const ratio = obligations > 0 ? (cash + soon) / obligations : 2;
    blocks.push({
      key: "cash",
      label: HEALTH_LABEL.cash,
      weight: HEALTH_WEIGHTS.cash,
      value: clamp(ratio * 50),
      why: `كاش ${moneyPlain(cash)} ج + متوقع تحصيله خلال أسبوع ${moneyPlain(soon)} ج مقابل التزامات ${moneyPlain(obligations)} ج`,
      missing: null,
    });
  } else {
    blocks.push(missingBlock("cash", "حركات خزينة أو التزامات مسجّلة"));
  }

  blocks.sort((a, b) => b.weight - a.weight);

  const scored = blocks.filter((b) => b.value !== null);
  const coverage = (scored.reduce((s, b) => s + b.weight, 0) / 100) * 100;
  const total = scored.length
    ? Math.round(
        scored.reduce((s, b) => s + (b.value as number) * b.weight, 0) / scored.reduce((s, b) => s + b.weight, 0),
      )
    : null;

  const tier =
    total === null
      ? { label: "البيانات مش كفاية", tone: "warn" as const }
      : total >= 85
        ? { label: "المصنع في حالة ممتازة", tone: "ok" as const }
        : total >= 70
          ? { label: "المصنع كويس مع نقط محتاجة شغل", tone: "gold" as const }
          : total >= 55
            ? { label: "محتاج تدخّل", tone: "warn" as const }
            : { label: "في خطر — محتاج قرارات النهارده", tone: "danger" as const };

  return { total, blocks, coverage, label: tier.label, tone: tier.tone };
}

/* ── الإدارة بالاستثناء ────────────────────────────────────────── */

export type Exception = {
  key: string;
  tone: "danger" | "warn" | "info";
  title: string;
  why: string;
  action: string;
  to: string | null;
  /** الأثر بالجنيه أو بالأيام — الترتيب بيه، مش بترتيب الكود */
  impact: number;
};

const SEV = { danger: 2, warn: 1, info: 0 };

/**
 * «إيه اللي محتاج اهتمامك النهارده» — بدل إن صاحب المصنع يدور في ١٥ شاشة.
 * كل استثناء بيقول السبب بالرقم، والخطوة، ولينك للشاشة اللي بيتحل فيها.
 */
export function exceptions(db: Db): Exception[] {
  const today = cairoToday();
  const out: Exception[] = [];
  const plan = schedule(db);

  /* أوامر متأخرة أو مش هتلحق */
  for (const row of plan.rows) {
    if (row.lateDays <= 0 || row.isExtra) continue;
    const order = db.orders.find((o) => o.id === row.id);
    out.push({
      key: `late-${row.id}`,
      tone: row.lateDays >= 3 ? "danger" : "warn",
      title: `أمر ${row.code} مش هيلحق ميعاده بـ${num(row.lateDays, 0)} يوم`,
      why: `الباقي فيه شغل ${num(Math.round(row.minutes), 0)} دقيقة، وبالترتيب الحالي هيخلص ${formatDate(row.finish)} والميعاد ${formatDate(row.dueDate)}${
        row.afterCode ? ` — واقف بعد ${row.afterCode}` : ""
      }`,
      action: "قدّمه في الأولوية أو زوّد عمالة أو اتفق على ميعاد جديد",
      to: order ? `/orders/${order.id}` : "/planning",
      impact: row.lateDays * 1000 + (order ? order.quantity * order.piecePrice * 0.001 : 0),
    });
  }

  /* أوامر متوقفة */
  for (const o of db.orders.filter((x) => x.status === "stopped")) {
    out.push({
      key: `stopped-${o.id}`,
      tone: "warn",
      title: `أمر ${o.code} متوقف`,
      why: o.notes ? o.notes : "متوقف بدون سبب مكتوب",
      action: "شيل سبب التوقف أو ألغِ الأمر بسببه",
      to: `/orders/${o.id}`,
      impact: o.quantity * o.piecePrice * 0.002,
    });
  }

  /* خامات على وشك تخلص */
  for (const m of materialStock(db)) {
    if (m.perDay <= 0 || m.daysOfCover === null) continue;
    if (m.daysOfCover > m.leadTimeDays + 3) continue;
    out.push({
      key: `mat-${m.id}`,
      tone: m.daysOfCover <= m.leadTimeDays ? "danger" : "warn",
      title: `${m.name} يكفي ${num(Math.round(m.daysOfCover), 0)} يوم بس`,
      why: `الرصيد ${num(round(m.qty))} والاستهلاك ${num(round(m.perDay))} في اليوم، ومدة التوريد ${num(m.leadTimeDays, 0)} يوم`,
      action: "اطلب من المورّد دلوقتي",
      to: `/materials/${m.id}`,
      impact: 3000 - m.daysOfCover * 100,
    });
  }

  /* نقص خامات لأوامر مفتوحة */
  const req = mrp(db, plan);
  for (const row of req.shortages.slice(0, 5)) {
    out.push({
      key: `mrp-${row.materialId}`,
      tone: row.lateArrival ? "danger" : "warn",
      title: `ناقص ${num(round(row.shortage))} ${row.unit} ${row.name} لأوامر مفتوحة`,
      why: `المطلوب ${num(round(row.required))} والمتاح ${num(round(row.onHand))}${
        row.neededBy ? `، ومحتاجينه ${formatDate(row.neededBy)}` : ""
      }${row.lateArrival ? " — ومدة التوريد أطول من الوقت الفاضل" : ""}`,
      action: `اشترِ بتكلفة ${moneyPlain(row.cost)} ج تقريبًا`,
      to: "/planning",
      impact: row.cost,
    });
  }

  /* تحصيل متأخر */
  const rec = receivables(db);
  const byClient = new Map<string, { name: string; amount: number; days: number; id: string }>();
  for (const r of rec.overdue) {
    const prev = byClient.get(r.clientId);
    const days = Math.max(0, workDaysBetween(r.dueDate, today, 7));
    byClient.set(r.clientId, {
      id: r.clientId,
      name: r.clientName,
      amount: (prev?.amount ?? 0) + r.remaining,
      days: Math.max(prev?.days ?? 0, days),
    });
  }
  for (const c of [...byClient.values()].sort((a, b) => b.amount - a.amount).slice(0, 5)) {
    out.push({
      key: `due-${c.id}`,
      tone: c.days >= 7 ? "danger" : "warn",
      title: `${c.name} عليه ${moneyPlain(c.amount)} ج متأخرة`,
      why: `أقدم توريد فات ميعاده بـ${num(c.days, 0)} يوم`,
      action: "ابعت تذكير واتساب أو كلّمه",
      to: `/parties/${c.id}`,
      impact: c.amount,
    });
  }

  /* تحصيلات مستنية تأكيد بقالها كتير */
  for (const col of rec.pending) {
    const days = workDaysBetween(col.date, today, 7);
    if (days < 2) continue;
    const name = db.parties.find((p) => p.id === col.clientId)?.name ?? "عميل";
    out.push({
      key: `pending-${col.id}`,
      tone: days >= 5 ? "danger" : "warn",
      title: `تحصيل ${moneyPlain(col.amount)} ج من ${name} مستني تأكيد من ${num(days, 0)} يوم`,
      why: "التحصيل مش داخل في الرصيد لحد ما تتأكد إن الفلوس وصلت الحساب",
      action: "أكّد وصول الفلوس أو ألغِ التحصيل",
      to: "/collections",
      impact: col.amount * 0.5,
    });
  }

  /* تنبيهات الربحية */
  for (const a of profitAlerts(db).filter((x) => x.tone !== "ok")) {
    out.push({
      key: `profit-${a.productId}-${a.text}`,
      tone: a.tone === "danger" ? "danger" : "warn",
      title: `${a.name} — ${a.text}`,
      why: a.why,
      action: a.action,
      to: `/products/${a.productId}`,
      impact: 800,
    });
  }

  /* لو كمّلت الإنتاج بنفس التكلفة، متوقع تخسر كام */
  for (const order of openOrders(db)) {
    if (!order.productId) continue;
    const sheet = costSheet(db, order.productId);
    if (!sheet.hasBom || !sheet.priceKnown) continue;
    const price = order.piecePrice || sheet.sellPrice;
    const perPiece = price - sheet.total;
    if (perPiece >= 0) continue;
    const stages = orderStages(db, order);
    const produced = stages.length ? stages[stages.length - 1].good : 0;
    const left = Math.max(0, order.quantity - produced);
    if (left <= 0) continue;
    out.push({
      key: `loss-${order.id}`,
      tone: "danger",
      title: `لو كمّلت ${order.code} بنفس التكلفة متوقع تخسر ${moneyPlain(Math.abs(perPiece) * left)} ج`,
      why: `تكلفة القطعة ${moneyPlain(sheet.total)} ج وسعر البيع ${moneyPlain(price)} ج، والباقي ${num(left, 0)} قطعة`,
      action: "راجع السعر مع العميل أو خفّض التكلفة قبل ما تكمّل",
      to: `/orders/${order.id}`,
      impact: Math.abs(perPiece) * left,
    });
  }

  /* الاختناق */
  const bn = factoryBottleneck(db);
  if (bn && bn.waitingPct >= 15) {
    out.push({
      key: "bottleneck",
      tone: bn.waitingPct >= 40 ? "danger" : "warn",
      title: `${bn.step.name} هي الاختناق حاليًا`,
      why: bn.why,
      action: "نقّل عمالة على المرحلة دي أو شغّلها وقت إضافي",
      to: "/planning",
      impact: bn.step.waiting * 2,
    });
  }

  /* جودة */
  const monthAgo = addDays(today, -30);
  const entries = db.stageEntries.filter((e) => e.date >= monthAgo);
  const good = entries.reduce((s, e) => s + e.qtyGood, 0);
  const bad = entries.reduce((s, e) => s + e.qtyScrap + e.qtyRework, 0);
  if (good + bad > 50 && bad / (good + bad) > 0.05) {
    const worst = new Map<string, number>();
    for (const e of entries) {
      const order = db.orders.find((o) => o.id === e.orderId);
      const name = order?.productId ? productById(db, order.productId)?.name ?? order.model : order?.model ?? "";
      if (!name) continue;
      worst.set(name, (worst.get(name) ?? 0) + e.qtyScrap + e.qtyRework);
    }
    const top = [...worst.entries()].sort((a, b) => b[1] - a[1])[0];
    out.push({
      key: "quality",
      tone: bad / (good + bad) > 0.1 ? "danger" : "warn",
      title: `نسبة العيوب ${num(Math.round((bad / (good + bad)) * 100), 0)}٪ في آخر ٣٠ يوم`,
      why: `${num(Math.round(bad), 0)} قطعة مرفوضة أو معادة من ${num(Math.round(good + bad), 0)}${top ? `، أكترها في ${top[0]}` : ""}`,
      action: "راجع المرحلة اللي بيظهر فيها العيب مع المشرف",
      to: "/production",
      impact: bad * 30,
    });
  }

  /* عملاء معرّضين للفقد أو فوق حد الائتمان */
  for (const party of db.parties.filter((p) => p.roles.includes("customer"))) {
    const risk = riskScore(db, party.id);
    if (risk.level !== "high") continue;
    const score = customerScore(db, party.id);
    out.push({
      key: `party-${party.id}`,
      tone: "warn",
      title: `${party.name} — خطر تعامل مرتفع`,
      why: risk.factors
        .slice(0, 2)
        .map((f) => f.why)
        .join("، "),
      action: score.total !== null && score.total >= 60 ? "عميل مهم — كلّمه قبل ما يروح" : "راجع حد الائتمان قبل أي توريد جديد",
      to: `/parties/${party.id}`,
      impact: 500,
    });
  }

  /* حضور النهارده */
  const dayWorkers = db.workers.filter((w) => w.payType !== "piece");
  if (dayWorkers.length && isWorkDay(today, capacityBase(db).daysPerWeek)) {
    const present = new Set(
      db.workerEarnings.filter((e) => e.date === today && e.kind === "attendance").map((e) => e.workerId),
    ).size;
    if (present === 0) {
      out.push({
        key: "attendance",
        tone: "info",
        title: "الحضور مسجّلش النهارده",
        why: `${num(dayWorkers.length, 0)} عامل بنظام يومي أو شهري، ومفيش حضور مسجّل`,
        action: "سجّل الحضور الجماعي بضغطة",
        to: "/workers",
        impact: 200,
      });
    } else if (present < dayWorkers.length * 0.8) {
      out.push({
        key: "attendance",
        tone: "warn",
        title: `حضور النهارده ${num(present, 0)} من ${num(dayWorkers.length, 0)}`,
        why: "الغياب بيقل الطاقة المتاحة، والجدول محسوب على العمالة المسجّلة",
        action: "راجع الغياب مع المشرف أو عدّل الطاقة",
        to: "/planning",
        impact: (dayWorkers.length - present) * 300,
      });
    }
  }

  /*
   * ماكينة واقفة دلوقتي.
   *
   * الماكينة الواقفة مش تنبيه صيانة — دي **طاقة ناقصة على خط بعينه**،
   * وعشان كده بتدخل نفس قايمة الاستثناءات اللي فيها الأوامر المتأخرة.
   * والوقت بيجري: تذكرة مفتوحة من امبارح بتبان بساعاتها، مش بصفر.
   */
  for (const d of machinesDownNow(db)) {
    const hours = d.downMinutes / 60;
    out.push({
      key: `machine-${d.machine.id}`,
      tone: hours >= 4 ? "danger" : "warn",
      title: `${d.machine.name} واقفة ${num(hours, 1)} ساعة`,
      why: d.ticket
        ? `${d.ticket.cause || "من غير سبب مكتوب"}${d.machine.line ? ` — ${d.machine.line}` : ""} · تذكرة ${d.ticket.code}`
        : `حالتها ${MACHINE_STATE_LABEL[d.machine.state]} ومافيش تذكرة مفتوحة عليها`,
      action: d.ticket ? "اقفل التذكرة بعد الإصلاح أو صعّدها لورشة خارجية" : "افتح تذكرة عشان التوقف يتحسب",
      to: `/machines/${d.machine.id}`,
      impact: hours * 200,
    });
  }

  /* صيانة دورية فاتت ميعادها — قبل العطل، مش بعده */
  for (const r of machineSummary(db).overdueServices) {
    out.push({
      key: `machine-service-${r.machine.id}`,
      tone: (r.serviceOverdueDays ?? 0) >= 14 ? "warn" : "info",
      title: `صيانة ${r.machine.code} فاتت بـ${num(r.serviceOverdueDays ?? 0, 0)} يوم`,
      why: `خطتها كل ${num(r.machine.serviceEveryDays, 0)} يوم، وآخر صيانة ${
        r.machine.lastServiceOn ? formatDate(r.machine.lastServiceOn) : "مش مسجّلة"
      }`,
      action: "افتح تذكرة صيانة دورية قبل ما تقف في نص وردية",
      to: `/machines/${r.machine.id}`,
      impact: (r.serviceOverdueDays ?? 0) * 40,
    });
  }

  /* أوامر برّه الجدولة — مش استثناء تشغيلي، ده نقص بيانات */
  if (plan.excluded.length) {
    out.push({
      key: "unplanned",
      tone: "info",
      title: `${num(plan.excluded.length, 0)} أمر برّه الجدولة`,
      why: plan.excluded
        .slice(0, 2)
        .map((e) => `${e.order.code}: ${e.reason}`)
        .join("، "),
      action: "اربطهم بمنتج وزمن معياري عشان يدخلوا الحساب",
      to: "/planning",
      impact: 100,
    });
  }

  return out.sort((a, b) => (SEV[b.tone] - SEV[a.tone]) || b.impact - a.impact);
}

/** كارت مختصر للرئيسية: الدرجة + أهم استثناء */
export function healthPulse(db: Db) {
  const health = factoryHealth(db);
  const ex = exceptions(db);
  return {
    total: health.total,
    label: health.label,
    tone: health.tone,
    count: ex.filter((e) => e.tone !== "info").length,
    top: ex[0] ?? null,
    weakest: health.blocks.filter((b) => b.value !== null).sort((a, b) => (a.value as number) - (b.value as number))[0] ?? null,
  };
}
