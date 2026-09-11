import qrcode from "qrcode-generator";

/**
 * الـQR على المستندات.
 *
 * بيتبني كـ**مسار SVG** مش صورة: الطباعة بتطلعه حاد على أي طابعة،
 * ومحتاجش canvas ولا تحميل ملف. والمسار مستطيلات ملزوقة في `d` واحد،
 * فالورقة فيها عنصر واحد مش ألف مربع.
 *
 * ومستوى تصحيح الخطأ `M` عن قصد: الورقة بتتكرمش وتتوسّخ في المصنع،
 * والـ`M` بيقرا وفيه ١٥٪ تالف — والمستوى الأعلى بيكبّر المربع أكتر من
 * اللازم في ورقة حرارية ٥٨ مم.
 */
export type QrShape = { path: string; size: number };

export function qrPath(text: string, margin = 2): QrShape {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();

  const count = qr.getModuleCount();
  const size = count + margin * 2;
  const parts: string[] = [];

  for (let r = 0; r < count; r++) {
    let run = 0;
    for (let c = 0; c <= count; c++) {
      const dark = c < count && qr.isDark(r, c);
      if (dark) {
        run++;
        continue;
      }
      if (run) {
        // صف واحد كمستطيل واحد بدل مربعات متجاورة
        parts.push(`M${c - run + margin} ${r + margin}h${run}v1h-${run}z`);
        run = 0;
      }
    }
  }

  return { path: parts.join(""), size };
}

/**
 * رابط التحقق المطبوع على المستند.
 *
 * الرابط فيه رقم المستند والبصمة بس. **مش فيه مبالغ ولا أسماء** — أي حد
 * بيمسح الكود بيقراه، وورقة ضايعة مالهاش لازمة تفضح تعاملات المصنع.
 */
export function verifyUrl(origin: string, number: string, stamp: string): string {
  return `${origin}/verify/${encodeURIComponent(number)}?s=${encodeURIComponent(stamp)}`;
}
