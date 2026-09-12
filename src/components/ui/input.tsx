import { useContext, useId, type InputHTMLAttributes } from "react";
import { FieldIdContext } from "@/components/ui/field-context";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  /*
   * الرقم اللي جوّاه `Field`، وإلا رقم بيتولّد. واللي مكتوب صريح في
   * الخانة بيكسب الاتنين.
   *
   * و`name` مهم مش تحصيل حاصل: خانة من غير `id` ولا `name` مدير كلمات
   * السر في المتصفح مابيحفظهاش — يعني المستخدم بيكتب إيميله وكلمة سره
   * بالإيد كل مرة يدخل.
   */
  const fieldId = useContext(FieldIdContext);
  const auto = useId();
  const id = props.id ?? fieldId ?? auto;
  return (
    <input
      id={id}
      name={props.name ?? id}
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
