/**
 * النظام وهو شغّال على الدومين الحقيقي.
 *
 * ليه اختبار منفصل تاني: `prod-serve.mjs` بيقلّد نجينكس على الجهاز، لكن
 * حاجات كتير بتتكسر في الرفع نفسه ومابتبانش قبله — سطر `try_files`
 * ناقص، سيرفس ووركر متكاش فالمستخدم قاعد على نسخة قديمة، ملف خط
 * ماترفعش، هيدرز أمنية بتتلخبط، شهادة على الدومين الغلط. الملف ده
 * بيفتح الدومين فعلًا بمتصفح حقيقي وبيتأكد من دول واحد واحد.
 *
 * التشغيل: `SANAA_URL=https://sanaa.cloud node tests/live-site.mjs`
 * ومن غير المتغيّر بيتخطّى نفسه، عشان السويت مايفشلش على جهاز مش مربوط.
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

/* بنقرا الحساب التجريبي من الكود مش بنكتبه هنا، عشان الاختبار يقيس
 * القيمة الحالية لو حد غيّرها */
const src = readFileSync(new URL("../src/store/account.ts", import.meta.url), "utf8");
const block = src.match(/DEMO_LOGIN = \{([^}]+)\}/)?.[1] ?? "";
const pick = (key) => block.match(new RegExp(`${key}:\\s*"([^"]+)"`))?.[1] ?? "";
const DEMO = { email: pick("email"), password: pick("password") };

const BASE = process.env.SANAA_URL?.replace(/\/$/, "");
if (!BASE) {
  console.log("SANAA_URL مش محدّد — الاختبار ده بيشتغل على الدومين الحقيقي بس");
  console.log("0 نجحت · 0 فشلت");
  process.exit(0);
}

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

/* ── الطبقة اللي تحت المتصفح: هيدرز وكاش ──────────────────────── */
const head = async (path) => {
  const r = await fetch(`${BASE}${path}`, { redirect: "manual" });
  return { status: r.status, h: (k) => r.headers.get(k) ?? "", body: r };
};

console.log(`\n▸ ${BASE}`);

const root = await head("/");
ok("الصفحة الرئيسية بترد ٢٠٠", root.status === 200, `طلع ${root.status}`);
ok("وبتتقدّم كـHTML", root.h("content-type").includes("text/html"));

/* مسار جوه التطبيق مالوش ملف على الديسك — لو ده ٤٠٤ يبقى try_files ناقص */
for (const path of ["/orders", "/health", "/parties", "/quality", "/scan"]) {
  const r = await head(path);
  ok(`${path} بيرد ٢٠٠ مش ٤٠٤`, r.status === 200, `طلع ${r.status}`);
}

const sw = await head("/sw.js");
ok("سيرفس ووركر موجود", sw.status === 200);
/* ودي أهم واحدة: سيرفس ووركر متكاش = مستخدم قاعد على نسخة قديمة */
ok("وممنوع يتكاش", /no-store/.test(sw.h("cache-control")), sw.h("cache-control"));

const man = await head("/manifest.webmanifest");
ok("ملف التطبيق موجود", man.status === 200);
ok("وبنوع يعرفه المتصفح", man.h("content-type").includes("manifest+json"), man.h("content-type"));

/* صفحة النظام نفسها ماينفعش تتكاش، وإلا التحديث مايوصلش */
ok("الصفحة نفسها ممنوعة من الكاش", /no-store/.test(root.h("cache-control")), root.h("cache-control"));

/* الهيدرز الأمنية بتتلخبط بسهولة: أي location بيحط add_header بيرمي
 * اللي فوقه، فلازم نتأكد إنها وصلت على الصفحة نفسها مش على / بس */
const deep = await head("/orders");
ok("nosniff واصل على مسار جوّة", deep.h("x-content-type-options") === "nosniff");
ok("X-Frame-Options واصل كمان", /SAMEORIGIN/i.test(deep.h("x-frame-options")));
ok("والكاميرا مسموحة للمسح", /camera=\(self\)/.test(deep.h("permissions-policy")), deep.h("permissions-policy"));

const html = await (await fetch(`${BASE}/`)).text();
const asset = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
ok("الـHTML بيشاور على ملف بناء باسم فيه هاش", Boolean(asset), asset ?? "مالقيتش");
if (asset) {
  const a = await head(asset);
  ok("وملف البناء موجود فعلًا", a.status === 200);
  ok("وبكاش طويل", /max-age=\d{7,}/.test(a.h("cache-control")), a.h("cache-control"));
}

/* ملف ناقص لازم يبان ٤٠٤، مايرجّعش الـindex — وإلا الأخطاء تتخبى */
const missing = await head("/assets/definitely-not-here.js");
ok("ملف بناء ناقص بيرد ٤٠٤ مش الصفحة", missing.status === 404, `طلع ${missing.status}`);

/* الخط مرفوع من عندنا مش من نت برّاني */
const font = await head("/fonts/plex-arabic-arabic-500.woff2");
ok("الخط العربي مرفوع مع النظام", font.status === 200, `طلع ${font.status}`);
ok("وبنوعه الصح", font.h("content-type") === "font/woff2", font.h("content-type"));
ok("ومافيش Google Fonts في الصفحة", !html.includes("fonts.googleapis.com"));

/* ── المتصفح ──────────────────────────────────────────────────── */
const browser = await chromium.launch({
  executablePath: "/usr/local/bin/google-chrome",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
const body = await page.textContent("body");
ok("الصفحة بتعرض عربي مش شاشة بيضا", (body ?? "").includes("صنعة"), (body ?? "").slice(0, 80));

/* الخط لازم يكون اتحمّل فعلًا بوزن ٥٠٠ — العناوين كلها عليه */
const fonts = await page.evaluate(() => ({
  w500: document.fonts.check('500 16px "IBM Plex Sans Arabic"'),
  w400: document.fonts.check('400 16px "IBM Plex Sans Arabic"'),
}));
ok("الخط اتحمّل بوزن ٤٠٠", fonts.w400);
ok("والعناوين بوزن ٥٠٠", fonts.w500);

/* الدخول التجريبي: أهم حاجة المستخدم هيعملها أول مرة */
/* المسار بيفضل `/` بعد الدخول — لوحة المصنع هي الصفحة الرئيسية — فالانتظار
 * لازم يكون على المحتوى مش على تغيّر الـURL */
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.getByText("مصنع النور").first().waitFor({ timeout: 20_000 });
const after = await page.locator("body").innerText();
ok("الدخول التجريبي بيفتح المصنع", after.includes("مصنع النور"), page.url());
ok("وشريط الديمو بيبان", after.includes("مساحة تجريبية"));

/* Refresh جوه شاشة: ده اللي بيكسر لو try_files ناقص */
await page.goto(`${BASE}/orders`, { waitUntil: "networkidle" });
ok("فتح /orders مباشرة بيشتغل", new URL(page.url()).pathname === "/orders", page.url());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);
ok("وRefresh جوّه بيفضل في نفس الشاشة", new URL(page.url()).pathname === "/orders", page.url());
const orders = await page.locator("body").innerText();
ok("والأوامر بتتعرض", /أمر|SN-/.test(orders));

/* سيرفس ووركر لازم يسجّل، وإلا مافيش عمل أوفلاين على أرض المصنع */
const swState = await page.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration();
  return r ? (r.active ? "active" : "registered") : "none";
});
ok("سيرفس ووركر اتسجّل", swState !== "none", swState);

/* الدخول بالإيميل وكلمة السر — الطريق التاني اللي معروض على شاشة الدخول */
const fresh = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await fresh.goto(`${BASE}/login`, { waitUntil: "networkidle" });
const loginTxt = await fresh.locator("body").innerText();
ok("شاشة الدخول بتعرض الحساب التجريبي", loginTxt.includes(DEMO.email), DEMO.email);
ok("وبتعرض كلمة السر معاه", loginTxt.includes(DEMO.password));
await fresh.getByRole("button", { name: /عبّي البيانات التجريبية/ }).click();
await fresh.getByRole("button", { name: /^دخول$/ }).click();
await fresh.getByText("مصنع النور").first().waitFor({ timeout: 20_000 });
ok("والدخول بالإيميل وكلمة السر بيفتح المصنع", true);
await fresh.close();

await page.goto(`${BASE}/health`, { waitUntil: "networkidle" });
const health = await page.textContent("body");
ok("صفحة سلامة النظام بتفتح", (health ?? "").length > 200);

/* موبايل: أرض المصنع بتتفتح من التليفون */
const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await mob.goto(`${BASE}/`, { waitUntil: "networkidle" });
const mobBody = await mob.textContent("body");
ok("الصفحة بتفتح على موبايل", (mobBody ?? "").includes("صنعة"));
const overflow = await mob.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok("ومافيش تمدد أفقي", overflow <= 2, `زيادة ${overflow}px`);

await browser.close();

ok("مافيش أخطاء كونسول", errors.length === 0, errors.slice(0, 3).join(" | "));

console.log(`\n${pass} نجحت · ${fail} فشلت`);
process.exit(fail ? 1 : 0);
