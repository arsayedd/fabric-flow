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
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DB = "sanaa_rls_test";
const PSQL = "/usr/lib/postgresql/16/bin/psql";

const run = (args, input) =>
  execFileSync("sudo", ["-u", "postgres", PSQL, ...args], {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

try {
  run(["-q", "-c", `drop database if exists ${DB}`]);
  run(["-q", "-c", `create database ${DB}`]);
} catch (e) {
  console.error("مش قادر يعمل قاعدة اختبار — Postgres شغّال؟");
  console.error(e.stderr ?? e.message);
  process.exit(1);
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
for (const f of files) {
  const name = f.replace(`${ROOT}/`, "");
  try {
    const out = run(["-q", "-v", "ON_ERROR_STOP=1", "-d", DB, "-f", f]);
    const notices = out.split("\n").filter((l) => l.trim());
    console.log(`▸ ${name}`);
    for (const l of notices) console.log(l.replace(/^NOTICE:\s*/, ""));
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

run(["-q", "-c", `drop database if exists ${DB}`]);
console.log(failed ? "\nفشل" : "\nنجح");
process.exit(failed ? 1 : 0);
