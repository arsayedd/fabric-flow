import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, Ban, CheckCircle2, Clock, HelpCircle, Printer, WifiOff } from "lucide-react";
import { Mark } from "@/components/Brand";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate, money, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { portalSummaryLine, portalView, type PortalResult, type PortalView } from "@/store/portal";

/**
 * شاشة العميل — اللي بيفتحها من اللينك الخاص بيه.
 *
 * برّا الـ`AppShell` بقصد: مافيش قائمة ولا بحث ولا إشعارات ولا أي مدخل
 * لباقي النظام. الصفحة دي **مخرج واحد** — بيانات العميل وخلاص.
 *
 * وكل اللي بيتعرض جاي من `portalView` وبس. الصفحة مابتلمسش `db`
 * مباشرة، عشان الحد الأمني يفضل في مكان واحد ينفع يتراجع، مش موزّع على
 * JSX. ولو حد زوّد حقل هنا لازم يمرّ من هناك الأول.
 *
 * ولغة الشاشة لغة عميل مش لغة محاسب: «اللي عليك» مش «رصيد مدين».
 */
export function PortalPage() {
  const { token = "" } = useParams();
  const { db, recordPortalView } = useFactory();

  const result = useMemo<PortalResult>(() => portalView(db, token), [db, token]);

  /* الفتحة تتعدّ مرة لكل لينك في الجلسة — مش مع كل رندر */
  const grantId = result.state === "ok" ? result.grant.id : null;
  useEffect(() => {
    if (grantId) recordPortalView(grantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantId]);

  if (result.state === "ok") return <Account view={result.view} />;

  if (result.state === "revoked") {
    return (
      <Notice
        icon={Ban}
        tone="danger"
        title="الرابط ده اتوقف"
        body={
          result.grant.revokedReason
            ? `السبب المسجّل: ${result.grant.revokedReason}. كلّم المصنع يبعتلك رابط جديد.`
            : "المصنع أوقف الرابط ده. كلّمه يبعتلك رابط جديد."
        }
      />
    );
  }

  if (result.state === "expired") {
    return (
      <Notice
        icon={Clock}
        tone="warn"
        title="الرابط ده خلصت مدته"
        body={`الرابط كان صالح لحد ${formatDate(result.grant.expiresAt ?? "")}. كلّم المصنع يمدّده أو يبعتلك واحد جديد.`}
      />
    );
  }

  if (result.state === "no-data") {
    return (
      <Notice
        icon={WifiOff}
        tone="warn"
        title="مش قادرين نوصل لبيانات حسابك من الجهاز ده"
        body="الرابط شكله سليم، بس بيانات المصنع لسه محفوظة على أجهزة المصنع نفسه مش على سيرفر. افتح الرابط من جهاز المصنع، أو كلّمه يبعتلك كشف حساب مطبوع."
      />
    );
  }

  return (
    <Notice
      icon={HelpCircle}
      tone="muted"
      title="مش لاقيين الرابط ده"
      body="يا إن الرابط اتنسخ ناقص، يا إنه بتاع مصنع تاني. تأكد إنك نسخت الرابط كله من غير ما يتقطع."
    />
  );
}

/* ── شاشة الحساب ───────────────────────────────────────────────── */

function Account({ view }: { view: PortalView }) {
  const [tab, setTab] = useState<"invoices" | "payments" | "orders" | "statement">(
    view.scope.invoices ? "invoices" : view.scope.orders ? "orders" : view.scope.payments ? "payments" : "statement",
  );

  const { totals } = view;
  const settled = totals.balance <= 0.5;

  const tabs = (
    [
      { key: "invoices" as const, label: "التوريدات", on: view.scope.invoices, count: view.invoices.length },
      { key: "payments" as const, label: "اللي سدّدته", on: view.scope.payments, count: view.payments.length },
      { key: "orders" as const, label: "أوامر الإنتاج", on: view.scope.orders, count: view.orders.length },
      { key: "statement" as const, label: "كشف الحساب", on: view.scope.statement, count: view.statement.length },
    ] satisfies { key: typeof tab; label: string; on: boolean; count: number }[]
  ).filter((t) => t.on);

  return (
    <div className="min-h-dvh bg-background">
      {view.demo ? (
        <p className="bg-warn-soft px-4 py-2 text-center text-xs text-warn print:hidden">
          عرض تجريبي — الأرقام دي مولّدة للعرض، مش حساب عميل حقيقي.
        </p>
      ) : null}

      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {view.factoryLogo ? (
              <img src={view.factoryLogo} alt="" className="h-11 w-11 rounded object-contain" />
            ) : (
              <Mark className="h-11 w-11" />
            )}
            <div className="min-w-0 leading-tight">
              <p className="truncate font-medium">{view.factoryName}</p>
              <p className="truncate text-xs text-muted-foreground">
                حساب {view.clientName}
                {view.clientCode ? ` · ${view.clientCode}` : ""}
              </p>
            </div>
          </div>
          <Button variant="ghost" onClick={() => window.print()} className="print:hidden">
            <Printer aria-hidden className="size-4" />
            اطبع الكشف
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-5">
        <Card className={settled ? "border-ok/40 bg-ok-soft/30" : totals.overdue > 0.5 ? "border-danger/40" : ""}>
          <div className="flex items-start gap-3">
            {settled ? (
              <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-ok" />
            ) : totals.overdue > 0.5 ? (
              <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
            ) : (
              <Clock aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <p className="font-medium">{portalSummaryLine(view)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                الأرقام لحد {formatDate(view.asOf)}
                {view.paymentTermDays ? ` · شروط السداد المتفق عليها ${qty(view.paymentTermDays, 0)} يوم` : ""}
              </p>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="اللي عليك دلوقتي" value={money(totals.balance)} tone={settled ? "ok" : "plain"} big />
          <Stat label="منه فات ميعاده" value={money(totals.overdue)} tone={totals.overdue > 0.5 ? "danger" : "plain"} />
          <Stat label="إجمالي توريداتك" value={money(totals.invoiced)} />
          <Stat label="اللي سدّدته" value={money(totals.paid)} tone="ok" />
        </div>

        {totals.pendingPayments > 0.5 ? (
          <p className="rounded-lg border border-warn/40 bg-warn-soft/40 px-3 py-2 text-sm">
            فيه {money(totals.pendingPayments)} مستني تأكيد تحصيل — لسه مش مخصوم من اللي عليك.
          </p>
        ) : null}

        {view.aging.length > 1 ? (
          <Card>
            <h2 className="font-medium">المستحق موزّع على الأعمار</h2>
            <dl className="mt-3 space-y-2">
              {view.aging.map((b) => (
                <div key={b.label} className="flex items-baseline justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">
                    {b.label} <span className="tabular">({qty(b.count, 0)})</span>
                  </dt>
                  <dd className="tabular font-medium">{money(b.amount)}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ) : null}

        {tabs.length ? (
          <>
            <div role="tablist" aria-label="تفاصيل الحساب" className="flex flex-wrap gap-2 print:hidden">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    tab === t.key
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {t.label} <span className="tabular">{qty(t.count, 0)}</span>
                </button>
              ))}
            </div>

            {tab === "invoices" ? <Invoices view={view} /> : null}
            {tab === "payments" ? <Payments view={view} /> : null}
            {tab === "orders" ? <Orders view={view} /> : null}
            {tab === "statement" ? <Statement view={view} /> : null}
          </>
        ) : (
          <Card className="text-center text-sm text-muted-foreground">
            المصنع ضيّق الرابط ده على الملخص بس. لو محتاج التفاصيل كلّمه.
          </Card>
        )}

        <footer className="space-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
          <p>
            أي رقم هنا مش مطابق لورقك، كلّم {view.factoryName}
            {view.factoryPhone ? ` على ${view.factoryPhone}` : ""}
            {view.factoryEmail ? ` أو ${view.factoryEmail}` : ""}.
          </p>
          {view.factoryAddress ? <p>{view.factoryAddress}</p> : null}
          <p className="print:hidden">الرابط ده خاص بحسابك — متبعتهوش لحد تاني.</p>
        </footer>
      </main>
    </div>
  );
}

/* ── الجداول ───────────────────────────────────────────────────── */

function Invoices({ view }: { view: PortalView }) {
  if (!view.invoices.length) return <Empty text="مافيش توريدات مسجّلة على حسابك لحد الآن." />;
  return (
    <Table head={["التاريخ", "الموديل", "الكمية", "القيمة", "المسدّد", "الباقي", "الاستحقاق"]}>
      {view.invoices.map((r) => (
        <tr key={r.id} className="border-t border-border/60">
          <Td>{formatDate(r.date)}</Td>
          <Td>{r.model || "—"}</Td>
          <Td num>{r.quantity == null ? "—" : qty(r.quantity, 0)}</Td>
          <Td num>{money(r.amount)}</Td>
          <Td num>{money(r.paid)}</Td>
          <Td num>{r.remaining > 0.5 ? money(r.remaining) : "—"}</Td>
          <Td>
            {r.remaining <= 0.5 ? (
              <Badge tone="ok">مسدّد</Badge>
            ) : r.overdueDays > 0 ? (
              <Badge tone="danger">فات {qty(r.overdueDays, 0)} يوم</Badge>
            ) : (
              formatDate(r.dueDate)
            )}
          </Td>
        </tr>
      ))}
    </Table>
  );
}

function Payments({ view }: { view: PortalView }) {
  if (!view.payments.length) return <Empty text="مافيش دفعات مسجّلة على حسابك لحد الآن." />;
  return (
    <Table head={["التاريخ", "المبلغ", "الطريقة", "الحالة"]}>
      {view.payments.map((r) => (
        <tr key={r.id} className="border-t border-border/60">
          <Td>{formatDate(r.date)}</Td>
          <Td num>{money(r.amount)}</Td>
          <Td>{r.method}</Td>
          <Td>{r.pending ? <Badge tone="warn">مستني تأكيد</Badge> : <Badge tone="ok">متأكّد</Badge>}</Td>
        </tr>
      ))}
    </Table>
  );
}

function Orders({ view }: { view: PortalView }) {
  if (!view.orders.length) return <Empty text="مافيش أوامر إنتاج مفتوحة باسمك دلوقتي." />;
  const tone: Record<string, Tone> = { done: "ok", running: "gold", late: "warn", stopped: "danger" };
  return (
    <Table head={["الأمر", "الموديل", "المطلوب", "اتسلّم", "الميعاد", "الحالة"]}>
      {view.orders.map((r) => (
        <tr key={r.id} className="border-t border-border/60">
          <Td>
            <span className="latin tabular">{r.code}</span>
          </Td>
          <Td>{r.model || "—"}</Td>
          <Td num>{qty(r.quantity, 0)}</Td>
          <Td num>{qty(r.delivered, 0)}</Td>
          <Td>{formatDate(r.dueDate)}</Td>
          <Td>
            <Badge tone={tone[r.status] ?? "muted"}>{r.statusLabel}</Badge>
          </Td>
        </tr>
      ))}
    </Table>
  );
}

function Statement({ view }: { view: PortalView }) {
  if (!view.statement.length) return <Empty text="مافيش حركات على حسابك لحد الآن." />;
  return (
    <Table head={["التاريخ", "الحركة", "عليك", "لك", "الرصيد"]}>
      {view.statement.map((r) => (
        <tr key={r.id} className="border-t border-border/60">
          <Td>{formatDate(r.date)}</Td>
          <Td>{r.label}</Td>
          <Td num>{r.debit ? money(r.debit) : "—"}</Td>
          <Td num>{r.credit ? money(r.credit) : "—"}</Td>
          <Td num>{money(r.balance)}</Td>
        </tr>
      ))}
    </Table>
  );
}

/* ── قطع صغيرة ─────────────────────────────────────────────────── */

function Stat({
  label,
  value,
  tone = "plain",
  big,
}: {
  label: string;
  value: string;
  tone?: "plain" | "ok" | "danger";
  big?: boolean;
}) {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`tabular mt-1 ${big ? "text-xl" : "text-lg"} ${
          tone === "ok" ? "text-ok" : tone === "danger" ? "text-danger" : ""
        }`}
      >
        {value}
      </p>
    </Card>
  );
}

/** الجدول بيجرجر جواه مش بيوسّع الصفحة — الموبايل أهم قارئ للشاشة دي */
function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[34rem] text-sm">
        <thead>
          <tr className="bg-muted/50 text-right">
            {head.map((h, i) => (
              <th key={h} scope="col" className={`px-3 py-2 font-medium ${i > 1 ? "text-left" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </Card>
  );
}

function Td({ children, num }: { children: React.ReactNode; num?: boolean }) {
  return <td className={`px-3 py-2 ${num ? "tabular text-left" : ""}`}>{children}</td>;
}

function Empty({ text }: { text: string }) {
  return <Card className="text-center text-sm text-muted-foreground">{text}</Card>;
}

function Notice({
  icon: Icon,
  tone,
  title,
  body,
}: {
  icon: typeof HelpCircle;
  tone: "muted" | "warn" | "danger";
  title: string;
  body: string;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-5">
      <Card className="text-center">
        <Icon
          aria-hidden
          className={`mx-auto size-10 ${tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-muted-foreground"}`}
        />
        <p className="mt-3 font-medium">{title}</p>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      </Card>
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Mark className="h-5 w-5" />
        <span>مبني على صنعة</span>
      </div>
    </div>
  );
}
