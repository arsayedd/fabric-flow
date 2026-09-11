import { Card } from "@/components/ui/card";
import { qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { NAV } from "@/store/nav";
import { ACTION_LABEL, MODULE_LABEL, PERM_ACTIONS, PERM_MODULES } from "@/store/permissions";
import { ROLE_LABEL } from "@/store/types";

const SHORTCUTS: { keys: string; what: string }[] = [
  { keys: "⌘K / Ctrl K", what: "البحث الشامل ولوحة الأوامر" },
  { keys: "Esc", what: "إغلاق أي لوحة أو قائمة مفتوحة" },
  { keys: "↑ ↓", what: "التنقل في نتائج البحث" },
  { keys: "Enter", what: "فتح النتيجة أو تنفيذ الأمر" },
];

/**
 * صفحة المساعدة.
 *
 * وظيفتها الحقيقية إنها تقول **الحقيقة** عن النظام: إيه المبني، إيه اللي لسه،
 * وإيه اللي محتاج سيرفر. صفحة مساعدة بتوعد بحاجات مش موجودة أسوأ من عدم
 * وجودها، لأنها بتخلي المستخدم يخطط على كلام غلط.
 */
export function HelpPage() {
  const { session, can } = useFactory();
  const ready = NAV.flatMap((s) => s.items).filter((i) => i.ready);
  const soon = NAV.flatMap((s) => s.items).filter((i) => !i.ready);
  const mine = PERM_MODULES.filter((m) => can.do(m, "view"));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl">المساعدة والاختصارات</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {session ? `إنت داخل بصفة ${ROLE_LABEL[session.role]}، وبتشوف ${qty(mine.length, 0)} قسم من ${qty(PERM_MODULES.length, 0)}.` : ""}
        </p>
      </div>

      <Card className="p-4">
        <h3 className="text-base">اختصارات الكيبورد</h3>
        <ul className="mt-3 space-y-2">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between gap-3 text-sm">
              <span>{s.what}</span>
              <kbd className="latin shrink-0 rounded border border-border bg-secondary px-2 py-0.5 text-xs">{s.keys}</kbd>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-4">
        <h3 className="text-base">صلاحيتك دلوقتي</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          الصلاحية مش إخفاء زر: لو حاولت تنفّذ حاجة مش من حقك، النظام يرفضها ويقول لك الصلاحية الناقصة بالاسم عشان تطلبها.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[24rem] text-sm">
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
              {mine.map((m) => (
                <tr key={m} className="border-b border-border/60 last:border-0">
                  <td className="py-2">{MODULE_LABEL[m]}</td>
                  {PERM_ACTIONS.map((a) => (
                    <td key={a} className="px-1 py-2 text-center">
                      {can.do(m, a) ? <span className="text-ok">✓</span> : <span className="text-muted-foreground/40">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-base">المبني فعلًا</h3>
        <p className="mt-1 text-sm text-muted-foreground">{qty(ready.length, 0)} شاشة شغالة على بيانات حقيقية.</p>
        <p className="mt-3 text-sm leading-relaxed">{ready.map((i) => i.label).join(" · ")}</p>
      </Card>

      <Card className="p-4">
        <h3 className="text-base">اللي لسه مش مبني</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          بيبان في القائمة مكتوب عليه «قريب» بدل ما يكون لينك بيوصّل لصفحة فاضية.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{soon.map((i) => i.label).join(" · ")}</p>
      </Card>

      <Card className="p-4">
        <h3 className="text-base">حاجات محتاجة سيرفر</h3>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
          <li>
            <span className="text-foreground">الصلاحيات على السيرفر:</span> المصفوفة اللي هنا بتتحقق في المتصفح وفي كل عملية
            تسجيل. لما ندخل السيرفر، نفس المصفوفة بتتحوّل لـRLS وتحقق في الدوال — وده اللي بيمنع فعلًا.
          </li>
          <li>
            <span className="text-foreground">إيميلات الدعوة والتأكيد:</span> الأكواد بتظهر على الشاشة دلوقتي لأن مفيش سيرفر بريد.
          </li>
          <li>
            <span className="text-foreground">الـsubdomain:</span> شغّال محليًا بالعنوان، ومحتاج DNS + تحقق من الـhostname على
            السيرفر عشان يشتغل على الإنترنت.
          </li>
          <li>
            <span className="text-foreground">النسخ الاحتياطي:</span> ملف بينزل على جهازك. الاسترجاع لصاحب المصنع بس.
          </li>
        </ul>
      </Card>
    </div>
  );
}
