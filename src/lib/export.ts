import { buildXlsx, colName, type Cell, type Sheet, type SheetRow } from "./xlsx";
import { cairoToday, formatDate, money, qty } from "./utils";

/**
 * التصدير في صنعة.
 *
 * القاعدة: **مفيش قائمة في النظام بلا تصدير.** وعشان دي تبقى قاعدة مش
 * وعد، التصدير مش مكتوب في كل شاشة على حدة — كل شاشة بتوصف بياناتها
 * كـ`Dataset` واحد، والتصدير بياخد الوصف ده ويطلّع منه Excel و CSV
 * وطباعة ونسخ ومشاركة.
 *
 * وفي الـExcel إحنا مش بنفرّغ الصفوف وخلاص:
 *
 * - **الأعمدة اللي المستخدم شايفها** بترتيبها، مش كل أعمدة الداتابيز.
 * - **الفلاتر الحالية** مكتوبة في ورقة الملخص، عشان اللي يفتح الملف
 *   بعد شهر يعرف الرقم ده كان على إيه.
 * - **المجاميع كصيغ حقيقية** (`SUM`/`SUBTOTAL`) مش أرقام مطبوعة، فلو
 *   حد فلتر في Excel المجموع يتغيّر معاه.
 * - **تجميع بمجاميع فرعية** لو الـDataset بيقول نجمّع بعمود.
 * - **ورقة ملخص + ورقة تفاصيل** منفصلين.
 */

/* ── ١) وصف البيانات ───────────────────────────────────────────── */

export type ColType = "text" | "code" | "money" | "qty" | "num2" | "pct" | "date";

export type ExportCol = {
  key: string;
  label: string;
  type: ColType;
  /** عرض العمود في Excel بالحروف */
  width?: number;
  /** المجموع في آخر الجدول: جمع، أو متوسط، أو بلا */
  total?: "sum" | "avg";
};

export type ExportRow = Record<string, string | number | null>;

export type ExportDataset = {
  key: string;
  title: string;
  subtitle?: string;
  cols: ExportCol[];
  rows: ExportRow[];
  /** الفلاتر اللي البيانات دي اتطلعت بيها — بتتكتب في الملف */
  filters?: { label: string; value: string }[];
  /** عمود التجميع: بيطلّع مجاميع فرعية في Excel والطباعة */
  groupBy?: string;
  /** أرقام إضافية للملخص */
  summary?: { label: string; value: string }[];
  /** الحدود والتحفّظات — بتتكتب في آخر الملف بدل ما تتنسى */
  notes?: string[];
};

/* ── ٢) التنسيق للعرض والطباعة ─────────────────────────────────── */

export function formatCell(value: string | number | null, type: ColType): string {
  if (value === null || value === "") return "—";
  if (typeof value === "number") {
    if (type === "money") return money(value);
    if (type === "qty") return qty(value, 0);
    if (type === "num2") return qty(value, 2);
    if (type === "pct") return `${qty(value, 1)}٪`;
  }
  if (type === "date") return formatDate(String(value));
  return String(value);
}

/** النص الخام للملفات: بلا رموز عملة وبأرقام لاتينية عشان Excel و CSV يحسبوا */
function plain(value: string | number | null, type: ColType): string {
  if (value === null) return "";
  if (typeof value === "number") {
    if (type === "pct") return String(Math.round(value * 100) / 100);
    if (type === "money" || type === "num2") return String(Math.round(value * 100) / 100);
    return String(value);
  }
  return String(value);
}

export function totalsOf(ds: ExportDataset): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of ds.cols) {
    if (!c.total) continue;
    const nums = ds.rows.map((r) => r[c.key]).filter((v): v is number => typeof v === "number");
    if (!nums.length) continue;
    const sum = nums.reduce((s, n) => s + n, 0);
    out.set(c.key, c.total === "avg" ? sum / nums.length : sum);
  }
  return out;
}

/** الصفوف مقسّمة على عمود التجميع، بترتيب أول ظهور */
export function groupsOf(ds: ExportDataset): { label: string; rows: ExportRow[] }[] {
  if (!ds.groupBy) return [{ label: "", rows: ds.rows }];
  const map = new Map<string, ExportRow[]>();
  for (const r of ds.rows) {
    const key = String(r[ds.groupBy] ?? "بدون");
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }
  return [...map.entries()].map(([label, rows]) => ({ label, rows }));
}

/* ── ٣) CSV و TSV ──────────────────────────────────────────────── */

function delimited(ds: ExportDataset, sep: string, quote: boolean): string {
  const cell = (s: string) => (quote && /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines: string[] = [];

  lines.push(cell(ds.title));
  if (ds.subtitle) lines.push(cell(ds.subtitle));
  for (const f of ds.filters ?? []) lines.push([cell(f.label), cell(f.value)].join(sep));
  lines.push("");

  lines.push(ds.cols.map((c) => cell(c.label)).join(sep));
  for (const r of ds.rows) lines.push(ds.cols.map((c) => cell(plain(r[c.key], c.type))).join(sep));

  const totals = totalsOf(ds);
  if (totals.size) {
    lines.push(
      ds.cols
        .map((c, i) => (i === 0 ? cell("الإجمالي") : totals.has(c.key) ? cell(plain(totals.get(c.key)!, c.type)) : ""))
        .join(sep),
    );
  }

  for (const n of ds.notes ?? []) lines.push(cell(n));
  return lines.join("\r\n");
}

/** CSV بعلامة BOM — بدونها Excel بيفتح العربي حروف مكسّرة */
export function toCsv(ds: ExportDataset): string {
  return "\uFEFF" + delimited(ds, ",", true);
}

export function toTsv(ds: ExportDataset): string {
  return delimited(ds, "\t", false);
}

/* ── ٤) Excel ──────────────────────────────────────────────────── */

function cellFor(row: ExportRow, col: ExportCol): Cell {
  const v = row[col.key];
  if (v === null || v === undefined) return { kind: col.type, value: null };
  return { kind: col.type, value: v };
}

/**
 * الملف بورقتين على الأقل: **ملخص** فيه الفلاتر والمجاميع، و**تفاصيل**
 * فيها كل صف. ولو فيه تجميع، بيتطلّع مجاميع فرعية بصيغ `SUBTOTAL`
 * عشان تحترم الفلترة جوه Excel.
 */
export function datasetSheets(ds: ExportDataset, meta: { factory: string; user: string }): Sheet[] {
  const totals = totalsOf(ds);

  const summary: SheetRow[] = [
    { style: "title", cells: [{ kind: "text", value: ds.title }] },
    { cells: [{ kind: "text", value: ds.subtitle ?? "" }] },
    { cells: [] },
    { cells: [{ kind: "text", value: "المصنع" }, { kind: "text", value: meta.factory }] },
    { cells: [{ kind: "text", value: "تاريخ التصدير" }, { kind: "date", value: cairoToday() }] },
    { cells: [{ kind: "text", value: "طلبه" }, { kind: "text", value: meta.user }] },
    { cells: [{ kind: "text", value: "عدد الصفوف" }, { kind: "qty", value: ds.rows.length }] },
  ];

  if (ds.filters?.length) {
    summary.push({ cells: [] }, { style: "header", cells: [{ kind: "text", value: "الفلاتر" }, { kind: "text", value: "" }] });
    for (const f of ds.filters) {
      summary.push({ cells: [{ kind: "text", value: f.label }, { kind: "text", value: f.value }] });
    }
  }

  if (ds.summary?.length) {
    summary.push({ cells: [] }, { style: "header", cells: [{ kind: "text", value: "أرقام مختصرة" }, { kind: "text", value: "" }] });
    for (const s of ds.summary) {
      summary.push({ cells: [{ kind: "text", value: s.label }, { kind: "text", value: s.value }] });
    }
  }

  if (totals.size) {
    summary.push({ cells: [] }, { style: "header", cells: [{ kind: "text", value: "المجاميع" }, { kind: "text", value: "" }] });
    for (const c of ds.cols) {
      if (!totals.has(c.key)) continue;
      summary.push({
        style: "total",
        cells: [
          { kind: "text", value: c.total === "avg" ? `${c.label} (متوسط)` : c.label },
          { kind: c.type, value: totals.get(c.key)! },
        ],
      });
    }
  }

  if (ds.notes?.length) {
    summary.push({ cells: [] }, { style: "header", cells: [{ kind: "text", value: "حدود البيانات" }, { kind: "text", value: "" }] });
    for (const n of ds.notes) summary.push({ style: "note", cells: [{ kind: "text", value: n }] });
  }

  const detail: SheetRow[] = [{ style: "header", cells: ds.cols.map((c) => ({ kind: "text" as const, value: c.label })) }];
  const groups = groupsOf(ds);
  const dataRows: number[] = [];

  for (const g of groups) {
    if (ds.groupBy && g.label) {
      detail.push({
        style: "subtotal",
        cells: [{ kind: "text", value: g.label }, ...ds.cols.slice(1).map(() => ({ kind: "blank" as const }))],
      });
    }
    const first = detail.length + 1;
    for (const r of g.rows) detail.push({ cells: ds.cols.map((c) => cellFor(r, c)) });
    const last = detail.length;
    if (ds.groupBy && g.label && g.rows.length) {
      detail.push({
        style: "subtotal",
        cells: ds.cols.map((c, i) =>
          i === 0
            ? { kind: "text" as const, value: `مجموع ${g.label}` }
            : c.total
              ? { kind: "formula" as const, formula: `SUBTOTAL(9,${colName(i + 1)}${first}:${colName(i + 1)}${last})`, as: c.type }
              : { kind: "blank" as const },
        ),
      });
    }
    for (let r = first; r <= last; r++) dataRows.push(r);
  }

  if (totals.size && dataRows.length) {
    const from = dataRows[0];
    const to = dataRows[dataRows.length - 1];
    detail.push({
      style: "total",
      cells: ds.cols.map((c, i) =>
        i === 0
          ? { kind: "text" as const, value: "الإجمالي" }
          : totals.has(c.key)
            ? {
                kind: "formula" as const,
                // SUBTOTAL مش SUM: لو فلترت في Excel، المجموع يمشي مع الفلتر
                formula: `SUBTOTAL(${c.total === "avg" ? 101 : 109},${colName(i + 1)}${from}:${colName(i + 1)}${to})`,
                as: c.type,
              }
            : { kind: "blank" as const },
      ),
    });
  }

  return [
    { name: "ملخص", rows: summary, widths: [26, 46] },
    {
      name: "تفاصيل",
      rows: detail,
      widths: ds.cols.map((c) => c.width ?? (c.type === "text" ? 22 : 14)),
      headerRow: 1,
      filterCols: ds.cols.length,
    },
  ];
}

/* ── ٥) التنزيل والمشاركة ──────────────────────────────────────── */

export function safeFileName(title: string): string {
  return `${title.replace(/[\\/:*?"<>|]/g, " ").trim().slice(0, 60)} — ${cairoToday()}`;
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  // الإفراج بعد لحظة: بعض المتصفحات بتلغي التنزيل لو الرابط اتلغى بسرعة
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadCsv(ds: ExportDataset) {
  saveBlob(new Blob([toCsv(ds)], { type: "text/csv;charset=utf-8" }), `${safeFileName(ds.title)}.csv`);
}

export function downloadXlsx(ds: ExportDataset, meta: { factory: string; user: string }) {
  saveBlob(buildXlsx(datasetSheets(ds, meta)), `${safeFileName(ds.title)}.xlsx`);
}

export async function copyDataset(ds: ExportDataset): Promise<void> {
  const text = toTsv(ds);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // متصفح قديم أو صفحة مش آمنة: نرجع لطريقة الـtextarea
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.append(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
}

type ShareKind = "xlsx" | "csv";

/**
 * المشاركة بملف حقيقي لو المتصفح يقدر (الموبايل غالبًا)، وإلا تنزيل.
 * مابنبعتش حاجة لحد بدون علمه — دي مشاركة بيد المستخدم.
 */
export async function shareDataset(
  ds: ExportDataset,
  meta: { factory: string; user: string },
  kind: ShareKind = "xlsx",
): Promise<"shared" | "downloaded"> {
  const name = `${safeFileName(ds.title)}.${kind}`;
  const blob =
    kind === "xlsx"
      ? buildXlsx(datasetSheets(ds, meta))
      : new Blob([toCsv(ds)], { type: "text/csv;charset=utf-8" });
  const file = new File([blob], name, { type: blob.type });

  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: ds.title, text: ds.subtitle ?? ds.title });
      return "shared";
    } catch (e) {
      // إلغاء المستخدم مش خطأ
      if (e instanceof Error && e.name === "AbortError") return "shared";
    }
  }
  saveBlob(blob, name);
  return "downloaded";
}

/** ملخص نصي قصير — بيروح لواتساب أو لبريد، مش الملف نفسه */
export function datasetText(ds: ExportDataset, limit = 12): string {
  const lines = [ds.title];
  if (ds.subtitle) lines.push(ds.subtitle);
  for (const f of ds.filters ?? []) lines.push(`${f.label}: ${f.value}`);
  lines.push("");

  const shown = ds.rows.slice(0, limit);
  const keys = ds.cols.slice(0, 3);
  for (const r of shown) lines.push(keys.map((c) => formatCell(r[c.key], c.type)).join(" · "));
  if (ds.rows.length > shown.length) lines.push(`… وفيه ${qty(ds.rows.length - shown.length, 0)} سطر تاني في الملف.`);

  const totals = totalsOf(ds);
  for (const c of ds.cols) {
    if (totals.has(c.key)) lines.push(`${c.label}: ${formatCell(totals.get(c.key)!, c.type)}`);
  }
  return lines.join("\n");
}

export function whatsappLink(text: string, phone?: string): string {
  const base = phone ? `https://wa.me/${phone.replace(/[^\d]/g, "")}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}

export function mailtoLink(subject: string, body: string, to = ""): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
