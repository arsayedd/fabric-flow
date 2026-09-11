import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { ExportMenu } from "@/components/export/ExportMenu";
import { TablePrint } from "@/components/export/TablePrint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCell, type ExportDataset } from "@/lib/export";
import { normalize, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { AREA_LABEL, DATASETS, datasetOf, type DatasetArea } from "@/store/datasets";

/**
 * مركز التصدير.
 *
 * الشاشة دي مش «صفحة تصدير» تانية جنب الأزرار اللي في الشاشات. دي
 * **الخريطة نفسها معروضة**: كل قائمة في النظام، بعدد صفوفها، ومنها
 * تصدير وطباعة ومعاينة.
 *
 * وفايدتها التانية إنها بتكشف النقص: لو قائمة في النظام مش مسجّلة في
 * الخريطة، مش هتبان هنا — والعدد المكتوب فوق بيخلّي الفرق ملحوظ بدل
 * ما يفضل وعد مكسور في شاشة جوه.
 */
export function ExportsPage() {
  const { db, can } = useFactory();
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState<ExportDataset | null>(null);
  const [printing, setPrinting] = useState<ExportDataset | null>(null);

  const term = normalize(q);
  const allowed = useMemo(() => DATASETS.filter((d) => can.do(d.module, "export")), [can]);
  const list = allowed.filter(
    (d) => !term || normalize(d.title).includes(term) || normalize(d.about).includes(term),
  );

  const areas = [...new Set(list.map((d) => d.area))] as DatasetArea[];
  const counts = useMemo(
    () => Object.fromEntries(allowed.map((d) => [d.key, d.rows(db).length])) as Record<string, number>,
    [allowed, db],
  );
  const totalRows = Object.values(counts).reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl">مركز التصدير والطباعة</h2>
        <p className="text-sm text-muted-foreground">
          مفيش قائمة في صنعة بلا تصدير. كل جدول هنا بيطلع Excel بأعمدته ومجاميعه، أو PDF بترويسة المصنع.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-muted-foreground">جداول متاحة لك</p>
          <p className="mt-1 text-2xl tabular">{qty(allowed.length, 0)}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">إجمالي الصفوف</p>
          <p className="mt-1 text-2xl tabular">{qty(totalRows, 0)}</p>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <p className="text-sm text-muted-foreground">المستندات الرسمية</p>
          <Link to="/documents" className="mt-1 block text-sm underline underline-offset-4">
            دفتر المستندات والترقيم
          </Link>
        </Card>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="دوّر على جدول: أوامر، خامات، تحصيل، كشوف…"
          className="pr-9"
        />
      </div>

      {!list.length ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            {allowed.length
              ? "مفيش جدول بالاسم ده."
              : "صلاحية التصدير مش مفتوحة لك في أي قسم. كلّم صاحب المصنع."}
          </p>
        </Card>
      ) : null}

      {areas.map((area) => (
        <section key={area} className="space-y-2">
          <h3 className="text-base">{AREA_LABEL[area]}</h3>
          <div className="grid gap-2 lg:grid-cols-2">
            {list
              .filter((d) => d.area === area)
              .map((d) => (
                <Card key={d.key}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <p className="font-medium">{d.title}</p>
                        <Badge tone={counts[d.key] ? "muted" : "warn"}>
                          {counts[d.key] ? `${qty(counts[d.key], 0)} سطر` : "فاضي"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{d.about}</p>
                      {d.screen ? (
                        <Link to={d.screen} className="mt-1 inline-block text-xs underline underline-offset-4">
                          افتح الشاشة
                        </Link>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <ExportMenu module={d.module} dataset={() => datasetOf(db, d.key)} />
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!counts[d.key]}
                        onClick={() => setPreview(datasetOf(db, d.key))}
                      >
                        معاينة
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
          </div>
        </section>
      ))}

      {preview ? (
        <PreviewPanel
          dataset={preview}
          onPrint={() => {
            setPrinting(preview);
            setPreview(null);
          }}
          onClose={() => setPreview(null)}
        />
      ) : null}
      {printing ? <TablePrint dataset={printing} onClose={() => setPrinting(null)} /> : null}
    </div>
  );
}

/** أول ٢٠ سطر بالأعمدة اللي هتتصدر — عشان محدش ينزّل ملف ويكتشف إنه غلط */
function PreviewPanel({
  dataset,
  onPrint,
  onClose,
}: {
  dataset: ExportDataset;
  onPrint: () => void;
  onClose: () => void;
}) {
  const shown = dataset.rows.slice(0, 20);
  return (
    <div className="fixed inset-0 z-50">
      <button className="absolute inset-0 bg-[#0f1720]/50" aria-label="إغلاق" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-2xl bg-background shadow-2xl md:inset-4 md:rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="font-medium">{dataset.title}</p>
            <p className="text-xs text-muted-foreground">
              {qty(shown.length, 0)} من {qty(dataset.rows.length, 0)} سطر · {qty(dataset.cols.length, 0)} عمود
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onPrint}>
              طباعة
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              إغلاق
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-right text-muted-foreground">
                {dataset.cols.map((c) => (
                  <th key={c.key} className="whitespace-nowrap px-2 py-1.5 font-medium">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i} className="border-b border-border/60">
                  {dataset.cols.map((c) => (
                    <td
                      key={c.key}
                      className={`whitespace-nowrap px-2 py-1.5 ${c.type === "text" || c.type === "code" ? "" : "tabular"}`}
                    >
                      {formatCell(r[c.key], c.type)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {dataset.notes?.length ? (
            <div className="mt-3 rounded-md bg-muted p-3 text-xs text-muted-foreground">
              {dataset.notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
