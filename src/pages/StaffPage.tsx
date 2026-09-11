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
import { MODULE_KEYS, MODULE_LABEL, MODULE_READY, SLUG_MESSAGE, slugState } from "@/store/account";
import { useFactory } from "@/store/context";
import {
  ACTION_LABEL,
  MODULE_LABEL as PERM_MODULE_LABEL,
  PERM_ACTIONS,
  PERM_MODULES,
  ROLE_DEFAULTS,
  allowed,
  roleMatrix,
  toggle,
  type PermAction,
  type PermModule,
} from "@/store/permissions";
import { INDUSTRY_LABEL, ROLE_LABEL, ROLES, type Role } from "@/store/types";

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

      <PermissionsCard />

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

/**
 * مصفوفة الصلاحيات.
 *
 * الأدوار التلاتة بقت **نقطة بداية** مش سور: صاحب المصنع يفتح أو يقفل أي
 * خانة بعينها. والمصفوفة مش ديكور — نفس الخانة دي هي اللي بترفض التنفيذ في
 * العملية نفسها، مش بتخفي الزر وخلاص.
 *
 * اللي مش معدَّل بيفضل على الافتراضي، فمصنع مافتحش الشاشة دي عمره بيشتغل
 * بنفس السلوك القديم بالحرف.
 */
function PermissionsCard() {
  const { db, can, setPermissions } = useFactory();
  const [target, setTarget] = useState<Role>("accountant");
  if (!can.staff) return null;

  const matrix = roleMatrix(target, db.settings.permissions);
  const custom = !!db.settings.permissions?.[target];

  const flip = (module: PermModule, action: PermAction) => {
    try {
      setPermissions(target, toggle(matrix, module, action));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مش قادر أعدّل الصلاحية.");
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base">الصلاحيات</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            الصلاحية مش إخفاء زر: اللي مش من حقه مايشوفش القسم في القائمة، ولو حاول ينفّذ من العنوان مباشرة، العملية نفسها
            بترفض وبتقول له الصلاحية الناقصة بالاسم.
          </p>
        </div>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={target}
          onChange={(e) => setTarget(e.target.value as Role)}
        >
          {ROLES.filter((r) => r !== "owner").map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[26rem] text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="py-2 text-right font-normal">القسم</th>
              {PERM_ACTIONS.map((a) => (
                <th key={a} className="px-1 py-2 text-center font-normal">
                  {ACTION_LABEL[a]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERM_MODULES.map((m) => (
              <tr key={m} className="border-b border-border/60 last:border-0">
                <td className="py-1.5">{PERM_MODULE_LABEL[m]}</td>
                {PERM_ACTIONS.map((a) => {
                  const on = allowed(matrix, m, a);
                  return (
                    <td key={a} className="px-1 py-1.5 text-center">
                      <button
                        onClick={() => flip(m, a)}
                        aria-label={`${ACTION_LABEL[a]} ${PERM_MODULE_LABEL[m]}`}
                        aria-pressed={on}
                        className={`h-6 w-6 rounded border text-xs transition-colors ${
                          on ? "border-accent bg-accent-soft text-accent" : "border-border bg-card text-muted-foreground/40 hover:border-accent/40"
                        }`}
                      >
                        {on ? "✓" : "—"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {custom ? "معدَّل عن الافتراضي، وكل تعديل مسجّل في سجل التعديلات." : "على الافتراضي — مفيش تعديل محفوظ للدور ده."}
        </p>
        {custom ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPermissions(target, ROLE_DEFAULTS[target]);
              toast.success("رجعت لصلاحيات الدور الافتراضية.");
            }}
          >
            رجّع الافتراضي
          </Button>
        ) : null}
      </div>

      <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
        مستوى الوصول للبيانات (فرع / قسم / بياناته هو) لسه محتاج ربط السجلات بالفروع والأقسام، فدلوقتي كل صلاحية بتشتغل
        على مستوى المصنع كله. والتحقق النهائي مكانه السيرفر: نفس المصفوفة دي هي اللي بتتحوّل لـRLS.
      </p>
    </Card>
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
  const { exportBackup, resetDemo, setOverhead, db, can } = useFactory();

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

      <WorkspaceCard />

      <Card>
        <h3 className="text-base">نشاط المصنع</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {INDUSTRY_LABEL[db.settings.industry]} — الوحدات والفئات والعمليات اتجهزت على أساسه، وتقدر تعدّلها من
          المنتجات والمخزن.
        </p>
        {can.finance ? (
          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm text-muted-foreground">
              أوفرهيد على القطعة (إيجار وكهرباء وإدارة موزّعة)
            </span>
            <Input
              inputMode="decimal"
              defaultValue={db.settings.overheadPerUnit}
              onBlur={(e) => {
                setOverhead(Number(e.target.value) || 0);
                toast.success("الأوفرهيد اتحدّث وتكلفة المنتجات اتحسبت من تاني.");
              }}
            />
          </label>
        ) : null}
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

/**
 * الـworkspace: العنوان والموديولات.
 * الـsubdomain مربوط بـID المصنع، فتغييره بيغيّر العنوان بس — البيانات
 * مكانها ما بيتغيّرش، وده الفرق بين ربط الـtenant بالاسم وربطه بالـID.
 */
function WorkspaceCard() {
  const { account, updateWorkspace, setModules, signOut } = useFactory();
  const ws = account.workspace;
  const [slug, setSlug] = useState(ws?.subdomain ?? "");
  if (!ws) return null;
  const state = slugState(slug, account.workspaces, ws.factoryId);

  return (
    <Card>
      <h3 className="text-base">الـWorkspace</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        عنوان مصنعك، ومربوط بـID المصنع <span className="latin">{ws.factoryId}</span>.
      </p>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm text-muted-foreground">الـSubdomain</span>
        <div className="flex items-center gap-2">
          <Input
            value={slug}
            dir="ltr"
            className="latin text-left"
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""))}
          />
          <span className="latin shrink-0 text-sm text-muted-foreground">.sanaa.app</span>
        </div>
      </label>
      <div className="mt-2 flex items-center gap-3">
        <span className={state === "free" ? "text-sm text-ok" : "text-sm text-danger"}>
          {slug === ws.subdomain ? "العنوان الحالي" : SLUG_MESSAGE[state]}
        </span>
        {slug !== ws.subdomain && state === "free" ? (
          <Button
            size="sm"
            onClick={() => {
              updateWorkspace({ subdomain: slug });
              toast.success("العنوان اتغيّر. البيانات زي ما هي.");
            }}
          >
            حفظ العنوان
          </Button>
        ) : null}
      </div>

      <div className="mt-5">
        <p className="text-sm text-muted-foreground">الموديولات اللي بتظهر في القائمة</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {MODULE_KEYS.filter((k) => MODULE_READY[k]).map((k) => {
            const on = !ws.modules.length || ws.modules.includes(k);
            return (
              <button
                key={k}
                onClick={() => {
                  const base = ws.modules.length ? ws.modules : MODULE_KEYS.filter((x) => MODULE_READY[x]);
                  const next = on ? base.filter((x) => x !== k) : [...base, k];
                  if (!next.length) {
                    toast.error("لازم موديول واحد على الأقل.");
                    return;
                  }
                  setModules(next);
                }}
                className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
                  on ? "border-accent bg-accent-soft" : "border-border bg-card hover:border-accent/50"
                }`}
              >
                {on ? "✓ " : ""}
                {MODULE_LABEL[k]}
              </button>
            );
          })}
        </div>
      </div>

      {account.user ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <div className="text-sm">
            <p>{account.user.fullName}</p>
            <p className="latin text-xs text-muted-foreground">{account.user.email}</p>
          </div>
          <Button variant="outline" size="sm" onClick={signOut}>
            خروج من الحساب
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
