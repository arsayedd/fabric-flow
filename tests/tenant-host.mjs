/**
 * تحديد المصنع من العنوان — القواعد نفسها، من غير متصفح.
 *
 * ليه اختبار منفصل: القاعدة دي غلطة فيها مش بتبان في شاشة مكسورة، بتبان
 * في «المصنع مش موجود» على عنوان سليم، أو الأسوأ: عنوان مصنع يفتح مصنع
 * تاني. والقاعدة القديمة كانت «أول جزء في أي عنوان فيه تلات أجزاء»، وده
 * كان بيخلي أي عنوان نفق أو تجربة (`abc.trycloudflare.com`) يتحوّل لطلب
 * مصنع اسمه `abc` — فالتأكيدات دي أغلبها على الحالات اللي المفروض
 * **ماتتعاملش** كمصنع.
 *
 * بنقرا القواعد من الكود بـregex بدل ما نستورده، لأن الملف TypeScript
 * وفيه `import.meta.env` — ومانقدرش نشغّله في نود مباشرة.
 */
import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
const ok = (label, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`);
  }
};

const src = readFileSync(new URL("../src/store/account.ts", import.meta.url), "utf8");

/* الدومين والكلمات المحجوزة بيتقروا من المصدر عشان الاختبار يقيس
 * القيمة الحالية لو حد غيّرها */
const ROOT = src.match(/VITE_APP_DOMAIN\?\.trim\(\) \|\| "([^"]+)"/)?.[1] ?? "";
ok("الدومين مقروء من الكود", Boolean(ROOT), ROOT);

const reserved = (src.match(/RESERVED_SLUGS = \[([^\]]+)\]/)?.[1] ?? "")
  .split(",")
  .map((s) => s.trim().replace(/^"|"$/g, ""))
  .filter(Boolean);
ok("الكلمات المحجوزة مقروءة", reserved.length > 10, String(reserved.length));

/* نفس منطق `tenantSlug` — لو اتغيّر في الكود، الاختبار ده لازم يتغيّر معاه
 * بقصد، عشان تغيير القاعدة يبقى قرار مكتوب مش أثر جانبي */
const tenantSlug = (hostname) => {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const suffix = `.${ROOT.toLowerCase()}`;
  if (!host.endsWith(suffix)) return null;
  const slug = host.slice(0, -suffix.length);
  if (!slug || slug.includes(".")) return null;
  if (reserved.includes(slug)) return null;
  return slug;
};

console.log("\n— عناوين مصانع —");
ok("alnoor بيطلع مصنع", tenantSlug(`alnoor.${ROOT}`) === "alnoor");
ok("والحروف الكبيرة مابتفرقش", tenantSlug(`ALNOOR.${ROOT}`) === "alnoor");
ok("والنقطة في الآخر مابتفرقش", tenantSlug(`alnoor.${ROOT}.`) === "alnoor");

console.log("\n— عناوين مش مصانع —");
ok("الدومين الأصلي نفسه مش مصنع", tenantSlug(ROOT) === null);
ok("www مش مصنع", tenantSlug(`www.${ROOT}`) === null);
ok("api مش مصنع", tenantSlug(`api.${ROOT}`) === null);
ok("localhost مش مصنع", tenantSlug("localhost") === null);
ok("عنوان IP مش مصنع", tenantSlug("187.127.79.131") === null);
ok("127.0.0.1 مش مصنع", tenantSlug("127.0.0.1") === null);

/* دي الحالة اللي كانت بتكسر المعاينة: عنوان تلات أجزاء على دومين تاني */
ok("عنوان نفق مش مصنع", tenantSlug("silly-words-here.trycloudflare.com") === null);
ok("ولا عنوان استضافة تانية", tenantSlug("sanaa.vercel.app") === null);
ok("ولا دومين شبيه بالاسم", tenantSlug("alnoor.sanaa.cloud.evil.com") === null);
ok("ولا دومين بينتهي بنفس الحروف من غير نقطة", tenantSlug(`alnoorsanaa${ROOT.replace(".", "")}`) === null);
ok("ونطاق جوه نطاق مش مصنع", tenantSlug(`a.b.${ROOT}`) === null);

console.log("\n— العنوان المعروض —");
const urlFn = src.match(/export function workspaceUrl[\s\S]*?\n}/)?.[0] ?? "";
ok("العنوان المعروض مبني على نفس الدومين", urlFn.includes("ROOT_DOMAIN"), urlFn.slice(0, 60));
ok("ومافيش دومين مكتوب بالإيد في الواجهة", !/sanaa\.app/.test(readAll()), "لسه فيه sanaa.app");

function readAll() {
  const files = [
    "../src/components/WorkspaceSwitcher.tsx",
    "../src/pages/StaffPage.tsx",
    "../src/pages/SignupWizard.tsx",
    "../src/pages/LandingPage.tsx",
    "../src/pages/FactoryPickerPage.tsx",
    "../src/pages/TenantMissingPage.tsx",
  ];
  return files
    .map((f) => readFileSync(new URL(f, import.meta.url), "utf8"))
    .join("\n")
    /* الإيميل التجريبي على sanaa.app بقصد ومالوش علاقة بالدومين */
    .replace(/demo@sanaa\.app/g, "");
}

console.log(`\n${pass} نجحت · ${fail} فشلت`);
process.exit(fail ? 1 : 0);
