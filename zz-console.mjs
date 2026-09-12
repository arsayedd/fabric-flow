import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";
const src = readFileSync("src/store/account.ts", "utf8");
const email = src.match(/email:\s*"([^"@]+@[^"]+)"/)[1], pwd = src.match(/password:\s*"([^"]+)"/)[1];
const B = "https://sanaa.cloud";
const b = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const msgs = [];
p.on("console", (m) => msgs.push({ t: m.type(), s: m.text().split("\n")[0].slice(0, 180) }));
p.on("pageerror", (e) => msgs.push({ t: "pageerror", s: String(e).split("\n")[0].slice(0, 180) }));
p.on("requestfailed", (r) => msgs.push({ t: "reqfail", s: `${r.failure()?.errorText} ${r.url().slice(0, 90)}` }));
p.on("response", (r) => { if (r.status() >= 400) msgs.push({ t: `http ${r.status()}`, s: r.url().slice(0, 100) }); });

await p.goto(`${B}/login`, { waitUntil: "domcontentloaded" });
await p.getByPlaceholder(/@/).first().fill(email);
await p.locator('input[type="password"]').first().fill(pwd);
await p.getByRole("button", { name: /دخول|تسجيل|حفظ/ }).first().click();
await p.locator("nav").first().waitFor({ timeout: 30000 });
await p.goto(`${B}/tasks`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2000);
const heads = p.locator("nav > div > button");
for (let i = 0, n = await heads.count(); i < n; i++) await heads.nth(i).click().catch(()=>{});
for (const h of ["/products","/materials","/orders","/parties","/collections","/quality","/tasks"]) {
  const a = p.locator(`nav a[href="${h}"]`).first();
  if (await a.isVisible().catch(()=>false)) { await a.click().catch(()=>{}); await p.waitForTimeout(1200); }
}
await p.waitForTimeout(1500);
const by = {};
for (const m of msgs) (by[m.t] ??= []).push(m.s);
console.log("=== كل رسائل الكونسول والشبكة ===");
for (const [t, list] of Object.entries(by)) {
  console.log(`\n[${t}] ${list.length}`);
  for (const s of [...new Set(list)].slice(0, 8)) console.log("   ", s);
}
if (!msgs.length) console.log("مافيش أي رسالة خالص");
await b.close();
