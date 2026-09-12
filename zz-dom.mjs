import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";
const src = readFileSync("src/store/account.ts", "utf8");
const email = src.match(/email:\s*"([^"@]+@[^"]+)"/)[1], pwd = src.match(/password:\s*"([^"]+)"/)[1];
const B = "http://127.0.0.1:43127";
const b = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const scan = () => p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("input, select, textarea")) {
    if (el.id || el.name) continue;
    if (el.type === "checkbox" || el.type === "radio") continue;
    out.push(`<${el.tagName.toLowerCase()}${el.type ? ` type=${el.type}` : ""}> ${(el.getAttribute("placeholder") || el.getAttribute("aria-label") || el.options?.[0]?.text || "").slice(0, 32)}`);
  }
  for (const el of document.querySelectorAll("label")) {
    if (el.htmlFor || el.querySelector("input, select, textarea")) continue;
    out.push(`<label> ${el.textContent?.trim().slice(0, 32)}`);
  }
  return out;
});
for (const r of ["/signup", "/signup/factory"]) {
  await p.goto(`${B}${r}`, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1200);
  const s = await scan(); console.log(`\n${r} → ${s.length}`); for (const x of s) console.log("   ", x);
}
await p.goto(`${B}/login`); await p.getByPlaceholder(/@/).first().fill(email);
await p.locator('input[type="password"]').first().fill(pwd);
await p.getByRole("button", { name: /دخول|تسجيل|حفظ/ }).first().click();
await p.locator("nav").first().waitFor({ timeout: 30000 });
for (const r of ["/orders", "/staff", "/parties", "/settings", "/collections", "/materials", "/quality", "/machines", "/tasks"]) {
  await p.goto(`${B}${r}`, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1200);
  const s = await scan(); if (s.length) { console.log(`\n${r} → ${s.length}`); for (const x of s) console.log("   ", x); }
}
await b.close();
