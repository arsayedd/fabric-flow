import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Boxes } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Field, Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cairoToday, formatDate, money, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { batchMovements, batchView, recallList } from "@/store/supply";
import {
  BATCH_STATUS_LABEL,
  RECALL_SEVERITIES,
  RECALL_SEVERITY_LABEL,
  STOCK_KIND_LABEL,
  type BatchStatus,
  type RecallSeverity,
} from "@/store/types";

/**
 * الدفعة.
 *
 * الشاشة دي هي هوية الخامة: جات من مين وامتى وبكام، وراحت فين بالظبط.
 * ومن غيرها، «الخامة دي فيها مشكلة» بلاغ بلا عنوان — بتسحب المنتجات كلها
 * أو مافيش.
 *
 * والحركات معروضة كدفتر: كل سطر بيقول الكمية وجهتها والأمر اللي خدها،
 * والرصيد محسوب منها مش مكتوب في خانة.
 */

const SELECTABLE: BatchStatus[] = ["active", "hold", "blocked"];

export function BatchPage() {
  const { id = "" } = useParams();
  const { db, can, setBatchStatus } = useFactory();
  const [recalling, setRecalling] = useState(false);

  const batch = (db.batches ?? []).find((b) => b.id === id);
  const v = useMemo(() => (batch ? batchView(db, batch) : null), [db, batch]);
  const moves = useMemo(() => (batch ? batchMovements(db, batch.id) : []), [db, batch]);
  const recalls = useMemo(
    () => (batch ? recallList(db).filter((r) => r.recall.batchId === batch.id) : []),
    [db, batch],
  );

  if (!can.do("inventory", "view")) {
    return (
      <EmptyState
        icon={Boxes}
        title="الدفعات محتاجة صلاحية المخزون"
        body="الدفعة فيها سعر التوريد ومورّده، فمابتتفتحش بدون صلاحية."
      />
    );
  }

  if (!batch || !v) {
    return (
      <EmptyState
        icon={Boxes}
        title="الدفعة دي مش موجودة"
        body="يمكن الكود من نسخة قديمة أو الدفعة اتشالت. ارجع لقايمة الدفعات."
        action={{ label: "الدفعات", onClick: () => window.location.assign("/supply?tab=batches") }}
      />
    );
  }

  const orders = [
    ...new Set(moves.filter((m) => m.refType === "order" && m.refId).map((m) => m.refId as string)),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="latin text-sm text-muted-foreground">{batch.code}</span>
            <Badge tone={batch.status === "active" ? (v.expired ? "danger" : "ok") : "danger"}>
              {v.expired ? "منتهية" : BATCH_STATUS_LABEL[batch.status]}
            </Badge>
          </div>
          <h2 className="mt-1 text-2xl">{v.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {v.partyName ? `${v.partyName} · ` : ""}
            استلمناها {formatDate(batch.receivedDate)}
            {batch.supplierLot ? ` · لوط المورّد ${batch.supplierLot}` : ""}
          </p>
          {batch.expiryDate ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              تنتهي {formatDate(batch.expiryDate)}
              {v.daysToExpiry !== null
                ? v.daysToExpiry >= 0
                  ? ` · فاضل ${qty(v.daysToExpiry, 0)} يوم`
                  : ` · فاتت بـ${qty(Math.abs(v.daysToExpiry), 0)} يوم`
                : ""}
            </p>
          ) : null}
          {batch.notes ? <p className="mt-0.5 text-xs text-muted-foreground">{batch.notes}</p> : null}
        </div>
        {can.do("quality", "create") && batch.status !== "recalled" ? (
          <Button variant="danger" className="shrink-0" onClick={() => setRecalling(true)}>
            افتح استدعاء
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-muted-foreground">دخل</p>
          <p className="mt-1 text-2xl tabular">
            {qty(v.qtyIn, 2)} {v.unit}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{money(batch.unitCost)} للوحدة</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">اتصرف</p>
          <p className="mt-1 text-2xl tabular">{qty(v.consumed, 2)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {v.orderCount > 0 ? `في ${qty(v.orderCount, 0)} أمر إنتاج` : "لسه مانزلش إنتاج"}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">الباقي</p>
          <p className="mt-1 text-2xl tabular">{qty(v.remaining, 2)}</p>
          <p className="mt-1 text-xs text-muted-foreground">محسوب من الحركات، مش مكتوب</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">قيمة الباقي</p>
          <Money className="mt-1 text-2xl" value={v.value} />
          <p className="mt-1 text-xs text-muted-foreground">بتكلفة الدفعة دي، مش بمتوسط الخامة</p>
        </Card>
      </div>

      {recalls.length ? (
        <Card className="border-danger/40">
          <p className="text-sm">استدعاءات على الدفعة دي</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {recalls.map((r) => (
              <li key={r.recall.id}>
                <Link className="underline" to={`/supply/recall/${r.recall.id}`}>
                  <span className="latin">{r.recall.code}</span>
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  — {r.recall.reason} · {RECALL_SEVERITY_LABEL[r.recall.severity]}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <p className="text-sm">الدفعة راحت فين</p>
        {orders.length ? (
          <ul className="mt-2 space-y-1.5 text-sm">
            {orders.map((oid) => {
              const order = db.orders.find((o) => o.id === oid);
              const used = moves
                .filter((m) => m.refId === oid && m.qty < 0)
                .reduce((s, m) => s + Math.abs(m.qty), 0);
              return (
                <li key={oid}>
                  <Link className="underline" to={`/trace/order/${oid}`}>
                    <span className="latin">{order?.code ?? oid}</span> — {order?.model ?? "أمر"}
                  </Link>
                  <span className="text-muted-foreground">
                    {" "}
                    · {qty(used, 2)} {v.unit}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            لسه مانزلتش أي أمر إنتاج. كلها في المخزن، ولو فيها مشكلة السحب بسيط.
          </p>
        )}
      </Card>

      <Card>
        <p className="text-sm">دفتر حركات الدفعة</p>
        <ul className="mt-2 space-y-2">
          {moves
            .slice()
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span>
                  {STOCK_KIND_LABEL[m.kind]}
                  {m.notes ? <span className="text-muted-foreground"> · {m.notes}</span> : null}
                </span>
                <span className="shrink-0 tabular text-muted-foreground">
                  {qty(m.qty, 2)} · {formatDate(m.date)}
                </span>
              </li>
            ))}
        </ul>
      </Card>

      {can.do("inventory", "edit") && batch.status !== "recalled" ? (
        <Card>
          <p className="text-sm">حالة الدفعة</p>
          <p className="mt-1 text-xs text-muted-foreground">
            الموقوفة مابتنزلش إنتاج جديد: الصرف بيرفض لو الرصيد المتاح مش كفاية بدون الموقوف.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SELECTABLE.map((st) => (
              <Button
                key={st}
                variant={batch.status === st ? "gold" : "outline"}
                onClick={() => {
                  try {
                    setBatchStatus(batch.id, st, "");
                    toast.success("حالة الدفعة اتحدّثت.");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "مانفعش نحدّث الحالة.");
                  }
                }}
              >
                {BATCH_STATUS_LABEL[st]}
              </Button>
            ))}
          </div>
        </Card>
      ) : null}

      {recalling ? <RecallPanel batchId={batch.id} onClose={() => setRecalling(false)} /> : null}
    </div>
  );
}

function RecallPanel({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const { db, openRecall } = useFactory();
  const [date, setDate] = useState(cairoToday());
  const [reason, setReason] = useState("");
  const [severity, setSeverity] = useState<RecallSeverity>("high");
  const [ownerId, setOwnerId] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <Panel open title="افتح استدعاء" onClose={onClose}>
      <p className="mb-3 text-xs text-muted-foreground">
        فتح الاستدعاء بيوقف الدفعة فورًا: اللي فاضل منها مش هينزل إنتاج جديد. توسيع المشكلة وإحنا بنحقق فيها أغلى من
        وقفة يوم.
      </p>
      <Field label="تاريخ البلاغ">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="سبب الاستدعاء (مطلوب)">
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="اللون بيبهت بعد أول غسلة — شكوى من عميلين"
        />
      </Field>
      <Field label="الخطورة">
        <select
          className="h-11 w-full rounded-md border border-border bg-card px-3 text-base"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as RecallSeverity)}
        >
          {RECALL_SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {RECALL_SEVERITY_LABEL[s]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="المسؤول عن السحب">
        <select
          className="h-11 w-full rounded-md border border-border bg-card px-3 text-base"
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
        >
          <option value="">بدون مسؤول</option>
          {db.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="ملاحظات">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>
      <Button
        variant="danger"
        className="w-full"
        onClick={() => {
          try {
            openRecall({ batchId, date, reason, severity, ownerId: ownerId || null, notes });
            toast.success("الاستدعاء اتفتح والدفعة اتوقفت.");
            onClose();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "مانفعش نفتح الاستدعاء.");
          }
        }}
      >
        افتح الاستدعاء
      </Button>
    </Panel>
  );
}
