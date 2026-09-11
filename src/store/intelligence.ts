/**
 * SANAA Customer Intelligence
 * ----------------------------
 * طبقة الذكاء فوق بيانات المصنع. قواعدها الحاكمة:
 *
 * 1. كل رقم هنا **محسوب** من حركات حقيقية — مفيش تقدير ولا رقم بيتخزَّن.
 * 2. كل سكور **Explainable**: بيرجّع المكوّنات والأرقام اللي بنى عليها وليه طلع كده.
 * 3. لو البيانات مش كفاية، بيقول كده صريح بدل ما يطلّع رقم يضلّل صاحب المصنع.
 * 4. المؤشر اللي بياناته لسه مش موجودة في النظام (مرتجعات، خصومات، تكلفة تسليم)
 *    بيتشال من الحساب وبيتكتب في `missing` — الأوزان تتوزّع على المؤشرات المتاحة بس.
 */

import { addDays, cairoToday, daysBetween } from "@/lib/utils";
import { confirmedCollections } from "./compute";
import type { Db, Delivery, Party } from "./types";

/* ── الأوزان (قابلة للتعديل من صاحب المصنع) ──────────────────── */

export type ScoreKey = "purchase" | "payment" | "growth" | "frequency" | "profit" | "quality" | "relationship";

export type ScoreWeights = Record<ScoreKey, number>;

export const DEFAULT_WEIGHTS: ScoreWeights = {
  purchase: 20,
  payment: 25,
  growth: 15,
  frequency: 10,
  profit: 20,
  quality: 5,
  relationship: 5,
};

export const SCORE_LABEL: Record<ScoreKey, string> = {
  purchase: "قوة الشراء",
  payment: "التحصيل والسداد",
  growth: "النمو",
  frequency: "تكرار الطلب",
  profit: "الربحية",
  quality: "جودة الطلبات",
  relationship: "قوة العلاقة",
};

export function weightsOf(db: Db): ScoreWeights {
  const w = db.settings?.scoreWeights;
  if (!w) return DEFAULT_WEIGHTS;
  const out = { ...DEFAULT_WEIGHTS, ...w };
  for (const k of Object.keys(out) as ScoreKey[]) out[k] = Math.max(0, Math.round(out[k]));
  return out;
}

/* ── التصنيف حسب الدرجة ──────────────────────────────────────── */

export type TierKey = "strategic" | "strong" | "stable" | "watch" | "risk";

export const TIERS: { key: TierKey; min: number; label: string; tone: "ok" | "gold" | "warn" | "danger" }[] = [
  { key: "strategic", min: 90, label: "عميل استراتيجي", tone: "ok" },
  { key: "strong", min: 80, label: "عميل قوي", tone: "ok" },
  { key: "stable", min: 70, label: "عميل مستقر", tone: "gold" },
  { key: "watch", min: 50, label: "محتاج متابعة", tone: "warn" },
  { key: "risk", min: 0, label: "عالي المخاطر", tone: "danger" },
];

export function tierOf(total: number): (typeof TIERS)[number] {
  return TIERS.find((t) => total >= t.min) ?? TIERS[TIERS.length - 1];
}

/* ── أدوات ───────────────────────────────────────────────────── */

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function avg(list: number[]): number | null {
  return list.length ? list.reduce((s, v) => s + v, 0) / list.length : null;
}

function sum(list: number[]): number {
  return list.reduce((s, v) => s + v, 0);
}

/** درجة خطّية بين قيمتين: `worst` بتساوي صفر و`best` بتساوي 100 */
function scale(value: number, worst: number, best: number): number {
  if (worst === best) return 50;
  return clamp(((value - worst) / (best - worst)) * 100);
}

function pct(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

function r0(n: number): string {
  return Math.round(n).toLocaleString("ar-EG");
}

/* ── تسوية التوريدات: مين اتسدد إمتى (FIFO) ──────────────────── */

export type Settlement = {
  delivery: Delivery;
  allocated: number;
  remaining: number;
  /** متوسط أيام التحصيل مرجّح بالمبالغ، من تاريخ التوريد */
  collectDays: number | null;
  /** أيام التأخير بعد ميعاد الآجل (صفر لو في الميعاد) */
  delayDays: number;
  settledDate: string | null;
  onTime: boolean | null;
};

/**
 * نفس منطق التحصيل في النظام (الأقدم أولًا) بس بيسجّل **تاريخ كل دفعة**
 * عشان نعرف العميل بيدفع في كام يوم وبيتأخر قد إيه.
 */
export function settlements(db: Db, partyId: string): Settlement[] {
  const dels = db.deliveries
    .filter((d) => d.clientId === partyId)
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
  const rows = dels.map((d) => ({
    delivery: d,
    allocated: 0,
    remaining: d.amount,
    parts: [] as { date: string; amount: number }[],
  }));
  const cols = confirmedCollections(db)
    .filter((c) => c.clientId === partyId)
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));

  for (const col of cols) {
    let left = col.amount;
    for (const row of rows) {
      if (left <= 0 || row.remaining <= 0) continue;
      const take = Math.min(row.remaining, left);
      row.remaining -= take;
      row.allocated += take;
      row.parts.push({ date: col.date, amount: take });
      left -= take;
    }
  }

  return rows.map((row) => {
    const paid = sum(row.parts.map((p) => p.amount));
    const collectDays = paid
      ? sum(row.parts.map((p) => p.amount * daysBetween(row.delivery.date, p.date))) / paid
      : null;
    const delay = paid
      ? Math.max(0, sum(row.parts.map((p) => p.amount * Math.max(0, daysBetween(row.delivery.dueDate, p.date)))) / paid)
      : 0;
    const settled = row.remaining <= 0.5;
    const settledDate = settled && row.parts.length ? row.parts[row.parts.length - 1].date : null;
    return {
      delivery: row.delivery,
      allocated: row.allocated,
      remaining: row.remaining,
      collectDays,
      delayDays: delay,
      settledDate,
      onTime: settled && settledDate ? settledDate <= row.delivery.dueDate : null,
    };
  });
}

/* ── المؤشرات الخام ──────────────────────────────────────────── */

export type Window = { label: string; days: number; recent: number; previous: number; changePct: number | null };

export type AgingBucket = { label: string; amount: number };

export type CustomerMetrics = {
  /* الشراء */
  sales: number;
  ordersCount: number;
  avgOrder: number;
  biggestOrder: number;
  units: number;
  repeatRate: number | null;
  windows: Window[];
  /* السداد */
  collected: number;
  pendingIn: number;
  outstanding: number;
  collectionRate: number;
  avgCollectDays: number | null;
  avgDelayDays: number | null;
  lateCount: number;
  maxDelayDays: number;
  onTimeRate: number | null;
  settledCount: number;
  overdue: number;
  overdueCount: number;
  aging: AgingBucket[];
  /* الزمن */
  firstDate: string | null;
  lastDate: string | null;
  daysSinceLast: number | null;
  tenureDays: number;
  cycleDays: number | null;
  cycleStability: number | null;
  expectedNext: string | null;
  /* الإنتاج والربح */
  productionOrders: number;
  cancelledOrders: number;
  contribution: number | null;
  marginPct: number | null;
  scrapRate: number | null;
  distinctProducts: number;
};

export function customerMetrics(db: Db, partyId: string): CustomerMetrics {
  const today = cairoToday();
  const dels = db.deliveries
    .filter((d) => d.clientId === partyId)
    .sort((a, b) => a.date.localeCompare(b.date));
  const sales = sum(dels.map((d) => d.amount));
  const st = settlements(db, partyId);
  const collected = sum(
    confirmedCollections(db)
      .filter((c) => c.clientId === partyId)
      .map((c) => c.amount),
  );
  const pendingIn = sum(
    db.collections.filter((c) => c.clientId === partyId && c.status === "pending").map((c) => c.amount),
  );

  const settled = st.filter((s) => s.settledDate);
  const late = settled.filter((s) => s.onTime === false);
  const open = st.filter((s) => s.remaining > 0.5);
  const overdueRows = open.filter((s) => s.delivery.dueDate < today);

  const gaps: number[] = [];
  for (let i = 1; i < dels.length; i++) gaps.push(daysBetween(dels[i - 1].date, dels[i].date));
  const cycleDays = gaps.length ? Math.round(sum(gaps) / gaps.length) : null;
  const spread =
    gaps.length >= 3 && cycleDays
      ? Math.sqrt(sum(gaps.map((g) => (g - cycleDays) ** 2)) / gaps.length) / cycleDays
      : null;

  const seen = new Set<string>();
  let repeats = 0;
  for (const d of dels) {
    const key = d.model.trim();
    if (!key) continue;
    if (seen.has(key)) repeats++;
    seen.add(key);
  }
  const named = dels.filter((d) => d.model.trim()).length;

  const orders = db.orders.filter((o) => o.clientId === partyId);
  const priced = orders.filter((o) => o.piecePrice > 0 && o.pieceCost > 0);
  const revenue = sum(priced.map((o) => o.piecePrice * o.quantity));
  const cost = sum(priced.map((o) => o.pieceCost * o.quantity));
  const orderIds = new Set(orders.map((o) => o.id));
  const stages = db.stageEntries.filter((e) => orderIds.has(e.orderId));
  const good = sum(stages.map((e) => e.qtyGood));
  const scrap = sum(stages.map((e) => e.qtyScrap));

  const window = (days: number, label: string): Window => {
    const cut = addDays(today, -days);
    const prevCut = addDays(today, -days * 2);
    const recent = sum(dels.filter((d) => d.date > cut).map((d) => d.amount));
    const previous = sum(dels.filter((d) => d.date > prevCut && d.date <= cut).map((d) => d.amount));
    return { label, days, recent, previous, changePct: previous > 0 ? ((recent - previous) / previous) * 100 : null };
  };

  const bucket = (from: number, to: number | null) =>
    sum(
      overdueRows
        .filter((s) => {
          const d = daysBetween(s.delivery.dueDate, today);
          return d >= from && (to === null || d <= to);
        })
        .map((s) => s.remaining),
    );

  return {
    sales,
    ordersCount: dels.length,
    avgOrder: dels.length ? sales / dels.length : 0,
    biggestOrder: dels.length ? Math.max(...dels.map((d) => d.amount)) : 0,
    units: sum(dels.map((d) => d.quantity ?? 0)),
    repeatRate: named >= 2 ? pct(repeats, named) : null,
    windows: [window(30, "آخر 30 يوم"), window(90, "آخر 90 يوم"), window(365, "آخر سنة")],

    collected,
    pendingIn,
    outstanding: sales - collected,
    collectionRate: pct(collected, sales),
    avgCollectDays: avg(settled.map((s) => s.collectDays ?? 0)),
    avgDelayDays: avg(settled.map((s) => s.delayDays)),
    lateCount: late.length,
    maxDelayDays: settled.length ? Math.max(0, ...settled.map((s) => s.delayDays)) : 0,
    onTimeRate: settled.length ? pct(settled.filter((s) => s.onTime).length, settled.length) : null,
    settledCount: settled.length,
    overdue: sum(overdueRows.map((s) => s.remaining)),
    overdueCount: overdueRows.length,
    aging: [
      { label: "لسه في الميعاد", amount: sum(open.filter((s) => s.delivery.dueDate >= today).map((s) => s.remaining)) },
      { label: "متأخر 1–30 يوم", amount: bucket(1, 30) },
      { label: "متأخر 31–60 يوم", amount: bucket(31, 60) },
      { label: "متأخر 61–90 يوم", amount: bucket(61, 90) },
      { label: "متأخر أكتر من 90 يوم", amount: bucket(91, null) },
    ],

    firstDate: dels[0]?.date ?? null,
    lastDate: dels[dels.length - 1]?.date ?? null,
    daysSinceLast: dels.length ? daysBetween(dels[dels.length - 1].date, today) : null,
    tenureDays: dels.length ? daysBetween(dels[0].date, today) : 0,
    cycleDays,
    cycleStability: spread === null ? null : clamp(100 - spread * 100),
    expectedNext: cycleDays && dels.length >= 3 ? addDays(dels[dels.length - 1].date, cycleDays) : null,

    productionOrders: orders.length,
    cancelledOrders: orders.filter((o) => o.status === "stopped").length,
    contribution: priced.length ? revenue - cost : null,
    marginPct: revenue > 0 ? ((revenue - cost) / revenue) * 100 : null,
    scrapRate: good + scrap > 0 ? pct(scrap, good + scrap) : null,
    distinctProducts: seen.size,
  };
}

/* ── المؤشرات السبعة ─────────────────────────────────────────── */

export type ScorePart = { label: string; value: number; why: string };
export type MetricRow = { label: string; value: string };

export type ScoreBlock = {
  key: ScoreKey;
  label: string;
  score: number | null;
  weight: number;
  parts: ScorePart[];
  metrics: MetricRow[];
  /** مؤشرات مطلوبة في المواصفة بس بياناتها لسه مش في النظام */
  missing: string[];
  note: string;
};

/** أكبر عميل في المصنع — مرجع المقارنة في قوة الشراء */
function peakSales(db: Db): number {
  const all = customerIds(db).map((id) => sum(db.deliveries.filter((d) => d.clientId === id).map((d) => d.amount)));
  return Math.max(1, ...all);
}

export function customerIds(db: Db): string[] {
  return db.parties.filter((p) => !p.mergedIntoId && p.roles.includes("customer")).map((p) => p.id);
}

function purchaseBlock(db: Db, m: CustomerMetrics, w: number): ScoreBlock {
  const peak = peakSales(db);
  const volume = scale(m.sales, 0, peak);
  const depth = scale(m.ordersCount, 0, 40);
  const ticket = scale(m.avgOrder, 0, Math.max(20000, m.biggestOrder));
  const score = m.ordersCount ? clamp(volume * 0.5 + depth * 0.25 + ticket * 0.25) : null;
  return {
    key: "purchase",
    label: SCORE_LABEL.purchase,
    score,
    weight: w,
    parts: [
      { label: "حجم المشتريات", value: volume, why: `${r0(m.sales)} جنيه مقابل ${r0(peak)} لأكبر عميل عندك` },
      { label: "عدد الطلبات", value: depth, why: `${m.ordersCount} توريد` },
      { label: "متوسط الطلب", value: ticket, why: `${r0(m.avgOrder)} جنيه، وأكبر طلب ${r0(m.biggestOrder)}` },
    ],
    metrics: [
      { label: "إجمالي الطلبات", value: `${r0(m.sales)} ج` },
      { label: "عدد الطلبات", value: String(m.ordersCount) },
      { label: "متوسط الطلب", value: `${r0(m.avgOrder)} ج` },
      { label: "أكبر طلب", value: `${r0(m.biggestOrder)} ج` },
      { label: "الكميات", value: m.units ? `${r0(m.units)} وحدة` : "—" },
      { label: "الطلبات المتكررة", value: m.repeatRate === null ? "—" : `${Math.round(m.repeatRate)}٪` },
      ...m.windows.map((x) => ({ label: x.label, value: `${r0(x.recent)} ج` })),
    ],
    missing: [],
    note: "قوة الشراء نسبية: بتتقاس بالنسبة لأكبر عميل في مصنعك، مش برقم مطلق.",
  };
}

function paymentBlock(m: CustomerMetrics, w: number): ScoreBlock {
  const rate = clamp(m.collectionRate);
  const speed = m.avgCollectDays === null ? null : scale(m.avgCollectDays, 90, 7);
  const punctual = m.onTimeRate === null ? null : clamp(m.onTimeRate);
  const delay = m.avgDelayDays === null ? null : scale(m.avgDelayDays, 45, 0);

  const available = [rate, speed, punctual, delay].filter((v): v is number => v !== null);
  const score = m.ordersCount ? clamp(sum(available) / available.length) : null;

  return {
    key: "payment",
    label: SCORE_LABEL.payment,
    score,
    weight: w,
    parts: [
      { label: "نسبة التحصيل", value: rate, why: `حصّلت ${r0(m.collected)} من ${r0(m.sales)} جنيه` },
      ...(speed === null
        ? []
        : [{ label: "سرعة التحصيل", value: speed, why: `بيدفع في ${Math.round(m.avgCollectDays ?? 0)} يوم في المتوسط` }]),
      ...(punctual === null
        ? []
        : [{ label: "الالتزام بالمواعيد", value: punctual, why: `${Math.round(m.onTimeRate ?? 0)}٪ من فواتيره اتسددت في ميعادها` }]),
      ...(delay === null
        ? []
        : [{ label: "قلة التأخير", value: delay, why: `متوسط التأخير ${Math.round(m.avgDelayDays ?? 0)} يوم` }]),
    ],
    metrics: [
      { label: "إجمالي المستحق", value: `${r0(m.sales)} ج` },
      { label: "إجمالي المحصل", value: `${r0(m.collected)} ج` },
      { label: "نسبة التحصيل", value: `${Math.round(m.collectionRate)}٪` },
      { label: "متوسط أيام التحصيل", value: m.avgCollectDays === null ? "—" : `${Math.round(m.avgCollectDays)} يوم` },
      { label: "متوسط التأخير", value: m.avgDelayDays === null ? "—" : `${Math.round(m.avgDelayDays)} يوم` },
      { label: "عدد مرات التأخير", value: String(m.lateCount) },
      { label: "أكبر تأخير", value: m.maxDelayDays ? `${Math.round(m.maxDelayDays)} يوم` : "مفيش" },
      { label: "الرصيد المفتوح", value: `${r0(m.outstanding)} ج` },
      { label: "المتأخر حاليًا", value: `${r0(m.overdue)} ج` },
      ...(m.pendingIn ? [{ label: "تحصيل مستني تأكيد", value: `${r0(m.pendingIn)} ج` }] : []),
    ],
    missing: [],
    note: "أيام التحصيل محسوبة من توزيع التحصيلات على التوريدات بالأقدم أولًا — نفس منطق الحساب في النظام.",
  };
}

function growthBlock(m: CustomerMetrics, w: number): ScoreBlock {
  const usable = m.windows.filter((x) => x.changePct !== null);
  const score = usable.length
    ? clamp(sum(usable.map((x) => 50 + (x.changePct ?? 0) * 0.8)) / usable.length)
    : null;
  return {
    key: "growth",
    label: SCORE_LABEL.growth,
    score,
    weight: w,
    parts: usable.map((x) => ({
      label: x.label,
      value: clamp(50 + (x.changePct ?? 0) * 0.8),
      why: `${(x.changePct ?? 0) >= 0 ? "+" : ""}${Math.round(x.changePct ?? 0)}٪ مقارنة بالفترة اللي قبلها`,
    })),
    metrics: m.windows.map((x) => ({
      label: x.label,
      value:
        x.changePct === null
          ? `${r0(x.recent)} ج — مفيش فترة سابقة`
          : `${r0(x.recent)} ج مقابل ${r0(x.previous)} (${x.changePct >= 0 ? "+" : ""}${Math.round(x.changePct)}٪)`,
    })),
    missing: [],
    note: "النمو بيقارن كل فترة بنفس طولها قبلها — مش بمتوسط عام.",
  };
}

function frequencyBlock(m: CustomerMetrics, w: number): ScoreBlock {
  if (!m.cycleDays || m.ordersCount < 3) {
    return {
      key: "frequency",
      label: SCORE_LABEL.frequency,
      score: null,
      weight: w,
      parts: [],
      metrics: [
        { label: "آخر طلب", value: m.daysSinceLast === null ? "مفيش" : `منذ ${m.daysSinceLast} يوم` },
        { label: "متوسط الفترة بين الطلبات", value: "محتاج 3 طلبات على الأقل" },
      ],
      missing: [],
      note: "تكرار الطلب محتاج 3 طلبات على الأقل عشان يكون له معنى.",
    };
  }
  const ratio = (m.daysSinceLast ?? 0) / m.cycleDays;
  const recency = scale(ratio, 3, 0.6);
  const rhythm = m.cycleStability ?? 50;
  const cadence = scale(m.cycleDays, 180, 7);
  return {
    key: "frequency",
    label: SCORE_LABEL.frequency,
    score: clamp(recency * 0.5 + rhythm * 0.25 + cadence * 0.25),
    weight: w,
    parts: [
      {
        label: "قرب آخر طلب",
        value: recency,
        why: `آخر طلب منذ ${m.daysSinceLast} يوم، ودورته المعتادة ${m.cycleDays} يوم`,
      },
      { label: "انتظام الدورة", value: rhythm, why: "بيقيس تقارب الفترات بين الطلبات مع بعضها" },
      { label: "سرعة الدورة", value: cadence, why: `بيطلب كل ${m.cycleDays} يوم` },
    ],
    metrics: [
      { label: "آخر طلب", value: `منذ ${m.daysSinceLast} يوم` },
      { label: "متوسط الفترة بين الطلبات", value: `${m.cycleDays} يوم` },
      { label: "الطلب المتوقع الجاي", value: m.expectedNext ?? "—" },
      { label: "الحالة", value: ratio <= 1.5 ? "نشط" : ratio <= 2.5 ? "بدأ يبطّأ" : "متوقف تقريبًا" },
    ],
    missing: [],
    note: "",
  };
}

function profitBlock(m: CustomerMetrics, w: number): ScoreBlock {
  const missing = ["الخصومات", "المرتجعات", "تكلفة التسليم", "تكلفة التحصيل"];
  if (m.marginPct === null) {
    return {
      key: "profit",
      label: SCORE_LABEL.profit,
      score: null,
      weight: w,
      parts: [],
      metrics: [{ label: "الربحية", value: "مفيش أوامر إنتاج بأسعار وتكاليف مسجّلة" }],
      missing,
      note: "الربحية بتتحسب من أوامر الإنتاج المسجّل لها سعر بيع وتكلفة قطعة.",
    };
  }
  const score = clamp(scale(m.marginPct, 0, 40));
  return {
    key: "profit",
    label: SCORE_LABEL.profit,
    score,
    weight: w,
    parts: [{ label: "هامش المساهمة", value: score, why: `متوسط هامش ${Math.round(m.marginPct)}٪ على أوامره` }],
    metrics: [
      { label: "مساهمة العميل", value: m.contribution === null ? "—" : `${r0(m.contribution)} ج` },
      { label: "نسبة الهامش", value: `${Math.round(m.marginPct)}٪` },
      { label: "أوامر الإنتاج", value: String(m.productionOrders) },
    ],
    missing,
    note: "أكبر عميل مش بالضرورة أفضل عميل — الرقم ده هو اللي يفرّق.",
  };
}

function qualityBlock(m: CustomerMetrics, w: number): ScoreBlock {
  const missing = ["المرتجعات", "تعديلات الطلب", "الرفض عند التسليم", "الطلبات المستعجلة"];
  if (!m.productionOrders) {
    return {
      key: "quality",
      label: SCORE_LABEL.quality,
      score: null,
      weight: w,
      parts: [],
      metrics: [{ label: "جودة الطلبات", value: "مفيش أوامر إنتاج على العميل ده" }],
      missing,
      note: "",
    };
  }
  const cancelRate = pct(m.cancelledOrders, m.productionOrders);
  const noCancel = scale(cancelRate, 25, 0);
  const scrapPart = m.scrapRate === null ? null : scale(m.scrapRate, 10, 0);
  const available = [noCancel, scrapPart].filter((v): v is number => v !== null);
  return {
    key: "quality",
    label: SCORE_LABEL.quality,
    score: clamp(sum(available) / available.length),
    weight: w,
    parts: [
      { label: "قلة الإلغاء والتوقيف", value: noCancel, why: `${m.cancelledOrders} من ${m.productionOrders} أمر اتوقف` },
      ...(scrapPart === null
        ? []
        : [{ label: "قلة الهالك", value: scrapPart, why: `نسبة الهالك في أوامره ${(m.scrapRate ?? 0).toFixed(1)}٪` }]),
    ],
    metrics: [
      { label: "أوامر الإنتاج", value: String(m.productionOrders) },
      { label: "أوامر متوقفة", value: String(m.cancelledOrders) },
      { label: "نسبة الهالك", value: m.scrapRate === null ? "—" : `${(m.scrapRate).toFixed(1)}٪` },
    ],
    missing,
    note: "",
  };
}

function relationshipBlock(m: CustomerMetrics, w: number): ScoreBlock {
  if (!m.ordersCount) {
    return {
      key: "relationship",
      label: SCORE_LABEL.relationship,
      score: null,
      weight: w,
      parts: [],
      metrics: [{ label: "مدة التعامل", value: "لسه مفيش تعامل" }],
      missing: ["الشكاوى", "الفروع والأقسام المتعاملة"],
      note: "",
    };
  }
  const tenure = scale(m.tenureDays, 0, 730);
  const depth = scale(m.ordersCount, 1, 30);
  const stability = m.cycleStability ?? 50;
  const variety = scale(m.distinctProducts, 1, 5);
  return {
    key: "relationship",
    label: SCORE_LABEL.relationship,
    score: clamp(tenure * 0.35 + depth * 0.3 + stability * 0.2 + variety * 0.15),
    weight: w,
    parts: [
      { label: "مدة التعامل", value: tenure, why: `${(m.tenureDays / 365).toFixed(1)} سنة` },
      { label: "عمق التعامل", value: depth, why: `${m.ordersCount} توريد` },
      { label: "انتظام الطلب", value: stability, why: m.cycleDays ? `دورة ${m.cycleDays} يوم` : "دورة لسه مش واضحة" },
      { label: "تنوّع المنتجات", value: variety, why: `${m.distinctProducts} منتج مختلف` },
    ],
    metrics: [
      { label: "أول تعامل", value: m.firstDate ?? "—" },
      { label: "مدة التعامل", value: `${(m.tenureDays / 365).toFixed(1)} سنة` },
      { label: "عدد المنتجات المطلوبة", value: String(m.distinctProducts) },
    ],
    missing: ["الشكاوى", "الفروع والأقسام المتعاملة"],
    note: "",
  };
}

/* ── السكور الإجمالي ─────────────────────────────────────────── */

export type RiskFactor = { label: string; points: number; why: string };

export type RiskScore = {
  total: number;
  level: "low" | "medium" | "high";
  levelLabel: string;
  factors: RiskFactor[];
};

export type CustomerScore = {
  total: number | null;
  tier: (typeof TIERS)[number] | null;
  blocks: ScoreBlock[];
  /** الأوزان اللي اتحسبت فعلًا بعد استبعاد المؤشرات اللي مفيش لها بيانات */
  coverage: number;
  up: string[];
  down: string[];
  risk: RiskScore;
  enough: boolean;
  shortfall: string | null;
};

export function customerScore(db: Db, partyId: string): CustomerScore {
  const m = customerMetrics(db, partyId);
  const w = weightsOf(db);
  const blocks = [
    purchaseBlock(db, m, w.purchase),
    paymentBlock(m, w.payment),
    growthBlock(m, w.growth),
    frequencyBlock(m, w.frequency),
    profitBlock(m, w.profit),
    qualityBlock(m, w.quality),
    relationshipBlock(m, w.relationship),
  ];
  const risk = riskScore(db, partyId, m);

  const scored = blocks.filter((b) => b.score !== null && b.weight > 0);
  const totalWeight = sum(scored.map((b) => b.weight));
  const allWeight = sum(blocks.map((b) => b.weight));

  if (m.ordersCount < 2 || totalWeight === 0) {
    return {
      total: null,
      tier: null,
      blocks,
      coverage: 0,
      up: [],
      down: [],
      risk,
      enough: false,
      shortfall: "البيانات لسه مش كفاية — محتاج توريدين على الأقل عشان السكور يبقى له معنى.",
    };
  }

  const total = clamp(sum(scored.map((b) => (b.score ?? 0) * b.weight)) / totalWeight);
  const up = scored
    .filter((b) => (b.score ?? 0) >= 70)
    .sort((a, b) => (b.score ?? 0) * b.weight - (a.score ?? 0) * a.weight)
    .map((b) => `${b.label} ${b.score} — ${b.parts[0]?.why ?? ""}`.trim());
  const down = scored
    .filter((b) => (b.score ?? 0) < 60)
    .sort((a, b) => (a.score ?? 0) * a.weight - (b.score ?? 0) * b.weight)
    .map((b) => `${b.label} ${b.score} — ${b.parts[0]?.why ?? ""}`.trim());

  return {
    total,
    tier: tierOf(total),
    blocks,
    coverage: Math.round(pct(totalWeight, allWeight)),
    up,
    down,
    risk,
    enough: true,
    shortfall: null,
  };
}

export function riskScore(db: Db, partyId: string, metrics?: CustomerMetrics): RiskScore {
  const m = metrics ?? customerMetrics(db, partyId);
  const party = db.parties.find((p) => p.id === partyId);
  const factors: RiskFactor[] = [];

  if (m.overdue > 0) {
    const share = pct(m.overdue, Math.max(1, m.sales));
    factors.push({
      label: "متأخرات",
      points: Math.min(30, Math.round(share * 1.5)),
      why: `${r0(m.overdue)} جنيه متأخر في ${m.overdueCount} توريد`,
    });
  }
  if (m.avgDelayDays && m.avgDelayDays > 5) {
    factors.push({
      label: "بطء السداد",
      points: Math.min(20, Math.round(m.avgDelayDays / 2)),
      why: `بيتأخر ${Math.round(m.avgDelayDays)} يوم في المتوسط بعد الميعاد`,
    });
  }
  if (party?.creditLimit && m.outstanding > party.creditLimit) {
    factors.push({
      label: "تعدّى حد الائتمان",
      points: 20,
      why: `مديونيته ${r0(m.outstanding)} وحد الائتمان ${r0(party.creditLimit)}`,
    });
  }
  const w90 = m.windows.find((x) => x.days === 90);
  if (w90?.changePct !== null && w90 && w90.changePct < -15) {
    factors.push({
      label: "طلباته بتقل",
      points: Math.min(20, Math.round(Math.abs(w90.changePct) / 3)),
      why: `${Math.round(w90.changePct)}٪ في آخر 90 يوم`,
    });
  }
  if (m.cycleDays && m.daysSinceLast !== null && m.daysSinceLast > m.cycleDays * 2) {
    factors.push({
      label: "مطلبش من فترة",
      points: 15,
      why: `آخر طلب منذ ${m.daysSinceLast} يوم ودورته ${m.cycleDays} يوم`,
    });
  }
  if (m.marginPct !== null && m.marginPct < 15) {
    factors.push({
      label: "هامش ضعيف",
      points: 10,
      why: `هامشه ${Math.round(m.marginPct)}٪ بس`,
    });
  }

  const total = clamp(sum(factors.map((f) => f.points)));
  return {
    total,
    level: total >= 60 ? "high" : total >= 30 ? "medium" : "low",
    levelLabel: total >= 60 ? "خطر عالي" : total >= 30 ? "خطر متوسط" : "خطر منخفض",
    factors,
  };
}

/* ── RFM ─────────────────────────────────────────────────────── */

export type Rfm = {
  r: number;
  f: number;
  m: number;
  code: string;
  label: string;
  enough: boolean;
  why: string[];
};

function quintile(value: number, all: number[], higherIsBetter = true): number {
  const list = [...all].sort((a, b) => a - b);
  if (!list.length) return 3;
  const below = list.filter((v) => v < value).length;
  const rank = below / list.length;
  const score = Math.min(5, Math.max(1, Math.floor(rank * 5) + 1));
  return higherIsBetter ? score : 6 - score;
}

export function rfm(db: Db, partyId: string): Rfm {
  const ids = customerIds(db).filter((id) => db.deliveries.some((d) => d.clientId === id));
  const mine = customerMetrics(db, partyId);
  if (ids.length < 3 || !mine.ordersCount) {
    return { r: 0, f: 0, m: 0, code: "—", label: "محتاج 3 عملاء على الأقل عندهم توريدات", enough: false, why: [] };
  }
  const others = ids.map((id) => customerMetrics(db, id));
  const r = quintile(mine.daysSinceLast ?? 9999, others.map((o) => o.daysSinceLast ?? 9999), false);
  const f = quintile(mine.ordersCount, others.map((o) => o.ordersCount));
  const mm = quintile(mine.sales, others.map((o) => o.sales));
  const label =
    r >= 4 && f >= 4 && mm >= 4
      ? "من أفضل عملائك"
      : r <= 2 && f >= 3
        ? "كان بيشتري كتير وبعد"
        : r >= 4 && f <= 2
          ? "عميل جديد أو نادر"
          : mm >= 4
            ? "بيصرف كتير"
            : "عميل عادي";
  return {
    r,
    f,
    m: mm,
    code: `${r}-${f}-${mm}`,
    label,
    enough: true,
    why: [
      `آخر شراء: منذ ${mine.daysSinceLast} يوم → R=${r}`,
      `عدد الطلبات: ${mine.ordersCount} → F=${f}`,
      `إجمالي الصرف: ${r0(mine.sales)} ج → M=${mm}`,
      `المقارنة مع ${ids.length} عميل عندهم توريدات`,
    ],
  };
}

/* ── القيمة المتوقعة للعميل ──────────────────────────────────── */

export type Clv = { value: number | null; assumptions: string[]; enough: boolean };

export function clv(db: Db, partyId: string): Clv {
  const m = customerMetrics(db, partyId);
  if (m.ordersCount < 3 || !m.cycleDays || m.marginPct === null) {
    return {
      value: null,
      enough: false,
      assumptions: [
        "محتاج 3 طلبات على الأقل، ودورة طلب واضحة، وهامش ربح مسجّل على أوامره — عشان الرقم يبقى تقدير محترم مش تخمين.",
      ],
    };
  }
  const perYear = 365 / m.cycleDays;
  const years = Math.max(1, m.tenureDays / 365);
  const value = m.avgOrder * perYear * years * (m.marginPct / 100);
  return {
    value,
    enough: true,
    assumptions: [
      `متوسط الطلب ${r0(m.avgOrder)} ج`,
      `${perYear.toFixed(1)} طلب في السنة (دورة ${m.cycleDays} يوم)`,
      `افتراض إنه يكمل معاك نفس مدة تعامله الحالية (${years.toFixed(1)} سنة)`,
      `هامش ${Math.round(m.marginPct)}٪ من أوامر الإنتاج`,
      "ده تقدير مبني على سلوكه لحد النهارده، ومش وعد بإيراد جاي.",
    ],
  };
}

/* ── خطر التوقف ──────────────────────────────────────────────── */

export type Churn = { pct: number | null; reasons: string[]; action: string | null; enough: boolean };

export function churnRisk(db: Db, partyId: string): Churn {
  const m = customerMetrics(db, partyId);
  if (m.ordersCount < 4 || !m.cycleDays) {
    return {
      pct: null,
      reasons: ["محتاج 4 طلبات على الأقل عشان نعرف دورته الطبيعية ونحكم إنه اتأخر عنها."],
      action: null,
      enough: false,
    };
  }
  const ratio = (m.daysSinceLast ?? 0) / m.cycleDays;
  let score = 0;
  const reasons: string[] = [];
  if (ratio > 1) {
    const add = Math.min(55, Math.round((ratio - 1) * 45));
    score += add;
    reasons.push(`آخر طلب منذ ${m.daysSinceLast} يوم ودورته المعتادة ${m.cycleDays} يوم`);
  }
  const w90 = m.windows.find((x) => x.days === 90);
  if (w90 && w90.changePct !== null && w90.changePct < 0) {
    const add = Math.min(30, Math.round(Math.abs(w90.changePct) / 2));
    score += add;
    reasons.push(`مشترياته في آخر 90 يوم ${Math.round(w90.changePct)}٪`);
  }
  if (m.overdue > 0) {
    score += 10;
    reasons.push(`عليه متأخرات ${r0(m.overdue)} جنيه، والمتأخرات بتوقف الطلبات`);
  }
  const total = clamp(score);
  return {
    pct: total,
    reasons: reasons.length ? reasons : ["بيطلب في دورته المعتادة ومفيش مؤشرات توقف."],
    action: total >= 60 ? "كلّمه النهارده" : total >= 35 ? "ابعتله عرض أو اتطمن عليه" : null,
    enough: true,
  };
}

/* ── الملاحظات الذكية ────────────────────────────────────────── */

export function insights(db: Db, partyId: string): string[] {
  const m = customerMetrics(db, partyId);
  const out: string[] = [];
  const w90 = m.windows.find((x) => x.days === 90);
  const w365 = m.windows.find((x) => x.days === 365);

  if (w90?.changePct !== null && w90 && Math.abs(w90.changePct) >= 10) {
    out.push(
      `${w90.changePct > 0 ? "زوّد" : "قلّل"} مشترياته ${Math.abs(Math.round(w90.changePct))}٪ في آخر 90 يوم (${r0(w90.recent)} مقابل ${r0(w90.previous)} جنيه).`,
    );
  }
  if (w365?.changePct !== null && w365 && Math.abs(w365.changePct) >= 10) {
    out.push(
      `على مدار سنة: ${w365.changePct > 0 ? "+" : ""}${Math.round(w365.changePct)}٪ مقارنة بالسنة اللي قبلها.`,
    );
  }

  // تحسّن أو تدهور سرعة التحصيل: أول نص التوريدات مقابل التاني
  const st = settlements(db, partyId).filter((s) => s.collectDays !== null);
  if (st.length >= 4) {
    const half = Math.floor(st.length / 2);
    const early = avg(st.slice(0, half).map((s) => s.collectDays ?? 0));
    const late = avg(st.slice(half).map((s) => s.collectDays ?? 0));
    if (early !== null && late !== null && Math.abs(early - late) >= 3) {
      out.push(
        late < early
          ? `متوسط التحصيل منه اتحسن من ${Math.round(early)} يوم لـ${Math.round(late)} يوم.`
          : `متوسط التحصيل منه بقى أبطأ: من ${Math.round(early)} يوم لـ${Math.round(late)} يوم.`,
      );
    }
  }

  if (m.cycleDays && m.distinctProducts <= 2 && m.ordersCount >= 4) {
    out.push(`بيطلب نفس المنتج كل ${m.cycleDays} يوم تقريبًا.`);
  }
  if (m.expectedNext) {
    const days = daysBetween(cairoToday(), m.expectedNext);
    out.push(
      days >= 0
        ? `الطلب الجاي المتوقع خلال ${days === 0 ? "النهارده" : `${days} يوم`}.`
        : `كان المفروض يطلب من ${Math.abs(days)} يوم على حسب دورته.`,
    );
  }
  if (m.outstanding > 0 && m.ordersCount >= 3) {
    const normal = m.avgOrder;
    if (normal > 0 && m.outstanding > normal * 1.2) {
      out.push(
        `مديونيته الحالية ${r0(m.outstanding)} جنيه — أعلى من متوسط طلبه (${r0(normal)}) بـ${Math.round(pct(m.outstanding - normal, normal))}٪.`,
      );
    }
  }
  if (m.marginPct !== null) {
    out.push(`هامش الربح على أوامره ${Math.round(m.marginPct)}٪${m.contribution ? ` — مساهمة ${r0(m.contribution)} جنيه` : ""}.`);
  }
  if (!out.length) out.push("لسه مفيش حركة كفاية نطلّع منها ملاحظة لها معنى.");
  return out;
}

/* ── الخطوة الجاية ───────────────────────────────────────────── */

export type NextAction = { tone: "ok" | "warn" | "danger"; title: string; why: string[] };

export function nextActions(db: Db, partyId: string): NextAction[] {
  const m = customerMetrics(db, partyId);
  const party = db.parties.find((p) => p.id === partyId);
  const score = customerScore(db, partyId);
  const churn = churnRisk(db, partyId);
  const out: NextAction[] = [];

  if (!score.enough) {
    return [
      {
        tone: "warn",
        title: "سجّل حركته الأول",
        why: ["السكور والتوصيات محتاجة تاريخ تعامل حقيقي — توريدين على الأقل."],
      },
    ];
  }

  const payment = score.blocks.find((b) => b.key === "payment")?.score ?? 0;
  const growing = (m.windows.find((x) => x.days === 90)?.changePct ?? 0) > 0;

  if (m.overdue > 0) {
    out.push({
      tone: "danger",
      title: "حصّل المتأخر",
      why: [
        `${r0(m.overdue)} جنيه متأخر في ${m.overdueCount} توريد`,
        m.avgDelayDays ? `بيتأخر ${Math.round(m.avgDelayDays)} يوم في المتوسط` : "",
      ].filter(Boolean),
    });
  }

  if (party?.creditLimit && m.outstanding > party.creditLimit) {
    out.push({
      tone: "danger",
      title: "راجع حد الائتمان",
      why: [`مديونيته ${r0(m.outstanding)} وحد الائتمان ${r0(party.creditLimit)}`, "أي توريد جديد محتاج موافقة صريحة"],
    });
  } else if ((score.total ?? 0) >= 80 && payment >= 75 && growing && party) {
    const suggested = Math.max(party.creditLimit, Math.ceil((m.biggestOrder * 1.5) / 5000) * 5000);
    if (suggested > party.creditLimit) {
      out.push({
        tone: "ok",
        title: `اقتراح: ارفع حد الائتمان لـ${r0(suggested)} جنيه`,
        why: [
          `سكوره ${score.total} ودرجة سداده ${payment}`,
          m.onTimeRate !== null ? `${Math.round(m.onTimeRate)}٪ من فواتيره اتسددت في ميعادها` : "",
          `أكبر طلب له ${r0(m.biggestOrder)} وحد الائتمان الحالي ${r0(party.creditLimit)}`,
          "القرار المالي في الآخر قرارك — ده اقتراح مبني على سلوكه المسجّل.",
        ].filter(Boolean),
      });
    }
  }

  if (churn.enough && (churn.pct ?? 0) >= 35) {
    out.push({
      tone: (churn.pct ?? 0) >= 60 ? "danger" : "warn",
      title: churn.action ?? "تابعه",
      why: churn.reasons,
    });
  }

  if (m.marginPct !== null && m.marginPct < 15) {
    out.push({
      tone: "warn",
      title: "راجع السعر معاه",
      why: [`هامشه ${Math.round(m.marginPct)}٪ بس — أقل من اللي يستحق المجهود`],
    });
  }

  if ((score.total ?? 0) >= 85 && !out.some((a) => a.tone === "danger")) {
    out.push({
      tone: "ok",
      title: "اعرض عليه منتجات أكتر",
      why: [`سكوره ${score.total}`, `بيطلب ${m.distinctProducts} منتج بس من اللي عندك`],
    });
  }

  if (!out.length) {
    out.push({ tone: "ok", title: "كل حاجة تمام", why: ["مفيش متأخرات ولا مؤشرات خطر — كمّل زي ما انت ماشي."] });
  }
  return out;
}

/* ── رحلة العميل ─────────────────────────────────────────────── */

export type JourneyStep = { period: string; text: string; tone: "muted" | "ok" | "warn" | "danger" };

export function journey(db: Db, partyId: string): JourneyStep[] {
  const dels = db.deliveries.filter((d) => d.clientId === partyId).sort((a, b) => a.date.localeCompare(b.date));
  if (!dels.length) return [];
  const byYear = new Map<string, number[]>();
  for (const d of dels) {
    const y = d.date.slice(0, 4);
    byYear.set(y, [...(byYear.get(y) ?? []), d.amount]);
  }
  const years = [...byYear.keys()].sort();
  const steps: JourneyStep[] = [];
  let prevTotal: number | null = null;

  years.forEach((y, i) => {
    const list = byYear.get(y) ?? [];
    const total = sum(list);
    if (i === 0) {
      steps.push({ period: y, text: `بدأ التعامل بـ${list.length} طلب بإجمالي ${r0(total)} جنيه`, tone: "muted" });
    } else if (prevTotal) {
      const change = Math.round(((total - prevTotal) / prevTotal) * 100);
      steps.push({
        period: y,
        text: `${change >= 0 ? "زادت" : "قلّت"} مشترياته ${Math.abs(change)}٪ — ${list.length} طلب ومتوسط ${r0(total / list.length)} جنيه`,
        tone: change >= 0 ? "ok" : "warn",
      });
    }
    prevTotal = total;
  });

  const m = customerMetrics(db, partyId);
  const w90 = m.windows.find((x) => x.days === 90);
  if (w90 && w90.changePct !== null) {
    steps.push({
      period: "آخر 90 يوم",
      text: `${w90.changePct >= 0 ? "+" : ""}${Math.round(w90.changePct)}٪ — ${r0(w90.recent)} جنيه`,
      tone: w90.changePct <= -15 ? "danger" : w90.changePct < 0 ? "warn" : "ok",
    });
  }
  const churn = churnRisk(db, partyId);
  if (churn.enough && (churn.pct ?? 0) >= 50) {
    steps.push({ period: "النهارده", text: `خطر توقف ${churn.pct}٪ — ${churn.reasons[0]}`, tone: "danger" });
  }
  return steps;
}

/* ── الترتيب والمقارنة ───────────────────────────────────────── */

export type RankRow = {
  party: Party;
  total: number | null;
  tierLabel: string;
  tierKey: TierKey | null;
  sales: number;
  collectionRate: number;
  marginPct: number | null;
  risk: number;
  riskLabel: string;
  outstanding: number;
  clvValue: number | null;
};

export function ranking(db: Db): RankRow[] {
  return customerIds(db)
    .map((id) => {
      const party = db.parties.find((p) => p.id === id)!;
      const m = customerMetrics(db, id);
      const score = customerScore(db, id);
      return {
        party,
        total: score.total,
        tierLabel: score.tier?.label ?? "بيانات مش كفاية",
        tierKey: score.tier?.key ?? null,
        sales: m.sales,
        collectionRate: m.collectionRate,
        marginPct: m.marginPct,
        risk: score.risk.total,
        riskLabel: score.risk.levelLabel,
        outstanding: m.outstanding,
        clvValue: clv(db, id).value,
      };
    })
    .sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
}

/* ── محفظة العملاء ───────────────────────────────────────────── */

export type PortfolioStats = {
  customers: number;
  withHistory: number;
  active: number;
  dormant: number;
  atRisk: number;
  newCustomers: number;
  tiers: { key: TierKey; label: string; count: number }[];
  sales: number;
  outstanding: number;
  overdue: number;
  top5Share: number | null;
  top5: { name: string; sales: number; share: number }[];
  concentrationRisk: boolean;
  bestByScore: RankRow | null;
  biggestBySales: RankRow | null;
};

export function portfolioStats(db: Db): PortfolioStats {
  const rows = ranking(db);
  const metrics = rows.map((r) => ({ row: r, m: customerMetrics(db, r.party.id) }));
  const withHistory = metrics.filter((x) => x.m.ordersCount > 0);
  const sales = sum(withHistory.map((x) => x.m.sales));
  const sorted = [...withHistory].sort((a, b) => b.m.sales - a.m.sales);
  // مع عدد عملاء صغير، "أكبر 5" بتساوي الكل ومعناها بيضيع — فبنضيّق المقارنة
  const topN = withHistory.length <= 6 ? 3 : 5;
  const top5 = sorted.slice(0, topN);
  const top5Sales = sum(top5.map((x) => x.m.sales));
  const byScore = rows.filter((r) => r.total !== null);

  return {
    customers: rows.length,
    withHistory: withHistory.length,
    active: withHistory.filter((x) => (x.m.daysSinceLast ?? 999) <= 60).length,
    dormant: withHistory.filter((x) => (x.m.daysSinceLast ?? 0) > 90).length,
    atRisk: rows.filter((r) => r.risk >= 30).length,
    newCustomers: withHistory.filter((x) => x.m.tenureDays <= 90).length,
    tiers: TIERS.map((t) => ({ key: t.key, label: t.label, count: rows.filter((r) => r.tierKey === t.key).length })),
    sales,
    outstanding: sum(withHistory.map((x) => x.m.outstanding)),
    overdue: sum(withHistory.map((x) => x.m.overdue)),
    top5Share: sales > 0 ? pct(top5Sales, sales) : null,
    top5: top5.map((x) => ({ name: x.row.party.name, sales: x.m.sales, share: pct(x.m.sales, Math.max(1, sales)) })),
    concentrationRisk: sales > 0 && withHistory.length >= 3 && pct(top5Sales, sales) >= 60,
    bestByScore: byScore[0] ?? null,
    biggestBySales: sorted[0]?.row ?? null,
  };
}

/* ── الأفواج: هل المصنع بيحافظ على عملائه؟ ───────────────────── */

export type Cohort = {
  month: string;
  customers: number;
  m3: number | null;
  m6: number | null;
  m12: number | null;
};

export function cohorts(db: Db): Cohort[] {
  const today = cairoToday();
  const groups = new Map<string, string[]>();
  for (const id of customerIds(db)) {
    const first = db.deliveries
      .filter((d) => d.clientId === id)
      .map((d) => d.date)
      .sort()[0];
    if (!first) continue;
    const key = first.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), id]);
  }

  const rate = (ids: string[], months: number): number | null => {
    const alive = ids.filter((id) => {
      const first = db.deliveries
        .filter((d) => d.clientId === id)
        .map((d) => d.date)
        .sort()[0];
      const mark = addDays(first, months * 30);
      if (mark > today) return false;
      return db.deliveries.some((d) => d.clientId === id && d.date >= mark);
    });
    const ready = ids.filter((id) => {
      const first = db.deliveries
        .filter((d) => d.clientId === id)
        .map((d) => d.date)
        .sort()[0];
      return addDays(first, months * 30) <= today;
    });
    return ready.length ? pct(alive.length, ready.length) : null;
  };

  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, ids]) => ({
      month,
      customers: ids.length,
      m3: rate(ids, 3),
      m6: rate(ids, 6),
      m12: rate(ids, 12),
    }));
}

/* ── دورة الطلب: مستخدمة في التنبيهات كمان ───────────────────── */

export type PurchasePattern = {
  avgDays: number | null;
  avgQty: number | null;
  expectedNext: string | null;
  overdueByDays: number | null;
};

export function purchasePattern(db: Db, partyId: string): PurchasePattern {
  const m = customerMetrics(db, partyId);
  const dels = db.deliveries.filter((d) => d.clientId === partyId);
  const qtys = dels.map((d) => d.quantity ?? 0).filter((q) => q > 0);
  const since = m.daysSinceLast ?? 0;
  return {
    avgDays: m.ordersCount >= 3 ? m.cycleDays : null,
    avgQty: qtys.length ? Math.round(sum(qtys) / qtys.length) : null,
    expectedNext: m.expectedNext,
    overdueByDays: m.cycleDays && m.ordersCount >= 3 && since > m.cycleDays ? since - m.cycleDays : null,
  };
}
