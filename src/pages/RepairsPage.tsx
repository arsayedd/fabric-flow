import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Hammer } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Field, Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ExportMenu } from "@/components/export/ExportMenu";
import { formatDate, money, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { datasetOf } from "@/store/datasets";
import { operationName, repairSummary, repairWorth } from "@/store/quality";
import { itemName, partyName, repairCost } from "@/store/returns";
import { PROBLEM_LABEL, REPAIR_STATUS_LABEL, type RepairOrder, type RepairStatus } from "@/store/types";

/**
 * أوامر الإصلاح.
 *
 * الإصلاح مش خانة تكلفة — هو شغل بيمشي على مراحل: في الطابور، بيتصلح،
 * تحت الفحص، جاهز، اترجّع. وكل مرحلة ليها أثر حقيقي: الخامات بتخرج من
 * المخزن وقت فتح الأمر، والقطعة اللي بتعدّي الفحص بتدخل المخزون بتكلفتها
 * زائد تكلفة إصلاحها، واللي بترجع للعميل بتخرج منه تاني.
 *
 * والسؤال اللي الشاشة دي بتصرّ عليه ومالوش مكان في أنظمة تانية: **الإصلاح
 * كان يستاهل؟** تكلفة إصلاح القطعة مقابل تكلفة إنتاجها من الأول — لأن
 * الإصلاح اللي بيقرّب من التكلفة، الإهلاك أرخص منه.
 */

const TONE: Record<RepairStatus, "muted" | "ok" | "warn" | "danger" | "gold"> = {
  queued: "warn",
  repairing: "gold",
  qc: "gold",
  ready: "ok",
  shipped: "ok",
  scrapped: "danger",
  cancelled: "muted",
};

const FILTERS = [
  { id: "live", label: "شغّال" },
  { id: "all", label: "الكل" },
] as const;

export function RepairsPage() {
  const { db, can } = useFactory();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("live");
  const s = useMemo(() => repairSummary(db), [db]);
  const rows = useMemo(
    () =>
      (db.repairs ?? [])
        .filter((r) =>
          filter === "all" ? true : r.status !== "shipped" && r.status !== "cancelled" && r.status !== "scrapped",
        )
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || b.code.localeCompare(a.code)),
    [db.repairs, filter],
  );

  if (!can.do("quality", "view")) {
    return (
      <EmptyState
        icon={Hammer}
        title="أوامر الإصلاح محتاجة صلاحية الجودة"
        body="الأمر ده بيصرف خامات من المخزن وبيدخّل بضاعة بعد الفحص، فمابيتفتحش بدون صلاحية. اطلبها من صاحب المصنع."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">أوامر الإصلاح</h2>
          <p className="text-sm text-muted-foreground">
            القطعة اللي بتتصلح شغل حقيقي: خامات بتتصرف، وقت بيتحسب، وفحص بيقرر عدّت ولا لأ.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <ExportMenu module="quality" dataset={() => datasetOf(db, "repairs")} />
          <Button variant="outline" asChild>
            <Link to="/returns">دفتر المرتجعات</Link>
          </Button>
        </div>
      </div>

      {!(db.repairs ?? []).length ? (
        <EmptyState
          icon={Hammer}
          title="مافيش أوامر إصلاح"
          body="أمر الإصلاح بيتفتح من كارت المرتجع نفسه بعد الفحص — من زر «التكلفة والإثبات». وقتها بس نبقى عارفين العيب إيه وعدد القطع كام."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className={s.open ? "border-warn/40 bg-warn-soft/30" : ""}>
              <p className="text-sm text-muted-foreground">شغّال</p>
              <p className={`mt-1 text-2xl tabular ${s.open ? "text-warn" : ""}`}>{qty(s.open, 0)}</p>
              <p className="text-xs text-muted-foreground">{qty(s.piecesInRepair, 0)} قطعة في الدورة</p>
            </Card>
            <Card>
              <p className="text-sm text-muted-foreground">تحت الفحص</p>
              <p className="mt-1 text-2xl tabular">{qty(s.inQc, 0)}</p>
              <p className="text-xs text-muted-foreground">{qty(s.ready, 0)} جاهز للتسليم</p>
            </Card>
            <Card>
              <p className="text-sm text-muted-foreground">تكلفة الإصلاح</p>
              <p className="mt-1 text-2xl">
                <Money value={s.cost} />
              </p>
              <p className="text-xs text-muted-foreground">
                {s.perPiece === null ? "مافيش قطع لسه" : `${money(s.perPiece)} للقطعة`}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-muted-foreground">عدّى الفحص</p>
              <p className="mt-1 text-2xl tabular">{s.passPct === null ? "—" : `${qty(s.passPct, 0)}٪`}</p>
              <p className="text-xs text-muted-foreground">
                {s.minutesPerPiece === null ? "الوقت مش مسجّل" : `${qty(s.minutesPerPiece, 0)} دقيقة للقطعة`}
              </p>
            </Card>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  filter === f.id ? "border-gold bg-gold/10 text-gold" : "border-border text-muted-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {rows.map((r) => (
              <RepairCard key={r.id} r={r} />
            ))}
            {!rows.length ? (
              <p className="text-sm text-muted-foreground">مافيش أوامر شغّالة دلوقتي — كلها خلصت أو اتلغت.</p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function RepairCard({ r }: { r: RepairOrder }) {
  const { db, can, startRepair, finishRepair, shipRepair, cancelRepair } = useFactory();
  const [qcOpen, setQcOpen] = useState(false);
  const parent = db.returns.find((x) => x.id === r.returnId);
  const cost = useMemo(() => repairCost(r), [r]);
  const worth = useMemo(() => repairWorth(db, r), [db, r]);
  const worker = db.workers.find((w) => w.id === r.workerId);
  const editable = can.do("quality", "edit");

  const run = (fn: () => void, ok: string) => {
    try {
      fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر أنفّذ.");
    }
  };

  const cancel = () => {
    const reason = window.prompt("سبب الإلغاء؟");
    if (!reason?.trim()) return;
    run(() => cancelRepair(r.id, reason), "الأمر اتلغى بسببه.");
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="latin text-sm text-muted-foreground">{r.code}</span>
            <Badge tone={TONE[r.status]}>{REPAIR_STATUS_LABEL[r.status]}</Badge>
            {r.problem ? <Badge tone="muted">{PROBLEM_LABEL[r.problem]}</Badge> : null}
          </div>
          <p className="mt-1 truncate">
            {qty(r.qty, 0)} قطعة · {parent ? itemName(db, parent) : "حالة محذوفة"}
          </p>
          <p className="text-sm text-muted-foreground">
            {parent ? `${partyName(db, parent)} · ` : ""}
            {formatDate(r.date)}
            {worker ? ` · ${worker.name}` : ""}
            {operationName(db, r.operationId) ? ` · ${operationName(db, r.operationId)}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-left">
          <p className="text-lg">
            <Money value={cost.total} />
          </p>
          <p className="text-xs text-muted-foreground">{money(cost.perPiece)} للقطعة</p>
        </div>
      </div>

      <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
        <li className="flex items-baseline justify-between gap-3">
          <span>
            أجر الإصلاح
            <span className="block text-xs text-muted-foreground">
              {money(r.rate)} للقطعة {r.minutes > 0 ? `· ${qty(r.minutes, 0)} دقيقة فعلية` : "· الوقت لسه مابدأش"}
            </span>
          </span>
          <span className="shrink-0 tabular">{money(cost.labor)}</span>
        </li>
        {r.materials.length ? (
          <li className="flex items-baseline justify-between gap-3">
            <span>
              خامات الإصلاح
              <span className="block text-xs text-muted-foreground">
                {r.materials
                  .map((m) => `${db.materials.find((x) => x.id === m.materialId)?.name ?? "خامة"} ${qty(m.qty, 0)}`)
                  .join(" · ")}{" "}
                — خرجت من المخزن وقت فتح الأمر
              </span>
            </span>
            <span className="shrink-0 tabular">{money(cost.materials)}</span>
          </li>
        ) : null}
      </ul>

      {worth.worth !== null ? (
        <p className={`mt-3 text-sm ${worth.worth ? "text-ok" : "text-warn"}`}>
          {worth.worth
            ? `إصلاح القطعة ${money(worth.repair)} وتكلفة إنتاجها ${money(worth.make)} — الإصلاح أوفر.`
            : `إصلاح القطعة ${money(worth.repair)} وتكلفة إنتاجها ${money(worth.make)} — قرّب من التكلفة، فالإهلاك يبقى أوفر.`}
        </p>
      ) : null}

      {r.qcAt ? (
        <p className="mt-2 text-sm">
          الفحص: عدّت {qty(r.qtyPassed, 0)} وسقطت {qty(r.qtyFailed, 0)}
          {r.qcNote ? ` — ${r.qcNote}` : ""}
        </p>
      ) : null}
      {r.status === "cancelled" && r.cancelReason ? (
        <p className="mt-2 text-xs text-muted-foreground">سبب الإلغاء: {r.cancelReason}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {editable && r.status === "queued" ? (
          <Button onClick={() => run(() => startRepair(r.id), "الإصلاح بدأ، والوقت بيتحسب من دلوقتي.")}>ابدأ</Button>
        ) : null}
        {editable && r.status === "repairing" ? (
          <Button onClick={() => run(() => finishRepair(r.id), "خلص إصلاح، ودخل الفحص.")}>خلّصت</Button>
        ) : null}
        {editable && r.status === "qc" ? <Button onClick={() => setQcOpen(true)}>سجّل الفحص</Button> : null}
        {editable && r.status === "ready" ? (
          <Button onClick={() => run(() => shipRepair(r.id), "القطع اترجّعت للعميل وخرجت من المخزون.")}>
            رجّعها للعميل
          </Button>
        ) : null}
        {parent ? (
          <Button variant="outline" asChild>
            <Link to="/returns">الحالة {parent.code}</Link>
          </Button>
        ) : null}
        {editable && (r.status === "queued" || r.status === "repairing" || r.status === "qc") ? (
          <Button variant="dangerGhost" onClick={cancel}>
            إلغاء
          </Button>
        ) : null}
      </div>

      <QcPanel r={r} open={qcOpen} onClose={() => setQcOpen(false)} />
    </Card>
  );
}

function QcPanel({ r, open, onClose }: { r: RepairOrder; open: boolean; onClose: () => void }) {
  const { qcRepair } = useFactory();
  const [passed, setPassed] = useState(String(r.qty));
  const [failed, setFailed] = useState("0");
  const [note, setNote] = useState("");

  const save = () => {
    try {
      qcRepair(r.id, { qtyPassed: Number(passed) || 0, qtyFailed: Number(failed) || 0, qcNote: note });
      toast.success("الفحص اتسجّل، واللي عدّى دخل المخزون.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر أسجّل الفحص.");
    }
  };

  return (
    <Panel
      open={open}
      title={`فحص الإصلاح — ${r.code}`}
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={save}>
          سجّل الفحص
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        القطعة اللي بتعدّي الفحص بتدخل المخزون دلوقتي بتكلفتها زائد تكلفة إصلاحها — مش وقت المرتجع، لأنها وقتها كانت لسه
        في الورشة.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="عدّت">
          <Input value={passed} onChange={(e) => setPassed(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="سقطت">
          <Input value={failed} onChange={(e) => setFailed(e.target.value)} inputMode="decimal" />
        </Field>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        الأمر فيه {qty(r.qty, 0)} قطعة — الاتنين لازم يجمعوا نفس الرقم، عشان مافيش قطعة تختفي من الدفتر.
      </p>
      <Field label="ملاحظة الفحص">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </Field>
      <p className="text-xs text-muted-foreground">
        القطع اللي سقطت لازم يتكتب ليه — دي المعلومة اللي بتقول إن الإصلاح ده نفسه مش شغّال.
      </p>
    </Panel>
  );
}
