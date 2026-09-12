/**
 * صنعة — ملف العميل ٣٦٠ (M-B1)
 *
 * القسم ده مابيسجّلش حاجة جديدة. شغلته الوحيدة إنه يرد على سؤال واحد
 * لصاحب المصنع وهو واقف على عميل واحد: **العميل ده عملنا له إيه،
 * وكلّفنا كام، وكسبنا منه كام فعلًا؟**
 *
 * والفتحة اللي بيقفلها مش شاشة ناقصة — هي **ربط ناقص**:
 *
 *   `Delivery.model` نص مكتوب بالإيد. فـ«إيراد الـSKU ده كام» كان
 *   بيتحسب بمطابقة اسم، والمطابقة بتغلط، والربح على مستوى الموديل
 *   لعميل معيّن مكانش موجود خالص.
 *
 * والحل هنا **مش** عمود جديد اسمه `productId` على التوريد: التوريد بقى
 * عنده `orderId` من قبل كده، وأمر الإنتاج عنده `productId`. فالموديل
 * بيتحدد بالمعرّف لما الربط موجود، وبالاسم لما مش موجود — **والشاشة
 * بتقول أنهي واحد**. تخزين نفس الحقيقة في مكانين بيخلي واحد منهم
 * يقدم، وتخمين بلا اعتراف بيخلي الرقم يبان دقيق وهو مش.
 *
 * والقاعدة التانية اللي الملف كله ماشي عليها: **الربح بيتحسب على
 * النطاق اللي عارفين تكلفته، والنسبة دي بتتقال.** الإيراد عندنا من
 * أول يوم، والتكلفة الفعلية بس على الأوامر اللي اتسجّلت في النظام. لو
 * قسمنا الإيراد كله على التكلفة المعروفة، كل عميل قديم هيطلع هامشه
 * ٩٠٪ — رقم مريح وكاذب.
 */

import { cairoToday, daysBetween, qty } from "@/lib/utils";
import { caseCostTotal, customerCredits, fifoRemain, isEffective } from "./compute";
import { costSheet } from "./costing";
import { orderStages, productById } from "./manufacturing";
import { partyById } from "./parties";
import { PROBLEM_LABEL, type Db, type Delivery, type Order, type Product, type ReturnEntry } from "./types";

const EPS = 0.0001;

/* ── ١) الموديل بتاع التوريد: بالمعرّف الأول ───────────────────── */

export type DeliveryProduct = {
  product: Product | null;
  /** الربط جه من أمر إنتاج بالمعرّف (`true`) ولا من مطابقة الاسم (`false`) */
  exact: boolean;
  /** الاسم المعروض: اسم المنتج لو مربوط، وإلا النص المكتوب في التوريد */
  name: string;
};

/**
 * ترتيب المحاولات مقصود:
 *
 *  1. `orderId` → `order.productId` — **ربط بالمعرّف**، ده اليقين
 *  2. مطابقة الاسم بالكتالوج — تقريب، وبيترجّع بـ`exact: false`
 *  3. مافيش — الموديل نص حر مش في الكتالوج، وده **حالة حقيقية** مش
 *     خطأ بيانات: المصنع بيشتغل حاجات مش كلها متسجّلة كمنتج
 */
export function deliveryProduct(db: Db, d: Delivery): DeliveryProduct {
  if (d.orderId) {
    const order = db.orders.find((o) => o.id === d.orderId);
    const p = order?.productId ? productById(db, order.productId) : null;
    if (p) return { product: p, exact: true, name: p.name };
  }
  const name = d.model.trim();
  const byName = name ? db.products.find((p) => p.name.trim() === name) : undefined;
  if (byName) return { product: byName, exact: false, name: byName.name };
  return { product: null, exact: false, name: name || "بدون موديل" };
}

/* ── ٢) مصفوفة موديلات العميل ──────────────────────────────────── */

export type ClientProductRow = {
  /** `null` = الموديل مش في الكتالوج، فمفيش SKU ولا تكلفة */
  productId: string | null;
  sku: string | null;
  name: string;
  /** كل توريدات الصف دي ربطها جه بالمعرّف */
  exact: boolean;
  deliveries: number;
  deliveredQty: number;
  revenue: number;
  /** الجزء من إيراد الصف اللي ربطه بأمر إنتاج بالمعرّف */
  exactRevenue: number;
  /** المنتَج في أوامر العميل دي — من المراحل، مش من نسبة مكتوبة */
  producedQty: number;
  returnedQty: number;
  returnCases: number;
  /** نسبة الرجوع من المتسلّم. `null` لو التوريد مسجّل بلا كمية */
  returnRatePct: number | null;
  /** تكلفة القطعة من ورقة التكلفة. `null` = مافيش قائمة خامات */
  unitCost: number | null;
  cost: number | null;
  profit: number | null;
  marginPct: number | null;
  /** ألوان ومقاسات اتسجّلت فعلًا على الموديل ده (باندلات أو مرتجعات) */
  colors: string[];
  sizes: string[];
};

export type ClientProducts = {
  rows: ClientProductRow[];
  revenue: number;
  /** إيراد الصفوف اللي موديلها في الكتالوج */
  catalogRevenue: number;
  /** إيراد الصفوف اللي ربطها جه بالمعرّف */
  exactRevenue: number;
  /** نسبة الإيراد اللي عارفين موديله في الكتالوج */
  catalogPct: number | null;
  /** نسبة الإيراد اللي ربطه بالمعرّف مش بالاسم */
  exactPct: number | null;
  /** إيراد الصفوف اللي ليها تكلفة محسوبة — النطاق اللي الربح بيتقاس عليه */
  costedRevenue: number;
};

/**
 * الصف مفتاحه المنتج لو مربوط، والاسم لو مش مربوط.
 *
 * ومابنجمّعش المربوط مع المش مربوط في صف واحد حتى لو الاسم متشابه:
 * الأول له SKU وتكلفة، والتاني لأ. جمعهم كان بيطلّع صف نصه معروف
 * ونصه مجهول — وده أسوأ من صفين كل واحد بيقول حالته.
 */
export function clientProducts(db: Db, partyId: string): ClientProducts {
  const dels = db.deliveries.filter((d) => d.clientId === partyId);
  const rets = db.returns.filter((r) => r.partyId === partyId && r.status !== "cancelled");
  const orders = db.orders.filter((o) => o.clientId === partyId);

  type Acc = {
    productId: string | null;
    sku: string | null;
    name: string;
    exact: boolean;
    deliveries: number;
    deliveredQty: number;
    revenue: number;
    exactRevenue: number;
    producedQty: number;
    returnedQty: number;
    returnCases: number;
    colors: Set<string>;
    sizes: Set<string>;
    /** فيه توريد واحد على الأقل مسجّل بلا كمية، فالنِسَب مش كاملة */
    missingQty: boolean;
  };
  const map = new Map<string, Acc>();
  const take = (productId: string | null, name: string, sku: string | null, exact: boolean): Acc => {
    const key = productId ?? `name:${name}`;
    let cur = map.get(key);
    if (!cur) {
      cur = {
        productId,
        sku,
        name,
        exact,
        deliveries: 0,
        deliveredQty: 0,
        revenue: 0,
        exactRevenue: 0,
        producedQty: 0,
        returnedQty: 0,
        returnCases: 0,
        colors: new Set(),
        sizes: new Set(),
        missingQty: false,
      };
      map.set(key, cur);
    }
    // صف مربوط بالمعرّف مرة واحدة على الأقل بيفضل «تقريبي» لو باقي
    // توريداته بالاسم — أدق وصف للحالة هو الأضعف فيها
    if (!exact) cur.exact = false;
    return cur;
  };

  for (const d of dels) {
    const res = deliveryProduct(db, d);
    const acc = take(res.product?.id ?? null, res.name, res.product?.sku ?? null, res.exact);
    acc.deliveries += 1;
    acc.revenue += d.amount;
    if (res.exact) acc.exactRevenue += d.amount;
    if (d.quantity === null) acc.missingQty = true;
    else acc.deliveredQty += d.quantity;
  }

  // المنتَج بياخد المنتج من الأمر مباشرة: الأمر ليه `productId` أصلًا
  for (const o of orders) {
    const p = o.productId ? productById(db, o.productId) : null;
    if (!p) continue;
    const acc = map.get(p.id);
    if (!acc) continue;
    const stages = orderStages(db, o);
    acc.producedQty += stages.length ? stages[stages.length - 1].good : 0;
  }

  for (const r of rets) {
    if (r.itemType !== "product") continue;
    const p = productById(db, r.itemId);
    const acc = p ? map.get(p.id) : null;
    if (!acc) continue;
    acc.returnedQty += r.qty;
    acc.returnCases += 1;
    if (r.color) acc.colors.add(r.color);
    if (r.size) acc.sizes.add(r.size);
  }

  // الألوان والمقاسات من الباندلات: ده المكان الوحيد اللي فيه اللون
  // والمقاس بيتسجّلوا على الإنتاج فعلًا
  for (const o of orders) {
    if (!o.productId) continue;
    const acc = map.get(o.productId);
    if (!acc) continue;
    for (const b of db.bundles ?? []) {
      if (b.orderId !== o.id) continue;
      if (b.color) acc.colors.add(b.color);
      if (b.size) acc.sizes.add(b.size);
    }
  }

  const rows: ClientProductRow[] = [...map.values()].map((a) => {
    const sheet = a.productId ? costSheet(db, a.productId) : null;
    const unitCost = sheet && sheet.total > 0 ? sheet.total : null;
    // التكلفة بتتقاس على **المتسلّم**، مش على المنتَج: السؤال هنا
    // تجاري — العميل ده كسبنا منه كام على اللي خرج له
    const cost = unitCost !== null && a.deliveredQty > 0 ? unitCost * a.deliveredQty : null;
    const profit = cost === null ? null : a.revenue - cost;
    return {
      productId: a.productId,
      sku: a.sku,
      name: a.name,
      exact: a.exact,
      deliveries: a.deliveries,
      deliveredQty: a.deliveredQty,
      revenue: a.revenue,
      exactRevenue: a.exactRevenue,
      producedQty: a.producedQty,
      returnedQty: a.returnedQty,
      returnCases: a.returnCases,
      returnRatePct: a.deliveredQty > EPS && !a.missingQty ? (a.returnedQty / a.deliveredQty) * 100 : null,
      unitCost,
      cost,
      profit,
      marginPct: profit !== null && a.revenue > EPS ? (profit / a.revenue) * 100 : null,
      colors: [...a.colors].sort(),
      sizes: [...a.sizes].sort(),
    };
  });

  rows.sort((x, y) => y.revenue - x.revenue);
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const catalogRevenue = rows.filter((r) => r.productId).reduce((s, r) => s + r.revenue, 0);
  // على مستوى التوريد مش على مستوى الصف: صف فيه توريد واحد مربوط
  // بالمعرّف وعشرة بالاسم مش «صفر ربط» — هو الربط اللي موجود فعلًا
  const exactRevenue = rows.reduce((s, r) => s + r.exactRevenue, 0);
  const costedRevenue = rows.filter((r) => r.cost !== null).reduce((s, r) => s + r.revenue, 0);

  return {
    rows,
    revenue,
    catalogRevenue,
    exactRevenue,
    catalogPct: revenue > EPS ? (catalogRevenue / revenue) * 100 : null,
    exactPct: revenue > EPS ? (exactRevenue / revenue) * 100 : null,
    costedRevenue,
  };
}

/* ── ٣) صافي المساهمة: الإيراد ناقص بنوده ──────────────────────── */

export type CostComponent = {
  key: string;
  label: string;
  amount: number;
  /** من فين اتحسب — بيتعرض جنب الرقم عشان تقدر تكذّبه */
  from: string;
};

export type ClientContribution = {
  /** كل الإيراد من أول يوم */
  revenue: number;
  /**
   * إيراد الموديلات اللي عندها ورقة تكلفة.
   *
   * الربح بيتحسب على ده بس، وهو **نفس** النطاق اللي الجدول تحت بيحسب
   * عليه ربح كل سطر. والفرق بينه وبين `revenue` مش خطأ — هو توريدات
   * موديلها مش في الكتالوج أو من غير قائمة خامات، وتكلفته مش معروفة.
   */
  scopedRevenue: number;
  scopePct: number | null;
  components: CostComponent[];
  cost: number;
  net: number;
  marginPct: number | null;
  /** الموديلات اللي الحساب بيقف عليها */
  productCount: number;
  /** أوامر العميل اللي اتسجّلت عليها حركات صرف وأجور فعلية */
  actualOrders: number;
  /** بنود العميل الحقيقية اللي النظام مش بيسجّلها لسه */
  missing: { label: string; why: string }[];
};

/**
 * صافي المساهمة.
 *
 * الرقم ده **مجموع عمود الجدول اللي تحته**، مش حساب تاني موازي له.
 * لو الكارت خصم بنطاق والجدول حسب بنطاق تاني، صاحب المصنع كان هيبص
 * على رقمين متناقضين في شاشة واحدة ويسيب الاتنين.
 *
 * والأساس هو **ورقة التكلفة × المتسلّم**: الورقة نفسها مبنية على أسعار
 * خامات حقيقية وأجور قطعة حقيقية، لكنها تكلفة معيارية للقطعة مش
 * استهلاك أمر بعينه. الاستهلاك الفعلي متسجّل على الأوامر فعلًا — لكن
 * ربطه بالإيراد محتاج إن التوريد يكون مربوط بالأمر، وده لسه مش متحقق
 * على كل التوريدات. فبنقول عدد الأوامر اللي عندها تكلفة فعلية بدل ما
 * نخلط الاتنين في رقم واحد.
 *
 * والمرتجعات وإشعارات الخصم **فعلية** مش معيارية، وبتتخصم كاملة: دي
 * خسارة حصلت على العميل ده بعينه.
 */
export function clientContribution(db: Db, partyId: string): ClientContribution {
  const dels = db.deliveries.filter((d) => d.clientId === partyId);
  const revenue = dels.reduce((s, d) => s + d.amount, 0);
  const orders = db.orders.filter((o) => o.clientId === partyId);

  const matrix = clientProducts(db, partyId);
  const costed = matrix.rows.filter((r) => r.cost !== null && r.productId);
  const scopedRevenue = costed.reduce((s, r) => s + r.revenue, 0);

  // بنود الورقة × المتسلّم: نفس الضربة اللي طلّعت تكلفة السطر، متفكوكة
  let materials = 0;
  let waste = 0;
  let labor = 0;
  let outsourcing = 0;
  let overhead = 0;
  for (const r of costed) {
    const sheet = costSheet(db, r.productId as string);
    materials += sheet.materials * r.deliveredQty;
    waste += sheet.waste * r.deliveredQty;
    labor += sheet.labor * r.deliveredQty;
    outsourcing += sheet.outsourced * r.deliveredQty;
    overhead += sheet.overhead * r.deliveredQty;
  }

  const rets = db.returns.filter((r) => r.partyId === partyId && r.status !== "cancelled");
  const returnCost = rets.reduce((s, r) => s + caseCostTotal(db, r), 0);
  const credits = customerCredits(db)
    .filter((c) => c.partyId === partyId)
    .reduce((s, c) => s + c.amount, 0);

  const orderIds = new Set(orders.map((o) => o.id));
  const actualOrders = new Set(
    [
      ...db.stockMovements
        .filter((m) => m.refType === "order" && m.refId && orderIds.has(m.refId) && (m.kind === "issue" || m.kind === "waste"))
        .map((m) => m.refId as string),
      ...db.stageEntries.filter((e) => orderIds.has(e.orderId)).map((e) => e.orderId),
    ],
  ).size;

  const components: CostComponent[] = [
    { key: "materials", label: "خامات", amount: materials, from: "قائمة الخامات × سعر الخامة × المتسلّم" },
    { key: "waste", label: "هالك محتسب", amount: waste, from: "نسبة الهالك في قائمة الخامات" },
    { key: "labor", label: "أجور إنتاج", amount: labor, from: "مسار التشغيل × أجر القطعة × المتسلّم" },
    { key: "outsourcing", label: "تشغيل خارجي", amount: outsourcing, from: "عمليات الورش في مسار التشغيل" },
    { key: "overhead", label: "أوفرهيد محمّل", amount: overhead, from: "رقم الإعدادات للقطعة × المتسلّم" },
    { key: "returns", label: "تكلفة المرتجعات", amount: returnCost, from: "سطور تكلفة الحالات وأوامر الإصلاح — فعلية" },
    { key: "credits", label: "إشعارات خصم", amount: credits, from: "المرتجعات اللي قرارها إشعار خصم — فعلية" },
  ].filter((c) => c.amount > EPS);

  const cost = components.reduce((s, c) => s + c.amount, 0);
  const net = scopedRevenue - cost;

  return {
    revenue,
    scopedRevenue,
    scopePct: revenue > EPS ? (scopedRevenue / revenue) * 100 : null,
    components,
    cost,
    net,
    marginPct: scopedRevenue > EPS ? (net / scopedRevenue) * 100 : null,
    productCount: costed.length,
    actualOrders,
    missing: [
      { label: "الشحن والتوصيل", why: "مافيش تكلفة شحن على التوريد — الشحن بيتسجّل كمصروف عام مش على العميل" },
      { label: "الخصومات التجارية", why: "سعر التوريد بيتسجّل صافي، فالخصم مش بند منفصل" },
      { label: "تكلفة الفحص", why: "وقت الفحص مش بيتسجّل كعملية، فمالوش أجر يتحمّل على العميل" },
    ],
  };
}

/* ── ٤) الالتزام بالتسليم ──────────────────────────────────────── */

export type ClientDelivery = {
  /** توريدات مسجّلة للعميل */
  deliveries: number;
  deliveredQty: number;
  /**
   * الأوامر اللي اتحكم عليها: خلصت وليها تسجيل مراحل.
   *
   * ونفس التعريف المستخدم في غرفة التحكم: آخر مرحلة اتسجّلت قبل ميعاد
   * الأمر ولا بعده. الأمر اللي لسه شغّال مش متأخر ولا في ميعاده — هو
   * **مستني**، وحسابه كان بيبوّظ النسبة في الاتجاهين.
   */
  judged: number;
  onTime: number;
  late: number;
  onTimePct: number | null;
  avgDelayDays: number | null;
  worst: { code: string; days: number } | null;
  /** أوامر خلصت والمتسلّم منها أقل من كميتها */
  shortOrders: { code: string; ordered: number; delivered: number; remaining: number }[];
  /** نسبة تنفيذ الكمية على الأوامر اللي ليها توريد مربوط */
  fulfillmentPct: number | null;
};

export function clientDelivery(db: Db, partyId: string): ClientDelivery {
  const dels = db.deliveries.filter((d) => d.clientId === partyId);
  const orders = db.orders.filter((o) => o.clientId === partyId);

  const rows: { code: string; days: number }[] = [];
  for (const o of orders) {
    if (o.status !== "done") continue;
    const entries = db.stageEntries.filter((e) => e.orderId === o.id);
    if (!entries.length) continue;
    const finished = entries
      .map((e) => e.date)
      .sort()
      .at(-1) as string;
    rows.push({ code: o.code, days: daysBetween(o.dueDate, finished) });
  }
  const onTime = rows.filter((r) => r.days <= 0).length;
  const lateRows = rows.filter((r) => r.days > 0);

  const shortOrders: ClientDelivery["shortOrders"] = [];
  let orderedQty = 0;
  let linkedQty = 0;
  for (const o of orders) {
    const mine = dels.filter((d) => d.orderId === o.id);
    if (!mine.length) continue;
    const delivered = mine.reduce((s, d) => s + (d.quantity ?? 0), 0);
    orderedQty += o.quantity;
    linkedQty += delivered;
    if (o.status === "done" && delivered + EPS < o.quantity) {
      shortOrders.push({ code: o.code, ordered: o.quantity, delivered, remaining: o.quantity - delivered });
    }
  }

  return {
    deliveries: dels.length,
    deliveredQty: dels.reduce((s, d) => s + (d.quantity ?? 0), 0),
    judged: rows.length,
    onTime,
    late: lateRows.length,
    onTimePct: rows.length ? (onTime / rows.length) * 100 : null,
    avgDelayDays: lateRows.length ? lateRows.reduce((s, r) => s + r.days, 0) / lateRows.length : rows.length ? 0 : null,
    worst: [...lateRows].sort((a, b) => b.days - a.days)[0] ?? null,
    shortOrders,
    fulfillmentPct: orderedQty > EPS ? (linkedQty / orderedQty) * 100 : null,
  };
}

/* ── ٥) مرتجعات العميل بتفصيلها ────────────────────────────────── */

export type Ranked = { label: string; qty: number; cases: number; cost: number };

export type ClientReturns = {
  cases: number;
  qty: number;
  cost: number;
  /** نسبة الرجوع من المتسلّم — `null` لو مافيش كميات مسجّلة */
  ratePct: number | null;
  settled: number;
  open: number;
  problems: Ranked[];
  models: Ranked[];
  sizes: Ranked[];
  colors: Ranked[];
  batches: Ranked[];
};

/**
 * الترتيب بالكمية والتكلفة مع بعض.
 *
 * ولمّا الترتيبين يختلفوا، الشاشة بتقول ده صريح: أكتر مشكلة في العدد
 * مش شرط تكون أكتر مشكلة في الفلوس — ودي نفس القاعدة في مركز الجودة،
 * مكتوبة هنا تاني عشان مايبقاش فيه تعريفين للترتيب.
 */
function rank(db: Db, rows: ReturnEntry[], label: (r: ReturnEntry) => string | null): Ranked[] {
  const map = new Map<string, Ranked>();
  for (const r of rows) {
    const key = label(r);
    if (!key) continue;
    const cur = map.get(key) ?? { label: key, qty: 0, cases: 0, cost: 0 };
    cur.qty += r.qty;
    cur.cases += 1;
    cur.cost += caseCostTotal(db, r);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty);
}

export function clientReturns(db: Db, partyId: string): ClientReturns {
  const rows = db.returns.filter((r) => r.partyId === partyId && r.status !== "cancelled");
  const delivered = db.deliveries
    .filter((d) => d.clientId === partyId)
    .reduce((s, d) => s + (d.quantity ?? 0), 0);
  const productQty = rows
    .filter((r) => r.source === "customer" && r.itemType === "product")
    .reduce((s, r) => s + r.qty, 0);

  const batchOf = (r: ReturnEntry): string | null => {
    if (!r.orderId) return null;
    // دفعات الخامة اللي نزلت في أمر القطعة الراجعة — الرابط الوحيد
    // الموجود بين المرتجع واللوط
    const ids = new Set(
      db.stockMovements
        .filter((m) => m.refType === "order" && m.refId === r.orderId && m.batchId)
        .map((m) => m.batchId as string),
    );
    const codes = [...ids]
      .map((id) => (db.batches ?? []).find((b) => b.id === id)?.code)
      .filter((c): c is string => !!c)
      .sort();
    return codes.length === 1 ? codes[0] : null;
  };

  return {
    cases: rows.length,
    qty: rows.reduce((s, r) => s + r.qty, 0),
    cost: rows.reduce((s, r) => s + caseCostTotal(db, r), 0),
    ratePct: delivered > EPS ? (productQty / delivered) * 100 : null,
    settled: rows.filter((r) => isEffective(r)).length,
    open: rows.filter((r) => r.status === "open" || r.status === "inspected").length,
    problems: rank(db, rows, (r) => (r.problem ? PROBLEM_LABEL[r.problem] : null)),
    models: rank(db, rows, (r) => (r.itemType === "product" ? (productById(db, r.itemId)?.name ?? null) : null)),
    sizes: rank(db, rows, (r) => r.size || null),
    colors: rank(db, rows, (r) => r.color || null),
    batches: rank(db, rows, batchOf),
  };
}

/* ── ٦) من الأمر للتحصيل ───────────────────────────────────────── */

export type OrderCash = {
  order: Order;
  productName: string | null;
  /** المنتَج من المراحل */
  produced: number;
  /** المتسلّم من التوريدات المربوطة بالأمر */
  delivered: number;
  remainingQty: number;
  /** قيمة التوريدات المربوطة */
  invoiced: number;
  collected: number;
  remaining: number;
  /** أقرب ميعاد سداد على توريدات الأمر لسه مفتوح */
  dueDate: string | null;
  overdueDays: number | null;
  steps: { key: string; label: string; detail: string; done: boolean }[];
};

/**
 * السلسلة دي **مش timeline بيتخزّن**. كل خطوة بتتقرا من دفترها وقت
 * العرض: المراحل من تسجيل الإنتاج، التسليم من التوريدات المربوطة
 * بالأمر، والتحصيل من توزيع FIFO الموجود في `compute.ts`.
 *
 * والتحصيل بالتحديد **مابيتقسّمش بالنسبة**: التحصيل في النظام بيتوزّع
 * على التوريدات بالأقدمية، فبناخد نفس التوزيع بدل ما نخترع توزيع
 * تاني على الأمر — تعريفين للمحصّل أسوأ من تعريف واحد ناقص.
 */
export function orderCash(db: Db, order: Order): OrderCash {
  const stages = orderStages(db, order);
  const produced = stages.length ? stages[stages.length - 1].good : 0;
  const mine = db.deliveries.filter((d) => d.orderId === order.id);
  const delivered = mine.reduce((s, d) => s + (d.quantity ?? 0), 0);
  const invoiced = mine.reduce((s, d) => s + d.amount, 0);

  const ids = new Set(mine.map((d) => d.id));
  const remains = fifoRemain(db.deliveries, db.collections).filter((d) => ids.has(d.id));
  const remaining = remains.reduce((s, d) => s + d.remaining, 0);
  const openDue = remains
    .filter((d) => d.remaining > 0.5)
    .map((d) => d.dueDate)
    .sort();
  const dueDate = openDue[0] ?? null;
  const today = cairoToday();

  const productName = order.productId ? (productById(db, order.productId)?.name ?? null) : null;

  return {
    order,
    productName,
    produced,
    delivered,
    remainingQty: Math.max(0, order.quantity - delivered),
    invoiced,
    collected: invoiced - remaining,
    remaining,
    dueDate,
    overdueDays: dueDate && dueDate < today ? daysBetween(dueDate, today) : null,
    steps: [
      {
        key: "order",
        label: "الأمر",
        detail: `${qty(order.quantity, 0)} قطعة · ${order.line || "بدون خط"}`,
        done: true,
      },
      {
        key: "production",
        label: "الإنتاج",
        detail: stages.length ? `خلص ${qty(produced, 0)} من ${qty(order.quantity, 0)}` : "مافيش مراحل مسجّلة",
        done: produced > 0,
      },
      {
        key: "delivery",
        label: "التسليم",
        detail: mine.length ? `${qty(mine.length, 0)} توريد · ${qty(delivered, 0)} قطعة` : "مافيش توريد مربوط بالأمر",
        done: mine.length > 0,
      },
      {
        key: "invoice",
        label: "الفاتورة",
        detail: invoiced > 0 ? `${qty(mine.length, 0)} فاتورة` : "مافيش قيمة مفوترة",
        done: invoiced > 0,
      },
      {
        key: "collection",
        label: "التحصيل",
        detail: invoiced > 0 ? `اتحصّل ${qty(((invoiced - remaining) / invoiced) * 100, 0)}٪` : "—",
        done: invoiced > 0 && remaining <= 0.5,
      },
    ],
  };
}

export function clientOrderCash(db: Db, partyId: string): OrderCash[] {
  return db.orders
    .filter((o) => o.clientId === partyId)
    .map((o) => orderCash(db, o))
    .sort((a, b) => b.order.dueDate.localeCompare(a.order.dueDate));
}

/* ── ٧) أسماء للتصدير ──────────────────────────────────────────── */

export function clientName(db: Db, partyId: string): string {
  return partyById(db, partyId)?.name ?? "جهة محذوفة";
}
