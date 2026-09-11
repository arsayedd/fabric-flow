import { Link } from "react-router-dom";
import { ArrowLeft, CalendarDays, CircleCheck, History, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Gauge } from "@/components/charts/Chart";
import { formatDate, money, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { factoryHealth, type HealthKey } from "@/store/health";
import { QUICK_ACTIONS } from "@/store/nav";
import {
  activity,
  calendar,
  emptiness,
  finSeries,
  rangeOf,
  targets,
  type Range,
} from "@/store/command";
import { Explain, Needs, Section } from "./Kit";

/** كل مؤشر في الدرجة بيفتح الشاشة اللي بتتحل فيها — مفيش رقم بلا طريق */
const HEALTH_ROUTE: Record<HealthKey, string> = {
  production: "/production",
  cost: "/costing",
  quality: "/production",
  inventory: "/materials",
  workforce: "/workers",
  delivery: "/planning",
  profitability: "/costing",
  cash: "/treasury",
};

/* ── ٤ + ٥٩) صحة المصنع ───────────────────────────────────────── */

export function FactoryHealthCard() {
  const { db } = useFactory();
  const health = factoryHealth(db);
  const scored = health.blocks.filter((b) => b.value !== null);
  const missing = health.blocks.filter((b) => b.value === null);

  return (
    <Card>
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex flex-col items-center gap-1.5">
          {health.total === null ? (
            <Badge tone="muted">البيانات مش كفاية</Badge>
          ) : (
            <>
              <Gauge
                value={health.total}
                size={148}
                label="صحة المصنع"
                sub={health.coverage < 99 ? `على ${qty(Math.round(health.coverage), 0)}٪ من الأوزان` : undefined}
              />
              <Badge tone={health.tone}>{health.label}</Badge>
            </>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <h3 className="text-base">الدرجة اتكوّنت إزاي</h3>
            <Explain
              label="صحة المصنع"
              text="تمانية مؤشرات بأوزان مختلفة. المؤشر اللي مفيش له بيانات وزنه بيتوزّع على الباقي بدل ما يتحسب صفر — صفر معناه «وحش» والفاضي معناه «مش مسجّل»."
            />
          </div>
          <p className="text-xs text-muted-foreground">دوس على أي مؤشر تفتح الشاشة اللي بتتحل فيه.</p>

          <ul className="mt-2 grid list-none gap-x-5 gap-y-2 sm:grid-cols-2">
            {scored.map((b) => (
              <li key={b.key}>
                <Link to={HEALTH_ROUTE[b.key]} className="group block">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-sm group-hover:underline">
                      {b.label}
                      <span className="text-xs text-muted-foreground"> وزن {qty(b.weight, 0)}٪</span>
                    </span>
                    <span className="shrink-0 text-sm tabular">{qty(Math.round(b.value as number), 0)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-[width] duration-700 ${
                        (b.value as number) >= 75 ? "bg-ok" : (b.value as number) >= 55 ? "bg-warn" : "bg-danger"
                      }`}
                      style={{ width: `${b.value}%` }}
                    />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground" title={b.why}>
                    {b.why}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          {missing.length ? (
            <p className="mt-2.5 border-t border-border pt-2 text-xs text-muted-foreground">
              مش داخل في الحساب لأن بياناته مش مسجّلة: {missing.map((b) => b.label).join("، ")}. أول ما تتسجّل،
              الدرجة تبقى أصدق.
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

/* ── ٥٦) الهدف مقابل الفعلي ───────────────────────────────────── */

export function TargetsCard({ range }: { range: Range }) {
  const { db } = useFactory();
  const rows = targets(db, range);

  return (
    <Card className="h-full">
      <div className="flex items-center gap-1">
        <h3 className="text-base">الهدف مقابل الفعلي</h3>
        <Explain
          label="الأهداف"
          text="بنعرض الأهداف المسجّلة بس: هدف الهامش من الإعدادات، وهدف الإنتاج من الطاقة، وهدف الاستغلال من قرار الطاقة. مفيش هدف مفترض."
        />
      </div>

      {!rows.length ? (
        <div className="mt-2">
          <Needs what="أهداف مسجّلة — هامش مستهدف في الإعدادات أو قرار طاقة" />
        </div>
      ) : (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="pb-1 text-right font-normal text-muted-foreground">المؤشر</th>
              <th className="pb-1 text-right font-normal text-muted-foreground">الفعلي</th>
              <th className="pb-1 text-right font-normal text-muted-foreground">الهدف</th>
              <th className="pb-1 text-right font-normal text-muted-foreground">الفرق</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const fmt = (v: number) =>
                r.format === "money" ? money(v) : r.format === "pct" ? `${qty(Math.round(v), 0)}٪` : qty(Math.round(v), 0);
              return (
                <tr key={r.key} className="border-b border-border last:border-0">
                  <td className="py-1.5">{r.label}</td>
                  <td className="py-1.5 tabular">{fmt(r.actual as number)}</td>
                  <td className="py-1.5 tabular text-muted-foreground">{fmt(r.target as number)}</td>
                  <td className="py-1.5">
                    {r.variancePoints === null && r.variancePct === null ? (
                      "—"
                    ) : (
                      <span className={`tabular ${r.tone === "ok" ? "text-ok" : r.tone === "danger" ? "text-danger" : "text-warn"}`}>
                        {(r.variancePoints ?? r.variancePct ?? 0) > 0 ? "+" : ""}
                        {r.variancePoints !== null
                          ? `${qty(Math.round(r.variancePoints), 0)} نقطة`
                          : `${qty(Math.round(r.variancePct as number), 0)}٪`}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {rows.length ? (
        <p className="mt-2 text-xs text-muted-foreground">
          مصادر الأهداف: {[...new Set(rows.map((r) => r.source))].filter(Boolean).join("، ")}.
        </p>
      ) : null}
    </Card>
  );
}

/* ── ٥٨) من أول السنة ─────────────────────────────────────────── */

export function YtdCard() {
  const { db } = useFactory();
  const year = rangeOf("year");
  const series = finSeries(db, year, "month");
  const t = series.reduce(
    (a, p) => ({ revenue: a.revenue + p.revenue, cost: a.cost + p.cost, profit: a.profit + p.profit, units: a.units + p.units }),
    { revenue: 0, cost: 0, profit: 0, units: 0 },
  );

  if (t.revenue === 0 && t.units === 0) return null;

  return (
    <Card className="h-full">
      <h3 className="text-base">من أول السنة</h3>
      <p className="text-xs text-muted-foreground">{year.label} لحد النهارده</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <Mini label="الإيراد" value={money(t.revenue)} />
        <Mini label="المصروف" value={money(t.cost)} />
        <Mini label="الربح" value={money(t.profit)} tone={t.profit >= 0 ? "ok" : "danger"} />
        <Mini label="الإنتاج" value={`${qty(Math.round(t.units), 0)} قطعة`} />
      </div>
    </Card>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "ok" | "danger" }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`tabular ${tone === "ok" ? "text-ok" : tone === "danger" ? "text-danger" : ""}`}>{value}</p>
    </div>
  );
}

/* ── ٥٣) آخر النشاط ───────────────────────────────────────────── */

export function ActivityCard({ limit = 7 }: { limit?: number }) {
  const { db, can } = useFactory();
  const rows = activity(db, limit);

  return (
    <Card className="h-full">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h3 className="text-base">آخر النشاط</h3>
        </div>
        {can.audit ? (
          <Link to="/audit" className="text-sm text-accent underline-offset-4 hover:underline">
            سجل التعديلات
          </Link>
        ) : null}
      </div>

      {!rows.length ? (
        <p className="mt-1.5 text-sm text-muted-foreground">مفيش تعديلات مسجّلة لسه.</p>
      ) : (
        <ol className="mt-2 list-none space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex gap-2.5">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm">
                  {r.to ? (
                    <Link to={r.to} className="underline-offset-4 hover:underline">
                      {r.text}
                    </Link>
                  ) : (
                    r.text
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.actor} · {formatDate(r.at.slice(0, 10))}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/* ── ٥٤) تقويم المصنع ─────────────────────────────────────────── */

export function CalendarCard({ days = 10 }: { days?: number }) {
  const { db } = useFactory();
  const rows = calendar(db, days).filter((d) => d.orders.length || d.payments.length || d.tasks.length);

  return (
    <Card className="h-full">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        <h3 className="text-base">مواعيد قادمة</h3>
      </div>
      <p className="text-xs text-muted-foreground">تسليم أوامر، استحقاق سداد، ومهام — من نفس الدفاتر</p>

      {!rows.length ? (
        <p className="mt-2 text-sm text-muted-foreground">مفيش مواعيد في الـ{qty(days, 0)} يوم الجايين.</p>
      ) : (
        <ul className="mt-2 list-none divide-y divide-border">
          {rows.map((d) => (
            <li key={d.date} className="py-2 first:pt-0 last:pb-0">
              <div className="flex items-baseline gap-2">
                <span className="text-sm tabular">{d.label}</span>
                {d.isToday ? <Badge tone="gold">النهارده</Badge> : null}
                {!d.isWorkDay ? <span className="text-xs text-muted-foreground">(مش يوم عمل)</span> : null}
              </div>
              <ul className="mt-0.5 list-none space-y-0.5">
                {d.orders.map((o) => (
                  <li key={o.id} className="text-xs">
                    <Link to={`/orders/${o.id}`} className="text-muted-foreground underline-offset-4 hover:underline">
                      تسليم أمر <span className="latin tabular">{o.code}</span>
                    </Link>
                  </li>
                ))}
                {d.payments.map((p) => (
                  <li key={`${p.clientId}-${p.amount}`} className="text-xs">
                    <Link to={`/parties/${p.clientId}`} className="text-muted-foreground underline-offset-4 hover:underline">
                      استحقاق {money(p.amount)} من {p.name}
                    </Link>
                  </li>
                ))}
                {d.tasks.map((t) => (
                  <li key={t.id} className="text-xs text-muted-foreground">
                    مهمة: {t.title}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ── ٥٢) أفعال سريعة ──────────────────────────────────────────── */

export function QuickActions() {
  const { can } = useFactory();
  const rows = QUICK_ACTIONS.filter((a) => can.do(a.perm, a.action));
  if (!rows.length) return null;

  return (
    <Section title="ابدأ من هنا" hint="الأفعال اللي بتتكرر كل يوم">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {rows.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm transition-colors hover:border-accent/60"
          >
            <a.icon className="h-4 w-4 shrink-0 text-accent" aria-hidden />
            <span className="min-w-0 truncate">{a.label}</span>
          </Link>
        ))}
      </div>
    </Section>
  );
}

/* ── ٧٥) مصنع لسه فاضي ────────────────────────────────────────── */

export function EmptyFactory() {
  const { db } = useFactory();
  const e = emptiness(db);
  const done = e.counts.filter((c) => c.n > 0).length;
  const pct = Math.round((done / e.counts.length) * 100);

  return (
    <div className="space-y-4">
      <Card className="border-r-2 border-r-accent">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-accent" />
          <h2 className="text-xl">غرفة تحكم مصنعك لسه فاضية</h2>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          اللوحة دي بتتبنى من بياناتك، فمش هنوريك خمستاشر كارت كله أصفار. كل حاجة تسجّلها بتفتح جزء جديد —
          وده اللي ناقص دلوقتي:
        </p>

        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-muted-foreground">جهوزية اللوحة</span>
            <span className="text-sm tabular">{qty(pct, 0)}٪</span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <ul className="mt-3 grid list-none gap-2 sm:grid-cols-2">
          {e.counts.map((c) => (
            <li key={c.label}>
              <Link
                to={c.to}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:border-accent/60"
              >
                <span className="flex items-center gap-2">
                  {c.n > 0 ? (
                    <CircleCheck className="h-4 w-4 shrink-0 text-ok" aria-hidden />
                  ) : (
                    <span className="h-4 w-4 shrink-0 rounded-full border border-input" aria-hidden />
                  )}
                  {c.label}
                </span>
                <span className="shrink-0 text-xs tabular text-muted-foreground">
                  {c.n > 0 ? `${qty(c.n, 0)} مسجّل` : "لسه"}
                  <ArrowLeft className="ml-1 inline h-3 w-3" />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-xs text-muted-foreground">
          أول أمر إنتاج بمراحل مسجّلة هو اللي بيشغّل أغلب اللوحة: الإنتاج، الجودة، الاختناق، والتكلفة الفعلية.
        </p>
        <Button asChild size="sm" className="mt-2">
          <Link to="/orders">افتح أوامر الإنتاج</Link>
        </Button>
      </Card>

      <QuickActions />
    </div>
  );
}
