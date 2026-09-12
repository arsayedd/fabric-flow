import { chromium } from "playwright-core";

const URL = "http://127.0.0.1:43127";
const OUT = "/opt/cursor/artifacts/screenshots";
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1340, height: 1000 }, deviceScaleFactor: 2 });
const logs = [];
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("console", (m) => m.type() === "error" && logs.push(`[error] ${m.text()}`));

// مصنع فاضي خالص عشان نشوف الشاشات وهي مفيهاش داتا
await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.goto(`${URL}/signup`, { waitUntil: "networkidle" });
await page.getByPlaceholder("أحمد محمود").fill("أحمد محمود");
await page.getByPlaceholder("ahmed@alnoor.com").fill("a@b.com");
await page.getByPlaceholder("1012345678").fill("1012345678");
const pwd = page.locator("input[autocomplete='new-password']");
await pwd.nth(0).fill("Ahmed@2026");
await pwd.nth(1).fill("Ahmed@2026");
await page.locator("input[type=checkbox]").first().check();
await page.getByRole("button", { name: /التالي: بيانات المصنع/ }).click();
await page.getByPlaceholder("مصنع النور للملابس الجاهزة").fill("مصنع النور");
await page.getByRole("button", { name: "ملابس جاهزة", exact: true }).click();
await page.getByRole("button", { name: /التالي: الـWorkspace/ }).click();
await page.waitForTimeout(700);
await page.getByRole("button", { name: /جهّز المصنع/ }).click();
await page.waitForTimeout(1300);
await page.getByRole("button", { name: /التالي: الفريق/ }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /تخطي الآن/ }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /دخول إلى لوحة التحكم/ }).click();
await page.waitForTimeout(800);

for (const path of ["/", "/orders", "/products", "/materials", "/parties", "/workers", "/collections", "/cashflow", "/costing", "/planning", "/dashboard", "/treasury", "/costs"]) {
  await page.goto(`${URL}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const text = (await page.locator("main").innerText()).replace(/\n+/g, " · ").slice(0, 150);
  console.log(`${path.padEnd(14)} ${text}`);
  await page.screenshot({ path: `${OUT}/empty${path === "/" ? "-home" : path.replace("/", "-")}.png` });
}

console.log(`\nconsole errors: ${logs.length}`);
logs.slice(0, 5).forEach((l) => console.log("  ", l));
await browser.close();
