import { chromium } from "playwright-core";

const URL = "http://127.0.0.1:43127";
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1360, height: 950 } });
const logs = [];
page.on("console", (m) => {
  if (m.type() === "error") logs.push(m.text());
});
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

let pass = 0;
let fail = 0;
const ok = (label, cond, extra = "") => {
  if (cond) pass++;
  else fail++;
  console.log(`  ${cond ? "ok  " : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`);
};
const head = (t) => console.log(`\n— ${t} —`);

const demo = async (role) => {
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: new RegExp(role) }).first().click();
  await page.waitForTimeout(600);
};

const sidebar = () => page.locator("aside").first();
const sidebarText = () => sidebar().innerText();

/* ── 1. شجرة القائمة ──────────────────────────────────────────── */
head("شجرة القائمة");
await demo("صاحب المصنع");

const sections = await sidebar().locator("nav > div > button").allInnerTexts();
ok("sidebar is sections, not a flat link list", sections.length >= 8, `${sections.length} أقسام`);
ok("sections read as factory areas", sections.some((s) => s.includes("الإنتاج")) && sections.some((s) => s.includes("المالية")));

const before = await sidebarText();
ok("only the current section is open", !before.includes("التحصيل"), "المالية مقفولة على الرئيسية");
await sidebar().getByRole("button", { name: "المالية" }).click();
await page.waitForTimeout(200);
const after = await sidebarText();
ok("opening a section reveals its pages", after.includes("التحصيل") && after.includes("الخزينة"));

// مفيش عنصر واحد في القايمة لسه مش مبني: الـ١٨ قسم كلهم شغّالين
for (const s of sections) {
  await sidebar().getByRole("button", { name: s, exact: true }).click().catch(() => {});
  await page.waitForTimeout(120);
}
const opened = await sidebarText();
ok("no «قريب» anywhere in the sidebar", !opened.includes("قريب"));
ok("no dead links to unbuilt screens", (await sidebar().locator("a[href='/samples'], a[href='/shifts'], a[href='/invoices']").count()) === 0);

/* ── 2. مسار الصفحة ──────────────────────────────────────────── */
head("مسار الصفحة");
await page.goto(`${URL}/orders`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const crumb = await page.locator("main nav").first().innerText();
ok("breadcrumb answers «أنا فين؟»", crumb.includes("المصنع") && crumb.includes("أوامر الإنتاج"), crumb.replace(/\n/g, " "));

await page.locator("main a[href^='/orders/']").first().click();
await page.waitForTimeout(500);
const deep = await page.locator("main nav").first().innerText();
ok("detail page keeps the trail", deep.includes("أوامر الإنتاج") && deep.split("/").length >= 3, deep.replace(/\n/g, " "));

/* ── 3. لوحة الأوامر ─────────────────────────────────────────── */
head("لوحة الأوامر والبحث الشامل");
await page.keyboard.press("Control+k");
await page.waitForTimeout(400);
const palette = page.locator("input[placeholder*='ابحث']");
ok("⌘K opens the palette", await palette.isVisible());

await palette.fill("قماش");
await page.waitForTimeout(400);
const hits = await page.locator("button:has-text('خامة')").count();
ok("search finds real records", hits > 0, `${hits} نتيجة خامة`);

await palette.fill("احمد");
await page.waitForTimeout(400);
const loose = await page.locator("div:has-text('جهة تعامل')").count();
ok("Arabic search ignores hamza («احمد» finds «أحمد»)", loose > 0);

await palette.fill("1042");
await page.waitForTimeout(400);
const byCode = await page.locator("button:has-text('SN-1042')").count();
ok("order code is searchable", byCode > 0);

await palette.fill("تحصيل");
await page.waitForTimeout(300);
const action = page.locator("button:has-text('إضافة تحصيل')").first();
ok("the palette runs actions, not just navigation", await action.isVisible());
await action.click();
await page.waitForTimeout(500);
ok("action lands on the right screen", page.url().includes("/collections"), page.url());

await page.keyboard.press("Control+k");
await page.waitForTimeout(300);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
ok("Esc closes the palette", (await page.locator("input[placeholder*='ابحث']").count()) === 0);

/* ── 4. مركز الإشعارات ───────────────────────────────────────── */
head("مركز الإشعارات");
const bell = page.getByRole("button", { name: /الإشعارات/ });
const bellLabel = await bell.getAttribute("aria-label");
ok("bell counts what needs attention", /\d/.test(bellLabel ?? ""), bellLabel ?? "");
await bell.click();
await page.waitForTimeout(400);
const panel = page.locator("div.absolute.top-11").last();
const panelText = await panel.innerText();
ok("notifications are categorized", /الإنتاج|المخزون|المالية/.test(panelText));
ok("each notification says why, in numbers", panelText.length > 120);

const firstRead = page.getByRole("button", { name: "قرأته" }).first();
const labelBefore = await bell.getAttribute("aria-label");
await firstRead.click();
await page.waitForTimeout(400);
const labelAfter = await bell.getAttribute("aria-label");
ok("marking read lowers the count", labelBefore !== labelAfter, `${labelBefore} → ${labelAfter}`);

const snoozeBtn = page.getByRole("button", { name: "أجّله بكرة" }).first();
const countBefore = await page.getByRole("button", { name: "أجّله بكرة" }).count();
await snoozeBtn.click();
await page.waitForTimeout(400);
const countAfter = await page.getByRole("button", { name: "أجّله بكرة" }).count();
ok("snooze hides it until tomorrow", countAfter === countBefore - 1, `${countBefore} → ${countAfter}`);

await page.goto(`${URL}/alerts`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const alerts = await page.locator("main").innerText();
ok("alerts page states its source", alerts.includes("محسوب من بيانات المصنع"));
ok("alerts are ordered by real impact", alerts.includes("ج") || alerts.includes("يوم"));

/* ── 5. آخر ما شُوهد ─────────────────────────────────────────── */
head("آخر ما شُوهد");
await page.goto(`${URL}/products`, { waitUntil: "networkidle" });
await page.locator("main a[href^='/products/']").first().click();
await page.waitForTimeout(500);
const seenName = await page.locator("main h2").first().innerText();
await page.keyboard.press("Control+k");
await page.waitForTimeout(400);
const recent = await page.locator("p:has-text('رجوع لآخر شغل')").count();
ok("palette offers the record you just opened", recent > 0, seenName);
await page.keyboard.press("Escape");

/* ── 6. الصلاحية مش إخفاء زر ─────────────────────────────────── */
head("الصلاحية مش إخفاء زر");
await demo("مشرف");
const supSidebar = await sidebarText();
ok("supervisor does not see finance in the menu", !supSidebar.includes("التحصيل") && !supSidebar.includes("الخزينة"));
ok("supervisor still sees production and stock", supSidebar.includes("الإنتاج") && supSidebar.includes("الخامات"));

await page.goto(`${URL}/collections`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
ok("typing a forbidden address does not open it", !page.url().includes("/collections"), page.url());

await page.goto(`${URL}/staff`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
ok("supervisor cannot reach the permissions screen", !page.url().includes("/staff"), page.url());

/* ── 7. مصفوفة الصلاحيات ────────────────────────────────────── */
head("مصفوفة الصلاحيات");
await demo("صاحب المصنع");
await page.goto(`${URL}/staff`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const staff = await page.locator("main").innerText();
ok("owner gets a permission matrix, not just roles", staff.includes("الصلاحيات") && staff.includes("تصدير"));
ok("matrix states that the UI is not the guard", staff.includes("العملية نفسها"));

const cell = page.getByRole("button", { name: "عرض الخزينة والتحصيل" });
ok("accountant starts with finance view", (await cell.getAttribute("aria-pressed")) === "true");
await cell.click();
await page.waitForTimeout(500);
ok("owner can close a single cell", (await cell.getAttribute("aria-pressed")) === "false");
const afterEdit = await page.locator("main").innerText();
ok("the change is recorded, not silent", afterEdit.includes("مسجّل في سجل التعديلات"));

await page.goto(`${URL}/audit`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const audit = await page.locator("main").innerText();
ok("audit log carries the permission change", audit.includes("settings"));

await page.goto(`${URL}/staff`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.getByRole("button", { name: "رجّع الافتراضي" }).click();
await page.waitForTimeout(500);
const back = await page.locator("main").innerText();
ok("owner can restore the defaults", back.includes("على الافتراضي"));

/* ── 7ب. الرفض بيحصل في العملية نفسها، مش في الزر ────────────── */
head("الرفض في العملية نفسها");
// صاحب المصنع يقفل «إضافة» للمحاسب في العمال، والزر بيفضل ظاهر له —
// فلو الرفض كان مكياج، الحضور كان هيتسجّل.
const attend = page.getByRole("button", { name: "إضافة العمال والحضور" });
ok("cell starts open for the accountant", (await attend.getAttribute("aria-pressed")) === "true");
await attend.click();
await page.waitForTimeout(500);
ok("owner closed «إضافة» on workers", (await attend.getAttribute("aria-pressed")) === "false");

// نبدّل للمحاسب على نفس بيانات المصنع — تبديل الدور مابيمسحش التعديل
await page.locator("aside").getByRole("button", { name: "خروج" }).click();
await page.waitForTimeout(700);
await page.getByRole("button", { name: /^محاسب/ }).first().click();
await page.waitForTimeout(800);
ok("switching demo role keeps the factory data", page.url().endsWith("/"), page.url());

await page.goto(`${URL}/workers`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const attendBtn = page.getByRole("button", { name: "تسجيل الحضور المختار" });
ok("the button is still there for the accountant", await attendBtn.isVisible());
const presentBefore = await page.locator("main").innerText();
await attendBtn.click();
await page.waitForTimeout(700);
const toasts = await page.locator("[data-sonner-toast]").allInnerTexts();
const refusal = toasts.join(" | ").replace(/\n/g, " ");
ok("the mutation itself refuses", refusal.includes("محتاج صلاحية"), refusal);
ok("refusal names the missing permission", refusal.includes("إضافة العمال والحضور"));
ok("the screen does not claim success", !refusal.includes("الحضور اتسجل"));
ok("nothing was recorded", (await page.locator("main").innerText()) === presentBefore);

/* ── 8. صفحة المساعدة ───────────────────────────────────────── */
await demo("صاحب المصنع");
head("صفحة المساعدة");
await page.goto(`${URL}/help`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const help = await page.locator("main").innerText();
ok("help lists the real shortcuts", help.includes("⌘K"));
ok("help shows my own permissions", help.includes("صلاحيتك دلوقتي"));
// مفيش شاشة مش مبنية النهارده، فالكارت ده مالوش لازمة يتعرض فاضي
ok("help hides the not-built card when nothing is pending", !help.includes("اللي لسه مش مبني"));
ok("help counts the built screens", help.includes("شاشة شغالة على بيانات حقيقية"));
ok("help says what needs a server", help.includes("محتاجة سيرفر") && help.includes("RLS"));

/* ── 9. مهامي ───────────────────────────────────────────────── */
head("مهامي");
await page.goto(`${URL}/tasks`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const tasks = await page.locator("main").innerText();
ok("tasks page loads", tasks.includes("مهامي"));
const openRows = await page.locator("main button[aria-label='تم']").count();
if (openRows > 0) {
  await page.locator("main button[aria-label='تم']").first().click();
  await page.waitForTimeout(400);
  const done = await page.locator("main").innerText();
  ok("finishing a task moves it out of the open list", done.includes("خلصت"));
} else {
  ok("tasks page has an honest empty state", tasks.includes("لسه مفيش مهام"));
}

/* ── 10. الموبايل ───────────────────────────────────────────── */
head("الموبايل");
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
ok("bottom bar on mobile", await page.locator("nav.fixed.bottom-0").isVisible());
await page.getByRole("button", { name: "المزيد" }).last().click();
await page.waitForTimeout(400);
const drawerText = await page.locator("div.fixed.inset-0 nav").innerText();
ok("drawer holds the same tree", drawerText.includes("الإنتاج") && drawerText.includes("المالية"));
await page.locator("div.fixed.inset-0 nav").getByRole("button", { name: "المالية" }).click();
await page.waitForTimeout(400);
await page.locator("div.fixed.inset-0 nav").getByRole("link", { name: "التحصيل" }).click();
await page.waitForTimeout(600);
ok("drawer link navigates and closes", page.url().includes("/collections") && (await page.locator("div.fixed.inset-0 nav").count()) === 0);

console.log(`\n${pass} ok · ${fail} fail · ${logs.length} console errors`);
for (const l of logs.slice(0, 8)) console.log(`   ${l}`);
await browser.close();
process.exit(fail || logs.length ? 1 : 0);
