import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Field, Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cairoToday, formatDate } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { METHOD_LABEL } from "@/store/types";
import { CollectPanel } from "./CollectionsPage";

export function ClientsPage() {
  const { computed, can } = useFactory();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = computed.clients.filter((c) => c.name.includes(q) || c.phone.includes(q));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl">العملاء</h2>
          <p className="text-sm text-muted-foreground">بروفايل، كشف حساب، وآجل لكل عميل.</p>
        </div>
        {can.edit ? <Button onClick={() => setOpen(true)}>عميل جديد</Button> : null}
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="دور باسم أو رقم" />
      {list.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q ? "مفيش نتيجة" : "لسه مفيش عملاء"}
          body="أول عميل يتسجل، تقدر تضيفله توريدات وتحصيلات ويتبني كشف الحساب لوحده."
          action={can.edit && !q ? { label: "أضف عميل", onClick: () => setOpen(true) } : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {list.map((c) => (
            <Link
              key={c.id}
              to={`/clients/${c.id}`}
              className="flex items-center justify-between border-b border-border px-4 py-3 last:border-0"
            >
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-muted-foreground">{c.phone || "من غير رقم"}</p>
              </div>
              <div className="text-left">
                <Money value={c.balance} />
                <p className="text-xs text-muted-foreground">عليه</p>
              </div>
            </Link>
          ))}
        </div>
      )}
      <ClientForm open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function ClientForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addClient } = useFactory();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <Panel
      open={open}
      title="عميل جديد"
      onClose={onClose}
      footer={
        <Button
          className="w-full"
          onClick={() => {
            try {
              addClient({ name, phone, notes });
              toast.success("العميل اتضاف.");
              setName("");
              setPhone("");
              setNotes("");
              onClose();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "فشل");
            }
          }}
        >
          حفظ
        </Button>
      }
    >
      <Field label="الاسم">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="موبايل واتساب">
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="01..." />
      </Field>
      <Field label="ملاحظات">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Panel>
  );
}

export function ClientProfilePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { computed, db, can, addDelivery, deleteClient, deleteDelivery, deleteCollection } = useFactory();
  const client = computed.clients.find((c) => c.id === id);
  const [delOpen, setDelOpen] = useState(false);
  const [colOpen, setColOpen] = useState(false);

  if (!client) {
    return (
      <EmptyState icon={Users} title="العميل مش موجود" body="اتمسح أو الرابط غلط." action={{ label: "رجوع للعملاء", onClick: () => nav("/clients") }} />
    );
  }

  const overdue = computed.rec.overdue.filter((r) => r.clientId === client.id);

  return (
    <div className="space-y-4">
      <button onClick={() => nav(-1)} className="text-sm text-muted-foreground">
        → العملاء
      </button>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">{client.name}</h2>
          <p className="text-sm text-muted-foreground">{client.phone || "من غير رقم"}</p>
        </div>
        <div className="text-left">
          <p className="text-sm text-muted-foreground">الرصيد عليه</p>
          <Money value={client.balance} className="text-xl" />
        </div>
      </div>
      {overdue.length ? <Badge tone="danger">متأخر {overdue.length} توريد</Badge> : <Badge tone="ok">مفيش متأخر</Badge>}

      {can.edit ? (
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => setDelOpen(true)}>توريد</Button>
          <Button variant="gold" onClick={() => setColOpen(true)}>
            تحصيل
          </Button>
        </div>
      ) : null}

      <section>
        <h3 className="mb-2 text-base">كشف الحساب</h3>
        {client.statement.length === 0 ? (
          <p className="text-sm text-muted-foreground">لسه مفيش حركة.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="p-2.5 text-right font-medium">التاريخ</th>
                  <th className="p-2.5 text-right font-medium">البيان</th>
                  <th className="p-2.5 text-left font-medium">مدين</th>
                  <th className="p-2.5 text-left font-medium">دائن</th>
                  <th className="p-2.5 text-left font-medium">الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {client.statement.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="p-2 whitespace-nowrap">{formatDate(l.date)}</td>
                    <td className="p-2">
                      {l.label}
                      {l.kind === "collection" ? (
                        <span className="mr-1 text-xs text-muted-foreground">
                          {METHOD_LABEL[db.collections.find((c) => c.id === l.id)?.method ?? "cash"]}
                        </span>
                      ) : null}
                    </td>
                    <td className="p-2 text-left tabular">{l.debit ? <Money value={l.debit} /> : "—"}</td>
                    <td className="p-2 text-left tabular">{l.credit ? <Money value={l.credit} /> : "—"}</td>
                    <td className="p-2 text-left tabular">
                      <Money value={l.balance} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {can.delete ? (
        <Button
          variant="danger"
          onClick={() => {
            if (confirm("مسح العميل وكل توريداته وتحصيلاته؟")) {
              deleteClient(client.id);
              nav("/clients");
            }
          }}
        >
          مسح العميل
        </Button>
      ) : null}

      <DeliveryPanel
        open={delOpen}
        onClose={() => setDelOpen(false)}
        onSave={(input) => {
          addDelivery({ ...input, clientId: client.id });
          toast.success("التوريد اتسجل.");
          setDelOpen(false);
        }}
      />
      <CollectPanel clientId={colOpen ? client.id : null} onClose={() => setColOpen(false)} />

      {can.delete && db.deliveries.some((d) => d.clientId === client.id) ? (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">مسح حركة بالقطعة</summary>
          <ul className="mt-2 space-y-1">
            {db.deliveries
              .filter((d) => d.clientId === client.id)
              .map((d) => (
                <li key={d.id} className="flex justify-between">
                  <span>توريد {formatDate(d.date)}</span>
                  <button className="text-danger" onClick={() => deleteDelivery(d.id)}>
                    مسح
                  </button>
                </li>
              ))}
            {db.collections
              .filter((c) => c.clientId === client.id)
              .map((c) => (
                <li key={c.id} className="flex justify-between">
                  <span>تحصيل {formatDate(c.date)}</span>
                  <button className="text-danger" onClick={() => deleteCollection(c.id)}>
                    مسح
                  </button>
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function DeliveryPanel({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (input: { date: string; dueDate: string; amount: number; model: string; quantity: number | null; notes: string }) => void;
}) {
  const [date, setDate] = useState(cairoToday());
  const [dueDate, setDueDate] = useState(cairoToday());
  const [amount, setAmount] = useState("");
  const [model, setModel] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <Panel
      open={open}
      title="توريد جديد"
      onClose={onClose}
      footer={
        <Button
          className="w-full"
          onClick={() => {
            try {
              onSave({
                date,
                dueDate,
                amount: Number(amount),
                model,
                quantity: quantity ? Number(quantity) : null,
                notes,
              });
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "فشل");
            }
          }}
        >
          حفظ التوريد
        </Button>
      }
    >
      <Field label="التاريخ">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="ميعاد الآجل">
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </Field>
      <Field label="المبلغ">
        <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="الموديل">
        <Input value={model} onChange={(e) => setModel(e.target.value)} />
      </Field>
      <Field label="الكمية">
        <Input inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </Field>
      <Field label="ملاحظة">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Panel>
  );
}
