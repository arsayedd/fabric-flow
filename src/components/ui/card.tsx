import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-border bg-card p-4 shadow-[0_1px_0_rgba(28,61,54,0.04)]", className)} {...props} />;
}
