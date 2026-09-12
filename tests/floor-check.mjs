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

for (const path of ["/cutting", "/production", "/floor", "/station", "/outsourcing"]) {
  await page.goto(`${URL}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const text = await page.locator("main").innerText();
  console.log(`\n======== ${path} ========`);
  console.log(text.split("\n").slice(0, 60).join("\n"));
  await page.screenshot({ path: `/opt/cursor/artifacts/screenshots/floor${path.replace("/", "_")}.png`, fullPage: true });
}

console.log(`\nerrors: ${logs.length}`);
logs.slice(0, 10).forEach((l) => console.log("  ", l));
await browser.close();
