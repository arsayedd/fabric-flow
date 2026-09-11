import { useState } from "react";
import { Factory } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Field, Panel } from "@/components/Panel";
import { Badge, STATUS } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, DataRow } from "@/components/ui/card";
import { Input, selectClass } from "@/components/ui/input";
import { cairoToday, formatDate } from "@/lib/utils";
import { useFactory } from "@/store/context";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  PRODUCTION_LINES,
  type OrderStatus,
} from "@/store/types";

const FILTERS: { id: "all" | OrderStatus; label: string }[] = [
  { id: "all", label: "الكل" },
  { id: "running", label: "قيد التنفيذ" },
  { id: "late", label: "متأخر" },
  { id: "stopped", label: "متوقف" },
  { id: "done", label: "مكتمل" },
];

export function OrdersPage() {
  const { computed, db, can, addOrder, updateOrder, deleteOrder } = useFactory();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | OrderStatus>("all");

  const orders = computed.orders.filter((o) => filter === "all" || o.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">أوامر الإنتاج</h2>
          <p className="text-sm text-muted-foreground">كل أمر بخط إنتاجه ونسبة إنجازه وتكلفة القطعة.</p>
        </div>
        {can.edit ? <Button onClick={() => setOpen(true)}>أمر إنتاج</Button> : null}
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
              filter === f.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={Factory}
          title={filter === "all" ? "مفيش أوامر إنتاج" : "مفيش أوامر في الحالة دي"}
          body="سجّل الموديل وخط الإنتاج والكمية، والسيستم يرقّم الأمر ويحسب ربحه."
          action={can.edit && filter === "all" ? { label: "أمر إنتاج جديد", onClick: () => setOpen(true) } : undefined}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {orders.map((o) => {
            const client = db.clients.find((c) => c.id === o.clientId);
            const status = STATUS[o.status];
            return (
              <Card key={o.id}>
                <div className="flex items-center justify-between gap-3 border-b pb-3">
                  <h3 className="text-base">
                    أمر إنتاج <span className="latin tabular">#{o.code}</span>
                  </h3>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>
                <dl className="mt-1 divide-y divide-border/60">
                  <DataRow label="المنتج">
                    {o.model} — دفعة {o.quantity} قطعة
                  </DataRow>
                  <DataRow label="خط الإنتاج">{o.line}</DataRow>
                  <DataRow label="نسبة الإنجاز">
                    <span className="tabular">{o.progress}%</span>
                  </DataRow>
                  <DataRow label="ميعاد التسليم">{formatDate(o.dueDate)}</DataRow>
                  <DataRow label="العميل">{client?.name ?? "مخزون المصنع"}</DataRow>
                  <DataRow label="ربح الأمر">
                    <Money value={o.profitTotal} signed />
                  </DataRow>
                </dl>

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${o.status === "stopped" ? "bg-danger" : o.status === "late" ? "bg-warn" : o.status === "done" ? "bg-ok" : "bg-accent"}`}
                    style={{ width: `${Math.min(100, Math.max(0, o.progress))}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  تكلفة القطعة {Math.round(o.pieceCost)} · بيع {Math.round(o.piecePrice)} · هامش {Math.round(o.margin)}٪
                </p>

                {can.edit ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={o.status}
                      onChange={(e) => updateOrder(o.id, { status: e.target.value as OrderStatus })}
                    >
                      {ORDER_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {ORDER_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={o.progress}
                      onChange={(e) => updateOrder(o.id, { progress: Math.min(100, Math.max(0, Number(e.target.value))) })}
                      className="h-9 w-20 rounded-md border border-input bg-background px-2 text-sm"
                      aria-label="نسبة الإنجاز"
                    />
                    {can.delete ? (
                      <Button size="sm" variant="danger" onClick={() => deleteOrder(o.id)}>
                        مسح
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <OrderForm open={open} onClose={() => setOpen(false)} onSave={addOrder} />
    </div>
  );
}

function OrderForm({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (row: {
    clientId: string | null;
    model: string;
    line: string;
    quantity: number;
    progress: number;
    pieceCost: number;
    piecePrice: number;
    dueDate: string;
    status: OrderStatus;
    notes: string;
  }) => void;
}) {
  const { db, can } = useFactory();
  const [model, setModel] = useState("");
  const [line, setLine] = useState<string>(PRODUCTION_LINES[0]);
  const [clientId, setClientId] = useState(db.clients[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [pieceCost, setPieceCost] = useState("");
  const [piecePrice, setPiecePrice] = useState("");
  const [dueDate, setDueDate] = useState(cairoToday());

  return (
    <Panel
      open={open}
      title="أمر إنتاج جديد"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => {
              if (!model.trim()) return toast.error("المنتج مطلوب");
              onSave({
                clientId: can.finance ? clientId || null : null,
                model: model.trim(),
                line,
                quantity: Number(quantity) || 0,
                progress: 0,
                pieceCost: Number(pieceCost) || 0,
                piecePrice: Number(piecePrice) || 0,
                dueDate,
                status: "running",
                notes: "",
              });
              toast.success("أمر الإنتاج اتسجل وانخد رقمه.");
              setModel("");
              setQuantity("");
              onClose();
            }}
          >
            حفظ أمر الإنتاج
          </Button>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      }
    >
      <Field label="المنتج">
        <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="قميص قطني" />
      </Field>
      <Field label="خط الإنتاج">
        <select className={selectClass} value={line} onChange={(e) => setLine(e.target.value)}>
          {PRODUCTION_LINES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      {can.finance ? (
        <Field label="العميل">
          <select className={selectClass} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">مخزون المصنع</option>
            {db.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="الكمية (قطعة)">
        <Input inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </Field>
      <Field label="تكلفة القطعة">
        <Input inputMode="numeric" value={pieceCost} onChange={(e) => setPieceCost(e.target.value)} />
      </Field>
      <Field label="سعر بيع القطعة">
        <Input inputMode="numeric" value={piecePrice} onChange={(e) => setPiecePrice(e.target.value)} />
      </Field>
      <Field label="ميعاد التسليم">
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </Field>
    </Panel>
  );
}
