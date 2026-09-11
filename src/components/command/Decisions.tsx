import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronDown, Lightbulb, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { money, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { decisions, opportunities, riskProfile, type Decision, type Range } from "@/store/command";
import { Gauge } from "@/components/charts/Chart";
import { Needs, Section } from "./Kit";

const DOT: Record<Decision["tone"], string> = { danger: "bg-danger", warn: "bg-warn", ok: "bg-ok" };
const KIND_LABEL: Record<Decision["kind"], string> = {
  risk: "خطر",
  opportunity: "فرصة",
  attention: "محتاج انتباه",
};
const KIND_TONE: Record<Decision["kind"], "danger" | "ok" | "warn"> = {
  risk: "danger",
  opportunity: "ok",
  attention: "warn",
};

/**
 * **ذكاء صنعة** — الفرق بين لوحة أرقام ولوحة قرارات.
 *
 * القاعدة اللي كل سطر هنا ماشي عليها:
 * مش «الإيراد ٨٤٠ ألف»، لكن
 * «الإيراد زاد ١٨٪ والربح زاد ٩٪ بس، **لأن** القماش زاد ١٤٪،
 *  **الأثر** ١٨٠ ألف في الشهر، **اعمل** راجع سعر المورّد».
 *
 * ومفيش سطر بيتكتب من غير سبب معروف من البيانات — لو السبب مش
 * محسوب، السطر مابيظهرش خالص بدل ما نكتب كلام عام.
 */
export function DecisionsCard({ range, cmp, limit = 4 }: { range: Range; cmp: Range | null; limit?: number }) {
  const { db } = useFactory();
  const rows = decisions(db, range, cmp);
  const [open, setOpen] = useState<string | null>(rows[0]?.key ?? null);
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, limit);

  const money7 = rows.filter((r) => r.impact !== null).reduce((s, r) => s + (r.impact as number), 0);

  if (!rows.length) {
    return (
      <Card>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-accent" />
          <h3 className="text-base">ذكاء صنعة</h3>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          مفيش قرار مستعجل من بياناتك دلوقتي: الأسعار مستقرة، الهوامش فوق الهدف، ومفيش تحصيل قديم. الكارت ده
          بيتكلّم لما يلاقي سبب ورقم — مش بيكتب نصايح عامة.
        </p>
        {!cmp ? (
          <p className="mt-2 text-xs text-muted-foreground">
            ولو فعّلت المقارنة بالفترة السابقة، بيقدر كمان يقولك إيه اللي اتغيّر وليه.
          </p>
        ) : null}
      </Card>
    );
  }

  return (
    <Card className="border-r-2 border-r-accent">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-accent" />
          <div>
            <h3 className="text-base">ذكاء صنعة</h3>
            <p className="text-xs text-muted-foreground">
              مش أرقام — سبب وأثر وخطوة. كله محسوب من دفاتر مصنعك في الفترة المختارة.
            </p>
          </div>
        </div>
        {money7 > 0 ? (
          <p className="shrink-0 text-xs text-muted-foreground">
            إجمالي الأثر المحسوب <span className="tabular text-accent">{money(money7)}</span>
          </p>
        ) : null}
      </div>

      <ol className="mt-3 list-none space-y-3 border-t border-border pt-3">
        {shown.map((d) => {
          const isOpen = open === d.key;
          return (
            <li key={d.key}>
              <div className="flex gap-2.5">
                <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${DOT[d.tone]}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className="text-sm">{d.headline}</p>
                    <Badge tone={KIND_TONE[d.kind]}>{KIND_LABEL[d.kind]}</Badge>
                  </div>

                  <p className="mt-0.5 text-xs text-muted-foreground">{d.cause}</p>

                  {d.impactLabel ? (
                    <p className="mt-1 inline-block rounded-md bg-accent-soft px-2 py-0.5 text-xs text-accent-foreground">
                      {d.impactLabel}
                    </p>
                  ) : null}

                  <p className="mt-1 text-sm text-accent">← {d.action}</p>

                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    {d.to ? (
                      <Link
                        to={d.to}
                        className="flex items-center gap-0.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      >
                        افتح الشاشة
                        <ArrowLeft className="h-3 w-3" />
                      </Link>
                    ) : null}
                    {d.evidence.length ? (
                      <button
                        onClick={() => setOpen(isOpen ? null : d.key)}
                        aria-expanded={isOpen}
                        className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        الأرقام اللي اتبنى عليها
                        <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                    ) : null}
                  </div>

                  {isOpen && d.evidence.length ? (
                    <ul className="mt-1.5 list-none space-y-0.5 border-r-2 border-border pr-2.5">
                      {d.evidence.map((e) => (
                        <li key={e} className="text-xs tabular text-muted-foreground">
                          {e}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {rows.length > limit ? (
        <Button variant="ghost" size="sm" className="mt-2 px-0" onClick={() => setAll(!all)}>
          {all ? `اعرض أهم ${qty(limit, 0)}` : `شوف الباقي (${qty(rows.length - limit, 0)})`}
        </Button>
      ) : null}

      <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
        التحليل ده على بيانات مصنعك بس، ومابيقربش لبيانات أي مصنع تاني. ومابيخترعش رقم: كل سطر جواه
        «الأرقام اللي اتبنى عليها».
      </p>
    </Card>
  );
}

/* ── الفرص: كام جنيه على الطربيزة ──────────────────────────────── */

export function OpportunitiesCard({ range, cmp }: { range: Range; cmp: Range | null }) {
  const { db } = useFactory();
  const { rows, total } = opportunities(db, range, cmp);

  return (
    <Card className="h-full">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 shrink-0 text-ok" />
        <h3 className="text-base">فرص محسوبة</h3>
      </div>

      {!rows.length ? (
        <p className="mt-1.5 text-sm text-muted-foreground">
          مفيش فرصة بقيمة محسوبة دلوقتي. الفرص هنا بتظهر لما يكون فيها رقم: مخزون راكد، هالك، أو فرق سعر مورّد.
        </p>
      ) : (
        <>
          <p className="mt-0.5 text-xl tabular text-ok">{money(total)}</p>
          <p className="text-xs text-muted-foreground">إجمالي اللي ممكن يتوفّر أو يترجع لو اتعامَلت معاها</p>
          <ol className="mt-2 list-none space-y-2 border-t border-border pt-2">
            {rows.map((r) => (
              <li key={r.key}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 text-sm">{r.label}</span>
                  <span className="shrink-0 text-sm tabular text-ok">{money(r.amount)}</span>
                </div>
                <p className="text-xs text-muted-foreground">{r.action}</p>
                {r.to ? (
                  <Link to={r.to} className="text-xs text-accent underline-offset-4 hover:underline">
                    افتح
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        </>
      )}
    </Card>
  );
}

/* ── المخاطر: مؤشر الأقل أحسن ──────────────────────────────────── */

export function RisksCard({ range, cmp }: { range: Range; cmp: Range | null }) {
  const { db } = useFactory();
  const profile = riskProfile(db, range, cmp);

  return (
    <Card className="h-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 text-danger" />
          <div>
            <h3 className="text-base">مخاطر المصنع</h3>
            <p className="text-xs text-muted-foreground">{profile.note}</p>
          </div>
        </div>
        {profile.score !== null ? (
          <Gauge
            value={profile.score}
            size={78}
            label="خطر"
            tone={profile.score <= 20 ? "var(--ok)" : profile.score <= 50 ? "var(--warn)" : "var(--danger)"}
          />
        ) : null}
      </div>

      {!profile.lines.length ? (
        <p className="mt-1.5 text-sm text-ok">مفيش خطر قايم من بياناتك دلوقتي.</p>
      ) : (
        <ul className="mt-2 list-none space-y-1.5 border-t border-border pt-2">
          {profile.lines.map((l) => (
            <li key={l.key} className="flex gap-2">
              <span
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${l.tone === "danger" ? "bg-danger" : "bg-warn"}`}
                aria-hidden
              />
              {l.to ? (
                <Link to={l.to} className="text-sm underline-offset-4 hover:underline">
                  {l.label}
                </Link>
              ) : (
                <span className="text-sm">{l.label}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ── توقع الشهر الجاي ──────────────────────────────────────────── */

export function ForecastCard({ forecastData }: { forecastData: import("@/store/command").Forecast }) {
  const f = forecastData;
  return (
    <Card className="h-full">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 shrink-0 text-accent" />
        <h3 className="text-base">متوقع الـ{qty(f.days, 0)} يوم الجايين</h3>
      </div>

      {f.expectedRevenue === null ? (
        <div className="mt-2">
          <Needs what={f.missing ?? "توريدات مسجّلة"} />
        </div>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">إيراد متوقع</p>
              <p className="text-lg tabular">{money(f.expectedRevenue)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">مؤكد من أوامر مفتوحة</p>
              <p className="text-lg tabular">{money(f.committed)}</p>
            </div>
            {f.expectedUnits !== null ? (
              <div>
                <p className="text-xs text-muted-foreground">إنتاج متوقع</p>
                <p className="text-lg tabular">{qty(f.expectedUnits, 0)} قطعة</p>
              </div>
            ) : null}
            {f.confidencePct !== null ? (
              <div>
                <p className="text-xs text-muted-foreground">درجة الثقة</p>
                <p className="text-lg tabular">{qty(f.confidencePct, 0)}٪</p>
              </div>
            ) : null}
          </div>
          <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
            {f.basis}. الثقة محسوبة من تقلّب الأسابيع اللي فاتت — مش رقم تسويقي.
          </p>
        </>
      )}
    </Card>
  );
}

/** ٤٩ + ٥٠ جنب بعض */
export function RisksAndOpportunities({ range, cmp }: { range: Range; cmp: Range | null }) {
  return (
    <Section title="الفرص والمخاطر" hint="اللي بيزوّد الربح واللي بيأكله — الاتنين بأرقام">
      <div className="grid gap-3 md:grid-cols-2">
        <OpportunitiesCard range={range} cmp={cmp} />
        <RisksCard range={range} cmp={cmp} />
      </div>
    </Section>
  );
}
