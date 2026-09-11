import { cairoToday, formatDate, money, moneyPlain, qty } from "@/lib/utils";
import type { ExportCol, ExportDataset, ExportRow } from "@/lib/export";
import { allAccountBalances, clientStatement, costEntryPaid, payables, receivables, workerAdvance, workerBalance } from "./compute";
import { profitRanking } from "./costing";
import { activeBom, bomLines, materialById, materialStock, operationById, orderStages, productById, stockQty, unitName } from "./manufacturing";
import { customerStats, partyById, partyCredit } from "./parties";
import { mrp, openOrders, orderLoad, schedule } from "./planning";
import { DOC_DEFS, DOC_STATUS_LABEL } from "./documents";
import type { PermModule } from "./permissions";
import { METHOD_LABEL, ORDER_STATUS_LABEL, PAY_TYPE_LABEL, ROLE_LABEL, type Db } from "./types";

/**
 * سجل البيانات القابلة للتصدير.
 *
 * القاعدة اللي المستخدم طلبها بالحرف: **مفيش جدول بلا تصدير.** والقاعدة
 * دي لو اتنفّذت بزر في كل شاشة، بتبقى وعد: أول شاشة جديدة تتكتب بدون
 * الزر، القاعدة تكسر. فبدل كده كل قائمة في النظام موصوفة **هنا**، في
 * خريطة واحدة — نفس أسلوب `nav.ts` مع القائمة الجانبية:
 *
 * - الشاشة بتطلب التصدير بالمفتاح، فبتاخد نفس الأعمدة ونفس التنسيق.
 * - **مركز التصدير** بيعرض الخريطة كلها، فأي قائمة ليها مكان واحد
 *   تتصدّر منه ولو الشاشة نفسها لسه مافيهاش الزر.
 * - وأي قائمة ناقصة من الخريطة دي **بتبان**، لأن العدد مكتوب في
 *   الصفحة. النقص مش بيختفي.
 *
 * وكل مجموعة ليها موديول صلاحية: التصدير فعل ليه خانة في المصفوفة،
 * واللي مامعاهوش تصدير الموديول ده مايشوفش المجموعة أصلًا.
 */

export type DatasetArea = "sales" | "purchasing" | "inventory" | "production" | "planning" | "workers" | "finance" | "admin";

export const AREA_LABEL: Record<DatasetArea, string> = {
  sales: "البيع والعملاء",
  purchasing: "الشراء والموردين",
  inventory: "المخزن والخامات",
  production: "الإنتاج والجودة",
  planning: "التخطيط والطاقة",
  workers: "العمال",
  finance: "الخزينة والمالية",
  admin: "الإدارة والسجلات",
};

export type DatasetDef = {
  key: string;
  title: string;
  /** جملة بتقول الجدول ده بيجاوب على أي سؤال */
  about: string;
  area: DatasetArea;
  module: PermModule;
  cols: ExportCol[];
  rows: (db: Db) => ExportRow[];
  groupBy?: string;
  /** حدود البيانات — بتتكتب في آخر الملف عشان محدش يفهمها غلط */
  notes?: string[];
  /** الشاشة اللي القائمة دي فيها */
  screen?: string;
};

const text = (key: string, label: string, width?: number): ExportCol => ({ key, label, type: "text", width });
const code = (key: string, label: string): ExportCol => ({ key, label, type: "code", width: 14 });
const cash = (key: string, label: string, total: "sum" | "avg" | undefined = "sum"): ExportCol => ({ key, label, type: "money", total });
const count = (key: string, label: string, total: "sum" | "avg" | undefined = "sum"): ExportCol => ({ key, label, type: "qty", total });
const pct = (key: string, label: string): ExportCol => ({ key, label, type: "pct" });
const day = (key: string, label: string): ExportCol => ({ key, label, type: "date" });

/* ── الخريطة ───────────────────────────────────────────────────── */

export const DATASETS: DatasetDef[] = [
  {
    key: "orders",
    title: "أوامر الإنتاج",
    about: "كل أمر: الموديل والكمية والعميل والميعاد والحالة ونسبة الإنجاز.",
    area: "production",
    module: "production",
    screen: "/orders",
    cols: [
      code("code", "رقم الأمر"),
      text("model", "الموديل", 24),
      text("client", "العميل", 20),
      text("line", "الخط"),
      count("quantity", "الكمية"),
      count("produced", "المنتج"),
      pct("progress", "الإنجاز"),
      day("dueDate", "الميعاد"),
      text("status", "الحالة"),
      cash("value", "قيمة الأمر"),
    ],
    rows: (db) =>
      db.orders.map((o) => {
        const stages = orderStages(db, o);
        return {
          id: o.id,
          code: o.code,
          model: o.model,
          client: partyById(db, o.clientId)?.name ?? "مخزون المصنع",
          line: o.line,
          quantity: o.quantity,
          produced: stages.length ? stages[stages.length - 1].good : 0,
          progress: o.progress,
          dueDate: o.dueDate,
          status: ORDER_STATUS_LABEL[o.status],
          value: o.quantity * o.piecePrice,
        };
      }),
    notes: ["«المنتج» آخر مرحلة في المسار — مش مجموع المراحل، عشان القطعة ماتتعدّش مرتين."],
  },
  {
    key: "stages",
    title: "حركات الإنتاج",
    about: "كل تسجيل مرحلة: الأمر والعملية والعامل والسليم والمعيب والمعاد.",
    area: "production",
    module: "production",
    screen: "/orders",
    groupBy: "order",
    cols: [
      day("date", "التاريخ"),
      text("order", "الأمر", 16),
      text("operation", "العملية", 18),
      text("worker", "العامل", 18),
      count("good", "سليم"),
      count("rework", "معاد"),
      count("scrap", "هالك"),
      cash("cost", "أجر المرحلة"),
    ],
    rows: (db) =>
      db.stageEntries.map((s) => ({
        id: s.id,
        date: s.date,
        order: db.orders.find((o) => o.id === s.orderId)?.code ?? "—",
        operation: operationById(db, s.operationId)?.name ?? "—",
        worker: db.workers.find((w) => w.id === s.workerId)?.name ?? "—",
        good: s.qtyGood,
        rework: s.qtyRework,
        scrap: s.qtyScrap,
        cost: (s.qtyGood + s.qtyRework) * s.rate,
      })),
  },
  {
    key: "quality",
    title: "الجودة على مستوى العملية",
    about: "نسبة الهالك والإعادة لكل عملية — فين بالظبط بيتولد العيب.",
    area: "production",
    module: "quality",
    screen: "/dashboard",
    cols: [
      text("operation", "العملية", 22),
      count("good", "سليم"),
      count("rework", "معاد"),
      count("scrap", "هالك"),
      pct("defectPct", "نسبة العيب"),
      cash("scrapCost", "تكلفة الهالك"),
    ],
    rows: (db) => {
      const map = new Map<string, { good: number; rework: number; scrap: number; cost: number }>();
      for (const s of db.stageEntries) {
        const name = operationById(db, s.operationId)?.name ?? "—";
        const cur = map.get(name) ?? { good: 0, rework: 0, scrap: 0, cost: 0 };
        cur.good += s.qtyGood;
        cur.rework += s.qtyRework;
        cur.scrap += s.qtyScrap;
        cur.cost += s.qtyScrap * s.rate;
        map.set(name, cur);
      }
      return [...map.entries()].map(([operation, v]) => {
        const all = v.good + v.rework + v.scrap;
        return {
          id: operation,
          operation,
          good: v.good,
          rework: v.rework,
          scrap: v.scrap,
          defectPct: all ? ((v.rework + v.scrap) / all) * 100 : 0,
          scrapCost: v.cost,
        };
      });
    },
    notes: ["تكلفة الهالك محسوبة بأجر العملية اللي ظهر فيها العيب بس — الخامة المستهلكة فيه مش محسوبة هنا."],
  },
  {
    key: "parties",
    title: "جهات التعامل",
    about: "العملاء والموردين والتجار في قائمة واحدة، بأدوارهم وأرصدتهم.",
    area: "sales",
    module: "parties",
    screen: "/parties",
    cols: [
      text("name", "الاسم", 26),
      text("roles", "الأدوار", 18),
      text("phone", "الهاتف", 16),
      text("city", "المدينة"),
      cash("balance", "الرصيد"),
      cash("limit", "حد الائتمان", undefined),
      count("orders", "عدد التوريدات"),
      day("last", "آخر تعامل"),
    ],
    rows: (db) =>
      db.parties.map((p) => {
        const credit = partyCredit(db, p.id);
        const stats = customerStats(db, p.id);
        return {
          id: p.id,
          name: p.name,
          roles: p.roles.map((r) => (r === "customer" ? "عميل" : r === "supplier" ? "مورد" : "تاجر")).join(" · "),
          phone: p.phone,
          city: p.city ?? "",
          balance: stats.balance,
          limit: credit.hasLimit ? credit.limit : null,
          orders: stats.orders,
          last: stats.lastDate ?? "",
        };
      }),
    notes: ["الرصيد موجب معناه العميل عليه فلوس للمصنع."],
  },
  {
    key: "deliveries",
    title: "التوريدات",
    about: "كل توريدة: العميل والموديل والكمية والقيمة والاستحقاق.",
    area: "sales",
    module: "sales",
    screen: "/collections",
    cols: [
      day("date", "التاريخ"),
      text("client", "العميل", 22),
      text("model", "الموديل", 22),
      count("quantity", "الكمية"),
      cash("amount", "القيمة"),
      day("dueDate", "الاستحقاق"),
      text("notes", "ملاحظات", 24),
    ],
    rows: (db) =>
      db.deliveries.map((d) => ({
        id: d.id,
        date: d.date,
        client: partyById(db, d.clientId)?.name ?? "عميل محذوف",
        model: d.model,
        quantity: d.quantity,
        amount: d.amount,
        dueDate: d.dueDate,
        notes: d.notes,
      })),
  },
  {
    key: "collections",
    title: "التحصيلات",
    about: "الفلوس الداخلة من العملاء: المبلغ والطريقة والحساب وحالة التأكيد.",
    area: "finance",
    module: "finance",
    screen: "/collections",
    cols: [
      day("date", "التاريخ"),
      text("client", "العميل", 22),
      cash("amount", "المبلغ"),
      text("method", "الطريقة"),
      text("account", "الحساب", 18),
      text("status", "الحالة"),
      day("chequeDate", "تاريخ الشيك"),
    ],
    rows: (db) =>
      db.collections.map((c) => ({
        id: c.id,
        date: c.date,
        client: partyById(db, c.clientId)?.name ?? "عميل محذوف",
        amount: c.amount,
        method: METHOD_LABEL[c.method],
        account: db.accounts.find((a) => a.id === c.accountId)?.name ?? "—",
        status: c.status === "pending" ? "بانتظار تأكيد" : "مؤكد",
        chequeDate: c.chequeDate ?? "",
      })),
    notes: ["المبلغ بانتظار التأكيد مش داخل في رصيد الخزينة لحد ما يتأكد."],
  },
  {
    key: "receivables",
    title: "المستحق على العملاء",
    about: "كل توريدة لسه فيها باقي، مرتّبة بالاستحقاق — ده اللي بيتحصّل.",
    area: "finance",
    module: "finance",
    screen: "/collections",
    cols: [
      text("client", "العميل", 22),
      text("phone", "الهاتف", 16),
      text("model", "الموديل", 20),
      cash("remaining", "الباقي"),
      day("dueDate", "الاستحقاق"),
      count("lateDays", "أيام التأخير"),
      text("bucket", "الفئة"),
    ],
    rows: (db) => {
      const r = receivables(db);
      const today = cairoToday();
      const days = (d: string) => Math.max(0, Math.round((Date.parse(today) - Date.parse(d)) / 86400000));
      const pack = (rows: typeof r.overdue, bucket: string) =>
        rows.map((x) => ({
          id: x.deliveryId,
          client: x.clientName,
          phone: x.phone,
          model: x.model,
          remaining: x.remaining,
          dueDate: x.dueDate,
          lateDays: bucket === "متأخر" ? days(x.dueDate) : 0,
          bucket,
        }));
      return [
        ...pack(r.overdue, "متأخر"),
        ...pack(r.today, "النهارده"),
        ...pack(r.week, "خلال أسبوع"),
        ...pack(r.later, "بعدين"),
      ];
    },
    groupBy: "bucket",
  },
  {
    key: "statements",
    title: "كشوف حساب العملاء",
    about: "حركة كل عميل سطر بسطر: مدين ودائن ورصيد متحرك.",
    area: "finance",
    module: "finance",
    screen: "/parties",
    groupBy: "client",
    cols: [
      text("client", "العميل", 22),
      day("date", "التاريخ"),
      text("kind", "الحركة"),
      text("detail", "التفصيل", 24),
      cash("debit", "مدين"),
      cash("credit", "دائن"),
      cash("balance", "الرصيد", undefined),
    ],
    rows: (db) =>
      db.parties
        .filter((p) => p.roles.includes("customer"))
        .flatMap((p) =>
          clientStatement(db, p.id).map((l, i) => ({
            id: `${p.id}-${i}`,
            client: p.name,
            date: l.date,
            kind: l.kind === "delivery" ? "توريد" : "تحصيل",
            detail: l.label,
            debit: l.debit,
            credit: l.credit,
            balance: l.balance,
          })),
        ),
    notes: ["الرصيد المتحرك محسوب بترتيب التاريخ جوه كل عميل — فمجموع عمود الرصيد مالوش معنى."],
  },
  {
    key: "products",
    title: "المنتجات",
    about: "كل موديل: كوده وفئته وسعره وأرصدته وحد إعادة الطلب.",
    area: "sales",
    module: "sales",
    screen: "/products",
    cols: [
      code("sku", "الكود"),
      text("name", "المنتج", 26),
      text("category", "الفئة", 16),
      text("unit", "الوحدة"),
      cash("price", "سعر البيع", undefined),
      cash("cost", "تكلفة القطعة", undefined),
      pct("margin", "الهامش"),
      count("stock", "المخزون"),
    ],
    rows: (db) => {
      const rank = profitRanking(db);
      return db.products.map((p) => {
        const row = rank.find((r) => r.product.id === p.id);
        return {
          id: p.id,
          sku: p.sku,
          name: p.name,
          category: db.categories.find((c) => c.id === p.categoryId)?.name ?? "",
          unit: unitName(db, p.unitId),
          price: p.sellPrice,
          cost: row?.cost ?? 0,
          margin: row?.marginPct ?? null,
          stock: stockQty(db, "product", p.id),
        };
      });
    },
  },
  {
    key: "costing",
    title: "تكلفة وربحية الموديلات",
    about: "التكلفة والسعر والهامش ودرجة الربحية لكل موديل — ومين يستحق التوسع.",
    area: "sales",
    module: "costing",
    screen: "/costing",
    cols: [
      text("name", "الموديل", 24),
      cash("cost", "التكلفة", undefined),
      cash("price", "السعر", undefined),
      cash("profit", "ربح القطعة", undefined),
      pct("margin", "الهامش"),
      count("produced", "المنتج"),
      cash("totalProfit", "إجمالي الربح"),
      count("score", "الدرجة", undefined),
      text("verdict", "الحكم", 18),
    ],
    rows: (db) =>
      profitRanking(db).map((r) => ({
        id: r.product.id,
        name: r.product.name,
        cost: r.cost,
        price: r.price,
        profit: r.profit,
        margin: r.marginPct,
        produced: r.producedQty,
        totalProfit: r.totalProfit,
        score: r.score,
        verdict: r.ready ? r.verdict : "بيانات ناقصة",
      })),
    notes: ["الموديل اللي مالوش قائمة مواد أو سعر بيع بيطلع «بيانات ناقصة» — درجته مش محسوبة، مش صفر."],
  },
  {
    key: "bom",
    title: "قوائم المواد",
    about: "مكوّنات كل موديل: الكمية للقطعة والهالك والتكلفة.",
    area: "sales",
    module: "sales",
    screen: "/products",
    groupBy: "product",
    cols: [
      text("product", "الموديل", 22),
      text("material", "الخامة", 22),
      text("unit", "الوحدة"),
      { key: "qtyPerUnit", label: "للقطعة", type: "num2", total: "sum" },
      pct("wastePct", "الهالك"),
      { key: "effectiveQty", label: "الفعلي", type: "num2", total: "sum" },
      cash("unitCost", "سعر الوحدة", undefined),
      cash("lineCost", "تكلفة السطر"),
    ],
    rows: (db) =>
      db.products.flatMap((p) =>
        bomLines(db, activeBom(db, p.id)?.id).map((l) => ({
          id: l.id,
          product: p.name,
          material: l.name,
          unit: l.unit,
          qtyPerUnit: l.qtyPerUnit,
          wastePct: l.wastePct,
          effectiveQty: l.effectiveQty,
          unitCost: l.unitCost,
          lineCost: l.lineCost,
        })),
      ),
  },
  {
    key: "materials",
    title: "الخامات والأرصدة",
    about: "كل خامة: رصيدها وقيمتها واستهلاكها اليومي وكام يوم تكفي.",
    area: "inventory",
    module: "inventory",
    screen: "/materials",
    cols: [
      code("sku", "الكود"),
      text("name", "الخامة", 24),
      text("unit", "الوحدة"),
      count("qty", "الرصيد"),
      cash("avgCost", "متوسط السعر", undefined),
      cash("value", "قيمة المخزون"),
      { key: "perDay", label: "استهلاك يومي", type: "num2" },
      count("daysOfCover", "أيام التغطية", undefined),
      count("reorderPoint", "حد الطلب", undefined),
      text("state", "الحالة"),
    ],
    rows: (db) =>
      materialStock(db).map((m) => ({
        id: m.id,
        sku: m.sku,
        name: m.name,
        unit: unitName(db, m.unitId),
        qty: m.qty,
        avgCost: m.avgCost,
        value: m.value,
        perDay: m.perDay,
        daysOfCover: m.daysOfCover === null ? null : Math.round(m.daysOfCover),
        reorderPoint: m.reorderPoint,
        state: m.state === "out" ? "خلصت" : m.state === "low" ? "قربت تخلص" : "كفاية",
      })),
    notes: ["أيام التغطية فاضية لما الخامة مالهاش استهلاك في آخر ٣٠ يوم — مش معناها إنها بتكفي للأبد."],
  },
  {
    key: "movements",
    title: "حركات المخزن",
    about: "كل دخول وخروج: النوع والكمية والتكلفة والمرجع.",
    area: "inventory",
    module: "inventory",
    screen: "/materials",
    cols: [
      day("date", "التاريخ"),
      text("item", "الصنف", 24),
      text("kind", "نوع الحركة"),
      count("qty", "الكمية"),
      cash("unitCost", "سعر الوحدة", undefined),
      cash("value", "القيمة"),
      text("warehouse", "المخزن", 16),
      text("notes", "ملاحظات", 20),
    ],
    rows: (db) => {
      const KIND: Record<string, string> = {
        receipt: "استلام",
        issue: "صرف",
        waste: "هالك",
        adjust: "تسوية",
        produce: "إنتاج",
        deliver: "تسليم",
        return: "مرتجع",
      };
      return db.stockMovements.map((m) => ({
        id: m.id,
        date: m.date,
        item: (m.itemType === "material" ? materialById(db, m.itemId)?.name : productById(db, m.itemId)?.name) ?? "صنف محذوف",
        kind: KIND[m.kind] ?? m.kind,
        qty: m.qty,
        unitCost: m.unitCost,
        value: m.qty * m.unitCost,
        warehouse: db.warehouses.find((w) => w.id === m.warehouseId)?.name ?? "",
        notes: m.notes,
      }));
    },
  },
  {
    key: "purchases",
    title: "بنود التكلفة والمشتريات",
    about: "كل بند اتصرف: المورد والكمية والمبلغ والمدفوع والباقي.",
    area: "purchasing",
    module: "purchasing",
    screen: "/costs",
    groupBy: "item",
    cols: [
      day("date", "التاريخ"),
      text("item", "البند", 20),
      text("vendor", "المورد", 20),
      count("quantity", "الكمية"),
      cash("amount", "المبلغ"),
      cash("paid", "المدفوع"),
      cash("due", "الباقي"),
      text("notes", "ملاحظات", 20),
    ],
    rows: (db) =>
      db.costEntries.map((e) => {
        const paid = costEntryPaid(db, e.id);
        return {
          id: e.id,
          date: e.date,
          item: db.costItems.find((i) => i.id === e.costItemId)?.name ?? "—",
          vendor: partyById(db, e.partyId)?.name ?? e.vendor,
          quantity: e.quantity,
          amount: e.amount,
          paid,
          due: e.amount - paid,
          notes: e.notes,
        };
      }),
  },
  {
    key: "payables",
    title: "المستحق للموردين",
    about: "اللي على المصنع لموردينه: البند والمبلغ الباقي.",
    area: "purchasing",
    module: "purchasing",
    screen: "/costs",
    cols: [
      text("vendor", "المورد", 22),
      text("item", "البند", 20),
      day("date", "تاريخ البند"),
      cash("amount", "المبلغ"),
      cash("paid", "المدفوع"),
      cash("due", "الباقي"),
    ],
    rows: (db) =>
      payables(db).vendor.map((v) => ({
        id: v.id,
        vendor: partyById(db, v.partyId)?.name ?? v.vendor,
        item: v.itemName,
        date: v.date,
        amount: v.amount,
        paid: v.paid,
        due: v.due,
      })),
  },
  {
    key: "workers",
    title: "العمال",
    about: "كل عامل: نظام أجره وسعره ورصيده والسلف اللي عليه.",
    area: "workers",
    module: "workers",
    screen: "/workers",
    cols: [
      text("name", "العامل", 22),
      text("payType", "نظام الأجر"),
      cash("rate", "السعر", undefined),
      text("phone", "الهاتف", 16),
      cash("earned", "المستحق"),
      cash("paid", "المدفوع"),
      cash("balance", "الرصيد"),
      cash("advance", "سلف قائمة"),
    ],
    rows: (db) =>
      db.workers.map((w) => ({
        id: w.id,
        name: w.name,
        payType: PAY_TYPE_LABEL[w.payType],
        rate: w.rate,
        phone: w.phone,
        earned: db.workerEarnings.filter((e) => e.workerId === w.id).reduce((s, e) => s + e.amount, 0),
        paid: db.workerPayments.filter((p) => p.workerId === w.id && p.kind === "pay").reduce((s, p) => s + p.amount, 0),
        balance: workerBalance(db, w.id),
        advance: workerAdvance(db, w.id),
      })),
  },
  {
    key: "earnings",
    title: "مستحقات العمال",
    about: "كل استحقاق: يومية ولا قطعة ولا مكافأة، بتاريخه ومبلغه.",
    area: "workers",
    module: "workers",
    screen: "/workers",
    groupBy: "worker",
    cols: [
      day("date", "التاريخ"),
      text("worker", "العامل", 22),
      text("kind", "النوع"),
      cash("amount", "المبلغ"),
      text("notes", "ملاحظات", 24),
    ],
    rows: (db) =>
      db.workerEarnings.map((e) => ({
        id: e.id,
        date: e.date,
        worker: db.workers.find((w) => w.id === e.workerId)?.name ?? "عامل محذوف",
        kind: e.kind === "attendance" ? "يومية" : e.kind === "piece" ? "قطعة" : "مكافأة",
        amount: e.amount,
        notes: e.notes,
      })),
  },
  {
    key: "workerPayments",
    title: "مدفوعات العمال",
    about: "الصرف والسلف والخصومات، بحسابها وتاريخها.",
    area: "workers",
    module: "workers",
    screen: "/workers",
    cols: [
      day("date", "التاريخ"),
      text("worker", "العامل", 22),
      text("kind", "النوع"),
      cash("amount", "المبلغ"),
      text("account", "الحساب", 18),
      text("notes", "ملاحظات", 20),
    ],
    rows: (db) =>
      db.workerPayments.map((p) => ({
        id: p.id,
        date: p.date,
        worker: db.workers.find((w) => w.id === p.workerId)?.name ?? "عامل محذوف",
        kind: p.kind === "pay" ? "صرف" : p.kind === "advance" ? "سلفة" : "خصم",
        amount: p.amount,
        account: db.accounts.find((a) => a.id === p.accountId)?.name ?? "—",
        notes: p.notes,
      })),
  },
  {
    key: "treasury",
    title: "أرصدة الخزينة",
    about: "كل حساب ورصيده الحالي من الحركات المؤكدة.",
    area: "finance",
    module: "finance",
    screen: "/treasury",
    cols: [text("name", "الحساب", 24), text("kind", "النوع"), cash("balance", "الرصيد")],
    rows: (db) =>
      allAccountBalances(db).map((a) => ({
        id: a.id,
        name: a.name,
        kind: METHOD_LABEL[a.kind],
        balance: a.balance,
      })),
  },
  {
    key: "manualTx",
    title: "حركات الخزينة اليدوية",
    about: "الإيداعات والمسحوبات المسجّلة بالإيد بره التحصيل والدفع.",
    area: "finance",
    module: "finance",
    screen: "/treasury",
    cols: [
      day("date", "التاريخ"),
      text("account", "الحساب", 20),
      cash("amount", "المبلغ"),
      text("notes", "البيان", 30),
    ],
    rows: (db) =>
      db.manualTx.map((t) => ({
        id: t.id,
        date: t.date,
        account: db.accounts.find((a) => a.id === t.accountId)?.name ?? "—",
        amount: t.amount,
        notes: t.notes,
      })),
    notes: ["المبلغ سالب معناه فلوس خرجت."],
  },
  {
    key: "schedule",
    title: "جدول الإنتاج",
    about: "كل أمر مفتوح: دقائقه وبدايته ونهايته المتوقعة، وهل هيلحق ميعاده.",
    area: "planning",
    module: "planning",
    screen: "/planning",
    cols: [
      code("code", "رقم الأمر"),
      text("model", "الموديل", 22),
      count("minutes", "الدقائق"),
      day("start", "البداية"),
      day("finish", "النهاية المتوقعة"),
      day("dueDate", "الميعاد"),
      count("slack", "فرق الأيام", undefined),
      text("verdict", "الحكم"),
    ],
    rows: (db) =>
      schedule(db).rows.map((r) => ({
        id: r.id,
        code: r.code,
        model: r.name,
        minutes: Math.round(r.minutes),
        start: r.start,
        finish: r.finish,
        dueDate: r.dueDate,
        slack: r.onTime ? 0 : -r.lateDays,
        verdict: r.onTime ? "في الميعاد" : `متأخر ${r.lateDays} يوم`,
      })),
    notes: ["الجدولة على أساس قرار الطاقة المحفوظ في الإعدادات — لو الطاقة اتغيّرت، الجدول كله بيتغيّر."],
  },
  {
    key: "mrp",
    title: "احتياج الخامات",
    about: "المطلوب لكل خامة للأوامر المفتوحة، والمتاح، والنقص، وميعاد الطلب.",
    area: "planning",
    module: "planning",
    screen: "/planning",
    cols: [
      text("name", "الخامة", 24),
      text("unit", "الوحدة"),
      { key: "needed", label: "المطلوب", type: "num2", total: "sum" },
      { key: "available", label: "المتاح", type: "num2", total: "sum" },
      { key: "shortage", label: "النقص", type: "num2", total: "sum" },
      cash("value", "قيمة النقص"),
      count("leadTimeDays", "مدة التوريد", undefined),
      day("orderBy", "يتطلب قبل"),
    ],
    rows: (db) =>
      mrp(db).rows.map((r) => ({
        id: r.materialId,
        name: r.name,
        unit: r.unit,
        needed: r.required,
        available: r.free,
        shortage: r.shortage,
        value: r.cost,
        leadTimeDays: r.leadTimeDays,
        orderBy: r.neededBy ?? "",
      })),
  },
  {
    key: "load",
    title: "حِمل الأوامر على الطاقة",
    about: "كل أمر مفتوح ونسبة ما ياخده من طاقة المصنع.",
    area: "planning",
    module: "planning",
    screen: "/planning",
    cols: [
      code("code", "رقم الأمر"),
      text("model", "الموديل", 22),
      count("remainingQty", "الباقي"),
      count("minutes", "دقائق داخلية"),
      count("outsourced", "دقائق خارجية"),
      text("basis", "أساس الحساب", 24),
    ],
    rows: (db) =>
      openOrders(db).map((o) => {
        const load = orderLoad(db, o);
        return {
          id: o.id,
          code: o.code,
          model: o.model,
          remainingQty: load.remainingPieces,
          minutes: Math.round(load.minutes),
          outsourced: Math.round(load.outsourcedMinutes),
          basis: load.plannable ? "مسار العمليات" : (load.reason ?? "بره الجدولة"),
        };
      }),
    notes: [
      "الدقائق الخارجية مش بتاخد من طاقة المصنع، فهي مكتوبة في عمود لوحدها.",
      "الأمر اللي بره الجدولة مكتوب سببه في «أساس الحساب» بدل ما يطلع بصفر.",
    ],
  },
  {
    key: "documents",
    title: "دفتر المستندات",
    about: "كل مستند اتصدر: نوعه ورقمه وحالته ومين أصدره.",
    area: "admin",
    module: "reports",
    screen: "/documents",
    groupBy: "type",
    cols: [
      code("number", "الرقم"),
      text("type", "النوع", 18),
      day("date", "التاريخ"),
      cash("amount", "المبلغ"),
      text("status", "الحالة"),
      count("revision", "المراجعة", undefined),
      text("createdBy", "أصدره", 18),
      text("reason", "سبب الإلغاء", 24),
    ],
    rows: (db) =>
      db.documents.map((d) => ({
        id: d.id,
        number: d.number,
        type: DOC_DEFS[d.type].label,
        date: d.date,
        amount: d.amount,
        status: DOC_STATUS_LABEL[d.status],
        revision: d.revision,
        createdBy: db.members.find((m) => m.id === d.createdBy)?.name ?? "—",
        reason: d.cancelReason ?? "",
      })),
  },
  {
    key: "members",
    title: "فريق المصنع",
    about: "مين معاه حساب وبأي دور.",
    area: "admin",
    module: "staff",
    screen: "/staff",
    cols: [text("name", "الاسم", 22), text("email", "البريد", 26), text("role", "الدور", 16)],
    rows: (db) =>
      db.members.map((m) => ({ id: m.id, name: m.name, email: m.email, role: ROLE_LABEL[m.role] })),
  },
  {
    key: "audit",
    title: "سجل التعديلات",
    about: "مين عمل إيه وإمتى — السجل ده مابيتمسحش.",
    area: "admin",
    module: "audit",
    screen: "/staff",
    cols: [
      text("at", "الوقت", 20),
      text("actor", "الموظف", 20),
      text("action", "الفعل"),
      text("table", "الجدول", 18),
      code("recordId", "السجل"),
    ],
    rows: (db) => {
      const ACTION: Record<string, string> = { create: "إضافة", update: "تعديل", delete: "مسح", restore: "استرجاع" };
      return db.auditLog.map((a) => ({
        id: a.id,
        at: new Date(a.at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" }),
        actor: a.actorName,
        action: ACTION[a.action] ?? a.action,
        table: a.table,
        recordId: a.recordId.slice(0, 8),
      }));
    },
  },
];

export const DATASET_MAP: Record<string, DatasetDef> = Object.fromEntries(DATASETS.map((d) => [d.key, d]));

/* ── البناء ────────────────────────────────────────────────────── */

export type DatasetOptions = {
  /** الفلاتر اللي الشاشة شغّالة بيها — بتتكتب في الملف نفسه */
  filters?: { label: string; value: string }[];
  /** الصفوف الظاهرة بس: التصدير بيطلع اللي المستخدم شايفه */
  ids?: Set<string>;
  subtitle?: string;
  /** أرقام مختصرة زيادة على المجاميع */
  summary?: { label: string; value: string }[];
};

export function datasetOf(db: Db, key: string, opts: DatasetOptions = {}): ExportDataset {
  const def = DATASET_MAP[key];
  if (!def) throw new Error(`مفيش بيانات مسجّلة بالمفتاح ${key}`);

  const all = def.rows(db);
  const rows = opts.ids ? all.filter((r) => opts.ids!.has(String(r.id))) : all;
  const filters = [...(opts.filters ?? [])];
  if (opts.ids && rows.length !== all.length) {
    filters.push({ label: "الصفوف", value: `${qty(rows.length, 0)} من ${qty(all.length, 0)}` });
  }

  return {
    key: def.key,
    title: def.title,
    subtitle: opts.subtitle ?? def.about,
    cols: def.cols,
    rows,
    filters,
    groupBy: def.groupBy,
    summary: opts.summary,
    notes: def.notes,
  };
}

/** عدد الصفوف بدون بناء الجدول كله مرتين — لمركز التصدير */
export function datasetCount(db: Db, key: string): number {
  return DATASET_MAP[key]?.rows(db).length ?? 0;
}

/** ملخص فترة جاهز للاستخدام في الفلاتر */
export function rangeFilter(from: string, to: string): { label: string; value: string } {
  return { label: "الفترة", value: `${formatDate(from)} — ${formatDate(to)}` };
}

export function moneySummary(label: string, value: number): { label: string; value: string } {
  return { label, value: money(value) };
}

export function countSummary(label: string, value: number): { label: string; value: string } {
  return { label, value: moneyPlain(value) };
}
