import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AuthShell, Field, PasswordInput } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEMO_LOGIN } from "@/store/account";
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

      {/*
        الحساب التجريبي معروض بكلمة سره. ده مش تسريب: المساحة اللي بيفتحها
        داتا مولّدة على نفس الجهاز، ومعلّمة تجريبية في كل شاشة. والزرار
        بيعبّي الخانتين بدل ما المستخدم ينقل بإيده — وبيسيبه يضغط «دخول»
        هو، عشان اللي جاي يشوف شاشة الدخول يشوفها فعلًا.
      */}
      <div className="mt-6 rounded-md border border-accent/30 bg-accent-soft/40 p-4">
        <p className="text-sm">عايز تشوف النظام بسرعة؟ خُد حساب تجريبي</p>
        <dl className="mt-2 space-y-1 text-xs leading-6 text-muted-foreground">
          <div className="flex gap-2">
            <dt>الإيميل</dt>
            <dd className="latin text-left text-foreground">{DEMO_LOGIN.email}</dd>
          </div>
          <div className="flex gap-2">
            <dt>كلمة السر</dt>
            <dd className="latin text-left text-foreground">{DEMO_LOGIN.password}</dd>
          </div>
        </dl>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => {
            setEmail(DEMO_LOGIN.email);
            setPassword(DEMO_LOGIN.password);
          }}
        >
          عبّي البيانات التجريبية
        </Button>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          بيفتح مصنع النور التجريبي بداتا جاهزة. لو عايز تدخل بدور معيّن من غير حساب،
          فيه{" "}
          <Link to="/" className="text-foreground underline underline-offset-4">
            دخول تجريبي بزرار واحد
          </Link>{" "}
          في الصفحة الرئيسية.
        </p>
      </div>

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
