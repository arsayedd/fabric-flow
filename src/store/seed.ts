import { addDays, cairoToday, nid } from "@/lib/utils";
import { TEMPLATES } from "./templates";
import {
  DEFAULT_COST_ITEMS,
  type Category,
  type Db,
  type Industry,
  type Material,
  type Member,
  type Operation,
  type Unit,
  type Warehouse,
} from "./types";

const FID = "factory-demo-1";

export const DEMO_MEMBERS: Member[] = [
  { id: "m-owner", factoryId: FID, email: "owner@factory.demo", name: "صاحب المصنع", role: "owner" },
  { id: "m-acc", factoryId: FID, email: "accountant@factory.demo", name: "منى المحاسب", role: "accountant" },
  { id: "m-sup", factoryId: FID, email: "supervisor@factory.demo", name: "حسام المشرف", role: "supervisor" },
];

type TemplateData = {
  units: Unit[];
  categories: Category[];
  warehouses: Warehouse[];
  materials: Material[];
  operations: Operation[];
};

/** يبذر بيانات قالب الصناعة: وحدات، فئات، مخازن، خامات، عمليات */
export function templateData(factoryId: string, industry: Industry, id: (prefix: string, i: number) => string): TemplateData {
  const t = TEMPLATES[industry];
  const units: Unit[] = t.units.map((name, i) => ({ id: id("un", i + 1), factoryId, name }));
  const unitId = (name: string) => units.find((u) => u.name === name)?.id ?? null;

  const productCats: Category[] = t.productCategories.map((name, i) => ({
    id: id("pc", i + 1),
    factoryId,
    name,
    kind: "product" as const,
  }));
  const materialCats: Category[] = t.materialCategories.map((name, i) => ({
    id: id("mc", i + 1),
    factoryId,
    name,
    kind: "material" as const,
  }));
  const catId = (name: string) => materialCats.find((c) => c.name === name)?.id ?? null;

  return {
    units,
    categories: [...productCats, ...materialCats],
    warehouses: [
      { id: id("wh", 1), factoryId, name: "مخزن الخامات", kind: "material" },
      { id: id("wh", 2), factoryId, name: "مخزن الإنتاج التام", kind: "finished" },
    ],
    materials: t.materials.map(([name, unit, cat, cost], i) => ({
      id: id("mat", i + 1),
      factoryId,
      sku: `M-${String(i + 1).padStart(3, "0")}`,
      name,
      categoryId: catId(cat),
      unitId: unitId(unit),
      avgCost: cost,
      reorderPoint: 0,
      leadTimeDays: 7,
      defaultVendor: "",
    })),
    operations: t.operations.map(([name, rate, minutes, out], i) => ({
      id: id("op", i + 1),
      factoryId,
      name,
      defaultRate: rate,
      defaultMinutes: minutes,
      isOutsourced: out,
    })),
  };
}

export function emptyDb(factoryName: string, industry: Industry = "custom"): Db {
  const factoryId = nid();
  const tpl = templateData(factoryId, industry, () => nid());
  return {
    factory: { id: factoryId, name: factoryName, createdAt: new Date().toISOString() },
    settings: { industry, overheadPerUnit: 0 },
    members: [
      { id: "m-owner", factoryId, email: "owner@factory.demo", name: "صاحب المصنع", role: "owner" },
    ],
    invites: [],
    accounts: [
      { id: nid(), factoryId, name: "درج النقدية", kind: "cash" },
      { id: nid(), factoryId, name: "حساب البنك الأهلي", kind: "bank" },
      { id: nid(), factoryId, name: "إنستاباي", kind: "instapay" },
      { id: nid(), factoryId, name: "محفظة فودافون كاش", kind: "wallet" },
    ],
    units: tpl.units,
    categories: tpl.categories,
    warehouses: tpl.warehouses,
    materials: tpl.materials,
    products: [],
    boms: [],
    bomItems: [],
    operations: tpl.operations,
    routingSteps: [],
    stockMovements: [],
    stageEntries: [],
    costItems: DEFAULT_COST_ITEMS.map((c) => ({ id: nid(), factoryId, ...c })),
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
    auditLog: [
      {
        id: nid(),
        factoryId,
        actorId: "m-owner",
        actorName: "صاحب المصنع",
        action: "create",
        table: "factories",
        recordId: factoryId,
        before: null,
        after: { name: factoryName, industry },
        at: new Date().toISOString(),
      },
    ],
  };
}

export function demoDb(): Db {
  const today = cairoToday();
  const cash = "acc-cash";
  const bank = "acc-bank";
  const insta = "acc-insta";
  const wallet = "acc-wallet";
  const tpl = templateData(FID, "apparel", (p, i) => `${p}-${i}`);
  const items = DEFAULT_COST_ITEMS.map((c, i) => ({
    id: `ci-${i + 1}`,
    factoryId: FID,
    ...c,
  }));

  const unitPiece = tpl.units.find((u) => u.name === "قطعة")?.id ?? null;
  const cat = (name: string) => tpl.categories.find((c) => c.name === name)?.id ?? null;
  const mat = (name: string) => tpl.materials.find((m) => m.name === name)!.id;
  const op = (name: string) => tpl.operations.find((o) => o.name === name)!.id;
  const whMat = tpl.warehouses[0].id;
  const whFg = tpl.warehouses[1].id;

  const products = [
    { id: "p1", factoryId: FID, sku: "P-001", name: "قميص قطني", categoryId: cat("قمصان"), unitId: unitPiece, sellPrice: 265, minStock: 50 },
    { id: "p2", factoryId: FID, sku: "P-002", name: "فستان صيفي", categoryId: cat("فساتين"), unitId: unitPiece, sellPrice: 520, minStock: 20 },
    { id: "p3", factoryId: FID, sku: "P-003", name: "تيشيرت مطبوع", categoryId: cat("تيشيرتات"), unitId: unitPiece, sellPrice: 165, minStock: 100 },
  ];

  const boms = [
    { id: "b1", factoryId: FID, productId: "p1", version: 1, status: "active" as const, notes: "" },
    { id: "b2", factoryId: FID, productId: "p2", version: 1, status: "active" as const, notes: "" },
    { id: "b3", factoryId: FID, productId: "p3", version: 1, status: "active" as const, notes: "" },
  ];

  const bomItems = [
    { id: nid(), factoryId: FID, bomId: "b1", materialId: mat("قماش قطن"), qtyPerUnit: 1.6, wastePct: 8 },
    { id: nid(), factoryId: FID, bomId: "b1", materialId: mat("خيط بوليستر"), qtyPerUnit: 0.05, wastePct: 0 },
    { id: nid(), factoryId: FID, bomId: "b1", materialId: mat("أزرار"), qtyPerUnit: 7, wastePct: 2 },
    { id: nid(), factoryId: FID, bomId: "b1", materialId: mat("تيكت وباركود"), qtyPerUnit: 1, wastePct: 0 },
    { id: nid(), factoryId: FID, bomId: "b1", materialId: mat("كيس تغليف"), qtyPerUnit: 1, wastePct: 0 },
    { id: nid(), factoryId: FID, bomId: "b2", materialId: mat("قماش كتان"), qtyPerUnit: 2.2, wastePct: 10 },
    { id: nid(), factoryId: FID, bomId: "b2", materialId: mat("بطانة"), qtyPerUnit: 1.1, wastePct: 5 },
    { id: nid(), factoryId: FID, bomId: "b2", materialId: mat("سوست"), qtyPerUnit: 1, wastePct: 0 },
    { id: nid(), factoryId: FID, bomId: "b2", materialId: mat("كيس تغليف"), qtyPerUnit: 1, wastePct: 0 },
    { id: nid(), factoryId: FID, bomId: "b3", materialId: mat("قماش قطن"), qtyPerUnit: 0.9, wastePct: 6 },
    { id: nid(), factoryId: FID, bomId: "b3", materialId: mat("خيط بوليستر"), qtyPerUnit: 0.03, wastePct: 0 },
    { id: nid(), factoryId: FID, bomId: "b3", materialId: mat("كيس تغليف"), qtyPerUnit: 1, wastePct: 0 },
  ];

  const routingSteps = [
    { id: nid(), factoryId: FID, productId: "p1", operationId: op("قص"), seq: 1, rate: 6, stdMinutes: 4 },
    { id: nid(), factoryId: FID, productId: "p1", operationId: op("خياطة"), seq: 2, rate: 22, stdMinutes: 18 },
    { id: nid(), factoryId: FID, productId: "p1", operationId: op("مكوى"), seq: 3, rate: 5, stdMinutes: 3 },
    { id: nid(), factoryId: FID, productId: "p1", operationId: op("فحص جودة"), seq: 4, rate: 3, stdMinutes: 2 },
    { id: nid(), factoryId: FID, productId: "p1", operationId: op("تعبئة"), seq: 5, rate: 3, stdMinutes: 2 },
    { id: nid(), factoryId: FID, productId: "p2", operationId: op("قص"), seq: 1, rate: 9, stdMinutes: 6 },
    { id: nid(), factoryId: FID, productId: "p2", operationId: op("خياطة"), seq: 2, rate: 40, stdMinutes: 30 },
    { id: nid(), factoryId: FID, productId: "p2", operationId: op("مكوى"), seq: 3, rate: 7, stdMinutes: 4 },
    { id: nid(), factoryId: FID, productId: "p2", operationId: op("تعبئة"), seq: 4, rate: 4, stdMinutes: 2 },
    { id: nid(), factoryId: FID, productId: "p3", operationId: op("قص"), seq: 1, rate: 4, stdMinutes: 3 },
    { id: nid(), factoryId: FID, productId: "p3", operationId: op("خياطة"), seq: 2, rate: 12, stdMinutes: 9 },
    { id: nid(), factoryId: FID, productId: "p3", operationId: op("تعبئة"), seq: 3, rate: 2, stdMinutes: 2 },
  ];

  const materials = tpl.materials.map((m) => {
    const reorder: Record<string, number> = {
      "قماش قطن": 400,
      "قماش كتان": 150,
      بطانة: 120,
      "خيط بوليستر": 40,
      أزرار: 1500,
      سوست: 200,
      "تيكت وباركود": 500,
      "كيس تغليف": 500,
    };
    return { ...m, reorderPoint: reorder[m.name] ?? 0, defaultVendor: "مورد السوق" };
  });

  const mv = (
    itemType: "material" | "product",
    itemId: string,
    warehouseId: string,
    kind: Db["stockMovements"][number]["kind"],
    qty: number,
    unitCost: number,
    date: string,
    refType = "",
    refId: string | null = null,
    notes = "",
  ) => ({ id: nid(), factoryId: FID, date, itemType, itemId, warehouseId, kind, qty, unitCost, refType, refId, notes });

  const cost = (name: string) => materials.find((m) => m.name === name)!.avgCost;

  const stockMovements = [
    mv("material", mat("قماش قطن"), whMat, "purchase", 850, cost("قماش قطن"), addDays(today, -14), "cost_entry", "ce1", "أقمشة قمصان"),
    mv("material", mat("قماش كتان"), whMat, "purchase", 200, cost("قماش كتان"), addDays(today, -20)),
    mv("material", mat("بطانة"), whMat, "purchase", 300, cost("بطانة"), addDays(today, -20)),
    mv("material", mat("خيط بوليستر"), whMat, "purchase", 120, cost("خيط بوليستر"), addDays(today, -25)),
    mv("material", mat("أزرار"), whMat, "purchase", 4000, cost("أزرار"), addDays(today, -25)),
    mv("material", mat("سوست"), whMat, "purchase", 300, cost("سوست"), addDays(today, -25)),
    mv("material", mat("تيكت وباركود"), whMat, "purchase", 2000, cost("تيكت وباركود"), addDays(today, -25)),
    mv("material", mat("كيس تغليف"), whMat, "purchase", 1500, cost("كيس تغليف"), addDays(today, -25)),
    // صرف خامات أمر SN-1042
    mv("material", mat("قماش قطن"), whMat, "issue", -518.4, cost("قماش قطن"), addDays(today, -10), "order", "o1", "صرف لأمر SN-1042"),
    mv("material", mat("خيط بوليستر"), whMat, "issue", -15, cost("خيط بوليستر"), addDays(today, -10), "order", "o1", "صرف لأمر SN-1042"),
    mv("material", mat("أزرار"), whMat, "issue", -2142, cost("أزرار"), addDays(today, -10), "order", "o1", "صرف لأمر SN-1042"),
    mv("material", mat("تيكت وباركود"), whMat, "issue", -300, cost("تيكت وباركود"), addDays(today, -10), "order", "o1", "صرف لأمر SN-1042"),
    mv("material", mat("كيس تغليف"), whMat, "issue", -300, cost("كيس تغليف"), addDays(today, -10), "order", "o1", "صرف لأمر SN-1042"),
    mv("material", mat("قماش قطن"), whMat, "waste", -12, cost("قماش قطن"), addDays(today, -9), "order", "o1", "هالك قص"),
    // إنتاج تام
    mv("product", "p1", whFg, "receipt_fg", 190, 212, addDays(today, -3), "order", "o1", "تام جزئي"),
    mv("product", "p3", whFg, "receipt_fg", 160, 114, addDays(today, -5), "order", "o5"),
    mv("product", "p3", whFg, "delivery", -160, 114, addDays(today, -2), "delivery", "d5", "تسليم تيشيرت"),
  ];

  const clients = [
    { id: "cl-1", factoryId: FID, name: "محلات البرنس", phone: "01012345678", notes: "عميل جملة — شارع الهرم" },
    { id: "cl-2", factoryId: FID, name: "شركة الأناقة للتجارة", phone: "01298765432", notes: "فاتورة شهرية" },
    { id: "cl-3", factoryId: FID, name: "تاجر العباسية", phone: "01155556666", notes: "كاش غالباً" },
    { id: "cl-4", factoryId: FID, name: "بوتيك نورا", phone: "01544443333", notes: "طلبات صيفي" },
    { id: "cl-5", factoryId: FID, name: "تصدير الخليج", phone: "01000001111", notes: "شحنات كبيرة — آجل 30 يوم" },
  ];

  const deliveries = [
    { id: "d1", factoryId: FID, clientId: "cl-1", date: addDays(today, -25), dueDate: addDays(today, -10), amount: 42000, model: "قميص رجالي", quantity: 200, notes: "" },
    { id: "d2", factoryId: FID, clientId: "cl-1", date: addDays(today, -8), dueDate: today, amount: 18500, model: "بنطلون قماش", quantity: 80, notes: "" },
    { id: "d3", factoryId: FID, clientId: "cl-2", date: addDays(today, -20), dueDate: addDays(today, -5), amount: 61000, model: "بدلة مكتبية", quantity: 40, notes: "" },
    { id: "d4", factoryId: FID, clientId: "cl-2", date: addDays(today, -4), dueDate: addDays(today, 3), amount: 24000, model: "قميص قطن", quantity: 120, notes: "" },
    { id: "d5", factoryId: FID, clientId: "cl-3", date: addDays(today, -2), dueDate: addDays(today, 12), amount: 9600, model: "تيشيرت", quantity: 160, notes: "" },
    { id: "d6", factoryId: FID, clientId: "cl-4", date: addDays(today, -15), dueDate: addDays(today, 2), amount: 15200, model: "فستان صيفي", quantity: 40, notes: "" },
    { id: "d7", factoryId: FID, clientId: "cl-5", date: addDays(today, -40), dueDate: addDays(today, -12), amount: 180000, model: "طقم تصدير", quantity: 500, notes: "دفعة أولى اتجمعت" },
    { id: "d8", factoryId: FID, clientId: "cl-5", date: addDays(today, -6), dueDate: addDays(today, 20), amount: 95000, model: "طقم تصدير", quantity: 250, notes: "" },
  ];

  const collections = [
    { id: "c1", factoryId: FID, clientId: "cl-1", date: addDays(today, -18), amount: 20000, method: "cash" as const, accountId: cash, receiptImage: null, status: "confirmed" as const, chequeDate: null, notes: "دفعة أولى" },
    { id: "c2", factoryId: FID, clientId: "cl-2", date: addDays(today, -12), amount: 30000, method: "bank" as const, accountId: bank, receiptImage: "demo", status: "confirmed" as const, chequeDate: null, notes: "" },
    { id: "c3", factoryId: FID, clientId: "cl-5", date: addDays(today, -30), amount: 100000, method: "bank" as const, accountId: bank, receiptImage: "demo", status: "confirmed" as const, chequeDate: null, notes: "دفعة تصدير" },
    { id: "c4", factoryId: FID, clientId: "cl-4", date: addDays(today, -1), amount: 5000, method: "instapay" as const, accountId: insta, receiptImage: "demo", status: "pending" as const, chequeDate: null, notes: "لسه مستني توصل" },
    { id: "c5", factoryId: FID, clientId: "cl-3", date: addDays(today, -1), amount: 4000, method: "cash" as const, accountId: cash, receiptImage: null, status: "confirmed" as const, chequeDate: null, notes: "" },
    { id: "c6", factoryId: FID, clientId: "cl-1", date: addDays(today, -2), amount: 8000, method: "wallet" as const, accountId: wallet, receiptImage: "demo", status: "confirmed" as const, chequeDate: null, notes: "" },
  ];

  const workers = [
    { id: "w1", factoryId: FID, name: "أحمد سيد", payType: "daily" as const, rate: 280, phone: "01011112222" },
    { id: "w2", factoryId: FID, name: "فاطمة محمد", payType: "daily" as const, rate: 250, phone: "01022223333" },
    { id: "w3", factoryId: FID, name: "محمود عبد الله", payType: "monthly" as const, rate: 6500, phone: "01033334444" },
    { id: "w4", factoryId: FID, name: "سامح علي", payType: "piece" as const, rate: 12, phone: "01044445555" },
    { id: "w5", factoryId: FID, name: "إيمان حسن", payType: "daily" as const, rate: 240, phone: "01055556666" },
    { id: "w6", factoryId: FID, name: "عماد فتحي", payType: "monthly" as const, rate: 8000, phone: "01066667777" },
  ];

  const workerEarnings = [
    { id: nid(), factoryId: FID, workerId: "w1", date: addDays(today, -2), kind: "attendance" as const, amount: 280, notes: "" },
    { id: nid(), factoryId: FID, workerId: "w2", date: addDays(today, -2), kind: "attendance" as const, amount: 250, notes: "" },
    { id: nid(), factoryId: FID, workerId: "w5", date: addDays(today, -2), kind: "attendance" as const, amount: 240, notes: "" },
    { id: nid(), factoryId: FID, workerId: "w1", date: addDays(today, -1), kind: "attendance" as const, amount: 280, notes: "" },
    { id: nid(), factoryId: FID, workerId: "w2", date: addDays(today, -1), kind: "attendance" as const, amount: 250, notes: "" },
    { id: nid(), factoryId: FID, workerId: "w4", date: addDays(today, -1), kind: "piece" as const, amount: 12 * 40, notes: "40 قطعة مكوى" },
    { id: nid(), factoryId: FID, workerId: "w3", date: addDays(today, -10), kind: "attendance" as const, amount: 6500, notes: "مرتب سبتمبر" },
    { id: nid(), factoryId: FID, workerId: "w6", date: addDays(today, -10), kind: "attendance" as const, amount: 8000, notes: "مرتب سبتمبر" },
  ];

  const workerPayments = [
    { id: nid(), factoryId: FID, workerId: "w3", date: addDays(today, -10), kind: "pay" as const, amount: 6500, accountId: cash, notes: "قبض مرتب" },
    { id: nid(), factoryId: FID, workerId: "w1", date: addDays(today, -6), kind: "advance" as const, amount: 400, accountId: cash, notes: "سلفة" },
    { id: nid(), factoryId: FID, workerId: "w4", date: addDays(today, -1), kind: "pay" as const, amount: 300, accountId: cash, notes: "" },
  ];

  const costEntries = [
    { id: "ce1", factoryId: FID, costItemId: "ci-1", date: addDays(today, -14), vendor: "مصبغة السلام", quantity: 850, amount: 38250, notes: "أقمشة قمصان" },
    { id: "ce2", factoryId: FID, costItemId: "ci-14", date: addDays(today, -9), vendor: "المالك", quantity: 1, amount: 18000, notes: "إيجار سبتمبر" },
    { id: "ce3", factoryId: FID, costItemId: "ci-4", date: addDays(today, -5), vendor: "مكتبة الإكسسوار", quantity: 2000, amount: 4200, notes: "" },
    { id: "ce4", factoryId: FID, costItemId: "ci-15", date: addDays(today, -3), vendor: "شركة الكهرباء", quantity: 1, amount: 3100, notes: "" },
    { id: "ce5", factoryId: FID, costItemId: "ci-10", date: addDays(today, -7), vendor: "ورشة عم شريف", quantity: 300, amount: 9000, notes: "خياطة برة" },
  ];

  const costPayments = [
    { id: nid(), factoryId: FID, costEntryId: "ce1", date: addDays(today, -14), amount: 20000, accountId: bank, method: "bank" as const },
    { id: nid(), factoryId: FID, costEntryId: "ce2", date: addDays(today, -9), amount: 18000, accountId: cash, method: "cash" as const },
    { id: nid(), factoryId: FID, costEntryId: "ce4", date: addDays(today, -3), amount: 3100, accountId: wallet, method: "wallet" as const },
    { id: nid(), factoryId: FID, costEntryId: "ce5", date: addDays(today, -6), amount: 4000, accountId: cash, method: "cash" as const },
  ];

  const orders = [
    { id: "o1", factoryId: FID, code: "SN-1042", clientId: "cl-1", model: "قميص قطني", productId: "p1", bomId: "b1", materialsIssuedAt: addDays(today, -10), line: "الخط الثاني", quantity: 300, progress: 64, pieceCost: 212, piecePrice: 265, dueDate: today, status: "running" as const, notes: "" },
    { id: "o2", factoryId: FID, code: "SN-1043", clientId: "cl-4", model: "فستان صيفي", productId: "p2", bomId: "b2", materialsIssuedAt: null, line: "الخط الأول", quantity: 40, progress: 88, pieceCost: 403, piecePrice: 520, dueDate: addDays(today, 2), status: "running" as const, notes: "" },
    { id: "o3", factoryId: FID, code: "SN-1044", clientId: "cl-5", model: "طقم تصدير", productId: null, bomId: null, materialsIssuedAt: null, line: "الخط الثالث", quantity: 250, progress: 25, pieceCost: 220, piecePrice: 380, dueDate: addDays(today, 20), status: "running" as const, notes: "" },
    { id: "o4", factoryId: FID, code: "SN-1039", clientId: "cl-2", model: "بدلة مكتبية", productId: null, bomId: null, materialsIssuedAt: null, line: "خط التشطيب", quantity: 40, progress: 100, pieceCost: 1180, piecePrice: 1525, dueDate: addDays(today, -6), status: "done" as const, notes: "" },
    { id: "o5", factoryId: FID, code: "SN-1041", clientId: "cl-3", model: "تيشيرت مطبوع", productId: "p3", bomId: "b3", materialsIssuedAt: null, line: "الخط الأول", quantity: 160, progress: 40, pieceCost: 114, piecePrice: 165, dueDate: addDays(today, -2), status: "late" as const, notes: "المطبعة متأخرة" },
    { id: "o6", factoryId: FID, code: "SN-1045", clientId: null, model: "جاكت شتوي", productId: null, bomId: null, materialsIssuedAt: null, line: "الخط الثاني", quantity: 120, progress: 12, pieceCost: 320, piecePrice: 460, dueDate: addDays(today, 30), status: "stopped" as const, notes: "مستني وصول القماش" },
  ];

  const stageEntries = [
    { id: nid(), factoryId: FID, orderId: "o1", operationId: op("قص"), date: addDays(today, -9), workerId: "w1", qtyGood: 300, qtyRework: 0, qtyScrap: 4, rate: 6 },
    { id: nid(), factoryId: FID, orderId: "o1", operationId: op("خياطة"), date: addDays(today, -6), workerId: "w2", qtyGood: 240, qtyRework: 8, qtyScrap: 2, rate: 22 },
    { id: nid(), factoryId: FID, orderId: "o1", operationId: op("مكوى"), date: addDays(today, -4), workerId: "w4", qtyGood: 200, qtyRework: 0, qtyScrap: 0, rate: 5 },
    { id: nid(), factoryId: FID, orderId: "o1", operationId: op("فحص جودة"), date: addDays(today, -3), workerId: "w5", qtyGood: 192, qtyRework: 6, qtyScrap: 2, rate: 3 },
    { id: nid(), factoryId: FID, orderId: "o1", operationId: op("تعبئة"), date: addDays(today, -3), workerId: "w5", qtyGood: 190, qtyRework: 0, qtyScrap: 0, rate: 3 },
    { id: nid(), factoryId: FID, orderId: "o2", operationId: op("قص"), date: addDays(today, -5), workerId: "w1", qtyGood: 40, qtyRework: 0, qtyScrap: 0, rate: 9 },
    { id: nid(), factoryId: FID, orderId: "o2", operationId: op("خياطة"), date: addDays(today, -2), workerId: "w2", qtyGood: 36, qtyRework: 2, qtyScrap: 0, rate: 40 },
    { id: nid(), factoryId: FID, orderId: "o5", operationId: op("قص"), date: addDays(today, -8), workerId: "w1", qtyGood: 160, qtyRework: 0, qtyScrap: 3, rate: 4 },
    { id: nid(), factoryId: FID, orderId: "o5", operationId: op("خياطة"), date: addDays(today, -6), workerId: "w2", qtyGood: 64, qtyRework: 0, qtyScrap: 0, rate: 12 },
  ];

  const manualTx = [
    { id: nid(), factoryId: FID, date: addDays(today, -20), accountId: cash, amount: 15000, notes: "رصيد افتتاحي للدرج" },
    { id: nid(), factoryId: FID, date: addDays(today, -20), accountId: bank, amount: 80000, notes: "رصيد افتتاحي للبنك" },
    { id: nid(), factoryId: FID, date: addDays(today, -11), accountId: cash, amount: -1200, notes: "نثريات ورشة" },
  ];

  return {
    factory: { id: FID, name: "مصنع النور للإنتاج", createdAt: addDays(today, -90) + "T08:00:00.000Z" },
    settings: { industry: "apparel", overheadPerUnit: 12 },
    members: DEMO_MEMBERS,
    invites: [
      { id: nid(), factoryId: FID, email: "new.staff@example.com", role: "accountant", createdAt: new Date().toISOString(), status: "pending" },
    ],
    accounts: [
      { id: cash, factoryId: FID, name: "درج النقدية", kind: "cash" },
      { id: bank, factoryId: FID, name: "حساب البنك الأهلي", kind: "bank" },
      { id: insta, factoryId: FID, name: "إنستاباي", kind: "instapay" },
      { id: wallet, factoryId: FID, name: "محفظة فودافون كاش", kind: "wallet" },
    ],
    units: tpl.units,
    categories: tpl.categories,
    warehouses: tpl.warehouses,
    materials,
    products,
    boms,
    bomItems,
    operations: tpl.operations,
    routingSteps,
    stockMovements,
    stageEntries,
    costItems: items,
    costEntries,
    costPayments,
    clients,
    deliveries,
    collections,
    workers,
    workerEarnings,
    workerPayments,
    orders,
    manualTx,
    auditLog: [
      {
        id: nid(),
        factoryId: FID,
        actorId: "m-owner",
        actorName: "صاحب المصنع",
        action: "restore",
        table: "factories",
        recordId: FID,
        before: null,
        after: { seed: "demo" },
        at: new Date().toISOString(),
      },
    ],
  };
}
