import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";
const src = readFileSync("src/store/account.ts", "utf8");
const email = src.match(/email:\s*"([^"@]+@[^"]+)"/)[1], pwd = src.match(/password:\s*"([^"]+)"/)[1];
const B = process.env.U ?? "https://sanaa.cloud";
const b = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });

for (const mode of ["كروم عادي", "scrollTo بيرجّع قيمة"]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  if (mode !== "كروم عادي") await ctx.addInitScript(() => {
    const r = window.scrollTo.bind(window); window.scrollTo = (...a) => { r(...a); return true; };
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push("[pageerror] " + String(e).split("\n").slice(0,2).join(" | ").slice(0,200)));
  p.on("console", (m) => { if (m.type() === "error") errs.push("[console] " + m.text().split("\n")[0].slice(0,200)); });

  console.log(`\n===== ${mode} =====`);
  // ١) لينك مباشر وانت مش داخل
  await p.goto(`${B}/tasks`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);
  console.log("لينك مباشر (مش داخل) →", new URL(p.url()).pathname, "|", (await p.locator("body").innerText()).replace(/\s+/g," ").slice(0,60));

  // ٢) دخول ثم لينك مباشر
  await p.goto(`${B}/login`, { waitUntil: "domcontentloaded" });
  await p.getByPlaceholder(/@/).first().fill(email);
  await p.locator('input[type="password"]').first().fill(pwd);
  await p.getByRole("button", { name: /دخول|تسجيل/ }).first().click();
  await p.locator("nav").first().waitFor({ timeout: 30000 });
  await p.waitForTimeout(1500);
  errs.length = 0;
  await p.goto(`${B}/tasks`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);
  const txt = (await p.locator("body").innerText().catch(()=> "")).replace(/\s+/g," ");
  console.log("لينك مباشر (داخل) →", new URL(p.url()).pathname);
  console.log("  المحتوى:", txt.slice(0, 120) || "<فاضي>");
  console.log("  أخطاء:", errs.length ? "\n    " + errs.slice(0,3).join("\n    ") : "مافيش");

  // ٣) بالضغط من القائمة
  errs.length = 0;
  await p.goto(`${B}/`, { waitUntil: "domcontentloaded" });
  await p.locator("nav").first().waitFor({ timeout: 20000 });
  const heads = p.locator("nav > div > button");
  for (let i = 0, n = await heads.count(); i < n; i++) await heads.nth(i).click().catch(()=>{});
  const a = p.locator('nav a[href="/tasks"]').first();
  const vis = await a.isVisible().catch(()=>false);
  if (vis) { await a.click({timeout:10000}).catch((e)=>console.log("  الضغط فشل:", String(e).split("\n")[0].slice(0,70))); }
  await p.waitForTimeout(2000);
  const t2 = (await p.locator("body").innerText().catch(()=> "")).replace(/\s+/g," ");
  console.log("بالضغط من القائمة → ظاهر في القائمة؟", vis, "|", new URL(p.url()).pathname);
  console.log("  المحتوى:", t2.slice(0, 120) || "<فاضي>");
  console.log("  أخطاء:", errs.length ? "\n    " + errs.slice(0,3).join("\n    ") : "مافيش");
  await ctx.close();
}
await b.close();
