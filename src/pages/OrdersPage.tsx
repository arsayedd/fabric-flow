import { useState } from "react";
import { Shirt } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Field, Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cairoToday, formatDate } from "@/lib/utils";
import { useFactory } from "@/store/context";

export function OrdersPage() {
  const { computed, db, can, addOrder, updateOrder, deleteOrder } = useFactory();
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold">الأوردرات</h2>
          <p className="text-sm text-muted-foreground">تكلفة القطعة والربح في كل موديل.</p>
        </div>
        {can.edit ? <Button onClick={() => setOpen(true)}>أوردر</Button> : null}
      </div>
      {computed.orders.length === 0 ? (
        <EmptyState icon={Shirt} title="مفيش أوردرات" body="سجّل الموديل والكمية وتكلفة القطعة وسعر البيع." />
      ) : (
        <div className="space-y-2">
          {computed.orders.map((o) => {
            const client = db.clients.find((c) => c.id === o.clientId);
            const late = o.status !== "done" && o.dueDate < cairoToday();
            return (
              <div key={o.id} className="rounded-2xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{o.model}</p>
                    <p className="text-xs text-muted-foreground">
                      {client?.name ?? "من غير عميل"} · {o.quantity} قطعة · تسليم {formatDate(o.dueDate)}
                    </p>
                  </div>
                  {late ? <Badge tone="late">قرب ميعاده</Badge> : o.status === "done" ? <Badge tone="ok">خلص</Badge> : <Badge tone="brass">شغال</Badge>}
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                  <div>
                    <dt className="text-[11px] text-muted-foreground">تكلفة</dt>
                    <dd>
                      <Money value={o.pieceCost} className="text-sm" />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">بيع</dt>
                    <dd>
                      <Money value={o.piecePrice} className="text-sm" />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">ربح الأوردر</dt>
                    <dd>
                      <Money value={o.profitTotal} signed className="text-sm" />
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">هامش {Math.round(o.margin)}٪ على القطعة</p>
                {can.edit ? (
                  <div className="mt-3 flex gap-2">
                    {o.status !== "done" ? (
                      <Button size="sm" variant="outline" onClick={() => updateOrder(o.id, { status: "done" })}>
                        خلص
                      </Button>
                    ) : null}
                    {can.delete ? (
                      <Button size="sm" variant="danger" onClick={() => deleteOrder(o.id)}>
                        مسح
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
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
    quantity: number;
    pieceCost: number;
    piecePrice: number;
    dueDate: string;
    status: "open" | "done" | "late";
    notes: string;
  }) => void;
}) {
  const { db, can } = useFactory();
  const [model, setModel] = useState("");
  const [clientId, setClientId] = useState(db.clients[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [pieceCost, setPieceCost] = useState("");
  const [piecePrice, setPiecePrice] = useState("");
  const [dueDate, setDueDate] = useState(cairoToday());
  return (
    <Panel
      open={open}
      title="أوردر جديد"
      onClose={onClose}
      footer={
        <Button
          className="w-full"
          onClick={() => {
            if (!model.trim()) return toast.error("الموديل مطلوب");
            onSave({
              clientId: can.finance ? clientId || null : null,
              model,
              quantity: Number(quantity) || 0,
              pieceCost: Number(pieceCost) || 0,
              piecePrice: Number(piecePrice) || 0,
              dueDate,
              status: "open",
              notes: "",
            });
            toast.success("الأوردر اتسجل.");
            onClose();
          }}
        >
          حفظ
        </Button>
      }
    >
      <Field label="الموديل">
        <Input value={model} onChange={(e) => setModel(e.target.value)} />
      </Field>
      {can.finance ? (
        <Field label="العميل">
          <select className="h-11 w-full rounded-xl border bg-card px-3" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">من غير عميل</option>
            {db.clients.map((c) => (
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
