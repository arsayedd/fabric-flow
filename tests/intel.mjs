import { chromium } from "playwright-core";

const URL = "http://127.0.0.1:43127";
const logs = [];
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1320, height: 1000 } });
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
const ok = (l, c, extra = "") => console.log(`${c ? "PASS" : "FAIL"}  ${l}${extra ? ` — ${extra}` : ""}`);

await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.waitForTimeout(600);

// المركز
await page.goto(`${URL}/intelligence`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
ok("intelligence page", await page.getByRole("heading", { name: "ذكاء العملاء" }).isVisible());
const table = await page.locator("table").first().locator("tbody tr").count();
ok("ranking rows", table >= 5, `${table} customers`);
const scores = await page.locator("table tbody tr td:nth-child(2)").allInnerTexts();
console.log("      scores:", scores.map((s) => s.trim()).join(" | "));
const sales = await page.locator("table tbody tr td:nth-child(3)").allInnerTexts();
console.log("      sales:", sales.map((s) => s.trim()).join(" | "));
const collect = await page.locator("table tbody tr td:nth-child(4)").allInnerTexts();
console.log("      collection:", collect.map((s) => s.trim()).join(" | "));
ok("concentration block", await page.getByText("تركيز الإيرادات").isVisible());
ok("cohorts table", await page.getByText("هل المصنع بيحافظ على عملاءه؟").isVisible());
ok("tier breakdown", await page.getByText("تصنيف العملاء").isVisible());

// أوزان السكور
await page.getByRole("button", { name: "أوزان السكور" }).click();
await page.waitForTimeout(400);
const sliders = await page.locator("input[type=range]").count();
ok("weights editor has 7 sliders", sliders === 7, `${sliders}`);
// اقرأ السكور الحالي لأول عميل قبل التغيير
await page.locator("button[aria-label='إغلاق']").first().click();
await page.waitForTimeout(300);
const firstBefore = (await page.locator("table tbody tr").first().locator("td:nth-child(2)").innerText()).trim();

// خلي الربحية هي كل حاجة وشوف السكور بيتغير
await page.getByRole("button", { name: "أوزان السكور" }).click();
await page.waitForTimeout(400);
const boxes = page.locator("input[inputmode=numeric]");
for (let i = 0; i < 7; i++) await boxes.nth(i).fill(i === 4 ? "50" : "0");
await page.getByRole("button", { name: "احفظ الأوزان" }).click();
await page.waitForTimeout(700);
const firstAfter = (await page.locator("table tbody tr").first().locator("td:nth-child(2)").innerText()).trim();
ok("weights change the score", firstBefore !== firstAfter, `${firstBefore} -> ${firstAfter}`);
// رجّع الافتراضي
await page.getByRole("button", { name: "أوزان السكور" }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "رجّع الأوزان الافتراضية" }).click();
await page.getByRole("button", { name: "احفظ الأوزان" }).click();
await page.waitForTimeout(500);

// تبويب الذكاء في صفحة العميل
await page.goto(`${URL}/parties/cl-1`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
ok("summary card on overview", await page.getByText("سكور العميل").first().isVisible());
await page.getByRole("button", { name: "الذكاء" }).click();
await page.waitForTimeout(600);
const blocks = await page.locator("details").count();
ok("seven weighted components", blocks === 7, `${blocks}`);
ok("explains what lifted the score", await page.getByText("اللي رفع الدرجة").isVisible());
ok("next best action", await page.getByText("الخطوة الجاية").isVisible());
ok("insights", await page.getByText("ملاحظات النظام").isVisible());
ok("rfm", await page.getByText("RFM").first().isVisible());
ok("clv", await page.getByText(/القيمة المتوقعة للعميل/).isVisible());
ok("journey", await page.getByText("رحلة العميل").isVisible());
ok("aging", await page.getByText("أعمار المديونية").isVisible());

// افتح مؤشر السداد وشوف الأرقام
await page.getByText("التحصيل والسداد").first().click();
await page.waitForTimeout(400);
const payText = await page.locator("details", { hasText: "التحصيل والسداد" }).first().innerText();
console.log("\n--- payment block ---\n" + payText.split("\n").slice(0, 26).join("\n"));

// العميل المتوقف: خطر توقف
await page.goto(`${URL}/parties/cl-4`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.getByRole("button", { name: "الذكاء" }).click();
await page.waitForTimeout(600);
const churn = await page.locator("div", { hasText: "خطر التوقف" }).last().innerText();
console.log("\n--- dormant customer churn ---\n" + churn.split("\n").slice(0, 8).join("\n"));

const bad = logs.filter((l) => !l.includes("React DevTools"));
console.log(`\nconsole noise: ${bad.length}`);
bad.slice(0, 8).forEach((l) => console.log("  ", l));
await browser.close();
