import { chromium } from "playwright-core";

const URL = "http://127.0.0.1:43127";
const logs = [];
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

const ok = (label, cond, extra = "") => console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);

await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.waitForTimeout(500);

// 1. مركز جهات التعامل
await page.goto(`${URL}/parties`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
ok("parties page heading", await page.getByRole("heading", { name: "جهات التعامل" }).isVisible());
const rows = await page.locator("a[href^='/parties/']").count();
ok("party rows listed", rows >= 10, `${rows} rows`);
ok("focus block", await page.getByText("مين أركز عليه النهارده").isVisible());

// فلتر الموردين
await page.locator("main").getByRole("button", { name: /^الموردين/ }).click();
await page.waitForTimeout(300);
const supRows = await page.locator("a[href^='/parties/']").count();
ok("supplier filter narrows list", supRows > 0 && supRows < rows, `${supRows} of ${rows}`);
await page.locator("main").getByRole("button", { name: /^كل الجهات/ }).click();
await page.waitForTimeout(200);

// 2. منع التكرار في نموذج الإضافة
await page.getByRole("button", { name: "جهة جديدة" }).click();
await page.waitForTimeout(300);
await page.getByLabel("اسم الشركة").fill("محلات البرنس");
await page.waitForTimeout(300);
ok("duplicate detection warns", await page.getByText("في سجل شبه ده بالفعل").isVisible());
await page.locator("button[aria-label='إغلاق']").first().click();
await page.waitForTimeout(300);

// 3. بروفايل عميل حقيقي
await page.getByRole("link", { name: /محلات البرنس/ }).first().click();
await page.waitForTimeout(500);
ok("profile shows roles", await page.getByText(/شركة · عميل/).isVisible());
ok("financial block", await page.getByText("الملف المالي").isVisible());
ok("score summary on overview", await page.getByText("شوف الدرجة اتكوّنت إزاي").isVisible());
await page.getByRole("button", { name: "الذكاء" }).click();
await page.waitForTimeout(500);
ok("score breakdown in intelligence tab", await page.getByText("اللي رفع الدرجة").isVisible());
await page.getByRole("button", { name: "نظرة عامة" }).click();
await page.waitForTimeout(300);

// الخط الزمني
await page.getByRole("button", { name: "الخط الزمني" }).click();
await page.waitForTimeout(400);
const events = await page.locator("ol > li").count();
ok("timeline merges events", events >= 3, `${events} events`);

// كشف الحساب
await page.getByRole("button", { name: "كشف الحساب" }).click();
await page.waitForTimeout(400);
const stLines = await page.locator("table tbody tr").count();
ok("statement lines", stLines >= 2, `${stLines} lines`);

// 4. تحذير حد الائتمان على التوريد
await page.getByRole("button", { name: "توريد" }).first().click();
await page.waitForTimeout(300);
await page.getByLabel("المبلغ").fill("900000");
await page.waitForTimeout(300);
const warn = await page.getByText(/بيعدي الائتمان المتاح/).count();
ok("credit warning on oversized delivery", warn > 0);
let dialogText = "";
page.on("dialog", async (d) => {
  dialogText = d.message();
  await d.dismiss();
});
await page.getByRole("button", { name: "حفظ التوريد" }).click();
await page.waitForTimeout(400);
ok("confirm asks before exceeding credit", /بيعدي الائتمان المتاح/.test(dialogText), dialogText.slice(0, 60));
await page.locator("button[aria-label='إغلاق']").first().click();
await page.waitForTimeout(300);

// 5. تسجيل تواصل بيفتح مهمة متابعة
await page.getByRole("button", { name: "التواصل والمهام" }).click();
await page.waitForTimeout(300);
const tasksBefore = await page.locator("input[type=checkbox]").count();
await page.getByRole("button", { name: "سجّل تواصل" }).click();
await page.waitForTimeout(300);
await page.getByLabel("الموضوع").fill("مكالمة متابعة");
await page.getByLabel("اللي حصل").fill("طلب عرض سعر جديد");
await page.getByLabel("الخطوة الجاية", { exact: true }).fill("أبعتله عرض السعر");
await page.getByLabel("ميعاد الخطوة الجاية").fill("2026-09-20");
await page.getByRole("button", { name: "حفظ", exact: true }).click();
await page.waitForTimeout(600);
const tasksAfter = await page.locator("input[type=checkbox]").count();
ok("communication opens follow-up task", tasksAfter === tasksBefore + 1, `${tasksBefore} -> ${tasksAfter}`);
ok("communication logged", await page.getByText("طلب عرض سعر جديد").isVisible());

// 6. الأشخاص والعناوين
await page.getByRole("button", { name: "البيانات" }).click();
await page.waitForTimeout(400);
ok("basic info card", await page.getByText("البيانات الأساسية").isVisible());
ok("contacts card", await page.getByText("الأشخاص").first().isVisible());
ok("credit limit shown", await page.getByText("حد الائتمان").first().isVisible());

// 7. الروابط القديمة
const pid = page.url().split("/parties/")[1];
await page.goto(`${URL}/clients/${pid}`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
ok("legacy /clients link redirects", page.url().endsWith(`/parties/${pid}`), page.url());

const bad = logs.filter((l) => !l.includes("[debug]"));
console.log(`\nconsole messages: ${bad.length}`);
bad.slice(0, 10).forEach((l) => console.log("  ", l));
await browser.close();
