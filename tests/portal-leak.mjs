/**
 * بورتال العميل: هل بيسرّب حاجة؟
 *
 * ده أهم اختبار في الميزة، وسببه إن الصفحة **مفتوحة** — مافيش تسجيل
 * دخول، واللي معاه اللينك بيقرا. فالسؤال مش «الصفحة بتعرض صح» لكن
 * «الصفحة بتعرض حاجة مش من حقه يشوفها».
 *
 * والطريقة: بنقرا دفتر المصنع من `localStorage` جوه المتصفح، ونطلّع منه
 * **القيم اللي ممنوعة بالأرقام** — تكلفة القطعة، سعرها، الهامش،
 * الملاحظات الداخلية، وأسماء العملاء التانيين وأرقامهم. وبعدين نفتح
 * البورتال وندوّر على النصوص دي في الصفحة المرسومة.
 *
 * الفرق بين ده وبين «قرينا الكود وشكله مظبوط» إنه بيمسك التسريب لو جه من
 * أي طريق: حقل اتضاف للمشروع، أو رقم اتحسب في الـJSX، أو مكوّن مشترك
 * بيعرض أكتر من اللي بيتبعتله.
 *
 * وكمان بنتأكد إن التوكن نفسه هو الصلاحية: توكن غلط، ومسحوب، ومنتهي —
 * كلهم مايعرضوش أرقام.
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

const seed = read("src/store/seed.ts");
const TOKEN = seed.match(/DEMO_PORTAL_TOKEN\s*=\s*"([0-9a-f]+)"/)?.[1];
if (!TOKEN) throw new Error("مش لاقي DEMO_PORTAL_TOKEN في seed.ts");
const PARTY = seed.match(/partyId:\s*"(cl-\d+)",\s*\n\s*token:\s*DEMO_PORTAL_TOKEN/)?.[1] ?? "cl-2";

const acc = read("src/store/account.ts");
const pick = (key) => acc.match(new RegExp(`${key}:\\s*"([^"]+)"`))?.[1] ?? "";
const LOGIN = { email: pick("email"), password: pick("password") };

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
const ctx = await browser.newContext({ viewport: { width: 1340, height: 900 }, locale: "ar-EG" });
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
  /* ── ١) نزرع الدفتر التجريبي بالدخول العادي ─────────────────── */
  console.log("\n— تجهيز —");
  await open("/login");
  await page.getByPlaceholder(/@/).first().fill(LOGIN.email);
  await page.locator('input[type="password"]').first().fill(LOGIN.password);
  await page.getByRole("button", { name: /دخول|تسجيل/ }).first().click();
  /* الانتظار على المفتاح نفسه مش على نص الشاشة: الدفتر بيتكتب في
     `useEffect` بعد الرسم، فنص «مصنع النور» بيظهر قبل ما يتخزّن */
  await page
    .waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith("factory-ledger.v1:")), null, {
      timeout: 20_000,
    })
    .catch(() => {});
  ok("الدفتر التجريبي اتزرع", true);

  /* ── ٢) القيم الممنوعة — من الدفتر نفسه ───────────────────── */
  const secret = await page.evaluate((partyId) => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("factory-ledger.v1:"));
    const db = JSON.parse(localStorage.getItem(key));
    const nums = new Set();
    const push = (n) => {
      if (typeof n === "number" && Number.isFinite(n) && Math.abs(n) > 1) nums.add(String(Math.round(n)));
    };

    /* تكلفة وسعر وهامش كل أمر للعميل ده — ده اللي العميل ممنوع يشوفه */
    const mine = db.orders.filter((o) => o.clientId === partyId);
    for (const o of mine) {
      push(o.pieceCost);
      push(o.piecePrice);
      push(o.pieceCost * o.quantity);
      push((o.piecePrice - o.pieceCost) * o.quantity);
    }

    const me = db.parties.find((p) => p.id === partyId);
    const others = db.parties.filter((p) => p.id !== partyId && !p.mergedIntoId);

    return {
      costNumbers: [...nums],
      internalNotes: (me?.internalNotes ?? "").trim(),
      myName: me?.name ?? "",
      otherNames: others.map((p) => p.name).filter((n) => n && n.length > 6),
      otherPhones: others.map((p) => p.phone).filter((p) => p && p.length > 8),
      orderCount: mine.length,
      /* حسابات المصنع — حاجة تانية خالص مالهاش لازمة تبان */
      accountNames: (db.accounts ?? []).map((a) => a.name).filter((n) => n && n.length > 4),
      workerNames: (db.workers ?? []).map((w) => w.name).filter((n) => n && n.length > 6),
    };
  }, PARTY);

  ok("لقينا أرقام تكلفة وربح نختبر بيها", secret.costNumbers.length > 0, `${secret.costNumbers.length} رقم`);
  ok("والعميل عنده أوامر إنتاج فعلًا", secret.orderCount > 0, `${secret.orderCount} أمر`);
  ok("وفيه عملاء تانيين نتأكد إنهم مش ظاهرين", secret.otherNames.length > 2, `${secret.otherNames.length}`);

  /* ── ٣) البورتال بيفتح ─────────────────────────────────────── */
  console.log("\n— البورتال —");
  await open(`/p/${TOKEN}`);
  const text = await page.locator("body").innerText();

  /*
   * التسريب بيتقاس على **كل التابات**، مش على اللي فاتح افتراضيًا.
   *
   * وده مش احتياط نظري: أول نسخة من الاختبار ده قرت التاب الأول بس،
   * فلما حقنّا تكلفة القطعة في جدول الأوامر بالقصد الاختبار نجح على
   * الفاضي. اختبار أمان بيقرا جزء من الشاشة مابيأمّنش الشاشة.
   */
  const tabs = page.locator('[role="tab"]');
  const tabCount = await tabs.count();
  let seen = text;
  let html = await page.content();
  for (let i = 0; i < tabCount; i++) {
    await tabs.nth(i).click();
    await page.locator("table, [class*='text-center']").first().waitFor({ timeout: 10_000 }).catch(() => {});
    seen += `\n${await page.locator("body").innerText()}`;
    html += await page.content();
  }
  ok("بنقرا كل تابات الصفحة مش الأول بس", tabCount >= 4, `${tabCount} تاب`);

  ok("اللينك بيفتح حساب العميل", text.includes(secret.myName), text.slice(0, 90));
  ok("وبيقول اللي عليه", /اللي عليك دلوقتي/.test(text));
  ok("وبيقول اللي سدّده", /اللي سدّدته/.test(text));
  ok("وبيعرض توريداته", /التوريدات/.test(text));

  /* ── ٤) التسريب ───────────────────────────────────────────── */
  console.log("\n— التسريب —");

  /* الأرقام بتتقارن على الصيغة اللاتينية والعربية — الواجهة بتكتب
     بالأرقام العربية، فمقارنة لاتينية بس كانت هتنجح على الفاضي */
  const arabize = (s) => s.replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
  const shown = `${seen} ${arabize(seen)}`;
  const leakedNums = secret.costNumbers.filter((n) => shown.includes(n) || shown.includes(arabize(n)));
  ok("مافيش تكلفة قطعة ولا سعرها ولا الربح في الصفحة", leakedNums.length === 0, leakedNums.join(" · "));

  ok(
    "ومافيش اسم أي عميل تاني",
    !secret.otherNames.some((n) => seen.includes(n)),
    secret.otherNames.filter((n) => seen.includes(n)).join(" · "),
  );
  ok(
    "ومافيش تليفون أي عميل تاني",
    !secret.otherPhones.some((p) => seen.includes(p)),
    secret.otherPhones.filter((p) => seen.includes(p)).join(" · "),
  );
  ok(
    "ومافيش أسماء حسابات المصنع",
    !secret.accountNames.some((n) => seen.includes(n)),
    secret.accountNames.filter((n) => seen.includes(n)).join(" · "),
  );
  ok(
    "ومافيش أسماء عمال",
    !secret.workerNames.some((n) => seen.includes(n)),
    secret.workerNames.filter((n) => seen.includes(n)).join(" · "),
  );
  if (secret.internalNotes) {
    ok("ومافيش الملاحظات الداخلية", !seen.includes(secret.internalNotes));
  } else {
    ok("ومافيش الملاحظات الداخلية (مافيش ملاحظات على العميل ده)", true);
  }

  /* الحقول نفسها مش في الـHTML — حتى لو مش معروضة للعين */
  const words = ["pieceCost", "piecePrice", "internalNotes", "creditLimit", "profitTotal"];
  const inHtml = words.filter((w) => html.includes(w));
  ok("ومافيش أسامي حقول حساسة في الـHTML نفسه", inHtml.length === 0, inHtml.join(" · "));

  /* ── ٥) مافيش مدخل لباقي النظام ────────────────────────────── */
  console.log("\n— الصفحة مقفولة على نفسها —");
  const nav = await page.locator("nav, aside").count();
  ok("مافيش قائمة المصنع في صفحة العميل", nav === 0, `${nav} عنصر`);
  const links = await page.locator("a[href^='/']").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  ok("ومافيش لينك داخلي لأي شاشة في النظام", links.length === 0, links.join(" · "));

  /* ── ٦) التوكن هو الصلاحية ────────────────────────────────── */
  console.log("\n— التوكن —");
  await open("/p/0000000000000000000000000000000000000000");
  const bad = await page.locator("body").innerText();
  ok("توكن غلط مايعرضش أي أرقام", /مش لاقيين الرابط/.test(bad), bad.slice(0, 80));
  ok("وبرضو مافيش اسم العميل", !bad.includes(secret.myName));

  await open(`/p/${TOKEN.slice(0, -1)}`);
  const trimmed = await page.locator("body").innerText();
  ok("توكن ناقص حرف مايفتحش", /مش لاقيين الرابط/.test(trimmed));

  /* السحب: بنرجع للنظام، نوقف اللينك، ونجرّبه تاني */
  await open("/parties");
  await page.evaluate((partyId) => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("factory-ledger.v1:"));
    const db = JSON.parse(localStorage.getItem(key));
    db.portalGrants = db.portalGrants.map((g) =>
      g.partyId === partyId ? { ...g, revokedAt: new Date().toISOString(), revokedReason: "اختبار" } : g,
    );
    localStorage.setItem(key, JSON.stringify(db));
  }, PARTY);

  await open(`/p/${TOKEN}`);
  const revoked = await page.locator("body").innerText();
  ok("لينك مسحوب بيقول اتوقف", /اتوقف/.test(revoked), revoked.slice(0, 80));
  ok("ومايعرضش اسم العميل", !revoked.includes(secret.myName));
  ok(
    "ومايعرضش أي رقم من الحساب",
    !secret.costNumbers.some((n) => revoked.includes(n) || revoked.includes(arabize(n))),
  );

  ok("مافيش أخطاء كونسول", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  await bail(e);
}

await browser.close();
console.log(`\n${pass} نجحت · ${fail} فشلت`);
process.exit(fail ? 1 : 0);
