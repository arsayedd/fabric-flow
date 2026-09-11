import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import App from "./App";
import { FactoryProvider } from "./store/context";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <FactoryProvider>
        <App />
        <Toaster richColors position="top-center" dir="rtl" />
      </FactoryProvider>
    </BrowserRouter>
  </StrictMode>,
);
