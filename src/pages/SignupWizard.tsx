import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Loader2, PartyPopper, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AuthShell, Field, PasswordInput, PasswordMeter } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input, selectClass } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  COUNTRIES,
  EMPLOYEE_BANDS,
  FACTORY_TYPES,
  JOB_TITLES,
  MODULE_KEYS,
  MODULE_LABEL,
  MODULE_READY,
  ROLE_EXPLAIN,
  SLUG_MESSAGE,
  checkPassword,
  isEmail,
  isUrl,
  slugState,
  slugSuggestions,
  slugify,
  workspaceUrl,
  type EmployeeBand,
  type ModuleKey,
  type SlugState,
  type Workspace,
} from "@/store/account";
import { useFactory, type FactoryInput, type TeamRow } from "@/store/context";
import type { Role } from "@/store/types";

const STEP_LABELS = ["الحساب", "المصنع", "الـWorkspace", "التجهيز", "الفريق", "تم"];

const DEFAULT_MODULES: ModuleKey[] = ["production", "inventory", "workers", "parties", "finance", "costing"];

type AccountDraft = {
  fullName: string;
  email: string;
  countryCode: string;
  phone: string;
  password: string;
  confirm: string;
  terms: boolean;
};

type FactoryDraft = {
  name: string;
  types: string[];
  website: string;
  country: string;
  city: string;
  address: string;
  employees: EmployeeBand | null;
  employeesExact: string;
  monthlyCapacity: string;
  productionLines: string;
  branches: string;
  logo: string | null;
};

/**
 * رحلة تجهيز المصنع: ٦ خطوات، والبيانات كلها في state واحدة
 * فالرجوع لخطوة قبلها مش بيضيّع أي حاجة.
 *
 * المصنع بيتعمل فعليًا آخر خطوة ٣ (بعد الـsubdomain)، وبعدها خطوة ٤ و٥
 * بيعدّلوا على المصنع اللي اتعمل — عشان اللي المستخدم دخله يبقى بيانات حقيقية
 * في النظام، مش شكل.
 */
export function SignupWizard({ mode = "signup" }: { mode?: "signup" | "factory" }) {
  const { signUp, createWorkspace, setModules, inviteTeam, account } = useFactory();
  const nav = useNavigate();
  const existing = mode === "factory";
  const [step, setStep] = useState(existing ? 2 : 1);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ name: string; slug: string } | null>(null);

  const [acc, setAcc] = useState<AccountDraft>({
    fullName: "",
    email: "",
    countryCode: "+20",
    phone: "",
    password: "",
    confirm: "",
    terms: false,
  });
  const [fac, setFac] = useState<FactoryDraft>({
    name: "",
    types: [],
    website: "",
    country: "مصر",
    city: "",
    address: "",
    employees: null,
    employeesExact: "",
    monthlyCapacity: "",
    productionLines: "",
    branches: "",
    logo: null,
  });
  // الـslug بيتولد من اسم المصنع، ولحد ما المستخدم يعدّله بإيده
  const [slugEdit, setSlugEdit] = useState<string | null>(null);
  const slug = slugEdit ?? slugify(fac.name);
  const [modules, setPicked] = useState<ModuleKey[]>(DEFAULT_MODULES);
  const [team, setTeam] = useState<TeamRow[]>([]);

  const factoryInput = (): FactoryInput => ({
    name: fac.name,
    types: fac.types,
    website: fac.website,
    country: fac.country,
    city: fac.city,
    address: fac.address,
    employees: fac.employees,
    employeesExact: fac.employeesExact ? Number(fac.employeesExact) : null,
    monthlyCapacity: fac.monthlyCapacity ? Number(fac.monthlyCapacity) : null,
    productionLines: fac.productionLines ? Number(fac.productionLines) : null,
    branches: fac.branches ? Number(fac.branches) : null,
    logo: fac.logo,
    subdomain: slug,
    modules,
  });

  const commit = async () => {
    setBusy(true);
    try {
      if (existing) createWorkspace(factoryInput());
      else
        await signUp(
          {
            fullName: acc.fullName,
            email: acc.email,
            countryCode: acc.countryCode,
            phone: acc.phone,
            password: acc.password,
            termsAccepted: acc.terms,
          },
          factoryInput(),
        );
      setCreated({ name: fac.name.trim(), slug });
      setStep(4);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "مش قادر يجهّز المصنع.");
    } finally {
      setBusy(false);
    }
  };

  const finish = () => nav("/");

  return (
    <AuthShell
      wide
      title={existing ? "مصنع جديد" : "جهّز مصنعك على صنعة"}
      subtitle={
        existing
          ? "المصنع الجديد بياخد workspace وبيانات مستقلة بالكامل — عمال ومخزون وأوامر وعملاء وحسابات لوحدهم."
          : "٦ خطوات: الحساب، المصنع، الـworkspace، التجهيز، الفريق. تقدر ترجع لأي خطوة من غير ما تضيّع اللي كتبته."
      }
      footer={
        step === 1 ? (
          <>
            عندك حساب؟{" "}
            <Link to="/login" className="text-foreground underline underline-offset-4">
              تسجيل دخول
            </Link>
          </>
        ) : null
      }
    >
      <Steps step={step} from={existing ? 2 : 1} />

      <div className="mt-6">
        {step === 1 ? <AccountStep acc={acc} setAcc={setAcc} onNext={() => setStep(2)} /> : null}
        {step === 2 ? (
          <FactoryStep fac={fac} setFac={setFac} onBack={existing ? null : () => setStep(1)} onNext={() => setStep(3)} />
        ) : null}
        {step === 3 ? (
          <WorkspaceStep
            name={fac.name}
            slug={slug}
            setSlug={setSlugEdit}
            workspaces={account.workspaces}
            city={fac.city}
            busy={busy}
            onBack={() => setStep(2)}
            onNext={commit}
          />
        ) : null}
        {step === 4 ? (
          <ModulesStep
            picked={modules}
            onToggle={(k) => {
              const next = modules.includes(k) ? modules.filter((x) => x !== k) : [...modules, k];
              setPicked(next);
              setModules(next);
            }}
            onNext={() => setStep(5)}
          />
        ) : null}
        {step === 5 ? (
          <TeamStep
            team={team}
            setTeam={setTeam}
            onBack={() => setStep(4)}
            onSkip={() => setStep(6)}
            onNext={() => {
              try {
                inviteTeam(team);
                setStep(6);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "الدعوات مش مظبوطة.");
              }
            }}
          />
        ) : null}
        {step === 6 && created ? <DoneStep name={created.name} slug={created.slug} onEnter={finish} /> : null}
      </div>
    </AuthShell>
  );
}

function Steps({ step, from }: { step: number; from: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        if (n < from) return null;
        const state = n < step ? "done" : n === step ? "now" : "next";
        return (
          <div key={label} className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span
              className={cn(
                "h-1.5 rounded-full",
                state === "done" ? "bg-accent" : state === "now" ? "bg-primary" : "bg-muted",
              )}
            />
            <span className={cn("truncate text-[11px]", state === "next" ? "text-muted-foreground" : "text-foreground")}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Nav({
  onBack,
  next,
  disabled,
  busy,
  extra,
}: {
  onBack: (() => void) | null;
  next: { label: string; onClick: () => void };
  disabled?: boolean;
  busy?: boolean;
  extra?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 pt-2">
      <Button size="lg" onClick={next.onClick} disabled={disabled || busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {next.label}
        {!busy ? <ArrowLeft className="h-4 w-4" /> : null}
      </Button>
      {extra ? (
        <Button size="lg" variant="ghost" onClick={extra.onClick}>
          {extra.label}
        </Button>
      ) : null}
      {onBack ? (
        <Button size="lg" variant="outline" className="mr-auto" onClick={onBack}>
          <ArrowRight className="h-4 w-4" />
          رجوع
        </Button>
      ) : null}
    </div>
  );
}

/* ── ١ · الحساب ─────────────────────────────────────────────── */

function AccountStep({
  acc,
  setAcc,
  onNext,
}: {
  acc: AccountDraft;
  setAcc: (fn: (p: AccountDraft) => AccountDraft) => void;
  onNext: () => void;
}) {
  const [seen, setSeen] = useState(false);
  const emailBad = seen && !isEmail(acc.email);
  const mismatch = acc.confirm.length > 0 && acc.confirm !== acc.password;
  const ok =
    acc.fullName.trim().length > 1 &&
    isEmail(acc.email) &&
    acc.phone.trim().length >= 6 &&
    checkPassword(acc.password).ok &&
    acc.confirm === acc.password &&
    acc.terms;

  return (
    <div className="space-y-4">
      <Field label="الاسم بالكامل">
        <Input value={acc.fullName} onChange={(e) => setAcc((p) => ({ ...p, fullName: e.target.value }))} placeholder="أحمد محمود" />
      </Field>
      <Field label="الإيميل" error={emailBad ? "الإيميل مش مظبوط." : null}>
        <Input
          type="email"
          value={acc.email}
          onChange={(e) => setAcc((p) => ({ ...p, email: e.target.value }))}
          onBlur={() => setSeen(true)}
          placeholder="ahmed@alnoor.com"
          className="latin text-left"
        />
      </Field>
      <div className="space-y-1.5">
        <Label>رقم الموبايل</Label>
        <div className="flex gap-2">
          <select
            value={acc.countryCode}
            onChange={(e) => setAcc((p) => ({ ...p, countryCode: e.target.value }))}
            className={cn(selectClass, "latin w-28 shrink-0 text-left")}
            dir="ltr"
          >
            {COUNTRIES.filter((c) => c.dial !== "+").map((c) => (
              <option key={c.dial} value={c.dial}>
                {c.dial}
              </option>
            ))}
          </select>
          <Input
            value={acc.phone}
            onChange={(e) => setAcc((p) => ({ ...p, phone: e.target.value.replace(/[^\d]/g, "") }))}
            placeholder="1012345678"
            className="latin text-left"
            inputMode="tel"
          />
        </div>
        <p className="text-xs text-muted-foreground">كود الدولة متخزّن مستقل عن الرقم.</p>
      </div>
      <Field label="كلمة السر">
        <PasswordInput value={acc.password} onChange={(v) => setAcc((p) => ({ ...p, password: v }))} autoComplete="new-password" />
      </Field>
      <PasswordMeter value={acc.password} />
      <Field label="تأكيد كلمة السر" error={mismatch ? "الكلمتين مش زي بعض." : null}>
        <PasswordInput value={acc.confirm} onChange={(v) => setAcc((p) => ({ ...p, confirm: v }))} autoComplete="new-password" />
      </Field>
      <label className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-sm">
        <input
          type="checkbox"
          checked={acc.terms}
          onChange={(e) => setAcc((p) => ({ ...p, terms: e.target.checked }))}
          className="mt-0.5 h-4 w-4 accent-[#0f1720]"
        />
        <span className="leading-6 text-muted-foreground">
          موافق على شروط الاستخدام وسياسة الخصوصية: بيانات مصنعك بتفضل بتاعتك، ومش بتتعرض لأي مصنع تاني.
        </span>
      </label>
      <Nav onBack={null} next={{ label: "التالي: بيانات المصنع", onClick: onNext }} disabled={!ok} />
    </div>
  );
}

/* ── ٢ · المصنع ─────────────────────────────────────────────── */

function FactoryStep({
  fac,
  setFac,
  onBack,
  onNext,
}: {
  fac: FactoryDraft;
  setFac: (fn: (p: FactoryDraft) => FactoryDraft) => void;
  onBack: (() => void) | null;
  onNext: () => void;
}) {
  const [logoError, setLogoError] = useState<string | null>(null);
  const webBad = !!fac.website && !isUrl(fac.website);
  const ok = fac.name.trim().length > 1 && fac.types.length > 0 && !webBad;

  const onLogo = (file: File) => {
    if (file.size > 1_000_000) {
      setLogoError("أقصى حجم للوجو ١ ميجا.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoError(null);
      setFac((p) => ({ ...p, logo: String(reader.result) }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      <Field label="اسم المصنع">
        <Input value={fac.name} onChange={(e) => setFac((p) => ({ ...p, name: e.target.value }))} placeholder="مصنع النور للملابس الجاهزة" />
      </Field>

      <div className="space-y-1.5">
        <Label>نشاط المصنع</Label>
        <div className="flex flex-wrap gap-2">
          {FACTORY_TYPES.map((t) => {
            const on = fac.types.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => setFac((p) => ({ ...p, types: on ? p.types.filter((x) => x !== t) : [...p.types, t] }))}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[13px] transition-colors",
                  on ? "border-accent bg-accent-soft" : "border-border bg-card hover:border-accent/50",
                )}
              >
                {on ? "✓ " : ""}
                {t}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          اختار أكتر من نشاط لو المصنع بيعمل أكتر من حاجة. أول نشاط بيحدّد الوحدات والخامات والعمليات اللي بتتجهّز معاك.
        </p>
      </div>

      <Field label="الموقع الإلكتروني" optional error={webBad ? "اللينك مش مظبوط." : null}>
        <Input
          value={fac.website}
          onChange={(e) => setFac((p) => ({ ...p, website: e.target.value }))}
          placeholder="https://alnoor.com"
          className="latin text-left"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الدولة">
          <select value={fac.country} onChange={(e) => setFac((p) => ({ ...p, country: e.target.value }))} className={selectClass}>
            {COUNTRIES.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="المدينة">
          <Input value={fac.city} onChange={(e) => setFac((p) => ({ ...p, city: e.target.value }))} placeholder="العاشر من رمضان" />
        </Field>
      </div>

      <Field label="العنوان" optional>
        <Input value={fac.address} onChange={(e) => setFac((p) => ({ ...p, address: e.target.value }))} placeholder="المنطقة الصناعية، قطعة ٤٢" />
      </Field>

      <div className="space-y-1.5">
        <Label>عدد العاملين</Label>
        <div className="flex flex-wrap gap-2">
          {EMPLOYEE_BANDS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setFac((p) => ({ ...p, employees: p.employees === b ? null : b, employeesExact: "" }))}
              className={cn(
                "latin rounded-md border px-3 py-1.5 text-[13px] transition-colors",
                fac.employees === b ? "border-accent bg-accent-soft" : "border-border bg-card hover:border-accent/50",
              )}
            >
              {b}
            </button>
          ))}
        </div>
        <Input
          value={fac.employeesExact}
          onChange={(e) => setFac((p) => ({ ...p, employeesExact: e.target.value.replace(/[^\d]/g, ""), employees: null }))}
          placeholder="أو اكتب العدد بالضبط"
          className="mt-1"
          inputMode="numeric"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="الطاقة الشهرية" optional hint="قطعة في الشهر">
          <Input
            value={fac.monthlyCapacity}
            onChange={(e) => setFac((p) => ({ ...p, monthlyCapacity: e.target.value.replace(/[^\d]/g, "") }))}
            placeholder="20000"
            className="latin text-left"
            inputMode="numeric"
          />
        </Field>
        <Field label="عدد خطوط الإنتاج" optional>
          <Input
            value={fac.productionLines}
            onChange={(e) => setFac((p) => ({ ...p, productionLines: e.target.value.replace(/[^\d]/g, "") }))}
            placeholder="3"
            className="latin text-left"
            inputMode="numeric"
          />
        </Field>
        <Field label="عدد الفروع" optional>
          <Input
            value={fac.branches}
            onChange={(e) => setFac((p) => ({ ...p, branches: e.target.value.replace(/[^\d]/g, "") }))}
            placeholder="1"
            className="latin text-left"
            inputMode="numeric"
          />
        </Field>
      </div>

      <div className="space-y-1.5">
        <Label>لوجو المصنع (اختياري)</Label>
        <div className="flex items-center gap-3">
          {fac.logo ? (
            <div className="relative">
              <img src={fac.logo} alt="لوجو المصنع" className="h-16 w-16 rounded-md border border-border object-contain" />
              <button
                type="button"
                onClick={() => setFac((p) => ({ ...p, logo: null }))}
                className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card"
                aria-label="شيل اللوجو"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : null}
          <label className="flex-1 cursor-pointer rounded-md border border-dashed border-border bg-card px-4 py-4 text-center text-sm text-muted-foreground hover:border-accent">
            {fac.logo ? "غيّر اللوجو" : "اختار صورة اللوجو"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onLogo(f);
              }}
            />
          </label>
        </div>
        {logoError ? <p className="text-xs text-danger">{logoError}</p> : <p className="text-xs text-muted-foreground">بيظهر جوّه النظام وفي الفواتير والتقارير.</p>}
      </div>

      <Nav onBack={onBack} next={{ label: "التالي: الـWorkspace", onClick: onNext }} disabled={!ok} />
    </div>
  );
}

/* ── ٣ · الـWorkspace ───────────────────────────────────────── */

const STATE_TONE: Record<SlugState, string> = {
  empty: "text-muted-foreground",
  short: "text-danger",
  invalid: "text-danger",
  reserved: "text-danger",
  taken: "text-danger",
  free: "text-ok",
};

function WorkspaceStep({
  name,
  slug,
  setSlug,
  workspaces,
  city,
  busy,
  onBack,
  onNext,
}: {
  name: string;
  slug: string;
  setSlug: (v: string) => void;
  workspaces: Workspace[];
  city: string;
  busy: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const timer = useRef<number | null>(null);
  const rows = workspaces;

  // فحص الإتاحة بيحصل وهو بيكتب — مش بعد ما يضغط التالي
  useEffect(() => {
    setChecking(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setChecking(false), 350);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [slug]);

  const state = slugState(slug, rows);
  const alts = useMemo(
    // البدائل مبنية على اسم المصنع، مش على اللي اتكتب — لو «admin» محجوز
    // البديل يبقى «alnoor-eg» مش «admin-eg»
    () => (state === "free" ? [] : slugSuggestions(slugify(name) || slug || "factory", rows, city ? [city] : [])),
    [state, slug, name, city, rows],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">مصنعك بياخد عنوان مستقل، وده هو اللي بيحدّد بياناته</p>
        <p className="latin mt-2 break-all text-lg">{workspaceUrl(slug || "…")}</p>
      </div>

      <Field label="اسم الـworkspace">
        <div className="flex items-center gap-2">
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""))}
            className="latin text-left"
            placeholder="alnoor"
            dir="ltr"
          />
          <span className="latin shrink-0 text-sm text-muted-foreground">.sanaa.app</span>
        </div>
      </Field>

      <p className={cn("text-sm", checking ? "text-muted-foreground" : STATE_TONE[state])}>
        {checking ? "بيتأكد من الإتاحة..." : state === "free" ? `متاح: ${slug}.sanaa.app` : SLUG_MESSAGE[state]}
      </p>

      {!checking && alts.length ? (
        <div className="rounded-md border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">أسماء متاحة قريبة:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {alts.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setSlug(a)}
                className="latin rounded-full border border-border bg-background px-3 py-1.5 text-[13px] hover:border-accent"
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <ul className="space-y-1 text-xs leading-6 text-muted-foreground">
        <li>· حروف إنجليزي صغيرة وأرقام وشرطة بس، والمسافات بتتحول لشرطة.</li>
        <li>· أسماء المنصة نفسها محجوزة (<span className="latin">www, api, admin…</span>).</li>
        <li>· الاسم ده بيتربط بـID المصنع في الـbackend، فتغييره مش بيغيّر بياناتك.</li>
      </ul>

      <Nav onBack={onBack} next={{ label: "جهّز المصنع", onClick: onNext }} disabled={state !== "free"} busy={busy} />
    </div>
  );
}

/* ── ٤ · التجهيز ────────────────────────────────────────────── */

function ModulesStep({
  picked,
  onToggle,
  onNext,
}: {
  picked: ModuleKey[];
  onToggle: (k: ModuleKey) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-ok/30 bg-ok-soft p-4 text-sm">
        <Check className="mb-1 h-4 w-4 text-ok" />
        المصنع والـworkspace اتجهّزوا. اختار اللي عايز تديره، والقائمة الجانبية هتتظبّط على اختيارك — وتقدر تغيّره أي وقت
        من الإعدادات.
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {MODULE_KEYS.map((k) => {
          const on = picked.includes(k);
          const ready = MODULE_READY[k];
          return (
            <button
              key={k}
              type="button"
              disabled={!ready}
              onClick={() => onToggle(k)}
              className={cn(
                "flex items-center justify-between rounded-md border px-4 py-3 text-right text-sm transition-colors",
                !ready
                  ? "cursor-not-allowed border-border bg-muted/40 text-muted-foreground"
                  : on
                    ? "border-accent bg-accent-soft"
                    : "border-border bg-card hover:border-accent/50",
              )}
            >
              <span>{MODULE_LABEL[k]}</span>
              {ready ? (
                <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border", on ? "border-accent bg-accent text-accent-foreground" : "border-border")}>
                  {on ? <Check className="h-3 w-3" /> : null}
                </span>
              ) : (
                <span className="text-[11px]">قريب</span>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-xs leading-6 text-muted-foreground">
        الجودة والماكينات لسه مش مبنيين، فمش بنخليك تختارهم عشان ما نوعدك بشاشة مش موجودة.
      </p>
      <Nav onBack={null} next={{ label: "التالي: الفريق", onClick: onNext }} />
    </div>
  );
}

/* ── ٥ · الفريق ─────────────────────────────────────────────── */

function TeamStep({
  team,
  setTeam,
  onBack,
  onNext,
  onSkip,
}: {
  team: TeamRow[];
  setTeam: (fn: (p: TeamRow[]) => TeamRow[]) => void;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const add = () => setTeam((p) => [...p, { name: "", email: "", phone: "", title: JOB_TITLES[0].title, role: JOB_TITLES[0].role }]);
  const set = (i: number, patch: Partial<TeamRow>) => setTeam((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-4">
      <p className="text-sm leading-7 text-muted-foreground">
        الخطوة دي اختيارية. تقدر تضيف الموظفين بعد كده من شاشة الموظفين.
      </p>

      {team.map((row, i) => {
        const job = JOB_TITLES.find((j) => j.title === row.title) ?? JOB_TITLES[0];
        return (
          <div key={i} className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm">موظف {i + 1}</p>
              <button
                type="button"
                onClick={() => setTeam((p) => p.filter((_, idx) => idx !== i))}
                className="text-muted-foreground hover:text-danger"
                aria-label="شيل الموظف"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="الاسم">
                <Input value={row.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="محمد سيد" />
              </Field>
              <Field label="الإيميل">
                <Input
                  value={row.email}
                  onChange={(e) => set(i, { email: e.target.value })}
                  className="latin text-left"
                  placeholder="mohamed@alnoor.com"
                />
              </Field>
              <Field label="الموبايل" optional>
                <Input value={row.phone} onChange={(e) => set(i, { phone: e.target.value })} className="latin text-left" />
              </Field>
              <Field label="المسمّى الوظيفي">
                <select
                  value={row.title}
                  onChange={(e) => {
                    const j = JOB_TITLES.find((x) => x.title === e.target.value)!;
                    set(i, { title: j.title, role: j.role as Role });
                  }}
                  className={selectClass}
                >
                  {JOB_TITLES.map((j) => (
                    <option key={j.title} value={j.title}>
                      {j.title}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="rounded-md bg-secondary px-3 py-2 text-xs leading-6">
              صلاحياته: {ROLE_EXPLAIN[job.role]}
            </p>
          </div>
        );
      })}

      <Button variant="outline" onClick={add} className="w-full">
        <Plus className="h-4 w-4" />
        إضافة موظف
      </Button>

      <p className="text-xs leading-6 text-muted-foreground">
        الدعوة بتتسجّل في قائمة الموظفين بالمسمّى والصلاحية. إرسال الإيميل نفسه محتاج سيرفر، فلحد ساعتها بتقبل الدعوة من
        شاشة الموظفين.
      </p>

      <Nav
        onBack={onBack}
        next={{ label: "دعوة الموظفين", onClick: onNext }}
        disabled={!team.length}
        extra={{ label: "تخطي الآن", onClick: onSkip }}
      />
    </div>
  );
}

/* ── ٦ · تم ─────────────────────────────────────────────────── */

function DoneStep({ name, slug, onEnter }: { name: string; slug: string; onEnter: () => void }) {
  return (
    <div className="space-y-5 text-center">
      <PartyPopper className="mx-auto h-10 w-10 text-accent" />
      <h2 className="text-2xl">مصنعك جاهز!</h2>
      <p className="text-sm leading-7 text-muted-foreground">
        {name} بقى له workspace مستقل ببياناته وصلاحياته. أنت صاحب المصنع، ومعاك كل الصلاحيات.
      </p>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">عنوان مصنعك</p>
        <p className="latin mt-1 break-all text-lg">{workspaceUrl(slug)}</p>
      </div>
      <Button size="lg" className="w-full" onClick={onEnter}>
        دخول إلى المصنع
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <p className="text-xs leading-6 text-muted-foreground">
        العنوان الحقيقي محتاج DNS وسيرفر. في النسخة الحالية بنفتح المصنع من نفس الجهاز، والنظام بيعرف المصنع من الـslug
        بنفس الطريقة اللي الـbackend هيستخدمها.
      </p>
    </div>
  );
}
