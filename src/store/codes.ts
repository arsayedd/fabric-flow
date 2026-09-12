/**
 * صنعة — الترميز والمسح (M-Q1)
 *
 * القاعدة اللي الطبقة دي كلها قايمة عليها:
 *
 *   **الكود مؤشّر، مش بيانات.**
 *
 * الـQR مابيحملش «قماش قطن أزرق ٩٤ متر بسعر ١٢٠». بيحمل **نوع الكيان
 * ومعرّفه ومعرّف المصنع** وبس. وكل حرف تاني بيتقرا من الدفتر وقت المسح.
 * والسبب مش شكلي:
 *
 *  1) البيانات المطبوعة **بتقدم**. الرصيد بيتغيّر، والسعر بيتغيّر،
 *     والورقة اللي على الرول بتفضل بتقول رقم الشهر اللي فات.
 *  2) البيانات المطبوعة **بتتفبرك**. أي حد يعرف الصيغة يطبع كود يقول
 *     اللي هو عايزه. لما الكود يبقى مؤشّر بس، اللي بيحكم هو الدفتر.
 *  3) الكود بيبقى صغير، فيطلع حاد على ليبل ٣٠ مم ويتقرا من كاميرا موبايل
 *     في نور المصنع.
 *
 * الصيغة: `SANAA://<النوع>/<المعرّف>?f=<المصنع>`
 *
 * ومعرّف المصنع جوه الكود **عن قصد**: كود من مصنع تاني بيترفض بالصريح
 * بدل ما يتفتح على سجل بنفس المعرّف بالغلط. ده نفس شرط عزل البيانات،
 * بس على الورق.
 *
 * والمستندات ليها استثناء واحد: كودها هو **رابط التحقق** اللي اتبنى في
 * M-D1، لأن ورقة المستند بتتسلّم لناس **بره** النظام، ولازم كودهم يفتح
 * صفحة تقول أصلي ولا ملغي من غير تسجيل دخول.
 */

import type { CodeKind, Db } from "./types";
import { KIND_LABEL, KIND_TAG } from "./types";
import { DOC_DEFS } from "./documents";
import type { PermModule } from "./permissions";

/**
 * المسح **مابيفتحش باب خلفي**.
 *
 * الكود بيوصّل لسجل، والسجل ليه موديول وصلاحية زي أي شاشة. فلازم كل نوع
 * يعرف هو تحت أنهي موديول، وإلا يبقى الماسح شاف حاجة الشاشة كانت
 * هتمنعه منها — وده بالضبط اللي شرط «الصلاحية تتحقق على السيرفر» بيمنعه.
 */
export const KIND_MODULE: Record<CodeKind, PermModule> = {
  material: "inventory",
  product: "inventory",
  warehouse: "inventory",
  order: "production",
  lay: "production",
  bundle: "production",
  subcontract: "purchasing",
  party: "parties",
  worker: "workers",
  operation: "production",
  document: "reports",
};

const TAG_TO_KIND = Object.fromEntries(Object.entries(KIND_TAG).map(([k, t]) => [t, k as CodeKind])) as Record<string, CodeKind>;

/* ── بناء الكود ───────────────────────────────────────────────── */

export const CODE_SCHEME = "SANAA://";

/**
 * نص الكود اللي بيتحوّل لـQR.
 *
 * المستند بياخد رابط التحقق، والباقي بياخد مؤشّر داخلي — والفرق مقصود
 * ومكتوب فوق: ورق المستند بيمشي بره المصنع، وباقي الليبلات جواه.
 */
export function codeText(kind: CodeKind, id: string, factoryId: string, origin = ""): string {
  if (kind === "document") return `${origin}/verify/${encodeURIComponent(id)}`;
  return `${CODE_SCHEME}${KIND_TAG[kind]}/${encodeURIComponent(id)}?f=${encodeURIComponent(factoryId)}`;
}

/* ── قراءة الكود ──────────────────────────────────────────────── */

export type Hit = {
  kind: CodeKind;
  id: string;
  /** الكود اللي الإنسان بيقراه (رقم الباندل، كود الخامة، رقم المستند) */
  code: string;
  label: string;
  /** سطر تحت الاسم بيقول الحاجة دي فين وحالتها إيه */
  sub: string;
  to: string;
  /** إزاي عرفناه: من الكود نفسه ولا من الرقم المكتوب */
  via: "scheme" | "verify" | "text";
};

export type Miss = {
  kind: null;
  text: string;
  why: string;
  /** كود من مصنع تاني: نقولها بالصريح بدل «مش موجود» */
  otherFactory?: boolean;
};

export type Scanned = Hit | Miss;

export function isHit(r: Scanned): r is Hit {
  return r.kind !== null;
}

/**
 * بيقرا أي نص جاي من كاميرا أو قارئ باركود أو لصق بالإيد.
 *
 * الترتيب مهم: الكود المبني بالصيغة بتاعتنا الأول، وبعده رابط التحقق،
 * وبعده **الرقم المكتوب بإيد الإنسان** — لأن العامل في المصنع بيقرا رقم
 * الباندل من التيكت ويكتبه لما الكود يتكرمش، ولازم ده يشتغل.
 */
export function resolveCode(db: Db, raw: string): Scanned {
  const text = raw.trim();
  if (!text) return { kind: null, text, why: "مفيش كود." };

  const fromScheme = readScheme(db, text);
  if (fromScheme) return fromScheme;

  const fromVerify = readVerify(db, text);
  if (fromVerify) return fromVerify;

  const fromText = readPlain(db, text);
  if (fromText) return fromText;

  return {
    kind: null,
    text,
    why: "الكود ده مش بيطابق حاجة في المصنع: مش رقم مستند، ولا باندل، ولا أمر، ولا كود خامة أو موديل.",
  };
}

function readScheme(db: Db, text: string): Scanned | null {
  if (!text.toUpperCase().startsWith(CODE_SCHEME)) return null;
  const rest = text.slice(CODE_SCHEME.length);
  const [path, query = ""] = rest.split("?");
  const [tag, ...idParts] = path.split("/");
  const kind = TAG_TO_KIND[tag.toUpperCase()];
  const id = decodeURIComponent(idParts.join("/"));
  if (!kind) return { kind: null, text, why: `النوع «${tag}» مش معروف في صنعة.` };

  const factoryId = new URLSearchParams(query).get("f");
  const mine = db.factory?.id ?? "";
  if (factoryId && mine && factoryId !== mine) {
    return {
      kind: null,
      text,
      why: "الكود ده بتاع مصنع تاني. صنعة مابتفتحش سجل من مصنع مش بتاعك، ولو نفس المعرّف موجود عندك.",
      otherFactory: true,
    };
  }

  const hit = describe(db, kind, id, "scheme");
  return hit ?? { kind: null, text, why: `الكود بيشاور على ${KIND_LABEL[kind]} مش موجود — يمكن اتمسح أو الكود من نسخة قديمة.` };
}

function readVerify(db: Db, text: string): Scanned | null {
  const match = /\/verify\/([^?#/]+)/.exec(text);
  if (!match) return null;
  const number = decodeURIComponent(match[1]);
  const doc = db.documents.find((d) => d.number.toUpperCase() === number.toUpperCase());
  if (!doc) return { kind: null, text, why: `مفيش مستند بالرقم ${number} في الدفتر.` };
  return describe(db, "document", doc.id, "verify");
}

/** الرقم المكتوب: بندور عليه في كل دفتر ليه كود إنساني */
function readPlain(db: Db, text: string): Scanned | null {
  const up = text.toUpperCase();
  const eq = (v: string | null | undefined) => !!v && v.toUpperCase() === up;

  const doc = db.documents.find((d) => eq(d.number));
  if (doc) return describe(db, "document", doc.id, "text");

  const bundle = (db.bundles ?? []).find((b) => eq(b.code));
  if (bundle) return describe(db, "bundle", bundle.id, "text");

  const order = db.orders.find((o) => eq(o.code));
  if (order) return describe(db, "order", order.id, "text");

  const sub = (db.subcontracts ?? []).find((s) => eq(s.code));
  if (sub) return describe(db, "subcontract", sub.id, "text");

  const material = db.materials.find((m) => eq(m.sku));
  if (material) return describe(db, "material", material.id, "text");

  const product = db.products.find((p) => eq(p.sku));
  if (product) return describe(db, "product", product.id, "text");

  return null;
}

/* ── وصف الكيان ───────────────────────────────────────────────── */

/**
 * سطر واحد بيقول الحاجة دي إيه وفين — وده اللي الماسح بيشوفه أول ما
 * الكود يتقرا، قبل أي إجراء. الوصف بيتبني من الدفاتر، فمابيقدمش.
 */
export function describe(db: Db, kind: CodeKind, id: string, via: Hit["via"] = "scheme"): Hit | null {
  switch (kind) {
    case "material": {
      const m = db.materials.find((x) => x.id === id);
      if (!m) return null;
      return { kind, id, code: m.sku, label: m.name, sub: "خامة في المخزن", to: `/materials/${m.id}`, via };
    }
    case "product": {
      const p = db.products.find((x) => x.id === id);
      if (!p) return null;
      return { kind, id, code: p.sku, label: p.name, sub: "موديل", to: `/products/${p.id}`, via };
    }
    case "warehouse": {
      const w = db.warehouses.find((x) => x.id === id);
      if (!w) return null;
      return { kind, id, code: KIND_TAG.warehouse, label: w.name, sub: "مخزن", to: "/materials", via };
    }
    case "order": {
      const o = db.orders.find((x) => x.id === id);
      if (!o) return null;
      return { kind, id, code: o.code, label: o.model, sub: `${o.line} · أمر إنتاج`, to: `/orders/${o.id}`, via };
    }
    case "lay": {
      const l = (db.cutLays ?? []).find((x) => x.id === id);
      if (!l) return null;
      const order = db.orders.find((o) => o.id === l.orderId);
      return {
        kind,
        id,
        code: order?.code ?? KIND_TAG.lay,
        label: `فرشة ${db.materials.find((m) => m.id === l.materialId)?.name ?? "قماش"}`,
        sub: `${order?.code ?? "بدون أمر"} · ${l.plies} طبقة`,
        to: "/cutting",
        via,
      };
    }
    case "bundle": {
      const b = (db.bundles ?? []).find((x) => x.id === id);
      if (!b) return null;
      const order = db.orders.find((o) => o.id === b.orderId);
      return {
        kind,
        id,
        code: b.code,
        label: order?.model ?? "باندل",
        sub: `مقاس ${b.size} · ${b.qty} قطعة${order ? ` · ${order.code}` : ""}`,
        to: "/production",
        via,
      };
    }
    case "subcontract": {
      const s = (db.subcontracts ?? []).find((x) => x.id === id);
      if (!s) return null;
      return {
        kind,
        id,
        code: s.code,
        label: db.parties.find((p) => p.id === s.partyId)?.name ?? "ورشة",
        sub: "إذن تشغيل خارجي",
        to: "/outsourcing",
        via,
      };
    }
    case "party": {
      const p = db.parties.find((x) => x.id === id);
      if (!p) return null;
      return { kind, id, code: p.phone, label: p.name, sub: "جهة تعامل", to: `/parties/${p.id}`, via };
    }
    case "worker": {
      const w = db.workers.find((x) => x.id === id);
      if (!w) return null;
      return { kind, id, code: w.phone, label: w.name, sub: "عامل", to: `/workers/${w.id}`, via };
    }
    case "operation": {
      const o = db.operations.find((x) => x.id === id);
      if (!o) return null;
      return { kind, id, code: KIND_TAG.operation, label: o.name, sub: "عملية في المسار", to: "/production", via };
    }
    case "document": {
      const d = db.documents.find((x) => x.id === id);
      if (!d) return null;
      return {
        kind,
        id,
        code: d.number,
        label: DOC_DEFS[d.type].label,
        sub: d.status === "cancelled" ? "ملغي" : "مستند في الدفتر",
        to: `/verify/${encodeURIComponent(d.number)}`,
        via,
      };
    }
  }
}

/* ── اللي لسه مالوش كود، وليه ─────────────────────────────────── */

/**
 * القايمة دي مكتوبة في الكود مش في ملف وثائق بعيد، عشان تفضل صادقة:
 * الطلب الأصلي كان فيه ليبل لرول القماش وللكرتونة والبالتة والرف
 * والماكينة والأصل. كل واحدة فيهم **كيان مش موجود في الدفتر**، وليبل
 * لكيان مش موجود = كود ممسوح بيفتح على لا شيء.
 */
export const CODES_NOT_YET: { label: string; needs: string }[] = [
  { label: "رول قماش (Fabric Roll)", needs: "جدول رولات بطولها ومورّدها، وحركة مخزن على مستوى الرول — القماش دلوقتي بيتحرّك بالمتر مش بالرول" },
  { label: "لوط / دفعة خامة (Lot / Batch)", needs: "جدول دفعات على الحركة الواردة" },
  { label: "كرتونة وصندوق وبالتة", needs: "تسجيل التغليف كوحدة — التسلسل دلوقتي بيقف عند الباندل" },
  { label: "موقع ورف في المخزن", needs: "مواقع جوه المخزن — المخزن دلوقتي وحدة واحدة" },
  { label: "ماكينة وأصل", needs: "سجل ماكينات (CMMS)" },
  { label: "أمر شراء وشحنة", needs: "أمر شراء بحياته من الطلب للاستلام" },
];
