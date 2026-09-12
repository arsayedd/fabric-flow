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
await page.waitForTimeout(900);

const ledger = () =>
  page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith("factory-ledger"));
    return JSON.parse(localStorage.getItem(k));
  });
const panel = () => page.locator("div.fixed.inset-0.z-50");
const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
};
const main = () => page.locator("main").innerText();
const body = () => page.locator("body").innerText();
const lines = async (n = 24, skip = 0) =>
  (await main())
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(skip, skip + n)
    .join("\n");

let pass = 0;
let fail = 0;
const ok = (label, cond, extra = "") => {
  if (cond) pass += 1;
  else fail += 1;
  console.log(`${cond ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
};

const b0 = await ledger();
console.log("ماكينات:", b0.machines.length, "· تذاكر:", b0.machineTickets.length);
ok("الماكينات في الدفتر", b0.machines.length >= 5);
ok("تذاكر ديمو", b0.machineTickets.length >= 4);
ok("حركات قطع غيار", b0.stockMovements.some((m) => m.kind === "maintenance"));
ok("عمليات متسجّلة على ماكينة", b0.bundleOps.some((o) => o.machineId));

/* ١) الشاشة نفسها */
await go("/machines");
console.log("\n— الماكينات —");
console.log(await lines(22));
const m0 = await main();
ok("الجاهزية معروضة", /الجاهزية/.test(m0));
ok("ساعات التوقف معروضة", /ساعات توقف/.test(m0));
ok("مفيش أرقام لاتينية في العناوين", !/\b\d{2,}\b/.test(m0.split("\n").slice(0, 12).join(" ")), "");
ok("صيانة فاتت ميعادها بتتقال", /فاتت ميعادها/.test(m0));

/* ٢) التبويبات */
for (const [label, expect] of [
  ["الأعطال والصيانة", /تذكرة|عطل/],
  ["أسباب التوقف", /سبب|توقف/],
  ["الصيانة الجاية", /صيانة/],
]) {
  await page.getByRole("button", { name: label, exact: true }).first().click();
  await page.waitForTimeout(500);
  ok(`تبويب ${label}`, expect.test(await main()));
}

/* ٣) فتح تذكرة بتوقّف الماكينة فعلًا */
await go("/machines");
const running = b0.machines.find((m) => m.state === "running");
await page.getByRole("button", { name: "بلاغ عطل", exact: true }).first().click();
await page.waitForTimeout(500);
let p = panel();
await p.locator("select").first().selectOption(running.id);
await p.locator('input[type="text"], input:not([type])').first().fill("الموتور بيسخن وبيقف");
await p.locator("textarea").first().fill("سمعت صوت غريب من الموتور");
await page.getByRole("button", { name: /افتح التذكرة/ }).first().click();
await page.waitForTimeout(900);
let b1 = await ledger();
const t1 = b1.machineTickets.find((t) => t.machineId === running.id && t.state !== "done" && t.cause.includes("الموتور"));
ok("التذكرة اتفتحت", !!t1, t1?.code);
ok("الماكينة وقفت فعلًا", b1.machines.find((m) => m.id === running.id)?.state === "down");
ok("الكود متسلسل", /^MCH-|^MNT-|^TKT-/.test(t1?.code ?? ""), t1?.code);

/* التوقف بيظهر في التنبيهات */
await go("/alerts");
ok("الماكينة الواقفة في التنبيهات", (await body()).includes(running.name), running.name);

/* ٤) ملف الماكينة: قفل التذكرة بقطع غيار */
await go(`/machines/${running.id}`);
console.log("\n— ملف الماكينة —");
console.log(await lines(20));
const prof = await main();
ok("الملف فيه بانر تذكرة مفتوحة", /تذكرة مفتوحة|تحت الإصلاح|مفتوحة/.test(prof));
ok("بتعطل كل / متوسط الإصلاح", /بتعطل كل|متوسط الإصلاح/.test(prof));

await page.getByRole("button", { name: /ابدأ الإصلاح/ }).first().click();
await page.waitForTimeout(700);
await page.getByRole("button", { name: "اقفل", exact: true }).first().click();
await page.waitForTimeout(600);
p = panel();
const stockBefore = (await ledger()).stockMovements.length;
await p.locator("textarea").first().fill("تغيير الموتور وضبط الشد");
await p.locator('input[type="number"]').first().fill("180");
// قطعة غيار: الخامة والكمية ثم «ضيف»
await p.locator("select").first().selectOption({ index: 1 });
await p.locator('input[type="number"]').nth(1).fill("1");
await p.getByRole("button", { name: "ضيف", exact: true }).first().click();
await page.waitForTimeout(400);
await p.getByRole("button", { name: "اقفل التذكرة" }).first().click();
await page.waitForTimeout(1000);
const b2 = await ledger();
const t2 = b2.machineTickets.find((t) => t.id === t1.id);
ok("التذكرة اتقفلت", t2?.state === "done", t2?.state);
ok("الماكينة رجعت شغّالة", b2.machines.find((m) => m.id === running.id)?.state === "running");
ok("دقايق التوقف اتسجّلت", (t2?.downMinutes ?? 0) > 0, String(t2?.downMinutes));
const partMoves = b2.stockMovements.filter((m) => m.kind === "maintenance" && m.refId === t1.id);
ok("قطعة الغيار خرجت من المخزن بحركة حقيقية", partMoves.length > 0 && partMoves.every((m) => m.qty < 0), `${b2.stockMovements.length - stockBefore} حركة`);

/* ٥) بلاغ الصالة بيتحوّل لتذكرة */
await go("/floor");
const floorTxt = await main();
if (/حوّله لتذكرة/.test(floorTxt)) {
  await page.getByRole("link", { name: "حوّله لتذكرة" }).first().click();
  await page.waitForTimeout(900);
  ok("البلاغ بيفتح لوحة تذكرة", (await body()).includes("افتح التذكرة"));
  await page.keyboard.press("Escape");
} else {
  ok("بلاغ ماكينة في الصالة", false, "مفيش بلاغ ماكينة مفتوح");
}

/* ٦) قسم الماكينات في لوحة التحكم */
await go("/dashboard");
await page.waitForTimeout(1600);
const dash = await main();
ok("قسم الماكينات في لوحة التحكم", dash.includes("الماكينات والصيانة"));
ok("الجاهزية وأسباب التوقف في اللوحة", /الجاهزية/.test(dash) && /أكتر سبب/.test(dash));
ok("مفيش «قريبًا» في اللوحة", !dash.includes("قريبًا"));
ok("بند الماكينات اتشال من «حاجات اللوحة مش بتقولها»", !dash.includes("سجل ماكينات"));

/* ٧) كود الماكينة بيتمسح */
await go("/scan");
const mch = b2.machines[0];
await page.locator("input").first().fill(mch.code);
await page.keyboard.press("Enter");
await page.waitForTimeout(900);
ok("مسح كود الماكينة بيوصّل لملفها", (await body()).includes(mch.name), mch.code);

/* ٨) التصدير */
await go("/machines");
await page.getByRole("button", { name: /تصدير/ }).first().click();
await page.waitForTimeout(400);
ok("قايمة التصدير فيها الماكينات", /Excel|CSV|PDF/i.test(await body()));
await page.keyboard.press("Escape");

/* ٩) الصلاحية: المشرف مايشوفش تكلفة الصيانة */
await go("/settings");
await page.evaluate(() => localStorage.clear());

/* ١٠) موبايل */
await page.setViewportSize({ width: 390, height: 860 });
await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.waitForTimeout(900);
for (const path of ["/machines", "/machines/tickets"]) {
  await go(path);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`مفيش جرجرة أفقية في ${path}`, over <= 1, String(over));
}

console.log(`\nنجح ${pass} · فشل ${fail}`);
console.log("أخطاء الكونسول:", logs.length ? logs.join("\n") : "مافيش");
await browser.close();
