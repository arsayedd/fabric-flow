import { useId, useState, type ReactNode } from "react";
import { money, qty } from "@/lib/utils";

/**
 * طقم رسوم مرسوم بالإيد بـSVG.
 *
 * ليه مش مكتبة جاهزة؟ تلات أسباب عملية:
 *
 * ١. **الاتجاه.** الواجهة كلها RTL، والزمن لازم يمشي من اليمين للشمال زي
 *    القراءة. أغلب المكتبات بتفترض LTR، والتحويل بيبقى ترقيع.
 * ٢. **الأرقام.** كل رقم في الشاشة عربي-هندي عن طريق `qty`/`money`.
 *    مكتبة بتكتب محاورها بنفسها هتكسر ده.
 * ٣. **الألوان.** التوكنز بتاعت الهوية (كحلي/دهبي/كريمي) هي المصدر،
 *    فالرسم بياخد `currentColor` و`var(--...)` بدل بالِت خاصة بيه.
 *
 * والقاعدة في كل رسمة: **مفيش بيانات ⇒ مفيش رسمة**. بنكتب سبب الغياب.
 */

const PAD = { top: 8, right: 6, bottom: 18, left: 6 };

export type Point = { label: string; value: number };

export type SeriesDef = {
  key: string;
  label: string;
  /** لون من التوكنز */
  color: string;
  values: number[];
  /** خط متقطّع للأهداف */
  dashed?: boolean;
  fill?: boolean;
};

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / mag) * mag;
}

/** إطار الرسمة: عنوان + شرح + أفعال، ونفس الشكل في كل الكروت */
export function ChartFrame({
  title,
  hint,
  actions,
  legend,
  children,
  empty,
}: {
  title?: string;
  hint?: string;
  actions?: ReactNode;
  legend?: { label: string; color: string; dashed?: boolean }[];
  children: ReactNode;
  empty?: string | null;
}) {
  return (
    <div>
      {title || actions ? (
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title ? <h3 className="text-base">{title}</h3> : null}
            {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div> : null}
        </div>
      ) : null}

      {legend?.length ? (
        <ul className="mb-2 flex list-none flex-wrap gap-x-3 gap-y-1">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                aria-hidden
                className="inline-block h-0.5 w-3.5 rounded-full"
                style={{
                  background: l.dashed ? "transparent" : l.color,
                  borderTop: l.dashed ? `2px dashed ${l.color}` : undefined,
                }}
              />
              {l.label}
            </li>
          ))}
        </ul>
      ) : null}

      {empty ? <p className="py-4 text-sm text-muted-foreground">{empty}</p> : children}
    </div>
  );
}

/* ── خط بياني صغير جوه الكارت ──────────────────────────────────── */

export function Spark({ values, tone = "var(--accent)" }: { values: number[]; tone?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const w = 100;
  const h = 26;
  // معكوس: أول نقطة على اليمين عشان الزمن يمشي زي القراءة
  const pts = values.map((v, i) => {
    const x = w - (i / (values.length - 1)) * w;
    const y = h - ((v - min) / span) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-6 w-full" preserveAspectRatio="none" aria-hidden focusable="false">
      <polyline
        points={`${w},${h} ${pts.join(" ")} 0,${h}`}
        fill={tone}
        fillOpacity="0.12"
        stroke="none"
      />
      <polyline points={pts.join(" ")} fill="none" stroke={tone} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ── خط/مساحة متعدد السلاسل مع تلميح ──────────────────────────── */

export type LineHover = { index: number; label: string; rows: { label: string; value: number; color: string }[] };

export function LineChart({
  labels,
  series,
  format = "money",
  height = 190,
  target,
  onPick,
}: {
  labels: string[];
  series: SeriesDef[];
  format?: "money" | "qty" | "pct";
  height?: number;
  /** خط هدف أفقي يفضل ظاهر */
  target?: { value: number; label: string } | null;
  onPick?: (index: number) => void;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  if (n < 2) return null;

  const all = series.flatMap((s) => s.values).concat(target ? [target.value] : []);
  const max = niceMax(Math.max(...all, 0));
  const min = Math.min(...all, 0);
  const span = max - min || 1;

  const w = 320;
  const h = height;
  const innerW = w - PAD.left - PAD.right;
  const innerH = h - PAD.top - PAD.bottom;

  // x معكوس: الأقدم يمين والأحدث شمال
  const x = (i: number) => PAD.left + innerW - (i / (n - 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - ((v - min) / span) * innerH;

  const fmt = (v: number) => (format === "money" ? money(v) : format === "pct" ? `${qty(Math.round(v), 0)}٪` : qty(v, 0));
  const ticks = [0, 0.5, 1].map((t) => min + t * span);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        style={{ height }}
        preserveAspectRatio="none"
        role="img"
        aria-label={`رسم بياني: ${series.map((s) => s.label).join("، ")}`}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <line
            key={t}
            x1={PAD.left}
            x2={w - PAD.right}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--border)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {target ? (
          <line
            x1={PAD.left}
            x2={w - PAD.right}
            y1={y(target.value)}
            y2={y(target.value)}
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeDasharray="5 4"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {series.map((s) => {
          const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
          return (
            <g key={s.key}>
              {s.fill ? (
                <polygon
                  points={`${x(0)},${y(min)} ${pts.join(" ")} ${x(n - 1)},${y(min)}`}
                  fill={s.color}
                  fillOpacity="0.1"
                />
              ) : null}
              <polyline
                points={pts.join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeDasharray={s.dashed ? "5 4" : undefined}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}

        {hover !== null ? (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.top}
            y2={h - PAD.bottom}
            stroke="var(--muted-foreground)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {/* مناطق الالتقاط — عريضة عشان تنفع باللمس */}
        {labels.map((label, i) => (
          <rect
            key={`${id}-${i}`}
            x={x(i) - innerW / (n - 1) / 2}
            width={innerW / (n - 1)}
            y={0}
            height={h}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onClick={() => onPick?.(i)}
            style={{ cursor: onPick ? "pointer" : "default" }}
          >
            <title>{`${label}: ${series.map((s) => `${s.label} ${fmt(s.values[i] ?? 0)}`).join(" · ")}`}</title>
          </rect>
        ))}
      </svg>

      <div className="flex justify-between px-1 text-xs text-muted-foreground">
        <span className="tabular">{labels.at(-1)}</span>
        <span className="tabular">{labels[0]}</span>
      </div>

      {hover !== null ? (
        <div className="pointer-events-none absolute right-2 top-2 rounded-md border border-border bg-card px-2.5 py-1.5 shadow-sm">
          <p className="text-xs text-muted-foreground">{labels[hover]}</p>
          {series.map((s) => (
            <p key={s.key} className="flex items-center gap-1.5 text-xs">
              <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
              {s.label}
              <span className="tabular">{fmt(s.values[hover] ?? 0)}</span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ── أعمدة أفقية للترتيب ───────────────────────────────────────── */

export function RankBars({
  rows,
  format = "money",
  tone = "var(--primary)",
  max: forcedMax,
}: {
  rows: { key: string; label: string; value: number; sub?: string; tone?: string; to?: string | null }[];
  format?: "money" | "qty" | "pct";
  tone?: string;
  max?: number;
}) {
  const max = forcedMax ?? Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  const fmt = (v: number) => (format === "money" ? money(v) : format === "pct" ? `${qty(Math.round(v), 0)}٪` : qty(v, 0));

  return (
    <ul className="list-none space-y-2">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm">{r.label}</span>
            <span className="shrink-0 text-sm tabular">{fmt(r.value)}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${(Math.abs(r.value) / max) * 100}%`, background: r.tone ?? tone }}
            />
          </div>
          {r.sub ? <p className="mt-0.5 text-xs text-muted-foreground">{r.sub}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/* ── دونات ─────────────────────────────────────────────────────── */

export type Slice = { key: string; label: string; value: number; color: string; to?: string | null };

export function Donut({
  slices,
  size = 132,
  thickness = 16,
  center,
  onPick,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  center?: ReactNode;
  onPick?: (key: string) => void;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  // بنحسب بداية كل قطعة قبل الرسم، عشان الرسم نفسه يفضل بلا أثر جانبي
  const starts: number[] = [];
  slices.reduce((acc, x) => {
    starts.push(acc);
    return acc + (x.value / total) * circumference;
  }, 0);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden focusable="false">
        {/* بندور عكس عقارب الساعة عشان الترتيب يبقى RTL */}
        <g transform={`rotate(-90 ${c} ${c}) scale(-1 1) translate(${-size} 0)`}>
          {slices.map((s, i) => {
            const len = (s.value / total) * circumference;
            const dash = `${len} ${circumference - len}`;
            return (
              <circle
                key={s.key}
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={dash}
                strokeDashoffset={-starts[i]}
                style={{ cursor: onPick ? "pointer" : "default" }}
                onClick={() => onPick?.(s.key)}
              >
                <title>{`${s.label}: ${qty(Math.round((s.value / total) * 100), 0)}٪`}</title>
              </circle>
            );
          })}
        </g>
      </svg>
      {center ? <div className="absolute inset-0 flex flex-col items-center justify-center">{center}</div> : null}
    </div>
  );
}

/** مفتاح الدونات كقائمة قابلة للنقر */
export function DonutLegend({
  slices,
  format = "pct",
  onPick,
}: {
  slices: Slice[];
  format?: "pct" | "money" | "qty";
  onPick?: (key: string) => void;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <ul className="min-w-0 flex-1 list-none space-y-1.5">
      {slices.map((s) => (
        <li key={s.key}>
          <button
            type="button"
            onClick={() => onPick?.(s.key)}
            disabled={!onPick}
            className="flex w-full items-baseline gap-2 text-right disabled:cursor-default"
          >
            <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate text-sm">{s.label}</span>
            <span className="shrink-0 text-sm tabular text-muted-foreground">
              {format === "pct"
                ? `${qty(Math.round((s.value / total) * 100), 0)}٪`
                : format === "money"
                  ? money(s.value)
                  : qty(s.value, 0)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ── عدّاد دائري للدرجات ───────────────────────────────────────── */

export function Gauge({
  value,
  size = 150,
  label,
  sub,
  tone,
}: {
  value: number;
  size?: number;
  label?: string;
  sub?: string;
  tone?: string;
}) {
  const thickness = 12;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, value)) / 100) * circumference;
  const color = tone ?? (value >= 75 ? "var(--ok)" : value >= 55 ? "var(--warn)" : "var(--danger)");

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden focusable="false">
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--muted)" strokeWidth={thickness} />
        <g transform={`rotate(-90 ${c} ${c}) scale(-1 1) translate(${-size} 0)`}>
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference - filled}`}
            className="transition-[stroke-dasharray] duration-700"
          />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-3xl tabular leading-none">{qty(Math.round(value), 0)}</span>
        {label ? <span className="mt-0.5 text-xs text-muted-foreground">{label}</span> : null}
        {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
      </div>
    </div>
  );
}

/* ── مبعثر: الإيراد × الهامش × الحجم ──────────────────────────── */

export type Bubble = { key: string; label: string; x: number; y: number; size: number; to?: string | null };

export function Scatter({
  bubbles,
  xLabel,
  yLabel,
  yTarget,
  onPick,
  height = 220,
}: {
  bubbles: Bubble[];
  xLabel: string;
  yLabel: string;
  yTarget?: number | null;
  onPick?: (key: string) => void;
  height?: number;
}) {
  if (!bubbles.length) return null;
  const w = 320;
  const h = height;
  const pad = { top: 10, right: 34, bottom: 22, left: 10 };
  const maxX = niceMax(Math.max(...bubbles.map((b) => b.x), 1));
  const ys = bubbles.map((b) => b.y).concat(yTarget ?? []);
  const maxY = niceMax(Math.max(...ys, 1));
  const minY = Math.min(...ys, 0);
  const spanY = maxY - minY || 1;
  const maxSize = Math.max(...bubbles.map((b) => b.size), 1);

  // x معكوس: القيمة الكبيرة على الشمال، والصفر على اليمين
  const px = (v: number) => w - pad.right - (v / maxX) * (w - pad.left - pad.right);
  const py = (v: number) => pad.top + (h - pad.top - pad.bottom) * (1 - (v - minY) / spanY);

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} role="img" aria-label={`${xLabel} مقابل ${yLabel}`}>
        <line x1={pad.left} x2={w - pad.right} y1={h - pad.bottom} y2={h - pad.bottom} stroke="var(--border)" />
        <line x1={w - pad.right} x2={w - pad.right} y1={pad.top} y2={h - pad.bottom} stroke="var(--border)" />
        {yTarget !== null && yTarget !== undefined ? (
          <line
            x1={pad.left}
            x2={w - pad.right}
            y1={py(yTarget)}
            y2={py(yTarget)}
            stroke="var(--accent)"
            strokeDasharray="5 4"
            strokeWidth="1.5"
          />
        ) : null}
        {bubbles.map((b) => (
          <circle
            key={b.key}
            cx={px(b.x)}
            cy={py(b.y)}
            r={5 + (b.size / maxSize) * 11}
            fill="var(--primary)"
            fillOpacity="0.18"
            stroke="var(--primary)"
            strokeWidth="1.5"
            style={{ cursor: onPick ? "pointer" : "default" }}
            onClick={() => onPick?.(b.key)}
          >
            <title>{`${b.label} — ${xLabel} ${money(b.x)} · ${yLabel} ${qty(Math.round(b.y), 0)}٪`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{`${xLabel} أعلى ←`}</span>
        <span>{`↑ ${yLabel}`}</span>
      </div>
    </div>
  );
}

/* ── شلال: الإيراد رِحل فين ───────────────────────────────────── */

/** بنراكم الخطوات برّه الرسم: كل خطوة بتبدأ من اللي فضل بعد اللي قبلها */
function waterfallRows(
  steps: { key: string; label: string; amount: number; kind: "start" | "minus" | "end" }[],
  start: number,
) {
  let running = start;
  return steps.map((s) => {
    if (s.kind === "start") return { ...s, from: 0, to: start, width: 100 };
    if (s.kind === "end") return { ...s, from: 0, to: s.amount, width: (Math.abs(s.amount) / start) * 100 };
    const from = running;
    running += s.amount; // amount سالب
    return { ...s, from, to: running, width: (Math.abs(s.amount) / start) * 100 };
  });
}

export function Waterfall({
  steps,
}: {
  steps: { key: string; label: string; amount: number; kind: "start" | "minus" | "end" }[];
}) {
  const start = steps.find((s) => s.kind === "start")?.amount ?? 0;
  if (start <= 0) return null;

  const rows = waterfallRows(steps, start);

  return (
    <ul className="list-none space-y-1.5">
      {rows.map((r) => {
        const color =
          r.kind === "start" ? "var(--primary)" : r.kind === "end" ? (r.amount >= 0 ? "var(--ok)" : "var(--danger)") : "var(--accent)";
        // البلوك بيبدأ من اليمين ناحية الشمال بمقدار اللي اتصرف
        const offset = r.kind === "minus" ? ((start - r.from) / start) * 100 : 0;
        return (
          <li key={r.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{r.label}</span>
              <span className="shrink-0 tabular">{money(r.amount)}</span>
            </div>
            <div className="mt-0.5 h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${Math.max(1, r.width)}%`, marginRight: `${offset}%`, background: color }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ── خريطة حرارية ──────────────────────────────────────────────── */

export function Heatmap({
  rows,
  cols,
  cell,
}: {
  rows: string[];
  cols: { id: string; name: string }[];
  cell: (row: string, colId: string) => { value: number | null; title: string };
}) {
  if (!rows.length || !cols.length) return null;
  const values = rows.flatMap((r) => cols.map((c) => cell(r, c.id).value)).filter((v): v is number => v !== null);
  const max = Math.max(...values, 1);

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[420px] border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="text-right text-xs font-normal text-muted-foreground">الخط</th>
            {cols.map((c) => (
              <th key={c.id} className="text-xs font-normal text-muted-foreground">
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <td className="whitespace-nowrap text-sm">{r}</td>
              {cols.map((c) => {
                const { value, title } = cell(r, c.id);
                const intensity = value === null ? 0 : Math.min(1, value / max);
                return (
                  <td key={c.id} className="p-0">
                    <div
                      title={title}
                      className="flex h-8 items-center justify-center rounded-md text-xs tabular"
                      style={{
                        background:
                          value === null
                            ? "var(--muted)"
                            : `color-mix(in srgb, var(--danger) ${Math.round(intensity * 78)}%, var(--card))`,
                        color: intensity > 0.55 ? "var(--card)" : "var(--foreground)",
                      }}
                    >
                      {value === null ? "—" : `${qty(Math.round(value), 0)}٪`}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── أعمدة رأسية مقارنة بهدف ──────────────────────────────────── */

export function ColumnChart({
  points,
  format = "qty",
  target,
  height = 150,
}: {
  points: Point[];
  format?: "money" | "qty" | "pct";
  target?: number | null;
  height?: number;
}) {
  if (!points.length) return null;
  const max = niceMax(Math.max(...points.map((p) => p.value), target ?? 0, 1));
  const fmt = (v: number) => (format === "money" ? money(v) : format === "pct" ? `${qty(Math.round(v), 0)}٪` : qty(v, 0));

  return (
    <div>
      <div className="relative flex items-end gap-1.5" style={{ height }}>
        {target ? (
          <div
            className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-accent"
            style={{ bottom: `${(target / max) * 100}%` }}
          />
        ) : null}
        {/* معكوس عشان الأقدم يبقى يمين */}
        {[...points].reverse().map((p) => (
          <div key={p.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${p.label}: ${fmt(p.value)}`}>
            <div
              className="w-full rounded-t-sm bg-primary/80 transition-[height] duration-500"
              style={{ height: `${Math.max(1, (p.value / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span className="tabular">{points.at(-1)?.label}</span>
        <span className="tabular">{points[0]?.label}</span>
      </div>
    </div>
  );
}
