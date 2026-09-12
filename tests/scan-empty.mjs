import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:43127";
const logs = [];
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("console", (m) => m.type() === "error" && logs.push(`[error] ${m.text()}`));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.waitForTimeout(800);

/* مصنع شغّال بس مافيهوش سجلات ولا مسح — أول يوم بالظبط */
await page.evaluate(() => {
  for (const k of Object.keys(localStorage)) {
    if (!k.startsWith("factory-ledger")) continue;
    const db = JSON.parse(localStorage.getItem(k));
    for (const arr of [
      "scans", "cutLays", "cutLayLines", "bundles", "bundleOps", "subcontracts",
      "products", "materials", "orders", "workers", "parties", "documents",
    ])
      db[arr] = [];
    localStorage.setItem(k, JSON.stringify(db));
  }
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(600);

for (const path of ["/scan", "/labels", "/trace/bundle/bn-1"]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(`\n======== ${path} (مصنع فاضي) · تمرير ${over}px ========`);
  console.log((await page.locator("main").innerText()).split("\n").filter(Boolean).slice(3, 22).join("\n"));
  await page.screenshot({ path: `/opt/cursor/artifacts/screenshots/empty${path.replace(/\//g, "_")}.png`, fullPage: true });
}

/* كود على سجل اتمسح: لازم يقول كده بدل ما يوقع */
await page.goto(`${BASE}/scan`, { waitUntil: "networkidle" });
await page.getByRole("textbox").first().fill("SANAA://BND/bn-1?f=factory-demo-1");
await page.getByRole("button", { name: "جيب" }).click();
await page.waitForTimeout(400);
console.log("\n======== كود على سجل مامش موجود ========");
console.log((await page.locator("main").innerText()).split("\n").filter(Boolean).slice(-4).join("\n"));

console.log(`\nerrors: ${logs.length}`);
logs.slice(0, 8).forEach((l) => console.log("  ", l));
await browser.close();
