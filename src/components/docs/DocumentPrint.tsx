import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isThermal, type Paper } from "@/lib/print";
import { useFactory } from "@/store/context";
import { buildBody } from "@/store/docbuild";
import { DOC_DEFS, DOC_STATUS_LABEL, DOC_STATUS_TONE, needsApproval, paperFor } from "@/store/documents";
import type { DocType, IssuedDoc } from "@/store/types";
import { PrintDialog } from "./PrintDialog";
import { DocFooter, DocHeader, DocParty, DocReceiptBlock, DocSheet, DocTable, DocTotals } from "./Sheet";

/**
 * معاينة مستند وطباعته.
 *
 * المكوّن ده **مابيصدرش** — بيعرض. الحجز بيحصل في اللحظة اللي المستخدم
 * بيدوس فيها، مش في أثر جانبي وقت الرسم، عشان مايتحجزش رقم لمستند
 * محدش طلبه. ورقم محجوز لمستند مطلعش هو نفسه فجوة في الدفتر.
 */
export function DocumentPrint({
  type,
  refId,
  refExtra,
  doc,
  error,
  onClose,
}: {
  type: DocType;
  refId: string;
  refExtra?: string | null;
  doc: IssuedDoc | null;
  error?: string | null;
  onClose: () => void;
}) {
  const { db, session, approveDoc } = useFactory();
  const def = DOC_DEFS[type];
  const body = useMemo(() => buildBody(db, type, refId, refExtra), [db, type, refId, refExtra]);
  const [paper, setPaper] = useState<Paper>(paperFor(db.settings.docs, type));

  if (!body.ok || error) {
    return (
      <PrintDialog open onClose={onClose} title={def.label} paper="a4" onPaper={() => {}} papers={["a4"]}>
        <DocSheet paper="a4">
          <p className="p-4 text-[12px]">{error ?? body.why}</p>
        </DocSheet>
      </PrintDialog>
    );
  }

  const pending = doc?.status === "pending";
  const waiting = needsApproval(db.settings.docs, type, body.amount);

  return (
    <PrintDialog
      open
      onClose={onClose}
      title={`${def.label}${doc ? ` · ${doc.number}` : ""}`}
      paper={paper}
      onPaper={setPaper}
      actions={
        <>
          {doc ? <Badge tone={DOC_STATUS_TONE[doc.status]}>{DOC_STATUS_LABEL[doc.status]}</Badge> : null}
          {pending ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                try {
                  approveDoc(doc.id);
                  toast.success("اعتمدنا المستند.");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "الاعتماد مانفعش.");
                }
              }}
            >
              اعتماد
            </Button>
          ) : null}
        </>
      }
    >
      <DocSheet paper={paper}>
        <DocHeader
          doc={doc}
          settings={db.settings.docs}
          factoryName={db.factory?.name ?? "المصنع"}
          paper={paper}
          title={body.title}
          meta={body.meta}
        />

        {pending ? (
          <p className="mt-2 border border-black/40 px-2 py-1 text-center text-[11px] font-medium">
            بانتظار موافقة — المستند ده مش نافذ لحد ما يتعمد
          </p>
        ) : null}

        {body.party ? (
          <DocParty label={body.party.label} name={body.party.name} rows={body.party.rows} paper={paper} />
        ) : null}

        <DocTable cols={body.cols} rows={body.rows} paper={paper} />
        {body.totals.length ? <DocTotals rows={body.totals} paper={paper} /> : null}
        {body.receiptBlock && !isThermal(paper) ? <DocReceiptBlock paper={paper} /> : null}

        <DocFooter
          doc={doc}
          settings={db.settings.docs}
          paper={paper}
          note={body.note ?? (waiting && !pending ? "المستند ده فوق حد الموافقة، فاتعمد قبل الإصدار." : undefined)}
        />

        {/* اللي طبع مكتوب على الورقة: الورق بيتنقل، والمسؤولية بتتنقل معاه */}
        {!isThermal(paper) ? (
          <p className="mt-1 text-center text-[8px] text-[#999]">طبعه {session?.name ?? "—"}</p>
        ) : null}
      </DocSheet>
    </PrintDialog>
  );
}

/**
 * زر المستند.
 *
 * الدوسة هي اللي بتحجز الرقم: لو السجل ليه مستند شغّال بيرجع بنفس
 * رقمه (طبعة تانية مش مستند تاني)، ولو لأ بياخد الرقم الجاي.
 */
export function DocumentButton({
  type,
  refId,
  refExtra,
  label,
  variant = "outline",
  size = "sm",
}: {
  type: DocType;
  refId: string;
  refExtra?: string | null;
  label?: string;
  variant?: "outline" | "ghost" | "default" | "gold";
  size?: "sm" | "default";
}) {
  const { db, can, issueDoc } = useFactory();
  const [open, setOpen] = useState<{ doc: IssuedDoc | null; error: string | null } | null>(null);
  const def = DOC_DEFS[type];
  if (!can.do(def.perm, "export")) return null;

  const start = () => {
    const body = buildBody(db, type, refId, refExtra);
    if (!body.ok) {
      setOpen({ doc: null, error: body.why ?? "المستند ده مش ممكن يطلع من السجل ده." });
      return;
    }
    try {
      setOpen({ doc: issueDoc({ type, refId, refExtra, amount: body.amount }), error: null });
    } catch (e) {
      setOpen({ doc: null, error: e instanceof Error ? e.message : "مش قادر أصدر المستند." });
    }
  };

  return (
    <>
      <Button variant={variant} size={size} onClick={start}>
        {label ?? def.label}
      </Button>
      {open ? (
        <DocumentPrint
          type={type}
          refId={refId}
          refExtra={refExtra}
          doc={open.doc}
          error={open.error}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}
