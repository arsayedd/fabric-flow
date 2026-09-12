import { chromium } from "playwright-core";

const URL = "http://127.0.0.1:43127";
const logs = [];
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1340, height: 1100 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("console", (m) => m.type() === "error" && logs.push(`[error] ${m.text()}`));

const shot = (n) => page.screenshot({ path: `/opt/cursor/artifacts/screenshots/${n}.png`, fullPage: true });
const tab = async (name) => {
  await page.getByRole("button", { name, exact: true }).first().click();
  await page.waitForTimeout(500);
};
const body = async (n = 40) => (await page.locator("main").innerText()).split("\n").slice(0, n).join("\n");

await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.waitForTimeout(700);

/* ── tabs ─────────────────────────────────────────────── */
await page.goto(`${URL}/production`, { waitUntil: "networkidle" });
for (const t of ["كفاءة العمال", "الخطوط والعمليات", "العيوب", "سجل التسجيلات"]) {
  await tab(t);
  console.log(`\n--- production / ${t} ---\n` + (await body(28)).split("سجل التسجيلات")[1]);
  await shot(`floor_prod_${t.replace(/ /g, "-")}`);
}

await page.goto(`${URL}/outsourcing`, { waitUntil: "networkidle" });
for (const t of ["الورش وتقييمها", "كشف حساب"]) {
  await tab(t);
  console.log(`\n--- outsourcing / ${t} ---\n` + (await body(45)).split("كشف حساب")[1]);
  await shot(`floor_out_${t.replace(/ /g, "-")}`);
}

await page.goto(`${URL}/cutting`, { waitUntil: "networkidle" });
await tab("حاسبة الرول");
console.log("\n--- roll calculator ---\n" + (await body(30)).split("حاسبة الرول")[1]);
await shot("floor_roll");

/* ── cut a lay ────────────────────────────────────────── */
await page.goto(`${URL}/cutting`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "قص الفرشة" }).first().click();
await page.waitForTimeout(500);
await shot("floor_cut_panel");
const panel = page.locator("div.fixed.inset-0.z-50");
console.log("\n--- cut panel ---\n" + (await panel.innerText()).split("\n").slice(0, 30).join("\n"));
await panel.getByRole("button", { name: "تأكيد القص", exact: true }).click();
await page.waitForTimeout(1200);
console.log("toast:", await page.locator("[data-sonner-toast]").allInnerTexts());
console.log("\n--- after cut ---\n" + (await body(30)));
await shot("floor_after_cut");

/* ── station: start + finish ─────────────────────────── */
await page.goto(`${URL}/station`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.setViewportSize({ width: 420, height: 900 });
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(400);
await shot("floor_station_before");

// اختَر عامل، هات باندل جديد من الفرشة اللي اتقصّت، وابدأ العملية
await page.locator("main select").first().selectOption({ label: "أحمد سيد" });
await page.locator("main input").first().fill("SN-1046-B001");
await page.getByRole("button", { name: "جيب", exact: true }).click();
await page.waitForTimeout(500);
console.log("\n--- station bundle ---\n" + (await body(40)));
await page.getByRole("button", { name: /ابدأ/ }).first().click();
await page.waitForTimeout(700);
console.log("toast:", await page.locator("[data-sonner-toast]").allInnerTexts());
await shot("floor_station_running");
console.log("\n--- station running ---\n" + (await body(40)));

await page.getByRole("button", { name: "خلّصت", exact: true }).first().click();
await page.waitForTimeout(500);
await shot("floor_station_finish");
const fin = page.locator("div.fixed.inset-0.z-50");
console.log("\n--- finish panel ---\n" + (await fin.innerText()).split("\n").slice(0, 40).join("\n"));
await fin.getByRole("button", { name: /سجّل|تأكيد|خلّصت/ }).last().click();
await page.waitForTimeout(800);
console.log("toast:", await page.locator("[data-sonner-toast]").allInnerTexts());
console.log("\n--- station after finish ---\n" + (await body(40)));
await shot("floor_station_done");

console.log(`\nerrors: ${logs.length}`);
logs.slice(0, 10).forEach((l) => console.log("  ", l));
await browser.close();
