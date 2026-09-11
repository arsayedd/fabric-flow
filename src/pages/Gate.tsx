import { useState, type FormEvent } from "react";
import { Factory, Shield, UserRound, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useFactory } from "@/store/context";
import { ROLE_LABEL, type BackupFile } from "@/store/types";

export function Gate() {
  const { db, login } = useFactory();
  const [fresh, setFresh] = useState(!db.factory);

  if (db.factory && !fresh) {
    return (
      <Shell>
        <p className="text-xs font-semibold text-brass">المصنع المحفوظ على الجهاز</p>
        <h2 className="mt-1 text-2xl font-extrabold">{db.factory.name}</h2>
        <p className="mt-2 text-sm text-muted-foreground">اختَر مين داخل. كل دور بيشوف الشاشات المسموحة له بس.</p>
        <div className="mt-5 space-y-2">
          {db.members.map((m) => (
            <button
              key={m.id}
              onClick={() => login(m)}
              className="flex w-full items-center justify-between rounded-xl border bg-background px-4 py-3 text-right"
            >
              <span>
                <span className="block font-bold">{m.name}</span>
                <span className="text-xs text-muted-foreground">{ROLE_LABEL[m.role]}</span>
              </span>
              <span className="text-xs text-muted-foreground">{m.email}</span>
            </button>
          ))}
        </div>
        <Button variant="ghost" className="mt-6 w-full" onClick={() => setFresh(true)}>
          مصنع جديد أو ترجيع نسخة أو تجربة تانية
        </Button>
      </Shell>
    );
  }

  return <Welcome />;
}

function Welcome() {
  const { createFactory, startDemo, importBackup } = useFactory();
  const [mode, setMode] = useState<"home" | "create" | "restore">("home");
  const [name, setName] = useState("");

  const onRestore = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupFile;
      importBackup(parsed);
      toast.success("اتنقلت النسخة الاحتياطية بصورها.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "الملف مش نسخة احتياطية مفهومة.");
    }
  };

  if (mode === "create") {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      createFactory(name);
    };
    return (
      <Shell>
        <form onSubmit={submit} className="space-y-4">
          <h2 className="text-2xl font-extrabold">اسم مصنعك</h2>
          <p className="text-sm text-muted-foreground">هيتكتب على الشاشات والنسخة الاحتياطية.</p>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مصنع النور للملابس الجاهزة" required />
          <Button type="submit" className="w-full" size="lg">
            ابدأ التسجيل
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => setMode("home")}>
            رجوع
          </Button>
        </form>
      </Shell>
    );
  }

  if (mode === "restore") {
    return (
      <Shell>
        <h2 className="text-2xl font-extrabold">ترجيع نسخة احتياطية</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          الملف اللي نزلته من النسخة الأولى. هيتنقل العملاء والتحصيلات والصور وكل حاجة.
        </p>
        <label className="mt-6 flex cursor-pointer flex-col items-center rounded-2xl border border-dashed bg-card px-4 py-10 text-center">
          <Factory className="mb-2 h-8 w-8 text-primary" />
          <span className="font-semibold">اختَر ملف JSON</span>
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onRestore(f);
            }}
          />
        </label>
        <Button variant="ghost" className="mt-4 w-full" onClick={() => setMode("home")}>
          رجوع
        </Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-xs font-semibold tracking-wide text-brass">المرحلة 2 — السيستم الأونلاين</p>
      <h1 className="mt-2 text-3xl font-extrabold leading-snug">كل جنيه داخل وخارج المصنع، في سيستم واحد.</h1>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        من القماش والإبرة لحد التوريد للعميل وتحصيل فلوسه. الشاشات بتتغير حسب دورك، والتطبيق يتثبت على الموبايل زي أي تطبيق.
      </p>

      <div className="mt-8 grid gap-3">
        <Button size="lg" className="w-full" onClick={() => setMode("create")}>
          اعمل مصنعك
        </Button>
        <Button size="lg" variant="outline" className="w-full" onClick={() => setMode("restore")}>
          رجّع نسخة احتياطية
        </Button>
      </div>

      <div className="mt-10">
        <p className="mb-3 text-sm font-semibold text-muted-foreground">دخول تجريبي بداتا جاهزة</p>
        <div className="grid gap-2">
          <RoleBtn icon={Shield} title="صاحب المصنع" body="كل حاجة: مسح، موظفين، سجل تعديلات، خزينة." onClick={() => startDemo("owner")} />
          <RoleBtn icon={Wallet} title="محاسب" body="يسجل ويعدّل الحسابات. ميمسحش." onClick={() => startDemo("accountant")} />
          <RoleBtn icon={UserRound} title="مشرف" body="العمال والحضور والشغل بس. من غير عملاء ولا فلوس." onClick={() => startDemo("supervisor")} />
        </div>
      </div>
    </Shell>
  );
}

function RoleBtn({
  icon: Icon,
  title,
  body,
  onClick,
}: {
  icon: typeof Shield;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex items-start gap-3 rounded-2xl border bg-card p-4 text-right hover:border-primary/40">
      <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block font-bold">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{body}</span>
      </span>
    </button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[radial-gradient(1200px_500px_at_100%_-10%,#d4b36a33,transparent),linear-gradient(#1c3d36,#1c3d36_34%,#f3eee4_34%)]">
      <div className="mx-auto max-w-lg px-4 pb-16 pt-10">
        <div className="mb-8 flex items-center gap-3 text-primary-foreground">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <Factory className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs opacity-80">إدارة مصنع الملابس</p>
            <p className="font-extrabold">دفتر المصنع</p>
          </div>
        </div>
        <Card className="p-5 md:p-7">{children}</Card>
      </div>
    </div>
  );
}
