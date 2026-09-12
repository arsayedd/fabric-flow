import { useState } from "react";
import { Ban, Copy, ExternalLink, Eye, Link2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Choice, Field, Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { qrPath } from "@/lib/qr";
import { cairoToday, formatDate, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { grantOfParty, portalUrl, portalWhatsapp, PORTAL_SCOPE_KEYS, PORTAL_SCOPE_LABEL } from "@/store/portal";
import type { PortalScope } from "@/store/types";

/**
 * إدارة لينك بورتال العميل — من جوه ملف العميل.
 *
 * مكانه هنا مش في شاشة إعدادات لوحدها، لأن القرار ده بيتاخد وإنت شايف
 * حساب العميل قدامك: بتفتح اللينك وإنت عارف هو عليه كام وبيتأخر قد إيه.
 *
 * والشاشة بتقول الحقيقة عن حدود الميزة دلوقتي: الدفتر محفوظ على الجهاز،
 * فاللينك مايفتحش على موبايل العميل لسه. إخفاء ده كان معناه إن صاحب
 * المصنع يبعت لعملائه لينك مايشتغلش ويكتشف بنفسه.
 */
export function PortalLinkCard({ partyId }: { partyId: string }) {
  const { db, can, issuePortalLink, revokePortalLink, setPortalScope, setPortalExpiry } = useFactory();
  const [qrOpen, setQrOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [reason, setReason] = useState("");

  const party = db.parties.find((p) => p.id === partyId);
  const grant = grantOfParty(db, partyId);
  const revoked = (db.portalGrants ?? [])
    .filter((g) => g.partyId === partyId && g.revokedAt)
    .sort((a, b) => (b.revokedAt ?? "").localeCompare(a.revokedAt ?? ""));

  /* الشرط المزدوج زي الميوتيشن بالحرف: اللينك بيعرض أرقام مالية */
  const allowed = can.do("parties", "edit") && can.do("finance", "view");
  if (!party) return null;

  const url = grant ? portalUrl(location.origin, grant.token) : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("اللينك اتنسخ");
    } catch {
      /* المتصفح بيرفض النسخ في سياقات كتير — نوريه اللينك يختاره بإيده */
      toast.error("المتصفح مارضيش ينسخ — اختار اللينك من الخانة وانسخه بإيدك");
    }
  };

  const create = () => {
    try {
      issuePortalLink(partyId);
      toast.success("اللينك اتفتح — انسخه وابعته للعميل");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادرين نفتح اللينك");
    }
  };

  const doRevoke = () => {
    if (!grant) return;
    try {
      revokePortalLink(grant.id, reason);
      setRevokeOpen(false);
      setReason("");
      toast.success("اللينك اتوقف — بقى مايفتحش لحد");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادرين نوقف اللينك");
    }
  };

  const toggle = (key: keyof PortalScope) => {
    if (!grant) return;
    const next = { ...grant.scope, [key]: !grant.scope[key] };
    try {
      setPortalScope(grant.id, next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادرين نعدّل النطاق");
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base">
            <Link2 aria-hidden className="size-4 text-muted-foreground" />
            لينك العميل
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            لينك خاص بـ{party.name} يشوف منه توريداته واللي سدّده واللي عليه — بدون كلمة سر.
          </p>
        </div>
        {grant ? <Badge tone="ok">شغّال</Badge> : null}
      </div>

      {!allowed ? (
        <p className="mt-3 text-sm text-muted-foreground">
          فتح اللينك محتاج صلاحية تعديل العملاء وعرض المالية — اللينك بيعرض أرقام الحساب.
        </p>
      ) : !grant ? (
        <div className="mt-3">
          <Button variant="gold" onClick={create}>
            <Link2 aria-hidden className="size-4" />
            افتح لينك للعميل
          </Button>
          {revoked.length ? (
            <p className="mt-2 text-xs text-muted-foreground">
              كان فيه {qty(revoked.length, 0)} لينك اتوقف قبل كده. اللينك الجديد مالوش علاقة بالقديم — القديم يفضل
              مقفول.
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="لينك بورتال العميل"
              className="latin min-w-0 flex-1 text-xs"
            />
            <Button variant="outline" size="sm" onClick={copy}>
              <Copy aria-hidden className="size-4" />
              انسخ
            </Button>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="whatsapp" size="sm" asChild>
              <a
                href={portalWhatsapp({
                  name: party.name,
                  url,
                  factoryName: db.factory?.name ?? "",
                  phone: party.whatsapp || party.phone,
                })}
                target="_blank"
                rel="noreferrer"
              >
                ابعته واتساب
              </a>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQrOpen(true)}>
              <QrCode aria-hidden className="size-4" />
              كود QR
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden className="size-4" />
                شوفه بعين العميل
              </a>
            </Button>
            <Button variant="dangerGhost" size="sm" onClick={() => setRevokeOpen(true)}>
              <Ban aria-hidden className="size-4" />
              وقّف اللينك
            </Button>
          </div>

          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Eye aria-hidden className="size-3.5" />
            {grant.viewCount
              ? `اتفتح ${qty(grant.viewCount, 0)} مرة · آخر مرة ${formatDate((grant.lastViewedAt ?? "").slice(0, 10))}`
              : "لسه مااتفتحش ولا مرة"}
            {" · "}
            فتحه {grant.createdByName} في {formatDate(grant.createdAt.slice(0, 10))}
          </p>

          <div className="mt-3 border-t border-border pt-3">
            <p className="text-sm text-muted-foreground">العميل يشوف إيه</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PORTAL_SCOPE_KEYS.map((key) => {
                const on = grant.scope[key];
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(key)}
                    className={`rounded-full border px-3 py-1.5 text-xs ${
                      on ? "border-ok/40 bg-ok-soft text-ok" : "border-border text-muted-foreground"
                    }`}
                  >
                    {PORTAL_SCOPE_LABEL[key]}
                  </button>
                );
              })}
            </div>

            <label className="mt-3 block text-sm">
              <span className="mb-1.5 block text-muted-foreground">اللينك يبطّل امتى (اختياري)</span>
              <Input
                type="date"
                min={cairoToday()}
                value={grant.expiresAt ?? ""}
                onChange={(e) => {
                  try {
                    setPortalExpiry(grant.id, e.target.value || null);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "التاريخ مش مقبول");
                  }
                }}
                className="max-w-48"
              />
            </label>
          </div>

          <p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            اللينك بيشتغل دلوقتي على الأجهزة اللي فيها بيانات المصنع بس — الدفتر لسه محفوظ على الجهاز مش على سيرفر.
            أول ما البيانات تتحول للسيرفر، نفس اللينك يفتح مع العميل من موبايله من غير ما تعمل حاجة.
          </p>
        </>
      )}

      {grant ? (
        <Panel open={qrOpen} title="كود اللينك" onClose={() => setQrOpen(false)}>
          <Qr text={url} />
          <p className="mt-3 text-sm text-muted-foreground">
            العميل يمسح الكود من موبايله فيفتح حسابه. ينفع يتطبع ويتحط على الفاتورة.
          </p>
        </Panel>
      ) : null}

      {grant ? (
        <Panel
          open={revokeOpen}
          title="توقيف اللينك"
          onClose={() => setRevokeOpen(false)}
          footer={
            <Button variant="danger" onClick={doRevoke} disabled={!reason.trim()}>
              وقّف اللينك
            </Button>
          }
        >
          <p className="mb-3 text-sm text-muted-foreground">
            اللينك هيبطّل يفتح على طول. بس هو مبعوت للعميل في واتساب، فمش هينمسح من موبايله — فبنسجّل السبب عشان
            يفضل واضح إيه اللي حصل ولمين.
          </p>
          <Choice label="اللينك بيتوقف ولا بينمسح؟">
            <p className="text-sm">بيتوقف. السجل بيفضل بتاريخ التوقيف والسبب، وينفع تفتح لينك جديد بعد كده.</p>
          </Choice>
          <Field label="سبب التوقيف">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="مثلًا: العميل طلب نبعته على رقم تاني"
            />
          </Field>
        </Panel>
      ) : null}

      {revoked.length ? (
        <details className="mt-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer">لينكات اتوقفت ({qty(revoked.length, 0)})</summary>
          <ul className="mt-2 space-y-1">
            {revoked.map((g) => (
              <li key={g.id}>
                اتوقف {formatDate((g.revokedAt ?? "").slice(0, 10))}
                {g.revokedReason ? ` — ${g.revokedReason}` : ""}
                {g.viewCount ? ` · كان اتفتح ${qty(g.viewCount, 0)} مرة` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}

/** نفس مسار الـSVG اللي على المستندات — مافيش canvas ولا صورة تتحمّل */
function Qr({ text }: { text: string }) {
  const { path, size } = qrPath(text);
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="كود اللينك"
      className="mx-auto h-52 w-52 rounded-lg bg-white p-2"
    >
      <path d={path} fill="#0F1720" />
    </svg>
  );
}
