/**
 * صنعة — قواعد التنبيه.
 *
 * النظام كان بينبّه على أرقام مكتوبة جوه الكود: «الخامة اللي تكفي أقل
 * من مدة التوريد + ٣ أيام»، «التحصيل اللي فات بأسبوع»، «الماكينة
 * الواقفة ٤ ساعات». والأرقام دي **قرارات مصنع مش ثوابت رياضية**: مصنع
 * بيشتري من الصين مدة التوريد عنده شهر، وتاني بيشتري من العتبة
 * بيستلم بعد ساعتين. فنفس الرقم بيبقى تنبيه متأخر عند الأول وإزعاج
 * عند التاني.
 *
 * فالملف ده بينقل الأرقام دي من الكود للإعدادات:
 *
 *  * **الافتراضي هو نفس السلوك القديم بالحرف.** مصنع مالمسش الشاشة دي
 *    عمره بيشوف نفس التنبيهات اللي كان بيشوفها — مفيش «تحديث» غيّر
 *    حاجة تحت رجله.
 *  * **مفيش قاعدة بتخترع تنبيه جديد.** القواعد بتظبّط **حساسية**
 *    الاستثناءات الموجودة، مش بتضيف نوع تنبيه مالوش مصدر في الدفتر.
 *  * **كل قاعدة بتقول بتغيّر إيه.** `RULE_DEFS[k].effect` هو الجملة
 *    اللي المستخدم بيقراها قبل ما يحرّك الرقم.
 */

import type { Db } from "./types";

export type AlertRules = {
  /** كام يوم أمان فوق مدة التوريد قبل ما الخامة تبان في التنبيهات */
  stockBufferDays: number;
  /** التحصيل المتأخر بيبقى أحمر بعد كام يوم عمل */
  overdueDangerDays: number;
  /** التحصيل المستني تأكيد بيبقى أحمر بعد كام يوم */
  pendingCollectDays: number;
  /** الأمر المتأخر بيبقى أحمر بعد كام يوم تأخير */
  lateOrderDangerDays: number;
  /** الماكينة الواقفة بتبقى حمرا بعد كام ساعة */
  machineDownDangerHours: number;
  /** الصيانة الجاية بتظهر في الخطة قبل ميعادها بكام يوم */
  serviceWindowDays: number;
  /** توقع الخزنة بيدوّر على ضيق جوه كام يوم جايين */
  cashHorizonDays: number;
  /** ضيق الخزنة بيبقى أحمر لو جاي جوه كام يوم */
  cashDangerDays: number;
};

export const DEFAULT_RULES: AlertRules = {
  stockBufferDays: 3,
  overdueDangerDays: 7,
  pendingCollectDays: 5,
  lateOrderDangerDays: 3,
  machineDownDangerHours: 4,
  serviceWindowDays: 14,
  cashHorizonDays: 30,
  cashDangerDays: 14,
};

export const RULE_KEYS = Object.keys(DEFAULT_RULES) as (keyof AlertRules)[];

export type RuleDef = {
  label: string;
  /** وحدة الرقم — بتتعرض جنب الخانة */
  unit: string;
  min: number;
  max: number;
  /** بيغيّر إيه بالظبط في التنبيهات */
  effect: string;
  /** الشاشة اللي التنبيه بيظهر فيها */
  to: string;
};

export const RULE_DEFS: Record<keyof AlertRules, RuleDef> = {
  stockBufferDays: {
    label: "أمان الخامة فوق مدة التوريد",
    unit: "يوم",
    min: 0,
    max: 60,
    effect:
      "الخامة بتدخل التنبيهات لما رصيدها يكفي أقل من مدة توريدها + الرقم ده. صفّره وهتتنبّه في آخر لحظة، وكبّره وهتتنبّه بدري وتشتري أكتر.",
    to: "/materials",
  },
  overdueDangerDays: {
    label: "التحصيل المتأخر يبقى أحمر بعد",
    unit: "يوم عمل",
    min: 1,
    max: 90,
    effect: "قبل الرقم ده التأخير بيبان أصفر، وبعده أحمر. الترتيب في قايمة الاستثناءات بالمبلغ مش باللون.",
    to: "/collections",
  },
  pendingCollectDays: {
    label: "التحصيل المستني تأكيد يبقى أحمر بعد",
    unit: "يوم",
    min: 1,
    max: 30,
    effect: "التحصيل اللي مسجّل ومحدش أكّد وصوله للحساب. الفلوس دي مش في الرصيد لحد ما تتأكد.",
    to: "/collections",
  },
  lateOrderDangerDays: {
    label: "الأمر المتأخر يبقى أحمر بعد",
    unit: "يوم",
    min: 1,
    max: 30,
    effect: "التأخير محسوب من الجدولة نفسها (الشغل الباقي مقابل الطاقة)، والرقم ده بيحدّد إمتى يبقى أحمر.",
    to: "/planning",
  },
  machineDownDangerHours: {
    label: "الماكينة الواقفة تبقى حمرا بعد",
    unit: "ساعة",
    min: 1,
    max: 72,
    effect: "الوقت بيجري من فتح التذكرة. والتنبيه نفسه بيظهر من أول ساعة — الرقم ده للون بس.",
    to: "/machines",
  },
  serviceWindowDays: {
    label: "الصيانة الجاية تظهر قبل ميعادها بـ",
    unit: "يوم",
    min: 1,
    max: 90,
    effect: "تبويب «الصيانة الجاية» بيعرض اللي ميعاده جوه المدة دي. اللي فات ميعاده بيظهر دايمًا مهما كان الرقم.",
    to: "/machines?tab=plan",
  },
  cashHorizonDays: {
    label: "توقع الخزنة بيدوّر على ضيق جوه",
    unit: "يوم",
    min: 7,
    max: 180,
    effect:
      "التنبيه «الخزنة هتضيق» بيتحسب على المدة دي. قصّرها وهتعرف متأخر، وطوّلها وهتشوف ضيق لسه ممكن يتغيّر قبله بتحصيل واحد.",
    to: "/cashflow",
  },
  cashDangerDays: {
    label: "ضيق الخزنة يبقى أحمر لو جاي جوه",
    unit: "يوم",
    min: 1,
    max: 90,
    effect: "الضيق البعيد بيبان أصفر واللي قريّب أحمر. التنبيه نفسه بيظهر في الحالتين.",
    to: "/cashflow",
  },
};

/**
 * القواعد الفعلية: المتخزّن فوق الافتراضي.
 *
 * والدمج بالمفتاح مش بالكائن كله، عشان قاعدة جديدة تتضاف في نسخة
 * بعدين تلاقي قيمتها الافتراضية جاهزة لمصنع قديم حافظ نص القواعد بس.
 */
export function rulesOf(db: Db): AlertRules {
  const saved = db.settings?.rules ?? {};
  const out = { ...DEFAULT_RULES };
  for (const k of RULE_KEYS) {
    const v = saved[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** اللي اتغيّر عن الافتراضي — الشاشة بتقوله عشان حد يعرف ليه بيتنبّه كده */
export function changedRules(db: Db): { key: keyof AlertRules; from: number; to: number }[] {
  const now = rulesOf(db);
  return RULE_KEYS.filter((k) => now[k] !== DEFAULT_RULES[k]).map((k) => ({
    key: k,
    from: DEFAULT_RULES[k],
    to: now[k],
  }));
}
