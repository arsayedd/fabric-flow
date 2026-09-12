import { chromium } from "playwright-core";

const URL = "http://127.0.0.1:43127";
const logs = [];

const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });

// دخول تجريبي كصاحب مصنع
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.waitForTimeout(400);

// المنتجات
await page.goto(`${URL}/products`, { waitUntil: "networkidle" });
await page.waitForTimeout(300);
await page.getByRole("link", { name: "قميص قطني" }).first().click();
await page.waitForTimeout(400);

const before = await page.locator("section:has-text('قائمة الخامات') >> div.rounded-lg > div").count();
await page.locator("select").filter({ hasText: "اختَر خامة" }).selectOption({ label: "بطانة" });
await page.getByPlaceholder("الكمية").fill("2");
await page.getByPlaceholder("هالك ٪").fill("5");
await page.getByRole("button", { name: "أضف" }).first().click();
await page.waitForTimeout(500);
const after = await page.locator("section:has-text('قائمة الخامات') >> div.rounded-lg > div").count();
const toast = await page.locator("[data-sonner-toast]").allInnerTexts();
console.log("BOM rows:", before, "->", after, "| toast:", JSON.stringify(toast));

// المخزن
await page.goto(`${URL}/materials`, { waitUntil: "networkidle" });
await page.waitForTimeout(300);
console.log("materials page ok:", await page.locator("text=قيمة المخزون").isVisible());

// أمر إنتاج
await page.goto(`${URL}/orders`, { waitUntil: "networkidle" });
await page.waitForTimeout(300);
await page.getByRole("link", { name: /SN-1043/ }).first().click();
await page.waitForTimeout(400);
const issue = page.getByRole("button", { name: "اصرف الخامات" });
console.log("issue button:", await issue.count());
if (await issue.count()) {
  await issue.click();
  await page.waitForTimeout(500);
  console.log("after issue toast:", JSON.stringify(await page.locator("[data-sonner-toast]").allInnerTexts()));
}

// تسجيل إنتاج أكبر من كمية الأمر
const selects = page.locator("select");
await selects.nth(0).selectOption({ index: 1 });
await page.getByPlaceholder("سليم").fill("500");
await page.getByRole("button", { name: "سجّل" }).first().click();
await page.waitForTimeout(500);
console.log("overflow toast:", JSON.stringify(await page.locator("[data-sonner-toast]").allInnerTexts()));

// تسجيل إنتاج صحيح
await page.getByPlaceholder("سليم").fill("2");
await page.getByRole("button", { name: "سجّل" }).first().click();
await page.waitForTimeout(500);
console.log("valid toast:", JSON.stringify(await page.locator("[data-sonner-toast]").allInnerTexts()));

console.log("\n--- console ---");
console.log(logs.join("\n") || "(نضيف)");
await browser.close();
