import { chromium } from "playwright-core";

const URL = "http://127.0.0.1:43127";
const logs = [];
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1340, height: 1000 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("console", (m) => m.type() === "error" && logs.push(`[error] ${m.text()}`));

await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.waitForTimeout(700);

const stats = await page.locator("main a[href='/treasury'], main a[href='/collections'], main a[href='/costs']").allInnerTexts();
console.log("home stats:", stats.map((s) => s.replace(/\n/g, " · ")).join(" | "));
await page.screenshot({ path: "/opt/cursor/artifacts/screenshots/home_with_history.png", fullPage: true });

for (const path of ["/dashboard", "/treasury", "/planning", "/intelligence", "/collections", "/parties", "/orders", "/materials", "/costs", "/workers", "/products"]) {
  await page.goto(`${URL}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const h = await page.locator("main h2").first().innerText();
  console.log(`${path} → ${h.replace(/\n/g, " ")}`);
}

await page.goto(`${URL}/treasury`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
const treasury = await page.locator("main").innerText();
console.log("\n--- treasury ---\n" + treasury.split("\n").slice(0, 24).join("\n"));

console.log(`\nerrors: ${logs.length}`);
logs.slice(0, 6).forEach((l) => console.log("  ", l));
await browser.close();
