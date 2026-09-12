/**
 * مشغّل كل الاختبارات — بيطلع جدول حالة واحد.
 *
 * `node tests/run-all.mjs` بيشغّل كل ملف في الفولدر ده على سيرفر التطوير
 * (المنفذ 43127)، أو `node tests/run-all.mjs journey shell` لواحد أو اتنين.
 *
 * الحكم على النجاح بكود الخروج — الهارنسات بتكتب عدّاداتها بأربع صيغ مختلفة،
 * فالعدّاد للعرض بس. اللي مالوش عدّاد بيتكتب OK لأنه خرج بصفر.
 */
import { execFile } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SKIP = /^run-all\.mjs$/;
const files = readdirSync(HERE)
  .filter((f) => f.endsWith(".mjs") && !SKIP.test(f))
  .sort();

const only = process.argv.slice(2);
const list = only.length ? files.filter((f) => only.some((o) => f.includes(o))) : files;

const rows = [];
for (const f of list) {
  const started = Date.now();
  let out = "";
  let code = 0;
  try {
    const r = await run("node", [join(HERE, f)], { maxBuffer: 64 * 1024 * 1024, timeout: 600_000 });
    out = r.stdout + r.stderr;
  } catch (e) {
    out = `${e.stdout ?? ""}${e.stderr ?? ""}${e.message ?? ""}`;
    code = e.code ?? 1;
  }
  /* العدّادات اختيارية — الحكم الأساسي هو كود الخروج */
  const two =
    out.match(/نجح\s*(\d+)\s*·\s*فشل\s*(\d+)/) ??
    out.match(/(\d+)\s*نجحت\s*·\s*(\d+)\s*فشلت/) ??
    out.match(/(\d+)\s*ok\s*·\s*(\d+)\s*fail/);
  const split = two ? null : [out.match(/^PASS (\d+)/m), out.match(/^FAIL (\d+)/m)];
  const pass = two ? Number(two[1]) : split?.[0] ? Number(split[0][1]) : null;
  const fail = two ? Number(two[2]) : split?.[0] ? Number(split[1]?.[1] ?? 0) : null;
  const consoleErr = /أخطاء الكونسول:\s+(?!مافيش)/.test(out) || /console errors:\s*[1-9]/.test(out);
  const status = code !== 0 || fail ? "FAIL" : consoleErr ? "FAIL" : pass === null ? "OK" : "PASS";
  rows.push({ f, status, pass, fail, secs: Math.round((Date.now() - started) / 1000), out });
  console.log(
    `${status.padEnd(4)} ${f.padEnd(24)} ${pass === null ? "" : `${pass}/${(pass ?? 0) + (fail ?? 0)}`} ${
      consoleErr ? "· console errors" : ""
    } (${Math.round((Date.now() - started) / 1000)}s)`,
  );
  if (status === "FAIL") {
    const bad = out
      .split("\n")
      .filter((l) => /^\s*(✗|FAIL|\s*fail)/.test(l) || /\[error\]|\[pageerror\]/.test(l))
      .slice(0, 12);
    /* اللي مالوش عدّاد وفشل: آخر سطور خرجه هي كل اللي عندنا عنه */
    const lines = bad.length ? bad : out.trim().split("\n").slice(-8);
    for (const l of lines) console.log("      " + l.trim());
  }
}

const n = (s) => rows.filter((r) => r.status === s).length;
console.log(`\nإجمالي: ${rows.length} · PASS ${n("PASS")} · FAIL ${n("FAIL")} · بدون عدّاد ${n("OK")}`);
const assertions = rows.reduce((s, r) => s + (r.pass ?? 0), 0);
const fails = rows.reduce((s, r) => s + (r.fail ?? 0), 0);
console.log(`تأكيدات: ${assertions} نجحت · ${fails} فشلت`);

/* لازم يخرج بكود غلط لما يفشل حاجة. من غير السطر ده السويت كانت بتطبع
   `FAIL` وترجع صفر، يعني أي حاجة بتقرا كود الخروج — CI أو `&&` في
   سطر أوامر — بتشوف نجاح كامل والاختبار فاشل قدامها في نفس الشاشة. */
if (n("FAIL") > 0) process.exit(1);
