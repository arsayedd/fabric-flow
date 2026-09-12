/**
 * صنعة — اسأل صنعة.
 *
 * ده **مش شات بوت**. الفرق مش في الشكل، في الالتزام:
 *
 *  1) **الإجابة مابتتولّدش، بتتحسب.** كل سؤال هنا مربوط بدالة موجودة
 *     في المخزن بتقرا من نفس حركات المصنع اللي الشاشات بتقرا منها.
 *     فالرقم اللي بيطلع هنا هو **بالحرف** نفس الرقم اللي في الشاشة —
 *     مفيش حساب موازي، ومفيش تقدير بيتلبّس هيئة حقيقة.
 *
 *  2) **مفيش سؤال بيتجاوب بالتخمين.** لو الكلام مش مطابق أي سؤال
 *     معروف، الجواب هو «مش فاهم» + الأسئلة اللي النظام يعرف يجاوبها.
 *     الاختراع هنا أخطر من الاعتراف: صاحب المصنع بياخد قرار بالرقم.
 *
 *  3) **البيانات ناقصة ≠ صفر.** لو المصنع ماسجّلش اللي السؤال محتاجه،
 *     الجواب بيقول **محتاج إيه** (`missing`) بدل ما يعرض صفر يتقرا
 *     إنجاز أو كارثة.
 *
 *  4) **الصلاحية بتقفل الجواب.** كل سؤال عليه موديول صلاحية، والمشرف
 *     اللي مايشوفش المالية مايقدرش يوصل لأرقامها من هنا. لو كان ينفع،
 *     الشاشة دي كانت هتبقى باب خلفي حول محرّك الصلاحيات كله.
 *
 *  5) **كل جواب بيوصّل للمصدر.** `to` هي الشاشة اللي الرقم اتحسب
 *     فيها، وكل صف في الجواب لينك للسجل نفسه — فحد يقدر يتحقق مش
 *     يصدّق.
 */

import { cairoToday, formatDate, moneyPlain, qty as num } from "@/lib/utils";
import { receivables, allAccountBalances, payables } from "./compute";
import { profitDashboard } from "./costing";
import { clientContribution } from "./clients";
import { deadStock, orderMix, rangeOf, workerLeaderboard } from "./command";
import { overview } from "./health";
import { downtimeCauses, machineSummary } from "./machines";
import { materialStock } from "./manufacturing";
import { capacityOutlook, schedule } from "./planning";
import { copq, lineQuality, problemPareto, qualityCenter } from "./quality";
import { supplierRealCosts } from "./realcost";
import type { PermModule } from "./permissions";
import type { Db } from "./types";

export type AskRow = { label: string; value: string; sub?: string; to?: string };

export type AskAnswer = {
  key: string;
  /** السؤال بصيغته المعروفة — بيتعرض فوق الجواب عشان المستخدم يعرف فهمنا إيه */
  question: string;
  perm: PermModule;
  /** الجواب في سطر */
  headline: string;
  rows: AskRow[];
  /** الرقم اتحسب منين — الشفافية دي هي اللي بتخلي الجواب قابل للتحقق */
  basis: string;
  to: string | null;
  /** لو البيانات مش كفاية: محتاج إيه بالظبط */
  missing: string | null;
};

type Intent = {
  key: string;
  question: string;
  perm: PermModule;
  /** كلمات لو أي واحدة فيها ظهرت، السؤال ده مرشّح */
  words: string[];
  /** كلمات بتقوّي الترشيح لما تكون مع اللي فوق */
  boost?: string[];
  run: (db: Db) => { headline: string; rows: AskRow[]; basis: string; to: string | null; missing?: string | null };
};

/* ── تطبيع العربي ──────────────────────────────────────────────── */

/**
 * المصنع بيكتب «إنهي» و«أنهي» و«انهى»، و«الماكينه» و«الماكينة».
 * فالمقارنة على نص مطبّع: الهمزات واحدة، والتاء المربوطة هاء،
 * والتشكيل والعلامات مشيلة.
 */
export function normalize(text: string): string {
  return text
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[؟?!.,،:؛()"'«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ── الأسئلة ───────────────────────────────────────────────────── */

const INTENTS: Intent[] = [
  {
    key: "profit-month",
    question: "ربحت كام الشهر ده؟",
    perm: "finance",
    words: ["ربحت", "ربح", "الربح", "خسرت", "صافي"],
    boost: ["الشهر", "شهر"],
    run: (db) => {
      const o = overview(db);
      if (!o.revenueMonth && !o.costMonth) {
        return {
          headline: "مفيش توريدات ولا مصروفات مسجّلة في آخر ٣٠ يوم.",
          rows: [],
          basis: "الحساب من دفتر التوريدات والمصروفات وأجور العمال في آخر ٣٠ يوم.",
          to: "/treasury",
          missing: "توريدات ومصروفات مسجّلة بتاريخها",
        };
      }
      return {
        headline: `${moneyPlain(o.profitMonth)} ج في آخر ٣٠ يوم.`,
        rows: [
          { label: "إيراد التوريدات", value: `${moneyPlain(o.revenueMonth)} ج`, to: "/collections" },
          { label: "مصروفات وأجور", value: `${moneyPlain(o.costMonth)} ج`, to: "/costs" },
          { label: "تكلفة الهالك", value: `${moneyPlain(o.wasteCostMonth)} ج`, to: "/materials" },
        ],
        basis:
          "إيراد = توريدات آخر ٣٠ يوم بقيمتها. المصروف = فواتير المصروفات + أجور العمال في نفس المدة. ده ربح دفتري على الحركات المسجّلة، مش ربح موديل محسوب بورقة تكلفة.",
        to: "/treasury",
      };
    },
  },

  {
    key: "cash",
    question: "عندي كام فلوس دلوقتي؟",
    perm: "finance",
    words: ["كاش", "الخزينه", "خزينه", "فلوس", "رصيد", "سيوله"],
    run: (db) => {
      const rows = allAccountBalances(db);
      const total = rows.reduce((s, a) => s + a.balance, 0);
      const due = payables(db);
      return {
        headline: `${moneyPlain(total)} ج في ${num(rows.length, 0)} حساب.`,
        rows: [
          ...rows.map((a) => ({ label: a.name, value: `${moneyPlain(a.balance)} ج`, to: "/treasury" })),
          { label: "مستحق للموردين", value: `${moneyPlain(due.vendorTotal)} ج`, to: "/costs" },
          { label: "مستحق للعمال والورش", value: `${moneyPlain(due.workerTotal + due.workshopTotal)} ج`, to: "/workers" },
        ],
        basis: "الرصيد = التحصيلات المؤكدة ناقص المدفوعات، لكل حساب على حدة. التحصيل المستني تأكيد مش داخل.",
        to: "/treasury",
      };
    },
  },

  {
    key: "overdue",
    question: "مين عليه فلوس متأخرة؟",
    perm: "finance",
    words: ["متاخره", "متاخر", "تحصيل", "مستحق", "مديون", "عليه فلوس", "يدفع"],
    run: (db) => {
      const rec = receivables(db);
      if (!rec.overdue.length) {
        return {
          headline: "مفيش تحصيل فات ميعاده.",
          rows: rec.week.slice(0, 5).map((r) => ({
            label: r.clientName,
            value: `${moneyPlain(r.remaining)} ج`,
            sub: `ميعاده ${formatDate(r.dueDate)}`,
            to: `/parties/${r.clientId}`,
          })),
          basis: "المتأخر = توريد ميعاد سداده فات ولسه عليه باقي. الصفوف اللي فوق دي مستحقات الأسبوع الجاي.",
          to: "/collections",
        };
      }
      const byClient = new Map<string, { name: string; amount: number; oldest: string; id: string }>();
      for (const r of rec.overdue) {
        const cur = byClient.get(r.clientId);
        byClient.set(r.clientId, {
          id: r.clientId,
          name: r.clientName,
          amount: (cur?.amount ?? 0) + r.remaining,
          oldest: cur ? (cur.oldest < r.dueDate ? cur.oldest : r.dueDate) : r.dueDate,
        });
      }
      const rows = [...byClient.values()].sort((a, b) => b.amount - a.amount);
      const total = rows.reduce((s, r) => s + r.amount, 0);
      return {
        headline: `${moneyPlain(total)} ج متأخرة على ${num(rows.length, 0)} جهة — وأكبرها ${rows[0].name}.`,
        rows: rows.slice(0, 8).map((r) => ({
          label: r.name,
          value: `${moneyPlain(r.amount)} ج`,
          sub: `أقدم توريد ميعاده ${formatDate(r.oldest)}`,
          to: `/parties/${r.id}`,
        })),
        basis: "بالعميل مش بالتوريد، والمبلغ هو الباقي بعد التحصيلات المؤكدة بترتيب أقدم توريد.",
        to: "/collections",
      };
    },
  },

  {
    key: "client-profit",
    question: "أنهي عميل بيجيب ربح فعلي؟",
    perm: "parties",
    words: ["عميل", "عملاء", "براند", "اكتر عميل"],
    boost: ["ربح", "مساهمه", "هامش"],
    run: (db) => {
      const customers = db.parties.filter((p) => !p.mergedIntoId && p.roles.includes("customer"));
      const rows = customers
        .map((p) => ({ party: p, c: clientContribution(db, p.id) }))
        .filter((x) => x.c.scopedRevenue > 0)
        .sort((a, b) => b.c.net - a.c.net);
      if (!rows.length) {
        return {
          headline: "مفيش عميل ربحه محسوب لسه.",
          rows: [],
          basis: "صافي المساهمة محتاج توريدات على موديلات عندها ورقة تكلفة.",
          to: "/parties",
          missing: "قوائم خامات ومسارات تشغيل للموديلات اللي بتتسلّم للعملاء",
        };
      }
      const best = rows[0];
      return {
        headline: `${best.party.name} — صافي مساهمة ${moneyPlain(best.c.net)} ج بهامش ${
          best.c.marginPct === null ? "مش محسوب" : `${num(Math.round(best.c.marginPct), 0)}٪`
        }.`,
        rows: rows.slice(0, 8).map((x) => ({
          label: x.party.name,
          value: `${moneyPlain(x.c.net)} ج`,
          sub: `إيراد محسوب ${moneyPlain(x.c.scopedRevenue)} ج${
            x.c.marginPct === null ? "" : ` · هامش ${num(Math.round(x.c.marginPct), 0)}٪`
          }`,
          to: `/parties/${x.party.id}`,
        })),
        basis:
          "الترتيب بصافي المساهمة: إيراد الموديلات اللي عندها ورقة تكلفة ناقص تكلفتها ناقص المرتجعات وإشعارات الخصم الفعلية. الإيراد اللي موديله مش مكلّف مش داخل، والنسبة المحسوبة مكتوبة في ملف العميل.",
        to: "/parties",
      };
    },
  },

  {
    key: "late-orders",
    question: "أنهي أوامر مش هتلحق ميعادها؟",
    perm: "production",
    words: ["متاخره", "تاخير", "ميعاد", "هتلحق", "اوامر", "امر"],
    boost: ["مش هتلحق", "متاخر"],
    run: (db) => {
      const plan = schedule(db);
      const late = plan.rows.filter((r) => r.lateDays > 0 && !r.isExtra).sort((a, b) => b.lateDays - a.lateDays);
      if (!late.length) {
        return {
          headline: `مفيش أمر متأخر — ${num(plan.rows.filter((r) => !r.isExtra).length, 0)} أمر في الجدول كلهم في ميعادهم.`,
          rows: [],
          basis: "الجدولة بتقارن الشغل الباقي بالطاقة اليومية، وبتحسب تاريخ الخلوص المتوقع لكل أمر.",
          to: "/planning",
        };
      }
      return {
        headline: `${num(late.length, 0)} أمر مش هيلحق — وأسوأهم ${late[0].code} بـ${num(late[0].lateDays, 0)} يوم.`,
        rows: late.slice(0, 8).map((r) => ({
          label: r.code,
          value: `متأخر ${num(r.lateDays, 0)} يوم`,
          sub: `هيخلص ${formatDate(r.finish)} والميعاد ${formatDate(r.dueDate)}`,
          to: `/orders/${r.id}`,
        })),
        basis: "التأخير محسوب من الجدولة نفسها: الدقايق الباقية على الأمر مقابل الطاقة المتاحة بترتيب الأولوية الحالي.",
        to: "/planning",
      };
    },
  },

  {
    key: "production-today",
    question: "أنتجت كام النهارده؟",
    perm: "production",
    words: ["انتجت", "الانتاج", "انتاج", "النهارده", "قطع"],
    run: (db) => {
      const o = overview(db);
      const mix = orderMix(db);
      return {
        headline: `${num(o.producedToday, 0)} قطعة النهارده، و${num(o.producedWeek, 0)} في آخر أسبوع.`,
        rows: [
          ...mix.map((m) => ({ label: m.label, value: `${num(m.count, 0)} أمر`, to: m.to })),
          { label: "نسبة العيوب في الشهر", value: o.defectPct === null ? "مش محسوبة" : `${num(o.defectPct, 1)}٪`, to: "/quality" },
        ],
        basis: "المنتَج = الكمية السليمة على آخر مرحلة في مسار الموديل، عشان القطعة متتعدّش مرتين.",
        to: "/floor",
      };
    },
  },

  {
    key: "low-stock",
    question: "أنهي خامات قربت تخلص؟",
    perm: "inventory",
    words: ["خامه", "خامات", "مخزون", "رصيد", "تخلص", "ناقص", "اشتري"],
    run: (db) => {
      const rows = materialStock(db)
        .filter((m) => m.perDay > 0 && m.daysOfCover !== null)
        .sort((a, b) => (a.daysOfCover as number) - (b.daysOfCover as number));
      if (!rows.length) {
        return {
          headline: "مفيش خامة عندها استهلاك مسجّل، فمفيش كفاية أيام محسوبة.",
          rows: [],
          basis: "أيام الكفاية = الرصيد ÷ متوسط الاستهلاك اليومي في آخر ٣٠ يوم.",
          to: "/materials",
          missing: "حركات صرف خامات على أوامر الإنتاج",
        };
      }
      const risky = rows.filter((m) => (m.daysOfCover as number) <= m.leadTimeDays + 3);
      return {
        headline: risky.length
          ? `${num(risky.length, 0)} خامة كفايتها أقل من مدة توريدها — وأخطرها ${risky[0].name}.`
          : `أقل كفاية عندك ${rows[0].name} بـ${num(Math.round(rows[0].daysOfCover as number), 0)} يوم، وكلها فوق مدة التوريد.`,
        rows: rows.slice(0, 8).map((m) => ({
          label: m.name,
          value: `${num(Math.round(m.daysOfCover as number), 0)} يوم`,
          sub: `رصيد ${num(m.qty, 2)} · استهلاك ${num(m.perDay, 2)}/يوم · توريد ${num(m.leadTimeDays, 0)} يوم`,
          to: `/materials/${m.id}`,
        })),
        basis: "الكفاية = الرصيد ÷ متوسط الاستهلاك اليومي. والخطر بيتحدد بمقارنتها بمدة توريد الخامة نفسها مش برقم واحد للكل.",
        to: "/materials",
      };
    },
  },

  {
    key: "dead-stock",
    question: "فيه كاش نايم في المخزن؟",
    perm: "inventory",
    words: ["راكد", "نايم", "مش بتتحرك", "ميت"],
    run: (db) => {
      const d = deadStock(db);
      if (!d.rows.length) {
        return {
          headline: "مفيش خامة عندها رصيد ومفيش عليها أي صرف.",
          rows: [],
          basis: "الراكد = خامة رصيدها موجب ومفيش عليها حركة صرف في الدفتر.",
          to: "/materials",
        };
      }
      return {
        headline: `${moneyPlain(d.value)} ج راكدة في ${num(d.rows.length, 0)} خامة.`,
        rows: d.rows.slice(0, 8).map((r) => ({
          label: r.name,
          value: `${moneyPlain(r.value)} ج`,
          sub: `رصيد ${num(r.qty, 2)} ${r.unit}${r.lastMove ? ` · آخر حركة ${formatDate(r.lastMove)}` : " · مفيش حركة"}`,
          to: `/materials/${r.id}`,
        })),
        basis: "القيمة بمتوسط تكلفة الخامة. الراكد مش بالضرورة خسارة — بس هو فلوس واقفة مش بتدور.",
        to: "/materials",
      };
    },
  },

  {
    key: "model-profit",
    question: "أنهي موديل أعلى ربح؟",
    perm: "costing",
    words: ["موديل", "موديلات", "هامش", "تكلفه القطعه", "منتج"],
    boost: ["ربح", "اعلي", "احسن", "اكتر"],
    run: (db) => {
      const d = profitDashboard(db);
      if (!d.best.length) {
        return {
          headline: "مفيش موديل ربحه محسوب لسه.",
          rows: [],
          basis: "ربح الموديل محتاج ورقة تكلفة كاملة: خامات ومسار تشغيل وسعر بيع.",
          to: "/costing",
          missing: "قوائم خامات ومسارات تشغيل وأسعار بيع للموديلات",
        };
      }
      const best = d.best[0];
      return {
        headline: `${best.product.name} — ربح إجمالي ${moneyPlain(best.totalProfit)} ج بهامش ${
          best.marginPct === null ? "مش محسوب" : `${num(Math.round(best.marginPct), 0)}٪`
        }.`,
        rows: [
          ...d.best.slice(0, 5).map((r) => ({
            label: r.product.name,
            value: `${moneyPlain(r.totalProfit)} ج`,
            sub: `تكلفة ${moneyPlain(r.cost)} ج · سعر ${moneyPlain(r.price)} ج · منتَج ${num(r.producedQty, 0)}`,
            to: `/products/${r.product.id}`,
          })),
          ...d.worst.slice(0, 3).map((r) => ({
            label: `${r.product.name} — الأقل`,
            value: `${moneyPlain(r.totalProfit)} ج`,
            sub: r.belowTarget ? `تحت الهامش المستهدف ${num(d.targetMarginPct, 0)}٪` : "أقل ربح في الترتيب",
            to: `/products/${r.product.id}`,
          })),
        ],
        basis: `الربح الإجمالي = (سعر − تكلفة الورقة) × المنتَج فعلًا. و${num(d.ready, 0)} موديل من ${num(
          d.products,
          0,
        )} عندهم ورقة كاملة — الباقي مش داخل الترتيب.`,
        to: "/costing",
      };
    },
  },

  {
    key: "returns",
    question: "أنهي موديل أكتر مرتجعات؟",
    perm: "quality",
    words: ["مرتجع", "مرتجعات", "راجع", "رجع"],
    run: (db) => {
      const c = qualityCenter(db, 30);
      const rows = problemPareto(db, 30);
      if (!c.cases) {
        return {
          headline: "مفيش مرتجعات مسجّلة في آخر ٣٠ يوم.",
          rows: [],
          basis: "الحساب من حالات المرتجعات بتاريخها، مش من ذاكرة حد.",
          to: "/returns",
        };
      }
      return {
        headline: `${num(c.cases, 0)} حالة بـ${num(c.pieces, 0)} قطعة، وصافي الخسارة ${moneyPlain(c.netLoss)} ج.`,
        rows: rows.slice(0, 8).map((r) => ({
          label: r.label,
          value: `${num(r.qty, 0)} قطعة`,
          sub: `${moneyPlain(r.cost)} ج · ${num(Math.round(r.pct), 0)}٪ من الكمية${
            r.pending ? ` · ${num(r.pending, 0)} حالة لسه مااتسوّتش` : ""
          }`,
          to: "/quality",
        })),
        basis:
          "المرتّب بالكمية. وأكتر مشكلة في العدد مش شرط تكون أغلى مشكلة — ترتيب التكلفة في مركز الجودة تبويب المشاكل.",
        to: "/quality",
      };
    },
  },

  {
    key: "quality-line",
    question: "أنهي خط أكتر عيوب؟",
    perm: "quality",
    words: ["عيوب", "عيب", "خط", "خطوط", "جوده"],
    run: (db) => {
      const rows = lineQuality(db, 90)
        .filter((r) => r.defects + r.returned > 0)
        .sort((a, b) => b.cost - a.cost);
      if (!rows.length) {
        return {
          headline: "مفيش عيوب متسجّلة على خط بعينه في آخر ٩٠ يوم.",
          rows: [],
          basis: "الخط بييجي من أمر الإنتاج اللي المشكلة اتسجّلت عليه.",
          to: "/quality",
          missing: "مشاكل مسجّلة على أوامر لها خط",
        };
      }
      return {
        headline: `${rows[0].line} — ${num(rows[0].defects + rows[0].returned, 0)} قطعة بمشاكل وتكلفة ${moneyPlain(
          rows[0].cost,
        )} ج.`,
        rows: rows.slice(0, 8).map((r) => ({
          label: r.line,
          value: `${num(r.defects + r.returned, 0)} قطعة`,
          sub: `${moneyPlain(r.cost)} ج · ${
            r.defectPct === null ? "نسبته مش محسوبة (إنتاجه أقل من الحد الأدنى للمقارنة)" : `${num(r.defectPct, 1)}٪ عيوب داخلية`
          }${r.returnPct === null ? "" : ` · ${num(r.returnPct, 1)}٪ مرتجعات`}`,
          to: "/quality",
        })),
        basis: "النسبة من إنتاج الخط نفسه مش من إنتاج المصنع — الخط اللي بينتج أكتر بيطلع عليه عيوب أكتر بالعدد وهو مش الأسوأ.",
        to: "/quality",
      };
    },
  },

  {
    key: "copq",
    question: "الجودة الرديئة بتكلفني كام؟",
    perm: "quality",
    words: ["تكلفه الجوده", "الجوده الرديئه", "copq", "خساره الجوده"],
    run: (db) => {
      const c = copq(db, 30);
      return {
        headline: `${moneyPlain(c.total)} ج في آخر ٣٠ يوم${
          c.ofRevenuePct === null ? "" : ` — ${num(c.ofRevenuePct, 1)}٪ من الإيراد`
        }.`,
        rows: c.blocks.map((b) => ({
          label: b.label,
          value: b.amount === null ? "مش محسوب" : `${moneyPlain(b.amount)} ج`,
          sub: b.missing ?? b.why,
          to: "/quality",
        })),
        basis: `المحسوب يمثّل ${num(Math.round(c.coverage), 0)}٪ من البنود المتعارف عليها. البند اللي مفيش له بيانات مكتوب «مش محسوب» مش صفر.`,
        to: "/quality",
      };
    },
  },

  {
    key: "machines",
    question: "كام ماكينة واقفة، وليه؟",
    perm: "machines",
    words: ["ماكينه", "ماكينات", "واقفه", "عطل", "توقف", "صيانه"],
    run: (db) => {
      const s = machineSummary(db);
      if (!s.total) {
        return {
          headline: "مفيش ماكينات مسجّلة.",
          rows: [],
          basis: "التوقف بيتحسب من تذاكر على ماكينات مسجّلة.",
          to: "/machines",
          missing: "سجل ماكينات بدقايق تشغيل يومية",
        };
      }
      const causes = downtimeCauses(db);
      return {
        headline: `${num(s.byState.down + s.byState.maintenance, 0)} واقفة من ${num(
          s.total - s.byState.retired,
          0,
        )} في الخدمة، وساعات التوقف ${num(s.downHours, 1)} في ٣٠ يوم.`,
        rows: [
          ...causes.slice(0, 5).map((c) => ({
            label: c.cause,
            value: `${num(Math.round(c.minutes / 60), 0)} ساعة`,
            sub: `${num(c.count, 0)} تذكرة · ${moneyPlain(c.cost)} ج`,
            to: "/machines?tab=downtime",
          })),
          {
            label: "الجاهزية",
            value: s.availabilityPct === null ? "مش محسوبة" : `${num(Math.round(s.availabilityPct), 0)}٪`,
            sub: "الزمن المخطط ناقص التوقف",
            to: "/machines",
          },
        ],
        basis:
          "أسباب التوقف مرتّبة بالدقايق مش بعدد التذاكر. وتكلفة التوقف نفسه مش محسوبة — دي محتاجة ربح الدقيقة على الخط، وهو مش رقم موجود.",
        to: "/machines",
      };
    },
  },

  {
    key: "supplier",
    question: "أنهي مورّد أغلى فعليًا؟",
    perm: "purchasing",
    words: ["مورد", "موردين", "شراء", "مشتريات"],
    run: (db) => {
      const rows = supplierRealCosts(db).filter((r) => r.realPct !== null);
      if (!rows.length) {
        return {
          headline: "مفيش مورّد تكلفته الحقيقية محسوبة.",
          rows: [],
          basis: "الحساب محتاج فواتير مشتريات مربوطة بحركات خامات فعلية.",
          to: "/costs",
          missing: "ربط فواتير المشتريات بحركات استلام الخامات",
        };
      }
      const worst = [...rows].sort((a, b) => (b.realPct as number) - (a.realPct as number))[0];
      return {
        headline: `${worst.name} — أغلى بـ${num(Math.round(worst.realPct as number), 0)}٪ عن الوسيط بعد الهالك والمرتجعات.`,
        rows: rows.map((r) => ({
          label: r.name,
          value: `${(r.realPct as number) > 0 ? "+" : ""}${num(Math.round(r.realPct as number), 0)}٪`,
          sub: `${r.flipped ? "سعره أرخص وتكلفته أغلى · " : ""}${r.verdict ?? ""}`,
          to: `/parties/${r.partyId}`,
        })),
        basis:
          "الفرق الكلي = فرق السعر عن وسيط نفس البند + أثر الهالك + أثر المرتجعات. والتغطية مكتوبة لكل مورّد، فالمورّد اللي بياناته ناقصة مايتحاكمش على رقم كامل.",
        to: "/costs",
      };
    },
  },

  {
    key: "workers",
    question: "أنهي عامل أعلى إنتاج؟",
    perm: "workers",
    words: ["عامل", "عمال", "انتاجيه", "شغلانه", "اجر"],
    run: (db) => {
      const range = rangeOf("month");
      const rows = workerLeaderboard(db, range).filter((w) => w.pieces > 0);
      if (!rows.length) {
        return {
          headline: "مفيش إنتاج مسجّل باسم عامل في الشهر.",
          rows: [],
          basis: "الترتيب من تسجيلات المراحل والباندلات اللي عليها اسم عامل.",
          to: "/workers",
          missing: "تسجيل المراحل باسم العامل",
        };
      }
      return {
        headline: `${rows[0].name} — ${num(rows[0].pieces, 0)} قطعة في ${range.label}.`,
        rows: rows.slice(0, 8).map((w) => ({
          label: w.name,
          value: `${num(w.pieces, 0)} قطعة`,
          sub: `${w.qualityPct === null ? "الجودة مش محسوبة" : `جودة ${num(Math.round(w.qualityPct), 0)}٪`} · حضور ${num(
            w.daysPresent,
            0,
          )} يوم`,
          to: `/workers/${w.id}`,
        })),
        basis: "الترتيب بالقطع، والجودة والحضور جنبه — عامل بينتج كتير وجودته واطية مش أفضل عامل.",
        to: "/workers",
      };
    },
  },

  {
    key: "capacity",
    question: "طاقتي كام، وأقدر أقبل شغل جديد؟",
    perm: "planning",
    words: ["طاقه", "اقبل", "اسلم", "جدول", "حمل", "زحمه"],
    run: (db) => {
      const plan = schedule(db);
      const out = capacityOutlook(db, plan);
      return {
        headline:
          out.backlogDays === null
            ? "مفيش شغل مفتوح في الجدول دلوقتي."
            : `الشغل المفتوح بياخد ${num(out.backlogDays, 1)} يوم عمل بالطاقة الحالية.`,
        rows: [
          ...out.windows.map((w) => ({
            label: w.label,
            value: `${num(Math.round(w.pct), 0)}٪ محمّلة`,
            sub: `مشغول ${num(Math.round(w.used), 0)} دقيقة من ${num(Math.round(w.available), 0)} · فاضل ${num(
              Math.round(w.remaining),
              0,
            )}`,
            to: "/planning",
          })),
          ...out.lines.map((l) => ({
            label: l.line,
            value: `${num(Math.round(l.share), 0)}٪ من الحمل`,
            sub: l.finish ? `بيخلص ${formatDate(l.finish)}` : "مفيش تاريخ خلوص محسوب",
            to: "/planning",
          })),
        ],
        basis: `الطاقة من إعداد المصنع: ${num(out.cap.hoursPerDay, 1)} ساعة × ${num(out.cap.daysPerWeek, 0)} أيام × استغلال ${num(
          out.cap.utilizationPct,
          0,
        )}٪. والحمل من الدقايق المعيارية للشغل الباقي على الأوامر المفتوحة.`,
        to: "/planning",
      };
    },
  },
];

/* ── التطابق ───────────────────────────────────────────────────── */

function scoreOf(intent: Intent, text: string): number {
  let score = 0;
  for (const w of intent.words) if (text.includes(normalize(w))) score += 2;
  for (const w of intent.boost ?? []) if (text.includes(normalize(w))) score += 1;
  return score;
}

export type AskResult =
  | { kind: "answer"; answer: AskAnswer }
  | { kind: "denied"; question: string; perm: PermModule }
  | { kind: "unknown"; suggestions: { key: string; question: string }[] };

/**
 * الجواب.
 *
 * `allowed` بتيجي من محرّك الصلاحيات نفسه (`can.do(module, "view")`)،
 * فمفيش نسخة تانية من قواعد الصلاحية هنا. والسؤال اللي المستخدم
 * مايشوفش موديوله **بيتقال له إنه ممنوع** مش بيتجاهل — غير كده هو
 * هيفضل يعيد صياغة السؤال فاكر إن النظام مش فاهمه.
 */
export function ask(db: Db, question: string, allowed: (perm: PermModule) => boolean): AskResult {
  const text = normalize(question);
  if (!text) return { kind: "unknown", suggestions: suggestions(allowed) };

  const ranked = INTENTS.map((i) => ({ i, s: scoreOf(i, text) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);

  if (!ranked.length) return { kind: "unknown", suggestions: suggestions(allowed) };

  const hit = ranked[0].i;
  if (!allowed(hit.perm)) return { kind: "denied", question: hit.question, perm: hit.perm };

  const r = hit.run(db);
  return {
    kind: "answer",
    answer: {
      key: hit.key,
      question: hit.question,
      perm: hit.perm,
      headline: r.headline,
      rows: r.rows,
      basis: r.basis,
      to: r.to,
      missing: r.missing ?? null,
    },
  };
}

/** الأسئلة اللي النظام يعرف يجاوبها — مفلترة بصلاحية اللي سائل */
export function suggestions(allowed: (perm: PermModule) => boolean): { key: string; question: string }[] {
  return INTENTS.filter((i) => allowed(i.perm)).map((i) => ({ key: i.key, question: i.question }));
}

/** كل الأسئلة بموديولاتها — الشاشة بتعرضها مجمّعة */
export function askCatalog(): { key: string; question: string; perm: PermModule }[] {
  return INTENTS.map((i) => ({ key: i.key, question: i.question, perm: i.perm }));
}

/** آخر تحديث للبيانات اللي الإجابات بتقرا منها — تاريخ النهارده بتوقيت القاهرة */
export function asOf(): string {
  return formatDate(cairoToday());
}
