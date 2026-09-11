import { Link } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ChartFrame, Donut, RankBars } from "@/components/charts/Chart";
import { money, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { factoryBottleneck } from "@/store/health";
import {
  capacityMinutes,
  deliveryPerformance,
  earnedMinutes,
  finSeries,
  lineStats,
  liveOrders,
  orderMix,
  stageLoads,
  type Range,
} from "@/store/command";
import { capacityBase, minutesLabel } from "@/store/planning";
import { Explain, Needs, Section } from "./Kit";

const TONE_CLASS = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger" } as const;

/* ── ٩) نظرة الإنتاج ───────────────────────────────────────────── */

export function ProductionOverview({ range }: { range: Range }) {
  const { db } = useFactory();
  const series = finSeries(db, range);
  const produced = series.reduce((s, p) => s + p.units, 0);
  const capMin = capacityMinutes(db, range);
  const earned = earnedMinutes(db, range.from, range.to);
  const stages = stageLoads(db);
  const cap = capacityBase(db);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <h3 className="text-base">نظرة الإنتاج</h3>
            <Explain
              label="الإنتاج"
              text="الكمية = آخر مرحلة في مسار كل أمر، عشان القطعة متتعدّش مرتين. والكفاءة = الدقايق المكتسبة ÷ الدقايق المتاحة من الطاقة."
            />
          </div>
          <p className="text-xs text-muted-foreground">{range.label}</p>
        </div>
        <div className="text-left">
          <p className="text-2xl tabular">{qty(Math.round(produced), 0)}</p>
          <p className="text-xs text-muted-foreground">قطعة خرجت من آخر مرحلة</p>
        </div>
      </div>

      {capMin > 0 && earned > 0 ? (
        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted-foreground">استغلال الطاقة</span>
            <span className="tabular">
              {qty(Math.round((earned / capMin) * 100), 0)}٪ · {minutesLabel(earned, cap)} من {minutesLabel(capMin, cap)}
            </span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${Math.min(100, (earned / capMin) * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <Needs what="زمن معياري في مسار العمليات + مراحل مسجّلة" />
        </div>
      )}

      {stages.length ? (
        <ul className="mt-3 list-none space-y-2 border-t border-border pt-3">
          {stages.map((s) => (
            <li key={s.operationId}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {s.name}
                  {s.isBottleneck ? (
                    <Badge tone="danger" className="mr-2">
                      اختناق
                    </Badge>
                  ) : null}
                </span>
                <span className="shrink-0 tabular text-xs text-muted-foreground">
                  وصل {qty(Math.round(s.arrived), 0)} · خرج {qty(Math.round(s.good), 0)} · واقف{" "}
                  <span className={s.waiting > 0 ? "text-warn" : ""}>{qty(Math.round(s.waiting), 0)}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${s.throughPct >= 85 ? "bg-ok" : s.throughPct >= 55 ? "bg-warn" : "bg-danger"}`}
                  style={{ width: `${Math.min(100, s.throughPct)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-2 text-xs text-muted-foreground">
        النسبة جنب كل مرحلة = اللي خرج منها ÷ اللي وصلها. «وصل» بيتحسب لكل أمر على حدة من مخرج المرحلة اللي قبلها في
        مسار الموديل نفسه، فالأرقام بين المراحل مش بالضرورة تطرح على بعضها لما الموديلات مسارها مختلف. وطاقة كل مرحلة
        لوحدها لسه مش مسجّلة، فمبنقولش «طاقتها كام في اليوم».
      </p>
    </Card>
  );
}

/* ── ١٣) الاختناق ──────────────────────────────────────────────── */

export function BottleneckCard() {
  const { db } = useFactory();
  const bn = factoryBottleneck(db);
  if (!bn) return null;

  const avgPrice = db.orders.length ? db.orders.reduce((s, o) => s + o.piecePrice, 0) / db.orders.length : 0;

  return (
    <Card className="h-full border-r-2 border-r-danger">
      <div className="flex items-center gap-2">
        <TriangleAlert className="h-4 w-4 shrink-0 text-danger" />
        <h3 className="text-base">الاختناق الحالي</h3>
      </div>
      <p className="mt-1.5 text-xl">{bn.step.name}</p>
      <dl className="mt-2 space-y-1">
        <div className="flex justify-between gap-3 text-sm">
          <dt className="text-muted-foreground">قطع واقفة</dt>
          <dd className="tabular">{qty(Math.round(bn.step.waiting), 0)}</dd>
        </div>
        <div className="flex justify-between gap-3 text-sm">
          <dt className="text-muted-foreground">نسبة الواقف من الواصل</dt>
          <dd className="tabular">{qty(Math.round(bn.waitingPct), 0)}٪</dd>
        </div>
        {avgPrice > 0 ? (
          <div className="flex justify-between gap-3 text-sm">
            <dt className="text-muted-foreground">قيمة الواقف بسعر البيع</dt>
            <dd className="tabular">{money(bn.step.waiting * avgPrice)}</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">{bn.why}</p>
      <Link to="/planning" className="mt-2 inline-block text-sm text-accent underline underline-offset-4">
        افتح الجدول
      </Link>
    </Card>
  );
}

/* ── ١١ + ٤٧) الأوامر الشغالة ومخاطرها ────────────────────────── */

export function LiveOrders({ limit = 6 }: { limit?: number }) {
  const { db } = useFactory();
  const rows = liveOrders(db);

  if (!rows.length) {
    return (
      <Section title="الأوامر الشغالة" to="/orders">
        <Card>
          <p className="text-sm text-muted-foreground">مفيش أوامر مفتوحة دلوقتي.</p>
        </Card>
      </Section>
    );
  }

  return (
    <Section
      title="الأوامر الشغالة ومخاطرها"
      hint="نسبة الخطر محسوبة من الجدول الحقيقي: الشغل الباقي، الأوامر اللي قبله، ونقص الخامات"
      to="/orders"
    >
      <Card className="overflow-hidden p-0">
        <div className="-mx-px overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="p-2.5 text-right font-normal text-muted-foreground">الأمر</th>
                <th className="p-2.5 text-right font-normal text-muted-foreground">العميل</th>
                <th className="p-2.5 text-right font-normal text-muted-foreground">التقدّم</th>
                <th className="p-2.5 text-right font-normal text-muted-foreground">الحالة</th>
                <th className="p-2.5 text-right font-normal text-muted-foreground">السبب</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="p-2.5">
                    <Link to={`/orders/${r.id}`} className="underline-offset-4 hover:underline">
                      <span className="latin tabular text-xs text-muted-foreground">{r.code}</span>
                      <span className="block">{r.model}</span>
                    </Link>
                  </td>
                  <td className="p-2.5 text-muted-foreground">{r.client || "—"}</td>
                  <td className="p-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${TONE_CLASS[r.tone]}`}
                          style={{ width: `${r.progressPct}%` }}
                        />
                      </div>
                      <span className="tabular text-xs">{qty(Math.round(r.progressPct), 0)}٪</span>
                    </div>
                    <span className="tabular text-xs text-muted-foreground">
                      {qty(Math.round(r.produced), 0)} من {qty(r.quantity, 0)}
                    </span>
                  </td>
                  <td className="p-2.5">
                    <Badge tone={r.tone === "ok" ? "ok" : r.tone === "warn" ? "warn" : "danger"}>{r.statusLabel}</Badge>
                    {r.riskPct >= 40 ? (
                      <span className="block tabular text-xs text-muted-foreground">
                        خطر تأخير {qty(r.riskPct, 0)}٪
                      </span>
                    ) : null}
                  </td>
                  <td className="p-2.5 text-xs text-muted-foreground">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {rows.length > limit ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          معروض {qty(limit, 0)} من {qty(rows.length, 0)} أمر، بترتيب الخطر.
        </p>
      ) : null}
    </Section>
  );
}

/* ── ١٢ + ١٤) الخطوط ──────────────────────────────────────────── */

export function LineComparison({ range }: { range: Range }) {
  const { db } = useFactory();
  const rows = lineStats(db, range);
  if (!rows.length) return null;

  const weakest = [...rows].filter((r) => r.defectPct !== null).sort((a, b) => (b.defectPct as number) - (a.defectPct as number))[0];

  return (
    <Card className="h-full">
      <ChartFrame
        title="خطوط الإنتاج"
        hint="نصيب كل خط من الشغل المعياري في الفترة، ونسبة عيوبه"
      >
        <RankBars
          format="pct"
          max={100}
          rows={rows.map((r) => ({
            key: r.line,
            label: r.line,
            value: r.sharePct,
            sub: `${qty(Math.round(r.units), 0)} قطعة · ${qty(r.orders, 0)} أمر${
              r.defectPct !== null ? ` · عيوب ${qty(Math.round(r.defectPct), 0)}٪` : ""
            }`,
            tone: r.defectPct !== null && r.defectPct > 8 ? "var(--danger)" : "var(--primary)",
          }))}
        />
      </ChartFrame>

      {weakest && (weakest.defectPct as number) > 5 ? (
        <p className="mt-2 border-t border-border pt-2 text-sm text-warn">
          {weakest.line} أعلى نسبة عيوب: {qty(Math.round(weakest.defectPct as number), 0)}٪.
        </p>
      ) : null}
      <p className="mt-1 text-xs text-muted-foreground">
        الطاقة مسجّلة للمصنع كله مش لكل خط، فبنقول نصيب الخط من الشغل — مش «كفاءة الخط».
      </p>
    </Card>
  );
}

/* ── ١٥) توزيع حالات الأوامر ──────────────────────────────────── */

export function OrderMixCard() {
  const { db } = useFactory();
  const rows = orderMix(db);
  if (!rows.length) return null;

  const COLOR = {
    ok: "var(--ok)",
    warn: "var(--warn)",
    danger: "var(--danger)",
    muted: "var(--primary)",
  } as const;
  const slices = rows.map((r) => ({ key: r.key, label: r.label, value: r.count, color: COLOR[r.tone], to: r.to }));
  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <Card className="h-full">
      <ChartFrame title="أوامر الإنتاج" hint="دوس على أي جزء تفتح الأوامر مفلترة عليه">
        <div className="flex flex-wrap items-center gap-4">
          <Donut
            slices={slices}
            center={
              <>
                <span className="text-2xl tabular">{qty(total, 0)}</span>
                <span className="text-xs text-muted-foreground">أمر</span>
              </>
            }
          />
          <ul className="min-w-0 flex-1 list-none space-y-1.5">
            {slices.map((s) => (
              <li key={s.key}>
                <Link to={s.to ?? "/orders"} className="flex items-baseline gap-2 hover:underline">
                  <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm">{s.label}</span>
                  <span className="shrink-0 text-sm tabular text-muted-foreground">
                    {qty(s.value, 0)} · {qty(Math.round((s.value / total) * 100), 0)}٪
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </ChartFrame>
    </Card>
  );
}

/* ── ٤٦) الالتزام بالتسليم ─────────────────────────────────────── */

export function DeliveryCard({ range }: { range: Range }) {
  const { db } = useFactory();
  const perf = deliveryPerformance(db, range);

  return (
    <Card className="h-full">
      <div className="flex items-center gap-1">
        <h3 className="text-base">الالتزام بالتسليم</h3>
        <Explain
          label="الالتزام بالتسليم"
          text="الأوامر المكتملة اللي آخر مرحلة فيها اتسجّلت في الفترة: اتقارن تاريخ الخلاص بميعاد التسليم المكتوب على الأمر."
        />
      </div>

      {perf.onTimePct === null ? (
        <div className="mt-2">
          <Needs what="أوامر مكتملة بمراحل مسجّلة جوه الفترة" />
        </div>
      ) : (
        <>
          <p className="mt-1 text-2xl tabular">{qty(Math.round(perf.onTimePct), 0)}٪</p>
          <p className="text-xs text-muted-foreground">
            {qty(perf.onTime, 0)} من {qty(perf.judged, 0)} أمر خلّص في ميعاده
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${perf.onTimePct >= 85 ? "bg-ok" : perf.onTimePct >= 60 ? "bg-warn" : "bg-danger"}`}
              style={{ width: `${perf.onTimePct}%` }}
            />
          </div>
          {perf.avgDelayDays ? (
            <p className="mt-1.5 text-sm text-muted-foreground">
              متوسط التأخير في المتأخر {qty(Math.round(perf.avgDelayDays), 0)} يوم
              {perf.worst ? ` · أكبر تأخير ${perf.worst.code} بـ${qty(perf.worst.days, 0)} يوم` : ""}
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-ok">مفيش تأخير في الأوامر اللي خلّصت في الفترة.</p>
          )}
        </>
      )}
    </Card>
  );
}
