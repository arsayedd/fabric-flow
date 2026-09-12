import { addDays, cairoToday, daysBetween } from "@/lib/utils";
import { allAccountBalances, confirmedCollections, customerCredits, fifoPairs, fifoRemain, payables } from "./compute";
import { partyById } from "./parties";
import type { Db } from "./types";

/**
 * الفلوس الجاية والرايحة.
 *
 * أخطر سؤال في المصنع مش «ربحت كام» — هو **«الخزنة هتضيق امتى؟»**. والفرق
 * إن الربح رقم عن اللي حصل، والسؤال ده عن اللي جاي: مصنع رابح ممكن يقف
 * لأن فلوسه كلها عند العملاء والمستحق عليه ميعاده الأسبوع الجاي.
 *
 * وكل رقم هنا محسوب من الدفتر اللي موجود: التوريدات بمواعيدها، التحصيل
 * بالأقدمية، الشيكات بتاريخ صرفها، فواتير الموردين بمهلة الدفع المكتوبة
 * على المورّد، أجور العمال المستحقة، ومستحقات الورش. **مفيش تقدير ولا
 * نسبة نمو مفترضة** — التوقع هنا معناه «المواعيد اللي في دفترك»، مش
 * تنبؤ إحصائي.
 *
 * ### القاعدة اللي كل الشاشة قايمة عليها
 *
 * **الفلوس المتأخرة على العملاء مابتتحسبش داخلة. المتأخرة علينا بتتحسب
 * خارجة.**
 *
 * الميعاد اللي فات مرة **مابقاش ميعاد**: تحصيل متأخر ٤٠ يوم لو حسبناه
 * «بيدخل النهارده» يبقى التوقع بيطمّن صاحب المصنع على فلوس محدش وعد
 * بيها. وفي نفس الوقت المستحق علينا اللي فات ميعاده **لازم** يتحسب، لأنه
 * فعلًا مطلوب. الاتنين مع بعض بيخلّوا التوقع **متحفّظ في الاتجاهين**،
 * والمتأخر على العملاء بيتعرض لوحده: «لو حصّلت المتأخر، الصورة تبقى كده».
 */

/* ── أعمار المستحقات ──────────────────────────────────────────── */

export type AgingKey = "notDue" | "d1" | "d31" | "d61" | "d91";

export type AgingDef = { key: AgingKey; label: string; tone: "ok" | "warn" | "danger"; about: string };

export const AGING_DEFS: AgingDef[] = [
  { key: "notDue", label: "لسه ماستحقّش", tone: "ok", about: "ميعاده لسه جاي" },
  { key: "d1", label: "متأخر ١–٣٠ يوم", tone: "warn", about: "تأخير عادي — مكالمة بتحلّه" },
  { key: "d31", label: "متأخر ٣١–٦٠ يوم", tone: "warn", about: "بقى محتاج متابعة مكتوبة" },
  { key: "d61", label: "متأخر ٦١–٩٠ يوم", tone: "danger", about: "وقف توريد جديد لحد ما يدفع" },
  { key: "d91", label: "متأخر أكتر من ٩٠ يوم", tone: "danger", about: "الفلوس دي بقت مشكوك في تحصيلها" },
];

export type AgingRow = {
  deliveryId: string;
  clientId: string;
  clientName: string;
  phone: string;
  model: string;
  dueDate: string;
  /** موجب = عدّى الميعاد بكام يوم */
  lateDays: number;
  amount: number;
  bucket: AgingKey;
};

export type AgingBucket = AgingDef & { total: number; count: number; rows: AgingRow[] };

/** نفس الحدود بصياغة «عمر الفاتورة» — اللي علينا مالوش ميعاد مكتوب دايمًا */
export const AGE_DEFS: AgingDef[] = [
  { key: "notDue", label: "من النهارده", tone: "ok", about: "فاتورة اتسجّلت النهارده" },
  { key: "d1", label: "عمرها ١–٣٠ يوم", tone: "ok", about: "في المدى الطبيعي للدفع" },
  { key: "d31", label: "عمرها ٣١–٦٠ يوم", tone: "warn", about: "المورّد بدأ يسأل" },
  { key: "d61", label: "عمرها ٦١–٩٠ يوم", tone: "warn", about: "بتأثر على سعرك الجاي" },
  { key: "d91", label: "عمرها أكتر من ٩٠ يوم", tone: "danger", about: "علاقة المورّد نفسها في الخطر" },
];

export function agingBucketOf(lateDays: number): AgingKey {
  if (lateDays <= 0) return "notDue";
  if (lateDays <= 30) return "d1";
  if (lateDays <= 60) return "d31";
  if (lateDays <= 90) return "d61";
  return "d91";
}

export function receivableAging(db: Db, asOf = cairoToday()) {
  const remain = fifoRemain(db.deliveries, db.collections, customerCredits(db)).filter((d) => d.remaining > 0.5);
  const rows: AgingRow[] = remain.map((d) => {
    const client = partyById(db, d.clientId);
    const lateDays = daysBetween(d.dueDate, asOf);
    return {
      deliveryId: d.id,
      clientId: d.clientId,
      clientName: client?.name ?? "عميل محذوف",
      phone: client?.phone ?? "",
      model: d.model,
      dueDate: d.dueDate,
      lateDays,
      amount: d.remaining,
      bucket: agingBucketOf(lateDays),
    };
  });

  const buckets: AgingBucket[] = AGING_DEFS.map((def) => {
    const list = rows.filter((r) => r.bucket === def.key).sort((a, b) => b.amount - a.amount);
    return { ...def, rows: list, count: list.length, total: list.reduce((s, r) => s + r.amount, 0) };
  });

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const overdue = rows.filter((r) => r.lateDays > 0).reduce((s, r) => s + r.amount, 0);
  return { asOf, rows, buckets, total, overdue, notDue: total - overdue };
}

/* ── سلوك الدفع ──────────────────────────────────────────────── */

/**
 * أقل من تلات توريدات مسدّدة **مش سلوك — حادثة**.
 *
 * عميل دفع مرة واحدة متأخر ٣٠ يوم مش «بيدفع بعد ٣٠ يوم»؛ ولو حسبناه كده
 * وحطّيناه في «أسوأ دافع» يبقى النظام بيوصّي بقرار تجاري على عيّنة واحدة.
 * فاللي تحت الحد بيرجع `null` والشاشة بتكتب «لسه بدري».
 */
export const MIN_SETTLED = 3;

export type PayerRow = {
  clientId: string;
  name: string;
  phone: string;
  termDays: number;
  /** التوريدات اللي اتسدّدت بفلوس (إشعار الخصم مش دفع) */
  paidCount: number;
  paidAmount: number;
  /** متوسط أيام الدفع من تاريخ التوريد، موزون بالمبلغ */
  avgDaysToPay: number | null;
  /** متوسط التأخير عن الميعاد — الصفر معناه بيدفع في الميعاد */
  avgDaysLate: number | null;
  onTimePct: number | null;
  openAmount: number;
  overdueAmount: number;
  oldestLateDays: number;
  /** نسبة التحصيل = اللي دفعه ÷ اللي اتفوتر عليه */
  collectedPct: number | null;
  enough: boolean;
};

export function payerBehavior(db: Db): PayerRow[] {
  const today = cairoToday();
  const pairs = fifoPairs(db.deliveries, db.collections, customerCredits(db)).filter((p) => p.kind === "collection");
  const aging = receivableAging(db, today);

  const clientIds = [...new Set(db.deliveries.map((d) => d.clientId))];
  const rows = clientIds.map((clientId): PayerRow => {
    const party = partyById(db, clientId);
    const mine = pairs.filter((p) => p.clientId === clientId);
    const paidAmount = mine.reduce((s, p) => s + p.amount, 0);
    const paidCount = new Set(mine.map((p) => p.deliveryId)).size;
    const billed = db.deliveries.filter((d) => d.clientId === clientId).reduce((s, d) => s + d.amount, 0);
    const open = aging.rows.filter((r) => r.clientId === clientId);
    const enough = paidCount >= MIN_SETTLED && paidAmount > 0;

    const weighted = (f: (p: (typeof mine)[number]) => number) =>
      paidAmount > 0 ? mine.reduce((s, p) => s + f(p) * p.amount, 0) / paidAmount : 0;

    return {
      clientId,
      name: party?.name ?? "عميل محذوف",
      phone: party?.phone ?? "",
      termDays: party?.paymentTermDays ?? 0,
      paidCount,
      paidAmount,
      avgDaysToPay: enough ? Math.round(weighted((p) => daysBetween(p.deliveryDate, p.date))) : null,
      avgDaysLate: enough ? Math.round(weighted((p) => Math.max(0, daysBetween(p.dueDate, p.date)))) : null,
      onTimePct: enough
        ? (mine.filter((p) => p.date <= p.dueDate).reduce((s, p) => s + p.amount, 0) / paidAmount) * 100
        : null,
      openAmount: open.reduce((s, r) => s + r.amount, 0),
      overdueAmount: open.filter((r) => r.lateDays > 0).reduce((s, r) => s + r.amount, 0),
      oldestLateDays: open.reduce((m, r) => Math.max(m, r.lateDays), 0),
      collectedPct: billed > 0 ? (paidAmount / billed) * 100 : null,
      enough,
    };
  });

  return rows.sort((a, b) => b.overdueAmount - a.overdueAmount || b.openAmount - a.openAmount);
}

/**
 * الترتيب بيتعمل على **اللي عندهم سلوك مقيس بس**. والأحسن بيتحدد بالدفع في
 * الميعاد مش بحجم الفلوس: عميل كبير بيدفع متأخر مش «أفضل دافع».
 */
export function payerRanking(db: Db, n = 5) {
  const rows = payerBehavior(db).filter((r) => r.enough);
  const best = [...rows]
    .sort((a, b) => (b.onTimePct ?? 0) - (a.onTimePct ?? 0) || (a.avgDaysLate ?? 0) - (b.avgDaysLate ?? 0))
    .slice(0, n);
  const worst = [...rows]
    .sort((a, b) => (b.avgDaysLate ?? 0) - (a.avgDaysLate ?? 0) || b.overdueAmount - a.overdueAmount)
    .slice(0, n);
  return { best, worst, measured: rows.length, all: payerBehavior(db).length };
}

/* ── سرعة التحصيل ────────────────────────────────────────────── */

export type CollectionSpeed = {
  from: string;
  to: string;
  billed: number;
  collected: number;
  /** نسبة التحصيل في المدة = المحصّل ÷ المفوتر */
  ratePct: number | null;
  /** متوسط أيام الدفع الفعلي للتحصيلات اللي حصلت في المدة */
  avgDaysToPay: number | null;
  /** المستحق المفتوح بيعادل كام يوم توريد — ده الـDSO */
  dso: number | null;
  openTotal: number;
};

export function collectionSpeed(db: Db, from: string, to: string): CollectionSpeed {
  const inRange = (d: string) => d >= from && d <= to;
  const billed = db.deliveries.filter((d) => inRange(d.date)).reduce((s, d) => s + d.amount, 0);
  const collected = confirmedCollections(db)
    .filter((c) => inRange(c.date))
    .reduce((s, c) => s + c.amount, 0);
  const pairs = fifoPairs(db.deliveries, db.collections, customerCredits(db)).filter(
    (p) => p.kind === "collection" && inRange(p.date),
  );
  const paid = pairs.reduce((s, p) => s + p.amount, 0);
  const open = receivableAging(db, to).total;
  const days = Math.max(1, daysBetween(from, to) + 1);
  const perDay = billed / days;

  return {
    from,
    to,
    billed,
    collected,
    ratePct: billed > 0 ? (collected / billed) * 100 : null,
    avgDaysToPay:
      paid > 0 ? Math.round(pairs.reduce((s, p) => s + daysBetween(p.deliveryDate, p.date) * p.amount, 0) / paid) : null,
    // المستحق ÷ متوسط التوريد اليومي. ومابنحسبهوش من غير توريد في المدة،
    // لأن القسمة على صفر بترجع رقم بيبان كأنه قياس وهو مش قياس.
    dso: perDay > 0 ? Math.round(open / perDay) : null,
    openTotal: open,
  };
}

/* ── توقع الخزنة ─────────────────────────────────────────────── */

export type CashItemKind = "receivable" | "cheque" | "pending" | "vendor" | "worker" | "workshop";

export const CASH_KIND_LABEL: Record<CashItemKind, string> = {
  receivable: "تحصيل من عميل",
  cheque: "شيك بتاريخه",
  pending: "تحويل مستني تأكيد",
  vendor: "فاتورة مورّد",
  worker: "أجور عمال",
  workshop: "مستحق ورشة",
};

export type CashItem = {
  kind: CashItemKind;
  label: string;
  /** موجب = داخل، سالب = خارج */
  amount: number;
  date: string;
  to: string | null;
  /** مستحق دلوقتي مش ميعاد جاي */
  now: boolean;
};

export type CashDay = { date: string; inflow: number; outflow: number; balance: number; items: CashItem[] };

export type CashForecast = {
  horizon: number;
  opening: number;
  days: CashDay[];
  inflow: number;
  outflow: number;
  closing: number;
  lowest: { date: string; balance: number } | null;
  /** أول يوم الرصيد يقل عن صفر — ده الجرس */
  shortfall: { date: string; balance: number } | null;
  /** متأخر على العملاء ومش مجدول: لو دخل، الصورة تتغيّر */
  overdueIn: number;
  items: CashItem[];
};

export function cashForecast(db: Db, horizon = 30, asOf = cairoToday()): CashForecast {
  const end = addDays(asOf, horizon);
  const opening = allAccountBalances(db).reduce((s, a) => s + a.balance, 0);
  const items: CashItem[] = [];

  /* داخل: مستحقات بمواعيدها الجاية بس */
  const aging = receivableAging(db, asOf);
  let overdueIn = 0;
  for (const r of aging.rows) {
    if (r.lateDays > 0) {
      overdueIn += r.amount;
      continue;
    }
    if (r.dueDate > end) continue;
    items.push({
      kind: "receivable",
      label: `${r.clientName}${r.model ? ` — ${r.model}` : ""}`,
      amount: r.amount,
      date: r.dueDate,
      to: `/parties/${r.clientId}`,
      now: false,
    });
  }

  /* الشيكات والتحويلات المستنية */
  for (const c of db.collections.filter((x) => x.status === "pending")) {
    const party = partyById(db, c.clientId);
    if (c.method === "cheque") {
      const date = c.chequeDate ?? c.date;
      // شيك عدّى تاريخه ولسه ماتأكدش مابيتجدولش: هو بقى متأخر زي أي متأخر
      if (date < asOf) {
        overdueIn += c.amount;
        continue;
      }
      if (date > end) continue;
      items.push({
        kind: "cheque",
        label: `شيك ${party?.name ?? ""}`.trim(),
        amount: c.amount,
        date,
        to: "/collections",
        now: false,
      });
      continue;
    }
    items.push({
      kind: "pending",
      label: `تحويل ${party?.name ?? ""}`.trim(),
      amount: c.amount,
      date: asOf,
      to: "/collections",
      now: true,
    });
  }

  /* خارج: فواتير الموردين بمهلة الدفع المكتوبة على المورّد */
  const pay = payables(db);
  for (const v of pay.vendor) {
    const party = v.partyId ? partyById(db, v.partyId) : null;
    const term = party?.paymentTermDays ?? 0;
    const due = term > 0 ? addDays(v.date, term) : v.date;
    const now = due <= asOf;
    if (!now && due > end) continue;
    items.push({
      kind: "vendor",
      label: `${party?.name ?? (v.vendor || "مورّد")}${v.itemName ? ` — ${v.itemName}` : ""}`,
      amount: -v.due,
      date: now ? asOf : due,
      to: `/costs/${v.costItemId}`,
      now,
    });
  }

  /*
   * الأجور ومستحقات الورش **مستحقة دلوقتي**.
   *
   * مافيش ميعاد مكتوب لها في الدفتر — العامل بياخد أجره لما يطلبه، والورشة
   * بتتحاسب لما تسلّم. فبنحسبهم على اليوم صفر بدل ما نخترع لهم ميعاد جاي
   * ونطلّع الرصيد أحسن من الحقيقة.
   */
  for (const w of pay.workers) {
    items.push({
      kind: "worker",
      label: w.worker.name,
      amount: -w.due,
      date: asOf,
      to: `/workers/${w.worker.id}`,
      now: true,
    });
  }
  for (const w of pay.workshops) {
    items.push({
      kind: "workshop",
      label: w.name,
      amount: -w.due,
      date: asOf,
      to: `/parties/${w.partyId}`,
      now: true,
    });
  }

  /* الجدول اليومي */
  const byDate = new Map<string, CashItem[]>();
  for (const it of items) {
    const key = it.date < asOf ? asOf : it.date;
    byDate.set(key, [...(byDate.get(key) ?? []), it]);
  }

  let balance = opening;
  let lowest: { date: string; balance: number } | null = null;
  let shortfall: { date: string; balance: number } | null = null;
  const days: CashDay[] = [];
  for (let i = 0; i <= horizon; i++) {
    const date = addDays(asOf, i);
    const list = byDate.get(date) ?? [];
    const inflow = list.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0);
    const outflow = list.filter((x) => x.amount < 0).reduce((s, x) => s - x.amount, 0);
    balance += inflow - outflow;
    days.push({ date, inflow, outflow, balance, items: list });
    if (!lowest || balance < lowest.balance) lowest = { date, balance };
    if (!shortfall && balance < 0) shortfall = { date, balance };
  }

  return {
    horizon,
    opening,
    days,
    inflow: items.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0),
    outflow: items.filter((x) => x.amount < 0).reduce((s, x) => s - x.amount, 0),
    closing: balance,
    lowest,
    shortfall,
    overdueIn,
    items,
  };
}

/* ── اللي علينا: أعمار فواتير الموردين ───────────────────────── */

export type PayableRow = {
  entryId: string;
  costItemId: string;
  vendor: string;
  partyId: string | null;
  itemName: string;
  date: string;
  /** ميعاد الدفع — `null` لما المورّد مالوش مهلة دفع مكتوبة */
  dueDate: string | null;
  ageDays: number;
  lateDays: number | null;
  due: number;
};

/**
 * الفاتورة هنا بتتبوّب **بعمرها**، مش بتأخيرها.
 *
 * السبب: فاتورة المورّد مالهاش `dueDate` في الدفتر — الميعاد بيتحسب من
 * مهلة الدفع المكتوبة على المورّد نفسه، ومعظم الموردين لسه مالهمش مهلة
 * مكتوبة. فلو بوّبناها بالتأخير كان لازم نفترض مهلة، والافتراض ده بيخلّي
 * فاتورة في مهلتها تبان «متأخرة». فالعمر حقيقة، والتأخير بيظهر **بس**
 * للموردين اللي مهلتهم مكتوبة.
 */
export function payableAging(db: Db, asOf = cairoToday()) {
  const pay = payables(db);
  const rows: PayableRow[] = pay.vendor.map((v) => {
    const party = v.partyId ? partyById(db, v.partyId) : null;
    const term = party?.paymentTermDays ?? 0;
    const dueDate = term > 0 ? addDays(v.date, term) : null;
    return {
      entryId: v.id,
      costItemId: v.costItemId,
      vendor: party?.name ?? v.vendor,
      partyId: v.partyId,
      itemName: v.itemName,
      date: v.date,
      dueDate,
      ageDays: daysBetween(v.date, asOf),
      lateDays: dueDate ? daysBetween(dueDate, asOf) : null,
      due: v.due,
    };
  });

  const buckets = AGE_DEFS.map((def) => {
    const list = rows.filter((r) => agingBucketOf(r.ageDays) === def.key).sort((a, b) => b.due - a.due);
    return { ...def, rows: list, count: list.length, total: list.reduce((s, r) => s + r.due, 0) };
  });

  const late = rows.filter((r) => r.lateDays !== null && r.lateDays > 0);
  return {
    asOf,
    rows: rows.sort((a, b) => b.ageDays - a.ageDays),
    buckets,
    total: rows.reduce((s, r) => s + r.due, 0),
    withTerms: rows.filter((r) => r.dueDate).length,
    lateCount: late.length,
    lateTotal: late.reduce((s, r) => s + r.due, 0),
    workerTotal: pay.workerTotal,
    workshopTotal: pay.workshopTotal,
  };
}

/** مستحق علينا كله: موردين + عمال + ورش */
export function owedTotal(db: Db): number {
  const pay = payables(db);
  return pay.vendorTotal + pay.workerTotal + pay.workshopTotal;
}
