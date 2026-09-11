import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-md border border-input bg-card px-3 text-base outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/15",
        className,
      )}
      {...props}
    />
  );
}

export const selectClass =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-ring/15";
