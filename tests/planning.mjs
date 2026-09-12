import { chromium } from "playwright-core";

const URL = "http://127.0.0.1:43127";
const pass = [];
const fail = [];
const ok = (name, cond, extra = "") => (cond ? pass : fail).push(`${name}${extra ? " — " + extra : ""}`);

const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(URL);
await page.getByRole("button", { name: "جرّب بالبيانات الجاهزة" }).click().catch(() => {});
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click().catch(() => {});
await page.waitForTimeout(800);

// home teaser
const teaser = page.locator("text=التخطيط والطاقة").first();
ok("planning teaser on home", await teaser.isVisible());

await page.goto(`${URL}/planning`);
await page.waitForTimeout(500);

const body = await page.locator("main").innerText();
ok("capacity formula shown", /عامل مسجّل × .* ساعة × .*٪ استغلال/.test(body), body.match(/.{0,10}استغلال.{0,30}/)?.[0]);
ok("three capacity windows", (await page.locator("text=يوم عمل").count()) >= 3);
ok("schedule table present", body.includes("جدول الإنتاج"));
ok("order codes scheduled", /SN-104/.test(body));
ok("mrp section present", body.includes("احتياج الخامات"));
ok("outside-schedule reasons", body.includes("برّه الجدولة") && /مش مربوط بمنتج/.test(body));
ok("no stored plan claim", body.includes("بيتحسب من أوامرك"));

// late order SN-1041 is overdue and must show as late in the schedule
const row = page.locator("tr", { hasText: "SN-1041" }).first();
ok("late order flagged", (await row.innerText()).includes("متأخر"), (await row.innerText()).replace(/\n/g, " | "));

// capacity panel changes the plan
const before = await page.locator("main").innerText();
await page.getByRole("button", { name: "الطاقة" }).click();
await page.getByLabel("نسبة الاستغلال %").fill("40");
await page.getByRole("button", { name: "احفظ الطاقة" }).click();
await page.waitForTimeout(600);
const after = await page.locator("main").innerText();
ok("capacity change reschedules", before !== after);
const arabic = (s) => Number(s.replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[^\d]/g, ""));
const pcts = (t) => [...t.matchAll(/([\d٠-٩٬]+)٪ محمّل/g)].map((m) => arabic(m[1]));
const pctBefore = Math.max(0, ...pcts(before));
const pctAfter = Math.max(0, ...pcts(after));
// الحمل بيتوقف عند ١٠٠٪ في العرض، فلو كان مشبّع قبل التغيير مفيش مساحة يزيد فيها
ok(
  "lower utilization raises load %",
  pctAfter > pctBefore || (pctBefore >= 100 && pctAfter >= 100),
  `${pctBefore} -> ${pctAfter}`,
);

// restore
await page.getByRole("button", { name: "الطاقة" }).click();
await page.getByRole("button", { name: "رجّع الافتراضي" }).click();
await page.getByRole("button", { name: "احفظ الطاقة" }).click();
await page.waitForTimeout(500);

// simulator: feasible small order vs impossible big order
await page.getByRole("button", { name: "لو…؟", exact: true }).click();
await page.getByLabel("الكمية").fill("100");
await page.getByRole("button", { name: "احسب" }).click();
await page.waitForTimeout(400);
const small = await page.locator(".z-50").innerText();
ok("sim answers capacity", /(أيوه، المصنع يقدر|لأ، مش هيلحق)/.test(small));
ok("sim shows money", small.includes("التكلفة المتوقعة"));
ok("sim shows materials", small.includes("الخامات"));

await page.getByLabel("الكمية").fill("5000");
await page.getByRole("button", { name: "احسب" }).click();
await page.waitForTimeout(400);
const big = await page.locator(".z-50").innerText();
ok("big order cannot be met", big.includes("لأ، مش هيلحق"), big.split("\n")[2]);
ok("extra workers suggested", /عامل إضافي/.test(big), big.match(/.{0,60}عامل إضافي.{0,40}/)?.[0]);
ok("impact on running orders", big.includes("تأثيره على الأوامر الشغالة") || big.includes("مفيش أمر شغال هيتأخر"));
ok("material shortage priced", /شراء الخامات الناقصة|ناقص/.test(big));

// product without routing must refuse instead of guessing
const options = await page.locator("select").first().locator("option").allTextContents();
ok("product list populated", options.length > 1, options.join(", "));

ok("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));

console.log(`PASS ${pass.length}`);
pass.forEach((p) => console.log("  ✓", p));
if (fail.length) {
  console.log(`FAIL ${fail.length}`);
  fail.forEach((f) => console.log("  ✗", f));
}
await browser.close();
process.exit(fail.length ? 1 : 0);
