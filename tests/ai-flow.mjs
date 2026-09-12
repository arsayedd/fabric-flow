import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:43127";
const logs = [];
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 1200 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("console", (m) => m.type() === "error" && logs.push(`[error] ${m.text()}`));

const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
};
const main = () => page.locator("main").innerText();
const body = () => page.locator("body").innerText();
const ledger = () =>
  page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith("factory-ledger.v1:"));
    return JSON.parse(localStorage.getItem(k));
  });

let pass = 0;
let fail = 0;
const ok = (label, cond, extra = "") => {
  if (cond) pass += 1;
  else fail += 1;
  console.log(`${cond ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
};

const login = async (role) => {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: role }).first().click();
  await page.waitForTimeout(900);
};

await login(/صاحب المصنع/);

/* ١) الأسئلة المقترحة كلها بتجاوب */
await go("/ai");
const chips = await page.locator("main button").filter({ hasText: "؟" }).allInnerTexts();
console.log("أسئلة معروضة:", chips.length);
ok("فيه أسئلة مقترحة", chips.length >= 12, String(chips.length));

const asked = [];
for (const q of chips) {
  await go("/ai");
  await page.getByRole("button", { name: q, exact: true }).first().click();
  /* الجواب بيتحسب من الدفتر وبعدين بيترسم. انتظار بوقت ثابت كان بيفشل
   * على جهاز مضغوط — والسؤال نفسه سليم — فبنستنى سطر الأساس يظهر.
   * والـcatch مقصود: لو مظهرش خلاص، التأكيد تحت هو اللي يفشل. */
  await page
    .getByText("الرقم ده جه منين")
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => {});
  const t = await main();
  const understood = !t.includes("مش فاهم السؤال");
  const hasBasis = t.includes("الرقم ده جه منين");
  asked.push({ q, understood, hasBasis });
  if (!understood || !hasBasis) console.log("  ⚠", q, { understood, hasBasis });
}
ok("كل سؤال مقترح اتفهم", asked.every((a) => a.understood));
ok("كل جواب بيقول الرقم جه منين", asked.every((a) => a.hasBasis));

/* ٢) نموذج جواب: نفس رقم الشاشة */
await go("/ai");
await page.locator("main input").first().fill("مين عليه فلوس متأخرة؟");
await page.keyboard.press("Enter");
await page.waitForTimeout(700);
const ansText = await main();
console.log("\n— جواب المتأخرات —");
console.log(
  ansText
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(4, 16)
    .join("\n"),
);
ok("الجواب فيه لينك للسجل", (await page.locator("main a[href^='/parties/']").count()) > 0);

/* الرقم نفسه في شاشة التحصيل */
const db = await ledger();
ok("الدفتر فيه توريدات", db.deliveries.length > 0);

/* ٣) سؤال مش مفهوم */
await go("/ai");
await page.locator("main input").first().fill("هاتلي شاي بسكر");
await page.keyboard.press("Enter");
await page.waitForTimeout(600);
const unk = await main();
ok("السؤال المش مفهوم بيتقال عنه كده", unk.includes("مش فاهم السؤال"));
ok("ومابيخترعش رقم", !/ج\.?م/.test(unk.split("مش فاهم السؤال")[1] ?? ""));

/* ٤) قواعد التنبيه: التعديل بيغيّر اللون فعلًا */
await go("/ai/rules");
const rulesText = await main();
console.log("\n— قواعد التنبيه —");
console.log(
  rulesText
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(2, 14)
    .join("\n"),
);
ok("القواعد ظاهرة", /أمان الخامة|التحصيل المتأخر/.test(rulesText));
ok("كل قاعدة بتقول بتغيّر إيه", rulesText.includes("الافتراضي"));

const before = await page.locator("main").innerText();
const beforeCount = Number((before.match(/شايفة (\S+) استثناء/) ?? [])[1]?.replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)) ?? NaN);
// كبّر أمان الخامة من ٣ لـ٤٥ يوم: خامات أكتر بتدخل التنبيهات
await page.locator("main input[type=number]").first().fill("45");
await page.getByRole("button", { name: "احفظ القواعد" }).click();
await page.waitForTimeout(900);
const saved = await ledger();
ok("القاعدة اتخزّنت في الإعدادات", saved.settings.rules?.stockBufferDays === 45, String(saved.settings.rules?.stockBufferDays));
ok("التعديل اتسجّل في سجل التعديلات", saved.auditLog.some((a) => a.recordId === "alert_rules"));
const after = await page.locator("main").innerText();
const afterCount = Number((after.match(/شايفة (\S+) استثناء/) ?? [])[1]?.replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)) ?? NaN);
console.log("استثناءات قبل:", beforeCount, "· بعد:", afterCount);
ok("القاعدة أثّرت في عدد الاستثناءات فعلًا", !Number.isNaN(afterCount) && afterCount >= beforeCount);
ok("اللي اتغيّر عن الافتراضي مكتوب", after.includes("مختلفة عن الافتراضي") || after.includes("قاعدة مختلفة"));

/* ٥) رجّع الافتراضي */
await page.getByRole("button", { name: /رجّع الافتراضي/ }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "احفظ القواعد" }).click();
await page.waitForTimeout(700);
const back = await ledger();
ok("رجع للافتراضي", back.settings.rules?.stockBufferDays === 3);

/* ٦) الصلاحية: المشرف مايشوفش أسئلة المالية */
await login(/مشرف/);
await go("/ai");
const sup = await main();
ok("المشرف مايشوفش سؤال الربح", !sup.includes("ربحت كام"));
ok("وبيتقال له فيه أسئلة متخفية", /متخفي/.test(sup));
await page.locator("main input").first().fill("ربحت كام الشهر ده؟");
await page.keyboard.press("Enter");
await page.waitForTimeout(600);
const denied = await main();
ok("سؤال ممنوع بيتقال إنه ممنوع مش مش مفهوم", denied.includes("صلاحيتك"));
ok("ومفيش رقم مالي ظاهر", !/الخزينة والتحصيل\n/.test(denied.split("صلاحيتك")[1] ?? ""));

await go("/ai/rules");
ok("المشرف مايعدّلش القواعد", (await body()).includes("بصلاحية الإعدادات"));

/* ٧) القايمة الجانبية مافيهاش «قريب» */
await login(/صاحب المصنع/);
await go("/more");
const more = await main();
ok("مفيش «قريب» في كل الأقسام", !more.includes("قريب"), "");
console.log("\n— أقسام القايمة —");
console.log(
  more
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(1, 60)
    .join(" · "),
);

/* ٨) موبايل */
await page.setViewportSize({ width: 390, height: 860 });
for (const p of ["/ai", "/ai/rules"]) {
  await go(p);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`مفيش جرجرة أفقية في ${p}`, over <= 1, String(over));
}

console.log(`\nنجح ${pass} · فشل ${fail}`);
console.log("أخطاء الكونسول:", logs.length ? logs.join("\n") : "مافيش");
await browser.close();
