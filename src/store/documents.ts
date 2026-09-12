/**
 * المستندات.
 *
 * المستند في صنعة **مش صفحة HTML بتتطبع**. هو سطر في دفتر: نوع، ورقم
 * فريد، وتاريخ، ومين أصدره، وعلى أي سجل. ومحتواه (الأسطر والمجاميع)
 * بيتبنى وقت الطباعة من نفس دفاتر النظام.
 *
 * السبب إن ده بيمنع أسوأ حاجة في أنظمة المصانع: **ورقة مطبوعة بأرقام
 * مخالفة للنظام**. لو المستند اتخزّن بمحتواه، بيبقى عندك نسختين من
 * الحقيقة، وأي تعديل بعدها بيخلي الورق يكدّب الدفتر.
 *
 * وعشان كده كمان:
 *
 * - **الرقم مابيتكرّرش ومابيتمسحش.** الإلغاء بيحوّل الحالة لـ`cancelled`
 *   بسبب مكتوب — لأن رقم مستند اختفى معناه دفتر فيه فجوة، وده أول
 *   مكان بيبان فيه التلاعب.
 * - **إعادة الطباعة بترفع رقم المراجعة** بدل ما تعمل رقم جديد.
 * - **البصمة** (`stamp`) بتتحسب من رقم المستند وتاريخه ومبلغه، وبتتطبع
 *   جنب الـQR. لو حد عدّل المبلغ في الورقة بالإيد، البصمة مابتطابقش.
 */

import { cairoToday, nid } from "../lib/utils";
import type { Paper } from "../lib/print";
import { DOC_TYPES, type DocNumbering, type DocSettings, type DocStatus, type DocType, type IssuedDoc } from "./types";
import type { PermModule } from "./permissions";

/* ── ١) أنواع المستندات ────────────────────────────────────────── */

export type DocTypeDef = {
  label: string;
  /** جملة توضح المستند ده بيعمل إيه — بتتعرض في مركز المستندات */
  purpose: string;
  /** المنطقة: تقسيم مركز المستندات */
  area: "sales" | "purchasing" | "inventory" | "production" | "delivery" | "workers";
  /** الصلاحية اللي لازمة لإصداره */
  perm: PermModule;
  /** بادئة الرقم الافتراضية */
  prefix: string;
  paper: Paper;
  /** المستند ده فيه مبلغ يستحق موافقة؟ */
  financial: boolean;
};

export const DOC_DEFS: Record<DocType, DocTypeDef> = {
  order: {
    label: "أمر تشغيل",
    purpose: "الطلب زي ما اتفقنا عليه: الموديل والكمية والميعاد والسعر.",
    area: "sales",
    perm: "production",
    prefix: "SO",
    paper: "a4",
    financial: true,
  },
  production: {
    label: "ورقة إنتاج",
    purpose: "الأمر بلغة أرض المصنع: المراحل والكميات المنفّذة والمتبقّي.",
    area: "production",
    perm: "production",
    prefix: "PRD",
    paper: "a4",
    financial: false,
  },
  cutting: {
    label: "تيكت قص",
    purpose: "الفرشة زي ما بتتفرش: الطبقات والماركر والمقاسات والقماش المطلوب.",
    area: "production",
    perm: "production",
    prefix: "CUT",
    paper: "a4",
    financial: false,
  },
  bundle: {
    label: "تيكت باندل",
    purpose: "تيكت بيمشي مع الباندل نفسه: رقمه والمقاس والكمية والعمليات.",
    area: "production",
    perm: "production",
    prefix: "BND",
    paper: "t80",
    financial: false,
  },
  subout: {
    label: "إذن تشغيل خارجي",
    purpose: "شغل طلع لورشة: الكمية والعملية والأجر والميعاد والخامات معاه.",
    area: "production",
    perm: "purchasing",
    prefix: "SUB",
    paper: "a4",
    financial: true,
  },
  subin: {
    label: "استلام من ورشة",
    purpose: "الراجع من الورشة: السليم والمعاد والفاقد، والمستحق عليه.",
    area: "production",
    perm: "purchasing",
    prefix: "SBR",
    paper: "a5",
    financial: true,
  },
  subaccount: {
    label: "كشف حساب ورشة",
    purpose: "حساب الورشة: مستحق من الاستلامات، ومدفوع من الخزينة، والرصيد.",
    area: "purchasing",
    perm: "purchasing",
    prefix: "WST",
    paper: "a4",
    financial: false,
  },
  issue: {
    label: "إذن صرف خامات",
    purpose: "الخامات اللي خرجت من المخزن لأمر إنتاج، بكمياتها وتكلفتها.",
    area: "inventory",
    perm: "inventory",
    prefix: "MI",
    paper: "a5",
    financial: false,
  },
  grn: {
    label: "إذن استلام",
    purpose: "الخامات اللي دخلت المخزن من مورد، بالكمية والسعر.",
    area: "purchasing",
    perm: "inventory",
    prefix: "GRN",
    paper: "a5",
    financial: true,
  },
  qc: {
    label: "ورقة فحص",
    purpose: "نتيجة الفحص: المعاين والسليم والمعيب والمعاد تشغيله.",
    area: "production",
    perm: "quality",
    prefix: "QC",
    paper: "a4",
    financial: false,
  },
  delivery: {
    label: "إذن تسليم",
    purpose: "إثبات إن العميل استلم: الأصناف والكميات والمستلم وتوقيعه.",
    area: "delivery",
    perm: "production",
    prefix: "DN",
    paper: "a5",
    financial: true,
  },
  invoice: {
    label: "فاتورة",
    purpose: "المستحق على العميل عن توريدة أو أكتر، بالخصم والصافي.",
    area: "sales",
    perm: "finance",
    prefix: "INV",
    paper: "a4",
    financial: true,
  },
  receipt: {
    label: "إيصال تحصيل",
    purpose: "فلوس دخلت من عميل: المبلغ والطريقة والرصيد بعدها.",
    area: "sales",
    perm: "finance",
    prefix: "RCT",
    paper: "t80",
    financial: true,
  },
  statement: {
    label: "كشف حساب",
    purpose: "حركة الجهة كاملة في فترة: مدين ودائن ورصيد متحرك.",
    area: "sales",
    perm: "finance",
    prefix: "STM",
    paper: "a4",
    financial: false,
  },
  purchase: {
    label: "فاتورة شراء",
    purpose: "المستحق لمورد عن بنود تكلفة، وإيه اللي اتدفع منها.",
    area: "purchasing",
    perm: "purchasing",
    prefix: "PI",
    paper: "a4",
    financial: true,
  },
  payvoucher: {
    label: "إذن دفع",
    purpose: "فلوس خرجت لمورد أو لبند تكلفة: المبلغ والطريقة والمستلم.",
    area: "purchasing",
    perm: "finance",
    prefix: "PV",
    paper: "t80",
    financial: true,
  },
  payslip: {
    label: "مفردات راتب",
    purpose: "مستحق عامل في فترة: اليوميات والقطعة والمصروف والمتأخر.",
    area: "workers",
    perm: "workers",
    prefix: "PS",
    paper: "a5",
    financial: true,
  },
  stock: {
    label: "كشف جرد",
    purpose: "أرصدة المخزن وقت الطبع، للجرد الفعلي جنبها.",
    area: "inventory",
    perm: "inventory",
    prefix: "SC",
    paper: "a4",
    financial: false,
  },
};

export const DOC_AREA_LABEL: Record<DocTypeDef["area"], string> = {
  sales: "البيع والتحصيل",
  purchasing: "الشراء والموردين",
  inventory: "المخزن",
  production: "الإنتاج والجودة",
  delivery: "التسليم",
  workers: "العمال",
};

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  draft: "مسودة",
  pending: "بانتظار موافقة",
  approved: "معتمد",
  issued: "مُصدَر",
  cancelled: "ملغي",
};

/** لون الحالة بنفس رموز النظام — الملغي خطر، والمنتظر تنبيه */
export const DOC_STATUS_TONE: Record<DocStatus, "muted" | "warn" | "ok" | "danger"> = {
  draft: "muted",
  pending: "warn",
  approved: "ok",
  issued: "ok",
  cancelled: "danger",
};

/* ── ٢) الترقيم ────────────────────────────────────────────────── */

export function numberingFor(settings: DocSettings | undefined, type: DocType): DocNumbering {
  const stored = settings?.numbering?.[type];
  return {
    prefix: stored?.prefix?.trim() || DOC_DEFS[type].prefix,
    padding: stored?.padding && stored.padding >= 3 ? Math.min(stored.padding, 10) : 6,
    resetYearly: stored?.resetYearly ?? true,
    start: stored?.start && stored.start > 0 ? stored.start : 1,
  };
}

export function formatDocNumber(rule: DocNumbering, year: number, serial: number): string {
  const digits = String(serial).padStart(rule.padding, "0");
  return rule.resetYearly ? `${rule.prefix}-${year}-${digits}` : `${rule.prefix}-${digits}`;
}

/**
 * المسلسل الجاي: أكبر مسلسل مستعمل + ١، مش عدد المستندات — لأن الملغي
 * بيفضل شاغل رقمه، والعدّ بالطول كان بيعيد استخدام أرقام ملغية.
 */
export function nextSerial(docs: IssuedDoc[], type: DocType, rule: DocNumbering, year: number): number {
  const scope = docs.filter((d) => d.type === type && (!rule.resetYearly || d.year === year));
  const max = scope.reduce((m, d) => Math.max(m, d.serial), 0);
  return Math.max(max + 1, rule.start);
}

/* ── ٣) البصمة ─────────────────────────────────────────────────── */

/**
 * بصمة قصيرة من محتوى المستند الثابت.
 *
 * دي **مش تشفير** ومابتدّعيش إنها كذلك: هي رقم تحقق بيكشف ورقة اتغيّر
 * فيها رقم بالإيد، مش بيمنع حد عنده الكود إنه يولّد بصمة. التحقق
 * الحقيقي بيبقى بفتح صفحة التحقق والمقارنة بالدفتر.
 */
export function docStamp(parts: { number: string; date: string; amount: number | null; refId: string }): string {
  const text = `${parts.number}|${parts.date}|${parts.amount ?? ""}|${parts.refId}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    h1 = ((h1 ^ text.charCodeAt(i)) * 0x01000193) >>> 0;
    h2 = ((h2 + text.charCodeAt(i) * (i + 1)) * 0x85ebca6b) >>> 0;
  }
  const base = (h1 >>> 0).toString(36).toUpperCase() + (h2 >>> 0).toString(36).toUpperCase();
  return base.replace(/[^0-9A-Z]/g, "").slice(0, 8).padEnd(8, "0");
}

export function stampMatches(doc: IssuedDoc): boolean {
  return doc.stamp === docStamp({ number: doc.number, date: doc.date, amount: doc.amount, refId: doc.refId });
}

/* ── ٤) آلة الحالات ────────────────────────────────────────────── */

/**
 * المسار: مسودة ← بانتظار موافقة ← معتمد ← مُصدَر، والإلغاء ممكن من أي
 * حالة قبل الإلغاء نفسه. ومفيش رجوع من ملغي — الورقة الملغية بتفضل
 * ملغية، واللي عايز نفس الحركة بياخد رقم جديد.
 */
const NEXT: Record<DocStatus, DocStatus[]> = {
  draft: ["pending", "approved", "issued", "cancelled"],
  pending: ["approved", "cancelled"],
  approved: ["issued", "cancelled"],
  issued: ["cancelled"],
  cancelled: [],
};

export function canTransition(from: DocStatus, to: DocStatus): boolean {
  return NEXT[from].includes(to);
}

export function isLive(doc: IssuedDoc): boolean {
  return doc.status !== "cancelled";
}

/** المستند محتاج موافقة قبل الإصدار؟ الحد بيتحدد من الإعدادات */
export function needsApproval(settings: DocSettings | undefined, type: DocType, amount: number | null): boolean {
  const over = settings?.approvalOver;
  if (over === null || over === undefined) return false;
  if (!DOC_DEFS[type].financial) return false;
  return (amount ?? 0) > over;
}

/* ── ٥) بناء السطر ─────────────────────────────────────────────── */

export type IssueInput = {
  type: DocType;
  refId: string;
  refExtra?: string | null;
  date?: string;
  amount?: number | null;
  notes?: string;
};

export function buildDoc(
  input: IssueInput,
  ctx: { factoryId: string; docs: IssuedDoc[]; settings: DocSettings | undefined; actorId: string; now: string },
): IssuedDoc {
  const date = input.date || cairoToday();
  const year = Number(date.slice(0, 4));
  const rule = numberingFor(ctx.settings, input.type);
  const serial = nextSerial(ctx.docs, input.type, rule, year);
  const number = formatDocNumber(rule, year, serial);
  const amount = input.amount ?? null;

  return {
    id: nid(),
    factoryId: ctx.factoryId,
    type: input.type,
    number,
    serial,
    year,
    refId: input.refId,
    refExtra: input.refExtra ?? null,
    date,
    amount,
    status: needsApproval(ctx.settings, input.type, amount) ? "pending" : "issued",
    revision: 1,
    createdBy: ctx.actorId,
    createdAt: ctx.now,
    stamp: docStamp({ number, date, amount, refId: input.refId }),
    notes: input.notes,
  };
}

/**
 * المستند الموجود لنفس السجل — عشان طبع تاني ياخد نفس الرقم.
 * ورقة تسليم واحدة ليها رقم واحد، لو اتطبعت عشرة مرات.
 */
export function findDoc(docs: IssuedDoc[], type: DocType, refId: string): IssuedDoc | undefined {
  return docs.find((d) => d.type === type && d.refId === refId && d.status !== "cancelled");
}

export function paperFor(settings: DocSettings | undefined, type: DocType): Paper {
  const stored = settings?.paper?.[type];
  return (stored as Paper) || DOC_DEFS[type].paper;
}

export const DOC_TYPE_LIST = DOC_TYPES.map((t) => ({ type: t, ...DOC_DEFS[t] }));
