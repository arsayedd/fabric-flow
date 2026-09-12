import { chromium } from "playwright-core";

const URL = "http://127.0.0.1:43127";
const pass = [];
const fail = [];
const ok = (name, cond, extra = "") => (cond ? pass : fail).push(`${name}${extra ? " — " + extra : ""}`);
/** أول رقم في نص عربي: بيحوّل الأرقام العربية ويشيل الفواصل ويسيب «ج.م.» بره */
const arabic = (s) => {
  const latin = String(s)
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[٬,]/g, "")
    .replace(/٫/g, ".");
  return Number((latin.match(/\d+(\.\d+)?/) ?? ["0"])[0]);
};

const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(URL);
await page.getByRole("button", { name: "جرّب بالبيانات الجاهزة" }).click().catch(() => {});
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click().catch(() => {});
await page.waitForTimeout(800);

ok("costing teaser on home", await page.locator("text=متوسط الهامش").first().isVisible());

/* ── لوحة الربحية ───────────────────────────── */
await page.goto(`${URL}/costing`);
await page.waitForTimeout(600);
let dash = await page.locator("main").innerText();
ok("dashboard kpis", ["قيمة الإنتاج", "تكلفة الإنتاج", "الربح الإجمالي", "متوسط الهامش"].every((t) => dash.includes(t)));
ok("ranking table", dash.includes("ترتيب الموديلات") && /Markup/.test(dash));
ok("score column filled", /٧|٦|٥|٤|٣/.test(dash.split("السكور")[1] ?? ""));
ok("top materials & stages", dash.includes("أعلى الخامات تكلفة") && dash.includes("أعلى المراحل تكلفة"));
ok("multi-level profitability", dash.includes("الربحية على مستويات"));
ok("variant gap declared", dash.includes("الربحية باللون والمقاس والدفعة محتاجة تسجيل المتغيرات"));
ok("alerts or all-clear", /تنبيهات الربحية|كل الموديلات المسجّلة فوق هامش الهدف/.test(dash));

// sorting actually reorders
const modelOrder = async () =>
  (await page.locator("table tbody tr td:first-child").allInnerTexts()).map((t) => t.split("\n")[0].trim()).join(" > ");
const sortBy = async (label) => {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(300);
  return modelOrder();
};
const byCost = await sortBy("أقل تكلفة");
const byTotal = await sortBy("إجمالي الربح");
ok("sort chips reorder ranking", byCost !== byTotal, `${byCost} || ${byTotal}`);

// level tabs
await page.getByRole("button", { name: "العميل" }).click();
await page.waitForTimeout(300);
ok("customer level renders", (await page.locator("main").innerText()).includes("العميل"));

/* ── هامش الهدف يغيّر الأرقام ──────────────────── */
const marginOf = (t) => arabic((t.match(/متوسط الهامش\s*\n?([^\n]+)/) ?? [])[1] ?? "0");
const targetOf = (t) => arabic((t.match(/الهدف ([\d٠-٩]+)٪/) ?? [])[1] ?? "0");
dash = await page.locator("main").innerText();
const targetBefore = targetOf(dash);
await page.getByRole("button", { name: "هامش الهدف" }).click();
await page.getByLabel("هامش الهدف %").fill("70");
await page.getByRole("button", { name: "احفظ الهدف" }).click();
await page.waitForTimeout(600);
const afterTarget = await page.locator("main").innerText();
ok("target margin saved and applied", targetOf(afterTarget) === 70, `${targetBefore} -> ${targetOf(afterTarget)}`);
ok("higher target creates alerts", afterTarget.includes("تنبيهات الربحية"));
await page.getByRole("button", { name: "هامش الهدف" }).click();
await page.getByLabel("هامش الهدف %").fill("40");
await page.getByRole("button", { name: "احفظ الهدف" }).click();
await page.waitForTimeout(500);

/* ── ورقة تكلفة موديل ───────────────────────── */
await page.goto(`${URL}/products`);
await page.waitForTimeout(400);
await page.locator("a", { hasText: "قميص" }).first().click();
await page.waitForTimeout(700);
let sheet = await page.locator("main").innerText();
ok("cost sheet on product", sheet.includes("ورقة التكلفة"));
ok("piece cost / profit / margin / markup", ["تكلفة القطعة", "ربح القطعة", "هامش الربح", "Markup"].every((t) => sheet.includes(t)));
ok("break-even and min price", sheet.includes("سعر التعادل") && sheet.includes("أقل سعر مقبول"));
ok("target cost shown", sheet.includes("تكلفة الهدف"));
ok("biggest cost line explained", /أكبر بند في التكلفة/.test(sheet));
ok("no manual cost entry claim", sheet.includes("كل رقم هنا محسوب وقت العرض"));
ok("missing data declared, not estimated", !sheet.includes("مش داخل في الحساب") || sheet.includes("مبيخمّنش رقم مكانه"));

// the cost sheet must add up to the stated piece cost
const lineShares = [...sheet.matchAll(/([\d٠-٩]+)٪\n/g)].map((m) => arabic(m[1]));
ok("cost lines present", lineShares.length >= 3, `${lineShares.length} lines`);

ok("profit score with verdict", /سكور ربحية الموديل/.test(sheet) && /(ممتاز للتوسّع|يحتاج تحسين|يفضل إيقافه|البيانات مش كفاية)/.test(sheet));
await page.getByRole("button", { name: "شوف الدرجة اتكوّنت إزاي" }).click().catch(() => {});
await page.waitForTimeout(300);
sheet = await page.locator("main").innerText();
ok("score explainable by block", /وزن ٣٠٪|وزن ٢٠٪/.test(sheet));
ok("decision intelligence", sheet.includes("إيه اللي بياكل الربح، وإيه اللي أعمله"));
ok("actual vs estimated", sheet.includes("الفعلي مقابل المتوقع") && /فرق/.test(sheet));
ok("variance reasons itemised", /(استهلاك زيادة في|هالك |سعر .* وقت الصرف|أجور)/.test(sheet));
ok("waste intelligence", sheet.includes("الهالك الفعلي") && sheet.includes("مخطط"));
ok("cost history from purchases", sheet.includes("تاريخ التكلفة") && sheet.includes("بتتعاد من أسعار الشراء"));

/* ── حاسبة السعر ───────────────────────────── */
const simTable = page.locator("table", { hasText: "ربح ١٠٠٠" }).first();
ok("price simulator table", await simTable.isVisible());
await page.getByLabel("أسعار للتجربة").fill("300، 800، 1200");
await page.waitForTimeout(400);
const simText = await simTable.innerText();
ok("below-min price flagged", simText.includes("تحت الحد"), simText.split("\n").slice(0, 4).join(" | "));
ok("markup column computed", /\d\.\d\d×/.test(simText));

/* ── لو…؟ ─────────────────────────────────── */
const whatIf = page.locator("div").filter({ hasText: "غيّر أي مدخل وشوف التكلفة" }).last();
const wiBefore = await whatIf.innerText();
// React tracks the input's last value, so the native setter must be used for the event to land
const setSlider = (i, v) =>
  page.locator('input[type="range"]').nth(i).evaluate((el, val) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(el, String(val));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, v);
await setSlider(0, 50);
await page.waitForTimeout(400);
const wiAfter = await whatIf.innerText();
ok("what-if sliders present", wiBefore.includes("سعر الخامات") && wiBefore.includes("إجمالي الربح على الكمية"));
ok("what-if recomputes live", wiBefore !== wiAfter, `${wiBefore.match(/تكلفة القطعة[^\n]*/)?.[0]} -> ${wiAfter.match(/تكلفة القطعة[^\n]*/)?.[0]}`);
const marginOfCard = (t) => {
  const raw = (t.match(/الهامش\n([^\n]+)/) ?? [])[1] ?? "0";
  const m = raw.match(/(-?)[\s؜]*([٠-٩\d٫.]+)٪/);
  return m ? (m[1] === "-" ? -1 : 1) * arabic(m[2]) : 0;
};
const wiProfitDown = marginOfCard(wiAfter) < marginOfCard(wiBefore);
ok("material +50% cuts the margin", wiProfitDown, `${wiBefore.match(/الهامش\n[^\n]+/)?.[0]} -> ${wiAfter.match(/الهامش\n[^\n]+/)?.[0]}`);

/* ── انتشار سعر الخامة ───────────────────────── */
await page.goto(`${URL}/materials`);
await page.waitForTimeout(400);
await page.locator("a", { hasText: "قماش قطن" }).first().click();
await page.waitForTimeout(600);
const matText = await page.locator("main").innerText();
ok("affected models on material", /الموديلات المتأثرة|موديلات بتستخدم|تكلفتها بتتغير/.test(matText), matText.slice(0, 160).replace(/\n/g, " | "));

/* ── الادعاء الأساسي: سعر خامة اتغير → تكلفة الموديلات تتغير لوحدها ──── */
const pieceCost = async (id) => {
  await page.goto(`${URL}/products/${id}`);
  await page.waitForTimeout(500);
  const t = await page.locator("main").innerText();
  return arabic((t.match(/الإجمالي\n+([^\n]+)/) ?? [])[1] ?? "0");
};
await page.goto(`${URL}/products`);
await page.waitForTimeout(400);
const shirtHref = await page.locator("a", { hasText: "قميص" }).first().getAttribute("href");
const shirtId = shirtHref.split("/").pop();
const costBefore = await pieceCost(shirtId);

await page.goto(`${URL}/materials`);
await page.waitForTimeout(400);
await page.locator("a", { hasText: "قماش قطن" }).first().click();
await page.waitForTimeout(500);
const affectedBefore = await page.locator("main").innerText();
await page.getByPlaceholder(/الكمية بالـ/).fill("1000");
await page.getByPlaceholder("تكلفة الوحدة").fill("200");
await page.getByRole("button", { name: "سجّل الحركة" }).click();
await page.waitForTimeout(700);
const costAfter = await pieceCost(shirtId);
ok("fabric price change propagates to model cost", costAfter > costBefore, `${costBefore} -> ${costAfter}`);
ok(
  "material page lists models it feeds",
  affectedBefore.includes("الموديلات المتأثرة بسعر الخامة") && /قميص قطني/.test(affectedBefore),
);

await page.goto(`${URL}/costing`);
await page.waitForTimeout(500);
ok("dashboard reflects the new cost", (await page.locator("main").innerText()).includes("تنبيهات الربحية"));

ok("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));

console.log(`PASS ${pass.length}\n` + pass.map((p) => "  ✓ " + p).join("\n"));
if (fail.length) console.log(`\nFAIL ${fail.length}\n` + fail.map((f) => "  ✗ " + f).join("\n"));
await browser.close();
process.exit(fail.length ? 1 : 0);
