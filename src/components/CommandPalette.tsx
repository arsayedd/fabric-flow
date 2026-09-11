import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, Cog, Search } from "lucide-react";
import { cn, normalize } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { NAV, QUICK_ACTIONS } from "@/store/nav";
import { ENTITY_ICON } from "@/store/nav";
import { loadSeen } from "@/store/recents";
import { SEARCH_KIND_LABEL, searchAll, type SearchHit } from "@/store/search";

/**
 * لوحة الأوامر — ⌘K.
 *
 * مش مجرد بحث: من هنا تنفّذ فعل على طول بدل ما تدور في الشاشات.
 * وكل صف فيها بيمرّ على نفس سؤال الصلاحية — اللي مالوش حق يشوف موديول
 * مايلاقيش سجلاته هنا ولا يلاقي فعله هنا، فاللوحة دي مش باب خلفي.
 */

type Row = {
  key: string;
  label: string;
  hint: string;
  to: string;
  icon: typeof Search;
  group: string;
};

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { db, can, account } = useFactory();
  const nav = useNavigate();
  const [term, setTerm] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const factoryId = db.factory?.id ?? "";

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const q = term.trim();
    const nq = normalize(q);
    const looks = (text: string) => !q || normalize(text).includes(nq);

    for (const a of QUICK_ACTIONS) {
      if (!can.do(a.perm, a.action)) continue;
      if (!looks(`إضافة ${a.label}`)) continue;
      out.push({ key: `act-${a.key}`, label: `إضافة ${a.label}`, hint: "تنفيذ", to: a.to, icon: a.icon, group: "أفعال" });
    }

    for (const section of NAV) {
      for (const it of section.items) {
        if (!it.ready || !can.do(it.perm, "view")) continue;
        if (!looks(`${section.label} ${it.label}`)) continue;
        out.push({
          key: `nav-${it.to}-${it.label}`,
          label: it.label,
          hint: section.label,
          to: it.to,
          icon: section.icon,
          group: "الشاشات",
        });
      }
    }

    if (q.length >= 2) {
      for (const hit of searchAll(db, q, can.do)) {
        out.push({
          key: `hit-${hit.kind}-${hit.id}`,
          label: hit.title,
          hint: `${SEARCH_KIND_LABEL[hit.kind]} · ${hit.subtitle}`,
          to: hit.to,
          icon: iconFor(hit),
          group: "السجلات",
        });
      }
    }

    if (!q) {
      for (const seen of loadSeen(factoryId).slice(0, 5)) {
        out.push({ key: `seen-${seen.id}`, label: seen.label, hint: "آخر ما شُوهد", to: seen.to, icon: Clock, group: "رجوع لآخر شغل" });
      }
    }

    return out.slice(0, 40);
  }, [term, db, can, factoryId]);

  const go = (to: string) => {
    onClose();
    nav(to);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(rows.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter" && rows[cursor]) {
      e.preventDefault();
      go(rows[cursor].to);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[10vh]">
      <button className="absolute inset-0 bg-[#0f1720]/55 backdrop-blur-sm" aria-label="إغلاق" onClick={onClose} />
      <div className="relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={input}
            value={term}
            autoFocus
            onChange={(e) => {
              setTerm(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onKey}
            placeholder={`ابحث في ${account.workspace?.name ?? db.factory?.name ?? "المصنع"} أو نفّذ أمر…`}
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="latin hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">Esc</kbd>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              مفيش نتيجة لـ«{term}». جرّب رقم أمر، اسم عميل، أو اسم خامة.
            </p>
          ) : (
            rows.map((row, i) => {
              const head = row.group !== lastGroup ? row.group : null;
              lastGroup = row.group;
              return (
                <div key={row.key}>
                  {head ? <p className="px-4 pb-1 pt-3 text-[11px] text-muted-foreground">{head}</p> : null}
                  <button
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(row.to)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-right text-sm",
                      i === cursor ? "bg-secondary" : "hover:bg-secondary/60",
                    )}
                  >
                    <row.icon className={cn("h-4 w-4 shrink-0", i === cursor ? "text-accent" : "text-muted-foreground")} />
                    <span className="min-w-0 flex-1 truncate">{row.label}</span>
                    <span className="shrink-0 truncate text-xs text-muted-foreground">{row.hint}</span>
                    {i === cursor ? <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          <span>أسهم فوق وتحت للتنقل · Enter للفتح</span>
          <span className="latin">⌘K</span>
        </div>
      </div>
    </div>
  );
}

function iconFor(hit: SearchHit) {
  if (hit.kind === "page") return Cog;
  return ENTITY_ICON[hit.kind] ?? Cog;
}
