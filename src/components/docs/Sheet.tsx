import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatDate, moneyPlain, qty } from "@/lib/utils";
import { qrPath, verifyUrl } from "@/lib/qr";
import { isThermal, type Paper } from "@/lib/print";
import type { DocSettings, IssuedDoc } from "@/store/types";
import { DOC_DEFS, DOC_STATUS_LABEL } from "@/store/documents";

/**
 * ورقة المستند.
 *
 * الورقة بتتبنى بمقاسها الحقيقي بالمليمتر، مش بالبكسل — عشان اللي على
 * الشاشة هو اللي بيطلع من الطابعة. والقطع هنا (ترويسة، جدول، مجاميع،
 * توقيعات، QR) مشتركة بين كل المستندات، فأي مستند جديد بيبقى ترتيب
 * قطع موجودة مش صفحة جديدة من الأول.
 *
 * ومقاسات الحرارية (٨٠ و٥٨ مم) شكلها مختلف عن قصد: عمود واحد، بلا
 * جدول بحدود، وخطوط فاصلة منقّطة — لأن الطابعة الحرارية مالهاش ألوان
 * ولا حدود رقيقة، والفاتورة فيها بتطلع شريط.
 */

export function DocSheet({
  paper,
  children,
  className,
}: {
  paper: Paper;
  children: ReactNode;
  className?: string;
}) {
  const map: Record<Paper, string> = {
    a4: "sheet-a4",
    a5: "sheet-a5",
    t80: "sheet-t80",
    t58: "sheet-t58",
  };
  return <div className={cn("sheet", map[paper], className)}>{children}</div>;
}

/* ── الترويسة ──────────────────────────────────────────────────── */

export function DocHeader({
  doc,
  settings,
  factoryName,
  paper,
  title,
  meta,
}: {
  doc: IssuedDoc | null;
  settings: DocSettings | undefined;
  factoryName: string;
  paper: Paper;
  title: string;
  meta?: { label: string; value: ReactNode }[];
}) {
  const thermal = isThermal(paper);
  const legal = settings?.legalName?.trim() || factoryName;
  const lines = [settings?.address, settings?.phone, settings?.email].filter((s) => s?.trim());
  const ids = [
    settings?.taxId?.trim() ? `الرقم الضريبي ${settings.taxId}` : "",
    settings?.commercialReg?.trim() ? `سجل تجاري ${settings.commercialReg}` : "",
  ].filter(Boolean);

  if (thermal) {
    return (
      <header className="border-b border-dashed border-black/40 pb-2 text-center">
        {settings?.logo ? <img src={settings.logo} alt="" className="mx-auto mb-1 h-10 object-contain" /> : null}
        <p className="text-[13px] font-medium">{legal}</p>
        {lines.length ? <p className="text-[10px] leading-snug">{lines.join(" · ")}</p> : null}
        {ids.length ? <p className="text-[10px] leading-snug">{ids.join(" · ")}</p> : null}
        <p className="mt-1 text-[12px] font-medium">{title}</p>
        {doc ? (
          <p className="latin text-[11px]" style={{ letterSpacing: "0.06em" }}>
            {doc.number}
          </p>
        ) : null}
        <p className="text-[10px]">{formatDate(doc?.date ?? "")}</p>
      </header>
    );
  }

  return (
    <header className="flex items-start justify-between gap-4 border-b-2 border-[#D59A3C] pb-3">
      <div className="flex items-start gap-3">
        {settings?.logo ? <img src={settings.logo} alt="" className="h-14 w-14 object-contain" /> : null}
        <div>
          <p className="text-[15px] font-medium">{legal}</p>
          {lines.length ? <p className="text-[10px] leading-relaxed text-[#555]">{lines.join(" · ")}</p> : null}
          {ids.length ? <p className="text-[10px] leading-relaxed text-[#555]">{ids.join(" · ")}</p> : null}
        </div>
      </div>
      <div className="text-left">
        <p className="text-[15px] font-medium">{title}</p>
        {doc ? (
          <p className="latin text-[12px]" style={{ letterSpacing: "0.08em" }}>
            {doc.number}
          </p>
        ) : null}
        <table className="mt-1 text-[10px]">
          <tbody>
            <tr>
              <td className="pl-2 text-[#555]">التاريخ</td>
              <td>{formatDate(doc?.date ?? "")}</td>
            </tr>
            {doc && doc.revision > 1 ? (
              <tr>
                <td className="pl-2 text-[#555]">المراجعة</td>
                <td>{qty(doc.revision, 0)}</td>
              </tr>
            ) : null}
            {meta?.map((m) => (
              <tr key={m.label}>
                <td className="pl-2 text-[#555]">{m.label}</td>
                <td>{m.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </header>
  );
}

/** بيانات الجهة: عميل أو مورد أو عامل */
export function DocParty({
  label,
  name,
  rows,
  paper,
}: {
  label: string;
  name: string;
  rows?: { label: string; value: string }[];
  paper: Paper;
}) {
  const shown = (rows ?? []).filter((r) => r.value?.trim());
  if (isThermal(paper)) {
    return (
      <section className="border-b border-dashed border-black/30 py-1.5 text-[10px]">
        <p>
          <span className="text-[#444]">{label}: </span>
          {name}
        </p>
        {shown.map((r) => (
          <p key={r.label}>
            <span className="text-[#444]">{r.label}: </span>
            {r.value}
          </p>
        ))}
      </section>
    );
  }
  return (
    <section className="mt-3 rounded border border-black/15 p-2 text-[11px]">
      <p className="text-[10px] text-[#555]">{label}</p>
      <p className="font-medium">{name}</p>
      {shown.length ? (
        <p className="mt-0.5 text-[10px] text-[#555]">{shown.map((r) => `${r.label}: ${r.value}`).join(" · ")}</p>
      ) : null}
    </section>
  );
}

/* ── جدول الأسطر ───────────────────────────────────────────────── */

export type SheetCol = {
  label: string;
  align?: "start" | "end";
  width?: string;
};

export function DocTable({
  cols,
  rows,
  paper,
  empty = "مفيش أسطر في المستند ده.",
}: {
  cols: SheetCol[];
  rows: ReactNode[][];
  paper: Paper;
  empty?: string;
}) {
  if (!rows.length) return <p className="mt-3 text-[11px] text-[#666]">{empty}</p>;

  if (isThermal(paper)) {
    return (
      <section className="border-b border-dashed border-black/30 py-1.5 text-[10px]">
        {rows.map((r, i) => (
          <div key={i} className="mb-1 last:mb-0">
            <p className="font-medium">{r[0]}</p>
            <p className="flex flex-wrap gap-x-2 text-[#333]">
              {r.slice(1).map((cell, j) => (
                <span key={j}>
                  {cols[j + 1]?.label}: {cell}
                </span>
              ))}
            </p>
          </div>
        ))}
      </section>
    );
  }

  return (
    <table className="mt-3 w-full border-collapse text-[11px]">
      <thead>
        <tr className="bg-[#F4EFE6]">
          {cols.map((c) => (
            <th
              key={c.label}
              className={cn(
                "border border-black/15 px-1.5 py-1 font-medium",
                c.align === "end" ? "text-left" : "text-right",
              )}
              style={c.width ? { width: c.width } : undefined}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((cell, j) => (
              <td
                key={j}
                className={cn(
                  "border border-black/15 px-1.5 py-1",
                  cols[j]?.align === "end" ? "tabular text-left" : "text-right",
                )}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── المجاميع ──────────────────────────────────────────────────── */

export function DocTotals({
  rows,
  paper,
}: {
  rows: { label: string; value: number; strong?: boolean; negative?: boolean }[];
  paper: Paper;
}) {
  const body = rows.map((r) => (
    <div
      key={r.label}
      className={cn(
        "flex items-baseline justify-between gap-4 py-0.5",
        r.strong && "border-t border-black/30 pt-1 text-[12px] font-medium",
      )}
    >
      <span>{r.label}</span>
      <span className="tabular">
        {r.negative && r.value > 0 ? "−" : ""}
        {moneyPlain(r.value)} ج
      </span>
    </div>
  ));

  if (isThermal(paper)) {
    return <section className="border-b border-dashed border-black/30 py-1.5 text-[11px]">{body}</section>;
  }
  return (
    <section className="mt-3 flex justify-start">
      <div className="w-[70mm] text-[11px]">{body}</div>
    </section>
  );
}

/* ── الذيل: توقيعات وQR وشروط ──────────────────────────────────── */

export function DocFooter({
  doc,
  settings,
  paper,
  note,
}: {
  doc: IssuedDoc | null;
  settings: DocSettings | undefined;
  paper: Paper;
  note?: string;
}) {
  const showQr = settings?.showQr !== false && doc;
  const qr = showQr ? qrPath(verifyUrl(window.location.origin, doc.number, doc.stamp)) : null;
  const left = settings?.signLeft?.trim() || "توقيع المسؤول";
  const right = settings?.signRight?.trim() || "توقيع المستلم";
  const cancelled = doc?.status === "cancelled";

  if (isThermal(paper)) {
    return (
      <footer className="pt-2 text-center text-[10px]">
        {cancelled ? <p className="mb-1 font-medium">— مستند ملغي —</p> : null}
        {qr ? (
          <svg viewBox={`0 0 ${qr.size} ${qr.size}`} className="mx-auto h-[22mm] w-[22mm]">
            <rect width={qr.size} height={qr.size} fill="#fff" />
            <path d={qr.path} fill="#000" />
          </svg>
        ) : null}
        {doc ? (
          <p className="latin" style={{ letterSpacing: "0.06em" }}>
            {doc.stamp}
          </p>
        ) : null}
        {note ? <p className="mt-1">{note}</p> : null}
        {settings?.footer?.trim() ? <p className="mt-1">{settings.footer}</p> : null}
        <p className="mt-1.5 text-[9px] text-[#444]">صنعة</p>
      </footer>
    );
  }

  return (
    <footer className="mt-4 border-t border-black/20 pt-3">
      {cancelled ? (
        <p className="mb-2 border border-black/40 px-2 py-1 text-center text-[12px] font-medium">
          مستند ملغي{doc?.cancelReason ? ` — ${doc.cancelReason}` : ""}
        </p>
      ) : null}
      <div className="flex items-end justify-between gap-6">
        <div className="flex-1 text-[10px] text-[#555]">
          {settings?.terms?.trim() ? <p className="whitespace-pre-line">{settings.terms}</p> : null}
          {note ? <p className="mt-1">{note}</p> : null}
        </div>
        {qr ? (
          <div className="text-center">
            <svg viewBox={`0 0 ${qr.size} ${qr.size}`} className="h-[24mm] w-[24mm]">
              <rect width={qr.size} height={qr.size} fill="#fff" />
              <path d={qr.path} fill="#000" />
            </svg>
            <p className="latin mt-0.5 text-[9px]" style={{ letterSpacing: "0.08em" }}>
              {doc?.stamp}
            </p>
            <p className="text-[8px] text-[#666]">امسح للتحقق</p>
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex justify-between gap-8 text-[10px]">
        {[right, left].map((label) => (
          <div key={label} className="w-[55mm] border-t border-black/40 pt-1 text-center">
            {label}
          </div>
        ))}
      </div>

      {settings?.footer?.trim() ? (
        <p className="mt-3 text-center text-[9px] text-[#666]">{settings.footer}</p>
      ) : null}
      <p className="mt-1 text-center text-[8px] text-[#888]">
        {doc ? `${DOC_DEFS[doc.type].label} · ${DOC_STATUS_LABEL[doc.status]} · ` : ""}صنعة
      </p>
    </footer>
  );
}

/** خانات التسليم: المستلم واسمه ورقمه — إذن التسليم بلا الخانات دي مش إثبات */
export function DocReceiptBlock({ paper }: { paper: Paper }) {
  const fields = ["اسم المستلم", "رقم الهاتف", "التاريخ", "الوقت"];
  if (isThermal(paper)) {
    return (
      <section className="py-1.5 text-[10px]">
        {fields.map((f) => (
          <p key={f} className="mb-1.5 border-b border-dotted border-black/50">
            {f}:
          </p>
        ))}
      </section>
    );
  }
  return (
    <section className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-[10px]">
      {fields.map((f) => (
        <p key={f} className="border-b border-dotted border-black/50 pb-3">
          {f}:
        </p>
      ))}
    </section>
  );
}
