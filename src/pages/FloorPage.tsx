import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Maximize2, Pause, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Factory } from "lucide-react";
import { formatDate, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { FLOOR_ISSUE_LABEL } from "@/store/types";
import { floorView, type Tone } from "@/store/floor";

/**
 * شاشة أرض المصنع.
 *
 * دي الشاشة اللي بتتعلّق على حيطة الصالة: أرقام كبيرة، ألوان واضحة من
 * بعيد، وصفر أزرار محتاجة حد يدوسها. كل رقم فيها محسوب من نفس الدفاتر
 * — الهدف من الأوامر ومواعيدها، والفعلي من تسجيلات الإنتاج.
 *
 * التحديث: الشاشة بتعيد الرسم كل ٢٠ ثانية عشان أي تسجيل جديد على نفس
 * الجهاز يبان. التحديث اللحظي بين الأجهزة محتاج سيرفر، ومكتوب في
 * `docs/floor.md` إنه مش مبني — بنقول كده بدل ما نسمّي ده Live.
 */

const TONE_BG: Record<Tone, string> = {
  ok: "border-ok/40 bg-ok-soft/50",
  warn: "border-warn/40 bg-warn-soft/50",
  danger: "border-danger/40 bg-danger-soft/50",
};

const TONE_TEXT: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
};

export function FloorPage() {
  const { db, resolveIssue, can } = useFactory();
  const [tick, setTick] = useState(0);
  const [clock, setClock] = useState(() => new Date());
  const board = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((t) => t + 1);
      setClock(new Date());
    }, 20_000);
    return () => window.clearInterval(timer);
  }, []);

  // `tick` جوه الحساب عن قصد: هو اللي بيخلي الشاشة تعيد القراءة كل شوية
  const view = useMemo(() => ({ ...floorView(db), tick }), [db, tick]);

  /**
   * ملء الشاشة بيتطلب على **الشاشة نفسها** مش على الصفحة كلها: الشاشة
   * دي معلّقة على حيطة الصالة، والقايمة الجانبية وشريط البحث مالهمش
   * لازمة هناك — محدش هيدوس عليهم.
   */
  const full = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void board.current?.requestFullscreen?.();
  };

  if (!view.lines.length) {
    return (
      <EmptyState
        icon={Factory}
        title="مفيش أوامر شغالة دلوقتي"
        body="الشاشة دي بتتعلّق في الصالة وبتعرض هدف كل خط والفعلي والاختناقات والأعطال. أول ما يبقى فيه أمر إنتاج شغّال، بتشتغل لوحدها."
      />
    );
  }

  return (
    // `bg-background` مهم: العنصر لما يبقى ملء الشاشة بيطلع على خلفية سودا لو مالوش لون
    <div ref={board} className="floor-board space-y-4 bg-background">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">شاشة أرض المصنع</h2>
          <p className="text-sm text-muted-foreground">
            {formatDate(view.date)} · الساعة{" "}
            <span className="tabular">{clock.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</span>
            {view.workDay ? "" : " · النهاردة يوم راحة في إعدادات الطاقة"} · بتتحدّث كل ٢٠ ثانية
          </p>
        </div>
        <Button variant="outline" onClick={full}>
          <Maximize2 /> ملء الشاشة
        </Button>
      </div>

      <Card className={`${TONE_BG[view.tone]} border`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">إنتاج المصنع النهاردة</p>
            <p className={`text-5xl tabular ${TONE_TEXT[view.tone]}`}>
              {qty(view.actual, 0)}
              <span className="text-2xl text-muted-foreground"> / {qty(view.target, 0)}</span>
            </p>
          </div>
          <div className="text-end">
            <p className={`text-4xl tabular ${TONE_TEXT[view.tone]}`}>{qty(view.pct, 0)}٪</p>
            <p className="text-sm text-muted-foreground">من هدف النهاردة</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <Stat label="باندل شغّال" value={qty(view.runningBundles, 0)} />
            <Stat label="باندل واقف" value={qty(view.pausedBundles, 0)} tone={view.pausedBundles ? "warn" : undefined} />
            <Stat label="نسبة العيب" value={`${qty(view.defectPctToday, 1)}٪`} tone={view.defectPctToday > 5 ? "danger" : undefined} />
            <Stat label="بلاغات مفتوحة" value={qty(view.issues.length, 0)} tone={view.issues.length ? "warn" : undefined} />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          الهدف محسوب من الأوامر نفسها: الباقي في كل أمر ÷ أيام العمل لحد ميعاد تسليمه.
        </p>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {view.lines.map((line) => (
          <Card key={line.line} className={`${TONE_BG[line.tone]} border`}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg">{line.line}</h3>
              <Badge tone={line.tone === "ok" ? "ok" : line.tone === "warn" ? "warn" : "danger"}>
                {qty(line.pct, 0)}٪
              </Badge>
            </div>
            <p className={`mt-1 text-3xl tabular ${TONE_TEXT[line.tone]}`}>
              {qty(line.actual, 0)}
              <span className="text-lg text-muted-foreground"> / {qty(line.target, 0)}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>{qty(line.orders.length, 0)} أمر</span>
              <span>{qty(line.workers, 0)} عامل مسجّل</span>
              {line.pausedOps ? <span className="text-warn">{qty(line.pausedOps, 0)} عملية واقفة</span> : null}
              {line.openIssues ? <span className="text-danger">{qty(line.openIssues, 0)} بلاغ</span> : null}
            </div>
            <div className="mt-3 space-y-1.5">
              {line.orders.map((o) => (
                <div key={o.code} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="latin">{o.code}</span> · {o.model}
                  </span>
                  <span className="shrink-0 tabular text-muted-foreground">
                    باقي {qty(o.remaining, 0)}
                    {o.late ? <span className="ms-1 text-danger">متأخر</span> : ` · ${formatDate(o.dueDate)}`}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <h3 className="text-base">الإنتاج بالساعة</h3>
          {!view.hoursTracked ? (
            <p className="mt-1 text-sm text-muted-foreground">
              مفيش تسجيلات باندل النهاردة. الإنتاج بالساعة بيتحسب من تسجيلات الباندل، فالتسجيل بالكمية الإجمالية مالهوش ساعة.
            </p>
          ) : (
            <div className="mt-3 flex h-40 items-end gap-2">
              {view.hours.map((h) => {
                const max = Math.max(...view.hours.map((x) => x.pieces), 1);
                return (
                  <div key={h.hour} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-xs tabular text-muted-foreground">{qty(h.pieces, 0)}</span>
                    <div
                      className="w-full rounded-t bg-accent/80"
                      style={{ height: `${Math.max(4, (h.pieces / max) * 100)}%` }}
                    />
                    <span className="text-xs tabular text-muted-foreground">{String(h.hour).padStart(2, "0")}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="text-base">الشغل الجاري</h3>
          {view.bottleneck ? (
            <p className="mt-1 text-sm">
              أكبر كومة واقفة عند <strong>{view.bottleneck.name}</strong>: {qty(view.bottleneck.waiting, 0)} باندل (
              {qty(view.bottleneck.waitingPieces, 0)} قطعة).
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">مفيش باندلات واقفة مستنية عملية.</p>
          )}
          <div className="mt-3 space-y-1.5">
            {view.wip.map((w) => (
              <div key={w.operationId} className="flex items-center justify-between gap-2 text-sm">
                <span>{w.name}</span>
                <span className="tabular text-muted-foreground">
                  مستني {qty(w.waitingPieces, 0)} · شغّال {qty(w.running, 0)} · خلص {qty(w.doneToday, 0)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <h3 className="text-base">البلاغات المفتوحة</h3>
          {!view.issues.length ? (
            <p className="mt-1 text-sm text-muted-foreground">مفيش بلاغات مفتوحة — الصالة ماشية.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {view.issues.map((i) => (
                <div key={i.id} className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border/70 p-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {i.kind === "machine" ? (
                        <Wrench className="h-4 w-4 text-danger" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-warn" />
                      )}
                      <span className="text-sm font-medium">{FLOOR_ISSUE_LABEL[i.kind]}</span>
                      <Badge tone="muted">{i.line}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{i.note}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {/* بلاغ الماكينة مش بيتقفل بزرار «اتحلّت» وخلاص — لازم
                        يبقى له تذكرة، عشان التوقف يتقاس وقطع الغيار تخرج
                        من المخزن. وقفل التذكرة بيقفل البلاغ نفسه. */}
                    {i.kind === "machine" && can.do("machines", "create") ? (
                      <Button asChild size="sm" variant="gold">
                        <Link to={`/machines/tickets?new=1&issue=${i.id}`}>حوّله لتذكرة</Link>
                      </Button>
                    ) : null}
                    {can.do("production", "edit") ? (
                      <Button size="sm" variant="outline" onClick={() => resolveIssue(i.id)}>
                        اتحلّت
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="text-base">أكتر أسباب العيب</h3>
          {!view.defects.length ? (
            <p className="mt-1 text-sm text-muted-foreground">مفيش عيوب مسجّلة بسببها في آخر شهر.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {view.defects.map((d) => (
                <div key={d.reason}>
                  <div className="flex justify-between gap-2 text-sm">
                    <span>{d.reason}</span>
                    <span className="tabular text-muted-foreground">
                      {qty(d.qty, 0)} · {qty(d.pct, 0)}٪
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-danger/70" style={{ width: `${Math.max(2, d.pct)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {view.lateOrders.length ? (
        <Card className="border-danger/40">
          <h3 className="text-base">أوامر عدّت ميعادها</h3>
          <div className="mt-2 space-y-1.5">
            {view.lateOrders.map((o) => (
              <div key={o.code} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <span className="latin">{o.code}</span> · {o.model} · {o.line}
                </span>
                <span className="tabular text-danger">
                  متأخر {qty(o.days, 0)} يوم · باقي {qty(o.remaining, 0)} قطعة
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {view.pausedBundles ? (
        <p className="flex items-center gap-2 text-sm text-warn">
          <Pause className="h-4 w-4" /> فيه {qty(view.pausedBundles, 0)} عملية واقفة — الوقت الواقف مخصوم من الكفاءة.
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl tabular ${tone ? TONE_TEXT[tone] : ""}`}>{value}</p>
    </div>
  );
}
