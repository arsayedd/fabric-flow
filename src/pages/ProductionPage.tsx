import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, selectClass } from "@/components/ui/input";
import { ExportMenu } from "@/components/export/ExportMenu";
import { formatDate, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { datasetOf } from "@/store/datasets";
import {
  bundleState,
  bundleTrail,
  defectPareto,
  lineEfficiency,
  operationEfficiency,
  opMinutes,
  workerEfficiency,
  wip,
  type EfficiencyRow,
} from "@/store/floor";
import { operationById } from "@/store/manufacturing";

/**
 * متابعة الإنتاج على مستوى العملية.
 *
 * الشاشة دي هي الفرق بين «اتنتج ٥٠٠ قطعة» و«القطعة فين». كل رقم فيها
 * بيطلع من تسجيلات الباندل: الشغل الجاري بين العمليات، الكفاءة للعامل
 * وللخط وللعملية، وباريتو أسباب العيب.
 *
 * ولو المصنع لسه بيسجّل بالكمية الإجمالية بس (بلا باندلات)، الشاشة
 * **بتقول كده صريح** بدل ما تعرض أصفار.
 */

const TABS = [
  { id: "wip", label: "الشغل الجاري" },
  { id: "workers", label: "كفاءة العمال" },
  { id: "lines", label: "الخطوط والعمليات" },
  { id: "defects", label: "العيوب" },
  { id: "log", label: "سجل التسجيلات" },
] as const;

const RANGES = [
  { days: 7, label: "آخر أسبوع" },
  { days: 30, label: "آخر شهر" },
  { days: 90, label: "آخر ٣ شهور" },
];

export function ProductionPage() {
  const { db } = useFactory();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("wip");
  const [days, setDays] = useState(7);

  const tracked = (db.bundleOps ?? []).length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">متابعة العمليات</h2>
          <p className="text-sm text-muted-foreground">
            القطعة وصلت لأي عملية، ومين شغّال عليها، وقعدت قد إيه. الكفاءة = الدقايق المعيارية ÷ الوقت الفعلي.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <select className={`${selectClass} w-36`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {RANGES.map((r) => (
              <option key={r.days} value={r.days}>
                {r.label}
              </option>
            ))}
          </select>
          <ExportMenu module="production" dataset={() => datasetOf(db, "bundleOps")} />
        </div>
      </div>

      {!tracked ? (
        <EmptyState
          icon={Activity}
          title="مفيش تتبع على مستوى العملية لسه"
          body="التتبع بيبدأ من الباندل: اقص فرشة من شاشة القص، وبعدها افتح العملية على الباندل من محطة العامل. ساعتها الوقت والكفاءة والشغل الجاري بيتحسبوا لوحدهم."
        />
      ) : null}

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
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

      {tab === "wip" ? <Wip /> : null}
      {tab === "workers" ? <Efficiency rows={workerEfficiency(db, days)} title="كفاءة العمال" empty="مفيش تسجيلات باندل في الفترة دي." /> : null}
      {tab === "lines" ? (
        <div className="space-y-4">
          <Efficiency rows={lineEfficiency(db, days)} title="كفاءة الخطوط" empty="مفيش تسجيلات باندل في الفترة دي." />
          <Efficiency rows={operationEfficiency(db, days)} title="كفاءة العمليات" empty="مفيش تسجيلات باندل في الفترة دي." />
        </div>
      ) : null}
      {tab === "defects" ? <Defects days={days} /> : null}
      {tab === "log" ? <OpLog /> : null}
    </div>
  );
}

function Wip() {
  const { db } = useFactory();
  const rows = useMemo(() => wip(db), [db]);
  const bundles = useMemo(() => (db.bundles ?? []).map((b) => bundleState(db, b)), [db]);
  const worst = [...rows].sort((a, b) => b.waitingPieces - a.waitingPieces)[0];

  if (!rows.length) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">مفيش باندلات في الشغل دلوقتي.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {worst && worst.waitingPieces > 0 ? (
        <Card className="border-warn/40 bg-warn-soft/30">
          <h3 className="text-base">الاختناق دلوقتي: {worst.name}</h3>
          <p className="mt-1 text-sm">
            مستنية {qty(worst.waiting, 0)} باندل ({qty(worst.waitingPieces, 0)} قطعة) — دي أكبر كومة شغل واقفة في المصنع.
          </p>
        </Card>
      ) : null}

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base">الشغل الجاري بين العمليات</h3>
          <ExportMenu module="production" dataset={() => datasetOf(db, "wip")} compact />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 text-start font-medium">العملية</th>
                <th className="py-2 text-end font-medium">مستني</th>
                <th className="py-2 text-end font-medium">قطع مستنية</th>
                <th className="py-2 text-end font-medium">شغّال</th>
                <th className="py-2 text-end font-medium">واقف</th>
                <th className="py-2 text-end font-medium">خلص النهاردة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.operationId} className="border-b border-border/50">
                  <td className="py-2">{r.name}</td>
                  <td className="py-2 text-end tabular">{qty(r.waiting, 0)}</td>
                  <td className="py-2 text-end tabular">{qty(r.waitingPieces, 0)}</td>
                  <td className="py-2 text-end tabular">{qty(r.running, 0)}</td>
                  <td className={`py-2 text-end tabular ${r.paused ? "text-warn" : ""}`}>{qty(r.paused, 0)}</td>
                  <td className="py-2 text-end tabular">{qty(r.doneToday, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h3 className="mb-2 text-base">الباندلات ومسارها</h3>
        <div className="space-y-2">
          {bundles.map((b) => (
            <BundleRow key={b.bundle.id} code={b.bundle.code} label={b.label} id={b.bundle.id} qtyPieces={b.bundle.qty} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function BundleRow({ code, label, id, qtyPieces }: { code: string; label: string; id: string; qtyPieces: number }) {
  const { db } = useFactory();
  const [open, setOpen] = useState(false);
  const trail = open ? bundleTrail(db, id) : [];

  return (
    <div className="rounded-md border border-border/70">
      <button className="flex w-full items-center justify-between gap-2 p-3 text-start" onClick={() => setOpen((v) => !v)}>
        <span className="min-w-0">
          <span className="latin font-medium">{code}</span>
          <span className="block text-sm text-muted-foreground">
            {qty(qtyPieces, 0)} قطعة · {label}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">{open ? "اقفل" : "المسار"}</span>
      </button>
      {open ? (
        <div className="border-t px-3 py-2">
          {!trail.length ? (
            <p className="text-sm text-muted-foreground">لسه ماشتغلش عليه حد.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {trail.map((s) => (
                  <tr key={s.op.id} className="border-b border-border/40 last:border-0">
                    <td className="py-1.5">{s.operationName}</td>
                    <td className="py-1.5 text-muted-foreground">{s.workerName}</td>
                    <td className="py-1.5 text-end tabular">{qty(s.minutes, 0)} د</td>
                    <td className="py-1.5 text-end tabular">
                      {s.op.state === "done" ? `${qty(s.op.qtyGood, 0)} سليم` : s.op.state === "paused" ? "واقف" : "شغّال"}
                    </td>
                    <td className="py-1.5 text-end tabular">
                      {s.efficiencyPct === null ? "—" : `${qty(s.efficiencyPct, 0)}٪`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Efficiency({ rows, title, empty }: { rows: EfficiencyRow[]; title: string; empty: string }) {
  const { db } = useFactory();
  if (!rows.length) {
    return (
      <Card>
        <h3 className="text-base">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{empty}</p>
      </Card>
    );
  }
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-base">{title}</h3>
        <ExportMenu module="workers" dataset={() => datasetOf(db, "efficiency")} compact />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 text-start font-medium">الاسم</th>
              <th className="py-2 text-end font-medium">قطع</th>
              <th className="py-2 text-end font-medium">دقايق معيارية</th>
              <th className="py-2 text-end font-medium">دقايق فعلية</th>
              <th className="py-2 text-end font-medium">الكفاءة</th>
              <th className="py-2 text-end font-medium">عيوب</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/50">
                <td className="py-2">{r.name}</td>
                <td className="py-2 text-end tabular">{qty(r.pieces, 0)}</td>
                <td className="py-2 text-end tabular">{qty(r.earnedMinutes, 0)}</td>
                <td className="py-2 text-end tabular">{qty(r.workedMinutes, 0)}</td>
                <td
                  className={`py-2 text-end tabular ${
                    r.efficiencyPct === null ? "" : r.efficiencyPct >= 90 ? "text-ok" : r.efficiencyPct >= 70 ? "text-warn" : "text-danger"
                  }`}
                >
                  {r.efficiencyPct === null ? "—" : `${qty(r.efficiencyPct, 0)}٪`}
                </td>
                <td className={`py-2 text-end tabular ${r.defectPct > 5 ? "text-danger" : ""}`}>
                  {qty(r.defectPct, 1)}٪
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        الكفاءة محسوبة على التسجيلات اللي ليها زمن معياري بس. التوقف (راحة أو عطل) مخصوم من الوقت الفعلي.
      </p>
    </Card>
  );
}

function Defects({ days }: { days: number }) {
  const { db } = useFactory();
  const rows = defectPareto(db, days);
  const total = rows.reduce((s, r) => s + r.qty, 0);

  if (!rows.length) {
    return (
      <Card>
        <h3 className="text-base">العيوب</h3>
        <p className="mt-1 text-sm text-muted-foreground">مفيش عيوب مسجّلة على الباندلات في الفترة دي.</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-base">أسباب العيب — باريتو</h3>
        <ExportMenu module="quality" dataset={() => datasetOf(db, "defects")} compact />
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        {qty(total, 0)} قطعة معيبة أو معادة، و{qty(rows.filter((r) => r.cumulativePct <= 80).length || 1, 0)} سبب بيعملوا
        أول ٨٠٪ منها.
      </p>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.reason}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span>
                {r.reason} <span className="text-muted-foreground">· {r.operationName}</span>
              </span>
              <span className="tabular text-muted-foreground">
                {qty(r.qty, 0)} · {qty(r.pct, 0)}٪ · متراكم {qty(r.cumulativePct, 0)}٪
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-danger/70" style={{ width: `${Math.max(2, r.pct)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        السبب بيتكتب وقت إقفال العملية. اللي اتسجّل بكمية بلا سبب بيتعرض «بدون سبب مكتوب» بدل ما يتوزّع بالتخمين.
      </p>
    </Card>
  );
}

function OpLog() {
  const { db } = useFactory();
  const [q, setQ] = useState("");
  const rows = useMemo(
    () =>
      [...(db.bundleOps ?? [])]
        .sort((a, b) => (b.endedAt ?? b.startedAt).localeCompare(a.endedAt ?? a.startedAt))
        .slice(0, 200),
    [db],
  );
  const shown = rows.filter((r) => {
    if (!q.trim()) return true;
    const code = (db.bundles ?? []).find((b) => b.id === r.bundleId)?.code ?? "";
    return code.includes(q.trim());
  });

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base">آخر التسجيلات</h3>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر برقم الباندل" className="w-48" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 text-start font-medium">الباندل</th>
              <th className="py-2 text-start font-medium">العملية</th>
              <th className="py-2 text-start font-medium">العامل</th>
              <th className="py-2 text-end font-medium">دقايق</th>
              <th className="py-2 text-end font-medium">سليم</th>
              <th className="py-2 text-end font-medium">عيب</th>
              <th className="py-2 text-start font-medium">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const bundle = (db.bundles ?? []).find((b) => b.id === r.bundleId);
              const order = db.orders.find((o) => o.id === r.orderId);
              return (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="py-2">
                    <span className="latin">{bundle?.code ?? "—"}</span>
                    {order ? (
                      <Link to={`/orders/${order.id}`} className="ms-2 text-xs text-muted-foreground underline-offset-4 hover:underline">
                        {order.code}
                      </Link>
                    ) : null}
                  </td>
                  <td className="py-2">{operationById(db, r.operationId)?.name ?? "عملية"}</td>
                  <td className="py-2">{db.workers.find((w) => w.id === r.workerId)?.name ?? "—"}</td>
                  <td className="py-2 text-end tabular">{qty(opMinutes(r), 0)}</td>
                  <td className="py-2 text-end tabular">{r.state === "done" ? qty(r.qtyGood, 0) : "—"}</td>
                  <td className="py-2 text-end tabular">
                    {r.qtyRework + r.qtyScrap ? qty(r.qtyRework + r.qtyScrap, 0) : "—"}
                  </td>
                  <td className="py-2">
                    <Badge tone={r.state === "done" ? "ok" : r.state === "paused" ? "warn" : "gold"}>
                      {r.state === "done" ? `خلص ${formatDate((r.endedAt ?? "").slice(0, 10))}` : r.state === "paused" ? "واقف" : "شغّال"}
                    </Badge>
                    {r.defect ? <span className="ms-2 text-xs text-danger">{r.defect}</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
