import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./ui/button";

export function Panel({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <button className="absolute inset-0 bg-[#0f1720]/50" aria-label="إغلاق" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-2xl bg-background shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:w-[440px] md:rounded-none md:border-r">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-lg">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="إغلاق">
            <X />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? <div className="border-t p-4">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-sm text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
