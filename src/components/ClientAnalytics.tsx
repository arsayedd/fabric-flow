import { Link } from "react-router-dom";
import { Money } from "@/components/Money";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ExportMenu } from "@/components/export/ExportMenu";
import { formatDate, money, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { datasetOf } from "@/store/datasets";
import {
  clientContribution,
  clientDelivery,
  clientOrderCash,
  clientProducts,
  clientReturns,
  type Ranked,
} from "@/store/clients";

/**
 * تبويبات ملف العميل: الموديلات والربحية · التسليم والمرتجعات.
 *
 * القاعدة في الشاشتين دي إن **كل رقم بيقول نطاقه**. الإيراد عندنا من
 * أول يوم، والتكلفة على الأوامر المتسجّلة بس، والموديل معروف لما
 * التوريد يبقى مربوط بأمر. فلو عرضنا الأرقام جنب بعض من غير ما نقول
 * ده محسوب على إيه، الشاشة بتبقى أوثق من بياناتها.
 */

const pctText = (v: number | null, digits = 0): string => (v === null ? "—" : `${qty(v, digits)}٪`);

/* ── مصفوفة الموديلات ──────────────────────────────────────────── */

export function ClientProductsTab({ partyId }: { partyId: string }) {
  const { db } = useFactory();
  const m = clientProducts(db, partyId);
  const c = clientContribution(db, partyId);

  if (!m.rows.length) {
    return <p className="text-sm text-muted-foreground">لسه مفيش توريدات للعميل ده، فمفيش موديلات تتحلّل.</p>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base">صافي المساهمة</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              الإيراد ناقص بنوده المسجّلة — مش الإيراد لوحده.
            </p>
          </div>
          {/* من غير إيراد في النطاق، الصافي بيبقى «سالب تكلفة المرتجعات»
              — رقم بيقول إن العميل خسران وهو مش بيقول حاجة أصلًا */}
          {c.scopedRevenue > 0 ? (
            <div className="text-left">
              <Money className="text-2xl" value={c.net} signed />
              <p className="mt-0.5 text-xs text-muted-foreground">
                هامش {pctText(c.marginPct, 1)} على النطاق المحسوب
              </p>
            </div>
          ) : (
            <div className="text-left">
              <p className="text-2xl text-muted-foreground">—</p>
              <p className="mt-0.5 text-xs text-muted-foreground">مافيش نطاق متكلّف يتحسب عليه</p>
            </div>
          )}
        </div>

        {/* الفرق بين الإيراد الكلي والنطاق المحسوب مش خطأ — ده حدود
            المعرفة، ولازم يتكتب قبل أي رقم ربح */}
        <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">كل الإيراد</p>
            <Money className="text-lg" value={c.revenue} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">إيراد موديلات عارفين تكلفتها</p>
            <Money className="text-lg" value={c.scopedRevenue} />
            <p className="mt-0.5 text-xs text-muted-foreground">
              {c.productCount > 0
                ? `${qty(c.productCount, 0)} موديل · ${pctText(c.scopePct)} من الإيراد`
                : "مافيش موديل له ورقة تكلفة"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">التكلفة المحمّلة</p>
            <Money className="text-lg" value={c.cost} />
          </div>
        </div>

        {c.components.length ? (
          <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
            {c.components.map((x) => (
              <li key={x.key} className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  {x.label}
                  <span className="block text-xs text-muted-foreground">{x.from}</span>
                </span>
                <span className="shrink-0 tabular text-muted-foreground">− {money(x.amount)}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {c.scopePct !== null && c.scopePct < 99 ? (
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
            الربح محسوب على {pctText(c.scopePct)} من إيراد العميل — الموديلات اللي ليها ورقة تكلفة.
            الباقي توريدات موديلها مش في الكتالوج أو من غير قائمة خامات، فتكلفتها مش معروفة. والنسبة
            مكتوبة عشان الرقم مايتقراش أوسع من نطاقه.
          </p>
        ) : null}

        {/* الورقة تكلفة معيارية. الفعلي متسجّل على الأوامر، لكن ربطه
            بالإيراد محتاج التوريد يكون مربوط بأمر — فبنقول العدد بس */}
        <p className="mt-2 text-xs text-muted-foreground">
          التكلفة هنا معيارية: ورقة تكلفة القطعة × المتسلّم.
          {c.actualOrders > 0
            ? ` والاستهلاك الفعلي متسجّل على ${qty(c.actualOrders, 0)} أمر — تلاقيه في شاشة التكاليف لكل أمر لوحده.`
            : " ومافيش أمر للعميل ده اتسجّل عليه صرف خامات أو أجور فعلية."}
        </p>

        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {c.missing.map((x) => (
            <li key={x.label}>
              مش داخل الحساب — <span className="text-foreground">{x.label}</span>: {x.why}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base">الموديلات اللي بنصنعها له</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              المتسلّم والإيراد والمرتجع والربح لكل موديل — مرتّبين بالإيراد.
            </p>
          </div>
          <ExportMenu
            module="parties"
            compact
            dataset={() =>
              datasetOf(db, "clientProducts", {
                where: (r) => r.partyId === partyId,
                subtitle: "موديلات عميل واحد",
              })
            }
          />
        </div>

        <div className="mt-3 -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-right text-xs text-muted-foreground">
                <th className="p-2 font-normal">الموديل</th>
                <th className="p-2 font-normal">SKU</th>
                <th className="p-2 text-left font-normal">متسلّم</th>
                <th className="p-2 text-left font-normal">إيراد</th>
                <th className="p-2 text-left font-normal">مرتجع</th>
                <th className="p-2 text-left font-normal">تكلفة</th>
                <th className="p-2 text-left font-normal">ربح</th>
                <th className="p-2 text-left font-normal">هامش</th>
              </tr>
            </thead>
            <tbody>
              {m.rows.map((r) => (
                <tr key={r.productId ?? r.name} className="border-b border-border/60 align-top">
                  <td className="p-2">
                    {r.productId ? (
                      <Link to={`/products/${r.productId}`} className="underline underline-offset-4">
                        {r.name}
                      </Link>
                    ) : (
                      r.name
                    )}
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {qty(r.deliveries, 0)} توريد
                      {r.producedQty > 0 ? ` · اتنتج ${qty(r.producedQty, 0)}` : ""}
                      {r.colors.length ? ` · ${r.colors.join("، ")}` : ""}
                      {r.sizes.length ? ` · مقاسات ${r.sizes.join("، ")}` : ""}
                    </span>
                  </td>
                  <td className="p-2">
                    {r.sku ? (
                      <span className="latin text-xs">{r.sku}</span>
                    ) : (
                      <Badge tone="muted">مش في الكتالوج</Badge>
                    )}
                    {/* الصف ممكن يكون نصه مربوط بأمر ونصه مطابقة اسم —
                        و«مطابقة بالاسم» لوحدها كانت بتخفي الربط الموجود */}
                    {r.productId && !r.exact ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {r.exactRevenue > 0
                          ? `${pctText((r.exactRevenue / r.revenue) * 100)} من أمر إنتاج، والباقي مطابقة بالاسم`
                          : "مطابقة بالاسم"}
                      </span>
                    ) : null}
                  </td>
                  <td className="p-2 text-left tabular">{r.deliveredQty > 0 ? qty(r.deliveredQty, 0) : "—"}</td>
                  <td className="p-2 text-left tabular">
                    <Money value={r.revenue} />
                  </td>
                  <td className="p-2 text-left tabular">
                    {r.returnedQty > 0 ? (
                      <>
                        {qty(r.returnedQty, 0)}
                        <span className="block text-xs text-muted-foreground">{pctText(r.returnRatePct, 1)}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-2 text-left tabular">
                    {r.cost === null ? (
                      <span className="text-xs text-muted-foreground">مش محسوبة</span>
                    ) : (
                      <Money value={r.cost} />
                    )}
                  </td>
                  <td className="p-2 text-left tabular">
                    {r.profit === null ? "—" : <Money value={r.profit} signed />}
                  </td>
                  <td className="p-2 text-left tabular">{pctText(r.marginPct, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* التغطية هي أهم سطر في الجدول: من غيرها، صف بلا تكلفة بيبان
            زي صف ربحه صفر */}
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          {m.catalogPct === null
            ? "مافيش إيراد يتقسم."
            : `موديل معروف في الكتالوج لـ${pctText(m.catalogPct)} من الإيراد، ومنهم ${pctText(m.exactPct)} ربطه جه من أمر إنتاج بالمعرّف والباقي بمطابقة الاسم. والربح محسوب على ${pctText(m.revenue > 0 ? (m.costedRevenue / m.revenue) * 100 : null)} — اللي له ورقة تكلفة.`}
        </p>
      </Card>
    </div>
  );
}

/* ── التسليم والمرتجعات ومن الأمر للتحصيل ──────────────────────── */

function RankList({ title, rows, unit }: { title: string; rows: Ranked[]; unit: string }) {
  if (!rows.length) return null;
  const top = rows.slice(0, 5);
  return (
    <div>
      <p className="text-xs text-muted-foreground">{title}</p>
      <ul className="mt-1 space-y-1 text-sm">
        {top.map((r) => (
          <li key={r.label} className="flex flex-wrap items-baseline justify-between gap-2">
            <span>{r.label}</span>
            <span className="shrink-0 tabular text-muted-foreground">
              {qty(r.qty, 0)} {unit}
              {r.cost > 0 ? ` · ${money(r.cost)}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ClientOpsTab({ partyId }: { partyId: string }) {
  const { db } = useFactory();
  const d = clientDelivery(db, partyId);
  const r = clientReturns(db, partyId);
  const chain = clientOrderCash(db, partyId);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base">الالتزام بالتسليم</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              الأمر اللي خلص: آخر مرحلة اتسجّلت قبل الميعاد ولا بعده.
            </p>
          </div>
          <div className="text-left">
            <p className="text-2xl tabular">{pctText(d.onTimePct)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {d.judged > 0 ? `على ${qty(d.judged, 0)} أمر خلص` : "مافيش أمر خلص لسه"}
            </p>
          </div>
        </div>

        <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">توريدات</p>
            <p className="mt-0.5 text-lg tabular">{qty(d.deliveries, 0)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">قطع متسلّمة</p>
            <p className="mt-0.5 text-lg tabular">{d.deliveredQty > 0 ? qty(d.deliveredQty, 0) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">اتأخر</p>
            <p className="mt-0.5 text-lg tabular">{qty(d.late, 0)}</p>
            {d.avgDelayDays !== null && d.late > 0 ? (
              <p className="mt-0.5 text-xs text-muted-foreground">متوسط {qty(d.avgDelayDays, 1)} يوم</p>
            ) : null}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">تنفيذ الكمية</p>
            <p className="mt-0.5 text-lg tabular">{pctText(d.fulfillmentPct)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">على الأوامر اللي ليها توريد مربوط</p>
          </div>
        </div>

        {d.worst ? (
          <p className="mt-3 text-xs text-muted-foreground">
            أسوأ تأخير: <span className="latin">{d.worst.code}</span> بـ{qty(d.worst.days, 0)} يوم.
          </p>
        ) : null}

        {d.shortOrders.length ? (
          <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
            {d.shortOrders.map((s) => (
              <li key={s.code} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="latin">{s.code}</span>
                <span className="shrink-0 tabular text-muted-foreground">
                  طلب {qty(s.ordered, 0)} · استلم {qty(s.delivered, 0)} · باقي {qty(s.remaining, 0)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {d.judged === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            النسبة مابتتحسبش على أمر لسه شغّال: هو مستني، مش متأخر ولا في ميعاده.
          </p>
        ) : null}
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base">مرتجعات العميل</h3>
            <p className="mt-1 text-sm text-muted-foreground">رجع إيه، وأنهي موديل ومقاس ولون، وكلّف كام.</p>
          </div>
          <div className="text-left">
            <p className="text-2xl tabular">{pctText(r.ratePct, 1)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">نسبة الرجوع من المتسلّم</p>
          </div>
        </div>

        {r.cases === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">مافيش مرتجع متسجّل على العميل ده.</p>
        ) : (
          <>
            <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">حالات</p>
                <p className="mt-0.5 text-lg tabular">{qty(r.cases, 0)}</p>
                {r.open > 0 ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">منهم {qty(r.open, 0)} لسه مستني قرار</p>
                ) : null}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">قطع راجعة</p>
                <p className="mt-0.5 text-lg tabular">{qty(r.qty, 0)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">تكلفة المرتجعات</p>
                <Money className="mt-0.5 text-lg" value={r.cost} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">اتسوّى</p>
                <p className="mt-0.5 text-lg tabular">{qty(r.settled, 0)}</p>
              </div>
            </div>

            <div className="mt-3 grid gap-4 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-3">
              <RankList title="أكتر المشاكل" rows={r.problems} unit="قطعة" />
              <RankList title="أكتر موديل رجع" rows={r.models} unit="قطعة" />
              <RankList title="أكتر مقاس رجع" rows={r.sizes} unit="قطعة" />
              <RankList title="أكتر لون رجع" rows={r.colors} unit="قطعة" />
              <RankList title="أكتر دفعة رجعت" rows={r.batches} unit="قطعة" />
            </div>

            {r.cost === 0 && r.open > 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                التكلفة صفر لأن الحالات لسه مااتسوّتش — ده «لسه مش محسوب» مش «ببلاش».
              </p>
            ) : null}
          </>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base">من الأمر للتحصيل</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              أمر إنتاج → إنتاج → تسليم → فاتورة → تحصيل، وكل خطوة من دفترها.
            </p>
          </div>
          <ExportMenu
            module="parties"
            compact
            dataset={() =>
              datasetOf(db, "orderCash", {
                where: (row) => row.partyId === partyId,
                subtitle: "أوامر عميل واحد",
              })
            }
          />
        </div>

        {!chain.length ? (
          <p className="mt-3 text-sm text-muted-foreground">
            مافيش أمر إنتاج على العميل ده. التوريد من المخزون الجاهز مابيعملش أمر.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {chain.map((o) => (
              <li key={o.order.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link to={`/orders/${o.order.id}`} className="latin text-sm underline underline-offset-4">
                      {o.order.code}
                    </Link>
                    <p className="mt-0.5 text-sm">{o.productName ?? o.order.model}</p>
                  </div>
                  <div className="shrink-0 text-left">
                    <Money value={o.invoiced} />
                    {o.remaining > 0.5 ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        باقي <Money value={o.remaining} />
                        {o.dueDate ? ` · ميعاد ${formatDate(o.dueDate)}` : ""}
                      </p>
                    ) : o.invoiced > 0 ? (
                      <p className="mt-0.5 text-xs text-ok">اتحصّل بالكامل</p>
                    ) : null}
                    {o.overdueDays !== null ? (
                      <p className="mt-0.5 text-xs text-danger">فات الميعاد بـ{qty(o.overdueDays, 0)} يوم</p>
                    ) : null}
                  </div>
                </div>

                <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2 text-xs">
                  {o.steps.map((s) => (
                    <li key={s.key} className={s.done ? "" : "text-muted-foreground"}>
                      <span className={s.done ? "text-accent" : ""}>{s.done ? "●" : "○"}</span> {s.label}:{" "}
                      {s.detail}
                    </li>
                  ))}
                </ol>

                {o.remainingQty > 0 && o.delivered > 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    طلب {qty(o.order.quantity, 0)} · استلم {qty(o.delivered, 0)} · باقي{" "}
                    {qty(o.remainingQty, 0)} قطعة
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
