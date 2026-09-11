import { useState } from "react";
import { formatDate, moneyPlain, qty } from "@/lib/utils";
import { cairoToday } from "@/lib/utils";
import type { Paper } from "@/lib/print";
import { formatCell, groupsOf, totalsOf, type ExportDataset } from "@/lib/export";
import { PrintDialog } from "@/components/docs/PrintDialog";
import { DocFooter, DocHeader, DocSheet } from "@/components/docs/Sheet";
import { useFactory } from "@/store/context";

/**
 * طباعة أي جدول.
 *
 * التقرير المطبوع مش صورة للشاشة: بترويسة المصنع، **والفلاتر مكتوبة
 * فوق** — لأن ورقة فيها أرقام بلا الفترة ولا الفلتر اللي طلّعها هي
 * ورقة مالهاش معنى بعد أسبوع. والمجاميع الفرعية بتطلع مع التجميع زي
 * ما هي على الشاشة.
 */
export function TablePrint({ dataset, onClose }: { dataset: ExportDataset; onClose: () => void }) {
  const { db, session } = useFactory();
  const [paper, setPaper] = useState<Paper>("a4");
  const docs = db.settings.docs;
  const totals = totalsOf(dataset);
  const groups = groupsOf(dataset);
  const wide = dataset.cols.length > 6;

  return (
    <PrintDialog
      open
      onClose={onClose}
      title={`طباعة: ${dataset.title}`}
      paper={paper}
      onPaper={setPaper}
      papers={["a4", "a5"]}
    >
      <DocSheet paper={paper}>
        <DocHeader
          doc={null}
          settings={docs}
          factoryName={db.factory?.name ?? "المصنع"}
          paper={paper}
          title={dataset.title}
          meta={[
            { label: "التاريخ", value: formatDate(cairoToday()) },
            { label: "عدد الصفوف", value: qty(dataset.rows.length, 0) },
          ]}
        />

        {dataset.subtitle ? <p className="mt-2 text-[11px] text-[#555]">{dataset.subtitle}</p> : null}

        {dataset.filters?.length ? (
          <section className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 rounded border border-black/15 bg-[#faf7f1] p-2 text-[10px]">
            {dataset.filters.map((f) => (
              <span key={f.label}>
                <span className="text-[#666]">{f.label}: </span>
                {f.value}
              </span>
            ))}
          </section>
        ) : null}

        {dataset.summary?.length ? (
          <section className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
            {dataset.summary.map((s) => (
              <span key={s.label}>
                <span className="text-[#666]">{s.label}: </span>
                <span className="font-medium">{s.value}</span>
              </span>
            ))}
          </section>
        ) : null}

        <table className="mt-3 w-full border-collapse" style={{ fontSize: wide ? "9px" : "10.5px" }}>
          <thead>
            <tr className="bg-[#F4EFE6]">
              {dataset.cols.map((c) => (
                <th
                  key={c.key}
                  className={`border border-black/15 px-1 py-1 font-medium ${c.type === "text" || c.type === "code" ? "text-right" : "text-left"}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <>
                {dataset.groupBy && g.label ? (
                  <tr key={`g-${g.label}`}>
                    <th
                      colSpan={dataset.cols.length}
                      className="border border-black/15 bg-[#efe9dc] px-1 py-1 text-right font-medium"
                    >
                      {g.label} · {qty(g.rows.length, 0)} سطر
                    </th>
                  </tr>
                ) : null}
                {g.rows.map((r, i) => (
                  <tr key={`${g.label}-${i}`}>
                    {dataset.cols.map((c) => (
                      <td
                        key={c.key}
                        className={`border border-black/15 px-1 py-0.5 ${c.type === "text" || c.type === "code" ? "text-right" : "tabular text-left"}`}
                      >
                        {formatCell(r[c.key], c.type)}
                      </td>
                    ))}
                  </tr>
                ))}
                {dataset.groupBy && g.label && totals.size ? (
                  <tr key={`s-${g.label}`}>
                    {dataset.cols.map((c, i) => {
                      const nums = g.rows.map((r) => r[c.key]).filter((v): v is number => typeof v === "number");
                      const sum = nums.reduce((s, n) => s + n, 0);
                      return (
                        <td
                          key={c.key}
                          className={`border border-black/15 px-1 py-0.5 font-medium ${c.type === "text" || c.type === "code" ? "text-right" : "tabular text-left"}`}
                        >
                          {i === 0 ? `مجموع ${g.label}` : c.total && nums.length ? formatCell(c.total === "avg" ? sum / nums.length : sum, c.type) : ""}
                        </td>
                      );
                    })}
                  </tr>
                ) : null}
              </>
            ))}
            {totals.size ? (
              <tr className="bg-[#F4EFE6]">
                {dataset.cols.map((c, i) => (
                  <td
                    key={c.key}
                    className={`border border-black/15 px-1 py-1 font-medium ${c.type === "text" || c.type === "code" ? "text-right" : "tabular text-left"}`}
                  >
                    {i === 0 ? "الإجمالي" : totals.has(c.key) ? formatCell(totals.get(c.key)!, c.type) : ""}
                  </td>
                ))}
              </tr>
            ) : null}
          </tbody>
        </table>

        {!dataset.rows.length ? <p className="mt-3 text-[11px] text-[#666]">مفيش صفوف بالفلاتر دي.</p> : null}

        {dataset.notes?.length ? (
          <section className="mt-3 border-t border-black/15 pt-2 text-[9px] text-[#666]">
            {dataset.notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </section>
        ) : null}

        <DocFooter
          doc={null}
          settings={docs}
          paper={paper}
          note={`طلبه ${session?.name ?? "—"} · ${dataset.rows.length ? `إجمالي ${moneyPlain(dataset.rows.length)} سطر` : "بلا صفوف"}`}
        />
      </DocSheet>
    </PrintDialog>
  );
}
