/*
 * يتحقق من جدول Code 128 عندنا بمقارنته بمكتبة python-barcode المستقلة.
 *
 * المقارنة على مستوى **الجدول** مش على مستوى النص الكامل، لأن المكتبة
 * دي بتحسّن: بتقلب لترميز C في سلاسل الأرقام فالشريط بيطلع أقصر. إحنا
 * ترميز B دايمًا (أطول شوية، وأبسط وأضمن مع أكواد فيها شرطات). فاللي
 * بيتقاس هنا هو صحة الأنماط نفسها + نص خالي من سلاسل الأرقام كنهاية
 * لنهاية.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const src = readFileSync("src/lib/barcode.ts", "utf8");
const mine = [...src.split("const PATTERNS = [")[1].split("];")[0].matchAll(/"(\d+)"/g)].map((m) => m[1]);

const bits = (widths) =>
  [...widths].map((w, i) => (i % 2 === 0 ? "1" : "0").repeat(Number(w))).join("");

const lib = JSON.parse(
  execFileSync("python3", [
    "-c",
    "import barcode.charsets.code128 as c, json; print(json.dumps({'codes': list(c.CODES), 'stop': c.STOP}))",
  ]).toString(),
);

let bad = 0;
if (mine.length !== 107) {
  console.log(`FAIL الجدول فيه ${mine.length} نمط، المفروض ١٠٧`);
  bad++;
}
for (let v = 0; v < 106; v++) {
  if (bits(mine[v]) !== lib.codes[v]) {
    console.log(`FAIL النمط ${v}: ${bits(mine[v])} != ${lib.codes[v]}`);
    bad++;
  }
}
if (bits(mine[106]) !== `${lib.stop}11`) {
  console.log(`FAIL نمط النهاية: ${bits(mine[106])} != ${lib.stop}11`);
  bad++;
}

const START_B = 104;
const encode = (text) => {
  const values = [...text].map((c) => c.charCodeAt(0) - 32);
  const check = values.reduce((s, v, i) => s + v * (i + 1), START_B) % 103;
  return bits([START_B, ...values, check, 106].flatMap((v) => [...mine[v]].map(Number)));
};

/* نصوص مافيهاش سلسلة أرقام (٤ أو أكتر) عشان المكتبة ماتقلبش لترميز C */
for (const s of ["M-001", "P-003", "A", "WH-A1"]) {
  const theirs = execFileSync("python3", [
    "-c",
    `import barcode; print(barcode.get_barcode_class('code128')(${JSON.stringify(s)}).build()[0])`,
  ])
    .toString()
    .trim();
  const ok = encode(s) === theirs;
  if (!ok) {
    console.log(`FAIL نهاية لنهاية «${s}»`);
    bad++;
  }
}

console.log(bad ? `${bad} فشل` : "١٠٧ نمط + الشيك سم مطابقين لمكتبة مستقلة");
process.exit(bad ? 1 : 0);
