import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const BASE = "http://127.0.0.1:43127";
const b = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await b.newPage();
await page.goto(BASE);

const base64 = await page.evaluate(async () => {
  const { buildXlsx } = await import("/src/lib/xlsx.ts");
  const blob = buildXlsx([
    {
      name: "ملخص",
      rows: [
        { style: "title", cells: [{ kind: "text", value: "تقرير الإنتاج" }] },
        { cells: [{ kind: "text", value: "الفترة" }, { kind: "text", value: "الشهر ده" }] },
        { style: "total", cells: [{ kind: "text", value: "الإجمالي" }, { kind: "money", value: 147100 }] },
      ],
      widths: [26, 40],
    },
    {
      name: "تفاصيل",
      rows: [
        { style: "header", cells: [{ kind: "text", value: "الأمر" }, { kind: "text", value: "التاريخ" }, { kind: "text", value: "الكمية" }, { kind: "text", value: "الإيراد" }, { kind: "text", value: "الهامش" }] },
        { cells: [{ kind: "code", value: "SN-1042" }, { kind: "date", value: "2026-09-01" }, { kind: "qty", value: 300 }, { kind: "money", value: 50350 }, { kind: "pct", value: 20.4 }] },
        { cells: [{ kind: "code", value: "SN-1043" }, { kind: "date", value: "2026-09-04" }, { kind: "qty", value: 40 }, { kind: "money", value: 24000 }, { kind: "pct", value: 22 }] },
        { style: "total", cells: [{ kind: "text", value: "الإجمالي" }, { kind: "blank" }, { kind: "formula", formula: "SUBTOTAL(109,C2:C3)", as: "qty" }, { kind: "formula", formula: "SUBTOTAL(109,D2:D3)", as: "money" }, { kind: "blank" }] },
      ],
      widths: [14, 14, 10, 14, 10],
      headerRow: 1,
      filterCols: 5,
    },
  ]);
  const buf = await blob.arrayBuffer();
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
});

writeFileSync("/tmp/test.xlsx", Buffer.from(base64, "base64"));
console.log("written", Buffer.from(base64, "base64").length, "bytes");
await b.close();
