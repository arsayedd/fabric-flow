import { formatDate, moneyPlain, qty } from "@/lib/utils";
import { describe } from "./codes";
import { layMath } from "./cutting";
import { opMinutes } from "./floor";
import { materialById, operationById } from "./manufacturing";
import type { CodeKind, Db, Order } from "./types";

/**
 * سلسلة التتبع.
 *
 * السؤال اللي الشاشة دي بتجاوب عليه: **القطعة دي جت منين وروحت فين؟**
 * من المورّد للقماش، للفرشة، للباندل، للعمليات، للأمر، للتوريد،
 * للفاتورة، للتحصيل.
 *
 * وفيه وصلتين في السلسلة **مش قويّة، واحنا بنقولها**:
 *
 *  1) التوريد للعميل مش مربوط بأمر إنتاج في الدفتر — مربوط بالعميل. فلما
 *     نعرض «اتسلّم» جوه سلسلة أمر، إحنا بنعرض توريدات **العميل** في
 *     المدى ده، مش توريدات الأمر بعينه. الوصلة الحقيقية محتاجة سطور
 *     توريد على الأمر، وده مش مبني.
 *  2) صرف القماش على الفرشة بيحدّد الخامة اللي اتقصت، لكن **مش الرول**.
 *     يعني نقدر نقول «قماش كتان أوف وايت»، مانقدرش نقول «رول ٤٤٧».
 *     الرول نفسه مش كيان في الدفتر.
 *
 * ومابنخترعش وصلات: اللي مش موجود بيتكتب في `gaps` وبيبان على الشاشة
 * تحت السلسلة، مش بيتلفّق برقم تقريبي.
 */

export type TraceStep = {
  key: string;
  /** عنوان الخطوة — «اتشترى»، «اتقص»، «اتخيط» */
  title: string;
  when: string | null;
  body: string[];
  to: string | null;
  code: string | null;
  kind: CodeKind | null;
  /** خطوة اتنفّذت فعلًا، ولا مستنية */
  done: boolean;
};

export type Trace = {
  head: { kind: CodeKind; id: string; label: string; code: string } | null;
  steps: TraceStep[];
  gaps: string[];
};

/**
 * التواريخ في الدفتر نوعين: تاريخ لوحده (`2026-09-09`) ووقت كامل
 * (`2026-09-09T11:20:00.000Z`). و`formatDate` بتقرا الأول بس، فالقص
 * على عشر حروف هو اللي بيخلي الاتنين يشتغلوا في نفس السلسلة.
 */
const day = (d: string | null | undefined) => (d ? formatDate(d.slice(0, 10)) : null);

/** السلسلة بتتبني من نقطة الارتكاز: الأمر لو فيه أمر، وإلا الخامة */
export function trace(db: Db, kind: CodeKind, id: string): Trace {
  const hit = describe(db, kind, id);
  const head = hit ? { kind, id, label: hit.label, code: hit.code } : null;
  const gaps: string[] = [];
  const steps: TraceStep[] = [];

  const lay = kind === "lay" ? (db.cutLays ?? []).find((l) => l.id === id) ?? null : null;
  const bundle = kind === "bundle" ? (db.bundles ?? []).find((b) => b.id === id) ?? null : null;
  const bundleLay = bundle ? (db.cutLays ?? []).find((l) => l.id === bundle.layId) ?? null : null;
  const theLay = lay ?? bundleLay;

  const doc = kind === "document" ? db.documents.find((d) => d.id === id) ?? null : null;
  const order: Order | null =
    kind === "order"
      ? db.orders.find((o) => o.id === id) ?? null
      : theLay
        ? db.orders.find((o) => o.id === theLay.orderId) ?? null
        : kind === "subcontract"
          ? db.orders.find((o) => o.id === (db.subcontracts ?? []).find((s) => s.id === id)?.orderId) ?? null
          : doc
            ? db.orders.find((o) => o.id === doc.refId) ?? null
            : null;

  const materialId = kind === "material" ? id : theLay?.materialId ?? null;

  /* ١) الخامة: منين جت وبكام */
  if (materialId) {
    const material = materialById(db, materialId);
    const buys = db.stockMovements
      .filter((m) => m.itemId === materialId && (m.kind === "purchase" || m.kind === "opening"))
      .sort((a, b) => b.date.localeCompare(a.date));
    const last = buys[0];
    steps.push({
      key: "material",
      title: "الخامة",
      when: day(last?.date),
      body: [
        material ? `${material.name}${theLay?.color ? ` · ${theLay.color}` : ""}` : "خامة",
        last ? `آخر توريد ${qty(Math.abs(last.qty))} بسعر ${moneyPlain(last.unitCost)} للوحدة` : "مفيش توريد مسجّل",
        `${qty(buys.length, 0)} حركة توريد في الدفتر`,
      ],
      to: `/materials/${materialId}`,
      code: material?.sku ?? null,
      kind: "material",
      done: !!last,
    });
    gaps.push("التوريد مسجّل على الدفعة مش على الرول، فالسلسلة بتوصل للوط ومابتوصلش لرول بعينه.");
  }

  /*
   * ٢) الدفعة: أنهي لوط بالتحديد اتصرف هنا.
   *
   * الخطوة دي هي اللي حوّلت السلسلة من «أنهي خامة» لـ«أنهي توريد من أنهي
   * مورّد» — وبيها الاستدعاء بقى ممكن.
   *
   * ومطلعة برّه شرط الخامة عن قصد: سلسلة **أمر إنتاج** مالهاش خامة
   * واحدة — الأمر بيصرف قماش وخيط وأزرار من دفعات مختلفة. لو الخطوة دي
   * فضلت جوه شرط الخامة، أهم سلسلة في النظام (سلسلة الأمر) كانت هتفضل
   * بلا دفعات.
   */
  {
    const consumedBatches = [
      ...new Set(
        db.stockMovements
          .filter(
            (m) =>
              m.qty < 0 &&
              !!m.batchId &&
              ((theLay && m.refType === "lay" && m.refId === theLay.id) ||
                (order && m.refType === "order" && m.refId === order.id)),
          )
          .map((m) => m.batchId as string),
      ),
    ];
    const batchRows = consumedBatches
      .map((bid) => (db.batches ?? []).find((b) => b.id === bid))
      .filter((b): b is NonNullable<typeof b> => !!b);

    if (batchRows.length) {
      steps.push({
        key: "batch",
        title: "الدفعة",
        when: day(batchRows[0].receivedDate),
        body: [
          batchRows
            .map((b) => `${b.code}${b.supplierLot ? ` · لوط ${b.supplierLot}` : ""}`)
            .join(" + "),
          batchRows
            .map((b) => db.parties.find((p) => p.id === b.partyId)?.name)
            .filter(Boolean)
            .join(" · ") || "دفعة بلا مورّد مسجّل",
          batchRows.length > 1 ? `الصرف جه من ${qty(batchRows.length, 0)} دفعات` : "دفعة واحدة",
        ],
        to: `/supply/batch/${batchRows[0].id}`,
        code: batchRows[0].code,
        kind: "batch",
        done: true,
      });
    } else if (theLay || order) {
      gaps.push("الصرف هنا مش متسجّل على دفعة، فالسلسلة بتقول «أنهي خامة» مش «أنهي توريد» — الدفعات بتتعمل مع الاستلام.");
    }
  }

  /* ٢) الفرشة: القماش اتفرش واتقص */
  if (theLay) {
    const m = layMath(db, theLay);
    steps.push({
      key: "lay",
      title: theLay.status === "cut" ? "اتقص" : theLay.status === "cancelled" ? "الفرشة اتلغت" : "فرشة مخططة",
      when: day(theLay.cutAt ?? theLay.date),
      body: [
        `${qty(theLay.plies, 0)} طبقة · ${qty(m.pieces, 0)} قطعة`,
        theLay.fabricUsedM !== null
          ? `القماش المستخدم ${qty(theLay.fabricUsedM)} م · الاستغلال ${m.utilizationPct === null ? "—" : `${qty(m.utilizationPct, 0)}٪`}`
          : `القماش المخطط ${qty(m.plannedM)} م (تقدير قبل القص)`,
        theLay.notes || "بدون ملاحظات",
      ],
      to: "/cutting",
      code: null,
      kind: "lay",
      done: theLay.status === "cut",
    });
  }

  /* ٣) الباندلات والعمليات عليها */
  const bundles = bundle ? [bundle] : theLay ? (db.bundles ?? []).filter((b) => b.layId === theLay.id) : [];
  if (bundles.length) {
    steps.push({
      key: "bundles",
      title: "اتربط باندلات",
      when: day(bundles[0].createdAt),
      body: bundle
        ? [`مقاس ${bundle.size} · ${qty(bundle.qty, 0)} قطعة`, bundle.color]
        : [`${qty(bundles.length, 0)} باندل`, `${qty(bundles.reduce((s, b) => s + b.qty, 0), 0)} قطعة`],
      to: "/production",
      code: bundle?.code ?? null,
      kind: "bundle",
      done: true,
    });

    const ids = new Set(bundles.map((b) => b.id));
    const ops = (db.bundleOps ?? [])
      .filter((o) => ids.has(o.bundleId))
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    for (const op of ops) {
      const name = operationById(db, op.operationId)?.name ?? "عملية";
      const worker = db.workers.find((w) => w.id === op.workerId)?.name;
      steps.push({
        key: `op-${op.id}`,
        title: op.state === "done" ? name : `${name} — ${op.state === "paused" ? "واقفة" : "ماشية"}`,
        when: day(op.endedAt ?? op.startedAt),
        body: [
          worker ? `${worker} · ${qty(opMinutes(op), 0)} دقيقة` : `${qty(opMinutes(op), 0)} دقيقة`,
          op.state === "done"
            ? `${qty(op.qtyGood, 0)} سليم${op.qtyRework ? ` · ${qty(op.qtyRework, 0)} إعادة` : ""}${op.qtyScrap ? ` · ${qty(op.qtyScrap, 0)} تالف` : ""}`
            : "لسه ماخلصتش",
          op.defect ? `سبب العيب: ${op.defect}` : "",
        ].filter(Boolean),
        to: "/production",
        code: (db.bundles ?? []).find((b) => b.id === op.bundleId)?.code ?? null,
        kind: "bundle",
        done: op.state === "done",
      });
    }
  }

  /* ٤) الأمر: المراحل والتقدم */
  if (order) {
    const entries = db.stageEntries.filter((e) => e.orderId === order.id);
    steps.push({
      key: "order",
      title: "أمر الإنتاج",
      when: day(order.dueDate),
      body: [
        `${order.model} · ${qty(order.quantity, 0)} قطعة`,
        `التقدم ${qty(order.progress, 0)}٪ · ${qty(entries.length, 0)} تسجيل مرحلة`,
        order.line,
      ],
      to: `/orders/${order.id}`,
      code: order.code,
      kind: "order",
      done: order.status === "done",
    });

    const subs = (db.subcontracts ?? []).filter((s) => s.orderId === order.id);
    for (const s of subs) {
      const got = (db.subReceipts ?? []).filter((r) => r.subcontractId === s.id);
      steps.push({
        key: `sub-${s.id}`,
        title: "طلع لورشة خارجية",
        when: day(s.date),
        body: [
          db.parties.find((p) => p.id === s.partyId)?.name ?? "ورشة",
          `طلع ${qty(s.qtySent, 0)} · رجع ${qty(got.reduce((t, r) => t + r.qtyGood, 0), 0)} سليم`,
          `ميعاد الرجوع ${formatDate(s.expectedDate)}`,
        ],
        to: "/outsourcing",
        code: s.code,
        kind: "subcontract",
        done: s.status === "closed",
      });
    }
  }

  /* ٥) التوريد والفاتورة والتحصيل — بالعميل، وده مكتوب في الفراغات */
  const clientId = order?.clientId ?? (doc ? docClient(db, doc.refId) : null);
  if (clientId) {
    const client = db.parties.find((p) => p.id === clientId);
    const dels = db.deliveries.filter((d) => d.clientId === clientId).sort((a, b) => b.date.localeCompare(a.date));
    const cols = db.collections.filter((c) => c.clientId === clientId).sort((a, b) => b.date.localeCompare(a.date));
    const docs = db.documents.filter((d) => d.refId === clientId || (order && d.refId === order.id));

    steps.push({
      key: "client",
      title: "العميل",
      when: null,
      body: [client?.name ?? "عميل", `${qty(dels.length, 0)} توريد · ${qty(cols.length, 0)} تحصيل`],
      to: clientId ? `/parties/${clientId}` : null,
      code: null,
      kind: "party",
      done: true,
    });

    /*
     * توريدات الأمر ده بعينه لو الربط موجود، وإلا آخر توريد للعميل.
     *
     * الفرق مهم والشاشة بتقوله: الأول حقيقة، والتاني تقريب. وقبل ما
     * يبقى في `orderId` على التوريد، كان التقريب هو الوحيد المتاح.
     */
    const mine = order ? dels.filter((d) => d.orderId === order.id) : [];
    const shown = mine.length ? mine : dels;
    if (shown[0]) {
      const exact = mine.length > 0;
      steps.push({
        key: "delivery",
        title: exact ? "اتسلّم للعميل" : "آخر توريد للعميل",
        when: day(shown[0].date),
        body: [
          shown[0].model,
          `${moneyPlain(shown[0].amount)} · استحقاق ${formatDate(shown[0].dueDate)}`,
          exact
            ? `${qty(mine.length, 0)} توريد على الأمر ده · ${qty(mine.reduce((s, d) => s + (d.quantity ?? 0), 0), 0)} قطعة`
            : "مش مربوط بأمر — ده آخر توريد للعميل",
        ],
        to: "/collections",
        code: null,
        kind: null,
        done: true,
      });
      if (!exact) {
        gaps.push("التوريد ده مش مربوط بأمر إنتاج، فاللي ظاهر آخر توريد للعميل مش توريد الأمر ده بعينه.");
      }
    }

    for (const d of docs.slice(0, 3)) {
      steps.push({
        key: `doc-${d.id}`,
        title: "مستند",
        when: day(d.date),
        body: [d.number, d.status === "cancelled" ? "ملغي" : "سارٍ"],
        to: `/verify/${encodeURIComponent(d.number)}`,
        code: d.number,
        kind: "document",
        done: d.status !== "cancelled",
      });
    }

    if (cols[0]) {
      steps.push({
        key: "collection",
        title: "آخر تحصيل",
        when: day(cols[0].date),
        body: [moneyPlain(cols[0].amount), cols[0].status === "pending" ? "مستني تأكيد" : "مؤكد"],
        to: "/collections",
        code: null,
        kind: null,
        done: cols[0].status === "confirmed",
      });
    }
  }

  if (!steps.length) {
    gaps.push("السلسلة بتبدأ من خامة أو فرشة أو باندل أو أمر إنتاج أو مستند. النوع ده لسه مش نقطة في السلسلة.");
  }

  return { head, steps, gaps: [...new Set(gaps)] };
}

function docClient(db: Db, refId: string): string | null {
  if (db.parties.some((p) => p.id === refId)) return refId;
  const order = db.orders.find((o) => o.id === refId);
  if (order?.clientId) return order.clientId;
  const delivery = db.deliveries.find((d) => d.id === refId);
  return delivery?.clientId ?? null;
}

/** حركات المسح على سجل واحد — الجزء اللي بيقول مين لمس الحاجة دي */
export function scansOf(db: Db, kind: CodeKind, id: string) {
  return (db.scans ?? []).filter((s) => s.kind === kind && s.refId === id);
}
