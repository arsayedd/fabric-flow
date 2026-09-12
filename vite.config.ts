import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      /*
       * التسجيل من عندنا مش من السكربت اللي البلوجن بيحقنه.
       * السكربت الجاهز بيسجّل وبس، ومابيعملش Refresh لما نسخة جديدة
       * تتولّى — فكل رفعة كانت بتسيب المستخدم على نصف نسخة قديمة لحد ما
       * يحدّث بإيده. التفاصيل في `src/lib/service-worker.ts`.
       */
      injectRegister: null,
      includeAssets: ["favicon-32.png", "apple-touch-icon.png", "brand/sanaa-mark.png"],
      /*
       * الخطوط لازم تدخل الكاش مع باقي الملفات.
       * الافتراضي في workbox مابياخدش `woff2`، ومن غيرها النظام بيفتح
       * أوفلاين على أرض المصنع بخط النظام: العناوين بتفقد وزن الـ٥٠٠،
       * والأرقام العربية بتبان بعرض مختلف فالجداول بترقص.
       */
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,webmanifest}"],
      },
      manifest: {
        name: "صنعة — نظام إدارة خطوط الإنتاج",
        short_name: "صنعة",
        description: "أوامر الإنتاج، العملاء والتحصيل، التكاليف، العمال، والخزينة في سيستم واحد.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#F4EFE6",
        theme_color: "#0F1720",
        lang: "ar",
        dir: "rtl",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 43127,
    strictPort: true,
    // عشان نفق trycloudflare يعدّي لما نشارك السيستم مع حد يجربه
    allowedHosts: [".trycloudflare.com"],
  },
  preview: {
    host: "0.0.0.0",
    port: 43127,
    strictPort: true,
    allowedHosts: [".trycloudflare.com"],
  },
});
