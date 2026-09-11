/**
 * خريطة النظام.
 *
 * القائمة الجانبية مش قايمة روابط طويلة — دي **شجرة أقسام**، وكل عنصر فيها
 * بيحمل تلات حقائق مع بعض: الصلاحية اللي بتفتحه، الموديول اللي المصنع اختاره،
 * وهل هو مبني فعلًا ولا لسه. عشان كده نفس الملف ده بيخدم:
 *   ١. القائمة الجانبية (الأقسام واللي بيظهر جواها)
 *   ٢. مسار الصفحة (المصنع / الإنتاج / أوامر الإنتاج / أمر ‎#1024‎)
 *   ٣. البحث الشامل ولوحة الأوامر (نفس العناوين، مصدر واحد)
 *   ٤. الاختصار «+ إضافة» (الأفعال المتاحة حسب الصلاحية)
 *
 * العناصر اللي `ready: false` بتتعرض مطفية ومكتوب عليها «قريب» — بنقول مش
 * مبني بدل ما نوعد بلينك بيوصّل لصفحة فاضية.
 */

import {
  Banknote,
  BarChart3,
  Boxes,
  ClipboardList,
  Brain,
  Coins,
  Cog,
  Factory,
  Home,
  Package,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UserRound,
  Users,
  UsersRound,
  Wallet,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ModuleKey } from "./account";
import type { PermAction, PermModule } from "./permissions";

export type NavItem = {
  to: string;
  label: string;
  /** الصلاحية اللي بتفتح العنصر ده */
  perm: PermModule;
  /** الموديول اللي المصنع اختاره في التجهيز — `null` معناه دايمًا ظاهر */
  module: ModuleKey | null;
  /** مبني فعلًا؟ اللي مش مبني بيبان مطفي ومكتوب عليه «قريب» */
  ready: boolean;
  /** مطابقة تامة للمسار (للرئيسية بس) */
  end?: boolean;
};

export type NavSection = {
  key: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

const item = (
  to: string,
  label: string,
  perm: PermModule,
  module: ModuleKey | null,
  ready = true,
  end = false,
): NavItem => ({ to, label, perm, module, ready, end });

/**
 * الخمسة عشر قسم. الترتيب ده هو ترتيب يوم المصنع: بتبدأ من اللي محتاج
 * اهتمامك، وبتنزل للتشغيل، وبعدين للفلوس، وآخر حاجة الإعدادات.
 */
export const NAV: NavSection[] = [
  {
    key: "home",
    label: "الرئيسية",
    icon: Home,
    items: [
      item("/", "نظرة اليوم", "reports", null, true, true),
      item("/tasks", "مهامي", "parties", null),
      item("/alerts", "ما يحتاج اهتمامك", "reports", null),
    ],
  },
  {
    key: "products",
    label: "المنتجات والموديلات",
    icon: Package,
    items: [
      item("/products", "الموديلات", "sales", "sales"),
      item("/samples", "العينات", "sales", "sales", false),
      item("/techpack", "الملف الفني", "sales", "sales", false),
    ],
  },
  {
    key: "materials",
    label: "الخامات",
    icon: Boxes,
    items: [
      item("/materials", "الخامات والأرصدة", "inventory", "inventory"),
      item("/waste", "الهالك", "inventory", "inventory", false),
    ],
  },
  {
    key: "production",
    label: "الإنتاج",
    icon: Factory,
    items: [
      item("/orders", "أوامر الإنتاج", "production", "production"),
      item("/production", "متابعة المراحل", "production", "production", false),
      item("/planning", "التخطيط والطاقة", "planning", "planning"),
    ],
  },
  {
    key: "stock",
    label: "المخزون",
    icon: Warehouse,
    items: [
      item("/stock", "مخزن الإنتاج التام", "inventory", "inventory", false),
      item("/count", "الجرد", "inventory", "inventory", false),
    ],
  },
  {
    key: "workers",
    label: "العمال",
    icon: UsersRound,
    items: [
      item("/workers", "العمال والحضور", "workers", "workers"),
      item("/shifts", "الورديات", "workers", "workers", false),
    ],
  },
  {
    key: "parties",
    label: "العملاء والتجار",
    icon: Users,
    items: [
      item("/parties", "كل جهات التعامل", "parties", "parties"),
      item("/parties?role=customer", "العملاء", "parties", "parties"),
      item("/parties?role=merchant", "التجار", "parties", "parties"),
    ],
  },
  {
    key: "suppliers",
    label: "الموردين والمشتريات",
    icon: Truck,
    items: [
      item("/parties?role=supplier", "الموردين", "purchasing", "purchasing"),
      item("/costs", "فواتير المشتريات", "purchasing", "purchasing"),
      item("/purchase-orders", "أوامر الشراء", "purchasing", "purchasing", false),
    ],
  },
  {
    key: "sales",
    label: "المبيعات",
    icon: ShoppingCart,
    items: [
      item("/deliveries", "التوريدات", "sales", "sales", false),
      item("/invoices", "الفواتير", "sales", "sales", false),
    ],
  },
  {
    key: "finance",
    label: "المالية",
    icon: Banknote,
    items: [
      item("/collections", "التحصيل", "finance", "finance"),
      item("/treasury", "الخزينة", "finance", "finance"),
      item("/costing", "التكلفة والربحية", "costing", "costing"),
    ],
  },
  {
    key: "quality",
    label: "الجودة",
    icon: ShieldCheck,
    items: [item("/quality", "الفحص والعيوب", "quality", "quality", false)],
  },
  {
    key: "machines",
    label: "الماكينات والصيانة",
    icon: Wrench,
    items: [item("/machines", "الماكينات", "machines", "machines", false)],
  },
  {
    key: "reports",
    label: "التقارير والتحليلات",
    icon: BarChart3,
    items: [
      // غرفة التحكم مفتوحة للكل: كل قسم جواها بيتشال لوحده لو الصلاحية ناقصة
      item("/dashboard", "غرفة التحكم", "production", "reports"),
      item("/intelligence", "ذكاء العملاء", "parties", "parties"),
      item("/reports", "بانِي التقارير", "reports", "reports", false),
    ],
  },
  {
    key: "ai",
    label: "مساعد صنعة",
    icon: Brain,
    items: [item("/ai", "اسأل صنعة", "reports", null, false)],
  },
  {
    key: "settings",
    label: "الإعدادات",
    icon: Settings,
    items: [
      item("/settings", "إعدادات المصنع", "settings", null),
      item("/staff", "الموظفين والصلاحيات", "staff", null),
      item("/audit", "سجل التعديلات", "audit", null),
      item("/help", "المساعدة والاختصارات", "settings", null),
    ],
  },
];

/* ── مسار الصفحة ───────────────────────────────────────────────── */

export type Crumb = { label: string; to: string | null };

/** عنوان كل مسار معروف — مصدر واحد للمسار والبحث ولوحة الأوامر */
export const ROUTE_LABEL: Record<string, string> = {
  "/": "نظرة اليوم",
  "/tasks": "مهامي",
  "/alerts": "ما يحتاج اهتمامك",
  "/dashboard": "غرفة التحكم",
  "/intelligence": "ذكاء العملاء",
  "/orders": "أوامر الإنتاج",
  "/planning": "التخطيط والطاقة",
  "/products": "الموديلات",
  "/materials": "الخامات",
  "/workers": "العمال",
  "/parties": "جهات التعامل",
  "/collections": "التحصيل",
  "/treasury": "الخزينة",
  "/costs": "فواتير المشتريات",
  "/costing": "التكلفة والربحية",
  "/staff": "الموظفين والصلاحيات",
  "/audit": "سجل التعديلات",
  "/settings": "إعدادات المصنع",
  "/help": "المساعدة والاختصارات",
  "/more": "المزيد",
  "/factories": "اختيار المصنع",
};

/** القسم اللي المسار ده تحته — للمسار وللقائمة المفتوحة */
export function sectionOf(pathname: string): NavSection | null {
  const base = "/" + pathname.split("/").filter(Boolean)[0];
  for (const s of NAV) {
    if (s.items.some((i) => i.to.split("?")[0] === base)) return s;
  }
  return null;
}

/**
 * «أنا فين؟» — أول سؤال لازم كل صفحة تجاوب عليه.
 * اسم السجل نفسه (أمر ‎#1024‎، عميل، موديل) بييجي من الصفحة، لأن الخريطة
 * مابتعرفش البيانات — بتعرف الهيكل بس.
 */
export function crumbs(pathname: string, leaf?: string | null): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length) return [{ label: "نظرة اليوم", to: null }];
  const base = "/" + parts[0];
  const section = sectionOf(pathname);
  const out: Crumb[] = [];
  if (section && section.key !== "home") out.push({ label: section.label, to: null });
  out.push({ label: ROUTE_LABEL[base] ?? parts[0], to: parts.length > 1 ? base : null });
  if (parts.length > 1) out.push({ label: leaf ?? "تفاصيل", to: null });
  return out;
}

/* ── اختصار «+ إضافة» ──────────────────────────────────────────── */

export type QuickAction = {
  key: string;
  label: string;
  to: string;
  icon: LucideIcon;
  perm: PermModule;
  action: PermAction;
};

/**
 * الأفعال اللي صاحب المصنع بيعملها كل يوم، في مكان واحد فوق.
 * كل فعل بيسأل نفس سؤال الصلاحية — فاللي مش من حقه مايشوفهوش أصلًا،
 * واللي يجرّب يوصله بالعنوان بيترفض عند التنفيذ.
 */
export const QUICK_ACTIONS: QuickAction[] = [
  { key: "order", label: "أمر إنتاج", to: "/orders?new=1", icon: Factory, perm: "production", action: "create" },
  { key: "stage", label: "تسجيل مرحلة", to: "/orders", icon: ClipboardList, perm: "production", action: "create" },
  { key: "attendance", label: "حضور العمال", to: "/workers", icon: UsersRound, perm: "workers", action: "create" },
  { key: "purchase", label: "شراء خامات", to: "/materials?new=1", icon: Boxes, perm: "inventory", action: "create" },
  { key: "collection", label: "تحصيل", to: "/collections?new=1", icon: Banknote, perm: "finance", action: "create" },
  { key: "party", label: "جهة تعامل", to: "/parties?new=1", icon: UserRound, perm: "parties", action: "create" },
  { key: "product", label: "موديل", to: "/products?new=1", icon: Package, perm: "sales", action: "create" },
  { key: "cost", label: "فاتورة مشتريات", to: "/costs", icon: Coins, perm: "purchasing", action: "create" },
  { key: "tx", label: "حركة خزينة", to: "/treasury?new=1", icon: Wallet, perm: "finance", action: "create" },
];

/** أيقونات الكيانات في البحث الشامل — نفس الأيقونة في كل مكان */
export const ENTITY_ICON = {
  order: Factory,
  product: Package,
  material: Boxes,
  party: Users,
  worker: UsersRound,
  cost: Coins,
  page: ScrollText,
  action: Cog,
  operation: Settings,
} satisfies Record<string, LucideIcon>;
