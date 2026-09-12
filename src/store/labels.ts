import { formatDate, qty } from "@/lib/utils";
import { KIND_MODULE } from "./codes";
import { layMath } from "./cutting";
import { materialById, stockQty, unitName } from "./manufacturing";
import type { PermModule } from "./permissions";
import { isThermal, type Paper } from "@/lib/print";
import type { CodeKind, Db } from "./types";

/**
 * مركز الطباعة.
 *
 * سؤال واحد على الشاشة: **تطبع إيه؟** والباقي بيتبني من الجدول ده.
 *
 * وكل نوع هنا **له سجل في الدفتر**. اللي مالوش — رول القماش، الكرتونة،
 * البالتة، الرف، الماكينة — مش مكتوب هنا كنوع «قريب» عشان الشاشة
 * ماتبانش أطول من قدرتها؛ مكتوب في `CODES_NOT_YET` وبيبان في قسم
 * منفصل بسببه.
 */

export type LabelRecord = { id: string; code: string; title: string; sub: string };

export type LabelType = {
  key: string;
  label: string;
  /** جملة بتقول الليبل ده بيتلزق على إيه */
  about: string;
  kind: CodeKind;
  module: PermModule;
  rows: (db: Db) => LabelRecord[];
};

export const LABEL_TYPES: LabelType[] = [
  {
    key: "product",
    label: "ليبل موديل",
    about: "بيتعلّق على القطعة أو الشنطة — الكود بيفتح الموديل وسعره وقائمة خاماته.",
    kind: "product",
    module: "inventory",
    rows: (db) =>
      db.products.map((p) => ({
        id: p.id,
        code: p.sku,
        title: p.name,
        sub: `${qty(stockQty(db, "product", p.id), 0)} في المخزن`,
      })),
  },
  {
    key: "material",
    label: "ليبل خامة",
    about: "بيتلزق على الشوال أو البكرة أو طاقة القماش في مخزن الخامات.",
    kind: "material",
    module: "inventory",
    rows: (db) =>
      db.materials.map((m) => ({
        id: m.id,
        code: m.sku,
        title: m.name,
        sub: `${qty(stockQty(db, "material", m.id))} ${unitName(db, m.unitId)}`,
      })),
  },
  {
    key: "bundle",
    label: "تيكت باندل",
    about: "بيمشي مع الباندل من القص للتعبئة — كل عملية بتتمسح عليه.",
    kind: "bundle",
    module: "production",
    rows: (db) =>
      (db.bundles ?? []).map((b) => {
        const order = db.orders.find((o) => o.id === b.orderId);
        return {
          id: b.id,
          code: b.code,
          title: order?.model ?? "باندل",
          sub: `مقاس ${b.size} · ${qty(b.qty, 0)} قطعة${order ? ` · ${order.code}` : ""}`,
        };
      }),
  },
  {
    key: "order",
    label: "ليبل أمر إنتاج",
    about: "بيتعلّق على عربية الأمر أو فايله — الكود بيفتح تقدمه ومراحله.",
    kind: "order",
    module: "production",
    rows: (db) =>
      db.orders.map((o) => ({
        id: o.id,
        code: o.code,
        title: o.model,
        sub: `${qty(o.quantity, 0)} قطعة · ${o.line} · تسليم ${formatDate(o.dueDate)}`,
      })),
  },
  {
    key: "lay",
    label: "ليبل فرشة قص",
    about: "بيتحط على الفرشة على ترابيزة القص.",
    kind: "lay",
    module: "production",
    rows: (db) =>
      (db.cutLays ?? []).map((l) => {
        const m = layMath(db, l);
        return {
          id: l.id,
          code: m.order?.code ?? "فرشة",
          title: `فرشة ${materialById(db, l.materialId)?.name ?? "قماش"}`,
          sub: `${qty(l.plies, 0)} طبقة · ${qty(m.pieces, 0)} قطعة · ${l.color || "بدون لون"}`,
        };
      }),
  },
  {
    key: "subcontract",
    label: "ليبل إذن تشغيل خارجي",
    about: "بيمشي مع الشغل للورشة، وبيتمسح وقت الاستلام.",
    kind: "subcontract",
    module: "purchasing",
    rows: (db) =>
      (db.subcontracts ?? []).map((s) => ({
        id: s.id,
        code: s.code,
        title: db.parties.find((p) => p.id === s.partyId)?.name ?? "ورشة",
        sub: `${qty(s.qtySent, 0)} قطعة · رجوع ${formatDate(s.expectedDate)}`,
      })),
  },
  {
    key: "warehouse",
    label: "ليبل مخزن",
    about: "بيتعلّق على باب المخزن — المسح بيفتح أرصدته.",
    kind: "warehouse",
    module: "inventory",
    rows: (db) => db.warehouses.map((w) => ({ id: w.id, code: w.name, title: w.name, sub: "مخزن" })),
  },
  {
    key: "worker",
    label: "كارنيه عامل",
    about: "كود العامل: بيتمسح مع بداية العملية بدل ما يتكتب اسمه.",
    kind: "worker",
    module: "workers",
    rows: (db) =>
      db.workers.map((w) => ({ id: w.id, code: w.phone || w.name, title: w.name, sub: `أجر ${qty(w.rate)}` })),
  },
  {
    key: "party",
    label: "كارت جهة تعامل",
    about: "للعميل أو المورّد أو الورشة — بيفتح ملفه وحسابه.",
    kind: "party",
    module: "parties",
    rows: (db) => db.parties.map((p) => ({ id: p.id, code: p.phone || p.name, title: p.name, sub: p.city || "" })),
  },
  {
    key: "operation",
    label: "ليبل محطة عملية",
    about: "بيتعلّق على المحطة في الصالة — العامل يمسحه ويبدأ عليها.",
    kind: "operation",
    module: "production",
    rows: (db) =>
      db.operations.map((o) => ({
        id: o.id,
        code: o.name,
        title: o.name,
        sub: `${qty(o.defaultMinutes)} دقيقة معيارية للقطعة`,
      })),
  },
];

export const LABEL_TYPE_MAP = Object.fromEntries(LABEL_TYPES.map((t) => [t.key, t])) as Record<string, LabelType>;

/** نفس مقياس الصلاحية بتاع المسح: الليبل بيطبع بيانات، فلازم صلاحية القسم */
export const labelModule = (t: LabelType): PermModule => t.module ?? KIND_MODULE[t.kind];

export const COPY_COUNTS = [1, 10, 100, 1000] as const;

/**
 * السقف مش رقم عشوائي: كل ليبل عنصر SVG في الصفحة، وألفين ليبل هي
 * الحدود اللي بعدها المعاينة بتبقى تقيلة على موبايل. اللي عايز أكتر
 * بيطبع على دفعات — وده أحسن من معاينة بتهنّج.
 */
export const MAX_LABELS = 2000;

/* ── ورق الليبلات ─────────────────────────────────────────────── */

export const LABEL_SIZES = ["sm", "md", "lg"] as const;
export type LabelSize = (typeof LABEL_SIZES)[number];

/**
 * هامش ورق الليبلات **أضيق** من هامش المستند: المستند بيتقرا في اليد
 * فمحتاج فراغ، والليبل بيتقص فالفراغ خسارة. تمانية مليمتر هي أقل هامش
 * طابعات الليزر المكتبية بتطبع فيه من غير ما تقطع.
 */
export const LABEL_PAD_MM = 8;

/**
 * المقاسات مختارة عشان **تقسم عرض الورقة صح**: بعد الهوامش فاضل ١٩٤ مم
 * في A4، فالتلات مقاسات بتطلع ٥ و٣ و٢ في الصف بلا ورق ضايع على الجنب.
 */
export const LABEL_MM: Record<LabelSize, { w: number; h: number; label: string }> = {
  sm: { w: 38, h: 25, label: "٣٨×٢٥ مم" },
  md: { w: 64, h: 36, label: "٦٤×٣٦ مم" },
  lg: { w: 96, h: 48, label: "٩٦×٤٨ مم" },
};

/** العرض المتاح جوه الورقة بعد الهوامش */
export const CONTENT_MM: Record<Paper, number> = { a4: 194, a5: 132, t80: 74, t58: 54 };

export type LabelRow = {
  key: string;
  /** نص الـQR: مؤشّر على السجل مش بياناته */
  qr: string;
  /** الرقم اللي الإنسان بيقراه وبيتحوّل شريط باركود */
  code: string;
  title: string;
  sub: string;
};

export function columnsFor(paper: Paper, size: LabelSize): number {
  if (isThermal(paper)) return 1;
  return Math.max(1, Math.floor(CONTENT_MM[paper] / LABEL_MM[size].w));
}
