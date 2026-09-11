import { useState, type FormEvent } from "react";
import { ArrowLeft, ShieldCheck, UserRound, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Lockup } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFactory } from "@/store/context";
import { ROLE_LABEL, type BackupFile } from "@/store/types";

export function Gate() {
  const { db, login } = useFactory();
  const [fresh, setFresh] = useState(!db.factory);

  if (db.factory && !fresh) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">المصنع المحفوظ على الجهاز</p>
        <h2 className="mt-1 text-2xl">{db.factory.name}</h2>
        <p className="mt-2 text-sm text-muted-foreground">اختَر مين داخل. كل دور بيشوف الشاشات المسموحة له بس.</p>
        <div className="mt-5 space-y-2">
          {db.members.map((m) => (
            <button
              key={m.id}
              onClick={() => login(m)}
              className="flex w-full items-center justify-between rounded-md border border-border bg-background px-4 py-3 text-right transition-colors hover:border-primary/40"
            >
              <span>
                <span className="block font-medium">{m.name}</span>
                <span className="text-sm text-muted-foreground">{ROLE_LABEL[m.role]}</span>
              </span>
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
        <Button variant="ghost" className="mt-6 w-full" onClick={() => setFresh(true)}>
          مصنع جديد أو ترجيع نسخة
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
          <h2 className="text-2xl">اسم مصنعك</h2>
          <p className="text-sm text-muted-foreground">هيتكتب على الشاشات وأوامر الإنتاج والنسخة الاحتياطية.</p>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مصنع النور للملابس الجاهزة" required />
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" size="lg">
              ابدأ التسجيل
            </Button>
            <Button type="button" variant="outline" size="lg" onClick={() => setMode("home")}>
              إلغاء
            </Button>
          </div>
        </form>
      </Shell>
    );
  }

  if (mode === "restore") {
    return (
      <Shell>
        <h2 className="text-2xl">ترجيع نسخة احتياطية</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          الملف اللي نزلته من النسخة الأولى. هيتنقل العملاء والتحصيلات وأوامر الإنتاج والصور.
        </p>
        <label className="mt-6 flex cursor-pointer flex-col items-center rounded-lg border border-dashed border-border bg-background px-4 py-10 text-center transition-colors hover:border-accent">
          <span className="font-medium">اختَر ملف JSON</span>
          <span className="mt-1 text-sm text-muted-foreground">أقصى حجم للصورة جوه الملف 5 ميجا</span>
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
        <Button variant="outline" className="mt-4 w-full" onClick={() => setMode("home")}>
          إلغاء
        </Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-2xl leading-relaxed">كل جنيه داخل وخارج المصنع، في سيستم واحد.</h1>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        من القماش والإبرة لحد التوريد للعميل وتحصيل فلوسه. أوامر الإنتاج بخطوطها، والشاشات بتتغير حسب دورك، والتطبيق
        يتثبت على الموبايل زي أي تطبيق.
      </p>

      <div className="mt-7 grid gap-2">
        <Button size="lg" className="w-full" onClick={() => setMode("create")}>
          اعمل مصنعك
        </Button>
        <Button size="lg" variant="outline" className="w-full" onClick={() => setMode("restore")}>
          رجّع نسخة احتياطية
        </Button>
      </div>

      <div className="mt-9">
        <p className="mb-3 text-sm text-muted-foreground">دخول تجريبي بداتا جاهزة</p>
        <div className="grid gap-2">
          <RoleBtn icon={ShieldCheck} title="صاحب المصنع" body="كل حاجة: مسح، موظفين، سجل تعديلات، خزينة." onClick={() => startDemo("owner")} />
          <RoleBtn icon={Wallet} title="محاسب" body="يسجل ويعدّل الحسابات. ميمسحش." onClick={() => startDemo("accountant")} />
          <RoleBtn icon={UserRound} title="مشرف" body="العمال والحضور وأوامر الإنتاج بس." onClick={() => startDemo("supervisor")} />
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
  icon: typeof ShieldCheck;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 rounded-md border border-border bg-background p-4 text-right transition-colors hover:border-accent"
    >
      <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{body}</span>
      </span>
    </button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10">
        <div className="flex justify-center pb-8">
          <Lockup className="w-36" />
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 md:p-8">{children}</div>
        <div className="flex items-center justify-center gap-2 pt-6 text-xs text-muted-foreground">
          <span className="h-1 w-1 rounded-full bg-accent" />
          الداتا محفوظة على الجهاز لحد ما توصّل السيرفر
        </div>
      </div>
    </div>
  );
}
