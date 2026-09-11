/**
 * «آخر ما شُوهد» و«المفضلة».
 *
 * ده مش سجل تدقيق — ده راحة استخدام. عشان كده بيتخزَّن لكل مصنع لوحده
 * (نفس قاعدة العزل: مفتاح لكل مصنع)، ومابيتخزَّنش فيه غير عنوان ولينك،
 * فلو بيانات السجل اتغيّرت أو اتمسحت مافيش حاجة قديمة بتفضل معروضة —
 * اللينك بيروح للسجل نفسه واللي هناك هو الحقيقة.
 */

import { useEffect } from "react";

export type SeenKind = "order" | "product" | "material" | "party" | "worker";

export type Seen = { kind: SeenKind; id: string; label: string; to: string; at: string };

const LIMIT = 12;

function key(factoryId: string, bucket: "seen" | "fav"): string {
  return `factory-ledger.${bucket}:${factoryId}`;
}

function read(factoryId: string, bucket: "seen" | "fav"): Seen[] {
  if (!factoryId) return [];
  try {
    const raw = localStorage.getItem(key(factoryId, bucket));
    return raw ? (JSON.parse(raw) as Seen[]) : [];
  } catch {
    return [];
  }
}

export function loadSeen(factoryId: string): Seen[] {
  return read(factoryId, "seen");
}

export function loadFavorites(factoryId: string): Seen[] {
  return read(factoryId, "fav");
}

/** آخر ما شُوهد: الأحدث الأول، ومفيش تكرار لنفس السجل */
export function pushSeen(factoryId: string, row: Omit<Seen, "at">): Seen[] {
  if (!factoryId) return [];
  const now = new Date().toISOString();
  const next = [{ ...row, at: now }, ...read(factoryId, "seen").filter((s) => s.id !== row.id)].slice(0, LIMIT);
  localStorage.setItem(key(factoryId, "seen"), JSON.stringify(next));
  return next;
}

export function toggleFavorite(factoryId: string, row: Omit<Seen, "at">): Seen[] {
  if (!factoryId) return [];
  const now = read(factoryId, "fav");
  const next = now.some((f) => f.id === row.id)
    ? now.filter((f) => f.id !== row.id)
    : [{ ...row, at: new Date().toISOString() }, ...now];
  localStorage.setItem(key(factoryId, "fav"), JSON.stringify(next));
  return next;
}

export function isFavorite(rows: Seen[], id: string): boolean {
  return rows.some((f) => f.id === id);
}

/** تسجيل فتح سجل. السجل اللي لسه بيتحمّل (`null`) مابيتسجّلش */
export function useSeen(factoryId: string, row: Omit<Seen, "at"> | null): void {
  const id = row?.id ?? "";
  const label = row?.label ?? "";
  const kind = row?.kind;
  const to = row?.to ?? "";
  useEffect(() => {
    if (!factoryId || !id || !kind) return;
    pushSeen(factoryId, { kind, id, label, to });
  }, [factoryId, id, label, kind, to]);
}
