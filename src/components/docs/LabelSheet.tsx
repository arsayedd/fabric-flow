import { code128Bars } from "@/lib/barcode";
import { PAPER_WIDTH_MM, isThermal, type Paper } from "@/lib/print";
import { CONTENT_MM, LABEL_MM, LABEL_PAD_MM, columnsFor, type LabelRow, type LabelSize } from "@/store/labels";
import { cn } from "@/lib/utils";
import { qrPath } from "@/lib/qr";


/**
 * ورق الليبلات.
 *
 * الليبل مش مستند: مافيهوش ترويسة ولا توقيع ولا مجاميع. فيه **الكود
 * والرقم واسم الحاجة وسطر واحد يقول هي فين**. أي حرف زيادة بياخد من
 * مساحة الكود، والكود اللي مش حاد مايتقراش من كاميرا في نور المصنع.
 *
 * والورقة بتتقسّم **شبكة** بعدد الليبلات اللي تدخل في عرضها فعلًا،
 * فالورق المطبوع بيتقص على خطوط. الطابعة الحرارية عمود واحد: كل ليبل
 * شريط بمفرده.
 */

export function LabelSheet({
  rows,
  paper,
  size,
  showBarcode,
}: {
  rows: LabelRow[];
  paper: Paper;
  size: LabelSize;
  showBarcode: boolean;
}) {
  const cols = columnsFor(paper, size);
  const thermal = isThermal(paper);
  const mm = LABEL_MM[size];
  const width = thermal ? CONTENT_MM[paper] : mm.w;

  /* الورقة هنا بهامشها الضيق بدل `.sheet-a4`، فالمقاس جوّه بيتقسم صح */
  return (
    <div
      className={cn("sheet", `sheet-${paper}`)}
      style={{ padding: `${LABEL_PAD_MM}mm`, width: `${PAPER_WIDTH_MM[paper]}mm` }}
    >
      <div className="flex flex-wrap" style={{ width: `${width * cols}mm` }}>
        {rows.map((r) => (
          <Label key={r.key} row={r} widthMm={width} heightMm={mm.h} showBarcode={showBarcode} />
        ))}
      </div>
    </div>
  );
}

function Label({
  row,
  widthMm,
  heightMm,
  showBarcode,
}: {
  row: LabelRow;
  widthMm: number;
  heightMm: number;
  showBarcode: boolean;
}) {
  const qr = qrPath(row.qr);
  // الـQR بياخد أقل من نص ارتفاع الليبل، والباقي للنص والشريط
  const qrMm = Math.min(heightMm - 8, widthMm * 0.36);
  const bar = showBarcode ? code128Bars(row.code) : null;
  const small = widthMm < 50;

  return (
    <div
      className="flex items-center gap-1.5 overflow-hidden border border-dashed border-black/25 p-1"
      style={{ width: `${widthMm}mm`, height: `${heightMm}mm`, boxSizing: "border-box" }}
    >
      <svg viewBox={`0 0 ${qr.size} ${qr.size}`} width={`${qrMm}mm`} height={`${qrMm}mm`} shapeRendering="crispEdges">
        <rect width={qr.size} height={qr.size} fill="#fff" />
        <path d={qr.path} fill="#111" />
      </svg>

      <div className="min-w-0 flex-1">
        <p className="latin truncate" style={{ fontSize: small ? "8px" : "10px", letterSpacing: "0.06em" }}>
          {row.code}
        </p>
        <p className="truncate" style={{ fontSize: small ? "8px" : "10px", lineHeight: 1.3 }}>
          {row.title}
        </p>
        {row.sub ? (
          <p className="truncate text-[#555]" style={{ fontSize: small ? "7px" : "8.5px", lineHeight: 1.3 }}>
            {row.sub}
          </p>
        ) : null}

        {bar ? (
          <svg
            viewBox={`0 0 ${bar.units} 20`}
            preserveAspectRatio="none"
            width="100%"
            height={small ? "5mm" : "7mm"}
            shapeRendering="crispEdges"
            className="mt-0.5"
          >
            {bar.bars.map((b, i) => (
              <rect key={i} x={b.x} y={0} width={b.w} height={20} fill="#111" />
            ))}
          </svg>
        ) : null}
      </div>
    </div>
  );
}
