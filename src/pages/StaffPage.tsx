import { useState } from "react";
import { toast } from "sonner";
import { Lockup } from "@/components/Brand";
import { Field, Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, selectClass } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { supabaseConfigured } from "@/lib/supabase";
import { useFactory } from "@/store/context";
import { ROLE_LABEL, ROLES, type Role } from "@/store/types";

export function StaffPage() {
  const { db, invite, acceptInvite, changeRole, removeMember, session } = useFactory();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("accountant");

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">الموظفين</h2>
          <p className="text-sm text-muted-foreground">
            اكتب إيميله واختَر دوره. أول ما يعمل حساب بنفس الإيميل بيتضاف للمصنع.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>دعوة</Button>
      </div>

      <section className="space-y-2">
        {db.members.map((m) => (
          <Card key={m.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{m.name}</p>
                <p className="text-sm text-muted-foreground">{m.email}</p>
              </div>
              <Badge tone={m.role === "owner" ? "gold" : "muted"}>{ROLE_LABEL[m.role]}</Badge>
            </div>
            {m.role !== "owner" && m.id !== session?.memberId ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <select
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={m.role}
                  onChange={(e) => changeRole(m.id, e.target.value as Role)}
                >
                  {ROLES.filter((r) => r !== "owner").map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="danger" onClick={() => removeMember(m.id)}>
                  شيله
                </Button>
              </div>
            ) : null}
          </Card>
        ))}
      </section>

      <section>
        <h3 className="mb-2 text-base">دعوات لسه متتقبلتش</h3>
        {db.invites.filter((i) => i.status === "pending").length === 0 ? (
          <p className="text-sm text-muted-foreground">مفيش دعوات مفتوحة.</p>
        ) : (
          db.invites
            .filter((i) => i.status === "pending")
            .map((i) => (
              <Card key={i.id} className="mb-2">
                <p className="font-medium">{i.email}</p>
                <p className="text-sm text-muted-foreground">
                  {ROLE_LABEL[i.role]} · {formatDate(i.createdAt.slice(0, 10))}
                </p>
                <Button
                  size="sm"
                  className="mt-2"
                  variant="outline"
                  onClick={() => {
                    acceptInvite(i.id, i.email.split("@")[0]);
                    toast.success("اتقبلت الدعوة (محاكاة التجربة).");
                  }}
                >
                  محاكاة قبول الدعوة
                </Button>
              </Card>
            ))
        )}
      </section>

      <Panel
        open={open}
        title="دعوة موظف"
        onClose={() => setOpen(false)}
        footer={
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => {
                if (!email.includes("@")) return toast.error("إيميل غلط");
                invite(email, role);
                toast.success("الدعوة اتسجلت. أول ما يأكد حسابه بنفس الإيميل بيتضاف.");
                setEmail("");
                setOpen(false);
              }}
            >
              ابعت دعوة
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </div>
        }
      >
        <Field label="الإيميل">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" />
        </Field>
        <Field label="الدور">
          <select className={selectClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.filter((r) => r !== "owner").map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
      </Panel>
    </div>
  );
}

export function AuditPage() {
  const { db } = useFactory();
  const actionLabel = { create: "إضافة", update: "تعديل", delete: "مسح", restore: "ترجيع نسخة" };
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl">سجل التعديلات</h2>
        <p className="text-sm text-muted-foreground">
          صاحب المصنع بس اللي يشوف مين ضاف أو عدّل أو مسح، وإمتى، والقيمة قبلها كانت كام.
        </p>
      </div>
      <div className="space-y-2">
        {db.auditLog.map((a) => (
          <Card key={a.id} className="text-sm">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{a.actorName}</span>
              <span className="text-xs text-muted-foreground">{new Date(a.at).toLocaleString("ar-EG")}</span>
            </div>
            <p className="mt-0.5 text-muted-foreground">
              {actionLabel[a.action]} · {a.table}
            </p>
            {a.before ? (
              <pre className="mt-2 max-h-24 overflow-auto rounded-md bg-muted p-2 text-xs leading-5" dir="ltr">
                {JSON.stringify(a.before, null, 1)}
              </pre>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { exportBackup, resetDemo, db, can } = useFactory();

  const download = () => {
    const backup = exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${backup.factoryName.replace(/\s+/g, "-")}-${backup.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("النسخة الاحتياطية نزلت. ده الملف اللي هننقل بيه للسيرفر.");
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl">الإعدادات</h2>

      <Card className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium">{db.factory?.name}</p>
          <p className="text-sm text-muted-foreground">
            {supabaseConfigured
              ? "مفاتيح Supabase موجودة. بعد ما تضيف schema اسمها factory في Exposed schemas، الشاشات تتشبك على السيرفر."
              : "الداتا محفوظة على الجهاز. وصّل Supabase من ملف .env لما تكون جاهز تنقلها أونلاين."}
          </p>
        </div>
        <Lockup className="hidden w-24 shrink-0 sm:block" />
      </Card>

      <Card>
        <h3 className="text-base">تثبيت على الموبايل</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          من متصفح الموبايل اختَر «إضافة إلى الشاشة الرئيسية»، وهيفتح باسم صنعة وأيقونتها زي أي تطبيق. على الآيفون ده
          شرط وصول الإشعارات في المرحلة 3.
        </p>
      </Card>

      <Button className="w-full" onClick={download}>
        تنزيل نسخة احتياطية
      </Button>
      {can.delete ? (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            resetDemo();
            toast.success("الداتا التجريبية رجعت.");
          }}
        >
          رجّع الداتا التجريبية
        </Button>
      ) : null}
    </div>
  );
}
