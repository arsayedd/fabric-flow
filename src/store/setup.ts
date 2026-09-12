/**
 * تقدّم تجهيز المصنع.
 *
 * القاعدة نفسها اللي ماشيين عليها في كل حاجة محسوبة: **مفيش نسبة متخزّنة**.
 * النسبة بتتحسب من بيانات المصنع نفسها، فلو المستخدم أضاف عامل من أي شاشة
 * الخطوة بتتظبّط لوحدها — ولو مسح آخر عامل بترجع ناقصة. مفيش زر «حدّث التقدّم»،
 * ومفيش حالة تقول «تم» وهي مش تمام.
 */

import { countLabel } from "@/lib/utils";
import { activeBom, bomLines, routingLines } from "./manufacturing";
import type { Db } from "./types";
import type { Workspace } from "./account";

export type SetupStep = {
  key: string;
  label: string;
  /** الشاشة اللي بتخلّص الخطوة — القائمة كلها قابلة للضغط */
  to: string;
  done: boolean;
  /** خطوات التسجيل نفسها اتخلصت وقت الإنشاء، فمش بنخلي حد يضغطها */
  locked?: boolean;
};

export function setupSteps(db: Db, workspace: Workspace | null): SetupStep[] {
  const suppliers = db.parties.filter((p) => !p.mergedIntoId && p.roles.includes("supplier")).length;
  const customers = db.parties.filter((p) => !p.mergedIntoId && p.roles.includes("customer")).length;
  return [
    { key: "account", label: "إنشاء الحساب", to: "/settings", done: true, locked: true },
    { key: "factory", label: "بيانات المصنع", to: "/settings", done: !!db.factory, locked: true },
    {
      key: "workspace",
      label: workspace ? `تجهيز الـworkspace (${workspace.subdomain})` : "تجهيز الـworkspace",
      to: "/settings",
      done: !!workspace,
      locked: true,
    },
    { key: "workers", label: "إضافة العمال", to: "/workers", done: db.workers.length > 0 },
    { key: "suppliers", label: "إضافة الموردين", to: "/parties", done: suppliers > 0 },
    // الخامات نفسها بتتجهّز مع قالب النشاط، فالخطوة الحقيقية هي إدخال رصيد
    // بسعره — ده اللي بيخلي التكلفة والمخزون يشتغلوا
    {
      key: "materials",
      label: "إدخال رصيد الخامات بأسعارها",
      to: "/materials",
      done: db.stockMovements.some((m) => m.itemType === "material" && m.kind === "purchase"),
    },
    { key: "products", label: "إضافة المنتجات", to: "/products", done: db.products.length > 0 },
    { key: "customers", label: "إضافة العملاء", to: "/parties", done: customers > 0 },
    { key: "order", label: "أول أمر إنتاج", to: "/orders", done: db.orders.length > 0 },
  ];
}

export type SetupProgress = {
  steps: SetupStep[];
  done: number;
  total: number;
  pct: number;
  /** الخطوة الجاية — اللي الواجهة بتقترحها */
  next: SetupStep | null;
  complete: boolean;
};

/* ── مساعد التجهيز المستمر ─────────────────────────────────────── */

export type SetupGap = {
  key: string;
  /** الجملة اللي بتتعرض — بتقول العدد والأثر، مش «ناقص» وبس */
  title: string;
  /** ليه ده مهم: إيه اللي بيتوقف بسببه */
  why: string;
  to: string;
  /** `warn` = بيوقّف حساب أو ورقة. `info` = بيحسّن، مش بيعطّل */
  level: "warn" | "info";
};

/**
 * ثقوب التجهيز.
 *
 * الفرق بينها وبين `setupSteps` مش في الشكل — في السؤال:
 *
 *   * `setupSteps` بيسأل **«بدأت؟»** — عندك عمال؟ عندك موديلات؟ ودي
 *     خطوات بتخلص مرة واحدة وتقف.
 *   * الحاجة دي بتسأل **«شغّال صح؟»** — وده سؤال مالوش آخر. موديل
 *     جديد من غير قائمة خامات بيفتح ثقب جديد بعد سنة من التجهيز.
 *
 * وعشان كده مافيش «مساعد بيخلص». المصنع بيكبر، والثقوب بتتفتح
 * وتتقفل، والقايمة دي بتقرا الحالة كل مرة — **مش بتتخزّن ولا بتتأرشف**.
 *
 * وكل بند بيقول **إيه اللي بيتوقف بسببه** مش بس إنه ناقص. «٤ موديلات
 * من غير قائمة خامات» جملة بتوصف، و«فتكلفتها وربحها مش محسوبين» هي
 * السبب اللي بيخلي حد يقوم يعملها.
 */
export function setupGaps(db: Db, workspace: Workspace | null): SetupGap[] {
  const out: SetupGap[] = [];

  // ١) موديلات من غير قائمة خامات: ورقة التكلفة مابتتحسبش خالص
  const noBom = db.products.filter((p) => {
    const bom = activeBom(db, p.id);
    return !bom || bomLines(db, bom.id).length === 0;
  });
  if (noBom.length) {
    out.push({
      key: "bom",
      title: `${countLabel(noBom.length, "موديل واحد", "موديلين", "موديل")} من غير قائمة خامات`,
      why: "تكلفة القطعة وربح الموديل مش محسوبين، وبيطلعوا فاضيين في ملف العميل والربحية",
      to: "/products",
      level: "warn",
    });
  }

  // ٢) موديلات لها خامات ومالهاش مسار تشغيل: التكلفة بتطلع بلا أجور
  const noRouting = db.products.filter((p) => {
    const bom = activeBom(db, p.id);
    if (!bom || bomLines(db, bom.id).length === 0) return false;
    return routingLines(db, p.id).length === 0;
  });
  if (noRouting.length) {
    out.push({
      key: "routing",
      title: `${countLabel(noRouting.length, "موديل واحد", "موديلين", "موديل")} من غير مسار تشغيل`,
      why: "تكلفته محسوبة بالخامات بس — الأجور مش داخلة، فالهامش بيبان أكبر من حقيقته",
      to: "/products",
      level: "warn",
    });
  }

  // ٣) خامات بسعر صفر: كل حساب فوقها بيبقى غلط بهدوء
  const noPrice = db.materials.filter((m) => !m.avgCost || m.avgCost <= 0);
  if (noPrice.length) {
    out.push({
      key: "price",
      title: `${countLabel(noPrice.length, "خامة واحدة", "خامتين", "خامة")} سعرها صفر`,
      why: "بتدخل في ورقة التكلفة بصفر، فالتكلفة بتطلع أقل من الحقيقة من غير ما حد ياخد باله",
      to: "/materials",
      level: "warn",
    });
  }

  // ٤) الأوفرهيد: صفر معناه ربحية بتتحسب على تكلفة مباشرة بس
  if (!db.settings?.overheadPerUnit) {
    out.push({
      key: "overhead",
      title: "الأوفرهيد للقطعة لسه صفر",
      why: "الإيجار والكهرباء والإدارة مش محمّلين على القطعة، فالربح بيبان أعلى من حقيقته",
      to: "/costing",
      level: "info",
    });
  }

  // ٥) ترويسة المستندات: الفاتورة بتطبع بلا رقم ضريبي واسم قانوني
  const doc = db.settings?.docs;
  if (!doc?.taxId || !doc?.legalName) {
    out.push({
      key: "letterhead",
      title: "ترويسة المستندات ناقصة",
      why: "الفواتير وإذون الاستلام بتطبع من غير الاسم القانوني والرقم الضريبي",
      to: "/documents",
      level: "info",
    });
  }

  // ٦) دعوات لسه ماتقبلتش: الموظف مش داخل النظام فعلًا
  const pending = (db.invites ?? []).filter((i) => i.status === "pending");
  if (pending.length) {
    out.push({
      key: "invites",
      title: `${countLabel(pending.length, "دعوة واحدة", "دعوتين", "دعوة")} لسه ماتقبلتش`,
      why: "الموظف مالوش حساب لحد ما يقبل، فشغله بيتسجّل باسمك",
      to: "/staff",
      level: "info",
    });
  }

  // ٧) توريدات مش مربوطة بأمر إنتاج: ده اللي بيقصّ نطاق الربحية
  const unlinked = db.deliveries.filter((d) => !d.orderId);
  if (unlinked.length && db.orders.length > 0) {
    out.push({
      key: "delivery-order",
      title: `${countLabel(unlinked.length, "توريد واحد", "توريدين", "توريد")} مش مربوط بأمر إنتاج`,
      why: "موديله بيتعرف بمطابقة الاسم مش بالمعرّف، وربحه مش داخل في صافي مساهمة العميل",
      to: "/parties",
      level: "info",
    });
  }

  // ٨) مخزن الإنتاج التام: من غيره الجاهز مالوش مكان يتسجّل فيه
  if (!db.warehouses.some((w) => w.kind === "finished")) {
    out.push({
      key: "warehouse",
      title: "مفيش مخزن للإنتاج التام",
      why: "القطع الخارجة من الإنتاج مالهاش مكان يتسجّل فيه رصيدها",
      to: "/settings",
      level: "warn",
    });
  }

  // ٩) الـworkspace: بيتشيك عليه هنا عشان القايمة تبقى مكان واحد
  if (!workspace) {
    out.push({
      key: "workspace",
      title: "المصنع مالوش workspace",
      why: "البيانات شغّالة، لكن مفيش عنوان مستقل ولا عزل باسم المصنع",
      to: "/settings",
      level: "info",
    });
  }

  return out;
}

export function setupProgress(db: Db, workspace: Workspace | null): SetupProgress {
  const steps = setupSteps(db, workspace);
  const done = steps.filter((s) => s.done).length;
  const pct = Math.round((done / steps.length) * 100);
  return {
    steps,
    done,
    total: steps.length,
    pct,
    next: steps.find((s) => !s.done) ?? null,
    complete: done === steps.length,
  };
}
