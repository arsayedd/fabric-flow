/**
 * لوحة Issues في كروم — الحاجات اللي مابتظهرش في الكونسول.
 *
 * المستخدم فتح DevTools وقال إن فيه «16 issues». وطلعوا مش أخطاء
 * جافاسكربت: الكونسول كان فاضي تمامًا. دي لوحة تانية، وكانت بتقول
 * حاجتين على شاشة الدخول:
 *
 * - `FormLabelHasNeitherForNorNestedInput` — لِيبل مش مربوط بخانته.
 * - `FormEmptyIdAndNameAttributesForInput` — خانة مالهاش `id` ولا `name`.
 *
 * والاتنين ملهم أثر حقيقي: لِيبل مش مربوط معناه إن الضغط على الاسم
 * مابيفتحش الخانة والقارئ الصوتي مابيقولش اسمها، وخانة من غير `name`
 * مدير كلمات السر في المتصفح مابيحفظهاش — يعني المستخدم بيكتب إيميله
 * وكلمة سره بالإيد كل مرة.
 *
 * والاختبار بيقرا اللوحة دي من البروتوكول (`Audits.issueAdded`) مش من
 * الكونسول، لأن دي معلومة مالهاش أي أثر في `console` ولا في
 * `pageerror` — فهارنس بيسمع الكونسول بس بيقول «مفيش مشاكل» وفيه
 * أربعة.
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.SANAA_URL ?? "http://127.0.0.1:43127";
const CHROME = process.env.CHROME_PATH ?? "/usr/local/bin/google-chrome";

const src = readFileSync(new URL("../src/store/account.ts", import.meta.url), "utf8");
const email = src.match(/email:\s*"([^"@]+@[^"]+)"/)?.[1] ?? "";
const pwd = src.match(/password:\s*"([^"]+)"/)?.[1] ?? "";
if (!email || !pwd) {
  console.error("مش لاقي بيانات الدخول التجريبية في src/store/account.ts");
  process.exit(1);
}

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${extra ? `\n      ${extra}` : ""}`);
  }
};

/* الحاجات اللي بنمنعها. باقي أنواع الـissues (كوكيز طرف تالت، إهمال
   واجهات) مش تحت إيدينا، فمابنفشّلش عليها — بنطبعها للعلم. */
const FORBIDDEN = /^Form/;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const cdp = await page.context().newCDPSession(page);
const issues = [];
await cdp.send("Audits.enable");
cdp.on("Audits.issueAdded", ({ issue }) => {
  const kind = issue.details?.genericIssueDetails?.errorType ?? issue.details?.deprecationIssueDetails?.type ?? issue.code;
  issues.push({ kind, where: page.url().replace(BASE, "") || "/" });
});

const sweep = async (label, routes) => {
  console.log(`\n— ${label} —`);
  for (const route of routes) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
  }
};

try {
  /* الشاشات اللي قبل الدخول: هي اللي فيها الفورمات اللي المستخدم شافها */
  await sweep("قبل الدخول", ["/login", "/forgot", "/signup", "/signup/factory"]);

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder(/@/).first().fill(email);
  await page.locator('input[type="password"]').first().fill(pwd);
  await page.getByRole("button", { name: /دخول|تسجيل|حفظ/ }).first().click();
  await page.locator("nav").first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);

  await sweep("جوه النظام — الشاشات اللي فيها فورمات", [
    "/tasks",
    "/parties",
    "/orders",
    "/materials",
    "/collections",
    "/settings",
    "/staff",
    "/quality",
    "/machines",
  ]);

  const forms = issues.filter((i) => /^FormLabel/.test(i.kind));
  const other = issues.filter((i) => !FORBIDDEN.test(i.kind));

  const summary = (list) => {
    const by = {};
    for (const i of list) {
      const k = `${i.kind} @ ${i.where}`;
      by[k] = (by[k] ?? 0) + 1;
    }
    return Object.entries(by)
      .map(([k, n]) => `${n}× ${k}`)
      .join("\n      ");
  };

  ok("مفيش لِيبل مش مربوط بأي خانة", forms.length === 0, summary(forms));
  if (other.length) console.log(`\n  (${other.length} ملاحظة تانية مش تحت إيدينا)\n      ${summary(other)}`);

  /*
   * الـid/name مش قاعدة واحدة على كل الشاشات، والفرق مش تهريب:
   *
   * - **خانة مالهاش اسم يوصلها لحد** — لا لِيبل ولا `aria-label` — دي
   *   عطل فعلي: القارئ الصوتي بيقول «خانة نص» وبس. بنفشّل عليها في أي
   *   شاشة.
   * - **خانة معاها `aria-label` بس من غير `name`** — الاسم واصل، واللي
   *   ناقص هو إن المتصفح يعرف يحفظها ويكمّلها. ودي مالهاش أي معنى في
   *   قايمة «حالة أمر SN-1042» جوه جدول، وليها كل المعنى في خانة إيميل.
   *   فالقاعدة: أي خانة كاتبة `autocomplete` لازم يكون لها `name` كمان —
   *   `autocomplete` من غير `name` نية مالهاش تنفيذ، المتصفح مش هيحفظ
   *   حاجة. وكل خانات شاشتي الدخول ونسيان كلمة السر داخلة في القاعدة
   *   دي لأن كلها خانات حساب.
   */
  console.log("\n— قراءة الـDOM مباشرة —");
  const AUTH = ["/login", "/forgot"];
  const nameless = [];
  const noAutofill = [];
  let controls = 0;
  for (const route of [...AUTH, "/signup", "/signup/factory", "/tasks", "/parties", "/orders", "/staff", "/settings", "/collections"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    const found = await page.evaluate((isAuth) => {
      const out = { nameless: [], noAutofill: [], count: 0 };
      for (const el of document.querySelectorAll("input, select, textarea")) {
        if (el.type === "checkbox" || el.type === "radio" || el.type === "hidden") continue;
        out.count++;
        const named =
          Boolean(el.getAttribute("aria-label")) ||
          Boolean(el.getAttribute("aria-labelledby")) ||
          Boolean(el.closest("label")) ||
          (el.id && Boolean(document.querySelector(`label[for="${el.id}"]`)));
        const hint = (el.getAttribute("placeholder") || el.getAttribute("aria-label") || el.tagName).slice(0, 26);
        if (!named) out.nameless.push(hint);
        /* النية بتلزمنا: خانة كاتبة `autocomplete` لازم يبقى لها `name` */
        else if (!el.id && !el.name && (isAuth || el.getAttribute("autocomplete"))) out.noAutofill.push(hint);
      }
      return out;
    }, AUTH.includes(route));
    controls += found.count;
    for (const x of found.nameless) nameless.push(`${route}: ${x}`);
    for (const x of found.noAutofill) noAutofill.push(`${route}: ${x}`);
  }
  ok("كل خانة اسمها واصل للقارئ الصوتي", nameless.length === 0, nameless.slice(0, 8).join(" | "));
  ok("وخانات الحساب المتصفح يقدر يحفظها", noAutofill.length === 0, noAutofill.slice(0, 8).join(" | "));

  /* والفاحص لازم يكون شايف حاجة أصلًا: لو `Audits` مااتفعّلتش أو
     الصفحات مافتحتش، كل العدّادات صفر والاختبار ينجح على أي كود */
  ok("والفاحص شاف خانات فعلًا", controls > 30, `${controls} خانة`);
} catch (e) {
  fail++;
  console.log(`  ✗ الاختبار نفسه وقع — ${String(e).split("\n")[0]}`);
} finally {
  await browser.close();
}

console.log(`\n${pass} نجحت · ${fail} فشلت`);
if (fail) process.exit(1);
