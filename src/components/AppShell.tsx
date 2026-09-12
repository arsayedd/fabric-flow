import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Home, LogOut, MoreHorizontal, X } from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Mark } from "@/components/Brand";
import { CommandPalette } from "@/components/CommandPalette";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useCommandKey } from "@/lib/useCommandKey";
import { Topbar } from "@/components/Topbar";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { cn } from "@/lib/utils";
import { effectiveModules } from "@/store/account";
import { useFactory } from "@/store/context";
import { NAV, crumbs, sectionOf, type NavItem, type NavSection } from "@/store/nav";
import { ROLE_LABEL } from "@/store/types";

/**
 * قشرة النظام.
 *
 * القائمة شجرة أقسام مش قايمة طويلة، وبتتفتح على القسم اللي أنت فيه بس —
 * عشان المستخدم مايتخضّش من ٤٠ رابط في أول يوم. واللي بيحدّد اللي بيظهر
 * تلات أسئلة بالترتيب:
 *   ١. الصلاحية: الدور ده له حق العرض في الموديول ده؟
 *   ٢. اختيار التجهيز: المصنع قال إنه بيدير الحاجة دي؟
 *   ٣. مبني فعلًا؟ **ومفيش عنصر واحد دلوقتي مش مبني** — كل الـ١٨ قسم
 *      شغّالين. الفرع اللي بيرسم «قريب» باقي في `Row` عشان أي عنصر
 *      جديد يتضاف قبل ما يخلص يبان مطفي بصراحة بدل ما يبان شغّال
 *      ويوصّل لصفحة فاضية. ومحدش بيشوفه النهارده.
 */

/** أهم خمس شاشات للموبايل — الباقي في الدرج */
const MOBILE_PRIMARY = ["/", "/orders", "/collections", "/parties", "/workers", "/materials"];

function useTree() {
  const { can, account } = useFactory();
  const picked = effectiveModules(account.workspace);
  const chose = picked.length > 0;

  const out: NavSection[] = [];
  for (const section of NAV) {
    const items = section.items.filter((it) => {
      if (!can.do(it.perm, "view")) return false;
      // مصنع مالوش اختيارات محفوظة (المصانع القديمة) بيشوف كل حاجة زي ما كانت
      if (chose && it.module && !picked.includes(it.module)) return false;
      return true;
    });
    if (!items.length) continue;
    // قسم كله لسه مش مبني بيتخفي، إلا لو المصنع طلب الموديول ده بنفسه
    const anyReady = items.some((it) => it.ready);
    const requested = chose && items.some((it) => it.module && picked.includes(it.module));
    if (!anyReady && !requested) continue;
    out.push({ ...section, items });
  }
  return out;
}

export function AppShell() {
  const { session, logout, db } = useFactory();
  const loc = useLocation();
  const tree = useTree();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  useCommandKey(useCallback(() => setPalette(true), []));

  /*
   * فتح صفحة جديدة معناها تبدأ من أولها، مش من المكان اللي كنت واقف فيه
   * في اللي قبلها.
   *
   * والجسم بالأقواس مش شكل: السطر كان `useEffect(() => window.scrollTo(0, 0), …)`
   * بسهم بيرجّع قيمة ضمنيًا. وريأكت بتاخد اللي الـeffect بيرجّعه كدالة
   * تنظيف وبتناديه — فمتصفح `scrollTo` فيه بيرجّع أي قيمة مش `undefined`
   * (ويب-فيو، أو بوليفيل تمرير، أو إضافة) بيخلّي ريأكت تنادي القيمة دي،
   * فترمي `is not a function` جوه مرحلة الـcommit وتفكّ الشجرة كلها.
   *
   * والـeffect ده مربوط بـ`loc.pathname`، يعني التنظيف بيتنفّذ مع **كل**
   * تنقّل — وده كان سبب «كل صفحة بدخلها لازم اعملها ريفريش».
   */
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  const here = sectionOf(loc.pathname);
  const flat = tree.flatMap((s) => s.items);
  const mobileNav = MOBILE_PRIMARY.map((to) => flat.find((i) => i.to === to && i.ready))
    .filter((i): i is NavItem => !!i)
    .slice(0, 4);
  const sectionIcon = new Map(tree.flatMap((s) => s.items.map((i) => [i.to, s.icon])));

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* العمود الخارجي بياخد لون القائمة، فالشريط الكحلي بيكمّل لآخر الصفحة ولو طويلة */}
      <div className="hidden w-64 shrink-0 bg-primary md:block">
        <aside className="sticky top-0 flex h-dvh flex-col border-l border-[#1d2733] text-primary-foreground">
          <div className="px-3 pt-3">
            <WorkspaceSwitcher />
          </div>
          <div className="mx-5 mb-3 mt-3 flex items-center justify-between border-t border-[#1d2733] pt-3">
            <p className="text-xs text-accent">{session ? ROLE_LABEL[session.role] : ""}</p>
            <span className="flex items-center gap-1.5 text-primary-foreground/40">
              <Mark className="h-4 w-4" />
              <span className="latin text-[10px]">SANAA</span>
            </span>
          </div>
          <Tree tree={tree} openKey={here?.key ?? "home"} className="flex-1 overflow-y-auto px-3 pb-3" />
          <button
            onClick={logout}
            className="m-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-primary-foreground/60 hover:bg-[#161f2a]"
          >
            <LogOut className="h-4 w-4" />
            خروج
          </button>
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <Topbar onMenu={() => setDrawer(true)} onSearch={() => setPalette(true)} />
        {/* الشريط ده بيفضل فوق كل شاشة في المساحة التجريبية: اللي بيتفرّج
            لازم يعرف إن الأرقام اللي شايفها مش أرقام مصنع حقيقي، ولا
            المفروض يبني عليها قرار */}
        {db.factory?.demo ? (
          <div className="border-b border-accent/30 bg-accent-soft/60 px-4 py-2 text-center text-sm md:px-8">
            مساحة تجريبية — البيانات دي مولّدة للعرض، مش أرقام مصنع حقيقي.{" "}
            <Link to="/settings" className="text-accent underline">
              رجّعها لأصلها من الإعدادات
            </Link>
          </div>
        ) : null}
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-4 md:px-8 md:py-6">
          <Crumbs />
          {/* حاجز على مستوى الصفحة: قسم بيقع مابيوقّعش القائمة معاه */}
          <ErrorBoundary scope="page">
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* درج الموبايل: نفس الشجرة بالظبط، مش قايمة تانية بترتيب مختلف */}
      {drawer ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button className="absolute inset-0 bg-[#0f1720]/60" aria-label="إغلاق" onClick={() => setDrawer(false)} />
          {/*
            اللينك بيقفل الدرج، إنما فتح قسم لأ — القسم بيتفتح جوه الدرج
            عشان تشوف اللي جواه قبل ما تختار.
          */}
          <div
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a")) setDrawer(false);
            }}
            className="absolute inset-y-0 end-0 flex w-[85%] max-w-xs flex-col bg-primary text-primary-foreground shadow-2xl"
          >
            <div className="flex items-center justify-between px-3 pt-3">
              <div className="min-w-0 flex-1">
                <WorkspaceSwitcher />
              </div>
              <button onClick={() => setDrawer(false)} className="rounded-md p-2 text-primary-foreground/60" aria-label="إغلاق">
                <X className="h-5 w-5" />
              </button>
            </div>
            <Tree tree={tree} openKey={here?.key ?? "home"} className="flex-1 overflow-y-auto px-3 py-3" />
          </div>
        </div>
      ) : null}

      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        style={{ gridTemplateColumns: `repeat(${mobileNav.length + 1}, 1fr)` }}
      >
        {mobileNav.map((item) => {
          const Icon = sectionIcon.get(item.to) ?? Home;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn("flex flex-col items-center gap-1 py-2.5 text-[11px]", isActive ? "text-primary" : "text-muted-foreground")
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn("h-5 w-5", isActive && "text-accent")} />
                  {item.label.split(" ")[0]}
                </>
              )}
            </NavLink>
          );
        })}
        <button onClick={() => setDrawer(true)} className="flex flex-col items-center gap-1 py-2.5 text-[11px] text-muted-foreground">
          <MoreHorizontal className="h-5 w-5" />
          المزيد
        </button>
      </nav>

      {palette ? <CommandPalette onClose={() => setPalette(false)} /> : null}
    </div>
  );
}

/** الشجرة: القسم اللي أنت فيه مفتوح، والباقي مقفول لحد ما تفتحه */
function Tree({ tree, openKey, className }: { tree: NavSection[]; openKey: string; className?: string }) {
  // القسم اللي أنت فيه مفتوح لوحده، واللي المستخدم فتحه أو قفله بإيده بيغلب
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  return (
    <nav className={className}>
      {tree.map((section) => {
        const single = section.items.length === 1;
        const expanded = touched[section.key] ?? section.key === openKey;
        if (single) return <Row key={section.key} item={section.items[0]} icon={section.icon} />;
        return (
          <div key={section.key} className="mb-0.5">
            <button
              onClick={() => setTouched((prev) => ({ ...prev, [section.key]: !expanded }))}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm",
                expanded ? "text-primary-foreground" : "text-primary-foreground/65 hover:bg-[#161f2a]",
              )}
            >
              <section.icon className={cn("h-4 w-4", expanded && "text-accent")} />
              <span className="flex-1 text-right">{section.label}</span>
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
            </button>
            {expanded ? (
              <div className="mb-1 ms-6 border-s border-[#1d2733] ps-2">
                {section.items.map((item) => (
                  <Row key={`${item.to}-${item.label}`} item={item} nested />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

function Row({ item, icon: Icon, nested }: { item: NavItem; icon?: NavSection["icon"]; nested?: boolean }) {
  if (!item.ready) {
    return (
      <span
        className={cn(
          "flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-primary-foreground/30",
          nested && "py-1.5",
        )}
        title="لسه مش مبني"
      >
        {Icon ? <Icon className="h-4 w-4" /> : null}
        <span className="flex-1">{item.label}</span>
        <span className="rounded bg-[#1b2634] px-1.5 py-0.5 text-[10px] text-primary-foreground/50">قريب</span>
      </span>
    );
  }
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 text-sm transition-colors",
          nested ? "py-1.5" : "py-2.5",
          isActive
            ? "bg-[#1b2634] text-primary-foreground"
            : "text-primary-foreground/65 hover:bg-[#161f2a] hover:text-primary-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          {Icon ? <Icon className={cn("h-4 w-4", isActive && "text-accent")} /> : null}
          <span className="flex-1">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

/** «أنا فين؟» — أول سؤال لازم كل صفحة تجاوب عليه */
function Crumbs() {
  const loc = useLocation();
  const rows = crumbs(loc.pathname);
  if (rows.length < 2) return null;
  return (
    <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <Link to="/" className="hover:text-foreground">
        المصنع
      </Link>
      {rows.map((c, i) => (
        <span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
          <span className="text-muted-foreground/50">/</span>
          {c.to ? (
            <Link to={c.to} className="hover:text-foreground">
              {c.label}
            </Link>
          ) : (
            <span className={i === rows.length - 1 ? "text-foreground" : undefined}>{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** صفحة «المزيد» القديمة بتفضل شغالة: نفس الشجرة في صفحة كاملة */
export function MorePage() {
  const tree = useTree();
  const { logout } = useFactory();
  return (
    <div className="space-y-3">
      <h2 className="text-2xl">كل أقسام المصنع</h2>
      {tree.map((section) => (
        <div key={section.key} className="overflow-hidden rounded-lg border border-border bg-card">
          <p className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-sm text-muted-foreground">
            <section.icon className="h-4 w-4" />
            {section.label}
          </p>
          {section.items.map((item) =>
            item.ready ? (
              <NavLink
                key={`${item.to}-${item.label}`}
                to={item.to}
                className="flex items-center justify-between border-b border-border px-4 py-3 text-sm last:border-0"
              >
                {item.label}
              </NavLink>
            ) : (
              <span
                key={`${item.to}-${item.label}`}
                className="flex items-center justify-between border-b border-border px-4 py-3 text-sm text-muted-foreground last:border-0"
              >
                {item.label}
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">قريب</span>
              </span>
            ),
          )}
        </div>
      ))}
      <button
        onClick={logout}
        className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3.5 text-danger"
      >
        <LogOut className="h-5 w-5" />
        خروج
      </button>
    </div>
  );
}
