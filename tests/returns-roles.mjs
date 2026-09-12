import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:43127";
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const logs = [];

const asRole = async (roleName, viewport) => {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => logs.push(`[${roleName}] [pageerror] ${e.message}`));
  page.on("console", (m) => m.type() === "error" && logs.push(`[${roleName}] [error] ${m.text()}`));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: new RegExp(roleName) }).first().click();
  await page.waitForTimeout(700);
  return page;
};

const overflow = (page) =>
  page.evaluate(() => {
    const d = document.documentElement;
    return { scroll: d.scrollWidth, client: d.clientWidth };
  });

for (const role of ["صاحب المصنع", "محاسب", "مشرف"]) {
  const page = await asRole(role, { width: 1200, height: 1100 });
  console.log(`\n═══ ${role} ═══`);

  for (const path of ["/returns", "/insights"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const txt = await page.locator("main").innerText();
    const blocked = txt.includes("مالكش صلاحية") || txt.includes("الشاشة دي");
    const tabs = await page.locator("main button").allInnerTexts();
    console.log(`  ${path} → ${blocked ? "ممنوع" : "مفتوح"} · أزرار: ${tabs.map((t) => t.trim()).filter(Boolean).slice(0, 8).join(" | ")}`);
    const newBtn = await page.getByRole("button", { name: "مرتجع جديد" }).count();
    if (path === "/returns") console.log(`     زر «مرتجع جديد»: ${newBtn > 0}`);
  }

  /* التابات اللي الدور يشوفها */
  await page.goto(`${BASE}/returns`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const sources = await page.locator("main").innerText();
  console.log("     مصادر ظاهرة:", ["مرتجع عميل", "مرتجع لمورّد", "مرتجع من الإنتاج"].filter((s) => sources.includes(s)).join(" · ") || "مافيش");

  await page.close();
}

/* الموبايل: ٣٩٠ بكسل */
const m = await asRole("صاحب المصنع", { width: 390, height: 844 });
console.log("\n═══ موبايل ٣٩٠ ═══");
for (const path of ["/returns", "/returns?tab=models", "/returns?tab=reasons", "/returns?tab=complaints", "/insights"]) {
  await m.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await m.waitForTimeout(600);
  const o = await overflow(m);
  console.log(`  ${path} → ${o.scroll <= o.client ? "مفيش جرجرة أفقية" : `جرجرة! ${o.scroll} > ${o.client}`}`);
}
await m.close();

console.log("\nأخطاء الكونسول:", logs.length ? logs.join("\n") : "مافيش");
await browser.close();
