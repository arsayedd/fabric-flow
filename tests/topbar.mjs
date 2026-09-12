import { chromium } from "playwright-core";
const BASE = "http://127.0.0.1:43127";
const b = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
for (const w of [390, 1340]) {
  const p = await b.newPage({ viewport: { width: w, height: 700 }, deviceScaleFactor: 3 });
  await p.goto(BASE, { waitUntil: "networkidle" });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: "networkidle" });
  await p.getByRole("button", { name: /صاحب المصنع/ }).first().click();
  await p.waitForTimeout(600);
  const link = p.getByRole("link", { name: "مسح كود" }).first();
  console.log(w, "visible:", await link.isVisible(), "box:", JSON.stringify(await link.boundingBox()));
  await p.locator("header").first().screenshot({ path: `/opt/cursor/artifacts/screenshots/topbar_${w}.png` });
  await p.close();
}
await b.close();
