import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Warehouse } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Field, Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, selectClass } from "@/components/ui/input";
import { cairoToday, formatDate, qty } from "@/lib/utils";
import { costEntryPaid } from "@/store/compute";
import { useFactory } from "@/store/context";
import { partiesWithRole } from "@/store/parties";
import { METHOD_LABEL, PAY_METHODS, type PayMethod } from "@/store/types";

export function CostsPage() {
  const { computed, can, addCostItem } = useFactory();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl">التكاليف</h2>
          <p className="text-sm text-muted-foreground">كل بند بحركاته والمورد وإيه اتدفع وإيه لأ.</p>
        </div>
        {can.edit ? <Button variant="outline" onClick={() => setOpen(true)}>بند جديد</Button> : null}
      </div>
      {computed.costItems.length === 0 ? (
        <EmptyState icon={Warehouse} title="مفيش بنود" body="ضيف بند تكلفة عشان تسجل المصروف عليه." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {computed.costItems.map((item) => (
            <Link
              key={item.id}
              to={`/costs/${item.id}`}
              className="flex items-center justify-between border-b border-border px-4 py-3 last:border-0"
            >
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-muted-foreground">
                  {item.unit} · {qty(item.entries.length)} حركة
                </p>
              </div>
              <div className="text-left">
                <Money value={item.amount} />
                {item.due > 0 ? (
                  <p className="text-xs text-warn">باقي {Math.round(item.due)}</p>
                ) : (
                  <p className="text-xs text-ok">اتدفع</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
      <Panel
        open={open}
        title="بند تكلفة"
        onClose={() => setOpen(false)}
        footer={
          <Button
            className="w-full"
            onClick={() => {
              if (!name.trim()) return toast.error("الاسم مطلوب");
              addCostItem(name, unit);
              setName("");
              setUnit("");
              setOpen(false);
            }}
          >
            إضافة
          </Button>
        }
      >
        <Field label="الاسم">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="الوحدة">
          <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="متر، كيلو، شهر..." />
        </Field>
      </Panel>
    </div>
  );
}

export function CostItemPage() {
  const { id } = useParams();
  const { computed, db, can, addCostEntry, addCostPayment, deleteCostEntry } = useFactory();
  const item = computed.costItems.find((i) => i.id === id);
  const [open, setOpen] = useState(false);
  const [payId, setPayId] = useState<string | null>(null);

  if (!item) return <EmptyState icon={Warehouse} title="البند مش موجود" body="اتمسح أو الرابط غلط." />;

  return (
    <div className="space-y-4">
      <Link to="/costs" className="text-sm text-muted-foreground">
        → التكاليف
      </Link>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl">{item.name}</h2>
          <p className="text-sm text-muted-foreground">الوحدة: {item.unit}</p>
        </div>
        {can.edit ? <Button onClick={() => setOpen(true)}>مصروف</Button> : null}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Mini label="الإجمالي" value={item.amount} />
        <Mini label="اتدفع" value={item.paid} />
        <Mini label="باقي" value={item.due} />
      </div>
      {item.entries.length === 0 ? (
        <EmptyState icon={Warehouse} title="مفيش حركات" body="سجل أول مصروف على البند ده." action={can.edit ? { label: "مصروف جديد", onClick: () => setOpen(true) } : undefined} />
      ) : (
        item.entries.map((e) => {
          const paid = costEntryPaid(db, e.id);
          const due = e.amount - paid;
          return (
            <div key={e.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex justify-between">
                <div>
                  <p className="font-medium">{e.vendor || "من غير مورد"}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(e.date)} {e.quantity ? `· ${e.quantity} ${item.unit}` : ""}
                  </p>
                </div>
                <Money value={e.amount} />
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                {due > 0.5 ? <Badge tone="warn">باقي {Math.round(due)}</Badge> : <Badge tone="ok">اتدفع</Badge>}
                {can.edit && due > 0.5 ? (
                  <Button size="sm" variant="outline" onClick={() => setPayId(e.id)}>
                    دفعة
                  </Button>
                ) : null}
              </div>
              {can.delete ? (
                <button className="mt-2 text-sm text-danger" onClick={() => deleteCostEntry(e.id)}>
                  مسح الحركة
                </button>
              ) : null}
            </div>
          );
        })
      )}
      <EntryPanel
        open={open}
        onClose={() => setOpen(false)}
        onSave={(row) => {
          addCostEntry({ ...row, costItemId: item.id });
          toast.success("المصروف اتسجل.");
          setOpen(false);
        }}
      />
      <PayPanel entryId={payId} onClose={() => setPayId(null)} onSave={addCostPayment} />
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Money value={value} className="text-sm" />
    </div>
  );
}

function EntryPanel({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (row: { date: string; vendor: string; partyId: string | null; quantity: number | null; amount: number; notes: string }) => void;
}) {
  const { db, addParty } = useFactory();
  const suppliers = partiesWithRole(db, "supplier");
  const [date, setDate] = useState(cairoToday());
  const [partyId, setPartyId] = useState("");
  const [vendor, setVendor] = useState("");
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <Panel
      open={open}
      title="مصروف"
      onClose={onClose}
      footer={
        <Button
          className="w-full"
          onClick={() => {
            // مورّد جديد بيتسجل كجهة تعامل عشان يبقى له بروفايل وسكور، مش مجرد اسم نصي
            let id = partyId;
            if (!id && vendor.trim()) id = addParty({ name: vendor.trim(), roles: ["supplier"] });
            const name = id ? (db.parties.find((p) => p.id === id)?.name ?? vendor) : vendor;
            onSave({ date, vendor: name, partyId: id || null, quantity: quantity ? Number(quantity) : null, amount: Number(amount), notes });
          }}
        >
          حفظ
        </Button>
      }
    >
      <Field label="التاريخ">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="المورّد">
        <select
          className={selectClass}
          value={partyId}
          onChange={(e) => {
            setPartyId(e.target.value);
            if (e.target.value) setVendor("");
          }}
        >
          <option value="">مورّد جديد — أكتب اسمه تحت</option>
          {suppliers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {!partyId ? (
          <Input className="mt-2" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="اسم المورّد" />
        ) : null}
      </Field>
      <Field label="الكمية">
        <Input inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </Field>
      <Field label="المبلغ">
        <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="ملاحظة">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Panel>
  );
}

function PayPanel({
  entryId,
  onClose,
  onSave,
}: {
  entryId: string | null;
  onClose: () => void;
  onSave: (row: { costEntryId: string; date: string; amount: number; accountId: string; method: PayMethod }) => void;
}) {
  const { db } = useFactory();
  const [date, setDate] = useState(cairoToday());
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(db.accounts[0]?.id ?? "");
  const [method, setMethod] = useState<PayMethod>("cash");
  return (
    <Panel
      open={!!entryId}
      title="دفعة على المصروف"
      onClose={onClose}
      footer={
        <Button
          className="w-full"
          onClick={() => {
            if (!entryId) return;
            try {
              onSave({ costEntryId: entryId, date, amount: Number(amount), accountId, method });
              toast.success("الدفعة اتخصمت من الحساب.");
              onClose();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "فشل");
            }
          }}
        >
          حفظ الدفعة
        </Button>
      }
    >
      <Field label="التاريخ">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="المبلغ">
        <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="الحساب">
        <select className={selectClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {db.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="الطريقة">
        <select className={selectClass} value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
          {PAY_METHODS.map((m) => (
            <option key={m} value={m}>
              {METHOD_LABEL[m]}
            </option>
          ))}
        </select>
      </Field>
    </Panel>
  );
}
