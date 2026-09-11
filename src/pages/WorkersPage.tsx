import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { UsersRound } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Field, Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cairoToday, formatDate } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { PAY_TYPE_LABEL, WORKER_PAY_TYPES, type WorkerPayType } from "@/store/types";

export function WorkersPage() {
  const { computed, can, markAttendance, addWorker } = useFactory();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(computed.workers.map((w) => w.id));
  const today = cairoToday();
  const present = new Set(computed.attendanceToday);

  const toggle = (id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold">العمال</h2>
          <p className="text-sm text-muted-foreground">يومية أو شهري أو بالقطعة. حضور جماعي بدوسة.</p>
        </div>
        {can.edit ? <Button variant="outline" onClick={() => setOpen(true)}>عامل جديد</Button> : null}
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <p className="font-bold">حضور {formatDate(today)}</p>
        <p className="mt-1 text-sm text-muted-foreground">اتسجل {present.size} من {computed.workers.length}</p>
        <div className="mt-3 space-y-2">
          {computed.workers.map((w) => (
            <label key={w.id} className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2">
              <span className="flex items-center gap-2">
                <input type="checkbox" checked={selected.includes(w.id)} onChange={() => toggle(w.id)} />
                <span className="font-semibold">{w.name}</span>
              </span>
              {present.has(w.id) ? <Badge tone="ok">حاضر</Badge> : <Badge>لسه</Badge>}
            </label>
          ))}
        </div>
        <Button
          className="mt-3 w-full"
          onClick={() => {
            markAttendance(selected, today);
            toast.success("الحضور اتسجل.");
          }}
        >
          تسجيل الحضور المختار
        </Button>
      </div>

      {computed.workers.length === 0 ? (
        <EmptyState icon={UsersRound} title="مفيش عمال" body="ضيف العمال عشان تسجل الحضور والسلف والقبض." />
      ) : (
        <div className="space-y-2">
          {computed.workers.map((w) => (
            <Link key={w.id} to={`/workers/${w.id}`} className="flex items-center justify-between rounded-2xl border bg-card px-4 py-3">
              <div>
                <p className="font-bold">{w.name}</p>
                <p className="text-xs text-muted-foreground">
                  {PAY_TYPE_LABEL[w.payType]} · {w.rate}
                </p>
              </div>
              <div className="text-left">
                <Money value={w.balance} />
                {w.advance > 0 ? <p className="text-[11px] text-warn">سلفة {Math.round(w.advance)}</p> : null}
              </div>
            </Link>
          ))}
        </div>
      )}
      <WorkerForm open={open} onClose={() => setOpen(false)} onSave={addWorker} />
    </div>
  );
}

function WorkerForm({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (input: { name: string; payType: WorkerPayType; rate: number; phone: string }) => void;
}) {
  const [name, setName] = useState("");
  const [payType, setPayType] = useState<WorkerPayType>("daily");
  const [rate, setRate] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <Panel
      open={open}
      title="عامل جديد"
      onClose={onClose}
      footer={
        <Button
          className="w-full"
          onClick={() => {
            if (!name.trim()) return toast.error("الاسم مطلوب");
            onSave({ name, payType, rate: Number(rate) || 0, phone });
            toast.success("العامل اتضاف.");
            onClose();
          }}
        >
          حفظ
        </Button>
      }
    >
      <Field label="الاسم">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="نظام القبض">
        <select className="h-11 w-full rounded-xl border bg-card px-3" value={payType} onChange={(e) => setPayType(e.target.value as WorkerPayType)}>
          {WORKER_PAY_TYPES.map((t) => (
            <option key={t} value={t}>
              {PAY_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>
      <Field label={payType === "piece" ? "سعر القطعة" : payType === "monthly" ? "المرتب" : "اليومية"}>
        <Input inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value)} />
      </Field>
      <Field label="موبايل">
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
    </Panel>
  );
}

export function WorkerProfilePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { computed, db, addPieceWork, can, deleteWorker } = useFactory();
  const w = computed.workers.find((x) => x.id === id);
  const [payOpen, setPayOpen] = useState<"pay" | "advance" | "deduction" | null>(null);
  const [pieces, setPieces] = useState("");

  if (!w) return <EmptyState icon={UsersRound} title="العامل مش موجود" body="اتمسح أو الرابط غلط." />;

  const earnings = db.workerEarnings.filter((e) => e.workerId === w.id);
  const pays = db.workerPayments.filter((e) => e.workerId === w.id);

  return (
    <div className="space-y-4">
      <button onClick={() => nav(-1)} className="text-sm text-muted-foreground">
        → العمال
      </button>
      <div className="flex justify-between">
        <div>
          <h2 className="text-2xl font-extrabold">{w.name}</h2>
          <p className="text-sm text-muted-foreground">
            {PAY_TYPE_LABEL[w.payType]} · {w.rate}
          </p>
        </div>
        <div className="text-left">
          <p className="text-xs text-muted-foreground">رصيده</p>
          <Money value={w.balance} className="text-xl" />
        </div>
      </div>
      {w.advance > 0 ? <Badge tone="warn">سلفة مفتوحة {Math.round(w.advance)}</Badge> : null}

      {w.payType === "piece" ? (
        <div className="flex gap-2">
          <Input inputMode="numeric" value={pieces} onChange={(e) => setPieces(e.target.value)} placeholder="عدد القطع" />
          <Button
            onClick={() => {
              addPieceWork(w.id, cairoToday(), Number(pieces), "");
              toast.success("الشغل اتحسب على حسابه.");
              setPieces("");
            }}
          >
            سجل شغل
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <Button variant="outline" onClick={() => setPayOpen("pay")}>
          قبض
        </Button>
        <Button variant="outline" onClick={() => setPayOpen("advance")}>
          سلفة
        </Button>
        <Button variant="outline" onClick={() => setPayOpen("deduction")}>
          خصم
        </Button>
      </div>

      <section>
        <h3 className="mb-2 font-bold">الحركة</h3>
        <ul className="space-y-2">
          {[
            ...earnings.map((e) => ({ id: e.id, date: e.date, label: e.kind === "piece" ? e.notes || "شغل قطعة" : "حضور", amount: e.amount })),
            ...pays.map((p) => ({
              id: p.id,
              date: p.date,
              label: p.kind === "pay" ? "قبض" : p.kind === "advance" ? "سلفة" : "خصم",
              amount: -p.amount,
            })),
          ]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((row) => (
              <li key={row.id} className="flex items-center justify-between rounded-xl border bg-card px-3 py-2 text-sm">
                <span>
                  {formatDate(row.date)} · {row.label}
                </span>
                <Money value={row.amount} signed />
              </li>
            ))}
        </ul>
      </section>

      {can.delete ? (
        <Button variant="danger" onClick={() => { deleteWorker(w.id); nav("/workers"); }}>
          مسح العامل
        </Button>
      ) : null}

      <PayWorkerPanel workerId={w.id} kind={payOpen} onClose={() => setPayOpen(null)} />
    </div>
  );
}

function PayWorkerPanel({
  workerId,
  kind,
  onClose,
}: {
  workerId: string;
  kind: "pay" | "advance" | "deduction" | null;
  onClose: () => void;
}) {
  const { db, addWorkerPayment } = useFactory();
  const [date, setDate] = useState(cairoToday());
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(db.accounts[0]?.id ?? "");
  const title = kind === "pay" ? "قبض" : kind === "advance" ? "سلفة" : "خصم";
  return (
    <Panel
      open={!!kind}
      title={title}
      onClose={onClose}
      footer={
        <Button
          className="w-full"
          onClick={() => {
            if (!kind) return;
            try {
              addWorkerPayment({
                workerId,
                date,
                kind,
                amount: Number(amount),
                accountId: kind === "deduction" ? null : accountId,
                notes: title,
              });
              toast.success("اتسجل في حساب العامل.");
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
      <Field label="التاريخ">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="المبلغ">
        <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      {kind !== "deduction" ? (
        <Field label="من حساب">
          <select className="h-11 w-full rounded-xl border bg-card px-3" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {db.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
    </Panel>
  );
}
