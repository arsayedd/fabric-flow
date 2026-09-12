/**
 * صنعة — الماكينات والصيانة (M-M1)
 *
 * الموديول ده مش «كشف أصول». الأصول بتتحسب مرة في السنة، والماكينة
 * بتوقف النهارده. فالسؤال اللي الملف ده بيجاوبه هو:
 *
 *   * الخط وقف قد إيه، وبسبب أنهي ماكينة؟
 *   * التوقف ده كلّفني كام — قطع غيار وأجر فني وورشة خارجية؟
 *   * الماكينة دي بتعطل كل قد إيه (MTBF)، وبتقعد قد إيه لحد ما تتصلح (MTTR)؟
 *   * أنهي ماكينة صيانتها الدورية فاتت ميعادها؟
 *
 * وقواعد الحساب:
 *
 *  1) **الزمن المخطط من إعداد الطاقة، مش من رقم متخزّن.** دقايق اليوم
 *     على الماكينة × أيام العمل في الفترة (نفس تقويم `planning.ts`) —
 *     فلو المصنع بيشتغل ٦ أيام، الجمعة مابتتحسبش توقف.
 *
 *  2) **الجاهزية ≠ نسبة التشغيل**، والاتنين مكتوبين بأسمائهم:
 *     * **الجاهزية** = (المخطط − التوقف) ÷ المخطط. دي بتتحسب لكل ماكينة
 *       دايمًا، لأن التوقف بيتسجّل في تذكرة.
 *     * **نسبة التشغيل** = دقايق شغل فعلي على الماكينة ÷ المخطط. ودي
 *       بتتحسب **بس** لو العمليات اتسجّلت وعليها ماكينة، وبتطلع `null`
 *       غير كده. اختراع نسبة تشغيل من غير تسجيل كان هيخلّي المصنع يقرر
 *       يشتري ماكينة جديدة على رقم متخيّل.
 *
 *  3) **تكلفة الصيانة من الدفتر.** قطع الغيار حركة مخزون فعلية
 *     (`kind: "maintenance"` على التذكرة)، فالتكلفة مجموع حركات + أجر
 *     الفني + فاتورة الورشة. مفيش «تكلفة صيانة» بتتكتب بالإيد.
 *
 *  4) **تكلفة التوقف نفسه مش محسوبة** — عن قصد. علشان تحسبها محتاج
 *     ربح الدقيقة على الخط ده، والخط بيشتغل موديلات مختلفة بهوامش
 *     مختلفة. الرقم كان هيبقى تقدير ملبّس في هيئة حقيقة.
 */

import { addDays, cairoToday } from "@/lib/utils";
import { opMinutes } from "./floor";
import { capacityOf, isWorkDay, workDaysBetween } from "./planning";
import type { Db, Machine, MachineState, MachineTicket, TicketKind } from "./types";

export type Range = { from: string; to: string };

/** آخر ٣٠ يوم — النطاق الافتراضي لكل أرقام الصيانة */
export function defaultRange(today = cairoToday()): Range {
  return { from: addDays(today, -29), to: today };
}

export function machineById(db: Db, id: string | null | undefined): Machine | null {
  if (!id) return null;
  return (db.machines ?? []).find((m) => m.id === id) ?? null;
}

export function machineTickets(db: Db, machineId: string): MachineTicket[] {
  return (db.machineTickets ?? [])
    .filter((t) => t.machineId === machineId)
    .sort((a, b) => b.reportedOn.localeCompare(a.reportedOn));
}

/** قطع الغيار اللي خرجت على تذكرة — من دفتر المخزون نفسه */
export function ticketParts(db: Db, ticketId: string) {
  return db.stockMovements
    .filter((m) => m.kind === "maintenance" && m.refType === "ticket" && m.refId === ticketId)
    .map((m) => ({
      movementId: m.id,
      materialId: m.itemId,
      name: db.materials.find((x) => x.id === m.itemId)?.name ?? "خامة",
      qty: Math.abs(m.qty),
      unitCost: m.unitCost,
      cost: Math.abs(m.qty) * m.unitCost,
      date: m.date,
    }));
}

export function ticketCost(db: Db, t: MachineTicket) {
  const parts = ticketParts(db, t.id).reduce((s, p) => s + p.cost, 0);
  return { parts, labor: t.laborCost, outside: t.outsideCost, total: parts + t.laborCost + t.outsideCost };
}

const MIN = 60_000;

/**
 * دقايق التوقف اللي تخص الفترة.
 *
 * التذكرة المقفولة بتاخد دقايقها المكتوبة. والتذكرة **المفتوحة الوقت
 * فيها بيجري**: ماكينة واقفة من امبارح ومحدش قفل تذكرتها لازم تبان
 * واقفة، مش صفر. غير كده لوحة التحكم بتكافئ الإهمال.
 */
export function ticketDownMinutes(t: MachineTicket, now = Date.now()): number {
  if (t.state === "cancelled") return 0;
  if (t.state === "done") return Math.max(0, t.downMinutes);
  const start = t.startedAt ? Date.parse(t.startedAt) : Date.parse(`${t.reportedOn}T09:00:00`);
  const live = Number.isNaN(start) ? 0 : Math.max(0, (now - start) / MIN);
  return Math.max(t.downMinutes, live);
}

function inRange(day: string, r: Range) {
  return day >= r.from && day <= r.to;
}

export type MachineRow = {
  machine: Machine;
  lineLabel: string;
  location: string;
  plannedMinutes: number;
  downMinutes: number;
  /** الجاهزية % — دايمًا محسوبة */
  availabilityPct: number;
  /** نسبة التشغيل % — null لو مفيش عمليات مسجّلة على الماكينة */
  utilizationPct: number | null;
  runMinutes: number;
  /** قطع منتجة على الماكينة في الفترة (من العمليات المسجّلة) */
  output: number;
  breakdowns: number;
  services: number;
  openTickets: number;
  /** متوسط الساعات بين عطل وعطل — null لو مفيش أعطال في الفترة */
  mtbfHours: number | null;
  /** متوسط ساعات الإصلاح — null لو مافيش عطل اتقفل */
  mttrHours: number | null;
  cost: { parts: number; labor: number; outside: number; total: number };
  nextServiceOn: string | null;
  /** موجب = فاتت الميعاد بكام يوم */
  serviceOverdueDays: number | null;
};

export function machineRow(db: Db, machine: Machine, range: Range = defaultRange(), now = Date.now()): MachineRow {
  const cap = capacityOf(db);
  const days = workDaysBetween(range.from, range.to, cap.daysPerWeek);
  const active = machine.state !== "retired";
  const plannedMinutes = active ? machine.dailyMinutes * days : 0;

  const tickets = (db.machineTickets ?? []).filter((t) => t.machineId === machine.id && inRange(t.reportedOn, range));
  const live = (db.machineTickets ?? []).filter(
    (t) => t.machineId === machine.id && (t.state === "open" || t.state === "working") && t.reportedOn < range.from,
  );
  const downMinutes = [...tickets, ...live].reduce((s, t) => s + ticketDownMinutes(t, now), 0);

  const ops = (db.bundleOps ?? []).filter(
    (o) => o.machineId === machine.id && o.state === "done" && inRange(o.startedAt.slice(0, 10), range),
  );
  const runMinutes = ops.reduce((s, o) => s + opMinutes(o, now), 0);
  const output = ops.reduce((s, o) => s + o.qtyGood + o.qtyRework, 0);

  const closedBreakdowns = tickets.filter((t) => t.kind === "breakdown" && t.state === "done");
  const breakdowns = tickets.filter((t) => t.kind === "breakdown" && t.state !== "cancelled").length;
  const services = tickets.filter((t) => t.kind === "service" && t.state === "done").length;

  const upMinutes = Math.max(0, plannedMinutes - downMinutes);
  const cost = tickets.reduce(
    (acc, t) => {
      const c = ticketCost(db, t);
      return { parts: acc.parts + c.parts, labor: acc.labor + c.labor, outside: acc.outside + c.outside, total: acc.total + c.total };
    },
    { parts: 0, labor: 0, outside: 0, total: 0 },
  );

  const nextServiceOn =
    machine.serviceEveryDays > 0 && machine.lastServiceOn ? addDays(machine.lastServiceOn, machine.serviceEveryDays) : null;

  return {
    machine,
    lineLabel: machine.line || "مش على خط",
    location: db.warehouses.find((w) => w.id === machine.warehouseId)?.name ?? "—",
    plannedMinutes,
    downMinutes,
    availabilityPct: plannedMinutes > 0 ? Math.max(0, (upMinutes / plannedMinutes) * 100) : 0,
    utilizationPct: plannedMinutes > 0 && ops.length ? (runMinutes / plannedMinutes) * 100 : null,
    runMinutes,
    output,
    breakdowns,
    services,
    openTickets: (db.machineTickets ?? []).filter(
      (t) => t.machineId === machine.id && (t.state === "open" || t.state === "working"),
    ).length,
    mtbfHours: breakdowns > 0 ? upMinutes / breakdowns / 60 : null,
    mttrHours: closedBreakdowns.length ? closedBreakdowns.reduce((s, t) => s + t.downMinutes, 0) / closedBreakdowns.length / 60 : null,
    cost,
    nextServiceOn,
    serviceOverdueDays: nextServiceOn ? Math.round((Date.parse(cairoToday()) - Date.parse(nextServiceOn)) / 86_400_000) : null,
  };
}

export function machineList(db: Db, range: Range = defaultRange(), now = Date.now()): MachineRow[] {
  return (db.machines ?? [])
    .map((m) => machineRow(db, m, range, now))
    .sort((a, b) => {
      const rank = (r: MachineRow) => (r.machine.state === "down" ? 0 : r.machine.state === "maintenance" ? 1 : r.machine.state === "retired" ? 3 : 2);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return b.downMinutes - a.downMinutes;
    });
}

export type MachineSummary = {
  total: number;
  byState: Record<MachineState, number>;
  openTickets: number;
  downMinutes: number;
  downHours: number;
  availabilityPct: number | null;
  cost: number;
  overdueServices: MachineRow[];
  /** أكتر ماكينة وقّفت وقت في الفترة */
  worst: MachineRow | null;
  /** نسبة العمليات اللي اتسجّلت وعليها ماكينة — تغطية نسبة التشغيل */
  opCoveragePct: number | null;
};

export function machineSummary(db: Db, range: Range = defaultRange(), now = Date.now()): MachineSummary {
  const rows = machineList(db, range, now);
  const byState = { running: 0, idle: 0, maintenance: 0, down: 0, retired: 0 } as Record<MachineState, number>;
  for (const r of rows) byState[r.machine.state] += 1;

  const planned = rows.reduce((s, r) => s + r.plannedMinutes, 0);
  const down = rows.reduce((s, r) => s + r.downMinutes, 0);
  const ops = (db.bundleOps ?? []).filter((o) => o.state === "done" && inRange(o.startedAt.slice(0, 10), range));
  const tagged = ops.filter((o) => o.machineId).length;

  return {
    total: rows.length,
    byState,
    openTickets: (db.machineTickets ?? []).filter((t) => t.state === "open" || t.state === "working").length,
    downMinutes: down,
    downHours: down / 60,
    availabilityPct: planned > 0 ? Math.max(0, ((planned - down) / planned) * 100) : null,
    cost: rows.reduce((s, r) => s + r.cost.total, 0),
    overdueServices: rows.filter((r) => r.serviceOverdueDays !== null && r.serviceOverdueDays > 0 && r.machine.state !== "retired"),
    worst: rows.filter((r) => r.downMinutes > 0).sort((a, b) => b.downMinutes - a.downMinutes)[0] ?? null,
    opCoveragePct: ops.length ? (tagged / ops.length) * 100 : null,
  };
}

/** باريتو أسباب التوقف: أكتر سبب وقّف المصنع وقت، وبكام */
export function downtimeCauses(db: Db, range: Range = defaultRange(), now = Date.now()) {
  const map = new Map<string, { cause: string; minutes: number; count: number; cost: number }>();
  for (const t of db.machineTickets ?? []) {
    if (!inRange(t.reportedOn, range) || t.state === "cancelled") continue;
    const cause = (t.cause || "من غير سبب مكتوب").trim();
    const row = map.get(cause) ?? { cause, minutes: 0, count: 0, cost: 0 };
    row.minutes += ticketDownMinutes(t, now);
    row.count += 1;
    row.cost += ticketCost(db, t).total;
    map.set(cause, row);
  }
  const rows = [...map.values()].sort((a, b) => b.minutes - a.minutes);
  const total = rows.reduce((s, r) => s + r.minutes, 0);
  let run = 0;
  return rows.map((r) => {
    run += r.minutes;
    return { ...r, sharePct: total > 0 ? (r.minutes / total) * 100 : 0, cumulativePct: total > 0 ? (run / total) * 100 : 0 };
  });
}

/** توقف كل خط إنتاج — بيوصّل الصيانة بالتخطيط */
export function downtimeByLine(db: Db, range: Range = defaultRange(), now = Date.now()) {
  const map = new Map<string, { line: string; minutes: number; machines: number; tickets: number }>();
  for (const r of machineList(db, range, now)) {
    const key = r.lineLabel;
    const row = map.get(key) ?? { line: key, minutes: 0, machines: 0, tickets: 0 };
    row.minutes += r.downMinutes;
    row.machines += 1;
    row.tickets += r.breakdowns + r.services;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.minutes - a.minutes);
}

export type TicketRow = {
  ticket: MachineTicket;
  machineName: string;
  machineCode: string;
  line: string;
  technician: string;
  downMinutes: number;
  parts: number;
  cost: number;
  /** ساعات من البلاغ للبدء — بيقيس سرعة الاستجابة مش سرعة الإصلاح */
  responseHours: number | null;
};

export function ticketList(db: Db, opts: { machineId?: string; state?: MachineTicket["state"]; kind?: TicketKind } = {}, now = Date.now()): TicketRow[] {
  return (db.machineTickets ?? [])
    .filter((t) => (!opts.machineId || t.machineId === opts.machineId) && (!opts.state || t.state === opts.state) && (!opts.kind || t.kind === opts.kind))
    .sort((a, b) => (b.reportedOn === a.reportedOn ? b.code.localeCompare(a.code) : b.reportedOn.localeCompare(a.reportedOn)))
    .map((t) => {
      const m = machineById(db, t.machineId);
      const c = ticketCost(db, t);
      const reported = Date.parse(`${t.reportedOn}T09:00:00`);
      return {
        ticket: t,
        machineName: m?.name ?? "ماكينة متشالة",
        machineCode: m?.code ?? "—",
        line: m?.line || "—",
        technician:
          db.workers.find((w) => w.id === t.workerId)?.name ??
          db.parties.find((p) => p.id === t.partyId)?.name ??
          "لسه محدش",
        downMinutes: ticketDownMinutes(t, now),
        parts: c.parts,
        cost: c.total,
        responseHours: t.startedAt && !Number.isNaN(reported) ? Math.max(0, (Date.parse(t.startedAt) - reported) / 3_600_000) : null,
      };
    });
}

/** الأعطال المفتوحة اللي الماكينة فيها واقفة دلوقتي — مصدر تنبيه */
export function machinesDownNow(db: Db, now = Date.now()) {
  return (db.machines ?? [])
    .filter((m) => m.state === "down" || m.state === "maintenance")
    .map((m) => {
      const open = machineTickets(db, m.id).find((t) => t.state === "open" || t.state === "working");
      return { machine: m, ticket: open ?? null, downMinutes: open ? ticketDownMinutes(open, now) : 0 };
    })
    .sort((a, b) => b.downMinutes - a.downMinutes);
}

/**
 * الصيانة الجاية: ترتيب باللي فات ميعاده الأول.
 *
 * والماكينة اللي مالهاش خطة **مابتظهرش كأنها متأخرة** — هي ماعندهاش
 * ميعاد أصلًا. اللي بيقول عليها بند في مساعد التجهيز مش تنبيه صيانة.
 */
export function serviceDue(db: Db, withinDays = 14, today = cairoToday()) {
  return machineList(db)
    .filter((r) => r.nextServiceOn && r.machine.state !== "retired")
    .map((r) => ({
      row: r,
      dueOn: r.nextServiceOn as string,
      inDays: Math.round((Date.parse(r.nextServiceOn as string) - Date.parse(today)) / 86_400_000),
    }))
    .filter((x) => x.inDays <= withinDays)
    .sort((a, b) => a.inDays - b.inDays);
}

/** أيام العمل في فترة — الشاشة بتعرضها عشان الزمن المخطط يبقى مفهوم */
export function workDaysIn(db: Db, range: Range) {
  return workDaysBetween(range.from, range.to, capacityOf(db).daysPerWeek);
}

export function isFactoryWorkDay(db: Db, day: string) {
  return isWorkDay(day, capacityOf(db).daysPerWeek);
}
