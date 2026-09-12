import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { ExportMenu } from "@/components/export/ExportMenu";
import { KIND_MODULE } from "@/store/codes";
import { useFactory } from "@/store/context";
import { datasetOf } from "@/store/datasets";
import { scansOf, trace } from "@/store/trace";
import { CODE_KINDS, KIND_LABEL, SCAN_ACTION_LABEL, type CodeKind } from "@/store/types";

/**
 * سلسلة التتبع لسجل واحد.
 *
 * الشاشة دي هي الجواب على «القطعة دي جت منين»: خط واحد من فوق لتحت،
 * كل خطوة بتاريخها ومين عملها. واللي **ناقص** في السلسلة مكتوب تحتها
 * بالصريح — لأن سلسلة تتبع بتوهم إنها كاملة أخطر من واحدة ناقصة
 * ومعترفة.
 */

const SOURCE = { camera: "كاميرا", manual: "مكتوب بالإيد", link: "رابط" };

export function TracePage() {
  const { kind = "", id = "" } = useParams();
  const { db, can } = useFactory();
  const valid = (CODE_KINDS as readonly string[]).includes(kind) ? (kind as CodeKind) : null;

  if (!valid) {
    return <EmptyState icon={AlertTriangle} title="نوع مش معروف" body="الرابط ده مش بيشاور على نوع سجل موجود في صنعة." />;
  }
  if (!can.do(KIND_MODULE[valid], "view")) {
    return <EmptyState icon={AlertTriangle} title="مش من صلاحيتك" body={`تتبع ${KIND_LABEL[valid]} تحت قسم مامعاكش صلاحية تشوفه.`} />;
  }

  const { head, steps, gaps } = trace(db, valid, id);
  const scans = scansOf(db, valid, id);

  if (!head) {
    return <EmptyState icon={AlertTriangle} title="السجل مش موجود" body="يمكن اتمسح، أو الكود من نسخة قديمة من النظام." />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">سلسلة التتبع</h2>
          <p className="text-sm text-muted-foreground">
            {KIND_LABEL[valid]} · <span className="latin">{head.code}</span> · {head.label}
          </p>
        </div>
        <div className="flex gap-2">
          <ExportMenu
            module="audit"
            dataset={() =>
              datasetOf(db, "scans", {
                where: (r) => String(r.code) === head.code,
                filters: [{ label: "السجل", value: head.code }],
              })
            }
            compact
          />
          <Button asChild variant="outline" size="sm">
            <Link to="/scan">
              <ArrowLeft /> مسح كود تاني
            </Link>
          </Button>
        </div>
      </div>

      {steps.length ? (
        <Card>
          <ol className="relative space-y-4 border-s border-border ps-5">
            {steps.map((s) => (
              <li key={s.key} className="relative">
                <span
                  className={`absolute -start-[1.6rem] top-1.5 size-2.5 rounded-full ring-4 ring-card ${s.done ? "bg-ok" : "bg-warn"}`}
                />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-base">{s.title}</p>
                  {s.when ? <span className="text-xs text-muted-foreground tabular">{s.when}</span> : null}
                </div>
                {s.body.map((line, i) => (
                  <p key={i} className="text-sm text-muted-foreground">
                    {line}
                  </p>
                ))}
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                  {s.code ? <span className="latin text-muted-foreground">{s.code}</span> : null}
                  {s.to ? (
                    <Link to={s.to} className="text-accent">
                      افتح السجل
                    </Link>
                  ) : null}
                  {s.kind && s.code ? <Badge tone="muted">{KIND_LABEL[s.kind]}</Badge> : null}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-muted-foreground">مفيش خطوات مسجّلة على السجل ده لسه.</p>
        </Card>
      )}

      <Card>
        <h3 className="mb-2 text-base">مين مسح السجل ده</h3>
        {scans.length ? (
          <div className="space-y-2">
            {scans.map((s) => (
              <div key={s.id} className="rounded-md border border-border/70 p-2.5 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p>
                    {s.actorName} · {SCAN_ACTION_LABEL[s.action]}
                  </p>
                  <span className="text-xs text-muted-foreground tabular">
                    {new Date(s.at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "short", timeStyle: "short" })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {SOURCE[s.source]}
                  {s.qty !== null ? ` · ${s.qty} قطعة` : ""}
                  {s.from || s.to ? ` · ${s.from || "—"} ← ${s.to || "—"}` : ""}
                  {s.note ? ` · ${s.note}` : ""}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            مفيش مسح مسجّل على السجل ده. الخطوات اللي فوق اتسجّلت من الشاشات مش من المسح.
          </p>
        )}
      </Card>

      {gaps.length ? (
        <Card className="border-warn/40">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" />
            <div>
              <h3 className="text-base">اللي السلسلة دي مش عارفة تقوله</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                {gaps.map((g) => (
                  <li key={g} className="flex gap-2">
                    <Info className="mt-0.5 size-3.5 shrink-0" />
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
