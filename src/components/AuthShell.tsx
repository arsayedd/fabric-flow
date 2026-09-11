import { Link } from "react-router-dom";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Lockup } from "@/components/Brand";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { checkPassword } from "@/store/account";

export function AuthShell({
  title,
  subtitle,
  children,
  wide,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background">
      <div className={cn("mx-auto flex min-h-dvh flex-col px-4 py-8", wide ? "max-w-3xl" : "max-w-md")}>
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowRight className="h-4 w-4" />
            الصفحة الرئيسية
          </Link>
          <Lockup className="w-24" />
        </div>
        <div className="mt-8 flex-1">
          <h1 className="text-2xl">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm leading-7 text-muted-foreground">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
        {footer ? <div className="pt-6 text-center text-sm text-muted-foreground">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  optional,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  optional?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {optional ? <span className="mr-1 text-xs text-muted-foreground">(اختياري)</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="pl-10"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "إخفاء كلمة السر" : "إظهار كلمة السر"}
        className="absolute inset-y-0 left-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/** شروط كلمة السر بتتعرض وهي بتتحقق — مش رسالة خطأ بعد ما يضغط */
export function PasswordMeter({ value }: { value: string }) {
  const c = checkPassword(value);
  const rules: [boolean, string][] = [
    [c.length, "٨ حروف على الأقل"],
    [c.upper, "حرف كبير (A)"],
    [c.lower, "حرف صغير (a)"],
    [c.digit, "رقم (٢)"],
    [c.symbol, "رمز (@)"],
  ];
  const tone = c.score >= 3 ? "bg-ok" : c.score === 2 ? "bg-warn" : "bg-danger";
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < c.score ? tone : "bg-muted")} />
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{value ? c.label : "كلمة السر"}</span>
      </div>
      <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {rules.map(([ok, text]) => (
          <li key={text} className={ok ? "text-ok" : "text-muted-foreground"}>
            {ok ? "✓" : "○"} {text}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        مثال: <span className="latin">Ahmed@2026</span>
      </p>
    </div>
  );
}
