import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:43127";
const logs = [];
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 1400 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("console", (m) => m.type() === "error" && logs.push(`[error] ${m.text()}`));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.waitForTimeout(800);

await page.goto(`${BASE}/insights`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
console.log(await page.locator("main").innerText());
console.log("\n=== أخطاء:", logs.length ? logs.join("\n") : "مافيش");

await page.goto(`${BASE}/costing`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
const t = await page.locator("main").innerText();
console.log("\n=== ورقة التكلفة: بند المرتجعات ===");
console.log(t.split("\n").filter((l) => /مرتجع|إرجاع/.test(l)).join("\n") || "مش ظاهر في الصفحة الرئيسية");

await browser.close();
