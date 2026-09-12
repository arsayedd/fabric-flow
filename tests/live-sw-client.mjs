/**
 * الحالة اللي المستخدم شكا منها بالظبط، على الدومين الحقيقي.
 *
 * الاختبارات التانية بتفتح متصفح نضيف كل مرة — يعني مافيش سيرفس ووركر
 * متحكّم في الصفحة، وده مش وضع المستخدم. المستخدم فاتح النظام قبل كده،
 * فعنده سيرفس ووركر شغّال بيقدّم `index.html` من الكاش الأول.
 *
 * فهنا بنستخدم نفس الـprofile مرتين: الزيارة الأولى بتركّب السيرفس ووركر،
 * والتانية بتبدأ وهو متحكّم. وبنعمل كل حاجة — دخول، تنقّل، Refresh —
 * وإحنا في الوضع ده، ومانعملش أي Refresh باليد عشان نخلّي حاجة تظبط.
 */
import { chromium } from "playwright-core";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.SANAA_URL?.replace(/\/$/, "");
let pass = 0;
let fail = 0;
const ok = (c, m, extra = "") => {
  if (c) {
    pass++;
    console.log(`  ✓ ${m}`);
  } else {
    fail++;
    console.log(`  ✗ ${m}${extra ? ` — ${extra}` : ""}`);
  }
};

if (!BASE) {
  console.log("SANAA_URL مش محدّد — الاختبار ده بيشتغل على الدومين الحقيقي بس");
  console.log("0 نجحت · 0 فشلت");
  process.exit(0);
}

/*
 * بيانات الدخول في `account.ts` مش `seed.ts`.
 *
 * النسخة الأولى من الملف ده كانت بتقرا من `seed.ts`، فبترجع فاضي،
 * فبتكتب خانتين فاضيتين وبتكمل — والاختبار كان بينجح وهو مش داخل النظام
 * أصلًا. فبنوقف هنا لو البيانات مالقيناهاش، بدل ما نقيس حاجة مش موجودة.
 */
const src = readFileSync(new URL("../src/store/account.ts", import.meta.url), "utf8");
const email = src.match(/email:\s*"([^"@]+@[^"]+)"/)?.[1] ?? "";
const pwd = src.match(/password:\s*"([^"]+)"/)?.[1] ?? "";
if (!email || !pwd) {
  console.log("  ✗ مش لاقيين بيانات الحساب التجريبي في account.ts");
  console.log("\n0 نجحت · 1 فشلت");
  process.exit(1);
}

const profile = mkdtempSync(join(tmpdir(), "sanaa-sw-"));
let ctx;
const bail = (e) => {
  fail++;
  console.log(`  ✗ الاختبار اتقطع — ${String(e).split("\n")[0]}`);
  console.log(`\n${pass} نجحت · ${fail} فشلت`);
  process.exit(1);
};
process.on("unhandledRejection", bail);
process.on("uncaughtException", bail);

/** نفتح صفحة ونستنى محتوى حقيقي — مش networkidle، لأنه مابيستقرّش مع سيرفس ووركر */
const open = async (p, path) => {
  await p.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await p.locator("#root > *").first().waitFor({ timeout: 30_000 });
};

const controller = (p) => p.evaluate(() => Boolean(navigator.serviceWorker.controller));

try {
  ctx = await chromium.launchPersistentContext(profile, {
    executablePath: "/usr/local/bin/google-chrome",
    args: ["--no-sandbox"],
  });

  console.log(`\n▸ ${BASE} — متصفح عنده سيرفس ووركر شغّال من قبل`);

  /* الزيارة الأولى: بنركّب السيرفس ووركر وبس */
  const warm = await ctx.newPage();
  await open(warm, "/");
  await warm.evaluate(() => navigator.serviceWorker.ready);
  await warm.close();

  /* من هنا ورايح: كل صفحة بتفتح والسيرفس ووركر متحكّم فيها */
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  let loads = 0;
  page.on("load", () => loads++);

  await open(page, "/");
  ok(await controller(page), "السيرفس ووركر متحكّم في الصفحة من أول لحظة");

  /* دخول: المستخدم قال «لما ادخل لازم اعمل ريفريش» */
  await open(page, "/login");
  await page.getByPlaceholder(/@/).first().fill(email);
  await page.locator('input[type="password"]').first().fill(pwd);
  await page
    .getByRole("button", { name: /دخول|تسجيل/ })
    .first()
    .click();
  /* القائمة هي الدليل إننا جوّه فعلًا — نص اسم المصنع بيظهر في شاشة
   * الدخول كمان، فمابيفرّقش بين داخل وبره */
  const landed = await page
    .locator("nav")
    .first()
    .waitFor({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  ok(landed, "الدخول بيفتح المصنع من غير Refresh باليد");

  /*
   * التنقّل **بالضغط على القائمة**، مش بـ`goto`.
   *
   * ودي كانت الثغرة اللي خلّت الباج يعدّي: كل الاختبارات كانت بتفتح كل
   * شاشة بعنوانها، وده تحميل كامل للصفحة. والمستخدم مابيعملش كده — هو
   * بيضغط على القسم، والتنقّل بيحصل في المتصفح من غير طلب شبكة. فالحالة
   * اللي شكا منها مكانتش بتتقاس أصلًا.
   */
  await open(page, "/");
  const before = loads;
  /* أقسام القائمة بتتفتح واحد واحد — اللي إنت فيه مفتوح والباقي مقفول.
   * فبنفتحهم كلهم زي ما المستخدم بيعمل قبل ما يضغط على القسم. */
  const expand = async () => {
    const heads = page.locator("nav > div > button");
    for (let i = 0, n = await heads.count(); i < n; i++) {
      const h = heads.nth(i);
      if (await h.isVisible().catch(() => false)) await h.click().catch(() => {});
    }
  };
  await expand();

  for (const [path, needle] of [
    ["/orders", /أوامر|الأوامر/],
    ["/parties", /عملاء|الأطراف|موردين/],
    ["/materials", /خامات|الخامات|مخزون/],
  ]) {
    let link = page.locator(`a[href="${path}"]`).first();
    if (!(await link.isVisible().catch(() => false))) {
      await expand();
      link = page.locator(`a[href="${path}"]`).first();
    }
    if (!(await link.isVisible().catch(() => false))) {
      ok(false, `${path} مش ظاهر في القائمة`);
      continue;
    }
    await link.click();
    const arrived = await page
      .waitForFunction((p) => location.pathname === p, path, { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    const seen = await page
      .getByText(needle)
      .first()
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    ok(arrived && seen, `الضغط على ${path} بيفتحه من غير Refresh`, `وصل:${arrived} بان:${seen}`);
  }
  ok(loads === before, "والتنقّل ده مااحتاجش أي تحميل جديد للصفحة", `اتحمّلت ${loads - before} مرة`);

  /* Refresh جوّه صفحة — المفروض يفضل مكانه مش يرجّع لشاشة الدخول */
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#root > *").first().waitFor({ timeout: 30_000 });
  ok(!/\/login/.test(page.url()), "والـRefresh مابيطلعنيش من النظام", page.url());

  /* مافيش لفّة تحديث: الصفحة مااتحمّلتش أكتر من مرات التنقّل المقصودة */
  ok(loads <= 6, "ومافيش تحميل زيادة على الفاضي", `اتحمّلت ${loads} مرة`);

  ok(errors.length === 0, "ومافيش أخطاء كونسول", errors.slice(0, 3).join(" | "));
} catch (e) {
  bail(e);
} finally {
  await ctx?.close().catch(() => {});
  rmSync(profile, { recursive: true, force: true });
}

console.log(`\n${pass} نجحت · ${fail} فشلت`);
process.exit(fail ? 1 : 0);
