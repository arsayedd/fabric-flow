import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function nid(): string {
  return crypto.randomUUID();
}

export function cairoToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** الساعة بتوقيت القاهرة — التحية بتتغيّر بيها */
export function cairoHour(): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", hour12: false }).format(new Date()),
  );
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
}

export function money(amount: number): string {
  return new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

/** كميات المخزن والإنتاج بنفس أرقام الفلوس */
export function qty(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("ar-EG", { maximumFractionDigits }).format(value);
}

export function moneyPlain(amount: number): string {
  return new Intl.NumberFormat("ar-EG", {
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

/**
 * توحيد النص قبل المقارنة.
 *
 * البحث العربي لازم يلاقي «أحمد» لما تكتب «احمد»، و«فاطمه» لما تكتب «فاطمة».
 * فبنشيل التشكيل والتطويل، ونوحّد الألف بأشكالها والياء والتاء المربوطة،
 * ونحوّل الأرقام العربية للاتينية — عشان «١٠٤٢» تلاقي «1042».
 */
export function normalize(text: string): string {
  return (text ?? "")
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ؤ]/g, "و")
    .replace(/[ئ]/g, "ي")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .toLowerCase()
    .trim();
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00`);
  const b = Date.parse(`${to}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

export async function fileToDataUrl(file: File, maxBytes = 5 * 1024 * 1024): Promise<string> {
  if (file.size > maxBytes) {
    throw new Error("الصورة أكبر من 5 ميجا. صغّرها وحاول تاني.");
  }
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("مش قادر أقرأ الصورة."));
    reader.readAsDataURL(file);
  });
}
