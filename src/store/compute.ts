import { addDays, cairoToday, qty } from "@/lib/utils";
import type { Collection, Db, Delivery, PayMethod, ReturnEntry } from "./types";

export type DeliveryRemain = Delivery & {
  remaining: number;
  allocated: number;
};

export type ReceivableRow = {
  clientId: string;
  clientName: string;
  phone: string;
  deliveryId: string;
  remaining: number;
  dueDate: string;
  model: string;
};

export type ClientStatementLine = {
  id: string;
  date: string;
  kind: "delivery" | "collection" | "credit" | "refund";
  label: string;
  debit: number;
  credit: number;
  balance: number;
};

export function confirmedCollections(db: Db): Collection[] {
  return db.collections.filter((c) => c.status === "confirmed");
}

/**
 * توريدات موديل معيّن.
 *
 * الربط بالاسم مش بالـid لأن `Delivery.model` نص مكتوب بالإيد من قبل نواة
 * التصنيع، فالتوريدات القديمة مالهاش `productId`. والقاعدة هنا هي **المرجع
 * الوحيد** للربط ده: التكلفة والمرتجعات بيقراوا منها، عشان الكمية المتسلّمة
 * تطلع نفس الرقم في الشاشتين بدل ما كل واحدة تطابق بطريقتها.
 */
export function deliveriesOfModel(db: Db, productName: string): Delivery[] {
  const name = productName.trim();
  if (!name) return [];
  return db.deliveries.filter((d) => d.model.trim() === name);
}

/* ── المرتجعات في دفاتر الفلوس ─────────────────────────────────
 *
 * الأسطر دي هي اللي بتربط المرتجع بالفلوس، وكل واحدة بتتقرا من **مكان واحد
 * بس** عشان مافيش مبلغ يتعدّ مرتين:
 *
 *   إشعار الخصم للعميل بيتعامل زي التحصيل بالظبط في حساب المديونية —
 *   بيقلّل المطلوب من العميل بدون ما فلوس تتحرك.
 *   الرد النقدي بيطلع من خزنة محددة، فبيتحسب في رصيد الخزنة.
 *   إشعار خصم المورّد بيقلّل المستحق على فاتورة الشراء.
 *
 * ومكانها هنا مش في `returns.ts` لأن `returns.ts` بيقرا من الملف ده،
 * فلو الاتنين بيقراوا من بعض كان بيبقى دوران في الاستيراد.
 */

/** المرتجع اللي بقى ليه أثر فعلي: اتسوّى، ومش مرفوض */
export function isEffective(r: ReturnEntry): boolean {
  return r.status === "settled" && r.resolution !== null && r.resolution !== "reject";
}

export type Credit = { id: string; partyId: string; date: string; amount: number; code: string };

/** إشعارات الخصم للعملاء — بتقلّل المديونية */
export function customerCredits(db: Db): Credit[] {
  return (db.returns ?? [])
    .filter((r) => r.source === "customer" && isEffective(r) && r.resolution === "credit" && r.settleAmount > 0 && r.partyId)
    .map((r) => ({ id: r.id, partyId: r.partyId as string, date: r.settledAt?.slice(0, 10) ?? r.date, amount: r.settleAmount, code: r.code }));
}

/** الردود النقدية للعملاء — فلوس طلعت من خزنة */
export function customerRefunds(db: Db): (Credit & { accountId: string })[] {
  return (db.returns ?? [])
    .filter(
      (r) => r.source === "customer" && isEffective(r) && r.resolution === "refund" && r.settleAmount > 0 && r.partyId && r.accountId,
    )
    .map((r) => ({
      id: r.id,
      partyId: r.partyId as string,
      date: r.settledAt?.slice(0, 10) ?? r.date,
      amount: r.settleAmount,
      code: r.code,
      accountId: r.accountId as string,
    }));
}

/** إشعار خصم المورّد على فاتورة شراء معيّنة */
export function entryCredit(db: Db, costEntryId: string): number {
  return (db.returns ?? [])
    .filter((r) => r.source === "supplier" && r.costEntryId === costEntryId && isEffective(r) && r.resolution !== "replacement")
    .reduce((s, r) => s + r.settleAmount, 0);
}

/**
 * الأقدم أولًا: التحصيل بيسدّد أقدم توريد لسه مفتوح.
 *
 * و`credits` إشعارات الخصم — بتتعامل زي التحصيل بالظبط: بتسدّد توريد
 * بالأقدمية وتقلّل المطلوب، والفرق الوحيد إن مافيش فلوس اتحركت. ولو
 * ماعملناها كده، العميل اللي رجّع نص الشحنة يفضل ظاهر إنه مديون بكاملها.
 */
export function fifoRemain(
  deliveries: Delivery[],
  collections: Collection[],
  credits: { id: string; partyId: string; date: string; amount: number }[] = [],
): DeliveryRemain[] {
  const sortedDel = [...deliveries].sort((a, b) =>
    a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date),
  );
  const remain = sortedDel.map((d) => ({ ...d, remaining: d.amount, allocated: 0 }));
  const cols = [
    ...collections.filter((c) => c.status === "confirmed").map((c) => ({ id: c.id, clientId: c.clientId, date: c.date, amount: c.amount })),
    ...credits.map((c) => ({ id: c.id, clientId: c.partyId, date: c.date, amount: c.amount })),
  ].sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));

  for (const col of cols) {
    let left = col.amount;
    for (const d of remain) {
      if (d.clientId !== col.clientId || d.remaining <= 0 || left <= 0) continue;
      const take = Math.min(d.remaining, left);
      d.remaining -= take;
      d.allocated += take;
      left -= take;
    }
  }
  return remain;
}

export function clientBalance(db: Db, clientId: string): number {
  const del = db.deliveries.filter((d) => d.clientId === clientId).reduce((s, d) => s + d.amount, 0);
  const col = confirmedCollections(db)
    .filter((c) => c.clientId === clientId)
    .reduce((s, c) => s + c.amount, 0);
  const credit = customerCredits(db)
    .filter((c) => c.partyId === clientId)
    .reduce((s, c) => s + c.amount, 0);
  return del - col - credit;
}

export function clientStatement(db: Db, clientId: string): ClientStatementLine[] {
  const lines: Omit<ClientStatementLine, "balance">[] = [];
  for (const d of db.deliveries.filter((x) => x.clientId === clientId)) {
    lines.push({
      id: d.id,
      date: d.date,
      kind: "delivery",
      label: d.model ? `توريد ${d.model}` : "توريد",
      debit: d.amount,
      credit: 0,
    });
  }
  for (const c of db.collections.filter((x) => x.clientId === clientId)) {
    const pending = c.status === "pending" ? " (مستني تأكيد)" : "";
    lines.push({
      id: c.id,
      date: c.date,
      kind: "collection",
      label: `تحصيل${pending}`,
      debit: 0,
      credit: c.status === "confirmed" ? c.amount : 0,
    });
  }
  /*
   * إشعار الخصم دائن زي التحصيل. والرد النقدي **مابيدخلش** كشف الحساب:
   * فلوس رجعت للعميل كاش، فمالهاش أثر على المديونية — ولو حسبناها دائن
   * كان العميل هيبان إنه دافع مرتين على نفس المرتجع.
   */
  for (const c of customerCredits(db).filter((x) => x.partyId === clientId)) {
    lines.push({ id: c.id, date: c.date, kind: "credit", label: `إشعار خصم ${c.code}`, debit: 0, credit: c.amount });
  }
  lines.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
  let bal = 0;
  return lines.map((l) => {
    bal += l.debit - l.credit;
    return { ...l, balance: bal };
  });
}

export function receivables(db: Db) {
  const today = cairoToday();
  const week = addDays(today, 7);
  const remain = fifoRemain(db.deliveries, db.collections, customerCredits(db)).filter((d) => d.remaining > 0.5);
  const rows: ReceivableRow[] = remain.map((d) => {
    const client = db.parties.find((c) => c.id === d.clientId);
    return {
      clientId: d.clientId,
      clientName: client?.name ?? "عميل محذوف",
      phone: client?.phone ?? "",
      deliveryId: d.id,
      remaining: d.remaining,
      dueDate: d.dueDate,
      model: d.model,
    };
  });

  return {
    overdue: rows.filter((r) => r.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    today: rows.filter((r) => r.dueDate === today),
    week: rows.filter((r) => r.dueDate > today && r.dueDate <= week),
    later: rows.filter((r) => r.dueDate > week),
    pending: db.collections.filter((c) => c.status === "pending"),
  };
}

export function accountBalance(db: Db, accountId: string): number {
  let bal = 0;
  for (const c of confirmedCollections(db)) if (c.accountId === accountId) bal += c.amount;
  for (const p of db.costPayments) if (p.accountId === accountId) bal -= p.amount;
  for (const p of db.workerPayments) {
    if (p.accountId === accountId && (p.kind === "pay" || p.kind === "advance")) bal -= p.amount;
  }
  for (const p of db.subPayments ?? []) if (p.accountId === accountId) bal -= p.amount;
  // الرد النقدي للعميل فلوس خرجت من الخزنة زي أي دفعة تانية
  for (const r of customerRefunds(db)) if (r.accountId === accountId) bal -= r.amount;
  for (const t of db.manualTx) if (t.accountId === accountId) bal += t.amount;
  return bal;
}

export function allAccountBalances(db: Db) {
  return db.accounts.map((a) => ({ ...a, balance: accountBalance(db, a.id) }));
}

export function costEntryPaid(db: Db, entryId: string): number {
  return db.costPayments.filter((p) => p.costEntryId === entryId).reduce((s, p) => s + p.amount, 0);
}

export function workerBalance(db: Db, workerId: string): number {
  const earned = db.workerEarnings.filter((e) => e.workerId === workerId).reduce((s, e) => s + e.amount, 0);
  const paid = db.workerPayments
    .filter((p) => p.workerId === workerId && p.kind === "pay")
    .reduce((s, p) => s + p.amount, 0);
  const adv = db.workerPayments
    .filter((p) => p.workerId === workerId && p.kind === "advance")
    .reduce((s, p) => s + p.amount, 0);
  const ded = db.workerPayments
    .filter((p) => p.workerId === workerId && p.kind === "deduction")
    .reduce((s, p) => s + p.amount, 0);
  return earned - paid - adv - ded;
}

export function workerAdvance(db: Db, workerId: string): number {
  const adv = db.workerPayments
    .filter((p) => p.workerId === workerId && p.kind === "advance")
    .reduce((s, p) => s + p.amount, 0);
  const recovered = db.workerPayments
    .filter((p) => p.workerId === workerId && p.kind === "deduction")
    .reduce((s, p) => s + p.amount, 0);
  return Math.max(0, adv - recovered);
}

export function pnl(db: Db, from: string, to: string) {
  const inRange = (d: string) => d >= from && d <= to;
  /*
   * المرتجع بيقلّل الإيراد مش بيزوّد المصروف.
   *
   * الخصم والرد النقدي الاتنين بيرجعوا فلوس بيع اتسجّلت إيراد قبل كده، فلو
   * حسبناهم مصروف كان الإيراد والمصروف الاتنين بيتضخّموا بنفس المبلغ —
   * الصافي صح، بس هامش الربح يطلع غلط. والمصاريف الحقيقية (الشحن والإصلاح)
   * هي اللي بتتحسب مصروف، لأنها فلوس اتدفعت فعلًا.
   */
  const returnRows = (db.returns ?? []).filter((r) => isEffective(r) && r.source === "customer");
  const returnCredits = returnRows
    .filter((r) => inRange(r.settledAt?.slice(0, 10) ?? r.date))
    .reduce((s, r) => s + r.settleAmount, 0);
  const returnCosts = (db.returns ?? [])
    .filter((r) => r.status !== "cancelled" && inRange(r.date))
    .reduce((s, r) => s + r.extraCost, 0);
  const revenue = db.deliveries.filter((d) => inRange(d.date)).reduce((s, d) => s + d.amount, 0) - returnCredits;
  const costs = db.costEntries.filter((d) => inRange(d.date)).reduce((s, d) => s + d.amount, 0);
  const labor = db.workerEarnings.filter((d) => inRange(d.date)).reduce((s, d) => s + d.amount, 0);
  const otherOut = db.manualTx.filter((d) => inRange(d.date) && d.amount < 0).reduce((s, d) => s + Math.abs(d.amount), 0);
  const otherIn = db.manualTx.filter((d) => inRange(d.date) && d.amount > 0).reduce((s, d) => s + d.amount, 0);
  // تشغيل الورش الخارجية: بيتحسب من **الاستلامات** لأن المستحق بينشأ لما
  // الشغل يرجع، مش لما الكمية تطلع. ومابيدخلش في `labor` عشان `labor`
  // معناها أجور عمال المصنع (دفتر مكاسب العمال) ومايختلطش بحساب الورشة.
  const outsourcing = subcontractCharges(db).filter((c) => inRange(c.date)).reduce((s, c) => s + c.amount, 0);
  const expenses = costs + labor + outsourcing + otherOut + returnCosts;
  return {
    revenue: revenue + otherIn,
    costs,
    labor,
    outsourcing,
    otherOut,
    otherIn,
    returnCredits,
    returnCosts,
    expenses,
    net: revenue + otherIn - expenses,
  };
}

/** مستحقات الورش: كل استلام × أجر القطعة المتفق عليه في إذن التشغيل */
export function subcontractCharges(db: Db): { date: string; partyId: string; subcontractId: string; amount: number }[] {
  return (db.subReceipts ?? []).flatMap((r) => {
    const sub = (db.subcontracts ?? []).find((s) => s.id === r.subcontractId);
    if (!sub || sub.status === "cancelled") return [];
    return [{ date: r.date, partyId: sub.partyId, subcontractId: sub.id, amount: (r.qtyGood + r.qtyRework) * sub.rate }];
  });
}

/** رصيد الورشة = مستحقاتها − المدفوع لها */
export function workshopBalance(db: Db, partyId: string): number {
  const due = subcontractCharges(db)
    .filter((c) => c.partyId === partyId)
    .reduce((s, c) => s + c.amount, 0);
  const paid = (db.subPayments ?? []).filter((p) => p.partyId === partyId).reduce((s, p) => s + p.amount, 0);
  return due - paid;
}

export function payables(db: Db) {
  const vendor = db.costEntries
    .map((e) => ({
      ...e,
      paid: costEntryPaid(db, e.id),
      // إشعار خصم المورّد بيقلّل المستحق زي الدفع، بس مش دفع — فمنفصل عنه
      credit: entryCredit(db, e.id),
      due: e.amount - costEntryPaid(db, e.id) - entryCredit(db, e.id),
      itemName: db.costItems.find((i) => i.id === e.costItemId)?.name ?? "",
    }))
    .filter((e) => e.due > 0.5);
  const workers = db.workers
    .map((w) => ({ worker: w, due: workerBalance(db, w.id) }))
    .filter((w) => w.due > 0.5);
  const workshops = [...new Set(subcontractCharges(db).map((c) => c.partyId))]
    .map((partyId) => ({
      partyId,
      name: db.parties.find((p) => p.id === partyId)?.name ?? "ورشة",
      due: workshopBalance(db, partyId),
    }))
    .filter((w) => w.due > 0.5);
  return {
    vendor,
    workers,
    workshops,
    vendorTotal: vendor.reduce((s, v) => s + v.due, 0),
    workerTotal: workers.reduce((s, w) => s + w.due, 0),
    workshopTotal: workshops.reduce((s, w) => s + w.due, 0),
  };
}

export function methodNeedsReceipt(method: PayMethod): boolean {
  return method === "bank" || method === "instapay" || method === "wallet";
}

export function whatsappReminder(opts: {
  name: string;
  amount: number;
  dueDate: string;
  factoryName: string;
  phone: string;
}): string {
  const text = encodeURIComponent(
    `السلام عليكم أستاذ ${opts.name}\nتذكير بمبلغ مستحق قدره ${qty(opts.amount, 0)} جنيه.\nتاريخ الاستحقاق: ${opts.dueDate}\n${opts.factoryName}`,
  );
  const digits = opts.phone.replace(/\D/g, "");
  const phone = digits.startsWith("0") ? `2${digits}` : digits;
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}
