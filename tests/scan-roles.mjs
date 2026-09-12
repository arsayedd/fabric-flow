import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:43127";
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });

/* ١) الموبايل: عرض ٣٩٠، وبنقيس التمرير الأفقي كمان */
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const logs = [];
phone.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
phone.on("console", (m) => m.type() === "error" && logs.push(`[error] ${m.text()}`));
await phone.goto(BASE, { waitUntil: "networkidle" });
await phone.evaluate(() => localStorage.clear());
await phone.reload({ waitUntil: "networkidle" });
await phone.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await phone.waitForTimeout(700);

for (const [path, name] of [
  ["/scan", "mobile_scan"],
  ["/labels", "mobile_labels"],
  ["/trace/bundle/bn-1", "mobile_trace"],
]) {
  await phone.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await phone.waitForTimeout(600);
  const over = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(`${path}: تمرير أفقي ${over}px`);
  await phone.screenshot({ path: `/opt/cursor/artifacts/screenshots/${name}.png`, fullPage: true });
}

/* ٢) الأدوار: المشرف والمحاسب */
for (const role of [/مشرف/, /محاسب/]) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 950 } });
  page.on("pageerror", (e) => logs.push(`[pageerror ${role}] ${e.message}`));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: role }).first().click();
  await page.waitForTimeout(700);

  await page.goto(`${BASE}/labels`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const labels = await page.locator("main").innerText();
  const kinds = labels.split("\n").filter((l) => l.startsWith("ليبل ") || l.startsWith("كارنيه") || l.startsWith("كارت") || l.startsWith("تيكت"));
  console.log(`\n${role} — أنواع الليبل الظاهرة: ${kinds.join(" · ") || "مفيش"}`);

  await page.goto(`${BASE}/trace/party/cl-1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const trace = (await page.locator("main").innerText()).split("\n").slice(0, 8).join(" | ");
  console.log(`${role} — تتبع جهة تعامل: ${trace}`);
  await page.close();
}

console.log(`\nerrors: ${logs.length}`);
logs.slice(0, 8).forEach((l) => console.log("  ", l));
await browser.close();
