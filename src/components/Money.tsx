import { money } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function Money({
  value,
  className,
  signed,
}: {
  value: number;
  className?: string;
  signed?: boolean;
}) {
  const color = signed ? (value > 0 ? "text-ok" : value < 0 ? "text-late" : "") : "";
  const prefix = signed && value > 0 ? "+" : "";
  return <span className={cn("tabular font-semibold", color, className)}>{prefix}{money(value)}</span>;
}
