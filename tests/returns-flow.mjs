import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:43127";
const logs = [];
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 1100 }, deviceScaleFactor: 2 });
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

/* الكارت نفسه: div.bg-card اللي جواه كود المرتجع — مش أي حاوية بتحتويه */
const cardOf = (code) => page.locator("main div.bg-card").filter({ hasText: code }).last();

const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
};

const b0 = await ledger();
console.log("مرتجعات مبذورة:", b0.returns.length, "· شكاوى:", b0.complaints.length);
console.log("حركات مخزون:", b0.stockMovements.length);

await go("/returns");
const head = await page.locator("main").innerText();
console.log("\n— كروت الملخص —");
for (const line of head.split("\n").slice(0, 18)) if (line.trim()) console.log("  ", line);

/* ١) مرتجع جديد: التحقق من سقف كمية التوريد */
await page.getByRole("button", { name: "مرتجع جديد" }).click();
await page.waitForTimeout(400);
const panel = page.locator("div.fixed.inset-0.z-50");
await panel.locator("select").first().selectOption("customer");
const selects = panel.locator("select");
await selects.nth(1).selectOption({ label: "شركة الأناقة للتجارة" });
await page.waitForTimeout(300);
// التوريد d4: قميص قطني 120 قطعة، ورجع منه 8 في المرتجع المبذور
const delSel = panel.locator("select").nth(2);
const opts = await delSel.locator("option").allInnerTexts();
console.log("\nتوريدات العميل:", opts.map((x) => x.trim()).join(" | "));
await delSel.selectOption({ index: 1 });
await page.waitForTimeout(200);
const fieldIn = (label) => panel.locator("label").filter({ hasText: label }).first().locator("input");
const unitPrefilled = await fieldIn("قيمة الوحدة").inputValue();
console.log("قيمة الوحدة اتعبّت لوحدها:", unitPrefilled);

await panel.locator("label").filter({ hasText: "المنتج الراجع" }).first().locator("select").selectOption({ label: "قميص قطني" });
await fieldIn("الكمية").fill("200");
await page.getByRole("button", { name: "سجّل المرتجع" }).click();
await page.waitForTimeout(600);
console.log("رفض الكمية الزايدة:", (await page.locator("body").innerText()).includes("الباقي"));

/* الكمية الصح */
await fieldIn("الكمية").fill("5");
await fieldIn("تفاصيل السبب").fill("الزراير ناقصة");
await page.getByRole("button", { name: "سجّل المرتجع" }).click();
await page.waitForTimeout(700);
const b1 = await ledger();
const fresh = b1.returns.find((r) => r.reasonNote === "الزراير ناقصة");
console.log("\nاتسجّل:", fresh?.code, "· الموقف:", fresh?.status, "· الأثر لسه صفر:", fresh?.settleAmount === 0);

/* ٢) القرار قبل الفحص ممنوع */
await go("/returns");
const card = cardOf(fresh.code);
console.log("كروت الكود:", await card.count());
console.log("زر «خُد قرار» ظهر قبل الفحص:", (await card.getByRole("button", { name: "خُد قرار" }).count()) > 0);
console.log("زر «افحص» ظهر:", (await card.getByRole("button", { name: "افحص" }).count()) > 0);

/* ٣) الفحص: سليم */
await card.getByRole("button", { name: "افحص" }).first().click();
await page.waitForTimeout(400);
await page.locator("div.fixed.inset-0.z-50").locator("select").first().selectOption("good");
await page.getByRole("button", { name: "سجّل الفحص" }).click();
await page.waitForTimeout(700);
const b2 = await ledger();
console.log("بعد الفحص:", b2.returns.find((r) => r.id === fresh.id)?.status);

/* ٤) القرار: إشعار خصم + رجوع المخزن */
await go("/returns");
const card2 = cardOf(fresh.code);
await card2.getByRole("button", { name: "خُد قرار" }).first().click();
await page.waitForTimeout(400);
const sp = page.locator("div.fixed.inset-0.z-50");
await sp.locator("select").first().selectOption("credit");
await page.waitForTimeout(200);
const amountField = await sp.locator("input").first().inputValue();
console.log("مبلغ الخصم المقترح:", amountField);
await page.getByRole("button", { name: "سجّل القرار" }).click();
await page.waitForTimeout(800);

const b3 = await ledger();
const done = b3.returns.find((r) => r.id === fresh.id);
console.log("\n— بعد القرار —");
console.log("  الموقف:", done.status, "· القرار:", done.resolution, "· المبلغ:", done.settleAmount);
console.log("  رجع المخزن:", done.restock);
const mv = b3.stockMovements.filter((m) => m.refType === "return");
console.log("  حركات مخزون مرتجع:", mv.length, mv.map((m) => `${m.qty}@${m.unitCost}`).join(" "));

/* ٥) الأثر على مديونية العميل */
await go("/collections");
const coll = await page.locator("main").innerText();
console.log("\nشاشة التحصيل فيها المديونية:", coll.split("\n").slice(0, 6).join(" | "));

await go(`/parties/${done.partyId}`);
const prof = await page.locator("main").innerText();
console.log("كشف الحساب فيه إشعار الخصم:", prof.includes("إشعار خصم"));
const tabs = await page.locator("main button").allInnerTexts();
console.log("تابات البروفايل:", tabs.map((t) => t.trim()).filter(Boolean).join(" | "));
const stTab = page.getByRole("button", { name: /كشف الحساب/ }).first();
if (await stTab.count()) {
  await stTab.click();
  await page.waitForTimeout(500);
  const st = await page.locator("main").innerText();
  console.log("بعد فتح تاب كشف الحساب — إشعار خصم:", st.includes("إشعار خصم"));
}

/* ٦) القرار مرة تانية ممنوع، والإلغاء بعد التسوية ممنوع */
await go("/returns");
const card3 = cardOf(fresh.code);
console.log("زر القرار اختفى بعد التسوية:", (await card3.getByRole("button", { name: "خُد قرار" }).count()) === 0);
console.log("زر الإلغاء اختفى بعد التسوية:", (await card3.getByRole("button", { name: "إلغاء" }).count()) === 0);

/* ٧) التحليل */
await go("/returns?tab=models");
console.log("\n— تحليل الموديلات —");
console.log((await page.locator("main").innerText()).split("\n").filter((x) => x.trim()).slice(4, 16).join("\n"));

await go("/returns?tab=reasons");
console.log("\n— باريتو الأسباب —");
console.log((await page.locator("main").innerText()).split("\n").filter((x) => x.trim()).slice(2, 18).join("\n"));

await go("/returns?tab=complaints");
console.log("\n— الشكاوى —");
console.log((await page.locator("main").innerText()).split("\n").filter((x) => x.trim()).slice(1, 14).join("\n"));

/* ٨) الاستنتاجات */
await go("/insights");
console.log("\n— استنتاجات صنعة —");
console.log((await page.locator("main").innerText()));

console.log("\nأخطاء الكونسول:", logs.length ? logs.join("\n") : "مافيش");
await browser.close();
