import { chromium } from "playwright-core";

const URL = "http://127.0.0.1:43127";
const logs = [];
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("console", (m) => m.type() === "error" && logs.push(`[error] ${m.text()}`));
const shot = (n) => page.screenshot({ path: `/opt/cursor/artifacts/screenshots/${n}.png`, fullPage: true });

/* ── ١) مصنع فاضي: الشاشات الجديدة لازم تقول «لسه» مش تقع ── */
await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.waitForTimeout(800);
// مصنع شغّال بس الطبقة دي لسه ماتستعملتش — ده أول يوم بالظبط
await page.evaluate(() => {
  for (const k of Object.keys(localStorage)) {
    if (!k.startsWith("factory-ledger")) continue;
    const db = JSON.parse(localStorage.getItem(k));
    for (const arr of ["cutLays", "cutLayLines", "bundles", "bundleOps", "floorIssues", "subcontracts", "subReceipts", "subPayments"]) db[arr] = [];
    localStorage.setItem(k, JSON.stringify(db));
  }
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(600);

for (const path of ["/cutting", "/production", "/floor", "/station", "/outsourcing"]) {
  await page.goto(`${URL}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const text = (await page.locator("main").innerText()).split("\n").filter(Boolean);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  console.log(`\n== empty ${path} ${overflow ? "⚠ تمرير أفقي" : "(بلا تمرير أفقي)"}`);
  console.log("  " + text.slice(0, 14).join("\n  "));
  await shot(`floor_empty${path.replace("/", "_")}`);
}

/* ── ٢) الديمو على موبايل: تمرير أفقي؟ ── */
await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.waitForTimeout(700);
for (const path of ["/cutting", "/production", "/floor", "/station", "/outsourcing"]) {
  await page.goto(`${URL}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(`mobile ${path}: overflow ${overflow}px`);
  await shot(`floor_mobile${path.replace("/", "_")}`);
}

/* ── ٣) شاشة أرض المصنع على تلفزيون ── */
await page.setViewportSize({ width: 1920, height: 1080 });
await page.goto(`${URL}/floor`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
await page.screenshot({ path: "/opt/cursor/artifacts/screenshots/floor_tv.png" });

console.log(`\nerrors: ${logs.length}`);
logs.slice(0, 10).forEach((l) => console.log("  ", l));
await browser.close();
