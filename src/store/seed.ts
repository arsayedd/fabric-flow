import { addDays, cairoToday, nid } from "@/lib/utils";
import { DEFAULT_COST_ITEMS, type Db, type Member } from "./types";

const FID = "factory-demo-1";

export const DEMO_MEMBERS: Member[] = [
  { id: "m-owner", factoryId: FID, email: "owner@factory.demo", name: "صاحب المصنع", role: "owner" },
  { id: "m-acc", factoryId: FID, email: "accountant@factory.demo", name: "منى المحاسب", role: "accountant" },
  { id: "m-sup", factoryId: FID, email: "supervisor@factory.demo", name: "حسام المشرف", role: "supervisor" },
];

export function emptyDb(factoryName: string): Db {
  const factoryId = nid();
  return {
    factory: { id: factoryId, name: factoryName, createdAt: new Date().toISOString() },
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
        after: { name: factoryName },
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
  const items = DEFAULT_COST_ITEMS.map((c, i) => ({
    id: `ci-${i + 1}`,
    factoryId: FID,
    ...c,
  }));

  const clients = [
    { id: "cl-1", factoryId: FID, name: "محلات البرنس", phone: "01012345678", notes: "عميل جملة — شارع الهرم" },
    { id: "cl-2", factoryId: FID, name: "شركة الأناقة للتجارة", phone: "01298765432", notes: "فاتورة شهرية" },
    { id: "cl-3", factoryId: FID, name: "تاجر العباسية", phone: "01155556666", notes: "كاش غالباً" },
    { id: "cl-4", factoryId: FID, name: "بوتيك نورا", phone: "01544443333", notes: "موديلات صيفي" },
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
    { id: "o1", factoryId: FID, code: "SN-1042", clientId: "cl-1", model: "قميص قطني", line: "الخط الثاني", quantity: 300, progress: 64, pieceCost: 145, piecePrice: 210, dueDate: today, status: "running" as const, notes: "" },
    { id: "o2", factoryId: FID, code: "SN-1043", clientId: "cl-4", model: "فستان صيفي", line: "الخط الأول", quantity: 40, progress: 88, pieceCost: 260, piecePrice: 380, dueDate: addDays(today, 2), status: "running" as const, notes: "" },
    { id: "o3", factoryId: FID, code: "SN-1044", clientId: "cl-5", model: "طقم تصدير", line: "الخط الثالث", quantity: 250, progress: 25, pieceCost: 220, piecePrice: 380, dueDate: addDays(today, 20), status: "running" as const, notes: "" },
    { id: "o4", factoryId: FID, code: "SN-1039", clientId: "cl-2", model: "بدلة مكتبية", line: "خط التشطيب", quantity: 40, progress: 100, pieceCost: 1180, piecePrice: 1525, dueDate: addDays(today, -6), status: "done" as const, notes: "" },
    { id: "o5", factoryId: FID, code: "SN-1041", clientId: "cl-3", model: "تيشيرت مطبوع", line: "الخط الأول", quantity: 160, progress: 40, pieceCost: 44, piecePrice: 60, dueDate: addDays(today, -2), status: "late" as const, notes: "المطبعة متأخرة" },
    { id: "o6", factoryId: FID, code: "SN-1045", clientId: null, model: "جاكت شتوي", line: "الخط الثاني", quantity: 120, progress: 12, pieceCost: 320, piecePrice: 460, dueDate: addDays(today, 30), status: "stopped" as const, notes: "مستني وصول القماش" },
  ];

  const manualTx = [
    { id: nid(), factoryId: FID, date: addDays(today, -20), accountId: cash, amount: 15000, notes: "رصيد افتتاحي للدرج" },
    { id: nid(), factoryId: FID, date: addDays(today, -20), accountId: bank, amount: 80000, notes: "رصيد افتتاحي للبنك" },
    { id: nid(), factoryId: FID, date: addDays(today, -11), accountId: cash, amount: -1200, notes: "نثريات ورشة" },
  ];

  return {
    factory: { id: FID, name: "مصنع النور للملابس الجاهزة", createdAt: addDays(today, -90) + "T08:00:00.000Z" },
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
