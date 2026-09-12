import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Wrench } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DocumentButton } from "@/components/docs/DocumentPrint";
import { formatDate, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { defaultRange, machineRow, ticketCost, ticketList, ticketParts, workDaysIn } from "@/store/machines";
import { ClosePanel, MachinePanel, TicketPanel } from "./MachinesPage";
import {
  MACHINE_KIND_LABEL,
  MACHINE_STATE_LABEL,
  TICKET_KIND_LABEL,
  TICKET_STATE_LABEL,
  type MachineState,
} from "@/store/types";

/**
 * ملف الماكينة.
 *
 * كود الماكينة بيتمسح من الموبايل وهو واقف جنبها، فالصفحة دي هي **اللي
 * الكود بيفتح عليها**: حالتها دلوقتي، تاريخ أعطالها بأسبابها، قطع الغيار
 * اللي خرجت لها من المخزن، وتكلفتها الكلية — وزر بلاغ عطل في المقدمة،
 * لأن اللي بيمسح الكود غالبًا بيمسحه لأن فيها حاجة.
 */

const STATE_TONE: Record<MachineState, "ok" | "muted" | "warn" | "danger"> = {
  running: "ok",
  idle: "muted",
  maintenance: "warn",
  down: "danger",
  retired: "muted",
};

export function MachineProfilePage() {
  const { id = "" } = useParams();
  const { db, can, updateMachine, retireMachine, startTicket } = useFactory();
  const [ticketOpen, setTicketOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);

  const machine = (db.machines ?? []).find((m) => m.id === id) ?? null;
  const range = useMemo(() => defaultRange(), []);
  const row = useMemo(() => (machine ? machineRow(db, machine, range) : null), [db, machine, range]);
  const tickets = useMemo(() => (machine ? ticketList(db, { machineId: machine.id }) : []), [db, machine]);
  const days = workDaysIn(db, range);

  if (!can.do("machines", "view")) {
    return <EmptyState icon={Wrench} title="محتاج صلاحية الصيانة" body="ملف الماكينة فيه تكلفة الأعطال، فمحتاج صلاحية." />;
  }

  if (!machine || !row) {
    return (
      <EmptyState
        icon={Wrench}
        title="الماكينة مش موجودة"
        body="الكود ده مش لماكينة مسجّلة. يمكن اتشالت من النظام أو الكود اتكتب غلط — ارجع لقايمة الماكينات."

      />
    );
  }

  const open = tickets.find((t) => t.ticket.state === "open" || t.ticket.state === "working");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl">{machine.name}</h2>
            <Badge tone={STATE_TONE[machine.state]}>{MACHINE_STATE_LABEL[machine.state]}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {machine.code} · {MACHINE_KIND_LABEL[machine.kind]}
            {machine.line ? ` · ${machine.line}` : " · مش على خط"}
            {machine.brand ? ` · ${machine.brand}` : ""}
            {machine.serial ? ` · ${machine.serial}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {can.do("machines", "edit") ? (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              تعديل
            </Button>
          ) : null}
          {can.do("machines", "create") && machine.state !== "retired" ? (
            <Button variant="gold" onClick={() => setTicketOpen(true)}>
              بلاغ عطل
            </Button>
          ) : null}
        </div>
      </div>

      {open ? (
        <Card className="border-r-2 border-r-danger">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm">
                {open.ticket.code} · {TICKET_KIND_LABEL[open.ticket.kind]} · {TICKET_STATE_LABEL[open.ticket.state]}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {open.ticket.cause} · واقفة {qty(open.downMinutes / 60, 1)} ساعة · {open.technician}
              </p>
            </div>
            {can.do("machines", "edit") ? (
              <div className="flex shrink-0 gap-2">
                {open.ticket.state === "open" ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      try {
                        startTicket(open.ticket.id);
                        toast.success("الإصلاح بدأ.");
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    ابدأ الإصلاح
                  </Button>
                ) : null}
                <Button variant="gold" onClick={() => setClosing(open.ticket.id)}>
                  اقفل
                </Button>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-muted-foreground">ساعات توقف — ٣٠ يوم</p>
          <p className="mt-1 text-2xl tabular">{qty(row.downMinutes / 60, 1)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            من {qty(row.plannedMinutes / 60, 0)} ساعة مخططة ({qty(days, 0)} يوم عمل)
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">الجاهزية</p>
          <p className="mt-1 text-2xl tabular">{row.plannedMinutes > 0 ? `${qty(row.availabilityPct, 1)}٪` : "—"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.utilizationPct === null
              ? "نسبة التشغيل محتاجة عمليات مسجّلة على الماكينة"
              : `نسبة التشغيل ${qty(row.utilizationPct, 0)}٪ · ${qty(row.output, 0)} قطعة`}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">بتعطل كل</p>
          <p className="mt-1 text-2xl tabular">{row.mtbfHours === null ? "—" : `${qty(row.mtbfHours, 0)} ساعة`}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.mttrHours === null ? "مفيش عطل اتقفل بعد" : `والإصلاح بياخد ${qty(row.mttrHours, 1)} ساعة في المتوسط`}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">تكلفة الصيانة</p>
          <Money className="mt-1 text-2xl" value={row.cost.total} />
          <p className="mt-1 text-xs text-muted-foreground">
            قطع {qty(row.cost.parts, 0)} · أجر {qty(row.cost.labor, 0)} · ورشة {qty(row.cost.outside, 0)}
          </p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm">الصيانة الدورية</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {machine.serviceEveryDays > 0
                ? `كل ${qty(machine.serviceEveryDays, 0)} يوم · آخر صيانة ${
                    machine.lastServiceOn ? formatDate(machine.lastServiceOn) : "مش مسجّلة"
                  }`
                : "مفيش خطة صيانة — حدّد «كل كام يوم» من التعديل، فالميعاد يبدأ يتحسب لوحده"}
            </p>
          </div>
          {row.nextServiceOn ? (
            <Badge tone={row.serviceOverdueDays && row.serviceOverdueDays > 0 ? "danger" : "muted"}>
              {row.serviceOverdueDays && row.serviceOverdueDays > 0
                ? `فاتت بـ${qty(row.serviceOverdueDays, 0)} يوم`
                : `الجاية ${formatDate(row.nextServiceOn)}`}
            </Badge>
          ) : null}
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-sm">تاريخ الأعطال والصيانة</p>
        {tickets.length ? (
          <ul className="space-y-2">
            {tickets.map((t) => {
              const parts = ticketParts(db, t.ticket.id);
              const cost = ticketCost(db, t.ticket);
              return (
                <li key={t.ticket.id} className="rounded-md border border-border/60 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm tabular">{t.ticket.code}</span>
                        <Badge tone={t.ticket.kind === "breakdown" ? "danger" : "gold"}>
                          {TICKET_KIND_LABEL[t.ticket.kind]}
                        </Badge>
                        <Badge tone={t.ticket.state === "done" ? "ok" : t.ticket.state === "cancelled" ? "muted" : "warn"}>
                          {TICKET_STATE_LABEL[t.ticket.state]}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(t.ticket.reportedOn)} · {t.ticket.cause || "من غير سبب مكتوب"} · {t.technician}
                      </p>
                      {t.ticket.action ? <p className="mt-1 text-xs">{t.ticket.action}</p> : null}
                      {parts.length ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          قطع غيار: {parts.map((p) => `${p.name} × ${qty(p.qty, 2)}`).join(" · ")}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-end">
                      <p className="text-sm tabular">{qty(t.downMinutes / 60, 1)} ساعة</p>
                      <p className="text-xs text-muted-foreground tabular">{qty(cost.total, 0)} ج.م.</p>
                      <div className="mt-1">
                        <DocumentButton type="maintenance" refId={t.ticket.id} />
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">مفيش تذاكر على الماكينة دي.</p>
        )}
      </Card>

      {machine.state !== "retired" && can.do("machines", "edit") ? (
        <Card>
          <p className="text-sm">خروج من الخدمة</p>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            الماكينة مابتتمسحش: خروجها من الخدمة قرار بسبب مكتوب، وتاريخها وتذاكرها بيفضلوا في السجل — لأن التكلفة اللي
            اتصرفت عليها حصلت فعلًا.
          </p>
          <Button
            variant="dangerGhost"
            className="mt-2"
            onClick={() => {
              const reason = window.prompt("سبب خروجها من الخدمة؟");
              if (!reason) return;
              try {
                retireMachine(machine.id, reason);
                toast.success("الماكينة بقت خارج الخدمة.");
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            خروج من الخدمة
          </Button>
        </Card>
      ) : null}

      {machine.state === "retired" && can.do("machines", "edit") ? (
        <Card>
          <p className="text-sm">رجّعها للخدمة</p>
          <Button
            variant="outline"
            className="mt-2"
            onClick={() => {
              try {
                updateMachine(machine.id, { state: "idle", dailyMinutes: machine.dailyMinutes || 480 });
                toast.success("الماكينة رجعت للخدمة.");
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            رجّعها
          </Button>
        </Card>
      ) : null}

      {ticketOpen ? <TicketPanel machineId={machine.id} onClose={() => setTicketOpen(false)} /> : null}
      {editOpen ? <EditMachine id={machine.id} onClose={() => setEditOpen(false)} /> : null}
      {closing ? <ClosePanel ticketId={closing} onClose={() => setClosing(null)} /> : null}
    </div>
  );
}

/**
 * التعديل بيستخدم نفس لوحة الإضافة بقيم الماكينة.
 *
 * ونفس القاعدة: الحالة مابتتغيّرش من هنا وفيها تذكرة مفتوحة — التذكرة
 * هي اللي بتحكم الحالة، عشان التوقف يفضل محسوب.
 */
function EditMachine({ id, onClose }: { id: string; onClose: () => void }) {
  return <MachinePanel onClose={onClose} editId={id} />;
}
