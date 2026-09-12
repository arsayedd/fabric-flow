import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, Wallet } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExportMenu } from "@/components/export/ExportMenu";
import { addDays, cairoToday, countLabel, formatDate, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { datasetOf } from "@/store/datasets";
import { whatsappReminder } from "@/store/compute";
import {
  CASH_KIND_LABEL,
  MIN_SETTLED,
  cashForecast,
  collectionSpeed,
  payableAging,
  payerBehavior,
  payerRanking,
  receivableAging,
  type AgingBucket,
} from "@/store/cashflow";

/**
 * الفلوس الجاية والرايحة.
 *
 * الشاشة دي بتجاوب سؤال واحد بأربع طرق: **هل الخزنة هتضيق، وبسبب مين.**
 *
 * - **توقع الخزنة**: يوم بيوم من المواعيد اللي في الدفتر، وأول يوم الرصيد
 *   ينزل تحت الصفر مكتوب بالتاريخ.
 * - **أعمار المستحقات**: الفلوس اللي برّه متبوّبة بتأخيرها، لأن ٤٠٠ ألف
 *   متأخرة ١٠ أيام مش زي ٤٠٠ ألف متأخرة ١٢٠ يوم.
 * - **سلوك الدفع**: مين بيدفع في الميعاد فعلًا — محسوب من كل تحصيل مربوط
 *   بالتوريدة اللي سدّدها، مش من إحساس.
 * - **اللي علينا**: فواتير الموردين بعمرها، والأجور والورش.
 *
 * وأهم سطر في الشاشة مكتوب في `cashflow.ts`: **المتأخر على العملاء مش
 * بيتحسب داخل، والمتأخر علينا بيتحسب خارج.** التوقع متحفّظ عن قصد،
 * والمتأخر بيتعرض لوحده تحت «لو حصّلته».
 */

const TABS = [
  { id: "forecast", label: "توقع الخزنة" },
  { id: "aging", label: "أعمار المستحقات" },
  { id: "payers", label: "سلوك الدفع" },
  { id: "owed", label: "اللي علينا" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TAB_DATASET: Record<TabId, string> = {
  forecast: "cash-forecast",
  aging: "receivable-aging",
  payers: "payer-behavior",
  owed: "payable-aging",
};

const HORIZONS = [7, 30, 90] as const;

export function CashflowPage({ initialTab = "forecast" }: { initialTab?: TabId }) {
  const { db, can } = useFactory();
  const [tab, setTab] = useState<TabId>(initialTab);

  if (!can.do("finance", "view")) {
    return (
      <EmptyState
        icon={Wallet}
        title="الشاشة دي محتاجة صلاحية المالية"
        body="فيها أرصدة الخزنة ومديونية العملاء ومستحقات الموردين، فمابتتفتحش بدون صلاحية. اطلبها من صاحب المصنع."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">الفلوس الجاية والرايحة</h2>
          <p className="text-sm text-muted-foreground">
            الخزنة هتضيق امتى، وبسبب مين — من مواعيد مكتوبة في دفترك، مش من توقع.
          </p>
        </div>
        <ExportMenu module="finance" dataset={() => datasetOf(db, TAB_DATASET[tab])} />
      </div>

      <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
              tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "forecast" ? <ForecastTab /> : null}
      {tab === "aging" ? <AgingTab /> : null}
      {tab === "payers" ? <PayersTab /> : null}
      {tab === "owed" ? <OwedTab /> : null}
    </div>
  );
}

/* ── توقع الخزنة ─────────────────────────────────────────────── */

function ForecastTab() {
  const { db } = useFactory();
  const [horizon, setHorizon] = useState<number>(30);
  const f = useMemo(() => cashForecast(db, horizon), [db, horizon]);
  const moves = f.days.filter((d) => d.items.length);
  const daysTo = f.shortfall ? Math.max(0, f.days.findIndex((d) => d.date === f.shortfall?.date)) : 0;

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {HORIZONS.map((h) => (
          <button
            key={h}
            onClick={() => setHorizon(h)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
              horizon === h ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            {qty(h, 0)} يوم
          </button>
        ))}
      </div>

      {f.shortfall ? (
        <Card className="border-danger/40">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Badge tone="danger">الخزنة هتضيق</Badge>
              <p className="mt-2 text-lg">
                يوم {formatDate(f.shortfall.date)} الرصيد هيبقى <Money value={f.shortfall.balance} />
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {daysTo === 0
                  ? "المطلوب دلوقتي أكبر من اللي في الخزنة — مش بكرة، النهارده."
                  : `يعني عندك ${qty(daysTo, 0)} ${countLabel(daysTo, "يوم", "يومين", "أيام", "يوم")} قبل ما المطلوب يتعدّى اللي في الخزنة.`}
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-muted-foreground">في الخزنة دلوقتي</p>
          <p className="mt-1 text-2xl tabular">
            <Money value={f.opening} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">مجموع الكاش والبنك والمحافظ</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">داخل في {qty(horizon, 0)} يوم</p>
          <p className="mt-1 text-2xl tabular text-ok">
            <Money value={f.inflow} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">مستحقات بمواعيدها الجاية وشيكات بتاريخها</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">خارج في {qty(horizon, 0)} يوم</p>
          <p className="mt-1 text-2xl tabular text-danger">
            <Money value={f.outflow} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">فواتير بمهلتها + أجور ومستحقات ورش مستحقة دلوقتي</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">أقل رصيد في المدة</p>
          <p className={`mt-1 text-2xl tabular ${(f.lowest?.balance ?? 0) < 0 ? "text-danger" : ""}`}>
            <Money value={f.lowest?.balance ?? f.opening} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {f.lowest ? formatDate(f.lowest.date) : "مفيش حركة متجدولة"}
          </p>
        </Card>
      </div>

      {f.overdueIn > 0 ? (
        <Card>
          <p className="text-sm">
            وفيه <Money value={f.overdueIn} /> متأخرة على العملاء <span className="text-muted-foreground">مش محسوبة داخلة فوق</span>.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            الميعاد اللي فات مرة مابقاش ميعاد، فلو حسبناه بيدخل بكرة كان التوقع بيطمّنك على فلوس محدش وعد بيها. لو حصّلتها،
            أقل رصيد في المدة بيبقى <Money value={(f.lowest?.balance ?? f.opening) + f.overdueIn} />.
          </p>
          <Button size="sm" variant="outline" className="mt-3" asChild>
            <Link to="/collections">افتح التحصيل</Link>
          </Button>
        </Card>
      ) : null}

      {moves.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="مفيش حركة متجدولة في المدة دي"
          body="التوقع بيتبني من مواعيد التوريدات الآجلة والشيكات وفواتير الموردين اللي لها مهلة دفع. سجّل توريد بميعاد آجل، وهيبان هنا لوحده."
        />
      ) : (
        <div className="space-y-2">
          {moves.map((d) => (
            <Card key={d.date}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {formatDate(d.date)}
                    {d.date === cairoToday() ? <span className="mr-2 text-xs text-muted-foreground">النهارده</span> : null}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {d.inflow > 0 ? <>داخل <Money value={d.inflow} /> · </> : null}
                    {d.outflow > 0 ? <>خارج <Money value={d.outflow} /> · </> : null}
                    الرصيد بعدها <Money value={d.balance} />
                  </p>
                </div>
                {d.balance < 0 ? <Badge tone="danger">تحت الصفر</Badge> : null}
              </div>
              <div className="mt-3 space-y-1.5">
                {d.items.map((it, i) => (
                  <div key={`${it.kind}-${i}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      {it.to ? (
                        <Link to={it.to} className="underline-offset-2 hover:underline">
                          {it.label}
                        </Link>
                      ) : (
                        it.label
                      )}
                      <span className="mr-2 text-xs text-muted-foreground">
                        {CASH_KIND_LABEL[it.kind]}
                        {it.now ? " · مستحق دلوقتي" : ""}
                      </span>
                    </span>
                    <span className={it.amount > 0 ? "text-ok" : "text-danger"}>
                      <Money value={Math.abs(it.amount)} />
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── أعمار المستحقات ─────────────────────────────────────────── */

function AgingTab() {
  const { db } = useFactory();
  const today = cairoToday();
  const aging = useMemo(() => receivableAging(db), [db]);
  const speed = useMemo(() => collectionSpeed(db, addDays(today, -90), today), [db, today]);
  const [open, setOpen] = useState<string | null>("d1");

  if (!aging.rows.length) {
    return (
      <EmptyState
        icon={Wallet}
        title="مفيش مستحق على العملاء"
        body="كل توريدة اتحصّلت. لما يتسجّل توريد بميعاد آجل، هيتبوّب هنا بعمره لوحده."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-muted-foreground">المستحق كله</p>
          <p className="mt-1 text-2xl tabular">
            <Money value={aging.total} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            منها <Money value={aging.overdue} /> فات ميعادها
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">متوسط أيام التحصيل</p>
          <p className="mt-1 text-2xl tabular">{speed.avgDaysToPay === null ? "—" : qty(speed.avgDaysToPay, 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {speed.avgDaysToPay === null
              ? "مفيش تحصيل في آخر ٩٠ يوم"
              : "محسوب من كل تحصيل مربوط بتوريدته في آخر ٩٠ يوم"}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">المستحق يعادل كام يوم توريد</p>
          <p className="mt-1 text-2xl tabular">{speed.dso === null ? "—" : qty(speed.dso, 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {speed.dso === null ? "مفيش توريد في آخر ٩٠ يوم" : "المستحق ÷ متوسط التوريد اليومي (DSO)"}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">نسبة التحصيل — ٩٠ يوم</p>
          <p className="mt-1 text-2xl tabular">{speed.ratePct === null ? "—" : `${qty(speed.ratePct, 0)}٪`}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            حصّلت <Money value={speed.collected} /> من <Money value={speed.billed} /> اتفوترت
          </p>
        </Card>
      </div>

      <div className="space-y-2">
        {aging.buckets.map((b) => (
          <BucketCard
            key={b.key}
            bucket={b}
            open={open === b.key}
            onToggle={() => setOpen(open === b.key ? null : b.key)}
          />
        ))}
      </div>
    </div>
  );
}

function BucketCard({ bucket, open, onToggle }: { bucket: AgingBucket; open: boolean; onToggle: () => void }) {
  const { db } = useFactory();
  if (!bucket.count) {
    return (
      <Card className="opacity-60">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">{bucket.label}</p>
          <p className="text-sm text-muted-foreground">مفيش</p>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <button type="button" onClick={onToggle} className="flex w-full flex-wrap items-center justify-between gap-3 text-right">
        <div>
          <Badge tone={bucket.tone === "ok" ? "muted" : bucket.tone}>{bucket.label}</Badge>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {bucket.about} · {countLabel(bucket.count, "توريدة واحدة", "توريدتين", "توريدات", "توريدة")}
          </p>
        </div>
        <p className="text-xl tabular">
          <Money value={bucket.total} />
        </p>
      </button>
      {open ? (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {bucket.rows.map((r) => (
            <div key={r.deliveryId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                <Link to={`/parties/${r.clientId}`} className="underline-offset-2 hover:underline">
                  {r.clientName}
                </Link>
                <span className="mr-2 text-xs text-muted-foreground">
                  {r.model ? `${r.model} · ` : ""}
                  {r.lateDays > 0 ? `متأخر ${qty(r.lateDays, 0)} يوم` : `ميعادها ${formatDate(r.dueDate)}`}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Money value={r.amount} />
                <Button size="sm" variant="whatsapp" asChild>
                  <a
                    href={whatsappReminder({
                      name: r.clientName,
                      amount: r.amount,
                      dueDate: r.dueDate,
                      factoryName: db.factory?.name ?? "",
                      phone: r.phone,
                    })}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </a>
                </Button>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

/* ── سلوك الدفع ──────────────────────────────────────────────── */

function PayersTab() {
  const { db } = useFactory();
  const rows = useMemo(() => payerBehavior(db), [db]);
  const rank = useMemo(() => payerRanking(db), [db]);

  if (!rows.length) {
    return (
      <EmptyState
        icon={Wallet}
        title="مفيش عميل عليه حركة لسه"
        body="سلوك الدفع بيتحسب من التحصيلات المربوطة بتوريداتها. أول ما يتسجّل تحصيل، العميل بيبان هنا."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <p className="text-sm">أحسن دافعين</p>
          <p className="mt-0.5 text-xs text-muted-foreground">بالدفع في الميعاد، مش بحجم الفلوس</p>
          <div className="mt-3 space-y-1.5">
            {rank.best.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {rank.measured
                  ? "مفيش عميل مقيس بيدفع في الميعاد دلوقتي."
                  : `لسه مفيش عميل عنده ${qty(MIN_SETTLED, 0)} توريدات مسدّدة.`}
              </p>
            ) : (
              rank.best.map((r) => (
                <div key={r.clientId} className="flex items-center justify-between gap-2 text-sm">
                  <Link to={`/parties/${r.clientId}`} className="underline-offset-2 hover:underline">
                    {r.name}
                  </Link>
                  <span className="text-ok">{qty(r.onTimePct ?? 0, 0)}٪ في الميعاد</span>
                </div>
              ))
            )}
          </div>
        </Card>
        <Card>
          <p className="text-sm">أسوأ دافعين</p>
          <p className="mt-0.5 text-xs text-muted-foreground">بمتوسط التأخير عن الميعاد</p>
          <div className="mt-3 space-y-1.5">
            {rank.worst.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {rank.measured
                  ? "كل العملاء المقيسين بيدفعوا في الميعاد."
                  : `لسه مفيش عميل عنده ${qty(MIN_SETTLED, 0)} توريدات مسدّدة.`}
              </p>
            ) : (
              rank.worst.map((r) => (
                <div key={r.clientId} className="flex items-center justify-between gap-2 text-sm">
                  <Link to={`/parties/${r.clientId}`} className="underline-offset-2 hover:underline">
                    {r.name}
                  </Link>
                  <span className="text-danger">متأخر {qty(r.avgDaysLate ?? 0, 0)} يوم في المتوسط</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="p-2 text-right">العميل</th>
              <th className="p-2 text-right">المهلة</th>
              <th className="p-2 text-right">بيدفع بعد</th>
              <th className="p-2 text-right">تأخيره</th>
              <th className="p-2 text-right">في الميعاد</th>
              <th className="p-2 text-right">مفتوح</th>
              <th className="p-2 text-right">متأخر عليه</th>
              <th className="p-2 text-right">حصّل منه</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.clientId} className="border-b border-border/60">
                <td className="p-2">
                  <Link to={`/parties/${r.clientId}`} className="underline-offset-2 hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="p-2 tabular">{r.termDays > 0 ? `${qty(r.termDays, 0)} يوم` : "—"}</td>
                <td className="p-2 tabular">{r.enough ? `${qty(r.avgDaysToPay ?? 0, 0)} يوم` : "لسه بدري"}</td>
                <td className="p-2 tabular">
                  {r.enough ? (
                    (r.avgDaysLate ?? 0) > 0 ? (
                      <span className="text-danger">{qty(r.avgDaysLate ?? 0, 0)} يوم</span>
                    ) : (
                      <span className="text-ok">في الميعاد</span>
                    )
                  ) : (
                    "—"
                  )}
                </td>
                <td className="p-2 tabular">{r.enough ? `${qty(r.onTimePct ?? 0, 0)}٪` : "—"}</td>
                <td className="p-2 tabular">
                  <Money value={r.openAmount} />
                </td>
                <td className="p-2 tabular">
                  {r.overdueAmount > 0 ? (
                    <span className="text-danger">
                      <Money value={r.overdueAmount} /> · {qty(r.oldestLateDays, 0)} يوم
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="p-2 tabular">
                  <Money value={r.paidAmount} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        «لسه بدري» معناها العميل عنده أقل من {qty(MIN_SETTLED, 0)} توريدات مسدّدة. تحت الحد ده الرقم بيبقى حادثة مش سلوك،
        وترتيب أفضل وأسوأ دافع بيحسب اللي فوق الحد بس ({qty(rank.measured, 0)} من {qty(rank.all, 0)} عميل).
      </p>
    </div>
  );
}

/* ── اللي علينا ──────────────────────────────────────────────── */

function OwedTab() {
  const { db } = useFactory();
  const p = useMemo(() => payableAging(db), [db]);

  if (!p.rows.length && p.workerTotal <= 0 && p.workshopTotal <= 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="مفيش مستحق عليك"
        body="كل فاتورة مورّد اتدفعت، ومفيش أجور ولا مستحقات ورش مفتوحة."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-muted-foreground">فواتير موردين</p>
          <p className="mt-1 text-2xl tabular">
            <Money value={p.total} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {p.lateCount > 0 ? (
              <>
                منها <Money value={p.lateTotal} /> فات ميعادها
              </>
            ) : (
              "مفيش فاتورة فات ميعادها المكتوب"
            )}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">أجور عمال مستحقة</p>
          <p className="mt-1 text-2xl tabular">
            <Money value={p.workerTotal} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">مكاسب اتسجّلت ولسه ماتدفعتش</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">مستحقات ورش</p>
          <p className="mt-1 text-2xl tabular">
            <Money value={p.workshopTotal} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">شغل رجع من ورشة ولسه ماتحاسبتش</p>
        </Card>
      </div>

      <div className="grid gap-2 sm:grid-cols-5">
        {p.buckets.map((b) => (
          <Card key={b.key} className={b.count ? "" : "opacity-60"}>
            <p className="text-xs text-muted-foreground">{b.label}</p>
            <p className="mt-1 text-lg tabular">
              <Money value={b.total} />
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{qty(b.count, 0)} فاتورة</p>
          </Card>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="p-2 text-right">المورّد</th>
              <th className="p-2 text-right">البند</th>
              <th className="p-2 text-right">تاريخها</th>
              <th className="p-2 text-right">عمرها</th>
              <th className="p-2 text-right">ميعاد الدفع</th>
              <th className="p-2 text-right">الباقي</th>
            </tr>
          </thead>
          <tbody>
            {p.rows.map((r) => (
              <tr key={r.entryId} className="border-b border-border/60">
                <td className="p-2">
                  {r.partyId ? (
                    <Link to={`/parties/${r.partyId}`} className="underline-offset-2 hover:underline">
                      {r.vendor}
                    </Link>
                  ) : (
                    r.vendor
                  )}
                </td>
                <td className="p-2">
                  <Link to={`/costs/${r.costItemId}`} className="underline-offset-2 hover:underline">
                    {r.itemName}
                  </Link>
                </td>
                <td className="p-2 tabular">{formatDate(r.date)}</td>
                <td className="p-2 tabular">{qty(r.ageDays, 0)} يوم</td>
                <td className="p-2 tabular">
                  {r.dueDate ? (
                    (r.lateDays ?? 0) > 0 ? (
                      <span className="text-danger">
                        {formatDate(r.dueDate)} · متأخر {qty(r.lateDays ?? 0, 0)} يوم
                      </span>
                    ) : (
                      formatDate(r.dueDate)
                    )
                  ) : (
                    <span className="text-muted-foreground">مالوش مهلة مكتوبة</span>
                  )}
                </td>
                <td className="p-2 tabular">
                  <Money value={r.due} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        الفواتير هنا متبوّبة <strong className="font-medium">بعمرها</strong> مش بتأخيرها، لأن ميعاد الدفع بيتحسب من مهلة
        المورّد المكتوبة في ملفه — و{qty(p.rows.length - p.withTerms, 0)} فاتورة مورّدها مالوش مهلة مكتوبة. اكتب المهلة في
        ملف المورّد، وميعادها هيبان هنا وفي التوقع.
      </p>
    </div>
  );
}
