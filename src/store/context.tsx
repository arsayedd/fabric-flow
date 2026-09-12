import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { cairoToday, moneyPlain, nid, qty } from "@/lib/utils";
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
  workshopBalance,
} from "./compute";
import type { ScoreWeights } from "./intelligence";
import type { CapacitySettings } from "./planning";
import { RULE_DEFS, RULE_KEYS, type AlertRules } from "./rules";
import {
  LEGACY_DB_KEY,
  accessibleWorkspaces,
  blankWorkspace,
  checkPassword,
  dbKeyOf,
  DEMO_LOGIN,
  ensureDemoLogin,
  freeSlug,
  hashPassword,
  industryOf,
  isEmail,
  isUrl,
  loadAccounts,
  loadCurrent,
  loadWorkspaces,
  MODULES_VERSION,
  randomSalt,
  resolveTenant,
  tenantSlug,
  roleIn,
  saveAccounts,
  saveCurrent,
  saveWorkspaces,
  sixDigitCode,
  slugState,
  verifyPassword,
  type CurrentState,
  type EmployeeBand,
  type ModuleKey,
  type UserAccount,
  type Workspace,
} from "./account";
import { partyAlerts, portfolio } from "./parties";
import { allowed, denied, roleMatrix, type PermAction, type PermMatrix, type PermModule } from "./permissions";
import {
  activeBom,
  bomLines,
  computedProgress,
  materialById,
  materialStock,
  operationById,
  orderRequirements,
  orderStages,
  routingLines,
  stockQty,
} from "./manufacturing";
import { bundleCode, layMath, nextBundleSeq, orderCutSummary, planBundles } from "./cutting";
import { bundleState } from "./floor";
import { KIND_MODULE } from "./codes";
import { subMovement, subView } from "./outsourcing";
import { RETURN_MODULE, nextComplaintCode, nextRepairCode, nextReturnCode, repairsOf, unitCostOf } from "./returns";
import { repairCostOf } from "./compute";
import { allocateFifo, issuableQty, nextSerial, supplyView } from "./supply";
import { buildDoc, canTransition, DOC_DEFS, findDoc, type IssueInput } from "./documents";
import { DEMO_FACTORY, DEMO_SLUG, FID, demoDb, emptyDb, templateData } from "./seed";
import { PRODUCTION_LINES, REPAIR_DERIVED_COSTS, RETURN_SOURCE_LABEL } from "./types";
import type {
  BatchStatus,
  MaterialBatch,
  Recall,
  RecallSeverity,
  RecallStatus,
  SupplyOrder,
  SupplyOrderLine,
  SupplyReceipt,
  SupplyReceiptLine,
  Account,
  Attachment,
  AttachmentPhase,
  AuditEntry,
  Bom,
  BomItem,
  Bundle,
  BundleOp,
  CodeKind,
  CutLay,
  CutLayLine,
  Complaint,
  ComplaintKind,
  FloorIssue,
  FloorIssueKind,
  Machine,
  MachineKind,
  MachineTicket,
  TicketKind,
  ProblemKind,
  ProblemOrigin,
  RepairMaterial,
  RepairOrder,
  ReturnCondition,
  ReturnCostKind,
  ReturnCostLine,
  ReturnEntry,
  ReturnReason,
  ReturnResolution,
  ReturnSource,
  Subcontract,
  SubPayment,
  SubReceipt,
  Industry,
  Material,
  ScanAction,
  ScanEvent,
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
  DocSettings,
  Invite,
  IssuedDoc,
  ManualTx,
  Member,
  Order,
  OrderStatus,
  PayMethod,
  Role,
  RootCause,
  Session,
  Worker,
  WorkerEarning,
  WorkerPayType,
  WorkerPayment,
} from "./types";

const SESSION_KEY = "factory-ledger.session";

/**
 * دفتر المصنع الواحد: المفتاح + البيانات مع بعض.
 * العزل بين المصانع بيحصل هنا — كل مصنع في مفتاح مستقل، ومفيش لحظة واحدة
 * بيكون فيها مفتاح مصنع ومعاه بيانات مصنع تاني (عشان كده الاتنين في state واحدة).
 */
type Book = { key: string; data: Db };

function readDb(key: string): Db | null {
  try {
    const raw = localStorage.getItem(key);
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
    supplyOrders: db.supplyOrders ?? [],
    supplyOrderLines: db.supplyOrderLines ?? [],
    supplyReceipts: db.supplyReceipts ?? [],
    supplyReceiptLines: db.supplyReceiptLines ?? [],
    batches: db.batches ?? [],
    recalls: db.recalls ?? [],
    stageEntries: db.stageEntries ?? [],
    deliveries: (db.deliveries ?? []).map((d) => ({ ...d, orderId: d.orderId ?? null })),
    documents: db.documents ?? [],
    cutLays: db.cutLays ?? [],
    cutLayLines: db.cutLayLines ?? [],
    bundles: db.bundles ?? [],
    bundleOps: db.bundleOps ?? [],
    floorIssues: db.floorIssues ?? [],
    machines: db.machines ?? [],
    machineTickets: db.machineTickets ?? [],
    scans: db.scans ?? [],
    subcontracts: db.subcontracts ?? [],
    subReceipts: db.subReceipts ?? [],
    subPayments: db.subPayments ?? [],
    /*
     * الحالات القديمة اتسجّلت قبل ما يبقى فيه تصنيف مشاكل وبنود تكلفة.
     * فبتتقرا بالحقول الجديدة فاضية، و`extraCost` القديمة بتتحوّل لسطر
     * تكلفة واحد بدل ما تضيع — الترحيل بيقرا اللي مكتوب مش بيمسحه.
     */
    returns: (db.returns ?? []).map((r) => {
      const legacy = r as ReturnEntry & { extraCost?: number; extraNote?: string };
      const carried: ReturnCostLine[] =
        !r.costs && legacy.extraCost && legacy.extraCost > 0
          ? [{ id: `${r.id}-legacy`, kind: "admin", amount: legacy.extraCost, note: legacy.extraNote?.trim() || "مصاريف مرتجع قديمة" }]
          : [];
      return {
        ...r,
        problem: r.problem ?? null,
        origin: r.origin ?? null,
        rootCause: r.rootCause ?? null,
        color: r.color ?? "",
        size: r.size ?? "",
        line: r.line ?? "",
        operationId: r.operationId ?? null,
        workerId: r.workerId ?? null,
        ownerId: r.ownerId ?? null,
        costs: r.costs ?? carried,
        attachments: r.attachments ?? [],
      };
    }),
    repairs: db.repairs ?? [],
    complaints: db.complaints ?? [],
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

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

/**
 * المصنع اللي كان محفوظ على الجهاز قبل نظام الحسابات بيتسجّل كـworkspace
 * زي أي مصنع تاني — بنفس مفتاحه القديم، فمفيش بيانات بتتنقل ولا بتتلمس.
 * بيفضل من غير مالك (`ownerId: ""`) عشان حساب جديد على نفس الجهاز
 * ماياخدش بيانات مش بتاعته.
 */
function adoptLegacy(workspaces: Workspace[]): Workspace[] {
  if (workspaces.some((w) => w.dbKey === LEGACY_DB_KEY)) return workspaces;
  const legacy = readDb(LEGACY_DB_KEY);
  if (!legacy?.factory) return workspaces;
  const row: Workspace = {
    ...blankWorkspace(legacy.factory.id, LEGACY_DB_KEY, legacy.factory.name, freeSlug(legacy.factory.name, workspaces)),
    industry: legacy.settings?.industry ?? "custom",
    createdAt: legacy.factory.createdAt,
  };
  const next = [row, ...workspaces];
  saveWorkspaces(next);
  return next;
}

type Boot = { workspaces: Workspace[]; current: CurrentState; book: Book; missing: string | null; session: Session | null };

function boot(): Boot {
  const workspaces = adoptLegacy(loadWorkspaces());
  const current = loadCurrent();
  const session = loadSession();
  const search = typeof location === "undefined" ? "" : location.search;
  const wanted = new URLSearchParams(search).get("factory");
  let spaces = workspaces;
  let hit = resolveTenant(location.hostname, search, spaces, current);

  /*
   * الـslug اتطلب ومش موجود: بنقولها صريح بدل ما نفتح مصنع تاني بالغلط.
   *
   * والعنوان نفسه طلب زي `?factory=`: اللي بيفتح `alnoor.sanaa.cloud`
   * طالب مصنع بالاسم، فلو مالقيناهوش لازم نقول كده — مش نعرض الصفحة
   * الرئيسية كأن الجهاز جديد ومحصلش حاجة.
   */
  const asked = wanted ?? tenantSlug(location.hostname);

  /*
   * العنوان التجريبي بيجهّز نفسه.
   *
   * اللي بيفتح `alnoor.sanaa.cloud` طالب المصنع التجريبي بالاسم، وبيانات
   * التجربة أصلًا بتتولّد على الجهاز — ده نفس اللي بيحصل بالظبط لما تضغط
   * «دخول تجريبي». فـ«المصنع مش موجود» جواب غلط على العنوان ده.
   *
   * ومهم: ده مايخصّش مصنع حقيقي. مصنع فعلي على صاب دومين محتاج بياناته
   * تكون على السيرفر، لأن تخزين المتصفح منفصل لكل عنوان — فالمصنع اللي
   * عملته على الدومين الأصلي مش موجود على الصاب دومين.
   */
  if (!hit && asked === DEMO_SLUG) {
    const seeded = demoDb();
    const id = seeded.factory!.id;
    const key = dbKeyOf(id);
    const row: Workspace = {
      ...blankWorkspace(id, key, seeded.factory!.name, DEMO_SLUG),
      industry: seeded.settings.industry,
      lastAccessAt: new Date().toISOString(),
    };
    spaces = [row, ...workspaces.filter((w) => w.factoryId !== id)];
    saveWorkspaces(spaces);
    if (!readDb(key)) localStorage.setItem(key, JSON.stringify(seeded));
    saveCurrent({ ...current, factoryId: id });
    hit = { workspace: row, via: "hostname" };
  }

  if (!hit && asked) {
    return { workspaces: spaces, current, book: { key: "", data: emptyShell() }, missing: asked, session: null };
  }
  const ws = hit?.workspace ?? null;
  const key = ws?.dbKey ?? LEGACY_DB_KEY;
  const data = readDb(key) ?? emptyShell();
  // جلسة محفوظة لمصنع تاني مش بتنفع للمصنع ده
  const keep = !session?.factoryId || !ws || session.factoryId === ws.factoryId;
  let live = keep ? session : null;

  /*
   * الـhostname حدّد المصنع: يبقى نفتحه على طول لو الحساب له وصول.
   * ده اللي بيخلي `alnoor.sanaa.app` يوصّل لمصنع النور مباشرة بدل اختيار المصنع،
   * والصلاحية بتتقرّر من عضويّة الحساب في المصنع — مش من الـURL.
   */
  if (!live && ws && data.factory) {
    const accounts = loadAccounts();
    const user = accounts.find((a) => a.id === current.userId) ?? null;
    const allowed = !ws.ownerId || (!!user && (ws.ownerId === user.id || ws.access.some((a) => a.userId === user.id)));
    if (allowed) {
      const role = user ? roleIn(ws, user.id) : "owner";
      const member =
        (user ? data.members.find((m) => m.email === user.email) : null) ??
        data.members.find((m) => m.role === role) ??
        data.members[0];
      if (member) {
        live = { memberId: member.id, email: member.email, name: member.name, role: member.role, factoryId: member.factoryId };
      }
    }
  }

  return {
    workspaces: spaces,
    current: ws ? { ...current, factoryId: ws.factoryId } : current,
    book: { key, data },
    missing: null,
    session: live,
  };
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

export type SignUpInput = {
  fullName: string;
  email: string;
  countryCode: string;
  phone: string;
  password: string;
  termsAccepted: boolean;
};

export type FactoryInput = {
  name: string;
  types: string[];
  website: string;
  country: string;
  city: string;
  address: string;
  employees: EmployeeBand | null;
  employeesExact: number | null;
  monthlyCapacity: number | null;
  productionLines: number | null;
  branches: number | null;
  logo: string | null;
  subdomain: string;
  modules: ModuleKey[];
};

export type TeamRow = { name: string; email: string; phone: string; title: string; role: Role };

type AccountState = {
  user: UserAccount | null;
  /** كل المصانع على الجهاز — بنحتاجها للتأكد إن الـsubdomain مش مستخدم */
  workspaces: Workspace[];
  /** المصانع اللي الحساب ده له وصول ليها */
  mine: Workspace[];
  workspace: Workspace | null;
  /** الـslug اللي اتطلب في العنوان ومش موجود */
  missing: string | null;
};

type FactoryApi = {
  db: Db;
  session: Session | null;
  account: AccountState;
  signUp: (account: SignUpInput, factory: FactoryInput) => Promise<void>;
  signIn: (email: string, password: string, remember: boolean) => Promise<Workspace[]>;
  signOut: () => void;
  enterWorkspace: (factoryId: string) => void;
  leaveWorkspace: () => void;
  createWorkspace: (factory: FactoryInput) => void;
  updateWorkspace: (patch: Partial<Workspace>) => void;
  setModules: (modules: ModuleKey[]) => void;
  inviteTeam: (rows: TeamRow[]) => void;
  verifyEmail: (code: string) => void;
  resendVerification: () => string;
  startReset: (email: string) => string;
  finishReset: (email: string, code: string, password: string) => Promise<void>;
  login: (member: Member) => void;
  logout: () => void;
  startDemo: (role: Role) => void;
  createFactory: (name: string, industry: Industry) => void;
  setOverhead: (value: number) => void;
  setScoreWeights: (weights: ScoreWeights) => void;
  setCapacity: (capacity: CapacitySettings) => void;
  setTargetMargin: (value: number) => void;
  setRules: (rules: AlertRules) => void;
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
    /** السؤال الوحيد: «الدور ده يعمل الفعل ده في الموديول ده؟» */
    do: (module: PermModule, action: PermAction) => boolean;
    /** مصفوفة الدور الحالي — للعرض في شاشة الصلاحيات */
    matrix: PermMatrix;
    /**
     * اختصارات قديمة بمعنى واسع: «يقدر يعدّل حاجة» مش «يعدّل الحاجة دي».
     * التحقق الدقيق بيحصل في `can.do` وفي الميوتيشن نفسها.
     */
    finance: boolean;
    edit: boolean;
    delete: boolean;
    staff: boolean;
    audit: boolean;
  };
  /** `null` معناها ارجع للافتراضي — بنشيل الاستثناء مش بنخزّن الافتراضي كاستثناء */
  setPermissions: (role: Role, matrix: PermMatrix | null) => void;
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
  /* ── القص والباندلات ── */
  addLay: (input: LayInput) => string;
  updateLay: (id: string, patch: Partial<CutLay>) => void;
  setLaySizes: (layId: string, sizes: { size: string; perPly: number }[]) => void;
  cancelLay: (id: string, reason: string) => void;
  /** القص: بيصرف القماش، بيسجّل الإنتاج، وبيطلّع الباندلات بتيكتاتها */
  cutLayNow: (id: string, input: { fabricUsedM: number; perBundle: number; workerId: string | null }) => void;
  /* ── تتبع العملية ── */
  startBundleOp: (input: { bundleId: string; operationId?: string; workerId: string | null; machineId?: string | null }) => string;
  pauseBundleOp: (id: string, note: string) => void;
  resumeBundleOp: (id: string) => void;
  finishBundleOp: (id: string, input: { qtyGood: number; qtyRework: number; qtyScrap: number; defect: string }) => void;
  reportIssue: (input: { kind: FloorIssueKind; line: string; orderId: string | null; bundleId: string | null; workerId: string | null; note: string }) => void;
  resolveIssue: (id: string) => void;
  /* ── الماكينات والصيانة ── */
  addMachine: (input: MachineInput) => string;
  updateMachine: (id: string, patch: Partial<Machine>) => void;
  /** خروج الماكينة من الخدمة قرار مش حذف: السجل والتذاكر بيفضلوا */
  retireMachine: (id: string, reason: string) => void;
  openTicket: (input: TicketInput) => string;
  /** بدء الإصلاح: بيقيس وقت الاستجابة، والماكينة بتتحوّل لحالتها */
  startTicket: (id: string) => void;
  closeTicket: (id: string, input: CloseTicketInput) => void;
  cancelTicket: (id: string, reason: string) => void;
  /* ── المسح ── */
  recordScan: (input: {
    kind: CodeKind;
    refId: string;
    code: string;
    action: ScanAction;
    source: ScanEvent["source"];
    qty?: number | null;
    from?: string;
    to?: string;
    note?: string;
  }) => void;
  /* ── الورش الخارجية ── */
  addSubcontract: (input: SubcontractInput) => string;
  sendSubMaterials: (subcontractId: string, rows: { materialId: string; qty: number }[]) => void;
  receiveSubcontract: (input: { subcontractId: string; date: string; qtyGood: number; qtyRework: number; qtyLost: number; notes: string }) => void;
  paySubcontract: (input: { partyId: string; subcontractId: string | null; date: string; amount: number; accountId: string; method: PayMethod; notes: string }) => void;
  closeSubcontract: (id: string) => void;
  cancelSubcontract: (id: string, reason: string) => void;
  /* ── التوريد والاستلام والدفعات ── */
  openSupplyOrder: (input: SupplyInput) => string;
  /** استلام جزئي: بيدخل المقبول المخزن ويعمل دفعة، والباقي يفضل مستنى */
  receiveSupply: (input: ReceiveInput) => string;
  /** قفل الأمر بعجز — قرار، فلازم يتقال سببه */
  closeSupplyOrder: (id: string, reason: string) => void;
  cancelSupplyOrder: (id: string, reason: string) => void;
  setBatchStatus: (id: string, status: BatchStatus, note: string) => void;
  /* ── الاستدعاء ── */
  openRecall: (input: RecallInput) => string;
  setRecallStatus: (id: string, status: RecallStatus) => void;
  cancelRecall: (id: string, reason: string) => void;
  /* ── المرتجعات والشكاوى ── */
  addReturn: (input: ReturnInput) => string;
  /** الفحص: بيحدد رجع بأي حال وينفع يدخل المخزن ولا لأ */
  inspectReturn: (id: string, input: InspectInput) => void;
  /** التسوية: هي اللي بتحرّك الفلوس والمخزن — مش لحظة الوصول */
  settleReturn: (id: string, input: SettleInput) => void;
  cancelReturn: (id: string, reason: string) => void;
  /** بنود تكلفة الحالة — بتتضاف وقت ما تحصل، مش كلها وقت القرار */
  addReturnCost: (returnId: string, input: { kind: ReturnCostKind; amount: number; note: string }) => void;
  removeReturnCost: (returnId: string, costId: string) => void;
  addAttachment: (returnId: string, input: { name: string; phase: AttachmentPhase; dataUrl: string; note: string }) => void;
  removeAttachment: (returnId: string, attachmentId: string) => void;
  /* ── أوامر الإصلاح ── */
  openRepair: (input: RepairInput) => string;
  startRepair: (id: string) => void;
  /** بيقفل الإصلاح ويوديه للفحص — والوقت بيتحسب من الساعة */
  finishRepair: (id: string) => void;
  qcRepair: (id: string, input: { qtyPassed: number; qtyFailed: number; qcNote: string }) => void;
  shipRepair: (id: string) => void;
  cancelRepair: (id: string, reason: string) => void;
  addComplaint: (input: ComplaintInput) => string;
  updateComplaint: (id: string, patch: Partial<Pick<Complaint, "status" | "severity" | "ownerId" | "dueDate" | "resolution" | "claimAmount" | "returnId">>) => void;
  /**
   * بيرجّع المستند: لو السجل ده ليه مستند شغّال بيرجّعه بنفس رقمه بدل ما
   * يعمل رقم جديد — طبع تاني مش مستند تاني.
   */
  issueDoc: (input: IssueInput) => IssuedDoc;
  approveDoc: (id: string) => void;
  cancelDoc: (id: string, reason: string) => void;
  /** إعادة الإصدار بترفع رقم المراجعة والرقم يفضل هو */
  reviseDoc: (id: string) => void;
  setDocSettings: (patch: Partial<DocSettings>) => void;
  addAccount: (name: string, kind: Account["kind"]) => void;
  invite: (email: string, role: Role) => void;
  acceptInvite: (id: string, name: string) => void;
  changeRole: (memberId: string, role: Role) => void;
  removeMember: (memberId: string) => void;
  computed: ReturnType<typeof buildComputed>;
};

export type SupplyInput = {
  partyId: string;
  date: string;
  expectedDate: string;
  notes: string;
  lines: { itemType: "material" | "product"; itemId: string; qtyOrdered: number; unitPrice: number; notes: string }[];
};

export type ReceiveInput = {
  supplyOrderId: string;
  date: string;
  warehouseId: string | null;
  supplierDocNo: string;
  notes: string;
  lines: {
    supplyOrderLineId: string;
    qtyAccepted: number;
    qtyRejected: number;
    qtyDamaged: number;
    qtyMissing: number;
    /** رقم اللوط المكتوب على الشحنة — لو فاضي بنولّد كود دفعة لوحدنا */
    supplierLot: string;
    expiryDate: string | null;
    notes: string;
  }[];
};

export type RecallInput = {
  batchId: string;
  date: string;
  reason: string;
  severity: RecallSeverity;
  ownerId: string | null;
  notes: string;
};

export type LayInput = {
  orderId: string;
  materialId: string;
  operationId: string | null;
  color: string;
  date: string;
  plies: number;
  markerLengthM: number;
  endAllowanceM: number;
  markerWidthM: number;
  notes: string;
  sizes: { size: string; perPly: number }[];
};

export type MachineInput = {
  name: string;
  kind: MachineKind;
  brand: string;
  serial: string;
  line: string;
  warehouseId: string | null;
  boughtOn: string | null;
  cost: number;
  dailyMinutes: number;
  serviceEveryDays: number;
  lastServiceOn: string | null;
  notes: string;
};

export type TicketInput = {
  machineId: string;
  kind: TicketKind;
  reportedOn: string;
  cause: string;
  workerId: string | null;
  partyId: string | null;
  /** بلاغ من أرض المصنع بيتحوّل لتذكرة، وبيتقفل معاها */
  issueId: string | null;
  notes: string;
};

export type CloseTicketInput = {
  action: string;
  /** دقايق التوقف — بتتقترح من الساعة وينفع تتعدّل */
  downMinutes: number;
  laborCost: number;
  outsideCost: number;
  /** قطع الغيار بتخرج من المخزن فعلًا، مش رقم تكلفة بيتكتب */
  parts: { materialId: string; qty: number }[];
  /** الصيانة الدورية بتحدّث تاريخ آخر صيانة، فالميعاد الجاي بيتحرّك */
  serviceDone: boolean;
};

export type ReturnInput = {
  source: ReturnSource;
  date: string;
  partyId: string | null;
  itemType: "product" | "material";
  itemId: string;
  qty: number;
  condition: ReturnCondition;
  reason: ReturnReason;
  reasonNote: string;
  unitValue: number;
  deliveryId: string | null;
  orderId: string | null;
  bundleId: string | null;
  costEntryId: string | null;
  issueId: string | null;
  /* المشكلة ومصدرها — ممكن تتسجّل وقت الوصول، وممكن تستنى الفحص */
  problem: ProblemKind | null;
  origin: ProblemOrigin | null;
  color: string;
  size: string;
  line: string;
  operationId: string | null;
  workerId: string | null;
  ownerId: string | null;
  notes: string;
};

export type SettleInput = {
  resolution: ReturnResolution;
  settleAmount: number;
  accountId: string | null;
  method: PayMethod | null;
  restock: boolean;
  warehouseId: string | null;
  replacementQty: number;
  notes: string;
};

export type InspectInput = {
  condition: ReturnCondition;
  qty: number;
  /* الفحص هو لحظة تحديد المشكلة — قبله كل ده تخمين */
  problem: ProblemKind | null;
  origin: ProblemOrigin | null;
  rootCause: RootCause | null;
  operationId: string | null;
  workerId: string | null;
  notes: string;
};

export type RepairInput = {
  returnId: string;
  qty: number;
  problem: ProblemKind | null;
  workerId: string | null;
  operationId: string | null;
  rate: number;
  materials: { materialId: string; qty: number }[];
  notes: string;
};

export type ComplaintInput = {
  partyId: string;
  date: string;
  kind: ComplaintKind;
  severity: Complaint["severity"];
  subject: string;
  detail: string;
  deliveryId: string | null;
  orderId: string | null;
  returnId: string | null;
  ownerId: string | null;
  dueDate: string | null;
  claimAmount: number;
};

export type SubcontractInput = {
  partyId: string;
  orderId: string | null;
  operationId: string | null;
  date: string;
  expectedDate: string;
  qtySent: number;
  rate: number;
  notes: string;
};

const Ctx = createContext<FactoryApi | null>(null);

function fid(db: Db): string {
  return db.factory?.id ?? "";
}

/**
 * كمية بشكل مقروء في رسائل الرفض — الرفض لازم يقول الرقم مش «مش كفاية».
 *
 * وبالأرقام العربية زي أي رقم تاني بيشوفه المستخدم: الرسالة دي بتتقرا
 * جوه جملة عربية، ورقم لاتيني في وسطها بيبان زي خطأ في النظام.
 */
function qtyText(value: number): string {
  return qty(value);
}

/** ترقيم إذون التشغيل الخارجي: SUB-0001 وطالع، والرقم مابيتكرّرش */
function nextSubCode(subs: Subcontract[]): string {
  const last = subs.reduce((max, s) => Math.max(max, Number(s.code?.replace(/\D/g, "")) || 0), 0);
  return `SUB-${String(last + 1).padStart(4, "0")}`;
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
  const [booted] = useState(boot);
  const [book, setBook] = useState<Book>(booted.book);
  const [accounts, setAccounts] = useState<UserAccount[]>(loadAccounts);
  const [workspaces, setWorkspaces] = useState<Workspace[]>(booted.workspaces);
  const [current, setCurrent] = useState<CurrentState>(booted.current);
  const [missing, setMissing] = useState<string | null>(booted.missing);
  const [session, setSession] = useState<Session | null>(booted.session);
  const db = book.data;

  useEffect(() => {
    if (book.key && book.data.factory) localStorage.setItem(book.key, JSON.stringify(book.data));
  }, [book]);

  useEffect(() => {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }, [session]);

  const setDb = (fn: (prev: Db) => Db) => setBook((b) => ({ ...b, data: fn(b.data) }));

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
    setSession({ memberId: member.id, email: member.email, name: member.name, role: member.role, factoryId: member.factoryId });
  };

  const persistWorkspaces = (rows: Workspace[]) => {
    setWorkspaces(rows);
    saveWorkspaces(rows);
  };

  const persistAccounts = (rows: UserAccount[]) => {
    setAccounts(rows);
    saveAccounts(rows);
  };

  const persistCurrent = (state: CurrentState) => {
    setCurrent(state);
    saveCurrent(state);
  };

  const user = accounts.find((a) => a.id === current.userId) ?? null;
  const workspace = workspaces.find((w) => w.factoryId === current.factoryId) ?? null;

  /**
   * فتح مصنع: بنقرأ دفتره من مفتاحه، وبنبني الجلسة من عضويّة الحساب فيه.
   *
   * `rows` بتتمرّر لما المساحات اتغيّرت في نفس الحدث — `setWorkspaces` مابيبانش
   * في نفس الدورة، فلو قرينا من الحالة هنقول «المصنع ده مش موجود» عن مصنع
   * إحنا لسه عاملينه.
   */
  const enterWorkspace = (factoryId: string, account: UserAccount | null, rows: Workspace[] = workspaces) => {
    const ws = rows.find((w) => w.factoryId === factoryId);
    if (!ws) throw new Error("المصنع ده مش موجود على الجهاز.");
    /* المساحة التجريبية دفترها بيتولّد أول مرة حد يدخلها فعلًا */
    const data = readDb(ws.dbKey) ?? (factoryId === FID ? demoDb() : null);
    if (!data?.factory) throw new Error("بيانات المصنع ده مش موجودة على الجهاز.");
    const role = account ? roleIn(ws, account.id) : "owner";
    const member =
      (account ? data.members.find((m) => m.email === account.email) : null) ??
      data.members.find((m) => m.role === role) ??
      data.members[0];
    setBook({ key: ws.dbKey, data });
    setMissing(null);
    persistCurrent({ userId: account?.id ?? current.userId, factoryId, remember: current.remember });
    persistWorkspaces(rows.map((w) => (w.factoryId === factoryId ? { ...w, lastAccessAt: new Date().toISOString() } : w)));
    if (member) login(member);
  };

  /**
   * مصنع اتعمل من غير حساب (تجربة أو مصنع محفوظ على الجهاز).
   * بياخد مفتاح مستقل زي أي مصنع، فمش بيكتب فوق مصنع تاني.
   */
  const registerDeviceFactory = (data: Db, key: string) => {
    const f = data.factory!;
    const exists = workspaces.some((w) => w.factoryId === f.id);
    const rows = exists
      ? workspaces.map((w) => (w.factoryId === f.id ? { ...w, dbKey: key, name: f.name, lastAccessAt: new Date().toISOString() } : w))
      : [
          {
            /* المصنع التجريبي عنوانه ثابت، عشان يبقى نفس العنوان أيًّا كان
             * الباب اللي دخلت منه — زرار الدور أو الحساب أو الصاب دومين */
            ...blankWorkspace(f.id, key, f.name, f.id === FID ? DEMO_SLUG : freeSlug(f.name, workspaces)),
            industry: data.settings.industry,
            ownerId: current.userId ?? "",
            lastAccessAt: new Date().toISOString(),
          },
          ...workspaces,
        ];
    persistWorkspaces(rows);
    persistCurrent({ ...current, factoryId: f.id });
  };

  /** إنشاء مصنع كامل: بيانات + workspace + مفتاح تخزين مستقل + جلسة مالك */
  const spawnFactory = (input: FactoryInput, owner: UserAccount | null): Workspace => {
    const name = input.name.trim();
    if (!name) throw new Error("اسم المصنع مطلوب.");
    if (input.website && !isUrl(input.website)) throw new Error("لينك الموقع مش مظبوط.");
    const slug = input.subdomain.trim().toLowerCase();
    if (slugState(slug, workspaces) !== "free") throw new Error("الـsubdomain مش متاح — اختار غيره.");

    const industry = industryOf(input.types);
    const created = emptyDb(name, industry);
    const factoryId = created.factory!.id;
    const ownerMember = created.members[0];
    const members: Member[] = [
      {
        ...ownerMember,
        name: owner?.fullName || ownerMember.name,
        email: owner?.email || ownerMember.email,
      },
    ];
    const data: Db = { ...created, members };

    const row: Workspace = {
      factoryId,
      dbKey: dbKeyOf(factoryId),
      name,
      subdomain: slug,
      types: input.types,
      industry,
      website: input.website.trim(),
      country: input.country,
      city: input.city.trim(),
      address: input.address.trim(),
      employees: input.employees,
      employeesExact: input.employeesExact,
      monthlyCapacity: input.monthlyCapacity,
      productionLines: input.productionLines,
      branches: input.branches,
      logo: input.logo,
      modules: input.modules,
      ownerId: owner?.id ?? "",
      access: [],
      createdAt: new Date().toISOString(),
      lastAccessAt: new Date().toISOString(),
    };

    persistWorkspaces([row, ...workspaces]);
    setBook({ key: row.dbKey, data });
    setMissing(null);
    persistCurrent({ userId: owner?.id ?? current.userId, factoryId, remember: current.remember });
    login(members[0]);
    return row;
  };

  const api = useMemo<FactoryApi>(() => {
    const role = session?.role ?? "supervisor";
    const matrix = roleMatrix(role, db.settings?.permissions);
    /** الصلاحية سؤال واحد، والجواب واحد في القائمة والزر والميوتيشن */
    const may = (module: PermModule, action: PermAction) => (session ? allowed(matrix, module, action) : false);
    /**
     * نقطة المنع الحقيقية. الزر المخفي مش منع — ده اللي بيرفض التنفيذ.
     * (على السيرفر نفس المصفوفة بتتحوّل لـRLS + تحقق في الدوال.)
     */
    const need = (module: PermModule, action: PermAction) => {
      if (!may(module, action)) throw denied(module, action);
    };
    const anyOf = (action: PermAction, modules: PermModule[]) => modules.some((m) => may(m, action));
    const can = {
      do: may,
      matrix,
      finance: may("finance", "view") && may("finance", "create"),
      edit: anyOf("edit", ["production", "inventory", "parties", "sales", "finance", "costing"]),
      delete: anyOf("delete", ["production", "inventory", "parties", "sales", "finance", "purchasing", "workers"]),
      staff: may("staff", "edit"),
      audit: may("audit", "view"),
    };

    return {
      db,
      session,
      can,
      computed: buildComputed(db),
      account: {
        user,
        workspaces,
        mine: accessibleWorkspaces(workspaces, current.userId),
        workspace,
        missing,
      },
      /** التسجيل والمصنع في خطوة واحدة: الحساب لوحده من غير مصنع مالوش معنى */
      signUp: async (input, factory) => {
        const email = input.email.trim().toLowerCase();
        if (!input.fullName.trim()) throw new Error("الاسم مطلوب.");
        if (!isEmail(email)) throw new Error("الإيميل مش مظبوط.");
        if (accounts.some((a) => a.email === email)) throw new Error("الإيميل ده مسجّل بالفعل — تقدر تدخل بيه.");
        if (!checkPassword(input.password).ok) throw new Error("كلمة السر مش مطابقة للشروط.");
        if (!input.termsAccepted) throw new Error("لازم توافق على الشروط.");
        const salt = randomSalt();
        const account: UserAccount = {
          id: nid(),
          fullName: input.fullName.trim(),
          email,
          phone: input.phone.trim(),
          countryCode: input.countryCode,
          passwordHash: await hashPassword(input.password, salt),
          salt,
          emailVerified: false,
          verifyCode: sixDigitCode(),
          verifySentAt: new Date().toISOString(),
          termsAcceptedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };
        persistAccounts([...accounts, account]);
        spawnFactory(factory, account);
      },
      signIn: async (email, password, remember) => {
        const clean = email.trim().toLowerCase();
        /*
         * الحساب التجريبي بيتعمل عند أول دخول بيه، مش عند فتح الصفحة.
         * يعني اللي جاي يعمل مصنعه الحقيقي مابنكتبش في متصفحه حساب ولا
         * مساحة ولا داتا تجريبية هو ماطلبهاش — والشرط الأول بيمنع إننا
         * نكتب فوق حساب حقيقي بنفس الإيميل لو حد سجّل بيه.
         */
        let rows = accounts;
        let spaces = workspaces;
        if (clean === DEMO_LOGIN.email && !accounts.some((a) => a.email === clean)) {
          const seeded = ensureDemoLogin(accounts, workspaces, FID, dbKeyOf(FID), DEMO_FACTORY);
          rows = seeded.accounts;
          spaces = seeded.workspaces;
          setAccounts(rows);
          setWorkspaces(spaces);
        }
        const account = rows.find((a) => a.email === clean);
        // نفس الرسالة للإيميل الغلط والباسورد الغلط — مش بنقول لحد إن الإيميل مسجّل
        const fail = new Error("الإيميل أو كلمة السر غلط.");
        if (!account) throw fail;
        if (!(await verifyPassword(password, account))) throw fail;
        const mine = accessibleWorkspaces(spaces, account.id);
        persistCurrent({ userId: account.id, factoryId: mine.length === 1 ? mine[0].factoryId : null, remember });
        setSession(null);
        if (mine.length === 1) enterWorkspace(mine[0].factoryId, account, spaces);
        return mine;
      },
      signOut: () => {
        setSession(null);
        persistCurrent({ userId: null, factoryId: null, remember: current.remember });
        setBook({ key: "", data: emptyShell() });
      },
      enterWorkspace: (factoryId) => enterWorkspace(factoryId, user),
      /** رجوع لاختيار المصنع: الحساب فاضل داخل، المصنع بس اللي بيتقفل */
      leaveWorkspace: () => {
        setSession(null);
        persistCurrent({ ...current, factoryId: null });
        setBook({ key: "", data: emptyShell() });
      },
      createWorkspace: (factory) => {
        if (!user) throw new Error("لازم تكون داخل بحسابك.");
        spawnFactory(factory, user);
      },
      updateWorkspace: (patch) => {
        if (!workspace) return;
        persistWorkspaces(workspaces.map((w) => (w.factoryId === workspace.factoryId ? { ...w, ...patch } : w)));
      },
      /**
       * الحفظ بيختم النسخة. بعد الختم، القايمة بتتقرا زي ما هي —
       * فاللي قفل قسم بإرادته مايرجعش يلاقيه مفتوح تاني.
       */
      setModules: (modules) => {
        if (!workspace) return;
        persistWorkspaces(
          workspaces.map((w) =>
            w.factoryId === workspace.factoryId ? { ...w, modules, modulesV: MODULES_VERSION } : w,
          ),
        );
      },
      /**
       * الدعوات بتتسجّل في قائمة الموظفين بالمسمّى والصلاحية.
       * إرسال الإيميل نفسه محتاج سيرفر، فالواجهة بتقول كده صريح.
       */
      inviteTeam: (rows) => {
        const clean = rows.filter((r) => r.email.trim() || r.name.trim());
        for (const r of clean) {
          if (!isEmail(r.email)) throw new Error(`إيميل ${r.name || "الموظف"} مش مظبوط.`);
        }
        if (!clean.length) return;
        const invites: Invite[] = clean.map((r) => ({
          id: nid(),
          factoryId: fid(db),
          email: r.email.trim().toLowerCase(),
          role: r.role,
          createdAt: new Date().toISOString(),
          status: "pending",
          name: r.name.trim(),
          title: r.title,
          phone: r.phone.trim(),
        }));
        mutate({ invites: [...invites, ...db.invites] }, { action: "create", table: "invites", recordId: invites[0].id, before: null, after: { count: invites.length } });
      },
      verifyEmail: (code) => {
        if (!user) throw new Error("مفيش حساب داخل.");
        if (!user.verifyCode || code.trim() !== user.verifyCode) throw new Error("الكود غلط.");
        persistAccounts(accounts.map((a) => (a.id === user.id ? { ...a, emailVerified: true, verifyCode: null } : a)));
      },
      resendVerification: () => {
        if (!user) throw new Error("مفيش حساب داخل.");
        const code = sixDigitCode();
        persistAccounts(accounts.map((a) => (a.id === user.id ? { ...a, verifyCode: code, verifySentAt: new Date().toISOString() } : a)));
        return code;
      },
      startReset: (email) => {
        const clean = email.trim().toLowerCase();
        const account = accounts.find((a) => a.email === clean);
        if (!account) throw new Error("مفيش حساب بالإيميل ده على الجهاز.");
        const code = sixDigitCode();
        persistAccounts(accounts.map((a) => (a.id === account.id ? { ...a, verifyCode: code, verifySentAt: new Date().toISOString() } : a)));
        return code;
      },
      finishReset: async (email, code, password) => {
        const clean = email.trim().toLowerCase();
        const account = accounts.find((a) => a.email === clean);
        if (!account) throw new Error("مفيش حساب بالإيميل ده.");
        if (!account.verifyCode || account.verifyCode !== code.trim()) throw new Error("الكود غلط أو منتهي.");
        if (!checkPassword(password).ok) throw new Error("كلمة السر الجديدة مش مطابقة للشروط.");
        const salt = randomSalt();
        const passwordHash = await hashPassword(password, salt);
        persistAccounts(accounts.map((a) => (a.id === account.id ? { ...a, salt, passwordHash, verifyCode: null } : a)));
      },
      login,
      logout: () => setSession(null),
      /**
       * تجربة النظام بدور. لو التجربة موجودة على الجهاز بالفعل، بنفتحها زي ما
       * هي وبنبدّل الدور بس — تبديل الدور مش سبب إننا نمسح اللي المستخدم
       * عدّله. اللي عايز تجربة نضيفة بيرجّعها من الإعدادات.
       */
      startDemo: (r) => {
        const seeded = demoDb();
        const key = dbKeyOf(seeded.factory!.id);
        const saved = readDb(key);
        const data = saved?.factory ? saved : seeded;
        setBook({ key, data });
        setMissing(null);
        registerDeviceFactory(data, key);
        const member = data.members.find((m) => m.role === r) ?? data.members[0];
        login(member);
      },
      createFactory: (name, industry) => {
        const created = emptyDb(name.trim() || "مصنعي", industry);
        const key = dbKeyOf(created.factory!.id);
        setBook({ key, data: created });
        setMissing(null);
        registerDeviceFactory(created, key);
        login(created.members[0]);
      },
      /**
       * تعديل مصفوفة دور. صاحب المصنع بس، وبيتسجّل في سجل التعديلات —
       * لأن «مين وسّع صلاحية مين وامتى» سؤال محاسبي مش تفصيلة واجهة.
       */
      setPermissions: (target, next) => {
        need("staff", "edit");
        if (target === "owner") throw new Error("صلاحيات صاحب المصنع مابتتقلّصش — ده اللي بيفتح الباب لو حصلت مشكلة.");
        const before = db.settings.permissions?.[target] ?? null;
        const all = { ...db.settings.permissions };
        if (next) all[target] = next;
        else delete all[target];
        mutate(
          { settings: { ...db.settings, permissions: all } },
          { action: "update", table: "settings", recordId: `permissions:${target}`, before, after: next },
        );
      },
      setOverhead: (value) => {
        need("finance", "edit");
        mutate(
          { settings: { ...db.settings, overheadPerUnit: Math.max(0, value) } },
          { action: "update", table: "settings", recordId: "overhead", before: db.settings, after: { overheadPerUnit: value } },
        );
      },
      /** أوزان السكور: صاحب المصنع بس، وبتتسجل في سجل التعديلات */
      setScoreWeights: (weights) => {
        need("settings", "edit");
        const total = Object.values(weights).reduce((s, v) => s + v, 0);
        if (total <= 0) throw new Error("مجموع الأوزان لازم يكون أكبر من صفر.");
        mutate(
          { settings: { ...db.settings, scoreWeights: weights } },
          { action: "update", table: "settings", recordId: "score_weights", before: db.settings?.scoreWeights ?? null, after: weights },
        );
      },
      /** هامش الهدف: قرار مالي، بيحدّد تكلفة الهدف وأقل سعر مقبول لكل موديل */
      setTargetMargin: (value) => {
        need("costing", "edit");
        if (!(value > 0 && value < 100)) throw new Error("هامش الهدف لازم يكون بين ١ و٩٩٪.");
        mutate(
          { settings: { ...db.settings, targetMarginPct: value } },
          { action: "update", table: "settings", recordId: "target_margin", before: db.settings?.targetMarginPct ?? null, after: value },
        );
      },
      /**
       * حساسية التنبيهات: مش قرار مالي، لكنه بيغيّر اللي كل الفريق
       * بيشوفه كخطر — فمحتاج صلاحية إعدادات وبيتسجّل في الدفتر.
       */
      setRules: (rules) => {
        need("settings", "edit");
        for (const k of RULE_KEYS) {
          const def = RULE_DEFS[k];
          const v = rules[k];
          if (!Number.isFinite(v) || v < def.min || v > def.max) {
            throw new Error(`${def.label}: الرقم لازم يكون بين ${def.min} و${def.max} ${def.unit}.`);
          }
        }
        mutate(
          { settings: { ...db.settings, rules } },
          { action: "update", table: "settings", recordId: "alert_rules", before: db.settings?.rules ?? null, after: rules },
        );
      },
      /** قرار الطاقة: بيغيّر جدول المصنع كله، فمحتاج صلاحية تعديل وبيتسجل */
      setCapacity: (capacity) => {
        need("planning", "edit");
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
        need("inventory", "create");
        if (!input.name.trim()) throw new Error("اسم الخامة مطلوب.");
        const row: Material = { ...input, id: nid(), factoryId: fid(db), name: input.name.trim() };
        mutate({ materials: [row, ...db.materials] }, { action: "create", table: "materials", recordId: row.id, before: null, after: row });
      },
      updateMaterial: (id, patch) => {
        need("inventory", "edit");
        const before = db.materials.find((m) => m.id === id);
        mutate({ materials: db.materials.map((m) => (m.id === id ? { ...m, ...patch } : m)) }, { action: "update", table: "materials", recordId: id, before, after: patch });
      },
      addProduct: (input) => {
        need("sales", "create");
        if (!input.name.trim()) throw new Error("اسم المنتج مطلوب.");
        const row: Product = { ...input, id: nid(), factoryId: fid(db), name: input.name.trim() };
        mutate({ products: [row, ...db.products] }, { action: "create", table: "products", recordId: row.id, before: null, after: row });
      },
      updateProduct: (id, patch) => {
        need("sales", "edit");
        const before = db.products.find((p) => p.id === id);
        mutate({ products: db.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) }, { action: "update", table: "products", recordId: id, before, after: patch });
      },
      deleteProduct: (id) => {
        need("sales", "delete");
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
        need("sales", "edit");
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
        need("sales", "edit");
        const before = db.bomItems.find((i) => i.id === id);
        mutate({ bomItems: db.bomItems.filter((i) => i.id !== id) }, { action: "delete", table: "bom_items", recordId: id, before, after: null });
      },
      addRoutingStep: (productId, operationId, rate, stdMinutes) => {
        need("sales", "edit");
        if (!operationId) throw new Error("اختار العملية الأول.");
        if (db.routingSteps.some((r) => r.productId === productId && r.operationId === operationId)) {
          throw new Error("العملية دي موجودة في المسار.");
        }
        const seq = db.routingSteps.filter((r) => r.productId === productId).reduce((m, r) => Math.max(m, r.seq), 0) + 1;
        const row: RoutingStep = { id: nid(), factoryId: fid(db), productId, operationId, seq, rate, stdMinutes };
        mutate({ routingSteps: [...db.routingSteps, row] }, { action: "create", table: "routing_steps", recordId: row.id, before: null, after: row });
      },
      removeRoutingStep: (id) => {
        need("sales", "edit");
        const before = db.routingSteps.find((r) => r.id === id);
        mutate({ routingSteps: db.routingSteps.filter((r) => r.id !== id) }, { action: "delete", table: "routing_steps", recordId: id, before, after: null });
      },
      addOperation: (name, rate, minutes, outsourced) => {
        need("production", "create");
        if (!name.trim()) throw new Error("اسم العملية مطلوب.");
        const row: Operation = { id: nid(), factoryId: fid(db), name: name.trim(), defaultRate: rate, defaultMinutes: minutes, isOutsourced: outsourced };
        mutate({ operations: [...db.operations, row] }, { action: "create", table: "operations", recordId: row.id, before: null, after: row });
      },
      /* ── التوريد والاستلام والدفعات ─────────────────────────── */
      openSupplyOrder: (input) => {
        need("purchasing", "create");
        if (!db.parties.some((p) => p.id === input.partyId)) throw new Error("اختار المورّد.");
        const lines = input.lines.filter((l) => l.qtyOrdered > 0);
        if (!lines.length) throw new Error("ضيف بند واحد على الأقل بكمية أكبر من صفر.");
        if (input.expectedDate < input.date) throw new Error("ميعاد التوريد مينفعش يكون قبل تاريخ الأمر.");

        const order: SupplyOrder = {
          id: nid(),
          factoryId: fid(db),
          code: nextSerial("SUP", (db.supplyOrders ?? []).map((o) => o.code), input.date),
          partyId: input.partyId,
          date: input.date,
          expectedDate: input.expectedDate,
          status: "open",
          closedAt: null,
          closeReason: null,
          cancelReason: null,
          notes: input.notes.trim(),
        };
        const rows: SupplyOrderLine[] = lines.map((l) => ({
          id: nid(),
          factoryId: fid(db),
          supplyOrderId: order.id,
          itemType: l.itemType,
          itemId: l.itemId,
          qtyOrdered: l.qtyOrdered,
          unitPrice: l.unitPrice,
          notes: l.notes.trim(),
        }));
        mutate(
          {
            supplyOrders: [order, ...(db.supplyOrders ?? [])],
            supplyOrderLines: [...rows, ...(db.supplyOrderLines ?? [])],
          },
          { action: "create", table: "supply_orders", recordId: order.id, before: null, after: order },
        );
        return order.id;
      },
      /**
       * الاستلام.
       *
       * الحركة دي بتلمس تلات دفاتر مع بعض، ولازم تبقى كلها أو ولا حاجة:
       * المقبول بيعمل **دفعة** وبيدخل **المخزن**، وحالة **الأمر** بتتحدّث.
       * ولو أي شرط اتكسر، بنرفض قبل أي كتابة — مش بنكتب نص استلام.
       *
       * والمرفوض والتالف **مابيدخلوش المخزن**. ده مش إهمال: القطعة
       * المرفوضة لسه ملكنا وواقفة في الحوش، بس لو دخلت الرصيد هتتصرف
       * لأمر إنتاج بالغلط. اللي بيرجع للمورّد بيتسجّل في دفتر المرتجعات
       * بحياته.
       */
      receiveSupply: (input) => {
        need("purchasing", "create");
        const order = (db.supplyOrders ?? []).find((o) => o.id === input.supplyOrderId);
        if (!order) throw new Error("أمر التوريد مش موجود.");
        if (order.status === "cancelled") throw new Error("الأمر ملغي.");
        if (order.status === "closed") throw new Error("الأمر مقفول — افتح أمر جديد للباقي.");

        const view = supplyView(db, order);
        const rows = input.lines.filter(
          (l) => l.qtyAccepted > 0 || l.qtyRejected > 0 || l.qtyDamaged > 0 || l.qtyMissing > 0,
        );
        if (!rows.length) throw new Error("سجّل كمية واحدة على الأقل.");

        for (const l of rows) {
          const lv = view.lines.find((x) => x.line.id === l.supplyOrderLineId);
          if (!lv) throw new Error("بند مش من الأمر ده.");
          if (l.qtyAccepted < 0 || l.qtyRejected < 0 || l.qtyDamaged < 0 || l.qtyMissing < 0) {
            throw new Error("الكميات مينفعش تكون بالسالب.");
          }
          const here = l.qtyAccepted + l.qtyRejected + l.qtyDamaged;
          if (here > lv.remaining + 0.0001) {
            throw new Error(
              `${lv.name}: باقي ${qtyText(lv.remaining)} ${lv.unit} من المطلوب — مينفعش تستلم ${qtyText(here)}.`,
            );
          }
        }

        const receipt: SupplyReceipt = {
          id: nid(),
          factoryId: fid(db),
          code: nextSerial("GRN", (db.supplyReceipts ?? []).map((r) => r.code), input.date),
          supplyOrderId: order.id,
          date: input.date,
          warehouseId: input.warehouseId,
          supplierDocNo: input.supplierDocNo.trim(),
          costEntryId: null,
          notes: input.notes.trim(),
        };

        const batches: MaterialBatch[] = [];
        const lines: SupplyReceiptLine[] = [];
        const moves: StockMovement[] = [];
        let serial = (db.batches ?? []).map((b) => b.code);

        for (const l of rows) {
          const lv = view.lines.find((x) => x.line.id === l.supplyOrderLineId)!;
          let batchId: string | null = null;
          if (l.qtyAccepted > 0) {
            const batch: MaterialBatch = {
              id: nid(),
              factoryId: fid(db),
              code: nextSerial("LOT", serial, input.date),
              itemType: lv.line.itemType,
              itemId: lv.line.itemId,
              partyId: order.partyId,
              receiptLineId: null,
              receivedDate: input.date,
              qtyIn: l.qtyAccepted,
              unitCost: lv.line.unitPrice,
              supplierLot: l.supplierLot.trim(),
              expiryDate: l.expiryDate,
              status: "active",
              notes: "",
            };
            serial = [...serial, batch.code];
            batches.push(batch);
            batchId = batch.id;
            moves.push({
              id: nid(),
              factoryId: fid(db),
              date: input.date,
              itemType: lv.line.itemType,
              itemId: lv.line.itemId,
              warehouseId: input.warehouseId,
              kind: "purchase",
              qty: l.qtyAccepted,
              unitCost: lv.line.unitPrice,
              refType: "supply_receipt",
              refId: receipt.id,
              batchId: batch.id,
              notes: `استلام ${receipt.code} — ${order.code}`,
            });
          }
          const row: SupplyReceiptLine = {
            id: nid(),
            factoryId: fid(db),
            receiptId: receipt.id,
            supplyOrderLineId: l.supplyOrderLineId,
            qtyAccepted: l.qtyAccepted,
            qtyRejected: l.qtyRejected,
            qtyDamaged: l.qtyDamaged,
            qtyMissing: l.qtyMissing,
            batchId,
            notes: l.notes.trim(),
          };
          lines.push(row);
          if (batchId) {
            const b = batches.find((x) => x.id === batchId)!;
            b.receiptLineId = row.id;
          }
        }

        // الحالة بتتحسب بعد الاستلام ده، مش بالإيد
        const after: Db = {
          ...db,
          supplyReceiptLines: [...lines, ...(db.supplyReceiptLines ?? [])],
        };
        const derived = supplyView(after, order).derivedStatus;

        mutate(
          {
            supplyReceipts: [receipt, ...(db.supplyReceipts ?? [])],
            supplyReceiptLines: after.supplyReceiptLines,
            batches: [...batches, ...(db.batches ?? [])],
            ...(moves.length ? { stockMovements: [...moves, ...db.stockMovements] } : {}),
            supplyOrders: (db.supplyOrders ?? []).map((o) => (o.id === order.id ? { ...o, status: derived } : o)),
          },
          { action: "create", table: "supply_receipts", recordId: receipt.id, before: null, after: receipt },
        );
        return receipt.id;
      },
      closeSupplyOrder: (id, reason) => {
        need("purchasing", "edit");
        const order = (db.supplyOrders ?? []).find((o) => o.id === id);
        if (!order) throw new Error("أمر التوريد مش موجود.");
        if (order.status === "cancelled" || order.status === "closed") throw new Error("الأمر مقفول أصلًا.");
        if (!reason.trim()) throw new Error("اكتب سبب القفل — العجز لازم يبقى له سبب مكتوب.");
        mutate(
          {
            supplyOrders: (db.supplyOrders ?? []).map((o) =>
              o.id === id ? { ...o, status: "closed" as const, closedAt: cairoToday(), closeReason: reason.trim() } : o,
            ),
          },
          { action: "update", table: "supply_orders", recordId: id, before: order, after: { status: "closed", reason } },
        );
      },
      /**
       * الإلغاء مش حذف. الأمر بيفضل في الدفتر بحالته وسببه، لأنه ممكن
       * يكون عليه استلامات فعلية ومخزون دخل — ومسحه بيخلّي المخزون
       * ييتّم.
       */
      cancelSupplyOrder: (id, reason) => {
        need("purchasing", "edit");
        const order = (db.supplyOrders ?? []).find((o) => o.id === id);
        if (!order) throw new Error("أمر التوريد مش موجود.");
        if (!reason.trim()) throw new Error("اكتب سبب الإلغاء.");
        const got = supplyView(db, order).lines.some((l) => l.received > 0.0001);
        if (got) throw new Error("الأمر ده عليه استلامات فعلية — اقفله بعجز بدل ما تلغيه.");
        mutate(
          {
            supplyOrders: (db.supplyOrders ?? []).map((o) =>
              o.id === id ? { ...o, status: "cancelled" as const, cancelReason: reason.trim() } : o,
            ),
          },
          { action: "update", table: "supply_orders", recordId: id, before: order, after: { status: "cancelled", reason } },
        );
      },
      setBatchStatus: (id, status, note) => {
        need("inventory", "edit");
        const batch = (db.batches ?? []).find((b) => b.id === id);
        if (!batch) throw new Error("الدفعة مش موجودة.");
        mutate(
          {
            batches: (db.batches ?? []).map((b) =>
              b.id === id ? { ...b, status, notes: note.trim() || b.notes } : b,
            ),
          },
          { action: "update", table: "batches", recordId: id, before: batch, after: { status, note } },
        );
      },
      /* ── الاستدعاء ──────────────────────────────────────────── */
      /**
       * فتح استدعاء **بيوقف الدفعة فورًا**.
       *
       * ده مقصود: أول ما يبقى في شك، اللي فاضل في المخزن مايكمّلش نزول
       * إنتاج جديد. توسيع المشكلة وإحنا بنحقق فيها أغلى من وقفة يوم.
       */
      openRecall: (input) => {
        need("quality", "create");
        const batch = (db.batches ?? []).find((b) => b.id === input.batchId);
        if (!batch) throw new Error("اختار الدفعة.");
        if (!input.reason.trim()) throw new Error("اكتب سبب الاستدعاء.");
        const row: Recall = {
          id: nid(),
          factoryId: fid(db),
          code: nextSerial("RCL", (db.recalls ?? []).map((r) => r.code), input.date),
          batchId: input.batchId,
          date: input.date,
          reason: input.reason.trim(),
          severity: input.severity,
          status: "open",
          ownerId: input.ownerId,
          closedAt: null,
          cancelReason: null,
          notes: input.notes.trim(),
        };
        mutate(
          {
            recalls: [row, ...(db.recalls ?? [])],
            batches: (db.batches ?? []).map((b) => (b.id === input.batchId ? { ...b, status: "recalled" as const } : b)),
          },
          { action: "create", table: "recalls", recordId: row.id, before: null, after: row },
        );
        return row.id;
      },
      setRecallStatus: (id, status) => {
        need("quality", "edit");
        const row = (db.recalls ?? []).find((r) => r.id === id);
        if (!row) throw new Error("الاستدعاء مش موجود.");
        if (row.status === "cancelled") throw new Error("الاستدعاء ملغي.");
        mutate(
          {
            recalls: (db.recalls ?? []).map((r) =>
              r.id === id ? { ...r, status, closedAt: status === "closed" ? cairoToday() : r.closedAt } : r,
            ),
          },
          { action: "update", table: "recalls", recordId: id, before: row, after: { status } },
        );
      },
      cancelRecall: (id, reason) => {
        need("quality", "edit");
        const row = (db.recalls ?? []).find((r) => r.id === id);
        if (!row) throw new Error("الاستدعاء مش موجود.");
        if (!reason.trim()) throw new Error("اكتب سبب الإلغاء.");
        /*
         * إلغاء الاستدعاء بيرجّع الدفعة متاحة — بس **بس** لو مافيش
         * استدعاء تاني شغّال عليها. غير كده بتفضل موقوفة.
         */
        const other = (db.recalls ?? []).some(
          (r) => r.id !== id && r.batchId === row.batchId && (r.status === "open" || r.status === "contained"),
        );
        mutate(
          {
            recalls: (db.recalls ?? []).map((r) =>
              r.id === id ? { ...r, status: "cancelled" as const, cancelReason: reason.trim() } : r,
            ),
            batches: other
              ? (db.batches ?? [])
              : (db.batches ?? []).map((b) => (b.id === row.batchId ? { ...b, status: "active" as const } : b)),
          },
          { action: "update", table: "recalls", recordId: id, before: row, after: { status: "cancelled", reason } },
        );
      },
      addStockMovement: (input) => {
        need("inventory", "create");
        if (!input.qty) throw new Error("الكمية لازم تكون أكبر من صفر.");
        const out =
          input.kind === "issue" || input.kind === "waste" || input.kind === "delivery" || input.kind === "maintenance";
        const qty = out ? -Math.abs(input.qty) : input.kind === "adjust" ? input.qty : Math.abs(input.qty);
        if (out && Math.abs(qty) > stockQty(db, input.itemType, input.itemId) + 0.0001) {
          throw new Error("الكمية أكبر من الرصيد المتاح في المخزن.");
        }
        const row: StockMovement = { ...input, qty, id: nid(), factoryId: fid(db) };
        mutate({ stockMovements: [row, ...db.stockMovements] }, { action: "create", table: "stock_movements", recordId: row.id, before: null, after: row });
      },
      issueOrderMaterials: (orderId) => {
        need("inventory", "edit");
        const order = db.orders.find((o) => o.id === orderId);
        if (!order) throw new Error("أمر الإنتاج مش موجود.");
        const bomId = order.bomId ?? (order.productId ? activeBom(db, order.productId)?.id ?? null : null);
        if (!bomLines(db, bomId).length) throw new Error("لازم تربط الأمر بمنتج له قائمة خامات.");
        const reqs = orderRequirements(db, order).filter((r) => r.remaining > 0.0001);
        if (!reqs.length) throw new Error("كل الخامات اتصرفت للأمر ده.");
        const short = reqs.filter((r) => r.shortage > 0.0001);
        if (short.length) throw new Error(`مفيش رصيد كافي من: ${short.map((s) => s.name).join("، ")}`);
        /*
         * الرصيد الكلي مش كله متاح: اللي في دفعة موقوفة أو متستدعاة
         * ممنوع ينزل إنتاج. لو ماتحققناش من ده، الصرف كان هيكمّل الكمية
         * من الموقوف بحركة بلا دفعة — يعني نستهلك بإيدينا الدفعة اللي
         * بنسحبها.
         */
        const blocked = reqs.filter((r) => r.remaining > issuableQty(db, "material", r.materialId) + 0.0001);
        if (blocked.length) {
          throw new Error(
            `رصيد موقوف في دفعات مش متاحة للصرف: ${blocked.map((b) => b.name).join("، ")}. راجع الدفعات أو استلم توريد جديد.`,
          );
        }
        const date = cairoToday();
        const wh = db.warehouses.find((w) => w.kind === "material")?.id ?? null;
        /*
         * الصرف بيتقسّم على الدفعات بالأقدم الأول.
         *
         * وده اللي بيخلّي سلسلة التتبّع تتكتب وقت الصرف، مش بعد كده
         * بالتخمين: كل حركة بتحمل الدفعة اللي نزلت منها، فلما دفعة تطلع
         * فيها مشكلة نعرف أنهي أمر بالتحديد نزلت فيه.
         *
         * والكمية اللي مالقتش دفعة بتخرج بحركة بلا دفعة زي الأول بالظبط.
         * ده مقصود: مخزون قديم بلا لوط رصيد حقيقي، ومنع الصرف منه لحد ما
         * يتلوّط كان هيوقف مصانع شغّالة عشان بيانات ماضية.
         */
        const rows: StockMovement[] = [];
        for (const r of reqs) {
          const { picks, unbatched } = allocateFifo(db, "material", r.materialId, r.remaining);
          for (const pick of picks) {
            rows.push({
              id: nid(),
              factoryId: fid(db),
              date,
              itemType: "material",
              itemId: r.materialId,
              warehouseId: wh,
              kind: "issue",
              qty: -pick.qty,
              unitCost: pick.unitCost,
              refType: "order",
              refId: order.id,
              batchId: pick.batchId,
              notes: `صرف لأمر ${order.code}`,
            });
          }
          if (unbatched > 0.0001) {
            rows.push({
              id: nid(),
              factoryId: fid(db),
              date,
              itemType: "material",
              itemId: r.materialId,
              warehouseId: wh,
              kind: "issue",
              qty: -unbatched,
              unitCost: r.unitCost,
              refType: "order",
              refId: order.id,
              batchId: null,
              notes: `صرف لأمر ${order.code}`,
            });
          }
        }
        mutate(
          {
            stockMovements: [...rows, ...db.stockMovements],
            orders: db.orders.map((o) => (o.id === orderId ? { ...o, materialsIssuedAt: date, bomId: bomId } : o)),
          },
          { action: "create", table: "stock_movements", recordId: rows[0].id, before: null, after: { order: order.code, lines: rows.length } },
        );
      },
      addStageEntry: (input) => {
        need("production", "create");
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
        // الاسترجاع لصاحب المصنع بس. جهاز مفيهوش حساب بيستخدم الاسترجاع
        // كأول خطوة (نقل مصنع لجهاز جديد)، فمفيش دور يتأكد منه ساعتها.
        if (session) need("settings", "edit");
        if (file.kind !== "factory-backup" || file.version !== 1 || !file.data?.factory) {
          throw new Error("ملف النسخة الاحتياطية مش مفهوم.");
        }
        // النسخة بترجع في مفتاح المصنع بتاعها، فمش بتكتب فوق مصنع تاني على الجهاز
        const key = dbKeyOf(file.data.factory.id);
        setBook({ key, data: file.data });
        setMissing(null);
        registerDeviceFactory(file.data, key);
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
        /* الحماية هنا مش في الواجهة: الرجوع بيمسح كل حاجة، فلازم يرفض على
           أي مساحة مش تجريبية حتى لو حد ناداه من غير الزرار */
        if (!db.factory?.demo) throw new Error("المساحة دي مش تجريبية — الرجوع كان هيمسح داتا حقيقية.");
        const seeded = demoDb();
        const key = dbKeyOf(seeded.factory!.id);
        setBook({ key, data: seeded });
        registerDeviceFactory(seeded, key);
        const member = seeded.members.find((m) => m.id === session?.memberId) ?? seeded.members[0];
        login(member);
      },
      addParty: (input) => {
        need("parties", "create");
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
        need("parties", "edit");
        const before = db.parties.find((p) => p.id === id);
        mutate(
          { parties: db.parties.map((p) => (p.id === id ? { ...p, ...patch } : p)) },
          { action: "update", table: "parties", recordId: id, before, after: patch },
        );
      },
      deleteParty: (id) => {
        need("parties", "delete");
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
        need("parties", "edit");
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
        need("parties", "edit");
        if (!input.name.trim()) throw new Error("اسم جهة الاتصال مطلوب.");
        const row: PartyContact = { ...input, id: nid(), factoryId: fid(db), name: input.name.trim() };
        mutate({ contacts: [...db.contacts, row] }, { action: "create", table: "party_contacts", recordId: row.id, before: null, after: row });
      },
      removeContact: (id) => {
        need("parties", "edit");
        const before = db.contacts.find((c) => c.id === id);
        mutate({ contacts: db.contacts.filter((c) => c.id !== id) }, { action: "delete", table: "party_contacts", recordId: id, before, after: null });
      },
      addAddress: (input) => {
        need("parties", "edit");
        if (!input.line.trim()) throw new Error("اكتب العنوان.");
        const row: PartyAddress = { ...input, id: nid(), factoryId: fid(db) };
        mutate({ addresses: [...db.addresses, row] }, { action: "create", table: "party_addresses", recordId: row.id, before: null, after: row });
      },
      removeAddress: (id) => {
        need("parties", "edit");
        const before = db.addresses.find((a) => a.id === id);
        mutate({ addresses: db.addresses.filter((a) => a.id !== id) }, { action: "delete", table: "party_addresses", recordId: id, before, after: null });
      },
      addCommunication: (input) => {
        need("parties", "create");
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
        need("parties", "create");
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
        need("parties", "edit");
        const before = db.tasks.find((t) => t.id === id);
        mutate(
          { tasks: db.tasks.map((t) => (t.id === id ? { ...t, status: t.status === "open" ? "done" : "open" } : t)) },
          { action: "update", table: "party_tasks", recordId: id, before, after: { toggled: true } },
        );
      },
      addDelivery: (input) => {
        need("sales", "create");
        if (!input.amount || input.amount <= 0) throw new Error("مينفعش توريد بمبلغ صفر.");
        const row: Delivery = { ...input, id: nid(), factoryId: fid(db) };
        mutate({ deliveries: [row, ...db.deliveries] }, { action: "create", table: "deliveries", recordId: row.id, before: null, after: row });
      },
      deleteDelivery: (id) => {
        need("sales", "delete");
        const before = db.deliveries.find((d) => d.id === id);
        mutate({ deliveries: db.deliveries.filter((d) => d.id !== id) }, { action: "delete", table: "deliveries", recordId: id, before, after: null });
      },
      addCollection: (input) => {
        need("finance", "create");
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
        need("finance", "edit");
        const before = db.collections.find((c) => c.id === id);
        mutate(
          { collections: db.collections.map((c) => (c.id === id ? { ...c, status: "confirmed" as const } : c)) },
          { action: "update", table: "collections", recordId: id, before, after: { status: "confirmed" } },
        );
      },
      deleteCollection: (id) => {
        need("finance", "delete");
        const before = db.collections.find((c) => c.id === id);
        mutate({ collections: db.collections.filter((c) => c.id !== id) }, { action: "delete", table: "collections", recordId: id, before, after: null });
      },
      addCostItem: (name, unit) => {
        need("purchasing", "create");
        const row: CostItem = { id: nid(), factoryId: fid(db), name: name.trim(), unit: unit.trim() || "بند" };
        mutate({ costItems: [...db.costItems, row] }, { action: "create", table: "cost_items", recordId: row.id, before: null, after: row });
      },
      addCostEntry: (input) => {
        need("purchasing", "create");
        if (!input.amount || input.amount <= 0) throw new Error("المبلغ لازم أكبر من صفر.");
        const row: CostEntry = { ...input, id: nid(), factoryId: fid(db) };
        mutate({ costEntries: [row, ...db.costEntries] }, { action: "create", table: "cost_entries", recordId: row.id, before: null, after: row });
      },
      addCostPayment: (input) => {
        need("finance", "create");
        if (!input.amount || input.amount <= 0) throw new Error("دفعة بمبلغ صفر مش مقبولة.");
        const row: CostPayment = { ...input, id: nid(), factoryId: fid(db) };
        mutate({ costPayments: [row, ...db.costPayments] }, { action: "create", table: "cost_payments", recordId: row.id, before: null, after: row });
      },
      deleteCostEntry: (id) => {
        need("purchasing", "delete");
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
        need("workers", "create");
        const row: Worker = { id: nid(), factoryId: fid(db), name: input.name.trim(), payType: input.payType, rate: input.rate, phone: input.phone.trim() };
        mutate({ workers: [row, ...db.workers] }, { action: "create", table: "workers", recordId: row.id, before: null, after: row });
      },
      updateWorker: (id, patch) => {
        need("workers", "edit");
        const before = db.workers.find((w) => w.id === id);
        mutate({ workers: db.workers.map((w) => (w.id === id ? { ...w, ...patch } : w)) }, { action: "update", table: "workers", recordId: id, before, after: patch });
      },
      deleteWorker: (id) => {
        need("workers", "delete");
        const before = db.workers.find((w) => w.id === id);
        mutate({ workers: db.workers.filter((w) => w.id !== id) }, { action: "delete", table: "workers", recordId: id, before, after: null });
      },
      markAttendance: (workerIds, date) => {
        need("workers", "create");
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
        need("workers", "create");
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
        need("finance", "create");
        if (!input.amount || input.amount <= 0) throw new Error("المبلغ لازم أكبر من صفر.");
        const row: WorkerPayment = { ...input, id: nid(), factoryId: fid(db) };
        mutate({ workerPayments: [row, ...db.workerPayments] }, { action: "create", table: "worker_payments", recordId: row.id, before: null, after: row });
      },
      addOrder: (input) => {
        need("production", "create");
        const row: Order = { ...input, id: nid(), factoryId: fid(db), code: nextOrderCode(db.orders) };
        mutate({ orders: [row, ...db.orders] }, { action: "create", table: "orders", recordId: row.id, before: null, after: row });
      },
      updateOrder: (id, patch) => {
        need("production", "edit");
        const before = db.orders.find((o) => o.id === id);
        mutate({ orders: db.orders.map((o) => (o.id === id ? { ...o, ...patch } : o)) }, { action: "update", table: "orders", recordId: id, before, after: patch });
      },
      deleteOrder: (id) => {
        need("production", "delete");
        const before = db.orders.find((o) => o.id === id);
        mutate({ orders: db.orders.filter((o) => o.id !== id) }, { action: "delete", table: "orders", recordId: id, before, after: null });
      },
      addManualTx: (input) => {
        need("finance", "create");
        const row: ManualTx = { ...input, id: nid(), factoryId: fid(db) };
        mutate({ manualTx: [row, ...db.manualTx] }, { action: "create", table: "manual_tx", recordId: row.id, before: null, after: row });
      },

      /* ── القص والفرشة ─────────────────────────────────────────── */

      addLay: (input) => {
        need("production", "create");
        const order = db.orders.find((o) => o.id === input.orderId);
        if (!order) throw new Error("أمر الإنتاج مش موجود.");
        if (!materialById(db, input.materialId)) throw new Error("لازم تختار القماش من الخامات.");
        if (input.plies < 1) throw new Error("عدد الطبقات لازم يكون واحد على الأقل.");
        if (input.markerLengthM <= 0) throw new Error("طول الماركر مطلوب — منه بيتحسب القماش.");
        const sizes = input.sizes.filter((s) => s.size.trim() && s.perPly > 0);
        if (!sizes.length) throw new Error("لازم مقاس واحد على الأقل بعدد قطع في الطبقة.");

        const lay: CutLay = {
          id: nid(),
          factoryId: fid(db),
          orderId: input.orderId,
          materialId: input.materialId,
          operationId: input.operationId,
          color: input.color.trim(),
          date: input.date,
          plies: input.plies,
          markerLengthM: input.markerLengthM,
          endAllowanceM: input.endAllowanceM,
          markerWidthM: input.markerWidthM,
          status: "planned",
          cutAt: null,
          fabricUsedM: null,
          notes: input.notes.trim(),
        };
        const lines: CutLayLine[] = sizes.map((s) => ({
          id: nid(),
          factoryId: fid(db),
          layId: lay.id,
          size: s.size.trim(),
          perPly: s.perPly,
        }));
        mutate(
          { cutLays: [lay, ...db.cutLays], cutLayLines: [...lines, ...db.cutLayLines] },
          { action: "create", table: "cut_lays", recordId: lay.id, before: null, after: { ...lay, sizes: lines.length } },
        );
        return lay.id;
      },
      updateLay: (id, patch) => {
        need("production", "edit");
        const before = db.cutLays.find((l) => l.id === id);
        if (!before) throw new Error("الفرشة مش موجودة.");
        // الفرشة المقصوصة مابتتعدّلش: القماش خرج والإنتاج اتسجّل، والتعديل
        // بعد كده معناه ورق بيخالف المخزن. عايز تغيّر؟ ألغِ وافرش تاني.
        if (before.status === "cut") throw new Error("الفرشة اتقصّت خلاص — التعديل بعد القص مايغيّرش القماش اللي خرج.");
        if (before.status === "cancelled") throw new Error("الفرشة ملغية.");
        mutate(
          { cutLays: db.cutLays.map((l) => (l.id === id ? { ...l, ...patch } : l)) },
          { action: "update", table: "cut_lays", recordId: id, before, after: patch },
        );
      },
      setLaySizes: (layId, sizes) => {
        need("production", "edit");
        const lay = db.cutLays.find((l) => l.id === layId);
        if (!lay) throw new Error("الفرشة مش موجودة.");
        if (lay.status !== "planned") throw new Error("مقاسات الفرشة بتتعدّل قبل القص بس.");
        const clean = sizes.filter((s) => s.size.trim() && s.perPly > 0);
        if (!clean.length) throw new Error("لازم مقاس واحد على الأقل.");
        const before = db.cutLayLines.filter((l) => l.layId === layId);
        const lines: CutLayLine[] = clean.map((s) => ({
          id: nid(),
          factoryId: fid(db),
          layId,
          size: s.size.trim(),
          perPly: s.perPly,
        }));
        mutate(
          { cutLayLines: [...lines, ...db.cutLayLines.filter((l) => l.layId !== layId)] },
          { action: "update", table: "cut_lay_lines", recordId: layId, before, after: lines },
        );
      },
      cancelLay: (id, reason) => {
        need("production", "edit");
        const before = db.cutLays.find((l) => l.id === id);
        if (!before) throw new Error("الفرشة مش موجودة.");
        if (!reason.trim()) throw new Error("الإلغاء لازم له سبب مكتوب.");
        if (before.status === "cut") throw new Error("مينفعش تلغي فرشة اتقصّت — القماش خرج والباندلات موجودة.");
        mutate(
          { cutLays: db.cutLays.map((l) => (l.id === id ? { ...l, status: "cancelled", cancelReason: reason.trim() } : l)) },
          { action: "update", table: "cut_lays", recordId: id, before, after: { status: "cancelled", reason: reason.trim() } },
        );
      },
      /**
       * القص: أربع حاجات في حركة واحدة، وكلها بتنجح مع بعض أو تفشل مع بعض —
       * القماش بيخرج من المخزن، الإنتاج بيتسجّل في الدفتر، الباندلات بتتولد
       * بتيكتاتها، والفرشة بتتقفل. لأن «قصّيت بس القماش لسه في المخزن» مش
       * حالة ينفع تحصل.
       */
      cutLayNow: (id, input) => {
        need("production", "create");
        need("inventory", "edit");
        const lay = db.cutLays.find((l) => l.id === id);
        if (!lay) throw new Error("الفرشة مش موجودة.");
        if (lay.status !== "planned") throw new Error("الفرشة دي مش مخططة — يا مقصوصة يا ملغية.");
        const order = db.orders.find((o) => o.id === lay.orderId);
        if (!order) throw new Error("أمر الإنتاج مش موجود.");
        const m = layMath(db, lay);
        if (!m.pieces) throw new Error("الفرشة مالهاش قطع — راجع المقاسات والطبقات.");

        const used = input.fabricUsedM > 0 ? input.fabricUsedM : m.plannedM;
        const available = stockQty(db, "material", lay.materialId);
        if (used > available + 0.0001) {
          throw new Error(`رصيد ${m.materialName} ${qtyText(available)} بس، والفرشة عايزة ${qtyText(used)}.`);
        }
        const cut = orderCutSummary(db, order).cutPieces;
        if (cut + m.pieces > order.quantity) {
          throw new Error(`الأمر ${order.quantity} قطعة، ومقصوص منه ${cut} — الفرشة دي بتعدّي الكمية.`);
        }

        const date = cairoToday();
        const now = new Date().toISOString();
        const movement: StockMovement = {
          id: nid(),
          factoryId: fid(db),
          date,
          itemType: "material",
          itemId: lay.materialId,
          warehouseId: db.warehouses.find((w) => w.kind === "material")?.id ?? null,
          kind: "issue",
          qty: -used,
          unitCost: materialById(db, lay.materialId)?.avgCost ?? 0,
          refType: "lay",
          refId: lay.id,
          notes: `فرشة ${order.code} — ${lay.plies} طبقة`,
        };

        const seqStart = nextBundleSeq(db, order.id);
        const plan = planBundles(m.sizes.map((s) => ({ size: s.size, pieces: s.pieces })), input.perBundle);
        const bundles: Bundle[] = plan.map((p, i) => ({
          id: nid(),
          factoryId: fid(db),
          code: bundleCode(order.code, seqStart + i),
          orderId: order.id,
          layId: lay.id,
          size: p.size,
          color: lay.color,
          qty: p.qty,
          createdAt: now,
        }));

        // الإنتاج بيتسجّل في نفس دفتر المراحل زي أي تسجيل تاني، فالتقدّم
        // والتكلفة والأجور مابيحتاجوش يعرفوا إن ده جه من فرشة
        const stage: StageEntry[] = [];
        const earnings: WorkerEarning[] = [];
        if (lay.operationId) {
          const route = order.productId
            ? routingLines(db, order.productId).find((r) => r.operationId === lay.operationId)
            : undefined;
          const rate = route?.rate ?? operationById(db, lay.operationId)?.defaultRate ?? 0;
          const row: StageEntry = {
            id: nid(),
            factoryId: fid(db),
            orderId: order.id,
            operationId: lay.operationId,
            date,
            workerId: input.workerId,
            qtyGood: m.pieces,
            qtyRework: 0,
            qtyScrap: 0,
            rate,
          };
          stage.push(row);
          const worker = input.workerId ? db.workers.find((w) => w.id === input.workerId) : null;
          if (worker && worker.payType === "piece") {
            earnings.push({
              id: nid(),
              factoryId: fid(db),
              workerId: worker.id,
              date,
              kind: "piece",
              amount: (rate || worker.rate) * m.pieces,
              notes: `قص ${m.pieces} قطعة — ${order.code}`,
            });
          }
        }

        const stageEntries = [...stage, ...db.stageEntries];
        const progress = computedProgress({ ...db, stageEntries }, order);
        mutate(
          {
            cutLays: db.cutLays.map((l) => (l.id === id ? { ...l, status: "cut", cutAt: now, fabricUsedM: used } : l)),
            bundles: [...bundles, ...db.bundles],
            stockMovements: [movement, ...db.stockMovements],
            stageEntries,
            workerEarnings: earnings.length ? [...earnings, ...db.workerEarnings] : db.workerEarnings,
            orders:
              progress === null
                ? db.orders
                : db.orders.map((o) => (o.id === order.id ? { ...o, progress } : o)),
          },
          {
            action: "update",
            table: "cut_lays",
            recordId: lay.id,
            before: { status: lay.status },
            after: { status: "cut", fabricUsedM: used, pieces: m.pieces, bundles: bundles.length },
          },
        );
      },

      /* ── تتبع العملية على الباندل ─────────────────────────────── */

      startBundleOp: (input) => {
        need("production", "create");
        const bundle = db.bundles.find((b) => b.id === input.bundleId);
        if (!bundle) throw new Error("الباندل مش موجود.");
        const st = bundleState(db, bundle);
        if (st.active) throw new Error(`الباندل ده ${st.label} — اقفل العملية اللي شغالة الأول.`);
        const order = db.orders.find((o) => o.id === bundle.orderId);
        if (!order) throw new Error("أمر الإنتاج مش موجود.");
        const routes = order.productId ? routingLines(db, order.productId) : [];
        if (!routes.length) throw new Error("المنتج مالوش مسار تصنيع — ضيف العمليات الأول.");
        const wanted = input.operationId ?? st.nextOperationId;
        if (!wanted) throw new Error("الباندل ده خلّص كل عمليات المسار.");
        const route = routes.find((r) => r.operationId === wanted);
        if (!route) throw new Error("العملية دي مش في مسار المنتج.");

        const row: BundleOp = {
          id: nid(),
          factoryId: fid(db),
          bundleId: bundle.id,
          orderId: bundle.orderId,
          operationId: route.operationId,
          seq: route.seq,
          workerId: input.workerId,
          state: "running",
          startedAt: new Date().toISOString(),
          endedAt: null,
          pausedMinutes: 0,
          pausedAt: null,
          pauseNote: "",
          qtyGood: 0,
          qtyRework: 0,
          qtyScrap: 0,
          rate: route.rate,
          stdMinutes: route.stdMinutes,
          defect: "",
          stageEntryId: null,
          notes: "",
          /*
           * الماكينة اختيارية: الإنتاج لازم يتسجّل سواء العامل اختارها أو
           * لأ. اللي بيختار بياخد نسبة تشغيل حقيقية للماكينة، واللي
           * مابيختارش بياخد جاهزية من التوقف — والشاشة بتقول التغطية كام.
           */
          machineId: input.machineId ?? null,
        };
        mutate(
          { bundleOps: [row, ...db.bundleOps] },
          { action: "create", table: "bundle_ops", recordId: row.id, before: null, after: row },
        );
        return row.id;
      },
      pauseBundleOp: (id, note) => {
        need("production", "edit");
        const before = db.bundleOps.find((o) => o.id === id);
        if (!before) throw new Error("التسجيل مش موجود.");
        if (before.state !== "running") throw new Error("العملية دي مش شغالة.");
        const after = { state: "paused" as const, pausedAt: new Date().toISOString(), pauseNote: note.trim() };
        mutate(
          { bundleOps: db.bundleOps.map((o) => (o.id === id ? { ...o, ...after } : o)) },
          { action: "update", table: "bundle_ops", recordId: id, before, after },
        );
      },
      resumeBundleOp: (id) => {
        need("production", "edit");
        const before = db.bundleOps.find((o) => o.id === id);
        if (!before) throw new Error("التسجيل مش موجود.");
        if (before.state !== "paused") throw new Error("العملية دي مش واقفة.");
        // وقت التوقف بيتراكم في `pausedMinutes` عشان الكفاءة تتحسب على
        // الوقت اللي الشغل كان ماشي فيه فعلًا، مش على الساعة من غير خصم
        const added = before.pausedAt ? Math.max(0, (Date.now() - Date.parse(before.pausedAt)) / 60000) : 0;
        const after = {
          state: "running" as const,
          pausedAt: null,
          pausedMinutes: before.pausedMinutes + Math.round(added),
        };
        mutate(
          { bundleOps: db.bundleOps.map((o) => (o.id === id ? { ...o, ...after } : o)) },
          { action: "update", table: "bundle_ops", recordId: id, before, after },
        );
      },
      finishBundleOp: (id, input) => {
        need("production", "create");
        const before = db.bundleOps.find((o) => o.id === id);
        if (!before) throw new Error("التسجيل مش موجود.");
        if (before.state === "done") throw new Error("العملية دي مقفولة خلاص.");
        const bundle = db.bundles.find((b) => b.id === before.bundleId);
        if (!bundle) throw new Error("الباندل مش موجود.");
        const order = db.orders.find((o) => o.id === before.orderId);
        if (!order) throw new Error("أمر الإنتاج مش موجود.");
        const total = input.qtyGood + input.qtyRework + input.qtyScrap;
        if (total <= 0) throw new Error("سجّل كمية واحدة على الأقل.");
        if (total > bundle.qty) throw new Error(`الباندل ${bundle.qty} قطعة — مينفعش تسجّل ${total}.`);

        const now = new Date().toISOString();
        const paused = before.state === "paused" && before.pausedAt
          ? before.pausedMinutes + Math.round(Math.max(0, (Date.now() - Date.parse(before.pausedAt)) / 60000))
          : before.pausedMinutes;

        // نفس حارس دفتر الإنتاج: مينفعش عملية تعدّي اللي قبلها. بنسأله
        // الأول عشان الرفض ييجي قبل أي كتابة، مش بعد نصها.
        const stages = orderStages(db, order);
        const here = stages.find((s) => s.operationId === before.operationId);
        const done = (here?.good ?? 0) + (here?.scrap ?? 0);
        if (done + input.qtyGood + input.qtyScrap > order.quantity) {
          throw new Error(`كمية الأمر ${order.quantity} والمرحلة دي خلّصت ${done} خلاص.`);
        }
        const idx = stages.findIndex((s) => s.operationId === before.operationId);
        if (idx > 0) {
          const prev = stages[idx - 1];
          if (done + input.qtyGood + input.qtyScrap > prev.good) {
            throw new Error(`مرحلة ${prev.name} خلّصت ${prev.good} بس — مينفعش اللي بعدها تعدّيها.`);
          }
        }

        const stage: StageEntry = {
          id: nid(),
          factoryId: fid(db),
          orderId: order.id,
          operationId: before.operationId,
          date: cairoToday(),
          workerId: before.workerId,
          qtyGood: input.qtyGood,
          qtyRework: input.qtyRework,
          qtyScrap: input.qtyScrap,
          rate: before.rate,
        };
        const worker = before.workerId ? db.workers.find((w) => w.id === before.workerId) : null;
        const earnings: WorkerEarning[] =
          worker && worker.payType === "piece" && input.qtyGood > 0
            ? [
                {
                  id: nid(),
                  factoryId: fid(db),
                  workerId: worker.id,
                  date: stage.date,
                  kind: "piece",
                  amount: (before.rate || worker.rate) * input.qtyGood,
                  notes: `${input.qtyGood} قطعة — ${bundle.code}`,
                },
              ]
            : [];

        const after = {
          state: "done" as const,
          endedAt: now,
          pausedAt: null,
          pausedMinutes: paused,
          qtyGood: input.qtyGood,
          qtyRework: input.qtyRework,
          qtyScrap: input.qtyScrap,
          defect: input.defect.trim(),
          stageEntryId: stage.id,
        };
        const stageEntries = [stage, ...db.stageEntries];
        const progress = computedProgress({ ...db, stageEntries }, order);
        mutate(
          {
            bundleOps: db.bundleOps.map((o) => (o.id === id ? { ...o, ...after } : o)),
            stageEntries,
            workerEarnings: earnings.length ? [...earnings, ...db.workerEarnings] : db.workerEarnings,
            orders:
              progress === null ? db.orders : db.orders.map((o) => (o.id === order.id ? { ...o, progress } : o)),
          },
          { action: "update", table: "bundle_ops", recordId: id, before, after },
        );
      },
      reportIssue: (input) => {
        need("production", "create");
        if (!input.note.trim()) throw new Error("اكتب المشكلة في سطر — البلاغ بلا وصف مالوش لازمة.");
        const row: FloorIssue = {
          id: nid(),
          factoryId: fid(db),
          kind: input.kind,
          line: input.line,
          orderId: input.orderId,
          bundleId: input.bundleId,
          workerId: input.workerId,
          note: input.note.trim(),
          at: new Date().toISOString(),
          status: "open",
          resolvedAt: null,
          resolvedBy: null,
        };
        mutate(
          { floorIssues: [row, ...db.floorIssues] },
          { action: "create", table: "floor_issues", recordId: row.id, before: null, after: row },
        );
      },
      resolveIssue: (id) => {
        need("production", "edit");
        const before = db.floorIssues.find((i) => i.id === id);
        if (!before) throw new Error("البلاغ مش موجود.");
        if (before.status === "resolved") return;
        const after = { status: "resolved" as const, resolvedAt: new Date().toISOString(), resolvedBy: session?.memberId ?? "" };
        mutate(
          { floorIssues: db.floorIssues.map((i) => (i.id === id ? { ...i, ...after } : i)) },
          { action: "update", table: "floor_issues", recordId: id, before, after },
        );
      },

      /* ── الماكينات والصيانة ──────────────────────────────────── */

      addMachine: (input) => {
        need("machines", "create");
        if (!input.name.trim()) throw new Error("اكتب اسم الماكينة.");
        if (input.dailyMinutes < 0) throw new Error("دقايق التشغيل في اليوم ماتكونش بالسالب.");
        if (input.serviceEveryDays < 0) throw new Error("مدة الصيانة الدورية ماتكونش بالسالب.");
        /*
         * الكود بيتولّد بالتسلسل ومابيتكرّرش: هو اللي بيتطبع على الماكينة
         * نفسها ويتمسح، فلو اتكرّر كان بيوصّل الفني لملف ماكينة تانية.
         */
        const used = new Set((db.machines ?? []).map((m) => m.code));
        let n = (db.machines ?? []).length + 1;
        let code = `MCH-${String(n).padStart(3, "0")}`;
        while (used.has(code)) code = `MCH-${String(++n).padStart(3, "0")}`;

        const row: Machine = {
          id: nid(),
          factoryId: fid(db),
          code,
          name: input.name.trim(),
          kind: input.kind,
          brand: input.brand.trim(),
          serial: input.serial.trim(),
          line: input.line,
          warehouseId: input.warehouseId,
          state: "running",
          boughtOn: input.boughtOn,
          cost: input.cost,
          dailyMinutes: input.dailyMinutes,
          serviceEveryDays: input.serviceEveryDays,
          lastServiceOn: input.lastServiceOn,
          notes: input.notes.trim(),
        };
        mutate(
          { machines: [row, ...(db.machines ?? [])] },
          { action: "create", table: "machines", recordId: row.id, before: null, after: row },
        );
        return row.id;
      },
      updateMachine: (id, patch) => {
        need("machines", "edit");
        const before = (db.machines ?? []).find((m) => m.id === id);
        if (!before) throw new Error("الماكينة مش موجودة.");
        /*
         * الحالة مابتتغيّرش بالإيد لماكينة عندها تذكرة مفتوحة: التذكرة هي
         * اللي بتحكم الحالة. لو سمحنا بالاتنين، الشاشة كانت تقول «شغّالة»
         * والتذكرة لسه مفتوحة عليها — وساعتها التوقف مش بيتحسب.
         */
        if (patch.state && patch.state !== before.state) {
          const open = (db.machineTickets ?? []).some(
            (t) => t.machineId === id && (t.state === "open" || t.state === "working"),
          );
          if (open && patch.state !== "down" && patch.state !== "maintenance") {
            throw new Error("الماكينة عليها تذكرة مفتوحة — اقفل التذكرة الأول وحالتها بتترجع لوحدها.");
          }
        }
        mutate(
          { machines: (db.machines ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)) },
          { action: "update", table: "machines", recordId: id, before, after: patch },
        );
      },
      retireMachine: (id, reason) => {
        need("machines", "edit");
        const before = (db.machines ?? []).find((m) => m.id === id);
        if (!before) throw new Error("الماكينة مش موجودة.");
        if (!reason.trim()) throw new Error("اكتب سبب خروجها من الخدمة.");
        const open = (db.machineTickets ?? []).filter(
          (t) => t.machineId === id && (t.state === "open" || t.state === "working"),
        );
        if (open.length) throw new Error("فيها تذكرة مفتوحة — اقفلها أو الغيها الأول.");
        const after = {
          state: "retired" as const,
          dailyMinutes: 0,
          notes: [before.notes, `خرجت من الخدمة: ${reason.trim()}`].filter(Boolean).join(" — "),
        };
        mutate(
          { machines: (db.machines ?? []).map((m) => (m.id === id ? { ...m, ...after } : m)) },
          { action: "update", table: "machines", recordId: id, before, after },
        );
      },
      openTicket: (input) => {
        need("machines", "create");
        const machine = (db.machines ?? []).find((m) => m.id === input.machineId);
        if (!machine) throw new Error("الماكينة مش موجودة.");
        if (machine.state === "retired") throw new Error("الماكينة خارج الخدمة — رجّعها للخدمة الأول.");
        if (!input.cause.trim()) throw new Error("اكتب العطل أو سبب الصيانة.");
        const dup = (db.machineTickets ?? []).find(
          (t) => t.machineId === input.machineId && (t.state === "open" || t.state === "working"),
        );
        if (dup) throw new Error(`الماكينة عليها تذكرة مفتوحة بالفعل (${dup.code}).`);

        const year = Number(input.reportedOn.slice(0, 4));
        const seq =
          (db.machineTickets ?? []).filter((t) => t.code.startsWith(`MNT-${year}-`)).length + 1;
        const row: MachineTicket = {
          id: nid(),
          factoryId: fid(db),
          code: `MNT-${year}-${String(seq).padStart(6, "0")}`,
          machineId: input.machineId,
          kind: input.kind,
          state: "open",
          reportedOn: input.reportedOn,
          issueId: input.issueId,
          startedAt: null,
          endedAt: null,
          downMinutes: 0,
          cause: input.cause.trim(),
          action: "",
          workerId: input.workerId,
          partyId: input.partyId,
          laborCost: 0,
          outsideCost: 0,
          notes: input.notes.trim(),
        };
        /*
         * فتح تذكرة **بيوقّف الماكينة فعلًا**: العطل بيخليها `down`
         * والصيانة الدورية `maintenance`. من غير ده، «الماكينة عطلانة»
         * كانت بتبقى كلام في تذكرة وحالة الماكينة بتقول شغّالة.
         */
        mutate(
          {
            machineTickets: [row, ...(db.machineTickets ?? [])],
            machines: (db.machines ?? []).map((m) =>
              m.id === input.machineId ? { ...m, state: input.kind === "breakdown" ? "down" : "maintenance" } : m,
            ),
          },
          { action: "create", table: "machine_tickets", recordId: row.id, before: null, after: row },
        );
        return row.id;
      },
      startTicket: (id) => {
        need("machines", "edit");
        const before = (db.machineTickets ?? []).find((t) => t.id === id);
        if (!before) throw new Error("التذكرة مش موجودة.");
        if (before.state !== "open") throw new Error("التذكرة دي مش مفتوحة.");
        const after = { state: "working" as const, startedAt: new Date().toISOString() };
        mutate(
          { machineTickets: (db.machineTickets ?? []).map((t) => (t.id === id ? { ...t, ...after } : t)) },
          { action: "update", table: "machine_tickets", recordId: id, before, after },
        );
      },
      closeTicket: (id, input) => {
        need("machines", "edit");
        const before = (db.machineTickets ?? []).find((t) => t.id === id);
        if (!before) throw new Error("التذكرة مش موجودة.");
        if (before.state === "done") throw new Error("التذكرة مقفولة بالفعل.");
        if (before.state === "cancelled") throw new Error("التذكرة ملغاة.");
        if (!input.action.trim()) throw new Error("اكتب اللي اتعمل — التذكرة اللي بتتقفل بلا إجراء مابتعلّمش حاجة.");
        if (input.downMinutes < 0) throw new Error("وقت التوقف ماينفعش بالسالب.");
        const machine = (db.machines ?? []).find((m) => m.id === before.machineId);
        if (!machine) throw new Error("الماكينة مش موجودة.");

        /*
         * قطع الغيار بتخرج بحركة مخزون حقيقية بنوع «صيانة».
         *
         * فالرصيد بيقل، والتكلفة بتطلع من الدفتر — ومابتدخلش تكلفة
         * القطعة المنتَجة (نوع الحركة مختلف عن الصرف لأمر إنتاج)، لأن
         * صيانة ماكينة تكلفة تشغيل عامة مش خامة في القطعة.
         */
        const parts = input.parts.filter((p) => p.materialId && p.qty > 0);
        const moves: StockMovement[] = [];
        const today = cairoToday();
        for (const p of parts) {
          const material = db.materials.find((m) => m.id === p.materialId);
          if (!material) throw new Error("قطعة غيار مش موجودة في الخامات.");
          const available = stockQty(db, "material", p.materialId);
          if (p.qty > available + 0.0001) {
            throw new Error(`رصيد ${material.name} مش كفاية: المتاح ${available}.`);
          }
          moves.push({
            id: nid(),
            factoryId: fid(db),
            date: today,
            itemType: "material",
            itemId: p.materialId,
            warehouseId: db.warehouses.find((w) => w.kind === "material")?.id ?? null,
            kind: "maintenance",
            qty: -Math.abs(p.qty),
            unitCost: material.avgCost,
            refType: "ticket",
            refId: id,
            batchId: null,
            notes: `صيانة ${machine.code}`,
          });
        }

        const after = {
          state: "done" as const,
          endedAt: new Date().toISOString(),
          action: input.action.trim(),
          downMinutes: input.downMinutes,
          laborCost: input.laborCost,
          outsideCost: input.outsideCost,
        };
        const serviced = input.serviceDone || before.kind === "service";
        mutate(
          {
            machineTickets: (db.machineTickets ?? []).map((t) => (t.id === id ? { ...t, ...after } : t)),
            machines: (db.machines ?? []).map((m) =>
              m.id === before.machineId
                ? { ...m, state: "running" as const, lastServiceOn: serviced ? today : m.lastServiceOn }
                : m,
            ),
            stockMovements: moves.length ? [...moves, ...db.stockMovements] : db.stockMovements,
            /* البلاغ اللي فتح التذكرة بيتقفل معاها — مش بيفضل مفتوح على الخط */
            floorIssues: before.issueId
              ? db.floorIssues.map((i) =>
                  i.id === before.issueId
                    ? { ...i, status: "resolved" as const, resolvedAt: new Date().toISOString(), resolvedBy: session?.memberId ?? "" }
                    : i,
                )
              : db.floorIssues,
          },
          { action: "update", table: "machine_tickets", recordId: id, before, after },
        );
      },
      cancelTicket: (id, reason) => {
        need("machines", "edit");
        const before = (db.machineTickets ?? []).find((t) => t.id === id);
        if (!before) throw new Error("التذكرة مش موجودة.");
        if (before.state === "done") throw new Error("التذكرة مقفولة — ماينفعش تتلغي بعد الإقفال.");
        if (!reason.trim()) throw new Error("اكتب سبب الإلغاء.");
        const after = {
          state: "cancelled" as const,
          notes: [before.notes, `ملغاة: ${reason.trim()}`].filter(Boolean).join(" — "),
        };
        mutate(
          {
            machineTickets: (db.machineTickets ?? []).map((t) => (t.id === id ? { ...t, ...after } : t)),
            machines: (db.machines ?? []).map((m) =>
              m.id === before.machineId ? { ...m, state: "running" as const } : m,
            ),
          },
          { action: "update", table: "machine_tickets", recordId: id, before, after },
        );
      },

      /* ── المسح ────────────────────────────────────────────────── */

      /**
       * بيسجّل حركة مسح واحدة.
       *
       * الصلاحية بتتقاس على **موديول السجل اللي الكود فتحه**، مش على
       * «صلاحية مسح» عامة — يعني الكاميرا مش طريق يشوف بيه حد حاجة
       * الشاشة كانت هتمنعه منها.
       *
       * والدفتر ده **مابيتعدّلش ولا بيتمسح**: حركة المسح واقعة حصلت،
       * ولو اتعملت بالغلط بيتسجّل غيرها بالصح. عشان كده مفيش
       * `updateScan` ولا `deleteScan`.
       */
      recordScan: (input) => {
        need(KIND_MODULE[input.kind], "view");
        const row: ScanEvent = {
          id: nid(),
          factoryId: fid(db),
          at: new Date().toISOString(),
          actorId: session?.memberId ?? "",
          actorName: session?.name ?? "النظام",
          kind: input.kind,
          refId: input.refId,
          code: input.code,
          action: input.action,
          source: input.source,
          qty: input.qty ?? null,
          from: input.from ?? "",
          to: input.to ?? "",
          note: input.note ?? "",
        };
        mutate(
          { scans: [row, ...db.scans] },
          { action: "create", table: "scans", recordId: row.id, before: null, after: row },
        );
      },

      /* ── الورش الخارجية ───────────────────────────────────────── */

      addSubcontract: (input) => {
        need("purchasing", "create");
        const party = db.parties.find((p) => p.id === input.partyId);
        if (!party) throw new Error("لازم تختار الورشة من جهات التعامل.");
        if (input.qtySent <= 0) throw new Error("الكمية لازم تكون أكبر من صفر.");
        if (input.rate <= 0) throw new Error("أجر القطعة مطلوب — منه بيتحسب حساب الورشة.");
        if (input.expectedDate < input.date) throw new Error("ميعاد الرجوع مايكونش قبل تاريخ الخروج.");
        const row: Subcontract = {
          id: nid(),
          factoryId: fid(db),
          code: nextSubCode(db.subcontracts),
          partyId: input.partyId,
          orderId: input.orderId,
          operationId: input.operationId,
          date: input.date,
          expectedDate: input.expectedDate,
          qtySent: input.qtySent,
          rate: input.rate,
          status: "open",
          notes: input.notes.trim(),
        };
        // الورشة بتاخد دور `workshop` لو مكانش معاها — سجل واحد بأدوار
        // متعددة، مش سجل تاني لنفس الجهة
        const parties = party.roles.includes("workshop")
          ? db.parties
          : db.parties.map((p) => (p.id === party.id ? { ...p, roles: [...p.roles, "workshop" as const] } : p));
        mutate(
          { subcontracts: [row, ...db.subcontracts], parties },
          { action: "create", table: "subcontracts", recordId: row.id, before: null, after: row },
        );
        return row.id;
      },
      sendSubMaterials: (subcontractId, rows) => {
        need("inventory", "edit");
        const sub = db.subcontracts.find((s) => s.id === subcontractId);
        if (!sub) throw new Error("إذن التشغيل مش موجود.");
        if (sub.status !== "open") throw new Error("الإذن ده مقفول أو ملغي.");
        const clean = rows.filter((r) => r.materialId && r.qty > 0);
        if (!clean.length) throw new Error("اختار خامة وكمية.");
        const warehouseId = db.warehouses.find((w) => w.kind === "material")?.id ?? null;
        const date = cairoToday();
        const movements: StockMovement[] = [];
        for (const r of clean) {
          const material = materialById(db, r.materialId);
          const available = stockQty(db, "material", r.materialId);
          if (r.qty > available + 0.0001) {
            throw new Error(`رصيد ${material?.name ?? "الخامة"} ${qtyText(available)} بس.`);
          }
          movements.push(
            subMovement(fid(db), nid(), sub.id, r.materialId, warehouseId, -r.qty, material?.avgCost ?? 0, date, sub.code),
          );
        }
        mutate(
          { stockMovements: [...movements, ...db.stockMovements] },
          { action: "create", table: "stock_movements", recordId: movements[0].id, before: null, after: { sub: sub.code, lines: movements.length } },
        );
      },
      receiveSubcontract: (input) => {
        need("purchasing", "create");
        const sub = db.subcontracts.find((s) => s.id === input.subcontractId);
        if (!sub) throw new Error("إذن التشغيل مش موجود.");
        if (sub.status === "cancelled") throw new Error("الإذن ملغي.");
        const total = input.qtyGood + input.qtyRework + input.qtyLost;
        if (total <= 0) throw new Error("سجّل كمية واحدة على الأقل.");
        const v = subView(db, sub);
        if (total > v.outstanding + 0.0001) {
          throw new Error(`لسه عند الورشة ${v.outstanding} قطعة بس — مينفعش تستلم ${total}.`);
        }

        const receipt: SubReceipt = {
          id: nid(),
          factoryId: fid(db),
          subcontractId: sub.id,
          date: input.date,
          qtyGood: input.qtyGood,
          qtyRework: input.qtyRework,
          qtyLost: input.qtyLost,
          stageEntryId: null,
          notes: input.notes.trim(),
        };

        // الشغل الراجع بيتسجّل في دفتر الإنتاج على العملية الخارجية —
        // فتقدّم الأمر وتكلفته بيشوفوا شغل الورشة زي شغل المصنع بالظبط
        const stage: StageEntry[] = [];
        const order = sub.orderId ? db.orders.find((o) => o.id === sub.orderId) : null;
        if (order && sub.operationId && input.qtyGood > 0) {
          const stages = orderStages(db, order);
          const here = stages.find((s) => s.operationId === sub.operationId);
          const done = (here?.good ?? 0) + (here?.scrap ?? 0);
          if (done + input.qtyGood <= order.quantity) {
            const row: StageEntry = {
              id: nid(),
              factoryId: fid(db),
              orderId: order.id,
              operationId: sub.operationId,
              date: input.date,
              workerId: null,
              qtyGood: input.qtyGood,
              qtyRework: input.qtyRework,
              qtyScrap: input.qtyLost,
              rate: sub.rate,
            };
            stage.push(row);
            receipt.stageEntryId = row.id;
          }
        }

        const stageEntries = [...stage, ...db.stageEntries];
        const progress = order ? computedProgress({ ...db, stageEntries }, order) : null;
        const accounted = v.received + v.rework + v.lost + total;
        mutate(
          {
            subReceipts: [receipt, ...db.subReceipts],
            stageEntries,
            subcontracts:
              accounted >= sub.qtySent - 0.0001
                ? db.subcontracts.map((s) => (s.id === sub.id ? { ...s, status: "closed" as const, closedAt: input.date } : s))
                : db.subcontracts,
            orders:
              order && progress !== null
                ? db.orders.map((o) => (o.id === order.id ? { ...o, progress } : o))
                : db.orders,
          },
          { action: "create", table: "sub_receipts", recordId: receipt.id, before: null, after: receipt },
        );
      },
      paySubcontract: (input) => {
        need("finance", "create");
        if (input.amount <= 0) throw new Error("المبلغ لازم يكون أكبر من صفر.");
        if (!db.accounts.some((a) => a.id === input.accountId)) throw new Error("اختار حساب الخزينة.");
        const due = workshopBalance(db, input.partyId);
        if (input.amount > due + 0.0001) {
          throw new Error(`المستحق للورشة ${Math.round(due)} جنيه — مينفعش تدفع أكتر من المستحق.`);
        }
        const row: SubPayment = {
          id: nid(),
          factoryId: fid(db),
          partyId: input.partyId,
          subcontractId: input.subcontractId,
          date: input.date,
          amount: input.amount,
          accountId: input.accountId,
          method: input.method,
          notes: input.notes.trim(),
        };
        mutate(
          { subPayments: [row, ...db.subPayments] },
          { action: "create", table: "sub_payments", recordId: row.id, before: null, after: row },
        );
      },
      closeSubcontract: (id) => {
        need("purchasing", "edit");
        const before = db.subcontracts.find((s) => s.id === id);
        if (!before) throw new Error("إذن التشغيل مش موجود.");
        if (before.status !== "open") throw new Error("الإذن مش مفتوح.");
        mutate(
          { subcontracts: db.subcontracts.map((s) => (s.id === id ? { ...s, status: "closed", closedAt: cairoToday() } : s)) },
          { action: "update", table: "subcontracts", recordId: id, before, after: { status: "closed" } },
        );
      },
      cancelSubcontract: (id, reason) => {
        need("purchasing", "edit");
        const before = db.subcontracts.find((s) => s.id === id);
        if (!before) throw new Error("إذن التشغيل مش موجود.");
        if (!reason.trim()) throw new Error("الإلغاء لازم له سبب مكتوب.");
        if (db.subReceipts.some((r) => r.subcontractId === id)) {
          throw new Error("فيه استلامات على الإذن ده — اقفله بدل ما تلغيه.");
        }
        mutate(
          { subcontracts: db.subcontracts.map((s) => (s.id === id ? { ...s, status: "cancelled", cancelReason: reason.trim() } : s)) },
          { action: "update", table: "subcontracts", recordId: id, before, after: { status: "cancelled", reason: reason.trim() } },
        );
      },

      /* ── المرتجعات والشكاوى ──────────────────────────────────
       *
       * تلات خطوات مقصودة: **وصل** → **اتفحص** → **اتسوّى**. وكل خطوة
       * بتاخد صلاحية الطرف اللي المرتجع جه منه (`RETURN_MODULE`)، فمفيش
       * حد بيعمل إشعار خصم لعميل بصلاحية مخازن.
       *
       * والفلوس والمخزن **مابيتحركوش غير في التسوية**. لو اتحركوا وقت
       * الوصول، كل قطعة تالفة كانت هتدخل المخزون وتطلع منه تاني، ورصيد
       * العميل كان هيتغيّر قبل ما حد يقرر أصلًا إن المرتجع مقبول.
       */
      addReturn: (input) => {
        need(RETURN_MODULE[input.source], "create");
        if (input.qty <= 0) throw new Error("الكمية لازم تكون أكبر من صفر.");
        if (!input.itemId) throw new Error("اختار الصنف الراجع.");
        if (input.source !== "production" && !input.partyId) {
          throw new Error(input.source === "customer" ? "اختار العميل." : "اختار المورّد.");
        }
        if (input.date > cairoToday()) throw new Error("تاريخ المرتجع مايكونش في المستقبل.");
        if (input.unitValue < 0) throw new Error("قيمة القطعة مايصحّش تكون سالبة.");
        /*
         * الكمية الراجعة مايصحّش تعدّي اللي اتسلّم فعلًا في نفس التوريد.
         * الشرط ده هو اللي بيمنع «رجّع ١٠٠ من شحنة ٨٠» — وهي الغلطة اللي
         * بتخلّي نسبة الإرجاع تطلع أكبر من ١٠٠٪ ومحدش يعرف منين.
         */
        if (input.deliveryId) {
          const del = db.deliveries.find((d) => d.id === input.deliveryId);
          if (!del) throw new Error("التوريد المربوط مش موجود.");
          const already = db.returns
            .filter((r) => r.deliveryId === input.deliveryId && r.status !== "cancelled")
            .reduce((s, r) => s + r.qty, 0);
          const cap = del.quantity ?? 0;
          if (cap > 0 && already + input.qty > cap) {
            throw new Error(`التوريد ده كان ${qtyText(cap)} قطعة، ورجع منه ${qtyText(already)} — الباقي ${qtyText(cap - already)}.`);
          }
        }
        const row: ReturnEntry = {
          id: nid(),
          factoryId: fid(db),
          code: nextReturnCode(db.returns, input.date),
          source: input.source,
          date: input.date,
          partyId: input.source === "production" ? null : input.partyId,
          itemType: input.itemType,
          itemId: input.itemId,
          qty: input.qty,
          condition: input.condition,
          reason: input.reason,
          reasonNote: input.reasonNote.trim(),
          problem: input.problem,
          origin: input.origin,
          rootCause: null,
          color: input.color.trim(),
          size: input.size.trim(),
          line: input.line.trim(),
          operationId: input.operationId,
          workerId: input.workerId,
          ownerId: input.ownerId,
          deliveryId: input.deliveryId,
          orderId: input.orderId,
          bundleId: input.bundleId,
          costEntryId: input.costEntryId,
          issueId: input.issueId,
          status: "open",
          resolution: null,
          unitValue: input.unitValue,
          settleAmount: 0,
          accountId: null,
          method: null,
          costs: [],
          attachments: [],
          restock: false,
          warehouseId: null,
          replacementQty: 0,
          inspectedAt: null,
          inspectedBy: null,
          settledAt: null,
          settledBy: null,
          cancelledAt: null,
          cancelledBy: null,
          cancelReason: null,
          createdAt: new Date().toISOString(),
          createdBy: session?.memberId ?? "",
          notes: input.notes.trim(),
        };
        mutate({ returns: [row, ...db.returns] }, { action: "create", table: "returns", recordId: row.id, before: null, after: row });
        return row.id;
      },
      inspectReturn: (id, input) => {
        const before = db.returns.find((r) => r.id === id);
        if (!before) throw new Error("المرتجع مش موجود.");
        need(RETURN_MODULE[before.source], "edit");
        if (before.status === "settled") throw new Error("المرتجع ده اتسوّى خلاص — الفحص بيبقى قبل التسوية.");
        if (before.status === "cancelled") throw new Error("المرتجع ده ملغي.");
        if (input.qty <= 0) throw new Error("الكمية لازم تكون أكبر من صفر.");
        if (input.qty > before.qty) throw new Error(`المرتجع جه ${qtyText(before.qty)} — الفحص مايزوّدش الكمية.`);
        /*
         * الفحص بيقول إن القطعة تالفة، فلازم يقول **تالفة بإيه**. من غير
         * الشرط ده تصنيف المشاكل بيفضل فاضي، وباريتو الجودة بيبقى سطر
         * واحد اسمه «مش مكتوب» — وهي الحالة اللي بتخلي كل نظام جودة
         * يتحوّل لأرشيف.
         */
        if (input.condition === "defective" && !input.problem) {
          throw new Error("القطعة متفحوصة إنها تالفة — اختار المشكلة إيه، عشان تدخل في تحليل الجودة.");
        }
        const after = {
          ...before,
          status: "inspected" as const,
          condition: input.condition,
          qty: input.qty,
          problem: input.problem ?? before.problem,
          origin: input.origin ?? before.origin,
          rootCause: input.rootCause ?? before.rootCause,
          operationId: input.operationId ?? before.operationId,
          workerId: input.workerId ?? before.workerId,
          notes: input.notes.trim() || before.notes,
          inspectedAt: new Date().toISOString(),
          inspectedBy: session?.memberId ?? "",
        };
        mutate(
          { returns: db.returns.map((r) => (r.id === id ? after : r)) },
          { action: "update", table: "returns", recordId: id, before, after },
        );
      },
      settleReturn: (id, input) => {
        const before = db.returns.find((r) => r.id === id);
        if (!before) throw new Error("المرتجع مش موجود.");
        need(RETURN_MODULE[before.source], "edit");
        if (before.status === "settled") throw new Error("المرتجع ده متسوّى خلاص.");
        if (before.status === "cancelled") throw new Error("المرتجع ده ملغي.");
        if (before.status === "open") throw new Error("افحص المرتجع الأول — القرار بيتبنى على حالة القطعة.");

        const money = input.resolution === "credit" || input.resolution === "refund";
        if (money && input.settleAmount <= 0) throw new Error("حدّد المبلغ اللي هيتخصم أو يترد.");
        if (input.resolution === "refund") {
          if (!input.accountId) throw new Error("الرد النقدي لازم يطلع من خزنة محددة.");
          if (!input.method) throw new Error("اختار طريقة الرد.");
          if (before.source === "customer") {
            const bal = accountBalance(db, input.accountId);
            if (input.settleAmount > bal) {
              throw new Error(`الخزنة فيها ${moneyPlain(bal)} ج بس — الرد النقدي مايزوّدش عن الرصيد.`);
            }
          }
        }
        if (input.resolution === "replacement" && input.replacementQty <= 0) {
          throw new Error("حدّد كمية البديل.");
        }
        if (input.resolution === "reject" && !input.notes.trim()) {
          throw new Error("رفض المرتجع لازم له سبب مكتوب.");
        }
        /*
         * القطعة التالفة مامتنفعش ترجع المخزون. الشرط ده هو الفرق بين
         * مخزون بيتصرّف فعلًا ومخزون على الورق: لو سمحنا بيها، الرصيد
         * هيقول إن فيه ١٢ قطعة للبيع وهي في الحقيقة تالفة في الرف.
         */
        if (input.restock && before.condition === "defective") {
          throw new Error("المرتجع متفحوص إنه تالف — ماينفعش يرجع المخزون. لو سليم عدّل الفحص الأول.");
        }
        if (input.restock && input.resolution === "scrap") {
          throw new Error("مش ممكن يرجع المخزون وهو متهلَك في نفس الوقت.");
        }

        const warehouseId =
          input.warehouseId ??
          db.warehouses.find((w) => w.kind === (before.itemType === "product" ? "finished" : "material"))?.id ??
          null;
        const now = new Date().toISOString();
        const after: ReturnEntry = {
          ...before,
          status: "settled",
          resolution: input.resolution,
          settleAmount: money ? input.settleAmount : 0,
          accountId: input.resolution === "refund" ? input.accountId : null,
          method: input.resolution === "refund" ? input.method : null,
          restock: input.restock,
          warehouseId: input.restock ? warehouseId : null,
          replacementQty: input.resolution === "replacement" ? input.replacementQty : 0,
          notes: input.notes.trim() || before.notes,
          settledAt: now,
          settledBy: session?.memberId ?? "",
        };

        /*
         * حركة المخزون بتتسجّل هنا بس، ومرة واحدة. والإشارة هي اللي
         * بتحدد الاتجاه: مرتجع داخل موجب، ومرتجع طالع لمورّد سالب.
         */
        const moves: StockMovement[] = [];
        if (input.restock) {
          moves.push({
            id: nid(),
            factoryId: fid(db),
            date: cairoToday(),
            itemType: before.itemType,
            itemId: before.itemId,
            warehouseId,
            kind: "return",
            qty: before.source === "supplier" ? -before.qty : before.qty,
            unitCost: unitCostOf(db, before),
            refType: "return",
            refId: before.id,
            notes: `${before.code} — ${RETURN_SOURCE_LABEL[before.source]}`,
          });
        }

        mutate(
          {
            returns: db.returns.map((r) => (r.id === id ? after : r)),
            ...(moves.length ? { stockMovements: [...moves, ...db.stockMovements] } : {}),
          },
          { action: "update", table: "returns", recordId: id, before, after },
        );
      },
      cancelReturn: (id, reason) => {
        const before = db.returns.find((r) => r.id === id);
        if (!before) throw new Error("المرتجع مش موجود.");
        need(RETURN_MODULE[before.source], "edit");
        if (!reason.trim()) throw new Error("الإلغاء لازم له سبب مكتوب.");
        /*
         * المرتجع المتسوّى مابيتلغيش: فلوسه اتحركت ومخزونه اتغيّر، والإلغاء
         * هنا كان هيسيب حركة مخزون ورصيد عميل بدون سند. اللي بيتعمل في
         * الحالة دي مرتجع مضاد — مش مسح للأول.
         */
        if (before.status === "settled") {
          throw new Error("المرتجع ده اتسوّى وفلوسه ومخزونه اتحركوا — سجّل حركة مضادة بدل الإلغاء.");
        }
        const after = {
          ...before,
          status: "cancelled" as const,
          cancelReason: reason.trim(),
          cancelledAt: new Date().toISOString(),
          cancelledBy: session?.memberId ?? "",
        };
        mutate(
          { returns: db.returns.map((r) => (r.id === id ? after : r)) },
          { action: "update", table: "returns", recordId: id, before, after },
        );
      },
      /* ── بنود التكلفة وإثبات المشكلة ── */
      addReturnCost: (returnId, input) => {
        const before = db.returns.find((r) => r.id === returnId);
        if (!before) throw new Error("الحالة مش موجودة.");
        need(RETURN_MODULE[before.source], "edit");
        if (input.amount <= 0) throw new Error("المبلغ لازم يكون أكبر من صفر.");
        /*
         * أجر الإصلاح وخاماته بيتحسبوا من أمر الإصلاح. لو سمحنا بكتابتهم
         * بالإيد كمان، نفس الجنيه بيتعدّ مرتين وتكلفة الجودة بتطلع مضخّمة
         * — والرقم المضخّم بيوقف قرار صح زي ما الرقم الناقص بالظبط.
         */
        if (REPAIR_DERIVED_COSTS.includes(input.kind) && repairsOf(db, returnId).length > 0) {
          throw new Error("البند ده بيتحسب من أمر الإصلاح — عدّل الأمر بدل ما تكتبه هنا.");
        }
        const line: ReturnCostLine = { id: nid(), kind: input.kind, amount: input.amount, note: input.note.trim() };
        const after = { ...before, costs: [...(before.costs ?? []), line] };
        mutate(
          { returns: db.returns.map((r) => (r.id === returnId ? after : r)) },
          { action: "update", table: "returns", recordId: returnId, before, after },
        );
      },
      removeReturnCost: (returnId, costId) => {
        const before = db.returns.find((r) => r.id === returnId);
        if (!before) throw new Error("الحالة مش موجودة.");
        need(RETURN_MODULE[before.source], "edit");
        const after = { ...before, costs: (before.costs ?? []).filter((c) => c.id !== costId) };
        mutate(
          { returns: db.returns.map((r) => (r.id === returnId ? after : r)) },
          { action: "update", table: "returns", recordId: returnId, before, after },
        );
      },
      addAttachment: (returnId, input) => {
        const before = db.returns.find((r) => r.id === returnId);
        if (!before) throw new Error("الحالة مش موجودة.");
        need(RETURN_MODULE[before.source], "edit");
        if (!input.dataUrl.startsWith("data:image/")) throw new Error("الصورة مش مقروءة.");
        /*
         * الصور بتتصغّر قبل ما توصل هنا وبيتحطّ سقف على عددها، لأن الدفتر
         * المحلي مساحته محدودة. والمكان الصح للملفات الكبيرة هو تخزين
         * السيرفر — مكتوب في التوثيق إن ده الحد الحالي مش تصميم نهائي.
         */
        if ((before.attachments ?? []).length >= 6) {
          throw new Error("أقصى ست صور للحالة الواحدة في النسخة المحلية.");
        }
        const row: Attachment = {
          id: nid(),
          name: input.name.trim() || "صورة",
          phase: input.phase,
          dataUrl: input.dataUrl,
          note: input.note.trim(),
          at: new Date().toISOString(),
          by: session?.memberId ?? "",
        };
        const after = { ...before, attachments: [...(before.attachments ?? []), row] };
        mutate(
          { returns: db.returns.map((r) => (r.id === returnId ? after : r)) },
          { action: "update", table: "returns", recordId: returnId, before, after },
        );
      },
      removeAttachment: (returnId, attachmentId) => {
        const before = db.returns.find((r) => r.id === returnId);
        if (!before) throw new Error("الحالة مش موجودة.");
        need(RETURN_MODULE[before.source], "edit");
        const after = { ...before, attachments: (before.attachments ?? []).filter((a) => a.id !== attachmentId) };
        mutate(
          { returns: db.returns.map((r) => (r.id === returnId ? after : r)) },
          { action: "update", table: "returns", recordId: returnId, before, after },
        );
      },

      /* ── أوامر الإصلاح ── */
      openRepair: (input) => {
        need("quality", "create");
        const parent = db.returns.find((r) => r.id === input.returnId);
        if (!parent) throw new Error("الحالة مش موجودة.");
        if (parent.status === "open") throw new Error("افحص الحالة الأول — الإصلاح بيتقرر بعد ما نعرف العيب إيه.");
        if (parent.status === "cancelled") throw new Error("الحالة ملغية.");
        if (input.qty <= 0) throw new Error("الكمية لازم تكون أكبر من صفر.");
        const already = repairsOf(db, input.returnId).reduce((s, x) => s + x.qty, 0);
        if (already + input.qty > parent.qty) {
          throw new Error(`الحالة فيها ${qtyText(parent.qty)} قطعة، ومفتوح لها إصلاح ${qtyText(already)} — الباقي ${qtyText(parent.qty - already)}.`);
        }
        if (input.rate < 0) throw new Error("أجر الإصلاح مايكونش سالب.");

        /*
         * خامات الإصلاح بتطلع من المخزن **بحركة حقيقية** وقت فتح الأمر،
         * زي أي صرف تاني. لو سجّلناها كرقم في الأمر بس، الخيط والزراير
         * هيفضلوا في الرصيد على الورق وهم مصروفين فعلًا.
         */
        const materials: RepairMaterial[] = [];
        const moves: StockMovement[] = [];
        for (const m of input.materials) {
          if (!m.materialId || m.qty <= 0) continue;
          const mat = db.materials.find((x) => x.id === m.materialId);
          if (!mat) throw new Error("خامة مش موجودة.");
          const have = stockQty(db, "material", m.materialId);
          if (m.qty > have) throw new Error(`${mat.name}: الرصيد ${qtyText(have)} والمطلوب ${qtyText(m.qty)}.`);
          materials.push({ id: nid(), materialId: m.materialId, qty: m.qty, unitCost: mat.avgCost });
        }

        const row: RepairOrder = {
          id: nid(),
          factoryId: fid(db),
          code: nextRepairCode(db.repairs ?? []),
          returnId: input.returnId,
          date: cairoToday(),
          qty: input.qty,
          problem: input.problem ?? parent.problem,
          workerId: input.workerId,
          operationId: input.operationId,
          rate: input.rate,
          minutes: 0,
          materials,
          status: "queued",
          startedAt: null,
          finishedAt: null,
          qtyPassed: 0,
          qtyFailed: 0,
          qcAt: null,
          qcBy: null,
          qcNote: "",
          shippedAt: null,
          cancelReason: null,
          createdAt: new Date().toISOString(),
          createdBy: session?.memberId ?? "",
          notes: input.notes.trim(),
        };

        for (const m of materials) {
          moves.push({
            id: nid(),
            factoryId: fid(db),
            date: cairoToday(),
            itemType: "material",
            itemId: m.materialId,
            warehouseId: db.warehouses.find((w) => w.kind === "material")?.id ?? null,
            kind: "issue",
            qty: -m.qty,
            unitCost: m.unitCost,
            refType: "repair",
            refId: row.id,
            notes: `${row.code} — خامات إصلاح`,
          });
        }

        mutate(
          {
            repairs: [row, ...(db.repairs ?? [])],
            ...(moves.length ? { stockMovements: [...moves, ...db.stockMovements] } : {}),
          },
          { action: "create", table: "repairs", recordId: row.id, before: null, after: row },
        );
        return row.id;
      },
      startRepair: (id) => {
        const before = (db.repairs ?? []).find((r) => r.id === id);
        if (!before) throw new Error("أمر الإصلاح مش موجود.");
        need("quality", "edit");
        if (before.status !== "queued") throw new Error("الأمر ده مش في الطابور.");
        const after = { ...before, status: "repairing" as const, startedAt: new Date().toISOString() };
        mutate(
          { repairs: (db.repairs ?? []).map((r) => (r.id === id ? after : r)) },
          { action: "update", table: "repairs", recordId: id, before, after },
        );
      },
      finishRepair: (id) => {
        const before = (db.repairs ?? []).find((r) => r.id === id);
        if (!before) throw new Error("أمر الإصلاح مش موجود.");
        need("quality", "edit");
        if (before.status !== "repairing") throw new Error("الأمر ده مش تحت الإصلاح.");
        /* الوقت من الساعة مش من الكيبورد — نفس قاعدة الباندل */
        const started = before.startedAt ? Date.parse(before.startedAt) : Date.now();
        const minutes = Math.max(0, Math.round((Date.now() - started) / 60000));
        const after = { ...before, status: "qc" as const, finishedAt: new Date().toISOString(), minutes };
        mutate(
          { repairs: (db.repairs ?? []).map((r) => (r.id === id ? after : r)) },
          { action: "update", table: "repairs", recordId: id, before, after },
        );
      },
      qcRepair: (id, input) => {
        const before = (db.repairs ?? []).find((r) => r.id === id);
        if (!before) throw new Error("أمر الإصلاح مش موجود.");
        need("quality", "edit");
        if (before.status !== "qc") throw new Error("الأمر ده مش تحت الفحص.");
        if (input.qtyPassed < 0 || input.qtyFailed < 0) throw new Error("الكميات مايصحّش تكون سالبة.");
        if (input.qtyPassed + input.qtyFailed !== before.qty) {
          throw new Error(`الأمر فيه ${qtyText(before.qty)} قطعة — العدّت والساقطة لازم يجمعوا نفس الرقم.`);
        }
        if (input.qtyFailed > 0 && !input.qcNote.trim()) {
          throw new Error("القطع اللي سقطت في الفحص لازم يتكتب ليه.");
        }

        /*
         * القطعة اللي عدّت الفحص بتدخل المخزون **دلوقتي**، مش وقت المرتجع.
         * وده الفرق المهم: القطعة رجعت تالفة فمادخلتش المخزن، واتصلحت
         * فبقت بضاعة تتباع. ولو حسبناها وقت الرجوع كان الرصيد هيقول إن
         * فيه بضاعة جاهزة وهي لسه في الورشة.
         */
        const parent = db.returns.find((r) => r.id === before.returnId);
        const moves: StockMovement[] = [];
        if (input.qtyPassed > 0 && parent && parent.itemType === "product") {
          moves.push({
            id: nid(),
            factoryId: fid(db),
            date: cairoToday(),
            itemType: "product",
            itemId: parent.itemId,
            warehouseId: db.warehouses.find((w) => w.kind === "finished")?.id ?? null,
            kind: "return",
            qty: input.qtyPassed,
            unitCost: unitCostOf(db, parent) + repairCostOf(before).perPiece,
            refType: "repair",
            refId: before.id,
            notes: `${before.code} — عدّت الفحص بعد الإصلاح`,
          });
        }

        const after: RepairOrder = {
          ...before,
          status: input.qtyPassed > 0 ? "ready" : "scrapped",
          qtyPassed: input.qtyPassed,
          qtyFailed: input.qtyFailed,
          qcAt: new Date().toISOString(),
          qcBy: session?.memberId ?? "",
          qcNote: input.qcNote.trim(),
        };
        mutate(
          {
            repairs: (db.repairs ?? []).map((r) => (r.id === id ? after : r)),
            ...(moves.length ? { stockMovements: [...moves, ...db.stockMovements] } : {}),
          },
          { action: "update", table: "repairs", recordId: id, before, after },
        );
      },
      shipRepair: (id) => {
        const before = (db.repairs ?? []).find((r) => r.id === id);
        if (!before) throw new Error("أمر الإصلاح مش موجود.");
        need("quality", "edit");
        if (before.status !== "ready") throw new Error("الأمر لازم يعدّي الفحص الأول.");
        const parent = db.returns.find((r) => r.id === before.returnId);
        const moves: StockMovement[] = [];
        /* طلعت للعميل تاني — فبتخرج من المخزون زي أي تسليم */
        if (parent && parent.itemType === "product" && before.qtyPassed > 0) {
          moves.push({
            id: nid(),
            factoryId: fid(db),
            date: cairoToday(),
            itemType: "product",
            itemId: parent.itemId,
            warehouseId: db.warehouses.find((w) => w.kind === "finished")?.id ?? null,
            kind: "delivery",
            qty: -before.qtyPassed,
            unitCost: unitCostOf(db, parent),
            refType: "repair",
            refId: before.id,
            notes: `${before.code} — اترجّع للعميل بعد الإصلاح`,
          });
        }
        const after = { ...before, status: "shipped" as const, shippedAt: new Date().toISOString() };
        mutate(
          {
            repairs: (db.repairs ?? []).map((r) => (r.id === id ? after : r)),
            ...(moves.length ? { stockMovements: [...moves, ...db.stockMovements] } : {}),
          },
          { action: "update", table: "repairs", recordId: id, before, after },
        );
      },
      cancelRepair: (id, reason) => {
        const before = (db.repairs ?? []).find((r) => r.id === id);
        if (!before) throw new Error("أمر الإصلاح مش موجود.");
        need("quality", "edit");
        if (!reason.trim()) throw new Error("الإلغاء لازم له سبب مكتوب.");
        if (before.status === "shipped" || before.status === "ready") {
          throw new Error("الأمر ده خلص وخاماته اتصرفت — سجّل حركة مضادة بدل الإلغاء.");
        }
        const after = { ...before, status: "cancelled" as const, cancelReason: reason.trim() };
        mutate(
          { repairs: (db.repairs ?? []).map((r) => (r.id === id ? after : r)) },
          { action: "update", table: "repairs", recordId: id, before, after },
        );
      },

      addComplaint: (input) => {
        need("parties", "create");
        if (!input.partyId) throw new Error("اختار الجهة صاحبة الشكوى.");
        if (!input.subject.trim()) throw new Error("اكتب موضوع الشكوى.");
        const row: Complaint = {
          id: nid(),
          factoryId: fid(db),
          code: nextComplaintCode(db.complaints, input.date),
          partyId: input.partyId,
          date: input.date,
          kind: input.kind,
          severity: input.severity,
          subject: input.subject.trim(),
          detail: input.detail.trim(),
          deliveryId: input.deliveryId,
          orderId: input.orderId,
          returnId: input.returnId,
          ownerId: input.ownerId,
          dueDate: input.dueDate,
          status: "open",
          claimAmount: Math.max(0, input.claimAmount),
          resolution: "",
          resolvedAt: null,
          resolvedBy: null,
          createdAt: new Date().toISOString(),
          createdBy: session?.memberId ?? "",
        };
        mutate({ complaints: [row, ...db.complaints] }, { action: "create", table: "complaints", recordId: row.id, before: null, after: row });
        return row.id;
      },
      updateComplaint: (id, patch) => {
        need("parties", "edit");
        const before = db.complaints.find((c) => c.id === id);
        if (!before) throw new Error("الشكوى مش موجودة.");
        if (before.status === "closed") throw new Error("الشكوى مقفولة — مابتتعدّلش بعد القفل.");
        const closing = patch.status === "resolved" || patch.status === "closed";
        const resolution = (patch.resolution ?? before.resolution).trim();
        if (closing && !resolution) throw new Error("اكتب اللي اتعمل قبل ما تقفل الشكوى.");
        const after: Complaint = {
          ...before,
          ...patch,
          resolution,
          resolvedAt: closing ? before.resolvedAt ?? new Date().toISOString() : before.resolvedAt,
          resolvedBy: closing ? before.resolvedBy ?? session?.memberId ?? "" : before.resolvedBy,
        };
        mutate(
          { complaints: db.complaints.map((c) => (c.id === id ? after : c)) },
          { action: "update", table: "complaints", recordId: id, before, after },
        );
      },

      issueDoc: (input) => {
        const def = DOC_DEFS[input.type];
        need(def.perm, "export");
        const existing = findDoc(db.documents, input.type, input.refId);
        if (existing) return existing;
        const row = buildDoc(input, {
          factoryId: fid(db),
          docs: db.documents,
          settings: db.settings.docs,
          actorId: session?.memberId ?? "",
          now: new Date().toISOString(),
        });
        mutate({ documents: [row, ...db.documents] }, { action: "create", table: "documents", recordId: row.id, before: null, after: row });
        return row;
      },
      approveDoc: (id) => {
        const before = db.documents.find((d) => d.id === id);
        if (!before) throw new Error("المستند مش موجود.");
        need(DOC_DEFS[before.type].perm, "edit");
        if (!canTransition(before.status, "approved")) throw new Error("المستند مش في حالة تسمح بالموافقة.");
        const after = {
          status: "approved" as const,
          approvedBy: session?.memberId ?? "",
          approvedAt: new Date().toISOString(),
        };
        mutate({ documents: db.documents.map((d) => (d.id === id ? { ...d, ...after } : d)) }, { action: "update", table: "documents", recordId: id, before, after });
      },
      cancelDoc: (id, reason) => {
        const before = db.documents.find((d) => d.id === id);
        if (!before) throw new Error("المستند مش موجود.");
        need(DOC_DEFS[before.type].perm, "edit");
        if (!reason.trim()) throw new Error("الإلغاء لازم له سبب مكتوب.");
        if (!canTransition(before.status, "cancelled")) throw new Error("المستند ملغي أصلًا.");
        // مافيش مسح: الرقم بيفضل في الدفتر بحالة ملغي عشان مايبقاش فيه فجوة
        const after = {
          status: "cancelled" as const,
          cancelledBy: session?.memberId ?? "",
          cancelledAt: new Date().toISOString(),
          cancelReason: reason.trim(),
        };
        mutate({ documents: db.documents.map((d) => (d.id === id ? { ...d, ...after } : d)) }, { action: "update", table: "documents", recordId: id, before, after });
      },
      reviseDoc: (id) => {
        const before = db.documents.find((d) => d.id === id);
        if (!before) throw new Error("المستند مش موجود.");
        need(DOC_DEFS[before.type].perm, "edit");
        if (before.status === "cancelled") throw new Error("المستند الملغي مايتراجعش. اعمل مستند جديد.");
        const after = { revision: before.revision + 1 };
        mutate({ documents: db.documents.map((d) => (d.id === id ? { ...d, ...after } : d)) }, { action: "update", table: "documents", recordId: id, before, after });
      },
      setDocSettings: (patch) => {
        need("settings", "edit");
        const before = db.settings.docs ?? {};
        const docs = { ...before, ...patch };
        mutate({ settings: { ...db.settings, docs } }, { action: "update", table: "settings", recordId: fid(db), before, after: docs });
      },
      addAccount: (name, kind) => {
        need("finance", "create");
        const row: Account = { id: nid(), factoryId: fid(db), name: name.trim(), kind };
        mutate({ accounts: [...db.accounts, row] }, { action: "create", table: "accounts", recordId: row.id, before: null, after: row });
      },
      invite: (email, role) => {
        need("staff", "create");
        const row: Invite = { id: nid(), factoryId: fid(db), email: email.trim().toLowerCase(), role, createdAt: new Date().toISOString(), status: "pending" };
        mutate({ invites: [row, ...db.invites] }, { action: "create", table: "invites", recordId: row.id, before: null, after: row });
      },
      acceptInvite: (id, name) => {
        need("staff", "edit");
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
        need("staff", "edit");
        const before = db.members.find((m) => m.id === memberId);
        mutate({ members: db.members.map((m) => (m.id === memberId ? { ...m, role } : m)) }, { action: "update", table: "members", recordId: memberId, before, after: { role } });
      },
      removeMember: (memberId) => {
        need("staff", "edit");
        const before = db.members.find((m) => m.id === memberId);
        if (before?.role === "owner") throw new Error("مينفعش تشيل صاحب المصنع.");
        mutate({ members: db.members.filter((m) => m.id !== memberId) }, { action: "delete", table: "members", recordId: memberId, before, after: null });
      },
    };
  }, [db, session, accounts, workspaces, current, missing]);

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
    supplyOrders: [],
    supplyOrderLines: [],
    supplyReceipts: [],
    supplyReceiptLines: [],
    batches: [],
    recalls: [],
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
    documents: [],
    cutLays: [],
    cutLayLines: [],
    bundles: [],
    bundleOps: [],
    floorIssues: [],
    machines: [],
    machineTickets: [],
    scans: [],
    subcontracts: [],
    subReceipts: [],
    subPayments: [],
    returns: [],
    repairs: [],
    complaints: [],
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
