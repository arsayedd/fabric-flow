import { chromium } from "playwright-core";

const URL = "http://127.0.0.1:43127";
const logs = [];
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1340, height: 1100 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("console", (m) => m.type() === "error" && logs.push(`[error] ${m.text()}`));
const shot = (n) => page.screenshot({ path: `/opt/cursor/artifacts/screenshots/${n}.png`, fullPage: true });
const body = async (n = 40) => (await page.locator("main").innerText()).split("\n").slice(0, n).join("\n");
const panel = () => page.locator("div.fixed.inset-0.z-50");

await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.waitForTimeout(700);

/* ── استلام من ورشة ─────────────────────────────────── */
await page.goto(`${URL}/outsourcing`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "استلام", exact: true }).first().click();
await page.waitForTimeout(500);
console.log("--- receive panel ---\n" + (await panel().innerText()).split("\n").slice(0, 30).join("\n"));
await shot("floor_receive_panel");
const inputs = panel().locator("input");
await inputs.nth(1).fill("100");
await panel().getByRole("button", { name: /سجّل|استلام|تأكيد/ }).last().click();
await page.waitForTimeout(900);
console.log("toast:", await page.locator("[data-sonner-toast]").allInnerTexts());
console.log("\n--- after receive ---\n" + (await body(34)));
await shot("floor_after_receive");

/* ── المستندات ──────────────────────────────────────── */
for (const [path, label, name] of [
  ["/cutting", "تيكت قص", "floor_doc_cutting"],
  ["/outsourcing", "إذن التشغيل", "floor_doc_subout"],
]) {
  await page.goto(`${URL}${path}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: label, exact: true }).first().click();
  await page.waitForTimeout(900);
  console.log(`\n--- ${label} ---\n` + (await page.locator("body").innerText()).split("\n").slice(-45).join("\n"));
  await shot(name);
  await page.keyboard.press("Escape");
}

/* ── مركز التصدير: المجموعات الجديدة ─────────────────── */
await page.goto(`${URL}/exports`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
const txt = await page.locator("main").innerText();
for (const key of ["فرشات القص", "الباندلات", "تسجيلات العمليات", "الشغل الجاري", "كفاءة العمال", "أسباب العيب", "أعمال التشغيل الخارجي", "استلامات من الورش"]) {
  console.log(`${txt.includes(key) ? "✓" : "✗"} ${key}`);
}
await shot("floor_exports");

console.log(`\nerrors: ${logs.length}`);
logs.slice(0, 10).forEach((l) => console.log("  ", l));
await browser.close();
