import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:43127";
const logs = [];
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });

for (const role of [/مشرف/, /محاسب/]) {
  const page = await browser.newPage({ viewport: { width: 1340, height: 1000 } });
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  page.on("console", (m) => m.type() === "error" && logs.push(`[error] ${m.text()}`));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: role }).first().click();
  await page.waitForTimeout(700);
  console.log(`\n======== ${role} ========`);
  for (const path of ["/cutting", "/production", "/floor", "/station", "/outsourcing"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const here = page.url().replace(BASE, "");
    const h = await page.locator("main h2, main h3").first().innerText().catch(() => "—");
    console.log(`${path} → ${here === path ? "دخل" : `اترد لـ ${here}`} · ${h.replace(/\n/g, " ")}`);
  }
  const nav = await page.locator("nav").first().innerText();
  console.log("القص في القائمة:", nav.includes("القص والفرشات"), "· الورش:", nav.includes("الورش الخارجية"));
  await page.close();
}
console.log(`\nerrors: ${logs.length}`);
logs.slice(0, 8).forEach((l) => console.log("  ", l));
await browser.close();
