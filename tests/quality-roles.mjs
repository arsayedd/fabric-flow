import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:43127";
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const logs = [];

const asRole = async (roleName) => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1100 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => logs.push(`[${roleName}] [pageerror] ${e.message}`));
  page.on("console", (m) => m.type() === "error" && logs.push(`[${roleName}] [error] ${m.text()}`));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: new RegExp(roleName) }).first().click();
  await page.waitForTimeout(700);
  return page;
};

for (const role of ["صاحب المصنع", "محاسب", "مشرف"]) {
  const page = await asRole(role);
  console.log(`\n═══ ${role} ═══`);

  for (const path of ["/quality", "/repairs"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const url = page.url().replace(BASE, "") || "/";
    const txt = await page.locator("main").innerText();
    console.log(`  ${path} → ${url === path ? "مفتوح" : `محوّل لـ${url}`}`);
    if (url !== path) continue;
    if (path === "/quality") {
      const wq = page.getByRole("button", { name: "الخطوط والعمال", exact: true }).first();
      if (await wq.count()) {
        await wq.click();
        await page.waitForTimeout(400);
        const t = await page.locator("main").innerText();
        console.log(`     جودة العمال ظاهرة: ${t.includes("قياس مش تقييم")} · الرسالة البديلة: ${t.includes("الترتيب ده تقييم أشخاص")}`);
      }
    } else {
      const btns = await page.locator("main button").allInnerTexts();
      console.log(`     أزرار التنفيذ: ${btns.map((x) => x.trim()).filter((x) => ["ابدأ", "خلّصت", "سجّل الفحص", "رجّعها للعميل", "إلغاء"].includes(x)).join(" | ") || "مافيش"}`);
    }
  }

  /* القائمة: القسم بقى اسمه إيه وفيه إيه */
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const nav = await page.locator("aside").innerText().catch(() => "");
  const line = nav.split("\n").findIndex((x) => x.includes("الجودة والمرتجعات"));
  console.log(`  القسم في القائمة: ${line >= 0 ? nav.split("\n").slice(line, line + 4).map((x) => x.trim()).join(" · ") : "مش ظاهر"}`);

  await page.close();
}

console.log("\nأخطاء الكونسول:", logs.length ? logs.join("\n") : "مافيش");
await browser.close();
