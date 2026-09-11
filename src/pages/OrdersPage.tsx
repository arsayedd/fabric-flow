import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Factory } from "lucide-react";
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
import { ExportMenu } from "@/components/export/ExportMenu";
import { datasetOf } from "@/store/datasets";
import { customers, partyById } from "@/store/parties";
import { productCost } from "@/store/manufacturing";
import { TEMPLATES } from "@/store/templates";
import { ORDER_STATUSES, ORDER_STATUS_LABEL, type OrderStatus } from "@/store/types";

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
        <div className="flex gap-2">
          <ExportMenu
            module="production"
            dataset={() =>
              datasetOf(db, "orders", {
                ids: new Set(orders.map((o) => o.id)),
                filters: [{ label: "الحالة", value: FILTERS.find((f) => f.id === filter)?.label ?? "الكل" }],
              })
            }
          />
          {can.edit ? <Button onClick={() => setOpen(true)}>أمر إنتاج</Button> : null}
        </div>
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
            const client = partyById(db, o.clientId);
            const status = STATUS[o.status];
            return (
              <Card key={o.id}>
                <div className="flex items-center justify-between gap-3 border-b pb-3">
                  <Link to={`/orders/${o.id}`} className="text-base hover:text-accent">
                    أمر إنتاج <span className="latin tabular">#{o.code}</span>
                  </Link>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>
                <dl className="mt-1 divide-y divide-border/60">
                  <DataRow label="المنتج">
                    {o.model} — دفعة {o.quantity}
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

                <div className="mt-3">
                  <Link
                    to={`/orders/${o.id}`}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-accent"
                  >
                    الخامات والمراحل والتكلفة الفعلية
                    <ChevronLeft className="h-4 w-4" />
                  </Link>
                </div>

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
                      <Button size="sm" variant="dangerGhost" onClick={() => deleteOrder(o.id)}>
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
    productId: string | null;
    bomId: string | null;
    materialsIssuedAt: string | null;
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
  const lines = TEMPLATES[db.settings.industry].lines;
  const [productId, setProductId] = useState("");
  const [model, setModel] = useState("");
  const [line, setLine] = useState<string>(lines[0]);
  const [clientId, setClientId] = useState(customers(db)[0]?.id ?? "");
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
                productId: productId || null,
                bomId: null,
                materialsIssuedAt: null,
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
      {db.products.length ? (
        <Field label="اختَر منتج مسجّل">
          <select
            className={selectClass}
            value={productId}
            onChange={(e) => {
              const id = e.target.value;
              setProductId(id);
              const p = db.products.find((x) => x.id === id);
              if (!p) return;
              const c = productCost(db, p.id);
              setModel(p.name);
              setPieceCost(String(Math.round(c.total)));
              setPiecePrice(String(p.sellPrice));
            }}
          >
            <option value="">من غير منتج — أكتب الاسم بإيدي</option>
            {db.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {productId ? (
            <p className="mt-1 text-xs text-muted-foreground">
              التكلفة اتحسبت من قائمة الخامات والعمليات. تقدر تعدّلها لو الأمر ده مختلف.
            </p>
          ) : null}
        </Field>
      ) : null}
      <Field label="المنتج">
        <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="اسم المنتج" />
      </Field>
      <Field label="خط الإنتاج">
        <select className={selectClass} value={line} onChange={(e) => setLine(e.target.value)}>
          {lines.map((l) => (
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
            {customers(db).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="الكمية">
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
