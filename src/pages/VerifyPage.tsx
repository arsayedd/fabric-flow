import { Link, useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import { BrandRow } from "@/components/Brand";
import { Card } from "@/components/ui/card";
import { formatDate, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { DOC_DEFS, DOC_STATUS_LABEL, stampMatches } from "@/store/documents";

/**
 * صفحة التحقق من مستند.
 *
 * الـQR على الورقة بيفتح الصفحة دي. وسؤالها واحد: **الورقة اللي في
 * إيدك أصلية ولا ملغية؟** فالعرض مقصود على الحد الأدنى: النوع والرقم
 * والتاريخ والحالة. **مفيش أسطر ولا أسعار ولا اسم عميل** — أي حد ماسك
 * الورقة بيمسح الكود، ومفيش داعي إن ورقة ضايعة تفضح تعاملات المصنع.
 *
 * وحد التطبيق الحالي مكتوب صريح جوه الصفحة: الدفتر محفوظ على الجهاز،
 * فالتحقق بيشتغل على نفس الجهاز أو المتصفح اللي فيه بيانات المصنع.
 * لما الدفتر يبقى على السيرفر، نفس الصفحة بتشتغل لأي حد من أي مكان،
 * والـView جاهزة في `0010_documents.sql`.
 */
export function VerifyPage() {
  const { number = "" } = useParams();
  const [params] = useSearchParams();
  const stamp = params.get("s") ?? "";
  const { db } = useFactory();

  const doc = db.documents.find((d) => d.number === number);
  const known = !!doc;
  const valid = known && doc.status !== "cancelled" && stampMatches(doc) && (!stamp || doc.stamp === stamp);

  const tone = !known ? "warn" : valid ? "ok" : "danger";
  const Icon = !known ? HelpCircle : valid ? CheckCircle2 : XCircle;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-5">
      <div className="mx-auto">
        <BrandRow />
      </div>

      <Card className="text-center">
        <Icon
          aria-hidden
          className={`mx-auto size-10 ${tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-danger"}`}
        />
        <p className="latin tabular mt-3 text-lg">{number}</p>

        {!known ? (
          <>
            <p className="mt-2 font-medium">مش لاقيين المستند ده</p>
            <p className="mt-1 text-sm text-muted-foreground">
              يا إن الرقم مكتوب غلط، يا إن المستند اتصدر من مصنع تاني مش المصنع المفتوح على الجهاز ده.
            </p>
          </>
        ) : valid ? (
          <>
            <p className="mt-2 font-medium text-ok">المستند أصلي وسليم</p>
            <dl className="mt-3 space-y-1 text-right text-sm">
              <Row label="النوع" value={DOC_DEFS[doc.type].label} />
              <Row label="التاريخ" value={formatDate(doc.date)} />
              <Row label="الحالة" value={DOC_STATUS_LABEL[doc.status]} />
              {doc.revision > 1 ? <Row label="رقم المراجعة" value={qty(doc.revision, 0)} /> : null}
            </dl>
          </>
        ) : (
          <>
            <p className="mt-2 font-medium text-danger">
              {doc.status === "cancelled" ? "المستند ده ملغي" : "بيانات الورقة مش مطابقة للدفتر"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {doc.status === "cancelled"
                ? doc.cancelReason
                  ? `سبب الإلغاء المسجّل: ${doc.cancelReason}`
                  : "المستند اتلغى في الدفتر، فمايتعملش عليه أي إجراء."
                : "البصمة المطبوعة على الورقة مش هي المحفوظة في الدفتر. راجع الورقة قبل أي إجراء."}
            </p>
            <dl className="mt-3 space-y-1 text-right text-sm">
              <Row label="النوع" value={DOC_DEFS[doc.type].label} />
              <Row label="التاريخ" value={formatDate(doc.date)} />
              <Row label="الحالة" value={DOC_STATUS_LABEL[doc.status]} />
            </dl>
          </>
        )}
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        التحقق بيقرا من دفتر المصنع المحفوظ على الجهاز ده. لو فتحت الرابط على جهاز تاني، افتح المصنع الأول.
      </p>

      <Link to="/" className="text-center text-sm underline underline-offset-4">
        صنعة
      </Link>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
