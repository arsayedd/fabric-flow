import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:43127";
const logs = [];
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });

for (const role of [/صاحب المصنع/, /محاسب/, /مشرف/]) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  page.on("console", (m) => m.type() === "error" && logs.push(`[error] ${m.text()}`));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: role }).first().click();
  await page.waitForTimeout(700);
  await page.goto(`${BASE}/insights`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  console.log(`\n════ ${role} ════`);
  console.log(await page.locator("main").innerText());
  await page.close();
}
console.log("\nأخطاء:", logs.length ? logs.join("\n") : "مافيش");
await browser.close();
