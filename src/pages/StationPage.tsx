import { useMemo, useState } from "react";
import { Boxes, CheckCircle2, Pause, Play, ScanLine, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Field, Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, selectClass } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { DEFECT_REASONS, bundleByCode, bundleState, myActiveOps, opMinutes, pausedMinutesNow } from "@/store/floor";
import { operationById } from "@/store/manufacturing";
import { FLOOR_ISSUE_LABEL, FLOOR_ISSUE_KINDS, type Bundle, type BundleOp, type FloorIssueKind } from "@/store/types";

/**
 * محطة العامل.
 *
 * المشرف على أرض المصنع مش محتاج يفتح ERP: هو محتاج **سبع أزرار كبيرة**
 * على موبايل. الشاشة دي هي دي: امسح الباندل، ابدأ، وقّف، خلّصت، بلّغ
 * عيب، اطلب خامة، عطل ماكينة.
 *
 * المسح دلوقتي **بالكتابة أو اللصق** للرقم، مش بالكاميرا: قراءة الكود
 * بالكاميرا محتاجة صلاحية كاميرا ومكتبة قراءة، ولسه مش مبنية — مكتوب
 * كده هنا وفي `docs/floor.md` بدل ما نسمّي الخانة «Scan» ونسيبها توهم.
 */

export function StationPage() {
  const { db, can, startBundleOp, pauseBundleOp, resumeBundleOp } = useFactory();
  const [code, setCode] = useState("");
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [workerId, setWorkerId] = useState("");
  const [finishing, setFinishing] = useState<BundleOp | null>(null);
  const [issue, setIssue] = useState<FloorIssueKind | null>(null);

  const active = useMemo(() => myActiveOps(db, workerId || null), [db, workerId]);
  const st = bundle ? bundleState(db, bundle) : null;
  const mine = bundle ? (db.bundleOps ?? []).find((o) => o.bundleId === bundle.id && o.state !== "done") : null;

  const find = () => {
    const found = bundleByCode(db, code);
    if (!found) {
      toast.error("مفيش باندل بالرقم ده.");
      return;
    }
    setBundle(found);
  };

  const start = () => {
    if (!bundle) return;
    try {
      startBundleOp({ bundleId: bundle.id, workerId: workerId || null });
      toast.success("العملية بدأت — الوقت ماشي.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر أبدأ.");
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h2 className="text-2xl">محطة العامل</h2>
        <p className="text-sm text-muted-foreground">
          امسح الباندل وابدأ الشغل. الوقت بيتسجّل من الساعة، والكمية بتتسجّل لما تخلّص.
        </p>
      </div>

      <Card className="space-y-3">
        <Field label="العامل">
          <select className={selectClass} value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
            <option value="">بدون تسجيل عامل</option>
            {db.workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="رقم الباندل">
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && find()}
              placeholder="SN-1043-B001"
              className="latin"
            />
            <Button onClick={find}>
              <ScanLine /> جيب
            </Button>
          </div>
        </Field>
        <p className="-mt-1 text-xs text-muted-foreground">
          اكتب الرقم أو الصقه من قارئ الباركود. القراءة بالكاميرا لسه مش مبنية.
        </p>

        {(db.bundles ?? []).length ? (
          <div className="flex flex-wrap gap-1.5">
            {(db.bundles ?? []).slice(0, 8).map((b) => (
              <button
                key={b.id}
                onClick={() => {
                  setBundle(b);
                  setCode(b.code);
                }}
                className="latin rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
              >
                {b.code}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">مفيش باندلات في النظام — اقص فرشة الأول من شاشة القص.</p>
        )}
      </Card>

      {bundle && st ? (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="latin text-lg">{bundle.code}</p>
              <p className="text-sm text-muted-foreground">
                {st.orderCode} · مقاس {bundle.size} · {qty(bundle.qty, 0)} قطعة
              </p>
            </div>
            <Badge tone={st.done ? "ok" : mine?.state === "paused" ? "warn" : mine ? "gold" : "muted"}>{st.label}</Badge>
          </div>

          {mine ? (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <p>
                {operationById(db, mine.operationId)?.name ?? "عملية"} · ماشية{" "}
                <span className="tabular">{qty(opMinutes(mine), 0)}</span> دقيقة
                {mine.pausedMinutes ? ` · واقفة ${qty(pausedMinutesNow(mine), 0)} دقيقة` : ""}
              </p>
              {mine.pauseNote ? <p className="text-muted-foreground">سبب التوقف: {mine.pauseNote}</p> : null}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            {!mine && !st.done && can.do("production", "create") ? (
              <Button size="lg" className="col-span-2" onClick={start}>
                <Play /> ابدأ {st.nextOperationName ?? "العملية"}
              </Button>
            ) : null}
            {mine?.state === "running" ? (
              <Button size="lg" variant="outline" onClick={() => setIssue("other")}>
                <Pause /> وقّف مؤقت
              </Button>
            ) : null}
            {mine?.state === "paused" ? (
              <Button size="lg" variant="outline" onClick={() => resumeBundleOp(mine.id)}>
                <Play /> كمّل
              </Button>
            ) : null}
            {mine ? (
              <Button size="lg" variant="gold" onClick={() => setFinishing(mine)}>
                <CheckCircle2 /> خلّصت
              </Button>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" onClick={() => setIssue("quality")}>
              بلّغ عيب
            </Button>
            <Button variant="outline" onClick={() => setIssue("material")}>
              <Boxes /> اطلب خامة
            </Button>
            <Button variant="outline" onClick={() => setIssue("machine")}>
              <Wrench /> عطل
            </Button>
          </div>
        </Card>
      ) : null}

      {active.length ? (
        <Card>
          <h3 className="mb-2 text-base">شغل ماشي دلوقتي</h3>
          <div className="space-y-2">
            {active.map((o) => {
              const b = (db.bundles ?? []).find((x) => x.id === o.bundleId);
              return (
                <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 p-2.5">
                  <div>
                    <p className="latin text-sm">{b?.code ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {operationById(db, o.operationId)?.name ?? "عملية"} ·{" "}
                      {db.workers.find((w) => w.id === o.workerId)?.name ?? "بدون عامل"} ·{" "}
                      <span className="tabular">{qty(opMinutes(o), 0)}</span> دقيقة
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {o.state === "running" ? (
                      <Button size="sm" variant="outline" onClick={() => pauseBundleOp(o.id, "توقف من المحطة")}>
                        وقّف
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => resumeBundleOp(o.id)}>
                        كمّل
                      </Button>
                    )}
                    <Button size="sm" variant="gold" onClick={() => setFinishing(o)}>
                      خلّصت
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {/* المفتاح بيعيد بناء الفورم لكل عملية، فالكميات بتبدأ من الباندل الجديد */}
      <FinishPanel key={finishing?.id ?? "none"} op={finishing} onClose={() => setFinishing(null)} />
      <IssuePanel kind={issue} bundle={bundle} op={mine ?? null} workerId={workerId || null} onClose={() => setIssue(null)} />
    </div>
  );
}

function FinishPanel({ op, onClose }: { op: BundleOp | null; onClose: () => void }) {
  const { db, finishBundleOp } = useFactory();
  const bundle = op ? (db.bundles ?? []).find((b) => b.id === op.bundleId) : null;
  // الحالة الغالبة إن الباندل بيخلص كامل، فالخانة بتيجي مليانة والعامل
  // بيقلّلها لو حصل عيب — أسرع من إنه يكتب الرقم في كل باندل
  const [good, setGood] = useState(String(bundle?.qty ?? ""));
  const [rework, setRework] = useState("0");
  const [scrap, setScrap] = useState("0");
  const [defect, setDefect] = useState("");

  const save = () => {
    if (!op) return;
    try {
      finishBundleOp(op.id, {
        qtyGood: Number(good) || 0,
        qtyRework: Number(rework) || 0,
        qtyScrap: Number(scrap) || 0,
        defect,
      });
      toast.success("العملية اتقفلت واتسجّلت في دفتر الإنتاج.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر أقفل العملية.");
    }
  };

  return (
    <Panel
      open={!!op}
      title="إقفال العملية"
      onClose={onClose}
      footer={
        <Button className="w-full" size="lg" onClick={save}>
          سجّل واقفل
        </Button>
      }
    >
      {op && bundle ? (
        <>
          <div className="mb-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <p className="latin">{bundle.code}</p>
            <p className="text-muted-foreground">
              {operationById(db, op.operationId)?.name ?? "عملية"} · {qty(bundle.qty, 0)} قطعة · ماشية{" "}
              {qty(opMinutes(op), 0)} دقيقة
            </p>
            {op.stdMinutes > 0 ? (
              <p className="text-muted-foreground">
                الزمن المعياري {qty(op.stdMinutes * bundle.qty, 0)} دقيقة للباندل كله
              </p>
            ) : (
              <p className="text-warn">العملية دي مالهاش زمن معياري — مفيش كفاءة تتحسب.</p>
            )}
          </div>

          <Field label="سليم">
            <Input value={good} onChange={(e) => setGood(e.target.value)} inputMode="numeric" placeholder={String(bundle.qty)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="محتاج إعادة">
              <Input value={rework} onChange={(e) => setRework(e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="تالف">
              <Input value={scrap} onChange={(e) => setScrap(e.target.value)} inputMode="numeric" />
            </Field>
          </div>

          {Number(rework) + Number(scrap) > 0 ? (
            <>
              <Field label="سبب العيب">
                <select className={selectClass} value={defect} onChange={(e) => setDefect(e.target.value)}>
                  <option value="">اختار السبب</option>
                  {DEFECT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="-mt-2 mb-3 text-xs text-muted-foreground">
                السبب هو اللي بيبني باريتو العيوب. من غيره التسجيل بيتعرض «بدون سبب مكتوب».
              </p>
            </>
          ) : null}
        </>
      ) : null}
    </Panel>
  );
}

function IssuePanel({
  kind,
  bundle,
  op,
  workerId,
  onClose,
}: {
  kind: FloorIssueKind | null;
  bundle: Bundle | null;
  op: BundleOp | null;
  workerId: string | null;
  onClose: () => void;
}) {
  const { db, reportIssue, pauseBundleOp } = useFactory();
  const [note, setNote] = useState("");
  const [pause, setPause] = useState(true);
  const order = bundle ? db.orders.find((o) => o.id === bundle.orderId) : null;

  const save = () => {
    if (!kind) return;
    try {
      reportIssue({
        kind,
        line: order?.line ?? "بدون خط",
        orderId: order?.id ?? null,
        bundleId: bundle?.id ?? null,
        workerId,
        note,
      });
      if (pause && op?.state === "running") pauseBundleOp(op.id, note.trim());
      toast.success("البلاغ اتسجّل وظهر على شاشة الصالة.");
      onClose();
      setNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر أسجّل البلاغ.");
    }
  };

  return (
    <Panel
      open={!!kind}
      title={kind ? FLOOR_ISSUE_LABEL[kind] : "بلاغ"}
      onClose={onClose}
      footer={
        <Button className="w-full" size="lg" onClick={save}>
          ابعت البلاغ
        </Button>
      }
    >
      <Field label="المشكلة">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            kind === "machine"
              ? "ماكينة أوفر رقم ٣ بتقطع الخيط"
              : kind === "material"
                ? "محتاجين بكر خيط أبيض"
                : "غرزة مفتوحة في ٤ قطع"
          }
        />
      </Field>
      {op?.state === "running" ? (
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={pause} onChange={(e) => setPause(e.target.checked)} />
          وقّف العملية لحد ما المشكلة تتحل (الوقت الواقف بيتخصم من الكفاءة)
        </label>
      ) : null}
      <p className="text-xs text-muted-foreground">
        الأنواع المتاحة: {FLOOR_ISSUE_KINDS.map((k) => FLOOR_ISSUE_LABEL[k]).join(" · ")}. البلاغ بيظهر على شاشة أرض
        المصنع لحد ما حد يقول «اتحلّت».
      </p>
    </Panel>
  );
}
