/**
 * الحساب التجريبي: بيدخل فعلًا، وبيفتح المساحة التجريبية، وبس.
 *
 * الاختبار ده موجود لأن «الباسورد شغال» حاجة مابتتأكدش من الكود: الهاش
 * متحسوب مسبقًا برّا المتصفح، ولو دورات PBKDF2 أو الملح اتغيّروا في
 * `hashPassword` الحساب بيبوظ في سكوت — الدخول بيقول «الإيميل أو كلمة
 * السر غلط» وخلاص.
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

/* البيانات بتتقرا من المصدر مش متكتوبة هنا تاني، عشان لو حد غيّرها في
   `account.ts` الاختبار يقيس الجديد بدل ما يقارن بحاجة قديمة */
const src = readFileSync(new URL("../src/store/account.ts", import.meta.url), "utf8");
const pick = (key) => src.match(new RegExp(`${key}:\\s*"([^"]+)"`))?.[1] ?? "";
const DEMO_LOGIN = { email: pick("email"), password: pick("password") };
if (!DEMO_LOGIN.email || !DEMO_LOGIN.password) throw new Error("مش لاقي بيانات الحساب التجريبي في account.ts");

const BASE = process.env.BASE ?? "http://127.0.0.1:43127";
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

const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1340, height: 900 }, locale: "ar-EG" });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);

/* ── الشاشة بتقول البيانات ──────────────────────────────────── */
const body = await page.locator("body").innerText();
ok("login screen shows the demo email", body.includes(DEMO_LOGIN.email));
ok("login screen shows the demo password", body.includes(DEMO_LOGIN.password));

/* ── فتح الصفحة مابيكتبش حاجة ───────────────────────────────── */
const keysBefore = await page.evaluate(() => Object.keys(localStorage));
ok(
  "opening the login page writes no demo ledger",
  !keysBefore.some((k) => k.includes("factory-demo-1")),
  keysBefore.join(" · "),
);
ok("and no demo account either — it is made on first use", !keysBefore.includes("sanaa.accounts.v1"));

/* ── الزرار بيعبّي الخانتين ─────────────────────────────────── */
await page.locator("button", { hasText: "عبّي البيانات التجريبية" }).first().click();
await page.waitForTimeout(200);
const emailBox = page.locator('input[type="email"]').first();
ok("the fill button sets the email", (await emailBox.inputValue()) === DEMO_LOGIN.email);
const pwBox = page.locator('input[type="password"]').first();
ok("the fill button sets the password", (await pwBox.inputValue()) === DEMO_LOGIN.password);

/* ── الدخول بيعدّي ──────────────────────────────────────────── */
await page.locator('button[type="submit"]').first().click();
await page.waitForTimeout(2500);
const url = page.url().replace(BASE, "") || "/";
ok("signing in leaves the login screen", !url.startsWith("/login"), url);

const after = await page.locator("body").innerText();
ok("the demo factory opened", after.includes("مصنع النور"), url);
ok("the demo banner is on screen", after.includes("مساحة تجريبية"));

/* ── الداتا اللي المفروض تكون جوه ───────────────────────────── */
const led = await page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x.startsWith("factory-ledger.v1:factory-demo-1"));
  return k ? JSON.parse(localStorage.getItem(k)) : null;
});
ok("the demo ledger got written on first sign-in", !!led?.factory, String(!!led));
ok("it is the demo factory, flagged demo", led?.factory?.demo === true);
ok("it carries real interlinked data", (led?.orders?.length ?? 0) > 5, `أوامر: ${led?.orders?.length}`);
ok("and parties", (led?.parties?.length ?? 0) > 5, `جهات: ${led?.parties?.length}`);

/* ── الحساب مربوط بالمساحة التجريبية وبس ───────────────────── */
const ws = await page.evaluate(() => JSON.parse(localStorage.getItem("sanaa.workspaces.v1") ?? "[]"));
const mine = ws.filter((w) => w.ownerId === "u-demo");
ok("the demo account owns exactly one workspace", mine.length === 1, `عدد: ${mine.length}`);
ok("and it is the demo one", mine[0]?.factoryId === "factory-demo-1", mine[0]?.factoryId);
const accs = await page.evaluate(() => JSON.parse(localStorage.getItem("sanaa.accounts.v1") ?? "[]"));
ok("only one demo account exists, not one per reload", accs.filter((a) => a.id === "u-demo").length === 1);
ok("the demo account is pre-verified", accs.find((a) => a.id === "u-demo")?.emailVerified === true);

/* ── الدور: مالك، فالمسح والموظفين مفتوحين ─────────────────── */
await page.goto(`${BASE}/staff`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
ok("signed in as owner — staff screen opens", (page.url().replace(BASE, "") || "/") === "/staff");

/* ── إيميل غلط بنفس الباسورد بيتقفل ────────────────────────── */
await page.evaluate(() => localStorage.clear());
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.locator('input[type="email"]').first().fill("someone@else.com");
await page.locator('input[type="password"]').first().fill(DEMO_LOGIN.password);
await page.locator('button[type="submit"]').first().click();
await page.waitForTimeout(1200);
ok("the demo password does not open any other email", (page.url().replace(BASE, "") || "/").startsWith("/login"));

/* ── وباسورد غلط على الإيميل التجريبي بيتقفل ───────────────── */
await page.locator('input[type="email"]').first().fill(DEMO_LOGIN.email);
await page.locator('input[type="password"]').first().fill("Wrong@2026");
await page.locator('button[type="submit"]').first().click();
await page.waitForTimeout(1200);
ok("a wrong password on the demo email is refused", (page.url().replace(BASE, "") || "/").startsWith("/login"));

console.log(`\nأخطاء الكونسول: ${errors.length ? errors.join(" | ") : "مافيش"}`);
console.log(`نجح ${pass} · فشل ${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
