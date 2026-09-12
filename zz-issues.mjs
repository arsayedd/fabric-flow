import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";
const src = readFileSync("src/store/account.ts", "utf8");
const email = src.match(/email:\s*"([^"@]+@[^"]+)"/)[1], pwd = src.match(/password:\s*"([^"]+)"/)[1];
const b = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
const cdp = await p.context().newCDPSession(p);
const issues = [];
await cdp.send("Audits.enable");
cdp.on("Audits.issueAdded", (e) => issues.push(e.issue));
await p.goto("http://127.0.0.1:43127/login", { waitUntil: "domcontentloaded" });
await p.getByPlaceholder(/@/).first().fill(email);
await p.locator('input[type="password"]').first().fill(pwd);
await p.getByRole("button", { name: /دخول|تسجيل|حفظ/ }).first().click();
await p.locator("nav").first().waitFor({ timeout: 30000 });
await p.goto("http://127.0.0.1:43127/tasks", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(3000);
const by = {};
for (const i of issues) {
  const k = i.code;
  const d = i.details?.genericIssueDetails?.errorType ?? i.details?.deprecationIssueDetails?.type ?? "";
  (by[`${k} ${d}`.trim()] ??= []).push(1);
}
console.log("عدد مشاكل لوحة Issues:", issues.length);
for (const [k, v] of Object.entries(by)) console.log(`  ${v.length}× ${k}`);
if (!issues.length) console.log("  مافيش");
await b.close();
