import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const URL = "http://127.0.0.1:43127";
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1340, height: 1000 } });
await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.waitForTimeout(700);

for (const [path, key] of [
  ["/production", "bundleOps"],
  ["/cutting", "lays"],
  ["/outsourcing", "subcontracts"],
]) {
  await page.goto(`${URL}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "تصدير وطباعة" }).first().click();
  await page.waitForTimeout(400);
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: /ملف Excel/ }).first().click(),
  ]);
  const buf = await dl.createReadStream().then(async (s) => {
    const chunks = [];
    for await (const c of s) chunks.push(c);
    return Buffer.concat(chunks);
  });
  writeFileSync(`/tmp/${key}.xlsx`, buf);
  console.log(key, dl.suggestedFilename(), buf.length, "bytes");
}
await browser.close();
