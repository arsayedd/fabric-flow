import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:43127";
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const ok = (l, c, x = "") => console.log(`${c ? "PASS" : "FAIL"}  ${l}${x ? ` — ${x}` : ""}`);

// ١) مقاس موبايل: مفيش جرجرة أفقية
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.waitForTimeout(700);
await page.goto(`${BASE}/parties`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.getByRole("link", { name: /محلات البرنس/ }).first().click();
await page.waitForTimeout(500);

for (const tab of ["الموديلات والربح", "التسليم والمرتجعات"]) {
  await page.getByRole("button", { name: tab }).click();
  await page.waitForTimeout(600);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${tab}: مفيش جرجرة أفقية على ٣٩٠`, over <= 0, `${over}px`);
}
await page.close();

// ٢) المحاسب بيشوف التبويبين، والمشرف مابيشوفش شاشة الجهات أصلًا
const p2 = await browser.newPage({ viewport: { width: 1280, height: 950 } });
const errs = [];
p2.on("pageerror", (e) => errs.push(e.message));
await p2.goto(BASE, { waitUntil: "networkidle" });
await p2.getByRole("button", { name: /^محاسب/ }).first().click();
await p2.waitForTimeout(700);
await p2.goto(`${BASE}/parties`, { waitUntil: "networkidle" });
await p2.waitForTimeout(500);
await p2.locator("a[href^='/parties/']").first().click();
await p2.waitForTimeout(600);
await p2.getByRole("button", { name: "الموديلات والربح" }).click();
await p2.waitForTimeout(600);
ok("المحاسب بيفتح صافي المساهمة", await p2.getByText("صافي المساهمة").isVisible());
await p2.getByRole("button", { name: "التسليم والمرتجعات" }).click();
await p2.waitForTimeout(600);
ok("المحاسب بيفتح من الأمر للتحصيل", await p2.getByText("من الأمر للتحصيل").isVisible());

await p2.goto(BASE, { waitUntil: "networkidle" });
await p2.evaluate(() => localStorage.clear());
await p2.reload({ waitUntil: "networkidle" });
await p2.getByRole("button", { name: /^مشرف/ }).first().click();
await p2.waitForTimeout(700);
await p2.goto(`${BASE}/parties`, { waitUntil: "networkidle" });
await p2.waitForTimeout(600);
const blocked = await p2.locator("main").innerText();
ok(
  "المشرف مابيوصلش لبيانات العملاء",
  !blocked.includes("صافي المساهمة") && !p2.url().endsWith("/parties"),
  p2.url(),
);
ok("مفيش أخطاء في الكونسول", errs.length === 0, errs.slice(0, 3).join(" | "));
await browser.close();
