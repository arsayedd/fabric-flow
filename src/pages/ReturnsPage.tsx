import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MessageSquareWarning, Undo2 } from "lucide-react";
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
import { cairoToday, formatDate, money, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { datasetOf } from "@/store/datasets";
import {
  RETURN_MODULE,
  complaintSummary,
  itemName,
  partyName,
  reasonPareto,
  reasonsFor,
  returnImpact,
  returnsSummary,
  topReturnedModels,
  unitCostOf,
} from "@/store/returns";
import {
  COMPLAINT_KINDS,
  COMPLAINT_KIND_LABEL,
  COMPLAINT_STATUS_LABEL,
  METHOD_LABEL,
  PAY_METHODS,
  RETURN_CONDITION_LABEL,
  RETURN_REASON_DEFS,
  RETURN_RESOLUTIONS,
  RETURN_RESOLUTION_LABEL,
  RETURN_SOURCES,
  RETURN_SOURCE_LABEL,
  RETURN_STATUS_LABEL,
  type Complaint,
  type ComplaintKind,
  type PayMethod,
  type ReturnCondition,
  type ReturnEntry,
  type ReturnReason,
  type ReturnResolution,
  type Db,
  type ReturnSource,
} from "@/store/types";

/**
 * المرتجعات والشكاوى.
 *
 * الشاشة دي مبنية على تفرقة واحدة: **الوصول مش قرار.** المرتجع بيوصل،
 * وبعدين حد بيفحصه، وبعدين حد بياخد قرار — والفلوس والمخزن مابيتحركوش
 * غير في الخطوة التالتة. وعشان كده الكارت بيوضّح المرتجع واقف فين، وزر
 * الإجراء بيتغيّر مع الحالة بدل ما يبقى «تعديل» على كل حاجة.
 *
 * والتحليل جنبها مش زينة: أكثر الموديلات إرجاعًا وباريتو الأسباب هما
 * اللي بيحوّلوا المرتجعات من خسارة بتتسجّل لقرار على الخط.
 */

const STATUS_TONE: Record<ReturnEntry["status"], "muted" | "ok" | "warn" | "danger" | "gold"> = {
  open: "warn",
  inspected: "gold",
  settled: "ok",
  cancelled: "muted",
};

const TABS = [
  { id: "list", label: "المرتجعات" },
  { id: "models", label: "تحليل الموديلات" },
  { id: "reasons", label: "الأسباب" },
  { id: "complaints", label: "الشكاوى" },
] as const;

export function ReturnsPage() {
  const { db, can } = useFactory();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>(() =>
    params.get("tab") === "complaints" ? "complaints" : params.get("product") ? "models" : "list",
  );
  const [newOpen, setNewOpen] = useState(false);
  const [source, setSource] = useState<ReturnSource | "all">("all");

  /*
   * المصادر اللي الحساب ده مسموح له يشوفها.
   *
   * المرتجع بياخد صلاحية الطرف اللي جه منه، فاللي معاه المخازن بس يشوف
   * رجوع الخط ومايشوفش مرتجعات العملاء. والفلترة **قبل** أي حساب، عشان
   * كروت الملخص ماتقولش رقم فيه بيانات الحساب ده مش من حقه يشوفها.
   */
  const allowed = useMemo(() => RETURN_SOURCES.filter((x) => can.do(RETURN_MODULE[x], "view")), [can]);
  const visible = useMemo(() => db.returns.filter((r) => allowed.includes(r.source)), [db.returns, allowed]);
  const scoped = useMemo(() => ({ ...db, returns: visible }), [db, visible]);

  const s = useMemo(() => returnsSummary(scoped), [scoped]);
  const rows = useMemo(
    () =>
      visible
        .filter((r) => source === "all" || r.source === source)
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || b.code.localeCompare(a.code)),
    [visible, source],
  );
  const canCreate = allowed.some((x) => can.do(RETURN_MODULE[x], "create"));

  if (!allowed.length) {
    return (
      <EmptyState
        icon={Undo2}
        title="المرتجعات محتاجة صلاحية"
        body="كل مرتجع بياخد صلاحية الطرف اللي جه منه: مرتجع العميل صلاحية البيع، ومرتجع المورّد صلاحية المشتريات، ورجوع الخط صلاحية المخزون. اطلب واحدة منهم من صاحب المصنع."
      />
    );
  }

  const setTabAndUrl = (id: (typeof TABS)[number]["id"]) => {
    setTab(id);
    const next = new URLSearchParams(params);
    next.set("tab", id);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">المرتجعات والشكاوى</h2>
          <p className="text-sm text-muted-foreground">
            رجع إيه، منين، ليه، وكلّفنا كام. والفلوس والمخزن مابيتحركوش غير لما القرار يتاخد.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {/* التصدير بيطلّع الجدول اللي المستخدم شايفه، مش دايمًا المرتجعات */}
          <ExportMenu
            module="sales"
            dataset={() => datasetOf(scoped, tab === "complaints" ? "complaints" : "returns")}
          />
          {canCreate ? <Button onClick={() => setNewOpen(true)}>مرتجع جديد</Button> : null}
        </div>
      </div>

      {visible.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className={s.open ? "border-warn/40 bg-warn-soft/30" : ""}>
            <p className="text-sm text-muted-foreground">مستني فحص</p>
            <p className={`mt-1 text-2xl tabular ${s.open ? "text-warn" : ""}`}>{qty(s.open, 0)}</p>
            <p className="text-xs text-muted-foreground">{qty(s.inspected, 0)} متفحوص مستني قرار</p>
          </Card>
          <Card>
            <p className="text-sm text-muted-foreground">رجع في ٣٠ يوم</p>
            <p className="mt-1 text-2xl tabular">{qty(s.count30, 0)} مرتجع</p>
            <p className="text-xs text-muted-foreground">
              {qty(s.pieces30, 0)} قطعة منتجات ·{" "}
              {s.ratePct === null ? "مافيش كميات تسليم نقارن عليها" : `نسبة الإرجاع ${qty(s.ratePct, 1)}٪ في ٩٠ يوم`}
            </p>
          </Card>
          <Card className={s.impact30 > 0 ? "border-danger/30" : ""}>
            <p className="text-sm text-muted-foreground">أثر المرتجعات على الربح</p>
            <p className="mt-1 text-2xl">
              <Money value={s.impact30} />
            </p>
            <p className="text-xs text-muted-foreground">في ٣٠ يوم · الإجمالي {money(s.impactAll)}</p>
          </Card>
          <Card className={s.stale.length ? "border-danger/40 bg-danger-soft/30" : ""}>
            <p className="text-sm text-muted-foreground">قاعد بدون قرار</p>
            <p className={`mt-1 text-2xl tabular ${s.stale.length ? "text-danger" : ""}`}>{qty(s.stale.length, 0)}</p>
            <p className="text-xs text-muted-foreground">
              {s.stale.length ? `أقدمهم من ${formatDate(s.stale[s.stale.length - 1].date)}` : "مافيش مرتجع متعلّق"}
            </p>
          </Card>
        </div>
      ) : null}

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTabAndUrl(t.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
              tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "list" ? (
        !visible.length ? (
          <EmptyState
            icon={Undo2}
            title="مفيش مرتجعات مسجّلة"
            body="المرتجع بيقول: رجع كام، من مين، بأي سبب، وبأي حال. ومن السبب بيتحسب أكتر الموديلات إرجاعًا، ومن القرار بيتحرك الخصم والمخزن."
            action={canCreate ? { label: "سجّل مرتجع", onClick: () => setNewOpen(true) } : undefined}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {(["all", ...allowed] as const).map((x) => (
                <button
                  key={x}
                  onClick={() => setSource(x)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    source === x ? "border-gold bg-gold/10 text-gold" : "border-border text-muted-foreground"
                  }`}
                >
                  {x === "all" ? "الكل" : RETURN_SOURCE_LABEL[x]}
                </button>
              ))}
            </div>
            {rows.map((r) => (
              <ReturnCard key={r.id} r={r} />
            ))}
            {!rows.length ? <p className="text-sm text-muted-foreground">مافيش مرتجعات في التصنيف ده.</p> : null}
          </div>
        )
      ) : null}
      {tab === "models" ? <Models scoped={scoped} /> : null}
      {tab === "reasons" ? <Reasons scoped={scoped} /> : null}
      {tab === "complaints" ? <Complaints /> : null}

      <NewReturnPanel open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

/* ── كارت المرتجع ──────────────────────────────────────────────── */

function ReturnCard({ r }: { r: ReturnEntry }) {
  const { db, can, cancelReturn } = useFactory();
  const [inspectOpen, setInspectOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const impact = useMemo(() => returnImpact(db, r), [db, r]);
  const mod = RETURN_MODULE[r.source];
  const editable = can.do(mod, "edit");

  const cancel = () => {
    const reason = window.prompt("سبب الإلغاء؟");
    if (!reason?.trim()) return;
    try {
      cancelReturn(r.id, reason);
      toast.success("المرتجع اتلغى بسببه.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر ألغي المرتجع.");
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="latin text-sm text-muted-foreground">{r.code}</span>
            <Badge tone={STATUS_TONE[r.status]}>{RETURN_STATUS_LABEL[r.status]}</Badge>
            <Badge tone="muted">{RETURN_SOURCE_LABEL[r.source]}</Badge>
            {r.status !== "open" ? (
              <Badge tone={r.condition === "good" ? "ok" : "danger"}>{RETURN_CONDITION_LABEL[r.condition]}</Badge>
            ) : null}
          </div>
          <p className="mt-1 truncate">
            {qty(r.qty, 0)} × {itemName(db, r)}
          </p>
          <p className="text-sm text-muted-foreground">
            {partyName(db, r)} · {formatDate(r.date)} · {RETURN_REASON_DEFS[r.reason].label}
            {r.reasonNote ? ` — ${r.reasonNote}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-left">
          {r.resolution ? <Badge tone="gold">{RETURN_RESOLUTION_LABEL[r.resolution]}</Badge> : null}
          {impact.pending ? (
            <p className="mt-1 text-xs text-muted-foreground">الأثر مايتحسبش قبل القرار</p>
          ) : (
            <p className="mt-1 text-lg">
              <Money value={impact.total} />
            </p>
          )}
        </div>
      </div>

      {impact.lines.length ? (
        <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
          {impact.lines.map((l, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                {l.label}
                <span className="block text-xs text-muted-foreground">{l.why}</span>
              </span>
              <span className="shrink-0 tabular">{l.amount === 0 ? "—" : money(l.amount)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {impact.unknown ? <p className="mt-2 text-xs text-warn">{impact.unknown}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {r.status === "open" && editable ? <Button onClick={() => setInspectOpen(true)}>افحص</Button> : null}
        {r.status === "inspected" && editable ? <Button onClick={() => setSettleOpen(true)}>خُد قرار</Button> : null}
        {r.deliveryId ? (
          <Button variant="outline" asChild>
            <Link to="/collections">التوريد المربوط</Link>
          </Button>
        ) : null}
        {r.bundleId ? (
          <Button variant="outline" asChild>
            <Link to={`/trace/bundle/${r.bundleId}`}>تتبّع الباندل</Link>
          </Button>
        ) : null}
        {r.partyId ? (
          <Button variant="ghost" asChild>
            <Link to={`/parties/${r.partyId}`}>{partyName(db, r)}</Link>
          </Button>
        ) : null}
        {r.status !== "settled" && r.status !== "cancelled" && editable ? (
          <Button variant="dangerGhost" onClick={cancel}>
            إلغاء
          </Button>
        ) : null}
      </div>
      {r.status === "cancelled" && r.cancelReason ? (
        <p className="mt-2 text-xs text-muted-foreground">سبب الإلغاء: {r.cancelReason}</p>
      ) : null}

      <InspectPanel r={r} open={inspectOpen} onClose={() => setInspectOpen(false)} />
      <SettlePanel r={r} open={settleOpen} onClose={() => setSettleOpen(false)} />
    </Card>
  );
}

/* ── مرتجع جديد ────────────────────────────────────────────────── */

function NewReturnPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, can, addReturn } = useFactory();
  const [source, setSource] = useState<ReturnSource>("customer");
  const [date, setDate] = useState(cairoToday());
  const [partyId, setPartyId] = useState("");
  const [itemId, setItemId] = useState("");
  const [amount, setAmount] = useState("");
  const [unitValue, setUnitValue] = useState("");
  const [condition, setCondition] = useState<ReturnCondition>("defective");
  const [reason, setReason] = useState<ReturnReason>("quality");
  const [reasonNote, setReasonNote] = useState("");
  const [deliveryId, setDeliveryId] = useState("");
  const [costEntryId, setCostEntryId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [notes, setNotes] = useState("");

  const itemType = source === "customer" ? "product" : source === "supplier" ? "material" : "material";
  const items = itemType === "product" ? db.products : db.materials;
  const reasons = reasonsFor(source);
  const parties = db.parties.filter((p) =>
    source === "customer" ? p.roles.includes("customer") : p.roles.includes("supplier") || p.roles.includes("workshop"),
  );
  const deliveries = db.deliveries.filter((d) => d.clientId === partyId).sort((a, b) => b.date.localeCompare(a.date));
  const entries = db.costEntries.filter((e) => e.partyId === partyId).sort((a, b) => b.date.localeCompare(a.date));

  const pickSource = (next: ReturnSource) => {
    setSource(next);
    setPartyId("");
    setItemId("");
    setDeliveryId("");
    setCostEntryId("");
    const list = reasonsFor(next);
    if (!list.some((x) => x.reason === reason)) setReason(list[0].reason);
    if (next === "production") setCondition("good");
  };

  /* التوريد المختار بيقول سعر القطعة — أحسن من إن المستخدم يدوّر عليه */
  const pickDelivery = (id: string) => {
    setDeliveryId(id);
    const del = db.deliveries.find((d) => d.id === id);
    if (del && del.quantity) setUnitValue(String(Math.round(del.amount / del.quantity)));
  };

  const save = () => {
    try {
      addReturn({
        source,
        date,
        partyId: partyId || null,
        itemType,
        itemId,
        qty: Number(amount) || 0,
        condition,
        reason,
        reasonNote,
        unitValue: Number(unitValue) || 0,
        deliveryId: deliveryId || null,
        orderId: orderId || null,
        bundleId: null,
        costEntryId: costEntryId || null,
        issueId: null,
        notes,
      });
      toast.success("المرتجع اتسجّل. افحصه قبل القرار.");
      onClose();
      setAmount("");
      setUnitValue("");
      setReasonNote("");
      setNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر أسجّل المرتجع.");
    }
  };

  return (
    <Panel
      open={open}
      title="مرتجع جديد"
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={save} disabled={!can.do(RETURN_MODULE[source], "create")}>
          سجّل المرتجع
        </Button>
      }
    >
      <Field label="رجع من مين">
        <select className={selectClass} value={source} onChange={(e) => pickSource(e.target.value as ReturnSource)}>
          {RETURN_SOURCES.map((x) => (
            <option key={x} value={x}>
              {RETURN_SOURCE_LABEL[x]}
            </option>
          ))}
        </select>
      </Field>
      {!can.do(RETURN_MODULE[source], "create") ? (
        <p className="mb-3 text-sm text-danger">
          النوع ده محتاج صلاحية «{source === "customer" ? "المنتجات والبيع" : source === "supplier" ? "المشتريات" : "المخزون"}».
        </p>
      ) : null}
      <Field label="التاريخ">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="latin" max={cairoToday()} />
      </Field>
      {source !== "production" ? (
        <Field label={source === "customer" ? "العميل" : "المورّد"}>
          <select className={selectClass} value={partyId} onChange={(e) => setPartyId(e.target.value)}>
            <option value="">اختار…</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {source === "customer" && partyId ? (
        <Field label="التوريد اللي القطعة خرجت فيه">
          <select className={selectClass} value={deliveryId} onChange={(e) => pickDelivery(e.target.value)}>
            <option value="">مش محدد</option>
            {deliveries.map((d) => (
              <option key={d.id} value={d.id}>
                {d.model} — {qty(d.quantity ?? 0, 0)} قطعة · {formatDate(d.date)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            لو حدّدته، النظام مايسمحش ترجّع كمية أكتر من اللي اتسلّم فعلًا.
          </p>
        </Field>
      ) : null}
      {source === "supplier" && partyId ? (
        <Field label="فاتورة الشراء">
          <select className={selectClass} value={costEntryId} onChange={(e) => setCostEntryId(e.target.value)}>
            <option value="">مش محدد</option>
            {entries.map((e) => (
              <option key={e.id} value={e.id}>
                {money(e.amount)} · {formatDate(e.date)} {e.notes ? `— ${e.notes}` : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">إشعار الخصم بيتخصم من الفاتورة دي بالتحديد.</p>
        </Field>
      ) : null}
      <Field label={itemType === "product" ? "المنتج الراجع" : "الخامة الراجعة"}>
        <select className={selectClass} value={itemId} onChange={(e) => setItemId(e.target.value)}>
          <option value="">اختار…</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="الكمية">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="قيمة الوحدة">
          <Input value={unitValue} onChange={(e) => setUnitValue(e.target.value)} inputMode="decimal" />
        </Field>
      </div>
      <Field label="أمر الإنتاج (لو معروف)">
        <select className={selectClass} value={orderId} onChange={(e) => setOrderId(e.target.value)}>
          <option value="">مش محدد</option>
          {db.orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.code} — {o.model}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">منه بتتحسب تكلفة القطعة، فأثر المرتجع يطلع بالتكلفة الحقيقية.</p>
      </Field>
      <Field label="السبب">
        <select className={selectClass} value={reason} onChange={(e) => setReason(e.target.value as ReturnReason)}>
          {reasons.map((x) => (
            <option key={x.reason} value={x.reason}>
              {x.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          السبب من قايمة مقفولة عشان تحليل «أكثر الموديلات إرجاعًا» يبقى له معنى. التفاصيل تحت.
        </p>
      </Field>
      <Field label="تفاصيل السبب">
        <Input value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} placeholder="الدرزة بتفتح من تحت الكم" />
      </Field>
      <Field label="ملاحظات">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>
      <p className="text-sm text-muted-foreground">
        التسجيل ده مابيحركش فلوس ولا مخزون. الفحص بيحدد الحالة، والقرار بعده هو اللي بيخصم أو يرجّع للمخزن.
      </p>
    </Panel>
  );
}

/* ── الفحص ─────────────────────────────────────────────────────── */

function InspectPanel({ r, open, onClose }: { r: ReturnEntry; open: boolean; onClose: () => void }) {
  const { inspectReturn } = useFactory();
  const [condition, setCondition] = useState<ReturnCondition>(r.condition);
  const [amount, setAmount] = useState(String(r.qty));
  const [notes, setNotes] = useState("");

  const save = () => {
    try {
      inspectReturn(r.id, { condition, qty: Number(amount) || 0, notes });
      toast.success("الفحص اتسجّل. القرار بقى متاح.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر أسجّل الفحص.");
    }
  };

  return (
    <Panel
      open={open}
      title="فحص المرتجع"
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={save}>
          سجّل الفحص
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        الفحص بيحدد حاجتين: رجع بأي حال فعلًا، والكمية اللي اتأكدت. ومنهم بيتحدد ينفع يرجع المخزون ولا لأ.
      </p>
      <Field label="الحالة">
        <select className={selectClass} value={condition} onChange={(e) => setCondition(e.target.value as ReturnCondition)}>
          <option value="good">{RETURN_CONDITION_LABEL.good} — ينفع يتباع تاني</option>
          <option value="defective">{RETURN_CONDITION_LABEL.defective} — ماينفعش يرجع المخزون</option>
        </select>
      </Field>
      <Field label="الكمية المتأكدة">
        <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        <p className="mt-1 text-xs text-muted-foreground">جه {qty(r.qty, 0)} — الفحص ينقّص ومايزوّدش.</p>
      </Field>
      <Field label="ملاحظات الفحص">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>
    </Panel>
  );
}

/* ── القرار ────────────────────────────────────────────────────── */

function SettlePanel({ r, open, onClose }: { r: ReturnEntry; open: boolean; onClose: () => void }) {
  const { db, settleReturn, computed } = useFactory();
  const [resolution, setResolution] = useState<ReturnResolution>(r.source === "supplier" ? "credit" : "credit");
  const [settleAmount, setSettleAmount] = useState(String(Math.round(r.qty * r.unitValue)));
  const [accountId, setAccountId] = useState(db.accounts[0]?.id ?? "");
  const [method, setMethod] = useState<PayMethod>("cash");
  const [extraCost, setExtraCost] = useState("0");
  const [extraNote, setExtraNote] = useState("");
  const [restock, setRestock] = useState(r.condition === "good");
  const [replacementQty, setReplacementQty] = useState(String(r.qty));
  const [notes, setNotes] = useState("");

  const money$ = resolution === "credit" || resolution === "refund";
  const balances = computed.accounts;
  const unitCost = unitCostOf(db, r);

  const save = () => {
    try {
      settleReturn(r.id, {
        resolution,
        settleAmount: money$ ? Number(settleAmount) || 0 : 0,
        accountId: resolution === "refund" ? accountId : null,
        method: resolution === "refund" ? method : null,
        extraCost: Number(extraCost) || 0,
        extraNote,
        restock,
        warehouseId: null,
        replacementQty: Number(replacementQty) || 0,
        notes,
      });
      toast.success("القرار اتسجّل وأثره اتحرك.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر أسجّل القرار.");
    }
  };

  const options = RETURN_RESOLUTIONS.filter((x) => (r.source === "production" ? x === "credit" || x === "scrap" || x === "reject" : true));

  return (
    <Panel
      open={open}
      title="قرار المرتجع"
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={save}>
          سجّل القرار
        </Button>
      }
    >
      <div className="mb-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
        <p>
          <span className="latin">{r.code}</span> · {qty(r.qty, 0)} × {itemName(db, r)}
        </p>
        <p className="text-muted-foreground">
          {partyName(db, r)} · {RETURN_CONDITION_LABEL[r.condition]} · قيمة البيع {money(r.qty * r.unitValue)}
          {unitCost > 0 ? ` · تكلفة القطعة ${money(unitCost)}` : ""}
        </p>
      </div>
      <Field label="القرار">
        <select className={selectClass} value={resolution} onChange={(e) => setResolution(e.target.value as ReturnResolution)}>
          {options.map((x) => (
            <option key={x} value={x}>
              {RETURN_RESOLUTION_LABEL[x]}
            </option>
          ))}
        </select>
      </Field>
      {money$ ? (
        <Field label={resolution === "credit" ? "مبلغ الخصم" : "المبلغ المردود"}>
          <Input value={settleAmount} onChange={(e) => setSettleAmount(e.target.value)} inputMode="decimal" />
          <p className="mt-1 text-xs text-muted-foreground">
            {resolution === "credit"
              ? r.source === "supplier"
                ? "بيقلّل المستحق على فاتورة الشراء."
                : "بيقلّل مديونية العميل زي التحصيل بالظبط، بدون ما فلوس تتحرك."
              : "فلوس هتطلع من الخزنة فعلًا."}
          </p>
        </Field>
      ) : null}
      {resolution === "refund" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="من خزنة">
            <select className={selectClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {balances.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {money(a.balance)}
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
        </div>
      ) : null}
      {resolution === "replacement" ? (
        <Field label="كمية البديل">
          <Input value={replacementQty} onChange={(e) => setReplacementQty(e.target.value)} inputMode="decimal" />
          <p className="mt-1 text-xs text-muted-foreground">
            البديل بيتسجّل هنا كالتزام، بس مابيفتحش أمر إنتاج لوحده — لسه محتاج تخطّطه في أمر.
          </p>
        </Field>
      ) : null}
      <Field label="رجع المخزون؟">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={restock}
            onChange={(e) => setRestock(e.target.checked)}
            disabled={r.condition === "defective"}
            className="h-4 w-4"
          />
          {r.condition === "defective"
            ? "الفحص قال إنه تالف — ماينفعش يرجع المخزون"
            : `أضف ${qty(r.qty, 0)} للمخزون بحركة مرتجع`}
        </label>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="مصاريف المرتجع">
          <Input value={extraCost} onChange={(e) => setExtraCost(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="بيان المصاريف">
          <Input value={extraNote} onChange={(e) => setExtraNote(e.target.value)} placeholder="شحن الرجوع" />
        </Field>
      </div>
      <Field label="ملاحظات القرار">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>
    </Panel>
  );
}

/* ── تحليل الموديلات ──────────────────────────────────────────── */

function Models({ scoped }: { scoped: Db }) {
  const rows = useMemo(() => topReturnedModels(scoped), [scoped]);

  if (!rows.length) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          مافيش مرتجعات على منتجات لسه. التحليل ده بيرتّب الموديلات بنسبة الإرجاع مش بالكمية، لأن موديل باع ٥٠٠٠
          ورجع منه ٥٠ أحسن من موديل باع ٢٠٠ ورجع منه ٢٠.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        مرتّب بنسبة الإرجاع، والنسبة محسوبة على الكميات المتسلّمة للعميل — مش على الكمية المنتَجة.
      </p>
      {rows.map((m) => (
        <Card key={m.productId}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate">{m.name}</p>
              <p className="text-sm text-muted-foreground">
                <span className="latin">{m.sku}</span> · رجع {qty(m.qty, 0)} من {qty(m.soldQty, 0)} متسلّمة
                {m.topReason ? ` · أشهر سبب: ${m.topReason.label}` : ""}
              </p>
            </div>
            <div className="shrink-0 text-left">
              {m.ratePct === null ? (
                <Badge tone="muted">مافيش تسليم نقارن عليه</Badge>
              ) : (
                <Badge tone={m.ratePct >= 10 ? "danger" : m.ratePct >= 5 ? "warn" : "ok"}>{qty(m.ratePct, 1)}٪ إرجاع</Badge>
              )}
              <p className="mt-1 text-sm">
                أثره <Money value={m.impact} />
              </p>
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <Button variant="outline" asChild>
              <Link to={`/costing/${m.productId}`}>ورقة التكلفة والربحية</Link>
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ── الأسباب ───────────────────────────────────────────────────── */

function Reasons({ scoped }: { scoped: Db }) {
  const [source, setSource] = useState<ReturnSource | "all">("all");
  const rows = useMemo(() => reasonPareto(scoped, source), [scoped, source]);
  const eighty = rows.findIndex((r) => r.cumPct >= 80);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {(["all", ...RETURN_SOURCES] as const).map((x) => (
          <button
            key={x}
            onClick={() => setSource(x)}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              source === x ? "border-gold bg-gold/10 text-gold" : "border-border text-muted-foreground"
            }`}
          >
            {x === "all" ? "الكل" : RETURN_SOURCE_LABEL[x]}
          </button>
        ))}
      </div>
      {!rows.length ? (
        <Card>
          <p className="text-sm text-muted-foreground">مافيش مرتجعات في التصنيف ده.</p>
        </Card>
      ) : (
        <Card>
          {eighty >= 0 ? (
            <p className="mb-3 text-sm">
              أول {qty(eighty + 1, 0)} سبب بيعملوا {qty(rows[eighty].cumPct, 0)}٪ من المرتجعات — الشغل عليهم بيقفل
              معظم الخسارة.
            </p>
          ) : null}
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.reason}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span>{r.label}</span>
                  <span className="shrink-0 tabular text-muted-foreground">
                    {qty(r.qty, 0)} قطعة · {qty(r.pct, 0)}٪ · متراكم {qty(r.cumPct, 0)}٪
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(100, r.pct)}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {qty(r.count, 0)} مرتجع · أثره {money(r.impact)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/* ── الشكاوى ───────────────────────────────────────────────────── */

function Complaints() {
  const { db, can } = useFactory();
  const [open, setOpen] = useState(false);
  const s = useMemo(() => complaintSummary(db), [db]);
  const rows = useMemo(() => [...db.complaints].sort((a, b) => b.date.localeCompare(a.date)), [db.complaints]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          مش كل شكوى معاها قطعة راجعة: التأخير والفاتورة والتعامل شكاوى بدون كمية — وهي اللي بتسبق فقدان العميل.
        </p>
        {can.do("parties", "create") ? <Button onClick={() => setOpen(true)}>شكوى جديدة</Button> : null}
      </div>

      {db.complaints.length ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <p className="text-sm text-muted-foreground">مفتوحة</p>
            <p className="mt-1 text-2xl tabular">{qty(s.open + s.investigating, 0)}</p>
            <p className="text-xs text-muted-foreground">{qty(s.investigating, 0)} تحت الفحص</p>
          </Card>
          <Card className={s.overdue.length ? "border-danger/40 bg-danger-soft/30" : ""}>
            <p className="text-sm text-muted-foreground">فات ميعادها</p>
            <p className={`mt-1 text-2xl tabular ${s.overdue.length ? "text-danger" : ""}`}>{qty(s.overdue.length, 0)}</p>
            <p className="text-xs text-muted-foreground">
              {s.avgDays === null ? "مافيش شكاوى اتحلّت بعد" : `متوسط الحل ${qty(s.avgDays, 0)} يوم`}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-muted-foreground">مطالبات مالية</p>
            <p className="mt-1 text-2xl">
              <Money value={s.claimTotal} />
            </p>
            <p className="text-xs text-muted-foreground">على الشكاوى اللي لسه مش مقفولة</p>
          </Card>
        </div>
      ) : null}

      {!rows.length ? (
        <EmptyState
          icon={MessageSquareWarning}
          title="مفيش شكاوى مسجّلة"
          body="الشكوى بتتسجّل وليها مسؤول وميعاد، وبتتقفل باللي اتعمل فعلًا — عشان تعرف بعد كده أي عميل اشتكى كام مرة وعلى إيه."
          action={can.do("parties", "create") ? { label: "شكوى جديدة", onClick: () => setOpen(true) } : undefined}
        />
      ) : (
        rows.map((c) => <ComplaintCard key={c.id} c={c} />)
      )}

      <NewComplaintPanel open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function ComplaintCard({ c }: { c: Complaint }) {
  const { db, can, updateComplaint } = useFactory();
  const [resolution, setResolution] = useState(c.resolution);
  const [editing, setEditing] = useState(false);
  const party = db.parties.find((p) => p.id === c.partyId);
  const owner = db.members.find((m) => m.id === c.ownerId);
  const overdue = c.dueDate && c.dueDate < cairoToday() && c.status !== "resolved" && c.status !== "closed";

  const set = (patch: Parameters<typeof updateComplaint>[1]) => {
    try {
      updateComplaint(c.id, patch);
      toast.success("الشكوى اتحدّثت.");
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر أحدّث الشكوى.");
    }
  };

  return (
    <Card className={overdue ? "border-danger/40" : ""}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="latin text-sm text-muted-foreground">{c.code}</span>
            <Badge tone={c.status === "open" ? "warn" : c.status === "investigating" ? "gold" : "ok"}>
              {COMPLAINT_STATUS_LABEL[c.status]}
            </Badge>
            <Badge tone="muted">{COMPLAINT_KIND_LABEL[c.kind]}</Badge>
            {c.severity === "high" ? <Badge tone="danger">خطيرة</Badge> : null}
          </div>
          <p className="mt-1">{c.subject}</p>
          <p className="text-sm text-muted-foreground">{c.detail}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {party?.name ?? "جهة محذوفة"} · {formatDate(c.date)}
            {owner ? ` · مسؤولها ${owner.name}` : ""}
            {c.dueDate ? ` · ميعادها ${formatDate(c.dueDate)}` : ""}
          </p>
        </div>
        {c.claimAmount > 0 ? (
          <p className="shrink-0 text-lg">
            <Money value={c.claimAmount} />
          </p>
        ) : null}
      </div>

      {c.resolution ? <p className="mt-2 border-t border-border pt-2 text-sm">اللي اتعمل: {c.resolution}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {c.returnId ? (
          <Badge tone="muted">مربوطة بمرتجع {db.returns.find((r) => r.id === c.returnId)?.code ?? ""}</Badge>
        ) : null}
        <Button variant="ghost" asChild>
          <Link to={`/parties/${c.partyId}`}>بروفايل الجهة</Link>
        </Button>
        {c.status !== "closed" && can.do("parties", "edit") ? (
          <>
            {c.status === "open" ? <Button variant="outline" onClick={() => set({ status: "investigating" })}>ابدأ فحصها</Button> : null}
            <Button onClick={() => setEditing(true)}>{c.status === "resolved" ? "اقفلها" : "اقفلها بالحل"}</Button>
          </>
        ) : null}
      </div>

      <Panel
        open={editing}
        title="قفل الشكوى"
        onClose={() => setEditing(false)}
        footer={
          <Button className="w-full" onClick={() => set({ status: c.status === "resolved" ? "closed" : "resolved", resolution })}>
            {c.status === "resolved" ? "اقفل الشكوى" : "سجّل الحل"}
          </Button>
        }
      >
        <p className="mb-3 text-sm text-muted-foreground">
          الشكوى مابتتقفلش بدون سطر بيقول اتعمل إيه — ده اللي بيخلّي الشكوى القديمة تفيد لما تتكرر.
        </p>
        <Field label="اللي اتعمل">
          <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3} />
        </Field>
      </Panel>
    </Card>
  );
}

function NewComplaintPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, addComplaint } = useFactory();
  const [partyId, setPartyId] = useState("");
  const [date, setDate] = useState(cairoToday());
  const [kind, setKind] = useState<ComplaintKind>("quality");
  const [severity, setSeverity] = useState<Complaint["severity"]>("medium");
  const [subject, setSubject] = useState("");
  const [detail, setDetail] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [claimAmount, setClaimAmount] = useState("0");
  const [returnId, setReturnId] = useState("");

  const save = () => {
    try {
      addComplaint({
        partyId,
        date,
        kind,
        severity,
        subject,
        detail,
        deliveryId: null,
        orderId: null,
        returnId: returnId || null,
        ownerId: ownerId || null,
        dueDate: dueDate || null,
        claimAmount: Number(claimAmount) || 0,
      });
      toast.success("الشكوى اتسجّلت.");
      onClose();
      setSubject("");
      setDetail("");
      setClaimAmount("0");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر أسجّل الشكوى.");
    }
  };

  return (
    <Panel
      open={open}
      title="شكوى جديدة"
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={save}>
          سجّل الشكوى
        </Button>
      }
    >
      <Field label="الجهة">
        <select className={selectClass} value={partyId} onChange={(e) => setPartyId(e.target.value)}>
          <option value="">اختار…</option>
          {db.parties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="التاريخ">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="latin" />
        </Field>
        <Field label="النوع">
          <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as ComplaintKind)}>
            {COMPLAINT_KINDS.map((k) => (
              <option key={k} value={k}>
                {COMPLAINT_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="الموضوع">
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="درزة بتفتح في القمصان" />
      </Field>
      <Field label="التفاصيل">
        <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="الخطورة">
          <select className={selectClass} value={severity} onChange={(e) => setSeverity(e.target.value as Complaint["severity"])}>
            <option value="low">بسيطة</option>
            <option value="medium">متوسطة</option>
            <option value="high">خطيرة</option>
          </select>
        </Field>
        <Field label="مسؤولها">
          <select className={selectClass} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">مش محدد</option>
            {db.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="ميعاد الرد">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="latin" />
        </Field>
        <Field label="مطالبة مالية">
          <Input value={claimAmount} onChange={(e) => setClaimAmount(e.target.value)} inputMode="decimal" />
        </Field>
      </div>
      <Field label="مربوطة بمرتجع">
        <select className={selectClass} value={returnId} onChange={(e) => setReturnId(e.target.value)}>
          <option value="">مش مربوطة</option>
          {db.returns.map((r) => (
            <option key={r.id} value={r.id}>
              {r.code} — {qty(r.qty, 0)} قطعة
            </option>
          ))}
        </select>
      </Field>
    </Panel>
  );
}
