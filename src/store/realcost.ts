/**
 * SANAA Intelligence Layer — التكلفة الحقيقية وترتيب الموديلات
 * -------------------------------------------------------------
 * الطبقة دي مابتسجّلش بيانات جديدة. شغلتها الوحيدة إنها **تربط أرقام من
 * دفاتر مختلفة وتستنتج** الحاجة اللي مفيش شاشة لوحدها بتقولها:
 *
 *   شاشة المشتريات بتقول إن المورّد ده أرخص واحد.
 *   شاشة الهالك بتقول إن الخامة دي بتاكل أكتر من المخطط.
 *   شاشة المرتجعات بتقول إن الخامة دي رجعت مرتين.
 *
 * التلاتة صح، والتلاتة لوحدهم مايوصلوش لأي قرار. اللي بيوصل للقرار هو
 * جمعهم في رقم واحد: **المورّد ده أغلى فعلًا رغم إن سعره أقل.**
 *
 * وقواعد الملف نفس قواعد باقي طبقات الذكاء في النظام:
 *
 * 1. كل مكوّن بيرجّع الرقم اللي اتبنى عليه (`why`) — مفيش رقم بدون سند.
 * 2. المكوّن اللي بياناته مش موجودة بيرجّع `null` مع سبب مكتوب، ومابياخدش
 *    صفر. لأن صفر معناه «قِسناه وطلع كويس»، و`null` معناه «مش عارفين».
 * 3. الحكم النهائي بيقول تغطيته كام في المية، فصاحب المصنع يعرف هو بيقرر
 *    على بيانات كاملة ولا على نص الصورة.
 */

import { addDays, cairoToday } from "@/lib/utils";
import { entryCredit, isEffective } from "./compute";
import { costSheet, modelVolume, profitScore } from "./costing";
import { activeBom, bomLines } from "./manufacturing";
import type { Db, Party } from "./types";

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const round = (n: number) => Math.round(n * 10) / 10;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* ── المورّد: السعر مقابل التكلفة الحقيقية ───────────────────── */

export type CostFactor = {
  key: "price" | "waste" | "returns";
  label: string;
  /** الفرق بالنسبة المئوية على قيمة الشراء — موجب معناه بيكلّف زيادة */
  pct: number | null;
  why: string;
  /** السبب اللي مانعنا نحسبه، لو مش محسوب */
  missing: string | null;
};

export type SupplierRealCost = {
  partyId: string;
  name: string;
  /** قيمة الشراء المربوطة بخامات فعلية — الأساس اللي كل النِسب محسوبة عليه */
  linkedValue: number;
  /** قيمة الشراء الكلية من دفتر المصروفات */
  totalValue: number;
  factors: CostFactor[];
  /** فرق السعر لوحده: سالب معناه أرخص من الوسيط */
  pricePct: number | null;
  /** الفرق الكلي بعد الهالك والمرتجعات */
  realPct: number | null;
  /** كام في المية من الحساب مبني على بيانات موجودة */
  coverage: number;
  /** الجملة اللي بتتقال لصاحب المصنع */
  verdict: string | null;
  /** السعر أرخص والتكلفة أغلى — ودي الحالة اللي الشاشات التانية مابتكشفهاش */
  flipped: boolean;
  materials: { id: string; name: string; share: number; soleSource: boolean }[];
};

/**
 * الخامات اللي المورّد ده وردها فعلًا.
 *
 * والربط بيمشي: حركة شراء في دفتر المخزون → فاتورة المصروف (`refType`
 * بيساوي `cost_entry`) → جهة التعامل. ومن غير الحركة دي، الفاتورة بتقول
 * «قماش بـ٣٨ ألف» وماتقولش أنهي خامة بالتحديد — فمش كل شراء بيدخل
 * الحساب، والجزء اللي مادخلش بيتقال بالصريح في `linkedValue`.
 */
function suppliedMaterials(db: Db, partyId: string) {
  const entryIds = new Set(db.costEntries.filter((e) => e.partyId === partyId).map((e) => e.id));
  const moves = db.stockMovements.filter(
    (m) => m.itemType === "material" && m.kind === "purchase" && m.refType === "cost_entry" && entryIds.has(m.refId ?? ""),
  );
  const byMaterial = new Map<string, { qty: number; value: number }>();
  for (const m of moves) {
    const cur = byMaterial.get(m.itemId) ?? { qty: 0, value: 0 };
    cur.qty += Math.abs(m.qty);
    cur.value += Math.abs(m.qty) * m.unitCost;
    byMaterial.set(m.itemId, cur);
  }
  return byMaterial;
}

/** مين وردّ الخامة دي — بيحدد الهالك ينفع يتحمّل على مورّد واحد ولا لأ */
function sourcesOf(db: Db, materialId: string): Set<string> {
  const out = new Set<string>();
  for (const m of db.stockMovements) {
    if (m.itemType !== "material" || m.itemId !== materialId || m.kind !== "purchase" || m.refType !== "cost_entry") continue;
    const entry = db.costEntries.find((e) => e.id === m.refId);
    if (entry?.partyId) out.add(entry.partyId);
  }
  return out;
}

/** نسبة الهالك المخططة للخامة من قوائم الخامات اللي بتستخدمها */
function plannedWastePct(db: Db, materialId: string): number | null {
  const pcts: number[] = [];
  for (const product of db.products) {
    const bom = activeBom(db, product.id);
    if (!bom) continue;
    for (const line of bomLines(db, bom.id)) {
      if (line.materialId === materialId) pcts.push(line.wastePct);
    }
  }
  return pcts.length ? sum(pcts) / pcts.length : null;
}

/** نسبة الهالك الفعلية: الهالك على إجمالي اللي خرج من المخزن */
function actualWastePct(db: Db, materialId: string): number | null {
  const moves = db.stockMovements.filter((m) => m.itemType === "material" && m.itemId === materialId);
  const issued = sum(moves.filter((m) => m.kind === "issue").map((m) => Math.abs(m.qty)));
  const waste = sum(moves.filter((m) => m.kind === "waste").map((m) => Math.abs(m.qty)));
  const out = issued + waste;
  return out > 0 ? (waste / out) * 100 : null;
}

export function supplierRealCost(db: Db, partyId: string): SupplierRealCost {
  const party = db.parties.find((p) => p.id === partyId);
  const entries = db.costEntries.filter((e) => e.partyId === partyId);
  const totalValue = sum(entries.map((e) => e.amount));
  const supplied = suppliedMaterials(db, partyId);
  const linkedValue = sum([...supplied.values()].map((v) => v.value));

  const materials = [...supplied.entries()].map(([id, v]) => {
    const sources = sourcesOf(db, id);
    return {
      id,
      name: db.materials.find((m) => m.id === id)?.name ?? "خامة محذوفة",
      share: linkedValue > 0 ? (v.value / linkedValue) * 100 : 0,
      soleSource: sources.size === 1,
    };
  });

  const factors: CostFactor[] = [];

  /* ١) السعر: سعر وحدة المورّد مقابل وسيط المصنع لنفس الخامة */
  const priceGaps: { gap: number; weight: number; name: string }[] = [];
  for (const [materialId, v] of supplied) {
    const all = db.stockMovements
      .filter((m) => m.itemType === "material" && m.itemId === materialId && m.kind === "purchase" && m.unitCost > 0)
      .map((m) => m.unitCost);
    if (all.length < 2) continue;
    const med = median(all);
    const mine = v.qty > 0 ? v.value / v.qty : 0;
    if (med > 0 && mine > 0) {
      priceGaps.push({ gap: ((mine - med) / med) * 100, weight: v.value, name: db.materials.find((m) => m.id === materialId)?.name ?? "" });
    }
  }
  if (priceGaps.length) {
    const w = sum(priceGaps.map((g) => g.weight));
    const pct = w > 0 ? sum(priceGaps.map((g) => g.gap * g.weight)) / w : 0;
    factors.push({
      key: "price",
      label: "سعر الشراء",
      pct,
      why:
        pct < 0
          ? `أرخص من وسيط المصنع بـ${round(Math.abs(pct))}٪ على ${priceGaps.length} خامة`
          : `أعلى من وسيط المصنع بـ${round(pct)}٪ على ${priceGaps.length} خامة`,
      missing: null,
    });
  } else {
    factors.push({
      key: "price",
      label: "سعر الشراء",
      pct: null,
      why: "",
      missing: linkedValue > 0 ? "مشتريات من مورّد تاني لنفس الخامة نقارن بيها" : "ربط فواتير الشراء بالخامات في دفتر المخزون",
    });
  }

  /*
   * ٢) الهالك.
   *
   * والهالك **مابيتحمّلش على مورّد إلا لو هو الوحيد اللي بيورد الخامة**.
   * السبب إن الرول مالوش هوية في الدفتر لسه، فلو خامة جاية من مورّدين
   * وطلع فيها هالك زيادة، مفيش حاجة في البيانات تقول الهالك ده طلع من
   * رول مين. وتوزيع الهالك بالنسبة كان هيطلع رقم شكله علمي ومعناه صفر.
   */
  const sole = materials.filter((m) => m.soleSource);
  const wasteRows = sole
    .map((m) => ({ ...m, actual: actualWastePct(db, m.id), planned: plannedWastePct(db, m.id) }))
    .filter((m): m is typeof m & { actual: number; planned: number } => m.actual !== null && m.planned !== null);
  if (wasteRows.length) {
    const w = sum(wasteRows.map((r) => r.share));
    const extra = w > 0 ? sum(wasteRows.map((r) => (r.actual - r.planned) * r.share)) / w : 0;
    const worst = [...wasteRows].sort((a, b) => b.actual - b.planned - (a.actual - a.planned))[0];
    factors.push({
      key: "waste",
      label: "الهالك",
      pct: extra,
      why: `${worst.name}: هالك فعلي ${round(worst.actual)}٪ والمخطط ${round(worst.planned)}٪`,
      missing: null,
    });
  } else {
    factors.push({
      key: "waste",
      label: "الهالك",
      pct: null,
      why: "",
      missing:
        materials.length === 0
          ? "ربط فواتير الشراء بالخامات"
          : sole.length === 0
            ? "الخامات دي جاية من أكتر من مورّد — الهالك مايتحمّلش على واحد بدون تتبع الرول"
            : "حركات هالك ونسبة هالك مخططة في قائمة الخامات",
    });
  }

  /* ٣) المرتجعات: اللي رجع للمورّد وماخدناش مقابله */
  const rows = db.returns.filter((r) => r.source === "supplier" && r.partyId === partyId && r.status !== "cancelled");
  if (rows.length && linkedValue > 0) {
    const settled = rows.filter(isEffective);
    const value = sum(settled.map((r) => r.qty * r.unitValue));
    const covered = sum(settled.map((r) => (r.resolution === "replacement" ? r.qty * r.unitValue : r.settleAmount)));
    const extraCost = sum(rows.map((r) => r.extraCost));
    const uncovered = Math.max(0, value - covered) + extraCost;
    factors.push({
      key: "returns",
      label: "المرتجعات",
      pct: (uncovered / linkedValue) * 100,
      why:
        uncovered > 0
          ? `رجّعنا له ${rows.length} مرتجع بقيمة ${Math.round(value)} ج وغطّى ${Math.round(covered)} ج`
          : `رجّعنا له ${rows.length} مرتجع وغطّاهم بالكامل`,
      missing: null,
    });
  } else {
    factors.push({
      key: "returns",
      label: "المرتجعات",
      pct: rows.length ? null : 0,
      why: rows.length ? "" : "مافيش مرتجعات مسجّلة عليه",
      missing: rows.length ? "قيمة شراء مربوطة نقيس المرتجعات عليها" : null,
    });
  }

  const known = factors.filter((f) => f.pct !== null);
  const pricePct = factors.find((f) => f.key === "price")?.pct ?? null;
  const realPct = known.length ? sum(known.map((f) => f.pct as number)) : null;
  const coverage = (known.length / factors.length) * 100;

  const flipped = pricePct !== null && realPct !== null && pricePct < -0.5 && realPct > 0.5;
  let verdict: string | null = null;
  if (realPct !== null && pricePct !== null) {
    if (flipped) {
      verdict = `${party?.name ?? "المورّد"} أرخص ${round(Math.abs(pricePct))}٪ في السعر، وأغلى ${round(realPct)}٪ في التكلفة الحقيقية.`;
    } else if (realPct > 0.5) {
      verdict = `${party?.name ?? "المورّد"} أغلى ${round(realPct)}٪ في التكلفة الحقيقية.`;
    } else if (realPct < -0.5) {
      verdict = `${party?.name ?? "المورّد"} أرخص ${round(Math.abs(realPct))}٪ في التكلفة الحقيقية.`;
    } else {
      verdict = `${party?.name ?? "المورّد"} تكلفته الحقيقية زي وسيط المصنع.`;
    }
  }

  return {
    partyId,
    name: party?.name ?? "جهة محذوفة",
    linkedValue,
    totalValue,
    factors,
    pricePct,
    realPct,
    coverage,
    verdict,
    flipped,
    materials: materials.sort((a, b) => b.share - a.share),
  };
}

/** كل الموردين اللي عندهم مشتريات، مرتبين بالأغلى تكلفة حقيقية */
export function supplierRealCosts(db: Db): SupplierRealCost[] {
  const ids = [...new Set(db.costEntries.map((e) => e.partyId).filter((x): x is string => !!x))];
  return ids
    .map((id) => supplierRealCost(db, id))
    .filter((r) => r.totalValue > 0)
    .sort((a, b) => (b.realPct ?? -Infinity) - (a.realPct ?? -Infinity));
}

/* ── الموديل: ترتيبه في البيع مقابل ترتيبه في الربح ──────────── */

export type RankGap = {
  productId: string;
  name: string;
  sku: string;
  salesRank: number;
  profitRank: number;
  /** موجب معناه بيبيع أكتر مما بيكسب */
  gap: number;
  soldQty: number;
  soldRevenue: number;
  unitProfit: number | null;
  totalProfit: number;
  score: number | null;
  /** الفرق كبير لدرجة إنها محتاجة قرار */
  flagged: boolean;
  verdict: string;
  why: string[];
};

/**
 * ترتيب الموديلات بمقياسين مختلفين في نفس الوقت.
 *
 * الفكرة كلها إن الترتيبين **مش نفس الترتيب**، والفرق بينهم هو المعلومة.
 * الموديل اللي رقم ٢ في البيع ورقم ١٧ في الربح مش موديل فاشل — هو موديل
 * شغّال المصنع كله وبيرجّع أقل هامش، وده قرار سعر أو قرار تكلفة، مش قرار
 * إيقاف. وأي شاشة بترتّب بمقياس واحد بتخفي الحالة دي تمامًا.
 *
 * والترتيب بالكمية المتسلّمة مش بالكمية المنتَجة، لأن السؤال هنا تجاري:
 * الموديل بيتحرك في السوق قد إيه.
 */
export function rankGaps(db: Db): RankGap[] {
  const rows = db.products.map((product) => {
    const vol = modelVolume(db, product.id);
    const sheet = costSheet(db, product.id);
    const score = profitScore(db, product.id);
    return {
      product,
      soldQty: vol.soldQty,
      soldRevenue: vol.soldRevenue,
      unitProfit: sheet.priceKnown && sheet.hasBom ? sheet.profit : null,
      totalProfit: (sheet.priceKnown && sheet.hasBom ? sheet.profit : 0) * vol.soldQty,
      score: score.total,
    };
  });

  const bySales = [...rows].sort((a, b) => b.soldQty - a.soldQty || b.soldRevenue - a.soldRevenue);
  const byProfit = [...rows].sort((a, b) => b.totalProfit - a.totalProfit || (b.unitProfit ?? -Infinity) - (a.unitProfit ?? -Infinity));
  const salesRank = new Map(bySales.map((r, i) => [r.product.id, i + 1]));
  const profitRank = new Map(byProfit.map((r, i) => [r.product.id, i + 1]));
  const n = rows.length;

  return rows
    .map((r) => {
      const sr = salesRank.get(r.product.id) as number;
      const pr = profitRank.get(r.product.id) as number;
      const gap = pr - sr;
      const why: string[] = [];
      if (r.soldQty > 0) why.push(`اتسلّم منه ${Math.round(r.soldQty)} قطعة بـ${Math.round(r.soldRevenue)} ج`);
      if (r.unitProfit !== null) why.push(`ربح القطعة ${Math.round(r.unitProfit)} ج`);
      else why.push("ربح القطعة مش محسوب — ناقص سعر بيع أو قائمة خامات");
      const ret = db.returns.filter(
        (x) => x.source === "customer" && x.itemType === "product" && x.itemId === r.product.id && x.status !== "cancelled",
      );
      if (ret.length) why.push(`رجع منه ${sum(ret.map((x) => x.qty))} قطعة في ${ret.length} مرتجع`);

      /*
       * الفرق بيبقى محتاج قرار لما الموديل يكون في **النص الأعلى** في
       * البيع وينزل أكتر من تلت عدد الموديلات في الربح. الشرطين مع بعض
       * عشان مانزعّقش على موديل بيبيع قطعتين.
       */
      const flagged = n >= 3 && sr <= Math.ceil(n / 2) && gap >= Math.max(2, Math.ceil(n / 3)) && r.soldQty > 0;

      return {
        productId: r.product.id,
        name: r.product.name,
        sku: r.product.sku,
        salesRank: sr,
        profitRank: pr,
        gap,
        soldQty: r.soldQty,
        soldRevenue: r.soldRevenue,
        unitProfit: r.unitProfit,
        totalProfit: r.totalProfit,
        score: r.score,
        flagged,
        verdict: `رقم ${sr} في البيع، ورقم ${pr} في الربحية من ${n} موديل.`,
        why,
      };
    })
    .sort((a, b) => b.gap - a.gap || a.salesRank - b.salesRank);
}

/* ── الاستنتاجات جاهزة للعرض ─────────────────────────────────── */

export type Finding = {
  key: string;
  tone: "danger" | "warn" | "gold";
  headline: string;
  why: string[];
  action: string;
  to: string;
  /** تغطية البيانات — تحت ٦٧٪ معناه الحكم مبني على نص الصورة */
  coverage: number | null;
};

/**
 * الاستنتاجات اللي الطبقة دي بتوصلها، مرتبة بالأهم.
 *
 * ومافيش استنتاج هنا بيتقال من رقم واحد: كل واحد جامع على الأقل دفترين
 * مختلفين (شراء + هالك، أو بيع + تكلفة + مرتجعات). ولو الدفتر التاني
 * فاضي، الاستنتاج مابيطلعش خالص — أحسن من إننا نقوله حاجة نصها معروف.
 */
export function findings(db: Db): Finding[] {
  const out: Finding[] = [];

  for (const s of supplierRealCosts(db)) {
    if (!s.verdict || s.realPct === null) continue;
    if (!s.flipped && s.realPct <= 2) continue;
    out.push({
      key: `supplier-real-${s.partyId}`,
      tone: s.flipped ? "danger" : "warn",
      headline: s.verdict,
      why: s.factors.filter((f) => f.pct !== null && f.why).map((f) => `${f.label}: ${f.why}`),
      action: s.flipped
        ? "قارن عرضه بمورّد تاني على التكلفة بعد الهالك والمرتجعات، مش على سعر المتر"
        : "تفاوض على السعر أو راجع مواصفة الخامة اللي بترجع",
      to: `/parties/${s.partyId}`,
      coverage: s.coverage,
    });
  }

  for (const g of rankGaps(db)) {
    if (!g.flagged) continue;
    out.push({
      key: `rank-gap-${g.productId}`,
      tone: "warn",
      headline: `${g.name}: ${g.verdict}`,
      why: g.why,
      action: "راجع سعر البيع أو تكلفة الخامة — الموديل ده شغّال المصنع وبيرجّع أقل هامش",
      to: `/costing/${g.productId}`,
      coverage: null,
    });
  }

  /*
   * الموديل اللي نسبة إرجاعه عالية: ده استنتاج من دفترين — التسليم
   * والمرتجعات — ومابيطلعش إلا لو الاتنين فيهم أرقام.
   */
  const today = cairoToday();
  const from90 = addDays(today, -90);
  for (const product of db.products) {
    const vol = modelVolume(db, product.id);
    const rows = db.returns.filter(
      (r) => r.source === "customer" && r.itemType === "product" && r.itemId === product.id && r.status !== "cancelled" && r.date >= from90,
    );
    if (!rows.length || vol.soldQty <= 0) continue;
    const qty = sum(rows.map((r) => r.qty));
    const pct = (qty / vol.soldQty) * 100;
    if (pct < 5) continue;
    const reasons = new Map<string, number>();
    for (const r of rows) reasons.set(r.reasonNote.trim() || r.reason, (reasons.get(r.reasonNote.trim() || r.reason) ?? 0) + r.qty);
    const top = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0];
    out.push({
      key: `return-rate-${product.id}`,
      tone: pct >= 10 ? "danger" : "warn",
      headline: `${product.name}: نسبة الإرجاع ${round(pct)}٪ في آخر ٩٠ يوم`,
      why: [`رجع ${Math.round(qty)} من ${Math.round(vol.soldQty)} قطعة متسلّمة`, top ? `أكبر سبب: ${top[0]}` : ""].filter(Boolean),
      action: "راجع الموديل على الخط قبل الشحنة الجاية — النسبة دي بتاكل الهامش كله",
      to: `/returns?product=${product.id}`,
      coverage: null,
    });
  }

  return out;
}

/** الجهات اللي المصنع بيشتري منها ومافيش بياناتها كفاية للحكم */
export function unreadySuppliers(db: Db): { party: Party; missing: string }[] {
  return supplierRealCosts(db)
    .filter((s) => s.realPct === null || s.coverage < 40)
    .map((s) => {
      const party = db.parties.find((p) => p.id === s.partyId);
      const gap = s.factors.find((f) => f.missing)?.missing ?? "بيانات كفاية";
      return party ? { party, missing: gap } : null;
    })
    .filter((x): x is { party: Party; missing: string } => x !== null);
}

/** المستحق للمورّد بعد إشعارات الخصم — بيتقرا من دفتر واحد */
export function supplierNetDue(db: Db, partyId: string): number {
  return db.costEntries
    .filter((e) => e.partyId === partyId)
    .reduce((s, e) => {
      const paid = db.costPayments.filter((p) => p.costEntryId === e.id).reduce((x, p) => x + p.amount, 0);
      return s + Math.max(0, e.amount - paid - entryCredit(db, e.id));
    }, 0);
}
