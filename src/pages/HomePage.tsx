import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { cairoToday, formatDate } from "@/lib/utils";
import { useFactory } from "@/store/context";

export function HomePage() {
  const { can, computed } = useFactory();
  if (!can.finance) return <SupervisorHome />;

  const { rec, treasuryTotal, monthPnl, owe } = computed;
  const dueNow = rec.overdue.length + rec.today.length;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">{formatDate(cairoToday())}</p>
        <h2 className="text-2xl font-extrabold">صباح الخير على الدفتر</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="الخزينة" value={<Money value={treasuryTotal} />} to="/treasury" />
        <Stat
          label="متأخر التحصيل"
          value={<Money value={rec.overdue.reduce((s, r) => s + r.remaining, 0)} />}
          tone="late"
          to="/collections"
        />
        <Stat label="ربح الشهر" value={<Money value={monthPnl.net} signed />} to="/treasury" />
        <Stat label="عليك للموردين" value={<Money value={owe.vendorTotal} />} to="/costs" />
      </div>

      {dueNow > 0 || rec.pending.length > 0 ? (
        <Card className="border-amber-300 bg-amber-50">
          <div className="mb-2 flex items-center gap-2 font-bold text-warn">
            <AlertTriangle className="h-4 w-4" />
            ميعادها جه
          </div>
          <p className="text-sm leading-7">
            {rec.overdue.length ? `${rec.overdue.length} مبلغ متأخر. ` : ""}
            {rec.today.length ? `${rec.today.length} مستحق النهارده. ` : ""}
            {rec.pending.length ? `${rec.pending.length} تحويل مستني تأكيد.` : ""}
          </p>
          <Button asChild size="sm" className="mt-3">
            <Link to="/collections">افتح التحصيل</Link>
          </Button>
        </Card>
      ) : (
        <Card className="border-emerald-200 bg-emerald-50">
          <div className="flex items-center gap-2 font-bold text-ok">
            <CheckCircle2 className="h-4 w-4" />
            مفيش استحقاق متأخر النهارده
          </div>
        </Card>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-bold">أقرب المستحقات</h3>
          <Link to="/collections" className="flex items-center text-sm text-primary">
            الكل
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </div>
        <div className="space-y-2">
          {[...rec.overdue, ...rec.today, ...rec.week].slice(0, 5).map((r) => (
            <Link
              key={r.deliveryId}
              to={`/clients/${r.clientId}`}
              className="flex items-center justify-between rounded-2xl border bg-card px-4 py-3"
            >
              <div>
                <p className="font-bold">{r.clientName}</p>
                <p className="text-xs text-muted-foreground">
                  {r.dueDate < cairoToday() ? "متأخر" : formatDate(r.dueDate)} · {r.model}
                </p>
              </div>
              <Money value={r.remaining} />
            </Link>
          ))}
          {rec.overdue.length + rec.today.length + rec.week.length === 0 ? (
            <p className="text-sm text-muted-foreground">كل المستحقات بعيدة أو متحصلة.</p>
          ) : null}
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <Quick to="/clients" title="توريد جديد" body="سجّل تسليم عميل وميعاد الآجل." />
        <Quick to="/collections" title="تحصيل" body="كاش أو تحويل بصورة، أو شيك." />
        <Quick to="/workers" title="حضور العمال" body="دوسة واحدة للحضور الجماعي." />
      </div>
    </div>
  );
}

function SupervisorHome() {
  const { computed, db } = useFactory();
  const today = cairoToday();
  const present = computed.attendanceToday.length;
  const missing = db.workers.length - present;

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-extrabold">حضور النهارده</h2>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="اتسجل حضورهم" value={`${present}`} />
        <Stat label="لسه" value={`${Math.max(0, missing)}`} tone={missing > 0 ? "late" : "ok"} />
      </div>
      {missing > 0 ? (
        <Card className="border-amber-300 bg-amber-50">
          <div className="mb-2 flex items-center gap-2 font-bold text-warn">
            <AlertTriangle className="h-4 w-4" />
            الحضور لسه متسجلش للكل
          </div>
          <Button asChild className="mt-2">
            <Link to="/workers">تسجيل الحضور</Link>
          </Button>
        </Card>
      ) : (
        <Card className="border-emerald-200 bg-emerald-50">
          <p className="font-bold text-ok">حضور {formatDate(today)} مكتمل.</p>
        </Card>
      )}
      <Quick to="/workers" title="العمال" body="حضور جماعي، شغل قطعة، سلف." />
      <Quick to="/orders" title="الأوردرات" body="شوف التسليم القريب." />
    </div>
  );
}

function Stat({
  label,
  value,
  to,
  tone,
}: {
  label: string;
  value: ReactNode;
  to?: string;
  tone?: "late" | "ok";
}) {
  const inner = (
    <Card className={tone === "late" ? "border-red-200" : ""}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className={`mt-1 text-lg ${tone === "late" ? "text-late" : ""}`}>{value}</div>
    </Card>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

function Quick({ to, title, body }: { to: string; body: string; title: string }) {
  return (
    <Link to={to} className="block rounded-2xl border bg-card p-4">
      <p className="font-bold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </Link>
  );
}
