import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type Tone = "muted" | "ok" | "warn" | "danger" | "gold";

const tones: Record<Tone, string> = {
  muted: "bg-muted text-muted-foreground",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  gold: "bg-[#f6ecd9] text-[#8a5a12]",
};

export function Badge({
  className,
  tone = "muted",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}

/** حالات أمر الإنتاج بألوان الهوية */
export const STATUS: Record<"done" | "running" | "late" | "stopped", { label: string; tone: Tone }> = {
  done: { label: "مكتمل", tone: "ok" },
  running: { label: "قيد التنفيذ", tone: "gold" },
  late: { label: "متأخر", tone: "warn" },
  stopped: { label: "متوقف", tone: "danger" },
};
