import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ChartFrame,
  ColumnChart,
  Donut,
  DonutLegend,
  LineChart,
  RankBars,
  Scatter,
  Waterfall,
} from "@/components/charts/Chart";
import { money, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { targetMarginOf } from "@/store/costing";
import {
  agingBuckets,
  breakEven,
  cashOutlook,
  cashSeries,
  costMix,
  customerRevenue,
  finSeries,
  grainFor,
  modelRanking,
  profitWaterfall,
  type Range,
} from "@/store/command";
import { Explain, Needs, Section } from "./Kit";

const PALETTE = [
  "var(--primary)",
  "var(--accent)",
  "var(--ok)",
  "var(--warn)",
  "var(--danger)",
  "color-mix(in srgb, var(--primary) 55%, var(--card))",
  "color-mix(in srgb, var(--accent) 55%, var(--card))",
  "color-mix(in srgb, var(--ok) 55%, var(--card))",
];

/* ── ٧) الإيراد × التكلفة × الربح ──────────────────────────────── */

export function FinancialPerformance({ range }: { range: Range }) {
  const { db } = useFactory();
  const [grain, setGrain] = useState(grainFor(range));
  const series = finSeries(db, range, grain);
  const hasData = series.some((p) => p.revenue > 0 || p.cost > 0);

  const total = series.reduce(
    (a, p) => ({ revenue: a.revenue + p.revenue, cost: a.cost + p.cost, profit: a.profit + p.profit }),
    { revenue: 0, cost: 0, profit: 0 },
  );

  const grains: { key: typeof grain; label: string }[] = [
    { key: "day", label: "يومي" },
    { key: "week", label: "أسبوعي" },
    { key: "month", label: "شهري" },
  ];

  return (
    <Card>
      <ChartFrame
        title="الأداء المالي"
        hint={`${range.label} — ${money(total.revenue)} إيراد، ${money(total.cost)} مصروف، ${money(total.profit)} صافي`}
        empty={hasData ? null : "مفيش توريدات ولا مصروفات مسجّلة في الفترة دي."}
        legend={[
          { label: "الإيراد", color: "var(--primary)" },
          { label: "المصروف", color: "var(--danger)" },
          { label: "الربح", color: "var(--ok)" },
        ]}
        actions={grains.map((g) => (
          <button
            key={g.key}
            onClick={() => setGrain(g.key)}
            aria-pressed={grain === g.key}
            className={`rounded-full px-2 py-0.5 text-xs ${
              grain === g.key ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
            }`}
          >
            {g.label}
          </button>
        ))}
      >
        <LineChart
          labels={series.map((p) => p.label)}
          series={[
            { key: "rev", label: "الإيراد", color: "var(--primary)", values: series.map((p) => p.revenue), fill: true },
            { key: "cost", label: "المصروف", color: "var(--danger)", values: series.map((p) => p.cost) },
            { key: "profit", label: "الربح", color: "var(--ok)", values: series.map((p) => p.profit) },
          ]}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          الزمن ماشي من اليمين للشمال زي القراءة. حُطّ الماوس على أي نقطة تشوف أرقام اليوم ده.
        </p>
      </ChartFrame>
    </Card>
  );
}

/* ── ٨) اتجاه الهامش مقابل الهدف ───────────────────────────────── */

export function MarginTrend({ range }: { range: Range }) {
  const { db } = useFactory();
  const target = targetMarginOf(db);
  const series = finSeries(db, range).filter((p) => p.marginPct !== null);

  if (series.length < 2) {
    return (
      <Card className="h-full">
        <h3 className="text-base">اتجاه الهامش</h3>
        <div className="mt-2">
          <Needs what="توريدات في فترتين على الأقل جوه المدى المختار" />
        </div>
      </Card>
    );
  }

  const last = series.at(-1)?.marginPct ?? 0;
  const gap = last - target;
  const below = series.filter((p) => (p.marginPct as number) < target).length;

  return (
    <Card className="h-full">
      <ChartFrame
        title="اتجاه الهامش"
        hint={`آخر فترة ${qty(Math.round(last), 0)}٪ والهدف ${qty(Math.round(target), 0)}٪`}
        legend={[
          { label: "الهامش الفعلي", color: "var(--primary)" },
          { label: "الهدف", color: "var(--accent)", dashed: true },
        ]}
      >
        <LineChart
          labels={series.map((p) => p.label)}
          format="pct"
          height={150}
          target={{ value: target, label: "الهدف" }}
          series={[
            {
              key: "margin",
              label: "الهامش",
              color: "var(--primary)",
              values: series.map((p) => p.marginPct as number),
              fill: true,
            },
          ]}
        />
      </ChartFrame>

      <p className={`mt-1.5 text-sm ${gap < 0 ? "text-danger" : "text-ok"}`}>
        {gap < 0
          ? `الهامش تحت الهدف بـ${qty(Math.abs(Math.round(gap)), 0)} نقطة`
          : `الهامش فوق الهدف بـ${qty(Math.round(gap), 0)} نقطة`}
      </p>
      {below > 0 ? (
        <p className="text-xs text-muted-foreground">
          {qty(below, 0)} من {qty(series.length, 0)} فترة نزلت تحت الهدف.
        </p>
      ) : null}
    </Card>
  );
}

/* ── ٢٠) تركيب المصروف ─────────────────────────────────────────── */

export function CostMix({ range }: { range: Range }) {
  const { db } = useFactory();
  const rows = costMix(db, range);
  if (!rows.length) {
    return (
      <Card className="h-full">
        <h3 className="text-base">المصروف رايح فين</h3>
        <div className="mt-2">
          <Needs what="بنود مصروفات أو أجور مسجّلة في الفترة" />
        </div>
      </Card>
    );
  }

  const top = rows.slice(0, 7);
  const rest = rows.slice(7);
  const slices = top.map((r, i) => ({ key: r.key, label: r.label, value: r.amount, color: PALETTE[i % PALETTE.length] }));
  if (rest.length) {
    slices.push({
      key: "rest",
      label: `${qty(rest.length, 0)} بند أصغر`,
      value: rest.reduce((s, r) => s + r.amount, 0),
      color: "var(--muted-foreground)",
    });
  }
  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <Card className="h-full">
      <ChartFrame title="المصروف رايح فين" hint={`${money(total)} في ${range.label}`}>
        <div className="flex flex-wrap items-center gap-4">
          <Donut
            slices={slices}
            center={
              <>
                <span className="text-xs text-muted-foreground">الأكبر</span>
                <span className="max-w-[92px] truncate px-1 text-sm">{rows[0].label}</span>
                <span className="text-sm tabular">{qty(Math.round(rows[0].sharePct), 0)}٪</span>
              </>
            }
          />
          <DonutLegend slices={slices} format="money" />
        </div>
      </ChartFrame>
      <p className="mt-2 text-xs text-muted-foreground">
        كل بند هنا هو بند حقيقي من بنود المصروفات بتاعتك، مش تصنيف جاهز. افتح{" "}
        <Link to="/costs" className="text-accent underline underline-offset-4">
          المصروفات
        </Link>{" "}
        تشوف الفواتير نفسها.
      </p>
    </Card>
  );
}

/* ── ٤١) شلال الربح ────────────────────────────────────────────── */

export function ProfitWaterfall({ range }: { range: Range }) {
  const { db } = useFactory();
  const steps = profitWaterfall(db, range);
  const revenue = steps[0]?.amount ?? 0;

  return (
    <Card className="h-full">
      <div className="flex items-center gap-1">
        <h3 className="text-base">الإيراد رِحل فين</h3>
        <Explain
          label="شلال الربح"
          text="بنبدأ من الإيراد، وننزّل كل بند مصروف بترتيب حجمه، لحد ما نوصل لصافي الربح. طول العمود = نصيب البند من الإيراد."
        />
      </div>
      {revenue <= 0 ? (
        <div className="mt-2">
          <Needs what="توريدات في الفترة" />
        </div>
      ) : (
        <div className="mt-2">
          <Waterfall steps={steps} />
        </div>
      )}
    </Card>
  );
}

/* ── ٤٢) نقطة التعادل ──────────────────────────────────────────── */

export function BreakEvenCard({ range }: { range: Range }) {
  const { db } = useFactory();
  const be = breakEven(db, range);

  return (
    <Card className="h-full">
      <div className="flex items-center gap-1">
        <h3 className="text-base">نقطة التعادل</h3>
        <Explain
          label="نقطة التعادل"
          text="الإيراد اللي عنده المصنع لا يكسب ولا يخسر: المصروف الثابت ÷ نسبة المساهمة (الإيراد ناقص المصروف المتغيّر)."
        />
      </div>

      {be.breakEvenRevenue === null ? (
        <div className="mt-2">
          <Needs what="إيراد ومصروف ثابت مسجّلين في نفس الفترة" />
        </div>
      ) : (
        <>
          <dl className="mt-2 space-y-1.5">
            <Row label="مصروف ثابت" value={money(be.fixed)} />
            <Row label="مصروف متغيّر" value={money(be.variable)} />
            <Row label="نسبة المساهمة" value={`${qty(Math.round(be.contributionPct ?? 0), 0)}٪`} />
            <Row label="إيراد التعادل" value={money(be.breakEvenRevenue)} strong />
            <Row label="الإيراد الفعلي" value={money(be.revenue)} strong />
          </dl>

          {be.safetyPct !== null ? (
            <>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${be.safetyPct >= 0 ? "bg-ok" : "bg-danger"}`}
                  style={{ width: `${Math.min(100, Math.abs(be.safetyPct))}%` }}
                />
              </div>
              <p className={`mt-1 text-sm ${be.safetyPct >= 0 ? "text-ok" : "text-danger"}`}>
                {be.safetyPct >= 0
                  ? `هامش أمان ${qty(Math.round(be.safetyPct), 0)}٪ — الإيراد فوق التعادل`
                  : `الإيراد تحت التعادل بـ${qty(Math.abs(Math.round(be.safetyPct)), 0)}٪`}
              </p>
            </>
          ) : null}

          <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
            {be.note}
            {be.fixedItems.length ? ` الثابت حاليًا: ${be.fixedItems.join("، ")}.` : ""}
          </p>
        </>
      )}
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border pb-1 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={`shrink-0 tabular ${strong ? "text-base" : "text-sm"}`}>{value}</dd>
    </div>
  );
}

/* ── ٣٨ + ٣٩) السيولة ─────────────────────────────────────────── */

export function CashCenter({ range }: { range: Range }) {
  const { db } = useFactory();
  const [days, setDays] = useState(30);
  const outlook = cashOutlook(db, days);
  const series = cashSeries(db, range);
  const hasFlow = series.some((p) => p.inflow > 0 || p.outflow > 0);

  return (
    <Card>
      <ChartFrame
        title="مركز السيولة"
        hint="الداخل والخارج فعليًا في الفترة، والمتوقع من التزامات ومستحقات حقيقية"
        legend={[
          { label: "داخل", color: "var(--ok)" },
          { label: "خارج", color: "var(--danger)" },
        ]}
        actions={[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            aria-pressed={days === d}
            className={`rounded-full px-2 py-0.5 text-xs tabular ${
              days === d ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
            }`}
          >
            {qty(d, 0)} يوم
          </button>
        ))}
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="الخزينة دلوقتي" value={money(outlook.cash)} />
          <Tile label={`تحصيل متوقع (${qty(days, 0)} يوم)`} value={money(outlook.expectedIn)} tone="ok" />
          <Tile label="التزامات مستحقة" value={money(outlook.expectedOut)} tone="danger" />
          <Tile
            label="المتوقع يتبقى"
            value={money(outlook.projected)}
            tone={outlook.shortfall ? "danger" : "ok"}
          />
        </div>

        {outlook.shortfall ? (
          <p className="mt-2 rounded-md bg-danger-soft px-2.5 py-2 text-sm text-danger">
            بالمعدل ده السيولة مش هتكفي الالتزامات خلال {qty(days, 0)} يوم. قدّم أقرب تحصيل أو أجّل دفعة مالهاش غرامة.
          </p>
        ) : null}

        {outlook.pendingIn > 0 ? (
          <p className="mt-1.5 text-xs text-muted-foreground">
            وفيه {money(outlook.pendingIn)} تحصيل مستني تأكيد — مش داخل في الأرقام دي لحد ما تتأكد إن الفلوس وصلت.
          </p>
        ) : null}

        {hasFlow ? (
          <div className="mt-3 border-t border-border pt-3">
            <LineChart
              labels={series.map((p) => p.label)}
              height={140}
              series={[
                { key: "in", label: "داخل", color: "var(--ok)", values: series.map((p) => p.inflow), fill: true },
                { key: "out", label: "خارج", color: "var(--danger)", values: series.map((p) => p.outflow) },
              ]}
            />
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">مفيش حركات خزينة مسجّلة في الفترة دي.</p>
        )}
      </ChartFrame>
    </Card>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "ok" | "danger" }) {
  return (
    <div className="rounded-md border border-border p-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 tabular ${tone === "ok" ? "text-ok" : tone === "danger" ? "text-danger" : ""}`}>{value}</p>
    </div>
  );
}

/* ── ٤٠) أعمار المديونية ───────────────────────────────────────── */

export function AgingCard() {
  const { db } = useFactory();
  const buckets = agingBuckets(db).filter((b) => b.amount > 0);
  const total = buckets.reduce((s, b) => s + b.amount, 0);

  return (
    <Card className="h-full">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base">أعمار المديونية</h3>
        {total > 0 ? <span className="text-sm tabular text-muted-foreground">{money(total)}</span> : null}
      </div>

      {!buckets.length ? (
        <p className="mt-1.5 text-sm text-ok">مفيش أرصدة مفتوحة عند العملاء.</p>
      ) : (
        <div className="mt-2">
          <RankBars
            rows={buckets.map((b) => ({
              key: b.key,
              label: b.label,
              value: b.amount,
              sub: `${qty(b.count, 0)} توريد`,
              tone: b.tone === "danger" ? "var(--danger)" : b.tone === "warn" ? "var(--warn)" : "var(--ok)",
            }))}
          />
          <Link to="/collections" className="mt-2 inline-block text-sm text-accent underline underline-offset-4">
            افتح التحصيل
          </Link>
        </div>
      )}
    </Card>
  );
}

/* ── ١٦ + ١٧) العملاء ─────────────────────────────────────────── */

export function CustomerSection({ range }: { range: Range }) {
  const { db } = useFactory();
  const [metric, setMetric] = useState<"revenue" | "profit">("revenue");
  const rows = customerRevenue(db, range);
  const target = targetMarginOf(db);

  if (!rows.length) {
    return (
      <Section title="العملاء" to="/parties">
        <Card>
          <Needs what="توريدات لعملاء في الفترة المختارة" />
        </Card>
      </Section>
    );
  }

  const withMargin = rows.filter((r) => r.marginPct !== null);
  const top = rows.slice(0, 6);

  return (
    <Section title="العملاء" hint="مين بيجيب الإيراد، ومين بيجيب الربح — مش دايمًا نفس الحد" to="/parties">
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <ChartFrame
            title="أكبر العملاء"
            actions={[
              { key: "revenue" as const, label: "بالإيراد" },
              { key: "profit" as const, label: "بالربح" },
            ].map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                aria-pressed={metric === m.key}
                className={`rounded-full px-2 py-0.5 text-xs ${
                  metric === m.key ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          >
            <RankBars
              rows={top
                .map((r) => ({
                  key: r.id,
                  label: r.name,
                  value: metric === "revenue" ? r.revenue : r.profit ?? 0,
                  sub:
                    r.marginPct !== null
                      ? `هامش ${qty(Math.round(r.marginPct), 0)}٪ · ${qty(r.orders, 0)} توريد`
                      : `${qty(r.orders, 0)} توريد · الربح محتاج تكلفة محسوبة`,
                }))
                .filter((r) => r.value !== 0)}
            />
          </ChartFrame>
          <ul className="mt-2 list-none space-y-0.5 border-t border-border pt-2">
            {top.slice(0, 3).map((r) => (
              <li key={r.id}>
                <Link to={`/parties/${r.id}`} className="text-xs text-accent underline-offset-4 hover:underline">
                  ملف {r.name}
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <ChartFrame
            title="الإيراد مقابل الهامش"
            hint="الفقاعة الكبيرة = توريدات أكتر. الخط المتقطّع هو هدف الهامش."
            empty={withMargin.length ? null : "محتاج تكلفة محسوبة للموديلات عشان نعرف هامش كل عميل."}
          >
            <Scatter
              bubbles={withMargin.map((r) => ({
                key: r.id,
                label: r.name,
                x: r.revenue,
                y: r.marginPct as number,
                size: r.orders,
              }))}
              xLabel="الإيراد"
              yLabel="الهامش"
              yTarget={target}
            />
            <ul className="mt-1.5 list-none space-y-0.5 text-xs text-muted-foreground">
              <li>· فوق الخط وعلى الشمال: عميل كبير ومربح — ده اللي تحافظ عليه</li>
              <li>· تحت الخط وعلى الشمال: بيشتري كتير بهامش قليل — محتاج مراجعة سعر</li>
              <li>· فوق الخط وعلى اليمين: هامشه عالي وحجمه صغير — فرصة تكبير</li>
            </ul>
          </ChartFrame>
        </Card>
      </div>
    </Section>
  );
}

/* ── ١٨ + ١٩) الموديلات ───────────────────────────────────────── */

export function ModelSection() {
  const { db } = useFactory();
  const rows = modelRanking(db);
  const target = targetMarginOf(db);

  if (!rows.length) {
    return (
      <Section title="ربحية الموديلات" to="/costing">
        <Card>
          <Needs what="منتجات بقائمة خامات وسعر بيع وإنتاج مسجّل" />
        </Card>
      </Section>
    );
  }

  const best = rows.filter((r) => r.marginPct !== null && (r.marginPct as number) >= target).slice(0, 5);
  const weak = rows
    .filter((r) => r.marginPct !== null && (r.marginPct as number) < target)
    .sort((a, b) => (a.marginPct as number) - (b.marginPct as number))
    .slice(0, 5);

  return (
    <Section title="ربحية الموديلات" hint="الترتيب بالربح الفعلي على الكميات المنتجة" to="/costing" toLabel="افتح لوحة التكلفة">
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <h4 className="text-base">الأعلى ربحية</h4>
          {best.length ? (
            <ul className="mt-2 list-none divide-y divide-border">
              {best.map((r) => (
                <li key={r.productId} className="py-2 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link to={`/products/${r.productId}`} className="min-w-0 truncate text-sm underline-offset-4 hover:underline">
                      {r.name}
                    </Link>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {r.score !== null ? <span className="text-sm tabular">{qty(r.score, 0)}</span> : null}
                      <Badge tone="ok">{qty(Math.round(r.marginPct as number), 0)}٪</Badge>
                    </span>
                  </div>
                  <p className="text-xs tabular text-muted-foreground">
                    {qty(r.units, 0)} قطعة · ربح {money(r.profit)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-sm text-muted-foreground">مفيش موديل فوق هدف الهامش دلوقتي.</p>
          )}
        </Card>

        <Card className={weak.length ? "border-r-2 border-r-warn" : ""}>
          <h4 className="text-base">محتاجة مراجعة</h4>
          {weak.length ? (
            <ul className="mt-2 list-none divide-y divide-border">
              {weak.map((r) => (
                <li key={r.productId} className="py-2 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link to={`/products/${r.productId}`} className="min-w-0 truncate text-sm underline-offset-4 hover:underline">
                      {r.name}
                    </Link>
                    <Badge tone={(r.marginPct as number) < 0 ? "danger" : "warn"}>
                      {qty(Math.round(r.marginPct as number), 0)}٪
                    </Badge>
                  </div>
                  <p className="text-xs tabular text-muted-foreground">
                    الهدف {qty(Math.round(target), 0)}٪ · فرق{" "}
                    {qty(Math.round(target - (r.marginPct as number)), 0)} نقطة على إيراد {money(r.revenue)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-sm text-ok">كل الموديلات المسجّلة فوق هدف الهامش.</p>
          )}
        </Card>
      </div>
    </Section>
  );
}

/* ── ٥٧) أداء شهري ─────────────────────────────────────────────── */

export function MonthlyPerformance({ range }: { range: Range }) {
  const { db } = useFactory();
  const [metric, setMetric] = useState<"revenue" | "profit" | "units">("revenue");
  const series = finSeries(db, range, range.days > 120 ? "month" : "week");
  if (series.length < 2) return null;

  const options: { key: typeof metric; label: string; format: "money" | "qty" }[] = [
    { key: "revenue", label: "الإيراد", format: "money" },
    { key: "profit", label: "الربح", format: "money" },
    { key: "units", label: "الإنتاج", format: "qty" },
  ];
  const active = options.find((o) => o.key === metric)!;

  return (
    <Card>
      <ChartFrame
        title="الأداء على مدى الفترة"
        hint={range.days > 120 ? "بالشهر" : "بالأسبوع"}
        actions={options.map((o) => (
          <button
            key={o.key}
            onClick={() => setMetric(o.key)}
            aria-pressed={metric === o.key}
            className={`rounded-full px-2 py-0.5 text-xs ${
              metric === o.key ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      >
        <ColumnChart
          points={series.map((p) => ({ label: p.label, value: p[metric] }))}
          format={active.format}
        />
      </ChartFrame>
    </Card>
  );
}
