/**
 * التحديث بعد الرفع — النظام لازم يجيب النسخة الجديدة لوحده.
 *
 * المشكلة اللي الاختبار ده بيحرسها:
 *
 * الـsw فيه `skipWaiting()` و`clientsClaim()` و`cleanupOutdatedCaches()`،
 * يعني أول ما نسخة جديدة تتركّب بتتولّى الصفحات المفتوحة وبتمسح كاش
 * القديمة — والصفحة المفتوحة لسه شغّالة بالكود القديم. وكمان الـsw
 * بيقدّم `index.html` من الكاش الأول، فاللي فاتح النظام بيفضل على النسخة
 * القديمة. النتيجة كانت: **كل رفعة** والمستخدم لازم يعمل Refresh بإيده.
 *
 * إزاي بنختبر ده من غير ما نرفع مرتين على السيرفر: بنقدّم `dist/` من
 * سيرفر محلي، وبعدها نبدّل المجلد بنسخة تانية فيها علامة، وبعدها نسيب
 * الصفحة المفتوحة زي ما هي **من غير reload** ونشوف هي بتوصل للعلامة
 * لوحدها ولا لأ.
 */
import { createServer } from "node:http";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";

const PORT = 43131;
const DIST = new URL("../dist/", import.meta.url).pathname;

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
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/* النسخة «ب»: نفس البناء وفيه علامة في الصفحة، والـsw بيتغيّر عشان
 * المتصفح يعتبره نسخة جديدة (المتصفح بيقارن بايتات ملف الـsw) */
const MARK = "SANAA-BUILD-B";
const dirB = mkdtempSync(join(tmpdir(), "sanaa-b-"));
cpSync(DIST, dirB, { recursive: true });
const htmlB = readFileSync(join(dirB, "index.html"), "utf8").replace(
  "</head>",
  `<meta name="sanaa-build" content="${MARK}" /></head>`,
);
writeFileSync(join(dirB, "index.html"), htmlB);
const swB = readFileSync(join(dirB, "sw.js"), "utf8");
const rev = swB.match(/\{url:"index\.html",revision:"([a-f0-9]+)"\}/)?.[1];
if (!rev) {
  console.log("  ✗ مالقيتش بصمة index.html في الـsw — شكل الملف اتغيّر");
  console.log("\n0 نجحت · 1 فشلت");
  process.exit(1);
}
writeFileSync(join(dirB, "sw.js"), swB.replace(rev, rev.replace(/^./, (c) => (c === "a" ? "b" : "a"))));

/* السيرفر بيقدّم من المجلد اللي `serving` بيشاور عليه، وبنبدّله في النص
 * زي ما `deploy.sh` بيبدّل المجلد على السيرفر بالظبط */
let serving = DIST;
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let file = join(serving, normalize(url).replace(/^(\.\.[/\\])+/, ""));
  if (url === "/" || !extname(url)) {
    const { existsSync } = await import("node:fs");
    if (!existsSync(file) || !extname(url)) file = join(serving, "index.html");
  }
  try {
    const body = readFileSync(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      /* زي الـvhost: الصفحة والـsw ممنوعين من الكاش */
      "cache-control": /index\.html$|sw\.js$/.test(file) ? "no-store" : "max-age=31536000",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${PORT}`;

const browser = await chromium.launch({
  executablePath: "/usr/local/bin/google-chrome",
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
const page = await ctx.newPage();

const mark = () => page.evaluate(() => document.querySelector('meta[name="sanaa-build"]')?.content ?? "");
const controlled = () => page.evaluate(() => Boolean(navigator.serviceWorker.controller));

/* ── النسخة «أ» ───────────────────────────────────────────────── */
console.log("\n— النسخة أ —");
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.locator("#root > *").first().waitFor({ timeout: 30_000 });
ok("النظام فتح", (await page.locator("body").innerText()).includes("صنعة"));
await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30_000 });
ok("السيرفس ووركر بقى متحكّم في الصفحة", await controlled());
ok("ومفيش علامة النسخة ب", (await mark()) === "");

/* أول زيارة مالهاش لازمة تتحمّل مرتين — الكود اللي شغّال هو الأحدث أصلًا */
let navigations = 0;
page.on("framenavigated", (f) => f === page.mainFrame() && navigations++);
await page.waitForTimeout(2500);
ok("وأول زيارة مااتحمّلتش تاني على الفاضي", navigations === 0, `اتحمّلت ${navigations} مرة`);

/* ── الرفع وهو فاتح ───────────────────────────────────────────── */
console.log("\n— رفعنا النسخة ب والصفحة مفتوحة —");
serving = dirB;

/* المتصفح بيدوّر على sw جديد لوحده، وبندفعه يبص دلوقتي بدل ما نستنى
 * دورته — ده بيحصل عند المستخدم لما يفتح تاني أو بعد شوية */
await page.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration();
  await r?.update();
});

/* ومن غير أي reload من عندنا */
let landed = "";
try {
  await page.waitForFunction(
    (m) => document.querySelector('meta[name="sanaa-build"]')?.content === m,
    MARK,
    { timeout: 30_000 },
  );
  landed = await mark();
} catch {
  landed = await mark();
}
ok("النظام جاب النسخة الجديدة لوحده من غير Refresh باليد", landed === MARK, `العلامة: ${landed || "مافيش"}`);
ok("والصفحة اتحمّلت مرة واحدة بس", navigations === 1, `اتحمّلت ${navigations} مرة`);
await page.locator("#root > *").first().waitFor({ timeout: 30_000 });
const after = await page.locator("body").innerText();
ok("والنظام لسه شغّال بعد التحديث", after.includes("صنعة"), after.slice(0, 80));

/* ولا بيقع في لفة تحديث مستمرة */
const before = navigations;
await page.waitForTimeout(4000);
ok("ومش بيفضل يحدّث نفسه في لفة", navigations === before, `زاد ${navigations - before}`);

await browser.close();
server.close();

console.log(`\n${pass} نجحت · ${fail} فشلت`);
process.exit(fail ? 1 : 0);
