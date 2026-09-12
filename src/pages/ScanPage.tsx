import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Camera, CameraOff, CheckCircle2, ExternalLink, Play, ScanLine, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Field, Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, selectClass } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cairoToday, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { isHit, KIND_MODULE, resolveCode, type Hit, type Scanned } from "@/store/codes";
import { DEFECT_REASONS } from "@/store/floor";
import { operationById } from "@/store/manufacturing";
import { KIND_LABEL, SCAN_ACTION_LABEL, STOCK_KIND_LABEL, type Bundle, type StockKind } from "@/store/types";

/**
 * مركز المسح.
 *
 * الفكرة كلها في سطر: **امسح، والنظام يفهم، وينفّذ.** العامل مش محتاج
 * يعرف الحاجة اللي في إيده دي مسجّلة في أنهي قسم — الكود بيعرّف نفسه،
 * والشاشة بتفتح السجل وتحطّ تحته الأزرار اللي ليها معنى مع النوع ده.
 *
 * وحدود القراءة بالكاميرا مكتوبة على الشاشة نفسها: `BarcodeDetector`
 * موجود في متصفحات معدودة (كروم على أندرويد وماك بالأساس). فبدل ما
 * نحمّل مكتبة قراءة تقيلة على كل زيارة، بنسأل المتصفح الأول، ولو
 * مابيقراش بنقول كده بالصريح والكتابة بالإيد بتفضل شغّالة. قارئ
 * الباركود السلكي كمان بيكتب في نفس الخانة، فهو شغّال من غير كاميرا.
 */

/* أنواع الأكواد اللي بنقراها: QR للتتبع الداخلي، والباقي لليبل المطبوع */
const FORMATS = ["qr_code", "code_128", "code_39", "ean_13", "data_matrix"];

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

const cameraReads = () => typeof window !== "undefined" && "BarcodeDetector" in window;

export function ScanPage() {
  const { db, can, recordScan } = useFactory();
  const [text, setText] = useState("");
  const [result, setResult] = useState<Scanned | null>(null);
  const [cam, setCam] = useState(false);

  const run = (raw: string, source: "camera" | "manual") => {
    const found = resolveCode(db, raw);
    setResult(found);
    if (!isHit(found)) return;
    if (!can.do(KIND_MODULE[found.kind], "view")) {
      setResult({
        kind: null,
        text: raw,
        why: `الكود ده بيفتح ${KIND_LABEL[found.kind]}، ودورك مامعاهوش صلاحية يشوف القسم ده.`,
      });
      return;
    }
    try {
      recordScan({ kind: found.kind, refId: found.id, code: raw.trim(), action: "open", source });
    } catch {
      /* المسح اتقرا وبيتعرض؛ فشل تسجيل الحركة مايمنعش العامل من الشغل */
    }
  };

  const recent = (db.scans ?? []).slice(0, 8);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-2xl">مسح كود</h2>
        <p className="text-sm text-muted-foreground">
          امسح أي كود في المصنع — باندل، خامة، أمر، مستند — والشاشة تفتح سجله وتحته اللي تقدر تعمله عليه.
        </p>
      </div>

      <Card className="space-y-3">
        <Field label="الكود">
          <div className="flex gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run(text, "manual")}
              placeholder="SN-1043-B001"
              className="latin"
              autoFocus
            />
            <Button onClick={() => run(text, "manual")}>
              <ScanLine /> جيب
            </Button>
          </div>
        </Field>
        <p className="-mt-1 text-xs text-muted-foreground">
          اكتب الرقم المطبوع تحت الكود، أو الصقه من قارئ باركود، أو افتح الكاميرا.
        </p>

        {cameraReads() ? (
          cam ? (
            <CameraBox
              onRead={(raw) => {
                setText(raw);
                setCam(false);
                run(raw, "camera");
              }}
              onClose={() => setCam(false)}
            />
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setCam(true)}>
              <Camera /> افتح الكاميرا
            </Button>
          )
        ) : (
          <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <CameraOff className="mt-0.5 size-4 shrink-0" />
            المتصفح ده مابيقراش الأكواد بالكاميرا. جرّب كروم على الموبايل، أو استعمل قارئ باركود، أو اكتب الرقم.
          </p>
        )}
      </Card>

      {result ? isHit(result) ? <HitCard hit={result} /> : <MissCard miss={result} /> : null}

      <Card>
        <h3 className="mb-2 text-base">آخر عمليات المسح</h3>
        {recent.length ? (
          <div className="space-y-2">
            {recent.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 p-2.5 text-sm">
                <div>
                  <p className="latin">{s.code}</p>
                  <p className="text-xs text-muted-foreground">
                    {KIND_LABEL[s.kind]} · {SCAN_ACTION_LABEL[s.action]} · {s.actorName} ·{" "}
                    {new Date(s.at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "short", timeStyle: "short" })}
                    {s.from || s.to ? ` · ${s.from || "—"} ← ${s.to || "—"}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => run(s.code, "manual")}>
                  افتح
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">مفيش أكواد اتمسحت لسه. أول مسح هيظهر هنا وفي سجل المسح.</p>
        )}
      </Card>
    </div>
  );
}

/* ── الكاميرا ─────────────────────────────────────────────────── */

function CameraBox({ onRead, onClose }: { onRead: (raw: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;

    const start = async () => {
      try {
        // الكاميرا الخلفية هي اللي بيتمسح بيها؛ الأمامية بتبوظ التجربة
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        const detector = new Ctor({ formats: FORMATS });
        // كل ٣٠٠ مللي كفاية: أسرع من كده بياكل بطارية بلا فايدة
        timer = window.setInterval(async () => {
          if (!video.current || video.current.readyState < 2) return;
          try {
            const codes = await detector.detect(video.current);
            if (codes.length && codes[0].rawValue) onRead(codes[0].rawValue);
          } catch {
            /* إطار مش مقروء — نستنى اللي بعده */
          }
        }, 300);
      } catch {
        setError("مش قادر أفتح الكاميرا. اسمح بالصلاحية من المتصفح، أو اكتب الرقم بالإيد.");
      }
    };
    void start();

    return () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onRead]);

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg border border-border bg-black">
        <video ref={video} className="h-56 w-full object-cover" muted playsInline aria-label="كاميرا المسح" />
        <div className="pointer-events-none absolute inset-x-8 inset-y-12 rounded-lg border-2 border-gold/80" />
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : <p className="text-xs text-muted-foreground">حط الكود جوه المستطيل. القراءة بتحصل لوحدها.</p>}
      <Button variant="outline" className="w-full" onClick={onClose}>
        <CameraOff /> اقفل الكاميرا
      </Button>
    </div>
  );
}

/* ── نتيجة المسح ──────────────────────────────────────────────── */

function MissCard({ miss }: { miss: Extract<Scanned, { kind: null }> }) {
  return (
    <Card className={miss.otherFactory ? "border-danger/50" : "border-warn/50"}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={`mt-0.5 size-5 shrink-0 ${miss.otherFactory ? "text-danger" : "text-warn"}`} />
        <div>
          <h3 className="text-base">{miss.otherFactory ? "كود من مصنع تاني" : "الكود ده ماعرفتهوش"}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{miss.why}</p>
          {miss.text ? <p className="latin mt-2 break-all text-xs text-muted-foreground">{miss.text}</p> : null}
        </div>
      </div>
    </Card>
  );
}

function HitCard({ hit }: { hit: Hit }) {
  const { db, can, startBundleOp, recordScan } = useFactory();
  const [finishing, setFinishing] = useState<Bundle | null>(null);
  const [issue, setIssue] = useState<Bundle | null>(null);
  const [move, setMove] = useState(false);

  const bundle = hit.kind === "bundle" ? (db.bundles ?? []).find((b) => b.id === hit.id) ?? null : null;
  const op = bundle ? (db.bundleOps ?? []).find((o) => o.bundleId === bundle.id && o.state !== "done") ?? null : null;
  const material = hit.kind === "material" ? db.materials.find((m) => m.id === hit.id) ?? null : null;
  const doc = hit.kind === "document" ? db.documents.find((d) => d.id === hit.id) ?? null : null;

  const start = () => {
    if (!bundle) return;
    try {
      startBundleOp({ bundleId: bundle.id, workerId: null });
      recordScan({ kind: "bundle", refId: bundle.id, code: bundle.code, action: "start", source: "manual", qty: bundle.qty });
      toast.success("العملية بدأت — الوقت ماشي.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر أبدأ.");
    }
  };

  return (
    <>
      <Card className="space-y-3 border-gold/40">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="latin text-lg">{hit.code}</p>
            <p className="text-base">{hit.label}</p>
            <p className="text-sm text-muted-foreground">{hit.sub}</p>
          </div>
          <Badge tone="gold">{KIND_LABEL[hit.kind]}</Badge>
        </div>

        {hit.via === "text" ? (
          <p className="text-xs text-muted-foreground">لقيناه بالرقم المكتوب مش بالكود — يعني الليبل ممكن يكون اتكرمش.</p>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild variant="outline">
            <Link to={hit.to}>
              <ExternalLink /> افتح السجل
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to={`/trace/${hit.kind}/${hit.id}`}>سلسلة التتبع</Link>
          </Button>
        </div>

        {bundle ? (
          <div className="grid gap-2 sm:grid-cols-3">
            {!op && can.do("production", "create") ? (
              <Button onClick={start}>
                <Play /> ابدأ العملية
              </Button>
            ) : null}
            {op && can.do("production", "edit") ? (
              <Button variant="gold" onClick={() => setFinishing(bundle)}>
                <CheckCircle2 /> خلّصت {operationById(db, op.operationId)?.name ?? ""}
              </Button>
            ) : null}
            {can.do("production", "create") ? (
              <Button variant="outline" onClick={() => setIssue(bundle)}>
                <Wrench /> بلّغ مشكلة
              </Button>
            ) : null}
          </div>
        ) : null}

        {material ? (
          <>
            {can.do("inventory", "create") ? (
              <Button variant="outline" onClick={() => setMove(true)}>
                سجّل حركة مخزن
              </Button>
            ) : null}
            <p className="text-xs text-muted-foreground">
              الصرف لأمر إنتاج بيتسجّل من صفحة الأمر، والشراء من صفحة الخامة — الاتنين عايزين تكلفة ومورّد، فمابيتعملوش من المسح.
            </p>
          </>
        ) : null}

        {doc ? (
          <Button asChild variant="outline">
            <Link to={`/verify/${encodeURIComponent(doc.number)}`}>صفحة التحقق من المستند</Link>
          </Button>
        ) : null}
      </Card>

      <FinishPanel key={finishing?.id ?? "none"} bundle={finishing} onClose={() => setFinishing(null)} />
      <IssuePanel bundle={issue} onClose={() => setIssue(null)} />
      <MovePanel material={material} open={move} onClose={() => setMove(false)} />
    </>
  );
}

/* ── الأفعال ──────────────────────────────────────────────────── */

function FinishPanel({ bundle, onClose }: { bundle: Bundle | null; onClose: () => void }) {
  const { db, finishBundleOp, recordScan } = useFactory();
  const op = bundle ? (db.bundleOps ?? []).find((o) => o.bundleId === bundle.id && o.state !== "done") ?? null : null;
  const [good, setGood] = useState(String(bundle?.qty ?? ""));
  const [rework, setRework] = useState("0");
  const [scrap, setScrap] = useState("0");
  const [defect, setDefect] = useState("");

  const save = () => {
    if (!op || !bundle) return;
    try {
      finishBundleOp(op.id, { qtyGood: Number(good) || 0, qtyRework: Number(rework) || 0, qtyScrap: Number(scrap) || 0, defect });
      const name = operationById(db, op.operationId)?.name ?? "عملية";
      recordScan({
        kind: "bundle",
        refId: bundle.id,
        code: bundle.code,
        action: "finish",
        source: "manual",
        qty: Number(good) || 0,
        from: name,
        note: name,
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
              {operationById(db, op.operationId)?.name ?? "عملية"} · {qty(bundle.qty, 0)} قطعة
            </p>
          </div>
          <Field label="سليم">
            <Input value={good} onChange={(e) => setGood(e.target.value)} inputMode="numeric" />
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
          ) : null}
        </>
      ) : null}
    </Panel>
  );
}

function IssuePanel({ bundle, onClose }: { bundle: Bundle | null; onClose: () => void }) {
  const { db, reportIssue, recordScan } = useFactory();
  const [note, setNote] = useState("");
  const order = bundle ? db.orders.find((o) => o.id === bundle.orderId) : null;

  const save = () => {
    if (!bundle) return;
    try {
      reportIssue({
        kind: "quality",
        line: order?.line ?? "بدون خط",
        orderId: order?.id ?? null,
        bundleId: bundle.id,
        workerId: null,
        note,
      });
      recordScan({ kind: "bundle", refId: bundle.id, code: bundle.code, action: "report", source: "manual", note: note.trim() });
      toast.success("البلاغ اتسجّل وظهر على شاشة الصالة.");
      onClose();
      setNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر أسجّل البلاغ.");
    }
  };

  return (
    <Panel
      open={!!bundle}
      title="بلاغ على الباندل"
      onClose={onClose}
      footer={
        <Button className="w-full" size="lg" onClick={save}>
          ابعت البلاغ
        </Button>
      }
    >
      <Field label="المشكلة">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="غرزة مفتوحة في ٤ قطع" />
      </Field>
      <p className="text-xs text-muted-foreground">البلاغ بيظهر على شاشة أرض المصنع لحد ما حد يقول «اتحلّت».</p>
    </Panel>
  );
}

function MovePanel({ material, open, onClose }: { material: { id: string; name: string; avgCost: number } | null; open: boolean; onClose: () => void }) {
  const { db, addStockMovement, recordScan } = useFactory();
  const [kind, setKind] = useState<StockKind>("return");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const warehouse = db.warehouses.find((w) => w.kind === "material") ?? null;

  const save = () => {
    if (!material) return;
    try {
      addStockMovement({
        date: cairoToday(),
        itemType: "material",
        itemId: material.id,
        warehouseId: warehouse?.id ?? null,
        kind,
        qty: Number(amount) || 0,
        unitCost: material.avgCost,
        refType: "scan",
        refId: null,
        notes,
      });
      recordScan({
        kind: "material",
        refId: material.id,
        code: material.name,
        action: kind === "return" ? "receive" : "issue",
        source: "manual",
        qty: Math.abs(Number(amount) || 0),
        to: kind === "return" ? warehouse?.name ?? "" : "",
        from: kind === "return" ? "" : warehouse?.name ?? "",
        note: STOCK_KIND_LABEL[kind],
      });
      toast.success("الحركة اتسجّلت في دفتر المخزن.");
      setAmount("");
      setNotes("");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر أسجّل الحركة.");
    }
  };

  return (
    <Panel
      open={open && !!material}
      title="حركة مخزن"
      onClose={onClose}
      footer={
        <Button className="w-full" size="lg" onClick={save}>
          سجّل الحركة
        </Button>
      }
    >
      {material ? (
        <>
          <div className="mb-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <p>{material.name}</p>
            <p className="text-muted-foreground">{warehouse?.name ?? "بدون مخزن"} · التكلفة بتتحسب بمتوسط تكلفة الخامة</p>
          </div>
          <Field label="نوع الحركة">
            <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as StockKind)}>
              <option value="return">{STOCK_KIND_LABEL.return}</option>
              <option value="waste">{STOCK_KIND_LABEL.waste}</option>
              <option value="adjust">{STOCK_KIND_LABEL.adjust}</option>
            </select>
          </Field>
          <Field label="الكمية">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="ملاحظة">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <p className="text-xs text-muted-foreground">التسوية بتقبل رقم سالب لو الجرد أقل من الدفاتر.</p>
        </>
      ) : null}
    </Panel>
  );
}