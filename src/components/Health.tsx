import { useState } from "react";
import { Link } from "react-router-dom";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { exceptions, factoryBottleneck, factoryFunnel, factoryHealth, healthPulse, type Exception } from "@/store/health";

const BAR = (v: number) => (v >= 75 ? "bg-ok" : v >= 55 ? "bg-warn" : "bg-danger");
const DOT: Record<Exception["tone"], string> = { danger: "bg-danger", warn: "bg-warn", info: "bg-muted-foreground" };

/** سكور صحة المصنع — الدرجة وتفصيلها، وكل مؤشر بيقول اتبنى على إيه */
export function HealthCard() {
  const { db } = useFactory();
  const health = factoryHealth(db);
  const [open, setOpen] = useState(true);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base">صحة المصنع</h3>
          <p className="text-xs text-muted-foreground">حالة المصنع كلها في رقم واحد — من بياناتك، مش من تقدير.</p>
        </div>
        <div className="flex items-center gap-2">
          {health.total === null ? (
            <Badge tone="muted">البيانات مش كفاية</Badge>
          ) : (
            <>
              <span className="text-3xl tabular">{qty(health.total, 0)}</span>
              <span className="text-sm text-muted-foreground">/ ١٠٠</span>
              <Badge tone={health.tone}>{health.label}</Badge>
            </>
          )}
        </div>
      </div>

      {health.total !== null ? (
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full ${BAR(health.total)}`} style={{ width: `${health.total}%` }} />
        </div>
      ) : null}

      {health.coverage < 99 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          المحسوب فعلًا يمثّل {qty(Math.round(health.coverage), 0)}٪ من الأوزان؛ المؤشر اللي مفيش له بيانات وزنه
          بيتوزّع على الباقي بدل ما يتحسب صفر.
        </p>
      ) : null}

      <Button variant="ghost" size="sm" className="mt-1 px-0" onClick={() => setOpen(!open)}>
        {open ? "اخفي التفاصيل" : "شوف الدرجة اتكوّنت إزاي"}
      </Button>

      {open ? (
        <ul className="mt-1 grid list-none gap-3 border-t border-border pt-3 sm:grid-cols-2">
          {health.blocks.map((b) => (
            <li key={b.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm">
                  {b.label} <span className="text-xs text-muted-foreground">وزن {qty(b.weight, 0)}٪</span>
                </span>
                <span className="shrink-0 text-sm tabular">
                  {b.value === null ? <span className="text-xs text-muted-foreground">مش محسوب</span> : Math.round(b.value)}
                </span>
              </div>
              {b.value !== null ? (
                <>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${BAR(b.value)}`} style={{ width: `${b.value}%` }} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{b.why}</p>
                </>
              ) : (
                <p className="mt-0.5 text-xs text-muted-foreground">محتاج: {b.missing}</p>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

/**
 * محتاج اهتمامك النهارده — مرتّبة بالخطورة وبالأثر.
 * ده اللي بيمنع إن صاحب المصنع يدور في كل الشاشات عشان يعرف فيه إيه.
 */
export function ExceptionsCard({ limit = 5 }: { limit?: number }) {
  const { db } = useFactory();
  const all = exceptions(db);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? all : all.slice(0, limit);
  const urgent = all.filter((e) => e.tone !== "info").length;

  if (!all.length) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-ok">
          <CircleCheck className="h-4 w-4 shrink-0" />
          {/* «تشغيلية» مش «حاجة»: الكارت ده بيتكلم عن حوادث اليوم بس، وفوقه
              ممكن يبقى فيه ثقوب تجهيز — فـ«مفيش حاجة» كانت بتناقضها */}
          <span className="text-sm">مفيش حادثة تشغيلية النهارده: مواعيدك في الجدول، خاماتك كفاية، ومفيش تحصيل متأخر.</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-r-2 border-r-accent">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <TriangleAlert className="h-4 w-4 shrink-0 text-accent" />
          <h3 className="text-base">محتاج اهتمامك النهارده</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          {qty(urgent, 0)} حاجة مستعجلة من {qty(all.length, 0)} — مرتّبة بالأثر مش بالترتيب الأبجدي
        </p>
      </div>

      <ol className="mt-3 list-none space-y-3">
        {shown.map((e, i) => (
          <li key={e.key} className="flex gap-2.5">
            <span className="mt-1.5 flex items-center gap-1.5">
              <span className="tabular text-xs text-muted-foreground">{qty(i + 1, 0)}</span>
              <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[e.tone]}`} />
            </span>
            <div className="min-w-0 flex-1">
              {e.to ? (
                <Link to={e.to} className="text-sm underline-offset-4 hover:underline">
                  {e.title}
                </Link>
              ) : (
                <span className="text-sm">{e.title}</span>
              )}
              <p className="text-xs text-muted-foreground">{e.why}</p>
              <p className="text-xs text-accent">{e.action}</p>
            </div>
          </li>
        ))}
      </ol>

      {all.length > limit ? (
        <Button variant="ghost" size="sm" className="mt-2 px-0" onClick={() => setShowAll(!showAll)}>
          {showAll ? "اعرض أهم خمسة بس" : `شوف الباقي (${qty(all.length - limit, 0)})`}
        </Button>
      ) : null}
    </Card>
  );
}

/** القطع واقفة فين — مسار المصنع كله والاختناق */
export function FunnelCard() {
  const { db } = useFactory();
  const steps = factoryFunnel(db);
  const bn = factoryBottleneck(db);

  if (!steps.length) {
    return (
      <Card>
        <h3 className="text-base">القطع واقفة فين</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          محتاج أوامر مفتوحة بمسار عمليات ومراحل مسجّلة. أول ما المراحل تتسجّل بالكميات، المسار يبان هنا لوحده.
        </p>
      </Card>
    );
  }

  const max = Math.max(...steps.map((s) => s.arrived), 1);

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base">القطع واقفة فين</h3>
        <p className="text-xs text-muted-foreground">كل الأوامر المفتوحة مجمّعة بترتيب المسار الغالب</p>
      </div>

      <ul className="mt-3 list-none space-y-3">
        {steps.map((s) => (
          <li key={s.operationId}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">
                {/* المرحلة مش رقم على الشاشة: بتفتح الأوامر اللي القطع واقفة فيها */}
                <Link to="/orders" className="underline-offset-4 hover:underline">
                  {s.name}
                </Link>
                {bn && bn.step.operationId === s.operationId ? (
                  <Badge tone="danger" className="mr-2">
                    اختناق
                  </Badge>
                ) : null}
              </span>
              <span className="shrink-0 tabular text-xs text-muted-foreground">
                وصل {qty(Math.round(s.arrived), 0)} · خرج {qty(Math.round(s.done), 0)} · واقف{" "}
                <span className={s.waiting > 0 ? "text-warn" : ""}>{qty(Math.round(s.waiting), 0)}</span>
              </span>
            </div>
            <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-ok" style={{ width: `${(s.done / max) * 100}%` }} />
              <div className="h-full bg-warn" style={{ width: `${(s.waiting / max) * 100}%` }} />
            </div>
            {s.scrap + s.rework > 0 ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                مرفوض {qty(Math.round(s.scrap), 0)} · إعادة تشغيل {qty(Math.round(s.rework), 0)}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-muted-foreground">
        {bn ? `${bn.why}. ` : ""}
        طاقة كل مرحلة لوحدها لسه مش مسجّلة، فالنظام بيقول الواقف قد إيه — مش «طاقتها كام في اليوم».
      </p>
    </Card>
  );
}

/** كارت مختصر للرئيسية */
export function HealthTeaser() {
  const { db } = useFactory();
  const pulse = healthPulse(db);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h3 className="text-base">صحة المصنع</h3>
            {pulse.total === null ? (
              <Badge tone="muted">البيانات مش كفاية</Badge>
            ) : (
              <>
                <span className="text-xl tabular">{qty(pulse.total, 0)}</span>
                <Badge tone={pulse.tone}>{pulse.label}</Badge>
              </>
            )}
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {pulse.weakest ? `أضعف مؤشر: ${pulse.weakest.label} (${qty(Math.round(pulse.weakest.value as number), 0)})` : ""}
            {pulse.count ? ` · ${qty(pulse.count, 0)} حاجة محتاجة تدخّل` : " · مفيش حاجة مستعجلة"}
          </p>
        </div>
        <Link to="/dashboard" className="shrink-0 text-sm text-accent underline underline-offset-4">
          افتح اللوحة
        </Link>
      </div>
    </Card>
  );
}
