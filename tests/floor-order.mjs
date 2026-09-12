import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:43127";
const logs = [];
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1340, height: 1100 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("console", (m) => m.type() === "error" && logs.push(`[error] ${m.text()}`));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.waitForTimeout(700);

await page.goto(`${BASE}/orders`, { waitUntil: "networkidle" });
await page.getByText("SN-1043").first().click();
await page.waitForTimeout(700);
const text = await page.locator("main").innerText();
const i = text.indexOf("القص");
console.log(text.slice(i, i + 400));
await page.screenshot({ path: "/opt/cursor/artifacts/screenshots/floor_order_cut.png", fullPage: true });

console.log(`\nerrors: ${logs.length}`);
logs.slice(0, 8).forEach((l) => console.log("  ", l));
await browser.close();
