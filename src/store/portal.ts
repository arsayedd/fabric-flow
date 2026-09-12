/**
 * بورتال العميل — لينك خاص لكل عميل يشوف فيه حسابه بنفسه.
 *
 * الفكرة إن العميل يبطّل يسأل «أنا عليّ كام؟» ويدخل يشوف: توريداته،
 * اللي دفعه، اللي عليه، والمتأخر، وكشف حساب بالرصيد الجاري.
 *
 * ## الحد الأمني — وده أهم حاجة في الملف ده
 *
 * الرابط **مفتوح**: اللي معاه التوكن يدخل بدون كلمة سر، لأن العميل مش
 * مستخدم في النظام ومش هنعمله حساب. يعني التوكن نفسه هو الصلاحية، والقاعدة
 * اللي بتحمينا إن كل اللي بيخرج من هنا بيمرّ على **دالة واحدة** هي
 * `portalView`، وهي بتبني كائن جديد بحقول مسمّية بالاسم — مش بتنقّح كائن
 * موجود.
 *
 * والفرق ده مش شكلي: لو كنا رجّعنا `Order` وشِلنا منه التكلفة، أول ما
 * يتضاف حقل جديد للأمر بيسافر للعميل لوحده وإحنا مش واخدين بالنا. لما
 * القائمة **بيضاء**، الحقل الجديد مايوصلش غير لما حد يكتبه هنا بإيده.
 *
 * واللي ممنوع يوصل للعميل بالاسم:
 * - **التكلفة والربح** (`pieceCost`, `piecePrice`, الهوامش) — ده عمر
 *   المصنع، ولو العميل شافه يبقى بيتفاوض وهو شايف ورقنا.
 * - **الملاحظات الداخلية** (`internalNotes`) — مكتوب على الحقل نفسه في
 *   `types.ts` إنها ماتظهرش في أي بورتال.
 * - **سكور العميل وتقييمه** وأي حكم داخلي عليه.
 * - **أي عميل تاني**: كل قراية مفلترة على `partyId` بتاع الـgrant.
 * - **حسابات المصنع**: الخزنة، الموردين، العمال، المرتجعات كتكلفة.
 *
 * ## والتوكن
 *
 * عشوائي من `crypto.getRandomValues` بـ١٦٠ بت، مش مشتق من رقم العميل —
 * لأن توكن متوقَّع معناه إن أي حد يقرا حسابات أي عميل.
 *
 * وبيتسحب بـ`revoke` مش بـdelete: الرابط اللي اتبعت في واتساب مش هينمسح
 * من موبايل حد، فمحتاجين نفضل عارفين إنه كان موجود واتسحب امتى وليه.
 *
 * ## والحد الحقيقي دلوقتي
 *
 * الدفتر محفوظ في `localStorage`، وده **لكل origin ولكل جهاز**. يعني
 * الرابط بيشتغل على الجهاز اللي فيه بيانات المصنع، ولما العميل يفتحه على
 * موبايله مش هيلاقي حاجة — والصفحة بتقول كده صريح بدل ما تقول «مش موجود».
 *
 * وده بيتحل بـSupabase: نفس `portalView` تبقى دالة على السيرفر، والتوكن
 * بيتحلّ هناك (`factory.resolve_tenant` بنفس الأسلوب)، والـRLS بتمنع أي
 * صف مش بتاع الـ`party_id` بتاع الـgrant. الكود اللي هنا مكتوب بالشكل ده
 * بالظبط عشان الانتقال يبقى نقل دالة، مش إعادة بناء.
 */

import { cairoToday, daysBetween, nid, qty } from "@/lib/utils";
import { clientBalance, clientStatement, confirmedCollections, fifoRemain } from "./compute";
import { orderStages } from "./manufacturing";
import { METHOD_LABEL, ORDER_STATUS_LABEL } from "./types";
import type { Db, OrderStatus, PortalGrant, PortalScope } from "./types";

/** الافتراضي: يشوف حسابه كامل ما عدا المستندات */
export const PORTAL_SCOPE_DEFAULT: PortalScope = {
  orders: true,
  invoices: true,
  payments: true,
  statement: true,
};

/** مصفوفة مكتوبة بالإيد — `Object.keys` بيرجّع `string[]` فبتضيع الأنواع */
export const PORTAL_SCOPE_KEYS = ["orders", "invoices", "payments", "statement"] as const;

export const PORTAL_SCOPE_LABEL: Record<keyof PortalScope, string> = {
  orders: "أوامر الإنتاج وحالتها",
  invoices: "التوريدات والمستحق على كل واحد",
  payments: "الدفعات اللي سدّدها",
  statement: "كشف حساب بالرصيد الجاري",
};

/**
 * توكن الرابط — ٢٠ بايت عشوائي بالنظام السادس عشر.
 *
 * `crypto.randomUUID` مكفّي للمعرّفات الداخلية، بس ده توكن حامل لصلاحية،
 * فبناخد عشوائي أكتر وبدون الشرطات اللي بتتقطع لما حد ينسخ الرابط.
 */
export function newPortalToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function blankGrant(factoryId: string, partyId: string, actor: { id: string; name: string }): PortalGrant {
  return {
    id: nid(),
    factoryId,
    partyId,
    token: newPortalToken(),
    scope: { ...PORTAL_SCOPE_DEFAULT },
    createdAt: new Date().toISOString(),
    createdById: actor.id,
    createdByName: actor.name,
    revokedAt: null,
    revokedReason: "",
    expiresAt: null,
    viewCount: 0,
    lastViewedAt: null,
  };
}

export function grantOfParty(db: Db, partyId: string): PortalGrant | null {
  const rows = (db.portalGrants ?? []).filter((g) => g.partyId === partyId && !g.revokedAt);
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

export type GrantState = "active" | "revoked" | "expired";

export function grantState(g: PortalGrant, today = cairoToday()): GrantState {
  if (g.revokedAt) return "revoked";
  if (g.expiresAt && g.expiresAt < today) return "expired";
  return "active";
}

/** الرابط الكامل. الصاب دومين بتاع المصنع أحسن — العميل بيشوف اسم مصنعه في العنوان */
export function portalUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/p/${token}`;
}

export function portalWhatsapp(opts: { name: string; url: string; factoryName: string; phone: string }): string {
  const text = encodeURIComponent(
    `السلام عليكم أستاذ ${opts.name}\n` +
      `ده رابط حسابك عندنا — تشوف منه توريداتك واللي سدّدته واللي مستحق:\n${opts.url}\n\n` +
      `الرابط خاص بك، محتاجش كلمة سر، ومتنفعش تبعته لحد تاني.\n${opts.factoryName}`,
  );
  const digits = opts.phone.replace(/\D/g, "");
  const phone = digits.startsWith("0") ? `2${digits}` : digits;
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}

/* ── المشروع اللي بيوصل للعميل ─────────────────────────────────── */

export type PortalInvoice = {
  id: string;
  date: string;
  dueDate: string;
  model: string;
  quantity: number | null;
  amount: number;
  paid: number;
  remaining: number;
  overdueDays: number;
};

export type PortalPayment = {
  id: string;
  date: string;
  amount: number;
  method: string;
  /** الشيك اللي لسه مااتحصّلش بيبان «مستني تأكيد» — العميل لازم يعرف إنه مش محسوب */
  pending: boolean;
};

export type PortalOrder = {
  id: string;
  code: string;
  model: string;
  quantity: number;
  produced: number;
  delivered: number;
  progress: number;
  dueDate: string;
  status: OrderStatus;
  statusLabel: string;
};

export type PortalStatementLine = {
  id: string;
  date: string;
  label: string;
  debit: number;
  credit: number;
  balance: number;
};

export type PortalAging = { label: string; amount: number; count: number };

export type PortalView = {
  factoryName: string;
  factoryPhone: string;
  factoryEmail: string;
  factoryAddress: string;
  factoryLogo: string | null;
  demo: boolean;
  clientName: string;
  clientCode: string;
  /** شروط السداد المتفق عليها — العميل من حقه يشوفها */
  paymentTermDays: number;
  asOf: string;
  totals: {
    invoiced: number;
    paid: number;
    balance: number;
    overdue: number;
    pendingPayments: number;
  };
  aging: PortalAging[];
  invoices: PortalInvoice[];
  payments: PortalPayment[];
  orders: PortalOrder[];
  statement: PortalStatementLine[];
  scope: PortalScope;
};

export type PortalResult =
  | { state: "ok"; grant: PortalGrant; view: PortalView }
  | { state: "unknown" }
  | { state: "no-data" }
  | { state: "revoked"; grant: PortalGrant }
  | { state: "expired"; grant: PortalGrant };

/**
 * التوكن → شاشة العميل.
 *
 * الترتيب مقصود: التوكن الأول، وبعده حالة الـgrant، وبعده البيانات. يعني
 * توكن مسحوب مابيقراش أي صف أصلًا — الرفض قبل القراية مش بعدها.
 *
 * و`no-data` مختلفة عن `unknown` بقصد: الأولى «التوكن سليم بس الدفتر مش
 * على الجهاز ده»، والتانية «مافيش توكن كده». لو خلطناهم العميل يفتكر
 * الرابط غلط ويكلّم المصنع، والمصنع يدوّر على مشكلة مش موجودة.
 */
export function portalView(db: Db, token: string): PortalResult {
  const clean = token.trim().toLowerCase();
  if (!clean) return { state: "unknown" };

  const grant = (db.portalGrants ?? []).find((g) => g.token === clean);
  if (!grant) return db.factory ? { state: "unknown" } : { state: "no-data" };

  const state = grantState(grant);
  if (state === "revoked") return { state: "revoked", grant };
  if (state === "expired") return { state: "expired", grant };

  const party = db.parties.find((p) => p.id === grant.partyId);
  if (!party) return { state: "no-data" };

  const today = cairoToday();
  const scope = { ...PORTAL_SCOPE_DEFAULT, ...grant.scope };

  /* التوريدات بتوزيع FIFO الموجود — مش توزيع تاني مخصوص للبورتال، عشان
   * الرقم اللي العميل يشوفه يبقى هو نفسه اللي المصنع شايفه */
  const mine = db.deliveries.filter((d) => d.clientId === party.id);
  const ids = new Set(mine.map((d) => d.id));
  const remains = fifoRemain(db.deliveries, db.collections).filter((d) => ids.has(d.id));
  const remainOf = new Map(remains.map((r) => [r.id, r.remaining]));

  const invoices: PortalInvoice[] = scope.invoices
    ? mine
        .map((d) => {
          const remaining = remainOf.get(d.id) ?? d.amount;
          return {
            id: d.id,
            date: d.date,
            dueDate: d.dueDate,
            model: d.model,
            quantity: d.quantity,
            amount: d.amount,
            paid: d.amount - remaining,
            remaining,
            overdueDays: remaining > 0.5 && d.dueDate < today ? daysBetween(d.dueDate, today) : 0,
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date))
    : [];

  const payments: PortalPayment[] = scope.payments
    ? db.collections
        .filter((c) => c.clientId === party.id)
        .map((c) => ({
          id: c.id,
          date: c.date,
          amount: c.amount,
          method: METHOD_LABEL[c.method] ?? c.method,
          pending: c.status === "pending",
        }))
        .sort((a, b) => b.date.localeCompare(a.date))
    : [];

  const orders: PortalOrder[] = scope.orders
    ? db.orders
        .filter((o) => o.clientId === party.id)
        .map((o) => {
          const stages = orderStages(db, o);
          const produced = stages.length ? stages[stages.length - 1].good : 0;
          const delivered = db.deliveries
            .filter((d) => d.orderId === o.id)
            .reduce((s, d) => s + (d.quantity ?? 0), 0);
          return {
            id: o.id,
            code: o.code,
            model: o.model,
            quantity: o.quantity,
            produced,
            delivered,
            progress: o.progress,
            dueDate: o.dueDate,
            status: o.status,
            statusLabel: ORDER_STATUS_LABEL[o.status],
          };
        })
        .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
    : [];

  const statement: PortalStatementLine[] = scope.statement
    ? clientStatement(db, party.id).map((l) => ({
        id: l.id,
        date: l.date,
        label: l.label,
        debit: l.debit,
        credit: l.credit,
        balance: l.balance,
      }))
    : [];

  const invoiced = mine.reduce((s, d) => s + d.amount, 0);
  const paid = confirmedCollections(db)
    .filter((c) => c.clientId === party.id)
    .reduce((s, c) => s + c.amount, 0);
  const pendingPayments = db.collections
    .filter((c) => c.clientId === party.id && c.status === "pending")
    .reduce((s, c) => s + c.amount, 0);

  const open = remains.filter((r) => r.remaining > 0.5);
  const overdue = open.filter((r) => r.dueDate < today).reduce((s, r) => s + r.remaining, 0);

  const buckets: { label: string; min: number; max: number }[] = [
    { label: "لسه مااستحقّش", min: -Infinity, max: 0 },
    { label: "متأخر ١–٣٠ يوم", min: 1, max: 30 },
    { label: "متأخر ٣١–٦٠ يوم", min: 31, max: 60 },
    { label: "متأخر أكتر من ٦٠ يوم", min: 61, max: Infinity },
  ];
  const aging: PortalAging[] = buckets
    .map((b) => {
      const rows = open.filter((r) => {
        const late = r.dueDate < today ? daysBetween(r.dueDate, today) : 0;
        return late >= b.min && late <= b.max;
      });
      return { label: b.label, amount: rows.reduce((s, r) => s + r.remaining, 0), count: rows.length };
    })
    .filter((b) => b.count > 0);

  const docs = db.settings.docs ?? {};

  return {
    state: "ok",
    grant,
    view: {
      factoryName: db.factory?.name ?? "",
      factoryPhone: docs.phone ?? "",
      factoryEmail: docs.email ?? "",
      factoryAddress: docs.address ?? "",
      factoryLogo: docs.logo ?? null,
      demo: Boolean(db.factory?.demo),
      clientName: party.name,
      clientCode: party.code,
      paymentTermDays: party.paymentTermDays,
      asOf: today,
      totals: { invoiced, paid, balance: clientBalance(db, party.id), overdue, pendingPayments },
      aging,
      invoices,
      payments,
      orders,
      statement,
      scope,
    },
  };
}

/**
 * نص الرسالة اللي المصنع بيبعتها للعميل لما يطلب الرابط.
 *
 * منفصلة عن `portalWhatsapp` عشان تتعرض في الواجهة قبل الإرسال — قاعدة
 * الواتساب في المواصفة إن مافيش رسالة بتتبعت من غير ما المصنع يشوفها.
 */
export function portalSummaryLine(view: PortalView): string {
  const { balance, overdue } = view.totals;
  if (balance <= 0.5) return "الحساب مسدّد بالكامل — مافيش مستحق عليك.";
  if (overdue > 0.5) return `المستحق ${qty(balance, 0)} جنيه، منه ${qty(overdue, 0)} جنيه فات ميعاده.`;
  return `المستحق ${qty(balance, 0)} جنيه، وكله لسه في ميعاده.`;
}
