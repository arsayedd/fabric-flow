import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { cairoToday, nid } from "@/lib/utils";
import {
  accountBalance,
  allAccountBalances,
  clientBalance,
  clientStatement,
  costEntryPaid,
  payables,
  pnl,
  receivables,
  workerAdvance,
  workerBalance,
} from "./compute";
import { demoDb, emptyDb } from "./seed";
import type {
  Account,
  AuditEntry,
  BackupFile,
  Client,
  Collection,
  CostEntry,
  CostItem,
  CostPayment,
  Db,
  Delivery,
  Invite,
  ManualTx,
  Member,
  Order,
  PayMethod,
  Role,
  Session,
  Worker,
  WorkerEarning,
  WorkerPayType,
  WorkerPayment,
} from "./types";

const KEY = "factory-ledger.v1";
const SESSION_KEY = "factory-ledger.session";

function loadDb(): Db | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Db;
  } catch {
    return null;
  }
}

function saveDb(db: Db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

type Patch = Partial<Db> | ((prev: Db) => Partial<Db>);

type AddCollectionInput = {
  clientId: string;
  date: string;
  amount: number;
  method: PayMethod;
  accountId: string;
  receiptImage: string | null;
  chequeDate: string | null;
  notes: string;
};

type FactoryApi = {
  db: Db;
  session: Session | null;
  login: (member: Member) => void;
  logout: () => void;
  startDemo: (role: Role) => void;
  createFactory: (name: string) => void;
  importBackup: (file: BackupFile) => void;
  exportBackup: () => BackupFile;
  resetDemo: () => void;
  can: {
    finance: boolean;
    edit: boolean;
    delete: boolean;
    staff: boolean;
    audit: boolean;
  };
  addClient: (input: { name: string; phone: string; notes: string }) => void;
  updateClient: (id: string, patch: Partial<Client>) => void;
  deleteClient: (id: string) => void;
  addDelivery: (input: Omit<Delivery, "id" | "factoryId">) => void;
  deleteDelivery: (id: string) => void;
  addCollection: (input: AddCollectionInput) => void;
  confirmCollection: (id: string) => void;
  deleteCollection: (id: string) => void;
  addCostItem: (name: string, unit: string) => void;
  addCostEntry: (input: Omit<CostEntry, "id" | "factoryId">) => void;
  addCostPayment: (input: Omit<CostPayment, "id" | "factoryId">) => void;
  deleteCostEntry: (id: string) => void;
  addWorker: (input: { name: string; payType: WorkerPayType; rate: number; phone: string }) => void;
  updateWorker: (id: string, patch: Partial<Worker>) => void;
  deleteWorker: (id: string) => void;
  markAttendance: (workerIds: string[], date: string) => void;
  addPieceWork: (workerId: string, date: string, pieces: number, notes: string) => void;
  addWorkerPayment: (input: Omit<WorkerPayment, "id" | "factoryId">) => void;
  addOrder: (input: Omit<Order, "id" | "factoryId" | "code">) => void;
  updateOrder: (id: string, patch: Partial<Order>) => void;
  deleteOrder: (id: string) => void;
  addManualTx: (input: Omit<ManualTx, "id" | "factoryId">) => void;
  addAccount: (name: string, kind: Account["kind"]) => void;
  invite: (email: string, role: Role) => void;
  acceptInvite: (id: string, name: string) => void;
  changeRole: (memberId: string, role: Role) => void;
  removeMember: (memberId: string) => void;
  computed: ReturnType<typeof buildComputed>;
};

const Ctx = createContext<FactoryApi | null>(null);

function fid(db: Db): string {
  return db.factory?.id ?? "";
}

/** ترقيم أوامر الإنتاج: SN-1001 وطالع، ومفيش رقم يتكرر */
function nextOrderCode(orders: Order[]): string {
  const last = orders.reduce((max, o) => {
    const n = Number(o.code?.replace(/\D/g, ""));
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 1000);
  return `SN-${last + 1}`;
}

function audit(
  db: Db,
  session: Session | null,
  action: AuditEntry["action"],
  table: string,
  recordId: string,
  before: unknown,
  after: unknown,
): AuditEntry {
  return {
    id: nid(),
    factoryId: fid(db),
    actorId: session?.memberId ?? "system",
    actorName: session?.name ?? "النظام",
    action,
    table,
    recordId,
    before,
    after,
    at: new Date().toISOString(),
  };
}

function buildComputed(db: Db) {
  const rec = receivables(db);
  const accounts = allAccountBalances(db);
  const owe = payables(db);
  const today = cairoToday();
  const monthStart = today.slice(0, 7) + "-01";
  return {
    rec,
    accounts,
    treasuryTotal: accounts.reduce((s, a) => s + a.balance, 0),
    clients: db.clients.map((c) => ({ ...c, balance: clientBalance(db, c.id), statement: clientStatement(db, c.id) })),
    workers: db.workers.map((w) => ({ ...w, balance: workerBalance(db, w.id), advance: workerAdvance(db, w.id) })),
    costItems: db.costItems.map((item) => {
      const entries = db.costEntries.filter((e) => e.costItemId === item.id);
      const amount = entries.reduce((s, e) => s + e.amount, 0);
      const paid = entries.reduce((s, e) => s + costEntryPaid(db, e.id), 0);
      return { ...item, entries, amount, paid, due: amount - paid };
    }),
    orders: db.orders.map((o) => ({
      ...o,
      profitEach: o.piecePrice - o.pieceCost,
      profitTotal: (o.piecePrice - o.pieceCost) * o.quantity,
      margin: o.piecePrice ? ((o.piecePrice - o.pieceCost) / o.piecePrice) * 100 : 0,
    })),
    owe,
    monthPnl: pnl(db, monthStart, today),
    attendanceToday: db.workerEarnings.filter((e) => e.date === today && e.kind === "attendance").map((e) => e.workerId),
  };
}

export function FactoryProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Db>(() => loadDb() ?? { ...emptyShell() });
  const [session, setSession] = useState<Session | null>(() => loadSession());

  useEffect(() => {
    if (db.factory) saveDb(db);
  }, [db]);

  useEffect(() => {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }, [session]);

  const mutate = (patch: Patch, entry?: Omit<AuditEntry, "id" | "factoryId" | "actorId" | "actorName" | "at">) => {
    setDb((prev) => {
      const nextPartial = typeof patch === "function" ? patch(prev) : patch;
      const next: Db = { ...prev, ...nextPartial };
      if (entry) {
        next.auditLog = [audit(prev, session, entry.action, entry.table, entry.recordId, entry.before, entry.after), ...prev.auditLog].slice(0, 400);
      }
      return next;
    });
  };

  const login = (member: Member) => {
    setSession({ memberId: member.id, email: member.email, name: member.name, role: member.role });
  };

  const api = useMemo<FactoryApi>(() => {
    const role = session?.role;
    const can = {
      finance: role === "owner" || role === "accountant",
      edit: role === "owner" || role === "accountant",
      delete: role === "owner",
      staff: role === "owner",
      audit: role === "owner",
    };

    return {
      db,
      session,
      can,
      computed: buildComputed(db),
      login,
      logout: () => setSession(null),
      startDemo: (r) => {
        const seeded = demoDb();
        setDb(seeded);
        const member = seeded.members.find((m) => m.role === r) ?? seeded.members[0];
        login(member);
      },
      createFactory: (name) => {
        const created = emptyDb(name.trim() || "مصنعي");
        setDb(created);
        login(created.members[0]);
      },
      importBackup: (file) => {
        if (file.kind !== "factory-backup" || file.version !== 1 || !file.data?.factory) {
          throw new Error("ملف النسخة الاحتياطية مش مفهوم.");
        }
        setDb(file.data);
        const owner = file.data.members.find((m) => m.role === "owner") ?? file.data.members[0];
        if (owner) login(owner);
      },
      exportBackup: () => ({
        version: 1,
        kind: "factory-backup",
        factoryName: db.factory?.name ?? "مصنع",
        exportedAt: new Date().toISOString(),
        data: db,
      }),
      resetDemo: () => {
        const seeded = demoDb();
        setDb(seeded);
        const member = seeded.members.find((m) => m.id === session?.memberId) ?? seeded.members[0];
        login(member);
      },
      addClient: (input) => {
        if (!input.name.trim()) throw new Error("اسم العميل مطلوب.");
        const row: Client = { id: nid(), factoryId: fid(db), name: input.name.trim(), phone: input.phone.trim(), notes: input.notes.trim() };
        mutate({ clients: [row, ...db.clients] }, { action: "create", table: "clients", recordId: row.id, before: null, after: row });
      },
      updateClient: (id, patch) => {
        const before = db.clients.find((c) => c.id === id);
        mutate(
          { clients: db.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)) },
          { action: "update", table: "clients", recordId: id, before, after: patch },
        );
      },
      deleteClient: (id) => {
        if (!can.delete) throw new Error("صاحب المصنع بس اللي يمسح.");
        const before = db.clients.find((c) => c.id === id);
        mutate(
          {
            clients: db.clients.filter((c) => c.id !== id),
            deliveries: db.deliveries.filter((d) => d.clientId !== id),
            collections: db.collections.filter((c) => c.clientId !== id),
          },
          { action: "delete", table: "clients", recordId: id, before, after: null },
        );
      },
      addDelivery: (input) => {
        if (!input.amount || input.amount <= 0) throw new Error("مينفعش توريد بمبلغ صفر.");
        const row: Delivery = { ...input, id: nid(), factoryId: fid(db) };
        mutate({ deliveries: [row, ...db.deliveries] }, { action: "create", table: "deliveries", recordId: row.id, before: null, after: row });
      },
      deleteDelivery: (id) => {
        if (!can.delete) throw new Error("صاحب المصنع بس اللي يمسح.");
        const before = db.deliveries.find((d) => d.id === id);
        mutate({ deliveries: db.deliveries.filter((d) => d.id !== id) }, { action: "delete", table: "deliveries", recordId: id, before, after: null });
      },
      addCollection: (input) => {
        if (!input.amount || input.amount <= 0) throw new Error("مبلغ التحصيل لازم أكبر من صفر.");
        const needs = input.method === "bank" || input.method === "instapay" || input.method === "wallet";
        if (needs && !input.receiptImage) throw new Error("صورة التحويل إجبارية في التحويلات.");
        const pending = needs;
        const row: Collection = {
          id: nid(),
          factoryId: fid(db),
          clientId: input.clientId,
          date: input.date,
          amount: input.amount,
          method: input.method,
          accountId: input.accountId,
          receiptImage: input.receiptImage,
          status: pending ? "pending" : "confirmed",
          chequeDate: input.chequeDate,
          notes: input.notes,
        };
        mutate({ collections: [row, ...db.collections] }, { action: "create", table: "collections", recordId: row.id, before: null, after: row });
      },
      confirmCollection: (id) => {
        const before = db.collections.find((c) => c.id === id);
        mutate(
          { collections: db.collections.map((c) => (c.id === id ? { ...c, status: "confirmed" as const } : c)) },
          { action: "update", table: "collections", recordId: id, before, after: { status: "confirmed" } },
        );
      },
      deleteCollection: (id) => {
        if (!can.delete) throw new Error("صاحب المصنع بس اللي يمسح.");
        const before = db.collections.find((c) => c.id === id);
        mutate({ collections: db.collections.filter((c) => c.id !== id) }, { action: "delete", table: "collections", recordId: id, before, after: null });
      },
      addCostItem: (name, unit) => {
        const row: CostItem = { id: nid(), factoryId: fid(db), name: name.trim(), unit: unit.trim() || "بند" };
        mutate({ costItems: [...db.costItems, row] }, { action: "create", table: "cost_items", recordId: row.id, before: null, after: row });
      },
      addCostEntry: (input) => {
        if (!input.amount || input.amount <= 0) throw new Error("المبلغ لازم أكبر من صفر.");
        const row: CostEntry = { ...input, id: nid(), factoryId: fid(db) };
        mutate({ costEntries: [row, ...db.costEntries] }, { action: "create", table: "cost_entries", recordId: row.id, before: null, after: row });
      },
      addCostPayment: (input) => {
        if (!input.amount || input.amount <= 0) throw new Error("دفعة بمبلغ صفر مش مقبولة.");
        const row: CostPayment = { ...input, id: nid(), factoryId: fid(db) };
        mutate({ costPayments: [row, ...db.costPayments] }, { action: "create", table: "cost_payments", recordId: row.id, before: null, after: row });
      },
      deleteCostEntry: (id) => {
        if (!can.delete) throw new Error("صاحب المصنع بس اللي يمسح.");
        const before = db.costEntries.find((e) => e.id === id);
        mutate(
          {
            costEntries: db.costEntries.filter((e) => e.id !== id),
            costPayments: db.costPayments.filter((p) => p.costEntryId !== id),
          },
          { action: "delete", table: "cost_entries", recordId: id, before, after: null },
        );
      },
      addWorker: (input) => {
        const row: Worker = { id: nid(), factoryId: fid(db), name: input.name.trim(), payType: input.payType, rate: input.rate, phone: input.phone.trim() };
        mutate({ workers: [row, ...db.workers] }, { action: "create", table: "workers", recordId: row.id, before: null, after: row });
      },
      updateWorker: (id, patch) => {
        const before = db.workers.find((w) => w.id === id);
        mutate({ workers: db.workers.map((w) => (w.id === id ? { ...w, ...patch } : w)) }, { action: "update", table: "workers", recordId: id, before, after: patch });
      },
      deleteWorker: (id) => {
        if (!can.delete) throw new Error("صاحب المصنع بس اللي يمسح.");
        const before = db.workers.find((w) => w.id === id);
        mutate({ workers: db.workers.filter((w) => w.id !== id) }, { action: "delete", table: "workers", recordId: id, before, after: null });
      },
      markAttendance: (workerIds, date) => {
        const existing = new Set(db.workerEarnings.filter((e) => e.date === date && e.kind === "attendance").map((e) => e.workerId));
        const added: WorkerEarning[] = [];
        for (const id of workerIds) {
          if (existing.has(id)) continue;
          const w = db.workers.find((x) => x.id === id);
          if (!w) continue;
          const amount = w.payType === "daily" ? w.rate : w.payType === "monthly" ? 0 : 0;
          if (w.payType !== "daily") {
            added.push({ id: nid(), factoryId: fid(db), workerId: id, date, kind: "attendance", amount: 0, notes: "حضور" });
          } else {
            added.push({ id: nid(), factoryId: fid(db), workerId: id, date, kind: "attendance", amount, notes: "حضور" });
          }
        }
        if (!added.length) return;
        mutate({ workerEarnings: [...added, ...db.workerEarnings] }, { action: "create", table: "worker_earnings", recordId: added[0].id, before: null, after: { date, count: added.length } });
      },
      addPieceWork: (workerId, date, pieces, notes) => {
        const w = db.workers.find((x) => x.id === workerId);
        if (!w) throw new Error("العامل مش موجود.");
        const row: WorkerEarning = {
          id: nid(),
          factoryId: fid(db),
          workerId,
          date,
          kind: "piece",
          amount: w.rate * pieces,
          notes: notes || `${pieces} قطعة`,
        };
        mutate({ workerEarnings: [row, ...db.workerEarnings] }, { action: "create", table: "worker_earnings", recordId: row.id, before: null, after: row });
      },
      addWorkerPayment: (input) => {
        if (!input.amount || input.amount <= 0) throw new Error("المبلغ لازم أكبر من صفر.");
        const row: WorkerPayment = { ...input, id: nid(), factoryId: fid(db) };
        mutate({ workerPayments: [row, ...db.workerPayments] }, { action: "create", table: "worker_payments", recordId: row.id, before: null, after: row });
      },
      addOrder: (input) => {
        const row: Order = { ...input, id: nid(), factoryId: fid(db), code: nextOrderCode(db.orders) };
        mutate({ orders: [row, ...db.orders] }, { action: "create", table: "orders", recordId: row.id, before: null, after: row });
      },
      updateOrder: (id, patch) => {
        const before = db.orders.find((o) => o.id === id);
        mutate({ orders: db.orders.map((o) => (o.id === id ? { ...o, ...patch } : o)) }, { action: "update", table: "orders", recordId: id, before, after: patch });
      },
      deleteOrder: (id) => {
        if (!can.delete) throw new Error("صاحب المصنع بس اللي يمسح.");
        const before = db.orders.find((o) => o.id === id);
        mutate({ orders: db.orders.filter((o) => o.id !== id) }, { action: "delete", table: "orders", recordId: id, before, after: null });
      },
      addManualTx: (input) => {
        const row: ManualTx = { ...input, id: nid(), factoryId: fid(db) };
        mutate({ manualTx: [row, ...db.manualTx] }, { action: "create", table: "manual_tx", recordId: row.id, before: null, after: row });
      },
      addAccount: (name, kind) => {
        const row: Account = { id: nid(), factoryId: fid(db), name: name.trim(), kind };
        mutate({ accounts: [...db.accounts, row] }, { action: "create", table: "accounts", recordId: row.id, before: null, after: row });
      },
      invite: (email, role) => {
        if (!can.staff) throw new Error("صاحب المصنع بس اللي يضيف موظفين.");
        const row: Invite = { id: nid(), factoryId: fid(db), email: email.trim().toLowerCase(), role, createdAt: new Date().toISOString(), status: "pending" };
        mutate({ invites: [row, ...db.invites] }, { action: "create", table: "invites", recordId: row.id, before: null, after: row });
      },
      acceptInvite: (id, name) => {
        const inv = db.invites.find((i) => i.id === id);
        if (!inv) return;
        const member: Member = { id: nid(), factoryId: fid(db), email: inv.email, name: name.trim() || inv.email, role: inv.role };
        mutate(
          {
            invites: db.invites.map((i) => (i.id === id ? { ...i, status: "accepted" as const } : i)),
            members: [member, ...db.members],
          },
          { action: "update", table: "invites", recordId: id, before: inv, after: { status: "accepted" } },
        );
      },
      changeRole: (memberId, role) => {
        if (!can.staff) throw new Error("صاحب المصنع بس.");
        const before = db.members.find((m) => m.id === memberId);
        mutate({ members: db.members.map((m) => (m.id === memberId ? { ...m, role } : m)) }, { action: "update", table: "members", recordId: memberId, before, after: { role } });
      },
      removeMember: (memberId) => {
        if (!can.staff) throw new Error("صاحب المصنع بس.");
        const before = db.members.find((m) => m.id === memberId);
        if (before?.role === "owner") throw new Error("مينفعش تشيل صاحب المصنع.");
        mutate({ members: db.members.filter((m) => m.id !== memberId) }, { action: "delete", table: "members", recordId: memberId, before, after: null });
      },
    };
  }, [db, session]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

function emptyShell(): Db {
  return {
    factory: null,
    members: [],
    invites: [],
    accounts: [],
    costItems: [],
    costEntries: [],
    costPayments: [],
    clients: [],
    deliveries: [],
    collections: [],
    workers: [],
    workerEarnings: [],
    workerPayments: [],
    orders: [],
    manualTx: [],
    auditLog: [],
  };
}

export function useFactory() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFactory outside provider");
  return ctx;
}

export function useAccountBalance(accountId: string) {
  const { db } = useFactory();
  return accountBalance(db, accountId);
}
