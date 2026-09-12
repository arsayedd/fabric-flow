/**
 * جرد الخانات اللي مالهاش اسم مقروء.
 *
 * خانة من غير عنوان ولا `aria-label` ولا `placeholder` بتبقى مربّع فاضي:
 * قارئ الشاشة مابيقولش هي إيه، والمستخدم اللي بيكبّر الخط بيفقد السياق.
 * وكل زرار جوه `label` بيفقد اسمه كمان، فبنجرده هنا برضه.
 */
import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:43127";
const PATHS = [
  "/",
  "/parties",
  "/products",
  "/materials",
  "/orders",
  "/supply",
  "/cutting",
  "/station",
  "/production",
  "/quality",
  "/returns",
  "/repairs",
  "/collections",
  "/treasury",
  "/costs",
  "/workers",
  "/machines",
  "/planning",
  "/costing",
  "/cashflow",
  "/documents",
  "/labels",
  "/scan",
  "/settings",
  "/staff",
  "/ai",
];
/* البانلات اللي محتاجة ضغطة زرار عشان تفتح */
const PANELS = [
  ["/parties", "جهة جديدة"],
  ["/products", "منتج جديد"],
  ["/materials", "خامة جديدة"],
  ["/orders", "أمر إنتاج"],
  ["/supply", "أمر توريد"],
  ["/cutting", "فرشة جديدة"],
  ["/returns", "مرتجع جديد"],
  ["/collections", "سجل التحصيل"],
  ["/treasury", "حركة"],
];

const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1400, height: 1300 } });
await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.waitForTimeout(1200);

const audit = () =>
  page.evaluate(() => {
    const named = (n) => {
      if (n.getAttribute("aria-label")?.trim()) return true;
      if (n.placeholder?.trim()) return true;
      if (n.id && document.querySelector(`label[for="${n.id}"]`)) return true;
      const lab = n.closest("label");
      if (lab && lab.querySelectorAll("input,select,textarea").length === 1) return true;
      if (n.getAttribute("title")?.trim()) return true;
      return false;
    };
    const bad = [];
    for (const n of document.querySelectorAll("input:not([type=hidden]),select,textarea")) {
      if (!named(n)) bad.push(`${n.tagName.toLowerCase()}[${n.type ?? ""}]`);
    }
    for (const b of document.querySelectorAll("button")) {
      const hasName = (b.textContent ?? "").trim() || b.getAttribute("aria-label")?.trim();
      if (!hasName) continue;
      if (b.closest("label")) bad.push(`button-in-label "${(b.textContent ?? "").trim().slice(0, 20)}"`);
    }
    return bad;
  });

let problems = 0;
for (const p of PATHS) {
  await page.goto(`${BASE}${p}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const bad = await audit();
  if (bad.length) {
    problems += bad.length;
    console.log(`✗ ${p} — ${bad.length}: ${bad.slice(0, 8).join(" · ")}`);
  } else console.log(`✓ ${p}`);
}
for (const [p, btn] of PANELS) {
  await page.goto(`${BASE}${p}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: btn, exact: true }).first().click();
  await page.waitForTimeout(700);
  const bad = await audit();
  if (bad.length) {
    problems += bad.length;
    console.log(`✗ ${p} › ${btn} — ${bad.length}: ${bad.slice(0, 8).join(" · ")}`);
  } else console.log(`✓ ${p} › ${btn}`);
}

console.log(`\nنجح ${problems ? 0 : 1} · فشل ${problems ? 1 : 0}`);
console.log(`خانات وزراير من غير اسم: ${problems}`);
await browser.close();
process.exit(problems ? 1 : 0);
