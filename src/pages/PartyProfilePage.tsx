import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Contact } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Field, Panel } from "@/components/Panel";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, DataRow } from "@/components/ui/card";
import { Input, selectClass } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cairoToday, formatDate, qty } from "@/lib/utils";
import { whatsappReminder } from "@/store/compute";
import { useFactory } from "@/store/context";
import {
  customerScore,
  customerSegments,
  customerStats,
  findDuplicates,
  partyCredit,
  partyTimeline,
  productAffinity,
  purchasePattern,
  SEGMENT_LABEL,
  supplierScore,
  supplierStats,
  type PartyScore,
} from "@/store/parties";
import {
  ADDRESS_KINDS,
  ADDRESS_KIND_LABEL,
  COMM_CHANNELS,
  COMM_CHANNEL_LABEL,
  METHOD_LABEL,
  PARTY_ROLES,
  PARTY_ROLE_LABEL,
  type AddressKind,
  type CommChannel,
  type PartyRole,
} from "@/store/types";
import { CollectPanel } from "./CollectionsPage";

const TABS = ["overview", "account", "timeline", "comms", "info"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  overview: "نظرة عامة",
  account: "كشف الحساب",
  timeline: "الخط الزمني",
  comms: "التواصل والمهام",
  info: "البيانات",
};

function scoreTone(v: number): Tone {
  return v >= 70 ? "ok" : v >= 45 ? "warn" : "danger";
}

export function PartyProfilePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { db, computed, can } = useFactory();
  const [tab, setTab] = useState<Tab>("overview");
  const [delOpen, setDelOpen] = useState(false);
  const [colOpen, setColOpen] = useState(false);

  const party = computed.parties.find((p) => p.id === id);
  if (!party) {
    return (
      <EmptyState
        icon={Contact}
        title="الجهة مش موجودة"
        body="ممكن تكون اتدمجت في سجل تاني أو الرابط غلط."
        action={{ label: "رجوع لجهات التعامل", onClick: () => nav("/parties") }}
      />
    );
  }

  const isCustomer = party.roles.includes("customer");
  const isSupplier = party.roles.includes("supplier") || party.roles.includes("workshop");
  const credit = partyCredit(db, party.id);
  const stats = customerStats(db, party.id);
  const overdue = computed.rec.overdue.filter((r) => r.clientId === party.id);

  return (
    <div className="space-y-4">
      <button onClick={() => nav("/parties")} className="text-sm text-muted-foreground">
        → جهات التعامل
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl">{party.name}</h2>
          <p className="text-sm text-muted-foreground">
            {party.kind === "person" ? "فرد" : "شركة"} · {party.roles.map((r) => PARTY_ROLE_LABEL[r]).join(" · ")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {party.tags.map((t) => (
              <Badge key={t} tone="gold">
                {t}
              </Badge>
            ))}
            {isCustomer &&
              customerSegments(db, party.id).map((s) => (
                <Badge key={s} tone={s === "strategic" || s === "growing" || s === "fast_payer" ? "ok" : "muted"}>
                  {SEGMENT_LABEL[s]}
                </Badge>
              ))}
          </div>
        </div>
        {isCustomer ? (
          <div className="text-left">
            <p className="text-sm text-muted-foreground">الرصيد عليه</p>
            <Money value={party.balance} className="text-xl" />
            {credit.hasLimit ? (
              <p className={credit.overLimit ? "text-xs text-danger" : "text-xs text-muted-foreground"}>
                حد الائتمان {Math.round(credit.limit)} — متاح {Math.round(credit.available)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {can.edit ? (
        <div className="flex flex-wrap gap-2">
          {isCustomer ? (
            <>
              <Button onClick={() => setDelOpen(true)}>توريد</Button>
              <Button variant="gold" onClick={() => setColOpen(true)}>
                تحصيل
              </Button>
            </>
          ) : null}
          {party.phone ? (
            <Button variant="whatsapp" asChild>
              <a
                href={whatsappReminder({
                  name: party.name,
                  amount: party.balance,
                  dueDate: overdue[0]?.dueDate ?? cairoToday(),
                  factoryName: db.factory?.name ?? "",
                  phone: party.whatsapp || party.phone,
                })}
                target="_blank"
                rel="noreferrer"
              >
                واتساب
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {TABS.map((t) => {
          if (t === "account" && !isCustomer && !isSupplier) return null;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                tab === t
                  ? "shrink-0 border-b-2 border-accent px-1 pb-2 text-sm font-medium"
                  : "shrink-0 border-b-2 border-transparent px-1 pb-2 text-sm text-muted-foreground"
              }
            >
              {TAB_LABEL[t]}
            </button>
          );
        })}
      </div>

      {tab === "overview" ? <Overview partyId={party.id} isCustomer={isCustomer} isSupplier={isSupplier} /> : null}
      {tab === "account" ? <AccountTab partyId={party.id} statement={party.statement} isCustomer={isCustomer} /> : null}
      {tab === "timeline" ? <Timeline partyId={party.id} /> : null}
      {tab === "comms" ? <CommsTab partyId={party.id} /> : null}
      {tab === "info" ? <InfoTab partyId={party.id} /> : null}

      <DeliveryPanel
        open={delOpen}
        onClose={() => setDelOpen(false)}
        partyId={party.id}
        termDays={party.paymentTermDays}
      />
      <CollectPanel clientId={colOpen ? party.id : null} onClose={() => setColOpen(false)} />

      {isCustomer && stats.orders === 0 && !can.edit ? (
        <p className="text-sm text-muted-foreground">لسه مفيش حركة على الجهة دي.</p>
      ) : null}
    </div>
  );
}

/* ── 360: المالي والتجاري والإنتاجي والعلاقة ─────────────────── */

function Overview({ partyId, isCustomer, isSupplier }: { partyId: string; isCustomer: boolean; isSupplier: boolean }) {
  const { db, computed } = useFactory();
  const stats = customerStats(db, partyId);
  const sup = supplierStats(db, partyId);
  const credit = partyCredit(db, partyId);
  const score = isCustomer ? customerScore(db, partyId) : supplierScore(db, partyId);
  const pattern = purchasePattern(db, partyId);
  const affinity = productAffinity(db, partyId);
  const alerts = computed.alerts.filter((a) => a.partyId === partyId);

  return (
    <div className="space-y-4">
      {alerts.length ? (
        <Card className="border-accent/30 bg-accent-soft/50">
          <h3 className="text-base">أهم حركة تعملها</h3>
          <ul className="mt-2 list-none space-y-2">
            {alerts.map((a, i) => (
              <li key={i} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{a.text}</span>
                <Badge tone={a.tone} className="shrink-0">
                  {a.action}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {isCustomer ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <h3 className="mb-1 text-base">الملف المالي</h3>
              <dl>
                <DataRow label="إجمالي المبيعات">
                  <Money value={stats.sales} />
                </DataRow>
                <DataRow label="المحصّل">
                  <Money value={stats.collected} />
                </DataRow>
                <DataRow label="الرصيد الحالي">
                  <Money value={stats.balance} />
                </DataRow>
                <DataRow label="المتأخر">
                  <span className={stats.overdue ? "text-danger" : ""}>
                    <Money value={stats.overdue} />
                  </span>
                </DataRow>
                <DataRow label="الائتمان المتاح">
                  {credit.hasLimit ? <Money value={credit.available} /> : <span className="text-sm text-muted-foreground">من غير حد</span>}
                </DataRow>
              </dl>
            </Card>
            <Card>
              <h3 className="mb-1 text-base">الملف التجاري</h3>
              <dl>
                <DataRow label="عدد التوريدات">
                  <span className="tabular">{stats.orders}</span>
                </DataRow>
                <DataRow label="متوسط التوريد">
                  <Money value={stats.avgOrder} />
                </DataRow>
                <DataRow label="أول تعامل">{stats.firstDate ? formatDate(stats.firstDate) : "—"}</DataRow>
                <DataRow label="آخر تعامل">
                  {stats.lastDate ? `${formatDate(stats.lastDate)} — ${stats.daysSinceLast} يوم` : "—"}
                </DataRow>
                <DataRow label="النمو (90 يوم)">
                  {stats.growthPct === null ? (
                    <span className="text-sm text-muted-foreground">مفيش مقارنة</span>
                  ) : (
                    <span className={stats.growthPct >= 0 ? "tabular text-ok" : "tabular text-danger"}>
                      {stats.growthPct >= 0 ? "+" : ""}
                      {Math.round(stats.growthPct)}٪
                    </span>
                  )}
                </DataRow>
              </dl>
            </Card>
          </div>

          {stats.productionOrders || stats.producedQty ? (
            <Card>
              <h3 className="mb-1 text-base">الإنتاج الجاري له</h3>
              <dl>
                <DataRow label="أوامر شغالة">
                  <span className="tabular">{stats.productionOrders}</span>
                </DataRow>
                <DataRow label="كمية منتَجة">
                  <span className="tabular">{qty(stats.producedQty, 0)}</span>
                </DataRow>
              </dl>
            </Card>
          ) : null}
        </>
      ) : null}

      {isSupplier ? (
        <Card>
          <h3 className="mb-1 text-base">التعامل كمورّد</h3>
          <dl>
            <DataRow label="إجمالي المشتريات منه">
              <Money value={sup.purchases} />
            </DataRow>
            <DataRow label="المدفوع له">
              <Money value={sup.paid} />
            </DataRow>
            <DataRow label="المستحق له">
              <Money value={sup.due} />
            </DataRow>
            <DataRow label="آخر شراء">{sup.lastDate ? formatDate(sup.lastDate) : "—"}</DataRow>
          </dl>
          {sup.items.length ? (
            <p className="mt-2 text-sm text-muted-foreground">بيوردلك: {sup.items.join("، ")}</p>
          ) : null}
        </Card>
      ) : null}

      <ScoreCard score={score} />

      {pattern.avgDays ? (
        <Card>
          <h3 className="mb-1 text-base">نمط الطلب</h3>
          <dl>
            <DataRow label="بيطلب كل">
              <span className="tabular">{pattern.avgDays} يوم</span>
            </DataRow>
            {pattern.avgQty ? (
              <DataRow label="متوسط الكمية">
                <span className="tabular">{qty(pattern.avgQty, 0)}</span>
              </DataRow>
            ) : null}
            <DataRow label="الطلب المتوقع الجاي">{pattern.expectedNext ? formatDate(pattern.expectedNext) : "—"}</DataRow>
          </dl>
          {pattern.overdueByDays ? (
            <p className="mt-2 text-sm text-warn">اتأخر {pattern.overdueByDays} يوم عن دورته المعتادة — يستاهل مكالمة.</p>
          ) : null}
        </Card>
      ) : null}

      {affinity.length ? (
        <Card>
          <h3 className="mb-2 text-base">بيشتري إيه</h3>
          <ul className="list-none space-y-2">
            {affinity.slice(0, 6).map((r) => (
              <li key={r.name}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span>{r.name}</span>
                  <span className="tabular text-muted-foreground">{Math.round(r.share)}٪</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, r.share)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function ScoreCard({ score }: { score: PartyScore }) {
  if (!score.enough) {
    return (
      <Card>
        <h3 className="text-base">سكور العلاقة</h3>
        <p className="mt-1 text-sm text-muted-foreground">{score.reasons[0]}</p>
      </Card>
    );
  }
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base">سكور العلاقة</h3>
        <Badge tone={scoreTone(score.total ?? 0)}>{score.total} / 100</Badge>
      </div>
      <ul className="mt-3 list-none space-y-2.5">
        {score.parts.map((p) => (
          <li key={p.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>{p.label}</span>
              <span className="tabular text-muted-foreground">{p.value}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${p.value}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{p.why}</p>
          </li>
        ))}
      </ul>
      {score.reasons.length ? (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-sm text-muted-foreground">ليه السكور كده؟</p>
          <ul className="mt-1 list-none space-y-1 text-sm">
            {score.reasons.map((r) => (
              <li key={r}>— {r}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {score.risk !== null ? (
        <p className="mt-3 text-sm">
          مؤشر الخطر: <span className="tabular">{score.risk}</span> من 100
        </p>
      ) : null}
    </Card>
  );
}

/* ── كشف الحساب ──────────────────────────────────────────────── */

type StatementLine = { id: string; date: string; label: string; kind: string; debit: number; credit: number; balance: number };

function AccountTab({
  partyId,
  statement,
  isCustomer,
}: {
  partyId: string;
  statement: StatementLine[];
  isCustomer: boolean;
}) {
  const { db, can, deleteDelivery, deleteCollection } = useFactory();
  const credit = partyCredit(db, partyId);

  return (
    <div className="space-y-4">
      {isCustomer && credit.hasLimit ? (
        <Card className={credit.overLimit ? "border-danger/30 bg-danger-soft/40" : ""}>
          <h3 className="text-base">الائتمان</h3>
          <dl className="mt-1">
            <DataRow label="حد الائتمان">
              <Money value={credit.limit} />
            </DataRow>
            <DataRow label="المستخدم حاليًا">
              <Money value={credit.exposure} />
            </DataRow>
            <DataRow label="المتاح">
              <Money value={credit.available} />
            </DataRow>
          </dl>
          {credit.overLimit ? (
            <p className="mt-1 text-sm text-danger">
              عدّى الحد بـ{Math.round(credit.exposure - credit.limit)} جنيه — أي توريد جديد محتاج موافقة.
            </p>
          ) : null}
        </Card>
      ) : null}

      {statement.length === 0 ? (
        <p className="text-sm text-muted-foreground">لسه مفيش حركة.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="p-2.5 text-right font-medium">التاريخ</th>
                <th className="p-2.5 text-right font-medium">البيان</th>
                <th className="p-2.5 text-left font-medium">مدين</th>
                <th className="p-2.5 text-left font-medium">دائن</th>
                <th className="p-2.5 text-left font-medium">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {statement.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="p-2 whitespace-nowrap">{formatDate(l.date)}</td>
                  <td className="p-2">
                    {l.label}
                    {l.kind === "collection" ? (
                      <span className="mr-1 text-xs text-muted-foreground">
                        {METHOD_LABEL[db.collections.find((c) => c.id === l.id)?.method ?? "cash"]}
                      </span>
                    ) : null}
                  </td>
                  <td className="p-2 text-left tabular">{l.debit ? <Money value={l.debit} /> : "—"}</td>
                  <td className="p-2 text-left tabular">{l.credit ? <Money value={l.credit} /> : "—"}</td>
                  <td className="p-2 text-left tabular">
                    <Money value={l.balance} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {can.delete && statement.length ? (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">إلغاء حركة</summary>
          <ul className="mt-2 space-y-1">
            {db.deliveries
              .filter((d) => d.clientId === partyId)
              .map((d) => (
                <li key={d.id} className="flex justify-between">
                  <span>توريد {formatDate(d.date)}</span>
                  <button className="text-danger" onClick={() => deleteDelivery(d.id)}>
                    مسح
                  </button>
                </li>
              ))}
            {db.collections
              .filter((c) => c.clientId === partyId)
              .map((c) => (
                <li key={c.id} className="flex justify-between">
                  <span>تحصيل {formatDate(c.date)}</span>
                  <button className="text-danger" onClick={() => deleteCollection(c.id)}>
                    مسح
                  </button>
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/* ── الخط الزمني ─────────────────────────────────────────────── */

const KIND_LABEL: Record<string, { label: string; tone: Tone }> = {
  delivery: { label: "توريد", tone: "gold" },
  collection: { label: "تحصيل", tone: "ok" },
  order: { label: "إنتاج", tone: "muted" },
  purchase: { label: "شراء", tone: "muted" },
  payment: { label: "دفع", tone: "ok" },
  comm: { label: "تواصل", tone: "muted" },
  task: { label: "مهمة", tone: "warn" },
};

function Timeline({ partyId }: { partyId: string }) {
  const { db } = useFactory();
  const events = partyTimeline(db, partyId);
  if (!events.length) return <p className="text-sm text-muted-foreground">لسه مفيش أي حركة على الجهة دي.</p>;
  return (
    <ol className="list-none space-y-0">
      {events.map((e, i) => (
        <li key={`${e.kind}-${e.id}-${i}`} className="flex gap-3 border-r border-border pr-4">
          <div className="relative -mr-[21px] mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />
          <div className="flex-1 pb-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">
                {e.title}
                <Badge tone={KIND_LABEL[e.kind]?.tone ?? "muted"} className="mr-2">
                  {KIND_LABEL[e.kind]?.label ?? e.kind}
                </Badge>
              </p>
              {e.amount !== null ? <Money value={e.amount} className="text-sm" /> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {formatDate(e.date)}
              {e.detail ? ` — ${e.detail}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ── التواصل والمهام والملاحظات الداخلية ─────────────────────── */

function CommsTab({ partyId }: { partyId: string }) {
  const { db, can, addCommunication, addTask, toggleTask, updateParty } = useFactory();
  const party = db.parties.find((p) => p.id === partyId)!;
  const comms = db.communications.filter((c) => c.partyId === partyId);
  const tasks = db.tasks.filter((t) => t.partyId === partyId);

  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<CommChannel>("call");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [internal, setInternal] = useState(false);

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDate, setTaskDate] = useState(cairoToday());
  const [notes, setNotes] = useState(party.internalNotes);

  return (
    <div className="space-y-4">
      {can.edit ? <Button onClick={() => setOpen(true)}>سجّل تواصل</Button> : null}

      <Card>
        <h3 className="mb-2 text-base">المهام المفتوحة</h3>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">مفيش مهام.</p>
        ) : (
          <ul className="list-none space-y-2">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={t.status === "done"}
                  onChange={() => toggleTask(t.id)}
                  disabled={!can.edit}
                  className="mt-1 h-4 w-4"
                />
                <div>
                  <p className={t.status === "done" ? "text-muted-foreground line-through" : ""}>{t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(t.dueDate)}
                    {t.assigneeName ? ` — ${t.assigneeName}` : ""}
                    {t.status === "open" && t.dueDate < cairoToday() ? " — متأخرة" : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {can.edit ? (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
            <Input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="مهمة متابعة جديدة"
              className="min-w-[160px] flex-1"
            />
            <Input type="date" value={taskDate} onChange={(e) => setTaskDate(e.target.value)} className="w-40" />
            <Button
              variant="outline"
              onClick={() => {
                try {
                  addTask({ partyId, title: taskTitle, dueDate: taskDate, assigneeName: "" });
                  setTaskTitle("");
                  toast.success("المهمة اتضافت.");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "فشل");
                }
              }}
            >
              أضف
            </Button>
          </div>
        ) : null}
      </Card>

      <Card>
        <h3 className="mb-2 text-base">سجل التواصل</h3>
        {comms.length === 0 ? (
          <p className="text-sm text-muted-foreground">لسه مفيش تواصل مسجّل.</p>
        ) : (
          <ul className="list-none space-y-3">
            {comms.map((c) => (
              <li key={c.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{c.subject || COMM_CHANNEL_LABEL[c.channel]}</p>
                  <div className="flex gap-1">
                    <Badge>{COMM_CHANNEL_LABEL[c.channel]}</Badge>
                    {c.internal ? <Badge tone="warn">داخلي</Badge> : null}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{c.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(c.date)} — {c.actorName}
                  {c.nextAction ? ` · المتابعة: ${c.nextAction}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="text-base">ملاحظات داخلية</h3>
        <p className="mb-2 text-sm text-muted-foreground">الكلام هنا للفريق بس — العميل مش بيشوفه في أي بورتال.</p>
        {can.edit ? (
          <>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => {
                updateParty(partyId, { internalNotes: notes });
                toast.success("اتحفظت.");
              }}
            >
              احفظ الملاحظات
            </Button>
          </>
        ) : (
          <p className="text-sm">{party.internalNotes || "مفيش ملاحظات."}</p>
        )}
      </Card>

      <Panel
        open={open}
        title="سجّل تواصل"
        onClose={() => setOpen(false)}
        footer={
          <Button
            className="w-full"
            onClick={() => {
              addCommunication({
                partyId,
                date: cairoToday(),
                channel,
                subject,
                body,
                internal,
                nextAction,
                nextDate: nextDate || null,
              });
              toast.success(nextAction && nextDate ? "التواصل اتسجل ومهمة متابعة اتفتحت." : "التواصل اتسجل.");
              setSubject("");
              setBody("");
              setNextAction("");
              setNextDate("");
              setOpen(false);
            }}
          >
            حفظ
          </Button>
        }
      >
        <Field label="القناة">
          <select value={channel} onChange={(e) => setChannel(e.target.value as CommChannel)} className={selectClass}>
            {COMM_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {COMM_CHANNEL_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الموضوع">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="اللي حصل">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <Field label="الخطوة الجاية">
          <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="مثال: أبعتله عرض سعر" />
        </Field>
        <Field label="ميعاد الخطوة الجاية">
          <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="h-4 w-4" />
          ملاحظة داخلية — متظهرش للعميل
        </label>
      </Panel>
    </div>
  );
}

/* ── البيانات وجهات الاتصال والعناوين والدمج ─────────────────── */

function InfoTab({ partyId }: { partyId: string }) {
  const { db, can, deleteParty, mergeParties, addContact, removeContact, addAddress, removeAddress } = useFactory();
  const nav = useNavigate();
  const party = db.parties.find((p) => p.id === partyId)!;
  const contacts = db.contacts.filter((c) => c.partyId === partyId);
  const addresses = db.addresses.filter((a) => a.partyId === partyId);
  const dups = findDuplicates(db, { name: party.name, phone: party.phone, taxId: party.taxId }).filter(
    (p) => p.id !== partyId,
  );

  const [edit, setEdit] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [addrOpen, setAddrOpen] = useState(false);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-base">البيانات الأساسية</h3>
          {can.edit ? (
            <Button size="sm" variant="outline" onClick={() => setEdit(true)}>
              تعديل
            </Button>
          ) : null}
        </div>
        <dl className="mt-1">
          <DataRow label="الاسم">{party.name}</DataRow>
          {party.tradeName ? <DataRow label="الاسم التجاري">{party.tradeName}</DataRow> : null}
          <DataRow label="النوع">{party.kind === "person" ? "فرد" : "شركة"}</DataRow>
          <DataRow label="نوع العلاقة">{party.roles.map((r) => PARTY_ROLE_LABEL[r]).join("، ")}</DataRow>
          {party.code ? <DataRow label="الكود الداخلي">{party.code}</DataRow> : null}
          {party.taxId ? <DataRow label="الرقم الضريبي">{party.taxId}</DataRow> : null}
          {party.commercialReg ? <DataRow label="السجل التجاري">{party.commercialReg}</DataRow> : null}
          {party.industry ? <DataRow label="النشاط">{party.industry}</DataRow> : null}
          <DataRow label="الموبايل">{party.phone || "—"}</DataRow>
          {party.email ? <DataRow label="الإيميل">{party.email}</DataRow> : null}
          {party.address || party.city || party.governorate ? (
            <DataRow label="العنوان">{[party.address, party.city, party.governorate].filter(Boolean).join("، ")}</DataRow>
          ) : null}
          <DataRow label="حد الائتمان">{party.creditLimit ? <Money value={party.creditLimit} /> : "من غير حد"}</DataRow>
          <DataRow label="مدة السماح">{party.paymentTermDays ? `${party.paymentTermDays} يوم` : "—"}</DataRow>
          <DataRow label="مسجّل من">{formatDate(party.createdAt.slice(0, 10))}</DataRow>
        </dl>
        {party.notes ? <p className="mt-2 text-sm text-muted-foreground">{party.notes}</p> : null}
      </Card>

      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-base">الأشخاص</h3>
          {can.edit ? (
            <Button size="sm" variant="outline" onClick={() => setContactOpen(true)}>
              أضف شخص
            </Button>
          ) : null}
        </div>
        {contacts.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            الشركة ممكن يكون فيها أكتر من شخص — المشتريات، المحاسبة، صاحب الشركة.
          </p>
        ) : (
          <ul className="mt-2 list-none space-y-2">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium">
                    {c.name}
                    {c.isPrimary ? <Badge tone="gold" className="mr-2">الأساسي</Badge> : null}
                  </p>
                  <p className="text-muted-foreground">
                    {[c.title, c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                {can.edit ? (
                  <button className="shrink-0 text-danger" onClick={() => removeContact(c.id)}>
                    مسح
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-base">العناوين</h3>
          {can.edit ? (
            <Button size="sm" variant="outline" onClick={() => setAddrOpen(true)}>
              أضف عنوان
            </Button>
          ) : null}
        </div>
        {addresses.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">مقر، مخزن، عنوان شحن، أو فرع — كل واحد لوحده.</p>
        ) : (
          <ul className="mt-2 list-none space-y-2">
            {addresses.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium">{ADDRESS_KIND_LABEL[a.kind]}</p>
                  <p className="text-muted-foreground">{[a.line, a.city, a.governorate].filter(Boolean).join("، ")}</p>
                </div>
                {can.edit ? (
                  <button className="shrink-0 text-danger" onClick={() => removeAddress(a.id)}>
                    مسح
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {can.edit && dups.length ? (
        <Card className="border-warn/30 bg-warn-soft/40">
          <h3 className="text-base">سجلات ممكن تكون نفس الجهة</h3>
          <ul className="mt-2 list-none space-y-2 text-sm">
            {dups.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3">
                <span>
                  {d.name} — {d.roles.map((r) => PARTY_ROLE_LABEL[r]).join("، ")}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!confirm(`ادمج "${d.name}" في "${party.name}"؟ كل حركاته هتنتقل هنا والسجل القديم هيتأرشف.`)) return;
                    try {
                      mergeParties(d.id, partyId);
                      toast.success("السجلين اندمجوا.");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "فشل");
                    }
                  }}
                >
                  ادمجه هنا
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {can.delete ? (
        <Button
          variant="dangerGhost"
          onClick={() => {
            if (confirm("مسح الجهة وكل توريداتها وتحصيلاتها؟ لو السجل مكرر، الأفضل تدمجه بدل ما تمسحه.")) {
              deleteParty(partyId);
              nav("/parties");
            }
          }}
        >
          مسح الجهة
        </Button>
      ) : null}

      <EditPanel open={edit} onClose={() => setEdit(false)} partyId={partyId} />
      <ContactPanel open={contactOpen} onClose={() => setContactOpen(false)} partyId={partyId} onSave={addContact} />
      <AddressPanel open={addrOpen} onClose={() => setAddrOpen(false)} partyId={partyId} onSave={addAddress} />
      {party.mergedIntoId ? (
        <p className="text-sm text-warn">
          السجل ده مدموج في سجل تاني ومتخفي من القوائم، بس بياناته محفوظة.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        التعديل على البيانات بيتسجل في سجل التعديلات باسم اللي عمله ووقته.
        {!can.edit ? " دورك حاليًا للعرض بس." : ""}
      </p>
    </div>
  );
}

function EditPanel({ open, onClose, partyId }: { open: boolean; onClose: () => void; partyId: string }) {
  const { db, updateParty } = useFactory();
  const party = db.parties.find((p) => p.id === partyId)!;
  const [form, setForm] = useState(party);
  const [tagInput, setTagInput] = useState("");

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <Panel
      open={open}
      title="تعديل البيانات"
      onClose={onClose}
      footer={
        <Button
          className="w-full"
          onClick={() => {
            if (!form.name.trim()) {
              toast.error("اسم الجهة مطلوب.");
              return;
            }
            if (!form.roles.length) {
              toast.error("اختار نوع العلاقة على الأقل.");
              return;
            }
            updateParty(partyId, form);
            toast.success("اتحفظت.");
            onClose();
          }}
        >
          حفظ
        </Button>
      }
    >
      <Field label="الاسم">
        <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label="الاسم التجاري">
        <Input value={form.tradeName} onChange={(e) => set("tradeName", e.target.value)} />
      </Field>
      <Field label="نوع العلاقة">
        <div className="flex flex-wrap gap-2">
          {PARTY_ROLES.map((r) => (
            <button
              key={r}
              onClick={() =>
                set("roles", form.roles.includes(r) ? form.roles.filter((x) => x !== r) : ([...form.roles, r] as PartyRole[]))
              }
              className={
                form.roles.includes(r)
                  ? "rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground"
                  : "rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"
              }
            >
              {PARTY_ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      </Field>
      <Field label="الموبايل">
        <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" />
      </Field>
      <Field label="واتساب">
        <Input value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} inputMode="tel" />
      </Field>
      <Field label="الإيميل">
        <Input value={form.email} onChange={(e) => set("email", e.target.value)} inputMode="email" />
      </Field>
      <Field label="الكود الداخلي">
        <Input value={form.code} onChange={(e) => set("code", e.target.value)} />
      </Field>
      <Field label="الرقم الضريبي">
        <Input value={form.taxId} onChange={(e) => set("taxId", e.target.value)} inputMode="numeric" />
      </Field>
      <Field label="السجل التجاري">
        <Input value={form.commercialReg} onChange={(e) => set("commercialReg", e.target.value)} />
      </Field>
      <Field label="النشاط">
        <Input value={form.industry} onChange={(e) => set("industry", e.target.value)} />
      </Field>
      <Field label="العنوان">
        <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="المحافظة">
          <Input value={form.governorate} onChange={(e) => set("governorate", e.target.value)} />
        </Field>
        <Field label="المدينة">
          <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
        </Field>
      </div>
      <Field label="حد الائتمان">
        <Input
          value={String(form.creditLimit || "")}
          onChange={(e) => set("creditLimit", Number(e.target.value) || 0)}
          inputMode="numeric"
        />
      </Field>
      <Field label="مدة السماح بالأيام">
        <Input
          value={String(form.paymentTermDays || "")}
          onChange={(e) => set("paymentTermDays", Number(e.target.value) || 0)}
          inputMode="numeric"
        />
      </Field>
      <Field label="التاجات">
        <div className="mb-2 flex flex-wrap gap-1">
          {form.tags.map((t) => (
            <button key={t} onClick={() => set("tags", form.tags.filter((x) => x !== t))}>
              <Badge tone="gold">{t} ✕</Badge>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="مثال: تصدير" />
          <Button
            variant="outline"
            onClick={() => {
              const t = tagInput.trim();
              if (!t || form.tags.includes(t)) return;
              set("tags", [...form.tags, t]);
              setTagInput("");
            }}
          >
            أضف
          </Button>
        </div>
      </Field>
      <Field label="ملاحظات">
        <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
    </Panel>
  );
}

function ContactPanel({
  open,
  onClose,
  partyId,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  partyId: string;
  onSave: (input: { partyId: string; name: string; title: string; phone: string; email: string; isPrimary: boolean }) => void;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  return (
    <Panel
      open={open}
      title="شخص جديد"
      onClose={onClose}
      footer={
        <Button
          className="w-full"
          onClick={() => {
            try {
              onSave({ partyId, name, title, phone, email, isPrimary });
              toast.success("اتضاف.");
              setName("");
              setTitle("");
              setPhone("");
              setEmail("");
              setIsPrimary(false);
              onClose();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "فشل");
            }
          }}
        >
          حفظ
        </Button>
      }
    >
      <Field label="الاسم">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="المسؤولية">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: مدير المشتريات" />
      </Field>
      <Field label="الموبايل">
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
      </Field>
      <Field label="الإيميل">
        <Input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} className="h-4 w-4" />
        ده الشخص الأساسي
      </label>
    </Panel>
  );
}

function AddressPanel({
  open,
  onClose,
  partyId,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  partyId: string;
  onSave: (input: { partyId: string; kind: AddressKind; line: string; governorate: string; city: string }) => void;
}) {
  const [kind, setKind] = useState<AddressKind>("head_office");
  const [line, setLine] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [city, setCity] = useState("");
  return (
    <Panel
      open={open}
      title="عنوان جديد"
      onClose={onClose}
      footer={
        <Button
          className="w-full"
          onClick={() => {
            try {
              onSave({ partyId, kind, line, governorate, city });
              toast.success("العنوان اتضاف.");
              setLine("");
              setGovernorate("");
              setCity("");
              onClose();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "فشل");
            }
          }}
        >
          حفظ
        </Button>
      }
    >
      <Field label="نوع العنوان">
        <select value={kind} onChange={(e) => setKind(e.target.value as AddressKind)} className={selectClass}>
          {ADDRESS_KINDS.map((k) => (
            <option key={k} value={k}>
              {ADDRESS_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="العنوان">
        <Input value={line} onChange={(e) => setLine(e.target.value)} />
      </Field>
      <Field label="المحافظة">
        <Input value={governorate} onChange={(e) => setGovernorate(e.target.value)} />
      </Field>
      <Field label="المدينة">
        <Input value={city} onChange={(e) => setCity(e.target.value)} />
      </Field>
    </Panel>
  );
}

/* ── التوريد مع تحقق حد الائتمان ─────────────────────────────── */

function DeliveryPanel({
  open,
  onClose,
  partyId,
  termDays,
}: {
  open: boolean;
  onClose: () => void;
  partyId: string;
  termDays: number;
}) {
  const { db, addDelivery } = useFactory();
  const credit = partyCredit(db, partyId);
  const [date, setDate] = useState(cairoToday());
  const [dueDate, setDueDate] = useState(cairoToday());
  const [amount, setAmount] = useState("");
  const [model, setModel] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");

  const value = Number(amount) || 0;
  const over = credit.hasLimit && value > 0 && value > credit.available;

  return (
    <Panel
      open={open}
      title="توريد جديد"
      onClose={onClose}
      footer={
        <Button
          className="w-full"
          onClick={() => {
            try {
              if (over && !confirm(`التوريد ده بيعدي الائتمان المتاح بـ${Math.round(value - credit.available)} جنيه. تكمل؟`)) {
                return;
              }
              addDelivery({
                clientId: partyId,
                date,
                dueDate,
                amount: value,
                model,
                quantity: quantity ? Number(quantity) : null,
                notes,
              });
              toast.success("التوريد اتسجل.");
              setAmount("");
              setModel("");
              setQuantity("");
              setNotes("");
              onClose();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "فشل");
            }
          }}
        >
          حفظ التوريد
        </Button>
      }
    >
      {over ? (
        <div className="mb-3 rounded-md border border-danger/30 bg-danger-soft/40 p-3 text-sm">
          التوريد بيعدي الائتمان المتاح ({Math.round(credit.available)} جنيه) بـ
          {Math.round(value - credit.available)} جنيه. النظام مش هيمنعك، بس محتاج موافقتك.
        </div>
      ) : null}
      <Field label="التاريخ">
        <Input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            if (termDays > 0) {
              const d = new Date(`${e.target.value}T00:00:00`);
              d.setDate(d.getDate() + termDays);
              setDueDate(d.toISOString().slice(0, 10));
            }
          }}
        />
      </Field>
      <Field label={termDays > 0 ? `ميعاد الآجل — ${termDays} يوم من التاريخ` : "ميعاد الآجل"}>
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </Field>
      <Field label="المبلغ">
        <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="المنتج">
        <Input value={model} onChange={(e) => setModel(e.target.value)} />
      </Field>
      <Field label="الكمية">
        <Input inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </Field>
      <Field label="ملاحظة">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Panel>
  );
}
