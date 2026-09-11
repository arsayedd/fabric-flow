import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Field, Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, selectClass } from "@/components/ui/input";
import { cairoToday, fileToDataUrl, formatDate, qty } from "@/lib/utils";
import { methodNeedsReceipt, whatsappReminder } from "@/store/compute";
import { clientBalance } from "@/store/compute";
import { useFactory } from "@/store/context";
import { partyById } from "@/store/parties";
import { METHOD_LABEL, PAY_METHODS, type PayMethod } from "@/store/types";
import { Banknote } from "lucide-react";

const TABS = [
  { id: "overdue", label: "متأخر" },
  { id: "today", label: "النهارده" },
  { id: "week", label: "خلال أسبوع" },
  { id: "later", label: "بعد كده" },
  { id: "pending", label: "مستني تأكيد" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function CollectionsPage() {
  const { computed, db, confirmCollection, can } = useFactory();
  const [tab, setTab] = useState<TabId>("overdue");
  const [collectFor, setCollectFor] = useState<string | null>(null);

  const counts = {
    overdue: computed.rec.overdue.length,
    today: computed.rec.today.length,
    week: computed.rec.week.length,
    later: computed.rec.later.length,
    pending: computed.rec.pending.length,
  };

  const rows = tab === "pending" ? [] : computed.rec[tab];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl">التحصيل</h2>
        <p className="text-sm text-muted-foreground">التحصيل بيتخصم من أقدم توريد الأول، فالمواعيد تفضل دقيقة.</p>
      </div>

      <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
          >
            {t.label}
            <span className="mr-1 opacity-70">{qty(counts[t.id])}</span>
          </button>
        ))}
      </div>

      {tab === "pending" ? (
        computed.rec.pending.length === 0 ? (
          <EmptyState icon={Banknote} title="مفيش تحويلات مستنية" body="التحويلات البنكية والإنستاباي والمحفظة بتفضل هنا لحد ما الفلوس توصل." />
        ) : (
          <div className="space-y-2">
            {computed.rec.pending.map((c) => {
              const client = partyById(db, c.clientId);
              return (
                <div key={c.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{client?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {METHOD_LABEL[c.method]} · {formatDate(c.date)}
                      </p>
                    </div>
                    <Money value={c.amount} />
                  </div>
                  {can.edit ? (
                    <Button className="mt-3 w-full" onClick={() => { confirmCollection(c.id); toast.success("اتأكد التحصيل واتخصم من الأقدم."); }}>
                      الفلوس وصلت — أكّد
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )
      ) : rows.length === 0 ? (
        <EmptyState icon={Banknote} title="القسم فاضي" body="لما يتسجل توريد بميعاد آجل، المستحق هيتوزع هنا لوحده." />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.deliveryId} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link to={`/parties/${r.clientId}`} className="font-medium">
                    {r.clientName}
                  </Link>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {tab === "overdue" ? <Badge tone="danger">متأخر {formatDate(r.dueDate)}</Badge> : formatDate(r.dueDate)}
                    {r.model ? ` · ${r.model}` : ""}
                  </p>
                </div>
                <Money value={r.remaining} />
              </div>
              <div className="mt-3 flex gap-2">
                {can.edit ? (
                  <Button size="sm" className="flex-1" onClick={() => setCollectFor(r.clientId)}>
                    سجل التحصيل
                  </Button>
                ) : null}
                <Button size="sm" variant="whatsapp" className="flex-1" asChild>
                  <a
                    href={whatsappReminder({
                      name: r.clientName,
                      amount: r.remaining,
                      dueDate: r.dueDate,
                      factoryName: db.factory?.name ?? "",
                      phone: r.phone,
                    })}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="h-4 w-4" />
                    واتساب
                  </a>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CollectPanel clientId={collectFor} onClose={() => setCollectFor(null)} />
    </div>
  );
}

export function CollectPanel({ clientId, onClose }: { clientId: string | null; onClose: () => void }) {
  const { db, addCollection } = useFactory();
  const client = partyById(db, clientId);
  const balance = clientId ? clientBalance(db, clientId) : 0;
  const [date, setDate] = useState(cairoToday());
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PayMethod>("cash");
  const [accountId, setAccountId] = useState(db.accounts[0]?.id ?? "");
  const [chequeDate, setChequeDate] = useState("");
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);

  const suggestedAccount = useMemo(() => {
    const map: Record<PayMethod, string> = {
      cash: db.accounts.find((a) => a.kind === "cash")?.id ?? db.accounts[0]?.id ?? "",
      bank: db.accounts.find((a) => a.kind === "bank")?.id ?? "",
      instapay: db.accounts.find((a) => a.kind === "instapay")?.id ?? "",
      wallet: db.accounts.find((a) => a.kind === "wallet")?.id ?? "",
      cheque: db.accounts.find((a) => a.kind === "bank")?.id ?? "",
    };
    return map[method];
  }, [db.accounts, method]);

  const submit = () => {
    if (!clientId) return;
    try {
      addCollection({
        clientId,
        date,
        amount: Number(amount),
        method,
        accountId: accountId || suggestedAccount,
        receiptImage: receipt,
        chequeDate: method === "cheque" ? chequeDate || null : null,
        notes,
      });
      toast.success(methodNeedsReceipt(method) ? "التحصيل اتحفظ ومستني تأكيد." : "التحصيل اتحسب على أقدم توريد.");
      onClose();
      setAmount("");
      setReceipt(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل التسجيل");
    }
  };

  return (
    <Panel
      open={!!clientId}
      title={client ? `تحصيل من ${client.name}` : "تحصيل"}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button className="flex-1" onClick={submit}>
            حفظ التحصيل
          </Button>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        الرصيد الحالي <Money value={balance} />
      </p>
      <Field label="التاريخ">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="المبلغ">
        <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </Field>
      <Field label="طريقة الدفع">
        <div className="flex flex-wrap gap-1.5">
          {PAY_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMethod(m);
                setAccountId("");
              }}
              className={`rounded-full px-3 py-1.5 text-sm ${method === m ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
            >
              {METHOD_LABEL[m]}
            </button>
          ))}
        </div>
      </Field>
      <Field label="الحساب">
        <select
          className={selectClass}
          value={accountId || suggestedAccount}
          onChange={(e) => setAccountId(e.target.value)}
        >
          {db.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      {method === "cheque" ? (
        <Field label="ميعاد صرف الشيك">
          <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
        </Field>
      ) : null}
      {methodNeedsReceipt(method) ? (
        <Field label="صورة التحويل (إجبارية)">
          <Input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                setReceipt(await fileToDataUrl(f));
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "الصورة مرفوضة");
              }
            }}
          />
          {receipt ? (
            <p className="mt-1 text-sm text-ok">الصورة اتحفظت.</p>
          ) : (
            <p className="mt-1 text-sm text-danger">من غير صورة التحويل مش هيتسجل.</p>
          )}
        </Field>
      ) : null}
      <Field label="ملاحظة">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Panel>
  );
}
