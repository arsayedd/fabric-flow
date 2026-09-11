import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Info } from "lucide-react";
import { Spark } from "@/components/charts/Chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cairoHour, cairoToday, formatDate, money, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import {
  COMPARE_LABEL,
  COMPARE_MODES,
  DASH_MODE_HINT,
  DASH_MODE_LABEL,
  RANGE_KEYS,
  RANGE_LABEL,
  rangeOf,
  type CompareMode,
  type DashMode,
  type Kpi,
  type Range,
  type RangeKey,
} from "@/store/command";

/* ── حالة اللوحة: مدى + مقارنة + وضع ──────────────────────────── */

export type DashState = {
  rangeKey: RangeKey;
  custom: { from: string; to: string };
  compare: CompareMode;
  mode: DashMode;
};

export function greeting(): string {
  const h = cairoHour();
  if (h < 12) return "صباح الخير";
  if (h < 17) return "نهارك سعيد";
  return "مساء الخير";
}

/* ── رقم بيعدّ لما يظهر ────────────────────────────────────────── */

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * العدّاد. حركة واحدة قصيرة أول ما الرقم يتغيّر، وبتحترم
 * `prefers-reduced-motion` — الحركة مش مفروضة على حد.
 */
export function CountUp({ value, format }: { value: number; format: "money" | "qty" | "pct" }) {
  const animate = !reduceMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    if (!animate) return;
    const start = from.current;
    const t0 = performance.now();
    let frame = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 420);
      const eased = 1 - (1 - p) ** 3;
      setShown(start + (value - start) * eased);
      if (p < 1) frame = requestAnimationFrame(step);
      else from.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, animate]);

  const n = animate ? shown : value;
  const text = format === "money" ? money(n) : format === "pct" ? `${qty(Math.round(n), 0)}٪` : qty(Math.round(n), 0);
  return <span className="tabular">{text}</span>;
}

/* ── شرح المؤشر ────────────────────────────────────────────────── */

/** كل رقم لازم يكون مفهوم إزاي اتحسب — الأيقونة دي هي الإجابة */
export function Explain({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={`إزاي اتحسب ${label}`}
        aria-expanded={open}
        onClick={(e) => {
          // الأيقونة جوه كارت قابل للفتح، فلازم تمنع الفتح ده
          e.preventDefault();
          e.stopPropagation();
          setOpen(!open);
        }}
        onBlur={() => setOpen(false)}
        className="text-muted-foreground hover:text-foreground"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <span className="absolute right-0 top-5 z-20 w-56 rounded-md border border-border bg-card p-2 text-xs leading-relaxed text-muted-foreground shadow-md">
          {text}
        </span>
      ) : null}
    </span>
  );
}

/* ── ترويسة اللوحة ─────────────────────────────────────────────── */

export function CommandHeader({
  state,
  onChange,
  modes,
}: {
  state: DashState;
  onChange: (next: DashState) => void;
  modes: DashMode[];
}) {
  const { session, db } = useFactory();
  // الاسم بالكامل: أول كلمة لوحدها بتطلّع نداء أعرج زي «يا صاحب»
  const name = (session?.name ?? "").trim();

  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{formatDate(cairoToday())}</p>
          <h2 className="text-2xl">
            {greeting()}
            {name ? ` يا ${name}` : ""}
          </h2>
          <p className="text-sm text-muted-foreground">
            ده اللي بيحصل في {db.factory?.name ?? "المصنع"} دلوقتي — والقرارات اللي مستنية منك.
          </p>
        </div>

        {modes.length > 1 ? (
          <div
            role="tablist"
            aria-label="وضع اللوحة"
            className="flex shrink-0 overflow-hidden rounded-md border border-border bg-card"
          >
            {modes.map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={state.mode === m}
                title={DASH_MODE_HINT[m]}
                onClick={() => onChange({ ...state, mode: m })}
                className={`px-2.5 py-1.5 text-sm ${
                  state.mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {DASH_MODE_LABEL[m]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <RangeBar state={state} onChange={onChange} />
    </header>
  );
}

function RangeBar({ state, onChange }: { state: DashState; onChange: (next: DashState) => void }) {
  const showCustom = state.rangeKey === "custom";
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {RANGE_KEYS.map((k) => (
          <button
            key={k}
            onClick={() => onChange({ ...state, rangeKey: k })}
            aria-pressed={state.rangeKey === k}
            className={`rounded-full px-2.5 py-1 text-sm ${
              state.rangeKey === k
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {RANGE_LABEL[k]}
          </button>
        ))}
      </div>

      {showCustom ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground">من</label>
          <Input
            type="date"
            value={state.custom.from}
            max={state.custom.to}
            onChange={(e) => onChange({ ...state, custom: { ...state.custom, from: e.target.value } })}
            className="h-8 w-40"
          />
          <label className="text-xs text-muted-foreground">لـ</label>
          <Input
            type="date"
            value={state.custom.to}
            min={state.custom.from}
            max={cairoToday()}
            onChange={(e) => onChange({ ...state, custom: { ...state.custom, to: e.target.value } })}
            className="h-8 w-40"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
        <span className="text-xs text-muted-foreground">مقارنة بـ</span>
        {COMPARE_MODES.map((m) => (
          <button
            key={m}
            onClick={() => onChange({ ...state, compare: m })}
            aria-pressed={state.compare === m}
            className={`rounded-full px-2.5 py-0.5 text-xs ${
              state.compare === m ? "bg-accent-soft text-accent-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {COMPARE_LABEL[m]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** المدى الفعلي من الحالة — مكان واحد بيحسبه */
export function rangeFromState(state: DashState): Range {
  return rangeOf(state.rangeKey, cairoToday(), state.custom);
}

/* ── كارت مؤشر ─────────────────────────────────────────────────── */

export function KpiCard({ kpi }: { kpi: Kpi }) {
  const up = kpi.deltaPct !== null && kpi.deltaPct > 0;
  const good = kpi.deltaPct === null ? null : kpi.upIsGood === up;
  const targetHit =
    kpi.target !== null && kpi.value !== null ? (kpi.upIsGood ? kpi.value >= kpi.target : kpi.value <= kpi.target) : null;

  return (
    <Card className="group h-full transition-colors hover:border-accent/60">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1">
          {/* العنوان هو الرابط، والأيقونة زرار لوحده: زرار جوه رابط مش HTML سليم */}
          {kpi.to ? (
            <Link to={kpi.to} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
              {kpi.label}
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">{kpi.label}</p>
          )}
          <Explain text={kpi.explain} label={kpi.label} />
        </div>
        {kpi.to ? (
          <Link to={kpi.to} aria-label={`افتح ${kpi.label}`} className="shrink-0 text-muted-foreground hover:text-foreground">
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>

      {kpi.value === null ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">مش محسوب</p>
          <p className="mt-0.5 text-xs text-muted-foreground">محتاج: {kpi.missing}</p>
        </>
      ) : (
        <>
          <p className="mt-0.5 text-xl">
            <CountUp value={kpi.value} format={kpi.format} />
          </p>

          {kpi.deltaPct !== null ? (
            <p className={`mt-0.5 text-xs tabular ${good ? "text-ok" : "text-danger"}`}>
              {up ? "▲" : "▼"} {qty(Math.abs(Math.round(kpi.deltaPct)), 0)}
              {kpi.format === "pct" ? " نقطة" : "٪"}
              <span className="text-muted-foreground"> مقارنة بالفترة السابقة</span>
            </p>
          ) : null}

          {kpi.target !== null ? (
            <div className="mt-1.5">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${targetHit ? "bg-ok" : "bg-warn"}`}
                  style={{ width: `${Math.min(100, (kpi.value / kpi.target) * 100)}%` }}
                />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                الهدف {kpi.format === "money" ? money(kpi.target) : qty(Math.round(kpi.target), 0)}
                {kpi.format === "pct" ? "٪" : ""} · {kpi.targetLabel}
              </p>
            </div>
          ) : null}

          {kpi.sub ? <p className="mt-0.5 text-xs text-muted-foreground">{kpi.sub}</p> : null}
          {kpi.spark.length > 2 ? (
            <div className="mt-1.5">
              <Spark values={kpi.spark} tone={kpi.upIsGood ? "var(--accent)" : "var(--danger)"} />
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

/* ── قسم ───────────────────────────────────────────────────────── */

export function Section({
  title,
  hint,
  to,
  toLabel = "افتح الشاشة",
  actions,
  children,
}: {
  title: string;
  hint?: string;
  to?: string;
  toLabel?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base">{title}</h3>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {to ? (
            <Link to={to} className="flex items-center gap-0.5 text-sm text-accent underline-offset-4 hover:underline">
              {toLabel}
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

/** بيانات ناقصة: بنقول محتاج إيه، مش بنعرض صفر */
export function Needs({ what }: { what: string }) {
  return (
    <p className="rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
      مش محسوب لسه — محتاج: {what}. لما البيانات دي تتسجّل، الكارت بيشتغل لوحده.
    </p>
  );
}

/** الحالة اللي لسه بتتحسب — هيكل بدل شاشة فاضية */
export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="animate-pulse space-y-2" aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-3 rounded-full bg-muted" style={{ width: `${92 - i * 14}%` }} />
      ))}
    </div>
  );
}

export function Delta({ value, upIsGood = true, unit = "٪" }: { value: number | null; upIsGood?: boolean; unit?: string }) {
  if (value === null) return null;
  const up = value > 0;
  const good = upIsGood === up;
  return (
    <span className={`text-xs tabular ${good ? "text-ok" : "text-danger"}`}>
      {up ? "▲" : "▼"} {qty(Math.abs(Math.round(value)), 0)}
      {unit}
    </span>
  );
}

export function ToneBadge({ tone, children }: { tone: "ok" | "warn" | "danger" | "muted" | "gold"; children: ReactNode }) {
  return <Badge tone={tone}>{children}</Badge>;
}

export function MoreLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Button asChild variant="ghost" size="sm" className="px-0">
      <Link to={to}>{children}</Link>
    </Button>
  );
}
