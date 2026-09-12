import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Wrench } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Field, Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, selectClass } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ExportMenu } from "@/components/export/ExportMenu";
import { cairoToday, formatDate, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { datasetOf } from "@/store/datasets";
import { downtimeByLine, downtimeCauses, machineList, machineSummary, serviceDue, ticketList, workDaysIn, defaultRange } from "@/store/machines";
import { partiesWithRole } from "@/store/parties";
import {
  MACHINE_KINDS,
  MACHINE_KIND_LABEL,
  MACHINE_STATE_LABEL,
  PRODUCTION_LINES,
  TICKET_KIND_LABEL,
  TICKET_STATE_LABEL,
  type MachineKind,
  type MachineState,
} from "@/store/types";

/**
 * الماكينات والصيانة.
 *
 * الشاشة دي مش «كشف أصول». السؤال اللي بتجاوبه هو اللي بيوقّف المصنع:
 * **الخط وقف ليه، وقد إيه، وكلّف كام، وهيوقف تاني امتى.**
 *
 * وعشان كده الترتيب مقصود: العطلان فوق، وبعده اللي وقّف وقت أكتر. مش
 * ترتيب أبجدي — الترتيب الأبجدي مفيد للجرد، مش للقرار.
 *
 * وحاجة مهمة في الشاشة: **الجاهزية ونسبة التشغيل رقمين مختلفين
 * وبأسمائهم.** الجاهزية محسوبة من التوقف دايمًا، ونسبة التشغيل محسوبة
 * من العمليات اللي اتسجّلت وعليها ماكينة — ولما تكون فاضية بتقول
 * «مفيش تسجيل» بدل ما تعرض صفر يتقرا إهمال.
 */

const STATE_TONE: Record<MachineState, "ok" | "muted" | "warn" | "danger"> = {
  running: "ok",
  idle: "muted",
  maintenance: "warn",
  down: "danger",
  retired: "muted",
};

const TABS = [
  { id: "machines", label: "الماكينات" },
  { id: "tickets", label: "الأعطال والصيانة" },
  { id: "downtime", label: "أسباب التوقف" },
  { id: "plan", label: "الصيانة الجاية" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TAB_DATASET: Record<TabId, string> = {
  machines: "machines",
  tickets: "machine-tickets",
  downtime: "machine-downtime",
  plan: "machines",
};

export function MachinesPage({ initialTab = "machines" }: { initialTab?: TabId }) {
  const { db, can } = useFactory();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<TabId>(() => {
    const want = params.get("tab");
    return TABS.some((t) => t.id === want) ? (want as TabId) : initialTab;
  });
  const [newMachine, setNewMachine] = useState(false);
  const [newTicket, setNewTicket] = useState(() => params.get("new") === "1");

  const range = useMemo(() => defaultRange(), []);
  const s = useMemo(() => machineSummary(db, range), [db, range]);
  const days = workDaysIn(db, range);

  const pickTab = (id: TabId) => {
    setTab(id);
    const next = new URLSearchParams(params);
    next.set("tab", id);
    setParams(next, { replace: true });
  };

  if (!can.do("machines", "view")) {
    return (
      <EmptyState
        icon={Wrench}
        title="الماكينات محتاجة صلاحية الصيانة"
        body="الشاشة دي فيها تكلفة الأعطال وتقييم الفنيين، فمابتتفتحش بدون صلاحية. اطلبها من صاحب المصنع."
      />
    );
  }

  if (!(db.machines ?? []).length) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl">الماكينات والصيانة</h2>
          <p className="text-sm text-muted-foreground">
            الماكينة اللي مش مسجّلة، توقفها بيتحوّل لتأخير في الجدول من غير سبب مكتوب.
          </p>
        </div>
        <EmptyState
          icon={Wrench}
          title="لسه مفيش ماكينة مسجّلة"
          body="سجّل ماكينة واحدة بكودها وخطها ودقايق تشغيلها في اليوم. أول ما تسجّل، أي بلاغ عطل بيبقى له وقت وتكلفة، والصيانة الدورية بيبقى لها ميعاد بيفكّرك."
          action={can.do("machines", "create") ? { label: "ماكينة جديدة", onClick: () => setNewMachine(true) } : undefined}
        />
        {newMachine ? <MachinePanel onClose={() => setNewMachine(false)} /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">الماكينات والصيانة</h2>
          <p className="text-sm text-muted-foreground">
            وقف قد إيه، وكلّف كام، وهيوقف تاني امتى — من تذاكر مسجّلة مش من ذاكرة.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <ExportMenu module="machines" dataset={() => datasetOf(db, TAB_DATASET[tab])} />
          {can.do("machines", "create") ? (
            <>
              <Button variant="outline" onClick={() => setNewMachine(true)}>
                ماكينة
              </Button>
              <Button variant="gold" onClick={() => setNewTicket(true)}>
                بلاغ عطل
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-muted-foreground">واقفة دلوقتي</p>
          <p className="mt-1 text-2xl tabular">{qty(s.byState.down + s.byState.maintenance, 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            من {qty(s.total - s.byState.retired, 0)} في الخدمة · {qty(s.openTickets, 0)} تذكرة مفتوحة
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">ساعات توقف — ٣٠ يوم</p>
          <p className="mt-1 text-2xl tabular">{qty(s.downHours, 1)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {s.worst ? `أكترها ${s.worst.machine.code} — ${s.worst.machine.name}` : "مفيش توقف مسجّل"}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">الجاهزية</p>
          <p className="mt-1 text-2xl tabular">{s.availabilityPct === null ? "—" : `${qty(s.availabilityPct, 1)}٪`}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            المخطط {qty(days, 0)} يوم عمل ناقص التوقف
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">تكلفة الصيانة</p>
          <Money className="mt-1 text-2xl" value={s.cost} />
          <p className="mt-1 text-xs text-muted-foreground">قطع غيار من المخزن + أجر فني + ورشة خارجية</p>
        </Card>
      </div>

      {s.overdueServices.length ? (
        <Card className="border-r-2 border-r-warn">
          <p className="text-sm">
            {s.overdueServices.length === 1
              ? "ماكينة واحدة صيانتها الدورية فاتت ميعادها"
              : `${qty(s.overdueServices.length, 0)} ماكينات صيانتها الدورية فاتت ميعادها`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {s.overdueServices
              .slice(0, 3)
              .map((r) => `${r.machine.code} (${qty(r.serviceOverdueDays ?? 0, 0)} يوم)`)
              .join(" · ")}
          </p>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => pickTab(t.id)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              tab === t.id ? "border-transparent bg-foreground text-background" : "border-border text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "machines" ? <MachineTable /> : null}
      {tab === "tickets" ? <Tickets /> : null}
      {tab === "downtime" ? <Downtime /> : null}
      {tab === "plan" ? <Plan /> : null}

      {newMachine ? <MachinePanel onClose={() => setNewMachine(false)} /> : null}
      {newTicket ? (
        // البلاغ الجاي من الصالة بيجيب معاه رقمه، فقفل التذكرة بيقفل البلاغ
        <TicketPanel issueId={params.get("issue")} onClose={() => setNewTicket(false)} />
      ) : null}
    </div>
  );
}

/* ── جدول الماكينات ───────────────────────────────────────────── */

function MachineTable() {
  const { db } = useFactory();
  const range = useMemo(() => defaultRange(), []);
  const rows = useMemo(() => machineList(db, range), [db, range]);
  const s = useMemo(() => machineSummary(db, range), [db, range]);

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="p-2 text-start">الماكينة</th>
            <th className="p-2 text-start">الخط</th>
            <th className="p-2 text-start">الحالة</th>
            <th className="p-2 text-end">ساعات توقف</th>
            <th className="p-2 text-end">الجاهزية</th>
            <th className="p-2 text-end">نسبة التشغيل</th>
            <th className="p-2 text-end">أعطال</th>
            <th className="p-2 text-end">تكلفة</th>
            <th className="p-2 text-end">الصيانة الجاية</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.machine.id} className="border-t border-border/60">
              <td className="p-2">
                <Link to={`/machines/${r.machine.id}`} className="underline-offset-4 hover:underline">
                  {r.machine.name}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {r.machine.code} · {MACHINE_KIND_LABEL[r.machine.kind]}
                </span>
              </td>
              <td className="p-2 text-muted-foreground">{r.lineLabel}</td>
              <td className="p-2">
                <Badge tone={STATE_TONE[r.machine.state]}>{MACHINE_STATE_LABEL[r.machine.state]}</Badge>
              </td>
              <td className="p-2 text-end tabular">{qty(r.downMinutes / 60, 1)}</td>
              <td className="p-2 text-end tabular">
                {r.plannedMinutes > 0 ? `${qty(r.availabilityPct, 0)}٪` : "—"}
              </td>
              <td className="p-2 text-end tabular">
                {r.utilizationPct === null ? (
                  <span className="text-xs text-muted-foreground">مفيش تسجيل</span>
                ) : (
                  `${qty(r.utilizationPct, 0)}٪`
                )}
              </td>
              <td className="p-2 text-end tabular">{qty(r.breakdowns, 0)}</td>
              <td className="p-2 text-end tabular">{qty(r.cost.total, 0)}</td>
              <td className="p-2 text-end text-xs">
                {r.nextServiceOn ? (
                  <span className={r.serviceOverdueDays && r.serviceOverdueDays > 0 ? "text-danger" : ""}>
                    {formatDate(r.nextServiceOn)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">مفيش خطة</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">
        الجاهزية = (الزمن المخطط − التوقف) ÷ المخطط، والزمن المخطط من دقايق الماكينة في اليوم × أيام العمل.
        {s.opCoveragePct === null
          ? " ونسبة التشغيل محتاجة عمليات مسجّلة على الماكينة."
          : ` ونسبة التشغيل محسوبة من ${qty(s.opCoveragePct, 0)}٪ من العمليات اللي اتسجّلت وعليها ماكينة.`}
      </p>
    </Card>
  );
}

/* ── التذاكر ──────────────────────────────────────────────────── */

function Tickets() {
  const { db, can, startTicket, cancelTicket } = useFactory();
  const rows = useMemo(() => ticketList(db), [db]);
  const [closing, setClosing] = useState<string | null>(null);

  if (!rows.length) {
    return (
      <EmptyState
        icon={Wrench}
        title="مفيش تذاكر صيانة"
        body="التذكرة هي اللي بتحوّل «الماكينة واقفة» من كلام لوقت وتكلفة. افتح واحدة أول عطل."
      />
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <Card key={r.ticket.id}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="tabular">{r.ticket.code}</span>
                <Badge tone={r.ticket.kind === "breakdown" ? "danger" : "gold"}>{TICKET_KIND_LABEL[r.ticket.kind]}</Badge>
                <Badge
                  tone={
                    r.ticket.state === "done" ? "ok" : r.ticket.state === "cancelled" ? "muted" : r.ticket.state === "working" ? "warn" : "danger"
                  }
                >
                  {TICKET_STATE_LABEL[r.ticket.state]}
                </Badge>
              </div>
              <p className="mt-1 text-sm">
                <Link to={`/machines/${r.ticket.machineId}`} className="underline-offset-4 hover:underline">
                  {r.machineCode} — {r.machineName}
                </Link>
                {r.line ? <span className="text-muted-foreground"> · {r.line}</span> : null}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.ticket.cause || "من غير سبب مكتوب"} · بلاغ {formatDate(r.ticket.reportedOn)} · {r.technician}
              </p>
              {r.ticket.action ? <p className="mt-1 text-xs text-muted-foreground">اللي اتعمل: {r.ticket.action}</p> : null}
            </div>
            <div className="shrink-0 text-end">
              <p className="text-sm tabular">{qty(r.downMinutes / 60, 1)} ساعة توقف</p>
              <p className="text-xs text-muted-foreground tabular">تكلفة {qty(r.cost, 0)}</p>
              {r.responseHours !== null ? (
                <p className="text-xs text-muted-foreground">بدأ بعد {qty(r.responseHours, 1)} ساعة</p>
              ) : null}
            </div>
          </div>

          {can.do("machines", "edit") && r.ticket.state !== "done" && r.ticket.state !== "cancelled" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {r.ticket.state === "open" ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    try {
                      startTicket(r.ticket.id);
                      toast.success("الإصلاح بدأ — الوقت بيتحسب من دلوقتي.");
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  ابدأ الإصلاح
                </Button>
              ) : null}
              <Button variant="gold" onClick={() => setClosing(r.ticket.id)}>
                اقفل التذكرة
              </Button>
              <Button
                variant="dangerGhost"
                onClick={() => {
                  const reason = window.prompt("سبب الإلغاء؟");
                  if (!reason) return;
                  try {
                    cancelTicket(r.ticket.id, reason);
                    toast.success("التذكرة اتلغت والماكينة رجعت للخدمة.");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                إلغاء
              </Button>
            </div>
          ) : null}
        </Card>
      ))}
      {closing ? <ClosePanel ticketId={closing} onClose={() => setClosing(null)} /> : null}
    </div>
  );
}

/* ── أسباب التوقف ─────────────────────────────────────────────── */

function Downtime() {
  const { db } = useFactory();
  const range = useMemo(() => defaultRange(), []);
  const causes = useMemo(() => downtimeCauses(db, range), [db, range]);
  const lines = useMemo(() => downtimeByLine(db, range), [db, range]);

  if (!causes.length) {
    return (
      <EmptyState
        icon={Wrench}
        title="مفيش توقف مسجّل في ٣٠ يوم"
        body="لما تذكرة تتقفل بسبب مكتوب، السبب ده بيتراكم هنا — فتعرف أكتر حاجة بتوقّف المصنع، مش أكتر حاجة بتتكلم عنها."
      />
    );
  }

  return (
    <div className="space-y-3">
      <Card className="overflow-x-auto">
        <p className="mb-2 text-sm">أكتر أسباب التوقف</p>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="p-2 text-start">السبب</th>
              <th className="p-2 text-end">مرات</th>
              <th className="p-2 text-end">ساعات</th>
              <th className="p-2 text-end">نسبة</th>
              <th className="p-2 text-end">تراكمي</th>
              <th className="p-2 text-end">تكلفة</th>
            </tr>
          </thead>
          <tbody>
            {causes.map((c) => (
              <tr key={c.cause} className="border-t border-border/60">
                <td className="p-2">{c.cause}</td>
                <td className="p-2 text-end tabular">{qty(c.count, 0)}</td>
                <td className="p-2 text-end tabular">{qty(c.minutes / 60, 1)}</td>
                <td className="p-2 text-end tabular">{qty(c.sharePct, 0)}٪</td>
                <td className="p-2 text-end tabular">{qty(c.cumulativePct, 0)}٪</td>
                <td className="p-2 text-end tabular">{qty(c.cost, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs leading-6 text-muted-foreground">
          العمود التراكمي هو اللي بيقول تقفل كام سبب عشان تشيل معظم التوقف — عادةً سببين أو تلاتة.
        </p>
      </Card>

      <Card className="overflow-x-auto">
        <p className="mb-2 text-sm">التوقف على الخطوط</p>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="p-2 text-start">الخط</th>
              <th className="p-2 text-end">ماكينات</th>
              <th className="p-2 text-end">تذاكر</th>
              <th className="p-2 text-end">ساعات توقف</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.line} className="border-t border-border/60">
                <td className="p-2">{l.line}</td>
                <td className="p-2 text-end tabular">{qty(l.machines, 0)}</td>
                <td className="p-2 text-end tabular">{qty(l.tickets, 0)}</td>
                <td className="p-2 text-end tabular">{qty(l.minutes / 60, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs leading-6 text-muted-foreground">
          الخط اللي بيوقف كتير بيبان في التخطيط كتأخير بلا سبب — الجدول ده هو السبب.
        </p>
      </Card>
    </div>
  );
}

/* ── الصيانة الجاية ───────────────────────────────────────────── */

function Plan() {
  const { db, can } = useFactory();
  const due = useMemo(() => serviceDue(db, 30), [db]);
  const noPlan = useMemo(() => machineList(db).filter((r) => !r.nextServiceOn && r.machine.state !== "retired"), [db]);
  const [ticketFor, setTicketFor] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <Card>
        <p className="mb-2 text-sm">صيانة مستحقة أو جاية في ٣٠ يوم</p>
        {due.length ? (
          <ul className="space-y-2">
            {due.map((d) => (
              <li key={d.row.machine.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-2.5">
                <div className="min-w-0">
                  <p className="text-sm">
                    {d.row.machine.code} — {d.row.machine.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    كل {qty(d.row.machine.serviceEveryDays, 0)} يوم · آخر صيانة{" "}
                    {d.row.machine.lastServiceOn ? formatDate(d.row.machine.lastServiceOn) : "مش مسجّلة"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={d.inDays < 0 ? "danger" : d.inDays <= 7 ? "warn" : "muted"}>
                    {d.inDays < 0 ? `فات بـ${qty(-d.inDays, 0)} يوم` : d.inDays === 0 ? "النهارده" : `بعد ${qty(d.inDays, 0)} يوم`}
                  </Badge>
                  {can.do("machines", "create") ? (
                    <Button variant="outline" onClick={() => setTicketFor(d.row.machine.id)}>
                      افتح تذكرة صيانة
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">مفيش صيانة مستحقة في الشهر الجاي.</p>
        )}
      </Card>

      {noPlan.length ? (
        <Card>
          <p className="text-sm">
            {noPlan.length === 1 ? "ماكينة واحدة من غير خطة صيانة" : `${qty(noPlan.length, 0)} ماكينات من غير خطة صيانة`}
          </p>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            الماكينة من غير خطة مابتظهرش كأنها متأخرة — هي ماعندهاش ميعاد أصلًا. حدّد «كل كام يوم» وتاريخ آخر صيانة
            فالميعاد يبدأ يتحسب لوحده:{" "}
            {noPlan
              .slice(0, 4)
              .map((r) => r.machine.code)
              .join(" · ")}
          </p>
        </Card>
      ) : null}

      {ticketFor ? <TicketPanel machineId={ticketFor} kind="service" onClose={() => setTicketFor(null)} /> : null}
    </div>
  );
}

/* ── إضافة ماكينة ─────────────────────────────────────────────── */

export function MachinePanel({ onClose, editId }: { onClose: () => void; editId?: string }) {
  const { db, addMachine, updateMachine } = useFactory();
  const editing = editId ? (db.machines ?? []).find((m) => m.id === editId) ?? null : null;
  const [name, setName] = useState(editing?.name ?? "");
  const [kind, setKind] = useState<MachineKind>(editing?.kind ?? "sewing");
  const [brand, setBrand] = useState(editing?.brand ?? "");
  const [serial, setSerial] = useState(editing?.serial ?? "");
  const [line, setLine] = useState(editing?.line ?? "");
  const [warehouseId, setWarehouseId] = useState(editing?.warehouseId ?? "");
  const [dailyMinutes, setDailyMinutes] = useState(String(editing?.dailyMinutes ?? 480));
  const [serviceEveryDays, setServiceEveryDays] = useState(String(editing?.serviceEveryDays ?? 90));
  const [lastServiceOn, setLastServiceOn] = useState(editing?.lastServiceOn ?? "");
  const [boughtOn, setBoughtOn] = useState(editing?.boughtOn ?? "");
  const [cost, setCost] = useState(editing ? String(editing.cost) : "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [busy, setBusy] = useState(false);

  const lines = useMemo(() => {
    const used = new Set<string>([...db.orders.map((o) => o.line), ...PRODUCTION_LINES]);
    return [...used].filter(Boolean);
  }, [db.orders]);

  const save = () => {
    setBusy(true);
    try {
      const input = {
        name,
        kind,
        brand,
        serial,
        line,
        warehouseId: warehouseId || null,
        boughtOn: boughtOn || null,
        cost: Number(cost) || 0,
        dailyMinutes: Number(dailyMinutes) || 0,
        serviceEveryDays: Number(serviceEveryDays) || 0,
        lastServiceOn: lastServiceOn || null,
        notes,
      };
      if (editing) {
        updateMachine(editing.id, { ...input, name: input.name.trim(), notes: input.notes.trim() });
        toast.success("بيانات الماكينة اتحدّثت.");
      } else {
        addMachine(input);
        toast.success("الماكينة اتسجّلت، وكودها بيتطبع من مركز الليبلات.");
      }
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      open
      title={editing ? `تعديل ${editing.code}` : "ماكينة جديدة"}
      onClose={onClose}
      footer={
        <Button variant="gold" className="w-full" disabled={busy || !name.trim()} onClick={save}>
          {editing ? "حفظ التعديل" : "سجّل الماكينة"}
        </Button>
      }
    >
      <Field label="اسم الماكينة">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="سنجر مستقيمة ٣" />
      </Field>
      <Field label="النوع">
        <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as MachineKind)}>
          {MACHINE_KINDS.map((k) => (
            <option key={k} value={k}>
              {MACHINE_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="الخط">
        <select className={selectClass} value={line} onChange={(e) => setLine(e.target.value)}>
          <option value="">مش على خط</option>
          {lines.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="المكان">
        <select className={selectClass} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
          <option value="">مش محدّد</option>
          {db.warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="الماركة">
          <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Juki" />
        </Field>
        <Field label="السيريال">
          <Input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="JK-88123" />
        </Field>
      </div>
      <Field label="دقايق التشغيل في اليوم">
        <Input type="number" inputMode="numeric" value={dailyMinutes} onChange={(e) => setDailyMinutes(e.target.value)} />
      </Field>
      <p className="mb-3 text-xs leading-6 text-muted-foreground">
        الرقم ده أساس الجاهزية: التوقف بيتقسم عليه. لو حطيته غلط، النسبة بتطلع غلط — فحطّه زي الوردية الحقيقية.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="صيانة دورية كل (يوم)">
          <Input type="number" inputMode="numeric" value={serviceEveryDays} onChange={(e) => setServiceEveryDays(e.target.value)} />
        </Field>
        <Field label="آخر صيانة">
          <Input type="date" value={lastServiceOn} onChange={(e) => setLastServiceOn(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="تاريخ الشراء">
          <Input type="date" value={boughtOn} onChange={(e) => setBoughtOn(e.target.value)} />
        </Field>
        <Field label="سعر الشراء">
          <Input type="number" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
      </div>
      <Field label="ملاحظات">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>
    </Panel>
  );
}

/* ── فتح تذكرة ────────────────────────────────────────────────── */

export function TicketPanel({
  machineId: fixed,
  kind: fixedKind,
  issueId,
  onClose,
}: {
  machineId?: string;
  kind?: "breakdown" | "service";
  issueId?: string | null;
  onClose: () => void;
}) {
  const { db, openTicket } = useFactory();
  const [machineId, setMachineId] = useState(fixed ?? "");
  const [kind, setKind] = useState<"breakdown" | "service">(fixedKind ?? "breakdown");
  const [reportedOn, setReportedOn] = useState(cairoToday());
  const [cause, setCause] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [partyId, setPartyId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const workshops = useMemo(() => {
    const byRole = [...partiesWithRole(db, "maintenance"), ...partiesWithRole(db, "workshop")];
    return byRole.filter((p, i, all) => all.findIndex((x) => x.id === p.id) === i);
  }, [db]);

  const save = () => {
    setBusy(true);
    try {
      openTicket({
        machineId,
        kind,
        reportedOn,
        cause,
        workerId: workerId || null,
        partyId: partyId || null,
        issueId: issueId ?? null,
        notes,
      });
      toast.success(kind === "breakdown" ? "التذكرة اتفتحت والماكينة بقت عطلانة." : "تذكرة صيانة اتفتحت.");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      open
      title={kind === "breakdown" ? "بلاغ عطل" : "تذكرة صيانة"}
      onClose={onClose}
      footer={
        <Button variant="gold" className="w-full" disabled={busy || !machineId || !cause.trim()} onClick={save}>
          افتح التذكرة
        </Button>
      }
    >
      <Field label="الماكينة">
        <select className={selectClass} value={machineId} onChange={(e) => setMachineId(e.target.value)} disabled={!!fixed}>
          <option value="">اختار الماكينة</option>
          {(db.machines ?? [])
            .filter((m) => m.state !== "retired")
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} — {m.name}
                {m.line ? ` (${m.line})` : ""}
              </option>
            ))}
        </select>
      </Field>
      <Field label="النوع">
        <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as "breakdown" | "service")}>
          <option value="breakdown">{TICKET_KIND_LABEL.breakdown}</option>
          <option value="service">{TICKET_KIND_LABEL.service}</option>
        </select>
      </Field>
      <Field label="تاريخ البلاغ">
        <Input type="date" value={reportedOn} onChange={(e) => setReportedOn(e.target.value)} />
      </Field>
      <Field label={kind === "breakdown" ? "العطل إيه؟" : "سبب الصيانة"}>
        <Input value={cause} onChange={(e) => setCause(e.target.value)} placeholder="قطع خيط متكرر" />
      </Field>
      <p className="mb-3 text-xs leading-6 text-muted-foreground">
        اكتب السبب بنفس الكلمات كل مرة. السبب المكرّر هو اللي بيطلع في باريتو التوقف — و«عطل» لوحدها ماتقولش حاجة.
      </p>
      <Field label="الفني الداخلي">
        <select className={selectClass} value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
          <option value="">لسه محدش</option>
          {db.workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="أو ورشة خارجية">
        <select className={selectClass} value={partyId} onChange={(e) => setPartyId(e.target.value)}>
          <option value="">مفيش</option>
          {workshops.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="ملاحظات">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>
      <p className="text-xs leading-6 text-muted-foreground">
        فتح التذكرة <span className="text-foreground">بيوقّف الماكينة فعلًا</span> في النظام: حالتها بتتغيّر، ووقت
        التوقف يبدأ يجري من دلوقتي.
      </p>
    </Panel>
  );
}

/* ── إقفال تذكرة ──────────────────────────────────────────────── */

export function ClosePanel({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const { db, closeTicket } = useFactory();
  const ticket = (db.machineTickets ?? []).find((t) => t.id === ticketId);
  const [action, setAction] = useState("");
  // دقايق التوقف بتتقرا من الساعة مرة واحدة أول ما اللوحة تفتح. لو
  // اتقرأت في كل رسم، الرقم كان بيتحرّك تحت إيد الفني وهو بيعدّله
  const startedAt = ticket?.startedAt ?? null;
  const [downMinutes, setDownMinutes] = useState(() =>
    startedAt ? String(Math.round(Math.max(0, (Date.now() - Date.parse(startedAt)) / 60_000))) : "",
  );

  const [laborCost, setLaborCost] = useState("");
  const [outsideCost, setOutsideCost] = useState("");
  const [partId, setPartId] = useState("");
  const [partQty, setPartQty] = useState("");
  const [parts, setParts] = useState<{ materialId: string; qty: number }[]>([]);
  const [serviceDone, setServiceDone] = useState(ticket?.kind === "service");
  const [busy, setBusy] = useState(false);

  if (!ticket) return null;

  const addPart = () => {
    const q = Number(partQty);
    if (!partId || !(q > 0)) return;
    setParts((p) => [...p, { materialId: partId, qty: q }]);
    setPartId("");
    setPartQty("");
  };

  const save = () => {
    setBusy(true);
    try {
      closeTicket(ticketId, {
        action,
        downMinutes: Number(downMinutes) || 0,
        laborCost: Number(laborCost) || 0,
        outsideCost: Number(outsideCost) || 0,
        parts,
        serviceDone,
      });
      toast.success("التذكرة اتقفلت، وقطع الغيار خرجت من المخزن.");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      open
      title={`إقفال ${ticket.code}`}
      onClose={onClose}
      footer={
        <Button variant="gold" className="w-full" disabled={busy || !action.trim()} onClick={save}>
          اقفل التذكرة
        </Button>
      }
    >
      <Field label="اللي اتعمل">
        <Textarea value={action} onChange={(e) => setAction(e.target.value)} rows={2} placeholder="تغيير السير وضبط الشد" />
      </Field>
      <Field label="دقايق التوقف">
        <Input type="number" inputMode="numeric" value={downMinutes} onChange={(e) => setDownMinutes(e.target.value)} />
      </Field>
      <p className="mb-3 text-xs leading-6 text-muted-foreground">
        {startedAt
          ? "الرقم مقترح من الساعة — من وقت بدء الإصلاح للحظة ما فتحت اللوحة. عدّله لو الماكينة وقفت قبل ما حد يفتح تذكرة."
          : "التذكرة دي محدش بدأ فيها، فمفيش وقت محسوب من الساعة — اكتب دقايق التوقف بنفسك."}
      </p>

      <p className="mb-1.5 text-sm">قطع الغيار</p>
      <p className="mb-2 text-xs leading-6 text-muted-foreground">
        القطعة بتخرج من المخزن بحركة حقيقية، فرصيدها بيقل وتكلفتها بتطلع من الدفتر — مش رقم بيتكتب بالإيد.
      </p>
      <div className="mb-2 grid grid-cols-[1fr_auto_auto] gap-2">
        <select className={selectClass} value={partId} onChange={(e) => setPartId(e.target.value)}>
          <option value="">اختار خامة</option>
          {db.materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <Input
          className="w-24"
          type="number"
          inputMode="decimal"
          value={partQty}
          onChange={(e) => setPartQty(e.target.value)}
          placeholder="كمية"
        />
        <Button variant="outline" onClick={addPart}>
          ضيف
        </Button>
      </div>
      {parts.length ? (
        <ul className="mb-3 space-y-1 text-sm">
          {parts.map((p, i) => (
            <li key={`${p.materialId}-${i}`} className="flex items-center justify-between rounded-md border border-border/60 px-2.5 py-1.5">
              <span>
                {db.materials.find((m) => m.id === p.materialId)?.name} × {qty(p.qty, 2)}
              </span>
              <Button variant="ghost" onClick={() => setParts((all) => all.filter((_, j) => j !== i))}>
                شيل
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="أجر الفني">
          <Input type="number" inputMode="decimal" value={laborCost} onChange={(e) => setLaborCost(e.target.value)} />
        </Field>
        <Field label="فاتورة ورشة خارجية">
          <Input type="number" inputMode="decimal" value={outsideCost} onChange={(e) => setOutsideCost(e.target.value)} />
        </Field>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={serviceDone} onChange={(e) => setServiceDone(e.target.checked)} />
        <span>
          احسبها صيانة دورية كاملة
          <span className="mt-0.5 block text-xs text-muted-foreground">
            لو علّمت، تاريخ آخر صيانة بيتحدّث فميعاد الصيانة الجاي بيتحرّك.
          </span>
        </span>
      </label>
    </Panel>
  );
}
