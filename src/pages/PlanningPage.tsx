import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Field, Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, selectClass } from "@/components/ui/input";
import { addDays, cairoToday, formatDate, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { ExportMenu } from "@/components/export/ExportMenu";
import { datasetOf } from "@/store/datasets";
import {
  capacityOf,
  capacityOutlook,
  DEFAULT_CAPACITY,
  minutesLabel,
  mrp,
  schedule,
  simulate,
  type CapacitySettings,
  type Simulation,
} from "@/store/planning";

export function PlanningPage() {
  const { db, can } = useFactory();
  const [capOpen, setCapOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);

  const plan = useMemo(() => schedule(db), [db]);
  const outlook = useMemo(() => capacityOutlook(db, plan), [db, plan]);
  const needs = useMemo(() => mrp(db, plan), [db, plan]);
  const cap = plan.cap;

  const nothingToPlan = !plan.rows.length && !plan.excluded.length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">التخطيط والطاقة</h2>
          <p className="text-sm text-muted-foreground">
            الجدول مش مكتوب بالإيد — بيتحسب من أوامرك ومراحلها المسجّلة، فأي حركة إنتاج بتعيد ترتيبه لوحدها.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <ExportMenu
            module="planning"
            dataset={() =>
              datasetOf(db, "schedule", {
                filters: [
                  { label: "الطاقة", value: `${cap.hoursPerDay} ساعة × ${cap.daysPerWeek} يوم × ${cap.utilizationPct}٪` },
                ],
              })
            }
          />
          <Button variant="outline" onClick={() => setSimOpen(true)}>
            لو…؟
          </Button>
          {can.edit ? (
            <Button variant="outline" onClick={() => setCapOpen(true)}>
              الطاقة
            </Button>
          ) : null}
        </div>
      </div>

      {nothingToPlan ? (
        <EmptyState
          icon={CalendarClock}
          title="مفيش أوامر إنتاج شغالة"
          body="أول ما يبقى عندك أمر إنتاج مربوط بمنتج له مسار تصنيع وزمن معياري، الجدول والطاقة واحتياج الخامات بيظهروا هنا."
        />
      ) : null}

      <Card>
        <h3 className="text-base">طاقة المصنع كل يوم</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {qty(cap.crew, 0)} {cap.crewFromWorkers ? "عامل مسجّل" : "عامل معتمد"} × {qty(cap.hoursPerDay, 1)} ساعة ×{" "}
          {qty(cap.utilizationPct, 0)}٪ استغلال = <strong className="font-medium text-foreground">{qty(Math.round(cap.perDay), 0)} دقيقة</strong>{" "}
          في يوم العمل، و{qty(cap.daysPerWeek, 0)} أيام عمل في الأسبوع.
        </p>
        {cap.crew === 0 ? (
          <p className="mt-2 text-sm text-warn">مفيش عمال مسجّلين، فالطاقة صفر والجدولة مش ممكنة. سجّل العمال أو حدّد عدد العمالة في إعداد الطاقة.</p>
        ) : null}
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        {outlook.windows.map((w) => (
          <Card key={w.key}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm text-muted-foreground">{w.label}</p>
              {w.days > 0 ? <span className="text-xs text-muted-foreground">{qty(w.days, 0)} يوم عمل</span> : null}
            </div>
            {w.days === 0 ? (
              <>
                <p className="mt-1 text-xl">يوم راحة</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  أسبوع العمل {qty(cap.daysPerWeek, 0)} أيام، فالشغل بيبدأ أول يوم عمل جاي.
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-xl tabular">{qty(Math.round(w.pct), 0)}٪ محمّل</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${w.pct >= 95 ? "bg-danger" : w.pct >= 80 ? "bg-warn" : "bg-ok"}`}
                    style={{ width: `${w.pct}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  متاح {qty(Math.round(w.available), 0)} دقيقة · مشغول {qty(Math.round(w.used), 0)} · فاضي{" "}
                  {qty(Math.round(w.remaining), 0)}
                </p>
              </>
            )}
          </Card>
        ))}
      </div>

      {plan.rows.length ? (
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base">الحمل الحالي</h3>
            <span className="text-sm text-muted-foreground">
              {minutesLabel(plan.totalMinutes, cap)} شغل مستني، وآخر أمر بيخلص{" "}
              {plan.horizon ? formatDate(plan.horizon) : "—"}
            </span>
          </div>
          {plan.lateRows.length ? (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft/50 p-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
              <p className="text-sm">
                {qty(plan.lateRows.length, 0)} أمر مش هيلحق ميعاده بالطاقة الحالية. أقربهم{" "}
                <strong className="font-medium">{plan.lateRows[0].code}</strong> — ميعاده{" "}
                {formatDate(plan.lateRows[0].dueDate)} وهيخلص {formatDate(plan.lateRows[0].finish)} (متأخر{" "}
                {qty(plan.lateRows[0].lateDays, 0)} يوم عمل).
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ok">كل الأوامر المجدولة بتلحق ميعادها بالطاقة الحالية.</p>
          )}
        </Card>
      ) : null}

      {plan.rows.length ? (
        <section>
          <h3 className="mb-2 text-base">جدول الإنتاج</h3>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="p-2.5 text-right font-medium">الأمر</th>
                  <th className="p-2.5 text-left font-medium">الشغل الباقي</th>
                  <th className="p-2.5 text-left font-medium">يبدأ</th>
                  <th className="p-2.5 text-left font-medium">يخلص</th>
                  <th className="p-2.5 text-left font-medium">الميعاد</th>
                  <th className="p-2.5 text-left font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {plan.rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-2.5">
                      <Link to={`/orders/${r.id}`} className="latin font-medium underline-offset-4 hover:underline">
                        {r.code}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {r.name} · {r.line}
                        {r.afterCode ? ` · بعد ${r.afterCode}` : ""}
                      </span>
                    </td>
                    <td className="p-2.5 text-left tabular">{minutesLabel(r.minutes, cap)}</td>
                    <td className="p-2.5 text-left whitespace-nowrap">{formatDate(r.start)}</td>
                    <td className="p-2.5 text-left whitespace-nowrap">{formatDate(r.finish)}</td>
                    <td className="p-2.5 text-left whitespace-nowrap">{formatDate(r.dueDate)}</td>
                    <td className="p-2.5 text-left">
                      {r.onTime ? (
                        <Badge tone="ok">يلحق</Badge>
                      ) : (
                        <Badge tone="danger">متأخر {qty(r.lateDays, 0)} يوم</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            الترتيب بالأقرب ميعادًا، وطاقة المصنع pool واحد بيتوزّع بالتتابع — فالأمر اللي قبله بيتأخر، اللي بعده
            بيتأخر معاه. العمليات الخارجية مش محسوبة في الطاقة الداخلية.
          </p>
        </section>
      ) : null}

      {outlook.lines.length > 1 ? (
        <Card>
          <h3 className="text-base">الحمل على الخطوط</h3>
          <ul className="mt-2 list-none space-y-2">
            {outlook.lines.map((l) => (
              <li key={l.line}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{l.line}</span>
                  <span className="shrink-0 tabular text-muted-foreground">{qty(Math.round(l.share), 0)}٪</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, l.share)}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            دي نسبة الشغل المطلوب على كل خط، مش جدولة مستقلة لكل خط — الطاقة لسه محسوبة كـpool واحد للمصنع.
          </p>
        </Card>
      ) : null}

      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base">احتياج الخامات (MRP)</h3>
          {needs.shortages.length ? (
            <span className="text-sm text-danger">
              نقص في {qty(needs.shortages.length, 0)} خامة بتكلفة شراء تقديرية <Money value={needs.shortageCost} />
            </span>
          ) : null}
        </div>

        {needs.shortages.length ? (
          <div className="mb-2 flex items-start gap-2 rounded-md border border-warn/30 bg-warn-soft/40 p-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
            <div className="text-sm">
              {needs.shortages.map((s) => (
                <p key={s.materialId}>
                  يوجد نقص {qty(Math.ceil(s.shortage))} {s.unit} من {s.name}
                  {s.neededBy ? ` — مطلوبة ${formatDate(s.neededBy)}` : ""}
                  {s.lateArrival
                    ? `، ومدة التوريد ${qty(s.leadTimeDays, 0)} يوم معناها وصولها ${formatDate(s.arrival)} بعد الميعاد.`
                    : "."}
                </p>
              ))}
            </div>
          </div>
        ) : needs.rows.length ? (
          <p className="mb-2 text-sm text-ok">كل الخامات اللي الأوامر المفتوحة محتاجاها موجودة في المخزن — مفيش نقص دلوقتي.</p>
        ) : null}

        {needs.rows.length ? (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="p-2.5 text-right font-medium">الخامة</th>
                  <th className="p-2.5 text-left font-medium">مطلوب</th>
                  <th className="p-2.5 text-left font-medium">في المخزن</th>
                  <th className="p-2.5 text-left font-medium">محجوز</th>
                  <th className="p-2.5 text-left font-medium">النقص</th>
                  <th className="p-2.5 text-left font-medium">مطلوبة</th>
                  <th className="p-2.5 text-left font-medium">شراء مقترح</th>
                </tr>
              </thead>
              <tbody>
                {needs.rows.map((r) => (
                  <tr key={r.materialId} className="border-t border-border">
                    <td className="p-2.5">
                      <Link to={`/materials/${r.materialId}`} className="font-medium underline-offset-4 hover:underline">
                        {r.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {r.orders.map((o) => o.code).join("، ")}
                      </span>
                    </td>
                    <td className="p-2.5 text-left tabular">{qty(r.required)}</td>
                    <td className="p-2.5 text-left tabular">{qty(r.onHand)}</td>
                    <td className="p-2.5 text-left tabular">{qty(r.reserved)}</td>
                    <td className="p-2.5 text-left tabular">
                      {r.shortage > 0.0001 ? <span className="text-danger">{qty(r.shortage)}</span> : "—"}
                    </td>
                    <td className="p-2.5 text-left whitespace-nowrap">{r.neededBy ? formatDate(r.neededBy) : "—"}</td>
                    <td className="p-2.5 text-left tabular">
                      {r.suggestedQty ? (
                        <>
                          {qty(r.suggestedQty, 0)} {r.unit}
                          <span className="block text-xs text-muted-foreground">
                            <Money value={r.cost} />
                            {r.vendor ? ` · ${r.vendor}` : ""}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">مفيش احتياج خامات مفتوح — كل الأوامر المربوطة بقائمة خامات اتصرفت بالكامل.</p>
        )}

        {needs.blind.length ? (
          <p className="mt-2 text-xs text-warn">
            {qty(needs.blind.length, 0)} أمر مفتوح مالهوش قائمة خامات ({needs.blind.map((o) => o.code).join("، ")}) — احتياجه مش داخل
            في الحساب، والنظام مش بيخمّن خاماته.
          </p>
        ) : null}
      </section>

      {plan.excluded.length || plan.stopped.length ? (
        <Card>
          <h3 className="text-base">برّه الجدولة</h3>
          <ul className="mt-2 list-none space-y-2 text-sm">
            {plan.excluded.map((l) => (
              <li key={l.order.id}>
                <Link to={`/orders/${l.order.id}`} className="latin font-medium underline-offset-4 hover:underline">
                  {l.order.code}
                </Link>{" "}
                <span className="text-muted-foreground">{l.reason}</span>
              </li>
            ))}
            {plan.stopped.map((l) => (
              <li key={l.order.id}>
                <Link to={`/orders/${l.order.id}`} className="latin font-medium underline-offset-4 hover:underline">
                  {l.order.code}
                </Link>{" "}
                <span className="text-muted-foreground">
                  متوقف — مش بياخد من الطاقة دلوقتي
                  {l.plannable && l.minutes > 0 ? `، ولما يشتغل هياخد ${minutesLabel(l.minutes, cap)}` : ""}.
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <CapacityPanel open={capOpen} onClose={() => setCapOpen(false)} />
      <SimulatorPanel open={simOpen} onClose={() => setSimOpen(false)} />
    </div>
  );
}

function CapacityPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, setCapacity } = useFactory();
  const current = capacityOf(db);
  const [form, setForm] = useState<CapacitySettings>(current);
  const crew = form.crewSize ?? db.workers.length;
  const perDay = crew * form.hoursPerDay * 60 * (form.utilizationPct / 100);

  return (
    <Panel
      open={open}
      title="إعداد الطاقة"
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <Button
            className="w-full"
            onClick={() => {
              try {
                setCapacity(form);
                toast.success("الطاقة اتحفظت، والجدول اتحسب من جديد.");
                onClose();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "فشل");
              }
            }}
          >
            احفظ الطاقة
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setForm(DEFAULT_CAPACITY)}>
            رجّع الافتراضي
          </Button>
        </div>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        دي الأرقام اللي كل الجدولة مبنية عليها. نسبة الاستغلال هي الوقت اللي فعلًا بينتَج فيه بعد التجهيز والراحة
        والتعطل — المصانع بتتراوح بين ٧٠٪ و٩٠٪.
      </p>
      <Field label="ساعات العمل في اليوم">
        <Input
          value={String(form.hoursPerDay)}
          inputMode="decimal"
          onChange={(e) => setForm({ ...form, hoursPerDay: Math.max(0, Number(e.target.value) || 0) })}
        />
      </Field>
      <Field label="أيام العمل في الأسبوع">
        <select
          className={selectClass}
          value={form.daysPerWeek}
          onChange={(e) => setForm({ ...form, daysPerWeek: Number(e.target.value) })}
        >
          {[7, 6, 5, 4].map((d) => (
            <option key={d} value={d}>
              {d} {d === 7 ? "— بدون راحة" : d === 6 ? "— الجمعة راحة" : d === 5 ? "— الجمعة والسبت راحة" : "— أربع أيام"}
            </option>
          ))}
        </select>
      </Field>
      <Field label="نسبة الاستغلال %">
        <Input
          value={String(form.utilizationPct)}
          inputMode="numeric"
          onChange={(e) => setForm({ ...form, utilizationPct: Math.max(0, Number(e.target.value) || 0) })}
        />
      </Field>
      <Field label="عدد العمالة المعتمد">
        <Input
          value={form.crewSize === null ? "" : String(form.crewSize)}
          inputMode="numeric"
          placeholder={`${db.workers.length} عامل مسجّل`}
          onChange={(e) =>
            setForm({ ...form, crewSize: e.target.value.trim() === "" ? null : Math.max(0, Number(e.target.value) || 0) })
          }
        />
      </Field>
      <p className="text-sm">
        الناتج: <strong className="font-medium">{qty(Math.round(perDay), 0)} دقيقة</strong> في يوم العمل
        {crew ? ` (${qty(crew, 0)} عامل)` : ""}.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        سيب عدد العمالة فاضي والنظام يعتمد عدد العمال المسجّلين. التغيير بيتسجل في سجل التعديلات باسمك.
      </p>
    </Panel>
  );
}

function SimulatorPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db } = useFactory();
  const today = cairoToday();
  const [productId, setProductId] = useState(db.products[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1000");
  const [dueDate, setDueDate] = useState(addDays(today, 30));
  const [result, setResult] = useState<Simulation | null>(null);

  return (
    <Panel
      open={open}
      title="لو دخلت طلب جديد؟"
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={() => setResult(simulate(db, { productId, quantity: Number(quantity) || 0, dueDate }))}>
          احسب
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        الإجابة بتتحسب من بياناتك: طاقتك الحالية، الأوامر اللي قبله، خامات المنتج، وتكلفته المحسوبة. مفيش أي رقم
        مفترض.
      </p>
      <Field label="المنتج">
        <select className={selectClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">اختار المنتج</option>
          {db.products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="الكمية">
        <Input value={quantity} inputMode="numeric" onChange={(e) => setQuantity(e.target.value)} />
      </Field>
      <Field label="الميعاد المطلوب">
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </Field>

      {result ? <SimResult sim={result} /> : null}
    </Panel>
  );
}

function SimResult({ sim }: { sim: Simulation }) {
  const { db } = useFactory();
  const cap = schedule(db).cap;

  if (!sim.ok) {
    return (
      <div className="mt-4 rounded-md border border-warn/30 bg-warn-soft/40 p-3">
        <p className="text-sm font-medium">مش قادر أجاوب بدقة قبل كده:</p>
        <ul className="mt-1 list-none space-y-1 text-sm text-muted-foreground">
          {sim.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">النظام مش بيخمّن زمن ولا خامات مش مسجّلة.</p>
      </div>
    );
  }

  const shortages = sim.materials.filter((m) => m.shortage > 0.0001);

  return (
    <div className="mt-4 space-y-3">
      <div className={`rounded-md border p-3 ${sim.meetsDue ? "border-ok/30 bg-ok-soft/40" : "border-danger/30 bg-danger-soft/40"}`}>
        <p className="text-sm">
          {sim.meetsDue ? "أيوه، المصنع يقدر" : "لأ، مش هيلحق"} — الطلب محتاج{" "}
          <strong className="font-medium">{minutesLabel(sim.minutes, cap)}</strong> ({qty(sim.perPiece, 1)} دقيقة للقطعة)،
          وبترتيب الأولوية هيخلص {sim.finish ? formatDate(sim.finish) : "—"}
          {sim.meetsDue ? "." : ` — متأخر ${qty(sim.lateDays, 0)} يوم عمل عن الميعاد المطلوب.`}
        </p>
        {!sim.meetsDue && sim.extraWorkers ? (
          <p className="mt-1 text-sm">
            لو هتلتزم بالميعاد: محتاج {qty(sim.extraWorkers, 0)} عامل إضافي (نقص{" "}
            {qty(Math.round(sim.feasibility.shortfall), 0)} دقيقة على {qty(sim.feasibility.workDays, 0)} يوم عمل)، أو
            وقت إضافي، أو تأجيل أوامر تانية.
          </p>
        ) : null}
        {sim.outsourcedMinutes > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            وفيه {minutesLabel(sim.outsourcedMinutes, cap)} عمليات خارجية مش محسوبة في طاقة المصنع.
          </p>
        ) : null}
      </div>

      <div className="rounded-md border border-border p-3">
        <p className="text-sm font-medium">الفلوس</p>
        <ul className="mt-1 list-none space-y-1 text-sm text-muted-foreground">
          <li>
            التكلفة المتوقعة: <Money value={sim.cost} />
          </li>
          <li>
            {sim.priceKnown ? (
              <>
                الإيراد بسعر البيع المسجّل: <Money value={sim.revenue} /> — ربح <Money value={sim.profit} /> (هامش{" "}
                {qty(Math.round(sim.marginPct ?? 0), 0)}٪)
              </>
            ) : (
              "سعر بيع المنتج مش مسجّل، فالربح مش محسوب — سجّل السعر في كارت المنتج."
            )}
          </li>
          {shortages.length ? (
            <li>
              شراء الخامات الناقصة: <Money value={sim.materialShortageCost} /> قبل ما الشغل يبدأ
            </li>
          ) : null}
        </ul>
      </div>

      {sim.materials.length ? (
        <div className="rounded-md border border-border p-3">
          <p className="text-sm font-medium">الخامات</p>
          <ul className="mt-1 list-none space-y-1 text-sm text-muted-foreground">
            {sim.materials.map((m) => (
              <li key={m.name}>
                {m.name}: محتاج {qty(m.required)} {m.unit} · متاح {qty(m.available)}
                {m.shortage > 0.0001 ? <span className="text-danger"> · ناقص {qty(m.shortage)}</span> : " · كافي"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {sim.impact.length ? (
        <div className="rounded-md border border-warn/30 bg-warn-soft/40 p-3">
          <p className="text-sm font-medium">تأثيره على الأوامر الشغالة</p>
          <ul className="mt-1 list-none space-y-1 text-sm text-muted-foreground">
            {sim.impact.map((i) => (
              <li key={i.code}>
                <span className="latin">{i.code}</span> هيتأخر {qty(i.slipDays, 0)} يوم عمل (من {formatDate(i.before)} لـ
                {formatDate(i.after)})
                {i.becameLate ? " وهيخرج عن ميعاده" : ""}.
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-ok">مفيش أمر شغال هيتأخر بسببه بترتيب الأولوية الحالي.</p>
      )}
    </div>
  );
}

/** كارت مختصر للصفحة الرئيسية */
export function PlanningTeaser() {
  const { db } = useFactory();
  const plan = useMemo(() => schedule(db), [db]);
  if (!plan.rows.length && !plan.excluded.length) return null;
  const out = capacityOutlook(db, plan);
  const week = out.windows.find((w) => w.key === "week");
  const shortages = mrp(db, plan).shortages;

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base">التخطيط والطاقة</h3>
        <Link to="/planning" className="text-sm text-accent underline underline-offset-4">
          افتح الجدول
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        حمل الأسبوع {qty(Math.round(week?.pct ?? 0), 0)}٪
        {plan.lateRows.length ? ` · ${qty(plan.lateRows.length, 0)} أمر مش هيلحق ميعاده` : " · كل الأوامر بتلحق ميعادها"}
        {shortages.length ? ` · نقص في ${shortages.length} خامة` : ""}
      </p>
    </Card>
  );
}