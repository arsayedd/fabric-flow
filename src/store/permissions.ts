/**
 * محرّك الصلاحيات.
 *
 * القاعدة: **الصلاحية مش إخفاء زر.** كل صلاحية جوابها سؤال واحد
 * `allowed(matrix, module, action)`، ونفس السؤال بيتسأل في تلات أماكن:
 * القائمة (تظهر ولا لأ)، الزر (يبان ولا لأ)، و**الميوتيشن نفسها** (تنفّذ ولا ترفض).
 * لو الأول والتاني بس اللي بيسألوا، يبقى ده مكياج مش صلاحية.
 *
 * الأدوار التلاتة بقت **قيم افتراضية** للمصفوفة مش أسوار ثابتة، وصاحب المصنع
 * يقدر يعدّل أي خانة. أي تعديل بيتسجّل في سجل التعديلات.
 *
 * على السيرفر نفس المصفوفة هي اللي بتتحوّل لـRLS + تحقق في الدوال — لأن
 * اللي بيمنع فعلًا هو الـbackend، والواجهة بتوفّر لخبطة بس.
 */

import type { Role } from "./types";

export const PERM_MODULES = [
  "production",
  "planning",
  "inventory",
  "purchasing",
  "workers",
  "parties",
  "sales",
  "finance",
  "costing",
  "quality",
  "machines",
  "reports",
  "staff",
  "audit",
  "settings",
] as const;

export type PermModule = (typeof PERM_MODULES)[number];

export const PERM_ACTIONS = ["view", "create", "edit", "delete", "export"] as const;
export type PermAction = (typeof PERM_ACTIONS)[number];

export const MODULE_LABEL: Record<PermModule, string> = {
  production: "الإنتاج",
  planning: "التخطيط والطاقة",
  inventory: "المخزون والخامات",
  purchasing: "المشتريات والموردين",
  workers: "العمال والحضور",
  parties: "العملاء والتجار",
  sales: "المنتجات والبيع",
  finance: "الخزينة والتحصيل",
  costing: "التكلفة والربحية",
  quality: "الجودة",
  machines: "الماكينات",
  reports: "التقارير واللوحة",
  staff: "الموظفين والصلاحيات",
  audit: "سجل التعديلات",
  settings: "الإعدادات",
};

export const ACTION_LABEL: Record<PermAction, string> = {
  view: "عرض",
  create: "إضافة",
  edit: "تعديل",
  delete: "مسح",
  export: "تصدير",
};

/** المصفوفة: لكل موديول قائمة الأفعال المسموحة */
export type PermMatrix = Partial<Record<PermModule, PermAction[]>>;

const ALL: PermAction[] = [...PERM_ACTIONS];
const RWX: PermAction[] = ["view", "create", "edit", "export"];
const RW: PermAction[] = ["view", "create", "edit"];
const R: PermAction[] = ["view"];
const RX: PermAction[] = ["view", "export"];

/**
 * القيم الافتراضية — مضبوطة على نفس اللي كان شغال قبل المحرّك بالحرف،
 * عشان تشغيل المحرّك مايغيّرش صلاحية حد بالغلط:
 * المالك كل حاجة، المحاسب كل حاجة ما عدا المسح والموظفين والسجل،
 * والمشرف الإنتاج والمخزن والعمال بس.
 */
export const ROLE_DEFAULTS: Record<Role, PermMatrix> = {
  owner: {
    production: ALL,
    planning: ALL,
    inventory: ALL,
    purchasing: ALL,
    workers: ALL,
    parties: ALL,
    sales: ALL,
    finance: ALL,
    costing: ALL,
    quality: ALL,
    machines: ALL,
    reports: ALL,
    staff: ALL,
    audit: RX,
    settings: ALL,
  },
  accountant: {
    production: RWX,
    planning: RWX,
    inventory: RWX,
    purchasing: RWX,
    workers: RWX,
    parties: RWX,
    sales: RWX,
    finance: RWX,
    costing: RWX,
    quality: RW,
    machines: R,
    reports: RX,
    // `settings` عرض بس للمحاسب: قرارات زي أوزان السكور كانت لصاحب المصنع
    // لوحده قبل المحرّك، والقيم الافتراضية لازم تحكي نفس الحكاية بالحرف.
    settings: R,
  },
  /**
   * المشرف بياخد `export` في الأقسام اللي هو أصلًا شغّال فيها.
   *
   * ده **تغيير مقصود** على الافتراضي القديم، وسببه إن `export` وقت ما
   * المحرّك اتكتب مكانش ليه معنى — مكانش فيه تصدير ولا مستندات في
   * النظام. وبعد ما بقى فيه، «مشرف مش بيطبع» معناها مشرف مش بيقدر
   * يطلّع ورقة إنتاج ولا إذن صرف خامات لأرض المصنع، وهي بالظبط الورق
   * اللي شغلته قايمة عليه.
   *
   * والمالية والعملاء والتكلفة فضلوا مقفولين: المشرف مش بيشوفهم أصلًا،
   * فمش هيصدّرهم. وصاحب المصنع يقدر يعدّل أي خانة من شاشة الصلاحيات.
   */
  supervisor: {
    production: RWX,
    planning: RX,
    inventory: RWX,
    workers: RWX,
    quality: RWX,
    machines: R,
    settings: R,
  },
};

export function roleMatrix(role: Role, overrides?: Partial<Record<Role, PermMatrix>>): PermMatrix {
  return overrides?.[role] ?? ROLE_DEFAULTS[role];
}

export function allowed(matrix: PermMatrix, module: PermModule, action: PermAction): boolean {
  return (matrix[module] ?? []).includes(action);
}

/** المصفوفة بعد تعديل خانة واحدة — بدون تغيير أي خانة تانية */
export function toggle(matrix: PermMatrix, module: PermModule, action: PermAction): PermMatrix {
  const now = matrix[module] ?? [];
  const next = now.includes(action) ? now.filter((a) => a !== action) : [...now, action];
  return { ...matrix, [module]: PERM_ACTIONS.filter((a) => next.includes(a)) };
}

/**
 * الرفض بسبب صلاحية نوع مختلف عن خطأ التحقق: ده مش «البيانات غلط»، ده
 * «مش من حقك». فبيتميّز بنوعه عشان الطبقة اللي فوق تعرف توصّله للمستخدم
 * بنفس الشكل في كل شاشة بدل ما كل صفحة تتصرف بطريقتها.
 */
export class PermissionError extends Error {}

/**
 * رسالة الرفض بتقول الصلاحية الناقصة بالاسم، مش «غير مسموح».
 * المستخدم لازم يعرف يطلب إيه من صاحب المصنع.
 */
export function denied(module: PermModule, action: PermAction): PermissionError {
  return new PermissionError(`محتاج صلاحية «${ACTION_LABEL[action]} ${MODULE_LABEL[module]}» — اطلبها من صاحب المصنع.`);
}

/* ── مستويات الوصول للبيانات ────────────────────────────────── */

/**
 * مستوى الوصول سؤال تاني مختلف عن الصلاحية: الصلاحية بتقول «يعمل إيه»،
 * والمستوى بيقول «على أنهي بيانات». دلوقتي عندنا مستوى المصنع بس، والباقي
 * (فرع / قسم / بياناته هو) محتاج `branch_id` و`department_id` على السجلات —
 * مش موجودين، فمكتوبين هنا كتعريف مش كتنفيذ.
 */
export const DATA_LEVELS = ["factory", "branch", "department", "own"] as const;
export type DataLevel = (typeof DATA_LEVELS)[number];

export const DATA_LEVEL_LABEL: Record<DataLevel, string> = {
  factory: "كل بيانات المصنع",
  branch: "فرع واحد",
  department: "قسم واحد",
  own: "بياناته هو بس",
};

export const DATA_LEVEL_READY: Record<DataLevel, boolean> = {
  factory: true,
  branch: false,
  department: false,
  own: false,
};
