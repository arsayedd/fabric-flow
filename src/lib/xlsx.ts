/**
 * كاتب ملفات Excel — مكتوب بالإيد.
 *
 * ليه مكتوب بالإيد ومش مكتبة جاهزة؟ تلات أسباب:
 *
 * ١. **الملف لازم يكون Excel حقيقي.** الناس هنا بتفتح الملف وتعمل فيه
 *    فلاتر ومجاميع. فمش كفاية CSV مسمّي نفسه Excel — لازم `.xlsx` فيه
 *    أوراق وتنسيق أرقام وصيغ.
 * ٢. **الاتجاه.** الورقة لازم تفتح من اليمين للشمال، ودي خاصية في
 *    `sheetView` بتتكتب في الـXML نفسه.
 * ٣. **الحجم والأمان.** الملف كله ZIP فيه شوية XML. مكتبة لقراءة ملفات
 *    مش محتاجينها — إحنا بنكتب بس، ومابنفتحش ملف جاي من بره خالص.
 *
 * الـZIP بيتكتب بطريقة **stored** (بلا ضغط). ده مسموح في المعيار،
 * وExcel بيفتحه عادي، ويوفّر علينا مكتبة ضغط.
 */

/* ── ١) ZIP ─────────────────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array<ArrayBuffer>): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

type ZipEntry = { name: string; bytes: Uint8Array<ArrayBuffer> };

/** ZIP بلا ضغط: كل ملف بيتكتب كما هو مع CRC، وبعدهم الفهرس */
function zip(entries: ZipEntry[]): Blob {
  const enc = new TextEncoder();
  const locals: Uint8Array<ArrayBuffer>[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.bytes);
    const size = e.bytes.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // نسخة مطلوبة
    lv.setUint16(6, 0x0800, true); // الأسماء UTF-8
    lv.setUint16(8, 0, true); // stored
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    locals.push(local, e.bytes);

    const dir = new Uint8Array(46 + name.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(8, 0x0800, true);
    dv.setUint16(10, 0, true);
    dv.setUint32(16, crc, true);
    dv.setUint32(20, size, true);
    dv.setUint32(24, size, true);
    dv.setUint16(28, name.length, true);
    dv.setUint32(42, offset, true);
    dir.set(name, 46);
    central.push(dir);

    offset += local.length + size;
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...locals, ...central, end], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/* ── ٢) الخلايا والأنماط ────────────────────────────────────────── */

/** نوع الخلية بيحدد التنسيق في Excel — مش بس شكلها */
export type CellKind = "text" | "money" | "qty" | "num2" | "pct" | "date" | "code";

export type Cell =
  | { kind: CellKind; value: string | number | null }
  | { kind: "formula"; formula: string; as: CellKind }
  | { kind: "blank" };

export type SheetRowStyle = "normal" | "header" | "total" | "subtotal" | "title" | "note";

export type SheetRow = { style?: SheetRowStyle; cells: Cell[] };

export type Sheet = {
  name: string;
  rows: SheetRow[];
  /** عرض الأعمدة بالحروف — Excel بيقيس بعرض الحرف مش بالبكسل */
  widths?: number[];
  /** الصف اللي فيه العناوين (بيتثبّت ويتحط عليه فلتر) — من ١ */
  headerRow?: number;
  /** عدد أعمدة الفلتر، من عمود ١ */
  filterCols?: number;
};

/* أرقام الأنماط ثابتة، ومكتوبة في styles.xml بنفس الترتيب */
const FMT: Record<CellKind, number> = { text: 0, code: 0, money: 164, qty: 165, num2: 166, pct: 167, date: 168 };
const XF: Record<string, number> = {
  "normal:text": 0,
  "normal:code": 0,
  "normal:money": 1,
  "normal:qty": 2,
  "normal:num2": 3,
  "normal:pct": 4,
  "normal:date": 5,
  "header:text": 6,
  "total:text": 7,
  "total:money": 8,
  "total:qty": 9,
  "total:num2": 10,
  "total:pct": 11,
  "total:date": 7,
  "total:code": 7,
  "subtotal:text": 12,
  "subtotal:money": 13,
  "subtotal:qty": 14,
  "subtotal:num2": 15,
  "subtotal:pct": 16,
  "subtotal:date": 12,
  "subtotal:code": 12,
  "title:text": 17,
  "note:text": 18,
};

function xfFor(style: SheetRowStyle, kind: CellKind): number {
  if (style === "header") return XF["header:text"];
  if (style === "title") return XF["title:text"];
  if (style === "note") return XF["note:text"];
  return XF[`${style}:${kind}`] ?? XF[`normal:${kind}`] ?? 0;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="5">
<numFmt numFmtId="${FMT.money}" formatCode="#,##0.00"/>
<numFmt numFmtId="${FMT.qty}" formatCode="#,##0"/>
<numFmt numFmtId="${FMT.num2}" formatCode="#,##0.00"/>
<numFmt numFmtId="${FMT.pct}" formatCode="0.0%"/>
<numFmt numFmtId="${FMT.date}" formatCode="yyyy\\-mm\\-dd"/>
</numFmts>
<fonts count="4">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><name val="Calibri"/></font>
<font><sz val="9"/><color rgb="FF6B7280"/><name val="Calibri"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF4EFE6"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFD59A3C"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="19">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="${FMT.money}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="${FMT.qty}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="${FMT.num2}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="${FMT.pct}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="${FMT.date}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="${FMT.money}" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/>
<xf numFmtId="${FMT.qty}" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/>
<xf numFmtId="${FMT.num2}" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/>
<xf numFmtId="${FMT.pct}" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="${FMT.money}" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="${FMT.qty}" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="${FMT.num2}" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="${FMT.pct}" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/* ── ٣) بناء الملف ──────────────────────────────────────────────── */

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Excel بيرفض ملف فيه محارف تحكم
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

/** حرف العمود: ١ → A، ٢٧ → AA */
export function colName(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** تاريخ Excel = عدد الأيام من ١٨٩٩-١٢-٣٠ */
function dateSerial(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round(ms / 86400000) + 25569;
}

function cellXml(ref: string, cell: Cell, style: SheetRowStyle): string {
  if (cell.kind === "blank") return "";

  if (cell.kind === "formula") {
    const s = xfFor(style, cell.as);
    return `<c r="${ref}" s="${s}"><f>${esc(cell.formula)}</f></c>`;
  }

  const s = xfFor(style, cell.kind);
  const v = cell.value;
  if (v === null || v === "") return `<c r="${ref}" s="${s}"/>`;

  if (cell.kind === "date" && typeof v === "string") {
    const serial = dateSerial(v);
    return serial === null
      ? `<c r="${ref}" s="${s}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`
      : `<c r="${ref}" s="${s}"><v>${serial}</v></c>`;
  }

  if (typeof v === "number" && Number.isFinite(v) && cell.kind !== "text" && cell.kind !== "code") {
    return `<c r="${ref}" s="${s}"><v>${cell.kind === "pct" ? v / 100 : v}</v></c>`;
  }

  return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const rows = sheet.rows
    .map((row, i) => {
      const n = i + 1;
      const cells = row.cells
        .map((c, j) => cellXml(`${colName(j + 1)}${n}`, c, row.style ?? "normal"))
        .join("");
      return `<row r="${n}">${cells}</row>`;
    })
    .join("");

  const maxCols = Math.max(1, ...sheet.rows.map((r) => r.cells.length));
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths
        .slice(0, maxCols)
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join("")}</cols>`
    : "";

  // التثبيت بيخلي العناوين ثابتة وإنت بتنزل في آلاف الصفوف
  const freeze =
    sheet.headerRow && sheet.headerRow > 0
      ? `<pane ySplit="${sheet.headerRow}" topLeftCell="A${sheet.headerRow + 1}" activePane="bottomLeft" state="frozen"/>`
      : "";

  const filter =
    sheet.headerRow && sheet.filterCols
      ? `<autoFilter ref="A${sheet.headerRow}:${colName(sheet.filterCols)}${sheet.rows.length}"/>`
      : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView rightToLeft="1" workbookViewId="0">${freeze}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
${cols}
<sheetData>${rows}</sheetData>
${filter}
</worksheet>`;
}

/** اسم الورقة في Excel: ٣١ حرف، ومفيش `: \ / ? * [ ]` */
function safeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[:\\/?*[\]]/g, " ").slice(0, 31).trim() || "ورقة";
  let out = base;
  let i = 2;
  while (used.has(out)) out = `${base.slice(0, 28)} ${i++}`;
  used.add(out);
  return out;
}

export function buildXlsx(sheets: Sheet[]): Blob {
  const used = new Set<string>();
  const named = sheets.map((s) => ({ ...s, name: safeSheetName(s.name, used) }));
  const enc = new TextEncoder();

  const entries: ZipEntry[] = [
    {
      name: "[Content_Types].xml",
      bytes: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${named
  .map(
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  )
  .join("")}
</Types>`),
    },
    {
      name: "_rels/.rels",
      bytes: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    },
    {
      name: "xl/workbook.xml",
      bytes: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<workbookPr/>
<sheets>${named
        .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets>
</workbook>`),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      bytes: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${named
  .map(
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  )
  .join("")}
<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    },
    { name: "xl/styles.xml", bytes: enc.encode(STYLES_XML) },
    ...named.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, bytes: enc.encode(sheetXml(s)) })),
  ];

  return zip(entries);
}
