import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:43127";
const logs = [];
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 1200 }, deviceScaleFactor: 2 });
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

const cardOf = (code) => page.locator("main div.bg-card").filter({ hasText: code }).last();
const panel = () => page.locator("div.fixed.inset-0.z-50");
const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
};
const body = () => page.locator("body").innerText();
const main = () => page.locator("main").innerText();

const b0 = await ledger();
console.log("مرتجعات:", b0.returns.length, "· أوامر إصلاح:", b0.repairs.length);
console.log("حالات لها مشكلة مكتوبة:", b0.returns.filter((r) => r.problem).length);

/* ١) الفحص بيرفض «تالف» بدون مشكلة */
await go("/returns");
const open = b0.returns.find((r) => r.status === "open");
console.log("\n— الفحص —");
console.log("حالة مفتوحة:", open?.code);
let card = cardOf(open.code);
await card.getByRole("button", { name: "افحص" }).first().click();
await page.waitForTimeout(400);
const ip = panel();
await ip.locator("select").first().selectOption("defective");
await page.waitForTimeout(200);
await ip.locator("select").nth(1).selectOption("");
await page.getByRole("button", { name: "سجّل الفحص" }).click();
await page.waitForTimeout(600);
console.log("رفض التالف بدون مشكلة:", (await body()).includes("اختار المشكلة إيه"));

/* المشكلة والمصدر والجذر */
await ip.locator("select").nth(1).selectOption("sewing");
await ip.locator("select").nth(2).selectOption("worker");
await ip.locator("select").nth(3).selectOption("training");
await ip.locator("select").nth(4).selectOption({ index: 2 });
await ip.locator("select").nth(5).selectOption({ index: 1 });
await page.getByRole("button", { name: "سجّل الفحص" }).click();
await page.waitForTimeout(700);
const b1 = await ledger();
const r1 = b1.returns.find((x) => x.id === open.id);
console.log("اتفحص:", r1.status, "· مشكلة:", r1.problem, "· مصدر:", r1.origin, "· جذر:", r1.rootCause);
console.log("العامل والعملية اتسجّلوا:", !!r1.workerId, !!r1.operationId);

/* ٢) بنود التكلفة */
await go("/returns");
card = cardOf(r1.code);
await card.getByRole("button", { name: /التكلفة والإثبات/ }).first().click();
await page.waitForTimeout(400);
const cp = panel();
await cp.locator("select").first().selectOption("shipping_in");
await cp.locator("input").nth(0).fill("400");
await cp.locator("input").nth(1).fill("شحن من المنصورة");
await page.getByRole("button", { name: "ضيف البند" }).click();
await page.waitForTimeout(500);
await cp.locator("select").first().selectOption("inspection");
await cp.locator("input").nth(0).fill("150");
await page.getByRole("button", { name: "ضيف البند" }).click();
await page.waitForTimeout(500);
const b2 = await ledger();
const r2 = b2.returns.find((x) => x.id === open.id);
console.log("\n— التكلفة —");
console.log("بنود:", r2.costs.map((c) => `${c.kind}:${c.amount}`).join(" · "));
console.log("المجموع المعروض:", (await cp.innerText()).split("\n").slice(0, 4).join(" | "));

/* ٣) أمر إصلاح: الخامة بتخرج من المخزن */
const stockBefore = b2.stockMovements.length;
await cp.getByRole("button", { name: /افتح أمر إصلاح/ }).first().click();
await page.waitForTimeout(500);
const rp = panel().last();
await rp.locator("input").nth(0).fill("4");
await rp.locator("input").nth(1).fill("9");
await rp.locator("select").nth(0).selectOption({ index: 1 });
await rp.locator("select").nth(1).selectOption({ index: 2 });
await rp.locator("select").nth(2).selectOption({ label: "أزرار" });
await rp.locator("input").nth(2).fill("20");
await page.getByRole("button", { name: "افتح الأمر" }).click();
await page.waitForTimeout(800);
const b3 = await ledger();
const rep = b3.repairs.find((x) => x.returnId === open.id);
console.log("\n— أمر الإصلاح —");
console.log("اتفتح:", rep?.code, "· كمية:", rep?.qty, "· أجر:", rep?.rate, "· حالة:", rep?.status);
const issued = b3.stockMovements.filter((m) => m.refType === "repair");
console.log("حركات مخزون للإصلاح:", b3.stockMovements.length - stockBefore, "·", issued.map((m) => `${m.kind} ${m.qty}`).join(" "));

/* البند المشتق بقى مقفول */
await go("/returns");
card = cardOf(r1.code);
await card.getByRole("button", { name: /التكلفة والإثبات/ }).first().click();
await page.waitForTimeout(400);
const kinds = await panel().locator("select").first().locator("option").evaluateAll((els) =>
  els.filter((e) => e.disabled).map((e) => e.textContent.trim()),
);
console.log("بنود مقفولة بعد أمر الإصلاح:", kinds.join(" | ") || "مافيش");
const costText = await panel().innerText();
console.log("سطر جاي من أمر الإصلاح:", costText.includes("من أمر الإصلاح"));
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

/* ٤) دورة الإصلاح */
await go("/repairs");
console.log("\n— شاشة الإصلاح —");
console.log((await main()).split("\n").filter((x) => x.trim()).slice(0, 14).join("\n"));
let rc = cardOf(rep.code);
await rc.getByRole("button", { name: "ابدأ" }).first().click();
await page.waitForTimeout(600);
rc = cardOf(rep.code);
await rc.getByRole("button", { name: "خلّصت" }).first().click();
await page.waitForTimeout(600);
rc = cardOf(rep.code);
await rc.getByRole("button", { name: "سجّل الفحص" }).first().click();
await page.waitForTimeout(400);
const qp = panel();
await qp.locator("input").nth(0).fill("3");
await qp.locator("input").nth(1).fill("2");
await qp.getByRole("button", { name: "سجّل الفحص" }).click();
await page.waitForTimeout(600);
console.log("رفض مجموع غلط:", (await body()).includes("لازم يجمعوا نفس الرقم"));
await qp.locator("input").nth(1).fill("1");
await qp.getByRole("button", { name: "سجّل الفحص" }).click();
await page.waitForTimeout(600);
console.log("رفض ساقطة بدون سبب:", (await body()).includes("لازم يتكتب ليه"));
await qp.locator("textarea").first().fill("الدرزة فتحت تاني في قطعة");
await qp.getByRole("button", { name: "سجّل الفحص" }).click();
await page.waitForTimeout(800);

const b4 = await ledger();
const rep2 = b4.repairs.find((x) => x.id === rep.id);
console.log("بعد الفحص:", rep2.status, "· عدّت:", rep2.qtyPassed, "· سقطت:", rep2.qtyFailed, "· دقايق:", rep2.minutes);
const inMv = b4.stockMovements.filter((m) => m.refType === "repair" && m.kind === "return");
console.log("دخلت المخزون:", inMv.map((m) => `${m.qty} قطعة بتكلفة ${m.unitCost}`).join(" · "));

await go("/repairs");
rc = cardOf(rep.code);
const worth = await rc.innerText();
console.log("سطر «الإصلاح يستاهل؟»:", worth.split("\n").find((l) => l.includes("إصلاح القطعة")) ?? "مش ظاهر");
await rc.getByRole("button", { name: /رجّعها للعميل/ }).first().click();
await page.waitForTimeout(800);
const b5 = await ledger();
const outMv = b5.stockMovements.filter((m) => m.refType === "repair" && m.kind === "delivery");
console.log("خرجت للعميل:", outMv.map((m) => m.qty).join(" · "), "· الحالة:", b5.repairs.find((x) => x.id === rep.id).status);

/* ٥) مركز الجودة */
for (const t of ["center", "problems", "causes", "lines", "suppliers", "cost"]) {
  await go("/quality");
  const labels = { center: "مركز الجودة", problems: "المشاكل", causes: "الجذور والمصادر", lines: "الخطوط والعمال", suppliers: "المورّدين", cost: "تكلفة الجودة" };
  await page.getByRole("button", { name: labels[t], exact: true }).first().click();
  await page.waitForTimeout(500);
  console.log(`\n— ${labels[t]} —`);
  console.log((await main()).split("\n").filter((x) => x.trim()).slice(t === "center" ? 12 : 12, t === "center" ? 30 : 32).join("\n"));
}

/* ٦) جودة العامل بصلاحية */
await go("/quality");
await page.getByRole("button", { name: "الخطوط والعمال", exact: true }).first().click();
await page.waitForTimeout(400);
console.log("\nصاحب المصنع بيشوف جودة العمال:", (await main()).includes("قياس مش تقييم"));

/* ٧) عرض ٣٩٠ */
await page.setViewportSize({ width: 390, height: 860 });
for (const p of ["/quality", "/repairs", "/returns"]) {
  await go(p);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`جرجرة أفقية في ${p}:`, over);
}

console.log("\nأخطاء الكونسول:", logs.length ? logs.join("\n") : "مافيش");
await browser.close();
