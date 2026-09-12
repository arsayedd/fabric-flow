import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Info, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PrintDialog } from "@/components/docs/PrintDialog";
import { LabelSheet } from "@/components/docs/LabelSheet";
import { cn, qty } from "@/lib/utils";
import type { Paper } from "@/lib/print";
import { CODES_NOT_YET, codeText } from "@/store/codes";
import { useFactory } from "@/store/context";
import {
  COPY_COUNTS,
  LABEL_MM,
  LABEL_SIZES,
  LABEL_TYPES,
  MAX_LABELS,
  columnsFor,
  labelModule,
  type LabelRow,
  type LabelSize,
  type LabelType,
} from "@/store/labels";

/**
 * مركز الطباعة.
 *
 * سؤال واحد فوق: **تطبع إيه؟** وبعد ما تختار، تلات قرارات بس — أنهي
 * سجلات، كام نسخة، أنهي مقاس. وبعدها معاينة بمقاس الورقة الحقيقي.
 *
 * وأنواع الليبل اللي لسه مالهاش سجل في الدفتر (رول القماش، الكرتونة،
 * الرف، الماكينة) مكتوبة تحت في قسم منفصل **بسببها**، مش مخفية ولا
 * معروضة كزر بيطلّع ورقة فاضية.
 */

export function LabelsPage() {
  const { db, can } = useFactory();
  const [type, setType] = useState<LabelType | null>(null);
  const types = LABEL_TYPES.filter((t) => can.do(labelModule(t), "view"));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl">مركز الطباعة والليبلات</h2>
        <p className="text-sm text-muted-foreground">
          كل ليبل عليه كود بيفتح السجل نفسه في صنعة — مش بيانات مطبوعة بتقدم.
        </p>
      </div>

      {type ? (
        <Picker type={type} onBack={() => setType(null)} />
      ) : (
        <>
          <Card>
            <h3 className="mb-3 text-base">تطبع إيه؟</h3>
            {types.length ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {types.map((t) => {
                  const count = t.rows(db).length;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setType(t)}
                      disabled={!count}
                      className={cn(
                        "rounded-lg border border-border p-3 text-right transition-colors",
                        count ? "hover:border-gold/60 hover:bg-gold/5" : "opacity-55",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-base">{t.label}</p>
                        <Badge tone={count ? "gold" : "muted"}>{count ? qty(count, 0) : "فاضي"}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{t.about}</p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">دورك مامعاهوش صلاحية يشوف أي قسم فيه ليبلات.</p>
            )}
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base">المستندات والفواتير والإيصالات</h3>
                <p className="text-sm text-muted-foreground">
                  دي مش ليبلات: بتتطبع من دفتر المستندات بترويستها ورقمها وكود التحقق بتاعها.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/documents">
                  <FileText /> دفتر المستندات
                </Link>
              </Button>
            </div>
          </Card>

          <Card>
            <h3 className="mb-2 text-base">أنواع ليبل لسه مالهاش سجل</h3>
            <p className="mb-3 text-sm text-muted-foreground">
              الكود لازم يفتح سجل. الأنواع دي كياناتها نفسها لسه مش في الدفتر، فليبل لها كان هيتمسح ويفتح على لا حاجة.
            </p>
            <ul className="space-y-2 text-sm">
              {CODES_NOT_YET.map((c) => (
                <li key={c.label} className="flex gap-2 rounded-md border border-border/70 p-2.5">
                  <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="block">{c.label}</span>
                    <span className="text-xs text-muted-foreground">محتاج: {c.needs}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

function Picker({ type, onBack }: { type: LabelType; onBack: () => void }) {
  const { db, can } = useFactory();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [copies, setCopies] = useState(1);
  const [size, setSize] = useState<LabelSize>("md");
  const [paper, setPaper] = useState<Paper>("a4");
  const [barcode, setBarcode] = useState(true);
  const [preview, setPreview] = useState(false);

  const all = useMemo(() => type.rows(db), [type, db]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) => `${r.code} ${r.title} ${r.sub}`.toLowerCase().includes(q));
  }, [all, search]);

  const total = picked.size * copies;
  const factoryId = db.factory?.id ?? "";

  const rows: LabelRow[] = useMemo(() => {
    const out: LabelRow[] = [];
    for (const r of all) {
      if (!picked.has(r.id)) continue;
      for (let i = 0; i < copies; i++) {
        out.push({
          key: `${r.id}-${i}`,
          qr: codeText(type.kind, r.id, factoryId, window.location.origin),
          code: r.code,
          title: r.title,
          sub: r.sub,
        });
      }
    }
    return out;
  }, [all, picked, copies, type.kind, factoryId]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const open = () => {
    if (!picked.size) {
      toast.error("اختار سجل واحد على الأقل.");
      return;
    }
    if (total > MAX_LABELS) {
      toast.error(`${qty(total, 0)} ليبل مرة واحدة كتير. اطبع على دفعات — السقف ${qty(MAX_LABELS, 0)}.`);
      return;
    }
    setPreview(true);
  };

  return (
    <>
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-base">{type.label}</h3>
            <p className="text-sm text-muted-foreground">{type.about}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onBack}>
            نوع تاني
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute end-3 top-2.5 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالرقم أو الاسم" className="pe-9" />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button size="sm" variant="outline" onClick={() => setPicked(new Set(shown.map((r) => r.id)))}>
            اختار الظاهر ({qty(shown.length, 0)})
          </Button>
          {picked.size ? (
            <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
              شيل الاختيار
            </Button>
          ) : null}
          <span className="text-muted-foreground">{qty(picked.size, 0)} مختار</span>
        </div>

        <div className="max-h-72 overflow-y-auto rounded-md border border-border">
          {shown.length ? (
            shown.map((r) => (
              <label
                key={r.id}
                className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-0 hover:bg-secondary/50"
              >
                <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} />
                <span className="min-w-0 flex-1">
                  <span className="latin block truncate text-xs">{r.code}</span>
                  <span className="block truncate">{r.title}</span>
                  {r.sub ? <span className="block truncate text-xs text-muted-foreground">{r.sub}</span> : null}
                </span>
              </label>
            ))
          ) : (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">مفيش سجل مطابق للبحث.</p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-sm">عدد النسخ من كل سجل</p>
            <div className="flex flex-wrap gap-1.5">
              {COPY_COUNTS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCopies(c)}
                  className={cn(
                    "tabular rounded-md border px-3 py-1.5 text-sm",
                    c === copies ? "border-accent bg-accent-soft" : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {qty(c, 0)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm">مقاس الليبل</p>
            <div className="flex flex-wrap gap-1.5">
              {LABEL_SIZES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm",
                    s === size ? "border-accent bg-accent-soft" : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {LABEL_MM[s].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={barcode} onChange={(e) => setBarcode(e.target.checked)} />
          اطبع شريط باركود كمان (Code 128) — للقارئ السلكي اللي مابيقراش QR
        </label>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <Button variant="gold" onClick={open} disabled={!can.do(labelModule(type), "export")}>
            <Printer /> معاينة وطباعة
          </Button>
          <p className="text-sm text-muted-foreground">
            {qty(total, 0)} ليبل · {qty(columnsFor(paper, size), 0)} في عرض الورقة
          </p>
        </div>

        {!can.do(labelModule(type), "export") ? (
          <p className="text-sm text-warn">الطباعة فعل تصدير، ودورك مامعاهوش صلاحية التصدير في القسم ده.</p>
        ) : null}
      </Card>

      {preview ? (
        <PrintDialog
          open
          onClose={() => setPreview(false)}
          title={`طباعة: ${type.label} · ${qty(rows.length, 0)} ليبل`}
          paper={paper}
          onPaper={setPaper}
        >
          <LabelSheet rows={rows} paper={paper} size={size} showBarcode={barcode} />
        </PrintDialog>
      ) : null}
    </>
  );
}
