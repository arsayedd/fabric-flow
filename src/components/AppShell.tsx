import {
  Banknote,
  ClipboardList,
  Home,
  LogOut,
  MoreHorizontal,
  ScrollText,
  Settings,
  Shirt,
  Users,
  UsersRound,
  Wallet,
  Warehouse,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useFactory } from "@/store/context";
import { ROLE_LABEL } from "@/store/types";
import { cn } from "@/lib/utils";

const financeNav = [
  { to: "/", label: "الرئيسية", icon: Home, end: true },
  { to: "/collections", label: "التحصيل", icon: Banknote },
  { to: "/clients", label: "العملاء", icon: Users },
  { to: "/costs", label: "التكاليف", icon: Warehouse },
  { to: "/more", label: "المزيد", icon: MoreHorizontal },
];

const supervisorNav = [
  { to: "/", label: "الرئيسية", icon: Home, end: true },
  { to: "/workers", label: "العمال", icon: UsersRound },
  { to: "/orders", label: "الأوردرات", icon: Shirt },
  { to: "/settings", label: "إعدادات", icon: Settings },
];

const moreLinks = [
  { to: "/workers", label: "العمال", icon: UsersRound },
  { to: "/treasury", label: "الخزينة", icon: Wallet },
  { to: "/orders", label: "الأوردرات", icon: Shirt },
  { to: "/staff", label: "الموظفين", icon: ClipboardList, owner: true },
  { to: "/audit", label: "سجل التعديلات", icon: ScrollText, owner: true },
  { to: "/settings", label: "الإعدادات", icon: Settings },
];

export function AppShell() {
  const { session, db, can, logout } = useFactory();
  const loc = useLocation();
  const nav = can.finance ? financeNav : supervisorNav;
  const onMore = loc.pathname === "/more";

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col md:flex-row">
      <aside className="hidden w-64 shrink-0 border-l bg-primary text-primary-foreground md:flex md:flex-col">
        <div className="px-5 py-6">
          <p className="text-[11px] tracking-wide text-primary-foreground/60">دفتر المصنع</p>
          <h1 className="mt-1 text-xl font-extrabold leading-7">{db.factory?.name}</h1>
          <p className="mt-2 text-sm text-accent">{session ? ROLE_LABEL[session.role] : ""}</p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {(can.finance ? [...financeNav.filter((x) => x.to !== "/more"), ...moreLinks.filter((l) => !("owner" in l) || can.staff)] : supervisorNav).map(
            (item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? item.end : false}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold",
                    isActive ? "bg-white/12 text-white" : "text-primary-foreground/75 hover:bg-white/8 hover:text-white",
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ),
          )}
        </nav>
        <button onClick={logout} className="m-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-primary-foreground/70 hover:bg-white/8">
          <LogOut className="h-4 w-4" />
          خروج
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <header className="sticky top-0 z-20 border-b bg-background/90 px-4 py-3 backdrop-blur md:hidden">
          <p className="text-[11px] text-muted-foreground">{session ? ROLE_LABEL[session.role] : ""}</p>
          <h1 className="truncate text-base font-extrabold">{db.factory?.name}</h1>
        </header>
        <main className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-card/95 backdrop-blur md:hidden" style={{ gridTemplateColumns: `repeat(${nav.length}, 1fr)` }}>
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={"end" in item ? item.end : false}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold",
                isActive || (item.to === "/more" && onMore) ? "text-primary" : "text-muted-foreground",
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
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
      <h2 className="text-xl font-extrabold">المزيد</h2>
      {links.map((l) => (
        <NavLink key={l.to} to={l.to} className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3">
          <l.icon className="h-5 w-5 text-primary" />
          <span className="font-semibold">{l.label}</span>
        </NavLink>
      ))}
      <button onClick={logout} className="flex w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-late">
        <LogOut className="h-5 w-5" />
        <span className="font-semibold">خروج</span>
      </button>
    </div>
  );
}
