import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Scissors, Calculator } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Field, Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, selectClass } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ExportMenu } from "@/components/export/ExportMenu";
import { DocumentButton } from "@/components/docs/DocumentPrint";
import { cairoToday, formatDate, money, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { datasetOf } from "@/store/datasets";
import { LAY_STATUS_LABEL, LAY_STATUS_TONE, layMath, orderCutSummary, planBundles, rollPlan } from "@/store/cutting";
import { bundleState } from "@/store/floor";
import { materialStock, routingLines } from "@/store/manufacturing";
import type { CutLay } from "@/store/types";

/**
 * القص والفرشة.
 *
 * الشاشة دي بتجاوب على السؤال اللي كان ناقص بين المخزن والإنتاج: **القماش
 * ده طلع منه كام قطعة، وكام ضاع؟** المصنع بيدخل اللي هو بيقيسه على
 * الترابيزة (ماركر، طبقات، مقاسات)، والشاشة بتحسب القطع والمتر للقطعة
 * ونسبة الاستغلال — ولما يدوس «قص»، القماش بيخرج من المخزن فعلًا،
 * الإنتاج بيتسجّل، والباندلات بتطلع بتيكتاتها.
 */

const TABS = [
  { id: "lays", label: "الفرشات" },
  { id: "bundles", label: "الباندلات" },
  { id: "roll", label: "حاسبة الرول" },
] as const;

export function CuttingPage() {
  const { db, can } = useFactory();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("lays");
  const [newOpen, setNewOpen] = useState(false);
  const [cutting, setCutting] = useState<CutLay | null>(null);

  const lays = useMemo(
    () =>
      [...(db.cutLays ?? [])]
        .sort((a, b) => (a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date)))
        .map((l) => layMath(db, l)),
    [db],
  );
  const openOrders = db.orders.filter((o) => o.status === "running" || o.status === "late" || o.status === "stopped");
  const planned = lays.filter((l) => l.lay.status === "planned");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">القص والفرشات</h2>
          <p className="text-sm text-muted-foreground">
            الفرشة هي اللي بتقول القماش طلع منه كام قطعة وكام ضاع. دوس «قص» يصرف القماش ويطلّع الباندلات.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <ExportMenu module="production" dataset={() => datasetOf(db, "lays")} />
          {can.do("production", "create") ? (
            <Button onClick={() => setNewOpen(true)} disabled={!openOrders.length}>
              فرشة جديدة
            </Button>
          ) : null}
        </div>
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
              tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "lays" ? (
        <div className="space-y-3">
          {!lays.length ? (
            <EmptyState
              icon={Scissors}
              title="مفيش فرشات مسجّلة"
              body="الفرشة بتربط القماش بالقطع: تدخل طول الماركر وعدد الطبقات والمقاسات، والنظام يحسب القطع والمتر للقطعة ونسبة الاستغلال."
              action={
                can.do("production", "create") && openOrders.length
                  ? { label: "فرشة جديدة", onClick: () => setNewOpen(true) }
                  : undefined
              }
            />
          ) : null}
          {planned.length ? (
            <p className="text-sm text-muted-foreground">
              فيه {qty(planned.length, 0)} فرشة مخططة لسه ماتقصّتش — القماش لسه في المخزن.
            </p>
          ) : null}
          {lays.map((m) => (
            <LayCard key={m.lay.id} m={m} onCut={() => setCutting(m.lay)} />
          ))}
        </div>
      ) : null}

      {tab === "bundles" ? <Bundles /> : null}
      {tab === "roll" ? <RollCalculator /> : null}

      <NewLayPanel open={newOpen} onClose={() => setNewOpen(false)} />
      <CutPanel lay={cutting} onClose={() => setCutting(null)} />
    </div>
  );
}

function LayCard({ m, onCut }: { m: ReturnType<typeof layMath>; onCut: () => void }) {
  const { can, cancelLay } = useFactory();
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);
  const lay = m.lay;

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base">
              {m.order ? (
                <Link to={`/orders/${m.order.id}`} className="underline-offset-4 hover:underline">
                  {m.order.code}
                </Link>
              ) : (
                "بدون أمر"
              )}{" "}
              · {m.materialName}
            </h3>
            <Badge tone={LAY_STATUS_TONE[lay.status]}>{LAY_STATUS_LABEL[lay.status]}</Badge>
            {lay.color ? <Badge tone="muted">{lay.color}</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDate(lay.date)} · {qty(lay.plies, 0)} طبقة · ماركر {qty(lay.markerLengthM, 2)} م
            {lay.markerWidthM ? ` بعرض ${qty(lay.markerWidthM, 2)} م` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <DocumentButton type="cutting" refId={lay.id} variant="outline" size="sm" label="تيكت قص" />
          {lay.status === "planned" && can.do("production", "create") ? (
            <Button size="sm" onClick={onCut}>
              قص الفرشة
            </Button>
          ) : null}
          {lay.status === "planned" && can.do("production", "edit") ? (
            <Button size="sm" variant="dangerGhost" onClick={() => setAsking((v) => !v)}>
              إلغاء
            </Button>
          ) : null}
        </div>
      </div>

      {asking ? (
        <div className="rounded-md border border-danger/25 bg-danger-soft/40 p-3">
          <Field label="سبب الإلغاء">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلًا: القماش مختلف عن العينة" />
          </Field>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              try {
                cancelLay(lay.id, reason);
                toast.success("الفرشة اتلغت.");
                setAsking(false);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "مش قادر ألغي.");
              }
            }}
          >
            تأكيد الإلغاء
          </Button>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="القطع" value={qty(m.pieces, 0)} hint={`${qty(m.sizes.length, 0)} مقاس`} />
        <Metric
          label={lay.status === "cut" ? "القماش المستهلك" : "القماش المطلوب"}
          value={`${qty(m.actualM ?? m.plannedM, 2)} ${m.unit}`}
          hint={lay.status === "cut" && m.actualM !== m.plannedM ? `المخطّط ${qty(m.plannedM, 2)}` : undefined}
        />
        <Metric
          label="المتر للقطعة"
          value={qty(m.perPieceM, 3)}
          hint={m.standardM ? `المعياري ${qty(m.standardM, 3)}` : "مفيش معياري مسجّل"}
        />
        <Metric
          label="الاستغلال"
          value={m.utilizationPct === null ? "—" : `${qty(m.utilizationPct, 1)}٪`}
          tone={m.utilizationPct === null ? undefined : m.utilizationPct >= 98 ? "ok" : m.utilizationPct >= 92 ? "warn" : "danger"}
          hint={m.wastePct === null ? "محتاج قائمة خامات للمقارنة" : `هالك ${qty(m.wastePct, 1)}٪ فوق المعياري`}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 text-start font-medium">المقاس</th>
              <th className="py-1.5 text-end font-medium">في الطبقة</th>
              <th className="py-1.5 text-end font-medium">القطع</th>
              <th className="py-1.5 text-end font-medium">النسبة</th>
            </tr>
          </thead>
          <tbody>
            {m.sizes.map((s) => (
              <tr key={s.id} className="border-b border-border/50">
                <td className="py-1.5">{s.size}</td>
                <td className="py-1.5 text-end tabular">{qty(s.perPly, 0)}</td>
                <td className="py-1.5 text-end tabular">{qty(s.pieces, 0)}</td>
                <td className="py-1.5 text-end tabular">{qty(s.sharePct, 0)}٪</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        تكلفة قماش الفرشة {money(m.cost)} · فاقد الأطراف {qty(m.endLossPct, 1)}٪
        {m.bundles.length ? ` · ${qty(m.bundles.length, 0)} باندل (${qty(m.bundledPieces, 0)} قطعة)` : ""}
        {lay.notes ? ` · ${lay.notes}` : ""}
      </p>
    </Card>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warn" | "danger";
}) {
  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "";
  return (
    <div className="rounded-md border border-border/70 bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-lg tabular ${color}`}>{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/* ── فرشة جديدة ─────────────────────────────────────────────────── */

function NewLayPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, addLay } = useFactory();
  const orders = db.orders.filter((o) => o.status !== "done");
  const fabrics = useMemo(() => materialStock(db), [db]);

  const [orderId, setOrderId] = useState(orders[0]?.id ?? "");
  const [materialId, setMaterialId] = useState("");
  const [color, setColor] = useState("");
  const [plies, setPlies] = useState("20");
  const [marker, setMarker] = useState("");
  const [end, setEnd] = useState("0.2");
  const [width, setWidth] = useState("");
  const [notes, setNotes] = useState("");
  const [sizes, setSizes] = useState<{ size: string; perPly: string }[]>([
    { size: "M", perPly: "1" },
    { size: "L", perPly: "1" },
  ]);

  const order = orders.find((o) => o.id === orderId) ?? null;
  const routes = order?.productId ? routingLines(db, order.productId) : [];
  const cutOp = routes[0] ?? null;
  const perPlyTotal = sizes.reduce((s, r) => s + (Number(r.perPly) || 0), 0);
  const pieces = perPlyTotal * (Number(plies) || 0);
  const fabric = (Number(marker) + (Number(end) || 0)) * (Number(plies) || 0);
  const summary = order ? orderCutSummary(db, order) : null;
  const stock = fabrics.find((f) => f.id === materialId);

  const save = () => {
    try {
      addLay({
        orderId,
        materialId,
        operationId: cutOp?.operationId ?? null,
        color,
        date: cairoToday(),
        plies: Number(plies) || 0,
        markerLengthM: Number(marker) || 0,
        endAllowanceM: Number(end) || 0,
        markerWidthM: Number(width) || 0,
        notes,
        sizes: sizes.map((s) => ({ size: s.size, perPly: Number(s.perPly) || 0 })),
      });
      toast.success("الفرشة اتسجّلت — لسه ماتقصّتش.");
      onClose();
      setMarker("");
      setNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر أسجّل الفرشة.");
    }
  };

  return (
    <Panel
      open={open}
      title="فرشة جديدة"
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={save}>
          حفظ الفرشة
        </Button>
      }
    >
      <Field label="أمر الإنتاج">
        <select className={selectClass} value={orderId} onChange={(e) => setOrderId(e.target.value)}>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.code} — {o.model} ({qty(o.quantity, 0)} قطعة)
            </option>
          ))}
        </select>
      </Field>
      {summary ? (
        <p className="-mt-1 mb-3 text-xs text-muted-foreground">
          مقصوص من الأمر {qty(summary.cutPieces, 0)} · باقي {qty(summary.remaining, 0)}
          {summary.plannedPieces ? ` · مخطّط ${qty(summary.plannedPieces, 0)}` : ""}
        </p>
      ) : null}

      <Field label="القماش">
        <select className={selectClass} value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
          <option value="">اختار الخامة</option>
          {fabrics.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} — متاح {qty(f.qty, 2)}
            </option>
          ))}
        </select>
      </Field>
      {stock && fabric > stock.qty ? (
        <p className="-mt-1 mb-3 text-xs text-danger">
          الفرشة عايزة {qty(fabric, 2)} والمتاح {qty(stock.qty, 2)} — القص هيترفض بالرصيد ده.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="اللون">
          <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="أزرق فاتح" />
        </Field>
        <Field label="عدد الطبقات">
          <Input value={plies} onChange={(e) => setPlies(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="طول الماركر (متر)">
          <Input value={marker} onChange={(e) => setMarker(e.target.value)} inputMode="decimal" placeholder="12.6" />
        </Field>
        <Field label="فاقد الأطراف (متر)">
          <Input value={end} onChange={(e) => setEnd(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="عرض الفرشة (متر)">
          <Input value={width} onChange={(e) => setWidth(e.target.value)} inputMode="decimal" placeholder="1.6" />
        </Field>
      </div>

      <p className="mb-2 text-sm">المقاسات في الطبقة</p>
      {sizes.map((row, i) => (
        <div key={i} className="mb-2 flex gap-2">
          <Input
            value={row.size}
            onChange={(e) => setSizes(sizes.map((r, j) => (i === j ? { ...r, size: e.target.value } : r)))}
            placeholder="المقاس"
          />
          <Input
            value={row.perPly}
            onChange={(e) => setSizes(sizes.map((r, j) => (i === j ? { ...r, perPly: e.target.value } : r)))}
            inputMode="numeric"
            className="w-24"
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="شيل المقاس"
            onClick={() => setSizes(sizes.filter((_, j) => j !== i))}
          >
            ×
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="mb-3" onClick={() => setSizes([...sizes, { size: "", perPly: "1" }])}>
        + مقاس
      </Button>

      <div className="mb-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
        <p>
          القطع: <span className="tabular">{qty(pieces, 0)}</span> ({qty(perPlyTotal, 0)} في الطبقة ×{" "}
          {qty(Number(plies) || 0, 0)})
        </p>
        <p>
          القماش المطلوب: <span className="tabular">{qty(fabric, 2)}</span> متر
          {pieces > 0 ? ` · ${qty(fabric / pieces, 3)} للقطعة` : ""}
        </p>
        {cutOp ? (
          <p className="text-muted-foreground">القص هيتسجّل على عملية «{cutOp.name}» في دفتر الإنتاج.</p>
        ) : (
          <p className="text-warn">المنتج مالوش مسار تصنيع — القص هيتسجّل كفرشة بس بلا إنتاج.</p>
        )}
      </div>

      <Field label="ملاحظات">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثلًا: ٨ قطع في الطبقة على ٣ مقاسات" />
      </Field>
    </Panel>
  );
}

/* ── تنفيذ القص ─────────────────────────────────────────────────── */

function CutPanel({ lay, onClose }: { lay: CutLay | null; onClose: () => void }) {
  const { db, cutLayNow } = useFactory();
  const [used, setUsed] = useState("");
  const [perBundle, setPerBundle] = useState("25");
  const [workerId, setWorkerId] = useState("");

  const m = lay ? layMath(db, lay) : null;
  const plan = m ? planBundles(m.sizes.map((s) => ({ size: s.size, pieces: s.pieces })), Number(perBundle) || 25) : [];

  const run = () => {
    if (!lay) return;
    try {
      cutLayNow(lay.id, {
        fabricUsedM: Number(used) || 0,
        perBundle: Number(perBundle) || 25,
        workerId: workerId || null,
      });
      toast.success("القص اتسجّل: القماش خرج والباندلات اتطلعت.");
      onClose();
      setUsed("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر أسجّل القص.");
    }
  };

  return (
    <Panel
      open={!!lay}
      title="قص الفرشة"
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={run}>
          تأكيد القص
        </Button>
      }
    >
      {m ? (
        <>
          <div className="mb-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <p>
              {m.order?.code} · {m.materialName} · {qty(m.pieces, 0)} قطعة
            </p>
            <p className="text-muted-foreground">المخطّط {qty(m.plannedM, 2)} متر</p>
          </div>

          <Field label="القماش المستهلك فعلًا (متر)">
            <Input
              value={used}
              onChange={(e) => setUsed(e.target.value)}
              inputMode="decimal"
              placeholder={qty(m.plannedM, 2)}
            />
          </Field>
          <p className="-mt-2 mb-3 text-xs text-muted-foreground">
            سيبها فاضية لو القماش طلع زي المخطّط بالظبط. الرقم اللي هنا هو اللي بيخرج من المخزن.
          </p>

          <Field label="قطع الباندل">
            <Input value={perBundle} onChange={(e) => setPerBundle(e.target.value)} inputMode="numeric" />
          </Field>
          <p className="-mt-2 mb-3 text-xs text-muted-foreground">
            هيطلع {qty(plan.length, 0)} باندل. المقاسات مابتتخلطش في باندل واحد، والباقي بياخد تيكت لوحده.
          </p>

          <Field label="القصّاص (اختياري)">
            <select className={selectClass} value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
              <option value="">بدون تسجيل عامل</option>
              {db.workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
          <p className="text-xs text-muted-foreground">
            لو العامل بالقطعة، أجره بيتسجّل تلقائيًا على قطع الفرشة.
          </p>
        </>
      ) : null}
    </Panel>
  );
}

/* ── الباندلات ──────────────────────────────────────────────────── */

function Bundles() {
  const { db } = useFactory();
  const [q, setQ] = useState("");
  const rows = useMemo(() => (db.bundles ?? []).map((b) => bundleState(db, b)), [db]);
  const shown = rows.filter((r) => !q.trim() || r.bundle.code.includes(q.trim()) || r.orderCode.includes(q.trim()));

  if (!rows.length) {
    return (
      <EmptyState
        icon={Scissors}
        title="مفيش باندلات لسه"
        body="الباندلات بتطلع لوحدها أول ما تقص فرشة. كل باندل بياخد رقم وتيكت، وبيتتبّع من عملية لعملية."
      />
    );
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base">الباندلات ({qty(rows.length, 0)})</h3>
        <div className="flex items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر برقم الباندل" className="w-48" />
          <ExportMenu module="production" dataset={() => datasetOf(db, "bundles")} compact />
        </div>
      </div>
      <div className="space-y-2">
        {shown.map((r) => (
          <div key={r.bundle.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 p-3">
            <div className="min-w-0">
              <p className="latin font-medium">{r.bundle.code}</p>
              <p className="text-sm text-muted-foreground">
                {r.orderCode} · مقاس {r.bundle.size}
                {r.bundle.color ? ` · ${r.bundle.color}` : ""} · {qty(r.bundle.qty, 0)} قطعة
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={r.done ? "ok" : r.active?.state === "paused" ? "warn" : r.active ? "gold" : "muted"}>
                {r.label}
              </Badge>
              {r.totalSteps ? (
                <span className="text-xs text-muted-foreground tabular">
                  {qty(r.doneSteps, 0)}/{qty(r.totalSteps, 0)} عملية
                </span>
              ) : null}
              <DocumentButton type="bundle" refId={r.bundle.id} variant="outline" size="sm" label="تيكت" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ── حاسبة الرول ────────────────────────────────────────────────── */

function RollCalculator() {
  const [roll, setRoll] = useState("100");
  const [marker, setMarker] = useState("12.6");
  const [end, setEnd] = useState("0.3");
  const [per, setPer] = useState("8");

  const plan = rollPlan(Number(roll) || 0, Number(marker) || 0, Number(end) || 0, Number(per) || 0);

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <Calculator className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-base">الرول ده يطلع كام قطعة؟</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        الحساب مش «طول الرول ÷ متر القطعة»: الفرشة بتتفرش طبقات كاملة، فالرول بيطلع عدد صحيح من الطبقات، وأي باقي أقل من
        طبقة بيتحوّل بواقي.
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="طول الرول (متر)">
          <Input value={roll} onChange={(e) => setRoll(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="طول الماركر">
          <Input value={marker} onChange={(e) => setMarker(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="فاقد الأطراف">
          <Input value={end} onChange={(e) => setEnd(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="قطع في الطبقة">
          <Input value={per} onChange={(e) => setPer(e.target.value)} inputMode="numeric" />
        </Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="طبقات كاملة" value={qty(plan.plies, 0)} hint={`الطبقة ${qty(plan.plyLengthM, 2)} متر`} />
        <Metric label="القطع" value={qty(plan.pieces, 0)} />
        <Metric label="البواقي" value={`${qty(plan.leftoverM, 2)} متر`} hint={`${qty(plan.leftoverPct, 1)}٪ من الرول`} />
        <Metric
          label="المتر للقطعة"
          value={plan.pieces ? qty((plan.rollM - plan.leftoverM) / plan.pieces, 3) : "—"}
        />
      </div>
    </Card>
  );
}
