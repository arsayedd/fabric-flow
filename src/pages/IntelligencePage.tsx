import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Brain } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { scoreTone } from "@/components/Intelligence";
import { Money } from "@/components/Money";
import { Field, Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import {
  cohorts,
  customerMetrics,
  DEFAULT_WEIGHTS,
  nextActions,
  portfolioStats,
  ranking,
  SCORE_LABEL,
  weightsOf,
  type ScoreKey,
  type ScoreWeights,
} from "@/store/intelligence";

export function IntelligencePage() {
  const { db, can } = useFactory();
  const [weightsOpen, setWeightsOpen] = useState(false);
  const rows = ranking(db);
  const pf = portfolioStats(db);
  const groups = cohorts(db);
  const scored = rows.filter((r) => r.total !== null);

  if (!pf.withHistory) {
    return (
      <EmptyState
        icon={Brain}
        title="الذكاء محتاج حركة الأول"
        body="أول ما تسجّل توريدات وتحصيلات، النظام يبدأ يقيس قوة كل عميل وسرعة سداده ونموه — من غير ما تكتب أي رقم بإيدك."
      />
    );
  }

  const focus = scored
    .map((r) => ({ row: r, actions: nextActions(db, r.party.id) }))
    .filter((x) => x.actions.some((a) => a.tone !== "ok"))
    .sort((a, b) => b.row.risk - a.row.risk)
    .slice(0, 4);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">ذكاء العملاء</h2>
          <p className="text-sm text-muted-foreground">
            مش كشف أرصدة — قياس لقيمة كل عميل وقوة سداده ونموه وخطره، وكل درجة بتقولك اتكوّنت منين.
          </p>
        </div>
        {can.staff ? (
          <Button variant="outline" onClick={() => setWeightsOpen(true)}>
            أوزان السكور
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <p className="text-sm text-muted-foreground">عملاء بتاريخ تعامل</p>
          <p className="mt-1 text-2xl tabular">{pf.withHistory}</p>
          <p className="text-xs text-muted-foreground">من {pf.customers} عميل</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">نشطين</p>
          <p className="mt-1 text-2xl tabular text-ok">{pf.active}</p>
          <p className="text-xs text-muted-foreground">طلبوا خلال 60 يوم</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">متوقفين</p>
          <p className="mt-1 text-2xl tabular">{pf.dormant}</p>
          <p className="text-xs text-muted-foreground">مطلبوش من 90 يوم</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">عليهم مؤشر خطر</p>
          <p className="mt-1 text-2xl tabular text-danger">{qty(pf.atRisk, 0)}</p>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-muted-foreground">مبيعات العملاء</p>
          <p className="mt-1 text-xl">
            <Money value={pf.sales} />
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">رصيد مفتوح</p>
          <p className="mt-1 text-xl">
            <Money value={pf.outstanding} />
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">متأخر</p>
          <p className="mt-1 text-xl text-danger">
            <Money value={pf.overdue} />
          </p>
        </Card>
      </div>

      {pf.top5Share !== null ? (
        <Card className={pf.concentrationRisk ? "border-warn/30 bg-warn-soft/40" : ""}>
          <div className="flex items-start gap-3">
            {pf.concentrationRisk ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" /> : null}
            <div className="min-w-0 flex-1">
              <h3 className="text-base">تركيز الإيرادات</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                أكبر {qty(pf.top5.length, 0)} عملاء = {qty(pf.top5Share, 0)}٪ من مبيعاتك.
                {pf.concentrationRisk ? " المصنع معتمد على عدد قليل — لو واحد وقف، الدخل هيتأثر فورًا." : ""}
              </p>
              <ul className="mt-2 list-none space-y-1.5">
                {pf.top5.map((t) => (
                  <li key={t.name}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate">{t.name}</span>
                      <span className="shrink-0 tabular text-muted-foreground">{qty(t.share, 0)}٪</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, t.share)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      ) : null}

      {pf.scoreBeatsSize && pf.bestByScore && pf.biggestBySales ? (
        <Card className="border-accent/30 bg-accent-soft/50">
          <h3 className="text-base">أكبر عميل مش دايمًا أفضل عميل</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            <strong className="font-medium text-foreground">{pf.biggestBySales.party.name}</strong> هو الأكبر مبيعات (
            {qty(pf.biggestBySales.sales, 0)} ج) بسكور {qty(pf.biggestBySales.total ?? 0, 0)} وهامش{" "}
            {pf.biggestBySales.marginPct === null ? "غير مسجّل" : `${qty(pf.biggestBySales.marginPct, 0)}٪`}، بينما{" "}
            <strong className="font-medium text-foreground">{pf.bestByScore.party.name}</strong> أعلى سكور (
            {qty(pf.bestByScore.total ?? 0, 0)}) بمبيعات {qty(pf.bestByScore.sales, 0)} ج وهامش{" "}
            {pf.bestByScore.marginPct === null ? "غير مسجّل" : `${qty(pf.bestByScore.marginPct, 0)}٪`}.
          </p>
        </Card>
      ) : null}

      {focus.length ? (
        <Card>
          <h3 className="text-base">مين أركز عليه؟</h3>
          <ul className="mt-2 list-none space-y-3">
            {focus.map((f) => (
              <li key={f.row.party.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link to={`/parties/${f.row.party.id}`} className="font-medium underline-offset-4 hover:underline">
                    {f.row.party.name}
                  </Link>
                  <Badge tone={f.row.risk >= 60 ? "danger" : f.row.risk >= 30 ? "warn" : "ok"}>
                    {f.row.riskLabel} {f.row.risk}
                  </Badge>
                </div>
                <ul className="mt-1 list-none space-y-0.5 text-sm text-muted-foreground">
                  {f.actions
                    .filter((a) => a.tone !== "ok")
                    .slice(0, 2)
                    .map((a) => (
                      <li key={a.title}>
                        {a.title} — {a.why[0]}
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <section>
        <h3 className="mb-2 text-base">ترتيب العملاء</h3>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="p-2.5 text-right font-medium">العميل</th>
                <th className="p-2.5 text-left font-medium">السكور</th>
                <th className="p-2.5 text-left font-medium">المبيعات</th>
                <th className="p-2.5 text-left font-medium">التحصيل</th>
                <th className="p-2.5 text-left font-medium">الهامش</th>
                <th className="p-2.5 text-left font-medium">CLV</th>
                <th className="p-2.5 text-left font-medium">الخطر</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.party.id} className="border-t border-border">
                  <td className="p-2.5">
                    <Link to={`/parties/${r.party.id}`} className="font-medium underline-offset-4 hover:underline">
                      {r.party.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{r.tierLabel}</span>
                  </td>
                  <td className="p-2.5 text-left">
                    {r.total === null ? (
                      <span className="text-xs text-muted-foreground">مش كفاية</span>
                    ) : (
                      <Badge tone={scoreTone(r.total)}>{qty(r.total, 0)}</Badge>
                    )}
                  </td>
                  <td className="p-2.5 text-left tabular">
                    <Money value={r.sales} />
                  </td>
                  <td className="p-2.5 text-left tabular">{qty(r.collectionRate, 0)}٪</td>
                  <td className="p-2.5 text-left tabular">
                    {r.marginPct === null ? "—" : `${qty(r.marginPct, 0)}٪`}
                  </td>
                  <td className="p-2.5 text-left tabular">
                    {r.clvValue === null ? "—" : <Money value={r.clvValue} />}
                  </td>
                  <td className="p-2.5 text-left">
                    <Badge tone={r.risk >= 60 ? "danger" : r.risk >= 30 ? "warn" : "ok"}>{r.risk}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          الهامش بيتحسب من أوامر الإنتاج المسجّل لها سعر وتكلفة، والـCLV تقدير مبني على دورة الطلب الحالية —
          مش وعد بإيراد جاي.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-base">تصنيف العملاء</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {pf.tiers.map((t) => (
            <Card key={t.key} className="p-3">
              <p className="text-xs text-muted-foreground">{t.label}</p>
              <p className="mt-0.5 text-xl tabular">{qty(t.count, 0)}</p>
            </Card>
          ))}
        </div>
      </section>

      {groups.length >= 2 ? (
        <section>
          <h3 className="mb-2 text-base">هل المصنع بيحافظ على عملاءه؟</h3>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[440px] text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="p-2.5 text-right font-medium">شهر أول تعامل</th>
                  <th className="p-2.5 text-left font-medium">عملاء</th>
                  <th className="p-2.5 text-left font-medium">بعد 3 شهور</th>
                  <th className="p-2.5 text-left font-medium">بعد 6 شهور</th>
                  <th className="p-2.5 text-left font-medium">بعد سنة</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((c) => (
                  <tr key={c.month} className="border-t border-border">
                    <td className="p-2.5 whitespace-nowrap">{formatDate(`${c.month}-01`)}</td>
                    <td className="p-2.5 text-left tabular">{c.customers}</td>
                    {[c.m3, c.m6, c.m12].map((v, i) => (
                      <td key={i} className="p-2.5 text-left tabular">
                        {v === null ? <span className="text-xs text-muted-foreground">لسه بدري</span> : `${qty(v, 0)}٪`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {groups.length && pf.withHistory / groups.length < 2 ? (
            <p className="mt-2 text-xs text-warn">
              كل فوج فيه عميل أو اتنين بس — النسب دي مش دلالة إحصائية لحد ما عدد عملائك يكبر.
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            «بعد 3 شهور» معناها: نسبة عملاء الشهر ده اللي طلبوا تاني بعد 3 شهور من أول طلب. الخلايا اللي لسه
            مجالهاش الوقت مكتوب فيها «لسه بدري» بدل رقم مضلّل.
          </p>
        </section>
      ) : null}

      <WeightsPanel open={weightsOpen} onClose={() => setWeightsOpen(false)} />
    </div>
  );
}

function WeightsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, setScoreWeights } = useFactory();
  const current = weightsOf(db);
  const [form, setForm] = useState<ScoreWeights>(current);
  const total = (Object.values(form) as number[]).reduce((s, v) => s + v, 0);

  return (
    <Panel
      open={open}
      title="أوزان سكور العميل"
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <Button
            className="w-full"
            onClick={() => {
              try {
                setScoreWeights(form);
                toast.success("الأوزان اتحفظت، والسكور اتحسب من جديد.");
                onClose();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "فشل");
              }
            }}
          >
            احفظ الأوزان
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setForm(DEFAULT_WEIGHTS)}>
            رجّع الأوزان الافتراضية
          </Button>
        </div>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        كل مصنع بيوزن الأمور بطريقته: في مصنع السداد أهم من الحجم، وفي مصنع تاني الربحية هي كل حاجة. المجموع
        الحالي {total}٪ — مش لازم يكون 100، النظام بيوزّع نسبيًا.
      </p>
      {(Object.keys(form) as ScoreKey[]).map((k) => (
        <Field key={k} label={`${SCORE_LABEL[k]} — ${qty((form[k] / Math.max(1, total)) * 100, 0)}٪ من الدرجة`}>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={50}
              value={form[k]}
              onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })}
              className="h-2 flex-1 accent-[#d59a3c]"
            />
            <Input
              value={String(form[k])}
              onChange={(e) => setForm({ ...form, [k]: Math.max(0, Number(e.target.value) || 0) })}
              inputMode="numeric"
              className="w-16 text-center"
            />
          </div>
        </Field>
      ))}
      <p className="text-xs text-muted-foreground">
        تغيير الأوزان بيتسجل في سجل التعديلات باسمك، وبيأثر على كل العملاء فورًا. المؤشر اللي مفيش له بيانات
        وزنه بيتوزّع على الباقي بدل ما يتحسب صفر.
      </p>
    </Panel>
  );
}

/** كارت مختصر للصفحة الرئيسية */
export function IntelligenceTeaser() {
  const { db } = useFactory();
  const pf = portfolioStats(db);
  if (!pf.withHistory) return null;
  const top = ranking(db).filter((r) => r.total !== null);
  const m = top[0] ? customerMetrics(db, top[0].party.id) : null;
  if (!top.length || !m) return null;
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base">ذكاء العملاء</h3>
        <Link to="/intelligence" className="text-sm text-accent underline underline-offset-4">
          افتح المركز
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        أعلى سكور: {top[0].party.name} ({qty(top[0].total ?? 0, 0)}) — تحصيل {qty(m.collectionRate, 0)}٪
        {pf.atRisk ? ` · ${qty(pf.atRisk, 0)} عميل عليهم مؤشر خطر` : ""}
      </p>
    </Card>
  );
}
