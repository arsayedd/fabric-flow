/**
 * رحلة مصنع كاملة — عميل ← منتج ← خامة ← توريد ← استلام ← أمر إنتاج ← قص ←
 * باندل ← تشغيل ← جودة ← تسليم ← تحصيل ← ربح ← مرتجع.
 *
 * الفرق بين الهارنس ده وباقي الهارنسات: هنا مابنتأكدش إن الشاشة بتفتح. كل
 * خطوة بتتنفّذ من الواجهة زي أي مستخدم، وبعدها بنقرا الدفتر الخام من
 * localStorage ونحسب الرقم المتوقع بإيدينا من الحركات، ونقارنه باللي
 * السيستم كتبه. التأكيد بيطبع المتوقع والفعلي دايمًا.
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
const eq = (label, expected, actual, tol = 0.01) =>
  ok(label, Math.abs(Number(expected) - Number(actual)) <= tol, `متوقع ${expected} · فعلي ${actual}`);
const step = (n, title) => console.log(`\n— ${n}) ${title}`);

const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
};
const main = () => page.locator("main").innerText();
const panel = () => page.locator("div.fixed.inset-0.z-50");
const open = async (name) => {
  await page.getByRole("button", { name, exact: true }).first().click();
  await page.waitForTimeout(700);
};
const rx = (label) => new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
const field = (label) =>
  panel()
    .locator("label")
    .filter({ hasText: rx(label) })
    .first();
const text = async (label, v) => field(label).locator("input,textarea").first().fill(String(v));
const pick = async (label, v) => field(label).locator("select").first().selectOption({ label: v });
/* نفس الفكرة بس على الشاشة نفسها مش جوه بانل */
const mfield = (label) =>
  page
    .locator("main label")
    .filter({ hasText: rx(label) })
    .first();
const tap = async (name) => {
  await panel().getByRole("button", { name, exact: true }).first().click();
  await page.waitForTimeout(700);
};

const ledger = () =>
  page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith("factory-ledger"));
    return JSON.parse(localStorage.getItem(k) ?? "{}");
  });
/* رصيد الخامة محسوب من الحركات نفسها — مش من أي دالة في التطبيق */
const stockOf = (db, itemId) =>
  db.stockMovements.filter((m) => m.itemId === itemId).reduce((s, m) => s + Number(m.qty), 0);
/* السجل الجديد = اللي مش موجود في صورة الدفتر قبل الخطوة، مش آخر عنصر في
   المصفوفة — الترتيب في الدفتر مش مضمون */
const fresh = (now = [], before = []) => {
  const ids = new Set(before.map((r) => r.id));
  return now.filter((r) => !ids.has(r.id));
};
/* كارت فيه كود معيّن — عشان نضغط زرار الكارت الصح مش أول زرار في الشاشة */
const cardOf = (code, btn) =>
  page.locator(
    `xpath=//*[normalize-space(text())='${code}']/ancestor::div[.//button[normalize-space(text())='${btn}']][1]`,
  );
const digits = (s) => s.replace(/[^٠-٩٫]/g, "");
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86_400_000);
const arNum = (n) =>
  String(n)
    .replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)])
    .replace(".", "٫");

const NAME = {
  client: "أزياء المعادي",
  product: "قميص كتان رجالي",
  material: "قماش كتان مصري",
};

/* ── دخول بحساب صاحب المصنع على الداتا التجريبية ───────────────── */
await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.waitForTimeout(1200);
const start = await ledger();
console.log(
  `الدفتر قبل الرحلة: ${Object.values(start).filter(Array.isArray).reduce((s, a) => s + a.length, 0)} سجل`,
);

/* ── ١) عميل جديد ───────────────────────────────────────────────── */
step(1, "عميل جديد");
await go("/parties");
await open("جهة جديدة");
await tap("شركة");
await text("اسم الشركة", NAME.client);
/* «عميل» متحدّد أصلًا لما البانل يفتح — فمابنضغطش عليه عشان مانشيلهوش */
const roleBtn = panel().locator("button").filter({ hasText: /^عميل$/ }).first();
ok("دور «عميل» متحدّد من الأول", (await roleBtn.getAttribute("class"))?.includes("bg-accent"));
await text("موبايل واتساب", "01099887766");
await text("حد الائتمان", 60000);
await text("مدة السماح بالأيام", 30);
await tap("حفظ الجهة");
let db = await ledger();
const client = db.parties.find((p) => p.name === NAME.client);
ok("العميل اتسجّل", !!client);
eq("عدد الجهات زاد واحد", start.parties.length + 1, db.parties.length);
ok("العميل مربوط بالمصنع", client?.factoryId === start.parties[0].factoryId, client?.factoryId);
ok("دوره «عميل»", client?.roles?.includes("customer"), (client?.roles ?? []).join(","));
eq("حد الائتمان اتخزّن", 60000, client?.creditLimit);
eq("مدة السماح اتخزّنت", 30, client?.paymentTermDays);
ok("بيبان في كشف الجهات", (await main()).includes(NAME.client));
ok("الحركة اتسجّلت في سجل التغييرات", db.auditLog.length > start.auditLog.length, `${db.auditLog.length}`);

/* ── ٢) منتج جديد ───────────────────────────────────────────────── */
step(2, "منتج جديد");
await go("/products");
await open("منتج جديد");
await text("اسم المنتج", NAME.product);
await pick("الفئة", "قمصان");
await pick("وحدة البيع", "قطعة");
await text("سعر البيع", 180);
await tap("حفظ المنتج");
db = await ledger();
const product = db.products.find((p) => p.name === NAME.product);
ok("المنتج اتسجّل", !!product);
eq("سعر البيع اتخزّن", 180, product?.sellPrice);
ok("الكود اتولّد", !!product?.sku, product?.sku);
ok(
  "الكود مش مكرر",
  new Set(db.products.map((p) => p.sku)).size === db.products.length,
  db.products.map((p) => p.sku).join(","),
);

/* ── ٣) خامة جديدة ──────────────────────────────────────────────── */
step(3, "خامة جديدة");
await go("/materials");
await open("خامة جديدة");
await text("اسم الخامة", NAME.material);
await pick("الفئة", "أقمشة");
await pick("الوحدة", "متر");
await text("تكلفة الوحدة", 120);
await text("حد إعادة الطلب", 100);
await text("مدة التوريد", 7);
await tap("حفظ الخامة");
db = await ledger();
const material = db.materials.find((m) => m.name === NAME.material);
ok("الخامة اتسجّلت", !!material);
eq("رصيدها صفر قبل أي استلام", 0, stockOf(db, material?.id ?? "x"));
ok("بتبان تحت حد إعادة الطلب", (await main()).includes(NAME.material));

/* ── ٤) أمر توريد واستلام جزئي ──────────────────────────────────── */
step(4, "أمر توريد واستلام جزئي");
let prev = await ledger();
await go("/supply");
await open("أمر توريد");
await pick("المورّد", "أقمشة الدلتا");
await pick("الخامة", NAME.material);
await text("الكمية", 500);
await text("سعر الوحدة", 118);
await tap("افتح الأمر");
db = await ledger();
const so = fresh(db.supplyOrders, prev.supplyOrders)[0];
const soLines = fresh(db.supplyOrderLines, prev.supplyOrderLines);
ok("أمر توريد واحد بس اتفتح", fresh(db.supplyOrders, prev.supplyOrders).length === 1, so?.code);
eq("سطر واحد في الأمر", 1, soLines.length);
eq("الكمية المتفق عليها", 500, soLines[0]?.qtyOrdered);
eq("قيمة الأمر = ٥٠٠ × ١١٨", 500 * 118, (soLines[0]?.qtyOrdered ?? 0) * (soLines[0]?.unitPrice ?? 0));
ok("الأمر مفتوح", so?.status === "open", so?.status);
ok("الأمر مربوط بالمورّد الصح", db.parties.find((x) => x.id === so?.partyId)?.name === "أقمشة الدلتا");

/* استلام ٣٠٠ من ٥٠٠ — الباقي لازم يفضل مفتوح على المورّد */
prev = db;
const beforeStock = stockOf(db, material.id);
await go("/supply");
await cardOf(so.code, "سجّل استلام").getByRole("button", { name: "سجّل استلام", exact: true }).first().click();
await page.waitForTimeout(700);
ok("بانل الاستلام فتح على الأمر بتاعنا", (await panel().innerText()).includes(so.code), so.code);
await pick("المخزن", "مخزن الخامات");
await text("اتقبل ودخل المخزن", 300);
await tap("سجّل الاستلام");
db = await ledger();
const receipt = fresh(db.supplyReceipts, prev.supplyReceipts)[0];
const rLines = fresh(db.supplyReceiptLines, prev.supplyReceiptLines);
const moves = fresh(db.stockMovements, prev.stockMovements);
ok("الاستلام اتسجّل", !!receipt, receipt?.code ?? "");
eq("حركة مخزون واحدة بس اتكتبت", 1, moves.length);
eq("الحركة بـ٣٠٠ داخل", 300, moves[0]?.qty);
ok("الحركة على الخامة الصح", moves[0]?.itemId === material.id);
ok("الحركة مربوطة بالاستلام", moves[0]?.refId === receipt?.id, `${moves[0]?.refType}`);
eq("رصيد الخامة بقى ٣٠٠", beforeStock + 300, stockOf(db, material.id));
eq("المقبول في السطر ٣٠٠", 300, rLines[0]?.qtyAccepted);
const soNow = db.supplyOrders.find((x) => x.id === so.id);
ok("الأمر بقى «استلام جزئي»", soNow?.status === "partial", soNow?.status);
await go("/supply");
const supplyText = await main();
eq(
  "الباقي على المورّد ٢٠٠",
  200,
  Number(digits(supplyText.match(/باقي\s*([٠-٩٬٫]+)/)?.[1] ?? "0").replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))),
);

/* ── ٥) قايمة خامات المنتج (BOM) ───────────────────────────────── */
step(5, "قايمة الخامات — متر ونص للقطعة + ٥٪ هالك");
prev = await ledger();
await go(`/products/${product.id}`);
await page.locator("main select").first().selectOption(material.id);
await page.locator("main input[placeholder='الكمية']").first().fill("1.6");
await page.locator("main input[placeholder='هالك ٪']").first().fill("5");
await page.getByRole("button", { name: "أضف", exact: true }).first().click();
await page.waitForTimeout(700);
db = await ledger();
const bomItem = fresh(db.bomItems, prev.bomItems)[0];
ok("سطر الخامة اتضاف للقايمة", !!bomItem);
eq("الكمية للقطعة", 1.6, bomItem?.qtyPerUnit);
eq("نسبة الهالك", 5, bomItem?.wastePct);
const matNow = db.materials.find((m) => m.id === material.id);
const effective = 1.6 * 1.05;
const lineCost = effective * matNow.avgCost;
const bomText = await main();
eq(
  "الكمية الفعلية = ١٫٦ + ٥٪",
  Number(effective.toFixed(2)),
  Number(digits(bomText.match(/=\s*([٠-٩٫٬]+)\s*متر/)?.[1] ?? "0").replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace("٫", ".")),
);
ok(
  "تكلفة السطر = الكمية الفعلية × متوسط تكلفة الخامة",
  bomText.includes(arNum(Math.round(lineCost))),
  `متوقع ${Math.round(lineCost)} (${matNow.avgCost} للمتر)`,
);

/* مسار العمليات — من غيره الباندل مايشتغلش، والتكلفة بتبقى خامات بس */
prev = await ledger();
const opSelect0 = page.locator("main select[aria-label='اختَر عملية']").first();
for (const [name, rate] of [["خياطة", 12], ["مكوى", 4]]) {
  await opSelect0.selectOption({ label: name });
  await page.locator("main input[placeholder='سعر القطعة']").first().fill(String(rate));
  await page.getByRole("button", { name: "أضف", exact: true }).last().click();
  await page.waitForTimeout(600);
}
db = await ledger();
const routes = fresh(db.routingSteps, prev.routingSteps);
eq("عمليتين اتضافوا للمسار", 2, routes.length);
eq("مصنعية القطعة = ١٢ + ٤", 16, routes.reduce((t, r) => t + r.rate, 0));

/* ── ٦) أمر إنتاج ٢٠٠ قطعة للعميل الجديد ───────────────────────── */
step(6, "أمر إنتاج ٢٠٠ قطعة بسعر ١٨٠");
prev = await ledger();
await go("/orders");
await open("أمر إنتاج");
await pick("اختَر منتج مسجّل", NAME.product);
await pick("خط الإنتاج", "الخط الأول");
await field("العميل").locator("select").first().selectOption(client.id);
await text("الكمية", 200);
await text("سعر بيع القطعة", 180);
await tap("حفظ أمر الإنتاج");
db = await ledger();
const order = fresh(db.orders, prev.orders)[0];
ok("الأمر اتفتح", !!order, order?.code);
eq("الكمية", 200, order?.quantity);
eq("سعر القطعة", 180, order?.piecePrice);
ok("مربوط بالعميل", order?.clientId === client.id);
ok("مربوط بالمنتج", order?.productId === product.id);
/* الأمر بيتربط بالقايمة وقت صرف الخامات، مش وقت الفتح — فاللي يهم هنا إن
   المنتج له قايمة نشطة يقدر يصرف منها */
ok(
  "المنتج له قايمة خامات نشطة",
  db.boms.some((b) => b.productId === product.id && b.status === "active"),
);
/* تكلفة القطعة = خامات القايمة + مصنعية المسار (مافيش) + تحميل ثابت للقطعة */
const overhead = db.settings?.overheadPerUnit ?? 0;
eq(
  "تكلفة القطعة = خامات + مصنعية + تحميل",
  Math.round(lineCost + 16 + overhead),
  Math.round(order?.pieceCost ?? 0),
  2,
);
await go(`/orders/${order.id}`);
const orderText = await main();
ok("صفحة الأمر بتقول الإيراد المتوقع ٣٦٬٠٠٠", orderText.includes(arNum("36,000".replace(",", "٬"))), "");

/* ── ٧) قص: ٤٠ طبقة × (١٫٥ + ٠٫١) = ٦٤ متر ──────────────────────── */
step(7, "فرشة وقص — الاستهلاك لازم يطلع من المخزن بالرقم");
prev = await ledger();
const stockBeforeCut = stockOf(db, material.id);
await go("/cutting");
await open("فرشة جديدة");
await field("أمر الإنتاج").locator("select").first().selectOption(order.id);
await field("القماش").locator("select").first().selectOption(material.id);
await text("اللون", "أوف وايت");
await text("عدد الطبقات", 40);
await text("طول الماركر", 1.5);
await text("فاقد الأطراف", 0.1);
await text("عرض الفرشة", 1.6);
/* البانل بيفتح بسطرين مقاس — بنشيل التاني عشان الحساب يبقى مقاس واحد */
const sizeRows = panel().locator("input[placeholder='المقاس']");
while ((await sizeRows.count()) > 1) {
  await panel().getByRole("button", { name: "شيل المقاس" }).last().click();
  await page.waitForTimeout(200);
}
await sizeRows.nth(0).fill("L");
await panel().locator("input[aria-label='عدد القطع في الطبقة']").nth(0).fill("2");
await tap("حفظ الفرشة");
db = await ledger();
const lay = fresh(db.cutLays, prev.cutLays)[0];
ok("الفرشة اتسجّلت", !!lay, lay?.id ?? "");
eq("الطبقات", 40, lay?.plies);
eq("القماش المخطط = (١٫٥ + ٠٫١) × ٤٠", 64, (lay.markerLengthM + lay.endAllowanceM) * lay.plies);
eq("القطع المخططة = ٢ × ٤٠", 80, fresh(db.cutLayLines, prev.cutLayLines).reduce((s, l) => s + l.perPly * lay.plies, 0));
eq("مافيش حركة مخزون قبل القص", 0, fresh(db.stockMovements, prev.stockMovements).length);

prev = db;
await go("/cutting");
const cutBtn = cardOf(order.code, "قص الفرشة").getByRole("button", { name: "قص الفرشة", exact: true });
ok("زرار «قص الفرشة» موجود على فرشة الأمر", (await cutBtn.count()) > 0, `${await cutBtn.count()}`);
await cutBtn.first().click();
await page.waitForTimeout(900);
/* القص بيسأل على القماش المستهلك فعلًا وحجم الباندل — بنسيب الفعلي فاضي
   عشان يتحسب بالمخطط، ونأكّد */
ok("القص بيسأل قبل ما يصرف من المخزن", (await panel().count()) > 0);
await tap("تأكيد القص");
db = await ledger();
const cutMoves = fresh(db.stockMovements, prev.stockMovements);
const newBundles = fresh(db.bundles, prev.bundles);
eq("القص كتب حركة صرف واحدة", 1, cutMoves.length);
eq("الصرف بالسالب ٦٤ متر", -64, cutMoves[0]?.qty);
eq("رصيد القماش بقى ٢٣٦", stockBeforeCut - 64, stockOf(db, material.id));
eq("الباندلات اتولّدت بـ٨٠ قطعة", 80, newBundles.reduce((s, b) => s + b.qty, 0));
ok("كل باندل ليه كود", newBundles.every((b) => !!b.code), newBundles.map((b) => b.code).join(","));

/* ── ٨) محطة العامل: تشغيل باندل وتسجيل الأجر ──────────────────── */
step(8, "تشغيل باندل على المحطة — الدقايق والأجر");
prev = await ledger();
const bundle = newBundles[0];
await go("/station");
await mfield("العامل").locator("select").first().selectOption({ label: "سامح علي" });
await page.locator("main input[aria-label='رقم الباندل']").fill(bundle.code);
await page.getByRole("button", { name: "جيب", exact: true }).first().click();
await page.waitForTimeout(900);
let stationText = await main();
ok("المحطة لقيت الباندل", stationText.includes(bundle.code), bundle.code);
/* المهم إن أول عملية في المسار مابتتعلّمش خالصة غلط بسبب القص */
ok("العملية الجاية هي الخياطة، مش مسكّرة بالغلط", stationText.includes("ابدأ خياطة"), "");
await page.getByRole("button", { name: "ابدأ خياطة", exact: true }).first().click();
await page.waitForTimeout(900);
db = await ledger();
const runningOp = fresh(db.bundleOps, prev.bundleOps)[0];
ok("العملية بدأت وانفتح لها سجل", !!runningOp, runningOp?.state);
ok("الأجر لسه ماتسجّلش قبل ما يخلّص", fresh(db.workerEarnings, prev.workerEarnings).length === 0);

/* خلّصت: الباندل كله — سليم + ١ إعادة + ١ تالف */
prev = db;
await page.getByRole("button", { name: "خلّصت", exact: true }).first().click();
await page.waitForTimeout(700);
await text("سليم", bundle.qty - 2);
await text("محتاج إعادة", 1);
await text("تالف", 1);
const defectSelect = field("سبب العيب").locator("select").first();
const defectOptions = (await defectSelect.innerText()).split("\n").filter((x) => x.trim() && !x.includes("اختار"));
await defectSelect.selectOption({ label: defectOptions[0] });
await tap("سجّل واقفل");
db = await ledger();
const stage = fresh(db.stageEntries, prev.stageEntries)[0];
const earning = fresh(db.workerEarnings, prev.workerEarnings)[0];
ok("مرحلة الشغل اتسجّلت", !!stage, stage?.id ?? "");
eq("السليم = كمية الباندل ناقص ٢", bundle.qty - 2, stage?.qtyGood);
eq("الإصلاح ١", 1, stage?.qtyRework);
eq("الهدر ١", 1, stage?.qtyScrap);
eq("مجموع المسجّل = كمية الباندل", bundle.qty, (stage?.qtyGood ?? 0) + (stage?.qtyRework ?? 0) + (stage?.qtyScrap ?? 0));
ok("أجر العامل بالقطعة اتسجّل", !!earning, earning?.notes ?? "");
eq("الأجر = ١٢ جنيه × القطع السليمة", 12 * (bundle.qty - 2), earning?.amount);

/* ── ٩) تسليم للعميل: ١٥٠ قطعة × ١٨٠ = ٢٧٬٠٠٠ ─────────────────── */
step(9, "تسليم وفاتورة — المستحق لازم يزيد بالرقم بالظبط");
prev = await ledger();
await go(`/parties/${client.id}`);
await open("توريد");
await text("المبلغ", 150 * 180);
await text("المنتج", NAME.product);
await text("الكمية", 150);
await tap("حفظ التوريد");
db = await ledger();
const delivery = fresh(db.deliveries, prev.deliveries)[0];
ok("التوريد اتسجّل", !!delivery, delivery?.id ?? "");
eq("قيمة التوريد = ١٥٠ × ١٨٠", 27000, delivery?.amount);
eq("الكمية", 150, delivery?.quantity);
ok("مربوط بالعميل", delivery?.clientId === client.id);
ok(
  "ميعاد الآجل = تاريخ التوريد + مدة السماح",
  daysBetween(delivery.date, delivery.dueDate) === 30,
  `${daysBetween(delivery.date, delivery.dueDate)} يوم`,
);
/* المستحق على العميل محسوب من الدفتر: توريداته ناقص تحصيلاته */
const owed = (d) =>
  d.deliveries.filter((x) => x.clientId === client.id).reduce((s, x) => s + x.amount, 0) -
  d.collections.filter((x) => x.clientId === client.id && x.status === "confirmed").reduce((s, x) => s + x.amount, 0);
eq("المستحق على العميل بقى ٢٧٬٠٠٠", 27000, owed(db));
const profileText = await main();
ok("صفحة العميل بتقول نفس الرقم", profileText.includes(arNum("27٬000".replace("000", "٠٠٠"))), "");

/* ── ١٠) تحصيل ٢٠٬٠٠٠ — الباقي ٧٬٠٠٠ ──────────────────────────── */
step(10, "تحصيل جزئي — الخزنة والمستحق لازم يتحركوا مع بعض");
prev = await ledger();
const cashBefore = prev.manualTx
  .concat(prev.collections.filter((c) => c.status === "confirmed"))
  .reduce((s, x) => s + (x.direction === "out" ? -x.amount : x.amount), 0);
await open("تحصيل");
await text("المبلغ", 20000);
await tap("حفظ التحصيل");
db = await ledger();
const collection = fresh(db.collections, prev.collections)[0];
ok("التحصيل اتسجّل", !!collection, collection?.method ?? "");
eq("المبلغ", 20000, collection?.amount);
ok("مربوط بالعميل", collection?.clientId === client.id);
ok("مربوط بحساب فلوس", !!collection?.accountId, collection?.accountId ?? "مافيش");
eq("الباقي على العميل ٧٬٠٠٠", 7000, owed(db));
eq(
  "الفلوس زادت ٢٠٬٠٠٠ في الحسابات",
  cashBefore + 20000,
  db.manualTx
    .concat(db.collections.filter((c) => c.status === "confirmed"))
    .reduce((s, x) => s + (x.direction === "out" ? -x.amount : x.amount), 0),
);

/* أعمار المستحقات لازم تعرف الـ٧٬٠٠٠ دي */
await go("/cashflow");
await page.getByRole("button", { name: "أعمار المستحقات", exact: true }).first().click();
await page.waitForTimeout(700);
/* الفلوس اللي ميعادها لسه جاي بتقع في تبويب «لسه ماستحقّش» — بنفتحه */
await page.getByRole("button", { name: /لسه ماستحقّش/ }).first().click();
await page.waitForTimeout(500);
const agingText = await main();
ok("تبويب «لسه ماستحقّش» فيه العميل الجديد", agingText.includes(NAME.client), "");
ok("و‏٧٬٠٠٠ باينة جواه", agingText.includes(arNum("7٬000".replace("000", "٠٠٠"))), "");

/* ── ١١) الربح: الإيراد ناقص التكلفة على نفس الأمر ─────────────── */
step(11, "الربحية — الإيراد والتكلفة على نفس الأمر");
await go("/costing");
const costingText = await main();
ok("المنتج الجديد في شاشة الربحية", costingText.includes(NAME.product), "");
const expectedProfitPerPiece = 180 - Math.round(lineCost + 16 + overhead);
ok(
  "ربح القطعة = السعر ناقص التكلفة",
  costingText.includes(arNum(expectedProfitPerPiece)) || costingText.includes(arNum(-expectedProfitPerPiece)),
  `متوقع ${expectedProfitPerPiece}`,
);

/* ── ١٢) مرتجع: ١٠ قطع من التسليم ──────────────────────────────── */
step(12, "مرتجع ١٠ قطع — القرار بيوزّعها");
prev = await ledger();
await go("/returns");
await open("مرتجع جديد");
await field("العميل").locator("select").first().selectOption({ label: NAME.client });
await field("المنتج الراجع").locator("select").first().selectOption({ label: NAME.product });
await text("الكمية", 10);
await text("قيمة الوحدة", 180);
await field("أمر الإنتاج").locator("select").first().selectOption(order.id);
await tap("سجّل المرتجع");
db = await ledger();
const ret = fresh(db.returns, prev.returns)[0];
ok("المرتجع اتسجّل", !!ret, ret?.code ?? ret?.id ?? "");
eq("الكمية الراجعة", 10, ret?.qty);
eq("قيمة المرتجع = ١٠ × ١٨٠", 1800, (ret?.qty ?? 0) * (ret?.unitValue ?? 0));
ok("مربوط بالعميل والأمر", ret?.partyId === client.id && ret?.orderId === order.id, `${ret?.partyId} · ${ret?.orderId}`);
const retText = await main();
ok("بيبان في دفتر المرتجعات", retText.includes(NAME.product), "");

/* ── ١٣) فحص المرتجع وقرار فيه ─────────────────────────────────── */
step(13, "فحص المرتجع وقرار — التكلفة بتتعلّق بالقرار");
prev = await ledger();
await cardOf(ret.code, "افحص").getByRole("button", { name: "افحص", exact: true }).first().click();
await page.waitForTimeout(700);
ok("بانل الفحص فتح", (await panel().innerText()).includes("الفحص"), "");
await text("الكمية المتأكدة", 10);
const probSelect = field("المشكلة إيه (مطلوبة)").locator("select").first();
const probs = (await probSelect.innerText()).split("\n").filter((x) => x.trim() && !x.includes("مافيش عيب"));
await probSelect.selectOption({ label: probs[0] });
await tap("سجّل الفحص");
db = await ledger();
const retAfter = db.returns.find((r) => r.id === ret.id);
ok("حالة المرتجع اتغيّرت بعد الفحص", retAfter?.status !== ret.status, `${ret.status} ← ${retAfter?.status}`);
eq("الكمية المتأكدة ١٠", 10, retAfter?.qty);
ok("المشكلة اتسجّلت بالاسم", !!retAfter?.problem, retAfter?.problem ?? "مافيش");

/* ── ١٤) مسح كود الباندل — نفس السلسلة من الأول ───────────────── */
step(14, "مسح الكود — التتبّع لازم يوصل من الباندل للأمر والعميل");
await go("/scan");
await page.locator("main input[aria-label='الكود']").fill(bundle.code);
await page.getByRole("button", { name: "جيب", exact: true }).first().click();
await page.waitForTimeout(900);
const scanText = await main();
ok("المسح لقى الباندل", scanText.includes(bundle.code), "");
ok("والمسح بيقول أمره", scanText.includes(order.code), "");
db = await ledger();
ok("المسح اتسجّل في دفتر المسح", db.scans.length > prev.scans.length, `${db.scans.length}`);
await go(`/trace/bundle/${bundle.id}`);
const traceText = await main();
ok("سلسلة التتبّع فيها القماش", traceText.includes(NAME.material), "");
ok("وفيها العميل", traceText.includes(NAME.client), "");

/* ── ١٥) تصدير — الجدول اللي على الشاشة هو اللي بينزل ──────────── */
step(15, "تصدير كشف الجهات");
await go("/parties");
await page.getByRole("button", { name: "تصدير وطباعة" }).first().click();
await page.waitForTimeout(600);
const menuText = await page.locator("body").innerText();
ok("قايمة التصدير بتفتح بصيغها", /CSV/.test(menuText) && /Excel/.test(menuText), "");
ok("وفيها طباعة", menuText.includes("طباعة ومعاينة"), "");
await page.keyboard.press("Escape");

/* ── ١٦) اللوحة — الرحلة كلها لازم تبان في الأرقام ─────────────── */
step(16, "اللوحة بعد الرحلة");
await go("/dashboard");
const dashText = await main();
ok("اللوحة بتفتح من غير أخطاء", dashText.includes("جهوزية اللوحة") || dashText.length > 200);
await go("/orders");
ok("الأمر الجديد في كشف الأوامر", (await main()).includes(order.code), order.code);

/* ── ١٧) سلامة الدفتر بعد الرحلة كلها ─────────────────────────── */
step(17, "سلامة الدفتر — مفيش سجل معلّق ولا كود مكرر");
db = await ledger();
const fid = start.parties[0].factoryId;
const idsOf = (arr) => new Set((arr ?? []).map((r) => r.id));
const partyIds = idsOf(db.parties);
const orderIds = idsOf(db.orders);
const holes = [];
const check = (label, rows, fn) => {
  const bad = (rows ?? []).filter((r) => !fn(r));
  if (bad.length) holes.push(`${label}: ${bad.length}`);
};
check("أمر بعميل مش موجود", db.orders, (o) => !o.clientId || partyIds.has(o.clientId));
check("توريد بعميل مش موجود", db.deliveries, (d) => partyIds.has(d.clientId));
check("تحصيل بعميل مش موجود", db.collections, (c) => partyIds.has(c.clientId));
check("باندل بأمر مش موجود", db.bundles, (b) => orderIds.has(b.orderId));
check("حركة مخزون بخامة مش موجودة", db.stockMovements, (m) =>
  m.itemType !== "material" ? true : idsOf(db.materials).has(m.itemId),
);
check("سطر قايمة بخامة مش موجودة", db.bomItems, (i) => idsOf(db.materials).has(i.materialId));
check("مرتجع بجهة مش موجودة", db.returns, (r) => !r.partyId || partyIds.has(r.partyId));
ok("مفيش سجل مربوط بحاجة مامسحيّة", holes.length === 0, holes.join(" · "));

const everyRow = Object.values(db).filter(Array.isArray).flat();
ok(
  "كل سجل على نفس المصنع",
  everyRow.every((r) => !r || !r.factoryId || r.factoryId === fid),
  `${everyRow.filter((r) => r?.factoryId && r.factoryId !== fid).length} سجل غريب`,
);
/* المعرّف فريد **جوه جدوله** — تكراره في جدولين مختلفين مش مشكلة */
const dupTables = Object.entries(db)
  .filter(([, v]) => Array.isArray(v))
  .filter(([, rows]) => {
    const ids = rows.filter((r) => r?.id).map((r) => r.id);
    return new Set(ids).size !== ids.length;
  })
  .map(([t]) => t);
ok("مفيش معرّف مكرر جوه أي جدول", dupTables.length === 0, dupTables.join(", "));
const codeTables = ["orders", "supplyOrders", "supplyReceipts", "bundles", "returns", "products", "materials"];
for (const t of codeTables) {
  const codes = (db[t] ?? []).map((r) => r.code ?? r.sku).filter(Boolean);
  ok(`مفيش كود مكرر في ${t}`, new Set(codes).size === codes.length, codes.length ? `${codes.length} كود` : "فاضي");
}
const negatives = db.materials.filter((m) => stockOf(db, m.id) < 0).map((m) => m.name);
ok("مفيش رصيد خامة بالسالب", negatives.length === 0, negatives.join(", "));

console.log(`\nنجح ${pass} · فشل ${fail}`);
console.log("أخطاء الكونسول: " + (logs.length ? logs.slice(0, 5).join(" | ") : "مافيش"));
await browser.close();
process.exit(fail || logs.length ? 1 : 0);
