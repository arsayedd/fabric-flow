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

/* سجل المسح كامل من شاشة المسح */
await page.goto(`${BASE}/scan`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.getByRole("button", { name: "تصدير وطباعة" }).first().click();
await page.waitForTimeout(400);
let dl = await Promise.all([
  page.waitForEvent("download"),
  page.getByRole("menuitem", { name: /ملف Excel/ }).first().click(),
]).then(([d]) => d);
let buf = await dl.createReadStream().then(async (s) => {
  const chunks = [];
  for await (const c of s) chunks.push(c);
  return Buffer.concat(chunks);
});
writeFileSync("/tmp/scans.xlsx", buf);
console.log("scans", dl.suggestedFilename(), buf.length, "bytes");

/* ونسخة مفلترة على سجل واحد من شاشة التتبع */
await page.goto(`${BASE}/trace/bundle/bn-1`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.getByRole("button", { name: "تصدير وطباعة" }).first().click();
await page.waitForTimeout(400);
dl = await Promise.all([
  page.waitForEvent("download"),
  page.getByRole("menuitem", { name: /ملف Excel/ }).first().click(),
]).then(([d]) => d);
buf = await dl.createReadStream().then(async (s) => {
  const chunks = [];
  for await (const c of s) chunks.push(c);
  return Buffer.concat(chunks);
});
writeFileSync("/tmp/scans-one.xlsx", buf);
console.log("scans (سجل واحد)", dl.suggestedFilename(), buf.length, "bytes");

await browser.close();
