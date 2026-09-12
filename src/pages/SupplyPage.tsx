import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PackageSearch } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Field, Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DocumentButton } from "@/components/docs/DocumentPrint";
import { ExportMenu } from "@/components/export/ExportMenu";
import { cairoToday, formatDate, money, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { datasetOf } from "@/store/datasets";
import { partiesWithRole } from "@/store/parties";
import {
  availability,
  batchList,
  recallList,
  stockValue,
  supplyItemUnit,
  supplyList,
  supplySummary,
  supplierDelivery,
  SUPPLY_TONE,
  type SupplyLineView,
  type SupplyView,
} from "@/store/supply";
import { BATCH_STATUS_LABEL, SUPPLY_STATUS_LABEL } from "@/store/types";

/**
 * التوريد والاستلام والدفعات.
 *
 * الشاشة دي بتقفل أقدم فتحة في النظام: الشراء كان بيتسجّل كحركة مخزن
 * جاهزة، فمافيش حاجة بتقول **كان مطلوب كام** ولا **الميعاد كان امتى**.
 * ومن غير الرقمين دول، «في عجز؟» و«المورّد بيتأخر؟» سؤالين بلا إجابة.
 *
 * وأهم عمود جوه القسم هو **الدفعة**: بيها الخامة بتبقى ليها هوية تمشي
 * معاها من الاستلام للصرف للأمر للعميل — وبيها الاستدعاء يبقى ممكن.
 */

const TABS = [
  { id: "orders", label: "أوامر التوريد" },
  { id: "batches", label: "الدفعات" },
  { id: "available", label: "المتاح فعلًا" },
  { id: "suppliers", label: "التزام الموردين" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * كل تاب بيصدّر جدوله.
 *
 * وتاب الموردين بيصدّر أوامر التوريد لأن التزام المورّد **مشتق منها**:
 * الجدول اللي وراه هو نفسه، والملخص اللي على الشاشة بيتحسب من نفس
 * السطور — فتصدير مجموعة تانية ليه كان هيبقى نفس الأرقام باسم تاني.
 */
const TAB_DATASET: Record<TabId, string> = {
  orders: "supply",
  batches: "batches",
  available: "availability",
  suppliers: "supply",
};

export function SupplyPage() {
  const { db, can } = useFactory();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<TabId>(() => {
    const want = params.get("tab");
    return TABS.some((t) => t.id === want) ? (want as TabId) : "orders";
  });
  const [newOpen, setNewOpen] = useState(() => params.get("new") === "1");

  const pickTab = (id: TabId) => {
    setTab(id);
    const next = new URLSearchParams(params);
    next.set("tab", id);
    setParams(next, { replace: true });
  };

  const s = useMemo(() => supplySummary(db), [db]);

  if (!can.do("purchasing", "view")) {
    return (
      <EmptyState
        icon={PackageSearch}
        title="التوريد محتاج صلاحية المشتريات"
        body="الشاشة دي فيها أسعار الموردين وقيمة العجز، فمابتتفتحش بدون صلاحية. اطلبها من صاحب المصنع."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">التوريد والدفعات</h2>
          <p className="text-sm text-muted-foreground">
            طلبنا كام، وصل كام، دخل المخزن كام — والفرق بينهم رقم بقيمة مش إحساس.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {/* التصدير بيمشي مع التاب: الزر اللي بيطلّع نفس الملف من أي
              تاب بيخلّي «مفيش قايمة بلا تصدير» جملة مش أكتر */}
          <ExportMenu module="purchasing" dataset={() => datasetOf(db, TAB_DATASET[tab])} />
          {can.do("purchasing", "create") ? (
            <Button variant="gold" onClick={() => setNewOpen(true)}>
              أمر توريد
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-muted-foreground">أوامر مفتوحة</p>
          <p className="mt-1 text-2xl tabular">{qty(s.open, 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {s.overdue > 0 ? `منهم ${qty(s.overdue, 0)} فات ميعادهم` : "كلهم في ميعادهم"}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">قيمة اللي لسه جاي</p>
          <Money className="mt-1 text-2xl" value={s.openValue} />
          <p className="mt-1 text-xs text-muted-foreground">الباقي من الأوامر المفتوحة بسعر الاتفاق</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">خسارة التوريد</p>
          <Money className="mt-1 text-2xl" value={s.lossValue} />
          <p className="mt-1 text-xs text-muted-foreground">مرفوض وتالف وعجز مقفول — ٩٠ يوم</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">الالتزام بالمواعيد</p>
          <p className="mt-1 text-2xl tabular">{s.onTimePct === null ? "—" : `${qty(s.onTimePct, 0)}٪`}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {s.onTimePct === null ? "لسه مافيش استلام يتقارن بميعاده" : "على الأوامر اللي وصل منها حاجة"}
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => pickTab(t.id)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              tab === t.id ? "border-transparent bg-foreground text-background" : "border-border text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "orders" ? <Orders /> : null}
      {tab === "batches" ? <Batches /> : null}
      {tab === "available" ? <Available /> : null}
      {tab === "suppliers" ? <Suppliers /> : null}

      {newOpen ? <NewSupplyPanel onClose={() => setNewOpen(false)} /> : null}
    </div>
  );
}

/* ── أوامر التوريد ─────────────────────────────────────────────── */

function Orders() {
  const { db } = useFactory();
  const [live, setLive] = useState(true);
  const rows = useMemo(() => supplyList(db), [db]);
  const shown = live ? rows.filter((v) => v.order.status === "open" || v.order.status === "partial") : rows;

  if (!rows.length) {
    return (
      <EmptyState
        icon={PackageSearch}
        title="مافيش أوامر توريد لسه"
        body="أمر التوريد هو اللي بيخلّي العجز والتأخير أرقام: بتكتب المطلوب والميعاد والسعر، وبعدها كل شحنة بتتسجّل عليه."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {[
          { id: true, label: "الشغّال" },
          { id: false, label: "الكل" },
        ].map((f) => (
          <button
            key={String(f.id)}
            onClick={() => setLive(f.id)}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              live === f.id ? "border-gold bg-gold/10 text-gold" : "border-border text-muted-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length ? (
        shown.map((v) => <SupplyCard key={v.order.id} v={v} />)
      ) : (
        <Card>
          <p className="text-sm text-muted-foreground">مافيش أوامر شغّالة. كل اللي متسجّل خلص أو اتقفل.</p>
        </Card>
      )}
    </div>
  );
}

function SupplyCard({ v }: { v: SupplyView }) {
  const { db, can } = useFactory();
  const [receive, setReceive] = useState(false);
  const [close, setClose] = useState(false);
  const o = v.order;
  const receipts = (db.supplyReceipts ?? [])
    .filter((r) => r.supplyOrderId === o.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const editable = o.status === "open" || o.status === "partial";

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="latin text-sm text-muted-foreground">{o.code}</span>
            <Badge tone={SUPPLY_TONE[o.status]}>{SUPPLY_STATUS_LABEL[o.status]}</Badge>
            {v.overdue ? <Badge tone="danger">فات الميعاد</Badge> : null}
          </div>
          <p className="mt-1">{v.partyName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            اتفقنا {formatDate(o.date)} · الميعاد {formatDate(o.expectedDate)}
            {v.lastReceiptDate ? ` · آخر استلام ${formatDate(v.lastReceiptDate)}` : ""}
          </p>
          {/* الميعاد لوحده مش كفاية: شحنة توصل في ميعادها وناقصة بتبان هنا */}
          {v.lateDays !== null ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {v.lateDays > 0
                ? `اتأخر ${qty(v.lateDays, 0)} يوم عن الميعاد`
                : v.lateDays < 0
                  ? `وصل قبل الميعاد بـ${qty(Math.abs(v.lateDays), 0)} يوم`
                  : "وصل في ميعاده بالظبط"}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-left">
          <Money className="text-lg" value={v.orderedValue} />
          <p className="mt-0.5 text-xs text-muted-foreground">
            {v.fillPct === null ? "بلا كمية" : `وصل ${qty(v.fillPct, 0)}٪`}
          </p>
          {v.lossValue > 0 ? (
            <p className="mt-0.5 text-xs text-danger">
              خسارة <Money value={v.lossValue} />
            </p>
          ) : null}
        </div>
      </div>

      <ul className="mt-3 space-y-2 border-t border-border pt-3">
        {v.lines.map((l) => (
          <LineRow key={l.line.id} l={l} closed={v.order.status === "closed"} />
        ))}
      </ul>

      {/* الاستلامات كل واحد بورقته: الإذن هو اللي بيتوقّع عليه وقت نزول الشحنة */}
      {receipts.length ? (
        <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
          {receipts.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                <span className="latin">{r.code}</span> · {formatDate(r.date)}
                {r.supplierDocNo ? ` · إذن المورّد ${r.supplierDocNo}` : ""}
              </span>
              <DocumentButton type="grn" refId={r.id} label="إذن استلام" variant="ghost" />
            </li>
          ))}
        </ul>
      ) : null}

      {o.closeReason ? (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          سبب القفل: {o.closeReason}
        </p>
      ) : null}
      {o.cancelReason ? (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          سبب الإلغاء: {o.cancelReason}
        </p>
      ) : null}
      {o.notes ? <p className="mt-2 text-xs text-muted-foreground">{o.notes}</p> : null}

      {editable && can.do("purchasing", "create") ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          <Button variant="gold" onClick={() => setReceive(true)}>
            سجّل استلام
          </Button>
          <Button variant="outline" onClick={() => setClose(true)}>
            اقفله بعجز
          </Button>
        </div>
      ) : null}

      {receive ? <ReceivePanel v={v} onClose={() => setReceive(false)} /> : null}
      {close ? <ClosePanel v={v} onClose={() => setClose(false)} /> : null}
    </Card>
  );
}

/**
 * سطر البند بكل كمياته.
 *
 * الترتيب مقصود: المطلوب، اللي وصل، وبعدهم التفصيل. و«الباقي» بيتسمّى
 * **عجز** بس لما الأمر يتقفل — قبل كده هو انتظار، والخلط بين الاتنين
 * بيحوّل كل أمر مفتوح لمشكلة.
 */
function LineRow({ l, closed }: { l: SupplyLineView; closed: boolean }) {
  const parts: string[] = [];
  if (l.accepted > 0) parts.push(`اتقبل ${qty(l.accepted, 2)}`);
  if (l.rejected > 0) parts.push(`مرفوض ${qty(l.rejected, 2)}`);
  if (l.damaged > 0) parts.push(`تالف ${qty(l.damaged, 2)}`);
  if (l.missingDoc > 0) parts.push(`ناقص في ورقة المورّد ${qty(l.missingDoc, 2)}`);
  if (l.over > 0) parts.push(`زيادة ${qty(l.over, 2)}`);
  // «للمورّد ده» مش «من الأمر ده»: الرقم على مستوى المورّد والبند
  if (l.returned > 0) parts.push(`رجع للمورّد ده ${qty(l.returned, 2)}`);

  return (
    <li>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span>{l.name}</span>
        <span className="shrink-0 tabular text-muted-foreground">
          طلبنا {qty(l.ordered, 2)} {l.unit} · وصل {qty(l.received, 2)}
        </span>
      </div>
      {parts.length ? <p className="mt-0.5 text-xs text-muted-foreground">{parts.join(" · ")}</p> : null}
      {l.remaining > 0.0001 ? (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {closed ? (
            <span className="text-danger">
              عجز {qty(l.remaining, 2)} {l.unit} بقيمة <Money value={l.remaining * l.line.unitPrice} />
            </span>
          ) : (
            `باقي ${qty(l.remaining, 2)} ${l.unit} لسه مستنيين`
          )}
        </p>
      ) : null}
    </li>
  );
}

/* ── تسجيل استلام ──────────────────────────────────────────────── */

type RowState = {
  accepted: string;
  rejected: string;
  damaged: string;
  missing: string;
  lot: string;
  expiry: string;
  notes: string;
};

const EMPTY_ROW: RowState = { accepted: "", rejected: "", damaged: "", missing: "", lot: "", expiry: "", notes: "" };

function ReceivePanel({ v, onClose }: { v: SupplyView; onClose: () => void }) {
  const { db, receiveSupply } = useFactory();
  const [date, setDate] = useState(cairoToday());
  const [docNo, setDocNo] = useState("");
  const [warehouseId, setWarehouseId] = useState(db.warehouses.find((w) => w.kind === "material")?.id ?? "");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [busy, setBusy] = useState(false);

  const open = v.lines.filter((l) => l.remaining > 0.0001);
  const get = (id: string) => rows[id] ?? EMPTY_ROW;
  const set = (id: string, patch: Partial<RowState>) =>
    setRows((prev) => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY_ROW), ...patch } }));

  const submit = () => {
    setBusy(true);
    try {
      receiveSupply({
        supplyOrderId: v.order.id,
        date,
        warehouseId: warehouseId || null,
        supplierDocNo: docNo,
        notes,
        lines: open.map((l) => {
          const r = get(l.line.id);
          return {
            supplyOrderLineId: l.line.id,
            qtyAccepted: Number(r.accepted) || 0,
            qtyRejected: Number(r.rejected) || 0,
            qtyDamaged: Number(r.damaged) || 0,
            qtyMissing: Number(r.missing) || 0,
            supplierLot: r.lot,
            expiryDate: r.expiry || null,
            notes: r.notes,
          };
        }),
      });
      toast.success("الاستلام اتسجّل والمقبول دخل المخزن بدفعته.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مانفعش نسجّل الاستلام.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel open title={`استلام على ${v.order.code}`} onClose={onClose}>
      <p className="mb-3 text-xs text-muted-foreground">
        التوريد مش لازم يجي مرة واحدة. سجّل اللي نزل بس، والأمر يفضل مفتوح للباقي.
      </p>
      <Field label="تاريخ الاستلام">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="رقم إذن المورّد">
        <Input value={docNo} onChange={(e) => setDocNo(e.target.value)} placeholder="الرقم المكتوب على ورقته" />
      </Field>
      <Field label="المخزن">
        <select
          className="h-11 w-full rounded-md border border-border bg-card px-3 text-base"
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
        >
          <option value="">بدون مخزن</option>
          {db.warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </Field>

      {open.map((l) => (
        <div key={l.line.id} className="mt-4 rounded-lg border border-border p-3">
          <p className="text-sm">{l.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            باقي {qty(l.remaining, 2)} {l.unit} من {qty(l.ordered, 2)}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <Field label="اتقبل ودخل المخزن">
              <Input
                type="number"
                inputMode="decimal"
                value={get(l.line.id).accepted}
                onChange={(e) => set(l.line.id, { accepted: e.target.value })}
              />
            </Field>
            <Field label="مرفوض بالمواصفة">
              <Input
                type="number"
                inputMode="decimal"
                value={get(l.line.id).rejected}
                onChange={(e) => set(l.line.id, { rejected: e.target.value })}
              />
            </Field>
            <Field label="وصل تالف">
              <Input
                type="number"
                inputMode="decimal"
                value={get(l.line.id).damaged}
                onChange={(e) => set(l.line.id, { damaged: e.target.value })}
              />
            </Field>
            <Field label="مكتوب في ورقته ومش موجود">
              <Input
                type="number"
                inputMode="decimal"
                value={get(l.line.id).missing}
                onChange={(e) => set(l.line.id, { missing: e.target.value })}
              />
            </Field>
            <Field label="رقم اللوط على الشحنة">
              <Input value={get(l.line.id).lot} onChange={(e) => set(l.line.id, { lot: e.target.value })} />
            </Field>
            <Field label="تاريخ انتهاء (لو ليها)">
              <Input
                type="date"
                value={get(l.line.id).expiry}
                onChange={(e) => set(l.line.id, { expiry: e.target.value })}
              />
            </Field>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            المرفوض والتالف مابيدخلوش المخزن: لسه ملكنا بس ممنوع يتصرفوا لأمر إنتاج بالغلط.
          </p>
        </div>
      ))}

      <div className="mt-3">
        <Field label="ملاحظات">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
      </div>

      <Button variant="gold" className="w-full" disabled={busy} onClick={submit}>
        سجّل الاستلام
      </Button>
    </Panel>
  );
}

function ClosePanel({ v, onClose }: { v: SupplyView; onClose: () => void }) {
  const { closeSupplyOrder } = useFactory();
  const [reason, setReason] = useState("");
  const short = v.lines.reduce((s, l) => s + l.remaining * l.line.unitPrice, 0);

  return (
    <Panel open title={`اقفل ${v.order.code} بعجز`} onClose={onClose}>
      <p className="mb-3 text-sm text-muted-foreground">
        القفل معناه إن الباقي مش جاي. ساعتها الباقي بيتحوّل من انتظار لعجز بقيمة{" "}
        <Money value={short} /> وبيتحسب على المورّد في التزامه.
      </p>
      <Field label="سبب القفل (مطلوب)">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
      </Field>
      <Button
        variant="danger"
        className="w-full"
        onClick={() => {
          try {
            closeSupplyOrder(v.order.id, reason);
            toast.success("الأمر اتقفل والعجز اتسجّل.");
            onClose();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "مانفعش نقفل الأمر.");
          }
        }}
      >
        اقفل بعجز
      </Button>
    </Panel>
  );
}

/* ── أمر توريد جديد ────────────────────────────────────────────── */

function NewSupplyPanel({ onClose }: { onClose: () => void }) {
  const { db, openSupplyOrder } = useFactory();
  const suppliers = useMemo(() => partiesWithRole(db, "supplier"), [db]);
  const [partyId, setPartyId] = useState("");
  const [date, setDate] = useState(cairoToday());
  const [expected, setExpected] = useState("");
  const [itemId, setItemId] = useState("");
  const [qtyOrdered, setQtyOrdered] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const pickItem = (id: string) => {
    setItemId(id);
    // السعر بيتعبّى بمتوسط تكلفة الخامة كنقطة بداية — رقم اتفاق يتعدّل
    const m = db.materials.find((x) => x.id === id);
    if (m && !price) setPrice(String(Math.round(m.avgCost * 100) / 100));
  };

  return (
    <Panel open title="أمر توريد جديد" onClose={onClose}>
      <Field label="المورّد">
        <select
          className="h-11 w-full rounded-md border border-border bg-card px-3 text-base"
          value={partyId}
          onChange={(e) => setPartyId(e.target.value)}
        >
          <option value="">اختار المورّد</option>
          {suppliers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="تاريخ الأمر">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="ميعاد التوريد المتفق عليه">
        <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
      </Field>
      <p className="mb-3 text-xs text-muted-foreground">
        الميعاد ده هو اللي بيخلّي «المورّد بيتأخر؟» سؤال ليه إجابة من الدفتر.
      </p>
      <Field label="الخامة">
        <select
          className="h-11 w-full rounded-md border border-border bg-card px-3 text-base"
          value={itemId}
          onChange={(e) => pickItem(e.target.value)}
        >
          <option value="">اختار الخامة</option>
          {db.materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={`الكمية${itemId ? ` (${supplyItemUnit(db, "material", itemId)})` : ""}`}>
        <Input type="number" inputMode="decimal" value={qtyOrdered} onChange={(e) => setQtyOrdered(e.target.value)} />
      </Field>
      <Field label="سعر الوحدة المتفق عليه">
        <Input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      </Field>
      <Field label="ملاحظات">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>
      <Button
        variant="gold"
        className="w-full"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          try {
            openSupplyOrder({
              partyId,
              date,
              expectedDate: expected || date,
              notes,
              lines: [
                {
                  itemType: "material",
                  itemId,
                  qtyOrdered: Number(qtyOrdered) || 0,
                  unitPrice: Number(price) || 0,
                  notes: "",
                },
              ],
            });
            toast.success("أمر التوريد اتفتح.");
            onClose();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "مانفعش نفتح الأمر.");
          } finally {
            setBusy(false);
          }
        }}
      >
        افتح الأمر
      </Button>
    </Panel>
  );
}

/* ── الدفعات ───────────────────────────────────────────────────── */

function Batches() {
  const { db } = useFactory();
  const rows = useMemo(() => batchList(db), [db]);
  const value = useMemo(() => stockValue(db), [db]);
  const recalls = useMemo(() => recallList(db), [db]);

  if (!rows.length) {
    return (
      <EmptyState
        icon={PackageSearch}
        title="مافيش دفعات لسه"
        body="الدفعة بتتعمل لوحدها مع كل استلام. من غيرها، «الخامة دي فيها مشكلة» سؤال مالوش إجابة: مش عارف أنهي توريد نزل أنهي أمر."
      />
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm">قيمة المخزون</p>
          <Money className="text-xl" value={value.total} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {value.coveragePct === null
            ? "مافيش رصيد يتقيّم"
            : `متتبّع بالدفعات ${qty(value.coveragePct, 0)}٪ بقيمة ${money(value.batchValue)} · والباقي بمتوسط التكلفة ${money(value.unbatchedValue)}`}
        </p>
        <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
          القيمة معروضة بشقّيها عن قصد: الجزء المتتبّع بتكلفته الحقيقية، والقديم بمتوسط. قيمة مبنية نص على متوسط مش زي
          قيمة مبنية كلها على دفعات، وإخفاء الفرق بيخلّي الرقم يبان أدق مما هو.
        </p>
      </Card>

      {recalls.length ? (
        <Card className="border-danger/40">
          <p className="text-sm">استدعاءات شغّالة</p>
          <ul className="mt-2 space-y-1.5">
            {recalls
              .filter((r) => r.recall.status === "open" || r.recall.status === "contained")
              .map((r) => (
                <li key={r.recall.id} className="text-sm">
                  <Link className="underline" to={`/supply/recall/${r.recall.id}`}>
                    <span className="latin">{r.recall.code}</span> — {r.batch?.name ?? "دفعة"}
                  </Link>
                  <span className="text-muted-foreground">
                    {" "}
                    · {r.recall.reason}
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      ) : null}

      {rows.map((v) => (
        <Card key={v.batch.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="latin text-sm text-muted-foreground">{v.batch.code}</span>
                <Badge tone={v.batch.status === "active" ? (v.expired ? "danger" : "ok") : "danger"}>
                  {v.expired ? "منتهية" : BATCH_STATUS_LABEL[v.batch.status]}
                </Badge>
              </div>
              <p className="mt-1">{v.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {v.partyName ? `${v.partyName} · ` : ""}
                {formatDate(v.batch.receivedDate)}
                {v.batch.supplierLot ? ` · لوط المورّد ${v.batch.supplierLot}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                دخل {qty(v.qtyIn, 2)} {v.unit} · اتصرف {qty(v.consumed, 2)} · باقي {qty(v.remaining, 2)}
                {v.orderCount > 0 ? ` · نزل ${qty(v.orderCount, 0)} أمر إنتاج` : ""}
              </p>
              {v.batch.notes ? <p className="mt-0.5 text-xs text-muted-foreground">{v.batch.notes}</p> : null}
            </div>
            <div className="shrink-0 text-left">
              <Money className="text-lg" value={v.value} />
              <p className="mt-0.5 text-xs text-muted-foreground">
                {money(v.batch.unitCost)} للـ{v.unit}
              </p>
              <Link className="mt-1 block text-xs underline" to={`/supply/batch/${v.batch.id}`}>
                اتبع الدفعة
              </Link>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ── المتاح فعلًا ──────────────────────────────────────────────── */

function Available() {
  const { db } = useFactory();
  const rows = useMemo(() => availability(db), [db]);
  const busy = rows.filter((r) => r.reserved > 0 || r.held > 0 || r.short);

  return (
    <div className="space-y-3">
      <Card>
        <p className="text-sm">الموجود مش المتاح</p>
        <p className="mt-1 text-xs text-muted-foreground">
          «عندي ٨٠٠ متر» جواب غلط لو ٥٠٠ منهم محجوزين لأوامر ماشية و٢٠ موقوفين في دفعة متستدعاة. الرقم اللي بتاخد عليه
          قرار بيع أو شراء هو المتاح.
        </p>
        <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
          والحجز محسوب مش مخزّن: احتياج الأوامر الشغّالة اللي لسه مااتصرفتش خاماتها.
        </p>
      </Card>

      {(busy.length ? busy : rows.slice(0, 8)).map((r) => (
        <Card key={r.materialId}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm">{r.name}</span>
            <span className={`shrink-0 tabular text-sm ${r.short ? "text-danger" : ""}`}>
              متاح {qty(r.available, 2)} {r.unit}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            موجود {qty(r.onHand, 2)}
            {r.reserved > 0 ? ` · محجوز ${qty(r.reserved, 2)}` : ""}
            {r.held > 0 ? ` · موقوف ${qty(r.held, 2)}` : ""}
            {r.incoming > 0 ? ` · جاي ${qty(r.incoming, 2)}` : ""}
          </p>
          {r.short ? (
            <p className="mt-1 text-xs text-danger">
              المحجوز أكبر من الموجود — أمر إنتاج مش هيلاقي خامته. اطلب توريد أو أجّل أمر.
            </p>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

/* ── التزام الموردين ──────────────────────────────────────────── */

function Suppliers() {
  const { db } = useFactory();
  const rows = useMemo(() => supplierDelivery(db), [db]);

  if (!rows.length) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          لسه مافيش أوامر توريد يتقاس عليها التزام. الالتزام بيتحسب من ميعاد الأمر مقابل تاريخ الاستلام.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <p className="text-sm">الميعاد لوحده مش تقييم</p>
        <p className="mt-1 text-xs text-muted-foreground">
          مورّد يوصل في ميعاده بالظبط وناقص ٣٠ متر وتالف ٢٠ مش مورّد ملتزم. عشان كده الجدول ده بيعرض التلاتة مع بعض:
          الميعاد، ونسبة المرفوض، وقيمة العجز.
        </p>
      </Card>

      {rows.map((r) => (
        <Card key={r.partyId}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Link className="text-sm underline" to={`/parties/${r.partyId}`}>
              {r.name}
            </Link>
            <span className="shrink-0 tabular text-sm text-muted-foreground">
              {r.onTimePct === null ? "لسه مافيش استلام" : `في الميعاد ${qty(r.onTimePct, 0)}٪`}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {qty(r.orders, 0)} أمر · اتأخر في {qty(r.late, 0)}
            {r.avgLateDays !== null ? ` بمتوسط ${qty(r.avgLateDays, 0)} يوم` : ""}
            {r.rejectPct !== null ? ` · مرفوض وتالف ${qty(r.rejectPct, 1)}٪` : ""}
          </p>
          {r.shortfallValue > 0 ? (
            <p className="mt-1 text-xs text-danger">
              كلّفنا <Money value={r.shortfallValue} /> مرفوض وتالف وعجز
            </p>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
