import {
  Banknote,
  Boxes,
  Brain,
  CalendarClock,
  Coins,
  Factory,
  Home,
  Package,
  LogOut,
  MoreHorizontal,
  ScrollText,
  Settings,
  UserRound,
  Users,
  UsersRound,
  Wallet,
  Warehouse,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Mark } from "@/components/Brand";
import { cn } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { ROLE_LABEL } from "@/store/types";

const financeNav = [
  { to: "/", label: "الرئيسية", icon: Home, end: true },
  { to: "/orders", label: "الإنتاج", icon: Factory },
  { to: "/collections", label: "التحصيل", icon: Banknote },
  { to: "/parties", label: "الجهات", icon: Users },
  { to: "/more", label: "المزيد", icon: MoreHorizontal },
];

const supervisorNav = [
  { to: "/", label: "الرئيسية", icon: Home, end: true },
  { to: "/orders", label: "الإنتاج", icon: Factory },
  { to: "/materials", label: "المخزن", icon: Boxes },
  { to: "/workers", label: "العمال", icon: UsersRound },
  { to: "/settings", label: "إعدادات", icon: Settings },
];

const moreLinks = [
  { to: "/planning", label: "التخطيط والطاقة", icon: CalendarClock },
  { to: "/costing", label: "التكلفة والربحية", icon: Coins },
  { to: "/intelligence", label: "ذكاء العملاء", icon: Brain },
  { to: "/products", label: "المنتجات", icon: Package },
  { to: "/materials", label: "المخزن", icon: Boxes },
  { to: "/costs", label: "التكاليف", icon: Warehouse },
  { to: "/workers", label: "العمال", icon: UsersRound },
  { to: "/treasury", label: "الخزينة", icon: Wallet },
  { to: "/staff", label: "الموظفين", icon: UserRound, owner: true },
  { to: "/audit", label: "سجل التعديلات", icon: ScrollText, owner: true },
  { to: "/settings", label: "الإعدادات", icon: Settings },
];

export function AppShell() {
  const { session, db, can, logout } = useFactory();
  const loc = useLocation();
  const nav = can.finance ? financeNav : supervisorNav;
  const onMore = loc.pathname === "/more";
  const sidebarLinks = can.finance
    ? [...financeNav.filter((x) => x.to !== "/more"), ...moreLinks.filter((l) => !("owner" in l) || can.staff)]
    : supervisorNav;

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="hidden w-64 shrink-0 border-l border-[#1d2733] bg-primary text-primary-foreground md:flex md:flex-col">
        <div className="flex items-center gap-3 px-5 py-5">
          <Mark className="h-10 w-10" />
          <div className="leading-tight">
            <p className="font-medium">صنعة</p>
            <p className="latin text-xs text-primary-foreground/50">SANAA</p>
          </div>
        </div>
        <div className="mx-5 mb-4 border-t border-[#1d2733] pt-4">
          <p className="truncate text-sm text-primary-foreground/80">{db.factory?.name}</p>
          <p className="text-xs text-accent">{session ? ROLE_LABEL[session.role] : ""}</p>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {sidebarLinks.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={"end" in item ? item.end : false}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                  isActive
                    ? "bg-[#1b2634] text-primary-foreground"
                    : "text-primary-foreground/65 hover:bg-[#161f2a] hover:text-primary-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={cn("h-4 w-4", isActive && "text-accent")} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={logout}
          className="m-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-primary-foreground/60 hover:bg-[#161f2a]"
        >
          <LogOut className="h-4 w-4" />
          خروج
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur md:hidden">
          <Mark className="h-9 w-9" />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium">{db.factory?.name}</p>
            <p className="text-xs text-muted-foreground">{session ? ROLE_LABEL[session.role] : ""}</p>
          </div>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5 md:px-8 md:py-7">
          <Outlet />
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        style={{ gridTemplateColumns: `repeat(${nav.length}, 1fr)` }}
      >
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={"end" in item ? item.end : false}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-1 py-2.5 text-xs",
                isActive || (item.to === "/more" && onMore) ? "text-primary" : "text-muted-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className={cn("h-5 w-5", (isActive || (item.to === "/more" && onMore)) && "text-accent")} />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function MorePage() {
  const { can, logout } = useFactory();
  const links = moreLinks.filter((l) => !("owner" in l) || can.staff);
  return (
    <div className="space-y-3">
      <h2 className="text-2xl">المزيد</h2>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} className="flex items-center gap-3 border-b border-border px-4 py-3.5 last:border-0">
            <l.icon className="h-5 w-5 text-muted-foreground" />
            <span>{l.label}</span>
          </NavLink>
        ))}
      </div>
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
