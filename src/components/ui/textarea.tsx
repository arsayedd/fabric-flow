import { useContext, useId, type TextareaHTMLAttributes } from "react";
import { FieldIdContext } from "@/components/ui/field-context";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const fieldId = useContext(FieldIdContext);
  const auto = useId();
  const id = props.id ?? fieldId ?? auto;
  return (
    <textarea
      id={id}
      name={props.name ?? id}
      className={cn(
        "min-h-24 w-full rounded-md border border-input bg-card px-3 py-2 text-base outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/15",
        className,
      )}
      {...props}
    />
  );
}
