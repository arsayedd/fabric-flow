/**
 * البحث الشامل.
 *
 * مكان واحد للبحث في المصنع كله: أوامر، موديلات، خامات، جهات تعامل، عمال،
 * بنود مشتريات، وصفحات النظام. وأهم حاجة فيه إنه **بيحترم الصلاحية**:
 * البحث مابيرجّعش سجل من موديول المستخدم مالوش حق يشوفه — لأن نتيجة بحث
 * فيها اسم عميل ورصيده هي تسريب للبيانات زي ما الصفحة نفسها بالظبط.
 */

import { normalize } from "@/lib/utils";
import { ROUTE_LABEL } from "./nav";
import type { PermAction, PermModule } from "./permissions";
import type { Db } from "./types";

export type SearchKind = "order" | "product" | "material" | "party" | "worker" | "cost" | "page";

export const SEARCH_KIND_LABEL: Record<SearchKind, string> = {
  order: "أمر إنتاج",
  product: "موديل",
  material: "خامة",
  party: "جهة تعامل",
  worker: "عامل",
  cost: "بند مشتريات",
  page: "صفحة",
};

export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  to: string;
};

type May = (module: PermModule, action: PermAction) => boolean;

const LIMIT_PER_KIND = 5;

export function searchAll(db: Db, term: string, may: May): SearchHit[] {
  const q = normalize(term.trim());
  if (q.length < 2) return [];
  const hit = (text: string) => normalize(text).includes(q);
  const out: SearchHit[] = [];

  const take = (module: PermModule, rows: SearchHit[]) => {
    if (!may(module, "view")) return;
    out.push(...rows.slice(0, LIMIT_PER_KIND));
  };

  take(
    "production",
    db.orders
      .filter((o) => hit(o.code) || hit(o.model))
      .map((o) => ({
        kind: "order" as const,
        id: o.id,
        title: `${o.code} — ${o.model}`,
        subtitle: `${o.line} · ${o.quantity} قطعة`,
        to: `/orders/${o.id}`,
      })),
  );

  take(
    "sales",
    db.products
      .filter((p) => hit(p.name) || hit(p.sku))
      .map((p) => ({
        kind: "product" as const,
        id: p.id,
        title: p.name,
        subtitle: p.sku || "بدون كود",
        to: `/products/${p.id}`,
      })),
  );

  take(
    "inventory",
    db.materials
      .filter((m) => hit(m.name) || hit(m.sku))
      .map((m) => ({
        kind: "material" as const,
        id: m.id,
        title: m.name,
        subtitle: m.sku || "بدون كود",
        to: `/materials/${m.id}`,
      })),
  );

  take(
    "parties",
    db.parties
      .filter((p) => !p.mergedIntoId && (hit(p.name) || hit(p.phone) || hit(p.code) || hit(p.tradeName)))
      .map((p) => ({
        kind: "party" as const,
        id: p.id,
        title: p.name,
        subtitle: p.phone || p.city || "جهة تعامل",
        to: `/parties/${p.id}`,
      })),
  );

  take(
    "workers",
    db.workers
      .filter((w) => hit(w.name) || hit(w.phone))
      .map((w) => ({
        kind: "worker" as const,
        id: w.id,
        title: w.name,
        subtitle: w.phone || "عامل",
        to: `/workers/${w.id}`,
      })),
  );

  take(
    "purchasing",
    db.costItems
      .filter((c) => hit(c.name))
      .map((c) => ({
        kind: "cost" as const,
        id: c.id,
        title: c.name,
        subtitle: `بند مشتريات · ${c.unit}`,
        to: `/costs/${c.id}`,
      })),
  );

  for (const [to, label] of Object.entries(ROUTE_LABEL)) {
    if (!hit(label)) continue;
    out.push({ kind: "page", id: to, title: label, subtitle: "صفحة", to });
  }

  return out;
}
