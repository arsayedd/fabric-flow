/**
 * نسخة الإنتاج وهي متقدّمة كملفات ثابتة — زي ما نجينكس هيقدّمها بالظبط.
 *
 * ليه اختبار منفصل عن باقي الهارنسات: كل الاختبارات التانية بتشتغل على
 * سيرفر التطوير، وهو بيحل مسارات التطبيق لوحده. نسخة الإنتاج مختلفة:
 * ملفات مبنية بأسماء فيها هاش، وسيرفس ووركر، ومسارات جوه التطبيق
 * (`/orders`) مالهاش ملفات على الديسك. السيرفر اللي تحت بيقلّد سطر
 * `try_files $uri $uri/ /index.html` اللي في `deploy/cloudpanel-vhost.conf`،
 * فلو السطر ده ناقص من الـvhost الاختبار ده هو اللي كان هيكشفه.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";

const ROOT = new URL("../dist/", import.meta.url).pathname;
const PORT = 43129;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0;
let fail = 0;
const ok = (label, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`);
  }
};

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const served = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(ROOT, rel);
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, "index.html");
    await stat(file);
  } catch {
    // نفس سلوك `try_files … /index.html`
    file = join(ROOT, "index.html");
  }
  try {
    const body = await readFile(file);
    served.push(rel);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

/* ── الملفات اللي المفروض تكون في الناتج ────────────────────── */
const head = async (path) => (await fetch(`${BASE}${path}`)).status;
ok("index is served", (await head("/")) === 200);
ok("service worker is in the build", (await head("/sw.js")) === 200);
ok("the manifest is in the build", (await head("/manifest.webmanifest")) === 200);
ok("icons are in the build", (await head("/icon-512.png")) === 200);

/* ── المسارات الجوّة بترد الصفحة مش ٤٠٤ ────────────────────── */
for (const path of ["/orders", "/health", "/parties", "/login", "/scan"]) {
  const r = await fetch(`${BASE}${path}`);
  const body = await r.text();
  ok(`deep link ${path} serves the app`, r.status === 200 && body.includes('<div id="root"'), String(r.status));
}

/* ── النسخة المبنية بتشتغل فعلًا في المتصفح ────────────────── */
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1340, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const landing = await page.locator("body").innerText();
ok("the built landing page renders Arabic copy", landing.includes("صنعة") && landing.includes("شوف السيستم بداتا جاهزة"));

/* دخول تجريبي على النسخة المبنية */
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.waitForTimeout(1500);
const shell = await page.locator("body").innerText();
ok("the demo factory opens on the built bundle", shell.includes("مصنع النور"), page.url());
ok("the demo banner shows", shell.includes("مساحة تجريبية"));

/* التنقل جوه التطبيق، وبعدها Refresh على نفس المسار */
await page.goto(`${BASE}/orders`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
ok("refreshing a deep link keeps you on it", (page.url().replace(BASE, "") || "/") === "/orders");
const orders = await page.locator("main").innerText();
ok("and the screen has real content", orders.includes("أوامر") || orders.includes("أمر"), orders.slice(0, 60));

await page.goto(`${BASE}/health`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
const health = await page.locator("main").innerText();
ok("the health page works on the built bundle", health.includes("صحة النظام"));
ok("and its integrity checks are green", !health.includes("سجلات من مصنع تاني") || health.includes("سليم"), "");

/* ── الخط من عندنا، ومتحمّل فعلًا، ومتكاش للأوفلاين ────────── */
const fonts = served.filter((f) => f.endsWith(".woff2"));
ok("the Arabic font is served from the build, not a CDN", fonts.length > 0, `ملفات خط: ${fonts.length}`);
const loaded = await page.evaluate(() => ({
  weight500: document.fonts.check('500 16px "IBM Plex Sans Arabic"'),
  weight400: document.fonts.check('400 16px "IBM Plex Sans Arabic"'),
  family: getComputedStyle(document.body).fontFamily,
}));
ok("weight 400 is really loaded", loaded.weight400);
/* وزن الـ٥٠٠ هو اللي العناوين كلها عليه — الهوية بتضيع من غيره */
ok("weight 500 is really loaded", loaded.weight500);
ok("and the body actually uses it", loaded.family.includes("IBM Plex Sans Arabic"), loaded.family);
const builtHtml = await (await fetch(`${BASE}/index.html`)).text();
ok("no Google Fonts link survives in the built html", !builtHtml.includes("fonts.googleapis.com"));
const sw = await (await fetch(`${BASE}/sw.js`)).text();
ok("the service worker precaches the fonts for offline use", /\.woff2/.test(sw));

ok("no console errors on the built bundle", errors.length === 0, errors.slice(0, 2).join(" | "));

console.log(`\nنجح ${pass} · فشل ${fail}`);
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
