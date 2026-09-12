/**
 * المساحة التجريبية وصحة النظام.
 *
 * بيتأكد إن: الشريط التجريبي بيبان في المساحة التجريبية وبيختفي في مصنع
 * حقيقي، وإن زرار رجوع الداتا مابيظهرش على مصنع حقيقي، وإن فحوص السلامة
 * كلها سليمة على الداتا التجريبية، وإن الفحص بيكشف كسر فعلًا لما نكسر
 * سجل بإيدينا — فحص بيقول «تمام» على أي حال مش فحص.
 */
import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:43127";
const logs = [];
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1400, height: 1300 } });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("console", (m) => m.type() === "error" && logs.push(`[error] ${m.text()}`));

let pass = 0;
let fail = 0;
const ok = (label, cond, extra = "") => {
  if (cond) pass += 1;
  else fail += 1;
  console.log(`${cond ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
};
const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
};
const body = () => page.locator("body").innerText();
const main = () => page.locator("main").innerText();

/* ── المساحة التجريبية ─────────────────────────────────────────── */
await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.waitForTimeout(1200);

await go("/");
let t = await body();
ok("الشريط التجريبي بيبان", t.includes("مساحة تجريبية"), "");
ok("وبيقول إن الأرقام مش حقيقية", t.includes("مش أرقام مصنع حقيقي"), "");
await go("/orders");
ok("والشريط بيفضل على كل شاشة", (await body()).includes("مساحة تجريبية"));

await go("/settings");
ok("زرار رجوع الداتا موجود في المساحة التجريبية", (await main()).includes("رجّع الداتا التجريبية"));

/* ── صحة النظام على الداتا التجريبية ──────────────────────────── */
await go("/health");
t = await main();
ok("شاشة صحة النظام بتفتح", t.includes("صحة النظام"));
ok("بتقول عدد سجلات الدفتر", t.includes("سجلات الدفتر"));
ok("بتقول كام فحص فيه مشكلة", t.includes("فحوص فيها مشكلة"));
ok("بتقول الأقسام المبنية", /أقسام مبنية/.test(t));
ok("التمانتاشر قسم كلهم مبنيين", !t.includes("مش مبني"), "");
const brokenBadges = await page.locator("main").evaluate((el) => {
  const cards = [...el.querySelectorAll("section")].find((s) => s.textContent?.includes("فحوص السلامة"));
  return [...(cards?.querySelectorAll("div") ?? [])]
    .map((d) => d.textContent ?? "")
    .filter((x) => /سجل$/.test(x.trim())).length;
});
ok("كل الفحوص طلعت سليمة", brokenBadges === 0, `${brokenBadges} فحص فيه سجلات`);
ok("فحص العزل بين المصانع موجود ونتيجته سليمة", t.includes("سجلات من مصنع تاني"), "");

/* ── الفحص بيكشف كسر حقيقي ────────────────────────────────────── */
const key = await page.evaluate(() => Object.keys(localStorage).find((k) => k.startsWith("factory-ledger")));
await page.evaluate((k) => {
  const db = JSON.parse(localStorage.getItem(k));
  /* توريد بعميل مش موجود + كود أمر مكرر: كسرين مختلفين في نفس الوقت */
  db.deliveries.push({
    id: "probe-orphan",
    factoryId: db.factory.id,
    clientId: "ماحدش",
    date: db.deliveries[0].date,
    dueDate: db.deliveries[0].dueDate,
    amount: 5000,
    model: "توريد اختبار",
    quantity: 10,
    notes: "",
  });
  db.orders.push({ ...db.orders[0], id: "probe-dup" });
  localStorage.setItem(k, JSON.stringify(db));
}, key);
await go("/health");
t = await main();
ok("الفحص كشف التوريد المعلّق", t.includes("توريدات بعميل مامسحيّاش") && t.includes("توريد اختبار"), "");
ok("والفحص كشف الكود المكرر", t.includes("أكواد مكررة"), "");
const failedCount = t.match(/فحوص فيها مشكلة\s+([٠-٩]+)/)?.[1] ?? "٠";
ok("عدد الفحوص المكسورة بقى أكبر من صفر", failedCount !== "٠", failedCount);

/* ── مساحة حقيقية: مافيش شريط، ولا زرار رجوع، والرجوع نفسه بيرفض ── */
await page.evaluate((k) => {
  const db = JSON.parse(localStorage.getItem(k));
  db.factory.demo = false;
  localStorage.setItem(k, JSON.stringify(db));
}, key);
await go("/orders");
ok("الشريط التجريبي بيختفي في مساحة حقيقية", !(await body()).includes("مساحة تجريبية"));
await go("/settings");
ok("وزرار رجوع الداتا مابيبانش", !(await main()).includes("رجّع الداتا التجريبية"));

console.log(`\nنجح ${pass} · فشل ${fail}`);
console.log("أخطاء الكونسول: " + (logs.length ? logs.slice(0, 5).join(" | ") : "مافيش"));
await browser.close();
process.exit(fail || logs.length ? 1 : 0);
