import { ChevronDown } from "lucide-react";
import { Money } from "@/components/Money";
import { Badge, type Tone } from "@/components/ui/badge";
import { Card, DataRow } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { useFactory } from "@/store/context";
import {
  churnRisk,
  clv,
  customerMetrics,
  customerScore,
  insights,
  journey,
  nextActions,
  rfm,
  type CustomerScore,
  type ScoreBlock,
} from "@/store/intelligence";

export function scoreTone(v: number): Tone {
  return v >= 80 ? "ok" : v >= 70 ? "gold" : v >= 50 ? "warn" : "danger";
}

/** بطاقة مختصرة للاستخدام في النظرة العامة */
export function ScoreSummary({ partyId, onOpen }: { partyId: string; onOpen: () => void }) {
  const { db } = useFactory();
  const score = customerScore(db, partyId);

  if (!score.enough) {
    return (
      <Card>
        <h3 className="text-base">سكور العميل</h3>
        <p className="mt-1 text-sm text-muted-foreground">{score.shortfall}</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base">سكور العميل</h3>
          <p className="mt-1 text-3xl tabular">
            {score.total}
            <span className="text-base text-muted-foreground"> / 100</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={score.tier?.tone ?? "muted"}>{score.tier?.label}</Badge>
          <Badge tone={score.risk.level === "high" ? "danger" : score.risk.level === "medium" ? "warn" : "ok"}>
            {score.risk.levelLabel} {score.risk.total}
          </Badge>
        </div>
      </div>
      <ul className="mt-3 list-none space-y-1 text-sm">
        {score.up.slice(0, 2).map((r) => (
          <li key={r} className="text-ok">
            ↑ {r}
          </li>
        ))}
        {score.down.slice(0, 2).map((r) => (
          <li key={r} className="text-danger">
            ↓ {r}
          </li>
        ))}
      </ul>
      <button onClick={onOpen} className="mt-3 text-sm text-accent underline underline-offset-4">
        شوف الدرجة اتكوّنت إزاي
      </button>
    </Card>
  );
}

/** تبويب الذكاء الكامل في صفحة العميل */
export function CustomerIntelligence({ partyId }: { partyId: string }) {
  const { db } = useFactory();
  const m = customerMetrics(db, partyId);
  const score = customerScore(db, partyId);
  const r = rfm(db, partyId);
  const value = clv(db, partyId);
  const churn = churnRisk(db, partyId);
  const steps = journey(db, partyId);
  const notes = insights(db, partyId);
  const actions = nextActions(db, partyId);

  return (
    <div className="space-y-4">
      <ScoreHeader score={score} />

      <section>
        <h3 className="mb-2 text-base">مؤشرات الصحة — كل واحد بوزنه وتفسيره</h3>
        <div className="space-y-2">
          {score.blocks.map((b) => (
            <BlockCard key={b.key} block={b} coverage={score.coverage} />
          ))}
        </div>
        {score.coverage < 100 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            المحسوب فعليًا يمثل {score.coverage}٪ من الأوزان — المؤشرات اللي مفيش لها بيانات استُبعدت من الحساب
            وما اتخمّنتش، والأوزان اتوزّعت على الباقي.
          </p>
        ) : null}
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <h3 className="text-base">الخطوة الجاية</h3>
          <ul className="mt-2 list-none space-y-3">
            {actions.map((a) => (
              <li key={a.title}>
                <Badge tone={a.tone === "ok" ? "ok" : a.tone === "warn" ? "warn" : "danger"}>{a.title}</Badge>
                <ul className="mt-1 list-none space-y-0.5 text-sm text-muted-foreground">
                  {a.why.map((w) => (
                    <li key={w}>— {w}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h3 className="text-base">ملاحظات النظام</h3>
          <ul className="mt-2 list-none space-y-2 text-sm">
            {notes.map((n) => (
              <li key={n} className="border-r-2 border-accent pr-2.5">
                {n}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <h3 className="text-base">خطر التوقف</h3>
          {churn.enough ? (
            <>
              <p className="mt-1 text-2xl tabular">
                {churn.pct}
                <span className="text-base text-muted-foreground">٪</span>
              </p>
              <ul className="mt-1 list-none space-y-1 text-sm text-muted-foreground">
                {churn.reasons.map((x) => (
                  <li key={x}>— {x}</li>
                ))}
              </ul>
              {churn.action ? (
                <Badge tone={(churn.pct ?? 0) >= 60 ? "danger" : "warn"} className="mt-2">
                  {churn.action}
                </Badge>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{churn.reasons[0]}</p>
          )}
        </Card>

        <Card>
          <h3 className="text-base">RFM</h3>
          {r.enough ? (
            <>
              <div className="mt-1 flex gap-2">
                {[
                  { k: "R", v: r.r, t: "آخر شراء" },
                  { k: "F", v: r.f, t: "التكرار" },
                  { k: "M", v: r.m, t: "الصرف" },
                ].map((x) => (
                  <div key={x.k} className="flex-1 rounded-md border border-border p-2 text-center">
                    <p className="latin text-xs text-muted-foreground">{x.k}</p>
                    <p className="text-xl tabular">{x.v}</p>
                    <p className="text-xs text-muted-foreground">{x.t}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-sm">{r.label}</p>
              <ul className="mt-1 list-none space-y-0.5 text-xs text-muted-foreground">
                {r.why.map((w) => (
                  <li key={w}>— {w}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{r.label}</p>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="text-base">القيمة المتوقعة للعميل (CLV)</h3>
        {value.enough ? (
          <p className="mt-1 text-2xl">
            <Money value={value.value ?? 0} />
          </p>
        ) : null}
        <ul className="mt-1 list-none space-y-1 text-sm text-muted-foreground">
          {value.assumptions.map((a) => (
            <li key={a}>— {a}</li>
          ))}
        </ul>
      </Card>

      {steps.length ? (
        <Card>
          <h3 className="mb-2 text-base">رحلة العميل</h3>
          <ol className="list-none space-y-0">
            {steps.map((s, i) => (
              <li key={`${s.period}-${i}`} className="border-r border-border pr-4">
                <div className="relative -mr-[21px] inline-block h-2.5 w-2.5 rounded-full bg-accent align-middle" />
                <div className="inline-block pb-3 pr-2 align-middle">
                  <p className="text-sm">
                    <span className="tabular text-muted-foreground">{s.period}</span> — {s.text}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      <Card>
        <h3 className="mb-1 text-base">أعمار المديونية</h3>
        <dl>
          {m.aging.map((a) => (
            <DataRow key={a.label} label={a.label}>
              {a.amount ? <Money value={a.amount} /> : <span className="text-sm text-muted-foreground">—</span>}
            </DataRow>
          ))}
        </dl>
      </Card>
    </div>
  );
}

function ScoreHeader({ score }: { score: CustomerScore }) {
  if (!score.enough) {
    return (
      <Card>
        <h3 className="text-base">سكور العميل</h3>
        <p className="mt-1 text-sm text-muted-foreground">{score.shortfall}</p>
      </Card>
    );
  }
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">سكور العميل</p>
          <p className="text-4xl tabular">
            {score.total}
            <span className="text-lg text-muted-foreground"> / 100</span>
          </p>
          <Badge tone={score.tier?.tone ?? "muted"} className="mt-1">
            {score.tier?.label}
          </Badge>
        </div>
        <div className="min-w-[180px]">
          <p className="text-sm text-muted-foreground">مؤشر الخطر</p>
          <p className="text-2xl tabular">
            {score.risk.total}
            <span className="text-base text-muted-foreground"> / 100</span>
          </p>
          <Badge tone={score.risk.level === "high" ? "danger" : score.risk.level === "medium" ? "warn" : "ok"}>
            {score.risk.levelLabel}
          </Badge>
          {score.risk.factors.length ? (
            <ul className="mt-2 list-none space-y-0.5 text-xs text-muted-foreground">
              {score.risk.factors.map((f) => (
                <li key={f.label}>
                  +{f.points} {f.label} — {f.why}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">مفيش عوامل خطر مسجّلة عليه.</p>
          )}
        </div>
      </div>

      {score.up.length || score.down.length ? (
        <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">اللي رفع الدرجة</p>
            <ul className="mt-1 list-none space-y-1 text-sm">
              {score.up.length ? score.up.map((r) => <li key={r} className="text-ok">↑ {r}</li>) : <li className="text-muted-foreground">مفيش مؤشر فوق 70.</li>}
            </ul>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">اللي نزّل الدرجة</p>
            <ul className="mt-1 list-none space-y-1 text-sm">
              {score.down.length ? score.down.map((r) => <li key={r} className="text-danger">↓ {r}</li>) : <li className="text-muted-foreground">مفيش مؤشر تحت 60.</li>}
            </ul>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function BlockCard({ block, coverage }: { block: ScoreBlock; coverage: number }) {
  const effective = coverage > 0 && block.score !== null ? Math.round((block.weight / coverage) * 100) : block.weight;
  return (
    <details className="group rounded-lg border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-3.5">
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        <span className="flex-1">
          <span className="font-medium">{block.label}</span>
          <span className="block text-xs text-muted-foreground">
            وزنه {block.weight}٪{block.score !== null && effective !== block.weight ? ` (فعليًا ${effective}٪)` : ""}
          </span>
        </span>
        {block.score === null ? (
          <Badge>بيانات مش كفاية</Badge>
        ) : (
          <Badge tone={scoreTone(block.score)}>{block.score}</Badge>
        )}
      </summary>
      <div className="border-t border-border px-3.5 py-3">
        {block.parts.length ? (
          <ul className="list-none space-y-2.5">
            {block.parts.map((p) => (
              <li key={p.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span>{p.label}</span>
                  <span className="tabular text-muted-foreground">{p.value}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${p.value}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{p.why}</p>
              </li>
            ))}
          </ul>
        ) : null}

        {block.metrics.length ? (
          <dl className="mt-3 border-t border-border pt-2">
            {block.metrics.map((x) => (
              <DataRow key={x.label} label={x.label}>
                <span className="text-sm tabular">{x.value}</span>
              </DataRow>
            ))}
          </dl>
        ) : null}

        {block.note ? <p className="mt-2 text-xs text-muted-foreground">{block.note}</p> : null}
        {block.missing.length ? (
          <p className="mt-2 rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
            مش داخل في الحساب لأن بياناته لسه مش في النظام: {block.missing.join("، ")}. أول ما الموديول بتاعها يشتغل،
            هتدخل في الدرجة تلقائيًا — النظام مبيخمّنش.
          </p>
        ) : null}
      </div>
    </details>
  );
}

export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return formatDate(`${y}-${String(m).padStart(2, "0")}-01`).replace(/^\d+\s/, "");
}
