import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronsUpDown, Factory as FactoryIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ROOT_DOMAIN } from "@/store/account";
import { useFactory } from "@/store/context";

/**
 * تبديل المصنع من أول القائمة الجانبية.
 * تغيير المصنع بيقفل دفتر المصنع الحالي ويفتح دفتر التاني من مفتاحه —
 * يعني الشاشات كلها بتتغيّر مع بعض، مفيش بيانات مصنع بتفضل معروضة في مصنع تاني.
 */
export function WorkspaceSwitcher({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const { account, enterWorkspace, db } = useFactory();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const rows = account.mine;
  const many = rows.length > 1 || !!account.user;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const name = account.workspace?.name ?? db.factory?.name ?? "مصنعي";
  const slug = account.workspace?.subdomain;
  const dark = tone === "dark";

  const head = (
    <span className="flex min-w-0 flex-1 items-center gap-2.5 text-right">
      {account.workspace?.logo ? (
        <img src={account.workspace.logo} alt="" className="h-8 w-8 shrink-0 rounded-md bg-white object-contain" />
      ) : (
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
            dark ? "bg-[#1b2634] text-accent" : "bg-secondary text-primary",
          )}
        >
          <FactoryIcon className="h-4 w-4" />
        </span>
      )}
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm">{name}</span>
        {slug ? (
          <span className={cn("latin block truncate text-[11px]", dark ? "text-primary-foreground/50" : "text-muted-foreground")}>
            {slug}.{ROOT_DOMAIN}
          </span>
        ) : null}
      </span>
    </span>
  );

  if (!many) return <div className="flex items-center px-2 py-2">{head}</div>;

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-2 transition-colors",
          dark ? "hover:bg-[#161f2a]" : "hover:bg-muted",
        )}
      >
        {head}
        <ChevronsUpDown className={cn("h-4 w-4 shrink-0", dark ? "text-primary-foreground/50" : "text-muted-foreground")} />
      </button>

      {open ? (
        <div className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-md border border-border bg-card text-foreground shadow-lg">
          {rows.map((w) => (
            <button
              key={w.factoryId}
              onClick={() => {
                setOpen(false);
                if (w.factoryId === account.workspace?.factoryId) return;
                try {
                  enterWorkspace(w.factoryId);
                  nav("/");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "مش قادر يفتح المصنع.");
                }
              }}
              className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2.5 text-right text-sm last:border-0 hover:bg-muted"
            >
              <span className="min-w-0">
                <span className="block truncate">{w.name}</span>
                <span className="latin block truncate text-[11px] text-muted-foreground">{w.subdomain}.{ROOT_DOMAIN}</span>
              </span>
              {w.factoryId === account.workspace?.factoryId ? <Check className="h-4 w-4 shrink-0 text-accent" /> : null}
            </button>
          ))}
          <button
            onClick={() => {
              setOpen(false);
              nav("/factories/new");
            }}
            className="flex w-full items-center gap-2 bg-secondary/60 px-3 py-2.5 text-right text-sm hover:bg-secondary"
          >
            <Plus className="h-4 w-4" />
            مصنع جديد
          </button>
        </div>
      ) : null}
    </div>
  );
}
