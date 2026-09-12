import { formatDate, qty } from "@/lib/utils";
import { clientStatement, costEntryPaid, workerAdvance, workerBalance } from "./compute";
import { materialStock, operationById, orderRequirements, orderStages, productById, unitName } from "./manufacturing";
import { partyById } from "./parties";
import { LAY_STATUS_LABEL, layMath } from "./cutting";
import { bundleState, bundleTrail } from "./floor";
import { subView, workshopStatement } from "./outsourcing";
import { supplyItemName, supplyItemUnit } from "./supply";
import { DOC_DEFS } from "./documents";
import {
  METHOD_LABEL,
  ORDER_STATUS_LABEL,
  PAY_TYPE_LABEL,
  STOCK_KIND_LABEL,
  type Db,
  type DocType,
  type SupplyReceipt,
} from "./types";

/**
 * بناء محتوى المستند من الدفاتر.
 *
 * المستند المطبوع **مابيتخزّنش**. اللي بيتخزّن هو سطر الهوية (النوع
 * والرقم والتاريخ والمرجع)، والمحتوى بيتبنى هنا من نفس البيانات اللي
 * الشاشات بتقراها. فالورقة المطبوعة تاني بعد شهر بتطلع بأرقام النظام
 * الحالية، **ومفيش نسخة تانية من الحقيقة تقدر تخالف الأصل**.
 *
 * وفي مقابل ده: الورقة القديمة لو الأرقام اتغيّرت بعد طبعها، النسخة
 * الجديدة بتبان مختلفة. وده الصح — لأن الدفتر هو المرجع، مش الورق.
 * ولو المستند لازم يتقفل على أرقامه (فاتورة ضريبية مثلًا)، ده بيبقى
 * قرار محاسبي بيتعمل بـ**إلغاء وإعادة إصدار**، مش بتعديل صامت.
 */

export type DocBody = {
  /** عنوان المستند زي ما بيطلع في الورقة */
  title: string;
  /** الجهة: عميل، مورد، عامل… */
  party?: { label: string; name: string; rows: { label: string; value: string }[] };
  /** بيانات في الترويسة جنب الرقم */
  meta: { label: string; value: string }[];
  cols: { label: string; align?: "start" | "end"; width?: string }[];
  rows: string[][];
  totals: { label: string; value: number; strong?: boolean; negative?: boolean }[];
  /** المبلغ اللي المستند بيمثّله — بيتسجّل في الدفتر للموافقات */
  amount: number | null;
  /** خانات المستلم: إذن التسليم بلا الخانات دي مش إثبات */
  receiptBlock?: boolean;
  note?: string;
  /** المستند ده ينفع يطلع على النوع ده من السجلات؟ */
  ok: boolean;
  /** لو مش ينفع — السبب */
  why?: string;
};

function missing(title: string, why: string): DocBody {
  return { title, meta: [], cols: [], rows: [], totals: [], amount: null, ok: false, why };
}

/* ── البناء لكل نوع ────────────────────────────────────────────── */

export function buildBody(db: Db, type: DocType, refId: string, refExtra?: string | null): DocBody {
  const title = DOC_DEFS[type].label;
  switch (type) {
    case "order":
      return orderDoc(db, refId, title);
    case "production":
      return productionDoc(db, refId, title);
    case "issue":
      return issueDoc(db, refId, title);
    case "qc":
      return qcDoc(db, refId, title);
    case "delivery":
      return deliveryDoc(db, refId, title, true);
    case "invoice":
      return deliveryDoc(db, refId, title, false);
    case "receipt":
      return receiptDoc(db, refId, title);
    case "statement":
      return statementDoc(db, refId, title, refExtra);
    case "purchase":
      return purchaseDoc(db, refId, title);
    case "grn":
      return grnDoc(db, refId, title);
    case "payvoucher":
      return payVoucherDoc(db, refId, title);
    case "payslip":
      return payslipDoc(db, refId, title, refExtra);
    case "stock":
      return stockDoc(db, title);
    case "cutting":
      return cuttingDoc(db, refId, title);
    case "bundle":
      return bundleDoc(db, refId, title);
    case "subout":
      return subOutDoc(db, refId, title);
    case "subin":
      return subInDoc(db, refId, title);
    case "subaccount":
      return subAccountDoc(db, refId, title);
  }
}

/* ── القص والباندل ─────────────────────────────────────────────── */

function cuttingDoc(db: Db, id: string, title: string): DocBody {
  const lay = (db.cutLays ?? []).find((l) => l.id === id);
  if (!lay) return missing(title, "الفرشة مش موجودة.");
  const m = layMath(db, lay);
  if (!m.sizes.length) return missing(title, "الفرشة مالهاش مقاسات، فمفيش حاجة تتقص.");

  return {
    title,
    party: {
      label: "أمر الإنتاج",
      name: m.order ? `${m.order.code} — ${m.order.model}` : "بدون أمر",
      rows: [
        { label: "القماش", value: `${m.materialName}${lay.color ? ` — ${lay.color}` : ""}` },
        { label: "الطبقات", value: qty(lay.plies, 0) },
      ],
    },
    meta: [
      { label: "تاريخ الفرشة", value: formatDate(lay.date) },
      { label: "طول الماركر", value: `${qty(lay.markerLengthM, 2)} م` },
      { label: "الحالة", value: LAY_STATUS_LABEL[lay.status] },
    ],
    cols: [
      { label: "المقاس" },
      { label: "في الطبقة", align: "end", width: "22mm" },
      { label: "الطبقات", align: "end", width: "20mm" },
      { label: "القطع", align: "end", width: "22mm" },
    ],
    rows: m.sizes.map((s) => [s.size, qty(s.perPly, 0), qty(lay.plies, 0), qty(s.pieces, 0)]),
    totals: [
      { label: "إجمالي القطع", value: m.pieces, strong: true },
      { label: `القماش المطلوب (${m.unit})`, value: m.actualM ?? m.plannedM },
    ],
    amount: null,
    note: [
      `المتر للقطعة ${qty(m.perPieceM, 3)} ${m.unit}`,
      m.standardM ? `والمعياري ${qty(m.standardM, 3)}` : "ومفيش معياري مسجّل للمقارنة",
      lay.notes,
    ]
      .filter(Boolean)
      .join(" · "),
    ok: true,
  };
}

function bundleDoc(db: Db, id: string, title: string): DocBody {
  const bundle = (db.bundles ?? []).find((b) => b.id === id);
  if (!bundle) return missing(title, "الباندل مش موجود.");
  const st = bundleState(db, bundle);
  const trail = bundleTrail(db, bundle.id);

  return {
    title,
    party: {
      label: "الباندل",
      name: bundle.code,
      rows: [
        { label: "الأمر", value: st.orderCode },
        { label: "المقاس", value: `${bundle.size}${bundle.color ? ` — ${bundle.color}` : ""}` },
      ],
    },
    meta: [
      { label: "الكمية", value: qty(bundle.qty, 0) },
      { label: "الحالة", value: st.label },
    ],
    cols: [{ label: "العملية" }, { label: "العامل" }, { label: "سليم", align: "end", width: "18mm" }],
    rows: trail.length
      ? trail.map((s) => [s.operationName, s.workerName, s.op.state === "done" ? qty(s.op.qtyGood, 0) : "—"])
      : [["لسه ماشتغلش عليه حد", "—", "—"]],
    totals: [{ label: "قطع الباندل", value: bundle.qty, strong: true }],
    amount: null,
    note: "التيكت ده بيمشي مع الباندل نفسه لحد التعبئة.",
    ok: true,
  };
}

/* ── الورش الخارجية ────────────────────────────────────────────── */

function subOutDoc(db: Db, id: string, title: string): DocBody {
  const sub = (db.subcontracts ?? []).find((s) => s.id === id);
  if (!sub) return missing(title, "إذن التشغيل مش موجود.");
  const v = subView(db, sub);
  const party = partyById(db, sub.partyId);
  const value = sub.qtySent * sub.rate;

  return {
    title,
    party: {
      label: "الورشة",
      name: v.partyName,
      rows: [
        { label: "الهاتف", value: party?.phone ?? "" },
        { label: "العملية", value: v.operationName ?? "—" },
      ],
    },
    meta: [
      { label: "تاريخ الخروج", value: formatDate(sub.date) },
      { label: "المتوقع رجوعه", value: formatDate(sub.expectedDate) },
      { label: "الأمر", value: v.orderCode ?? "—" },
    ],
    cols: [
      { label: "البند" },
      { label: "الكمية", align: "end", width: "22mm" },
      { label: "الأجر", align: "end", width: "22mm" },
      { label: "الإجمالي", align: "end", width: "24mm" },
    ],
    rows: [
      [v.operationName ?? "تشغيل", qty(sub.qtySent, 0), qty(sub.rate, 2), qty(value, 2)],
      ...v.materials.map((m) => [`خامة: ${m.name}`, `${qty(m.sent, 2)} ${m.unit}`, "—", "—"]),
    ],
    totals: [{ label: "أجر التشغيل لو رجع كامل", value, strong: true }],
    amount: value,
    receiptBlock: true,
    note: [sub.notes, "المستحق النهائي بيتحسب على الراجع فعلًا، مش على الكمية اللي طلعت."].filter(Boolean).join(" · "),
    ok: true,
  };
}

function subInDoc(db: Db, id: string, title: string): DocBody {
  const receipt = (db.subReceipts ?? []).find((r) => r.id === id);
  if (!receipt) return missing(title, "الاستلام مش موجود.");
  const sub = (db.subcontracts ?? []).find((s) => s.id === receipt.subcontractId);
  if (!sub) return missing(title, "إذن التشغيل بتاع الاستلام ده مش موجود.");
  const v = subView(db, sub);
  const charge = (receipt.qtyGood + receipt.qtyRework) * sub.rate;

  return {
    title,
    party: {
      label: "الورشة",
      name: v.partyName,
      rows: [
        { label: "الإذن", value: sub.code },
        { label: "العملية", value: v.operationName ?? "—" },
      ],
    },
    meta: [
      { label: "تاريخ الاستلام", value: formatDate(receipt.date) },
      { label: "الميعاد المتوقع", value: formatDate(sub.expectedDate) },
    ],
    cols: [{ label: "البند" }, { label: "الكمية", align: "end", width: "24mm" }],
    rows: [
      ["سليم", qty(receipt.qtyGood, 0)],
      ["محتاج إعادة شغل", qty(receipt.qtyRework, 0)],
      ["فاقد", qty(receipt.qtyLost, 0)],
      ["لسه عند الورشة", qty(v.outstanding, 0)],
    ],
    totals: [{ label: "المستحق على الاستلام ده", value: charge, strong: true }],
    amount: charge,
    receiptBlock: true,
    note: receipt.notes || undefined,
    ok: true,
  };
}

function subAccountDoc(db: Db, partyId: string, title: string): DocBody {
  const party = partyById(db, partyId);
  if (!party) return missing(title, "الورشة مش موجودة.");
  const lines = workshopStatement(db, partyId);
  if (!lines.length) return missing(title, "الورشة دي مالهاش حركة تشغيل لسه.");
  const balance = lines[lines.length - 1].balance;

  return {
    title,
    party: {
      label: "الورشة",
      name: party.name,
      rows: [{ label: "الهاتف", value: party.phone }],
    },
    meta: [{ label: "عدد الحركات", value: qty(lines.length, 0) }],
    cols: [
      { label: "التاريخ", width: "26mm" },
      { label: "الحركة" },
      { label: "مستحق", align: "end", width: "24mm" },
      { label: "مدفوع", align: "end", width: "24mm" },
      { label: "الرصيد", align: "end", width: "26mm" },
    ],
    rows: lines.map((l) => [
      formatDate(l.date),
      l.label,
      l.debit ? qty(l.debit, 2) : "—",
      l.credit ? qty(l.credit, 2) : "—",
      qty(l.balance, 2),
    ]),
    totals: [{ label: "الرصيد المستحق للورشة", value: balance, strong: true }],
    amount: balance,
    ok: true,
  };
}

function orderDoc(db: Db, id: string, title: string): DocBody {
  const o = db.orders.find((x) => x.id === id);
  if (!o) return missing(title, "أمر الإنتاج مش موجود.");
  const client = partyById(db, o.clientId);
  const value = o.quantity * o.piecePrice;

  return {
    title,
    party: client
      ? {
          label: "العميل",
          name: client.name,
          rows: [
            { label: "الهاتف", value: client.phone },
            { label: "العنوان", value: client.address ?? "" },
          ],
        }
      : { label: "الجهة", name: "مخزون المصنع", rows: [] },
    meta: [
      { label: "الخط", value: o.line },
      { label: "الميعاد", value: formatDate(o.dueDate) },
      { label: "الحالة", value: ORDER_STATUS_LABEL[o.status] },
    ],
    cols: [
      { label: "الموديل" },
      { label: "المنتج" },
      { label: "الكمية", align: "end", width: "20mm" },
      { label: "سعر القطعة", align: "end", width: "24mm" },
      { label: "الإجمالي", align: "end", width: "26mm" },
    ],
    rows: [
      [
        o.model,
        productById(db, o.productId)?.sku ?? "—",
        qty(o.quantity, 0),
        qty(o.piecePrice, 2),
        qty(value, 2),
      ],
    ],
    totals: [{ label: "قيمة الأمر", value, strong: true }],
    amount: value,
    note: o.notes || undefined,
    ok: true,
  };
}

function productionDoc(db: Db, id: string, title: string): DocBody {
  const o = db.orders.find((x) => x.id === id);
  if (!o) return missing(title, "أمر الإنتاج مش موجود.");
  const stages = orderStages(db, o);

  return {
    title,
    party: { label: "الموديل", name: `${o.model} — ${qty(o.quantity, 0)} قطعة`, rows: [{ label: "الخط", value: o.line }] },
    meta: [
      { label: "رقم الأمر", value: o.code },
      { label: "الميعاد", value: formatDate(o.dueDate) },
    ],
    cols: [
      { label: "المرحلة" },
      { label: "المطلوب", align: "end" },
      { label: "المنفّذ", align: "end" },
      { label: "الباقي", align: "end" },
      { label: "معاد", align: "end" },
      { label: "هالك", align: "end" },
    ],
    rows: stages.map((s) => [
      s.name,
      qty(o.quantity, 0),
      qty(s.good, 0),
      qty(Math.max(0, o.quantity - s.good), 0),
      qty(s.rework, 0),
      qty(s.scrap, 0),
    ]),
    totals: [],
    amount: null,
    note: stages.length ? undefined : "الأمر ده مالوش مسار عمليات مسجّل، فالورقة طلعت بلا مراحل.",
    ok: true,
  };
}

function issueDoc(db: Db, id: string, title: string): DocBody {
  const o = db.orders.find((x) => x.id === id);
  if (!o) return missing(title, "أمر الإنتاج مش موجود.");
  const reqs = orderRequirements(db, o);
  if (!reqs.length) return missing(title, "الأمر ده مالوش قائمة مواد، فمفيش خامات تتصرف عليه.");
  const total = reqs.reduce((s, r) => s + r.required * r.unitCost, 0);

  return {
    title,
    party: { label: "لأمر إنتاج", name: `${o.code} — ${o.model}`, rows: [{ label: "الكمية", value: qty(o.quantity, 0) }] },
    meta: [{ label: "الخط", value: o.line }],
    cols: [
      { label: "الخامة" },
      { label: "الوحدة", width: "18mm" },
      { label: "المطلوب", align: "end" },
      { label: "المصروف", align: "end" },
      { label: "الباقي", align: "end" },
      { label: "التكلفة", align: "end" },
    ],
    rows: reqs.map((r) => [
      r.name,
      r.unit,
      qty(r.required, 2),
      qty(r.issued, 2),
      qty(r.remaining, 2),
      qty(r.required * r.unitCost, 2),
    ]),
    totals: [{ label: "قيمة الخامات", value: total, strong: true }],
    amount: total,
    ok: true,
  };
}

function qcDoc(db: Db, id: string, title: string): DocBody {
  const o = db.orders.find((x) => x.id === id);
  if (!o) return missing(title, "أمر الإنتاج مش موجود.");
  const entries = db.stageEntries.filter((s) => s.orderId === id);
  if (!entries.length) return missing(title, "مفيش حركات إنتاج على الأمر ده، فمفيش حاجة تتفحص.");

  return {
    title,
    party: { label: "أمر الإنتاج", name: `${o.code} — ${o.model}`, rows: [] },
    meta: [{ label: "الكمية", value: qty(o.quantity, 0) }],
    cols: [
      { label: "التاريخ", width: "24mm" },
      { label: "العملية" },
      { label: "العامل" },
      { label: "سليم", align: "end" },
      { label: "معاد", align: "end" },
      { label: "هالك", align: "end" },
    ],
    rows: entries.map((s) => [
      formatDate(s.date),
      operationById(db, s.operationId)?.name ?? "—",
      db.workers.find((w) => w.id === s.workerId)?.name ?? "—",
      qty(s.qtyGood, 0),
      qty(s.qtyRework, 0),
      qty(s.qtyScrap, 0),
    ]),
    totals: [],
    amount: null,
    note: "التصرف في المعاد والهالك بيتكتب بإيد مسؤول الجودة تحت.",
    receiptBlock: true,
    ok: true,
  };
}

function deliveryDoc(db: Db, id: string, title: string, asDelivery: boolean): DocBody {
  const d = db.deliveries.find((x) => x.id === id);
  if (!d) return missing(title, "التوريدة مش موجودة.");
  const client = partyById(db, d.clientId);
  const unit = d.quantity ? d.amount / d.quantity : null;

  return {
    title,
    party: {
      label: "العميل",
      name: client?.name ?? "عميل محذوف",
      rows: [
        { label: "الهاتف", value: client?.phone ?? "" },
        { label: "العنوان", value: client?.address ?? "" },
        { label: "الرقم الضريبي", value: client?.taxId ?? "" },
      ],
    },
    meta: [{ label: "الاستحقاق", value: formatDate(d.dueDate) }],
    cols: [
      { label: "الصنف" },
      { label: "الكمية", align: "end", width: "20mm" },
      ...(asDelivery ? [] : [{ label: "سعر الوحدة", align: "end" as const, width: "24mm" }]),
      { label: "الإجمالي", align: "end", width: "26mm" },
    ],
    rows: [
      [
        d.model || "توريدة",
        d.quantity === null ? "—" : qty(d.quantity, 0),
        ...(asDelivery ? [] : [unit === null ? "—" : qty(unit, 2)]),
        qty(d.amount, 2),
      ],
    ],
    totals: asDelivery ? [] : [{ label: "الصافي", value: d.amount, strong: true }],
    amount: d.amount,
    receiptBlock: asDelivery,
    note: d.notes || undefined,
    ok: true,
  };
}

function receiptDoc(db: Db, id: string, title: string): DocBody {
  const c = db.collections.find((x) => x.id === id);
  if (!c) return missing(title, "التحصيل مش موجود.");
  const client = partyById(db, c.clientId);
  const after = client ? clientStatement(db, client.id).at(-1)?.balance ?? 0 : 0;

  return {
    title,
    party: { label: "من", name: client?.name ?? "عميل محذوف", rows: [{ label: "الهاتف", value: client?.phone ?? "" }] },
    meta: [{ label: "الطريقة", value: METHOD_LABEL[c.method] }],
    cols: [{ label: "البيان" }, { label: "المبلغ", align: "end" }],
    rows: [
      [`تحصيل ${METHOD_LABEL[c.method]}`, qty(c.amount, 2)],
      ...(c.chequeDate ? [["تاريخ الشيك", formatDate(c.chequeDate)]] : []),
    ],
    totals: [
      { label: "المبلغ المستلم", value: c.amount, strong: true },
      { label: "الرصيد بعد التحصيل", value: after },
    ],
    amount: c.amount,
    note:
      c.status === "pending"
        ? "التحصيل ده لسه بانتظار تأكيد، فالإيصال مش إثبات دخول فلوس الخزينة."
        : undefined,
    ok: true,
  };
}

function statementDoc(db: Db, partyId: string, title: string, from?: string | null): DocBody {
  const party = partyById(db, partyId);
  if (!party) return missing(title, "الجهة مش موجودة.");
  const all = clientStatement(db, partyId);
  const lines = from ? all.filter((l) => l.date >= from) : all;
  if (!all.length) return missing(title, "مفيش حركة على الجهة دي.");
  const last = all.at(-1)!;

  return {
    title,
    party: {
      label: "الجهة",
      name: party.name,
      rows: [
        { label: "الهاتف", value: party.phone },
        { label: "الرقم الضريبي", value: party.taxId ?? "" },
      ],
    },
    meta: [{ label: "عدد الحركات", value: qty(lines.length, 0) }],
    cols: [
      { label: "التاريخ", width: "24mm" },
      { label: "البيان" },
      { label: "مدين", align: "end" },
      { label: "دائن", align: "end" },
      { label: "الرصيد", align: "end" },
    ],
    rows: lines.map((l) => [
      formatDate(l.date),
      l.label,
      l.debit ? qty(l.debit, 2) : "—",
      l.credit ? qty(l.credit, 2) : "—",
      qty(l.balance, 2),
    ]),
    totals: [
      { label: "إجمالي التوريدات", value: all.reduce((s, l) => s + l.debit, 0) },
      { label: "إجمالي التحصيل", value: all.reduce((s, l) => s + l.credit, 0) },
      { label: "الرصيد المستحق", value: last.balance, strong: true },
    ],
    amount: last.balance,
    note: from ? `الكشف من ${formatDate(from)} — والرصيد متراكم من قبل التاريخ ده.` : undefined,
    ok: true,
  };
}

function purchaseDoc(db: Db, id: string, title: string): DocBody {
  const e = db.costEntries.find((x) => x.id === id);
  if (!e) return missing(title, "بند التكلفة مش موجود.");
  const paid = costEntryPaid(db, e.id);
  const item = db.costItems.find((i) => i.id === e.costItemId);
  const vendor = partyById(db, e.partyId);

  return {
    title,
    party: {
      label: "المورد",
      name: vendor?.name ?? e.vendor ?? "—",
      rows: [
        { label: "الهاتف", value: vendor?.phone ?? "" },
        { label: "الرقم الضريبي", value: vendor?.taxId ?? "" },
      ],
    },
    meta: [],
    cols: [
      { label: "البند" },
      { label: "الوحدة", width: "18mm" },
      { label: "الكمية", align: "end" },
      { label: "الإجمالي", align: "end" },
    ],
    rows: [[item?.name ?? "—", item?.unit ?? "—", e.quantity === null ? "—" : qty(e.quantity, 2), qty(e.amount, 2)]],
    totals: [
      { label: "قيمة الفاتورة", value: e.amount, strong: true },
      { label: "المدفوع", value: paid },
      { label: "الباقي", value: e.amount - paid },
    ],
    amount: e.amount,
    note: e.notes || undefined,
    ok: true,
  };
}

function grnDoc(db: Db, id: string, title: string): DocBody {
  const receipt = (db.supplyReceipts ?? []).find((r) => r.id === id);
  if (receipt) return supplyReceiptDoc(db, receipt, title);

  const m = db.stockMovements.find((x) => x.id === id);
  if (!m) return missing(title, "حركة المخزن مش موجودة.");
  if (m.kind !== "purchase" && m.kind !== "opening") {
    return missing(title, "إذن الاستلام بيطلع من حركة شراء أو رصيد افتتاحي بس.");
  }
  const name = db.materials.find((x) => x.id === m.itemId)?.name ?? productById(db, m.itemId)?.name ?? "صنف محذوف";
  const unitId = db.materials.find((x) => x.id === m.itemId)?.unitId ?? null;

  return {
    title,
    party: { label: "المخزن", name: db.warehouses.find((w) => w.id === m.warehouseId)?.name ?? "—", rows: [] },
    meta: [{ label: "نوع الحركة", value: STOCK_KIND_LABEL[m.kind] }],
    cols: [
      { label: "الصنف" },
      { label: "الوحدة", width: "18mm" },
      { label: "الكمية", align: "end" },
      { label: "سعر الوحدة", align: "end" },
      { label: "القيمة", align: "end" },
    ],
    rows: [[name, unitName(db, unitId), qty(m.qty, 2), qty(m.unitCost, 2), qty(m.qty * m.unitCost, 2)]],
    totals: [{ label: "قيمة الاستلام", value: m.qty * m.unitCost, strong: true }],
    amount: m.qty * m.unitCost,
    receiptBlock: true,
    note: m.notes || undefined,
    ok: true,
  };
}

/**
 * إذن الاستلام على استلام توريد.
 *
 * الورقة دي هي اللي بيتوقّع عليها وقت نزول الشحنة، فلازم تحمل التفصيل
 * اللي الخلاف بيتحسم بيه: المقبول والمرفوض والتالف والناقص في ورقة
 * المورّد، كل واحد في خانته. إذن بيقول «دخل ٩٧٠» وبس مابيحسمش خلاف.
 */
function supplyReceiptDoc(db: Db, receipt: SupplyReceipt, title: string): DocBody {
  const order = (db.supplyOrders ?? []).find((o) => o.id === receipt.supplyOrderId);
  if (!order) return missing(title, "أمر التوريد بتاع الاستلام ده مش موجود.");
  const lines = (db.supplyReceiptLines ?? []).filter((l) => l.receiptId === receipt.id);
  if (!lines.length) return missing(title, "الاستلام مالوش سطور، فمفيش حاجة تتطبع.");

  const vendor = partyById(db, order.partyId);
  let acceptedValue = 0;
  const rows = lines.map((l) => {
    const orderLine = (db.supplyOrderLines ?? []).find((o) => o.id === l.supplyOrderLineId);
    const price = orderLine?.unitPrice ?? 0;
    acceptedValue += l.qtyAccepted * price;
    const batch = (db.batches ?? []).find((b) => b.id === l.batchId);
    return [
      orderLine ? supplyItemName(db, orderLine.itemType, orderLine.itemId) : "بند محذوف",
      orderLine ? supplyItemUnit(db, orderLine.itemType, orderLine.itemId) : "—",
      orderLine ? qty(orderLine.qtyOrdered, 2) : "—",
      qty(l.qtyAccepted, 2),
      qty(l.qtyRejected, 2),
      qty(l.qtyDamaged, 2),
      qty(l.qtyMissing, 2),
      batch?.code ?? "—",
    ];
  });

  const rejected = lines.reduce((s, l) => s + l.qtyRejected + l.qtyDamaged, 0);
  const missingDoc = lines.reduce((s, l) => s + l.qtyMissing, 0);

  return {
    title,
    party: {
      label: "المورّد",
      name: vendor?.name ?? "—",
      rows: [
        { label: "أمر التوريد", value: order.code },
        { label: "الهاتف", value: vendor?.phone ?? "" },
      ],
    },
    meta: [
      { label: "تاريخ الاستلام", value: formatDate(receipt.date) },
      { label: "إذن المورّد", value: receipt.supplierDocNo || "مافيش" },
      { label: "المخزن", value: db.warehouses.find((w) => w.id === receipt.warehouseId)?.name ?? "—" },
    ],
    cols: [
      { label: "الصنف" },
      { label: "الوحدة", width: "16mm" },
      { label: "المطلوب", align: "end", width: "20mm" },
      { label: "مقبول", align: "end", width: "20mm" },
      { label: "مرفوض", align: "end", width: "18mm" },
      { label: "تالف", align: "end", width: "18mm" },
      { label: "ناقص بالمستند", align: "end", width: "24mm" },
      { label: "الدفعة", width: "30mm" },
    ],
    rows,
    totals: [{ label: "قيمة المقبول", value: acceptedValue, strong: true }],
    amount: acceptedValue,
    receiptBlock: true,
    note: [
      rejected > 0 ? `مرفوض وتالف ${qty(rejected, 2)} — مادخلش المخزن` : null,
      missingDoc > 0 ? `ناقص في إذن المورّد ${qty(missingDoc, 2)} — مطالبة على المورّد` : null,
      receipt.notes || null,
    ]
      .filter(Boolean)
      .join(" · ") || undefined,
    ok: true,
  };
}

function payVoucherDoc(db: Db, id: string, title: string): DocBody {
  const p = db.costPayments.find((x) => x.id === id);
  if (!p) return missing(title, "الدفعة مش موجودة.");
  const entry = db.costEntries.find((e) => e.id === p.costEntryId);
  const item = entry ? db.costItems.find((i) => i.id === entry.costItemId) : null;
  const vendor = entry ? partyById(db, entry.partyId) : null;

  return {
    title,
    party: { label: "المستفيد", name: vendor?.name ?? entry?.vendor ?? "—", rows: [{ label: "الهاتف", value: vendor?.phone ?? "" }] },
    meta: [
      { label: "الطريقة", value: METHOD_LABEL[p.method] },
      { label: "الحساب", value: db.accounts.find((a) => a.id === p.accountId)?.name ?? "—" },
    ],
    cols: [{ label: "البيان" }, { label: "المبلغ", align: "end" }],
    rows: [[`دفعة عن ${item?.name ?? "بند تكلفة"}`, qty(p.amount, 2)]],
    totals: [{ label: "المبلغ المدفوع", value: p.amount, strong: true }],
    amount: p.amount,
    receiptBlock: true,
    ok: true,
  };
}

function payslipDoc(db: Db, workerId: string, title: string, from?: string | null): DocBody {
  const w = db.workers.find((x) => x.id === workerId);
  if (!w) return missing(title, "العامل مش موجود.");
  const earnings = db.workerEarnings.filter((e) => e.workerId === workerId && (!from || e.date >= from));
  const payments = db.workerPayments.filter((p) => p.workerId === workerId && (!from || p.date >= from));
  const earned = earnings.reduce((s, e) => s + e.amount, 0);
  const paid = payments.filter((p) => p.kind === "pay").reduce((s, p) => s + p.amount, 0);

  const KIND: Record<string, string> = { attendance: "يومية", piece: "بالقطعة", bonus: "مكافأة" };
  return {
    title,
    party: {
      label: "العامل",
      name: w.name,
      rows: [
        { label: "نظام الأجر", value: PAY_TYPE_LABEL[w.payType] },
        { label: "الهاتف", value: w.phone },
      ],
    },
    meta: [{ label: "عدد الحركات", value: qty(earnings.length, 0) }],
    cols: [{ label: "التاريخ", width: "24mm" }, { label: "النوع" }, { label: "البيان" }, { label: "المبلغ", align: "end" }],
    rows: earnings.map((e) => [formatDate(e.date), KIND[e.kind] ?? e.kind, e.notes || "—", qty(e.amount, 2)]),
    totals: [
      { label: "إجمالي المستحق", value: earned },
      { label: "المصروف", value: paid, negative: true },
      { label: "سلف قائمة", value: workerAdvance(db, workerId), negative: true },
      { label: "الرصيد", value: workerBalance(db, workerId), strong: true },
    ],
    amount: workerBalance(db, workerId),
    receiptBlock: true,
    ok: true,
  };
}

function stockDoc(db: Db, title: string): DocBody {
  const rows = materialStock(db);
  if (!rows.length) return missing(title, "مفيش خامات مسجّلة.");

  return {
    title,
    meta: [{ label: "عدد الأصناف", value: qty(rows.length, 0) }],
    cols: [
      { label: "الكود", width: "22mm" },
      { label: "الخامة" },
      { label: "الوحدة", width: "18mm" },
      { label: "رصيد النظام", align: "end" },
      { label: "الجرد الفعلي", align: "end", width: "26mm" },
      { label: "الفرق", align: "end", width: "22mm" },
    ],
    rows: rows.map((m) => [m.sku, m.name, unitName(db, m.unitId), qty(m.qty, 2), "", ""]),
    totals: [{ label: "قيمة المخزون بالنظام", value: rows.reduce((s, m) => s + m.value, 0), strong: true }],
    amount: rows.reduce((s, m) => s + m.value, 0),
    note: "الجرد الفعلي والفرق بيتكتبوا بالقلم وقت العد، وبعدها بيتسجّلوا كتسوية مخزن.",
    receiptBlock: true,
    ok: true,
  };
}
