import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { setupProgress } from "@/store/setup";

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
