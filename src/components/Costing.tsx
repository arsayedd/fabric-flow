import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Money } from "@/components/Money";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, DataRow } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import {
  costHistory,
  costSheet,
  costWhatIf,
  diagnose,
  modelOrderProfits,
  modelVolume,
  priceScenarios,
  profitScore,
  VERDICT,
  wasteIntel,
  type CostLine,
} from "@/store/costing";

const KIND_TONE: Record<CostLine["kind"], string> = {
  material: "bg-primary",
  waste: "bg-danger",
  operation: "bg-accent",
  outsourced: "bg-warn",
  overhead: "bg-muted-foreground",
};

export function scoreTone(v: number): Tone {
  return v >= 75 ? "ok" : v >= 50 ? "warn" : "danger";
}

/** ورقة التكلفة والربحية لموديل واحد */
export function CostingSection({ productId }: { productId: string }) {
  const { db } = useFactory();
  const sheet = costSheet(db, productId);
  const vol = modelVolume(db, productId);
  const score = profitScore(db, productId);
  const diag = diagnose(db, productId);
  const waste = wasteIntel(db, productId);
  const history = costHistory(db, productId);
  const profits = modelOrderProfits(db, productId).filter((p) => p.hasActuals);

  if (!sheet.hasBom) {
    return (
      <Card className="border-warn/30 bg-warn-soft/30">
        <h3 className="text-base">التكلفة والربحية</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          محتاج قائمة خامات الأول. أول ما تسجّل خامات القطعة، الورقة دي تتبني لوحدها من أسعار
          المخزن ومن مسار العمليات — ومتحتاجش تكتب أي تكلفة بإيدك.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg">التكلفة والربحية</h3>
        <p className="text-xs text-muted-foreground">
          كل رقم هنا محسوب وقت العرض — لو سعر خامة اتغير، الورقة تتغير معاه فورًا.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">تكلفة القطعة</p>
          <p className="mt-0.5 text-lg">
            <Money value={sheet.total} />
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">ربح القطعة</p>
          <p className={`mt-0.5 text-lg ${sheet.profit < 0 ? "text-danger" : "text-ok"}`}>
            <Money value={sheet.profit} signed />
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">هامش الربح</p>
          <p className="mt-0.5 text-lg tabular">
            {sheet.marginPct === null ? "—" : `${qty(Math.round(sheet.marginPct), 0)}٪`}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Markup</p>
          <p className="mt-0.5 text-lg tabular latin">
            {sheet.markup === null ? "—" : `${sheet.markup.toFixed(2)}×`}
          </p>
        </Card>
      </div>

      <Card>
        <h4 className="text-base">ورقة التكلفة</h4>
        <ul className="mt-2 list-none space-y-2">
          {sheet.lines.map((l) => (
            <li key={l.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm">
                  {l.label}
                  {l.kind === "outsourced" ? <Badge tone="muted" className="mr-2">خارجي</Badge> : null}
                </span>
                <span className="shrink-0 text-sm">
                  <Money value={l.amount} /> <span className="tabular text-muted-foreground">{qty(Math.round(l.sharePct), 0)}٪</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${KIND_TONE[l.kind]}`} style={{ width: `${Math.min(100, l.sharePct)}%` }} />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{l.detail}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-3 divide-y divide-border/60 border-t border-border pt-2">
          <DataRow label="إجمالي تكلفة القطعة">
            <Money value={sheet.total} />
          </DataRow>
          <DataRow label="سعر البيع">
            <Money value={sheet.sellPrice} />
          </DataRow>
          <DataRow label="سعر التعادل">
            <Money value={sheet.breakEven} />
          </DataRow>
          <DataRow label={`أقل سعر مقبول (هامش ${qty(sheet.targetMarginPct, 0)}٪)`}>
            <Money value={sheet.minPrice} />
          </DataRow>
          {sheet.targetCost !== null ? (
            <DataRow label="تكلفة الهدف">
              <Money value={sheet.targetCost} />
            </DataRow>
          ) : null}
        </dl>
        {sheet.biggest ? (
          <p className="mt-2 text-xs text-muted-foreground">
            أكبر بند في التكلفة: {sheet.biggest.label} بـ{qty(Math.round(sheet.biggest.sharePct), 0)}٪ — أي توفير فيه
            بيأثر أكتر من أي بند تاني.
          </p>
        ) : null}
        {sheet.missing.length ? (
          <p className="mt-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            مش داخل في الحساب لأن بياناته مش مسجّلة: {sheet.missing.join("، ")}. النظام مبيخمّنش رقم مكانه.
          </p>
        ) : null}
      </Card>

      {sheet.priceKnown && sheet.overTargetPct !== null && sheet.overTargetPct > 0.5 ? (
        <Card className="border-warn/30 bg-warn-soft/40">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
            <p className="text-sm">
              التكلفة أعلى من الهدف بـ{qty(Math.round(sheet.overTargetPct), 0)}٪ — تكلفة القطعة{" "}
              <Money value={sheet.total} /> وتكلفة الهدف <Money value={sheet.targetCost ?? 0} /> عند هامش{" "}
              {qty(sheet.targetMarginPct, 0)}٪.
            </p>
          </div>
        </Card>
      ) : null}

      <ScoreCard score={score} />

      {diag.problems.length || diag.suggestions.length ? (
        <Card>
          <h4 className="text-base">إيه اللي بياكل الربح، وإيه اللي أعمله</h4>
          {diag.problems.length ? (
            <ul className="mt-2 list-none space-y-1.5 text-sm">
              {diag.problems.map((p) => (
                <li key={p.title}>
                  <span className="text-danger">{p.title}</span>
                  <span className="block text-xs text-muted-foreground">{p.why}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {diag.suggestions.length ? (
            <ul className="mt-3 list-none space-y-1.5 border-t border-border pt-3 text-sm">
              {diag.suggestions.map((s) => (
                <li key={s.title}>
                  <span className="font-medium">{s.title}</span>
                  <span className="block text-xs text-muted-foreground">{s.why}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <h4 className="text-base">كميات الموديل</h4>
        <dl className="mt-1 divide-y divide-border/60">
          <DataRow label="مخطط في أوامر الإنتاج">
            <span className="tabular">{qty(vol.plannedQty, 0)}</span>
          </DataRow>
          <DataRow label="منتَج فعلًا">
            <span className="tabular">{qty(vol.producedQty, 0)}</span>
          </DataRow>
          <DataRow label="مرفوض / إعادة تشغيل">
            <span className="tabular">
              {qty(vol.scrapQty, 0)} / {qty(vol.reworkQty, 0)}
            </span>
          </DataRow>
          <DataRow label="مباع">
            <span className="tabular">{vol.soldByName ? qty(vol.soldQty, 0) : "—"}</span>
          </DataRow>
          <DataRow label="في مخزن التام">
            <span className="tabular">{qty(vol.stock, 0)}</span>
          </DataRow>
        </dl>
        {!vol.soldByName ? (
          <p className="mt-2 text-xs text-muted-foreground">
            الكمية المباعة بتتطابق باسم الموديل في التوريدات دلوقتي، ومفيش توريد باسم «{sheet.product?.name}».
            الربط المباشر بين التوريد والمنتج جاي في موديول البيع والتسليم.
          </p>
        ) : null}
      </Card>

      {profits.length ? (
        <Card>
          <h4 className="text-base">الفعلي مقابل المتوقع</h4>
          <div className="mt-2 space-y-3">
            {profits.map((p) => (
              <div key={p.order.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link to={`/orders/${p.order.id}`} className="latin font-medium underline-offset-4 hover:underline">
                    {p.order.code}
                  </Link>
                  <Badge tone={p.variance > 0 ? "danger" : "ok"}>
                    فرق {p.variance > 0 ? "+" : ""}
                    {qty(Math.round(p.variance), 0)} ج
                    {p.variancePct !== null ? ` (${qty(Math.round(p.variancePct), 0)}٪)` : ""}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  متوقع <Money value={p.estPerPiece} /> للقطعة · فعلي{" "}
                  {p.actPerPiece === null ? "—" : <Money value={p.actPerPiece} />} على {qty(p.produced, 0)} قطعة منتَجة
                </p>
                {p.materialBaseQty > p.produced ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    الخامات اتصرفت لـ{qty(p.materialBaseQty, 0)} قطعة، فالمنتَج اتحمّل نصيبه منها بس — الباقي لسه
                    في الشغل مش هالك.
                  </p>
                ) : null}
                {p.reasons.length ? (
                  <ul className="mt-2 list-none space-y-1 text-sm">
                    {p.reasons.slice(0, 4).map((r) => (
                      <li key={r.label}>
                        <span className={r.amount > 0 ? "text-danger" : "text-ok"}>
                          {r.label}: {r.amount > 0 ? "+" : ""}
                          {qty(Math.round(r.amount), 0)} ج
                        </span>
                        <span className="block text-xs text-muted-foreground">{r.why}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-ok">مفيش فرق يُذكر — الفعلي زي المخطط.</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {waste.hasData ? (
        <Card>
          <h4 className="text-base">الهالك الفعلي</h4>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-1 text-right font-medium">الخامة</th>
                  <th className="pb-1 text-left font-medium">مصروف</th>
                  <th className="pb-1 text-left font-medium">مخطط</th>
                  <th className="pb-1 text-left font-medium">الفرق</th>
                  <th className="pb-1 text-left font-medium">تكلفته</th>
                </tr>
              </thead>
              <tbody>
                {waste.rows.map((r) => (
                  <tr key={r.materialId} className="border-t border-border">
                    <td className="py-1.5">{r.name}</td>
                    <td className="py-1.5 text-left tabular">{qty(r.issued)}</td>
                    <td className="py-1.5 text-left tabular">{qty(r.expected)}</td>
                    <td className="py-1.5 text-left tabular">
                      <span className={r.wastePct > r.plannedPct ? "text-danger" : "text-ok"}>
                        {qty(Math.round(r.wastePct), 0)}٪
                      </span>
                      <span className="text-xs text-muted-foreground"> / {qty(r.plannedPct, 0)}٪ مخطط</span>
                    </td>
                    <td className="py-1.5 text-left tabular">{r.cost > 0 ? <Money value={r.cost} /> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            «مخطط» = الكمية المفروضة من قائمة الخامات للكمية اللي الخامات اتصرفت عليها، و«الفرق» هو الهالك
            الحقيقي فوقها.
            {waste.scrapPct !== null ? ` نسبة القطع المرفوضة ${qty(Math.round(waste.scrapPct), 0)}٪.` : ""}
          </p>
        </Card>
      ) : null}

      {history.length >= 2 ? (
        <Card>
          <h4 className="text-base">تاريخ التكلفة</h4>
          <ul className="mt-2 list-none space-y-1.5 text-sm">
            {history.map((h) => (
              <li key={h.date} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-muted-foreground">
                  {formatDate(h.date)} — {h.changed}
                </span>
                <Money value={h.total} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            السلسلة دي مش مخزَّنة؛ بتتعاد من أسعار الشراء المسجّلة بالمتوسط المرجّح لحد كل تاريخ.
          </p>
        </Card>
      ) : null}

      <PriceSimulator productId={productId} />
      <WhatIfCard productId={productId} />
    </div>
  );
}

export function ScoreCard({ score }: { score: ReturnType<typeof profitScore> }) {
  const [open, setOpen] = useState(false);
  const tone = score.verdict ? VERDICT[score.verdict].tone : "muted";

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-base">سكور ربحية الموديل</h4>
          <p className="text-xs text-muted-foreground">
            مش الهامش لوحده: ربحية + طلب + هالك + استهلاك + سرعة + مرتجعات.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {score.total === null ? (
            <Badge tone="muted">البيانات مش كفاية</Badge>
          ) : (
            <>
              <span className="text-2xl tabular">{score.total}</span>
              <Badge tone={tone}>{score.verdictLabel}</Badge>
            </>
          )}
        </div>
      </div>

      {score.total !== null ? (
        <>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${score.total >= 75 ? "bg-ok" : score.total >= 50 ? "bg-warn" : "bg-danger"}`}
              style={{ width: `${score.total}%` }}
            />
          </div>
          {score.coverage < 99 ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              المحسوب فعلًا يمثّل {qty(Math.round(score.coverage), 0)}٪ من الأوزان؛ المؤشر اللي مفيش له بيانات وزنه
              بيتوزّع على الباقي بدل ما يتحسب صفر.
            </p>
          ) : null}
          <Button variant="ghost" size="sm" className="mt-1 px-0" onClick={() => setOpen(!open)}>
            {open ? "اخفي التفاصيل" : "شوف الدرجة اتكوّنت إزاي"}
          </Button>
        </>
      ) : null}

      {open || score.total === null ? (
        <ul className="mt-2 list-none space-y-2 border-t border-border pt-2">
          {score.blocks.map((b) => (
            <li key={b.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm">
                  {b.label} <span className="text-xs text-muted-foreground">وزن {qty(b.weight, 0)}٪</span>
                </span>
                <span className="shrink-0 text-sm tabular">
                  {b.value === null ? <span className="text-xs text-muted-foreground">مش محسوب</span> : Math.round(b.value)}
                </span>
              </div>
              {b.value !== null ? (
                <>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${b.value >= 70 ? "bg-ok" : b.value >= 50 ? "bg-warn" : "bg-danger"}`}
                      style={{ width: `${b.value}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{b.why}</p>
                </>
              ) : (
                <p className="mt-0.5 text-xs text-muted-foreground">محتاج: {b.missing}</p>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {score.verdict === "stop" ? (
        <p className="mt-2 text-xs text-warn">
          قرار الإيقاف أو التسعير لازم يتأكد من الأرقام نفسها — السكور مؤشر، مش بديل عن قرار.
        </p>
      ) : null}
    </Card>
  );
}

function PriceSimulator({ productId }: { productId: string }) {
  const { db } = useFactory();
  const sheet = costSheet(db, productId);
  const suggested = [0.9, 1.15, 1.4, 1.65, 2].map((m) => Math.round((sheet.total * m) / 5) * 5);
  const [prices, setPrices] = useState<string>(
    [sheet.sellPrice > 0 ? sheet.sellPrice : suggested[1], ...suggested.slice(1)]
      .filter((v, i, a) => a.indexOf(v) === i)
      .join("، "),
  );
  const list = prices
    .split(/[،,\s]+/)
    .map((p) => Number(p.replace(/[^\d.]/g, "")))
    .filter((p) => p > 0)
    .slice(0, 6);
  const rows = priceScenarios(db, productId, list);

  return (
    <Card>
      <h4 className="text-base">حاسبة السعر</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        جرّب أسعار قبل ما تعتمد واحد. سعر التعادل <Money value={sheet.breakEven} /> وأقل سعر مقبول{" "}
        <Money value={sheet.minPrice} />.
      </p>
      <Input
        className="mt-2"
        value={prices}
        onChange={(e) => setPrices(e.target.value)}
        aria-label="أسعار للتجربة"
        placeholder="مثال: ٥٠٠، ٦٠٠، ٧٠٠"
      />
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="pb-1 text-right font-medium">السعر</th>
              <th className="pb-1 text-left font-medium">ربح القطعة</th>
              <th className="pb-1 text-left font-medium">الهامش</th>
              <th className="pb-1 text-left font-medium">Markup</th>
              <th className="pb-1 text-left font-medium">ربح ١٠٠</th>
              <th className="pb-1 text-left font-medium">ربح ١٠٠٠</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.price} className="border-t border-border">
                <td className="py-1.5">
                  <Money value={r.price} />
                  {r.belowMin ? <Badge tone="danger" className="mr-2">تحت الحد</Badge> : null}
                </td>
                <td className="py-1.5 text-left tabular">
                  <Money value={r.profit} signed />
                </td>
                <td className="py-1.5 text-left tabular">{qty(Math.round(r.marginPct), 0)}٪</td>
                <td className="py-1.5 text-left tabular latin">{r.markup.toFixed(2)}×</td>
                <td className="py-1.5 text-left tabular">
                  <Money value={r.at100} signed />
                </td>
                <td className="py-1.5 text-left tabular">
                  <Money value={r.at1000} signed />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function WhatIfCard({ productId }: { productId: string }) {
  const { db } = useFactory();
  const [material, setMaterial] = useState(10);
  const [labor, setLabor] = useState(0);
  const [waste, setWaste] = useState(0);
  const [price, setPrice] = useState(0);
  const [quantity, setQuantity] = useState("1000");
  const res = costWhatIf(db, productId, {
    materialPct: material,
    laborPct: labor,
    wastePct: waste,
    priceDelta: price,
    quantity: Number(quantity) || 0,
  });

  const sliders: { label: string; value: number; set: (v: number) => void; min: number; max: number; suffix: string }[] = [
    { label: "سعر الخامات", value: material, set: setMaterial, min: -30, max: 50, suffix: "٪" },
    { label: "المصنعية", value: labor, set: setLabor, min: -30, max: 50, suffix: "٪" },
    { label: "الهالك", value: waste, set: setWaste, min: -100, max: 100, suffix: "٪" },
    { label: "سعر البيع", value: price, set: setPrice, min: -200, max: 500, suffix: " ج" },
  ];

  return (
    <Card>
      <h4 className="text-base">لو…؟</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        غيّر أي مدخل وشوف التكلفة والربح والهامش وإجمالي الربح بيتغيروا فورًا. المحاكاة مش بتحفظ حاجة.
      </p>
      <div className="mt-3 space-y-2">
        {sliders.map((s) => (
          <label key={s.label} className="block">
            <span className="mb-1 flex items-baseline justify-between text-sm">
              <span>{s.label}</span>
              <span className="tabular text-muted-foreground">
                {s.value > 0 ? "+" : ""}
                {qty(s.value, 0)}
                {s.suffix}
              </span>
            </span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.suffix === "٪" ? 5 : 10}
              value={s.value}
              onChange={(e) => s.set(Number(e.target.value))}
              className="h-2 w-full accent-[#d59a3c]"
            />
          </label>
        ))}
        <label className="block">
          <span className="mb-1 block text-sm">الكمية</span>
          <Input value={quantity} inputMode="numeric" onChange={(e) => setQuantity(e.target.value)} />
        </label>
      </div>

      <dl className="mt-3 divide-y divide-border/60 border-t border-border pt-2">
        <DataRow label="تكلفة القطعة">
          <span className="flex items-baseline gap-2">
            <span className="text-muted-foreground line-through">
              <Money value={res.before.total} />
            </span>
            <Money value={res.after.total} />
          </span>
        </DataRow>
        <DataRow label="ربح القطعة">
          <Money value={res.after.profit} signed />
        </DataRow>
        <DataRow label="الهامش">
          <span className="tabular">
            {res.after.marginPct === null ? "—" : `${qty(Math.round(res.after.marginPct), 0)}٪`}
            {res.deltaMargin !== null ? (
              <span className={res.deltaMargin >= 0 ? "text-ok" : "text-danger"}>
                {" "}
                ({res.deltaMargin >= 0 ? "+" : ""}
                {qty(Math.round(res.deltaMargin), 0)})
              </span>
            ) : null}
          </span>
        </DataRow>
        <DataRow label="إجمالي الربح على الكمية">
          <Money value={res.after.totalProfit} signed />
        </DataRow>
      </dl>
    </Card>
  );
}
