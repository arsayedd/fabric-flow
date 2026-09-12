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
import { cairoToday, formatDate, imageToThumb, money, qty } from "@/lib/utils";
import { useFactory, type RepairInput } from "@/store/context";
import { datasetOf } from "@/store/datasets";
import {
  RETURN_MODULE,
  complaintSummary,
  costBreakdown,
  itemName,
  partyName,
  reasonPareto,
  reasonsFor,
  repairCost,
  repairsOf,
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
  PROBLEM_CATEGORY_LABEL,
  PROBLEM_DEFS,
  PROBLEM_KINDS,
  PROBLEM_ORIGINS,
  PROBLEM_ORIGIN_LABEL,
  PRODUCTION_LINES,
  REPAIR_DERIVED_COSTS,
  REPAIR_STATUS_LABEL,
  ROOT_CAUSES,
  ROOT_CAUSE_LABEL,
  RETURN_CONDITION_LABEL,
  RETURN_COST_KINDS,
  RETURN_COST_LABEL,
  RETURN_REASON_DEFS,
  RETURN_RESOLUTIONS,
  RETURN_RESOLUTION_LABEL,
  RETURN_SOURCES,
  RETURN_SOURCE_LABEL,
  RETURN_STATUS_LABEL,
  type AttachmentPhase,
  type Complaint,
  type ComplaintKind,
  type PayMethod,
  type ReturnCostKind,
  type ProblemKind,
  type ProblemOrigin,
  type RootCause,
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
  const [newOpen, setNewOpen] = useState(() => params.get("new") === "1");
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
  const [caseOpen, setCaseOpen] = useState(false);
  const impact = useMemo(() => returnImpact(db, r), [db, r]);
  const reps = useMemo(() => repairsOf(db, r.id), [db, r.id]);
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
            {r.color || r.size ? (
              <span className="text-muted-foreground"> · {[r.color, r.size].filter(Boolean).join(" / ")}</span>
            ) : null}
          </p>
          <p className="text-sm text-muted-foreground">
            {partyName(db, r)} · {formatDate(r.date)} · {RETURN_REASON_DEFS[r.reason].label}
            {r.reasonNote ? ` — ${r.reasonNote}` : ""}
          </p>
          {r.problem ? (
            <p className="mt-1 text-sm">
              {PROBLEM_DEFS[r.problem].label}
              <span className="text-muted-foreground">
                {" · "}
                {r.origin ? `من ${PROBLEM_ORIGIN_LABEL[r.origin]}` : "المصدر مش مكتوب"}
                {" · "}
                {r.rootCause ? ROOT_CAUSE_LABEL[r.rootCause] : "الجذر لسه مش محدَّد"}
              </span>
            </p>
          ) : null}
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
        <Button variant="outline" onClick={() => setCaseOpen(true)}>
          التكلفة والإثبات
          {r.costs.length || r.attachments.length ? (
            <span className="tabular">
              {" "}
              ({qty(r.costs.length + r.attachments.length, 0)})
            </span>
          ) : null}
        </Button>
        {reps.length ? (
          <Button variant="ghost" asChild>
            <Link to="/repairs">
              {qty(reps.length, 0)} أمر إصلاح
            </Link>
          </Button>
        ) : null}
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
      <CasePanel r={r} open={caseOpen} onClose={() => setCaseOpen(false)} />
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
  const [bundleId, setBundleId] = useState("");
  const [problem, setProblem] = useState<ProblemKind | "">("");
  const [origin, setOrigin] = useState<ProblemOrigin | "">("");
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [line, setLine] = useState("");
  const [ownerId, setOwnerId] = useState("");
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

  /* أمر الإنتاج بيعرف خطه، فمافيش داعي المستخدم يختاره تاني */
  const pickOrder = (id: string) => {
    setOrderId(id);
    setBundleId("");
    const order = db.orders.find((o) => o.id === id);
    if (order?.line) setLine(order.line);
  };

  /*
   * الباندل هو **مفتاح التتبع**: منه سلسلة كاملة للقص والفرشة والرول
   * والعملية والعامل. وهو كمان بيعرف لونه ومقاسه، فاختياره بيملّي
   * الخانتين دول — الكتابة بالإيد هنا مصدر تناقض مش مصدر معلومة.
   */
  const pickBundle = (id: string) => {
    setBundleId(id);
    const b = db.bundles.find((x) => x.id === id);
    if (!b) return;
    setColor(b.color);
    setSize(b.size);
  };

  const bundles = db.bundles.filter((b) => b.orderId === orderId);

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
        bundleId: bundleId || null,
        costEntryId: costEntryId || null,
        issueId: null,
        problem: problem || null,
        origin: origin || null,
        color,
        size,
        line,
        operationId: null,
        workerId: null,
        ownerId: ownerId || null,
        notes,
      });
      toast.success("المرتجع اتسجّل. افحصه قبل القرار.");
      onClose();
      setAmount("");
      setUnitValue("");
      setReasonNote("");
      setColor("");
      setSize("");
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="اللون">
          <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="كحلي" />
        </Field>
        <Field label="المقاس">
          <Input value={size} onChange={(e) => setSize(e.target.value)} placeholder="L" />
        </Field>
      </div>
      <Field label="أمر الإنتاج (لو معروف)">
        <select className={selectClass} value={orderId} onChange={(e) => pickOrder(e.target.value)}>
          <option value="">مش محدد</option>
          {db.orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.code} — {o.model}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">منه بتتحسب تكلفة القطعة، فأثر المرتجع يطلع بالتكلفة الحقيقية.</p>
      </Field>
      {orderId && bundles.length ? (
        <Field label="الباندل">
          <select className={selectClass} value={bundleId} onChange={(e) => pickBundle(e.target.value)}>
            <option value="">مش محدد</option>
            {bundles.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} — {b.color} / {b.size} · {qty(b.qty, 0)} قطعة
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            ده مفتاح التتبع: منه تعرف القطعة اتقصّت في أي فرشة، ومشيت على أي عملية، ومين شغّل عليها — فتعرف المشكلة
            بدأت فين بالظبط.
          </p>
        </Field>
      ) : null}
      <Field label="خط الإنتاج">
        <select className={selectClass} value={line} onChange={(e) => setLine(e.target.value)}>
          <option value="">مش محدد</option>
          {PRODUCTION_LINES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
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
      <Field label="المشكلة إيه (لو باينة دلوقتي)">
        <select className={selectClass} value={problem} onChange={(e) => setProblem(e.target.value as ProblemKind | "")}>
          <option value="">مستني الفحص</option>
          {PROBLEM_KINDS.map((k) => (
            <option key={k} value={k}>
              {PROBLEM_DEFS[k].label} — {PROBLEM_CATEGORY_LABEL[PROBLEM_DEFS[k].category]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          سيبها فاضية لو لسه محدش بصّ على القطعة. الفحص هو اللحظة المفروض فيها تتحدد، ومش كل مرتجع فيه عيب أصلًا.
        </p>
      </Field>
      <Field label="جات منين">
        <select className={selectClass} value={origin} onChange={(e) => setOrigin(e.target.value as ProblemOrigin | "")}>
          <option value="">مستني الفحص</option>
          {PROBLEM_ORIGINS.map((o) => (
            <option key={o} value={o}>
              {PROBLEM_ORIGIN_LABEL[o]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="مسؤول متابعة الحالة">
        <select className={selectClass} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
          <option value="">مش محدد</option>
          {db.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
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
  const { db, inspectReturn } = useFactory();
  const [condition, setCondition] = useState<ReturnCondition>(r.condition);
  const [amount, setAmount] = useState(String(r.qty));
  const [problem, setProblem] = useState<ProblemKind | "">(r.problem ?? "");
  const [origin, setOrigin] = useState<ProblemOrigin | "">(r.origin ?? "");
  const [rootCause, setRootCause] = useState<RootCause | "">(r.rootCause ?? "");
  const [operationId, setOperationId] = useState(r.operationId ?? "");
  const [workerId, setWorkerId] = useState(r.workerId ?? "");
  const [notes, setNotes] = useState("");

  const save = () => {
    try {
      inspectReturn(r.id, {
        condition,
        qty: Number(amount) || 0,
        problem: problem || null,
        origin: origin || null,
        rootCause: rootCause || null,
        operationId: operationId || null,
        workerId: workerId || null,
        notes,
      });
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
      <Field label={condition === "defective" ? "المشكلة إيه (مطلوبة)" : "المشكلة إيه"}>
        <select className={selectClass} value={problem} onChange={(e) => setProblem(e.target.value as ProblemKind | "")}>
          <option value="">مافيش عيب</option>
          {PROBLEM_KINDS.map((k) => (
            <option key={k} value={k}>
              {PROBLEM_DEFS[k].label} — {PROBLEM_CATEGORY_LABEL[PROBLEM_DEFS[k].category]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          {condition === "defective"
            ? "القطعة تالفة، فالمشكلة لازم تتقال — من غيرها المرتجع ده مش داخل في تحليل الجودة ولا في باريتو المشاكل."
            : "القطعة سليمة، فممكن تكون رجعت بدون عيب خالص — زي عميل غيّر رأيه."}
        </p>
      </Field>
      <Field label="جات منين">
        <select className={selectClass} value={origin} onChange={(e) => setOrigin(e.target.value as ProblemOrigin | "")}>
          <option value="">مش محدد</option>
          {PROBLEM_ORIGINS.map((o) => (
            <option key={o} value={o}>
              {PROBLEM_ORIGIN_LABEL[o]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="وليه حصلت">
        <select className={selectClass} value={rootCause} onChange={(e) => setRootCause(e.target.value as RootCause | "")}>
          <option value="">لسه مش محدَّد</option>
          {ROOT_CAUSES.map((c) => (
            <option key={c} value={c}>
              {ROOT_CAUSE_LABEL[c]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          «عيب خياطة من العامل» مكان مش سبب. الجذر هنا هو اللي بيمنع نفس المشكلة ترجع الشهر الجاي.
        </p>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="العملية">
          <select className={selectClass} value={operationId} onChange={(e) => setOperationId(e.target.value)}>
            <option value="">مش محددة</option>
            {db.operations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="العامل">
          <select className={selectClass} value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
            <option value="">مش محدد</option>
            {db.workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        ربط العامل ادّعاء له نتيجة: بيدخل في ملف جودته. ماتحدّدهوش غير لو فعلًا متأكد، وسيبه فاضي لو المشكلة من العملية
        نفسها مش من اللي عملها.
      </p>
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
      <p className="mb-3 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        مصاريف المرتجع بقت بنود منفصلة بتتسجّل من كارت الحالة نفسه — شحن رجوع، فحص، هالك — عشان تعرف المشكلة كلّفت كام
        وفين بالظبط، مش رقم واحد مجمّع.
      </p>
      <Field label="ملاحظات القرار">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>
    </Panel>
  );
}

/* ── تكلفة الحالة وإثباتها ────────────────────────────────────── */

/**
 * الشاشة اللي بتحوّل «رجع ١٠٠ قطعة» لـ«المشكلة دي كلّفت المصنع كام».
 *
 * والتكلفة هنا **سطور**: شحن رجوع، فحص، هالك، مصاريف إدارية. وسطرين
 * منهم — أجر الإصلاح وخاماته — مقفولين للكتابة لما يبقى فيه أمر إصلاح،
 * لأنهم بيتحسبوا منه؛ والرقم اللي بيتعدّ مرتين أخطر من الرقم الناقص.
 */
function CasePanel({ r, open, onClose }: { r: ReturnEntry; open: boolean; onClose: () => void }) {
  const { db, can, addReturnCost, removeReturnCost, addAttachment, removeAttachment, openRepair } = useFactory();
  const [kind, setKind] = useState<ReturnCostKind>("shipping_in");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<AttachmentPhase>("before");
  const [busy, setBusy] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);

  const editable = can.do(RETURN_MODULE[r.source], "edit");
  const breakdown = useMemo(() => costBreakdown(db, r), [db, r]);
  const reps = useMemo(() => repairsOf(db, r.id), [db, r.id]);
  const repairedQty = reps.filter((x) => x.status !== "cancelled").reduce((s, x) => s + x.qty, 0);

  const addCost = () => {
    try {
      addReturnCost(r.id, { kind, amount: Number(amount) || 0, note });
      setAmount("");
      setNote("");
      toast.success("البند اتسجّل.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر أسجّل البند.");
    }
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await imageToThumb(file);
      addAttachment(r.id, { name: file.name, phase, dataUrl, note: "" });
      toast.success(phase === "before" ? "صورة قبل الإصلاح اتسجّلت." : "صورة بعد الإصلاح اتسجّلت.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر أضيف الصورة.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel open={open} title={`تكلفة الحالة وإثباتها — ${r.code}`} onClose={onClose}>
      <div className="mb-4 rounded-md border border-border bg-muted/40 p-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-muted-foreground">إجمالي تكلفة الحالة</span>
          <span className="text-lg">
            <Money value={breakdown.total} />
          </span>
        </div>
        {breakdown.lines.length ? (
          <ul className="mt-2 space-y-1.5 border-t border-border pt-2 text-sm">
            {breakdown.lines.map((l, i) => (
              <li key={`${l.kind}-${i}`} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  {l.label}
                  {l.note ? <span className="text-muted-foreground"> — {l.note}</span> : null}
                  {l.fromRepair ? <span className="text-xs text-muted-foreground"> (من أمر الإصلاح)</span> : null}
                </span>
                <span className="shrink-0 tabular">{money(l.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            مافيش بنود لسه. التكلفة الحقيقية للمرتجع مش قيمة البضاعة بس — الشحن والفحص والإصلاح والهالك كلهم فلوس خرجت.
          </p>
        )}
      </div>

      {editable ? (
        <div className="mb-5 space-y-3 border-b border-border pb-5">
          <Field label="بند تكلفة جديد">
            <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as ReturnCostKind)}>
              {RETURN_COST_KINDS.map((k) => (
                <option key={k} value={k} disabled={REPAIR_DERIVED_COSTS.includes(k) && reps.length > 0}>
                  {RETURN_COST_LABEL[k]}
                  {REPAIR_DERIVED_COSTS.includes(k) && reps.length > 0 ? " — من أمر الإصلاح" : ""}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="المبلغ">
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="البيان">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="شحن من المنصورة" />
            </Field>
          </div>
          <Button variant="outline" className="w-full" onClick={addCost}>
            ضيف البند
          </Button>
          {r.costs.length ? (
            <ul className="space-y-1 text-sm">
              {r.costs.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {RETURN_COST_LABEL[c.kind]} · {money(c.amount)}
                    {c.note ? ` — ${c.note}` : ""}
                  </span>
                  <Button variant="dangerGhost" onClick={() => removeReturnCost(r.id, c.id)}>
                    شيل
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <p className="mb-2 text-sm">إثبات المشكلة</p>
      <p className="mb-3 text-xs text-muted-foreground">
        الصورة هي اللي بتخلّي المطالبة على المورّد أو الرد على العميل قابل للإثبات بعد شهرين. وصورة «بعد» هي اللي بتخلّي
        «اتصلحت» جملة عليها دليل.
      </p>
      {r.attachments.length ? (
        <div className="mb-3 grid grid-cols-3 gap-2">
          {r.attachments.map((a) => (
            <div key={a.id} className="min-w-0">
              <img src={a.dataUrl} alt={a.name} className="h-24 w-full rounded-md border border-border object-cover" />
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {a.phase === "before" ? "قبل" : "بعد"} · {formatDate(a.at.slice(0, 10))}
              </p>
              {editable ? (
                <Button variant="dangerGhost" onClick={() => removeAttachment(r.id, a.id)}>
                  شيل
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {editable ? (
        <>
          <Field label="الصورة دي قبل الإصلاح ولا بعده">
            <select className={selectClass} value={phase} onChange={(e) => setPhase(e.target.value as AttachmentPhase)}>
              <option value="before">قبل الإصلاح</option>
              <option value="after">بعد الإصلاح</option>
            </select>
          </Field>
          <Field label="ضيف صورة">
            <Input
              type="file"
              accept="image/*"
              disabled={busy || r.attachments.length >= 6}
              onChange={(e) => void pickImage(e.target.files?.[0])}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {r.attachments.length >= 6
                ? "وصلت لأقصى ست صور للحالة في النسخة المحلية."
                : "الصورة بتتصغّر قبل ما تتخزّن. الفيديو والملفات الكبيرة محتاجة تخزين على السيرفر — لسه مش متاح."}
            </p>
          </Field>
        </>
      ) : null}

      <div className="mt-5 border-t border-border pt-5">
        <p className="mb-2 text-sm">أوامر الإصلاح</p>
        {reps.length ? (
          <ul className="mb-3 space-y-1.5 text-sm">
            {reps.map((x) => (
              <li key={x.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  <span className="latin text-muted-foreground">{x.code}</span> · {qty(x.qty, 0)} قطعة
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={x.status === "shipped" ? "ok" : x.status === "scrapped" ? "danger" : "gold"}>
                    {REPAIR_STATUS_LABEL[x.status]}
                  </Badge>
                  <span className="tabular">{money(repairCost(x).total)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-xs text-muted-foreground">
            الإصلاح شغل حقيقي: عامل بيقعد عليه وقت وخامات بتتصرف من المخزن. عشان كده بيتفتح له أمر بدل ما تتكتب تكلفة
            تقديرية في خانة.
          </p>
        )}
        {can.do("quality", "create") && r.status !== "open" && r.status !== "cancelled" && repairedQty < r.qty ? (
          <Button variant="outline" className="w-full" onClick={() => setRepairOpen(true)}>
            افتح أمر إصلاح — الباقي {qty(r.qty - repairedQty, 0)} قطعة
          </Button>
        ) : null}
        {r.status === "open" ? (
          <p className="text-xs text-muted-foreground">افحص الحالة الأول — الإصلاح بيتقرر بعد ما نعرف العيب إيه.</p>
        ) : null}
      </div>

      <OpenRepairPanel
        r={r}
        remaining={r.qty - repairedQty}
        open={repairOpen}
        onClose={() => setRepairOpen(false)}
        onDone={openRepair}
      />
    </Panel>
  );
}

function OpenRepairPanel({
  r,
  remaining,
  open,
  onClose,
  onDone,
}: {
  r: ReturnEntry;
  remaining: number;
  open: boolean;
  onClose: () => void;
  onDone: (input: RepairInput) => string;
}) {
  const { db } = useFactory();
  const [amount, setAmount] = useState(String(remaining));
  const [workerId, setWorkerId] = useState(r.workerId ?? "");
  const [operationId, setOperationId] = useState(r.operationId ?? "");
  const [rate, setRate] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [matQty, setMatQty] = useState("");
  const [notes, setNotes] = useState("");

  const save = () => {
    try {
      onDone({
        returnId: r.id,
        qty: Number(amount) || 0,
        problem: r.problem,
        workerId: workerId || null,
        operationId: operationId || null,
        rate: Number(rate) || 0,
        materials: materialId && Number(matQty) > 0 ? [{ materialId, qty: Number(matQty) }] : [],
        notes,
      });
      toast.success("أمر الإصلاح اتفتح، وخاماته خرجت من المخزن.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر أفتح أمر الإصلاح.");
    }
  };

  return (
    <Panel
      open={open}
      title="أمر إصلاح جديد"
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={save}>
          افتح الأمر
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        {r.problem ? `المشكلة: ${PROBLEM_DEFS[r.problem].label}. ` : ""}
        خامات الإصلاح بتخرج من المخزن بحركة صرف حقيقية وقت فتح الأمر، والقطعة اللي بتعدّي الفحص بتدخل المخزون بتكلفتها
        زائد تكلفة إصلاحها.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="عدد القطع">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="أجر إصلاح القطعة">
          <Input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />
        </Field>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">الباقي من الحالة {qty(remaining, 0)} قطعة.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="العامل">
          <select className={selectClass} value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
            <option value="">مش محدد</option>
            {db.workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="العملية">
          <select className={selectClass} value={operationId} onChange={(e) => setOperationId(e.target.value)}>
            <option value="">مش محددة</option>
            {db.operations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="خامة الإصلاح">
          <select className={selectClass} value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
            <option value="">مافيش</option>
            {db.materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الكمية">
          <Input value={matQty} onChange={(e) => setMatQty(e.target.value)} inputMode="decimal" />
        </Field>
      </div>
      <Field label="ملاحظات">
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
