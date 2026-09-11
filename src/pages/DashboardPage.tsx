import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ExceptionsCard, FunnelCard, HealthCard } from "@/components/Health";
import { Money } from "@/components/Money";
import { Card } from "@/components/ui/card";
import { cairoToday, formatDate, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { overview } from "@/store/health";

export function DashboardPage() {
  const { db } = useFactory();
  const o = overview(db);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">{formatDate(cairoToday())}</p>
        <h2 className="text-2xl">لوحة الإدارة</h2>
        <p className="text-sm text-muted-foreground">
          الأرقام اللي تحتاجها الصبح، واللي محتاج قرار منك — من غير ما تفتح خمستاشر شاشة.
        </p>
      </div>

      <ExceptionsCard limit={5} />

      <HealthCard />

      <section>
        <h3 className="mb-2 text-base">نظرة النهارده</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="منتَج النهارده" value={`${qty(Math.round(o.producedToday), 0)} قطعة`} hint={`آخر أسبوع ${qty(Math.round(o.producedWeek), 0)}`} />
          <Stat
            label="أوامر شغالة"
            value={qty(o.openOrders, 0)}
            hint={o.lateOrders || o.stoppedOrders ? `متأخر ${qty(o.lateOrders, 0)} · متوقف ${qty(o.stoppedOrders, 0)}` : "مفيش متأخر ولا متوقف"}
            to="/orders"
            alert={o.lateOrders > 0}
          />
          <Stat label="الخزينة" value={<Money value={o.cash} />} to="/treasury" />
          <Stat
            label="متأخر التحصيل"
            value={<Money value={o.overdueAmount} />}
            to="/collections"
            alert={o.overdueAmount > 0}
          />
          <Stat label="إيراد ٣٠ يوم" value={<Money value={o.revenueMonth} />} to="/treasury" />
          <Stat label="مصروف ٣٠ يوم" value={<Money value={o.costMonth} />} to="/costs" />
          <Stat label="صافي ٣٠ يوم" value={<Money value={o.profitMonth} signed />} to="/treasury" />
          <Stat label="عليك للموردين والعمال" value={<Money value={o.dueToVendors} />} to="/costs" />
          <Stat
            label="نسبة العيوب"
            value={o.defectPct === null ? "—" : `${qty(Math.round(o.defectPct), 0)}٪`}
            hint={o.defectPct === null ? "محتاج تسجيل مراحل" : `${qty(Math.round(o.defectsMonth), 0)} قطعة من ${qty(Math.round(o.goodMonth + o.defectsMonth), 0)}`}
            alert={o.defectPct !== null && o.defectPct > 5}
          />
          <Stat label="تكلفة الهالك ٣٠ يوم" value={<Money value={o.wasteCostMonth} />} to="/costing" />
          <Stat
            label="حضور النهارده"
            value={`${qty(o.presentToday, 0)} / ${qty(o.crewSize, 0)}`}
            to="/workers"
            alert={o.crewSize > 0 && o.presentToday === 0}
          />
          <Stat label="متحصّل ٣٠ يوم" value={<Money value={o.collectedMonth} />} to="/collections" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          «منتَج» = كمية آخر مرحلة في مسار التصنيع، عشان القطعة متتعدّش مرتين وهي بتمشي بين المراحل.
        </p>
      </section>

      <FunnelCard />

      <Card>
        <h3 className="text-base">اللي لسه مش مسجّل في النظام</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          الدرجة فوق محسوبة على المتاح بس. الحاجات دي لو اتسجّلت، الدرجة تبقى أصدق:
        </p>
        <ul className="mt-2 list-none space-y-1 text-sm text-muted-foreground">
          <li>· فحص الجودة بنوع العيب وسببه — دلوقتي بنعرف الكمية المرفوضة، مش سببها</li>
          <li>· الماكينات وتوقفها وصيانتها — مفيش سجل ماكينات لسه</li>
          <li>· طاقة كل مرحلة لوحدها — الطاقة دلوقتي بتتحسب للمصنع كله</li>
          <li>· تسجيل العمليات بالباركود وقت الشغل — دلوقتي بتتسجّل بعد ما تخلص</li>
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          النظام بيقول ده صريح بدل ما يحسب المؤشر صفر ويوريك حالة أسوأ من الحقيقة.
        </p>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  to,
  alert,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  to?: string;
  alert?: boolean;
}) {
  const inner = (
    <Card className={`h-full ${alert ? "border-r-2 border-r-danger" : ""}`}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className={`mt-0.5 text-lg ${alert ? "text-danger" : ""}`}>{value}</div>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}
