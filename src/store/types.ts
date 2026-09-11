export const ROLES = ["owner", "accountant", "supervisor"] as const;
export type Role = (typeof ROLES)[number];

export const PAY_METHODS = ["cash", "bank", "instapay", "wallet", "cheque"] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

export const WORKER_PAY_TYPES = ["daily", "monthly", "piece"] as const;
export type WorkerPayType = (typeof WORKER_PAY_TYPES)[number];

export type Factory = {
  id: string;
  name: string;
  createdAt: string;
};

export type Member = {
  id: string;
  factoryId: string;
  email: string;
  name: string;
  role: Role;
};

export type Invite = {
  id: string;
  factoryId: string;
  email: string;
  role: Role;
  createdAt: string;
  status: "pending" | "accepted";
};

export type Account = {
  id: string;
  factoryId: string;
  name: string;
  kind: "cash" | "bank" | "instapay" | "wallet";
};

export type CostItem = {
  id: string;
  factoryId: string;
  name: string;
  unit: string;
};

export type CostEntry = {
  id: string;
  factoryId: string;
  costItemId: string;
  date: string;
  vendor: string;
  quantity: number | null;
  amount: number;
  notes: string;
};

export type CostPayment = {
  id: string;
  factoryId: string;
  costEntryId: string;
  date: string;
  amount: number;
  accountId: string;
  method: PayMethod;
};

export type Client = {
  id: string;
  factoryId: string;
  name: string;
  phone: string;
  notes: string;
};

export type Delivery = {
  id: string;
  factoryId: string;
  clientId: string;
  date: string;
  dueDate: string;
  amount: number;
  model: string;
  quantity: number | null;
  notes: string;
};

export type Collection = {
  id: string;
  factoryId: string;
  clientId: string;
  date: string;
  amount: number;
  method: PayMethod;
  accountId: string;
  receiptImage: string | null;
  status: "confirmed" | "pending";
  chequeDate: string | null;
  notes: string;
};

export type Worker = {
  id: string;
  factoryId: string;
  name: string;
  payType: WorkerPayType;
  rate: number;
  phone: string;
};

export type WorkerEarning = {
  id: string;
  factoryId: string;
  workerId: string;
  date: string;
  kind: "attendance" | "piece" | "bonus";
  amount: number;
  notes: string;
};

export type WorkerPayment = {
  id: string;
  factoryId: string;
  workerId: string;
  date: string;
  kind: "pay" | "advance" | "deduction";
  amount: number;
  accountId: string | null;
  notes: string;
};

export const ORDER_STATUSES = ["running", "done", "late", "stopped"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PRODUCTION_LINES = ["الخط الأول", "الخط الثاني", "الخط الثالث", "خط التشطيب"] as const;

export type Order = {
  id: string;
  factoryId: string;
  /** رقم أمر الإنتاج المطبوع، زي SN-1042 */
  code: string;
  clientId: string | null;
  /** اسم المنتج المعروض — يتعبّى من المنتج المرتبط لو موجود */
  model: string;
  productId: string | null;
  bomId: string | null;
  materialsIssuedAt: string | null;
  line: string;
  quantity: number;
  progress: number;
  pieceCost: number;
  piecePrice: number;
  dueDate: string;
  status: OrderStatus;
  notes: string;
};

/* ── نواة التصنيع: منتجات، خامات، BOM، عمليات، مخزون ───────────── */

export const INDUSTRIES = ["apparel", "bags", "shoes", "furniture", "accessories", "food", "custom"] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const INDUSTRY_LABEL: Record<Industry, string> = {
  apparel: "ملابس",
  bags: "شنط وجلود",
  shoes: "أحذية",
  furniture: "مفروشات وأخشاب",
  accessories: "إكسسوارات",
  food: "أغذية وتعبئة",
  custom: "نشاط آخر",
};

export type Settings = {
  industry: Industry;
  /** طريقة توزيع الأوفرهيد على القطعة */
  overheadPerUnit: number;
};

export type Unit = { id: string; factoryId: string; name: string };

export type Category = {
  id: string;
  factoryId: string;
  name: string;
  kind: "product" | "material";
};

export type Warehouse = {
  id: string;
  factoryId: string;
  name: string;
  kind: "material" | "finished";
};

export type Material = {
  id: string;
  factoryId: string;
  sku: string;
  name: string;
  categoryId: string | null;
  unitId: string | null;
  avgCost: number;
  reorderPoint: number;
  leadTimeDays: number;
  defaultVendor: string;
};

export type Product = {
  id: string;
  factoryId: string;
  sku: string;
  name: string;
  categoryId: string | null;
  unitId: string | null;
  sellPrice: number;
  minStock: number;
};

export type Bom = {
  id: string;
  factoryId: string;
  productId: string;
  version: number;
  status: "draft" | "active" | "archived";
  notes: string;
};

export type BomItem = {
  id: string;
  factoryId: string;
  bomId: string;
  materialId: string;
  qtyPerUnit: number;
  /** نسبة الهالك % */
  wastePct: number;
};

export type Operation = {
  id: string;
  factoryId: string;
  name: string;
  defaultRate: number;
  defaultMinutes: number;
  isOutsourced: boolean;
};

export type RoutingStep = {
  id: string;
  factoryId: string;
  productId: string;
  operationId: string;
  seq: number;
  rate: number;
  stdMinutes: number;
};

export const STOCK_KINDS = [
  "opening",
  "purchase",
  "issue",
  "return",
  "adjust",
  "waste",
  "receipt_fg",
  "delivery",
] as const;
export type StockKind = (typeof STOCK_KINDS)[number];

export const STOCK_KIND_LABEL: Record<StockKind, string> = {
  opening: "رصيد افتتاحي",
  purchase: "شراء",
  issue: "صرف لأمر إنتاج",
  return: "مرتجع للمخزن",
  adjust: "تسوية جرد",
  waste: "هالك",
  receipt_fg: "استلام إنتاج تام",
  delivery: "تسليم للعميل",
};

/** دفتر المخزون: الرصيد محسوب من الحركات ولا يُخزَّن أبدًا */
export type StockMovement = {
  id: string;
  factoryId: string;
  date: string;
  itemType: "material" | "product";
  itemId: string;
  warehouseId: string | null;
  kind: StockKind;
  /** موجب دخول، سالب خروج */
  qty: number;
  unitCost: number;
  refType: string;
  refId: string | null;
  notes: string;
};

export type StageEntry = {
  id: string;
  factoryId: string;
  orderId: string;
  operationId: string;
  date: string;
  workerId: string | null;
  qtyGood: number;
  qtyRework: number;
  qtyScrap: number;
  rate: number;
};

export type ManualTx = {
  id: string;
  factoryId: string;
  date: string;
  accountId: string;
  amount: number;
  notes: string;
};

export type AuditEntry = {
  id: string;
  factoryId: string;
  actorId: string;
  actorName: string;
  action: "create" | "update" | "delete" | "restore";
  table: string;
  recordId: string;
  before: unknown;
  after: unknown;
  at: string;
};

export type Db = {
  factory: Factory | null;
  settings: Settings;
  members: Member[];
  invites: Invite[];
  accounts: Account[];
  units: Unit[];
  categories: Category[];
  warehouses: Warehouse[];
  materials: Material[];
  products: Product[];
  boms: Bom[];
  bomItems: BomItem[];
  operations: Operation[];
  routingSteps: RoutingStep[];
  stockMovements: StockMovement[];
  stageEntries: StageEntry[];
  costItems: CostItem[];
  costEntries: CostEntry[];
  costPayments: CostPayment[];
  clients: Client[];
  deliveries: Delivery[];
  collections: Collection[];
  workers: Worker[];
  workerEarnings: WorkerEarning[];
  workerPayments: WorkerPayment[];
  orders: Order[];
  manualTx: ManualTx[];
  auditLog: AuditEntry[];
};

export type Session = {
  memberId: string;
  email: string;
  name: string;
  role: Role;
};

export type BackupFile = {
  version: 1;
  kind: "factory-backup";
  factoryName: string;
  exportedAt: string;
  data: Db;
};

export const ROLE_LABEL: Record<Role, string> = {
  owner: "صاحب المصنع",
  accountant: "محاسب",
  supervisor: "مشرف",
};

export const METHOD_LABEL: Record<PayMethod, string> = {
  cash: "كاش",
  bank: "بنك",
  instapay: "إنستاباي",
  wallet: "محفظة",
  cheque: "شيك",
};

export const PAY_TYPE_LABEL: Record<WorkerPayType, string> = {
  daily: "يومية",
  monthly: "شهري",
  piece: "بالقطعة",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  running: "قيد التنفيذ",
  done: "مكتمل",
  late: "متأخر",
  stopped: "متوقف",
};

export const DEFAULT_COST_ITEMS: { name: string; unit: string }[] = [
  { name: "قماش", unit: "متر" },
  { name: "بطانة", unit: "متر" },
  { name: "خيوط", unit: "بكرة" },
  { name: "سوست وأزرار", unit: "قطعة" },
  { name: "إكسسوار", unit: "قطعة" },
  { name: "صبغة", unit: "كيلو" },
  { name: "طباعة", unit: "قطعة" },
  { name: "تطريز", unit: "قطعة" },
  { name: "قص خارجي", unit: "قطعة" },
  { name: "خياطة خارجية", unit: "قطعة" },
  { name: "مكوى خارجي", unit: "قطعة" },
  { name: "تغليف وأكياس", unit: "قطعة" },
  { name: "نقل وتوصيل", unit: "مشوار" },
  { name: "إيجار المصنع", unit: "شهر" },
  { name: "كهرباء", unit: "شهر" },
  { name: "صيانة ماكينات", unit: "مرة" },
  { name: "مستلزمات تشغيل", unit: "وحدة" },
  { name: "متنوعة", unit: "بند" },
];
