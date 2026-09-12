import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster, toast } from "sonner";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { registerServiceWorker } from "./lib/service-worker";
import { FactoryProvider } from "./store/context";
import { PermissionError } from "./store/permissions";
import "./index.css";

/**
 * رسالة الرفض لازم توصل للمستخدم بالاسم من أي شاشة.
 *
 * الميوتيشن بترفض برمي `PermissionError`، والرمي ده بيوقف الكود اللي بعده —
 * فالصفحة مابتقولش «اتسجل» وهي مااتسجلتش. وهنا بنحوّل الرفض لرسالة واحدة
 * واضحة بدل ما كل صفحة تفتكر تعمل `catch` بنفسها (وواحدة تنسى).
 * أي خطأ تاني بيفضل بيطلع زي ما هو.
 */
const showRefusal = (error: unknown, cancel: () => void) => {
  if (!(error instanceof PermissionError)) return;
  cancel();
  toast.error(error.message);
};

window.addEventListener("error", (e) => showRefusal(e.error, () => e.preventDefault()));
window.addEventListener("unhandledrejection", (e) => showRefusal(e.reason, () => e.preventDefault()));

registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      {/*
        الحاجز الخارجي برّه `FactoryProvider` بقصد: لو الـprovider نفسه وقع
        (دفتر غريب على الجهاز مثلًا) الحاجز اللي جواه بيقع معاه، وساعتها
        نرجع لشاشة بيضا. ودي آخر شبكة — الحاجز اللي بيهم المستخدم يوميًا
        هو اللي حوالين الصفحة جوه `AppShell`.
      */}
      <ErrorBoundary scope="app">
        <FactoryProvider>
          <App />
          <Toaster richColors position="top-center" dir="rtl" />
        </FactoryProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
);
