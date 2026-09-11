import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Contact, Search } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Field, Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useFactory } from "@/store/context";
import {
  customerSegments,
  customerStats,
  findDuplicates,
  partyCredit,
  supplierStats,
  SEGMENT_LABEL,
} from "@/store/parties";
import { PARTY_ROLES, PARTY_ROLE_LABEL, type Party, type PartyRole } from "@/store/types";

/** فلاتر مركز جهات التعامل — نفس الأدوار بس مرتبة بالاستخدام */
const FILTERS: { role: PartyRole | "all"; label: string }[] = [
  { role: "all", label: "كل الجهات" },
  { role: "customer", label: "العملاء" },
  { role: "merchant", label: "التجار" },
  { role: "supplier", label: "الموردين" },
  { role: "workshop", label: "ورش خارجية" },
  { role: "distributor", label: "موزعين" },
  { role: "agent", label: "وكلاء" },
  { role: "sales_rep", label: "مندوبي مبيعات" },
  { role: "collection_rep", label: "مندوبي تحصيل" },
  { role: "shipping", label: "شركات شحن" },
  { role: "partner", label: "شركاء" },
  { role: "service", label: "مقدمي خدمات" },
];

export function PartiesPage() {
  const { db, computed, can } = useFactory();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<PartyRole | "all">("all");

  const term = q.trim();
  const list = useMemo(
    () =>
      computed.parties.filter((p) => {
        if (filter !== "all" && !p.roles.includes(filter)) return false;
        if (!term) return true;
        return [p.name, p.tradeName, p.phone, p.code, p.taxId, ...p.tags].some((v) => (v ?? "").includes(term));
      }),
    [computed.parties, filter, term],
  );

  const pf = computed.portfolio;
  const alerts = computed.alerts.slice(0, 5);
  const concentrated = pf.topShare !== null && pf.topShare >= 50 && pf.customers >= 3;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">جهات التعامل</h2>
          <p className="text-sm text-muted-foreground">
            كل من يتعامل مع المصنع في مكان واحد — العميل ممكن يكون تاجر، والمورّد ممكن يكون عميل، وسجل واحد يجمع كل ده.
          </p>
        </div>
        {can.edit ? <Button onClick={() => setOpen(true)}>جهة جديدة</Button> : null}
      </div>

      {pf.total > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <p className="text-sm text-muted-foreground">إجمالي الجهات</p>
            <p className="mt-1 text-2xl tabular">{pf.total}</p>
          </Card>
          <Card>
            <p className="text-sm text-muted-foreground">عملاء نشطين</p>
            <p className="mt-1 text-2xl tabular">{pf.active}</p>
            <p className="text-xs text-muted-foreground">طلبوا خلال 60 يوم</p>
          </Card>
          <Card>
            <p className="text-sm text-muted-foreground">بينمو</p>
            <p className="mt-1 text-2xl tabular text-ok">{pf.growing}</p>
          </Card>
          <Card>
            <p className="text-sm text-muted-foreground">معرّض للفقد</p>
            <p className="mt-1 text-2xl tabular text-danger">{pf.atRisk}</p>
          </Card>
        </div>
      ) : null}

      {concentrated ? (
        <Card className="flex items-start gap-3 border-warn/30 bg-warn-soft/40">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
          <div>
            <h3 className="text-base">تركيز خطر في المبيعات</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {Math.round(pf.topShare ?? 0)}٪ من مبيعاتك من {pf.topNames.slice(0, 3).join("، ")}. لو واحد منهم وقف، الدخل
              هيتأثر بشكل مباشر.
            </p>
          </div>
        </Card>
      ) : null}

      {alerts.length ? (
        <Card>
          <h3 className="text-base">مين أركز عليه النهارده</h3>
          <ul className="mt-2 list-none space-y-2.5">
            {alerts.map((a, i) => (
              <li key={`${a.partyId}-${i}`} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link to={a.to} className="font-medium underline-offset-4 hover:underline">
                    {a.name}
                  </Link>
                  <p className="text-sm text-muted-foreground">{a.text}</p>
                </div>
                <Badge tone={a.tone} className="shrink-0">
                  {a.action}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="دور باسم، رقم، كود، أو تاج" className="pr-9" />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {FILTERS.map((f) => {
          const count = f.role === "all" ? computed.parties.length : computed.parties.filter((p) => p.roles.includes(f.role as PartyRole)).length;
          if (count === 0 && f.role !== "all" && filter !== f.role) return null;
          return (
            <button
              key={f.role}
              onClick={() => setFilter(f.role)}
              className={
                filter === f.role
                  ? "shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                  : "shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"
              }
            >
              {f.label} {count ? <span className="tabular">({count})</span> : null}
            </button>
          );
        })}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={Contact}
          title={term || filter !== "all" ? "مفيش نتيجة" : "لسه مفيش جهات تعامل"}
          body="أضف أول جهة — عميل، مورّد، ورشة، أو مندوب — وكل حركة تحصل معاها هتتجمع في بروفايلها لوحدها."
          action={can.edit && !term ? { label: "أضف جهة", onClick: () => setOpen(true) } : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {list.map((p) => (
            <PartyRow key={p.id} party={p} balance={p.balance} />
          ))}
        </div>
      )}

      <PartyForm open={open} onClose={() => setOpen(false)} />
      <p className="text-xs text-muted-foreground">
        {db.parties.filter((p) => p.mergedIntoId).length
          ? `${db.parties.filter((p) => p.mergedIntoId).length} سجل مدموج متخفي من القائمة — الحركات بتاعته انتقلت للسجل الأساسي.`
          : null}
      </p>
    </div>
  );
}

function PartyRow({ party, balance }: { party: Party; balance: number }) {
  const { db } = useFactory();
  const isCustomer = party.roles.includes("customer");
  const stats = isCustomer ? customerStats(db, party.id) : null;
  const sup = !isCustomer && party.roles.includes("supplier") ? supplierStats(db, party.id) : null;
  const credit = partyCredit(db, party.id);
  const segments = isCustomer ? customerSegments(db, party.id) : [];

  return (
    <Link
      to={`/parties/${party.id}`}
      className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-muted/50"
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{party.name}</p>
        <p className="truncate text-sm text-muted-foreground">
          {party.roles.map((r) => PARTY_ROLE_LABEL[r]).join(" · ")}
          {party.phone ? ` — ${party.phone}` : ""}
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {credit.overLimit ? <Badge tone="danger">عدّى حد الائتمان</Badge> : null}
          {stats?.overdue ? <Badge tone="warn">متأخر {stats.overdueCount} توريد</Badge> : null}
          {segments
            .filter((s) => s === "strategic" || s === "growing" || s === "dormant" || s === "at_risk")
            .map((s) => (
              <Badge key={s} tone={s === "strategic" || s === "growing" ? "ok" : "muted"}>
                {SEGMENT_LABEL[s]}
              </Badge>
            ))}
        </div>
      </div>
      <div className="shrink-0 text-left">
        {isCustomer ? (
          <>
            <Money value={balance} />
            <p className="text-xs text-muted-foreground">عليه</p>
          </>
        ) : sup ? (
          <>
            <Money value={sup.due} />
            <p className="text-xs text-muted-foreground">مستحق له</p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">مفيش حساب</p>
        )}
      </div>
    </Link>
  );
}

export function PartyForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, addParty } = useFactory();
  const [kind, setKind] = useState<"person" | "company">("company");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [taxId, setTaxId] = useState("");
  const [roles, setRoles] = useState<PartyRole[]>(["customer"]);
  const [creditLimit, setCreditLimit] = useState("");
  const [paymentTermDays, setPaymentTermDays] = useState("");
  const [notes, setNotes] = useState("");

  const dups = useMemo(
    () => (name.trim().length >= 3 || phone.trim().length >= 6 ? findDuplicates(db, { name, phone, taxId }) : []),
    [db, name, phone, taxId],
  );

  function reset() {
    setKind("company");
    setName("");
    setPhone("");
    setTaxId("");
    setRoles(["customer"]);
    setCreditLimit("");
    setPaymentTermDays("");
    setNotes("");
  }

  return (
    <Panel
      open={open}
      title="جهة تعامل جديدة"
      onClose={onClose}
      footer={
        <Button
          className="w-full"
          onClick={() => {
            try {
              addParty({
                kind,
                name,
                phone,
                whatsapp: phone,
                taxId,
                roles,
                creditLimit: Number(creditLimit) || 0,
                paymentTermDays: Number(paymentTermDays) || 0,
                notes,
              });
              toast.success("الجهة اتضافت.");
              reset();
              onClose();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "فشل");
            }
          }}
        >
          حفظ الجهة
        </Button>
      }
    >
      <Field label="النوع">
        <div className="grid grid-cols-2 gap-2">
          {(["person", "company"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={
                kind === k
                  ? "h-11 rounded-md bg-primary text-sm text-primary-foreground"
                  : "h-11 rounded-md border border-border bg-card text-sm"
              }
            >
              {k === "person" ? "فرد" : "شركة"}
            </button>
          ))}
        </div>
      </Field>

      <Field label={kind === "person" ? "اسم الشخص" : "اسم الشركة"}>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>

      {dups.length ? (
        <div className="mb-3 rounded-md border border-warn/30 bg-warn-soft/40 p-3 text-sm">
          <p className="font-medium">في سجل شبه ده بالفعل</p>
          <ul className="mt-1 list-none space-y-1 text-muted-foreground">
            {dups.slice(0, 4).map((d) => (
              <li key={d.id}>
                <Link to={`/parties/${d.id}`} className="underline underline-offset-4" onClick={onClose}>
                  {d.name}
                </Link>{" "}
                — {d.roles.map((r) => PARTY_ROLE_LABEL[r]).join("، ")}
                {d.phone ? ` · ${d.phone}` : ""}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            لو هو نفسه، افتح سجله وزوّد نوع العلاقة الجديدة بدل ما تعمل سجل تاني. وكمان متعملش سجلين لنفس الجهة.
          </p>
        </div>
      ) : null}

      <Field label="نوع العلاقة — تقدر تختار أكتر من واحد">
        <div className="flex flex-wrap gap-2">
          {PARTY_ROLES.map((r) => (
            <button
              key={r}
              onClick={() => setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))}
              className={
                roles.includes(r)
                  ? "rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground"
                  : "rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"
              }
            >
              {PARTY_ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      </Field>

      <Field label="موبايل واتساب">
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="01..." />
      </Field>
      <Field label="الرقم الضريبي">
        <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} inputMode="numeric" />
      </Field>
      {roles.includes("customer") ? (
        <>
          <Field label="حد الائتمان — أقصى آجل مسموح به">
            <Input value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} inputMode="numeric" placeholder="0 = من غير حد" />
          </Field>
          <Field label="مدة السماح بالأيام">
            <Input value={paymentTermDays} onChange={(e) => setPaymentTermDays(e.target.value)} inputMode="numeric" />
          </Field>
        </>
      ) : null}
      <Field label="ملاحظات">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Panel>
  );
}