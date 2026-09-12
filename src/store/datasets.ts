import { cairoToday, formatDate, money, moneyPlain, qty } from "@/lib/utils";
import type { ExportCol, ExportDataset, ExportRow } from "@/lib/export";
import { allAccountBalances, caseCostTotal, clientStatement, costEntryPaid, payables, receivables, repairCostOf, workerAdvance, workerBalance } from "./compute";
import { profitRanking } from "./costing";
import { LAY_STATUS_LABEL, layMath } from "./cutting";
import { bundleState, defectPareto, opMinutes, wip as wipRows, workerEfficiency } from "./floor";
import { SUB_STATUS_LABEL, subViews } from "./outsourcing";
import { describe } from "./codes";
import { itemName, partyName, returnImpact, unitCostOf } from "./returns";
import { activeBom, bomLines, materialById, materialStock, operationById, orderStages, productById, stockQty, unitName } from "./manufacturing";
import { customerStats, partiesWithRole, partyById, partyCredit } from "./parties";
import { clientOrderCash, clientProducts } from "./clients";
import { mrp, openOrders, orderLoad, schedule } from "./planning";
import { DOC_DEFS, DOC_STATUS_LABEL } from "./documents";
import { availability, batchList, supplyList } from "./supply";
import type { PermModule } from "./permissions";
import {
  BATCH_STATUS_LABEL,
  SUPPLY_STATUS_LABEL,
  COMPLAINT_KIND_LABEL,
  COMPLAINT_STATUS_LABEL,
  KIND_LABEL,
  METHOD_LABEL,
  ORDER_STATUS_LABEL,
  PAY_TYPE_LABEL,
  PROBLEM_LABEL,
  PROBLEM_ORIGIN_LABEL,
  REPAIR_STATUS_LABEL,
  RETURN_CONDITION_LABEL,
  RETURN_REASON_DEFS,
  RETURN_RESOLUTION_LABEL,
  RETURN_SOURCE_LABEL,
  RETURN_STATUS_LABEL,
  ROLE_LABEL,
  ROOT_CAUSE_LABEL,
  SCAN_ACTION_LABEL,
  STOCK_KIND_LABEL,
  type Db,
} from "./types";

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
/**
 * `"none"` مش `undefined`.
 *
 * الفرق ده مش شكلي: القيمة الافتراضية في JavaScript بتشتغل كمان لما
 * تبعت `undefined` صراحة، فـ`cash("price", "السعر", "none")` كان
 * بيرجع «اجمع» بدل «ماتجمعش» — يعني عمود سعر البيع كان بيطلع تحته
 * مجموع أسعار كل الموديلات، وده رقم مالوش أي معنى.
 */
type Total = "sum" | "avg" | "none";
const totalOf = (t: Total) => (t === "none" ? undefined : t);
const cash = (key: string, label: string, total: Total = "sum"): ExportCol => ({ key, label, type: "money", total: totalOf(total) });
const count = (key: string, label: string, total: Total = "sum"): ExportCol => ({ key, label, type: "qty", total: totalOf(total) });
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
    key: "lays",
    title: "فرشات القص",
    about: "كل فرشة: الطبقات والماركر والقماش اللي خرج والقطع اللي طلعت ونسبة الاستغلال.",
    area: "production",
    module: "production",
    screen: "/cutting",
    cols: [
      day("date", "التاريخ"),
      text("order", "الأمر", 16),
      text("material", "القماش", 22),
      text("color", "اللون", 14),
      count("plies", "الطبقات"),
      { key: "markerLengthM", label: "طول الماركر", type: "num2" },
      count("pieces", "القطع"),
      { key: "fabricM", label: "القماش", type: "num2", total: "sum" },
      { key: "perPieceM", label: "متر للقطعة", type: "num2" },
      { key: "standardM", label: "المعياري", type: "num2" },
      pct("utilizationPct", "الاستغلال"),
      pct("wastePct", "فوق المعياري"),
      cash("cost", "تكلفة القماش"),
      text("status", "الحالة"),
    ],
    rows: (db) =>
      (db.cutLays ?? []).map((lay) => {
        const m = layMath(db, lay);
        return {
          id: lay.id,
          date: lay.date,
          order: m.order?.code ?? "—",
          material: m.materialName,
          color: lay.color,
          plies: lay.plies,
          markerLengthM: lay.markerLengthM,
          pieces: m.pieces,
          fabricM: m.actualM ?? m.plannedM,
          perPieceM: m.perPieceM,
          standardM: m.standardM,
          utilizationPct: m.utilizationPct,
          wastePct: m.wastePct,
          cost: m.cost,
          status: LAY_STATUS_LABEL[lay.status],
        };
      }),
    notes: [
      "القماش للفرشة المخططة رقم متوقع — بيتثبّت على المستهلك الفعلي ساعة القص.",
      "الاستغلال بيتقارن بالكمية الصافية في قائمة الخامات، من غير نسبة الهالك المتوقعة. الفرشة اللي مالهاش معياري بتطلع فاضية مش صفر.",
    ],
  },
  {
    key: "bundles",
    title: "الباندلات",
    about: "كل ربطة: مقاسها ولونها وكميتها ووصلت لفين في المسار.",
    area: "production",
    module: "production",
    screen: "/cutting",
    groupBy: "order",
    cols: [
      code("code", "رقم الباندل"),
      text("order", "الأمر", 16),
      text("size", "المقاس"),
      text("color", "اللون", 14),
      count("qty", "الكمية"),
      text("state", "الحالة", 24),
      count("doneSteps", "عمليات خلصت", "none"),
      count("totalSteps", "إجمالي العمليات", "none"),
      count("rework", "معاد"),
      count("scrap", "هالك"),
      day("createdAt", "اتقص يوم"),
    ],
    rows: (db) =>
      (db.bundles ?? []).map((b) => {
        const st = bundleState(db, b);
        return {
          id: b.id,
          code: b.code,
          order: st.orderCode,
          size: b.size,
          color: b.color,
          qty: b.qty,
          state: st.label,
          doneSteps: st.doneSteps,
          totalSteps: st.totalSteps,
          rework: st.rework,
          scrap: st.scrap,
          createdAt: b.createdAt.slice(0, 10),
        };
      }),
    notes: ["القص مابيتسجّلش على الباندل لوحده — الفرشة هي اللي بتسجّله، فعمليات القص بتتحسب خالصة على كل باندل طالع منها."],
  },
  {
    key: "bundleOps",
    title: "تسجيلات العمليات",
    about: "كل عملية على باندل: مين شغّلها وامتى وقعدت قد إيه وطلّعت كام.",
    area: "production",
    module: "production",
    screen: "/production",
    groupBy: "operation",
    cols: [
      text("bundle", "الباندل", 16),
      text("order", "الأمر", 14),
      text("operation", "العملية", 18),
      text("worker", "العامل", 18),
      day("date", "التاريخ"),
      count("good", "سليم"),
      count("rework", "معاد"),
      count("scrap", "هالك"),
      { key: "minutes", label: "دقايق شغل", type: "num2", total: "sum" },
      { key: "paused", label: "دقايق توقف", type: "num2", total: "sum" },
      { key: "stdMinutes", label: "معياري للقطعة", type: "num2" },
      pct("efficiencyPct", "الكفاءة"),
      text("defect", "سبب العيب", 20),
      text("state", "الحالة"),
    ],
    rows: (db) => {
      const STATE = { running: "شغّالة", paused: "واقفة", done: "خلصت" };
      return (db.bundleOps ?? []).map((op) => {
        const minutes = opMinutes(op);
        const earned = op.state === "done" ? op.stdMinutes * (op.qtyGood + op.qtyRework) : 0;
        return {
          id: op.id,
          bundle: (db.bundles ?? []).find((b) => b.id === op.bundleId)?.code ?? "—",
          order: db.orders.find((o) => o.id === op.orderId)?.code ?? "—",
          operation: operationById(db, op.operationId)?.name ?? "—",
          worker: db.workers.find((w) => w.id === op.workerId)?.name ?? "—",
          date: (op.endedAt ?? op.startedAt).slice(0, 10),
          good: op.qtyGood,
          rework: op.qtyRework,
          scrap: op.qtyScrap,
          minutes,
          paused: op.pausedMinutes,
          stdMinutes: op.stdMinutes,
          efficiencyPct: op.state === "done" && op.stdMinutes > 0 && minutes > 0 ? (earned / minutes) * 100 : null,
          defect: op.defect,
          state: STATE[op.state],
        };
      });
    },
    notes: [
      "الدقايق محسوبة من الساعة بعد خصم التوقف، مش مكتوبة بالإيد.",
      "العملية اللي مالهاش زمن معياري بتطلع بكفاءة فاضية — مش صفر ومش مئة.",
    ],
  },
  {
    key: "wip",
    title: "الشغل الجاري بين العمليات",
    about: "كل عملية: كام باندل مستنيها وكام شغّال فيها وكام خلص النهارده.",
    area: "production",
    module: "production",
    screen: "/production",
    cols: [
      count("seq", "الترتيب", "none"),
      text("name", "العملية", 22),
      count("waiting", "باندل مستني"),
      count("waitingPieces", "قطع مستنية"),
      count("running", "شغّال"),
      count("runningPieces", "قطع شغّالة"),
      count("paused", "واقف"),
      count("doneToday", "خلص النهارده"),
    ],
    rows: (db) =>
      wipRows(db).map((r) => ({
        id: r.operationId,
        seq: r.seq,
        name: r.name,
        waiting: r.waiting,
        waitingPieces: r.waitingPieces,
        running: r.running,
        runningPieces: r.runningPieces,
        paused: r.paused,
        doneToday: r.doneToday,
      })),
    notes: ["العملية اللي عندها أكبر عدد قطع مستنية هي عنق الزجاجة دلوقتي."],
  },
  {
    key: "efficiency",
    title: "كفاءة العمال",
    about: "لكل عامل: القطع والدقايق المعيارية مقابل الفعلية ونسبة العيب.",
    area: "workers",
    module: "workers",
    screen: "/production",
    cols: [
      text("name", "العامل", 22),
      count("ops", "عمليات"),
      count("pieces", "قطع"),
      { key: "earnedMinutes", label: "دقايق معيارية", type: "num2", total: "sum" },
      { key: "workedMinutes", label: "دقايق فعلية", type: "num2", total: "sum" },
      { key: "pausedMinutes", label: "دقايق توقف", type: "num2", total: "sum" },
      pct("efficiencyPct", "الكفاءة"),
      count("rework", "معاد"),
      count("scrap", "هالك"),
      pct("defectPct", "نسبة العيب"),
    ],
    rows: (db) =>
      workerEfficiency(db, 30).map((r) => ({
        id: r.id,
        name: r.name,
        ops: r.ops,
        pieces: r.pieces,
        earnedMinutes: r.earnedMinutes,
        workedMinutes: r.workedMinutes,
        pausedMinutes: r.pausedMinutes,
        efficiencyPct: r.efficiencyPct,
        rework: r.rework,
        scrap: r.scrap,
        defectPct: r.defectPct,
      })),
    notes: ["آخر ٣٠ يوم، ومن الشغل المتتبّع بالباندل بس — التسجيل اليدوي للمراحل مالهوش وقت يتقاس بيه."],
  },
  {
    key: "defects",
    title: "أسباب العيب — باريتو",
    about: "الأسباب مرتبة بالكمية ومعاها النسبة المتراكمة، عشان تبان الشوية اللي بيعملوا أغلب العيب.",
    area: "production",
    module: "quality",
    screen: "/production",
    cols: [
      text("reason", "السبب", 24),
      text("operationName", "أول عملية ظهر فيها", 20),
      count("qty", "القطع"),
      pct("pct", "النسبة"),
      pct("cumulativePct", "المتراكم"),
    ],
    rows: (db) =>
      defectPareto(db, 30).map((r) => ({
        id: r.reason,
        reason: r.reason,
        operationName: r.operationName,
        qty: r.qty,
        pct: r.pct,
        cumulativePct: r.cumulativePct,
      })),
    notes: ["اللي اتسجّل بكمية معيبة بلا سبب مكتوب بيطلع باسم «بدون سبب مكتوب» بدل ما يتوزّع بالتخمين."],
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
      cash("limit", "حد الائتمان", "none"),
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
      cash("balance", "الرصيد", "none"),
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
      cash("price", "سعر البيع", "none"),
      cash("cost", "تكلفة القطعة", "none"),
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
      cash("cost", "التكلفة", "none"),
      cash("price", "السعر", "none"),
      cash("profit", "ربح القطعة", "none"),
      pct("margin", "الهامش"),
      count("produced", "المنتج"),
      cash("totalProfit", "إجمالي الربح"),
      count("score", "الدرجة", "none"),
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
      cash("unitCost", "سعر الوحدة", "none"),
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
      cash("avgCost", "متوسط السعر", "none"),
      cash("value", "قيمة المخزون"),
      { key: "perDay", label: "استهلاك يومي", type: "num2" },
      count("daysOfCover", "أيام التغطية", "none"),
      count("reorderPoint", "حد الطلب", "none"),
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
      cash("unitCost", "سعر الوحدة", "none"),
      cash("value", "القيمة"),
      text("warehouse", "المخزن", 16),
      text("notes", "ملاحظات", 20),
    ],
    rows: (db) =>
      db.stockMovements.map((m) => ({
        id: m.id,
        date: m.date,
        item: (m.itemType === "material" ? materialById(db, m.itemId)?.name : productById(db, m.itemId)?.name) ?? "صنف محذوف",
        kind: STOCK_KIND_LABEL[m.kind],
        qty: m.qty,
        unitCost: m.unitCost,
        value: m.qty * m.unitCost,
        warehouse: db.warehouses.find((w) => w.id === m.warehouseId)?.name ?? "",
        notes: m.notes,
      })),
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
    key: "subcontracts",
    title: "أعمال التشغيل الخارجي",
    about: "كل إذن طلع لورشة: الكمية والأجر والميعاد والراجع فعلًا والمستحق.",
    area: "purchasing",
    module: "purchasing",
    screen: "/outsourcing",
    cols: [
      code("code", "رقم الإذن"),
      text("workshop", "الورشة", 22),
      text("order", "الأمر", 14),
      text("operation", "العملية", 16),
      day("date", "تاريخ الخروج"),
      day("expectedDate", "الميعاد"),
      count("qtySent", "طلعت"),
      count("received", "رجعت سليمة"),
      count("rework", "رجعت للإعادة"),
      count("lost", "فاقد"),
      count("outstanding", "لسه برّه"),
      pct("lossPct", "نسبة الفاقد"),
      cash("rate", "أجر القطعة", "none"),
      cash("charge", "المستحق"),
      cash("paid", "المدفوع"),
      cash("due", "الباقي"),
      count("lateDays", "أيام التأخير", "none"),
      text("status", "الحالة"),
    ],
    rows: (db) =>
      subViews(db).map((v) => ({
        id: v.sub.id,
        code: v.sub.code,
        workshop: v.partyName,
        order: v.orderCode ?? "—",
        operation: v.operationName ?? "—",
        date: v.sub.date,
        expectedDate: v.sub.expectedDate,
        qtySent: v.sub.qtySent,
        received: v.received,
        rework: v.rework,
        lost: v.lost,
        outstanding: v.outstanding,
        lossPct: v.lossPct,
        rate: v.sub.rate,
        charge: v.charge,
        paid: v.paid,
        due: v.due,
        lateDays: v.lateDays,
        status: SUB_STATUS_LABEL[v.sub.status],
      })),
    notes: ["المستحق محسوب على الراجع فعلًا (سليم + إعادة)، مش على الكمية اللي طلعت — الفاقد مابيتدفعش عليه."],
  },
  {
    key: "subReceipts",
    title: "استلامات من الورش",
    about: "كل استلامة رجعت من ورشة: السليم والإعادة والفاقد وقيمتها.",
    area: "purchasing",
    module: "purchasing",
    screen: "/outsourcing",
    groupBy: "workshop",
    cols: [
      day("date", "التاريخ"),
      text("workshop", "الورشة", 22),
      code("sub", "الإذن"),
      count("good", "سليم"),
      count("rework", "إعادة"),
      count("lost", "فاقد"),
      cash("amount", "المستحق عنها"),
      text("notes", "ملاحظات", 22),
    ],
    rows: (db) =>
      (db.subReceipts ?? []).map((r) => {
        const sub = (db.subcontracts ?? []).find((s) => s.id === r.subcontractId);
        return {
          id: r.id,
          date: r.date,
          workshop: db.parties.find((p) => p.id === sub?.partyId)?.name ?? "—",
          sub: sub?.code ?? "—",
          good: r.qtyGood,
          rework: r.qtyRework,
          lost: r.qtyLost,
          amount: (r.qtyGood + r.qtyRework) * (sub?.rate ?? 0),
          notes: r.notes,
        };
      }),
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
      cash("rate", "السعر", "none"),
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
      count("slack", "فرق الأيام", "none"),
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
      count("leadTimeDays", "مدة التوريد", "none"),
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
      count("revision", "المراجعة", "none"),
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
    key: "scans",
    title: "سجل المسح",
    about: "كل كود اتمسح: مين مسحه وإمتى وإزاي جه الكود وإيه اللي اتعمل.",
    area: "admin",
    module: "audit",
    screen: "/scan",
    groupBy: "kind",
    cols: [
      text("at", "الوقت", 20),
      text("actor", "اللي مسح", 18),
      text("kind", "النوع", 16),
      code("code", "الكود"),
      text("item", "السجل", 22),
      text("action", "الإجراء", 16),
      text("source", "إزاي"),
      /*
        مجموع الكميات هنا **مالوش معنى**: نفس الـ٢٠ قطعة بتتمسح على
        الخياطة وبعدها على المكوى وبعدها على التعبئة، فالجمع بيعدّها
        تلات مرات. الرقم اللي له معنى هو كمية المسح الواحد.
      */
      count("qty", "الكمية", "none"),
      text("from", "من", 16),
      text("to", "لحد", 16),
      text("note", "ملاحظة", 24),
    ],
    rows: (db) => {
      const SOURCE = { camera: "كاميرا", manual: "مكتوب بالإيد", link: "رابط" };
      return (db.scans ?? []).map((s) => ({
        id: s.id,
        at: new Date(s.at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" }),
        actor: s.actorName,
        kind: KIND_LABEL[s.kind],
        code: s.code,
        item: describe(db, s.kind, s.refId)?.label ?? "—",
        action: SCAN_ACTION_LABEL[s.action],
        source: SOURCE[s.source],
        qty: s.qty,
        from: s.from,
        to: s.to,
        note: s.note,
      }));
    },
    notes: [
      "«إزاي» بتقول الكود جه من الكاميرا ولا اتكتب بالإيد — موديل الجهاز والموقع مش متسجّلين.",
      "الكميات مش مجموعة: نفس القطع بتتمسح على كل عملية، فالجمع كان بيعدّها أكتر من مرة.",
      "السجل اللي الكود شاور عليه ممكن يكون اتغيّر بعد المسح؛ الكود المحفوظ هو اللي اتقرا وقتها.",
    ],
  },
  {
    key: "returns",
    title: "المرتجعات",
    about: "رجع إيه ومن مين وليه، وإيه القرار، وأثره على الربح.",
    area: "sales",
    module: "sales",
    screen: "/returns",
    groupBy: "source",
    cols: [
      code("code", "رقم المرتجع"),
      text("source", "رجع من", 14),
      day("date", "التاريخ"),
      text("party", "الجهة", 22),
      text("item", "الصنف", 22),
      count("qty", "الكمية"),
      text("condition", "الحالة"),
      text("reason", "السبب", 16),
      text("reasonNote", "تفاصيل السبب", 26),
      text("problem", "المشكلة", 18),
      text("origin", "مصدرها", 14),
      text("rootCause", "الجذر", 16),
      text("line", "الخط", 14),
      text("worker", "العامل", 18),
      text("status", "الموقف"),
      text("resolution", "القرار", 16),
      cash("unitValue", "قيمة الوحدة", "none"),
      cash("settleAmount", "المبلغ المتسوّى"),
      cash("caseCost", "مصاريف الحالة"),
      cash("impact", "أثره على الربح"),
      text("delivery", "التوريد", 18),
      text("order", "الأمر", 14),
    ],
    rows: (db) =>
      db.returns.map((r) => {
        const del = r.deliveryId ? db.deliveries.find((d) => d.id === r.deliveryId) : null;
        return {
          id: r.id,
          code: r.code,
          source: RETURN_SOURCE_LABEL[r.source],
          date: r.date,
          party: partyName(db, r),
          item: itemName(db, r),
          qty: r.qty,
          condition: RETURN_CONDITION_LABEL[r.condition],
          reason: RETURN_REASON_DEFS[r.reason].label,
          reasonNote: r.reasonNote,
          problem: r.problem ? PROBLEM_LABEL[r.problem] : "",
          origin: r.origin ? PROBLEM_ORIGIN_LABEL[r.origin] : "",
          rootCause: r.rootCause ? ROOT_CAUSE_LABEL[r.rootCause] : "",
          line: r.line || (r.orderId ? db.orders.find((o) => o.id === r.orderId)?.line ?? "" : ""),
          worker: r.workerId ? db.workers.find((w) => w.id === r.workerId)?.name ?? "" : "",
          status: RETURN_STATUS_LABEL[r.status],
          resolution: r.resolution ? RETURN_RESOLUTION_LABEL[r.resolution] : "لسه",
          unitValue: r.unitValue,
          settleAmount: r.settleAmount,
          caseCost: caseCostTotal(db, r),
          impact: returnImpact(db, r).total,
          delivery: del ? `${del.model} ${formatDate(del.date)}` : "",
          order: r.orderId ? db.orders.find((o) => o.id === r.orderId)?.code ?? "" : "",
        };
      }),
    notes: [
      "«أثره على الربح» بيتحسب بعد القرار بس — المرتجع اللي لسه مستني فحص أثره صفر مش مجهول.",
      "مرتجع العميل السليم اللي رجع المخزن أثره الهامش بس، لأن تكلفة القطعة اترجعت. والتالف أثره الفاتورة كلها.",
      "«قيمة الوحدة» مش مجموعة: هي سعر القطعة وقت المرتجع، ومجموع الأسعار مالوش معنى.",
      "«المشكلة» و«مصدرها» و«الجذر» بيتكتبوا وقت الفحص. الحالة اللي لسه مافُحصتش بتبان فاضية، مش «مش معروف».",
    ],
  },
  {
    key: "repairs",
    title: "أوامر الإصلاح",
    about: "القطع اللي اتصلحت: مين صلّحها، قعدت قد إيه، كلّفت كام، وعدّت الفحص ولا لأ.",
    area: "production",
    module: "quality",
    screen: "/repairs",
    groupBy: "status",
    cols: [
      code("code", "رقم الأمر"),
      code("returnCode", "الحالة"),
      day("date", "التاريخ"),
      text("item", "الصنف", 22),
      count("qty", "الكمية"),
      text("problem", "المشكلة", 18),
      text("worker", "العامل", 18),
      text("status", "الموقف", 14),
      count("minutes", "دقايق الإصلاح"),
      cash("labor", "أجر الإصلاح"),
      cash("materials", "خامات الإصلاح"),
      cash("total", "إجمالي التكلفة"),
      cash("perPiece", "تكلفة القطعة", "none"),
      cash("makeCost", "تكلفة إنتاجها", "none"),
      count("qtyPassed", "عدّت الفحص"),
      count("qtyFailed", "سقطت"),
    ],
    rows: (db) =>
      (db.repairs ?? []).map((rep) => {
        const parent = db.returns.find((r) => r.id === rep.returnId);
        const c = repairCostOf(rep);
        return {
          id: rep.id,
          code: rep.code,
          returnCode: parent?.code ?? "",
          date: rep.date,
          item: parent ? itemName(db, parent) : "",
          qty: rep.qty,
          problem: rep.problem ? PROBLEM_LABEL[rep.problem] : "",
          worker: rep.workerId ? db.workers.find((w) => w.id === rep.workerId)?.name ?? "" : "",
          status: REPAIR_STATUS_LABEL[rep.status],
          minutes: rep.minutes,
          labor: c.labor,
          materials: c.materials,
          total: c.total,
          perPiece: c.perPiece,
          makeCost: parent ? unitCostOf(db, parent) : 0,
          qtyPassed: rep.qtyPassed,
          qtyFailed: rep.qtyFailed,
        };
      }),
    notes: [
      "«تكلفة القطعة» مش مجموعة، وهي الرقم اللي بيتقارن بـ«تكلفة إنتاجها»: لو الإصلاح قرّب من الإنتاج، الإهلاك أرخص.",
      "الدقايق بتتحسب من وقت البدء والإقفال، مش بتتكتب بالإيد.",
      "خامات الإصلاح بتطلع من المخزن بحركة صرف حقيقية وقت فتح الأمر.",
    ],
  },
  {
    key: "supply",
    title: "أوامر التوريد",
    about: "طلبنا كام ووصل كام ودخل المخزن كام — والفرق بينهم بقيمته، مع الالتزام بالميعاد.",
    area: "purchasing",
    module: "purchasing",
    screen: "/supply",
    groupBy: "status",
    cols: [
      code("code", "رقم الأمر"),
      text("supplier", "المورّد", 22),
      day("date", "تاريخ الأمر"),
      day("expected", "الميعاد المتفق"),
      day("lastReceipt", "آخر استلام"),
      count("lateDays", "أيام التأخير", "none"),
      text("item", "الصنف", 22),
      count("ordered", "المطلوب"),
      count("received", "الواصل"),
      count("accepted", "المقبول"),
      count("rejected", "المرفوض"),
      count("damaged", "التالف"),
      count("missing", "ناقص في ورقة المورّد"),
      count("remaining", "الباقي أو العجز"),
      cash("orderedValue", "قيمة الاتفاق"),
      cash("lossValue", "قيمة الخسارة"),
      text("status", "الموقف", 18),
    ],
    rows: (db) =>
      supplyList(db).flatMap((v) =>
        v.lines.map((l) => ({
          id: l.line.id,
          code: v.order.code,
          supplier: v.partyName,
          date: v.order.date,
          expected: v.order.expectedDate,
          lastReceipt: v.lastReceiptDate ?? "",
          lateDays: v.lateDays ?? 0,
          item: l.name,
          ordered: l.ordered,
          received: l.received,
          accepted: l.accepted,
          rejected: l.rejected,
          damaged: l.damaged,
          missing: l.missingDoc,
          remaining: l.remaining,
          orderedValue: l.ordered * l.line.unitPrice,
          lossValue: l.lossValue,
          status: SUPPLY_STATUS_LABEL[v.order.status],
        })),
      ),
    notes: [
      "«الباقي» انتظار طالما الأمر مفتوح، وبيبقى عجز بعد ما يتقفل — نفس الرقم بمعنيين، والموقف هو اللي بيفرّق.",
      "«الواصل» = المقبول + المرفوض + التالف. المرفوض والتالف نزلوا من العربية بس مادخلوش المخزن.",
      "أيام التأخير مش مجموعة: مجموع التأخير على أوامر مختلفة رقم بلا معنى.",
    ],
  },
  {
    key: "batches",
    title: "دفعات الخامات",
    about: "كل دفعة: جات من مين وامتى وبكام، واتصرف منها كام، وباقي كام.",
    area: "inventory",
    module: "inventory",
    screen: "/supply?tab=batches",
    groupBy: "status",
    cols: [
      code("code", "كود الدفعة"),
      code("lot", "لوط المورّد"),
      text("item", "الصنف", 22),
      text("supplier", "المورّد", 22),
      day("received", "تاريخ الاستلام"),
      day("expiry", "تاريخ الانتهاء"),
      count("qtyIn", "الداخل"),
      count("consumed", "المتصرّف"),
      count("remaining", "الباقي"),
      cash("unitCost", "تكلفة الوحدة", "none"),
      cash("value", "قيمة الباقي"),
      count("orders", "أوامر نزلت فيها"),
      text("status", "الموقف", 16),
    ],
    rows: (db) =>
      batchList(db).map((v) => ({
        id: v.batch.id,
        code: v.batch.code,
        lot: v.batch.supplierLot,
        item: v.name,
        supplier: v.partyName ?? "",
        received: v.batch.receivedDate,
        expiry: v.batch.expiryDate ?? "",
        qtyIn: v.qtyIn,
        consumed: v.consumed,
        remaining: v.remaining,
        unitCost: v.batch.unitCost,
        value: v.value,
        orders: v.orderCount,
        status: v.expired ? "منتهية" : BATCH_STATUS_LABEL[v.batch.status],
      })),
    notes: [
      "الرصيد محسوب من حركات المخزن اللي عليها الدفعة، مش مخزّن في خانة.",
      "الدفعة الموقوفة أو المتستدعاة مابتنزلش إنتاج جديد: الصرف بيرفض لو الرصيد المتاح بدونها مش كفاية.",
      "تكلفة الوحدة مش مجموعة — الجمع بين تكاليف دفعات مختلفة رقم بلا معنى.",
    ],
  },
  {
    key: "availability",
    title: "المتاح فعلًا",
    about: "الموجود مقابل المحجوز لأوامر ماشية والموقوف في دفعات — والمتاح هو اللي بتاخد عليه قرار.",
    area: "inventory",
    module: "inventory",
    screen: "/supply?tab=available",
    cols: [
      text("name", "الخامة", 24),
      text("unit", "الوحدة", 12),
      count("onHand", "الموجود"),
      count("reserved", "المحجوز"),
      count("held", "الموقوف"),
      count("available", "المتاح"),
      count("incoming", "الجاي"),
    ],
    rows: (db) =>
      availability(db).map((r) => ({
        id: r.materialId,
        name: r.name,
        unit: r.unit,
        onHand: r.onHand,
        reserved: r.reserved,
        held: r.held,
        available: r.available,
        incoming: r.incoming,
      })),
    notes: [
      "المحجوز محسوب مش مخزّن: احتياج الأوامر الشغّالة اللي لسه مااتصرفتش خاماتها.",
      "المتاح ممكن يطلع بالسالب — ومعناه إن أمر إنتاج مش هيلاقي خامته، مش إن الجرد غلط.",
    ],
  },
  {
    key: "clientProducts",
    title: "موديلات العملاء",
    about: "كل عميل × كل موديل: المتسلّم والإيراد والمرتجع والتكلفة والربح.",
    area: "sales",
    module: "parties",
    screen: "/parties",
    groupBy: "client",
    cols: [
      text("client", "العميل", 22),
      text("model", "الموديل", 22),
      code("sku", "SKU"),
      text("link", "الربط", 16),
      count("deliveries", "توريدات"),
      count("delivered", "متسلّم"),
      count("produced", "اتنتج"),
      cash("revenue", "الإيراد"),
      count("returned", "راجع"),
      pct("returnRate", "نسبة الرجوع"),
      cash("unitCost", "تكلفة القطعة", "none"),
      cash("cost", "التكلفة"),
      cash("profit", "الربح"),
      pct("margin", "الهامش"),
      text("colors", "ألوان", 18),
      text("sizes", "مقاسات", 18),
    ],
    rows: (db) =>
      partiesWithRole(db, "customer").flatMap((p) =>
        clientProducts(db, p.id).rows.map((r) => ({
          id: `${p.id}-${r.productId ?? r.name}`,
          partyId: p.id,
          client: p.name,
          model: r.name,
          sku: r.sku ?? "",
          link: !r.productId
            ? "مش في الكتالوج"
            : r.exact
              ? "أمر إنتاج"
              : r.exactRevenue > 0
                ? "أمر إنتاج جزئيًا"
                : "مطابقة اسم",
          deliveries: r.deliveries,
          delivered: r.deliveredQty,
          produced: r.producedQty,
          revenue: r.revenue,
          returned: r.returnedQty,
          returnRate: r.returnRatePct ?? "",
          unitCost: r.unitCost ?? "",
          cost: r.cost ?? "",
          profit: r.profit ?? "",
          margin: r.marginPct ?? "",
          colors: r.colors.join("، "),
          sizes: r.sizes.join("، "),
        })),
      ),
    notes: [
      "«الربط» بيقول الموديل اتحدد إزاي: من أمر إنتاج بالمعرّف، ولا بمطابقة اسم الموديل المكتوب في التوريد. و«جزئيًا» يعني بعض توريدات الصف مربوطة بأمر والباقي بالاسم.",
      "التكلفة من ورقة تكلفة الموديل × المتسلّم. الموديل اللي مالوش قائمة خامات بيطلع بتكلفة فاضية مش صفر.",
      "«تكلفة القطعة» مش مجموعة: مجموع تكاليف موديلات مختلفة رقم بلا معنى.",
      "الألوان والمقاسات من الباندلات والمرتجعات — مش من كتالوج متغيرات، لأنه لسه مش موجود.",
    ],
  },
  {
    key: "orderCash",
    title: "من الأمر للتحصيل",
    about: "كل أمر: اتنتج كام، اتسلّم كام، اتفوتر بكام، اتحصّل كام، وباقي إمتى.",
    area: "sales",
    module: "parties",
    screen: "/parties",
    cols: [
      code("code", "رقم الأمر"),
      text("client", "العميل", 22),
      text("model", "الموديل", 22),
      count("ordered", "المطلوب"),
      count("produced", "اتنتج"),
      count("delivered", "اتسلّم"),
      count("remainingQty", "باقي قطع"),
      cash("invoiced", "المفوتر"),
      cash("collected", "المحصّل"),
      cash("remaining", "الباقي"),
      day("due", "ميعاد السداد"),
      count("overdueDays", "أيام التأخير", "none"),
    ],
    rows: (db) =>
      partiesWithRole(db, "customer").flatMap((p) =>
        clientOrderCash(db, p.id).map((o) => ({
          id: o.order.id,
          partyId: p.id,
          code: o.order.code,
          client: p.name,
          model: o.productName ?? o.order.model,
          ordered: o.order.quantity,
          produced: o.produced,
          delivered: o.delivered,
          remainingQty: o.remainingQty,
          invoiced: o.invoiced,
          collected: o.collected,
          remaining: o.remaining,
          due: o.dueDate ?? "",
          overdueDays: o.overdueDays ?? 0,
        })),
      ),
    notes: [
      "«المفوتر» قيمة التوريدات المربوطة بالأمر بالمعرّف. التوريد اللي مش مربوط بأمر مش بيتحسب هنا.",
      "«المحصّل» من نفس توزيع التحصيل بالأقدمية المستخدم في كشف الحساب — مش نسبة مقسومة على الأمر.",
      "أيام التأخير مش مجموعة: مجموع التأخير على أوامر مختلفة رقم بلا معنى.",
    ],
  },
  {
    key: "complaints",
    title: "الشكاوى",
    about: "مين اشتكى وعلى إيه ومين مسؤولها وإمتى اتحلّت.",
    area: "sales",
    module: "parties",
    screen: "/returns?tab=complaints",
    groupBy: "kind",
    cols: [
      code("code", "رقم الشكوى"),
      day("date", "التاريخ"),
      text("party", "الجهة", 22),
      text("kind", "النوع", 14),
      text("severity", "الخطورة"),
      text("subject", "الموضوع", 30),
      text("owner", "مسؤولها", 18),
      day("dueDate", "ميعاد الرد"),
      text("status", "الموقف"),
      cash("claimAmount", "مطالبة مالية"),
      count("days", "أيام للحل", "avg"),
      text("resolution", "اللي اتعمل", 34),
    ],
    rows: (db) => {
      const SEV: Record<string, string> = { low: "بسيطة", medium: "متوسطة", high: "خطيرة" };
      return db.complaints.map((c) => ({
        id: c.id,
        code: c.code,
        date: c.date,
        party: partyById(db, c.partyId)?.name ?? "جهة محذوفة",
        kind: COMPLAINT_KIND_LABEL[c.kind],
        severity: SEV[c.severity] ?? c.severity,
        subject: c.subject,
        owner: db.members.find((m) => m.id === c.ownerId)?.name ?? "",
        dueDate: c.dueDate ?? "",
        status: COMPLAINT_STATUS_LABEL[c.status],
        claimAmount: c.claimAmount,
        days: c.resolvedAt ? Math.max(0, Math.round((new Date(c.resolvedAt.slice(0, 10)).getTime() - new Date(c.date).getTime()) / 86400000)) : null,
        resolution: c.resolution,
      }));
    },
    notes: ["«أيام للحل» فاضية للشكوى اللي لسه مفتوحة — الصفر كان هيقول إنها اتحلّت في نفس اليوم."],
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
  /** شرط على الصفوف — للشاشات اللي بتعرض جزء من جدول عام (كشف عميل واحد) */
  where?: (row: ExportRow) => boolean;
  subtitle?: string;
  /** أرقام مختصرة زيادة على المجاميع */
  summary?: { label: string; value: string }[];
};

export function datasetOf(db: Db, key: string, opts: DatasetOptions = {}): ExportDataset {
  const def = DATASET_MAP[key];
  if (!def) throw new Error(`مفيش بيانات مسجّلة بالمفتاح ${key}`);

  const all = def.rows(db);
  let rows = all;
  if (opts.where) rows = rows.filter(opts.where);
  if (opts.ids) rows = rows.filter((r) => opts.ids!.has(String(r.id)));
  const filters = [...(opts.filters ?? [])];
  if (rows.length !== all.length) {
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
