import { useEffect } from "react";

/**
 * ⌘K / Ctrl K في أي مكان في النظام.
 * المتصفح بياخد الاختصار ده لشريط العنوان، فبنمنع سلوكه الافتراضي —
 * وبنفتح اللوحة بس، مش بناخد التركيز من أي حاجة المستخدم بيكتب فيها.
 */
export function useCommandKey(onOpen: () => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpen]);
}
