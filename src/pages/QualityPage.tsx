import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { selectClass } from "@/components/ui/input";
import { ExportMenu } from "@/components/export/ExportMenu";
import { money, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { datasetOf } from "@/store/datasets";
import {
  causesOf,
  copq,
  costlyProblems,
  lineAlerts,
  lineQuality,
  originBreakdown,
  problemPareto,
  qualityAlerts,
  qualityCenter,
  repairSummary,
  supplierQuality,
  workerQuality,
} from "@/store/quality";
import { PROBLEM_KINDS, PROBLEM_LABEL, type ProblemKind } from "@/store/types";

/**
 * مركز الجودة.
 *
 * الشاشة دي مبنية على سؤال واحد: **الجودة بتكلّفنا كام، وليه، ومنين؟**
 * وعشان كده مافيهاش رقم لوحده: كل نسبة جنبها المقام بتاعها، وكل مشكلة
 * جنبها تكلفتها، وكل ترتيب مكتوب فوقه إنه مرتّب بالعدد ولا بالفلوس.
 *
 * والفرق بينها وبين المرتجعات إن المرتجعات **دفتر** — بتسجّل حالات؛ ودي
 * **تحليل** — مابتسجّلش حاجة خالص، بتقرا من الباندلات والمرتجعات وأوامر
 * الإصلاح وترد على السؤال. عشان كده كل زر هنا بيودّي لمكان التسجيل.
 */

const TABS = [
  { id: "center", label: "مركز الجودة" },
  { id: "problems", label: "المشاكل" },
  { id: "causes", label: "الجذور والمصادر" },
  { id: "lines", label: "الخطوط والعمال" },
  { id: "suppliers", label: "المورّدين" },
  { id: "cost", label: "تكلفة الجودة" },
] as const;

export function QualityPage() {
  const { db, can } = useFactory();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>(() => {
    const want = params.get("tab");
    return TABS.some((t) => t.id === want) ? (want as (typeof TABS)[number]["id"]) : "center";
  });

  /* التاب في العنوان عشان التنبيه يقدر يوصّل للجدول اللي بيتكلم عنه */
  const pickTab = (id: (typeof TABS)[number]["id"]) => {
    setTab(id);
    const next = new URLSearchParams(params);
    next.set("tab", id);
    setParams(next, { replace: true });
  };

  const center = useMemo(() => qualityCenter(db, 30), [db]);
  const alerts = useMemo(() => qualityAlerts(db, 30), [db]);
  const reps = useMemo(() => repairSummary(db), [db]);

  const empty = !db.returns.length && !(db.bundleOps ?? []).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">الجودة والمرتجعات</h2>
          <p className="text-sm text-muted-foreground">
            العيب اللي اتمسك جوه والعيب اللي رجع من برّه نفس المشكلة — فبيتحسبوا في جدول واحد.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <ExportMenu module="quality" dataset={() => datasetOf(db, "returns")} />
          <Button variant="outline" asChild>
            <Link to="/returns">دفتر المرتجعات</Link>
          </Button>
        </div>
      </div>

      {empty ? (
        <EmptyState
          icon={ShieldCheck}
          title="مافيش بيانات جودة لسه"
          body="التحليل ده بيقرا من مكانين: العيب اللي بيتسجّل على الباندلات في متابعة العمليات، والمرتجعات اللي بتتفحص في دفتر المرتجعات. سجّل واحد منهم وهيبان هنا."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <p className="text-sm text-muted-foreground">حالات في ٣٠ يوم</p>
              <p className="mt-1 text-2xl tabular">{qty(center.cases, 0)}</p>
              <p className="text-xs text-muted-foreground">
                {qty(center.pieces, 0)} قطعة · قيمتها {money(center.value)}
              </p>
            </Card>
            <Card className={center.netLoss > 0 ? "border-danger/30" : ""}>
              <p className="text-sm text-muted-foreground">صافي الخسارة</p>
              <p className="mt-1 text-2xl">
                <Money value={center.netLoss} />
              </p>
              <p className="text-xs text-muted-foreground">
                إصلاح {money(center.repairCost)} · شحن {money(center.shippingCost)} · هالك {money(center.scrapCost)}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-muted-foreground">نسبة الإرجاع</p>
              <p className="mt-1 text-2xl tabular">
                {center.returnRatePct === null ? "—" : `${qty(center.returnRatePct, 1)}٪`}
              </p>
              <p className="text-xs text-muted-foreground">
                {center.returnRatePct === null
                  ? "مافيش كميات تسليم في المدة نقارن عليها"
                  : "قطع راجعة من عملاء ÷ قطع متسلّمة"}
              </p>
            </Card>
            <Card className={center.waiting ? "border-warn/40 bg-warn-soft/30" : ""}>
              <p className="text-sm text-muted-foreground">مستني قرار</p>
              <p className={`mt-1 text-2xl tabular ${center.waiting ? "text-warn" : ""}`}>{qty(center.waiting, 0)}</p>
              <p className="text-xs text-muted-foreground">{qty(center.inRepair, 0)} قطعة في دورة الإصلاح</p>
            </Card>
          </div>

          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => pickTab(t.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
                  tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "center" ? <Center alerts={alerts} reps={reps} center={center} /> : null}
          {tab === "problems" ? <Problems /> : null}
          {tab === "causes" ? <Causes /> : null}
          {/*
            ترتيب العمال بالعيب **تقييم أشخاص**، فمحتاج صلاحيتين مع بعض:
            العمال (بيانات ناس) والتقارير (مقارنة بين ناس). والمشرف عنده
            الأولى بحكم شغله ومعندوش التانية — وهو أقرب واحد للترتيب ده
            وأكتر واحد ممكن يتحوّل على إيده من قياس لحكم على زمايله.
          */}
          {tab === "lines" ? (
            <Lines canSeeWorkers={can.do("workers", "view") && can.do("reports", "view")} />
          ) : null}
          {tab === "suppliers" ? <Suppliers /> : null}
          {tab === "cost" ? <CostOfQuality /> : null}
        </>
      )}
    </div>
  );
}

/* ── التنبيهات ودورة الإصلاح ──────────────────────────────────── */

function Center({
  alerts,
  reps,
  center,
}: {
  alerts: ReturnType<typeof qualityAlerts>;
  reps: ReturnType<typeof repairSummary>;
  center: ReturnType<typeof qualityCenter>;
}) {
  return (
    <div className="space-y-3">
      {alerts.length ? (
        alerts.map((a) => (
          <Card key={a.key} className="border-danger/30">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0">{a.headline}</p>
              {a.cost > 0 ? (
                <p className="shrink-0 text-lg">
                  <Money value={a.cost} />
                </p>
              ) : null}
            </div>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {a.why.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <p className="mt-2 border-t border-border pt-2 text-sm">{a.action}</p>
            <div className="mt-2">
              <Button variant="outline" asChild>
                <Link to={a.to}>روح للتفاصيل</Link>
              </Button>
            </div>
          </Card>
        ))
      ) : (
        <Card>
          <p className="text-sm text-muted-foreground">
            مافيش تنبيه دلوقتي. والتنبيه هنا لازم يكون مبني على مقارنة مش على رقم لوحده: «رجع ٤٠ قطعة» مش تنبيه،
            لكن «الموديل ده لوحده عامل ٣٧٪ من مرتجعات الشهر ونسبته طلعت من ٢٫١٪ لـ٥٫٨٪» تنبيه.
          </p>
        </Card>
      )}

      <Card>
        <p className="mb-3">دورة الإصلاح</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm text-muted-foreground">أوامر شغّالة</p>
            <p className="text-xl tabular">{qty(reps.open, 0)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">تحت الفحص</p>
            <p className="text-xl tabular">{qty(reps.inQc, 0)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">تكلفة الإصلاح للقطعة</p>
            <p className="text-xl tabular">{reps.perPiece === null ? "—" : money(reps.perPiece)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">عدّى الفحص</p>
            <p className="text-xl tabular">{reps.passPct === null ? "—" : `${qty(reps.passPct, 0)}٪`}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          نسبة الإصلاح {center.repairRatePct === null ? "—" : `${qty(center.repairRatePct, 0)}٪`} والإهلاك{" "}
          {center.scrapRatePct === null ? "—" : `${qty(center.scrapRatePct, 0)}٪`} — والمقام هنا القطع اللي اتقرر فيها
          إصلاح أو إهلاك بس، مش كل المرتجعات.
        </p>
        <div className="mt-3">
          <Button variant="outline" asChild>
            <Link to="/repairs">أوامر الإصلاح</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ── المشاكل: بالعدد وبالفلوس ─────────────────────────────────── */

function Problems() {
  const { db } = useFactory();
  const [by, setBy] = useState<"qty" | "cost">("qty");
  const byQty = useMemo(() => problemPareto(db, 90), [db]);
  const byCost = useMemo(() => costlyProblems(db, 90), [db]);
  const rows = by === "qty" ? byQty : byCost;
  const eighty = byQty.findIndex((r) => r.cumPct >= 80);

  if (!byQty.length) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          مافيش مشاكل مسجّلة في آخر ٩٠ يوم. المشكلة بتتسجّل في مكانين: بلاغ العيب على الباندل، وفحص المرتجع.
        </p>
      </Card>
    );
  }

  const flip = byQty[0] && byCost[0] && byQty[0].kind !== byCost[0].kind;
  const pendingCases = byQty.reduce((s, r) => s + r.pending, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { id: "qty", label: "بالعدد" },
            { id: "cost", label: "بالفلوس" },
          ] as const
        ).map((x) => (
          <button
            key={x.id}
            onClick={() => setBy(x.id)}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              by === x.id ? "border-gold bg-gold/10 text-gold" : "border-border text-muted-foreground"
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {flip ? (
        <Card className="border-gold/40">
          <p className="text-sm">
            أكتر مشكلة بالعدد «{byQty[0].label}»، وأغلى مشكلة «{byCost[0].label}». لو هتشتغل على حاجة واحدة، الغالية
            بتوفّر أكتر رغم إنها أقل في العدد.
          </p>
        </Card>
      ) : null}

      <Card>
        {by === "qty" && eighty >= 0 ? (
          <p className="mb-3 text-sm">
            أول {qty(eighty + 1, 0)} مشكلة بيعملوا {qty(byQty[eighty].cumPct, 0)}٪ من العيوب.
          </p>
        ) : null}
        {by === "cost" && pendingCases > 0 ? (
          <p className="mb-3 text-sm text-muted-foreground">
            ترتيب الفلوس ده مؤقت: {qty(pendingCases, 0)} حالة لسه مستني قرار، وتكلفتها مش داخلة في الحساب لحد ما
            تتسوّى.
          </p>
        ) : null}
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.kind}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span>{r.label}</span>
                <span className="shrink-0 tabular text-muted-foreground">
                  {qty(r.qty, 0)} قطعة ·{" "}
                  {r.cost === 0 && r.pending > 0 ? "التكلفة لسه مش محسوبة" : money(r.cost)}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gold"
                  style={{
                    width: `${Math.min(
                      100,
                      by === "qty" ? r.pct : (r.cost / Math.max(1, rows[0].cost)) * 100,
                    )}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                اتمسك جوه {qty(r.inside, 0)} · رجع من برّه {qty(r.outside, 0)} · {qty(r.cases, 0)} حالة
                {r.pending > 0 ? ` · منهم ${qty(r.pending, 0)} لسه مستني قرار` : ""}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          القطعة اللي اتهلكت محسوبة بكل تكلفتها، واللي اترجعت للتشغيل بنص تكلفتها — لأنها مااتلفتش، بس اتشتغلت مرتين.
        </p>
      </Card>
    </div>
  );
}

/* ── الجذور والمصادر ──────────────────────────────────────────── */

function Causes() {
  const { db } = useFactory();
  const [problem, setProblem] = useState<ProblemKind | "all">("all");
  const causes = useMemo(() => causesOf(db, problem, 90), [db, problem]);
  const origins = useMemo(() => originBreakdown(db, 90), [db]);
  const top = causes.find((c) => c.cause !== null) ?? null;

  return (
    <div className="space-y-3">
      <Card>
        <p className="mb-3 text-sm text-muted-foreground">
          «عيب خياطة من العامل» مكان مش سبب. الجذر هو اللي بيمنع نفس المشكلة ترجع الشهر الجاي.
        </p>
        <select
          className={selectClass}
          value={problem}
          onChange={(e) => setProblem(e.target.value as ProblemKind | "all")}
        >
          <option value="all">كل المشاكل</option>
          {PROBLEM_KINDS.map((k) => (
            <option key={k} value={k}>
              {PROBLEM_LABEL[k]}
            </option>
          ))}
        </select>

        {!causes.length ? (
          <p className="mt-3 text-sm text-muted-foreground">مافيش حالات لها مشكلة مكتوبة في التصنيف ده.</p>
        ) : (
          <>
            {top ? (
              <p className="mt-3 text-sm">
                أكبر جذر: {top.label} — {qty(top.pct, 1)}٪ من القطع.
              </p>
            ) : null}
            <ul className="mt-3 space-y-2">
              {causes.map((c) => (
                <li key={c.cause ?? "none"}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className={c.cause === null ? "text-muted-foreground" : ""}>{c.label}</span>
                    <span className="shrink-0 tabular text-muted-foreground">
                      {qty(c.qty, 0)} قطعة · {qty(c.pct, 0)}٪
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${c.cause === null ? "bg-muted-foreground/40" : "bg-gold"}`}
                      style={{ width: `${Math.min(100, c.pct)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              الحالات اللي مالهاش جذر مكتوب بتتعرض باسمها — مش بتتوزّع على الجذور المعروفة، عشان مانطلعش تحليل واثق
              مبني على تخمين.
            </p>
          </>
        )}
      </Card>

      <Card>
        <p className="mb-1">المشكلة جات منين</p>
        <p className="mb-3 text-xs text-muted-foreground">
          المصدر مش وصف المشكلة: «مشكلة من المورّد» مكان جات منه، و«عيب قماش» وصف اللي حصل.
        </p>
        <ul className="space-y-2 text-sm">
          {origins.map((o) => (
            <li key={o.origin ?? "none"} className="flex flex-wrap items-baseline justify-between gap-2">
              <span className={o.origin === null ? "text-muted-foreground" : ""}>{o.label}</span>
              <span className="shrink-0 tabular text-muted-foreground">
                {qty(o.qty, 0)} قطعة · {qty(o.cases, 0)} حالة · {money(o.cost)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* ── الخطوط والعمال ───────────────────────────────────────────── */

function Lines({ canSeeWorkers }: { canSeeWorkers: boolean }) {
  const { db } = useFactory();
  const lines = useMemo(() => lineQuality(db, 90), [db]);
  const alerts = useMemo(() => lineAlerts(db, 90), [db]);
  const workers = useMemo(() => (canSeeWorkers ? workerQuality(db, 90) : []), [db, canSeeWorkers]);

  return (
    <div className="space-y-3">
      {alerts.map((a) => (
        <Card key={a.line} className="border-danger/40 bg-danger-soft/30">
          <p className="text-sm">
            {a.line}: نسبة العيب {qty(a.pct, 1)}٪ والمتوسط {qty(a.avg, 1)}٪ — فرق {qty(a.pct - a.avg, 1)} نقطة.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            قارن العمليات على الخط ده بنفس العمليات على خط تاني — الفرق بيبان في عملية واحدة غالبًا.
          </p>
        </Card>
      ))}

      <Card>
        <p className="mb-3">الخطوط</p>
        {!lines.length ? (
          <p className="text-sm text-muted-foreground">مافيش إنتاج مسجّل على الباندلات في آخر ٩٠ يوم.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {lines.map((l) => (
              <li key={l.line} className="flex flex-wrap items-baseline justify-between gap-2">
                <span>{l.line}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {l.defectPct === null ? (
                    <Badge tone="muted">إنتاجه أقل من حد المقارنة</Badge>
                  ) : (
                    <Badge tone={l.defectPct >= 6 ? "danger" : l.defectPct >= 3 ? "warn" : "ok"}>
                      {qty(l.defectPct, 1)}٪ عيب
                    </Badge>
                  )}
                  <span className="tabular text-muted-foreground">
                    {qty(l.produced, 0)} سليمة · {qty(l.returned, 0)} راجعة · {money(l.cost)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <p className="mb-1">جودة العمال</p>
        {!canSeeWorkers ? (
          <p className="text-sm text-muted-foreground">
            الترتيب ده تقييم أشخاص، فمحتاج صلاحية العمال وصلاحية التقارير مع بعض — مش صلاحية واحدة. أرقام خطك موجودة
            فوق، واللي ناقص هو مقارنة العمال ببعض. اطلبها من صاحب المصنع لو شغلك عليها.
          </p>
        ) : !workers.length ? (
          <p className="text-sm text-muted-foreground">مافيش شغل مسجّل على العمال بالاسم في آخر ٩٠ يوم.</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              الرقم ده قياس مش تقييم: بيقول العيب في شغله كام في المية، مش بيقول هو كويس ولا وحش — والعامل اللي على
              عملية صعبة نسبة عيبه أعلى بطبيعتها.
            </p>
            <ul className="space-y-2 text-sm">
              {workers.map((w) => (
                <li key={w.workerId} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="min-w-0">
                    <Link to={`/workers/${w.workerId}`} className="underline-offset-4 hover:underline">
                      {w.name}
                    </Link>
                    {w.topProblem ? (
                      <span className="block text-xs text-muted-foreground">
                        أشهر مشكلة: {w.topProblem.label} — {qty(w.topProblem.qty, 0)} قطعة
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {w.defectPct === null ? (
                      <Badge tone="muted">إنتاجه أقل من حد المقارنة</Badge>
                    ) : (
                      <Badge tone={w.defectPct >= 8 ? "danger" : w.defectPct >= 4 ? "warn" : "ok"}>
                        {qty(w.defectPct, 1)}٪ عيب
                      </Badge>
                    )}
                    <span className="tabular text-muted-foreground">
                      {qty(w.produced, 0)} سليمة · {money(w.cost)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}

/* ── المورّدين ────────────────────────────────────────────────── */

function Suppliers() {
  const { db } = useFactory();
  const rows = useMemo(() => supplierQuality(db, 180), [db]);

  if (!rows.length) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          مافيش مورّد له مشتريات في آخر ١٨٠ يوم. الجدول ده بيقارن قيمة اللي رجع بقيمة اللي اتشتري، فمحتاج الاتنين.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <p className="mb-3 text-sm text-muted-foreground">
          الدرجة دي بتقيس الجودة لوحدها: رجع قد إيه وكلّف قد إيه. والسعر الأرخص مش بالضرورة المورّد الأفضل — مقارنة
          التكلفة الحقيقية في استنتاجات صنعة.
        </p>
        <ul className="space-y-3 text-sm">
          {rows.map((s) => (
            <li key={s.partyId} className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="min-w-0">
                <Link to={`/parties/${s.partyId}`} className="underline-offset-4 hover:underline">
                  {s.name}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  اتشترى منه {money(s.received)} · رجع له {money(s.returnedValue)} · {qty(s.attributedCases, 0)} مشكلة
                  مصدرها هو أو خامته
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {s.score === null ? (
                  <Badge tone="muted">مافيش أساس للمقارنة</Badge>
                ) : (
                  <Badge tone={s.score >= 80 ? "ok" : s.score >= 50 ? "warn" : "danger"}>{qty(s.score, 0)}/١٠٠</Badge>
                )}
                <span className="tabular text-muted-foreground">أثره {money(s.costImpact)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <div>
        <Button variant="outline" asChild>
          <Link to="/insights">مقارنة التكلفة الحقيقية</Link>
        </Button>
      </div>
    </div>
  );
}

/* ── تكلفة الجودة الرديئة ─────────────────────────────────────── */

function CostOfQuality() {
  const { db } = useFactory();
  const c = useMemo(() => copq(db, 30), [db]);

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p>تكلفة الجودة الرديئة — ٣٠ يوم</p>
          <p className="text-2xl">
            <Money value={c.total} />
          </p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {c.ofRevenuePct === null
            ? "مافيش إيراد في المدة نقارن عليه"
            : `${qty(c.ofRevenuePct, 1)}٪ من إيراد المدة (${money(c.revenue)})`}{" "}
          · المحسوب {qty(c.coverage, 0)}٪ من البنود الأربعة
        </p>
        <ul className="mt-3 space-y-3 border-t border-border pt-3 text-sm">
          {c.blocks.map((b) => (
            <li key={b.key}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span>{b.label}</span>
                <span className="shrink-0 tabular">
                  {b.amount === null ? <span className="text-muted-foreground">مش محسوب</span> : money(b.amount)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{b.why}</p>
              {b.missing ? <p className="text-xs text-warn">{b.missing}</p> : null}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <p className="text-sm text-muted-foreground">
          البند اللي مش محسوب مكتوب باسمه بدل ما يتحط صفر. الصفر هنا كذب: معناه «مابنصرفش على المنع»، والصح إن الصرف ده
          مش بيتسجّل في النظام أصلًا.
        </p>
      </Card>
    </div>
  );
}
