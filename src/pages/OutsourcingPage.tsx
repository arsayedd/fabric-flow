import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Truck } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Field, Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, selectClass } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ExportMenu } from "@/components/export/ExportMenu";
import { DocumentButton } from "@/components/docs/DocumentPrint";
import { addDays, cairoToday, formatDate, money, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { datasetOf } from "@/store/datasets";
import { materialStock } from "@/store/manufacturing";
import {
  SUB_STATUS_LABEL,
  SUB_STATUS_TONE,
  lateSubcontracts,
  subViews,
  workshopScores,
  workshopStatement,
  type SubView,
} from "@/store/outsourcing";
import { METHOD_LABEL, PAY_METHODS, type PayMethod } from "@/store/types";

/**
 * الورش الخارجية.
 *
 * المصنع المصري بيشغّل برّه كتير، والفلوس بتضيع في التفصيلة دي أكتر من
 * أي حاجة: طلع ٣٠٠، رجع ٢٨٠، والحساب اتحسب على ٣٠٠. الشاشة دي بتقفل
 * الباب ده: **المستحق بيتحسب من الراجع فعلًا**، والخامات اللي طلعت
 * معروفة، والتقييم محسوب من الميعاد والفاقد مش من الانطباع.
 */

const TABS = [
  { id: "jobs", label: "أعمال التشغيل" },
  { id: "workshops", label: "الورش وتقييمها" },
  { id: "account", label: "كشف حساب" },
] as const;

export function OutsourcingPage() {
  const { db, can } = useFactory();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("jobs");
  const [newOpen, setNewOpen] = useState(false);

  const views = useMemo(() => subViews(db), [db]);
  const late = useMemo(() => lateSubcontracts(db), [db]);
  const outTotal = views.filter((v) => v.sub.status === "open").reduce((s, v) => s + v.outstanding, 0);
  const dueTotal = views.reduce((s, v) => s + v.due, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">الورش الخارجية</h2>
          <p className="text-sm text-muted-foreground">
            الشغل اللي بيطلع برّه: الكمية والأجر والميعاد والراجع فعلًا. حساب الورشة بيتحسب من الاستلامات.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <ExportMenu module="purchasing" dataset={() => datasetOf(db, "subcontracts")} />
          {can.do("purchasing", "create") ? <Button onClick={() => setNewOpen(true)}>إذن تشغيل جديد</Button> : null}
        </div>
      </div>

      {!views.length ? (
        <EmptyState
          icon={Building2}
          title="مفيش شغل خارجي مسجّل"
          body="إذن التشغيل بيقول: طلع كام قطعة لأي ورشة، بأجر كام، ومتوقع يرجع امتى. ومن الاستلامات بيتحسب المستحق والفاقد وتقييم الورشة."
          action={can.do("purchasing", "create") ? { label: "إذن تشغيل جديد", onClick: () => setNewOpen(true) } : undefined}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <p className="text-sm text-muted-foreground">لسه عند الورش</p>
            <p className="mt-1 text-2xl tabular">{qty(outTotal, 0)} قطعة</p>
            <p className="text-xs text-muted-foreground">{qty(views.filter((v) => v.sub.status === "open").length, 0)} إذن مفتوح</p>
          </Card>
          <Card className={late.length ? "border-danger/40 bg-danger-soft/30" : ""}>
            <p className="text-sm text-muted-foreground">متأخر عن ميعاده</p>
            <p className={`mt-1 text-2xl tabular ${late.length ? "text-danger" : ""}`}>{qty(late.length, 0)}</p>
            <p className="text-xs text-muted-foreground">
              {late.length ? late.map((v) => v.sub.code).join(" · ") : "كل الأعمال في ميعادها"}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-muted-foreground">مستحق للورش</p>
            <p className="mt-1 text-2xl">
              <Money value={dueTotal} />
            </p>
            <p className="text-xs text-muted-foreground">محسوب من الراجع، مش من الكمية اللي طلعت</p>
          </Card>
        </div>
      )}

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
              tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "jobs" ? (
        <div className="space-y-3">
          {views.map((v) => (
            <JobCard key={v.sub.id} v={v} />
          ))}
        </div>
      ) : null}
      {tab === "workshops" ? <Workshops /> : null}
      {tab === "account" ? <Statement /> : null}

      <NewSubPanel open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

function JobCard({ v }: { v: SubView }) {
  const { can, closeSubcontract, cancelSubcontract } = useFactory();
  const [receiving, setReceiving] = useState(false);
  const [sending, setSending] = useState(false);
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);
  const sub = v.sub;

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base">
              <span className="latin">{sub.code}</span> · {v.partyName}
            </h3>
            <Badge tone={SUB_STATUS_TONE[sub.status]}>{SUB_STATUS_LABEL[sub.status]}</Badge>
            {v.lateDays > 0 ? <Badge tone="danger">رجع متأخر {qty(v.lateDays, 0)} يوم</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {v.operationName ?? "تشغيل"} · {formatDate(sub.date)} → متوقع {formatDate(sub.expectedDate)}
            {v.orderCode ? ` · أمر ${v.orderCode}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <DocumentButton type="subout" refId={sub.id} variant="outline" size="sm" label="إذن التشغيل" />
          {sub.status === "open" && can.do("purchasing", "create") ? (
            <Button size="sm" onClick={() => setReceiving(true)}>
              استلام
            </Button>
          ) : null}
          {sub.status === "open" && can.do("inventory", "edit") ? (
            <Button size="sm" variant="outline" onClick={() => setSending(true)}>
              خامات
            </Button>
          ) : null}
          {sub.status === "open" && can.do("purchasing", "edit") ? (
            <Button size="sm" variant="ghost" onClick={() => setAsking((x) => !x)}>
              إقفال
            </Button>
          ) : null}
        </div>
      </div>

      {asking ? (
        <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
          <p className="text-sm">
            الإقفال بيوقف الاستلامات على الإذن ده. لو مافيش استلامات خالص تقدر تلغيه بسبب مكتوب.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                try {
                  closeSubcontract(sub.id);
                  toast.success("الإذن اتقفل.");
                  setAsking(false);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "مش قادر أقفل.");
                }
              }}
            >
              اقفل الإذن
            </Button>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب الإلغاء" className="w-48" />
            <Button
              size="sm"
              variant="dangerGhost"
              onClick={() => {
                try {
                  cancelSubcontract(sub.id, reason);
                  toast.success("الإذن اتلغى.");
                  setAsking(false);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "مش قادر ألغي.");
                }
              }}
            >
              إلغاء بسبب
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Cell label="طلع" value={qty(sub.qtySent, 0)} />
        <Cell label="رجع سليم" value={qty(v.received, 0)} />
        <Cell label="لسه برّه" value={qty(v.outstanding, 0)} tone={v.outstanding > 0 && sub.expectedDate < cairoToday() ? "danger" : undefined} />
        <Cell label="فاقد" value={`${qty(v.lost, 0)} (${qty(v.lossPct, 1)}٪)`} tone={v.lossPct > 2 ? "warn" : undefined} />
        <Cell label="المستحق" value={money(v.due)} hint={`أجر القطعة ${money(sub.rate)}`} />
      </div>

      {v.materials.length ? (
        <div className="rounded-md border border-border/70 p-3">
          <p className="mb-1 text-sm">خامات مع الإذن</p>
          {v.materials.map((m) => (
            <div key={m.materialId} className="flex justify-between gap-2 text-sm">
              <span>{m.name}</span>
              <span className="tabular text-muted-foreground">
                طلع {qty(m.sent, 2)} {m.unit} · رجع {qty(m.back, 2)} · عندهم {qty(m.atWorkshop, 2)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {v.receipts.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="py-1.5 text-start font-medium">تاريخ الاستلام</th>
                <th className="py-1.5 text-end font-medium">سليم</th>
                <th className="py-1.5 text-end font-medium">إعادة</th>
                <th className="py-1.5 text-end font-medium">فاقد</th>
                <th className="py-1.5 text-end font-medium">المستحق</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody>
              {v.receipts.map((r) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="py-1.5">{formatDate(r.date)}</td>
                  <td className="py-1.5 text-end tabular">{qty(r.qtyGood, 0)}</td>
                  <td className="py-1.5 text-end tabular">{qty(r.qtyRework, 0)}</td>
                  <td className="py-1.5 text-end tabular">{qty(r.qtyLost, 0)}</td>
                  <td className="py-1.5 text-end tabular">{money((r.qtyGood + r.qtyRework) * sub.rate)}</td>
                  <td className="py-1.5 text-end">
                    <DocumentButton type="subin" refId={r.id} variant="ghost" size="sm" label="إيصال" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">مارجعش أي حاجة لسه.</p>
      )}

      {sub.notes ? <p className="text-xs text-muted-foreground">{sub.notes}</p> : null}
      {sub.cancelReason ? <p className="text-xs text-danger">سبب الإلغاء: {sub.cancelReason}</p> : null}

      <ReceivePanel v={v} open={receiving} onClose={() => setReceiving(false)} />
      <MaterialsPanel v={v} open={sending} onClose={() => setSending(false)} />
    </Card>
  );
}

function Cell({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" | "danger" }) {
  const color = tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "";
  return (
    <div className="rounded-md border border-border/70 bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-lg tabular ${color}`}>{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/* ── إذن جديد ───────────────────────────────────────────────────── */

function NewSubPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, addSubcontract } = useFactory();
  const workshops = db.parties.filter((p) => p.roles.includes("workshop") && !p.mergedIntoId);
  const others = db.parties.filter((p) => !p.roles.includes("workshop") && !p.mergedIntoId);
  const orders = db.orders.filter((o) => o.status !== "done");

  const [partyId, setPartyId] = useState(workshops[0]?.id ?? "");
  const [orderId, setOrderId] = useState("");
  const [operationId, setOperationId] = useState("");
  const [qtySent, setQtySent] = useState("");
  const [rate, setRate] = useState("");
  const [expected, setExpected] = useState(addDays(cairoToday(), 5));
  const [notes, setNotes] = useState("");

  const save = () => {
    try {
      addSubcontract({
        partyId,
        orderId: orderId || null,
        operationId: operationId || null,
        date: cairoToday(),
        expectedDate: expected,
        qtySent: Number(qtySent) || 0,
        rate: Number(rate) || 0,
        notes,
      });
      toast.success("إذن التشغيل اتسجّل.");
      onClose();
      setQtySent("");
      setNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر أسجّل الإذن.");
    }
  };

  return (
    <Panel
      open={open}
      title="إذن تشغيل خارجي"
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={save}>
          حفظ الإذن
        </Button>
      }
    >
      <Field label="الورشة">
        <select className={selectClass} value={partyId} onChange={(e) => setPartyId(e.target.value)}>
          <option value="">اختار الورشة</option>
          {workshops.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          {others.length ? (
            <optgroup label="جهات تانية (هتاخد دور ورشة)">
              {others.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </Field>
      <p className="-mt-1 mb-3 text-xs text-muted-foreground">
        الورشة جهة تعامل زي أي جهة — لو اخترت جهة موجودة، بتاخد دور «ورشة خارجية» بدل ما يتعمل لها سجل تاني.
      </p>

      <Field label="أمر الإنتاج (اختياري)">
        <select className={selectClass} value={orderId} onChange={(e) => setOrderId(e.target.value)}>
          <option value="">بدون ربط بأمر</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.code} — {o.model}
            </option>
          ))}
        </select>
      </Field>

      <Field label="العملية">
        <select className={selectClass} value={operationId} onChange={(e) => setOperationId(e.target.value)}>
          <option value="">بدون عملية</option>
          {db.operations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
              {o.isOutsourced ? " (خارجية)" : ""}
            </option>
          ))}
        </select>
      </Field>
      <p className="-mt-1 mb-3 text-xs text-muted-foreground">
        لو ربطت العملية بأمر، الشغل الراجع بيتسجّل في دفتر الإنتاج على العملية دي — فتقدّم الأمر بيشوف شغل الورشة.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="الكمية">
          <Input value={qtySent} onChange={(e) => setQtySent(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="أجر القطعة">
          <Input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />
        </Field>
      </div>
      <Field label="متوقع يرجع">
        <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} className="latin" />
      </Field>
      <Field label="ملاحظات">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {Number(qtySent) > 0 && Number(rate) > 0 ? (
        <p className="text-sm">
          لو رجعت كاملة، المستحق <Money value={Number(qtySent) * Number(rate)} />.
        </p>
      ) : null}
    </Panel>
  );
}

/* ── استلام ─────────────────────────────────────────────────────── */

function ReceivePanel({ v, open, onClose }: { v: SubView; open: boolean; onClose: () => void }) {
  const { receiveSubcontract } = useFactory();
  const [date, setDate] = useState(cairoToday());
  const [good, setGood] = useState("");
  const [rework, setRework] = useState("0");
  const [lost, setLost] = useState("0");
  const [notes, setNotes] = useState("");

  const charge = (Number(good) + Number(rework)) * v.sub.rate;

  const save = () => {
    try {
      receiveSubcontract({
        subcontractId: v.sub.id,
        date,
        qtyGood: Number(good) || 0,
        qtyRework: Number(rework) || 0,
        qtyLost: Number(lost) || 0,
        notes,
      });
      toast.success("الاستلام اتسجّل والمستحق اتحدّث.");
      onClose();
      setGood("");
      setRework("0");
      setLost("0");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر أسجّل الاستلام.");
    }
  };

  return (
    <Panel
      open={open}
      title="استلام من الورشة"
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={save}>
          سجّل الاستلام
        </Button>
      }
    >
      <div className="mb-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
        <p>
          <span className="latin">{v.sub.code}</span> · {v.partyName}
        </p>
        <p className="text-muted-foreground">
          لسه عندهم {qty(v.outstanding, 0)} قطعة من {qty(v.sub.qtySent, 0)}
        </p>
      </div>
      <Field label="تاريخ الاستلام">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="latin" />
      </Field>
      <Field label="سليم">
        <Input value={good} onChange={(e) => setGood(e.target.value)} inputMode="numeric" placeholder={String(v.outstanding)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="محتاج إعادة">
          <Input value={rework} onChange={(e) => setRework(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="فاقد">
          <Input value={lost} onChange={(e) => setLost(e.target.value)} inputMode="numeric" />
        </Field>
      </div>
      <Field label="ملاحظات">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {charge > 0 ? (
        <p className="text-sm">
          المستحق على الاستلام ده <Money value={charge} /> — الفاقد مابيتحسبش عليه أجر.
        </p>
      ) : null}
    </Panel>
  );
}

function MaterialsPanel({ v, open, onClose }: { v: SubView; open: boolean; onClose: () => void }) {
  const { db, sendSubMaterials } = useFactory();
  const stock = useMemo(() => materialStock(db), [db]);
  const [rows, setRows] = useState<{ materialId: string; qty: string }[]>([{ materialId: "", qty: "" }]);

  const save = () => {
    try {
      sendSubMaterials(
        v.sub.id,
        rows.map((r) => ({ materialId: r.materialId, qty: Number(r.qty) || 0 })),
      );
      toast.success("الخامات خرجت من المخزن على الإذن.");
      onClose();
      setRows([{ materialId: "", qty: "" }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر أصرف الخامات.");
    }
  };

  return (
    <Panel
      open={open}
      title="خامات مع الإذن"
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={save}>
          اصرف من المخزن
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        الخامات دي بتخرج من المخزن فعلًا بحركة صرف مربوطة بالإذن، فتعرف في أي وقت إيه اللي لسه عند الورشة.
      </p>
      {rows.map((row, i) => (
        <div key={i} className="mb-2 flex gap-2">
          <select
            className={selectClass}
            value={row.materialId}
            onChange={(e) => setRows(rows.map((r, j) => (i === j ? { ...r, materialId: e.target.value } : r)))}
          >
            <option value="">اختار الخامة</option>
            {stock.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — متاح {qty(m.qty, 2)}
              </option>
            ))}
          </select>
          <Input
            value={row.qty}
            onChange={(e) => setRows(rows.map((r, j) => (i === j ? { ...r, qty: e.target.value } : r)))}
            inputMode="decimal"
            className="w-24"
            placeholder="كمية"
          />
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => setRows([...rows, { materialId: "", qty: "" }])}>
        + خامة
      </Button>
    </Panel>
  );
}

/* ── الورش وتقييمها ─────────────────────────────────────────────── */

function Workshops() {
  const { db } = useFactory();
  const rows = useMemo(() => workshopScores(db), [db]);

  if (!rows.length) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">مفيش ورش عليها أعمال لسه.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((w) => (
        <Card key={w.partyId} className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base">
                <Link to={`/parties/${w.partyId}`} className="underline-offset-4 hover:underline">
                  {w.name}
                </Link>
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {qty(w.jobs, 0)} عمل · {qty(w.pieces, 0)} قطعة · متوسط الأجر {money(w.avgRate)}
              </p>
            </div>
            <div className="text-end">
              {w.score === null ? (
                <Badge tone="muted">لسه بدري على التقييم</Badge>
              ) : (
                <>
                  <p
                    className={`text-3xl tabular ${w.score >= 80 ? "text-ok" : w.score >= 60 ? "text-warn" : "text-danger"}`}
                  >
                    {qty(w.score, 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">من ١٠٠</p>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-4">
            <Cell label="التزام بالميعاد" value={w.onTimePct === null ? "—" : `${qty(w.onTimePct, 0)}٪`} />
            <Cell label="الفاقد" value={`${qty(w.lossPct, 1)}٪`} tone={w.lossPct > 2 ? "warn" : undefined} />
            <Cell label="إعادة شغل" value={`${qty(w.reworkPct, 1)}٪`} tone={w.reworkPct > 5 ? "warn" : undefined} />
            <Cell label="مستحق لها" value={money(w.due)} />
          </div>

          <ul className="space-y-1 text-sm text-muted-foreground">
            {w.reasons.map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            السكور: ٥٠٪ الميعاد + ٣٠٪ سلامة الكمية + ٢٠٪ قلة إعادة الشغل. والمقصود منه المقارنة، مش الحكم النهائي.
          </p>
        </Card>
      ))}
    </div>
  );
}

/* ── كشف حساب ───────────────────────────────────────────────────── */

function Statement() {
  const { db, can, paySubcontract } = useFactory();
  const scores = useMemo(() => workshopScores(db), [db]);
  const [partyId, setPartyId] = useState(scores[0]?.partyId ?? "");
  const lines = useMemo(() => (partyId ? workshopStatement(db, partyId) : []), [db, partyId]);
  const balance = lines.length ? lines[lines.length - 1].balance : 0;

  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(db.accounts[0]?.id ?? "");
  const [method, setMethod] = useState<PayMethod>("cash");
  const [notes, setNotes] = useState("");

  const pay = () => {
    try {
      paySubcontract({
        partyId,
        subcontractId: null,
        date: cairoToday(),
        amount: Number(amount) || 0,
        accountId,
        method,
        notes,
      });
      toast.success("الدفعة اتسجّلت وخرجت من الخزينة.");
      setAmount("");
      setNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر أسجّل الدفعة.");
    }
  };

  if (!scores.length) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">مفيش ورش عليها حساب لسه.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <select className={`${selectClass} w-64`} value={partyId} onChange={(e) => setPartyId(e.target.value)}>
            {scores.map((s) => (
              <option key={s.partyId} value={s.partyId}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <DocumentButton type="subaccount" refId={partyId} variant="outline" size="sm" label="اطبع الكشف" />
            <ExportMenu module="purchasing" dataset={() => datasetOf(db, "subReceipts")} compact />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 text-start font-medium">التاريخ</th>
                <th className="py-2 text-start font-medium">الحركة</th>
                <th className="py-2 text-end font-medium">مستحق</th>
                <th className="py-2 text-end font-medium">مدفوع</th>
                <th className="py-2 text-end font-medium">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-border/50">
                  <td className="py-2">{formatDate(l.date)}</td>
                  <td className="py-2">{l.label}</td>
                  <td className="py-2 text-end tabular">{l.debit ? money(l.debit) : "—"}</td>
                  <td className="py-2 text-end tabular">{l.credit ? money(l.credit) : "—"}</td>
                  <td className="py-2 text-end tabular">{money(l.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm">
          الرصيد المستحق للورشة <Money value={balance} />
        </p>
      </Card>

      {can.do("finance", "create") ? (
        <Card className="space-y-3">
          <h3 className="text-base">دفعة للورشة</h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="المبلغ">
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="من حساب">
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
            <Field label="ملاحظة">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={pay}>
              <Truck /> سجّل الدفعة
            </Button>
            <p className="text-xs text-muted-foreground">
              الدفعة بتخرج من الخزينة فورًا، ومينفعش تعدّي المستحق المحسوب من الاستلامات.
            </p>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
