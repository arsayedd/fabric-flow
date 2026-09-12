import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, MailCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, countLabel, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { setupGaps, setupProgress } from "@/store/setup";

/**
 * مساعد التجهيز المستمر.
 *
 * مش wizard بيخلص. الفرق بين ده وبين قايمة الخطوات إن الخطوات بتسأل
 * «بدأت؟» ودي بتسأل **«شغّال صح؟»** — وموديل جديد بعد سنة بيفتح ثقب
 * جديد. فالقايمة بتتحسب كل مرة ومابتتأرشفش.
 *
 * وكل بند بيقول **إيه اللي بيتوقف بسببه**: «٤ موديلات من غير قائمة
 * خامات» توصيف، و«تكلفتها وربحها مش محسوبين» هو السبب اللي بيخلي حد
 * يقوم يعملها.
 */
export function SetupGapsCard({ compact = false }: { compact?: boolean }) {
  const { db, account } = useFactory();
  const gaps = setupGaps(db, account.workspace);
  if (!gaps.length) return null;

  const warn = gaps.filter((g) => g.level === "warn").length;
  const shown = compact ? gaps.slice(0, 3) : gaps;

  return (
    <section className="rounded-lg border border-warn/30 bg-warn-soft p-5">
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
        <div className="min-w-0">
          {/* المثنى بياخد «محتاجين» مش «محتاجة» — الصفة بتتبع العدد في العربي */}
          <h2 className="text-base">
            {countLabel(gaps.length, "حاجة واحدة", "حاجتين", "حاجات", "حاجة")}{" "}
            {gaps.length === 2 ? "محتاجين" : "محتاجة"} اهتمامك في التجهيز
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {warn === 0
              ? "مفيش حاجة فيهم بتوقّف حساب — كلهم بيحسّنوا الدقة."
              : warn === 1
                ? "منهم واحدة بتوقّف حساب أو ورقة فعلًا — الباقي بيحسّن الدقة."
                : `منهم ${qty(warn, 0)} بيوقّفوا حساب أو ورقة فعلًا — الباقي بيحسّن الدقة.`}
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {shown.map((g) => (
          <li key={g.key}>
            <Link
              to={g.to}
              className="flex items-start gap-2.5 rounded-md bg-card/60 px-3 py-2.5 transition-colors hover:bg-card"
            >
              <span
                className={cn(
                  "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                  g.level === "warn" ? "bg-warn" : "bg-muted-foreground/50",
                )}
              />
              <span className="min-w-0">
                <span className="text-sm">{g.title}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{g.why}</span>
              </span>
              <ArrowLeft className="mr-auto mt-1 h-3.5 w-3.5 shrink-0 text-accent" />
            </Link>
          </li>
        ))}
      </ul>

      {compact && gaps.length > shown.length ? (
        <Link to="/alerts" className="mt-3 inline-block text-xs text-accent underline underline-offset-4">
          وكمان {qty(gaps.length - shown.length, 0)} — شوفهم كلهم
        </Link>
      ) : null}
    </section>
  );
}

/**
 * أول دخول: النسبة محسوبة من بيانات المصنع نفسها (مش رقم متخزّن)،
 * فالخطوة بتتشيل لوحدها أول ما المستخدم يضيف الحاجة من أي شاشة.
 */
export function WelcomeCard() {
  const { db, account, session } = useFactory();
  const progress = setupProgress(db, account.workspace);
  const [open, setOpen] = useState(true);
  if (progress.complete) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg">أهلًا بك في صنعة 👋</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {session?.name ? `${session.name}، ` : ""}باقي {qty(progress.total - progress.done)} خطوات ومصنعك يبقى جاهز بالكامل.
          </p>
        </div>
        <span className="rounded-full bg-secondary px-3 py-1 text-sm">تجهيز المصنع {qty(progress.pct)}٪</span>
      </div>

      <div className="mt-4 h-2 rounded-full bg-muted">
        <div className="h-2 rounded-full bg-accent transition-all" style={{ width: `${progress.pct}%` }} />
      </div>

      {open ? (
        <ul className="mt-4 space-y-1.5">
          {progress.steps.map((s) => {
            const body = (
              <>
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    s.done ? "border-ok bg-ok text-white" : "border-border",
                  )}
                >
                  {s.done ? <Check className="h-3 w-3" /> : null}
                </span>
                <span className={cn("text-sm", s.done && "text-muted-foreground line-through decoration-border")}>{s.label}</span>
              </>
            );
            if (s.done || s.locked) {
              return (
                <li key={s.key} className="flex items-center gap-2.5 rounded-md px-2 py-2">
                  {body}
                </li>
              );
            }
            return (
              <li key={s.key}>
                <Link to={s.to} className="flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-muted">
                  {body}
                  <span className="mr-auto text-xs text-accent">ابدأ</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      <button onClick={() => setOpen((o) => !o)} className="mt-3 text-xs text-muted-foreground hover:text-foreground">
        {open ? "اقفل القائمة" : "افتح القائمة"}
      </button>
    </section>
  );
}

/**
 * تأكيد الإيميل.
 * مفيش سيرفر إيميل في النسخة الحالية، فالكود بيتعرض هنا — مكتوب صريح
 * عشان محدش يستنى رسالة مش جاية.
 */
export function VerifyEmailCard() {
  const { account, verifyEmail, resendVerification } = useFactory();
  const user = account.user;
  const [code, setCode] = useState("");
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  if (!user || user.emailVerified) return null;

  return (
    <section className="rounded-lg border border-accent/30 bg-accent-soft p-5">
      <div className="flex items-center gap-2">
        <MailCheck className="h-4 w-4 text-accent" />
        <h2 className="text-base">أكّد إيميلك</h2>
      </div>
      <p className="mt-1.5 text-sm leading-7 text-muted-foreground">
        بعتنا كود لـ<span className="latin"> {user.email}</span>. تأكيد الإيميل بيخليك تقدر ترجّع كلمة السر لو نسيتها.
      </p>
      {user.verifyCode ? (
        <p className="mt-2 text-sm">
          مفيش سيرفر إيميل في النسخة الحالية، فالكود هو: <span className="latin font-medium">{user.verifyCode}</span>
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
          className="latin w-32 text-center tracking-[0.4em]"
          inputMode="numeric"
          placeholder="______"
        />
        <Button
          onClick={() => {
            try {
              verifyEmail(code);
              toast.success("الإيميل اتأكد.");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "الكود غلط.");
            }
          }}
          disabled={code.length !== 6}
        >
          تأكيد
        </Button>
        <Button
          variant="ghost"
          disabled={wait > 0}
          onClick={() => {
            resendVerification();
            setWait(60);
            toast.success("اتبعت كود جديد.");
          }}
        >
          {wait > 0 ? `إعادة الإرسال بعد ${qty(wait)} ثانية` : "إعادة إرسال الكود"}
        </Button>
      </div>
    </section>
  );
}
