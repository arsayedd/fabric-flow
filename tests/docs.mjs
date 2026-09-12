import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:43127";
let pass = 0;
let fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log("✓", name);
  } else {
    fail++;
    console.log("✗", name, extra);
  }
};

const b = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

async function demo(role = "owner") {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE);
  await page.waitForTimeout(400);
  await page.evaluate(async (r) => {
    // نفس زر «جرّب بالبيانات الجاهزة» بالدور المطلوب، بلا تنقّل في الصفحة
    const btns = [...document.querySelectorAll("button")];
    const map = { owner: "صاحب المصنع", accountant: "محاسب", supervisor: "مشرف" };
    const btn = btns.find((b) => b.textContent.includes(map[r]));
    btn.click();
  }, role);
  await page.waitForTimeout(1500);
}

await demo();

/* ── ١) مركز التصدير ──────────────────────────────────────────── */

await page.goto(`${BASE}/exports`);
await page.waitForTimeout(700);
const body = await page.locator("body").innerText();
ok("مركز التصدير بيفتح", body.includes("مركز التصدير والطباعة"));

const cards = await page.locator("section h3").count();
ok("الجداول مقسّمة بمناطق", cards >= 5, `${cards}`);

const tables = await page.getByRole("button", { name: "معاينة" }).count();
ok("كل جدول له معاينة", tables >= 20, `${tables}`);

const registry = await page.evaluate(async () => {
  const { DATASETS } = await import("/src/store/datasets.ts");
  return DATASETS.length;
});
ok("السجل فيه كل القوائم", registry >= 26, `${registry}`);

await page.getByRole("button", { name: "معاينة" }).first().click();
await page.waitForTimeout(400);
ok("المعاينة بتعرض جدول", (await page.locator("table thead th").count()) > 3);
await page.getByRole("button", { name: "إغلاق", exact: true }).last().click();
await page.waitForTimeout(300);

/* ── ٢) تنزيل Excel و CSV ─────────────────────────────────────── */

for (const [label, ext] of [
  ["ملف Excel", "xlsx"],
  ["ملف CSV", "csv"],
]) {
  await page.getByRole("button", { name: "تصدير" }).first().click();
  await page.waitForTimeout(300);
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 8000 }).catch(() => null),
    page.getByRole("menuitem", { name: new RegExp(label) }).first().click(),
  ]);
  ok(`${label} بينزل`, !!dl && dl.suggestedFilename().endsWith(ext), dl ? dl.suggestedFilename() : "مفيش تنزيل");
  await page.waitForTimeout(300);
}

/* ── ٣) الطباعة ───────────────────────────────────────────────── */

await page.getByRole("button", { name: "تصدير" }).first().click();
await page.waitForTimeout(300);
await page.getByRole("menuitem", { name: /طباعة ومعاينة/ }).click();
await page.waitForTimeout(600);
ok("المعاينة جوه print-root", (await page.locator(".print-root").count()) === 1);
ok("الورقة بمقاس A4", (await page.locator(".print-root .sheet-a4").count()) === 1);
ok("شريط الأدوات مخفي في الطباعة", (await page.locator(".print-root .print-hide").count()) === 1);
await page.getByRole("button", { name: "A5" }).click();
await page.waitForTimeout(300);
ok("تغيير المقاس بيغيّر الورقة", (await page.locator(".print-root .sheet-a5").count()) === 1);
const rule = await page.evaluate(() => {
  const el = document.getElementById("sanaa-page-size");
  return el ? el.textContent : null;
});
ok("مقاس @page مابيتحقنش قبل الطباعة", rule === null);
await page.getByRole("button", { name: "إغلاق المعاينة" }).click();
await page.waitForTimeout(300);

/* ── ٤) إصدار مستند من أمر إنتاج ──────────────────────────────── */

await page.goto(`${BASE}/orders`);
await page.waitForTimeout(600);
ok("زر التصدير في شاشة الأوامر", (await page.getByRole("button", { name: "تصدير" }).count()) === 1);
await page.locator("a[href^='/orders/']").first().click();
await page.waitForTimeout(700);

await page.getByRole("button", { name: "أمر تشغيل" }).click();
await page.waitForTimeout(700);
const title = await page.locator(".print-root").first().innerText();
const number = (title.match(/SO-\d{4}-\d{6}/) || [])[0];
ok("المستند أخد رقم", !!number, title.slice(0, 80));
ok("الورقة فيها QR", (await page.locator(".print-root svg path").count()) >= 1);
ok("الورقة فيها خانة توقيع", title.includes("توقيع"));
await page.getByRole("button", { name: "إغلاق المعاينة" }).click();
await page.waitForTimeout(300);

// طبع تاني = نفس الرقم
await page.getByRole("button", { name: "أمر تشغيل" }).click();
await page.waitForTimeout(600);
const again = await page.locator(".print-root").first().innerText();
ok("طبع تاني بنفس الرقم", again.includes(number), (again.match(/SO-[\d-]+/) || [])[0]);
await page.getByRole("button", { name: "إغلاق المعاينة" }).click();
await page.waitForTimeout(300);

// إذن صرف على أمر مالوش قائمة مواد بيرفض بسبب، ومايحجزش رقم
await page.getByRole("button", { name: "إذن صرف خامات" }).click();
await page.waitForTimeout(600);
const issueText = await page.locator(".print-root").first().innerText();
ok("إذن الصرف يا بياخد رقم يا بيقول السبب", /MI-\d{4}/.test(issueText) || issueText.includes("قائمة مواد"), issueText.slice(0, 60));
await page.getByRole("button", { name: "إغلاق المعاينة" }).click();
await page.waitForTimeout(300);

/* ── ٥) دفتر المستندات ───────────────────────────────────────── */

await page.goto(`${BASE}/documents`);
await page.waitForTimeout(700);
const ledger = await page.locator("body").innerText();
ok("الدفتر بيعرض المستند", ledger.includes(number), number);
ok("الحالة مكتوبة", /مُصدَر|بانتظار موافقة/.test(ledger));

await page.getByRole("button", { name: "أنواع المستندات" }).click();
await page.waitForTimeout(400);
const types = await page.locator("body").innerText();
ok("كل الأنواع معروضة", types.includes("إذن تسليم") && types.includes("كشف حساب") && types.includes("مفردات راتب"));

await page.getByRole("button", { name: "قواعد الترقيم" }).click();
await page.waitForTimeout(400);
ok("قواعد الترقيم قابلة للتعديل", (await page.locator("input[type='number']").count()) >= 10);
const locked = await page
  .locator("body")
  .innerText()
  .then((t) => t.includes("الأرقام اللي في إيد الناس مالهاش رجعة"));
ok("بداية المسلسل بتتقفل بعد أول إصدار", locked);

await page.getByRole("button", { name: "ترويسة المصنع" }).click();
await page.waitForTimeout(400);
ok("الترويسة فيها الرقم الضريبي والشروط", (await page.locator("body").innerText()).includes("الرقم الضريبي"));

/* ── ٦) الإلغاء والتحقق ──────────────────────────────────────── */

await page.getByRole("button", { name: "الدفتر" }).click();
await page.waitForTimeout(400);

// التحقق قبل الإلغاء: أصلي
const stamp = await page.evaluate((num) => {
  const key = Object.keys(localStorage).find((k) => k.startsWith("factory-ledger.v1:"));
  const db = JSON.parse(localStorage.getItem(key));
  const d = db.documents.find((x) => x.number === num);
  return d ? d.stamp : null;
}, number);
ok("البصمة محفوظة مع المستند", !!stamp && stamp.length === 8, String(stamp));

await page.goto(`${BASE}/verify/${number}?s=${stamp}`);
await page.waitForTimeout(600);
ok("صفحة التحقق بتقول أصلي", (await page.locator("body").innerText()).includes("المستند أصلي وسليم"));

await page.goto(`${BASE}/verify/${number}?s=WRONG123`);
await page.waitForTimeout(500);
ok("بصمة غلط بتتكشف", (await page.locator("body").innerText()).includes("مش مطابقة"));

await page.goto(`${BASE}/verify/SO-2000-000999`);
await page.waitForTimeout(500);
ok("رقم مش موجود بيتقال", (await page.locator("body").innerText()).includes("مش لاقيين المستند"));

// الإلغاء لازم سبب
await page.goto(`${BASE}/documents`);
await page.waitForTimeout(600);
// نلغي المستند اللي إحنا شايفين رقمه بالظبط، مش أول صف في الدفتر
const row = page
  .locator("div.rounded-lg.border")
  .filter({ has: page.getByText(number, { exact: true }) })
  .first();
await row.getByRole("button", { name: "إلغاء" }).click();
await page.waitForTimeout(400);
const cancelBtn = page.getByRole("button", { name: "ألغِ المستند" });
ok("الإلغاء مقفول بلا سبب", await cancelBtn.isDisabled());
await page.locator("textarea").first().fill("العميل رجّع الشحنة");
await page.waitForTimeout(200);
await cancelBtn.click();
await page.waitForTimeout(600);
const after = await page.locator("body").innerText();
ok("المستند بقى ملغي والرقم فضل", after.includes("ملغي") && after.includes(number));
ok("سبب الإلغاء مكتوب", after.includes("العميل رجّع الشحنة"));

const stillThere = await page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith("factory-ledger.v1:"));
  const db = JSON.parse(localStorage.getItem(key));
  return { docs: db.documents.length, audit: db.auditLog.filter((a) => a.table === "documents").length };
});
ok("الإلغاء مش مسح", stillThere.docs >= 1, JSON.stringify(stillThere));
ok("الإصدار والإلغاء في سجل التعديلات", stillThere.audit >= 2, JSON.stringify(stillThere));

await page.goto(`${BASE}/verify/${number}`);
await page.waitForTimeout(500);
ok("التحقق بيقول ملغي", (await page.locator("body").innerText()).includes("المستند ده ملغي"));

/* ── ٧) الصلاحيات ────────────────────────────────────────────── */

await demo("supervisor");
await page.goto(`${BASE}/exports`);
await page.waitForTimeout(800);
const sup = await page.locator("body").innerText();
ok("المشرف مايشوفش جداول المالية", !sup.includes("أرصدة الخزينة") && !sup.includes("كشوف حساب العملاء"), sup.slice(0, 200));
ok("المشرف يشوف جداول الإنتاج والمخزن", sup.includes("أوامر الإنتاج") && sup.includes("الخامات والأرصدة"));

await page.goto(`${BASE}/collections`);
await page.waitForTimeout(500);
ok("المشرف مش بيدخل شاشة التحصيل", !page.url().includes("/collections"));

/* ── ٨) الموبايل ─────────────────────────────────────────────── */

await demo();
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/exports`);
await page.waitForTimeout(800);
const width = await page.evaluate(() => document.documentElement.scrollWidth);
ok("مركز التصدير مافيهوش جرجرة أفقية", width <= 400, `${width}px`);

await page.goto(`${BASE}/documents`);
await page.waitForTimeout(700);
const dw = await page.evaluate(() => document.documentElement.scrollWidth);
ok("دفتر المستندات مافيهوش جرجرة أفقية", dw <= 400, `${dw}px`);

ok("مفيش أخطاء في الكونسول", errors.length === 0, errors.join(" | "));

console.log(`\n${pass} نجحت · ${fail} فشلت`);
await b.close();
process.exit(fail ? 1 : 0);
