/**
 * بيشغّل سكيما Supabase واختبارات العزل على Postgres محلي.
 *
 * ليه: سياسة RLS مكتوبة صح في نظرها ممكن تفضل مفتوحة تمامًا. الطريقة
 * الوحيدة لمعرفة إنها بتمنع فعلًا إننا نجرّب نعمل الممنوع بدور مستخدم
 * حقيقي ونشوف بيترفض. الملف ده بيبني قاعدة نضيفة من الصفر كل مرة، فلو
 * أي migration ماتشتغلش أو أي سياسة بقت متسايبة، بيفشل هنا مش على
 * سيرفر فيه بيانات مصنع.
 *
 * محتاج Postgres محلي شغّال:
 *   sudo apt-get install -y postgresql && sudo pg_ctlcluster 16 main start
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DB = "sanaa_rls_test";
const PSQL = "/usr/lib/postgresql/16/bin/psql";

/* لازم stderr مع stdout: تأكيدات `tst()` بتطلع NOTICE، والـNOTICE بيروح
 * على stderr. لو قرينا stdout بس، الاختبار بيبان ناجح وهو ماعرضش ولا
 * حسب ولا تأكيد واحد. */
const run = (args, input) => {
  const r = spawnSync("sudo", ["-u", "postgres", PSQL, ...args], { input, encoding: "utf8" });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    const err = new Error(`psql exited ${r.status}`);
    err.stderr = r.stderr;
    throw err;
  }
  return `${r.stdout}${r.stderr}`;
};

/* الكلاستر بيبقى واقف بعد أي restart، وماينفعش الاختبار ده يفشل لسبب
 * زي ده — فنجرّب نشغّله مرة واحدة قبل ما نستسلم */
const reset = () => {
  run(["-q", "-c", `drop database if exists ${DB}`]);
  run(["-q", "-c", `create database ${DB}`]);
};

try {
  reset();
} catch {
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
  join(ROOT, "supabase/tests/rls.sql"),
];

let failed = false;
let checks = 0;
for (const f of files) {
  const name = f.replace(`${ROOT}/`, "");
  try {
    const out = run(["-q", "-v", "ON_ERROR_STOP=1", "-d", DB, "-f", f]);
    console.log(`▸ ${name}`);
    for (const l of out.split("\n")) {
      const clean = l.replace(/^NOTICE:\s*/, "").trimEnd();
      if (!clean.trim()) continue;
      if (clean.includes("✓")) checks += 1;
      console.log(clean);
    }
  } catch (e) {
    failed = true;
    console.log(`▸ ${name}`);
    console.error((e.stderr ?? e.message).trim());
    break;
  }
}

if (!failed) {
  const counts = run([
    "-q",
    "-At",
    "-d",
    DB,
    "-c",
    `select count(*) filter (where rowsecurity) || '/' || count(*)
     from pg_tables where schemaname = 'factory'`,
  ]).trim();
  console.log(`\nجداول عليها RLS: ${counts}`);
  const open = run([
    "-q",
    "-At",
    "-d",
    DB,
    "-c",
    `select string_agg(tablename, ', ') from pg_tables t
     where schemaname = 'factory' and not rowsecurity`,
  ]).trim();
  /* جدول من غير RLS في سكيما فيها بيانات مصنع = جدول مقروء للكل */
  if (open) {
    console.error(`✗ جداول من غير RLS: ${open}`);
    failed = true;
  } else {
    console.log("مافيش جدول مسايب من غير RLS");
  }
}

/* لو حد شال تأكيدات من rls.sql، أو اتكتمت تاني، الرقم بيقل والاختبار
 * بيفشل — بدل ما يعدّي وهو مش بيختبر حاجة */
const FLOOR = 30;
console.log(`\nتأكيدات عزل: ${checks}`);
if (checks < FLOOR) {
  console.error(`✗ المفروض ${FLOOR} تأكيد على الأقل — طلع ${checks}`);
  failed = true;
}

run(["-q", "-c", `drop database if exists ${DB}`]);
/* بالصيغة اللي `run-all.mjs` بيقراها عشان الرقم يبان في الجدول */
console.log(`${checks} نجحت · ${failed ? 1 : 0} فشلت`);
console.log(failed ? "\nفشل" : "\nنجح");
process.exit(failed ? 1 : 0);
