import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  BellOff,
  CheckCheck,
  CircleHelp,
  LogOut,
  Menu,
  Plus,
  ScanLine,
  Search,
  UserRound,
} from "lucide-react";
import { addDays, cairoToday, cn, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { QUICK_ACTIONS } from "@/store/nav";
import {
  NOTIF_LABEL,
  loadNotifState,
  markAllRead,
  markRead,
  notifications,
  saveNotifState,
  snooze,
  unreadCount,
  type NotifCategory,
} from "@/store/notifications";
import { ROLE_LABEL } from "@/store/types";

/**
 * الشريط العلوي.
 *
 * خمس حاجات بس، وكل واحدة بتجاوب على سؤال بيتكرر كل يوم:
 * البحث (ألاقي حاجة)، «مسح» (الحاجة اللي في إيدي دي إيه)، «+ إضافة»
 * (أعمل حاجة)، الجرس (إيه اللي محتاج اهتمامي)، والحساب (أنا مين وبأي
 * صلاحية). أي حاجة غير كده مكانها جوه الصفحة.
 *
 * و«مسح» ثابت هنا **عن قصد**: اللي ماسك باندل أو رول قماش مش المفروض
 * يدور على الشاشة الصح — الزر في وشه في أي صفحة، والكود هو اللي بيقول
 * إحنا رايحين فين.
 */
export function Topbar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const { db } = useFactory();
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
      <button onClick={onMenu} className="rounded-md p-2 text-muted-foreground hover:bg-secondary md:hidden" aria-label="القائمة">
        <Menu className="h-5 w-5" />
      </button>

      <button
        onClick={onSearch}
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground hover:border-accent/50 md:max-w-sm"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate">ابحث أو نفّذ أمر</span>
        <kbd className="latin ms-auto hidden shrink-0 rounded border border-border px-1.5 text-[10px] sm:block">⌘K</kbd>
      </button>

      <div className="ms-auto flex shrink-0 items-center gap-1">
        <Link
          to="/scan"
          className="flex h-9 items-center gap-1.5 rounded-md border border-gold/50 px-2.5 text-sm text-gold hover:bg-gold/10"
          aria-label="مسح كود"
        >
          <ScanLine className="h-4 w-4" />
          <span className="hidden sm:inline">مسح</span>
        </Link>
        <QuickCreate />
        {/* المفتاح هو المصنع: تبديل المصنع بيبني الجرس من أول وجديد بدل ما يفضل شايل حالة مصنع تاني */}
        <NotificationsBell key={db.factory?.id ?? "none"} />
        <Link
          to="/help"
          className="hidden rounded-md p-2 text-muted-foreground hover:bg-secondary sm:block"
          aria-label="المساعدة"
        >
          <CircleHelp className="h-5 w-5" />
        </Link>
        <UserMenu />
      </div>
    </header>
  );
}

/* ── + إضافة ───────────────────────────────────────────────────── */

function QuickCreate() {
  const { can } = useFactory();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const rows = QUICK_ACTIONS.filter((a) => can.do(a.perm, a.action));
  useOutside(box, open, () => setOpen(false));
  if (!rows.length) return null;

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-2.5 text-sm text-primary-foreground hover:bg-primary/90"
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">إضافة</span>
      </button>
      {open ? (
        <div className="absolute end-0 top-11 z-40 w-56 overflow-hidden rounded-lg border border-border bg-card shadow-xl">
          {rows.map((a) => (
            <Link
              key={a.key}
              to={a.to}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 border-b border-border px-3 py-2.5 text-sm last:border-0 hover:bg-secondary"
            >
              <a.icon className="h-4 w-4 text-muted-foreground" />
              {a.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ── الجرس ─────────────────────────────────────────────────────── */

const TONE_DOT: Record<string, string> = {
  danger: "bg-danger",
  warn: "bg-warn",
  info: "bg-muted-foreground",
};

function NotificationsBell() {
  const { db } = useFactory();
  const factoryId = db.factory?.id ?? "";
  const [state, setState] = useState(() => loadNotifState(factoryId));
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<NotifCategory | "all">("all");
  const box = useRef<HTMLDivElement>(null);
  useOutside(box, open, () => setOpen(false));

  const rows = useMemo(() => notifications(db, state), [db, state]);
  const unread = unreadCount(rows);
  const shown = tab === "all" ? rows : rows.filter((r) => r.category === tab);
  const cats = [...new Set(rows.map((r) => r.category))];

  const write = (next: ReturnType<typeof loadNotifState>) => {
    setState(next);
    saveNotifState(factoryId, next);
  };

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-2 text-muted-foreground hover:bg-secondary"
        aria-label={`الإشعارات${unread ? ` — ${unread} جديد` : ""}`}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 ? (
          <span className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] text-white">
            {qty(unread, 0)}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute end-0 top-11 z-40 flex max-h-[70vh] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-sm">ما يحتاج اهتمامك</p>
            {rows.length ? (
              <button
                onClick={() => write(markAllRead(state, rows))}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                تحديد الكل كمقروء
              </button>
            ) : null}
          </div>

          {cats.length > 1 ? (
            <div className="flex gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
              {(["all", ...cats] as (NotifCategory | "all")[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setTab(c)}
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-xs",
                    tab === c ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                  )}
                >
                  {c === "all" ? `الكل ${qty(rows.length, 0)}` : `${NOTIF_LABEL[c]} ${qty(rows.filter((r) => r.category === c).length, 0)}`}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex-1 overflow-y-auto">
            {shown.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <BellOff className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                <p className="text-sm">مفيش حاجة محتاجة تدخّل منك دلوقتي.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  الإشعارات هنا محسوبة من بيانات المصنع دلوقتي، فأي حاجة بتتحل بتختفي لوحدها.
                </p>
              </div>
            ) : (
              shown.map((n) => (
                <div key={n.key} className={cn("border-b border-border px-3 py-2.5 last:border-0", !n.read && "bg-secondary/40")}>
                  <div className="flex items-start gap-2">
                    <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT[n.tone])} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug">{n.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{n.why}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                        <span className="text-muted-foreground">{NOTIF_LABEL[n.category]}</span>
                        {n.to ? (
                          <Link
                            to={n.to}
                            onClick={() => {
                              write(markRead(state, n.key));
                              setOpen(false);
                            }}
                            className="text-accent"
                          >
                            افتح السجل
                          </Link>
                        ) : null}
                        <button onClick={() => write(snooze(state, n.key, addDays(cairoToday(), 1)))} className="text-muted-foreground">
                          أجّله بكرة
                        </button>
                        {n.read ? null : (
                          <button onClick={() => write(markRead(state, n.key))} className="text-muted-foreground">
                            قرأته
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <Link to="/alerts" onClick={() => setOpen(false)} className="border-t border-border px-3 py-2 text-center text-xs text-accent">
            كل ما يحتاج اهتمامك
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/* ── الحساب ────────────────────────────────────────────────────── */

function UserMenu() {
  const { session, account, logout, signOut, leaveWorkspace } = useFactory();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useOutside(box, open, () => setOpen(false));

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-primary"
        aria-label="الحساب"
      >
        <UserRound className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute end-0 top-11 z-40 w-60 overflow-hidden rounded-lg border border-border bg-card shadow-xl">
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-sm">{session?.name ?? account.user?.fullName ?? "مستخدم"}</p>
            <p className="latin truncate text-xs text-muted-foreground">{session?.email ?? account.user?.email ?? ""}</p>
            <p className="mt-1 text-xs text-accent">{session ? ROLE_LABEL[session.role] : ""}</p>
          </div>
          <Link to="/settings" onClick={() => setOpen(false)} className="block border-b border-border px-3 py-2.5 text-sm hover:bg-secondary">
            إعدادات المصنع
          </Link>
          <Link to="/help" onClick={() => setOpen(false)} className="block border-b border-border px-3 py-2.5 text-sm hover:bg-secondary">
            المساعدة والاختصارات
          </Link>
          {account.mine.length > 1 ? (
            <button
              onClick={() => {
                setOpen(false);
                leaveWorkspace();
                nav("/factories");
              }}
              className="block w-full border-b border-border px-3 py-2.5 text-right text-sm hover:bg-secondary"
            >
              تبديل المصنع
            </button>
          ) : null}
          <button
            onClick={() => {
              setOpen(false);
              if (account.user) signOut();
              else logout();
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-right text-sm text-danger hover:bg-secondary"
          >
            <LogOut className="h-4 w-4" />
            خروج
          </button>
        </div>
      ) : null}
    </div>
  );
}

function useOutside(ref: React.RefObject<HTMLElement | null>, active: boolean, close: () => void) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, active, close]);
}
