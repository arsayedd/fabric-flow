import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Coins } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Field, Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import {
  profitAlerts,
  profitByLevel,
  profitDashboard,
  profitRanking,
  RANK_SORTS,
  targetMarginOf,
  VERDICT,
  type RankSort,
} from "@/store/costing";

const LEVELS = [
  { key: "line", label: "خط الإنتاج" },
  { key: "order", label: "أمر الإنتاج" },
  { key: "customer", label: "العميل" },
] as const;

export function CostingPage() {
  const { db, can } = useFactory();
  const [sort, setSort] = useState<RankSort>("totalProfit");
  const [level, setLevel] = useState<(typeof LEVELS)[number]["key"]>("line");
  const [marginOpen, setMarginOpen] = useState(false);

  const dash = profitDashboard(db);
  const rows = profitRanking(db, sort);
  const alerts = profitAlerts(db);
  const levels = profitByLevel(db, level);

  if (!db.products.length) {
    return (
      <EmptyState
        icon={Coins}
        title="الربحية محتاجة موديلات الأول"
        body="سجّل منتج بخاماته وعملياته، والنظام يحسب تكلفة القطعة وربحها وهامشها — من غير ما تكتب رقم تكلفة بإيدك."
      />
    );
  }

  const bad = alerts.filter((a) => a.tone !== "ok");

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">التكلفة والربحية</h2>
          <p className="text-sm text-muted-foreground">
            فين بتكسب وفين بتخسر وليه — محسوبة من الخامات والعمليات والإنتاج الفعلي، مش من أرقام مكتوبة بالإيد.
          </p>
        </div>
        {can.finance ? (
          <Button variant="outline" onClick={() => setMarginOpen(true)}>
            هامش الهدف
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <p className="text-sm text-muted-foreground">قيمة الإنتاج</p>
          <p className="mt-1 text-xl">
            <Money value={dash.productionValue} />
          </p>
          <p className="text-xs text-muted-foreground">بسعر بيع الموديلات</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">تكلفة الإنتاج</p>
          <p className="mt-1 text-xl">
            <Money value={dash.productionCost} />
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">الربح الإجمالي</p>
          <p className={`mt-1 text-xl ${dash.grossProfit < 0 ? "text-danger" : "text-ok"}`}>
            <Money value={dash.grossProfit} signed />
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">متوسط الهامش</p>
          <p className="mt-1 text-xl tabular">
            {dash.avgMarginPct === null ? "—" : `${qty(Math.round(dash.avgMarginPct), 0)}٪`}
          </p>
          <p className="text-xs text-muted-foreground">الهدف {qty(dash.targetMarginPct, 0)}٪</p>
        </Card>
      </div>

      {bad.length ? (
        <Card className="border-warn/30 bg-warn-soft/30">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
            <div className="min-w-0 flex-1">
              <h3 className="text-base">تنبيهات الربحية</h3>
              <ul className="mt-1.5 list-none space-y-1.5 text-sm">
                {bad.slice(0, 6).map((a, i) => (
                  <li key={`${a.productId}-${i}`}>
                    <Link to={`/products/${a.productId}`} className="font-medium underline-offset-4 hover:underline">
                      {a.name}
                    </Link>
                    <span className={a.tone === "danger" ? "text-danger" : "text-warn"}> — {a.text}</span>
                    <span className="block text-xs text-muted-foreground">{a.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-ok">كل الموديلات المسجّلة فوق هامش الهدف — مفيش تنبيه ربحية دلوقتي.</p>
        </Card>
      )}

      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base">ترتيب الموديلات</h3>
          <div className="flex flex-wrap gap-1.5">
            {RANK_SORTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  sort === s.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="p-2.5 text-right font-medium">الموديل</th>
                <th className="p-2.5 text-left font-medium">التكلفة</th>
                <th className="p-2.5 text-left font-medium">السعر</th>
                <th className="p-2.5 text-left font-medium">ربح القطعة</th>
                <th className="p-2.5 text-left font-medium">الهامش</th>
                <th className="p-2.5 text-left font-medium">Markup</th>
                <th className="p-2.5 text-left font-medium">منتَج</th>
                <th className="p-2.5 text-left font-medium">إجمالي الربح</th>
                <th className="p-2.5 text-left font-medium">السكور</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.product.id} className="border-t border-border">
                  <td className="p-2.5">
                    <Link to={`/products/${r.product.id}`} className="font-medium underline-offset-4 hover:underline">
                      {r.product.name}
                    </Link>
                    {!r.ready ? <span className="block text-xs text-warn">ناقص بيانات</span> : null}
                  </td>
                  <td className="p-2.5 text-left tabular">
                    <Money value={r.cost} />
                  </td>
                  <td className="p-2.5 text-left tabular">
                    <Money value={r.price} />
                  </td>
                  <td className="p-2.5 text-left tabular">
                    <Money value={r.profit} signed />
                  </td>
                  <td className="p-2.5 text-left tabular">
                    {r.marginPct === null ? (
                      "—"
                    ) : (
                      <span className={r.belowTarget ? "text-warn" : "text-ok"}>{qty(Math.round(r.marginPct), 0)}٪</span>
                    )}
                  </td>
                  <td className="p-2.5 text-left tabular latin">{r.markup === null ? "—" : `${r.markup.toFixed(2)}×`}</td>
                  <td className="p-2.5 text-left tabular">{qty(r.producedQty, 0)}</td>
                  <td className="p-2.5 text-left tabular">
                    <Money value={r.totalProfit} signed />
                  </td>
                  <td className="p-2.5 text-left">
                    {r.score === null ? (
                      <span className="text-xs text-muted-foreground">مش كفاية</span>
                    ) : (
                      <Badge tone={r.verdict ? VERDICT[r.verdict].tone : "muted"}>{qty(r.score, 0)}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          «إجمالي الربح» = ربح القطعة × الكمية المنتَجة فعلًا من حركات المراحل. الموديل اللي لسه مفيش له إنتاج
          إجماليه صفر — مش خسارة.
        </p>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <h3 className="text-base">أعلى الخامات تكلفة</h3>
          {dash.topMaterials.length ? (
            <ul className="mt-2 list-none space-y-2">
              {dash.topMaterials.map((m) => (
                <li key={m.name}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate">{m.name}</span>
                    <span className="shrink-0 tabular">
                      <Money value={m.cost} /> <span className="text-muted-foreground">{qty(Math.round(m.sharePct), 0)}٪</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, m.sharePct)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">محتاج إنتاج مسجّل على الموديلات.</p>
          )}
        </Card>

        <Card>
          <h3 className="text-base">أعلى المراحل تكلفة</h3>
          {dash.topStages.length ? (
            <ul className="mt-2 list-none space-y-2">
              {dash.topStages.map((s) => (
                <li key={s.name}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate">{s.name}</span>
                    <span className="shrink-0 tabular">
                      <Money value={s.cost} /> <span className="text-muted-foreground">{qty(Math.round(s.sharePct), 0)}٪</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, s.sharePct)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">محتاج مسار عمليات وإنتاج مسجّل.</p>
          )}
        </Card>
      </div>

      {dash.topWaste.length ? (
        <Card>
          <h3 className="text-base">أعلى هالك</h3>
          <ul className="mt-2 list-none space-y-1 text-sm">
            {dash.topWaste.map((w, i) => (
              <li key={`${w.product}-${w.name}-${i}`} className="flex items-baseline justify-between gap-3">
                <span className="truncate text-muted-foreground">
                  {w.name} — {w.product}
                </span>
                <Money value={w.cost} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base">الربحية على مستويات</h3>
          <div className="flex gap-1.5">
            {LEVELS.map((l) => (
              <button
                key={l.key}
                onClick={() => setLevel(l.key)}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  level === l.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="p-2.5 text-right font-medium">{LEVELS.find((l) => l.key === level)?.label}</th>
                <th className="p-2.5 text-left font-medium">الإيراد</th>
                <th className="p-2.5 text-left font-medium">التكلفة</th>
                <th className="p-2.5 text-left font-medium">الربح</th>
                <th className="p-2.5 text-left font-medium">الهامش</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((r) => (
                <tr key={r.key} className="border-t border-border">
                  <td className="p-2.5">{r.label}</td>
                  <td className="p-2.5 text-left tabular">
                    <Money value={r.revenue} />
                  </td>
                  <td className="p-2.5 text-left tabular">
                    <Money value={r.cost} />
                  </td>
                  <td className="p-2.5 text-left tabular">
                    <Money value={r.profit} signed />
                  </td>
                  <td className="p-2.5 text-left tabular">
                    {r.marginPct === null ? "—" : `${qty(Math.round(r.marginPct), 0)}٪`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          الأمر اللي فيه إنتاج فعلي بيتحسب بتكلفته الفعلية، واللي لسه مبدأش بالتكلفة المتوقعة من ورقة التكلفة.
          الربحية باللون والمقاس والدفعة محتاجة تسجيل المتغيرات — لسه مش في النظام.
        </p>
      </section>

      <MarginPanel open={marginOpen} onClose={() => setMarginOpen(false)} />
    </div>
  );
}

function MarginPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, setTargetMargin } = useFactory();
  const [value, setValue] = useState(String(targetMarginOf(db)));

  return (
    <Panel
      open={open}
      title="هامش الربح المستهدف"
      onClose={onClose}
      footer={
        <Button
          className="w-full"
          onClick={() => {
            try {
              setTargetMargin(Number(value) || 0);
              toast.success("الهدف اتحفظ، وكل الموديلات اتقاست عليه من جديد.");
              onClose();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "فشل");
            }
          }}
        >
          احفظ الهدف
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        الهامش المستهدف هو أساس تلات أرقام: تكلفة الهدف لكل موديل، أقل سعر مقبول، والتنبيه لما موديل ينزل تحته.
        تغييره بيتسجل في سجل التعديلات باسمك.
      </p>
      <Field label="هامش الهدف %">
        <Input value={value} inputMode="numeric" onChange={(e) => setValue(e.target.value)} />
      </Field>
      <p className="text-xs text-muted-foreground">
        مثال: سعر بيع ٨٠٠ ج وهدف ٥٠٪ معناه تكلفة الهدف ٤٠٠ ج. ولو تكلفتك ٤٥٠ ج، النظام بيقولك إنك أعلى من
        الهدف بـ١٢٫٥٪ وبيوريك أكبر بنود التكلفة.
      </p>
    </Panel>
  );
}

/** كارت مختصر للصفحة الرئيسية */
export function CostingTeaser() {
  const { db } = useFactory();
  if (!db.products.length) return null;
  const dash = profitDashboard(db);
  const alerts = profitAlerts(db).filter((a) => a.tone !== "ok");
  const best = profitRanking(db, "score").filter((r) => r.score !== null)[0];

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base">التكلفة والربحية</h3>
        <Link to="/costing" className="text-sm text-accent underline underline-offset-4">
          افتح اللوحة
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        متوسط الهامش {dash.avgMarginPct === null ? "—" : `${qty(Math.round(dash.avgMarginPct), 0)}٪`} مقابل هدف{" "}
        {qty(dash.targetMarginPct, 0)}٪
        {best ? ` · أعلى سكور: ${best.product.name} (${qty(best.score ?? 0, 0)})` : ""}
        {alerts.length ? ` · ${qty(alerts.length, 0)} تنبيه ربحية` : ""}
      </p>
    </Card>
  );
}
