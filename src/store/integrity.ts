/**
 * فحص سلامة الدفتر.
 *
 * الفكرة مش «الشاشة بتفتح؟» — الفكرة إن الأرقام اللي الشاشات بتقراها
 * مابتخرجش عن المنطق: مافيش سجل مربوط بحاجة مامسحيّة، مافيش كود مكرر،
 * مافيش رصيد بالسالب، ومافيش سجل من مصنع تاني.
 *
 * وكل فحص بيرجّع **أمثلة بالاسم**، مش رقم بس. «٣ توريدات ليها مشكلة» جملة
 * مابتتصرّفش عليها؛ «توريد فلان بعميل مامسحيّاش» جملة بتتصلّح.
 */
import type { Db } from "./types";

export type CheckTone = "ok" | "warn" | "danger";

export type IntegrityCheck = {
  key: string;
  label: string;
  /** الفحص ده بيمنع إيه لو نجح */
  about: string;
  tone: CheckTone;
  count: number;
  /** أول أمثلة بالاسم أو بالكود */
  samples: string[];
};

const ids = (rows: { id: string }[] | undefined) => new Set((rows ?? []).map((r) => r.id));

function dupes(values: string[]): string[] {
  const seen = new Set<string>();
  const out = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) out.add(v);
    seen.add(v);
  }
  return [...out];
}

/** رصيد الخامة محسوب من الحركات نفسها، زي ما المخزون بيحسبه */
function stockByItem(db: Db): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of db.stockMovements ?? []) {
    out.set(m.itemId, (out.get(m.itemId) ?? 0) + Number(m.qty || 0));
  }
  return out;
}

export function integrityChecks(db: Db): IntegrityCheck[] {
  const out: IntegrityCheck[] = [];
  const add = (
    key: string,
    label: string,
    about: string,
    samples: string[],
    tone: CheckTone = "danger",
  ) => out.push({ key, label, about, tone, count: samples.length, samples: samples.slice(0, 6) });

  const partyIds = ids(db.parties);
  const orderIds = ids(db.orders);
  const materialIds = ids(db.materials);
  const productIds = ids(db.products);
  const bomIds = ids(db.boms);
  const accountIds = ids(db.accounts);
  const workerIds = ids(db.workers);
  const bundleIds = ids(db.bundles);
  /* ── الروابط المعلّقة ─────────────────────────────────────────── */
  add(
    "order-client",
    "أوامر بعميل مامسحيّاش",
    "لو العميل اتمسح والأمر فاضل، ربح الأمر مش هيدخل في حساب أي عميل",
    (db.orders ?? []).filter((o) => o.clientId && !partyIds.has(o.clientId)).map((o) => o.code),
  );
  add(
    "delivery-client",
    "توريدات بعميل مامسحيّاش",
    "التوريد اللي مش مربوط بعميل بيختفي من كشف حسابه ومن أعمار مستحقاته",
    (db.deliveries ?? []).filter((d) => !partyIds.has(d.clientId)).map((d) => `${d.model} — ${d.amount}`),
  );
  add(
    "collection-client",
    "تحصيلات بعميل مامسحيّاش",
    "تحصيل بلا عميل بيقلّل الخزنة ومابيقلّلش مستحق حد",
    (db.collections ?? []).filter((c) => !partyIds.has(c.clientId)).map((c) => `${c.date} — ${c.amount}`),
  );
  add(
    "collection-account",
    "تحصيلات بحساب فلوس مامسحيّاش",
    "الفلوس دخلت فين؟ من غير حساب مش هتبان في أي خزنة",
    (db.collections ?? []).filter((c) => c.accountId && !accountIds.has(c.accountId)).map((c) => `${c.date} — ${c.amount}`),
  );
  add(
    "bundle-order",
    "باندلات بأمر مامسحيّاش",
    "الباندل من غير أمر مش داخل في تقدّم أي أمر، وشغله بيضيع",
    (db.bundles ?? []).filter((b) => !orderIds.has(b.orderId)).map((b) => b.code),
  );
  add(
    "movement-item",
    "حركات مخزون بصنف مامسحيّاش",
    "حركة على صنف مش موجود بتزوّر رصيد المخزن",
    (db.stockMovements ?? [])
      .filter((m) => (m.itemType === "material" ? !materialIds.has(m.itemId) : !productIds.has(m.itemId)))
      .map((m) => `${m.date} — ${m.qty}`),
  );
  add(
    "bom-links",
    "سطور قايمة خامات معلّقة",
    "سطر بخامة أو قايمة مش موجودة بيخلي تكلفة المنتج ناقصة من غير ما حد يعرف",
    (db.bomItems ?? [])
      .filter((i) => !materialIds.has(i.materialId) || !bomIds.has(i.bomId))
      .map((i) => i.id),
  );
  add(
    "earning-worker",
    "أجور لعامل مامسحيّاش",
    "أجر بلا عامل بيدخل في تكلفة المصنعية ومش بيبان في كشف أي حد",
    (db.workerEarnings ?? []).filter((e) => !workerIds.has(e.workerId)).map((e) => `${e.date} — ${e.amount}`),
  );
  add(
    "return-links",
    "مرتجعات بجهة أو أمر مامسحيّاش",
    "المرتجع المعلّق مابيخشّش في تحليل جودة أي موديل ولا أي عميل",
    (db.returns ?? [])
      .filter((r) => (r.partyId && !partyIds.has(r.partyId)) || (r.orderId && !orderIds.has(r.orderId)))
      .map((r) => r.code),
  );
  add(
    "op-bundle",
    "تسجيلات عمليات على باندل مامسحيّاش",
    "دقايق وأجور اتسجّلت على باندل مش موجود",
    (db.bundleOps ?? []).filter((o) => !bundleIds.has(o.bundleId)).map((o) => o.id),
  );

  /* ── الأكواد المكررة ──────────────────────────────────────────── */
  const codeTables: [string, string, string[]][] = [
    ["orders", "أوامر الإنتاج", (db.orders ?? []).map((o) => o.code)],
    ["supplyOrders", "أوامر التوريد", (db.supplyOrders ?? []).map((o) => o.code)],
    ["supplyReceipts", "إذون الاستلام", (db.supplyReceipts ?? []).map((r) => r.code)],
    ["bundles", "الباندلات", (db.bundles ?? []).map((b) => b.code)],
    ["returns", "المرتجعات", (db.returns ?? []).map((r) => r.code)],
    ["documents", "المستندات", (db.documents ?? []).map((d) => d.number)],
    ["products", "أكواد المنتجات", (db.products ?? []).map((p) => p.sku)],
    ["materials", "أكواد الخامات", (db.materials ?? []).map((m) => m.sku)],
  ];
  const dupCodes = codeTables
    .flatMap(([, label, list]) => dupes(list.filter(Boolean)).map((c) => `${label}: ${c}`));
  add("dup-codes", "أكواد مكررة", "كودين متشابهين معناه إن مستند بيشاور على اتنين، والتتبّع بيوقف", dupCodes);

  const dupIdTables = Object.entries(db)
    .filter(([, v]) => Array.isArray(v))
    .flatMap(([table, rows]) => {
      const list = (rows as { id?: string }[]).map((r) => r?.id).filter(Boolean) as string[];
      return dupes(list).map((id) => `${table}: ${id}`);
    });
  add("dup-ids", "معرّفات مكررة", "معرّف مكرر جوه جدول بيخلي التعديل يمسك السجل الغلط", dupIdTables);

  /* ── أرقام مالها معنى ─────────────────────────────────────────── */
  const stock = stockByItem(db);
  add(
    "negative-stock",
    "أرصدة بالسالب",
    "رصيد سالب معناه صرف أكتر من اللي دخل — يا استلام ناقص يا صرف مزوّد",
    (db.materials ?? [])
      .filter((m) => (stock.get(m.id) ?? 0) < -0.001)
      .map((m) => `${m.name}: ${(stock.get(m.id) ?? 0).toFixed(2)}`),
  );

  const overCut = (db.orders ?? [])
    .map((o) => {
      const pieces = (db.bundles ?? []).filter((b) => b.orderId === o.id).reduce((s, b) => s + b.qty, 0);
      return { code: o.code, pieces, quantity: o.quantity };
    })
    .filter((r) => r.pieces > r.quantity)
    .map((r) => `${r.code}: مقصوص ${r.pieces} من ${r.quantity}`);
  add("over-cut", "أوامر مقصوص منها أكتر من كميتها", "القص الزايد بياكل قماش مش محسوب في تكلفة الأمر", overCut, "warn");

  const overPaid = (db.parties ?? [])
    .map((p) => {
      const billed = (db.deliveries ?? []).filter((d) => d.clientId === p.id).reduce((s, d) => s + d.amount, 0);
      const paid = (db.collections ?? [])
        .filter((c) => c.clientId === p.id && c.status === "confirmed")
        .reduce((s, c) => s + c.amount, 0);
      return { name: p.name, diff: paid - billed };
    })
    .filter((r) => r.diff > 1)
    .map((r) => `${r.name}: دفع زيادة ${Math.round(r.diff)}`);
  add(
    "over-collected",
    "عملاء دفعوا أكتر من المتسجّل عليهم",
    "الزيادة يا توريد مااتسجّلش يا تحصيل اتسجّل على العميل الغلط",
    overPaid,
    "warn",
  );

  /* ── العزل بين المصانع ───────────────────────────────────────── */
  const fid = db.factory?.id ?? "";
  const strangers = Object.entries(db)
    .filter(([, v]) => Array.isArray(v))
    .flatMap(([table, rows]) =>
      (rows as { factoryId?: string; id?: string }[])
        .filter((r) => r?.factoryId && r.factoryId !== fid)
        .map((r) => `${table}: ${r.id}`),
    );
  add("tenant", "سجلات من مصنع تاني", "ده أخطر فحص: سجل من مصنع تاني في دفترك معناه إن العزل اتخرق", strangers);

  return out;
}

export function integritySummary(db: Db): { checks: IntegrityCheck[]; failed: number; problems: number } {
  const checks = integrityChecks(db);
  const bad = checks.filter((c) => c.count > 0);
  return { checks, failed: bad.length, problems: bad.reduce((s, c) => s + c.count, 0) };
}

/** عدد السجلات في كل جدول — لقياس حجم الدفتر */
export function tableCounts(db: Db): { table: string; rows: number }[] {
  return Object.entries(db)
    .filter(([, v]) => Array.isArray(v))
    .map(([table, rows]) => ({ table, rows: (rows as unknown[]).length }))
    .sort((a, b) => b.rows - a.rows);
}
