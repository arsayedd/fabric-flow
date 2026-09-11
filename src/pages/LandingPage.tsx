import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  Banknote,
  Boxes,
  Brain,
  CalendarClock,
  ClipboardList,
  Coins,
  Factory,
  LayoutDashboard,
  Layers,
  Package,
  ScrollText,
  ShieldCheck,
  Truck,
  UserRound,
  UsersRound,
  Wallet,
  Warehouse,
} from "lucide-react";
import { BrandRow } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { money, qty } from "@/lib/utils";
import { useFactory } from "@/store/context";

const FEATURES = [
  { icon: Factory, title: "أوامر الإنتاج", body: "كل أمر بمراحله: قص، خياطة، مكوى، جودة، تعبئة — وكمية كل مرحلة لحظة بلحظة." },
  { icon: Layers, title: "قوائم التصنيع (BOM)", body: "الموديل وخاماته وكمية كل خامة في القطعة ونسبة الهالك." },
  { icon: Coins, title: "التكلفة والربحية", body: "تكلفة كل قطعة وربحها الحقيقي، وتتحدّث لوحدها لما سعر خامة يتغيّر." },
  { icon: CalendarClock, title: "التخطيط والطاقة", body: "المصنع يقدر ينتج كام في اليوم، والأوامر تخلص إمتى فعلًا." },
  { icon: Boxes, title: "المخزون", body: "خامات وتحت التشغيل وإنتاج تام، برصيد محسوب من الحركات مش مكتوب بالإيد." },
  { icon: Warehouse, title: "المشتريات والموردين", body: "سعر كل مورد، وتاريخ الأسعار، وتأثير أي زيادة على تكلفة الموديلات." },
  { icon: UsersRound, title: "العمال والحضور", body: "يومية وشهري وبالقطعة، حضور بضغطة واحدة، سلف وخصومات وأرصدة." },
  { icon: Package, title: "المنتجات والمخزون التام", body: "كل موديل بسعره وحد الطلب والمتاح في المخزن." },
  { icon: UserRound, title: "العملاء والتجار والموردين", body: "جهة واحدة بأكتر من دور، وملف كامل بكل تعاملاتها." },
  { icon: Banknote, title: "التوريد والتحصيل", body: "كشف حساب متحرك، أعمار الديون، وتحصيل بصورة التحويل وتأكيد الوصول." },
  { icon: Wallet, title: "الخزينة والأرباح", body: "رصيد كل حساب، أرباح أي فترة، وكل اللي عليك." },
  { icon: LayoutDashboard, title: "لوحة الإدارة", body: "سكور المصنع وأهم المشاكل اللي محتاجة تدخّل منك النهارده." },
  { icon: ScrollText, title: "سجل التعديلات والنسخ", body: "مين عمل إيه وإمتى، ونسخة احتياطية كاملة تنزّلها أي وقت." },
];

const STEPS = [
  { n: 1, title: "اعمل حساب المصنع", body: "اسمك وإيميلك، وبيانات المصنع ونشاطه، والـworkspace بيتجهّز لوحده." },
  { n: 2, title: "سجّل خاماتك وموديلاتك", body: "الخامة بسعرها، والموديل بقائمة خاماته ومراحل تشغيله." },
  { n: 3, title: "افتح أمر إنتاج", body: "الكمية والميعاد، والنظام يحجز الخامات ويقولك ناقصك إيه." },
  { n: 4, title: "سجّل الإنتاج والحضور", body: "كل مرحلة بكميتها، وحضور العمال بضغطة واحدة." },
  { n: 5, title: "سلّم وحصّل", body: "توريد للعميل، وتحصيل بطريقة الدفع وصورة التحويل، والأرباح بتظهر لوحدها." },
];

const COST_LINES: [string, number][] = [
  ["القماش", 270],
  ["المصنعية", 85],
  ["الإكسسوارات", 30],
  ["الطباعة", 25],
  ["المكوى", 12],
  ["التغليف", 13],
];

export function LandingPage() {
  const { startDemo } = useFactory();
  const cost = COST_LINES.reduce((s, [, v]) => s + v, 0);
  const price = 800;
  const profit = price - cost;

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-8">
          <BrandRow subtitle="نظام تشغيل المصنع" />
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">
              المميزات
            </a>
            <a href="#how" className="hover:text-foreground">
              إزاي بيشتغل
            </a>
            <a href="#costing" className="hover:text-foreground">
              التكلفة والربح
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">تسجيل دخول</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/signup">ابدأ مجانًا</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-4 pt-12 md:px-8 md:pt-20">
        <div className="grid items-center gap-10 md:grid-cols-[1fr_1.05fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs text-[#8a6520]">
              <BadgeCheck className="h-3.5 w-3.5" />
              ملابس · شنط · أحذية · مفروشات · أغذية
            </span>
            <h1 className="mt-5 text-3xl leading-snug md:text-[2.6rem] md:leading-tight">
              إدارة مصنعك بالكامل من مكان واحد
            </h1>
            <p className="mt-4 max-w-xl text-base leading-8 text-muted-foreground">
              صنعة بياخد مصنعك من الخامة لحد التحصيل: أوامر إنتاج بمراحلها، مخزون برصيد محسوب، تكلفة كل قطعة وربحها
              الحقيقي، عمال وحضور، عملاء وتحصيل — وسكور واحد يقولك حالة المصنع النهارده وإيه اللي محتاج تدخّل منك.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link to="/signup">ابدأ مجانًا</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="#how">شاهد كيف تعمل صنعة</a>
              </Button>
            </div>
            <p className="mt-4 text-[13px] text-muted-foreground">
              من غير كارت دفع. مصنعك بياخد عنوان مستقل زي <span className="latin">alnoor.sanaa.app</span>.
            </p>
          </div>
          <DashboardPreview />
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 py-16 md:px-8">
        <h2 className="text-2xl">كل حاجة في المصنع، مربوطة ببعضها</h2>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
          الرقم اللي بتدخله مرة واحدة بيتستخدم في كل مكان مرتبط بيه. سعر القماش اللي سجّلته في المشتريات هو نفسه اللي
          بيحسب تكلفة الموديل وربح الأمر.
        </p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-lg border border-border bg-card p-5">
              <f.icon className="h-5 w-5 text-accent" />
              <h3 className="mt-3 text-base">{f.title}</h3>
              <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="bg-primary py-16 text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <h2 className="text-2xl">إزاي بيشتغل</h2>
          <p className="mt-2 text-sm text-primary-foreground/60">خمس خطوات من أول تسجيل لحد أول تحصيل.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-5">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-lg border border-[#1d2733] bg-[#141d27] p-5">
                <span className="latin flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm text-accent-foreground">
                  {s.n}
                </span>
                <h3 className="mt-3 text-base">{s.title}</h3>
                <p className="mt-1.5 text-[13px] leading-6 text-primary-foreground/60">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="costing" className="mx-auto max-w-6xl px-4 py-16 md:px-8">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-2xl">تعرف تكلفة كل قطعة وربحها بالجنيه</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              التكلفة مش رقم بتكتبه بإيدك. كل بند بيتسحب من مكانه: القماش من قائمة التصنيع وسعر الشرا، المصنعية من مراحل
              التشغيل، والباقي من بنود التكلفة. ولو سعر القماش زاد بكرة، تكلفة كل الموديلات اللي بتستخدمه بتتحدّث لوحدها
              — من غير ما تفتح شاشة واحدة.
            </p>
            <ul className="mt-5 space-y-2 text-sm">
              {[
                "هامش الربح ونسبة الماركب لكل موديل",
                "نقطة التعادل وأقل سعر بيع مقبول",
                "تكلفة الهدف: هل الموديل فوق الهدف بكام؟",
                "سكور ربحية من ١٠٠ لكل موديل، بأسبابه",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2 text-muted-foreground">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">قميص قطني — تكلفة القطعة</p>
            <div className="mt-4 flex items-baseline justify-between border-b border-border pb-3">
              <span className="text-sm">سعر البيع</span>
              <span className="text-lg">{money(price)}</span>
            </div>
            <div className="mt-3 space-y-2">
              {COST_LINES.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground">− {label}</span>
                  <span>{money(value)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3 text-sm">
              <span>إجمالي التكلفة</span>
              <span>{money(cost)}</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-secondary p-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground">ربح القطعة</p>
                <p className="mt-1 text-base text-ok">{money(profit)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">هامش الربح</p>
                <p className="mt-1 text-base">{qty((profit / price) * 100, 1)}٪</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">الماركب</p>
                <p className="mt-1 text-base">{qty(price / cost, 2)}×</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-secondary/60 py-16">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <h2 className="text-2xl">أرقام مصنعك بتتكلم</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
            سكور المصنع من ١٠٠، مقسّم على تمانية أبعاد، وكل بُعد بيقولك أرقامه — ولو مفيش بيانات كفاية بيقولك كده صريح
            بدل ما يخمّن.
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["كفاءة الإنتاج", 88],
              ["ضبط التكلفة", 76],
              ["الجودة", 91],
              ["المخزون", 82],
              ["العمالة", 87],
              ["التسليم", 79],
              ["الربحية", 85],
              ["السيولة", 81],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="text-base">{qty(value as number)}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-muted">
                  <div className="h-1.5 rounded-full bg-accent" style={{ width: `${value}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-sm">
              <Brain className="h-4 w-4 text-accent" />
              أهم المشاكل اللي محتاجة تدخّل منك النهارده
            </div>
            <ul className="mt-3 space-y-2 text-[13px] text-muted-foreground">
              <li>· المكوى هي الاختناق: بتخرج ٧٠٠ قطعة في اليوم والخياطة بتخرج ١٠٠٠.</li>
              <li>· القماش الأسود هيخلص خلال ٦ أيام والشرا بياخد ١٠.</li>
              <li>· ٣ توريدات متأخرة على عميل واحد بقيمة تعدّت حد الائتمان.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 md:px-8">
        <div className="rounded-2xl border border-border bg-card p-8 text-center md:p-12">
          <h2 className="text-2xl">ابدأ إدارة مصنعك بطريقة أذكى</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
            جهّز مصنعك في دقايق: الحساب، بيانات المصنع، الـworkspace، والموديولات اللي محتاجها. تقدر تضيف الموظفين بعد
            كده أو تتخطاها الآن.
          </p>
          <Button size="lg" className="mt-6" asChild>
            <Link to="/signup">
              ابدأ الآن
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="mt-12">
          <h3 className="text-base">أو شوف السيستم بداتا جاهزة</h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            مصنع تجريبي كامل بأوامر إنتاج وعمال وتحصيلات. كل دور بيشوف الشاشات المسموحة له بس.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <DemoBtn icon={ShieldCheck} title="صاحب المصنع" body="كل حاجة: مسح، موظفين، سجل تعديلات، خزينة." onClick={() => startDemo("owner")} />
            <DemoBtn icon={Wallet} title="محاسب" body="يسجل ويعدّل الحسابات. ميمسحش." onClick={() => startDemo("accountant")} />
            <DemoBtn icon={ClipboardList} title="مشرف" body="العمال والحضور وأوامر الإنتاج بس." onClick={() => startDemo("supervisor")} />
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 text-[13px] text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
          <span>صنعة — نظام تشغيل للمصانع القائمة على خامات وعمليات وعمال.</span>
          <span className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            البيانات محفوظة على جهازك في النسخة الحالية
          </span>
        </div>
      </footer>
    </div>
  );
}

function DemoBtn({
  icon: Icon,
  title,
  body,
  onClick,
}: {
  icon: typeof ShieldCheck;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 rounded-md border border-border bg-card p-4 text-right transition-colors hover:border-accent"
    >
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-6 text-muted-foreground">{body}</span>
      </span>
    </button>
  );
}

/** صورة اللوحة: أرقام المصنع التجريبي نفسها، عشان اللي بيشوفها يشوف حقيقة الشاشة */
function DashboardPreview() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <p className="text-sm">مصنع النور للملابس الجاهزة</p>
          <p className="latin text-xs text-muted-foreground">alnoor.sanaa.app</p>
        </div>
        <span className="rounded-full bg-ok-soft px-3 py-1 text-xs text-ok">سكور المصنع ٨٤</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          ["منتَج النهارده", "٤٢٠ قطعة"],
          ["أوامر شغالة", "٦"],
          ["تحصيل الشهر", "٣١٢٬٥٠٠"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-secondary p-3">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="mt-1 text-sm">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2.5">
        {[
          ["القص", 100],
          ["الخياطة", 86],
          ["المكوى", 61],
          ["فحص الجودة", 54],
          ["التعبئة", 48],
        ].map(([label, pct]) => (
          <div key={label as string}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">{label}</span>
              <span>{qty(pct as number)}٪</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-muted">
              <div
                className={`h-1.5 rounded-full ${(pct as number) < 65 ? "bg-accent" : "bg-primary"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 rounded-md bg-warn-soft px-3 py-2 text-[12px] text-[#8a6520]">
        المكوى هي الاختناق — بتخرج ٧٠٠ قطعة في اليوم.
      </p>
    </div>
  );
}
