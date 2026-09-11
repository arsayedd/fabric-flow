import { addDays, cairoToday, daysBetween } from "@/lib/utils";
import { clientBalance, confirmedCollections, fifoRemain } from "./compute";
import type { Db, Party, PartyRole } from "./types";

/** العملاء فقط — للقوائم المنسدلة وشاشات البيع */
export function customers(db: Db): Party[] {
  return partiesWithRole(db, "customer");
}

export function partiesWithRole(db: Db, role: PartyRole): Party[] {
  return db.parties.filter((p) => !p.mergedIntoId && p.roles.includes(role));
}

export function partyById(db: Db, id: string | null | undefined): Party | undefined {
  return id ? db.parties.find((p) => p.id === id) : undefined;
}

/* ── الحساب والائتمان ────────────────────────────────────────── */

export type PartyCredit = {
  exposure: number;
  limit: number;
  available: number;
  overLimit: boolean;
  hasLimit: boolean;
};

export function partyCredit(db: Db, partyId: string): PartyCredit {
  const party = partyById(db, partyId);
  const exposure = clientBalance(db, partyId);
  const limit = party?.creditLimit ?? 0;
  return {
    exposure,
    limit,
    available: limit - exposure,
    overLimit: limit > 0 && exposure > limit,
    hasLimit: limit > 0,
  };
}

/* ── إحصاءات العميل ──────────────────────────────────────────── */

export type CustomerStats = {
  sales: number;
  collected: number;
  balance: number;
  overdue: number;
  overdueCount: number;
  orders: number;
  avgOrder: number;
  firstDate: string | null;
  lastDate: string | null;
  daysSinceLast: number | null;
  /** نمو آخر 90 يوم مقارنة بالـ90 اللي قبلها */
  growthPct: number | null;
  productionOrders: number;
  producedQty: number;
};

export function customerStats(db: Db, partyId: string): CustomerStats {
  const today = cairoToday();
  const dels = db.deliveries
    .filter((d) => d.clientId === partyId)
    .sort((a, b) => a.date.localeCompare(b.date));
  const sales = dels.reduce((s, d) => s + d.amount, 0);
  const collected = confirmedCollections(db)
    .filter((c) => c.clientId === partyId)
    .reduce((s, c) => s + c.amount, 0);
  const remain = fifoRemain(db.deliveries, db.collections).filter(
    (d) => d.clientId === partyId && d.remaining > 0.5 && d.dueDate < today,
  );
  const cut = addDays(today, -90);
  const prevCut = addDays(today, -180);
  const recent = dels.filter((d) => d.date >= cut).reduce((s, d) => s + d.amount, 0);
  const previous = dels.filter((d) => d.date >= prevCut && d.date < cut).reduce((s, d) => s + d.amount, 0);
  const orders = db.orders.filter((o) => o.clientId === partyId);

  return {
    sales,
    collected,
    balance: sales - collected,
    overdue: remain.reduce((s, d) => s + d.remaining, 0),
    overdueCount: remain.length,
    orders: dels.length,
    avgOrder: dels.length ? sales / dels.length : 0,
    firstDate: dels[0]?.date ?? null,
    lastDate: dels[dels.length - 1]?.date ?? null,
    daysSinceLast: dels.length ? daysBetween(dels[dels.length - 1].date, today) : null,
    growthPct: previous > 0 ? ((recent - previous) / previous) * 100 : null,
    productionOrders: orders.filter((o) => o.status === "running" || o.status === "late").length,
    producedQty: orders.reduce((s, o) => s + (o.quantity * o.progress) / 100, 0),
  };
}

export type SupplierStats = {
  purchases: number;
  paid: number;
  due: number;
  entries: number;
  lastDate: string | null;
  items: string[];
};

export function supplierStats(db: Db, partyId: string): SupplierStats {
  const party = partyById(db, partyId);
  const entries = db.costEntries.filter((e) => e.partyId === partyId || (!e.partyId && party && e.vendor === party.name));
  const ids = new Set(entries.map((e) => e.id));
  const paid = db.costPayments.filter((p) => ids.has(p.costEntryId)).reduce((s, p) => s + p.amount, 0);
  const purchases = entries.reduce((s, e) => s + e.amount, 0);
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  return {
    purchases,
    paid,
    due: purchases - paid,
    entries: entries.length,
    lastDate: sorted[sorted.length - 1]?.date ?? null,
    items: [...new Set(entries.map((e) => db.costItems.find((i) => i.id === e.costItemId)?.name ?? "").filter(Boolean))],
  };
}

/* ── الخط الزمني ─────────────────────────────────────────────── */

export type TimelineEvent = {
  id: string;
  date: string;
  kind: "delivery" | "collection" | "order" | "purchase" | "payment" | "comm" | "task";
  title: string;
  detail: string;
  amount: number | null;
};

export function partyTimeline(db: Db, partyId: string): TimelineEvent[] {
  const party = partyById(db, partyId);
  const events: TimelineEvent[] = [];

  for (const d of db.deliveries.filter((x) => x.clientId === partyId)) {
    events.push({
      id: d.id,
      date: d.date,
      kind: "delivery",
      title: "توريد للعميل",
      detail: [d.model, d.quantity ? `${d.quantity} وحدة` : ""].filter(Boolean).join(" · "),
      amount: d.amount,
    });
  }
  for (const c of db.collections.filter((x) => x.clientId === partyId)) {
    events.push({
      id: c.id,
      date: c.date,
      kind: "collection",
      title: c.status === "pending" ? "تحصيل مستني تأكيد" : "تحصيل",
      detail: c.notes,
      amount: c.amount,
    });
  }
  for (const o of db.orders.filter((x) => x.clientId === partyId)) {
    events.push({
      id: o.id,
      date: o.dueDate,
      kind: "order",
      title: `أمر إنتاج ${o.code}`,
      detail: `${o.model} · ${o.quantity} وحدة`,
      amount: null,
    });
  }
  for (const e of db.costEntries.filter((x) => x.partyId === partyId || (!x.partyId && party && x.vendor === party.name))) {
    events.push({
      id: e.id,
      date: e.date,
      kind: "purchase",
      title: "شراء من المورّد",
      detail: db.costItems.find((i) => i.id === e.costItemId)?.name ?? "",
      amount: e.amount,
    });
  }
  for (const m of db.communications.filter((x) => x.partyId === partyId)) {
    events.push({
      id: m.id,
      date: m.date,
      kind: "comm",
      title: m.subject || "تواصل",
      detail: m.body,
      amount: null,
    });
  }
  for (const t of db.tasks.filter((x) => x.partyId === partyId)) {
    events.push({
      id: t.id,
      date: t.dueDate,
      kind: "task",
      title: t.status === "done" ? `مهمة مخلّصة: ${t.title}` : `مهمة: ${t.title}`,
      detail: t.assigneeName,
      amount: null,
    });
  }

  return events.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : b.date.localeCompare(a.date)));
}

/* ── السكور: محسوب من بيانات المصنع بس، ومع تفسير ───────────── */

export type ScorePart = { label: string; value: number; why: string };

export type PartyScore = {
  total: number | null;
  parts: ScorePart[];
  reasons: string[];
  risk: number | null;
  health: "good" | "watch" | "risk" | "unknown";
  enough: boolean;
};

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function customerScore(db: Db, partyId: string): PartyScore {
  const s = customerStats(db, partyId);
  if (s.orders < 2) {
    return {
      total: null,
      parts: [],
      reasons: ["البيانات لسه مش كفاية — محتاج توريدين على الأقل عشان السكور يبقى له معنى."],
      risk: null,
      health: "unknown",
      enough: false,
    };
  }

  const collectionRate = s.sales > 0 ? (s.collected / s.sales) * 100 : 0;
  const overdueShare = s.sales > 0 ? (s.overdue / s.sales) * 100 : 0;
  const payment = clamp(collectionRate - overdueShare * 1.5);

  const allSales = db.parties.filter((p) => p.roles.includes("customer")).map((p) => customerStats(db, p.id).sales);
  const maxSales = Math.max(...allSales, 1);
  const volume = clamp((s.sales / maxSales) * 100);

  const growth = s.growthPct === null ? 50 : clamp(50 + s.growthPct);

  const orders = db.orders.filter((o) => o.clientId === partyId && o.piecePrice > 0);
  const margin = orders.length
    ? orders.reduce((acc, o) => acc + ((o.piecePrice - o.pieceCost) / o.piecePrice) * 100, 0) / orders.length
    : null;
  const profitability = margin === null ? 50 : clamp(margin * 2.5);

  const cycle = purchasePattern(db, partyId);
  const lateness = cycle.avgDays && s.daysSinceLast ? s.daysSinceLast / cycle.avgDays : 1;
  const risk = clamp(overdueShare * 1.5 + Math.max(0, (lateness - 1) * 25) + (100 - payment) * 0.2);

  const parts: ScorePart[] = [
    { label: "الالتزام بالسداد", value: payment, why: `حصّلت ${Math.round(collectionRate)}٪ من توريداته` },
    { label: "حجم التعامل", value: volume, why: `مبيعاته مقارنة بأكبر عميل عندك` },
    {
      label: "النمو",
      value: growth,
      why: s.growthPct === null ? "مفيش فترة سابقة للمقارنة" : `${s.growthPct > 0 ? "+" : ""}${Math.round(s.growthPct)}٪ آخر 90 يوم`,
    },
    {
      label: "الربحية",
      value: profitability,
      why: margin === null ? "مفيش أوامر إنتاج بأسعار مسجّلة" : `متوسط هامش ${Math.round(margin)}٪ على أوامره`,
    },
  ];

  const total = clamp(payment * 0.35 + volume * 0.2 + growth * 0.2 + profitability * 0.25);
  const reasons: string[] = [];
  if (collectionRate >= 90) reasons.push(`تحصيل ${Math.round(collectionRate)}٪`);
  if (s.growthPct !== null && s.growthPct > 10) reasons.push(`نمو ${Math.round(s.growthPct)}٪`);
  if (s.overdue > 0) reasons.push(`متأخر عليه ${Math.round(s.overdue)} جنيه`);
  if (margin !== null && margin >= 25) reasons.push(`هامش عالي ${Math.round(margin)}٪`);
  if (s.daysSinceLast !== null && cycle.avgDays && s.daysSinceLast > cycle.avgDays * 2) {
    reasons.push(`مطلبش من ${s.daysSinceLast} يوم`);
  }

  return {
    total,
    parts,
    reasons,
    risk,
    health: risk >= 55 || total < 45 ? "risk" : risk >= 30 || total < 65 ? "watch" : "good",
    enough: true,
  };
}

export function supplierScore(db: Db, partyId: string): PartyScore {
  const s = supplierStats(db, partyId);
  if (s.entries < 2) {
    return {
      total: null,
      parts: [],
      reasons: ["البيانات لسه مش كفاية — محتاج عمليتي شراء على الأقل."],
      risk: null,
      health: "unknown",
      enough: false,
    };
  }
  const allPurchases = db.parties.filter((p) => p.roles.includes("supplier")).map((p) => supplierStats(db, p.id).purchases);
  const maxP = Math.max(...allPurchases, 1);
  const volume = clamp((s.purchases / maxP) * 100);
  const settled = s.purchases > 0 ? clamp((s.paid / s.purchases) * 100) : 0;
  const continuity = clamp(s.entries * 15);

  const parts: ScorePart[] = [
    { label: "حجم التوريد", value: volume, why: `${Math.round(s.purchases)} جنيه مشتريات` },
    { label: "انتظام السداد له", value: settled, why: `دفعتله ${Math.round(settled)}٪ من مستحقاته` },
    { label: "استمرارية التعامل", value: continuity, why: `${s.entries} عملية شراء` },
  ];
  const total = clamp(volume * 0.35 + settled * 0.3 + continuity * 0.35);
  return {
    total,
    parts,
    reasons: [
      "الجودة ووقت التوريد مش داخلين في السكور لحد ما موديول المشتريات والجودة يشتغل — النظام مبيخمّنش.",
    ],
    risk: null,
    health: total >= 70 ? "good" : total >= 50 ? "watch" : "risk",
    enough: true,
  };
}

/* ── التحليلات ───────────────────────────────────────────────── */

export type AffinityRow = { name: string; amount: number; share: number };

export function productAffinity(db: Db, partyId: string): AffinityRow[] {
  const dels = db.deliveries.filter((d) => d.clientId === partyId && d.model.trim());
  const total = dels.reduce((s, d) => s + d.amount, 0);
  const map = new Map<string, number>();
  for (const d of dels) map.set(d.model, (map.get(d.model) ?? 0) + d.amount);
  return [...map.entries()]
    .map(([name, amount]) => ({ name, amount, share: total ? (amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

export type PurchasePattern = {
  avgDays: number | null;
  avgQty: number | null;
  expectedNext: string | null;
  overdueByDays: number | null;
};

export function purchasePattern(db: Db, partyId: string): PurchasePattern {
  const dels = db.deliveries
    .filter((d) => d.clientId === partyId)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (dels.length < 3) return { avgDays: null, avgQty: null, expectedNext: null, overdueByDays: null };
  let gaps = 0;
  for (let i = 1; i < dels.length; i++) gaps += daysBetween(dels[i - 1].date, dels[i].date);
  const avgDays = Math.round(gaps / (dels.length - 1));
  const qtys = dels.map((d) => d.quantity ?? 0).filter((q) => q > 0);
  const last = dels[dels.length - 1].date;
  const expectedNext = avgDays > 0 ? addDays(last, avgDays) : null;
  const since = daysBetween(last, cairoToday());
  return {
    avgDays,
    avgQty: qtys.length ? Math.round(qtys.reduce((s, q) => s + q, 0) / qtys.length) : null,
    expectedNext,
    overdueByDays: avgDays > 0 && since > avgDays ? since - avgDays : null,
  };
}

/* ── التصنيف التلقائي والتنبيهات ─────────────────────────────── */

export type Segment = "strategic" | "growing" | "declining" | "fast_payer" | "slow_payer" | "dormant" | "at_risk" | "new";

export const SEGMENT_LABEL: Record<Segment, string> = {
  strategic: "عميل استراتيجي",
  growing: "بينمو",
  declining: "بيقل",
  fast_payer: "بيدفع بسرعة",
  slow_payer: "بيتأخر في الدفع",
  dormant: "متوقف",
  at_risk: "معرّض للفقد",
  new: "جديد",
};

export function customerSegments(db: Db, partyId: string): Segment[] {
  const s = customerStats(db, partyId);
  const score = customerScore(db, partyId);
  const out: Segment[] = [];
  if (s.orders <= 1) out.push("new");
  if (score.total !== null && score.total >= 80) out.push("strategic");
  if (s.growthPct !== null && s.growthPct >= 15) out.push("growing");
  if (s.growthPct !== null && s.growthPct <= -15) out.push("declining");
  if (s.sales > 0 && s.collected / s.sales >= 0.95 && s.overdue === 0) out.push("fast_payer");
  if (s.overdue > 0) out.push("slow_payer");
  if (s.daysSinceLast !== null && s.daysSinceLast > 90) out.push("dormant");
  if (score.risk !== null && score.risk >= 55) out.push("at_risk");
  return out;
}

export type PartyAlert = {
  partyId: string;
  name: string;
  tone: "ok" | "warn" | "danger";
  text: string;
  action: string;
  to: string;
};

/** تنبيهات مبنية على أرقام حقيقية — كل واحد بيقول الرقم اللي اتبنى عليه */
export function partyAlerts(db: Db): PartyAlert[] {
  const out: PartyAlert[] = [];
  for (const p of db.parties.filter((x) => !x.mergedIntoId)) {
    if (!p.roles.includes("customer")) continue;
    const s = customerStats(db, p.id);
    const credit = partyCredit(db, p.id);
    const pattern = purchasePattern(db, p.id);

    if (credit.overLimit) {
      out.push({
        partyId: p.id,
        name: p.name,
        tone: "danger",
        text: `رصيده ${Math.round(credit.exposure)} جنيه وحد الائتمان ${Math.round(credit.limit)} — عدّى بـ${Math.round(credit.exposure - credit.limit)}.`,
        action: "راجع الائتمان",
        to: `/parties/${p.id}`,
      });
    }
    if (s.overdue > 0) {
      out.push({
        partyId: p.id,
        name: p.name,
        tone: "warn",
        text: `متأخر عليه ${Math.round(s.overdue)} جنيه في ${s.overdueCount} توريد.`,
        action: "حصّل الفلوس",
        to: `/parties/${p.id}`,
      });
    }
    if (pattern.overdueByDays !== null && pattern.overdueByDays >= Math.max(7, (pattern.avgDays ?? 0) * 0.5)) {
      out.push({
        partyId: p.id,
        name: p.name,
        tone: "warn",
        text: `مطلبش من ${s.daysSinceLast} يوم، ودورة طلباته المعتادة ${pattern.avgDays} يوم.`,
        action: "كلّمه",
        to: `/parties/${p.id}`,
      });
    }
    if (s.growthPct !== null && s.growthPct >= 25) {
      out.push({
        partyId: p.id,
        name: p.name,
        tone: "ok",
        text: `زوّد مشترياته ${Math.round(s.growthPct)}٪ آخر 90 يوم.`,
        action: "اعرض عليه أكتر",
        to: `/parties/${p.id}`,
      });
    }
  }
  const order = { danger: 0, warn: 1, ok: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

export type Portfolio = {
  total: number;
  customers: number;
  suppliers: number;
  active: number;
  growing: number;
  declining: number;
  atRisk: number;
  dormant: number;
  topShare: number | null;
  topNames: string[];
};

export function portfolio(db: Db): Portfolio {
  const live = db.parties.filter((p) => !p.mergedIntoId);
  const customers = live.filter((p) => p.roles.includes("customer"));
  const stats = customers.map((p) => ({ p, s: customerStats(db, p.id), seg: customerSegments(db, p.id) }));
  const totalSales = stats.reduce((s, x) => s + x.s.sales, 0);
  const top = [...stats].sort((a, b) => b.s.sales - a.s.sales).slice(0, 3);
  return {
    total: live.length,
    customers: customers.length,
    suppliers: live.filter((p) => p.roles.includes("supplier")).length,
    active: stats.filter((x) => x.s.daysSinceLast !== null && x.s.daysSinceLast <= 60).length,
    growing: stats.filter((x) => x.seg.includes("growing")).length,
    declining: stats.filter((x) => x.seg.includes("declining")).length,
    atRisk: stats.filter((x) => x.seg.includes("at_risk")).length,
    dormant: stats.filter((x) => x.seg.includes("dormant")).length,
    topShare: totalSales > 0 ? (top.reduce((s, x) => s + x.s.sales, 0) / totalSales) * 100 : null,
    topNames: top.map((x) => x.p.name),
  };
}

/* ── منع التكرار ─────────────────────────────────────────────── */

function normalize(v: string): string {
  return v.replace(/\s+/g, " ").trim().toLowerCase();
}

export function findDuplicates(db: Db, input: { name: string; phone: string; taxId: string }): Party[] {
  const name = normalize(input.name);
  const phone = input.phone.replace(/\D/g, "");
  const tax = normalize(input.taxId);
  if (!name && !phone && !tax) return [];
  return db.parties.filter((p) => {
    if (p.mergedIntoId) return false;
    const pPhone = p.phone.replace(/\D/g, "");
    if (phone && pPhone && pPhone === phone) return true;
    if (tax && normalize(p.taxId) === tax) return true;
    if (name && normalize(p.name).includes(name)) return true;
    if (name && name.includes(normalize(p.name)) && p.name.length > 3) return true;
    return false;
  });
}
