import { addDays, cairoToday, qty } from "@/lib/utils";
import type { Collection, Db, Delivery, PayMethod } from "./types";

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
  kind: "delivery" | "collection";
  label: string;
  debit: number;
  credit: number;
  balance: number;
};

export function confirmedCollections(db: Db): Collection[] {
  return db.collections.filter((c) => c.status === "confirmed");
}

export function fifoRemain(deliveries: Delivery[], collections: Collection[]): DeliveryRemain[] {
  const sortedDel = [...deliveries].sort((a, b) =>
    a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date),
  );
  const remain = sortedDel.map((d) => ({ ...d, remaining: d.amount, allocated: 0 }));
  const cols = [...collections]
    .filter((c) => c.status === "confirmed")
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));

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
  return del - col;
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
  const remain = fifoRemain(db.deliveries, db.collections).filter((d) => d.remaining > 0.5);
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
  const revenue = db.deliveries.filter((d) => inRange(d.date)).reduce((s, d) => s + d.amount, 0);
  const costs = db.costEntries.filter((d) => inRange(d.date)).reduce((s, d) => s + d.amount, 0);
  const labor = db.workerEarnings.filter((d) => inRange(d.date)).reduce((s, d) => s + d.amount, 0);
  const otherOut = db.manualTx.filter((d) => inRange(d.date) && d.amount < 0).reduce((s, d) => s + Math.abs(d.amount), 0);
  const otherIn = db.manualTx.filter((d) => inRange(d.date) && d.amount > 0).reduce((s, d) => s + d.amount, 0);
  const expenses = costs + labor + otherOut;
  return {
    revenue: revenue + otherIn,
    costs,
    labor,
    otherOut,
    otherIn,
    expenses,
    net: revenue + otherIn - expenses,
  };
}

export function payables(db: Db) {
  const vendor = db.costEntries
    .map((e) => ({
      ...e,
      paid: costEntryPaid(db, e.id),
      due: e.amount - costEntryPaid(db, e.id),
      itemName: db.costItems.find((i) => i.id === e.costItemId)?.name ?? "",
    }))
    .filter((e) => e.due > 0.5);
  const workers = db.workers
    .map((w) => ({ worker: w, due: workerBalance(db, w.id) }))
    .filter((w) => w.due > 0.5);
  return { vendor, workers, vendorTotal: vendor.reduce((s, v) => s + v.due, 0), workerTotal: workers.reduce((s, w) => s + w.due, 0) };
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
