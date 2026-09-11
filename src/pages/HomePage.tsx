import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, CircleAlert, CircleCheck } from "lucide-react";
import { Money } from "@/components/Money";
import { Badge, STATUS } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cairoToday, formatDate } from "@/lib/utils";
import { useFactory } from "@/store/context";

export function HomePage() {
  const { can, computed } = useFactory();
  if (!can.finance) return <SupervisorHome />;

  const { rec, treasuryTotal, monthPnl, owe, orders } = computed;
  const dueNow = rec.overdue.length + rec.today.length;
  const running = orders.filter((o) => o.status === "running");
  const stuck = orders.filter((o) => o.status === "late" || o.status === "stopped");

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">{formatDate(cairoToday())}</p>
        <h2 className="text-2xl">ملخص النهارده</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="الخزينة" value={<Money value={treasuryTotal} />} to="/treasury" />
        <Stat
          label="متأخر التحصيل"
          value={<Money value={rec.overdue.reduce((s, r) => s + r.remaining, 0)} />}
          to="/collections"
          alert={rec.overdue.length > 0}
        />
        <Stat label="ربح الشهر" value={<Money value={monthPnl.net} signed />} to="/treasury" />
        <Stat label="عليك للموردين" value={<Money value={owe.vendorTotal} />} to="/costs" />
      </div>

      {dueNow > 0 || rec.pending.length > 0 || stuck.length > 0 ? (
        <Card className="border-r-2 border-r-accent">
          <div className="mb-2 flex items-center gap-2">
            <CircleAlert className="h-4 w-4 text-accent" />
            <h3 className="text-base">محتاج منك النهارده</h3>
          </div>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {rec.overdue.length ? <li>{rec.overdue.length} مبلغ متأخر على العملاء</li> : null}
            {rec.today.length ? <li>{rec.today.length} مبلغ مستحق النهارده</li> : null}
            {rec.pending.length ? <li>{rec.pending.length} تحويل مستني تأكيد وصوله</li> : null}
            {stuck.length ? <li>{stuck.length} أمر إنتاج متأخر أو متوقف</li> : null}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button asChild size="sm">
              <Link to="/collections">افتح التحصيل</Link>
            </Button>
            {stuck.length ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/orders">أوامر الإنتاج</Link>
              </Button>
            ) : null}
          </div>
        </Card>
      ) : (
        <Card>
          <div className="flex items-center gap-2 text-ok">
            <CircleCheck className="h-4 w-4" />
            <span className="text-sm">مفيش استحقاق متأخر ولا أمر إنتاج متعطل.</span>
          </div>
        </Card>
      )}

      <section>
        <SectionHead title="خطوط الإنتاج" to="/orders" />
        {running.length === 0 ? (
          <p className="text-sm text-muted-foreground">مفيش أوامر شغالة دلوقتي.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {running.slice(0, 4).map((o) => (
              <Link key={o.id} to="/orders" className="rounded-lg border border-border bg-card p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="latin tabular text-sm text-muted-foreground">#{o.code}</span>
                  <Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge>
                </div>
                <p className="mt-1.5">{o.model}</p>
                <p className="text-sm text-muted-foreground">
                  {o.line} · {o.quantity} قطعة
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${o.progress}%` }} />
                  </div>
                  <span className="tabular text-sm">{o.progress}%</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHead title="أقرب المستحقات" to="/collections" />
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {[...rec.overdue, ...rec.today, ...rec.week].slice(0, 5).map((r) => (
            <Link
              key={r.deliveryId}
              to={`/clients/${r.clientId}`}
              className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0"
            >
              <div>
                <p>{r.clientName}</p>
                <p className="text-sm text-muted-foreground">
                  {r.dueDate < cairoToday() ? "متأخر · " : ""}
                  {formatDate(r.dueDate)}
                  {r.model ? ` · ${r.model}` : ""}
                </p>
              </div>
              <Money value={r.remaining} />
            </Link>
          ))}
          {rec.overdue.length + rec.today.length + rec.week.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">كل المستحقات بعيدة أو متحصلة.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function SupervisorHome() {
  const { computed, db } = useFactory();
  const present = computed.attendanceToday.length;
  const missing = Math.max(0, db.workers.length - present);
  const running = computed.orders.filter((o) => o.status === "running" || o.status === "late");

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">{formatDate(cairoToday())}</p>
        <h2 className="text-2xl">شغل النهارده</h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="اتسجل حضورهم" value={`${present}`} />
        <Stat label="لسه" value={`${missing}`} alert={missing > 0} />
      </div>

      {missing > 0 ? (
        <Card className="border-r-2 border-r-accent">
          <h3 className="text-base">الحضور لسه متسجلش للكل</h3>
          <p className="mt-1 text-sm text-muted-foreground">{missing} عامل لسه محتاج تسجيل حضور.</p>
          <Button asChild size="sm" className="mt-3">
            <Link to="/workers">تسجيل الحضور</Link>
          </Button>
        </Card>
      ) : (
        <Card>
          <div className="flex items-center gap-2 text-ok">
            <CircleCheck className="h-4 w-4" />
            <span className="text-sm">حضور النهارده مكتمل.</span>
          </div>
        </Card>
      )}

      <section>
        <SectionHead title="أوامر على الخطوط" to="/orders" />
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {running.map((o) => (
            <Link key={o.id} to="/orders" className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0">
              <div>
                <p>
                  {o.model} <span className="latin tabular text-sm text-muted-foreground">#{o.code}</span>
                </p>
                <p className="text-sm text-muted-foreground">{o.line}</p>
              </div>
              <span className="tabular text-sm">{o.progress}%</span>
            </Link>
          ))}
          {running.length === 0 ? <p className="px-4 py-4 text-sm text-muted-foreground">مفيش أوامر شغالة.</p> : null}
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  to,
  alert,
}: {
  label: string;
  value: ReactNode;
  to?: string;
  alert?: boolean;
}) {
  const inner = (
    <Card className={alert ? "border-r-2 border-r-danger" : ""}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className={`mt-0.5 text-lg ${alert ? "text-danger" : ""}`}>{value}</div>
    </Card>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

function SectionHead({ title, to }: { title: string; to: string }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-base">{title}</h3>
      <Link to={to} className="flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
        الكل
        <ChevronLeft className="h-4 w-4" />
      </Link>
    </div>
  );
}
