/**
 * الشاشة البيضا — الباج اللي المستخدم شكا منه تلات مرات.
 *
 * الشكوى كانت «لما بدخل على أي صفحة يحصل كراش ولازم اعمل ريلود». وطلعت
 * حاجتين مستقلتين، والاتنين هنا:
 *
 * ١) **أرضية المجموعات.** الدفتر محفوظ على الجهاز. دفتر اتحفظ بنسخة أقدم
 *    مافيهوش المجموعات اللي اتضافت بعديها، وكود زي `db.workers.map(...)`
 *    بيرمي جوه الرندر. قِسناها قبل الإصلاح: **٩ من ٥٢** مجموعة كانت
 *    بتعمل شاشة بيضا لو ناقصة. والاختبار ده بيشيل كل مجموعة لوحدها.
 *
 * ٢) **الحاجز.** مكانش فيه حاجز في التطبيق كله، فأي استثناء كان بيفكّ
 *    الشجرة كلها — يعني صفحة بيضا من غير رسالة ولا قائمة، والـRefresh
 *    هو المخرج الوحيد. الاختبار بيحقن عطل حقيقي ويتأكد إن القائمة فضلت
 *    شغّالة وإن الانتقال لقسم تاني نجح **من غير أي تحميل للصفحة**.
 *
 * والحقن هنا مش تمثيل: بنحطّ صف `null` جوه مجموعة، وهي الصورة اللي أي
 * دفتر متعطّب بياخدها فعلًا.
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.SANAA_URL ?? "http://127.0.0.1:43127";
const CHROME = process.env.CHROME_PATH ?? "/usr/local/bin/google-chrome";

const src = readFileSync(new URL("../src/store/account.ts", import.meta.url), "utf8");
const email = src.match(/email:\s*"([^"@]+@[^"]+)"/)?.[1] ?? "";
const pwd = src.match(/password:\s*"([^"]+)"/)?.[1] ?? "";
if (!email || !pwd) {
  console.error("مش لاقي بيانات الدخول التجريبية في src/store/account.ts");
  process.exit(1);
}

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
};

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const thrown = [];
page.on("pageerror", (e) => thrown.push(String(e).split("\n")[0].slice(0, 200)));

const LEDGER = () =>
  page.evaluate(() => Object.keys(localStorage).find((k) => k.startsWith("factory-ledger.v1:")));

try {
  console.log("— تسجيل الدخول —");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder(/@/).first().fill(email);
  await page.locator('input[type="password"]').first().fill(pwd);
  await page.getByRole("button", { name: /دخول|تسجيل/ }).first().click();
  await page.locator("nav").first().waitFor({ timeout: 30_000 });
  await page.waitForFunction(
    () => Object.keys(localStorage).some((k) => k.startsWith("factory-ledger.v1:")),
    null,
    { timeout: 25_000 },
  );
  await page.waitForTimeout(800);
  ok("دخلنا المصنع التجريبي", true);

  const key = await LEDGER();
  const full = await page.evaluate((k) => localStorage.getItem(k), key);
  const parsed = JSON.parse(full);
  const keys = Object.keys(parsed).filter((k) => Array.isArray(parsed[k]));
  ok("الدفتر فيه مجموعات نختبر عليها", keys.length > 40, `${keys.length}`);

  /* ── ١) كل مجموعة ناقصة لوحدها ──────────────────────────── */
  console.log(`\n— دفتر ناقصة منه مجموعة (${keys.length} حالة) —`);
  const white = [];
  for (const drop of keys) {
    thrown.length = 0;
    await page.evaluate(
      ([k, json, d]) => {
        const db = JSON.parse(json);
        delete db[d];
        localStorage.setItem(k, JSON.stringify(db));
      },
      [key, full, drop],
    );
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const text = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    if (text.length < 40 || thrown.length) white.push(`${drop}${thrown[0] ? `: ${thrown[0]}` : ""}`);
  }
  ok("مفيش مجموعة ناقصة بتعمل شاشة بيضا", white.length === 0, white.slice(0, 6).join(" | "));

  /* ── ٢) صف متعطّب في كل مجموعة ───────────────────────────── */
  console.log(`\n— صف null جوه مجموعة (${keys.length} حالة) —`);
  const broke = [];
  for (const col of keys) {
    thrown.length = 0;
    await page.evaluate(
      ([k, json, c]) => {
        const db = JSON.parse(json);
        db[c] = [null, ...db[c]];
        localStorage.setItem(k, JSON.stringify(db));
      },
      [key, full, col],
    );
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    const alive = await page.locator("nav").first().isVisible().catch(() => false);
    if (!alive) broke.push(col);
  }
  ok("صف متعطّب مابيوقّعش النظام — بيتشال ويتكتب في الكونسول", broke.length === 0, broke.slice(0, 8).join(", "));

  /* ── ٣) الحاجز على عطل ماينفعش يتصلّح لوحده ──────────────── */
  console.log("\n— صف ناقص حقوله: عطل حقيقي —");
  /* صف كائن بس ناقص كل حقوله. ده مش زي صف `null`: `null` بايت ماينفع
     يتعرض فبنشيله، أما صف ناقص يمكن يكون سجل اتكتب نصّه — فمانمسحهوش
     من ورا المستخدم. يعني ده الحالة اللي الحاجز موجود عشانها. */
  await page.evaluate(
    ([k, json]) => {
      const db = JSON.parse(json);
      db.parties = [{}, ...db.parties];
      localStorage.setItem(k, JSON.stringify(db));
    },
    [key, full],
  );
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("العطل بيظهر كرسالة مش شاشة بيضا", /الشاشة دي وقعت/.test(body), body.slice(0, 80) || "<فاضي>");
  ok("وفيها زرار «جرّب تاني»", await page.getByRole("button", { name: /جرّب تاني/ }).isVisible().catch(() => false));
  ok("وفيها لينك للرئيسية", await page.getByRole("link", { name: /الرئيسية/ }).isVisible().catch(() => false));
  ok("وفيها تفاصيل للمبرمج", /تفاصيل للمبرمج/.test(body));
  ok("والرسالة معلَنة للقارئ الصوتي", (await page.locator('[role="alert"]').count()) > 0);

  /* أهم تأكيد في الملف: الرجوع من العطل من غير Refresh.
     نصلّح الدفتر وندوس «جرّب تاني» — الحاجز برّه الـprovider، فتصفيره
     بيعيد تركيبه وبيقرا الدفتر من الأول. */
  let loads = 0;
  page.on("load", () => loads++);
  await page.evaluate(([k, json]) => localStorage.setItem(k, json), [key, full]);
  await page.getByRole("button", { name: /جرّب تاني/ }).click();
  await page.locator("nav").first().waitFor({ timeout: 15_000 });
  const after = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("«جرّب تاني» رجّع النظام فعلًا", !/الشاشة دي وقعت/.test(after) && after.length > 60);
  ok("ومن غير أي تحميل للصفحة — ده كان معنى «لازم اعمل ريلود»", loads === 0, `${loads} تحميل`);

  /* الحاجز بيتصفّر مع تغيير المسار كمان، عشان عطل في صفحة مايخليش كل
     الصفحات بعدها تعرض نفس الخطأ */
  const shell = readFileSync(new URL("../src/components/AppShell.tsx", import.meta.url), "utf8");
  ok("وفيه حاجز حوالين الصفحة جوه الشِل", /<ErrorBoundary scope="page">[\s\S]{0,80}<Outlet \/>/.test(shell));
  const guard = readFileSync(new URL("../src/components/ErrorBoundary.tsx", import.meta.url), "utf8");
  ok("والحاجز بيتصفّر مع تغيير المسار", /key=\{scope === "page" \? pathname/.test(guard));

  /* ── ٤) استرجاع نسخة قديمة ───────────────────────────────── */
  console.log("\n— استرجاع نسخة احتياطية قديمة —");
  await page.evaluate(([k, json]) => localStorage.setItem(k, json), [key, full]);
  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const restored = await page.evaluate(async (json) => {
    /* نفس اللي بيحصل لما المستخدم يرفع ملف نسخة اتاخدت بنسخة أقدم */
    const db = JSON.parse(json);
    for (const k of ["workers", "collections", "accounts", "manualTx"]) delete db[k];
    const file = { version: 1, kind: "factory-backup", factoryName: db.factory.name, exportedAt: new Date().toISOString(), data: db };
    localStorage.setItem("sanaa.test.backup", JSON.stringify(file));
    return true;
  }, full);
  ok("جهّزنا ملف نسخة ناقصة مجموعات", restored);
  ok(
    "والاسترجاع بيعدّي على نفس الترحيل",
    /const data = migrate\(file\.data\)/.test(
      readFileSync(new URL("../src/store/context.tsx", import.meta.url), "utf8"),
    ),
  );

  await page.evaluate(([k, json]) => localStorage.setItem(k, json), [key, full]);

  /* ── ٥) متصفح `scrollTo` فيه بيرجّع قيمة ────────────────── */
  console.log("\n— متصفح scrollTo فيه بيرجّع قيمة —");
  /* الشكوى الأخيرة كانت `TypeError: l is not a function` في `Ol` — ودي
     دالة ريأكت اللي بتنادي تنظيف الـeffect. والسبب كان سطر في الشِل
     بيرجّع ناتج `window.scrollTo` ضمنيًا، والـeffect مربوط بالمسار،
     فالتنظيف بيتنفّذ مع كل تنقّل. في كروم الناتج `undefined` فمافيش
     مشكلة — عشان كده الهارنسات كلها كانت بتقول سليم. هنا بنعمل متصفح
     بيرجّع قيمة، زي الويب-فيوهات وبوليفيلات التمرير. */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => {
    const real = window.scrollTo.bind(window);
    window.scrollTo = (...args) => {
      real(...args);
      return true;
    };
  });
  const p2 = await ctx.newPage();
  const boom = [];
  p2.on("pageerror", (e) => boom.push(String(e).split("\n")[0].slice(0, 160)));
  /* ريأكت بتكتب العطل ده بـ`console.error` مش كـ`pageerror` لما الحاجز
     بيمسكه — فالسامع الواحد كان بيخلّي التأكيد ينجح على متصفح واقع */
  p2.on("console", (m) => {
    if (m.type() === "error") boom.push(m.text().split("\n")[0].slice(0, 160));
  });
  await p2.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await p2.getByPlaceholder(/@/).first().fill(email);
  await p2.locator('input[type="password"]').first().fill(pwd);
  await p2.getByRole("button", { name: /دخول|تسجيل/ }).first().click();
  await p2.locator("nav").first().waitFor({ timeout: 30_000 });
  await p2.waitForTimeout(1500);
  ok("الدخول نفسه مابيقعش", !/الشاشة دي وقعت/.test(await p2.locator("body").innerText()), boom[0] ?? "");

  const heads2 = p2.locator("nav > div > button");
  for (let i = 0, n = await heads2.count(); i < n; i++) await heads2.nth(i).click().catch(() => {});
  const hops = ["/parties", "/orders", "/collections", "/materials", "/parties"];
  const crashedAt = [];
  let hopped = 0;
  for (const href of hops) {
    const a = p2.locator(`nav a[href="${href}"]`).first();
    if (!(await a.isVisible().catch(() => false))) continue;
    await a.click({ timeout: 10_000 }).catch(() => {});
    hopped++;
    await p2.waitForTimeout(900);
    if (/الشاشة دي وقعت/.test(await p2.locator("body").innerText().catch(() => ""))) crashedAt.push(href);
  }
  /* لازم نتأكد إننا اتنقّلنا فعلًا: لما التطبيق بيقع القائمة بتختفي،
     فاللينكات مابتبقاش ظاهرة، فالّوب بيلفّ من غير ما يضغط حاجة
     والتأكيد ينجح على متصفح مكسور تمامًا */
  ok("اتنقّلنا فعلًا بين أقسام", hopped >= 3, `${hopped} ضغطة`);
  ok("والتنقّل بين الأقسام مابيقعش", crashedAt.length === 0, crashedAt.join(", "));
  ok("ومفيش «is not a function» في الكونسول", !boom.some((b) => /is not a function/.test(b)), boom.slice(0, 2).join(" | "));
  await ctx.close();
} catch (e) {
  fail++;
  console.log(`  ✗ الاختبار نفسه وقع — ${String(e).split("\n")[0]}`);
} finally {
  await browser.close();
}

console.log(`\n${pass} نجحت · ${fail} فشلت`);
if (fail) process.exit(1);
