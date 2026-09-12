import { addDays, cairoToday, daysBetween, nid } from "@/lib/utils";
import { TEMPLATES } from "./templates";
import {
  DEFAULT_COST_ITEMS,
  type Category,
  type Communication,
  type Party,
  type PartyAddress,
  type PartyContact,
  type PartyRole,
  type PartyTask,
  type Db,
  type Industry,
  type Material,
  type Member,
  type Operation,
  type ScanEvent,
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

/* ── تاريخ التعامل في وضع العرض ───────────────────────────────
 * الذكاء مبيطلعش من فراغ: عشان سكور العميل والنمو ودورة الطلب يبانوا،
 * وضع العرض بيولّد **تاريخ حقيقي الشكل** لكل عميل بشخصية مختلفة:
 * واحد بيدفع في الميعاد وبينمو، وواحد كبير بس بيتأخر، وواحد وقف.
 * الأرقام ثابتة (مولّد بذرة واحدة) فالعرض بيطلع نفسه كل مرة.
 * ده وضع عرض بس — بيانات المصنع الحقيقية بتتسجّل بالحركات.
 */

type CustomerPlan = {
  clientId: string;
  monthsBack: number;
  /** دورة الطلب المعتادة بالأيام */
  cycle: number;
  base: number;
  /** نمو سنوي في قيمة الطلب */
  growth: number;
  /** مدة الآجل */
  term: number;
  /** بيدفع بعد كام يوم من التوريد */
  payLag: number;
  unitPrice: number;
  models: string[];
  method: "cash" | "bank" | "instapay" | "wallet";
  /** بقاله كام يوم مطلبش — للعميل اللي وقف */
  stoppedSince?: number;
};

const PLANS: CustomerPlan[] = [
  { clientId: "cl-1", monthsBack: 18, cycle: 14, base: 24000, growth: 0.34, term: 15, payLag: 12, unitPrice: 210, models: ["قميص رجالي", "بنطلون قماش", "قميص قطني"], method: "cash" },
  { clientId: "cl-2", monthsBack: 20, cycle: 21, base: 46000, growth: 0.12, term: 30, payLag: 48, unitPrice: 1400, models: ["بدلة مكتبية", "قميص قطن"], method: "bank" },
  { clientId: "cl-3", monthsBack: 12, cycle: 10, base: 7200, growth: 0.06, term: 14, payLag: 4, unitPrice: 60, models: ["تيشيرت مطبوع"], method: "cash" },
  { clientId: "cl-4", monthsBack: 15, cycle: 24, base: 17000, growth: -0.22, term: 20, payLag: 19, unitPrice: 380, models: ["فستان صيفي", "بلوزة"], method: "instapay", stoppedSince: 125 },
  { clientId: "cl-5", monthsBack: 22, cycle: 30, base: 118000, growth: 0.26, term: 30, payLag: 54, unitPrice: 360, models: ["طقم تصدير"], method: "bank" },
];

/** مولّد ثابت: نفس البذرة = نفس البيانات في كل تشغيل */
function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function history(today: string, cash: string, bank: string, insta: string, wallet: string) {
  const accountOf = { cash, bank, instapay: insta, wallet } as const;
  const deliveries: Db["deliveries"] = [];
  const collections: Db["collections"] = [];

  PLANS.forEach((plan, planIndex) => {
    const rnd = seededRandom(7919 * (planIndex + 3));
    const start = addDays(today, -plan.monthsBack * 30);
    const stopAt = addDays(today, -(plan.stoppedSince ?? 46));
    const rows: Db["deliveries"] = [];
    let date = start;
    let i = 0;

    while (date <= stopAt) {
      const years = daysBetween(start, date) / 365;
      const amount = Math.round((plan.base * (1 + plan.growth * years) * (0.82 + rnd() * 0.36)) / 500) * 500;
      rows.push({
        id: `h-${plan.clientId}-${i}`,
        factoryId: FID,
        clientId: plan.clientId,
        date,
        dueDate: addDays(date, plan.term),
        amount,
        model: plan.models[i % plan.models.length],
        quantity: Math.max(1, Math.round(amount / plan.unitPrice)),
        notes: "",
      });
      date = addDays(date, Math.max(4, Math.round(plan.cycle * (0.75 + rnd() * 0.55))));
      i++;
    }

    rows.forEach((d, k) => {
      const lag = Math.max(2, Math.round(plan.payLag * (0.7 + rnd() * 0.7)));
      const payDate = addDays(d.date, lag);
      if (payDate > today) return;
      collections.push({
        id: `hc-${plan.clientId}-${k}`,
        factoryId: FID,
        clientId: plan.clientId,
        date: payDate,
        amount: d.amount,
        method: plan.method,
        accountId: accountOf[plan.method],
        receiptImage: plan.method === "cash" ? null : "demo",
        status: "confirmed",
        chequeDate: null,
        notes: "",
      });
    });

    deliveries.push(...rows);
  });

  // التكاليف والمسحوبات الشهرية: عشان الخزنة والأرباح تفضل منطقية مع حجم المبيعات
  const months = new Map<string, number>();
  for (const d of deliveries) months.set(d.date.slice(0, 7), (months.get(d.date.slice(0, 7)) ?? 0) + d.amount);
  const costEntries: Db["costEntries"] = [];
  const costPayments: Db["costPayments"] = [];
  const manualTx: Db["manualTx"] = [];
  const thisMonth = today.slice(0, 7);

  [...months.entries()]
    .filter(([month]) => month < thisMonth)
    .forEach(([month, revenue]) => {
      const day = `${month}-05`;
      const add = (suffix: string, costItemId: string, partyId: string, vendor: string, amount: number, quantity: number) => {
        const id = `hce-${month}-${suffix}`;
        costEntries.push({ id, factoryId: FID, costItemId, date: day, vendor, partyId, quantity, amount: Math.round(amount), notes: "ملخص الشهر" });
        costPayments.push({
          id: `hcp-${month}-${suffix}`,
          factoryId: FID,
          costEntryId: id,
          date: addDays(day, 3),
          amount: Math.round(amount),
          accountId: bank,
          method: "bank",
        });
      };
      add("fabric", "ci-1", "sup-1", "مصبغة السلام", revenue * 0.4, Math.round(revenue / 45));
      add("acc", "ci-5", "sup-2", "مكتبة الإكسسوار", revenue * 0.05, Math.round(revenue / 30));
      add("outsource", "ci-10", "ws-1", "ورشة عم شريف للخياطة", revenue * 0.07, Math.round(revenue / 120));
      add("rent", "ci-14", "sup-4", "المالك", 18000, 1);
      add("power", "ci-15", "sup-3", "شركة الكهرباء", 2900, 1);
      manualTx.push(
        {
          id: `hmt-w-${month}`,
          factoryId: FID,
          date: `${month}-28`,
          accountId: cash,
          amount: -Math.round(revenue * 0.13),
          notes: "أجور العمال — ملخص الشهر",
        },
        {
          id: `hmt-d-${month}`,
          factoryId: FID,
          date: `${month}-28`,
          accountId: bank,
          amount: -Math.round(revenue * 0.15),
          notes: "مسحوبات المالك",
        },
      );
    });

  return { deliveries, collections, costEntries, costPayments, manualTx };
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
    scans: [],
    subcontracts: [],
    subReceipts: [],
    subPayments: [],
    returns: [],
    complaints: [],
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

  /**
   * مشتريات الخامات بأسعارها وتواريخها — أسعار الخامات بتتغير مع الوقت،
   * وده أساس تاريخ تكلفة الموديل: [الخامة، الكمية، سعر الوحدة، قبل كام يوم]
   */
  const purchases: [string, number, number, number][] = [
    ["قماش قطن", 300, 74, 60],
    ["قماش قطن", 350, 88, 14],
    ["قماش قطن", 200, 96, 5],
    // شراء مخصوص لأمر القمصان الجديد (SN-1046) — الفرشة المخططة بتتقص منه
    ["قماش قطن", 120, 98, 3],
    ["قماش كتان", 200, 120, 20],
    ["بطانة", 300, 30, 20],
    ["خيط بوليستر", 120, 18, 25],
    ["أزرار", 2000, 1.3, 40],
    ["أزرار", 2000, 1.7, 25],
    ["سوست", 300, 4, 25],
    ["تيكت وباركود", 2000, 1, 25],
    ["كيس تغليف", 1500, 2, 25],
  ];

  /** المتوسط المرجّح لسعر الخامة لحد تاريخ معيّن — نفس اللي محرك التكلفة بيعيد حسابه */
  const avgAt = (name: string, daysAgo = 0): number | null => {
    const rows = purchases.filter(([n, , , d]) => n === name && d >= daysAgo);
    if (!rows.length) return null;
    const q = rows.reduce((s, [, qy]) => s + qy, 0);
    return rows.reduce((s, [, qy, price]) => s + qy * price, 0) / q;
  };

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
    return {
      ...m,
      avgCost: avgAt(m.name) ?? m.avgCost,
      reorderPoint: reorder[m.name] ?? 0,
      defaultVendor: "مورد السوق",
    };
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

  /** سعر الخامة وقت صرفها لأمر SN-1042 — المتوسط المرجّح للمشتريات لحد يومها */
  const costAtIssue = (name: string) => avgAt(name, 10) ?? materials.find((m) => m.name === name)!.avgCost;

  const stockMovements = [
    ...purchases.map(([name, qty, price, ago]) =>
      name === "قماش قطن"
        ? mv("material", mat(name), whMat, "purchase", qty, price, addDays(today, -ago), "cost_entry", "ce1", "أقمشة قمصان")
        : mv("material", mat(name), whMat, "purchase", qty, price, addDays(today, -ago)),
    ),
    // صرف خامات أمر SN-1042
    mv("material", mat("قماش قطن"), whMat, "issue", -518.4, costAtIssue("قماش قطن"), addDays(today, -10), "order", "o1", "صرف لأمر SN-1042"),
    mv("material", mat("خيط بوليستر"), whMat, "issue", -15, costAtIssue("خيط بوليستر"), addDays(today, -10), "order", "o1", "صرف لأمر SN-1042"),
    mv("material", mat("أزرار"), whMat, "issue", -2142, costAtIssue("أزرار"), addDays(today, -10), "order", "o1", "صرف لأمر SN-1042"),
    mv("material", mat("تيكت وباركود"), whMat, "issue", -300, costAtIssue("تيكت وباركود"), addDays(today, -10), "order", "o1", "صرف لأمر SN-1042"),
    mv("material", mat("كيس تغليف"), whMat, "issue", -300, costAtIssue("كيس تغليف"), addDays(today, -10), "order", "o1", "صرف لأمر SN-1042"),
    mv("material", mat("قماش قطن"), whMat, "waste", -12, costAtIssue("قماش قطن"), addDays(today, -9), "order", "o1", "هالك قص"),
    // إنتاج تام
    mv("product", "p1", whFg, "receipt_fg", 190, 212, addDays(today, -3), "order", "o1", "تام جزئي"),
    mv("product", "p3", whFg, "receipt_fg", 160, 114, addDays(today, -5), "order", "o5"),
    mv("product", "p3", whFg, "delivery", -160, 114, addDays(today, -2), "delivery", "d5", "تسليم تيشيرت"),
    // قماش الفرشة بيتصرف على الفرشة نفسها، مش على الأمر كله — فالمستهلك
    // معروف لأي فرشة بالظبط، ومنه بتتحسب نسبة الاستغلال
    mv("material", mat("قماش كتان"), whMat, "issue", -94, 120, addDays(today, -5), "lay", "lay-1", "فرشة فستان — 20 طبقة"),
    // خامات طلعت مع إذن التشغيل الخارجي ورجع منها جزء
    mv("material", mat("خيط بوليستر"), whMat, "issue", -9, 18, addDays(today, -12), "subcontract", "sub-1", "خامات طلعت لورشة — SUB-0001"),
    mv("material", mat("خيط بوليستر"), whMat, "return", 1, 18, addDays(today, -5), "subcontract", "sub-1", "خامات رجعت من ورشة — SUB-0001"),
  ];

  const party = (
    id: string,
    name: string,
    roles: PartyRole[],
    extra: Partial<Party> = {},
  ): Party => ({
    id,
    factoryId: FID,
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
    roles,
    creditLimit: 0,
    paymentTermDays: 0,
    salesRepId: null,
    mergedIntoId: null,
    createdAt: addDays(today, -400) + "T08:00:00.000Z",
    ...extra,
  });

  const parties: Party[] = [
    party("cl-1", "محلات البرنس", ["customer", "merchant", "wholesale"], {
      phone: "01012345678",
      whatsapp: "01012345678",
      notes: "عميل جملة — شارع الهرم",
      internalNotes: "بيتفاوض على السعر دايمًا. صاحب القرار أستاذ أحمد.",
      governorate: "الجيزة",
      city: "الهرم",
      tags: ["جملة", "VIP"],
      creditLimit: 60000,
      paymentTermDays: 15,
      salesRepId: "rep-1",
    }),
    party("cl-2", "شركة الأناقة للتجارة", ["customer", "distributor"], {
      phone: "01298765432",
      email: "info@elanaka.example",
      taxId: "512-874-991",
      notes: "فاتورة شهرية",
      governorate: "القاهرة",
      city: "مدينة نصر",
      tags: ["موزّع"],
      creditLimit: 80000,
      paymentTermDays: 30,
      salesRepId: "rep-1",
    }),
    party("cl-3", "تاجر العباسية", ["customer", "retail"], {
      kind: "person",
      phone: "01155556666",
      notes: "كاش غالبًا",
      governorate: "القاهرة",
      city: "العباسية",
      tags: ["تجزئة", "بيدفع كاش"],
    }),
    party("cl-4", "بوتيك نورا", ["customer", "retail"], {
      phone: "01544443333",
      notes: "طلبات موسمية",
      governorate: "الإسكندرية",
      city: "سموحة",
      tags: ["موسمي"],
      creditLimit: 20000,
    }),
    party("cl-5", "تصدير الخليج", ["customer", "wholesale"], {
      phone: "01000001111",
      email: "orders@gulf.example",
      taxId: "301-556-220",
      notes: "شحنات كبيرة — آجل 30 يوم",
      governorate: "القاهرة",
      city: "التجمع",
      tags: ["تصدير", "استراتيجي"],
      creditLimit: 150000,
      paymentTermDays: 30,
    }),
    party("sup-1", "مصبغة السلام", ["supplier"], {
      phone: "01211112222",
      notes: "أقمشة قطن وكتان",
      governorate: "الغربية",
      city: "المحلة",
      tags: ["أقمشة"],
    }),
    party("sup-2", "مكتبة الإكسسوار", ["supplier"], { phone: "01233334444", governorate: "القاهرة", city: "الموسكي" }),
    party("sup-3", "شركة الكهرباء", ["service"], {}),
    party("sup-4", "المالك", ["service"], { kind: "person", notes: "إيجار المصنع" }),
    party("ws-1", "ورشة عم شريف للخياطة", ["workshop", "supplier"], {
      kind: "person",
      phone: "01277778888",
      notes: "خياطة خارجية بالقطعة",
      tags: ["تشغيل خارجي"],
    }),
    party("ws-2", "ورشة النور للمكوى والتشطيب", ["workshop"], {
      phone: "01288889999",
      notes: "مكوى وتشطيب وتعليق",
      governorate: "القاهرة",
      city: "شبرا",
      tags: ["تشغيل خارجي"],
    }),
    party("rep-1", "أحمد سيد — مندوب", ["sales_rep", "collection_rep"], {
      kind: "person",
      phone: "01099998888",
      notes: "مسؤول القاهرة والجيزة",
    }),
    party("shp-1", "شركة سريع للشحن", ["shipping"], { phone: "01066660000" }),
  ];

  const contacts: PartyContact[] = [
    { id: nid(), factoryId: FID, partyId: "cl-2", name: "أحمد فؤاد", title: "صاحب الشركة", phone: "01298765432", email: "ahmed@elanaka.example", isPrimary: true },
    { id: nid(), factoryId: FID, partyId: "cl-2", name: "محمد سمير", title: "مدير المشتريات", phone: "01112223344", email: "", isPrimary: false },
    { id: nid(), factoryId: FID, partyId: "cl-2", name: "سارة منير", title: "المحاسبة", phone: "01223334455", email: "", isPrimary: false },
    { id: nid(), factoryId: FID, partyId: "cl-5", name: "عمر الشامي", title: "مدير التصدير", phone: "01000001111", email: "", isPrimary: true },
    { id: nid(), factoryId: FID, partyId: "sup-1", name: "خالد المصبغة", title: "المبيعات", phone: "01211112222", email: "", isPrimary: true },
  ];

  const addresses: PartyAddress[] = [
    { id: nid(), factoryId: FID, partyId: "cl-2", kind: "head_office", line: "12 شارع عباس العقاد", governorate: "القاهرة", city: "مدينة نصر" },
    { id: nid(), factoryId: FID, partyId: "cl-2", kind: "warehouse", line: "المنطقة الصناعية — قطعة 40", governorate: "القاهرة", city: "العبور" },
    { id: nid(), factoryId: FID, partyId: "cl-5", kind: "shipping", line: "ميناء الإسكندرية — بوابة 3", governorate: "الإسكندرية", city: "الإسكندرية" },
  ];

  const communications: Communication[] = [
    { id: nid(), factoryId: FID, partyId: "cl-1", date: addDays(today, -1), channel: "call", subject: "متابعة تحصيل", body: "وعد يحوّل 20 ألف الأسبوع الجاي.", internal: false, actorName: "صاحب المصنع", nextAction: "تأكيد التحويل", nextDate: addDays(today, 5) },
    { id: nid(), factoryId: FID, partyId: "cl-5", date: addDays(today, -6), channel: "meeting", subject: "زيارة لمناقشة شحنة جديدة", body: "طلب عينات من خامة الكتان.", internal: false, actorName: "أحمد سيد — مندوب", nextAction: "", nextDate: null },
    { id: nid(), factoryId: FID, partyId: "cl-3", date: addDays(today, -12), channel: "note", subject: "ملاحظة داخلية", body: "بيفضل الاستلام يوم الخميس.", internal: true, actorName: "منى المحاسب", nextAction: "", nextDate: null },
  ];

  const tasks: PartyTask[] = [
    { id: nid(), factoryId: FID, partyId: "cl-1", title: "تأكيد تحويل 20 ألف", dueDate: addDays(today, 5), assigneeName: "منى المحاسب", status: "open", createdAt: new Date().toISOString() },
    { id: nid(), factoryId: FID, partyId: "cl-4", title: "كلّم بوتيك نورا — بقاله فترة مطلبش", dueDate: addDays(today, -1), assigneeName: "أحمد سيد — مندوب", status: "open", createdAt: new Date().toISOString() },
    { id: nid(), factoryId: FID, partyId: "cl-2", title: "تسليم عرض أسعار الموسم الجديد", dueDate: addDays(today, 3), assigneeName: "صاحب المصنع", status: "open", createdAt: new Date().toISOString() },
  ];

  const hist = history(today, cash, bank, insta, wallet);

  const deliveries = [
    ...hist.deliveries,
    { id: "d1", factoryId: FID, clientId: "cl-1", date: addDays(today, -25), dueDate: addDays(today, -10), amount: 42000, model: "قميص رجالي", quantity: 200, notes: "" },
    { id: "d2", factoryId: FID, clientId: "cl-1", date: addDays(today, -8), dueDate: today, amount: 18500, model: "بنطلون قماش", quantity: 80, notes: "" },
    { id: "d3", factoryId: FID, clientId: "cl-2", date: addDays(today, -20), dueDate: addDays(today, -5), amount: 61000, model: "بدلة مكتبية", quantity: 40, notes: "" },
    { id: "d4", factoryId: FID, clientId: "cl-2", date: addDays(today, -4), dueDate: addDays(today, 3), amount: 24000, model: "قميص قطني", quantity: 120, notes: "" },
    { id: "d5", factoryId: FID, clientId: "cl-3", date: addDays(today, -2), dueDate: addDays(today, 12), amount: 9600, model: "تيشيرت", quantity: 160, notes: "" },
    { id: "d6", factoryId: FID, clientId: "cl-4", date: addDays(today, -96), dueDate: addDays(today, -76), amount: 15200, model: "فستان صيفي", quantity: 40, notes: "آخر طلب قبل ما يتوقف" },
    { id: "d7", factoryId: FID, clientId: "cl-5", date: addDays(today, -40), dueDate: addDays(today, -12), amount: 180000, model: "طقم تصدير", quantity: 500, notes: "دفعة أولى اتجمعت" },
    { id: "d8", factoryId: FID, clientId: "cl-5", date: addDays(today, -6), dueDate: addDays(today, 20), amount: 95000, model: "طقم تصدير", quantity: 250, notes: "" },
  ];

  const collections = [
    ...hist.collections,
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
    ...hist.costEntries,
    { id: "ce1", factoryId: FID, costItemId: "ci-1", date: addDays(today, -14), vendor: "مصبغة السلام", partyId: "sup-1", quantity: 850, amount: 38250, notes: "أقمشة قمصان" },
    { id: "ce2", factoryId: FID, costItemId: "ci-14", date: addDays(today, -9), vendor: "المالك", partyId: "sup-4", quantity: 1, amount: 18000, notes: "إيجار سبتمبر" },
    { id: "ce3", factoryId: FID, costItemId: "ci-4", date: addDays(today, -5), vendor: "مكتبة الإكسسوار", partyId: "sup-2", quantity: 2000, amount: 4200, notes: "" },
    { id: "ce4", factoryId: FID, costItemId: "ci-15", date: addDays(today, -3), vendor: "شركة الكهرباء", partyId: "sup-3", quantity: 1, amount: 3100, notes: "" },
    // شغل الورشة الخارجية مابقاش فاتورة مشتريات: بقى إذن تشغيل SUB-0001
    // وحسابه بيتحسب من الاستلامات (شوف `subcontracts` تحت). لو سجّلناه في
    // الاتنين كان المصروف بيتعدّ مرتين.
  ];

  const costPayments = [
    ...hist.costPayments,
    { id: nid(), factoryId: FID, costEntryId: "ce1", date: addDays(today, -14), amount: 20000, accountId: bank, method: "bank" as const },
    { id: nid(), factoryId: FID, costEntryId: "ce2", date: addDays(today, -9), amount: 18000, accountId: cash, method: "cash" as const },
    { id: nid(), factoryId: FID, costEntryId: "ce4", date: addDays(today, -3), amount: 3100, accountId: wallet, method: "wallet" as const },
  ];

  const orders = [
    { id: "o1", factoryId: FID, code: "SN-1042", clientId: "cl-1", model: "قميص قطني", productId: "p1", bomId: "b1", materialsIssuedAt: addDays(today, -10), line: "الخط الثاني", quantity: 300, progress: 64, pieceCost: 212, piecePrice: 265, dueDate: today, status: "running" as const, notes: "" },
    { id: "o2", factoryId: FID, code: "SN-1043", clientId: "cl-3", model: "فستان صيفي", productId: "p2", bomId: "b2", materialsIssuedAt: null, line: "الخط الأول", quantity: 40, progress: 88, pieceCost: 403, piecePrice: 520, dueDate: addDays(today, 2), status: "running" as const, notes: "" },
    { id: "o3", factoryId: FID, code: "SN-1044", clientId: "cl-5", model: "طقم تصدير", productId: null, bomId: null, materialsIssuedAt: null, line: "الخط الثالث", quantity: 250, progress: 25, pieceCost: 220, piecePrice: 380, dueDate: addDays(today, 20), status: "running" as const, notes: "" },
    { id: "o4", factoryId: FID, code: "SN-1039", clientId: "cl-2", model: "بدلة مكتبية", productId: null, bomId: null, materialsIssuedAt: null, line: "خط التشطيب", quantity: 40, progress: 100, pieceCost: 1180, piecePrice: 1525, dueDate: addDays(today, -6), status: "done" as const, notes: "" },
    { id: "o5", factoryId: FID, code: "SN-1041", clientId: "cl-3", model: "تيشيرت مطبوع", productId: "p3", bomId: "b3", materialsIssuedAt: null, line: "الخط الأول", quantity: 160, progress: 40, pieceCost: 114, piecePrice: 165, dueDate: addDays(today, -2), status: "late" as const, notes: "المطبعة متأخرة" },
    { id: "o6", factoryId: FID, code: "SN-1045", clientId: null, model: "جاكت شتوي", productId: null, bomId: null, materialsIssuedAt: null, line: "الخط الثاني", quantity: 120, progress: 12, pieceCost: 320, piecePrice: 460, dueDate: addDays(today, 30), status: "stopped" as const, notes: "مستني وصول القماش" },
    { id: "o7", factoryId: FID, code: "SN-1046", clientId: "cl-2", model: "قميص قطني", productId: "p1", bomId: "b1", materialsIssuedAt: null, line: "الخط الأول", quantity: 200, progress: 0, pieceCost: 212, piecePrice: 272, dueDate: addDays(today, 6), status: "running" as const, notes: "الفرشة مخططة ولسه ماتقصّتش" },
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
    // شغل النهاردة — نفس الكميات اللي مسجّلة على الباندلات تحت بالحرف،
    // فدفتر الإنتاج والباندل بيقولوا نفس الرقم مش رقمين
    { id: nid(), factoryId: FID, orderId: "o1", operationId: op("مكوى"), date: today, workerId: "w4", qtyGood: 40, qtyRework: 0, qtyScrap: 0, rate: 5 },
    { id: nid(), factoryId: FID, orderId: "o1", operationId: op("فحص جودة"), date: today, workerId: "w5", qtyGood: 44, qtyRework: 2, qtyScrap: 0, rate: 3 },
    { id: nid(), factoryId: FID, orderId: "o1", operationId: op("تعبئة"), date: today, workerId: "w5", qtyGood: 44, qtyRework: 0, qtyScrap: 0, rate: 3 },
    { id: "se-o2-mk", factoryId: FID, orderId: "o2", operationId: op("مكوى"), date: today, workerId: "w4", qtyGood: 20, qtyRework: 0, qtyScrap: 0, rate: 7 },
    { id: "se-o2-pk", factoryId: FID, orderId: "o2", operationId: op("تعبئة"), date: today, workerId: "w5", qtyGood: 16, qtyRework: 4, qtyScrap: 0, rate: 4 },
  ];

  /**
   * أرض المصنع في وضع العرض.
   *
   * أمر الفستان (o2) **متتبّع بالباندل بالكامل**: فرشة مقصوصة، باندلين،
   * وكل عملية عليهم مسجّلة بوقت بدايتها ونهايتها — فالكفاءة والإنتاج
   * بالساعة والشغل الجاري كلهم بيطلعوا من بيانات حقيقية. وأمر القمصان
   * الجديد (o7) فرشته **مخططة ولسه ماتقصّتش**، عشان تشوف خطوة القص
   * وهي بتحصل.
   */
  const at = (day: string, time: string) => `${day}T${time}:00.000Z`;

  const cutLays = [
    {
      id: "lay-1",
      factoryId: FID,
      orderId: "o2",
      materialId: mat("قماش كتان"),
      operationId: op("قص"),
      color: "أوف وايت",
      date: addDays(today, -5),
      plies: 20,
      markerLengthM: 4.4,
      endAllowanceM: 0.2,
      markerWidthM: 1.5,
      status: "cut" as const,
      cutAt: at(addDays(today, -5), "11:20"),
      fabricUsedM: 94,
      notes: "فرشة فستان صيفي — مقاسين",
    },
    {
      id: "lay-2",
      factoryId: FID,
      orderId: "o7",
      materialId: mat("قماش قطن"),
      operationId: op("قص"),
      color: "أزرق فاتح",
      date: today,
      plies: 25,
      markerLengthM: 12.6,
      endAllowanceM: 0.3,
      markerWidthM: 1.6,
      status: "planned" as const,
      cutAt: null,
      fabricUsedM: null,
      notes: "٨ قطع في الطبقة على ٣ مقاسات",
    },
  ];

  const cutLayLines = [
    { id: nid(), factoryId: FID, layId: "lay-1", size: "M", perPly: 1 },
    { id: nid(), factoryId: FID, layId: "lay-1", size: "L", perPly: 1 },
    { id: nid(), factoryId: FID, layId: "lay-2", size: "M", perPly: 3 },
    { id: nid(), factoryId: FID, layId: "lay-2", size: "L", perPly: 3 },
    { id: nid(), factoryId: FID, layId: "lay-2", size: "XL", perPly: 2 },
  ];

  const bundles = [
    { id: "bn-1", factoryId: FID, code: "SN-1043-B001", orderId: "o2", layId: "lay-1", size: "M", color: "أوف وايت", qty: 20, createdAt: at(addDays(today, -5), "11:25") },
    { id: "bn-2", factoryId: FID, code: "SN-1043-B002", orderId: "o2", layId: "lay-1", size: "L", color: "أوف وايت", qty: 20, createdAt: at(addDays(today, -5), "11:25") },
  ];

  const bundleOp = (
    id: string,
    bundleId: string,
    operation: string,
    seq: number,
    workerId: string | null,
    state: "running" | "paused" | "done",
    startedAt: string,
    endedAt: string | null,
    pausedMinutes: number,
    good: number,
    rework: number,
    scrap: number,
    rate: number,
    stdMinutes: number,
    defect = "",
  ) => ({
    id,
    factoryId: FID,
    bundleId,
    orderId: "o2",
    operationId: op(operation),
    seq,
    workerId,
    state,
    startedAt,
    endedAt,
    pausedMinutes,
    pausedAt: null,
    pauseNote: "",
    qtyGood: good,
    qtyRework: rework,
    qtyScrap: scrap,
    rate,
    stdMinutes,
    defect,
    stageEntryId: null,
    notes: "",
  });

  const bundleOps = [
    bundleOp("bo-1", "bn-1", "خياطة", 2, "w2", "done", at(addDays(today, -3), "08:00"), at(addDays(today, -3), "18:30"), 30, 20, 0, 0, 40, 30),
    bundleOp("bo-2", "bn-2", "خياطة", 2, "w5", "done", at(addDays(today, -2), "08:15"), at(addDays(today, -2), "19:00"), 45, 16, 2, 0, 40, 30, "غرزة مفتوحة"),
    bundleOp("bo-3", "bn-1", "مكوى", 3, "w4", "done", at(today, "09:00"), at(today, "10:20"), 0, 20, 0, 0, 7, 4),
    bundleOp("bo-4", "bn-1", "تعبئة", 4, "w5", "done", at(today, "10:30"), at(today, "11:15"), 0, 16, 4, 0, 4, 2, "مقاس مش مطابق"),
    bundleOp("bo-5", "bn-2", "مكوى", 3, "w4", "running", at(today, "11:30"), null, 0, 0, 0, 0, 7, 4),
  ];

  const floorIssues = [
    {
      id: "fi-1",
      factoryId: FID,
      kind: "machine" as const,
      line: "الخط الثاني",
      orderId: "o1",
      bundleId: null,
      workerId: "w2",
      note: "ماكينة أوفر بتقطع الخيط كل شوية",
      at: at(today, "09:40"),
      status: "open" as const,
      resolvedAt: null,
      resolvedBy: null,
    },
    {
      id: "fi-2",
      factoryId: FID,
      kind: "material" as const,
      line: "الخط الأول",
      orderId: "o7",
      bundleId: null,
      workerId: "w1",
      note: "محتاجين بكر خيط أبيض على ترابيزة القص",
      at: at(today, "10:05"),
      status: "open" as const,
      resolvedAt: null,
      resolvedBy: null,
    },
  ];

  /**
   * تاريخ المسح لباندلات الفستان.
   *
   * السطور دي **مش تزويق**: هي اللي بتخلّي «تتبّع الباندل» في وضع العرض
   * يوري سلسلة حقيقية — الباندل اتقص، بعدها اتمسح على الخياطة وبدأ،
   * وسلّم، وبعدها المكوى، وبعدها التعبئة. والأوقات مظبوطة على أوقات
   * العمليات في `bundleOps` عشان السلسلة تقرا صح مش متضاربة.
   */
  const scan = (
    id: string,
    kind: ScanEvent["kind"],
    refId: string,
    code: string,
    action: ScanEvent["action"],
    when: string,
    actor: "m-sup" | "m-owner",
    source: ScanEvent["source"] = "camera",
    extra: Partial<ScanEvent> = {},
  ): ScanEvent => ({
    id,
    factoryId: FID,
    at: when,
    actorId: actor,
    actorName: actor === "m-sup" ? "حسام المشرف" : "صاحب المصنع",
    kind,
    refId,
    code,
    action,
    source,
    qty: null,
    from: "",
    to: "",
    note: "",
    ...extra,
  });

  const scans: ScanEvent[] = [
    scan("sc-1", "lay", "lay-1", "SANAA://LAY/lay-1", "open", at(addDays(today, -5), "11:18"), "m-sup"),
    scan("sc-2", "bundle", "bn-1", "SN-1043-B001", "start", at(addDays(today, -3), "08:00"), "m-sup", "camera", { qty: 20, from: "القص", to: "الخط الثاني", note: "خياطة" }),
    scan("sc-3", "bundle", "bn-1", "SN-1043-B001", "finish", at(addDays(today, -3), "18:30"), "m-sup", "camera", { qty: 20, from: "الخط الثاني", to: "الخط الثاني", note: "خياطة — ٢٠ سليم" }),
    scan("sc-4", "bundle", "bn-2", "SN-1043-B002", "start", at(addDays(today, -2), "08:15"), "m-sup", "camera", { qty: 20, from: "القص", to: "الخط الثاني", note: "خياطة" }),
    scan("sc-5", "bundle", "bn-1", "SN-1043-B001", "start", at(today, "09:00"), "m-sup", "camera", { qty: 20, from: "الخط الثاني", to: "المكوى", note: "مكوى" }),
    scan("sc-6", "material", mat("قماش قطن"), tpl.materials.find((m) => m.name === "قماش قطن")!.sku, "open", at(today, "10:04"), "m-sup", "manual", { note: "مراجعة رصيد قبل الفرشة" }),
    scan("sc-7", "bundle", "bn-1", "SN-1043-B001", "finish", at(today, "11:15"), "m-sup", "camera", { qty: 16, from: "التعبئة", to: "مخزن الإنتاج التام", note: "تعبئة — ٤ للإصلاح" }),
    scan("sc-8", "bundle", "bn-2", "SN-1043-B002", "start", at(today, "11:30"), "m-sup", "camera", { qty: 20, from: "الخط الثاني", to: "المكوى", note: "مكوى" }),
  ];

  /**
   * إذن تشغيل خارجي: ٣٠٠ قطعة خياطة برّه بأجر ٣٠ج، رجع منها ٢٤٠ سليم و١٢
   * تالف، و٤٠ لسه عند الورشة بعد الميعاد — عشان الشاشة تبان عليها حالة
   * «متأخر» الحقيقية بدل ما كل الأعمال تطلع مظبوطة.
   */
  const subcontracts = [
    {
      id: "sub-1",
      factoryId: FID,
      code: "SUB-0001",
      partyId: "ws-1",
      orderId: "o5",
      operationId: op("خياطة"),
      date: addDays(today, -12),
      expectedDate: addDays(today, -7),
      qtySent: 300,
      rate: 30,
      status: "open" as const,
      notes: "خياطة تيشيرتات — الورشة عندها ٨ ماكينات",
    },
    {
      id: "sub-2",
      factoryId: FID,
      code: "SUB-0002",
      partyId: "ws-2",
      orderId: "o1",
      operationId: op("مكوى"),
      date: addDays(today, -2),
      expectedDate: addDays(today, 2),
      qtySent: 120,
      rate: 6,
      status: "open" as const,
      notes: "مكوى وتشطيب",
    },
  ];

  const subReceipts = [
    { id: "sr-1", factoryId: FID, subcontractId: "sub-1", date: addDays(today, -8), qtyGood: 180, qtyRework: 0, qtyLost: 4, stageEntryId: null, notes: "دفعة أولى" },
    { id: "sr-2", factoryId: FID, subcontractId: "sub-1", date: addDays(today, -5), qtyGood: 60, qtyRework: 8, qtyLost: 8, stageEntryId: null, notes: "دفعة تانية — رجعت بعد الميعاد" },
  ];

  const subPayments = [
    { id: nid(), factoryId: FID, partyId: "ws-1", subcontractId: "sub-1", date: addDays(today, -6), amount: 4000, accountId: cash, method: "cash" as const, notes: "دفعة تحت الحساب" },
  ];

  /**
   * المرتجعات: خلطة مقصودة فيها الحالات التلاتة (وصل / اتفحص / اتسوّى)
   * والمصادر التلاتة (عميل / مورّد / خط)، وقرارات مختلفة — عشان شاشة
   * المرتجعات وباريتو الأسباب وتحليل الموديلات يبانوا على بيانات حقيقية
   * مش سطر واحد.
   *
   * والقميص القطني هو اللي بياخد أكبر نسبة إرجاع، وده اللي بيخلّي طبقة
   * الذكاء تقدر تقول إنه بيبيع كتير وربحيته أقل من ترتيبه في البيع.
   */
  const ret = (
    id: string,
    code: string,
    over: Partial<Db["returns"][number]> & Pick<Db["returns"][number], "source" | "date" | "itemType" | "itemId" | "qty" | "reason">,
  ): Db["returns"][number] => ({
    id,
    factoryId: FID,
    code,
    partyId: null,
    condition: "defective",
    reasonNote: "",
    deliveryId: null,
    orderId: null,
    bundleId: null,
    costEntryId: null,
    issueId: null,
    status: "open",
    resolution: null,
    unitValue: 0,
    settleAmount: 0,
    accountId: null,
    method: null,
    extraCost: 0,
    extraNote: "",
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
    createdBy: "m-owner",
    notes: "",
    ...over,
  });

  const year = Number(today.slice(0, 4));
  const rcode = (n: number) => `RET-${year}-${String(n).padStart(6, "0")}`;

  const returns: Db["returns"] = [
    ret("ret-1", rcode(1), {
      source: "customer",
      date: addDays(today, -3),
      partyId: "cl-2",
      itemType: "product",
      itemId: "p1",
      qty: 8,
      condition: "defective",
      reason: "quality",
      reasonNote: "الدرزة بتفتح من تحت الكم",
      deliveryId: "d4",
      orderId: "o1",
      bundleId: "bn-1",
      status: "settled",
      resolution: "credit",
      unitValue: 200,
      settleAmount: 1600,
      extraCost: 150,
      extraNote: "شحن الرجوع",
      inspectedAt: at(addDays(today, -3), "13:00"),
      inspectedBy: "m-sup",
      settledAt: at(addDays(today, -2), "10:20"),
      settledBy: "m-owner",
      notes: "اتفق مع العميل على خصم من الفاتورة",
    }),
    ret("ret-2", rcode(2), {
      source: "customer",
      date: addDays(today, -9),
      partyId: "cl-4",
      itemType: "product",
      itemId: "p2",
      qty: 6,
      condition: "good",
      reason: "wrong_size",
      reasonNote: "طلبت M واستلمت L",
      deliveryId: "d6",
      status: "settled",
      resolution: "replacement",
      unitValue: 380,
      replacementQty: 6,
      restock: true,
      warehouseId: whFg,
      inspectedAt: at(addDays(today, -9), "12:00"),
      inspectedBy: "m-sup",
      settledAt: at(addDays(today, -8), "09:30"),
      settledBy: "m-owner",
    }),
    ret("ret-3", rcode(3), {
      source: "customer",
      date: addDays(today, -1),
      partyId: "cl-1",
      itemType: "product",
      itemId: "p1",
      qty: 4,
      condition: "defective",
      reason: "damaged_transit",
      reasonNote: "الكرتونة اتبلّت في النقل",
      status: "inspected",
      unitValue: 200,
      inspectedAt: at(today, "09:10"),
      inspectedBy: "m-sup",
      notes: "مستني قرار: خصم ولا بديل",
    }),
    ret("ret-4", rcode(4), {
      source: "supplier",
      date: addDays(today, -11),
      partyId: "sup-1",
      itemType: "material",
      itemId: mat("قماش قطن"),
      qty: 40,
      condition: "defective",
      reason: "spec_mismatch",
      reasonNote: "الوزن أقل من المتفق عليه",
      costEntryId: "ce1",
      status: "settled",
      resolution: "credit",
      unitValue: 45,
      settleAmount: 1800,
      inspectedAt: at(addDays(today, -11), "11:00"),
      inspectedBy: "m-sup",
      settledAt: at(addDays(today, -10), "12:00"),
      settledBy: "m-owner",
      notes: "المصبغة وافقت على الخصم",
    }),
    ret("ret-5", rcode(5), {
      source: "production",
      date: addDays(today, -4),
      itemType: "material",
      itemId: mat("قماش قطن"),
      qty: 12,
      condition: "good",
      reason: "leftover",
      reasonNote: "فاضل من فرشة القميص",
      orderId: "o1",
      status: "settled",
      resolution: "credit",
      unitValue: 45,
      restock: true,
      warehouseId: whMat,
      inspectedAt: at(addDays(today, -4), "16:00"),
      inspectedBy: "m-sup",
      settledAt: at(addDays(today, -4), "16:20"),
      settledBy: "m-sup",
    }),
    ret("ret-6", rcode(6), {
      source: "customer",
      date: today,
      partyId: "cl-3",
      itemType: "product",
      itemId: "p3",
      qty: 20,
      condition: "defective",
      reason: "quality",
      reasonNote: "الطبعة بتقشّر بعد أول غسلة",
      status: "open",
      unitValue: 60,
      notes: "وصل الصبح — لسه مافتحناش الكراتين",
    }),
  ];

  const complaints: Db["complaints"] = [
    {
      id: "cmp-1",
      factoryId: FID,
      code: `CMP-${year}-000001`,
      partyId: "cl-2",
      date: addDays(today, -3),
      kind: "quality",
      severity: "high",
      subject: "درزة بتفتح في القمصان",
      detail: "العميل قال إن ٨ قطع من ١٢٠ الدرزة فيها بتفتح، وطالب بمراجعة الخط.",
      deliveryId: "d4",
      orderId: "o1",
      returnId: "ret-1",
      ownerId: "m-sup",
      dueDate: addDays(today, 2),
      status: "investigating",
      claimAmount: 0,
      resolution: "",
      resolvedAt: null,
      resolvedBy: null,
      createdAt: new Date().toISOString(),
      createdBy: "m-owner",
    },
    {
      id: "cmp-2",
      factoryId: FID,
      code: `CMP-${year}-000002`,
      partyId: "cl-5",
      date: addDays(today, -14),
      kind: "delay",
      severity: "medium",
      subject: "الشحنة اتأخرت ١٢ يوم",
      detail: "طقم التصدير اتسلّم بعد الميعاد، والعميل قال إن الشحن البحري فاته.",
      deliveryId: "d7",
      orderId: null,
      returnId: null,
      ownerId: "m-owner",
      dueDate: addDays(today, -4),
      status: "open",
      claimAmount: 12000,
      resolution: "",
      resolvedAt: null,
      resolvedBy: null,
      createdAt: new Date().toISOString(),
      createdBy: "m-owner",
    },
    {
      id: "cmp-3",
      factoryId: FID,
      code: `CMP-${year}-000003`,
      partyId: "cl-1",
      date: addDays(today, -20),
      kind: "price",
      severity: "low",
      subject: "فاتورة فيها بند زيادة",
      detail: "الفاتورة اتحسبت على ٢٠٥ للقطعة بدل ١٩٥ المتفق عليها.",
      deliveryId: "d1",
      orderId: null,
      returnId: null,
      ownerId: "m-acc",
      dueDate: null,
      status: "resolved",
      claimAmount: 0,
      resolution: "اتعمل إشعار خصم بالفرق واتأكد السعر في كشف الحساب.",
      resolvedAt: at(addDays(today, -18), "11:00"),
      resolvedBy: "m-acc",
      createdAt: new Date().toISOString(),
      createdBy: "m-acc",
    },
  ];

  const manualTx = [
    ...hist.manualTx,
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
    cutLays,
    cutLayLines,
    bundles,
    bundleOps,
    floorIssues,
    scans,
    subcontracts,
    subReceipts,
    subPayments,
    returns,
    complaints,
    costItems: items,
    costEntries,
    costPayments,
    parties,
    contacts,
    addresses,
    communications,
    tasks,
    deliveries,
    collections,
    workers,
    workerEarnings,
    workerPayments,
    orders,
    manualTx,
    documents: [],
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
