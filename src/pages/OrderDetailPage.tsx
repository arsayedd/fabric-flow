import { useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { Money } from "@/components/Money";
import { Badge, STATUS } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, DataRow } from "@/components/ui/card";
import { Input, selectClass } from "@/components/ui/input";
import { cairoToday, formatDate, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { bottleneck, orderCost, orderRequirements, orderStages, productById } from "@/store/manufacturing";

export function OrderDetailPage() {
  const { id = "" } = useParams();
  const { db, can, issueOrderMaterials, addStageEntry } = useFactory();
  const order = db.orders.find((o) => o.id === id);
  const [operationId, setOperationId] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [good, setGood] = useState("");
  const [scrap, setScrap] = useState("");

  if (!order) return <p className="text-sm text-muted-foreground">أمر الإنتاج مش موجود.</p>;

  const product = productById(db, order.productId);
  const client = db.clients.find((c) => c.id === order.clientId);
  const status = STATUS[order.status];
  const reqs = orderRequirements(db, order);
  const stages = orderStages(db, order);
  const cost = can.finance ? orderCost(db, order) : null;
  const neck = bottleneck(db, order);
  const pendingIssue = reqs.filter((r) => r.remaining > 0.0001);
  const shortages = reqs.filter((r) => r.shortage > 0.0001);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">
            أمر إنتاج <span className="latin tabular">#{order.code}</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            {order.model} · دفعة {order.quantity} · {order.line}
          </p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <Card>
        <dl className="divide-y divide-border/60">
          <DataRow label="المنتج">{product ? product.name : `${order.model} (مش مربوط بمنتج)`}</DataRow>
          <DataRow label="العميل">{client?.name ?? "مخزون المصنع"}</DataRow>
          <DataRow label="ميعاد التسليم">{formatDate(order.dueDate)}</DataRow>
          <DataRow label="نسبة الإنجاز">
            <span className="tabular">{order.progress}%</span>
          </DataRow>
        </dl>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${order.status === "stopped" ? "bg-danger" : order.status === "late" ? "bg-warn" : order.status === "done" ? "bg-ok" : "bg-accent"}`}
            style={{ width: `${Math.min(100, Math.max(0, order.progress))}%` }}
          />
        </div>
      </Card>

      {neck ? (
        <Card className="border-warn/30 bg-warn-soft/40">
          <p className="text-sm">
            الشغل واقف عند <span className="font-medium">{neck.name}</span> — المرحلة اللي قبلها خلّصت أكتر منها. لو
            عايز تلحق الميعاد، زوّد عمالة على المرحلة دي.
          </p>
        </Card>
      ) : null}

      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-base">الخامات المطلوبة</h3>
          {can.edit && pendingIssue.length ? (
            <Button
              size="sm"
              onClick={() => {
                try {
                  issueOrderMaterials(order.id);
                  toast.success("الخامات اتصرفت واتخصمت من المخزن.");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "مش قادر أصرف الخامات.");
                }
              }}
            >
              اصرف الخامات
            </Button>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {reqs.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              الأمر ده مش مربوط بمنتج له قائمة خامات، فمفيش احتياج محسوب.
            </p>
          ) : (
            reqs.map((r) => (
              <div key={r.materialId} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0">
                <div className="min-w-0">
                  <p className="truncate">{r.name}</p>
                  <p className="text-sm text-muted-foreground tabular">
                    مطلوب {qty(r.required)} {r.unit} · اتصرف {qty(r.issued)}
                  </p>
                </div>
                <div className="shrink-0 text-left">
                  {r.shortage > 0.0001 ? (
                    <Badge tone="danger">ناقص {qty(r.shortage)}</Badge>
                  ) : r.remaining > 0.0001 ? (
                    <Badge tone="gold">جاهز للصرف</Badge>
                  ) : (
                    <Badge tone="ok">اتصرف بالكامل</Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        {shortages.length ? (
          <p className="mt-2 text-sm text-danger">
            مفيش رصيد كافي من: {shortages.map((s) => s.name).join("، ")}. اشتري الأول أو عدّل الكمية.
          </p>
        ) : null}
      </section>

      <section>
        <h3 className="mb-2 text-base">المراحل</h3>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {stages.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              مفيش مراحل مسجّلة. اربط الأمر بمنتج له مسار عمليات، أو سجّل الإنتاج اليومي من تحت.
            </p>
          ) : (
            stages.map((s) => (
              <div key={s.operationId} className="border-b border-border px-4 py-3 last:border-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p>{s.name}</p>
                  <p className="tabular text-sm text-muted-foreground">
                    {qty(s.good, 0)} من {qty(order.quantity, 0)}
                    {s.scrap ? ` · تالف ${qty(s.scrap, 0)}` : ""}
                  </p>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${s.pct}%` }} />
                </div>
              </div>
            ))
          )}
        </div>

        {can.edit ? (
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_6rem_6rem_auto]">
            <select className={selectClass} value={operationId} onChange={(e) => setOperationId(e.target.value)}>
              <option value="">العملية</option>
              {(stages.length ? stages.map((s) => ({ id: s.operationId, name: s.name })) : db.operations.map((o) => ({ id: o.id, name: o.name }))).map(
                (o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ),
              )}
            </select>
            <select className={selectClass} value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
              <option value="">بدون عامل</option>
              {db.workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <Input inputMode="numeric" placeholder="سليم" value={good} onChange={(e) => setGood(e.target.value)} />
            <Input inputMode="numeric" placeholder="تالف" value={scrap} onChange={(e) => setScrap(e.target.value)} />
            <Button
              onClick={() => {
                try {
                  const stage = stages.find((s) => s.operationId === operationId);
                  addStageEntry({
                    orderId: order.id,
                    operationId,
                    date: cairoToday(),
                    workerId: workerId || null,
                    qtyGood: Number(good) || 0,
                    qtyRework: 0,
                    qtyScrap: Number(scrap) || 0,
                    rate: stage?.rate ?? db.operations.find((o) => o.id === operationId)?.defaultRate ?? 0,
                  });
                  setGood("");
                  setScrap("");
                  toast.success("الإنتاج اتسجل ونسبة الإنجاز اتحدّثت.");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "مش قادر أسجل الإنتاج.");
                }
              }}
            >
              سجّل
            </Button>
          </div>
        ) : null}
      </section>

      {cost ? (
        <section>
          <h3 className="mb-2 text-base">التكلفة: المتوقع مقابل الفعلي</h3>
          <Card>
            <div className="grid grid-cols-3 gap-2 border-b pb-2 text-sm text-muted-foreground">
              <span>البند</span>
              <span className="text-left">متوقع</span>
              <span className="text-left">فعلي</span>
            </div>
            <CostRow label="خامات" est={cost.estMaterials} act={cost.actMaterials} />
            <CostRow label="أجور" est={cost.estLabor} act={cost.actLabor} />
            <CostRow label="أوفرهيد" est={cost.estOverhead} act={cost.actOverhead} />
            <div className="grid grid-cols-3 gap-2 border-t pt-2">
              <span className="font-medium">الإجمالي</span>
              <Money value={cost.estTotal} className="text-left" />
              <Money value={cost.actTotal} className="text-left" />
            </div>
            <dl className="mt-3 divide-y divide-border/60">
              <DataRow label="قيمة الأمر">
                <Money value={cost.revenue} />
              </DataRow>
              <DataRow label="الفرق عن المتوقع">
                <Money value={-cost.variance} signed />
              </DataRow>
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              الفعلي بيحسب الخامات اللي اتصرفت فعلًا والأجور المسجّلة على المراحل — مش تقديرات.
            </p>
          </Card>
        </section>
      ) : null}
    </div>
  );
}

function CostRow({ label, est, act }: { label: string; est: number; act: number }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5">
      <span className="text-sm">{label}</span>
      <Money value={est} className="text-left" />
      <span className={`text-left ${act > est ? "text-danger" : ""}`}>
        <Money value={act} />
      </span>
    </div>
  );
}
