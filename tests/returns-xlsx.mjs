import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const BASE = "http://127.0.0.1:43127";
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1340, height: 1000 } });
await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.waitForTimeout(700);

const grab = async (out) => {
  await page.getByRole("button", { name: /تصدير/ }).first().click();
  await page.waitForTimeout(400);
  const dl = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: /ملف Excel/ }).first().click(),
  ]).then(([d]) => d);
  const buf = await dl.createReadStream().then(async (s) => {
    const chunks = [];
    for await (const c of s) chunks.push(c);
    return Buffer.concat(chunks);
  });
  writeFileSync(out, buf);
  console.log(out, dl.suggestedFilename(), buf.length, "bytes");
};

await page.goto(`${BASE}/returns`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
await grab("/tmp/returns.xlsx");

await page.goto(`${BASE}/returns?tab=complaints`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
await grab("/tmp/complaints.xlsx");

/* ومن مركز التصدير كمان، عشان نتأكد إن الجدولين مسجّلين في الخريطة */
await page.goto(`${BASE}/exports`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
const txt = await page.locator("main").innerText();
for (const name of ["المرتجعات", "الشكاوى"]) console.log(`مركز التصدير فيه «${name}»:`, txt.includes(name));

await browser.close();
