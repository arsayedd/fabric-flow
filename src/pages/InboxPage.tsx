import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BellOff, CircleCheck, ListChecks } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Card } from "@/components/ui/card";
import { cairoToday, cn, formatDate, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import {
  NOTIF_LABEL,
  loadNotifState,
  markRead,
  notifications,
  saveNotifState,
  type NotifCategory,
} from "@/store/notifications";

/**
 * «ما يحتاج اهتمامك» — نفس محرّك الاستثناءات اللي بيغذّي الجرس، في صفحة كاملة.
 * مفيش قايمة تانية بقواعد تانية: مصدر واحد، وترتيب واحد بالأثر الفعلي
 * (فلوس أو أيام تأخير)، مش بترتيب الكود ولا بتاريخ الإدخال.
 */
export function AlertsPage() {
  const { db } = useFactory();
  const factoryId = db.factory?.id ?? "";
  const [state, setState] = useState(() => loadNotifState(factoryId));
  const [tab, setTab] = useState<NotifCategory | "all">("all");
  const rows = useMemo(() => notifications(db, state), [db, state]);
  const cats = [...new Set(rows.map((r) => r.category))];
  const shown = tab === "all" ? rows : rows.filter((r) => r.category === tab);

  const write = (next: ReturnType<typeof loadNotifState>) => {
    setState(next);
    saveNotifState(factoryId, next);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl">ما يحتاج اهتمامك</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          محسوب من بيانات المصنع دلوقتي ومرتّب بأثره الفعلي. أي حالة بتتحل بتختفي من هنا لوحدها.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="مفيش حاجة محتاجة تدخّل منك"
          body="مفيش أوامر متأخرة ولا خامة قربت تخلص ولا تحصيل فات ميعاده. لو دخلت بيانات أكتر، المتابعة هنا بتبقى أدق."
        />
      ) : (
        <>
          {cats.length > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              {(["all", ...cats] as (NotifCategory | "all")[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setTab(c)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs",
                    tab === c ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                  )}
                >
                  {c === "all"
                    ? `الكل ${qty(rows.length, 0)}`
                    : `${NOTIF_LABEL[c]} ${qty(rows.filter((r) => r.category === c).length, 0)}`}
                </button>
              ))}
            </div>
          ) : null}

          <div className="space-y-2">
            {shown.map((n) => (
              <Card key={n.key} className={cn("p-4", !n.read && "border-s-2 border-s-accent")}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base leading-snug">{n.title}</p>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[11px]",
                      n.tone === "danger" ? "bg-danger-soft text-danger" : n.tone === "warn" ? "bg-warn-soft text-warn" : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {NOTIF_LABEL[n.category]}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{n.why}</p>
                <p className="mt-2 text-sm">{n.action}</p>
                <div className="mt-3 flex items-center gap-4 text-sm">
                  {n.to ? (
                    <Link to={n.to} onClick={() => write(markRead(state, n.key))} className="text-accent">
                      افتح السجل
                    </Link>
                  ) : null}
                  {n.read ? (
                    <span className="text-xs text-muted-foreground">مقروء</span>
                  ) : (
                    <button onClick={() => write(markRead(state, n.key))} className="text-xs text-muted-foreground">
                      قرأته
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * مهامي.
 *
 * المهمة عندنا مربوطة بجهة تعامل أو بمتابعة اتفقت عليها في مكالمة — مش
 * قايمة منفصلة بتتكتب في الهوا. عشان كده أي مهمة هنا لينك يفتح السجل
 * اللي جاية منه.
 */
export function TasksPage() {
  const { db, computed, toggleTask } = useFactory();
  const today = cairoToday();
  const open = computed.openTasks;
  const done = db.tasks.filter((t) => t.status === "done").slice(0, 20);
  const name = (id: string | null) => (id ? db.parties.find((p) => p.id === id)?.name ?? null : null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl">مهامي</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {open.length ? `${qty(open.length, 0)} مهمة مفتوحة، أقربها ${formatDate(open[0].dueDate)}.` : "مفيش مهام مفتوحة."}
        </p>
      </div>

      {open.length === 0 && done.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="لسه مفيش مهام"
          body="المهام بتتولد لوحدها لما تسجّل متابعة في مكالمة مع عميل، أو تكتبها بنفسك من ملف الجهة."
        />
      ) : (
        <div className="space-y-2">
          {open.map((t) => {
            const late = t.dueDate < today;
            return (
              <Card key={t.id} className="flex items-start gap-3 p-3.5">
                <button onClick={() => toggleTask(t.id)} className="mt-0.5 text-muted-foreground hover:text-ok" aria-label="تم">
                  <CircleCheck className="h-5 w-5" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug">{t.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className={late ? "text-danger" : undefined}>{formatDate(t.dueDate)}</span>
                    {t.assigneeName ? ` · ${t.assigneeName}` : ""}
                    {name(t.partyId) ? " · " : ""}
                    {name(t.partyId) ? (
                      <Link to={`/parties/${t.partyId}`} className="text-accent">
                        {name(t.partyId)}
                      </Link>
                    ) : null}
                  </p>
                </div>
              </Card>
            );
          })}

          {done.length ? (
            <details className="rounded-lg border border-border bg-card p-3.5">
              <summary className="cursor-pointer text-sm text-muted-foreground">خلصت ({qty(done.length, 0)})</summary>
              <ul className="mt-2 space-y-1.5">
                {done.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                    <span className="truncate line-through">{t.title}</span>
                    <button onClick={() => toggleTask(t.id)} className="shrink-0 text-xs text-accent">
                      رجّعها
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      )}
    </div>
  );
}
