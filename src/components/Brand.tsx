import { cn } from "@/lib/utils";

export function Mark({ className }: { className?: string }) {
  return <img src="/brand/sanaa-mark.png" alt="صنعة" className={cn("h-10 w-10", className)} />;
}

export function Lockup({ className }: { className?: string }) {
  return (
    <img
      src="/brand/sanaa-lockup.png"
      alt="صنعة — نظام إدارة خطوط الإنتاج"
      className={cn("h-auto w-40", className)}
    />
  );
}

export function BrandRow({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Mark className="h-11 w-11" />
      <div className="leading-tight">
        <p className="text-lg font-medium">صنعة</p>
        <p className="latin text-xs text-muted-foreground">{subtitle ?? "SANAA"}</p>
      </div>
    </div>
  );
}
