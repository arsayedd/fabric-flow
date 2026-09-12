/**
 * أي `useEffect` بيرجّع حاجة مش دالة = كراش في كل تنقّل.
 *
 * ريأكت بتاخد اللي الـeffect بيرجّعه وتعتبره **دالة التنظيف**، وبتناديه
 * وقت الخروج من الصفحة أو تغيّر الـdeps. فلو الرجوع مش دالة ومش
 * `undefined`، ريأكت بتنادي قيمة — وترمي `is not a function` جوه مرحلة
 * الـcommit، وده بيفكّ الشجرة كلها مش الكومبوننت بس.
 *
 * وده كان عطل حقيقي في `AppShell`:
 *
 *     useEffect(() => window.scrollTo(0, 0), [loc.pathname]);
 *
 * السهم من غير أقواس بيرجّع ناتج `window.scrollTo`. في كروم الناتج
 * `undefined` فمافيش مشكلة — عشان كده مافيش هارنس مسكها. وفي متصفح
 * `scrollTo` فيه بيرجّع قيمة (ويب-فيو، بوليفيل تمرير، إضافة) الـeffect
 * بيرجّع القيمة دي، وهي مربوطة بـ`pathname`، فالتنظيف بيتنفّذ مع كل
 * تنقّل والتطبيق بيقع في كل صفحة.
 *
 * فالفحص هنا على المصدر مش على المتصفح بقصد: العطل مايظهرش في كروم أصلًا،
 * والاختبار اللي بيجرّب في كروم بس بيقول «سليم» على كود بيقع عند المستخدم.
 *
 * والقاعدة اللي بنفرضها: جسم الـeffect لازم يكون بأقواس `{}`. الشكل
 * المختصر مش ممنوع لأنه وحش — ممنوع لأن صحّته بتعتمد على قيمة ترجيع
 * دالة تانية، وهي حاجة ماحدش بيراجعها لما يعدّل السطر.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../src/", import.meta.url).pathname;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${extra ? `\n      ${extra}` : ""}`);
  }
};

const files = walk(ROOT);
console.log(`— فحص ${files.length} ملف —`);

const HOOK = /\b(useEffect|useLayoutEffect|useInsertionEffect)\s*\(/g;

/* التعليقات بتتشال الأول — التعليق اللي فوق الإصلاح نفسه بيشرح الشكل
   الغلط، فالفاحص كان بيمسك شرح الإصلاح ويقول إن العطل لسه موجود */
const strip = (code) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

function scan(code, label = "") {
  const src = strip(code);
  const shorthand = [];
  const asyncEffects = [];
  let total = 0;
  for (const m of src.matchAll(HOOK)) {
    total++;
    /* أول ٦٠ حرف بعد القوس كفاية نشوف فيهم شكل الكولباك */
    const head = src.slice(m.index + m[0].length, m.index + m[0].length + 60);
    const line = src.slice(0, m.index).split("\n").length;
    const at = label ? `${label}:${line}` : `${line}`;
    if (/^\s*async/.test(head)) {
      /* كولباك async بيرجّع Promise، والـPromise مش دالة */
      asyncEffects.push(at);
      continue;
    }
    const arrow = head.match(/^\s*\([^)]*\)\s*=>\s*(.)/);
    if (arrow && arrow[1] !== "{") shorthand.push(`${at} → ${head.trim().slice(0, 50)}`);
  }
  return { total, shorthand, asyncEffects };
}

/* ── الفاحص نفسه بيتفحص ─────────────────────────────────────
   فاحص مابيمسكش حاجة بينجح على أي كود. فبنوريه العطل الحقيقي
   الأول، ونتأكد إنه بيمسكه، وإنه مش بيمسك الشكل السليم. */
console.log("— الفاحص نفسه —");
const bait = `useEffect(() => window.scrollTo(0, 0), [p]);`;
const clean = `useEffect(() => {\n  window.scrollTo(0, 0);\n}, [p]);`;
const asyncBait = `useEffect(async () => { await x(); }, []);`;
ok("بيمسك السطر اللي وقع فعلًا", scan(bait).shorthand.length === 1);
ok("ومابيمسكش الشكل السليم", scan(clean).shorthand.length === 0);
ok("وبيمسك الكولباك الـasync", scan(asyncBait).asyncEffects.length === 1);
ok("وبيتخطّى التعليقات", scan(`/* ${bait} */\n${clean}`).shorthand.length === 0);

console.log("\n— المصدر —");
const found = { total: 0, shorthand: [], asyncEffects: [] };
for (const file of files) {
  const r = scan(readFileSync(file, "utf8"), file.slice(ROOT.length));
  found.total += r.total;
  found.shorthand.push(...r.shorthand);
  found.asyncEffects.push(...r.asyncEffects);
}

ok("لقينا effects نفحصها", found.total > 10, `${found.total}`);
ok(
  "مفيش effect بجسم مختصر بيرجّع قيمة ضمنيًا",
  found.shorthand.length === 0,
  found.shorthand.join("\n      "),
);
ok("ومفيش effect كولباكه async", found.asyncEffects.length === 0, found.asyncEffects.join("\n      "));

/* والسطر اللي كان بيقع تحديدًا — عشان مايرجعش بالشكل القديم */
const shell = readFileSync(new URL("../src/components/AppShell.tsx", import.meta.url), "utf8");
ok("و`scrollTo` في الشِل جوه أقواس", /useEffect\(\(\) => \{\s*\n\s*window\.scrollTo\(0, 0\);/.test(shell));

console.log(`\n${pass} نجحت · ${fail} فشلت`);
if (fail) process.exit(1);
