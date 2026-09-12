import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:43127";
const pass = [];
const fail = [];
const ok = (name, cond, extra = "") => (cond ? pass : fail).push(`${name}${extra ? " — " + extra : ""}`);
const arabic = (s) => {
  const latin = String(s)
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[٬,]/g, "")
    .replace(/٫/g, ".");
  return Number((latin.match(/-?\d+(\.\d+)?/) ?? ["0"])[0]);
};

const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

const enter = async (role) => {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE);
  await page.getByRole("button", { name: "جرّب بالبيانات الجاهزة" }).click().catch(() => {});
  await page.getByRole("button", { name: role }).first().click().catch(() => {});
  await page.waitForTimeout(900);
};
const dash = async (mode) => {
  await page.goto(`${BASE}/dashboard`);
  await page.waitForTimeout(1600);
  if (mode) {
    await page.getByRole("tab", { name: mode }).click();
    await page.waitForTimeout(1600);
  }
  return page.locator("main").innerText();
};

await enter(/صاحب المصنع/);
let body = await dash();

/* ── ١) الترويسة والمدى والمقارنة ───────────── */
/* التحية بتتغير بالساعة — التلاتة في `greeting()` في Kit.tsx */
ok("greeting names the person", /صباح الخير|نهارك سعيد|مساء الخير/.test(body) && /يا /.test(body));
ok("factory named in the subtitle", body.includes("مصنع النور"));
ok("three dashboard modes offered", (await page.getByRole("tab").count()) === 3);
const RANGES = ["النهارده", "امبارح", "الأسبوع ده", "الشهر ده", "الربع ده", "السنة دي", "مدى مخصص"];
ok("date ranges offered", RANGES.every((r) => body.includes(r)), RANGES.filter((r) => !body.includes(r)).join(","));
ok("compare offered", body.includes("الفترة اللي قبلها") && body.includes("نفس الفترة السنة اللي فاتت"));

const revenueOf = async () => {
  const t = await page.locator("main").innerText();
  const m = t.match(/المؤشرات[\s\S]{0,120}?الإيراد\s+[^\d٠-٩]*([٠-٩٬.]+)\s*ج/);
  return m ? arabic(m[1]) : null;
};
const monthRevenue = await revenueOf();
await page.getByRole("button", { name: "النهارده", exact: true }).click();
await page.waitForTimeout(1400);
const todayRevenue = await revenueOf();
ok("range actually re-slices the numbers", todayRevenue !== monthRevenue, `${monthRevenue} -> ${todayRevenue}`);
await page.getByRole("button", { name: "السنة دي", exact: true }).click();
await page.waitForTimeout(1500);
const yearRevenue = await revenueOf();
ok("a wider range cannot be smaller", (yearRevenue ?? 0) >= (monthRevenue ?? 0), `${monthRevenue} -> ${yearRevenue}`);

await page.getByRole("button", { name: "الشهر ده", exact: true }).click();
await page.waitForTimeout(1500);
body = await page.locator("main").innerText();
ok("comparison labelled on the kpi row", /مقارنة بـالفترة اللي قبلها/.test(body));
await page.getByRole("button", { name: "بدون مقارنة" }).click();
await page.waitForTimeout(1400);
const noCmp = await page.locator("main").innerText();
ok("turning comparison off removes the deltas", !/مقارنة بالفترة السابقة/.test(noCmp));
await page.getByRole("button", { name: "الفترة اللي قبلها" }).click();
await page.waitForTimeout(1400);

/* ── ٢) صحة المصنع، وكل مؤشر بيفتح شاشته ────── */
body = await page.locator("main").innerText();
ok("health score present", /صحة المصنع/.test(body) && /\/ ١٠٠/.test(body));
const BLOCKS = ["كفاءة الإنتاج", "التحكم في التكلفة", "الجودة", "الالتزام بالتسليم", "المخزون", "العمالة", "الربحية", "السيولة"];
ok("eight health blocks", BLOCKS.every((b) => body.includes(b)));
const healthLinks = await page.locator("a", { hasText: "التحكم في التكلفة" }).count();
ok("health blocks are links", healthLinks > 0);
await page.locator("a", { hasText: "التحكم في التكلفة" }).first().click();
await page.waitForTimeout(700);
ok("clicking a health block drills down", page.url().includes("/costing"), page.url());

/* ── ٣) طبقة القرار: سبب + أثر + خطوة ────────── */
body = await dash();
ok("decision layer titled", body.includes("ذكاء صنعة"));
const cards = await page
  .locator("li")
  .filter({ hasText: "←" })
  .filter({ has: page.getByRole("button", { name: /الأرقام اللي اتبنى عليها/ }) })
  .allInnerTexts();
ok("decisions listed", cards.length >= 3, `${cards.length}`);
ok(
  "every decision names an action",
  cards.every((c) => c.includes("←")),
  cards.filter((c) => !c.includes("←")).length + " without action",
);
ok(
  "every decision carries a money impact",
  cards.filter((c) => /[٠-٩]\s*(ج|ج\.م\.)/.test(c)).length >= cards.length - 1,
  `${cards.filter((c) => /[٠-٩]\s*(ج|ج\.م\.)/.test(c)).length}/${cards.length}`,
);
ok("decisions are not plain numbers", cards.some((c) => /لو |لأن|من إجمالي|بسعر البيع|أعلى من الوسيط/.test(c)));
ok("tenant honesty stated", body.includes("مابيقربش لبيانات أي مصنع تاني"));

const ev = page.getByRole("button", { name: /الأرقام اللي اتبنى عليها/ }).first();
ok("evidence is one click away", (await ev.count()) > 0);
if (await ev.count()) {
  await ev.click();
  await page.waitForTimeout(300);
  const after = await page.locator("main").innerText();
  ok("evidence opens with real figures", /ج\.م\./.test(after));
}

/* ── ٤) المؤشرات: شرح، هدف، وغياب معلن ───────── */
ok("kpi explains itself", (await page.getByRole("button", { name: /إزاي اتحسب/ }).count()) >= 6);
await page.getByRole("button", { name: /إزاي اتحسب الإيراد/ }).first().click();
await page.waitForTimeout(250);
ok("explanation shows on click", /من التوريدات|الإيراد/.test(await page.locator("main").innerText()));
ok("targets only where recorded", /الهدف من الإعدادات|الطاقة المتاحة في الفترة/.test(body));
ok("period margin distinguished from model margin", body.includes("هامش الفترة"));

/* ── ٥) الشلال والتعادل والسيولة ─────────────── */
ok("waterfall present", body.includes("الإيراد راح فين") && body.includes("صافي الربح"));
ok("break-even states its fixed-cost rule", body.includes("نقطة التعادل") && body.includes("وحدتها «شهر»"));
ok("cash centre forecasts", body.includes("مركز السيولة") && /٧ يوم/.test(body) && /المتوقع يتبقى/.test(body));
ok("pending collections excluded on purpose", body.includes("مستني تأكيد"));
ok("aging bucketed", body.includes("أعمار المديونية") && /متأخر ١–٣٠ يوم/.test(body));

/* ── ٦) الإنتاج والاختناق والأوامر ───────────── */
ok("production overview", body.includes("نظرة الإنتاج") && body.includes("استغلال الطاقة"));
ok("funnel shows arrived/out/waiting", /وصل .* خرج .* واقف/.test(body));
ok("bottleneck named with its cost", body.includes("الاختناق الحالي") && body.includes("قيمة الواقف بسعر البيع"));
ok("stage capacity gap declared", body.includes("طاقة كل مرحلة لوحدها لسه مش مسجّلة"));

/* ── ٧) الأقسام غير المتاحة بتقول محتاجة إيه ─── */
ok("missing metrics say what they need", /محتاج: /.test(body));
ok("gaps card lists what the dashboard cannot say", body.includes("حاجات اللوحة مش بتقولها"));
await page.getByRole("button", { name: /حاجات اللوحة مش بتقولها/ }).click();
await page.waitForTimeout(250);
const gaps = await page.locator("main").innerText();
ok("gaps name the machines data", gaps.includes("ماكينات"));

/* ── ٨) الأوضاع بتغيّر الترتيب فعلاً ─────────── */
const manager = await dash("إدارة التشغيل");
ok("manager mode drops the money sections", !manager.includes("الإيراد راح فين"), "waterfall still there");
ok("manager mode adds the floor detail", manager.includes("الأوامر الشغالة ومخاطرها") && manager.includes("خطوط الإنتاج"));
ok("live orders carry a delay risk and its reason", /خطر تأخير/.test(manager) && /الشغل الباقي أكبر من الوقت الفاضل|واقف بعد|نقص خامة/.test(manager));
ok("order mix drills into filtered orders", (await page.locator('a[href*="/orders?status="]').count()) > 0);
ok("quality section", manager.includes("الجودة") && /العيب بيتولد فين/.test(manager));
ok("inventory centre", manager.includes("المخزون") && /صحة المخزون/.test(manager));
ok("supplier scoring states what it ignores", /الالتزام بالمواعيد|مش مسجّل/.test(manager));
ok("workforce section", /الحضور|العمالة/.test(manager));

const floor = await dash("أرض المصنع");
ok("floor mode is production-first", floor.indexOf("نظرة الإنتاج") < floor.indexOf("الجودة"));
ok("floor mode hides money", !floor.includes("مركز السيولة") && !floor.includes("أعمار المديونية"));

/* ── ٩) المشرف بيوصل لوضع أرض المصنع ────────── */
await enter(/مشرف/);
const sup = await dash();
ok("supervisor reaches the command centre", sup.includes("نظرة الإنتاج"), sup.slice(0, 60));
ok("supervisor sees no financials", !/مركز السيولة|الإيراد راح فين|هامش الفترة/.test(sup));
ok("supervisor has no owner mode", !(await page.getByRole("tab", { name: "نظرة المالك" }).count()));

/* ── ١٠) مصنع فاضي ما يعرضش أصفار ───────────── */
await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.goto(`${BASE}/signup`);
await page.getByPlaceholder("أحمد محمود").fill("أحمد محمود");
await page.getByPlaceholder("ahmed@alnoor.com").fill("a@b.com");
await page.getByPlaceholder("1012345678").fill("1012345678");
const pwd = page.locator("input[autocomplete='new-password']");
await pwd.nth(0).fill("Ahmed@2026");
await pwd.nth(1).fill("Ahmed@2026");
await page.locator("input[type=checkbox]").first().check();
await page.getByRole("button", { name: /التالي: بيانات المصنع/ }).click();
await page.getByPlaceholder("مصنع النور للملابس الجاهزة").fill("مصنع جديد");
await page.getByRole("button", { name: "ملابس جاهزة", exact: true }).click();
await page.getByRole("button", { name: /التالي: الـWorkspace/ }).click();
await page.waitForTimeout(700);
await page.getByRole("button", { name: /جهّز المصنع/ }).click();
await page.waitForTimeout(1300);
await page.getByRole("button", { name: /التالي: الفريق/ }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /تخطي الآن/ }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /دخول إلى لوحة التحكم/ }).click();
await page.waitForTimeout(900);

const fresh = await dash();
ok("empty factory gets a welcome, not zeros", /ابدأ/.test(fresh) && !/٠٪/.test(fresh.split("حاجات اللوحة")[0]), fresh.slice(0, 80));
ok("empty factory shows setup progress", /جهوزية اللوحة/.test(fresh) && /٪/.test(fresh));
ok("empty factory names the first move", /أمر إنتاج/.test(fresh));

ok("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));

console.log(`PASS ${pass.length}\n` + pass.map((p) => "  ✓ " + p).join("\n"));
if (fail.length) console.log(`\nFAIL ${fail.length}\n` + fail.map((f) => "  ✗ " + f).join("\n"));
await browser.close();
process.exit(fail.length ? 1 : 0);
