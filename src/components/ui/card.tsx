import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  // min-w-0: الكارت جوه شبكة أو flex مايوسّعش الصفحة لو جواه جدول أوسع منه — بيسيبه يجرجر جواه
  return <div className={cn("min-w-0 rounded-lg border border-border bg-card p-4", className)} {...props} />;
}

/** صف بيانات زي بطاقة أمر الإنتاج في الهوية: عنوان يمين وقيمة شمال */
export function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-left">{children}</dd>
    </div>
  );
}
