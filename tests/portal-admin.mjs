/**
 * بورتال العميل من ناحية المصنع: فتح اللينك، ونطاقه، وتوقيفه.
 *
 * `portal-leak.mjs` بيختبر الصفحة اللي العميل بيشوفها. الملف ده بيختبر
 * الرحلة اللي صاحب المصنع بيعملها بإيده — لأن ميزة اللينك بتفشل من
 * ناحيتين: تسريب للعميل، أو إن صاحب المصنع مش قادر يفتحه أو يوقفه.
 *
 * والتوقيف بالتحديد بيتأكد عليه بالفعل مش بالشكل: بنفتح اللينك، نوقّفه،
 * ونفتحه تاني — لأن زرار توقيف بيغيّر لون ومايقفلش باب هو أسوأ من مفيش
 * زرار، بيطمّن صاحب المصنع على حاجة مش حاصلة.
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const acc = read("src/store/account.ts");
const email = acc.match(/email:\s*"([^"@]+@[^"]+)"/)?.[1] ?? "";
const pwd = acc.match(/password:\s*"([^"]+)"/)?.[1] ?? "";
if (!email || !pwd) throw new Error("مش لاقي بيانات الحساب التجريبي في account.ts");

const BASE = process.env.BASE ?? "http://127.0.0.1:43127";
let pass = 0;
let fail = 0;
const ok = (label, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`);
  }
};

const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1340, height: 1000 }, locale: "ar-EG" });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

const bail = async (e) => {
  fail++;
  console.log(`  ✗ الاختبار اتقطع — ${String(e).split("\n")[0]}`);
  console.log(`\n${pass} نجحت · ${fail} فشلت`);
  await browser.close().catch(() => {});
  process.exit(1);
};
process.on("unhandledRejection", bail);

const open = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.locator("#root > *").first().waitFor({ timeout: 30_000 });
};

try {
  console.log("\n— تجهيز —");
  await open("/login");
  await page.getByPlaceholder(/@/).first().fill(email);
  await page.locator('input[type="password"]').first().fill(pwd);
  await page.getByRole("button", { name: /دخول|تسجيل/ }).first().click();
  await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith("factory-ledger.v1:")), null, {
    timeout: 20_000,
  });

  /* عميل مالوش لينك — عشان نختبر الفتح نفسه مش نقرا لينك مزروع */
  const target = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("factory-ledger.v1:"));
    const db = JSON.parse(localStorage.getItem(key));
    const has = new Set((db.portalGrants ?? []).filter((g) => !g.revokedAt).map((g) => g.partyId));
    const p = db.parties.find(
      (x) => x.roles.includes("customer") && !x.mergedIntoId && !has.has(x.id) && db.deliveries.some((d) => d.clientId === x.id),
    );
    return p ? { id: p.id, name: p.name } : null;
  });
  ok("لقينا عميل مالوش لينك لسه", Boolean(target), target?.name ?? "مافيش");
  if (!target) throw new Error("مافيش عميل بدون لينك نختبر عليه");

  /* ── الكارت في ملف العميل ─────────────────────────────────── */
  console.log("\n— الكارت في ملف العميل —");
  await open(`/parties/${target.id}`);
  await page.getByRole("button", { name: "كشف الحساب" }).first().click();
  await page.getByText("لينك العميل").first().waitFor({ timeout: 15_000 });
  ok("كارت اللينك بيبان في تاب الحساب", true);

  const body = () => page.locator("body").innerText();
  ok("وبيقول اللينك بيعمل إيه بلغة واضحة", /يشوف منه توريداته/.test(await body()));

  /* ── الفتح ───────────────────────────────────────────────── */
  console.log("\n— فتح اللينك —");
  await page.getByRole("button", { name: /افتح لينك للعميل/ }).first().click();
  const box = page.getByLabel("لينك بورتال العميل");
  await box.waitFor({ timeout: 15_000 });
  const url = await box.inputValue();
  ok("اللينك اتفتح وظهر في الخانة", /\/p\/[0-9a-f]{40}$/.test(url), url);

  const token = url.split("/p/")[1];
  ok("والتوكن ٤٠ حرف سِتّيني عشري", /^[0-9a-f]{40}$/.test(token), token);

  /* التوكن مش مشتق من رقم العميل — لو كان، أي حد يخمّن لينك أي عميل.
     والقياس هنا مش «مش بيحتوي حروف الرقم»: رقم زي `cl-1` بيبقى `c1` بعد
     شيل الشرطة، و`c1` بيظهر في توكن عشوائي ٤٠ حرف واحدة من كل سبعة —
     يعني اختبار بيفشل بالحظ ويقول الكود غلط وهو سليم. اللي بيهم فعلًا
     إن التوكن مش الرقم نفسه، ومش متكرر مع عميل تاني، وفيه عشوائية. */
  const otherTokens = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("factory-ledger.v1:"));
    const db = JSON.parse(localStorage.getItem(key));
    return (db.portalGrants ?? []).map((g) => [g.partyId, g.token]);
  });
  ok("والتوكن مش رقم العميل ولا جواه", !token.includes(target.id), target.id);
  ok(
    "ومافيش عميل تاني عنده نفس التوكن",
    otherTokens.filter(([id, t]) => id !== target.id && t === token).length === 0,
  );
  const distinct = new Set(token).size;
  ok("وفيه عشوائية حقيقية مش رقم مكمّل بأصفار", distinct >= 10, `${distinct} حرف مختلف`);

  const shown = await body();
  ok("الكارت بيقول اللينك لسه مااتفتحش", /لسه مااتفتحش/.test(shown));
  ok("وبيقول مين فتحه وامتى", /فتحه/.test(shown));
  ok("وبيقول الحد الحالي بصراحة", /الدفتر لسه محفوظ على الجهاز/.test(shown));

  /* تاني ضغطة مالهاش لازمة تعمل لينك تاني — لينكين معناهم إن توقيف
     واحد مابيقفلش الباب */
  await open(`/parties/${target.id}`);
  await page.getByRole("button", { name: "كشف الحساب" }).first().click();
  await page.getByLabel("لينك بورتال العميل").waitFor({ timeout: 15_000 });
  const again = await page.getByLabel("لينك بورتال العميل").inputValue();
  ok("وفتح تاني بيرجّع نفس اللينك مش واحد جديد", again === url, `${url} ≠ ${again}`);

  const count = await page.evaluate((id) => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("factory-ledger.v1:"));
    const db = JSON.parse(localStorage.getItem(key));
    return (db.portalGrants ?? []).filter((g) => g.partyId === id && !g.revokedAt).length;
  }, target.id);
  ok("ولينك واحد بس شغّال للعميل", count === 1, `${count}`);

  /* ── اللينك بيشتغل ───────────────────────────────────────── */
  console.log("\n— اللينك بيفتح حساب العميل الصح —");
  await open(`/p/${token}`);
  const portal = await body();
  ok("بيفتح على العميل ده بالاسم", portal.includes(target.name), portal.slice(0, 80));
  ok("وبيعرض اللي عليه", /اللي عليك دلوقتي/.test(portal));

  /* ── النطاق ──────────────────────────────────────────────── */
  console.log("\n— النطاق —");
  await open(`/parties/${target.id}`);
  await page.getByRole("button", { name: "كشف الحساب" }).first().click();
  await page.getByText("العميل يشوف إيه").first().waitFor({ timeout: 15_000 });
  const chip = page.getByRole("button", { name: "كشف حساب بالرصيد الجاري" }).first();
  ok("وفيه مفاتيح لكل حاجة العميل يشوفها", await chip.isVisible());
  ok("والمفتاح مفتوح افتراضيًا", (await chip.getAttribute("aria-pressed")) === "true");
  await chip.click();
  await page.waitForFunction(
    () => document.querySelector('[aria-pressed="false"]') !== null,
    null,
    { timeout: 10_000 },
  );
  ok("وبيتقفل لما نضغطه", (await chip.getAttribute("aria-pressed")) === "false");

  await open(`/p/${token}`);
  const narrowed = await page.locator("body").innerText();
  ok("والعميل بقى مايشوفش كشف الحساب", !/كشف الحساب/.test(narrowed));
  ok("وباقي حسابه لسه بيبان", /اللي عليك دلوقتي/.test(narrowed));

  /* ── التوقيف ─────────────────────────────────────────────── */
  console.log("\n— التوقيف —");
  await open(`/parties/${target.id}`);
  await page.getByRole("button", { name: "كشف الحساب" }).first().click();
  await page.getByRole("button", { name: /وقّف اللينك/ }).first().click();
  const confirm = page.getByRole("button", { name: /^وقّف اللينك$/ }).last();
  ok("التوقيف مابيحصلش من غير سبب", await confirm.isDisabled());
  await page.locator("textarea").first().fill("اختبار التوقيف");
  await confirm.click();
  await page.getByRole("button", { name: /افتح لينك للعميل/ }).first().waitFor({ timeout: 15_000 });
  ok("بعد التوقيف الكارت بيرجع يعرض فتح لينك جديد", true);
  ok("وبيقول فيه لينكات اتوقفت", /اتوقف/.test(await body()));

  await open(`/p/${token}`);
  const dead = await page.locator("body").innerText();
  ok("واللينك الموقوف بيبطّل يفتح فعلًا", /اتوقف/.test(dead), dead.slice(0, 80));
  ok("ومايعرضش اسم العميل", !dead.includes(target.name));
  ok("وبيقول السبب المسجّل", /اختبار التوقيف/.test(dead));

  /* السجل بيفضل — التوقيف مش مسح */
  const kept = await page.evaluate((id) => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("factory-ledger.v1:"));
    const db = JSON.parse(localStorage.getItem(key));
    const rows = (db.portalGrants ?? []).filter((g) => g.partyId === id);
    return { total: rows.length, revoked: rows.filter((g) => g.revokedAt).length };
  }, target.id);
  ok("والسجل مانمسحش — بيفضل بتاريخ التوقيف", kept.total === 1 && kept.revoked === 1, JSON.stringify(kept));

  ok("مافيش أخطاء كونسول", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  await bail(e);
}

await browser.close();
console.log(`\n${pass} نجحت · ${fail} فشلت`);
process.exit(fail ? 1 : 0);
