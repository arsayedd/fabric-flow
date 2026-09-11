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
import type { ScoreWeights } from "./intelligence";
import type { CapacitySettings } from "./planning";
import { partyAlerts, portfolio } from "./parties";
import {
  activeBom,
  bomLines,
  computedProgress,
  materialStock,
  orderRequirements,
  orderStages,
  stockQty,
} from "./manufacturing";
import { demoDb, emptyDb, templateData } from "./seed";
import { PRODUCTION_LINES } from "./types";
import type {
  Account,
  AuditEntry,
  Bom,
  BomItem,
  Industry,
  Material,
  Operation,
  Product,
  RoutingStep,
  StageEntry,
  StockMovement,
  BackupFile,
  Communication,
  Party,
  PartyAddress,
  PartyContact,
  PartyTask,
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
  OrderStatus,
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
    return migrate(JSON.parse(raw) as Db);
  } catch {
    return null;
  }
}

/**
 * ترحيل الدفاتر المحفوظة قبل نواة التصنيع — إضافي بالكامل:
 * يكمّل الحقول الناقصة ولا يمسح ولا يغيّر أي بيانات موجودة.
 */
function migrate(db: Db): Db {
  let seq = 1040;
  const factoryId = db.factory?.id ?? "";
  const industry = db.settings?.industry ?? "apparel";
  const seeded = db.operations?.length ? null : templateData(factoryId, industry, () => nid());
  return {
    ...db,
    ...migrateParties(db),
    settings: db.settings ?? { industry, overheadPerUnit: 0 },
    units: db.units ?? seeded?.units ?? [],
    categories: db.categories ?? seeded?.categories ?? [],
    warehouses: db.warehouses ?? seeded?.warehouses ?? [],
    materials: db.materials ?? seeded?.materials ?? [],
    products: db.products ?? [],
    boms: db.boms ?? [],
    bomItems: db.bomItems ?? [],
    operations: db.operations ?? seeded?.operations ?? [],
    routingSteps: db.routingSteps ?? [],
    stockMovements: db.stockMovements ?? [],
    stageEntries: db.stageEntries ?? [],
    orders: (db.orders ?? []).map((o) => {
      const status: OrderStatus = (o.status as OrderStatus | "open") === "open" ? "running" : o.status;
      return {
        ...o,
        status,
        code: o.code ?? `SN-${++seq}`,
        line: o.line ?? PRODUCTION_LINES[0],
        productId: o.productId ?? null,
        bomId: o.bomId ?? null,
        materialsIssuedAt: o.materialsIssuedAt ?? null,
        progress: typeof o.progress === "number" ? o.progress : status === "done" ? 100 : 0,
      };
    }),
  };
}

/**
 * ترحيل العملاء القدام لجهات تعامل — **بنفس الـid**،
 * فكل التوريدات والتحصيلات والأوامر تفضل مربوطة من غير أي تحويل.
 * والموردين بيتولدوا من أسماء الموردين المكتوبة في بنود التكلفة.
 */
function migrateParties(db: Db): Partial<Db> {
  if (db.parties) {
    return {
      contacts: db.contacts ?? [],
      addresses: db.addresses ?? [],
      communications: db.communications ?? [],
      tasks: db.tasks ?? [],
    };
  }
  const legacy = (db as unknown as { clients?: { id: string; factoryId: string; name: string; phone: string; notes: string }[] }).clients ?? [];
  const parties: Party[] = legacy.map((c) => ({
    ...blankParty(c.factoryId, c.name),
    id: c.id,
    phone: c.phone,
    notes: c.notes,
    roles: ["customer"],
  }));

  const costEntries = [...(db.costEntries ?? [])];
  for (const entry of costEntries) {
    const vendor = entry.vendor?.trim();
    if (!vendor) continue;
    let party = parties.find((p) => p.name === vendor);
    if (!party) {
      party = { ...blankParty(entry.factoryId, vendor), roles: ["supplier"] };
      parties.push(party);
    } else if (!party.roles.includes("supplier")) {
      party.roles = [...party.roles, "supplier"];
    }
    entry.partyId = party.id;
  }

  return { parties, costEntries, contacts: [], addresses: [], communications: [], tasks: [] };
}

export function blankParty(factoryId: string, name: string): Party {
  return {
    id: nid(),
    factoryId,
    kind: "company",
    name,
    tradeName: "",
    legalName: "",
    code: "",
    taxId: "",
    commercialReg: "",
    industry: "",
    website: "",
    email: "",
    phone: "",
    whatsapp: "",
    address: "",
    governorate: "",
    city: "",
    area: "",
    notes: "",
    internalNotes: "",
    tags: [],
    roles: ["customer"],
    creditLimit: 0,
    paymentTermDays: 0,
    salesRepId: null,
    mergedIntoId: null,
    createdAt: new Date().toISOString(),
  };
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
  createFactory: (name: string, industry: Industry) => void;
  setOverhead: (value: number) => void;
  setScoreWeights: (weights: ScoreWeights) => void;
  setCapacity: (capacity: CapacitySettings) => void;
  setTargetMargin: (value: number) => void;
  addMaterial: (input: Omit<Material, "id" | "factoryId">) => void;
  updateMaterial: (id: string, patch: Partial<Material>) => void;
  addProduct: (input: Omit<Product, "id" | "factoryId">) => void;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  addBomItem: (productId: string, input: { materialId: string; qtyPerUnit: number; wastePct: number }) => void;
  removeBomItem: (id: string) => void;
  addRoutingStep: (productId: string, operationId: string, rate: number, stdMinutes: number) => void;
  removeRoutingStep: (id: string) => void;
  addOperation: (name: string, rate: number, minutes: number, outsourced: boolean) => void;
  addStockMovement: (input: Omit<StockMovement, "id" | "factoryId">) => void;
  issueOrderMaterials: (orderId: string) => void;
  addStageEntry: (input: Omit<StageEntry, "id" | "factoryId">) => void;
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
  addParty: (input: Partial<Party> & { name: string }) => string;
  updateParty: (id: string, patch: Partial<Party>) => void;
  deleteParty: (id: string) => void;
  mergeParties: (duplicateId: string, keepId: string) => void;
  addContact: (input: Omit<PartyContact, "id" | "factoryId">) => void;
  removeContact: (id: string) => void;
  addAddress: (input: Omit<PartyAddress, "id" | "factoryId">) => void;
  removeAddress: (id: string) => void;
  addCommunication: (input: Omit<Communication, "id" | "factoryId" | "actorName">) => void;
  addTask: (input: { partyId: string | null; title: string; dueDate: string; assigneeName: string }) => void;
  toggleTask: (id: string) => void;
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
    parties: db.parties
      .filter((p) => !p.mergedIntoId)
      .map((p) => ({ ...p, balance: clientBalance(db, p.id), statement: clientStatement(db, p.id) })),
    alerts: partyAlerts(db),
    portfolio: portfolio(db),
    openTasks: db.tasks.filter((t) => t.status === "open").sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
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
    stock: materialStock(db),
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
      createFactory: (name, industry) => {
        const created = emptyDb(name.trim() || "مصنعي", industry);
        setDb(created);
        login(created.members[0]);
      },
      setOverhead: (value) => {
        if (!can.finance) throw new Error("الحسابات للمالك والمحاسب بس.");
        mutate(
          { settings: { ...db.settings, overheadPerUnit: Math.max(0, value) } },
          { action: "update", table: "settings", recordId: "overhead", before: db.settings, after: { overheadPerUnit: value } },
        );
      },
      /** أوزان السكور: صاحب المصنع بس، وبتتسجل في سجل التعديلات */
      setScoreWeights: (weights) => {
        if (!can.staff) throw new Error("أوزان السكور لصاحب المصنع بس.");
        const total = Object.values(weights).reduce((s, v) => s + v, 0);
        if (total <= 0) throw new Error("مجموع الأوزان لازم يكون أكبر من صفر.");
        mutate(
          { settings: { ...db.settings, scoreWeights: weights } },
          { action: "update", table: "settings", recordId: "score_weights", before: db.settings?.scoreWeights ?? null, after: weights },
        );
      },
      /** هامش الهدف: قرار مالي، بيحدّد تكلفة الهدف وأقل سعر مقبول لكل موديل */
      setTargetMargin: (value) => {
        if (!can.finance) throw new Error("هامش الهدف للمالك والمحاسب بس.");
        if (!(value > 0 && value < 100)) throw new Error("هامش الهدف لازم يكون بين ١ و٩٩٪.");
        mutate(
          { settings: { ...db.settings, targetMarginPct: value } },
          { action: "update", table: "settings", recordId: "target_margin", before: db.settings?.targetMarginPct ?? null, after: value },
        );
      },
      /** قرار الطاقة: بيغيّر جدول المصنع كله، فمحتاج صلاحية تعديل وبيتسجل */
      setCapacity: (capacity) => {
        if (!can.edit) throw new Error("إعداد الطاقة للمالك والمحاسب بس.");
        if (!(capacity.hoursPerDay > 0)) throw new Error("ساعات العمل لازم تكون أكبر من صفر.");
        if (!(capacity.daysPerWeek >= 1 && capacity.daysPerWeek <= 7)) throw new Error("أيام العمل من ١ لـ٧.");
        if (!(capacity.utilizationPct > 0 && capacity.utilizationPct <= 100)) {
          throw new Error("نسبة الاستغلال من ١ لـ١٠٠٪.");
        }
        if (capacity.crewSize !== null && !(capacity.crewSize > 0)) {
          throw new Error("عدد العمالة لازم يكون أكبر من صفر، أو سيبه على عدد العمال المسجّلين.");
        }
        mutate(
          { settings: { ...db.settings, capacity } },
          { action: "update", table: "settings", recordId: "capacity", before: db.settings?.capacity ?? null, after: capacity },
        );
      },
      addMaterial: (input) => {
        if (!input.name.trim()) throw new Error("اسم الخامة مطلوب.");
        const row: Material = { ...input, id: nid(), factoryId: fid(db), name: input.name.trim() };
        mutate({ materials: [row, ...db.materials] }, { action: "create", table: "materials", recordId: row.id, before: null, after: row });
      },
      updateMaterial: (id, patch) => {
        const before = db.materials.find((m) => m.id === id);
        mutate({ materials: db.materials.map((m) => (m.id === id ? { ...m, ...patch } : m)) }, { action: "update", table: "materials", recordId: id, before, after: patch });
      },
      addProduct: (input) => {
        if (!input.name.trim()) throw new Error("اسم المنتج مطلوب.");
        const row: Product = { ...input, id: nid(), factoryId: fid(db), name: input.name.trim() };
        mutate({ products: [row, ...db.products] }, { action: "create", table: "products", recordId: row.id, before: null, after: row });
      },
      updateProduct: (id, patch) => {
        const before = db.products.find((p) => p.id === id);
        mutate({ products: db.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) }, { action: "update", table: "products", recordId: id, before, after: patch });
      },
      deleteProduct: (id) => {
        if (!can.delete) throw new Error("صاحب المصنع بس اللي يمسح.");
        if (db.orders.some((o) => o.productId === id)) throw new Error("المنتج مرتبط بأوامر إنتاج — مينفعش يتمسح.");
        const before = db.products.find((p) => p.id === id);
        const bomIds = db.boms.filter((b) => b.productId === id).map((b) => b.id);
        mutate(
          {
            products: db.products.filter((p) => p.id !== id),
            boms: db.boms.filter((b) => b.productId !== id),
            bomItems: db.bomItems.filter((i) => !bomIds.includes(i.bomId)),
            routingSteps: db.routingSteps.filter((r) => r.productId !== id),
          },
          { action: "delete", table: "products", recordId: id, before, after: null },
        );
      },
      addBomItem: (productId, input) => {
        if (!input.materialId) throw new Error("اختار الخامة الأول.");
        if (!(input.qtyPerUnit > 0)) throw new Error("الكمية لازم أكبر من صفر.");
        let bom = activeBom(db, productId);
        const boms = [...db.boms];
        if (!bom) {
          bom = { id: nid(), factoryId: fid(db), productId, version: 1, status: "active", notes: "" } satisfies Bom;
          boms.unshift(bom);
        }
        const row: BomItem = { id: nid(), factoryId: fid(db), bomId: bom.id, ...input };
        mutate({ boms, bomItems: [...db.bomItems, row] }, { action: "create", table: "bom_items", recordId: row.id, before: null, after: row });
      },
      removeBomItem: (id) => {
        const before = db.bomItems.find((i) => i.id === id);
        mutate({ bomItems: db.bomItems.filter((i) => i.id !== id) }, { action: "delete", table: "bom_items", recordId: id, before, after: null });
      },
      addRoutingStep: (productId, operationId, rate, stdMinutes) => {
        if (!operationId) throw new Error("اختار العملية الأول.");
        if (db.routingSteps.some((r) => r.productId === productId && r.operationId === operationId)) {
          throw new Error("العملية دي موجودة في المسار.");
        }
        const seq = db.routingSteps.filter((r) => r.productId === productId).reduce((m, r) => Math.max(m, r.seq), 0) + 1;
        const row: RoutingStep = { id: nid(), factoryId: fid(db), productId, operationId, seq, rate, stdMinutes };
        mutate({ routingSteps: [...db.routingSteps, row] }, { action: "create", table: "routing_steps", recordId: row.id, before: null, after: row });
      },
      removeRoutingStep: (id) => {
        const before = db.routingSteps.find((r) => r.id === id);
        mutate({ routingSteps: db.routingSteps.filter((r) => r.id !== id) }, { action: "delete", table: "routing_steps", recordId: id, before, after: null });
      },
      addOperation: (name, rate, minutes, outsourced) => {
        if (!name.trim()) throw new Error("اسم العملية مطلوب.");
        const row: Operation = { id: nid(), factoryId: fid(db), name: name.trim(), defaultRate: rate, defaultMinutes: minutes, isOutsourced: outsourced };
        mutate({ operations: [...db.operations, row] }, { action: "create", table: "operations", recordId: row.id, before: null, after: row });
      },
      addStockMovement: (input) => {
        if (!input.qty) throw new Error("الكمية لازم تكون أكبر من صفر.");
        const out = input.kind === "issue" || input.kind === "waste" || input.kind === "delivery";
        const qty = out ? -Math.abs(input.qty) : input.kind === "adjust" ? input.qty : Math.abs(input.qty);
        if (out && Math.abs(qty) > stockQty(db, input.itemType, input.itemId) + 0.0001) {
          throw new Error("الكمية أكبر من الرصيد المتاح في المخزن.");
        }
        const row: StockMovement = { ...input, qty, id: nid(), factoryId: fid(db) };
        mutate({ stockMovements: [row, ...db.stockMovements] }, { action: "create", table: "stock_movements", recordId: row.id, before: null, after: row });
      },
      issueOrderMaterials: (orderId) => {
        const order = db.orders.find((o) => o.id === orderId);
        if (!order) throw new Error("أمر الإنتاج مش موجود.");
        const bomId = order.bomId ?? (order.productId ? activeBom(db, order.productId)?.id ?? null : null);
        if (!bomLines(db, bomId).length) throw new Error("لازم تربط الأمر بمنتج له قائمة خامات.");
        const reqs = orderRequirements(db, order).filter((r) => r.remaining > 0.0001);
        if (!reqs.length) throw new Error("كل الخامات اتصرفت للأمر ده.");
        const short = reqs.filter((r) => r.shortage > 0.0001);
        if (short.length) throw new Error(`مفيش رصيد كافي من: ${short.map((s) => s.name).join("، ")}`);
        const date = cairoToday();
        const rows: StockMovement[] = reqs.map((r) => ({
          id: nid(),
          factoryId: fid(db),
          date,
          itemType: "material",
          itemId: r.materialId,
          warehouseId: db.warehouses.find((w) => w.kind === "material")?.id ?? null,
          kind: "issue",
          qty: -r.remaining,
          unitCost: r.unitCost,
          refType: "order",
          refId: order.id,
          notes: `صرف لأمر ${order.code}`,
        }));
        mutate(
          {
            stockMovements: [...rows, ...db.stockMovements],
            orders: db.orders.map((o) => (o.id === orderId ? { ...o, materialsIssuedAt: date, bomId: bomId } : o)),
          },
          { action: "create", table: "stock_movements", recordId: rows[0].id, before: null, after: { order: order.code, lines: rows.length } },
        );
      },
      addStageEntry: (input) => {
        const order = db.orders.find((o) => o.id === input.orderId);
        if (!order) throw new Error("أمر الإنتاج مش موجود.");
        if (input.qtyGood + input.qtyRework + input.qtyScrap <= 0) throw new Error("سجّل كمية واحدة على الأقل.");
        // مينفعش تخيط أكتر مما قصّيت: كل مرحلة محكومة بكمية الأمر وبالمرحلة اللي قبلها
        const stages = orderStages(db, order);
        const here = stages.find((s) => s.operationId === input.operationId);
        const done = (here?.good ?? 0) + (here?.scrap ?? 0);
        if (done + input.qtyGood + input.qtyScrap > order.quantity) {
          throw new Error(`كمية الأمر ${order.quantity} والمرحلة دي خلّصت ${done} خلاص.`);
        }
        const idx = stages.findIndex((s) => s.operationId === input.operationId);
        if (idx > 0) {
          const prev = stages[idx - 1];
          if (done + input.qtyGood + input.qtyScrap > prev.good) {
            throw new Error(`مرحلة ${prev.name} خلّصت ${prev.good} بس — مينفعش اللي بعدها تعدّيها.`);
          }
        }
        const row: StageEntry = { ...input, id: nid(), factoryId: fid(db) };
        const worker = input.workerId ? db.workers.find((w) => w.id === input.workerId) : null;
        const earnings: WorkerEarning[] = [];
        if (worker && worker.payType === "piece" && input.qtyGood > 0) {
          const rate = input.rate || worker.rate;
          earnings.push({
            id: nid(),
            factoryId: fid(db),
            workerId: worker.id,
            date: input.date,
            kind: "piece",
            amount: rate * input.qtyGood,
            notes: `${input.qtyGood} قطعة — أمر ${order.code}`,
          });
        }
        const stageEntries = [row, ...db.stageEntries];
        const progress = computedProgress({ ...db, stageEntries }, order);
        mutate(
          {
            stageEntries,
            workerEarnings: earnings.length ? [...earnings, ...db.workerEarnings] : db.workerEarnings,
            orders: progress === null ? db.orders : db.orders.map((o) => (o.id === order.id ? { ...o, progress } : o)),
          },
          { action: "create", table: "production_stage_entries", recordId: row.id, before: null, after: row },
        );
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
      addParty: (input) => {
        if (!input.name.trim()) throw new Error("اسم الجهة مطلوب.");
        const row: Party = {
          ...blankParty(fid(db), input.name.trim()),
          ...input,
          name: input.name.trim(),
          phone: (input.phone ?? "").trim(),
        };
        if (!row.roles.length) throw new Error("اختار نوع العلاقة على الأقل.");
        mutate({ parties: [row, ...db.parties] }, { action: "create", table: "parties", recordId: row.id, before: null, after: row });
        return row.id;
      },
      updateParty: (id, patch) => {
        const before = db.parties.find((p) => p.id === id);
        mutate(
          { parties: db.parties.map((p) => (p.id === id ? { ...p, ...patch } : p)) },
          { action: "update", table: "parties", recordId: id, before, after: patch },
        );
      },
      deleteParty: (id) => {
        if (!can.delete) throw new Error("صاحب المصنع بس اللي يمسح.");
        const before = db.parties.find((p) => p.id === id);
        mutate(
          {
            parties: db.parties.filter((p) => p.id !== id),
            deliveries: db.deliveries.filter((d) => d.clientId !== id),
            collections: db.collections.filter((c) => c.clientId !== id),
            contacts: db.contacts.filter((c) => c.partyId !== id),
            addresses: db.addresses.filter((a) => a.partyId !== id),
            communications: db.communications.filter((m) => m.partyId !== id),
            tasks: db.tasks.filter((t) => t.partyId !== id),
          },
          { action: "delete", table: "parties", recordId: id, before, after: null },
        );
      },
      /** الدمج بينقل كل الحركات للسجل الأساسي ويأرشف المكرر بدل ما يمسحه */
      mergeParties: (duplicateId, keepId) => {
        if (!can.edit) throw new Error("التعديل للمالك والمحاسب بس.");
        if (duplicateId === keepId) throw new Error("مينفعش تدمج السجل في نفسه.");
        const dup = db.parties.find((p) => p.id === duplicateId);
        const keep = db.parties.find((p) => p.id === keepId);
        if (!dup || !keep) throw new Error("واحد من السجلين مش موجود.");
        mutate(
          {
            parties: db.parties.map((p) => {
              if (p.id === duplicateId) return { ...p, mergedIntoId: keepId };
              if (p.id !== keepId) return p;
              return {
                ...p,
                roles: [...new Set([...p.roles, ...dup.roles])],
                tags: [...new Set([...p.tags, ...dup.tags])],
                phone: p.phone || dup.phone,
                email: p.email || dup.email,
                taxId: p.taxId || dup.taxId,
                creditLimit: Math.max(p.creditLimit, dup.creditLimit),
                notes: [p.notes, dup.notes].filter(Boolean).join(" — "),
              };
            }),
            deliveries: db.deliveries.map((d) => (d.clientId === duplicateId ? { ...d, clientId: keepId } : d)),
            collections: db.collections.map((c) => (c.clientId === duplicateId ? { ...c, clientId: keepId } : c)),
            orders: db.orders.map((o) => (o.clientId === duplicateId ? { ...o, clientId: keepId } : o)),
            costEntries: db.costEntries.map((e) => (e.partyId === duplicateId ? { ...e, partyId: keepId } : e)),
            contacts: db.contacts.map((c) => (c.partyId === duplicateId ? { ...c, partyId: keepId } : c)),
            addresses: db.addresses.map((a) => (a.partyId === duplicateId ? { ...a, partyId: keepId } : a)),
            communications: db.communications.map((m) => (m.partyId === duplicateId ? { ...m, partyId: keepId } : m)),
            tasks: db.tasks.map((t) => (t.partyId === duplicateId ? { ...t, partyId: keepId } : t)),
          },
          { action: "update", table: "parties", recordId: keepId, before: dup, after: { mergedInto: keep.name } },
        );
      },
      addContact: (input) => {
        if (!input.name.trim()) throw new Error("اسم جهة الاتصال مطلوب.");
        const row: PartyContact = { ...input, id: nid(), factoryId: fid(db), name: input.name.trim() };
        mutate({ contacts: [...db.contacts, row] }, { action: "create", table: "party_contacts", recordId: row.id, before: null, after: row });
      },
      removeContact: (id) => {
        const before = db.contacts.find((c) => c.id === id);
        mutate({ contacts: db.contacts.filter((c) => c.id !== id) }, { action: "delete", table: "party_contacts", recordId: id, before, after: null });
      },
      addAddress: (input) => {
        if (!input.line.trim()) throw new Error("اكتب العنوان.");
        const row: PartyAddress = { ...input, id: nid(), factoryId: fid(db) };
        mutate({ addresses: [...db.addresses, row] }, { action: "create", table: "party_addresses", recordId: row.id, before: null, after: row });
      },
      removeAddress: (id) => {
        const before = db.addresses.find((a) => a.id === id);
        mutate({ addresses: db.addresses.filter((a) => a.id !== id) }, { action: "delete", table: "party_addresses", recordId: id, before, after: null });
      },
      addCommunication: (input) => {
        const row: Communication = { ...input, id: nid(), factoryId: fid(db), actorName: session?.name ?? "النظام" };
        const extra: PartyTask[] = [];
        if (input.nextAction.trim() && input.nextDate) {
          extra.push({
            id: nid(),
            factoryId: fid(db),
            partyId: input.partyId,
            title: input.nextAction.trim(),
            dueDate: input.nextDate,
            assigneeName: session?.name ?? "",
            status: "open",
            createdAt: new Date().toISOString(),
          });
        }
        mutate(
          {
            communications: [row, ...db.communications],
            tasks: extra.length ? [...extra, ...db.tasks] : db.tasks,
          },
          { action: "create", table: "party_communications", recordId: row.id, before: null, after: row },
        );
      },
      addTask: (input) => {
        if (!input.title.trim()) throw new Error("اكتب المهمة.");
        const row: PartyTask = {
          id: nid(),
          factoryId: fid(db),
          partyId: input.partyId,
          title: input.title.trim(),
          dueDate: input.dueDate,
          assigneeName: input.assigneeName || session?.name || "",
          status: "open",
          createdAt: new Date().toISOString(),
        };
        mutate({ tasks: [row, ...db.tasks] }, { action: "create", table: "party_tasks", recordId: row.id, before: null, after: row });
      },
      toggleTask: (id) => {
        const before = db.tasks.find((t) => t.id === id);
        mutate(
          { tasks: db.tasks.map((t) => (t.id === id ? { ...t, status: t.status === "open" ? "done" : "open" } : t)) },
          { action: "update", table: "party_tasks", recordId: id, before, after: { toggled: true } },
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
    settings: { industry: "custom", overheadPerUnit: 0 },
    members: [],
    invites: [],
    accounts: [],
    units: [],
    categories: [],
    warehouses: [],
    materials: [],
    products: [],
    boms: [],
    bomItems: [],
    operations: [],
    routingSteps: [],
    stockMovements: [],
    stageEntries: [],
    costItems: [],
    costEntries: [],
    costPayments: [],
    parties: [],
    contacts: [],
    addresses: [],
    communications: [],
    tasks: [],
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
