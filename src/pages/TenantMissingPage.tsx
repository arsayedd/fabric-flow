import { SearchX } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { ROOT_DOMAIN } from "@/store/account";

/**
 * الـslug اتطلب في العنوان ومش موجود.
 * بنقول كده صريح بدل ما نفتح أي مصنع تاني — الـsubdomain هو مفتاح تحديد
 * المصنع، فلو مش معروف يبقى مفيش مصنع، مش «أقرب مصنع».
 */
export function TenantMissingPage({ slug }: { slug: string }) {
  return (
    <AuthShell title="الـworkspace ده مش موجود" subtitle="العنوان اللي فتحته مش مربوط بأي مصنع على الجهاز ده.">
      <div className="rounded-lg border border-border bg-card p-5">
        <SearchX className="h-6 w-6 text-muted-foreground" />
        <p className="latin mt-3 break-all text-base">
          {slug}.{ROOT_DOMAIN}
        </p>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          يمكن الاسم اتغيّر، أو المصنع على جهاز تاني. ادخل بحسابك وهتلاقي مصانعك كلها.
        </p>
      </div>
      {/* لينك عادي مش Link: لازم العنوان يتغيّر فعلًا عشان يسيب الـslug الغلط */}
      <div className="mt-4 grid gap-2">
        <Button size="lg" asChild>
          <a href="/login">تسجيل الدخول</a>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <a href="/">الصفحة الرئيسية</a>
        </Button>
      </div>
    </AuthShell>
  );
}
