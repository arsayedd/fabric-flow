/**
 * تقدّم تجهيز المصنع.
 *
 * القاعدة نفسها اللي ماشيين عليها في كل حاجة محسوبة: **مفيش نسبة متخزّنة**.
 * النسبة بتتحسب من بيانات المصنع نفسها، فلو المستخدم أضاف عامل من أي شاشة
 * الخطوة بتتظبّط لوحدها — ولو مسح آخر عامل بترجع ناقصة. مفيش زر «حدّث التقدّم»،
 * ومفيش حالة تقول «تم» وهي مش تمام.
 */

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
