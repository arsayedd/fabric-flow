/**
 * مركز الإشعارات.
 *
 * الإشعار عندنا **مش رسالة اتبعتت وخلاص** — ده حالة قايمة دلوقتي في بيانات
 * المصنع. محرّك الاستثناءات هو نفسه مصدر الإشعارات، فمفيش إشعار بيقول
 * «خامة قربت تخلص» وهي خلصت فعلًا من أسبوع، ومفيش إشعار بيفضل موجود بعد ما
 * سببه اتحل: الإشعار بيختفي لوحده لأن السبب نفسه مابقاش موجود.
 *
 * اللي بيتخزَّن هو قرار المستخدم بس: «قرأته» و«أجّله لبعدين». ومفيش تاريخ
 * إرسال مزيّف — التوقيت الحقيقي هو «محسوب من البيانات الحالية».
 */

import { cairoToday } from "@/lib/utils";
import { exceptions, type Exception } from "./health";
import type { Db } from "./types";

export const NOTIF_CATEGORIES = ["production", "inventory", "finance", "quality", "workers", "system"] as const;
export type NotifCategory = (typeof NOTIF_CATEGORIES)[number];

export const NOTIF_LABEL: Record<NotifCategory, string> = {
  production: "الإنتاج",
  inventory: "المخزون",
  finance: "المالية",
  quality: "الجودة",
  workers: "العمال",
  system: "النظام",
};

export type Notification = Exception & {
  category: NotifCategory;
  read: boolean;
  snoozedUntil: string | null;
};

/** تصنيف الاستثناء من نوعه — نفس المفتاح اللي المحرّك بيولّده */
function categoryOf(key: string): NotifCategory {
  const head = key.split("-")[0];
  if (head === "late" || head === "stopped" || head === "loss" || head === "bottleneck") return "production";
  if (head === "mat" || head === "mrp") return "inventory";
  if (head === "due" || head === "pending" || head === "profit") return "finance";
  if (head === "quality") return "quality";
  /* الماكينة الواقفة استثناء إنتاج: هي طاقة ناقصة على خط، مش بند نظام */
  if (head === "machine") return "production";
  if (head === "attendance") return "workers";
  if (head === "party") return "finance";
  return "system";
}

type NotifState = { read: string[]; snoozed: Record<string, string> };

const EMPTY: NotifState = { read: [], snoozed: {} };

function stateKey(factoryId: string): string {
  return `factory-ledger.notify:${factoryId}`;
}

export function loadNotifState(factoryId: string): NotifState {
  if (!factoryId) return EMPTY;
  try {
    const raw = localStorage.getItem(stateKey(factoryId));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<NotifState>;
    return { read: parsed.read ?? [], snoozed: parsed.snoozed ?? {} };
  } catch {
    return EMPTY;
  }
}

export function saveNotifState(factoryId: string, state: NotifState): void {
  if (!factoryId) return;
  localStorage.setItem(stateKey(factoryId), JSON.stringify(state));
}

/**
 * القائمة المعروضة: الاستثناءات القايمة دلوقتي + قرار المستخدم عليها.
 * المؤجَّل بيختفي لحد تاريخه، وبعدها بيرجع لأن سببه لسه موجود.
 */
export function notifications(db: Db, state: NotifState): Notification[] {
  const today = cairoToday();
  const read = new Set(state.read);
  return exceptions(db)
    .map((e) => ({
      ...e,
      category: categoryOf(e.key),
      read: read.has(e.key),
      snoozedUntil: state.snoozed[e.key] ?? null,
    }))
    .filter((n) => !n.snoozedUntil || n.snoozedUntil <= today);
}

/** غير المقروء وغير المؤجَّل — الرقم اللي على الجرس */
export function unreadCount(rows: Notification[]): number {
  return rows.filter((n) => !n.read && n.tone !== "info").length;
}

export function markRead(state: NotifState, key: string): NotifState {
  return state.read.includes(key) ? state : { ...state, read: [...state.read, key] };
}

export function markAllRead(state: NotifState, rows: Notification[]): NotifState {
  return { ...state, read: [...new Set([...state.read, ...rows.map((r) => r.key)])] };
}

export function snooze(state: NotifState, key: string, untilDate: string): NotifState {
  return { ...state, snoozed: { ...state.snoozed, [key]: untilDate } };
}
