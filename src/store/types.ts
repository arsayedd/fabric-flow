// استيراد نوع فقط، فبيتشال وقت البناء ومفيش دورة حقيقية بين الملفين
import type { PermMatrix } from "./permissions";

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
  /** الاسم والمسمّى الوظيفي زي ما صاحب المصنع كتبهم في الدعوة */
  name?: string;
  title?: string;
  phone?: string;
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
  /** المورّد كجهة تعامل — قديمًا كان اسم نصي في vendor */
  partyId: string | null;
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

/* ── جهات التعامل: كيان واحد بأدوار متعددة (ADR-001) ──────────── */

export const PARTY_ROLES = [
  "customer",
  "merchant",
  "wholesale",
  "retail",
  "supplier",
  "distributor",
  "agent",
  "workshop",
  "sales_rep",
  "collection_rep",
  "partner",
  "service",
  "shipping",
  "maintenance",
  "contractor",
  "other",
] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

export const PARTY_ROLE_LABEL: Record<PartyRole, string> = {
  customer: "عميل",
  merchant: "تاجر",
  wholesale: "تاجر جملة",
  retail: "تاجر تجزئة",
  supplier: "مورّد",
  distributor: "موزّع",
  agent: "وكيل",
  workshop: "ورشة خارجية",
  sales_rep: "مندوب مبيعات",
  collection_rep: "مندوب تحصيل",
  partner: "شريك",
  service: "مقدم خدمة",
  shipping: "شركة شحن",
  maintenance: "شركة صيانة",
  contractor: "مقاول",
  other: "جهة أخرى",
};

export type Party = {
  id: string;
  factoryId: string;
  kind: "person" | "company";
  name: string;
  tradeName: string;
  legalName: string;
  code: string;
  taxId: string;
  commercialReg: string;
  industry: string;
  website: string;
  email: string;
  phone: string;
  whatsapp: string;
  address: string;
  governorate: string;
  city: string;
  area: string;
  notes: string;
  /** ملاحظات داخلية — متظهرش في أي بورتال للعميل */
  internalNotes: string;
  tags: string[];
  roles: PartyRole[];
  creditLimit: number;
  paymentTermDays: number;
  salesRepId: string | null;
  /** الدمج بيأرشف السجل المكرر ويشاور على الأساسي بدل ما يمسحه */
  mergedIntoId: string | null;
  createdAt: string;
};

export type PartyContact = {
  id: string;
  factoryId: string;
  partyId: string;
  name: string;
  title: string;
  phone: string;
  email: string;
  isPrimary: boolean;
};

export const ADDRESS_KINDS = ["head_office", "warehouse", "billing", "shipping", "branch", "factory"] as const;
export type AddressKind = (typeof ADDRESS_KINDS)[number];

export const ADDRESS_KIND_LABEL: Record<AddressKind, string> = {
  head_office: "المقر الرئيسي",
  warehouse: "مخزن",
  billing: "عنوان الفوترة",
  shipping: "عنوان الشحن",
  branch: "فرع",
  factory: "مصنع",
};

export type PartyAddress = {
  id: string;
  factoryId: string;
  partyId: string;
  kind: AddressKind;
  line: string;
  governorate: string;
  city: string;
};

export const COMM_CHANNELS = ["call", "whatsapp", "email", "sms", "meeting", "note"] as const;
export type CommChannel = (typeof COMM_CHANNELS)[number];

export const COMM_CHANNEL_LABEL: Record<CommChannel, string> = {
  call: "مكالمة",
  whatsapp: "واتساب",
  email: "إيميل",
  sms: "رسالة",
  meeting: "زيارة",
  note: "ملاحظة",
};

export type Communication = {
  id: string;
  factoryId: string;
  partyId: string;
  date: string;
  channel: CommChannel;
  subject: string;
  body: string;
  internal: boolean;
  actorName: string;
  nextAction: string;
  nextDate: string | null;
};

export type PartyTask = {
  id: string;
  factoryId: string;
  partyId: string | null;
  title: string;
  dueDate: string;
  assigneeName: string;
  status: "open" | "done";
  createdAt: string;
};

export type Delivery = {
  id: string;
  factoryId: string;
  /** جهة التعامل صاحبة التوريد — نفس الـid القديم للعميل */
  clientId: string;
  /**
   * أمر الإنتاج اللي التوريد ده خرج منه.
   *
   * من غيره «طلب كام واستلم كام» بيتحسب بمطابقة اسم الموديل، والمطابقة
   * دي بتغلط: عميلين بياخدوا «قميص قطني» من أمرين مختلفين. وفي الاستدعاء
   * الغلط ده تكلفته إننا نكلّم العميل الغلط ونسيب اللي فعلًا عنده
   * المشكلة — فالربط هنا بالمعرّف، مش بالاسم.
   *
   * و`null` مسموح: توريد قديم أو توريد مش من أمر متسجّل.
   */
  orderId?: string | null;
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
  /** أوزان سكور العميل — صاحب المصنع يقدر يعدّلها */
  scoreWeights?: Record<"purchase" | "payment" | "growth" | "frequency" | "profit" | "quality" | "relationship", number>;
  /** هامش الربح المستهدف % — أساس تكلفة الهدف وأقل سعر مقبول */
  targetMarginPct?: number;
  /**
   * مصفوفة الصلاحيات لكل دور. الغايب معناه «سِيبه على الافتراضي»،
   * فمصنع مافتحش الشاشة دي عمره بيفضل شغّال بنفس سلوك الأدوار التلاتة.
   */
  permissions?: Partial<Record<Role, PermMatrix>>;
  /** ترويسة المستندات وقواعد الترقيم — كلها اختيارية، والغايب بياخد افتراضي */
  docs?: DocSettings;
  /**
   * حساسية التنبيهات. الغايب بياخد الافتراضي من `rules.ts`، فمصنع
   * مافتحش الشاشة دي بيشوف نفس تنبيهاته بالحرف.
   */
  rules?: Partial<Record<
    | "stockBufferDays"
    | "overdueDangerDays"
    | "pendingCollectDays"
    | "lateOrderDangerDays"
    | "machineDownDangerHours"
    | "serviceWindowDays"
    | "cashHorizonDays"
    | "cashDangerDays",
    number
  >>;
  /** قرار الطاقة: أساس الجدولة كلها */
  capacity?: {
    hoursPerDay: number;
    daysPerWeek: number;
    utilizationPct: number;
    crewSize: number | null;
  };
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
  "maintenance",
] as const;
export type StockKind = (typeof STOCK_KINDS)[number];

export const STOCK_KIND_LABEL: Record<StockKind, string> = {
  opening: "رصيد افتتاحي",
  purchase: "شراء",
  issue: "صرف لأمر إنتاج",
  /* الاتجاه بيتقرا من إشارة الكمية: موجب مرتجع داخل، سالب مرتجع خارج لمورّد */
  return: "مرتجع",
  adjust: "تسوية جرد",
  waste: "هالك",
  receipt_fg: "استلام إنتاج تام",
  delivery: "تسليم للعميل",
  maintenance: "صرف قطع غيار للصيانة",
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
  /**
   * الدفعة اللي الحركة دي منها.
   *
   * ده العمود اللي التتبّع والاستدعاء كله قايم عليه: حركة دخول بتكتب
   * الدفعة اللي وصلت، وحركة صرف بتكتب الدفعة اللي نزلت الإنتاج — فسؤال
   * «الدفعة دي مشيت فين؟» بيتجاوب من الدفتر، مش من الذاكرة.
   *
   * و`null` مقصود ومسموح: المخزون اللي اتسجّل قبل الدفعات لسه موجود
   * وحقيقي، وماينفعش نخترع له دفعة مااتسجّلتش.
   */
  batchId?: string | null;
  notes: string;
};

/* ══ أوامر التوريد والاستلام والدفعات (M-V1) ══════════════════════ */

/**
 * أمر التوريد.
 *
 * قبل ده كان الشراء بيتسجّل كحركة مخزن جاهزة: «دخل ٩٧٠ متر». الحركة
 * بتقول اللي دخل ومابتقولش **اللي كان مطلوب**، فسؤال «في عجز؟» مالوش
 * إجابة في الدفتر، وسؤال «المورّد بيسلّم في ميعاده؟» كمان.
 *
 * الأمر ده بيفصل الاتفاق عن التنفيذ: الاتفاق سطور بكميات وأسعار، والتنفيذ
 * استلامات متعددة. والفرق بين الاتنين هو العجز والزيادة.
 */
export const SUPPLY_STATUSES = ["open", "partial", "received", "closed", "cancelled"] as const;
export type SupplyStatus = (typeof SUPPLY_STATUSES)[number];

export const SUPPLY_STATUS_LABEL: Record<SupplyStatus, string> = {
  open: "مفتوح — لسه مااستلمناش",
  partial: "توريد جزئي",
  received: "اتوصل بالكامل",
  closed: "مقفول بعجز",
  cancelled: "ملغي",
};

export type SupplyOrder = {
  id: string;
  factoryId: string;
  code: string;
  /** المورّد كجهة تعامل */
  partyId: string;
  date: string;
  /**
   * ميعاد التوريد المتفق عليه. ده الرقم اللي بيخلّي «المورّد بيتأخر؟»
   * سؤال ليه إجابة: بنقارنه بتاريخ آخر استلام، مش بإحساس.
   */
  expectedDate: string;
  status: SupplyStatus;
  /** قفل الأمر بعجز **قرار**: بنسجّل مين قرر وليه */
  closedAt?: string | null;
  closeReason?: string | null;
  cancelReason?: string | null;
  notes: string;
};

export type SupplyOrderLine = {
  id: string;
  factoryId: string;
  supplyOrderId: string;
  itemType: "material" | "product";
  itemId: string;
  /** الكمية المتفق عليها */
  qtyOrdered: number;
  /** السعر المتفق عليه — رقم اتفاق فبيتخزّن، مش بيتحسب */
  unitPrice: number;
  notes: string;
};

/**
 * الاستلام.
 *
 * **التوريد مش حركة واحدة.** أمر بعشرة آلاف متر بيوصل على تلات شحنات،
 * وكل شحنة ليها تاريخها ومستندها وعينتها. عشان كده الاستلام كيان بحياته،
 * والأمر بيفضل مفتوح لحد ما يخلص أو يتقفل بعجز.
 */
export type SupplyReceipt = {
  id: string;
  factoryId: string;
  code: string;
  supplyOrderId: string;
  date: string;
  warehouseId: string | null;
  /** رقم إذن التسليم بتاع المورّد — ورقته، مش ورقتنا */
  supplierDocNo: string;
  /** فاتورة المورّد في دفتر المصروفات، لو اتسجّلت */
  costEntryId: string | null;
  notes: string;
};

/**
 * سطر الاستلام: تفصيل الكمية.
 *
 * الكميات التلاتة اللي بتتخزّن هنا **حاضرة ومعدودة**: اتقبلت، أو اترفضت
 * بعيب، أو وصلت تالفة. واللي غير كده بيتحسب ولا يتخزّن:
 *
 *  - **الواصل** = المقبول + المرفوض + التالف (اللي نزل من العربية فعلًا)
 *  - **الباقي** = المطلوب − الواصل، طالما الأمر لسه مفتوح
 *  - **العجز** = نفس الرقم، بس **بعد** ما الأمر يتقفل — ساعتها بس الباقي
 *    بيبقى عجز، لأن اللي لسه جاي مش ناقص
 *  - **المرتجع** = اللي رجع للمورّد فعلًا، وده بيتسجّل في دفتر المرتجعات
 *    الموجود (`returns` بمصدر `supplier`) مش في جدول تاني
 *
 * والفرق بين «باقي» و«عجز» مش لعب بالكلام: الأول انتظار، والتاني خسارة
 * بقيمة، وبتتحسب على المورّد في درجته.
 */
export type SupplyReceiptLine = {
  id: string;
  factoryId: string;
  receiptId: string;
  supplyOrderLineId: string;
  /** اتقبل ودخل المخزن */
  qtyAccepted: number;
  /** وصل سليم الشكل بس مرفوض بالمواصفة */
  qtyRejected: number;
  /** وصل تالف — تلف نقل أو تخزين */
  qtyDamaged: number;
  /**
   * مكتوب في مستند المورّد ومش موجود في الشحنة.
   *
   * ده مختلف عن العجز: العجز في الأمر كله، وده **تعارض في ورقة الشحنة
   * دي بالذات** — المورّد كاتب ١٠٠٠ ونزل ٩٩٠. بيتسجّل عشان المطالبة
   * تبقى على ورقة، ومابيدخلش المخزن ولا بيتحسب واصل.
   */
  qtyMissing: number;
  /** الدفعة اللي اتعملت للكمية المقبولة */
  batchId: string | null;
  notes: string;
};

/**
 * الدفعة (لوط).
 *
 * أهم حاجة في القسم ده. من غير دفعة، «الخامة دي فيها مشكلة» سؤال مالوش
 * إجابة: عندك ٣ توريدات من نفس القماش من نفس المورّد، ومش عارف أنهي
 * توريد نزل أنهي أمر إنتاج، فبتسحب المنتجات كلها أو مافيش.
 *
 * الرصيد **مابيتخزّنش هنا**: بيتحسب من حركات المخزن اللي عليها الدفعة
 * دي، زي أي رصيد تاني في النظام.
 */
export const BATCH_STATUSES = ["active", "hold", "recalled", "blocked"] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const BATCH_STATUS_LABEL: Record<BatchStatus, string> = {
  active: "متاحة للصرف",
  hold: "موقوفة للفحص",
  recalled: "متستدعاة",
  blocked: "موقوفة نهائي",
};

export type MaterialBatch = {
  id: string;
  factoryId: string;
  code: string;
  itemType: "material" | "product";
  itemId: string;
  /** المورّد اللي جابها */
  partyId: string | null;
  /** سطر الاستلام اللي عملها — `null` لدفعة اتسجّلت بالإيد */
  receiptLineId: string | null;
  receivedDate: string;
  /** الكمية اللي دخلت بالدفعة — قياس وقت الاستلام، فبيتخزّن */
  qtyIn: number;
  /** تكلفة الوحدة في الدفعة دي — أساس تكلفة الدفعة في التقييم */
  unitCost: number;
  /** رقم اللوط المكتوب على الرول من المورّد — ورقه مش ورقنا */
  supplierLot: string;
  /** للخامات اللي بتنتهي: غرا، دهان، صبغة. `null` للقماش */
  expiryDate: string | null;
  status: BatchStatus;
  notes: string;
};

/**
 * الاستدعاء.
 *
 * لما دفعة تطلع فيها مشكلة، السؤال مش «إيه المشكلة» — ده متسجّل في
 * الجودة. السؤال **«المشكلة دي وصلت لمين؟»**، وإجابته سلسلة: الدفعة →
 * حركات الصرف → أوامر الإنتاج → التوريدات → العملاء → الفواتير.
 *
 * ومدى الاستدعاء **مابيتخزّنش**: بيتحسب من الدفتر وقت العرض. لو اتخزّن،
 * أول مرتجع جديد يخليه قديم.
 *
 * واللي **بيرجع** فعلًا بيتسجّل في دفتر المرتجعات الموجود بـ`recallId`،
 * مش في جدول جديد — عشان تكلفة الرجوع تمشي في نفس الحسابات.
 */
export const RECALL_STATUSES = ["open", "contained", "closed", "cancelled"] as const;
export type RecallStatus = (typeof RECALL_STATUSES)[number];

export const RECALL_STATUS_LABEL: Record<RecallStatus, string> = {
  open: "مفتوح — بنسحب",
  contained: "متحاصر",
  closed: "مقفول",
  cancelled: "ملغي",
};

export const RECALL_SEVERITIES = ["low", "high", "critical"] as const;
export type RecallSeverity = (typeof RECALL_SEVERITIES)[number];

export const RECALL_SEVERITY_LABEL: Record<RecallSeverity, string> = {
  low: "محدود",
  high: "خطير",
  critical: "حرج — وقف كل حاجة",
};

export type Recall = {
  id: string;
  factoryId: string;
  code: string;
  batchId: string;
  date: string;
  reason: string;
  severity: RecallSeverity;
  status: RecallStatus;
  /** المسؤول عن السحب */
  ownerId: string | null;
  closedAt?: string | null;
  cancelReason?: string | null;
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

/* ── أرض المصنع: القص والفرشة والباندلات ───────────────────────
 *
 * الحلقة الناقصة بين «صرفت قماش» و«خرج ٣٠٠ قطعة» هي **الفرشة**: القماش
 * بيتفرش طبقات، الماركر بيتحدد، القص بيطلع قطع، والقطع بتتربط باندلات
 * مرقّمة بمقاس ولون. من غير الباندل، تتبع العملية بيبقى رقم إجمالي على
 * الأمر كله؛ ومع الباندل، كل ٢٥ قطعة ليها هوية بتتنقل من عملية لعملية.
 */

export type CutLay = {
  id: string;
  factoryId: string;
  orderId: string;
  /** القماش اللي بيتفرش — خامة من المخزن */
  materialId: string;
  /** عملية القص في مسار المنتج — منها بيتسجّل الإنتاج */
  operationId: string | null;
  color: string;
  date: string;
  /** عدد الطبقات في الفرشة */
  plies: number;
  /** طول الماركر لطبقة واحدة (متر) */
  markerLengthM: number;
  /** فاقد الأطراف والنهايات لكل طبقة (متر) */
  endAllowanceM: number;
  /** عرض الفرشة (متر) — للتوثيق ومقارنة عرض الرول */
  markerWidthM: number;
  status: "planned" | "cut" | "cancelled";
  cutAt: string | null;
  /** المستهلك فعلًا وقت القص — لو مختلف عن المخطّط، الفرق هو الهالك */
  fabricUsedM: number | null;
  cancelReason?: string | null;
  notes: string;
};

/** سطر مقاس في الفرشة: كل طبقة بتطلع `perPly` قطعة من المقاس ده */
export type CutLayLine = {
  id: string;
  factoryId: string;
  layId: string;
  size: string;
  perPly: number;
};

export type Bundle = {
  id: string;
  factoryId: string;
  /** الرقم المطبوع على تيكت الباندل */
  code: string;
  orderId: string;
  layId: string | null;
  size: string;
  color: string;
  qty: number;
  createdAt: string;
};

export const BUNDLE_OP_STATES = ["running", "paused", "done"] as const;
export type BundleOpState = (typeof BUNDLE_OP_STATES)[number];

/**
 * تسجيل عملية على باندل.
 *
 * ده اللي بيرد على «القطعة وصلت لأي عملية، ومين شغّال عليها، وقعدت
 * قد إيه». الكميات لما العملية تخلص بتتسجّل كمان في دفتر الإنتاج
 * (`StageEntry`) عن طريق `stageEntryId` — فمفيش رقمين للإنتاج: الدفتر
 * واحد، وده بيضيف عليه **الهوية والوقت**.
 */
export type BundleOp = {
  id: string;
  factoryId: string;
  bundleId: string;
  orderId: string;
  operationId: string;
  seq: number;
  workerId: string | null;
  state: BundleOpState;
  startedAt: string;
  endedAt: string | null;
  /** دقايق التوقف المتراكمة (راحة، عطل، نقص خامة) */
  pausedMinutes: number;
  pausedAt: string | null;
  pauseNote: string;
  qtyGood: number;
  qtyRework: number;
  qtyScrap: number;
  /** أجر القطعة وقت التسجيل */
  rate: number;
  /** الزمن المعياري للقطعة وقت البدء — الكفاءة بتتقاس عليه */
  stdMinutes: number;
  /**
   * الماكينة اللي العملية اتعملت عليها.
   *
   * اختياري عن قصد: مصنع بيسجّل من الموبايل مش دايمًا هيختار ماكينة،
   * والإنتاج لازم يتسجّل سواء اختار أو لأ. اللي بيختار بياخد نسبة
   * تشغيل حقيقية للماكينة، واللي مابيختارش بياخد جاهزية من التوقف بس
   * — والشاشة بتقول التغطية كام بالظبط.
   */
  machineId?: string | null;
  defect: string;
  stageEntryId: string | null;
  notes: string;
};

/* ══ الماكينات والصيانة (M-M1) ══════════════════════════════════
 *
 * الماكينة مش أصل في كشف جرد — هي **سبب توقف**. عشان كده الجدول ده
 * مش «سجل ماكينات» وبس: هو الماكينة + تذاكرها + وقت توقفها، لأن السؤال
 * اللي المصنع بيسأله مش «عندي كام ماكينة» — هو «الخط وقف ليه، وقد إيه،
 * وكلّفني كام، وهيوقف تاني امتى».
 *
 * والتكلفة مش رقم بيتكتب بالإيد: قطع الغيار بتخرج من المخزن **بحركة
 * مخزون حقيقية** (`kind: "maintenance"`) زي أي صرف تاني، فرصيد قطع
 * الغيار بيقل فعلًا وتكلفة الصيانة بتطلع من الدفتر.
 */

export const MACHINE_STATES = ["running", "idle", "maintenance", "down", "retired"] as const;
export type MachineState = (typeof MACHINE_STATES)[number];

export const MACHINE_STATE_LABEL: Record<MachineState, string> = {
  running: "شغّالة",
  idle: "واقفة",
  maintenance: "في الصيانة",
  down: "عطلانة",
  retired: "خارج الخدمة",
};

export const MACHINE_KINDS = [
  "sewing",
  "overlock",
  "cutting",
  "press",
  "embroidery",
  "printing",
  "packing",
  "woodwork",
  "utility",
  "other",
] as const;
export type MachineKind = (typeof MACHINE_KINDS)[number];

/** نوع الماكينة عام عن قصد: صنعة مش للملابس بس */
export const MACHINE_KIND_LABEL: Record<MachineKind, string> = {
  sewing: "خياطة",
  overlock: "أورليه وحبك",
  cutting: "قص",
  press: "مكبس ومكوى",
  embroidery: "تطريز",
  printing: "طباعة",
  packing: "تعبئة وتغليف",
  woodwork: "نجارة وتشكيل",
  utility: "خدمات (كهرباء وهوا)",
  other: "نوع تاني",
};

export type Machine = {
  id: string;
  factoryId: string;
  /** كود مطبوع على الماكينة نفسها، زي MCH-004 */
  code: string;
  name: string;
  kind: MachineKind;
  brand: string;
  serial: string;
  /** خط الإنتاج بنفس نص الخط اللي في الأوامر — مش جدول تاني */
  line: string;
  /** المخزن/الموقع اللي الماكينة فيه */
  warehouseId: string | null;
  state: MachineState;
  boughtOn: string | null;
  cost: number;
  /** دقايق التشغيل المخططة في اليوم — أساس نسبة الجاهزية */
  dailyMinutes: number;
  /** كل كام يوم صيانة دورية. صفر = مفيش خطة صيانة */
  serviceEveryDays: number;
  lastServiceOn: string | null;
  notes: string;
};

export const TICKET_KINDS = ["breakdown", "service"] as const;
export type TicketKind = (typeof TICKET_KINDS)[number];

export const TICKET_KIND_LABEL: Record<TicketKind, string> = {
  breakdown: "عطل",
  service: "صيانة دورية",
};

export const TICKET_STATES = ["open", "working", "done", "cancelled"] as const;
export type TicketState = (typeof TICKET_STATES)[number];

export const TICKET_STATE_LABEL: Record<TicketState, string> = {
  open: "مفتوحة — لسه محدش بدأ",
  working: "تحت الإصلاح",
  done: "اتصلحت",
  cancelled: "ملغاة",
};

/**
 * تذكرة ماكينة: عطل أو صيانة دورية.
 *
 * وقت التوقف بيتحسب من الساعة (`startedAt` → `endedAt`) وينفع يتعدّل
 * بالإيد وقت الإقفال، لأن الماكينة ساعات بتقف قبل ما حد يفتح تذكرة.
 * واللي بيتخزّن هو **الدقايق** مش النسبة — النسبة بتتحسب وقت العرض.
 */
export type MachineTicket = {
  id: string;
  factoryId: string;
  code: string;
  machineId: string;
  kind: TicketKind;
  state: TicketState;
  reportedOn: string;
  /** بلاغ أرض المصنع اللي فتح التذكرة، لو اتفتحت من الخط */
  issueId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  /** دقايق التوقف الفعلية */
  downMinutes: number;
  cause: string;
  action: string;
  /** فني داخلي */
  workerId: string | null;
  /** ورشة خارجية كجهة تعامل */
  partyId: string | null;
  laborCost: number;
  outsideCost: number;
  notes: string;
};

export const FLOOR_ISSUE_KINDS = ["machine", "material", "quality", "other"] as const;
export type FloorIssueKind = (typeof FLOOR_ISSUE_KINDS)[number];

export const FLOOR_ISSUE_LABEL: Record<FloorIssueKind, string> = {
  machine: "عطل ماكينة",
  material: "طلب خامة",
  quality: "مشكلة جودة",
  other: "حاجة تانية",
};

/** بلاغ من أرض المصنع: عطل، نقص خامة، مشكلة جودة — بيظهر على شاشة الخط */
export type FloorIssue = {
  id: string;
  factoryId: string;
  kind: FloorIssueKind;
  line: string;
  orderId: string | null;
  bundleId: string | null;
  workerId: string | null;
  note: string;
  at: string;
  status: "open" | "resolved";
  resolvedAt: string | null;
  resolvedBy: string | null;
};

/* ── الترميز والمسح ────────────────────────────────────────────
 *
 * الأنواع اللي ليها كود يتطبع ويتمسح. القايمة دي مقصورة على اللي **ليه
 * سجل في الدفتر** — الكود اللي بيفتح على لا شيء أسوأ من إنه مايتطبعش.
 * وبناء الكود وقراءته في `codes.ts`.
 */

export const CODE_KINDS = [
  "material",
  "product",
  "warehouse",
  "order",
  "lay",
  "bundle",
  "subcontract",
  "party",
  "worker",
  "operation",
  "document",
  "batch",
  "supply",
  "machine",
] as const;

export type CodeKind = (typeof CODE_KINDS)[number];

/** البادئة اللي بتتكتب جوه الكود وتحت الـQR على الليبل */
export const KIND_TAG: Record<CodeKind, string> = {
  material: "MAT",
  product: "PRD",
  warehouse: "WHS",
  order: "ORD",
  lay: "LAY",
  bundle: "BND",
  subcontract: "SUB",
  party: "PTY",
  worker: "WRK",
  operation: "OPR",
  document: "DOC",
  batch: "LOT",
  supply: "SUP",
  machine: "MCH",
};

export const KIND_LABEL: Record<CodeKind, string> = {
  material: "خامة",
  product: "موديل",
  warehouse: "مخزن",
  order: "أمر إنتاج",
  lay: "فرشة قص",
  bundle: "باندل",
  subcontract: "إذن تشغيل خارجي",
  party: "جهة تعامل",
  worker: "عامل",
  operation: "عملية",
  document: "مستند",
  batch: "دفعة خامة",
  supply: "أمر توريد",
  machine: "ماكينة",
};

/** الإجراءات اللي المسح بيوصّل لها — كل واحدة مربوطة بميوتيشن موجودة */
export const SCAN_ACTIONS = ["open", "start", "finish", "issue", "receive", "report", "verify"] as const;
export type ScanAction = (typeof SCAN_ACTIONS)[number];

export const SCAN_ACTION_LABEL: Record<ScanAction, string> = {
  open: "فتح السجل",
  start: "بدء عملية",
  finish: "تسليم عملية",
  issue: "صرف خامة",
  receive: "استلام خامة",
  report: "بلاغ",
  verify: "تحقق من مستند",
};

/**
 * حركة مسح واحدة.
 *
 * ودي **دفتر** مش لوج شكلي: كل مسح بيتسجّل بمين ومتى وإزاي جه الكود
 * وإيه اللي اتعمل، عشان أي باندل أو خامة تقدر ترجع لتاريخها كامل.
 *
 * اللي **مش** متسجّل وبنقوله بالصريح: موديل الجهاز والموقع الجغرافي.
 * المتصفح مابيدّي الأول بشكل يعتمد عليه، والتاني عايز إذن من العامل —
 * فبنسجّل `source` (كاميرا / مكتوب بالإيد / رابط) وده اللي نعرفه فعلًا.
 */
export type ScanEvent = {
  id: string;
  factoryId: string;
  at: string;
  actorId: string;
  actorName: string;
  kind: CodeKind;
  /** معرّف السجل اللي الكود شاور عليه */
  refId: string;
  /** الكود زي ما اتقرا — بيفضل محفوظ حتى لو السجل اتغيّر بعدها */
  code: string;
  action: ScanAction;
  source: "camera" | "manual" | "link";
  /** الكمية لو الإجراء كان عليه كمية */
  qty: number | null;
  /** منين ولحد فين: مخزن، خط، ورشة — اسم مقروء وقت المسح */
  from: string;
  to: string;
  note: string;
};

/* ── المرتجعات والشكاوى ────────────────────────────────────────
 *
 * المرتجع فيه سؤالين مختلفين والخلط بينهم هو اللي بيوقّع أي نظام مرتجعات:
 *
 *   **مين رجّعه** (`source`) — عميل، أو مورّد، أو رجوع من الخط للمخزن.
 *   **رجع بأي حال** (`condition`) — سليم ينفع يتباع تاني، أو تالف.
 *
 * وعشان كده «مرتجع تالف» مش نوع رابع جنب العميل والمورّد: هو **حالة** بتقع
 * على أي واحد من التلاتة. لو عملناه نوع مستقل، المرتجع اللي جه من عميل
 * وهو تالف مش هيبقى له خانة — يا نحسبه مرتجع عميل ونضيّع إنه تالف، يا
 * نحسبه تالف ونضيّع إنه من عميل. فالسؤالين منفصلين هنا بالتصميم.
 */

export const RETURN_SOURCES = ["customer", "supplier", "production"] as const;
export type ReturnSource = (typeof RETURN_SOURCES)[number];

export const RETURN_SOURCE_LABEL: Record<ReturnSource, string> = {
  customer: "مرتجع عميل",
  supplier: "مرتجع لمورّد",
  production: "مرتجع من الإنتاج",
};

export const RETURN_CONDITIONS = ["good", "defective"] as const;
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number];

export const RETURN_CONDITION_LABEL: Record<ReturnCondition, string> = {
  good: "سليم",
  defective: "تالف",
};

/**
 * أسباب المرتجع.
 *
 * قايمة مقفولة بالتصميم مش خانة كتابة حرة: «تحليل أكثر الموديلات إرجاعًا»
 * مالوش أي معنى لو السبب مكتوب بخمس صيغ مختلفة. والتفاصيل بتتكتب في
 * `reasonNote` جنب السبب المختار، فمحدش بيخسر معلومة.
 *
 * و`sources` بتحدّد السبب ده يظهر لمين: «خامة مخالفة للمواصفة» سبب مورّد،
 * و«العميل غيّر رأيه» سبب عميل، و«فاضل من أمر إنتاج» رجوع من الخط.
 */
export const RETURN_REASONS = [
  "quality",
  "wrong_item",
  "wrong_size",
  "wrong_color",
  "shortage",
  "excess",
  "damaged_transit",
  "late",
  "spec_mismatch",
  "changed_mind",
  "leftover",
  "other",
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export const RETURN_REASON_DEFS: Record<ReturnReason, { label: string; sources: ReturnSource[] }> = {
  quality: { label: "عيب صناعة", sources: ["customer", "supplier", "production"] },
  wrong_item: { label: "صنف غلط", sources: ["customer", "supplier"] },
  wrong_size: { label: "مقاس غلط", sources: ["customer"] },
  wrong_color: { label: "لون مختلف", sources: ["customer", "supplier"] },
  shortage: { label: "الكمية ناقصة", sources: ["customer", "supplier"] },
  excess: { label: "الكمية زيادة", sources: ["customer", "supplier"] },
  damaged_transit: { label: "تلف في النقل", sources: ["customer", "supplier"] },
  late: { label: "تأخير التسليم", sources: ["customer", "supplier"] },
  spec_mismatch: { label: "مخالف للمواصفة", sources: ["supplier", "customer"] },
  changed_mind: { label: "العميل غيّر رأيه", sources: ["customer"] },
  leftover: { label: "فاضل من أمر إنتاج", sources: ["production"] },
  other: { label: "سبب تاني", sources: ["customer", "supplier", "production"] },
};

/* ── تصنيف المشاكل ────────────────────────────────────────────
 *
 * القايمة دي هي **قايمة واحدة لكل المصنع**: نفس المشكلة اللي بتتسجّل على
 * الباندل جوه الخط هي اللي بتتسجّل على المرتجع الراجع من العميل. ولو
 * عملنا لكل ناحية قايمة، السؤال «أكتر مشكلة عندنا إيه؟» بيبقى ليه
 * إجابتين مختلفتين، والباريتو بتاع الجودة بيفقد معناه.
 *
 * و**«مشكلة من المورّد» و«مشكلة من العميل» مش أنواع مشاكل** — دول
 * **مصدر** المشكلة (`ProblemOrigin`) مش وصفها. لو حطيناهم في نفس القايمة،
 * المرتجع اللي فيه عيب خياطة وجاي من خامة المورّد مش هيبقى له خانة: يا
 * نكتب «عيب خياطة» ونضيّع إن المورّد سببها، يا نكتب «مشكلة من المورّد»
 * ونضيّع إنها خياطة. فاتفصلوا: **إيه المشكلة** غير **جات منين**.
 */

export const PROBLEM_CATEGORIES = ["workmanship", "material", "spec", "handling", "other"] as const;
export type ProblemCategory = (typeof PROBLEM_CATEGORIES)[number];

export const PROBLEM_CATEGORY_LABEL: Record<ProblemCategory, string> = {
  workmanship: "صنعة وتشغيل",
  material: "خامة",
  spec: "مواصفة وكمية",
  handling: "تداول وتغليف",
  other: "حاجة تانية",
};

export const PROBLEM_KINDS = [
  "sewing",
  "cutting",
  "finishing",
  "ironing",
  "printing",
  "embroidery",
  "fabric",
  "accessory",
  "tear",
  "size",
  "color",
  "wrong_item",
  "shortage",
  "packing",
  "transit",
  "other_problem",
] as const;
export type ProblemKind = (typeof PROBLEM_KINDS)[number];

export const PROBLEM_DEFS: Record<ProblemKind, { label: string; category: ProblemCategory }> = {
  sewing: { label: "عيب خياطة", category: "workmanship" },
  cutting: { label: "عيب قص", category: "workmanship" },
  finishing: { label: "عيب تشطيب", category: "workmanship" },
  ironing: { label: "عيب مكوى", category: "workmanship" },
  printing: { label: "عيب طباعة", category: "workmanship" },
  embroidery: { label: "عيب تطريز", category: "workmanship" },
  fabric: { label: "عيب قماش", category: "material" },
  accessory: { label: "إكسسوار ناقص أو غلط", category: "material" },
  tear: { label: "قطع أو تمزق", category: "material" },
  size: { label: "مقاس مش مطابق", category: "spec" },
  color: { label: "لون مختلف", category: "spec" },
  wrong_item: { label: "منتج غلط", category: "spec" },
  shortage: { label: "كمية ناقصة", category: "spec" },
  packing: { label: "عيب تغليف", category: "handling" },
  transit: { label: "تلف في النقل", category: "handling" },
  other_problem: { label: "مشكلة تانية", category: "other" },
};

export const PROBLEM_LABEL = Object.fromEntries(
  PROBLEM_KINDS.map((k) => [k, PROBLEM_DEFS[k].label]),
) as Record<ProblemKind, string>;

/**
 * مصدر المشكلة — **مين أو إيه اللي جابها**، مش مين اللي بلّغ عنها.
 *
 * و`unknown` مقصودة وموجودة في القايمة: المشكلة اللي مصدرها مش معروف
 * لازم يبقى لها خانة صريحة، لأن البديل إن المستخدم يختار أقرب حاجة
 * فيطلع باريتو بيتّهم العامل في مشاكل محدش عارف مصدرها.
 */
export const PROBLEM_ORIGINS = [
  "supplier",
  "material",
  "machine",
  "line",
  "operation",
  "worker",
  "qc",
  "transport",
  "customer",
  "unknown",
] as const;
export type ProblemOrigin = (typeof PROBLEM_ORIGINS)[number];

export const PROBLEM_ORIGIN_LABEL: Record<ProblemOrigin, string> = {
  supplier: "المورّد",
  material: "الخامة",
  machine: "الماكينة",
  line: "خط الإنتاج",
  operation: "العملية",
  worker: "العامل",
  qc: "الفحص",
  transport: "النقل",
  customer: "العميل",
  unknown: "لسه مش معروف",
};

/**
 * جذر المشكلة — الطبقة اللي تحت المصدر.
 *
 * «عيب خياطة من العامل» مش سبب؛ ده مكان. السبب هو **ليه** العامل عملها:
 * ماكينة مش مظبوطة، ولا تدريب ناقص، ولا خيط وحش، ولا شد قماش. من غير
 * الطبقة دي بنصلح نفس المشكلة كل شهر ونفتكر إننا بنشتغل.
 */
export const ROOT_CAUSES = [
  "calibration",
  "training",
  "material_quality",
  "tension",
  "spec_unclear",
  "rush",
  "storage",
  "unknown_cause",
] as const;
export type RootCause = (typeof ROOT_CAUSES)[number];

export const ROOT_CAUSE_LABEL: Record<RootCause, string> = {
  calibration: "ضبط الماكينة",
  training: "تدريب العامل",
  material_quality: "جودة الخامة",
  tension: "شد القماش أو الخيط",
  spec_unclear: "المواصفة مش واضحة",
  rush: "استعجال التسليم",
  storage: "تخزين أو تداول",
  unknown_cause: "لسه مش محدَّد",
};

/**
 * بنود تكلفة المرتجع.
 *
 * تكلفة المرتجع مش رقم واحد، وعشان كده بقت **سطور** بدل خانة `extraCost`
 * الواحدة: «رجع ١٠٠ قطعة» مابيقولش حاجة، لكن «شحن رجوع ٤٠٠ + فحص ١٥٠ +
 * أجر إصلاح ٩٠٠ + خامات ٣٢٠» بتقول إن المشكلة دي كلّفت المصنع كام وفين
 * بالظبط — وده اللي بيخلي تقليلها قرار له رقم.
 *
 * وبندين منهم **مايتكتبوش بالإيد لما يبقى فيه أمر إصلاح**: أجر الإصلاح
 * وخامات الإصلاح بيتحسبوا من أمر الإصلاح نفسه، عشان مايتعدّوش مرتين.
 */
export const RETURN_COST_KINDS = [
  "shipping_in",
  "inspection",
  "repair_labor",
  "spare_materials",
  "rework",
  "packaging",
  "shipping_out",
  "scrap",
  "admin",
] as const;
export type ReturnCostKind = (typeof RETURN_COST_KINDS)[number];

export const RETURN_COST_LABEL: Record<ReturnCostKind, string> = {
  shipping_in: "شحن الرجوع",
  inspection: "الفحص",
  repair_labor: "أجر الإصلاح",
  spare_materials: "خامات الإصلاح",
  rework: "إعادة تشغيل",
  packaging: "إعادة تغليف",
  shipping_out: "شحن إعادة الإرسال",
  scrap: "الهالك",
  admin: "مصاريف إدارية",
};

/** البنود اللي أمر الإصلاح بيحسبها، فمابتتكتبش بالإيد لو الأمر موجود */
export const REPAIR_DERIVED_COSTS: ReturnCostKind[] = ["repair_labor", "spare_materials"];

export type ReturnCostLine = {
  id: string;
  kind: ReturnCostKind;
  amount: number;
  note: string;
};

/**
 * إثبات المشكلة.
 *
 * الصورة مش زينة: هي اللي بتخلي المطالبة على المورّد أو الرد على العميل
 * قابل للإثبات بعد شهرين. و`phase` بتفرّق بين صورة **قبل** الإصلاح
 * وصورة **بعده** — وده اللي بيخلي «اتصلحت» جملة عليها دليل.
 */
export const ATTACHMENT_PHASES = ["before", "after"] as const;
export type AttachmentPhase = (typeof ATTACHMENT_PHASES)[number];

export type Attachment = {
  id: string;
  name: string;
  phase: AttachmentPhase;
  /** صورة مصغّرة متخزّنة inline. الملفات الكبيرة مكانها التخزين على السيرفر */
  dataUrl: string;
  note: string;
  at: string;
  by: string;
};

/**
 * قرار المرتجع — وكل قرار له أثر مختلف تمامًا على الفلوس والمخزن:
 *
 *   `replacement` بديل: مفيش فلوس بتتحرك، وفيه كمية لازم تتنتج وتتسلّم تاني.
 *   `credit`      إشعار خصم: بيقلّل مديونية العميل (أو مديونيتنا للمورّد) بدون كاش.
 *   `refund`      رد نقدي: فلوس بتطلع من خزنة محددة.
 *   `repair`      إصلاح وإعادة تسليم: تكلفة تشغيل بدون خصم.
 *   `scrap`       إهلاك: القطعة خسارة، ومابتدخلش المخزن.
 *   `reject`      المرتجع مرفوض: مفيش أثر، بسبب مكتوب.
 */
export const RETURN_RESOLUTIONS = ["replacement", "credit", "refund", "repair", "scrap", "reject"] as const;
export type ReturnResolution = (typeof RETURN_RESOLUTIONS)[number];

export const RETURN_RESOLUTION_LABEL: Record<ReturnResolution, string> = {
  replacement: "بديل",
  credit: "إشعار خصم",
  refund: "رد نقدي",
  repair: "إصلاح وإعادة تسليم",
  scrap: "إهلاك",
  reject: "مرفوض",
};

export const RETURN_STATUSES = ["open", "inspected", "settled", "cancelled"] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  open: "وصل — مستني فحص",
  inspected: "متفحوص — مستني قرار",
  settled: "متسوّى",
  cancelled: "ملغي",
};

/**
 * المرتجع.
 *
 * الحركة بتمشي على تلات خطوات مقصودة: **وصل** → **اتفحص** → **اتسوّى**.
 * السبب إن أثر المرتجع على الفلوس والمخزن مايتحددش لحد ما حد يبصّ على
 * القطعة: نفس الكمية لو رجعت سليمة تدخل المخزن، ولو رجعت تالفة تبقى خسارة.
 * فلو سجّلنا الأثر وقت الوصول، كل مرتجع كان هيدخل المخزن غلط ويطلع منه بعدين.
 *
 * و`unitValue` بيتخزّن لأنه **قرار** مش حساب: قيمة القطعة المتفق عليها وقت
 * المرتجع. السعر بيتغير بعد كده، والمرتجع لازم يفضل بقيمته وقتها — نفس
 * منطق `rate` في `BundleOp` و`Subcontract`.
 */
export type ReturnEntry = {
  id: string;
  factoryId: string;
  /** الرقم المطبوع على تيكت المرتجع، زي RET-2026-000012 */
  code: string;
  source: ReturnSource;
  date: string;
  /** العميل أو المورّد — فاضي في رجوع الخط للمخزن */
  partyId: string | null;
  itemType: "product" | "material";
  itemId: string;
  qty: number;
  condition: ReturnCondition;
  reason: ReturnReason;
  reasonNote: string;
  /* ── المشكلة: إيه، جات منين، وليه ──────────────────────────
   * التلاتة منفصلين عن بعض عن قصد، وكل واحد بيجاوب سؤال تاني خالص.
   * و`problem` ممكن تكون فاضية لأن مش كل مرتجع فيه عيب: العميل اللي
   * غيّر رأيه رجّع قطعة سليمة مافيهاش مشكلة أصلًا.
   */
  problem: ProblemKind | null;
  origin: ProblemOrigin | null;
  rootCause: RootCause | null;
  /* الربط: كل واحد بيجاوب سؤال مختلف عن مصدر المشكلة */
  /** التوريد اللي القطعة خرجت فيه */
  deliveryId: string | null;
  /** أمر الإنتاج اللي طلعها */
  orderId: string | null;
  /** الباندل بالتحديد — منه نعرف العملية والعامل والخط */
  bundleId: string | null;
  /** اللون والمقاس: بيتعبّوا من الباندل لو موجود، وبيتكتبوا لو مش موجود */
  color: string;
  size: string;
  /** خط الإنتاج اللي طلعها — من الأمر أو مكتوب */
  line: string;
  /** العملية اللي المشكلة فيها، والعامل اللي عملها — ادّعاء لازم يتقال بصراحة */
  operationId: string | null;
  workerId: string | null;
  /** المسؤول عن متابعة الحالة — عضو في المصنع */
  ownerId: string | null;
  /** فاتورة الشراء لمرتجع المورّد */
  costEntryId: string | null;
  /** بلاغ الجودة المرتبط لو المرتجع طلع من فحص */
  issueId: string | null;
  /**
   * الاستدعاء اللي المرتجع ده جزء منه.
   *
   * وجوده هنا مش تزويد عمود: هو اللي بيخلّي «رجع كام من الاستدعاء»
   * يتحسب من دفتر المرتجعات بتكلفته الكاملة، بدل جدول تاني بأرقام
   * موازية تفرق عنه.
   */
  recallId?: string | null;
  status: ReturnStatus;
  resolution: ReturnResolution | null;
  unitValue: number;
  /** المبلغ اللي اتخصم أو اترد فعلًا وقت التسوية */
  settleAmount: number;
  accountId: string | null;
  method: PayMethod | null;
  /** مصاريف المرتجع مفصّلة ببنودها — المجموع بيتحسب مش بيتخزّن */
  costs: ReturnCostLine[];
  /** صور قبل وبعد الإصلاح */
  attachments: Attachment[];
  /** رجع المخزن ولا لأ — الكمية التالفة مابتدخلش */
  restock: boolean;
  warehouseId: string | null;
  /** كمية البديل المتفق عليها */
  replacementQty: number;
  inspectedAt: string | null;
  inspectedBy: string | null;
  settledAt: string | null;
  settledBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  createdAt: string;
  createdBy: string;
  notes: string;
};

/* ── أوامر الإصلاح ─────────────────────────────────────────────
 *
 * المرتجع اللي قراره «إصلاح» بيفتح **أمر إصلاح** بدل ما تتكتب تكلفة
 * تقديرية في خانة. والسبب إن الإصلاح شغل حقيقي: قطع بتتصلح، عامل بيقعد
 * عليها وقت، خامات بتتصرف من المخزن، وفحص بيقرر عدّت ولا لأ. لو كتبنا
 * «تكلفة الإصلاح ٩٠٠» ملهاش سند، الخامات دي بتفضل في المخزون على الورق
 * وهي مصروفة فعلًا.
 *
 * ودورة الحياة هنا **منفصلة عن حالة المرتجع** عن قصد: المرتجع دفتر
 * تجاري (رجع → اتفحص → اتسوّى)، وأمر الإصلاح دفتر تشغيلي (في الطابور →
 * بيتصلح → فحص → جاهز → اترجّع). لو دمجناهم في عمود حالة واحد، كنا
 * هنحتاج اتناشر حالة، والحالة اللي معناها «اتسوّى تجاريًا وبيتصلح
 * تشغيليًا» مكانتش هتلاقي خانة.
 */
export const REPAIR_STATUSES = ["queued", "repairing", "qc", "ready", "shipped", "scrapped", "cancelled"] as const;
export type RepairStatus = (typeof REPAIR_STATUSES)[number];

export const REPAIR_STATUS_LABEL: Record<RepairStatus, string> = {
  queued: "في الطابور",
  repairing: "بيتصلح",
  qc: "تحت الفحص",
  ready: "جاهز",
  shipped: "اترجّع للعميل",
  scrapped: "مش قابل للإصلاح",
  cancelled: "ملغي",
};

export type RepairMaterial = {
  id: string;
  materialId: string;
  qty: number;
  /** تكلفة الوحدة وقت الصرف — قرار وقتها، مش السعر النهارده */
  unitCost: number;
};

export type RepairOrder = {
  id: string;
  factoryId: string;
  /** الرقم المطبوع على أمر الإصلاح، زي REP-2026-000004 */
  code: string;
  returnId: string;
  date: string;
  qty: number;
  problem: ProblemKind | null;
  workerId: string | null;
  operationId: string | null;
  /** أجر إصلاح القطعة — قرار وقت فتح الأمر */
  rate: number;
  /** الوقت الفعلي اللي الإصلاح خده، بيتحسب من البداية والنهاية */
  minutes: number;
  materials: RepairMaterial[];
  status: RepairStatus;
  startedAt: string | null;
  finishedAt: string | null;
  /** نتيجة الفحص: عدّت كام وسقطت كام */
  qtyPassed: number;
  qtyFailed: number;
  qcAt: string | null;
  qcBy: string | null;
  qcNote: string;
  shippedAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  createdBy: string;
  notes: string;
};

export const COMPLAINT_KINDS = ["quality", "delay", "shortage", "price", "service", "other"] as const;
export type ComplaintKind = (typeof COMPLAINT_KINDS)[number];

export const COMPLAINT_KIND_LABEL: Record<ComplaintKind, string> = {
  quality: "جودة",
  delay: "تأخير",
  shortage: "كمية ناقصة",
  price: "سعر وفاتورة",
  service: "تعامل وخدمة",
  other: "حاجة تانية",
};

export const COMPLAINT_STATUSES = ["open", "investigating", "resolved", "closed"] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const COMPLAINT_STATUS_LABEL: Record<ComplaintStatus, string> = {
  open: "مفتوحة",
  investigating: "تحت الفحص",
  resolved: "اتحلّت",
  closed: "مقفولة",
};

/**
 * الشكوى.
 *
 * منفصلة عن المرتجع لأن **مش كل شكوى معاها قطعة راجعة**: عميل بيشتكي إن
 * التسليم اتأخر، أو إن الفاتورة فيها بند غلط، أو إن التعامل مضايقه — ومفيش
 * كمية بتتحرك. ولو حبسنا الشكوى جوه المرتجع، النوع ده كله كان هيضيع، وهو
 * بالظبط اللي بيسبق فقدان العميل.
 *
 * ولو الشكوى طلع منها مرتجع، `returnId` بيربطهم — علاقة، مش دمج.
 */
export type Complaint = {
  id: string;
  factoryId: string;
  code: string;
  partyId: string;
  date: string;
  kind: ComplaintKind;
  severity: "low" | "medium" | "high";
  subject: string;
  detail: string;
  deliveryId: string | null;
  orderId: string | null;
  returnId: string | null;
  /** المسؤول عن المتابعة — عضو في المصنع */
  ownerId: string | null;
  dueDate: string | null;
  status: ComplaintStatus;
  /** مطالبة مالية من العميل لو موجودة */
  claimAmount: number;
  resolution: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  createdBy: string;
};

/* ── الورش الخارجية ────────────────────────────────────────────
 *
 * الورشة **جهة تعامل** بدور `workshop` — مش جدول تاني. اللي جديد هنا هو
 * حركة التشغيل نفسها: طلعت كمية وخامات، والمتوقع يرجع كذا، ورجع كذا،
 * والفرق هالك. وحساب الورشة بيتحسب من الاستلامات مش من فاتورة مكتوبة.
 */

export type Subcontract = {
  id: string;
  factoryId: string;
  code: string;
  partyId: string;
  orderId: string | null;
  operationId: string | null;
  date: string;
  expectedDate: string;
  /** الكمية اللي طلعت للورشة */
  qtySent: number;
  /** أجر تشغيل القطعة */
  rate: number;
  status: "open" | "closed" | "cancelled";
  closedAt?: string | null;
  cancelReason?: string | null;
  notes: string;
};

export type SubReceipt = {
  id: string;
  factoryId: string;
  subcontractId: string;
  date: string;
  qtyGood: number;
  qtyRework: number;
  /** الناقص أو التالف اللي مارجعش سليم */
  qtyLost: number;
  stageEntryId: string | null;
  notes: string;
};

export type SubPayment = {
  id: string;
  factoryId: string;
  partyId: string;
  subcontractId: string | null;
  date: string;
  amount: number;
  accountId: string;
  method: PayMethod;
  notes: string;
};

export type ManualTx = {
  id: string;
  factoryId: string;
  date: string;
  accountId: string;
  amount: number;
  notes: string;
};

/* ── المستندات والطباعة ────────────────────────────────────────── */

export type DocSettings = {
  /** الترويسة: اللي بيطلع فوق كل مستند مطبوع */
  legalName?: string;
  taxId?: string;
  commercialReg?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  /** شعار المصنع كـdata URL — نفس مسار صورة التحويل */
  logo?: string | null;
  /** الشروط والفوتر بيتطبعوا في آخر المستند */
  terms?: string;
  footer?: string;
  /** تسميات التوقيعات: مين بيوقّع يمين ومين شمال */
  signLeft?: string;
  signRight?: string;
  showQr?: boolean;
  /** مقاس الورقة الافتراضي لكل نوع */
  paper?: Partial<Record<DocType, string>>;
  /** قواعد الترقيم لكل نوع */
  numbering?: Partial<Record<DocType, DocNumbering>>;
  /** مستند بمبلغ أكبر من كده لازم موافقة قبل الإصدار — null معناه بلا موافقات */
  approvalOver?: number | null;
};

export type DocNumbering = {
  prefix: string;
  /** عدد خانات الرقم المسلسل */
  padding: number;
  /** المسلسل يبدأ من أول كل سنة ولا يكمّل */
  resetYearly: boolean;
  /** أول رقم — المصنع ممكن يكون عنده أرقام قديمة فيكمّل من عندها */
  start: number;
};

export const DOC_TYPES = [
  "order",
  "production",
  "cutting",
  "bundle",
  "subout",
  "subin",
  "subaccount",
  "issue",
  "grn",
  "qc",
  "delivery",
  "invoice",
  "receipt",
  "statement",
  "purchase",
  "payvoucher",
  "payslip",
  "stock",
  "maintenance",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_STATUSES = ["draft", "pending", "approved", "issued", "cancelled"] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

/**
 * المستند المصدَر.
 *
 * السطر ده هو **الحاجة الوحيدة اللي بتتخزّن** عن المستند: نوعه ورقمه
 * وتاريخه ومين أصدره وعلى أي سجل. باقي محتوى المستند (الأسطر
 * والمجاميع) بيتبنى وقت الطباعة من نفس الدفاتر، فمفيش نسخة تانية من
 * الأرقام تقدر تخالف الأصل.
 *
 * والإلغاء **مابيمسحش**: بيسيب السطر ويحوّل حالته لـ`cancelled` بسبب
 * مكتوب — لأن رقم مستند اختفى معناه دفتر فيه فجوة.
 */
export type IssuedDoc = {
  id: string;
  factoryId: string;
  type: DocType;
  /** الرقم المطبوع بالكامل، زي INV-2026-000124 */
  number: string;
  /** المسلسل لوحده — منه بيتحسب اللي بعده */
  serial: number;
  year: number;
  /** السجل اللي المستند اتبنى منه */
  refId: string;
  /** سجل تاني لو المستند محتاج اتنين (زي كشف حساب بفترة) */
  refExtra?: string | null;
  date: string;
  /** المبلغ وقت الإصدار — للموافقات والتحقق، مش للعرض */
  amount: number | null;
  status: DocStatus;
  /** رقم المراجعة: إعادة الإصدار بترفعه بدل ما تغيّر الرقم */
  revision: number;
  createdBy: string;
  createdAt: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  /** بصمة قصيرة بتتطبع مع الـQR — بتكشف الورق المعدّل بالإيد */
  stamp: string;
  notes?: string;
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
  supplyOrders: SupplyOrder[];
  supplyOrderLines: SupplyOrderLine[];
  supplyReceipts: SupplyReceipt[];
  supplyReceiptLines: SupplyReceiptLine[];
  batches: MaterialBatch[];
  recalls: Recall[];
  stageEntries: StageEntry[];
  cutLays: CutLay[];
  cutLayLines: CutLayLine[];
  bundles: Bundle[];
  bundleOps: BundleOp[];
  floorIssues: FloorIssue[];
  machines: Machine[];
  machineTickets: MachineTicket[];
  scans: ScanEvent[];
  subcontracts: Subcontract[];
  subReceipts: SubReceipt[];
  subPayments: SubPayment[];
  returns: ReturnEntry[];
  repairs: RepairOrder[];
  complaints: Complaint[];
  costItems: CostItem[];
  costEntries: CostEntry[];
  costPayments: CostPayment[];
  parties: Party[];
  contacts: PartyContact[];
  addresses: PartyAddress[];
  communications: Communication[];
  tasks: PartyTask[];
  deliveries: Delivery[];
  collections: Collection[];
  workers: Worker[];
  workerEarnings: WorkerEarning[];
  workerPayments: WorkerPayment[];
  orders: Order[];
  manualTx: ManualTx[];
  documents: IssuedDoc[];
  auditLog: AuditEntry[];
};

export type Session = {
  memberId: string;
  email: string;
  name: string;
  role: Role;
  /** المصنع اللي الجلسة دي فيه — جلسة مصنع مش بتنفع لمصنع تاني */
  factoryId?: string;
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
