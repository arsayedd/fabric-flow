/**
 * صنعة — القص والفرشة (M-F1)
 *
 * القاعدة الحاكمة: **الفرشة مش رقم مكتوب بالإيد.** المصنع بيدخل اللي هو
 * فعلًا بيقيسه على الترابيزة — طول الماركر، عدد الطبقات، وكم قطعة من كل
 * مقاس في الطبقة — والباقي كله محسوب:
 *
 *   القطع        = Σ (قطع المقاس في الطبقة) × عدد الطبقات
 *   القماش المخطّط = (طول الماركر + فاقد الأطراف) × عدد الطبقات
 *   المتر للقطعة  = القماش ÷ القطع
 *   الاستغلال %   = المعياري (من قائمة الخامات) ÷ الفعلي للقطعة
 *
 * ومعنى الاستغلال هنا مهم: **مش نسبة سحرية**، ده مقارنة بين اللي القماش
 * طلعه فعلًا واللي قائمة الخامات وعدت بيه. ١٠٠٪ معناها الفرشة مشيت على
 * المعياري بالظبط، وأقل من كده معناها القماش ضايع أكتر من المتوقع —
 * ولو مفيش معياري مسجّل، مابنخترعش رقم وبنقول «مفيش معياري نقارن بيه».
 */

import { activeBom, bomLines, materialById, unitName } from "./manufacturing";
import type { Bundle, CutLay, CutLayLine, Db, Order } from "./types";

export const LAY_STATUS_LABEL: Record<CutLay["status"], string> = {
  planned: "مخطّطة",
  cut: "مقصوصة",
  cancelled: "ملغية",
};

export const LAY_STATUS_TONE: Record<CutLay["status"], "accent" | "ok" | "muted"> = {
  planned: "accent",
  cut: "ok",
  cancelled: "muted",
};

export function layLines(db: Db, layId: string): CutLayLine[] {
  return (db.cutLayLines ?? []).filter((l) => l.layId === layId);
}

export type LaySize = {
  id: string;
  size: string;
  perPly: number;
  pieces: number;
  /** نسبة المقاس من الفرشة */
  sharePct: number;
};

export type LayMath = {
  lay: CutLay;
  order: Order | null;
  materialName: string;
  unit: string;
  sizes: LaySize[];
  pieces: number;
  /** القماش المخطّط له بالمتر */
  plannedM: number;
  /** المستهلك فعلًا — نفس المخطّط لحد ما القص يتسجّل بقيمة مختلفة */
  actualM: number | null;
  /** متر لكل قطعة (فعلي لو القص اتسجّل، وإلا مخطّط) */
  perPieceM: number;
  /** المعياري من قائمة الخامات — null لو القماش ده مش في الـBOM */
  standardM: number | null;
  /** الاستغلال % — المعياري ÷ الفعلي */
  utilizationPct: number | null;
  /** الهالك % فوق المعياري */
  wastePct: number | null;
  /** فاقد الأطراف كنسبة من القماش */
  endLossPct: number;
  cost: number;
  bundles: Bundle[];
  bundledPieces: number;
};

export function layMath(db: Db, lay: CutLay): LayMath {
  const lines = layLines(db, lay.id);
  const order = db.orders.find((o) => o.id === lay.orderId) ?? null;
  const material = materialById(db, lay.materialId);
  const perPlyTotal = lines.reduce((s, l) => s + l.perPly, 0);
  const pieces = perPlyTotal * lay.plies;

  const plannedM = (lay.markerLengthM + lay.endAllowanceM) * lay.plies;
  const actualM = lay.status === "cut" ? (lay.fabricUsedM ?? plannedM) : null;
  const used = actualM ?? plannedM;
  const perPieceM = pieces > 0 ? used / pieces : 0;

  const standardM = standardConsumption(db, order, lay.materialId);
  const utilizationPct = standardM && perPieceM > 0 ? (standardM / perPieceM) * 100 : null;
  const wastePct = standardM && standardM > 0 ? ((perPieceM - standardM) / standardM) * 100 : null;

  const bundles = (db.bundles ?? []).filter((b) => b.layId === lay.id);

  return {
    lay,
    order,
    materialName: material?.name ?? "خامة محذوفة",
    unit: unitName(db, material?.unitId ?? null),
    sizes: lines.map((l) => ({
      id: l.id,
      size: l.size,
      perPly: l.perPly,
      pieces: l.perPly * lay.plies,
      sharePct: perPlyTotal > 0 ? (l.perPly / perPlyTotal) * 100 : 0,
    })),
    pieces,
    plannedM,
    actualM,
    perPieceM,
    standardM,
    utilizationPct,
    wastePct,
    endLossPct: plannedM > 0 ? ((lay.endAllowanceM * lay.plies) / plannedM) * 100 : 0,
    cost: used * (material?.avgCost ?? 0),
    bundles,
    bundledPieces: bundles.reduce((s, b) => s + b.qty, 0),
  };
}

/**
 * المعياري للقطعة من قائمة الخامات — **الكمية الصافية من غير الهالك**.
 * بنقارن الفرشة بالصافي عن قصد: نسبة الهالك المسجّلة في الـBOM هي
 * *توقّع* للفاقد، ولو قارنّا بيها كنا بنسمح للفرشة تضيّع الهالك المتوقع
 * وتقول إنها ١٠٠٪. الفرق بين الفعلي والصافي هو الهالك الحقيقي.
 */
export function standardConsumption(db: Db, order: Order | null, materialId: string): number | null {
  if (!order?.productId) return null;
  const bomId = order.bomId ?? activeBom(db, order.productId)?.id ?? null;
  const line = bomLines(db, bomId).find((l) => l.materialId === materialId);
  return line ? line.qtyPerUnit : null;
}

/** فرشات الأمر مرتبة بالأحدث */
export function orderLays(db: Db, orderId: string): CutLay[] {
  return (db.cutLays ?? [])
    .filter((l) => l.orderId === orderId)
    .sort((a, b) => (a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date)));
}

export type CutSummary = {
  /** القطع المقصوصة فعلًا */
  cutPieces: number;
  /** القطع المخططة في فرشات لسه ماتقصّتش */
  plannedPieces: number;
  fabricM: number;
  perPieceM: number | null;
  standardM: number | null;
  utilizationPct: number | null;
  wastePct: number | null;
  /** الباقي من كمية الأمر بعد القص */
  remaining: number;
};

/** ملخص القص لأمر واحد: الفرشات كلها مجموعة */
export function orderCutSummary(db: Db, order: Order): CutSummary {
  const lays = orderLays(db, order.id).filter((l) => l.status !== "cancelled");
  let cutPieces = 0;
  let plannedPieces = 0;
  let fabricM = 0;
  let standardSum = 0;
  let standardPieces = 0;

  for (const lay of lays) {
    const m = layMath(db, lay);
    if (lay.status === "cut") {
      cutPieces += m.pieces;
      fabricM += m.actualM ?? m.plannedM;
      if (m.standardM !== null) {
        standardSum += m.standardM * m.pieces;
        standardPieces += m.pieces;
      }
    } else {
      plannedPieces += m.pieces;
    }
  }

  const perPieceM = cutPieces > 0 ? fabricM / cutPieces : null;
  const standardM = standardPieces > 0 ? standardSum / standardPieces : null;
  return {
    cutPieces,
    plannedPieces,
    fabricM,
    perPieceM,
    standardM,
    utilizationPct: standardM && perPieceM ? (standardM / perPieceM) * 100 : null,
    wastePct: standardM && perPieceM ? ((perPieceM - standardM) / standardM) * 100 : null,
    remaining: Math.max(0, order.quantity - cutPieces),
  };
}

/**
 * حاسبة الرول: الرول بطوله ده بيطلع كام قطعة؟
 *
 * الحساب مش `طول الرول ÷ متر القطعة` — الفرشة بتتفرش طبقات كاملة، فالرول
 * بيطلع **عدد صحيح من الطبقات**، وأي باقي أقل من طبقة بيتحول لبواقي.
 */
export type RollPlan = {
  rollM: number;
  plyLengthM: number;
  piecesPerPly: number;
  plies: number;
  pieces: number;
  /** الباقي اللي ماينفعش يبقى طبقة */
  leftoverM: number;
  leftoverPct: number;
};

export function rollPlan(rollM: number, markerLengthM: number, endAllowanceM: number, piecesPerPly: number): RollPlan {
  const plyLengthM = markerLengthM + endAllowanceM;
  const plies = plyLengthM > 0 ? Math.floor(rollM / plyLengthM) : 0;
  const used = plies * plyLengthM;
  return {
    rollM,
    plyLengthM,
    piecesPerPly,
    plies,
    pieces: plies * piecesPerPly,
    leftoverM: Math.max(0, rollM - used),
    leftoverPct: rollM > 0 ? (Math.max(0, rollM - used) / rollM) * 100 : 0,
  };
}

/**
 * تقسيم قطع الفرشة على باندلات.
 *
 * كل مقاس بيتقسّم لباندلات بحجم واحد، والباقي بياخد باندل أصغر — لأن
 * ده اللي بيحصل على الترابيزة فعلًا: مابنخلطش مقاسين في باندل واحد،
 * وباقي الـ١٣ قطعة بيتربط لوحده بتيكت مكتوب عليه ١٣.
 */
export type BundlePlan = { size: string; qty: number; seq: number };

export function planBundles(sizes: { size: string; pieces: number }[], perBundle: number): BundlePlan[] {
  const size = Math.max(1, Math.floor(perBundle));
  const out: BundlePlan[] = [];
  let seq = 0;
  for (const row of sizes) {
    let left = Math.floor(row.pieces);
    while (left > 0) {
      const take = Math.min(size, left);
      seq += 1;
      out.push({ size: row.size, qty: take, seq });
      left -= take;
    }
  }
  return out;
}

/** رقم الباندل: كود الأمر + مسلسل داخل الأمر، فالتيكت بيقرأ لوحده */
export function nextBundleSeq(db: Db, orderId: string): number {
  const mine = (db.bundles ?? []).filter((b) => b.orderId === orderId);
  return mine.reduce((max, b) => Math.max(max, Number(b.code.split("-").pop()) || 0), 0) + 1;
}

export function bundleCode(orderCode: string, seq: number): string {
  return `${orderCode}-B${String(seq).padStart(3, "0")}`;
}
