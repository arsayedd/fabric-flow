import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Field, Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { recallScope } from "@/store/supply";
import { RECALL_SEVERITY_LABEL, RECALL_STATUS_LABEL, type RecallSeverity } from "@/store/types";

/**
 * الاستدعاء.
 *
 * الشاشة دي بتجاوب على سؤال واحد ومالهاش وظيفة تانية: **المشكلة وصلت
 * لمين؟** والإجابة سلسلة محسوبة من الدفتر — الدفعة، فحركات صرفها، فأوامر
 * الإنتاج، فالتوريدات، فالعملاء.
 *
 * وأهم رقمين في الشاشة هما **اللي رجع** و**اللي لسه عند العميل**، لأن
 * التاني هو اللي بيقول الاستدعاء خلص ولا لسه.
 */

const TONE: Record<RecallSeverity, "warn" | "danger"> = {
  low: "warn",
  high: "danger",
  critical: "danger",
};

export function RecallPage() {
  const { id = "" } = useParams();
  const { db, can, setRecallStatus, cancelRecall } = useFactory();
  const [cancelling, setCancelling] = useState(false);

  const row = (db.recalls ?? []).find((r) => r.id === id);
  const scope = useMemo(() => (row ? recallScope(db, row) : null), [db, row]);

  if (!can.do("quality", "view")) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="الاستدعاء محتاج صلاحية الجودة"
        body="الشاشة دي بتعرض العملاء المتأثرين وقيمة اللي خرج، فمابتتفتحش بدون صلاحية."
      />
    );
  }

  if (!row || !scope) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="الاستدعاء ده مش موجود"
        body="يمكن اتلغى أو الرابط قديم. ارجع لقايمة الدفعات وافتح الاستدعاء من هناك."
        action={{ label: "الدفعات", onClick: () => window.location.assign("/supply?tab=batches") }}
      />
    );
  }

  const editable = row.status === "open" || row.status === "contained";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="latin text-sm text-muted-foreground">{row.code}</span>
            <Badge tone={TONE[row.severity]}>{RECALL_SEVERITY_LABEL[row.severity]}</Badge>
            <Badge tone={row.status === "closed" ? "ok" : row.status === "cancelled" ? "muted" : "warn"}>
              {RECALL_STATUS_LABEL[row.status]}
            </Badge>
          </div>
          <h2 className="mt-1 text-2xl">استدعاء {scope.batch?.name ?? "دفعة"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{row.reason}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            اتفتح {formatDate(row.date)}
            {scope.batch
              ? ` · ${scope.batch.batch.code}${scope.batch.batch.supplierLot ? ` · لوط ${scope.batch.batch.supplierLot}` : ""}${
                  scope.batch.partyName ? ` · ${scope.batch.partyName}` : ""
                }`
              : ""}
          </p>
        </div>
        {editable && can.do("quality", "edit") ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {row.status === "open" ? (
              <Button
                variant="outline"
                onClick={() => {
                  try {
                    setRecallStatus(row.id, "contained");
                    toast.success("الاستدعاء اتسجّل متحاصر.");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "مانفعش نحدّث الحالة.");
                  }
                }}
              >
                اتحاصر
              </Button>
            ) : null}
            <Button
              variant="gold"
              onClick={() => {
                try {
                  setRecallStatus(row.id, "closed");
                  toast.success("الاستدعاء اتقفل.");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "مانفعش نقفل الاستدعاء.");
                }
              }}
            >
              اقفله
            </Button>
            <Button variant="dangerGhost" onClick={() => setCancelling(true)}>
              إلغاء
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-muted-foreground">لسه في المخزن</p>
          <p className="mt-1 text-2xl tabular">
            {qty(scope.inStock, 2)} {scope.batch?.unit ?? ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {scope.inStock > 0 ? "اتوقفت — مش هتنزل إنتاج جديد" : "خلصت كلها في الإنتاج"}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">خرج للعملاء</p>
          <p className="mt-1 text-2xl tabular">{qty(scope.exposedQty, 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {scope.customers > 0 ? `${qty(scope.customers, 0)} عميل · ` : ""}
            بقيمة <Money value={scope.exposedValue} />
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">رجع</p>
          <p className="mt-1 text-2xl tabular">{qty(scope.returnedQty, 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {scope.containedPct === null ? "مافيش حاجة خرجت" : `${qty(scope.containedPct, 0)}٪ من اللي خرج`}
          </p>
        </Card>
        <Card className={scope.outstandingQty > 0 ? "border-danger/40" : ""}>
          <p className="text-sm text-muted-foreground">لسه عند العملاء</p>
          <p className="mt-1 text-2xl tabular">{qty(scope.outstandingQty, 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {scope.outstandingQty > 0 ? "دي اللي الاستدعاء لسه شغّال عشانها" : "مافيش حاجة برّه"}
          </p>
        </Card>
      </div>

      {/* الحالة اللي كل استدعاء بيتمنّاها: المشكلة لسه جوه */}
      {scope.exposedQty === 0 && scope.orders.length > 0 ? (
        <Card className="border-gold/40">
          <p className="text-sm">المشكلة لسه جوه المصنع.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            الدفعة نزلت {qty(scope.orders.length, 0)} أمر إنتاج، وما خرجتش ولا قطعة لعميل من الأوامر دي. السحب لسه ممكن
            بالكامل قبل ما يوصل حد.
          </p>
        </Card>
      ) : null}

      <Card>
        <p className="text-sm">السلسلة: الدفعة نزلت فين</p>
        <p className="mt-1 text-xs text-muted-foreground">
          الأرقام دي مدى تعرّض مش إدانة. القطعة اللي خرجت من أمر استخدم الدفعة مش بالضرورة فيها العيب — بس هي اللي لازم
          تتراجع.
        </p>
        {scope.orders.length ? (
          <ul className="mt-3 space-y-3">
            {scope.orders.map((o) => (
              <li key={o.orderId} className="border-t border-border pt-3 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <Link className="underline" to={`/orders/${o.orderId}`}>
                    <span className="latin">{o.orderCode}</span> — {o.model}
                  </Link>
                  <span className="shrink-0 tabular text-muted-foreground">
                    {qty(o.batchQty, 2)} من الدفعة
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {o.clientName ? (
                    <Link className="underline" to={`/parties/${o.clientId}`}>
                      {o.clientName}
                    </Link>
                  ) : (
                    "بدون عميل"
                  )}
                  {o.produced > 0 ? ` · اتنتج ${qty(o.produced, 0)} قطعة` : ""}
                  {o.deliveredQty > 0 ? ` · اتسلّم ${qty(o.deliveredQty, 0)}` : " · مااتسلّمش لسه"}
                </p>
                {o.deliveredQty > 0 ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    رجع {qty(o.returnedQty, 0)} · لسه عنده {qty(o.outstandingQty, 0)} بقيمة{" "}
                    <Money value={o.deliveredValue} />
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            الدفعة دي مانزلتش أي أمر إنتاج لحد دلوقتي — كلها لسه في المخزن، والسحب بسيط.
          </p>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm">تكلفة الاستدعاء لحد دلوقتي</p>
          <Money className="text-xl" value={scope.recallCost} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {scope.recallCost > 0
            ? "مجموع تسويات المرتجعات المربوطة بالاستدعاء وبنود تكلفتها."
            : "لسه مافيش مرتجع متسجّل على الاستدعاء ده، فالتكلفة صفر لحد دلوقتي — مش معناها إنها هتفضل صفر."}
        </p>
        <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
          اللي بيرجع من الاستدعاء بيتسجّل في دفتر المرتجعات وبيتربط بيه، مش في جدول تاني — عشان تكلفته تمشي في نفس
          الحسابات.
        </p>
        <div className="mt-2">
          <Link className="text-sm underline" to="/returns?new=1">
            سجّل مرتجع
          </Link>
        </div>
      </Card>

      {cancelling ? (
        <Panel open title={`إلغاء ${row.code}`} onClose={() => setCancelling(false)}>
          <p className="mb-3 text-sm text-muted-foreground">
            الإلغاء معناه إن البلاغ طلع غلط. الدفعة هترجع متاحة للصرف، إلا لو عليها استدعاء تاني شغّال.
          </p>
          <CancelBody id={row.id} onDone={() => setCancelling(false)} cancel={cancelRecall} />
        </Panel>
      ) : null}
    </div>
  );
}

function CancelBody({
  id,
  onDone,
  cancel,
}: {
  id: string;
  onDone: () => void;
  cancel: (id: string, reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <>
      <Field label="سبب الإلغاء (مطلوب)">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
      </Field>
      <Button
        variant="danger"
        className="w-full"
        onClick={() => {
          try {
            cancel(id, reason);
            toast.success("الاستدعاء اتلغى والدفعة رجعت متاحة.");
            onDone();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "مانفعش نلغي الاستدعاء.");
          }
        }}
      >
        ألغِ الاستدعاء
      </Button>
    </>
  );
}
