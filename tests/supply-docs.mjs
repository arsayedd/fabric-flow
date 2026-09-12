import { chromium } from "playwright-core";
const B = "http://127.0.0.1:43127";
const b = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1340, height: 950 } });
const errs = [];
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
p.on("pageerror", (e) => errs.push(String(e)));
const txt = async (sel) => (await p.locator(sel).allInnerTexts()).join("\n");

await p.goto(B);
const demo = p.getByRole("button", { name: /صاحب المصنع/ });
if (await demo.count()) await demo.first().click();
await p.waitForTimeout(800);

console.log("=== 1) إذن الاستلام على استلام توريد ===");
await p.goto(`${B}/supply`);
await p.waitForTimeout(1200);
const rows = await txt("main li");
for (const l of rows.split("\n").filter((x) => /GRN-|SR-|إذن المورّد/.test(x)).slice(0, 8)) console.log("  ", l);

await p.getByRole("button", { name: "إذن استلام" }).first().click();
await p.waitForTimeout(1200);
const panel = p.locator("div.fixed.inset-0.z-50").first();
const doc = (await panel.allInnerTexts()).join("\n");
for (const l of doc.split("\n").filter((x) => x.trim()).slice(0, 40)) console.log("  ", l);

console.log("\n=== 2) ليبل الدفعة في مركز الطباعة ===");
await p.goto(`${B}/labels`);
await p.waitForTimeout(1000);
const kinds = await txt("main button");
console.log("  الأنواع:", kinds.split("\n").filter((x) => /ليبل|تيكت|كارنيه|كارت|إذن/.test(x)).join(" · "));
await p.getByRole("button", { name: /ليبل دفعة/ }).first().click();
await p.waitForTimeout(1000);
const list = await txt("main label");
for (const l of list.split("\n").filter((x) => /LOT-/.test(x)).slice(0, 8)) console.log("  ", l);

console.log("\nأخطاء الكونسول:", errs.length ? errs.slice(0, 5).join(" | ") : "مافيش");
await b.close();
