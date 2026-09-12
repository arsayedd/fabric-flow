import { useState } from "react";
import { Wallet } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Choice, Field, Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, selectClass } from "@/components/ui/input";
import { cairoToday, formatDate, money } from "@/lib/utils";
import { pnl } from "@/store/compute";
import { useFactory } from "@/store/context";
import { ExportMenu } from "@/components/export/ExportMenu";
import { datasetOf } from "@/store/datasets";
import { partyById } from "@/store/parties";

export function TreasuryPage() {
  const { computed, db, can, addManualTx, addAccount } = useFactory();
  const [from, setFrom] = useState(cairoToday().slice(0, 7) + "-01");
  const [to, setTo] = useState(cairoToday());
  const report = pnl(db, from, to);
  const [txOpen, setTxOpen] = useState(false);
  const [accOpen, setAccOpen] = useState(false);

  const movements = [
    ...db.collections
      .filter((c) => c.status === "confirmed")
      .map((c) => ({
        id: c.id,
        date: c.date,
        label: `تحصيل · ${partyById(db, c.clientId)?.name ?? ""}`,
        amount: c.amount,
        accountId: c.accountId,
      })),
    ...db.costPayments.map((p) => ({
      id: p.id,
      date: p.date,
      label: "دفع مصروف",
      amount: -p.amount,
      accountId: p.accountId,
    })),
    ...db.workerPayments
      .filter((p) => p.accountId && (p.kind === "pay" || p.kind === "advance"))
      .map((p) => ({
        id: p.id,
        date: p.date,
        label: p.kind === "pay" ? "قبض عامل" : "سلفة",
        amount: -p.amount,
        accountId: p.accountId as string,
      })),
    ...db.manualTx.map((t) => ({
      id: t.id,
      date: t.date,
      label: t.notes || "حركة يدوية",
      amount: t.amount,
      accountId: t.accountId,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">الخزينة</h2>
          <p className="text-sm text-muted-foreground">رصيد كل حساب، الأرباح والخسائر، وكل اللي عليك.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <ExportMenu
            module="finance"
            dataset={() =>
              datasetOf(db, "treasury", {
                summary: [{ label: "إجمالي الحسابات", value: money(computed.treasuryTotal) }],
              })
            }
          />
          {can.edit ? (
            <>
              <Button variant="outline" onClick={() => setAccOpen(true)}>
                حساب
              </Button>
              <Button onClick={() => setTxOpen(true)}>حركة</Button>
            </>
          ) : null}
        </div>
      </div>

      <Card className="bg-primary text-primary-foreground">
        <p className="text-sm text-primary-foreground/70">إجمالي الحسابات</p>
        <Money value={computed.treasuryTotal} className="text-2xl" />
      </Card>

      <div className="grid gap-2 md:grid-cols-2">
        {computed.accounts.map((a) => (
          <Card key={a.id}>
            <p className="text-sm text-muted-foreground">{a.name}</p>
            <Money value={a.balance} className="text-lg" />
          </Card>
        ))}
      </div>

      <Card>
        <h3 className="text-base">أرباح وخسائر</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="من">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="إلى">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <dl className="mt-1 space-y-1.5 text-sm">
          <Row k="التوريدات" v={report.revenue} />
          <Row k="بنود التكلفة" v={-report.costs} />
          <Row k="أجور العمال" v={-report.labor} />
          <Row k="حركات خارجة" v={-report.otherOut} />
          <div className="flex justify-between border-t border-border pt-2">
            <dt className="font-medium">الصافي</dt>
            <dd>
              <Money value={report.net} signed />
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h3 className="text-base">كل اللي عليك</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          موردين <Money value={computed.owe.vendorTotal} /> · عمال <Money value={computed.owe.workerTotal} />
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          {computed.owe.vendor.slice(0, 5).map((v) => (
            <li key={v.id} className="flex justify-between">
              <span>{v.vendor || v.itemName}</span>
              <Money value={v.due} />
            </li>
          ))}
        </ul>
      </Card>

      <section>
        <h3 className="mb-2 text-base">الحركات</h3>
        {movements.length === 0 ? (
          <EmptyState icon={Wallet} title="الخزينة فاضية" body="التحصيلات والمدفوعات هتظهر هنا." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {movements.slice(0, 40).map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-sm last:border-0"
              >
                <span>
                  {formatDate(m.date)} · {m.label}
                  <span className="mr-1 text-muted-foreground">
                    · {db.accounts.find((a) => a.id === m.accountId)?.name}
                  </span>
                </span>
                <Money value={m.amount} signed />
              </div>
            ))}
          </div>
        )}
      </section>

      <TxPanel open={txOpen} onClose={() => setTxOpen(false)} onSave={addManualTx} />
      <AccPanel open={accOpen} onClose={() => setAccOpen(false)} onSave={addAccount} />
    </div>
  );
}

function Row({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{k}</dt>
      <dd>
        <Money value={v} signed />
      </dd>
    </div>
  );
}

function TxPanel({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (row: { date: string; accountId: string; amount: number; notes: string }) => void;
}) {
  const { db } = useFactory();
  const [date, setDate] = useState(cairoToday());
  const [accountId, setAccountId] = useState(db.accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [dir, setDir] = useState<"in" | "out">("in");
  const [notes, setNotes] = useState("");
  return (
    <Panel
      open={open}
      title="حركة يدوية"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => {
              const n = Number(amount);
              if (!n) return toast.error("المبلغ مطلوب");
              onSave({ date, accountId, amount: dir === "in" ? n : -n, notes });
              toast.success("الحركة اتحفظت.");
              onClose();
            }}
          >
            حفظ
          </Button>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      }
    >
      <Choice label="اتجاه">
        <div className="flex gap-2">
          <Button type="button" variant={dir === "in" ? "default" : "outline"} onClick={() => setDir("in")}>
            داخل
          </Button>
          <Button type="button" variant={dir === "out" ? "default" : "outline"} onClick={() => setDir("out")}>
            خارج
          </Button>
        </div>
      </Choice>
      <Field label="التاريخ">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
      <Field label="المبلغ">
        <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="البيان">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Panel>
  );
}

function AccPanel({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, kind: "cash" | "bank" | "instapay" | "wallet") => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"cash" | "bank" | "instapay" | "wallet">("cash");
  return (
    <Panel
      open={open}
      title="حساب فلوس"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => {
              if (!name.trim()) return;
              onSave(name, kind);
              onClose();
            }}
          >
            إضافة
          </Button>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      }
    >
      <Field label="الاسم">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="خزينة فرع 2" />
      </Field>
      <Field label="النوع">
        <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="cash">كاش</option>
          <option value="bank">بنك</option>
          <option value="instapay">إنستاباي</option>
          <option value="wallet">محفظة</option>
        </select>
      </Field>
    </Panel>
  );
}
