import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PAPER_HINT, PAPER_LABEL, PAPER_SIZES, PAPER_WIDTH_MM, printPaper, type Orientation, type Paper } from "@/lib/print";

/**
 * معاينة الطباعة.
 *
 * اللي على الشاشة هو نفس الورقة اللي بتطلع من الطابعة — نفس المقاس
 * بالمليمتر ونفس الهوامش — مصغّرة بـ`transform` عشان تدخل في الشاشة.
 * التصغير شكلي بس؛ الطباعة بتشيله.
 *
 * والمعاينة هي الطبقة اللي `.print-root` عليها، فـCSS بيشيل باقي
 * الصفحة (القائمة والأزرار) وقت الطباعة. يعني **مفيش طريقة تطبع من
 * غير ما تشوف** — وده مقصود: أوراق المصنع بتتوقّع وتتسلّم، والغلط
 * فيها بيرجع بعد أسبوع.
 */

const MM_TO_PX = 96 / 25.4;

export function PrintDialog({
  open,
  onClose,
  title,
  paper,
  onPaper,
  papers = [...PAPER_SIZES],
  actions,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  paper: Paper;
  onPaper: (p: Paper) => void;
  /** المقاسات المعروضة — بعض المستندات مالهاش معنى على حرارية */
  papers?: Paper[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [scale, setScale] = useState(1);
  const frame = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // الخلفية مابتتحركش ورا المعاينة
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open) return;
    const fit = () => {
      const box = frame.current;
      if (!box) return;
      const width = PAPER_WIDTH_MM[paper] * MM_TO_PX;
      // ٢٤ بكسل هوامش جوه الصندوق، والتصغير لحد ٠٫٣ بس — أقل من كده مش معاينة
      setScale(Math.max(0.3, Math.min(1, (box.clientWidth - 24) / width)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open, paper]);

  if (!open) return null;

  const thermal = paper === "t80" || paper === "t58";

  return createPortal(
    <div className="print-root fixed inset-0 z-50 flex flex-col bg-[#0f1720]/70">
      <div className="print-hide flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <p className="me-auto text-sm font-medium">{title}</p>

        <div className="flex flex-wrap items-center gap-1">
          {papers.map((p) => (
            <button
              key={p}
              onClick={() => onPaper(p)}
              title={PAPER_HINT[p]}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                p === paper
                  ? "border-accent bg-accent-soft text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {PAPER_LABEL[p]}
            </button>
          ))}
        </div>

        {!thermal ? (
          <button
            onClick={() => setOrientation((o) => (o === "portrait" ? "landscape" : "portrait"))}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
          >
            {orientation === "portrait" ? "طولي" : "عرضي"}
          </button>
        ) : null}

        {actions}

        <Button size="sm" variant="gold" onClick={() => printPaper(paper, orientation)}>
          <Printer aria-hidden />
          طباعة
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="إغلاق المعاينة">
          <X aria-hidden />
        </Button>
      </div>

      <div ref={frame} className="flex-1 overflow-auto p-3">
        <div
          className="mx-auto"
          style={{ width: PAPER_WIDTH_MM[paper] * MM_TO_PX * scale }}
        >
          <div className="sheet-preview" style={{ transform: `scale(${scale})` }}>
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
