import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { AuthShell, Field, PasswordInput, PasswordMeter } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkPassword } from "@/store/account";
import { useFactory } from "@/store/context";

/** نسيت كلمة السر: إيميل → كود → كلمة سر جديدة → تم */
export function ForgotPasswordPage() {
  const { startReset, finishReset } = useFactory();
  const nav = useNavigate();
  const [stage, setStage] = useState<"email" | "code" | "password" | "done">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const send = () => {
    try {
      setSent(startReset(email));
      setStage("code");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "مش قادر يبعت الكود.");
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await finishReset(email, code, password);
      setStage("done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "مش قادر يغيّر كلمة السر.");
    } finally {
      setBusy(false);
    }
  };

  if (stage === "done") {
    return (
      <AuthShell title="كلمة السر اتغيّرت" subtitle="تقدر تدخل بكلمة السر الجديدة.">
        <CheckCircle2 className="h-10 w-10 text-ok" />
        <Button size="lg" className="mt-6 w-full" onClick={() => nav("/login")}>
          تسجيل الدخول
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="نسيت كلمة السر"
      subtitle="اكتب إيميلك، وهنبعتلك كود تأكيد، وبعده تحدّد كلمة سر جديدة."
      footer={
        <Link to="/login" className="text-foreground underline underline-offset-4">
          رجوع لتسجيل الدخول
        </Link>
      }
    >
      <div className="space-y-4">
        <Field label="الإيميل">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={stage !== "email"}
            className="latin text-left"
            placeholder="you@factory.com"
          />
        </Field>

        {stage === "email" ? (
          <Button size="lg" className="w-full" onClick={send} disabled={!email.trim()}>
            ابعت كود التأكيد
          </Button>
        ) : null}

        {stage === "code" ? (
          <>
            <div className="rounded-md border border-accent/30 bg-accent-soft p-3 text-sm leading-6">
              مفيش سيرفر إيميل في النسخة الحالية، فالكود بيتعرض هنا:{" "}
              <span className="latin font-medium">{sent}</span>
            </div>
            <Field label="كود التأكيد">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                className="latin text-center text-lg tracking-[0.5em]"
                inputMode="numeric"
                placeholder="______"
              />
            </Field>
            <Button size="lg" className="w-full" onClick={() => setStage("password")} disabled={code.length !== 6}>
              تأكيد
            </Button>
          </>
        ) : null}

        {stage === "password" ? (
          <>
            <Field label="كلمة السر الجديدة">
              <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
            </Field>
            <PasswordMeter value={password} />
            <Field label="تأكيد كلمة السر" error={confirm && confirm !== password ? "الكلمتين مش زي بعض." : null}>
              <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" />
            </Field>
            <Button
              size="lg"
              className="w-full"
              onClick={save}
              disabled={busy || !checkPassword(password).ok || confirm !== password}
            >
              {busy ? "بيتحفظ..." : "حفظ كلمة السر"}
            </Button>
          </>
        ) : null}
      </div>
    </AuthShell>
  );
}
