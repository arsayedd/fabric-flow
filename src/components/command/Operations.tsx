import { Link } from "react-router-dom";
import { Medal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChartFrame, ColumnChart, Donut, DonutLegend, Gauge, Heatmap, RankBars } from "@/components/charts/Chart";
import { money, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { materialStock } from "@/store/manufacturing";
import { downtimeCauses, machineSummary, machinesDownNow } from "@/store/machines";
import {
  attendanceToday,
  deadStock,
  defectPareto,
  inventoryHealth,
  inventoryValue,
  productivityByDept,
  qualityHeat,
  supplierScores,
  turnover,
  wasteByMaterial,
  workerLeaderboard,
  type Range,
} from "@/store/command";
import { Explain, Needs, Section } from "./Kit";

/* ── ٢٢ + ٢٣) مركز المخزون ────────────────────────────────────── */

export function InventoryCenter() {
  const { db } = useFactory();
  const value = inventoryValue(db);
  const health = inventoryHealth(db);

  const slices = health.bands
    .filter((b) => b.count > 0)
    .map((b) => ({
      key: b.key,
      label: b.label,
      value: b.count,
      color:
        b.key === "healthy"
          ? "var(--ok)"
          : b.key === "low"
            ? "var(--danger)"
            : b.key === "over"
              ? "var(--warn)"
              : "var(--muted-foreground)",
    }));

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-1">
          <h3 className="text-base">مركز المخزون</h3>
          <Explain
            label="قيمة المخزون"
            text="الخامات بمتوسط تكلفتها، وتحت التشغيل = خامة اتصرفت لأوامر لسه مخلصتش، والتام بتكلفة الموديل المحسوبة."
          />
        </div>
        {health.total !== null ? <Gauge value={health.total} size={84} label="صحة المخزون" /> : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cell label="خامات" value={money(value.materials)} to="/materials" />
        <Cell label="تحت التشغيل" value={money(value.wip)} to="/orders" />
        <Cell label="إنتاج تام" value={money(value.finished)} to="/products" />
        <Cell label="الإجمالي" value={money(value.total)} strong />
      </div>

      {health.missing ? (
        <div className="mt-3">
          <Needs what={health.missing} />
        </div>
      ) : slices.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-border pt-3">
          <Donut slices={slices} size={112} thickness={14} />
          <DonutLegend slices={slices} format="qty" />
        </div>
      ) : null}
    </Card>
  );
}

function Cell({ label, value, to, strong }: { label: string; value: string; to?: string; strong?: boolean }) {
  const inner = (
    <div className={`rounded-md border border-border p-2.5 ${to ? "transition-colors hover:border-accent/60" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 tabular ${strong ? "text-base" : "text-sm"}`}>{value}</p>
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

/* ── ٢٤) خامات على وش الخلاص ──────────────────────────────────── */

export function LowStockCard({ limit = 5 }: { limit?: number }) {
  const { db } = useFactory();
  const rows = materialStock(db)
    .filter((m) => m.reorderPoint > 0 && m.qty < m.reorderPoint)
    .sort((a, b) => (a.daysOfCover ?? 999) - (b.daysOfCover ?? 999));

  return (
    <Card className={rows.length ? "h-full border-r-2 border-r-danger" : "h-full"}>
      <h3 className="text-base">خامات تحت حد الطلب</h3>
      {!rows.length ? (
        <p className="mt-1.5 text-sm text-ok">كل الخامات اللي لها حد إعادة طلب فوق الحد.</p>
      ) : (
        <>
          <ul className="mt-2 list-none divide-y divide-border">
            {rows.slice(0, limit).map((m) => (
              <li key={m.id} className="py-2 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-2">
                  <Link to={`/materials/${m.id}`} className="min-w-0 truncate text-sm underline-offset-4 hover:underline">
                    {m.name}
                  </Link>
                  <Badge tone={m.daysOfCover !== null && m.daysOfCover <= m.leadTimeDays ? "danger" : "warn"}>
                    {m.daysOfCover === null ? "بلا استهلاك" : `${qty(Math.round(m.daysOfCover), 0)} يوم`}
                  </Badge>
                </div>
                <p className="text-xs tabular text-muted-foreground">
                  الرصيد {qty(m.qty)} والحد {qty(m.reorderPoint)} · مدة التوريد {qty(m.leadTimeDays, 0)} يوم
                </p>
              </li>
            ))}
          </ul>
          {rows.length > limit ? (
            <p className="mt-1.5 text-xs text-muted-foreground">و{qty(rows.length - limit, 0)} خامة غيرهم.</p>
          ) : null}
          <Button asChild size="sm" variant="outline" className="mt-2">
            <Link to="/planning">شوف المطلوب شراؤه</Link>
          </Button>
        </>
      )}
    </Card>
  );
}

/* ── ٢٥) المخزون الراكد ───────────────────────────────────────── */

export function DeadStockCard() {
  const { db } = useFactory();
  const { rows, value } = deadStock(db);

  return (
    <Card className="h-full">
      <h3 className="text-base">مخزون راكد</h3>
      {!rows.length ? (
        <p className="mt-1.5 text-sm text-ok">مفيش خامة عندها رصيد بلا استهلاك.</p>
      ) : (
        <>
          <p className="mt-0.5 text-xl tabular">{money(value)}</p>
          <p className="text-xs text-muted-foreground">
            {qty(rows.length, 0)} خامة عندها رصيد ومفيش عليها أي صرف مسجّل — ده كاش نايم في المخزن.
          </p>
          <ul className="mt-2 list-none divide-y divide-border">
            {rows.slice(0, 4).map((r) => (
              <li key={r.id} className="flex items-baseline justify-between gap-2 py-1.5 first:pt-0 last:pb-0">
                <Link to={`/materials/${r.id}`} className="min-w-0 truncate text-sm underline-offset-4 hover:underline">
                  {r.name}
                </Link>
                <span className="shrink-0 text-sm tabular text-muted-foreground">{money(r.value)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

/* ── ٢٦) دوران المخزون ────────────────────────────────────────── */

export function TurnoverCard({ range }: { range: Range }) {
  const { db } = useFactory();
  const points = turnover(db, range).filter((p) => p.turns !== null);

  return (
    <Card className="h-full">
      <ChartFrame
        title="دوران المخزون"
        hint="قيمة الخامة المصروفة ÷ متوسط قيمة المخزون في نفس الفترة"
        empty={points.length < 2 ? "محتاج حركات صرف ومخزون في فترتين على الأقل." : null}
      >
        <ColumnChart
          points={points.map((p) => ({ label: p.label, value: Number((p.turns as number).toFixed(2)) }))}
          format="qty"
          height={120}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          الرقم الأعلى معناه الخامة بتتحرّك أسرع. الرقم الواطي معناه فلوس واقفة في المخزن.
        </p>
      </ChartFrame>
    </Card>
  );
}

/* ── ٢٧ + ٢٨) الموردين ────────────────────────────────────────── */

export function SupplierCard({ limit = 5 }: { limit?: number }) {
  const { db } = useFactory();
  const rows = supplierScores(db);

  if (!rows.length) {
    return (
      <Card className="h-full">
        <h3 className="text-base">الموردين</h3>
        <div className="mt-2">
          <Needs what="فواتير مصروفات على موردين" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <div className="flex items-center gap-1">
        <h3 className="text-base">أداء الموردين</h3>
        <Explain
          label="سكور المورّد"
          text="محسوب من سعره مقابل وسيط سعر نفس البند عند باقي الموردين، ومن ثبات سعره بين الفواتير. الالتزام بالمواعيد مش مسجّل فمش داخل، والمرتجعات مسجّلة بس بتتقاس في درجة جودة المورّد في مركز الجودة — الدرجتين مقصودين: دي بتقول سعره، وديك بتقول بضاعته."
        />
      </div>

      <ul className="mt-2 list-none divide-y divide-border">
        {rows.slice(0, limit).map((r) => (
          <li key={r.id ?? r.name} className="py-2 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-2">
              {r.id ? (
                <Link to={`/parties/${r.id}`} className="min-w-0 truncate text-sm underline-offset-4 hover:underline">
                  {r.name}
                </Link>
              ) : (
                <span className="min-w-0 truncate text-sm">{r.name}</span>
              )}
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-sm tabular text-muted-foreground">{money(r.purchases)}</span>
                {r.score === null ? (
                  <Badge tone="muted">مش محسوب</Badge>
                ) : (
                  <Badge tone={r.score >= 70 ? "ok" : r.score >= 50 ? "warn" : "danger"}>{qty(r.score, 0)}</Badge>
                )}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{r.why.join(" · ")}</p>
          </li>
        ))}
      </ul>

      <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
        عشان الدرجة تبقى أكمل، محتاجين ميعاد توريد متوقع على أمر الشراء مقابل تاريخ الاستلام الفعلي — ودول مش
        مسجّلين لسه.
      </p>
    </Card>
  );
}

/* ── ٢٩ + ٣٠ + ٣١) العمالة ───────────────────────────────────── */

export function WorkforceSection({ range }: { range: Range }) {
  const { db } = useFactory();
  const att = attendanceToday(db);
  const board = workerLeaderboard(db, range);
  const depts = productivityByDept(db, range);

  return (
    <Section title="العمالة" hint="الحضور النهارده، والإنتاجية والجودة في الفترة المختارة" to="/workers">
      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <h4 className="text-base">الحضور</h4>
          {att.crew === 0 ? (
            <div className="mt-2">
              <Needs what="عمال بنظام يومي أو شهري" />
            </div>
          ) : (
            <>
              <p className="mt-1 text-2xl tabular">
                {qty(att.present, 0)} <span className="text-base text-muted-foreground">/ {qty(att.crew, 0)}</span>
              </p>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${att.present >= att.crew * 0.9 ? "bg-ok" : att.present > 0 ? "bg-warn" : "bg-danger"}`}
                  style={{ width: `${(att.present / att.crew) * 100}%` }}
                />
              </div>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">غايب</dt>
                  <dd className="tabular">{qty(att.absent, 0)}</dd>
                </div>
                {att.pieceWorkers > 0 ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">بالقطعة (بلا حضور)</dt>
                    <dd className="tabular">{qty(att.pieceWorkers, 0)}</dd>
                  </div>
                ) : null}
              </dl>
              {!att.isWorkDay ? (
                <p className="mt-1.5 text-xs text-muted-foreground">النهارده مش يوم عمل في جدول الطاقة.</p>
              ) : null}
              {att.present === 0 && att.isWorkDay ? (
                <Button asChild size="sm" className="mt-2">
                  <Link to="/workers">سجّل الحضور</Link>
                </Button>
              ) : null}
            </>
          )}
        </Card>

        <Card>
          <ChartFrame
            title="الإنتاجية بالمرحلة"
            hint="متوسط القطع لكل عامل"
            empty={depts.length ? null : "محتاج مراحل مسجّلة بعمال."}
          >
            <RankBars
              format="qty"
              rows={depts.slice(0, 6).map((d) => ({
                key: d.operationId,
                label: d.name,
                value: Math.round(d.perWorker ?? 0),
                sub: `${qty(Math.round(d.pieces), 0)} قطعة · ${qty(d.workers, 0)} عامل`,
              }))}
            />
          </ChartFrame>
        </Card>

        <Card>
          <div className="flex items-center gap-1">
            <Medal className="h-4 w-4 shrink-0 text-accent" />
            <h4 className="text-base">الأعلى أداءً</h4>
            <Explain
              label="سكور العامل"
              text="متوسط تلات مؤشرات: نصيبه من الشغل المعياري، نسبة السليم من شغله، ونسبة حضوره في أيام العمل."
            />
          </div>
          {!board.length ? (
            <div className="mt-2">
              <Needs what="مراحل مسجّلة باسم العامل" />
            </div>
          ) : (
            <ol className="mt-2 list-none divide-y divide-border">
              {board.slice(0, 5).map((w, i) => (
                <li key={w.id} className="py-2 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-sm">
                      <span className="tabular text-xs text-muted-foreground">{qty(i + 1, 0)}. </span>
                      {w.name}
                    </span>
                    <Badge tone={(w.score as number) >= 75 ? "ok" : (w.score as number) >= 55 ? "gold" : "warn"}>
                      {qty(w.score as number, 0)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{w.why.join(" · ")}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </Section>
  );
}

/* ── ٣٢ + ٣٣ + ٣٤) الجودة ────────────────────────────────────── */

export function QualitySection({ range }: { range: Range }) {
  const { db } = useFactory();
  const entries = db.stageEntries.filter((e) => e.date >= range.from && e.date <= range.to);
  const good = entries.reduce((s, e) => s + e.qtyGood, 0);
  const scrap = entries.reduce((s, e) => s + e.qtyScrap, 0);
  const rework = entries.reduce((s, e) => s + e.qtyRework, 0);
  const total = good + scrap + rework;
  const pareto = defectPareto(db, range);
  const heat = qualityHeat(db, range);
  const waste = wasteByMaterial(db, range);

  if (total === 0) {
    return (
      <Section title="الجودة" to="/orders">
        <Card>
          <Needs what="تسجيل المراحل بكميات سليم وتالف ومعاد" />
        </Card>
      </Section>
    );
  }

  const okPct = (good / total) * 100;

  return (
    <Section title="الجودة" hint="العيب بيتولد فين، وبيكلّف كام" to="/orders">
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-base">نسبة السليم</h4>
              <p className="text-xs text-muted-foreground">من إجمالي اللي اتشغّل في الفترة</p>
            </div>
            <Gauge value={okPct} size={84} />
          </div>
          <dl className="mt-2 space-y-1 border-t border-border pt-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">سليم</dt>
              <dd className="tabular">{qty(Math.round(good), 0)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">مرفوض</dt>
              <dd className="tabular text-danger">{qty(Math.round(scrap), 0)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">إعادة تشغيل</dt>
              <dd className="tabular text-warn">{qty(Math.round(rework), 0)}</dd>
            </div>
            {waste.total > 0 ? (
              <div className="flex justify-between gap-2 border-t border-border pt-1">
                <dt className="text-muted-foreground">تكلفة هالك الخامات</dt>
                <dd className="tabular">{money(waste.total)}</dd>
              </div>
            ) : null}
          </dl>
        </Card>

        <Card>
          <ChartFrame
            title="العيب بيظهر في أي مرحلة"
            hint="مرتّبة بالحجم — أول مرحلتين عادة فيهم أغلب المشكلة"
            empty={pareto.length ? null : "مفيش عيوب مسجّلة في الفترة."}
          >
            <RankBars
              format="qty"
              rows={pareto.slice(0, 6).map((r) => ({
                key: r.operationId,
                label: r.name,
                value: Math.round(r.bad),
                sub: `${qty(Math.round(r.sharePct), 0)}٪ من العيوب · تراكمي ${qty(Math.round(r.cumulativePct), 0)}٪`,
                tone: "var(--danger)",
              }))}
            />
          </ChartFrame>
          <p className="mt-2 text-xs text-muted-foreground">
            التوزيع بالمرحلة مش بنوع العيب: النظام دلوقتي بيسجّل الكمية المرفوضة، مش سببها. تصنيف العيب محتاج
            حقل جديد على تسجيل المرحلة.
          </p>
        </Card>

      </div>

      <div className="mt-3">
        <Card>
          <ChartFrame
            title="الخط × المرحلة"
            hint="اللون الأغمق = نسبة عيوب أعلى"
            empty={heat.lines.length && heat.ops.length ? null : "محتاج مراحل مسجّلة على أكتر من خط."}
          >
            <Heatmap
              rows={heat.lines}
              cols={heat.ops}
              cell={(line, opId) => {
                const c = heat.cells.find((x) => x.line === line && x.operationId === opId);
                return {
                  value: c?.defectPct ?? null,
                  title: c
                    ? `${line} — ${c.name}: ${c.defectPct === null ? "مفيش شغل" : `${Math.round(c.defectPct)}٪ عيوب`}`
                    : "",
                };
              }}
            />
          </ChartFrame>
        </Card>
      </div>
    </Section>
  );
}

/* ── ٣٥) الماكينات والصيانة ───────────────────────────────────── */

/**
 * القسم ده بيجاوب سؤال واحد: الطاقة اللي ضاعت النهارده بسبب ماكينة.
 *
 * فالكارت الأول بيقول الواقف دلوقتي (وواقف من امتى)، والتاني بيقول
 * أكتر سبب أكل وقت في الفترة. **الجاهزية ونسبة التشغيل رقمين مختلفين**
 * وبأسمائهم — ونسبة التشغيل بتختفي لو العمليات مش متسجّلة على ماكينة،
 * مش بتتحوّل لصفر.
 */
export function MachinesSection({ range }: { range: Range }) {
  const { db } = useFactory();
  const sum = machineSummary(db, range);
  const down = machinesDownNow(db);
  const causes = downtimeCauses(db, range);

  if (!sum.total) {
    return (
      <Section title="الماكينات والصيانة" to="/machines" toLabel="افتح الماكينات">
        <Card>
          <Needs what="ماكينات مسجّلة بدقايق شغل يومية" />
        </Card>
      </Section>
    );
  }

  return (
    <Section
      title="الماكينات والصيانة"
      hint="الطاقة اللي ضاعت بسبب توقف — وليه"
      to="/machines"
      toLabel="افتح الماكينات"
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-base">واقف دلوقتي</h4>
            <Badge tone={down.length ? "danger" : "ok"}>
              {down.length ? `${qty(down.length, 0)} من ${qty(sum.total, 0)}` : "كله شغّال"}
            </Badge>
          </div>

          {down.length ? (
            <ul className="mt-2 list-none divide-y divide-border">
              {down.slice(0, 4).map((d) => (
                <li key={d.machine.id} className="flex items-baseline justify-between gap-2 py-1.5 first:pt-0 last:pb-0">
                  <Link
                    to={`/machines/${d.machine.id}`}
                    className="min-w-0 truncate text-sm underline-offset-4 hover:underline"
                  >
                    {d.machine.name}
                    <span className="text-xs text-muted-foreground"> · {d.machine.line || "مش على خط"}</span>
                  </Link>
                  <span className="shrink-0 text-sm tabular text-muted-foreground">
                    {d.downMinutes >= 60
                      ? `${qty(Math.round(d.downMinutes / 60), 0)} ساعة`
                      : `${qty(Math.round(d.downMinutes), 0)} دقيقة`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-sm text-ok">مفيش ماكينة عطلانة ولا في الصيانة دلوقتي.</p>
          )}

          <dl className="mt-2 space-y-1 border-t border-border pt-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="flex items-center gap-1 text-muted-foreground">
                الجاهزية
                <Explain
                  label="الجاهزية"
                  text="(الزمن المخطط − زمن التوقف) ÷ الزمن المخطط. الزمن المخطط = دقايق اليوم على كل ماكينة × أيام العمل في الفترة من تقويم الطاقة. التوقف بيتحسب من التذاكر، والتذكرة المفتوحة وقتها بيجري."
                />
              </dt>
              <dd className="tabular">
                {sum.availabilityPct === null ? "مش محسوبة" : `${qty(Math.round(sum.availabilityPct), 0)}٪`}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">ساعات توقف في الفترة</dt>
              <dd className="tabular">{qty(Math.round(sum.downHours), 0)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">تكلفة الصيانة</dt>
              <dd className="tabular">{money(sum.cost)}</dd>
            </div>
            {sum.overdueServices.length ? (
              <div className="flex justify-between gap-2 border-t border-border pt-1">
                <dt className="text-warn">صيانة فاتت ميعادها</dt>
                <dd className="tabular text-warn">{qty(sum.overdueServices.length, 0)}</dd>
              </div>
            ) : null}
          </dl>
        </Card>

        <Card>
          <ChartFrame
            title="أكتر سبب وقّف المصنع"
            hint="مرتّب بالدقايق مش بعدد التذاكر — التذكرة الواحدة الطويلة أغلى من تلاتة قصيرين"
            empty={causes.length ? null : "مفيش توقف مسجّل في الفترة."}
          >
            <RankBars
              format="qty"
              rows={causes.slice(0, 6).map((c) => ({
                key: c.cause,
                label: c.cause,
                value: Math.round(c.minutes),
                sub: `${qty(Math.round(c.sharePct), 0)}٪ من التوقف · ${qty(c.count, 0)} تذكرة · ${money(c.cost)}`,
                tone: "var(--danger)",
              }))}
            />
          </ChartFrame>
          <p className="mt-2 text-xs text-muted-foreground">
            {sum.opCoveragePct === null
              ? "نسبة التشغيل لكل ماكينة مش محسوبة: مفيش عمليات مسجّلة في الفترة."
              : `نسبة التشغيل محسوبة على ${qty(Math.round(sum.opCoveragePct), 0)}٪ من العمليات — دي اللي اتسجّلت وعليها ماكينة. الباقي بيظهر «مش محسوبة» بدل صفر.`}
          </p>
        </Card>
      </div>
    </Section>
  );
}
