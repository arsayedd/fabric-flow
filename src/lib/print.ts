/**
 * محرك الطباعة.
 *
 * `window.print()` لوحده بيطبع الشاشة بالقائمة والأزرار. اللي بنعمله هنا
 * حاجة تانية: الورقة بتتبنى بمقاسها الحقيقي بالمليمتر، وCSS بيشيل باقي
 * الصفحة وقت الطباعة، **ومقاس الورقة بيتحقن في `@page` وقت الطلب** —
 * لأن `@page size` مابيتغيّرش من CSS متغيّرات، فلازم عنصر `<style>`
 * يتكتب قبل الطباعة ويتشال بعدها.
 *
 * ومقاسات الطابعات الحرارية (٨٠ و٥٨ مم) طولها `auto`: الفاتورة الحرارية
 * مالهاش صفحة تانية، بتطلع شريط واحد بطول محتواه.
 */

export const PAPER_SIZES = ["a4", "a5", "t80", "t58"] as const;
export type Paper = (typeof PAPER_SIZES)[number];

export const PAPER_LABEL: Record<Paper, string> = {
  a4: "A4",
  a5: "A5",
  t80: "حرارية ٨٠ مم",
  t58: "حرارية ٥٨ مم",
};

export const PAPER_HINT: Record<Paper, string> = {
  a4: "الفواتير والكشوف والتقارير",
  a5: "أذون التسليم والصرف",
  t80: "إيصالات الكاشير والتحصيل",
  t58: "إيصالات صغيرة وبطاقات الدفعات",
};

/** عرض الورقة بالمليمتر — المعاينة بتستخدمه في التصغير */
export const PAPER_WIDTH_MM: Record<Paper, number> = { a4: 210, a5: 148, t80: 80, t58: 58 };

const PAGE_RULE: Record<Paper, string> = {
  a4: "@page { size: A4 portrait; margin: 10mm; }",
  a5: "@page { size: A5 portrait; margin: 8mm; }",
  t80: "@page { size: 80mm auto; margin: 3mm; }",
  t58: "@page { size: 58mm auto; margin: 2mm; }",
};

export type Orientation = "portrait" | "landscape";

const STYLE_ID = "sanaa-page-size";

/**
 * بيطبع اللي جوه `.print-root`. الاستدعاء لازم يكون بعد ما الورقة
 * تتركّب في الشاشة، فالمكوّن بيستخدمه من جوه المعاينة.
 */
export function printPaper(paper: Paper, orientation: Orientation = "portrait") {
  const rule =
    orientation === "landscape" && (paper === "a4" || paper === "a5")
      ? PAGE_RULE[paper].replace("portrait", "landscape")
      : PAGE_RULE[paper];

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.append(style);
  }
  style.textContent = rule;

  // الطباعة متزامنة في المتصفحات، فالتنضيف بعدها آمن
  window.print();
}

/** مقاس الورقة الافتراضي لكل نوع مستند */
export function defaultPaperFor(kind: "document" | "receipt" | "table"): Paper {
  if (kind === "receipt") return "t80";
  return "a4";
}
