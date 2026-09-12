import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:43127";
const logs = [];
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("console", (m) => m.type() === "error" && logs.push(`[error] ${m.text()}`));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.waitForTimeout(800);

const ledger = () =>
  page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith("factory-ledger.v1:"));
    return JSON.parse(localStorage.getItem(k));
  });

const scan = async (code) => {
  await page.goto(`${BASE}/scan`, { waitUntil: "networkidle" });
  await page.getByRole("textbox").first().fill(code);
  await page.getByRole("button", { name: "جيب" }).click();
  await page.waitForTimeout(400);
};

const before = await ledger();
console.log("حركات مسح قبل:", before.scans.length, "· عمليات باندل:", before.bundleOps.length);

/* ١) باندل خلّص كل المسار: مالهوش يبدأ، والشاشة تقول كده */
await scan("SN-1043-B001");
console.log("\nbn-1 (خلّص المسار):");
console.log("  زر «ابدأ» ظهر:", (await page.getByRole("button", { name: /^ابدأ/ }).count()) > 0);
console.log("  السطر:", (await page.locator("main").innerText()).includes("خلّص كل عمليات المسار"));

/* ٢) باندل عليه عملية شغّالة: اقفلها من شاشة المسح */
await scan("SN-1043-B002");
await page.getByRole("button", { name: /خلّصت/ }).click();
await page.waitForTimeout(500);
const panel = page.locator("div.fixed.inset-0.z-50");
console.log("\nلوحة الإقفال فتحت:", (await panel.count()) > 0);
await page.getByRole("button", { name: "سجّل واقفل" }).click();
await page.waitForTimeout(700);
console.log("توست:", await page.locator("[data-sonner-toast]").first().innerText().catch(() => "—"));

let db = await ledger();
const finishScan = db.scans.find((s) => s.action === "finish" && s.refId === "bn-2" && s.source === "manual");
console.log("حركة مسح «تسليم»:", finishScan ? `${finishScan.qty} قطعة · ${finishScan.note}` : "مفيش");
console.log("تسجيلات دفتر الإنتاج للأمر o2:", db.stageEntries.filter((e) => e.orderId === "o2").length);

/* ٣) وبعد الإقفال، العملية اللي بعدها تبقى متاحة */
await scan("SN-1043-B002");
const startBtn = page.getByRole("button", { name: /^ابدأ/ });
console.log("\nزر «ابدأ» بقى متاح:", (await startBtn.count()) > 0, "·", await startBtn.innerText().catch(() => "—"));
await startBtn.click();
await page.waitForTimeout(600);
db = await ledger();
const started = db.bundleOps.find((o) => o.bundleId === "bn-2" && o.state === "running");
const startScan = db.scans.find((s) => s.action === "start" && s.refId === "bn-2" && s.source === "manual");
console.log("عملية شغّالة اتفتحت:", !!started, started ? `· seq ${started.seq}` : "");
console.log("حركة مسح «بدء»:", startScan ? `${startScan.actorName} · ${startScan.qty} قطعة` : "مفيش");

/* ٤) امسح خامة وسجّل هالك */
await scan("M-001");
await page.getByRole("button", { name: "سجّل حركة مخزن" }).click();
await page.waitForTimeout(400);
await page.locator("div.fixed.inset-0.z-50 select").selectOption({ label: "هالك" });
await page.locator("div.fixed.inset-0.z-50 input").first().fill("5");
await page.getByRole("button", { name: "سجّل الحركة" }).click();
await page.waitForTimeout(700);
console.log("\nتوست:", await page.locator("[data-sonner-toast]").first().innerText().catch(() => "—"));

db = await ledger();
const waste = db.stockMovements.find((m) => m.refType === "scan" && m.kind === "waste");
const matScan = db.scans.find((s) => s.kind === "material" && s.action === "issue");
console.log("حركة مخزن من المسح:", waste ? `${waste.qty} · ${waste.kind}` : "مفيش");
console.log("حركة مسح على الخامة:", matScan ? `${matScan.qty} · ${matScan.note} · من ${matScan.from}` : "مفيش");

/* ٥) السلسلة بقت بتشوف الجديد */
await page.goto(`${BASE}/trace/bundle/bn-2`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
const steps = await page.locator("main ol li").count();
const scanRows = (await page.locator("main").innerText()).split("\n").filter((l) => l.includes("صاحب المصنع")).length;
console.log("\nخطوات السلسلة:", steps, "· سطور مسح على الباندل:", scanRows);
await page.screenshot({ path: "/opt/cursor/artifacts/screenshots/scan_flow_trace.png", fullPage: true });

console.log("\nحركات مسح بعد:", (await ledger()).scans.length);
console.log(`errors: ${logs.length}`);
logs.slice(0, 8).forEach((l) => console.log("  ", l));
await browser.close();
