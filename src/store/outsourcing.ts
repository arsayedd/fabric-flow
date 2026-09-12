/**
 * صنعة — الورش الخارجية (M-F3)
 *
 * القواعد:
 *  1) **الورشة جهة تعامل** بدور `workshop` — مش جدول تاني. نفس البروفايل
 *     ونفس الهاتف ونفس سجل التواصل.
 *  2) **حساب الورشة بيتحسب من الاستلامات**، مش من فاتورة مكتوبة: كل قطعة
 *     رجعت × أجر القطعة المتفق عليه في إذن التشغيل. فلو رجع نص الكمية،
 *     المستحق نص المبلغ — بلا مفاوضة ولا نسيان.
 *  3) **الخامات اللي بتطلع للورشة بتخرج من المخزن** بحركة صرف حقيقية
 *     مربوطة بالإذن، والراجع بيدخل بحركة مرتجع. فالرصيد مايكدبش.
 *  4) **تقييم الورشة محسوب مش مكتوب**: الالتزام بالميعاد، ونسبة الفاقد،
 *     ونسبة إعادة الشغل. والتقييم بيقول أرقامه، مش نجوم بلا سبب.
 */

import { addDays, cairoToday } from "@/lib/utils";
import { subcontractCharges } from "./compute";
import { materialById, operationById, unitName } from "./manufacturing";
import type { Db, StockMovement, Subcontract, SubReceipt } from "./types";

export const SUB_STATUS_LABEL: Record<Subcontract["status"], string> = {
  open: "شغل برّه",
  closed: "مقفول",
  cancelled: "ملغي",
};

export const SUB_STATUS_TONE: Record<Subcontract["status"], "accent" | "ok" | "muted"> = {
  open: "accent",
  closed: "ok",
  cancelled: "muted",
};

export type SubMaterialRow = {
  materialId: string;
  name: string;
  unit: string;
  sent: number;
  back: number;
  /** اللي لسه عند الورشة */
  atWorkshop: number;
  cost: number;
};

/** الخامات اللي طلعت مع الإذن ورجعت منه — من دفتر المخزن نفسه */
export function subMaterials(db: Db, subcontractId: string): SubMaterialRow[] {
  const mine = db.stockMovements.filter((m) => m.refType === "subcontract" && m.refId === subcontractId);
  const ids = [...new Set(mine.map((m) => m.itemId))];
  return ids.map((materialId) => {
    const rows = mine.filter((m) => m.itemId === materialId);
    const sent = rows.filter((m) => m.qty < 0).reduce((s, m) => s + Math.abs(m.qty), 0);
    const back = rows.filter((m) => m.qty > 0).reduce((s, m) => s + m.qty, 0);
    const material = materialById(db, materialId);
    return {
      materialId,
      name: material?.name ?? "خامة محذوفة",
      unit: unitName(db, material?.unitId ?? null),
      sent,
      back,
      atWorkshop: sent - back,
      cost: rows.filter((m) => m.qty < 0).reduce((s, m) => s + Math.abs(m.qty) * m.unitCost, 0),
    };
  });
}

export type SubView = {
  sub: Subcontract;
  partyName: string;
  orderCode: string | null;
  operationName: string | null;
  receipts: SubReceipt[];
  received: number;
  rework: number;
  lost: number;
  /** المتوقع رجوعه لسه */
  outstanding: number;
  lossPct: number;
  reworkPct: number;
  /** المستحق للورشة على الإذن ده */
  charge: number;
  paid: number;
  due: number;
  /** تأخير آخر استلام عن الميعاد المتوقع — بالأيام */
  lateDays: number;
  onTime: boolean | null;
  materials: SubMaterialRow[];
  materialsOut: number;
};

export function subView(db: Db, sub: Subcontract): SubView {
  const receipts = (db.subReceipts ?? [])
    .filter((r) => r.subcontractId === sub.id)
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
  const received = receipts.reduce((s, r) => s + r.qtyGood, 0);
  const rework = receipts.reduce((s, r) => s + r.qtyRework, 0);
  const lost = receipts.reduce((s, r) => s + r.qtyLost, 0);
  const accounted = received + rework + lost;
  const charge = (received + rework) * sub.rate;
  const paid = (db.subPayments ?? []).filter((p) => p.subcontractId === sub.id).reduce((s, p) => s + p.amount, 0);
  const last = receipts[receipts.length - 1];
  const lateDays = last && last.date > sub.expectedDate ? days(sub.expectedDate, last.date) : 0;
  const materials = subMaterials(db, sub.id);

  return {
    sub,
    partyName: db.parties.find((p) => p.id === sub.partyId)?.name ?? "ورشة محذوفة",
    orderCode: sub.orderId ? (db.orders.find((o) => o.id === sub.orderId)?.code ?? null) : null,
    operationName: sub.operationId ? (operationById(db, sub.operationId)?.name ?? null) : null,
    receipts,
    received,
    rework,
    lost,
    outstanding: Math.max(0, sub.qtySent - accounted),
    lossPct: sub.qtySent > 0 ? (lost / sub.qtySent) * 100 : 0,
    reworkPct: sub.qtySent > 0 ? (rework / sub.qtySent) * 100 : 0,
    charge,
    paid,
    due: charge - paid,
    lateDays,
    onTime: last ? lateDays === 0 : null,
    materials,
    materialsOut: materials.reduce((s, m) => s + m.atWorkshop, 0),
  };
}

function days(from: string, to: string): number {
  return Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));
}

export function subViews(db: Db): SubView[] {
  return (db.subcontracts ?? [])
    .map((s) => subView(db, s))
    .sort((a, b) => (a.sub.date === b.sub.date ? b.sub.code.localeCompare(a.sub.code) : b.sub.date.localeCompare(a.sub.date)));
}

/* ── تقييم الورشة ────────────────────────────────────────────── */

export type WorkshopScore = {
  partyId: string;
  name: string;
  jobs: number;
  pieces: number;
  received: number;
  lost: number;
  lossPct: number;
  reworkPct: number;
  onTimePct: number | null;
  /** متوسط أجر القطعة على كل الأعمال */
  avgRate: number;
  charge: number;
  paid: number;
  due: number;
  /** سكور من ١٠٠ — بأسبابه */
  score: number | null;
  reasons: string[];
  openJobs: number;
  materialsOut: number;
};

/**
 * سكور الورشة = ٥٠٪ التزام بالميعاد + ٣٠٪ سلامة الكمية + ٢٠٪ قلة إعادة
 * الشغل. والأوزان دي مكتوبة هنا صريحة عشان تتناقش، مش مخفية في الكود:
 * الميعاد أهم حاجة لأن تأخير الورشة بيأخّر تسليم العميل، وبعده الفاقد
 * لأنه فلوس ضايعة، وبعده إعادة الشغل لأنها وقت مصنعك أنت.
 *
 * والورشة اللي مارجّعتش أي حاجة لسه **مالهاش سكور** — بنقول «لسه بدري».
 */
export function workshopScores(db: Db): WorkshopScore[] {
  const ids = [...new Set((db.subcontracts ?? []).filter((s) => s.status !== "cancelled").map((s) => s.partyId))];
  return ids
    .map((partyId) => {
      const views = subViews(db).filter((v) => v.sub.partyId === partyId && v.sub.status !== "cancelled");
      const pieces = views.reduce((s, v) => s + v.sub.qtySent, 0);
      const received = views.reduce((s, v) => s + v.received, 0);
      const rework = views.reduce((s, v) => s + v.rework, 0);
      const lost = views.reduce((s, v) => s + v.lost, 0);
      const judged = views.filter((v) => v.onTime !== null);
      const onTimePct = judged.length ? (judged.filter((v) => v.onTime).length / judged.length) * 100 : null;
      const lossPct = pieces > 0 ? (lost / pieces) * 100 : 0;
      const reworkPct = pieces > 0 ? (rework / pieces) * 100 : 0;
      const charge = views.reduce((s, v) => s + v.charge, 0);
      const paid = views.reduce((s, v) => s + v.paid, 0);

      const reasons: string[] = [];
      let score: number | null = null;
      if (onTimePct !== null) {
        const timePart = (onTimePct / 100) * 50;
        const lossPart = Math.max(0, 1 - lossPct / 5) * 30;
        const reworkPart = Math.max(0, 1 - reworkPct / 10) * 20;
        score = Math.round(timePart + lossPart + reworkPart);
        reasons.push(
          onTimePct >= 90 ? "بتسلّم في الميعاد" : `بتأخّر — ${Math.round(100 - onTimePct)}٪ من الأعمال رجعت بعد الميعاد`,
        );
        if (lossPct > 2) reasons.push(`فاقد ${lossPct.toFixed(1)}٪ من الكمية`);
        else reasons.push("الفاقد في الحدود");
        if (reworkPct > 5) reasons.push(`إعادة شغل ${reworkPct.toFixed(1)}٪`);
      } else {
        reasons.push("لسه مارجّعتش شغل — مفيش أساس للتقييم");
      }

      return {
        partyId,
        name: db.parties.find((p) => p.id === partyId)?.name ?? "ورشة",
        jobs: views.length,
        pieces,
        received,
        lost,
        lossPct,
        reworkPct,
        onTimePct,
        avgRate: pieces > 0 ? views.reduce((s, v) => s + v.sub.rate * v.sub.qtySent, 0) / pieces : 0,
        charge,
        paid,
        due: charge - paid,
        score,
        reasons,
        openJobs: views.filter((v) => v.sub.status === "open").length,
        materialsOut: views.reduce((s, v) => s + v.materialsOut, 0),
      };
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

/* ── كشف حساب الورشة ─────────────────────────────────────────── */

export type WorkshopLine = {
  id: string;
  date: string;
  kind: "charge" | "payment";
  label: string;
  debit: number;
  credit: number;
  balance: number;
};

/** كشف حساب الورشة: مستحق من الاستلامات، ومدفوع من الخزينة، برصيد متحرك */
export function workshopStatement(db: Db, partyId: string): WorkshopLine[] {
  const lines: Omit<WorkshopLine, "balance">[] = [];
  for (const c of subcontractCharges(db).filter((x) => x.partyId === partyId)) {
    const sub = (db.subcontracts ?? []).find((s) => s.id === c.subcontractId);
    lines.push({
      id: `${c.subcontractId}-${c.date}-${c.amount}`,
      date: c.date,
      kind: "charge",
      label: `استلام شغل${sub ? ` — ${sub.code}` : ""}`,
      debit: c.amount,
      credit: 0,
    });
  }
  for (const p of (db.subPayments ?? []).filter((x) => x.partyId === partyId)) {
    lines.push({ id: p.id, date: p.date, kind: "payment", label: p.notes.trim() || "دفعة للورشة", debit: 0, credit: p.amount });
  }
  lines.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
  let bal = 0;
  return lines.map((l) => {
    bal += l.debit - l.credit;
    return { ...l, balance: bal };
  });
}

/** الأعمال المتأخرة عن ميعادها المتوقع وهي لسه مفتوحة */
export function lateSubcontracts(db: Db): SubView[] {
  const today = cairoToday();
  return subViews(db).filter((v) => v.sub.status === "open" && v.sub.expectedDate < today && v.outstanding > 0);
}

/** الأعمال اللي ميعادها في الأيام الجاية */
export function dueSubcontracts(db: Db, withinDays = 3): SubView[] {
  const today = cairoToday();
  const until = addDays(today, withinDays);
  return subViews(db).filter(
    (v) => v.sub.status === "open" && v.outstanding > 0 && v.sub.expectedDate >= today && v.sub.expectedDate <= until,
  );
}

/** حركة خامات مربوطة بإذن تشغيل — بنفس شكل أي حركة مخزن تانية */
export function subMovement(
  factoryId: string,
  id: string,
  subcontractId: string,
  materialId: string,
  warehouseId: string | null,
  qty: number,
  unitCost: number,
  date: string,
  code: string,
): StockMovement {
  return {
    id,
    factoryId,
    date,
    itemType: "material",
    itemId: materialId,
    warehouseId,
    kind: qty < 0 ? "issue" : "return",
    qty,
    unitCost,
    refType: "subcontract",
    refId: subcontractId,
    notes: qty < 0 ? `خامات طلعت لورشة — ${code}` : `خامات رجعت من ورشة — ${code}`,
  };
}
