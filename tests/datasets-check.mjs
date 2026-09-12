import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const BASE = "http://127.0.0.1:43127";
const b = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await b.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.goto(BASE);

// نفتح المصنع التجريبي عشان الداتا تبقى موجودة
await page.evaluate(() => localStorage.clear());
await page.goto(BASE);
await page.getByRole("button", { name: /جرّب|تجريب/ }).first().click().catch(() => {});
await page.waitForTimeout(600);
const owner = page.getByRole("button", { name: /صاحب المصنع/ }).first();
if (await owner.count()) await owner.click();
await page.waitForTimeout(1200);

const out = await page.evaluate(async () => {
  const { DATASETS, datasetOf } = await import("/src/store/datasets.ts");
  const key = Object.keys(localStorage).find((k) => k.startsWith("factory-ledger.v1:"));
  const db = JSON.parse(localStorage.getItem(key));
  const rows = [];
  for (const def of DATASETS) {
    try {
      const ds = datasetOf(db, def.key);
      const bad = [];
      for (const c of ds.cols) {
        const has = ds.rows.some((r) => c.key in r);
        if (ds.rows.length && !has) bad.push(c.key);
      }
      rows.push({ key: def.key, title: ds.title, rows: ds.rows.length, cols: ds.cols.length, missingCols: bad });
    } catch (e) {
      rows.push({ key: def.key, error: String(e && e.message) });
    }
  }
  return rows;
});

let fail = 0;
for (const r of out) {
  if (r.error) {
    console.log("✗", r.key, r.error);
    fail++;
  } else if (r.missingCols.length) {
    console.log("✗", r.key, "أعمدة مش موجودة في الصفوف:", r.missingCols.join(", "));
    fail++;
  } else {
    console.log("✓", r.key.padEnd(16), String(r.rows).padStart(5), "سطر ·", r.cols, "عمود ·", r.title);
  }
}
console.log(fail ? `\n${fail} مجموعة فيها مشكلة` : `\nكل ${out.length} مجموعة اتبنت`);

// وبعدها ملف Excel حقيقي من أكبر مجموعة عشان نتأكد إنه يفتح
const base64 = await page.evaluate(async () => {
  const { datasetOf } = await import("/src/store/datasets.ts");
  const { buildXlsx } = await import("/src/lib/xlsx.ts");
  const { datasetSheets } = await import("/src/lib/export.ts");
  const key = Object.keys(localStorage).find((k) => k.startsWith("factory-ledger.v1:"));
  const db = JSON.parse(localStorage.getItem(key));
  const ds = datasetOf(db, "purchases", { filters: [{ label: "الفترة", value: "الشهر ده" }] });
  const blob = buildXlsx(datasetSheets(ds, { factory: "مصنع النور", user: "صاحب المصنع" }));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
});
writeFileSync("/tmp/dataset.xlsx", Buffer.from(base64, "base64"));
console.log("ملف:", Buffer.from(base64, "base64").length, "بايت");

await b.close();
process.exit(fail ? 1 : 0);
