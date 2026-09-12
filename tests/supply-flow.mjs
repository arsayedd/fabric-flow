import { chromium } from "playwright-core";
const B = "http://127.0.0.1:43127";
const b = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1340, height: 950 } });
const errs = [];
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
p.on("pageerror", (e) => errs.push(String(e)));

const txt = async (sel) => (await p.locator(sel).allInnerTexts()).join("\n");
const fieldIn = (root, label) => root.locator("label").filter({ hasText: label }).first().locator("input");

await p.goto(B);
const demo = p.getByRole("button", { name: /صاحب المصنع/ });
if (await demo.count()) await demo.first().click();
await p.waitForTimeout(800);

console.log("=== 1) أوامر التوريد ===");
await p.goto(`${B}/supply`);
await p.waitForTimeout(1200);
const cards = await txt("main div.bg-card");
for (const line of cards.split("\n").filter((l) => /SUP-|طلبنا|عجز|باقي|اتأخر|ميعاده|خسارة|الالتزام/.test(l)).slice(0, 22)) console.log(" ", line);

console.log("\n=== 2) الدفعات ===");
await p.goto(`${B}/supply?tab=batches`);
await p.waitForTimeout(1000);
const bt = await txt("main div.bg-card");
for (const line of bt.split("\n").filter((l) => /LOT-|قيمة المخزون|متتبّع|دخل |RCL-/.test(l)).slice(0, 16)) console.log(" ", line);

console.log("\n=== 3) المتاح فعلًا ===");
await p.goto(`${B}/supply?tab=available`);
await p.waitForTimeout(900);
const av = await txt("main div.bg-card");
for (const line of av.split("\n").filter((l) => /متاح|موجود/.test(l)).slice(0, 12)) console.log(" ", line);

console.log("\n=== 4) التزام الموردين ===");
await p.goto(`${B}/supply?tab=suppliers`);
await p.waitForTimeout(900);
const sup = await txt("main div.bg-card");
for (const line of sup.split("\n").filter((l) => /الميعاد|أمر |كلّفنا/.test(l)).slice(0, 14)) console.log(" ", line);

console.log("\n=== 5) الاستدعاء: المشكلة وصلت لمين ===");
await p.goto(`${B}/supply?tab=batches`);
await p.waitForTimeout(900);
await p.getByRole("link", { name: /RCL-2026-000002/ }).first().click();
await p.waitForTimeout(1200);
console.log("  العنوان:", (await p.locator("main h2").first().innerText()).trim());
const rc = await txt("main div.bg-card");
for (const line of rc.split("\n").filter((l) => l.trim()).slice(0, 30)) console.log("  ", line);

console.log("\n=== 6) الاستدعاء المتلحق جوه المصنع ===");
await p.goto(`${B}/supply?tab=batches`);
await p.waitForTimeout(800);
await p.getByRole("link", { name: /RCL-2026-000001/ }).first().click();
await p.waitForTimeout(1200);
const rc1 = await txt("main div.bg-card");
for (const line of rc1.split("\n").filter((l) => /جوه المصنع|SN-|لسه في المخزن|خرج للعملاء|اتوقفت|خلصت/.test(l)).slice(0, 14)) console.log("  ", line);

console.log("\n=== 7) سلسلة التتبّع بقت توصل للدفعة ===");
await p.goto(`${B}/trace/order/o1`);
await p.waitForTimeout(1200);
const tr = await txt("main");
for (const line of tr.split("\n").filter((l) => /الدفعة|LOT-|لوط|الدلتا|دفعات/.test(l)).slice(0, 10)) console.log("  ", line);

console.log("\n=== 8) استلام جزئي جديد ===");
await p.goto(`${B}/supply`);
await p.waitForTimeout(1000);
await p.getByRole("button", { name: "سجّل استلام" }).first().click();
const panel = p.locator("div.fixed.inset-0.z-50");
await p.waitForTimeout(700);
console.log("  البانل:", (await panel.locator("h3, h2").first().innerText()).trim());
await fieldIn(panel, "اتقبل ودخل المخزن").fill("500");
await fieldIn(panel, "رقم اللوط على الشحنة").fill("ACC-991");
await panel.getByRole("button", { name: "سجّل الاستلام" }).click();
await p.waitForTimeout(1500);
console.log("  رسالة:", (await p.locator("[data-sonner-toast]").allInnerTexts()).join(" | ") || "مافيش");

console.log("\n=== 9) رفض استلام أكتر من الباقي ===");
await p.goto(`${B}/supply`);
await p.waitForTimeout(1000);
const btn = p.getByRole("button", { name: "سجّل استلام" });
if (await btn.count()) {
  await btn.first().click();
  await p.waitForTimeout(700);
  await fieldIn(panel, "اتقبل ودخل المخزن").fill("99999");
  await panel.getByRole("button", { name: "سجّل الاستلام" }).click();
  await p.waitForTimeout(1200);
  console.log("  رسالة:", (await p.locator("[data-sonner-toast]").allInnerTexts()).join(" | ") || "مافيش");
}

console.log("\n=== 10) موبايل ===");
for (const path of ["/supply", "/supply?tab=batches", "/supply/recall/rc-2", "/supply/batch/bt-5"]) {
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(B + path);
  await p.waitForTimeout(900);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`  ${path}: جرجرة ${over}`);
}

console.log("\nأخطاء الكونسول:", errs.length ? errs.slice(0, 5).join(" | ") : "مافيش");
await b.close();
