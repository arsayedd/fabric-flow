import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Brain } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { money, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { findings, rankGaps, supplierRealCosts, untracedVendors, type CostFactor } from "@/store/realcost";

/**
 * طبقة الذكاء: الاستنتاجات.
 *
 * الشاشة دي **مابتعرضش بيانات**. كل شاشة تانية في النظام بتعرض دفتر
 * واحد: المشتريات بتقول سعر المورّد، والهالك بيقول الخامة بتاكل قد إيه،
 * والمرتجعات بتقول رجع كام. والتلاتة صح والتلاتة لوحدهم مايوصّلوش لقرار.
 *
 * اللي هنا هو **حاصل جمعهم**: المورّد الأرخص في السعر واللي بيطلع أغلى
 * في التكلفة الحقيقية، والموديل اللي شغّال المصنع وبيرجّع أقل هامش. وكل
 * استنتاج جنبه الأرقام اللي اتبنى عليها وتغطيته من البيانات — عشان صاحب
 * المصنع يعرف هو بيقرر على صورة كاملة ولا على نصها.
 */

export function InsightsPage() {
  const { db, can } = useFactory();
  const rows = useMemo(() => findings(db), [db]);
  const suppliers = useMemo(() => supplierRealCosts(db), [db]);
  const untraced = useMemo(() => untracedVendors(db), [db]);
  const gaps = useMemo(() => rankGaps(db), [db]);

  const seeSuppliers = can.do("purchasing", "view");
  const seeModels = can.do("costing", "view");
  const visible = rows.filter((r) => (r.key.startsWith("supplier-") ? seeSuppliers : seeModels));

  if (!seeSuppliers && !seeModels) {
    return (
      <EmptyState
        icon={Brain}
        title="الاستنتاجات محتاجة صلاحية"
        body="الطبقة دي بتجمع أرقام المشتريات والتكلفة مع بعض، فمحتاجة صلاحية عرض واحد منهم على الأقل. اطلبها من صاحب المصنع."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl">استنتاجات صنعة</h2>
        <p className="text-sm text-muted-foreground">
          مش شاشة أرقام. الحاجة الوحيدة اللي هنا هي اللي مفيش شاشة لوحدها تقدر تقولها — ناتج جمع دفترين أو تلاتة.
        </p>
      </div>

      {!visible.length ? (
        <EmptyState
          icon={Brain}
          title="مافيش استنتاج يستحق إنه يتقال"
          body="الطبقة دي مابتطلّعش كلام عشان تملى الشاشة. الاستنتاج بيظهر لما رقمين من دفترين مختلفين يخالفوا بعض — زي مورّد سعره أرخص وتكلفته الحقيقية أغلى، أو موديل بيبيع كتير وربحيته واطية."
        />
      ) : (
        <div className="space-y-3">
          {visible.map((f) => (
            <Card
              key={f.key}
              className={f.tone === "danger" ? "border-danger/40 bg-danger-soft/20" : f.tone === "warn" ? "border-warn/40" : ""}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 text-lg">{f.headline}</p>
                {f.coverage !== null ? (
                  <Badge tone={f.coverage >= 67 ? "ok" : "warn"}>تغطية البيانات {qty(f.coverage, 0)}٪</Badge>
                ) : null}
              </div>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {f.why.map((w, i) => (
                  <li key={i}>— {w}</li>
                ))}
              </ul>
              <p className="mt-2 text-sm">{f.action}</p>
              <div className="mt-3">
                <Button variant="outline" asChild>
                  <Link to={f.to}>افتح السجل</Link>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {seeSuppliers ? <Suppliers rows={suppliers} untraced={untraced} /> : null}
      {seeModels ? <Ranks rows={gaps} /> : null}
    </div>
  );
}

/* ── التكلفة الحقيقية للمورّد ─────────────────────────────────── */

function Factor({ f }: { f: CostFactor }) {
  return (
    <li className="flex items-baseline justify-between gap-3 text-sm">
      <span className="min-w-0">
        {f.label}
        <span className="block text-xs text-muted-foreground">{f.missing ? `محتاج: ${f.missing}` : f.why}</span>
      </span>
      <span className={`shrink-0 tabular ${f.pct === null ? "text-muted-foreground" : f.pct > 0 ? "text-danger" : "text-ok"}`}>
        {f.pct === null ? "مش محسوب" : `${f.pct > 0 ? "+" : ""}${qty(f.pct, 1)}٪`}
      </span>
    </li>
  );
}

function Suppliers({ rows, untraced }: { rows: ReturnType<typeof supplierRealCosts>; untraced: ReturnType<typeof untracedVendors> }) {
  if (!rows.length && !untraced.length) return null;
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-lg">سعر الشراء مقابل التكلفة الحقيقية</h3>
        <p className="text-sm text-muted-foreground">
          سعر المتر بيقول حاجة، والفلوس اللي خرجت فعلًا بتقول حاجة تانية. الفرق بينهم هو الهالك والمرتجعات.
        </p>
      </div>
      {!rows.length ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            مافيش مورّد مربوطة فواتيره بخامات في دفتر المخزون، فمفيش تكلفة حقيقية تتحسب. الربط بيحصل لما الشراء
            يتسجّل على الخامة نفسها مش على بند مصروف بس.
          </p>
        </Card>
      ) : null}
      {rows.map((s) => (
        <Card key={s.partyId} className={s.flipped ? "border-danger/40" : ""}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate">{s.name}</p>
              <p className="text-sm text-muted-foreground">
                مشتريات {money(s.totalValue)}
                {s.linkedValue < s.totalValue ? ` · المربوط بخامات ${money(s.linkedValue)}` : ""}
              </p>
            </div>
            <div className="shrink-0 text-left">
              {s.realPct === null ? (
                <Badge tone="muted">مش محسوبة</Badge>
              ) : (
                <Badge tone={s.realPct > 0.5 ? "danger" : s.realPct < -0.5 ? "ok" : "muted"}>
                  {s.realPct > 0 ? "+" : ""}
                  {qty(s.realPct, 1)}٪ تكلفة حقيقية
                </Badge>
              )}
              <p className="mt-1 text-xs text-muted-foreground">تغطية {qty(s.coverage, 0)}٪</p>
            </div>
          </div>
          {s.verdict ? <p className="mt-2 text-sm">{s.verdict}</p> : null}
          <ul className="mt-3 space-y-2 border-t border-border pt-3">
            {s.factors.map((f) => (
              <Factor key={f.key} f={f} />
            ))}
          </ul>
          {s.linkedValue < s.totalValue ? (
            <p className="mt-2 text-xs text-muted-foreground">
              الجزء اللي مش مربوط بخامة في دفتر المخزون مادخلش الحساب — الفاتورة بتقول مبلغ، وماتقولش أنهي خامة.
            </p>
          ) : null}
          <div className="mt-3">
            <Button variant="ghost" asChild>
              <Link to={`/parties/${s.partyId}`}>بروفايل المورّد</Link>
            </Button>
          </div>
        </Card>
      ))}
      {untraced.length ? (
        <Card>
          <p className="text-sm">
            {qty(untraced.length, 0)} جهة بنشتري منها مش داخلة في الحساب ده
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {untraced
              .slice(0, 6)
              .map((v) => `${v.name} (${money(v.value)})`)
              .join(" · ")}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            فواتيرها مش مربوطة بخامة في دفتر المخزون — فمفيش هالك ولا مرتجع يتحسب عليها. والخدمات زي الكهرباء
            والإيجار مالهاش تكلفة حقيقية بالمعنى ده أصلًا.
          </p>
        </Card>
      ) : null}
    </section>
  );
}

/* ── ترتيب البيع مقابل ترتيب الربح ───────────────────────────── */

function Ranks({ rows }: { rows: ReturnType<typeof rankGaps> }) {
  const sold = rows.filter((r) => r.soldQty > 0);
  if (!sold.length) return null;
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-lg">ترتيب البيع مقابل ترتيب الربحية</h3>
        <p className="text-sm text-muted-foreground">
          الترتيبين مش نفس الترتيب، والفرق بينهم هو المعلومة. الموديل اللي بيبيع أكتر مش بالضرورة اللي بيكسب أكتر.
        </p>
      </div>
      <Card>
        <ul className="space-y-3">
          {sold.map((r) => (
            <li key={r.productId} className={r.flagged ? "rounded-md border border-warn/40 bg-warn-soft/20 p-2" : ""}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="min-w-0">
                  {r.name}
                  <span className="latin block text-xs text-muted-foreground">{r.sku}</span>
                </span>
                <span className="shrink-0 text-sm tabular">
                  بيع #{qty(r.salesRank, 0)} · ربح #{qty(r.profitRank, 0)}
                  {r.gap > 0 ? <span className="text-warn"> (−{qty(r.gap, 0)})</span> : null}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{r.why.join(" · ")}</p>
              {r.unitProfit !== null ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  ربح الموديل من المتسلّم <Money value={r.totalProfit} />
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          الترتيب بالكمية المتسلّمة للعميل مش المنتَجة، لأن السؤال تجاري: الموديل بيتحرك في السوق قد إيه.
        </p>
      </Card>
    </section>
  );
}
