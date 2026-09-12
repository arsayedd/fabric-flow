import { chromium } from "playwright-core";

const URL = "http://127.0.0.1:43127";
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.waitForTimeout(400);

await page.goto(`${URL}/orders`, { waitUntil: "networkidle" });
await page.getByRole("link", { name: /SN-1043/ }).first().click();
await page.waitForTimeout(400);

const stagesBefore = await page.locator("section:has-text('المراحل') >> div.rounded-lg > div").allInnerTexts();
console.log("stages before:", stagesBefore.map((s) => s.replace(/\s+/g, " ")));

const selects = page.locator("select");
await selects.nth(0).selectOption({ index: 2 }); // حياكة
await selects.nth(1).selectOption({ index: 1 }); // عامل
await page.getByPlaceholder("سليم").fill("2");
await page.getByRole("button", { name: "سجّل" }).first().click();
await page.waitForTimeout(600);
console.log("toast:", JSON.stringify(await page.locator("[data-sonner-toast]").allInnerTexts()));
const stagesAfter = await page.locator("section:has-text('المراحل') >> div.rounded-lg > div").allInnerTexts();
console.log("stages after:", stagesAfter.map((s) => s.replace(/\s+/g, " ")));

// فحص التمدد الأفقي على الموبايل
for (const path of ["/", "/products", "/materials", "/orders"]) {
  await page.goto(`${URL}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`overflow ${path}:`, overflow);
}

await page.goto(`${URL}/products`, { waitUntil: "networkidle" });
await page.getByRole("link", { name: "قميص قطني" }).first().click();
await page.waitForTimeout(400);
console.log("product overflow:", await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
await page.screenshot({ path: "/tmp/sanaa-product-mobile.png", fullPage: true });

await browser.close();
