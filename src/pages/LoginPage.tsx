import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AuthShell, Field, PasswordInput } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFactory } from "@/store/context";

export function LoginPage() {
  const { signIn, account } = useFactory();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const mine = await signIn(email, password, remember);
      if (!mine.length) {
        // حساب موجود من غير مصنع: يكمّل تجهيز مصنعه بدل ما يقف
        toast.info("الحساب ده لسه مالوش مصنع — نكمّل التجهيز.");
        nav("/signup/factory");
        return;
      }
      if (mine.length > 1) nav("/factories");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "مش قادر يدخل.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="تسجيل الدخول"
      subtitle="ادخل بإيميلك، وهنوصّلك لمصنعك على طول. لو عندك أكتر من مصنع هتختار منهم."
      footer={
        <>
          لسه مالكش حساب؟{" "}
          <Link to="/signup" className="text-foreground underline underline-offset-4">
            ابدأ مجانًا
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="الإيميل">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@factory.com"
            autoComplete="email"
            className="latin text-left"
            required
          />
        </Field>
        <Field label="كلمة السر">
          <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" />
        </Field>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 accent-[#0f1720]"
            />
            خلّيني داخل
          </label>
          <Link to="/forgot" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
            نسيت كلمة السر؟
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "بيتأكد..." : "دخول"}
        </Button>
        <p className="text-xs leading-6 text-muted-foreground">
          الدخول بالإيميل وكلمة السر هو الأساس. الدخول بجوجل أو فيسبوك ممكن يتضاف بعد كده، ومحتاج سيرفر.
        </p>
      </form>

      {account.workspaces.some((w) => !w.ownerId) ? (
        <div className="mt-6 rounded-md border border-border bg-card p-4">
          <p className="text-sm">فيه مصنع محفوظ على الجهاز ده من غير حساب</p>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            المصانع اللي اتعملت قبل نظام الحسابات بتفضل شغالة زي ما هي. تقدر تدخلها من غير تسجيل.
          </p>
          <Button variant="outline" size="sm" className="mt-3" asChild>
            <Link to="/device">دخول للمصنع المحفوظ</Link>
          </Button>
        </div>
      ) : null}
    </AuthShell>
  );
}
