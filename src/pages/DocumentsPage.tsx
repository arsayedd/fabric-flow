import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ExportMenu } from "@/components/export/ExportMenu";
import { DocumentPrint } from "@/components/docs/DocumentPrint";
import { Choice, Field, Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, selectClass } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PAPER_HINT, PAPER_LABEL, PAPER_SIZES, type Paper } from "@/lib/print";
import { fileToDataUrl, formatDate, money, normalize, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { datasetOf } from "@/store/datasets";
import {
  DOC_AREA_LABEL,
  DOC_DEFS,
  DOC_STATUS_LABEL,
  DOC_STATUS_TONE,
  DOC_TYPE_LIST,
  formatDocNumber,
  nextSerial,
  numberingFor,
  paperFor,
  stampMatches,
} from "@/store/documents";
import { DOC_TYPES, type DocSettings, type DocType, type IssuedDoc } from "@/store/types";

const TABS = [
  { id: "ledger", label: "الدفتر" },
  { id: "types", label: "أنواع المستندات" },
  { id: "header", label: "ترويسة المصنع" },
  { id: "numbering", label: "قواعد الترقيم" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * مركز المستندات.
 *
 * الشاشة دي هي **الدفتر**: كل مستند اتصدر من النظام بترتيب رقمه، وحالته،
 * ومين أصدره، وسبب إلغائه لو اتلغى. وأي مستند منها يتطبع تاني بنفس رقمه.
 *
 * والإلغاء موجود والمسح لأ — عن قصد. المستند المالي أو الإنتاجي لو
 * اتمسح، الدفتر بيبقى فيه فجوة ومحدش يعرف كان فيه إيه. فالإلغاء بسبب
 * مكتوب هو البديل، والرقم بيفضل مشغول.
 */
export function DocumentsPage() {
  const { db, can } = useFactory();
  const [tab, setTab] = useState<TabId>("ledger");

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">المستندات والطباعة</h2>
          <p className="text-sm text-muted-foreground">
            كل مستند بيتصدر من صنعة بياخد رقم في الدفتر. الرقم مايتكرّرش، والملغي بيفضل مكتوب بسببه.
          </p>
        </div>
        <ExportMenu module="reports" dataset={() => datasetOf(db, "documents")} />
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
              tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ledger" ? <Ledger /> : null}
      {tab === "types" ? <Types /> : null}
      {tab === "header" ? <Header /> : null}
      {tab === "numbering" ? <Numbering /> : null}

      {!can.do("settings", "edit") && (tab === "header" || tab === "numbering") ? (
        <p className="text-xs text-muted-foreground">العرض بس — تعديل الإعدادات دي محتاج صلاحية الإعدادات.</p>
      ) : null}
    </div>
  );
}

/* ── الدفتر ────────────────────────────────────────────────────── */

function Ledger() {
  const { db, can, cancelDoc } = useFactory();
  const [q, setQ] = useState("");
  const [type, setType] = useState<DocType | "all">("all");
  const [cancelling, setCancelling] = useState<IssuedDoc | null>(null);
  const [reopen, setReopen] = useState<IssuedDoc | null>(null);

  const term = normalize(q);
  // الصلاحية على مستوى نوع المستند: اللي مامعاهوش تصدير القسم مايشوفش ورقه
  const mine = db.documents.filter((d) => can.do(DOC_DEFS[d.type].perm, "export"));
  const rows = mine
    .filter((d) => (type === "all" || d.type === type) && (!term || normalize(d.number).includes(term)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (!mine.length) {
    return (
      <Card>
        <p className="font-medium">الدفتر لسه فاضي</p>
        <p className="mt-1 text-sm text-muted-foreground">
          أول ما تطبع إذن تسليم أو فاتورة أو إيصال من أي شاشة، بياخد رقم وبيتسجّل هنا. المستندات مش بتتكتب من هنا —
          بتطلع من الحركة نفسها عشان أرقامها تبقى أرقام النظام.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر برقم المستند" />
        <select className={selectClass} value={type} onChange={(e) => setType(e.target.value as DocType | "all")}>
          <option value="all">كل الأنواع</option>
          {DOC_TYPES.map((t) => (
            <option key={t} value={t}>
              {DOC_DEFS[t].label}
            </option>
          ))}
        </select>
      </div>

      {!rows.length ? <Card><p className="text-sm text-muted-foreground">مفيش مستند بالبحث ده.</p></Card> : null}

      {rows.map((d) => {
        const intact = stampMatches(d);
        return (
          <Card key={d.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="latin tabular font-medium">{d.number}</span>
                  <Badge tone={DOC_STATUS_TONE[d.status]}>{DOC_STATUS_LABEL[d.status]}</Badge>
                  {d.revision > 1 ? <Badge>مراجعة {qty(d.revision, 0)}</Badge> : null}
                  {!intact ? <Badge tone="danger">البصمة مش مطابقة</Badge> : null}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {DOC_DEFS[d.type].label} · {formatDate(d.date)}
                  {d.amount === null ? "" : ` · ${money(d.amount)}`}
                </p>
                {d.cancelReason ? (
                  <p className="mt-1 text-sm text-danger">سبب الإلغاء: {d.cancelReason}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => setReopen(d)}>
                  طبع تاني
                </Button>
                {d.status !== "cancelled" ? (
                  <Button variant="dangerGhost" size="sm" onClick={() => setCancelling(d)}>
                    إلغاء
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}

      {reopen ? (
        <DocumentPrint
          type={reopen.type}
          refId={reopen.refId}
          refExtra={reopen.refExtra}
          doc={reopen}
          onClose={() => setReopen(null)}
        />
      ) : null}

      <CancelPanel
        doc={cancelling}
        onClose={() => setCancelling(null)}
        onConfirm={(reason) => {
          try {
            cancelDoc(cancelling!.id, reason);
            toast.success("ألغينا المستند، ورقمه فضل في الدفتر.");
            setCancelling(null);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "الإلغاء مانفعش.");
          }
        }}
      />
    </div>
  );
}

function CancelPanel({
  doc,
  onClose,
  onConfirm,
}: {
  doc: IssuedDoc | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Panel
      open={!!doc}
      title={`إلغاء ${doc ? doc.number : ""}`}
      onClose={() => {
        setReason("");
        onClose();
      }}
      footer={
        <Button
          variant="danger"
          className="w-full"
          disabled={!reason.trim()}
          onClick={() => {
            onConfirm(reason.trim());
            setReason("");
          }}
        >
          ألغِ المستند
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        المستند مش بيتمسح. رقمه بيفضل في الدفتر بحالة «ملغي» وبالسبب اللي هتكتبه، عشان محدش يقدر يقول إن الرقم ده
        مكانش موجود.
      </p>
      <Field label="سبب الإلغاء">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلًا: العميل رجّع الشحنة" />
      </Field>
    </Panel>
  );
}

/* ── أنواع المستندات ───────────────────────────────────────────── */

function Types() {
  const { db, can } = useFactory();
  const types = DOC_TYPE_LIST.filter((t) => can.do(t.perm, "export"));
  const areas = [...new Set(types.map((t) => t.area))];
  const used = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of db.documents) map.set(d.type, (map.get(d.type) ?? 0) + 1);
    return map;
  }, [db.documents]);

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-muted-foreground">
          المستندات مش بتتكتب من مركز المستندات — بتطلع من الحركة نفسها: إذن التسليم من التوريدة، والإيصال من
          التحصيل، وورقة الإنتاج من الأمر. عشان أرقام الورقة تبقى أرقام النظام، مش أرقام مكتوبة بالإيد.
        </p>
      </Card>

      {areas.map((area) => (
        <section key={area} className="space-y-2">
          <h3 className="text-base">{DOC_AREA_LABEL[area]}</h3>
          <div className="grid gap-2 lg:grid-cols-2">
            {types.filter((t) => t.area === area).map((t) => {
              const rule = numberingFor(db.settings.docs, t.type);
              const year = Number(new Date().getFullYear());
              return (
                <Card key={t.type}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{t.label}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{t.purpose}</p>
                      <p className="latin tabular mt-1 text-xs text-muted-foreground">
                        {formatDocNumber(rule, year, nextSerial(db.documents, t.type, rule, year))}
                      </p>
                    </div>
                    <div className="shrink-0 text-left">
                      <Badge tone={used.get(t.type) ? "ok" : "muted"}>
                        {used.get(t.type) ? `${qty(used.get(t.type)!, 0)} مستند` : "لسه"}
                      </Badge>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {PAPER_LABEL[paperFor(db.settings.docs, t.type)]}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ── ترويسة المصنع ─────────────────────────────────────────────── */

function Header() {
  const { db, can, setDocSettings } = useFactory();
  const docs = db.settings.docs ?? {};
  const editable = can.do("settings", "edit");
  const [form, setForm] = useState<DocSettings>(docs);

  const set = <K extends keyof DocSettings>(key: K, value: DocSettings[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = () => {
    try {
      setDocSettings(form);
      toast.success("حفظنا الترويسة. أي مستند جديد هيطلع بيها.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "الحفظ مانفعش.");
    }
  };

  return (
    <div className="space-y-3">
      <Card>
        <p className="text-sm text-muted-foreground">
          اللي بتكتبه هنا بيطلع فوق كل مستند مطبوع، والشروط والتوقيعات بتطلع تحته. سيب أي خانة فاضية لو مالهاش لازمة
          — الورقة مش بتطبع سطر فاضي.
        </p>
      </Card>

      <Card className="space-y-1">
        <Field label="الاسم القانوني (لو مختلف عن اسم المصنع)">
          <Input
            value={form.legalName ?? ""}
            disabled={!editable}
            onChange={(e) => set("legalName", e.target.value)}
            placeholder={db.factory?.name ?? ""}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الرقم الضريبي">
            <Input value={form.taxId ?? ""} disabled={!editable} onChange={(e) => set("taxId", e.target.value)} />
          </Field>
          <Field label="السجل التجاري">
            <Input
              value={form.commercialReg ?? ""}
              disabled={!editable}
              onChange={(e) => set("commercialReg", e.target.value)}
            />
          </Field>
        </div>
        <Field label="العنوان">
          <Input value={form.address ?? ""} disabled={!editable} onChange={(e) => set("address", e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الهاتف">
            <Input value={form.phone ?? ""} disabled={!editable} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="البريد">
            <Input value={form.email ?? ""} disabled={!editable} onChange={(e) => set("email", e.target.value)} />
          </Field>
        </div>

        <Choice label="الشعار">
          <div className="flex items-center gap-3">
            {form.logo ? (
              <img src={form.logo} alt="" className="h-12 w-12 rounded border border-border object-contain" />
            ) : null}
            <input
              type="file"
              aria-label="الشعار"
              accept="image/*"
              disabled={!editable}
              className="text-sm"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void fileToDataUrl(file)
                  .then((url) => set("logo", url))
                  .catch((err: Error) => toast.error(err.message));
              }}
            />
            {form.logo ? (
              <Button variant="ghost" size="sm" disabled={!editable} onClick={() => set("logo", null)}>
                شيل
              </Button>
            ) : null}
          </div>
        </Choice>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="تسمية التوقيع اليمين">
            <Input
              value={form.signRight ?? ""}
              disabled={!editable}
              onChange={(e) => set("signRight", e.target.value)}
              placeholder="توقيع المستلم"
            />
          </Field>
          <Field label="تسمية التوقيع الشمال">
            <Input
              value={form.signLeft ?? ""}
              disabled={!editable}
              onChange={(e) => set("signLeft", e.target.value)}
              placeholder="توقيع المسؤول"
            />
          </Field>
        </div>

        <Field label="الشروط (بتطلع في آخر المستند)">
          <Textarea value={form.terms ?? ""} disabled={!editable} onChange={(e) => set("terms", e.target.value)} />
        </Field>
        <Field label="سطر الفوتر">
          <Input value={form.footer ?? ""} disabled={!editable} onChange={(e) => set("footer", e.target.value)} />
        </Field>

        <label className="mb-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.showQr !== false}
            disabled={!editable}
            onChange={(e) => set("showQr", e.target.checked)}
          />
          اطبع QR للتحقق على كل مستند
        </label>

        <Field label="مستند بمبلغ أكبر من كده لازم يتعمد قبل الإصدار">
          <Input
            type="number"
            inputMode="numeric"
            value={form.approvalOver ?? ""}
            disabled={!editable}
            onChange={(e) => set("approvalOver", e.target.value === "" ? null : Number(e.target.value))}
            placeholder="سيبها فاضية لو مش عايز موافقات"
          />
        </Field>

        {editable ? (
          <Button onClick={save} className="w-full">
            حفظ الترويسة
          </Button>
        ) : null}
      </Card>
    </div>
  );
}

/* ── قواعد الترقيم ─────────────────────────────────────────────── */

function Numbering() {
  const { db, can, setDocSettings } = useFactory();
  const editable = can.do("settings", "edit");
  const docs = db.settings.docs ?? {};
  const year = new Date().getFullYear();

  const update = (type: DocType, patch: Partial<ReturnType<typeof numberingFor>>) => {
    const rule = { ...numberingFor(docs, type), ...patch };
    try {
      setDocSettings({ numbering: { ...(docs.numbering ?? {}), [type]: rule } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "الحفظ مانفعش.");
    }
  };

  const setPaper = (type: DocType, paper: Paper) => {
    try {
      setDocSettings({ paper: { ...(docs.paper ?? {}), [type]: paper } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "الحفظ مانفعش.");
    }
  };

  return (
    <div className="space-y-3">
      <Card>
        <p className="text-sm text-muted-foreground">
          البادئة والخانات وبداية المسلسل. والمسلسل بيبدأ من الرقم اللي تحدده — عشان المصنع اللي عنده أرقام قديمة
          على ورق يكمّل من عندها بدل ما يرجع لواحد. وتغيير القاعدة **مابيغيّرش** أرقام مستندات صدرت خلاص.
        </p>
      </Card>

      {DOC_TYPE_LIST.filter((t) => can.do(t.perm, "export")).map((t) => {
        const rule = numberingFor(docs, t.type);
        const serial = nextSerial(db.documents, t.type, rule, year);
        const issued = db.documents.filter((d) => d.type === t.type).length;
        return (
          <Card key={t.type} className="space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">{t.label}</p>
              <span className="latin tabular text-sm text-muted-foreground">
                {formatDocNumber(rule, year, serial)}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="البادئة">
                <Input
                  value={rule.prefix}
                  disabled={!editable}
                  onChange={(e) => update(t.type, { prefix: e.target.value.toUpperCase().slice(0, 6) })}
                />
              </Field>
              <Field label="عدد الخانات">
                <Input
                  type="number"
                  min={3}
                  max={10}
                  value={rule.padding}
                  disabled={!editable}
                  onChange={(e) => update(t.type, { padding: Number(e.target.value) })}
                />
              </Field>
              <Field label="يبدأ من">
                <Input
                  type="number"
                  min={1}
                  value={rule.start}
                  disabled={!editable || issued > 0}
                  onChange={(e) => update(t.type, { start: Number(e.target.value) })}
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="مقاس الورق">
                <select
                  className={selectClass}
                  value={paperFor(docs, t.type)}
                  disabled={!editable}
                  onChange={(e) => setPaper(t.type, e.target.value as Paper)}
                >
                  {PAPER_SIZES.map((p) => (
                    <option key={p} value={p}>
                      {PAPER_LABEL[p]} — {PAPER_HINT[p]}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="mb-3 flex items-center gap-2 self-end text-sm">
                <input
                  type="checkbox"
                  checked={rule.resetYearly}
                  disabled={!editable}
                  onChange={(e) => update(t.type, { resetYearly: e.target.checked })}
                />
                المسلسل يبدأ من أول كل سنة
              </label>
            </div>

            {issued > 0 ? (
              <p className="text-xs text-muted-foreground">
                صدر منه {qty(issued, 0)} مستند، فبداية المسلسل مش بتتعدّل — الأرقام اللي في إيد الناس مالهاش رجعة.
              </p>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
