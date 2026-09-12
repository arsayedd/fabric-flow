/**
 * مصفوفة الصلاحيات مكتوبة مرتين — والملف ده بيتأكد إنهم نفس الحاجة.
 *
 * التطبيق أوفلاين-أول فمحتاج المصفوفة عنده في `src/store/permissions.ts`،
 * والقاعدة محتاجاها عندها في `factory.default_permissions` عشان تمنع فعلًا
 * مش بس تخفي زراير. تكرار مقصود — بس التكرار من غير فحص بيتفرّق: المشرف
 * كان واخد `export` في التطبيق ومش واخده في القاعدة، فكان بيشوف زرار
 * التصدير ويدوس ويترفض.
 *
 * محتاج Postgres محلي زي `tests/rls-check.mjs`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DB = "sanaa_perm_test";
const PSQL = "/usr/lib/postgresql/16/bin/psql";
const psql = (args, input) =>
  execFileSync("sudo", ["-u", "postgres", PSQL, ...args], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });

/* ── الجانب التايبسكريبت ────────────────────────────────────── */
const src = readFileSync(join(ROOT, "src/store/permissions.ts"), "utf8");

const listOf = (body) => body.match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1)) ?? [];
const actions = listOf(src.match(/PERM_ACTIONS = \[([^\]]+)\]/)[1]);

/* الأسماء المختصرة: `const RWX: PermAction[] = ["view", …]` */
const alias = { ALL: actions };
for (const m of src.matchAll(/^const (\w+): PermAction\[\] = \[([^\]]*)\];/gm)) {
  if (m[2].includes("...PERM_ACTIONS")) alias[m[1]] = actions;
  else alias[m[1]] = listOf(m[2]);
}

const defaultsBlock = src.match(/ROLE_DEFAULTS: Record<Role, PermMatrix> = \{([\s\S]*?)\n\};/)[1];
const tsMatrix = {};
for (const role of ["owner", "accountant", "supervisor"]) {
  const block = defaultsBlock.match(new RegExp(`${role}: \\{([\\s\\S]*?)\\n  \\},`))?.[1];
  if (!block) throw new Error(`مش لاقي الدور ${role} في ROLE_DEFAULTS`);
  const out = {};
  for (const m of block.matchAll(/^\s*(\w+): (\w+),/gm)) {
    if (!alias[m[2]]) throw new Error(`اسم مختصر مش معروف: ${m[2]}`);
    out[m[1]] = [...alias[m[2]]].sort();
  }
  tsMatrix[role] = out;
}

/* ── الجانب SQL ─────────────────────────────────────────────── */
const reset = () => {
  psql(["-q", "-c", `drop database if exists ${DB}`]);
  psql(["-q", "-c", `create database ${DB}`]);
};
try {
  reset();
} catch {
  /* الكلاستر واقف بعد restart — نشغّله مرة ونعيد */
  try {
    execFileSync("sudo", ["pg_ctlcluster", "16", "main", "start"], { stdio: "ignore" });
    reset();
  } catch (e) {
    console.error("مش قادر يعمل قاعدة اختبار — ثبّت Postgres:");
    console.error("  sudo apt-get install -y postgresql && sudo pg_ctlcluster 16 main start");
    console.error(e.stderr ?? e.message);
    process.exit(1);
  }
}
const files = [
  join(ROOT, "supabase/tests/shim.sql"),
  join(ROOT, "supabase/schema.sql"),
  ...readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(ROOT, "supabase/migrations", f)),
];
for (const f of files) {
  try {
    psql(["-q", "-v", "ON_ERROR_STOP=1", "-d", DB, "-f", f]);
  } catch (e) {
    console.error(`✗ ${f.replace(`${ROOT}/`, "")}`);
    console.error((e.stderr ?? e.message).trim());
    process.exit(1);
  }
}

const sqlMatrix = {};
for (const role of ["owner", "accountant", "supervisor"]) {
  const raw = psql(["-q", "-At", "-d", DB, "-c", `select factory.default_permissions('${role}')`]).trim();
  const obj = JSON.parse(raw);
  sqlMatrix[role] = Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, [...v].sort()]));
}
psql(["-q", "-c", `drop database if exists ${DB}`]);

/* ── المقارنة خانة خانة ─────────────────────────────────────── */
let pass = 0;
let fail = 0;
const modules = listOf(src.match(/PERM_MODULES = \[([^\]]+)\]/)[1]);

for (const role of ["owner", "accountant", "supervisor"]) {
  console.log(`\n— ${role} —`);
  for (const mod of modules) {
    const ts = (tsMatrix[role][mod] ?? []).join(",");
    const sql = (sqlMatrix[role][mod] ?? []).join(",");
    if (ts === sql) {
      pass++;
    } else {
      fail++;
      console.log(`  ✗ ${mod}: التطبيق [${ts || "—"}] · القاعدة [${sql || "—"}]`);
    }
  }
  /* موديول موجود في القاعدة ومش في التطبيق = صلاحية ماحدش بيعرف بيها */
  for (const mod of Object.keys(sqlMatrix[role])) {
    if (!modules.includes(mod)) {
      fail++;
      console.log(`  ✗ القاعدة فيها موديول مش موجود في التطبيق: ${mod}`);
    }
  }
  console.log(`  ${modules.length - fail > 0 ? "طابق" : ""} ${modules.length} موديول اتفحصوا`);
}

console.log(`\nخانات مطابقة ${pass} · مختلفة ${fail}`);
/* بالصيغة اللي `run-all.mjs` بيقراها عشان الرقم يبان في الجدول */
console.log(`${pass} نجحت · ${fail} فشلت`);
process.exit(fail ? 1 : 0);
