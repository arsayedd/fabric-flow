import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:43127";
const logs = [];
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1340, height: 1000 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("console", (m) => m.type() === "error" && logs.push(`[error] ${m.text()}`));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.waitForTimeout(700);

const shot = (name) => page.screenshot({ path: `/opt/cursor/artifacts/screenshots/${name}.png`, fullPage: true });

/* ١) زر المسح في الشريط العلوي */
const topScan = page.getByRole("link", { name: "مسح كود" }).first();
console.log("topbar SCAN:", (await topScan.count()) ? "موجود" : "مش موجود");
await topScan.click();
await page.waitForURL(/\/scan/);
await page.waitForTimeout(500);

/* ٢) كود مكتوب بالإيد: رقم باندل */
await page.getByRole("textbox").first().fill("SN-1043-B001");
await page.getByRole("button", { name: "جيب" }).click();
await page.waitForTimeout(400);
let text = await page.locator("main").innerText();
console.log("\n======== /scan — باندل ========");
console.log(text.split("\n").slice(0, 40).join("\n"));
await shot("scan_bundle");

/* ٣) كود بالصيغة الكاملة */
await page.getByRole("textbox").first().fill("SANAA://ORD/o2?f=factory-demo-1");
await page.getByRole("button", { name: "جيب" }).click();
await page.waitForTimeout(400);
console.log("\n======== /scan — كود بالصيغة ========");
console.log((await page.locator("main").innerText()).split("\n").slice(0, 20).join("\n"));

/* ٤) كود من مصنع تاني */
await page.getByRole("textbox").first().fill("SANAA://ORD/o2?f=other-factory");
await page.getByRole("button", { name: "جيب" }).click();
await page.waitForTimeout(400);
console.log("\n======== /scan — مصنع تاني ========");
console.log((await page.locator("main").innerText()).split("\n").slice(0, 26).join("\n"));
await shot("scan_other_factory");

/* ٥) كود غلط */
await page.getByRole("textbox").first().fill("ZZZ-9999");
await page.getByRole("button", { name: "جيب" }).click();
await page.waitForTimeout(400);
console.log("\n======== /scan — كود مش معروف ========");
console.log((await page.locator("main").innerText()).split("\n").slice(0, 26).join("\n"));

/* ٦) سلسلة التتبع */
await page.getByRole("textbox").first().fill("SN-1043-B001");
await page.getByRole("button", { name: "جيب" }).click();
await page.waitForTimeout(400);
await page.getByRole("link", { name: "سلسلة التتبع" }).first().click();
await page.waitForURL(/\/trace\//);
await page.waitForTimeout(600);
console.log("\n======== /trace ========");
console.log((await page.locator("main").innerText()).split("\n").slice(0, 70).join("\n"));
await shot("scan_trace");

/* ٧) مركز الطباعة */
await page.goto(`${BASE}/labels`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
console.log("\n======== /labels ========");
console.log((await page.locator("main").innerText()).split("\n").slice(0, 60).join("\n"));
await shot("scan_labels");

await page.getByRole("button", { name: /تيكت باندل/ }).first().click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: /اختار الظاهر/ }).click();
await page.waitForTimeout(200);
await page.getByRole("button", { name: /معاينة وطباعة/ }).click();
await page.waitForTimeout(900);
const dialog = page.locator("div.print-root");
console.log("\nمعاينة الطباعة:", (await dialog.count()) ? "فتحت" : "مافتحتش");
const labels = await page.locator(".sheet svg").count();
console.log("عناصر SVG في الورقة:", labels);
await shot("scan_labels_preview");

console.log(`\nerrors: ${logs.length}`);
logs.slice(0, 10).forEach((l) => console.log("  ", l));
await browser.close();
