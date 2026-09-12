import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:43127";
const logs = [];
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("console", (m) => m.type() === "error" && logs.push(`[error] ${m.text()}`));

const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
};
const main = () => page.locator("main").innerText();
const tab = async (name) => {
  await page.getByRole("button", { name, exact: true }).first().click();
  await page.waitForTimeout(500);
};

let pass = 0;
let fail = 0;
const ok = (label, cond, extra = "") => {
  if (cond) pass += 1;
  else fail += 1;
  console.log(`${cond ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
};

const login = async (role) => {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: role }).first().click();
  await page.waitForTimeout(900);
};

await login(/صاحب المصنع/);

/* ١) الشاشة في القائمة وبتفتح */
await go("/");
const nav = await page.locator("aside, nav").first().innerText();
ok("«المالية» في القائمة", nav.includes("المالية"));
await page.getByRole("button", { name: "المالية", exact: true }).first().click();
await page.waitForTimeout(400);
const opened = await page.locator("aside, nav").first().innerText();
ok("عنصر الفلوس الجاية والرايحة في القسم", opened.includes("الفلوس الجاية والرايحة"));

await go("/cashflow");
let t = await main();
ok("الشاشة بتفتح بعنوانها", t.includes("الفلوس الجاية والرايحة"));
ok("خط المسار مش بيكرّر نفسه", !/المالية\s*\/\s*المالية/.test(await page.locator("body").innerText()));
ok("التابات الأربعة موجودة", ["توقع الخزنة", "أعمار المستحقات", "سلوك الدفع", "اللي علينا"].every((x) => t.includes(x)));

/* ٢) توقع الخزنة */
ok("بيقول اللي في الخزنة دلوقتي", t.includes("في الخزنة دلوقتي"));
ok("بيقول الداخل والخارج", t.includes("داخل في") && t.includes("خارج في"));
ok("بيقول أقل رصيد في المدة", t.includes("أقل رصيد في المدة"));
ok("المتأخر مكتوب إنه مش محسوب داخل", t.includes("مش محسوبة داخلة"), "");

const horizons = await page.locator("main button").filter({ hasText: "يوم" }).allInnerTexts();
ok("فيه تبديل مدى (٧/٣٠/٩٠)", horizons.length >= 3, horizons.slice(0, 3).join(" · "));
await tab("٩٠ يوم");
const t90 = await main();
ok("تبديل المدى بيغيّر الأرقام", t90 !== t && t90.includes("٩٠ يوم"));

/* ٣) أعمار المستحقات */
await go("/cashflow");
await tab("أعمار المستحقات");
t = await main();
ok(
  "الخمس فئات ظاهرة",
  ["لسه ماستحقّش", "متأخر ١–٣٠ يوم", "متأخر ٣١–٦٠ يوم", "متأخر ٦١–٩٠ يوم", "متأخر أكتر من ٩٠ يوم"].every((x) =>
    t.includes(x),
  ),
);
ok("متوسط أيام التحصيل محسوب", t.includes("متوسط أيام التحصيل"));
ok("الـDSO مكتوب بمعناه مش باسمه", t.includes("المستحق يعادل كام يوم توريد") && t.includes("DSO"));
ok("نسبة التحصيل ظاهرة", t.includes("نسبة التحصيل"));

/* الفئة بتتفتح وتعرض السجلات */
const before = t.length;
await page.getByRole("button", { name: /متأخر ١–٣٠ يوم/ }).first().click();
await page.waitForTimeout(400);
const openedBucket = await main();
ok("الفئة بتتفتح وتعرض توريداتها", openedBucket.length !== before);

/* ٤) سلوك الدفع */
await go("/cashflow");
await tab("سلوك الدفع");
t = await main();
ok("أحسن وأسوأ دافعين", t.includes("أحسن دافعين") && t.includes("أسوأ دافعين"));
ok("الجدول فيه أعمدة السلوك", ["بيدفع بعد", "تأخيره", "في الميعاد", "متأخر عليه"].every((x) => t.includes(x)));
ok("العيّنة الصغيرة مكتوبة «لسه بدري» مش صفر", t.includes("لسه بدري"));
ok("حد العيّنة مكتوب في الشاشة", /أقل من\s*٣\s*توريدات/.test(t), "");

/* ٥) اللي علينا */
await go("/cashflow");
await tab("اللي علينا");
t = await main();
ok("التلات مصادر ظاهرة", ["فواتير موردين", "أجور عمال مستحقة", "مستحقات ورش"].every((x) => t.includes(x)));
ok("التبويب بالعمر مكتوب سببه", t.includes("بعمرها") && t.includes("مهلة"));
ok("الفاتورة اللي مورّدها مالوش مهلة مكتوبة بصراحة", t.includes("مالوش مهلة مكتوبة"));

/* ٦) الأرقام هي نفسها في «اسأل صنعة» */
await go("/ai");
const chips = await page.locator("main button").filter({ hasText: "؟" }).allInnerTexts();
ok("أسئلة الفلوس اتضافت", chips.some((c) => c.includes("هتضيق")) && chips.some((c) => c.includes("بيدفع في الميعاد")));
for (const q of chips.filter((c) => c.includes("هتضيق") || c.includes("أعماره") || c.includes("بيدفع في الميعاد"))) {
  await go("/ai");
  await page.getByRole("button", { name: q, exact: true }).first().click();
  await page.waitForTimeout(500);
  const a = await main();
  ok(`«${q}» بيتجاوب بمصدره`, !a.includes("مش فاهم السؤال") && a.includes("الرقم ده جه منين"));
}

/* ٧) نفس رقم الخزنة في الشاشتين */
// المقارنة على الأرقام العربية بس: الشاشة بتكتب «ج.م.» وعلامات اتجاه،
// والجواب بيكتب «ج» — والاتنين نفس الرقم.
const digitsAfter = (text, label) => {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l.includes(label));
  const found = lines.slice(i + 1, i + 3).find((l) => /[٠-٩]/.test(l));
  return (found ?? "").replace(/[^٠-٩]/g, "");
};
await go("/cashflow");
const opening = digitsAfter(await main(), "في الخزنة دلوقتي");
await go("/ai");
await page.getByRole("button", { name: /الخزنة هتضيق/ }).first().click();
await page.waitForTimeout(500);
const ans = await main();
ok("رقم الخزنة واحد في الشاشة والجواب", !!opening && digitsAfter(ans, "في الخزنة دلوقتي") === opening, opening);

/* ٨) القاعدتين الجداد في قواعد التنبيه، والتعديل بيتحفظ */
await go("/ai/rules");
t = await main();
ok("قاعدة مدى التوقع موجودة", t.includes("توقع الخزنة بيدوّر على ضيق جوه"));
ok("قاعدة لون الضيق موجودة", t.includes("ضيق الخزنة يبقى أحمر لو جاي جوه"));

/* ٩) الداتا التجريبية خزنتها مكفّية، فالتنبيه مش مفروض يظهر */
await go("/alerts");
const calm = await main();
ok("مفيش تنبيه ضيق وهو مش موجود", !calm.includes("الخزنة هتضيق"));

/*
 * ١٠) ولما يبقى موجود فعلًا: بنزوّد فاتورة مورّد كبيرة مالهاش دفعات على
 * الدفتر نفسه (نفس اللي بيحصل لما المصنع يسجّلها من الشاشة)، ونشوف
 * الرقم بيمشي لحد التنبيه.
 */
await go("/cashflow");
const key = await page.evaluate(() => Object.keys(localStorage).find((k) => k.startsWith("factory-ledger")));
await page.evaluate((k) => {
  const db = JSON.parse(localStorage.getItem(k));
  const today = new Date().toISOString().slice(0, 10);
  db.costEntries.push({
    id: "probe-huge",
    factoryId: db.factory.id,
    costItemId: db.costItems[0].id,
    date: today,
    vendor: "مورّد اختبار",
    quantity: null,
    amount: 3_000_000,
    notes: "اختبار",
    partyId: null,
  });
  localStorage.setItem(k, JSON.stringify(db));
}, key);
await go("/cashflow");
t = await main();
ok("الشاشة بتقول الخزنة هتضيق بتاريخه", t.includes("الخزنة هتضيق") && /يوم\s*\d|يوم\s*[١-٩]/.test(t));
ok("والرصيد بيبان تحت الصفر", t.includes("تحت الصفر") || t.includes("-") || t.includes("−"));
await go("/alerts");
const alerts = await main();
ok("والتنبيه بيظهر في «محتاج اهتمامك»", alerts.includes("الخزنة هتضيق"));
ok("التنبيه بيقول يعمل إيه", alerts.includes("أجّل دفعة مورّد") || alerts.includes("حصّل المتأخر"));
await go("/ai");
await page.getByRole("button", { name: /الخزنة هتضيق/ }).first().click();
await page.waitForTimeout(500);
ok("والجواب في «اسأل صنعة» بيقول أيوه", (await main()).includes("أيوه — يوم"));

/* ١٠) التصدير */
await go("/exports");
const ex = await main();
ok(
  "القوايم الجديدة في مركز التصدير",
  ["أعمار المستحقات على العملاء", "سلوك دفع العملاء", "توقع الخزنة", "أعمار فواتير الموردين"].every((x) =>
    ex.includes(x),
  ),
);

/* ١١) المشرف مايشوفش الشاشة */
await login(/مشرف/);
await go("/cashflow");
const sup = await page.locator("body").innerText();
ok("المشرف مايوصلش لشاشة الفلوس", !sup.includes("أقل رصيد في المدة"));

/* ١٢) الموبايل */
await login(/صاحب المصنع/);
await page.setViewportSize({ width: 390, height: 844 });
for (const p of ["/cashflow"]) {
  await go(p);
  for (const name of ["أعمار المستحقات", "سلوك الدفع", "اللي علينا"]) {
    await tab(name);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`مفيش جرجرة أفقية في ${p} · ${name}`, over <= 1, String(over));
  }
}

console.log(`\nنجح ${pass} · فشل ${fail}`);
console.log("أخطاء الكونسول:", logs.length ? logs.join("\n") : "مافيش");
await browser.close();
