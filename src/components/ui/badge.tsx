import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "muted",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: "muted" | "ok" | "warn" | "late" | "brass" }) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    ok: "bg-emerald-100 text-ok",
    warn: "bg-amber-100 text-warn",
    late: "bg-red-100 text-late",
    brass: "bg-accent/30 text-accent-foreground",
  };
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}
      {...props}
    />
  );
}
