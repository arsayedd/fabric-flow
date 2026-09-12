-- صنعة — Migration 0019: تصحيح افتراضيات المشرف عشان تطابق التطبيق
--
-- الافتراضيات كانت مكتوبة مرتين — مرة في `src/store/permissions.ts` ومرة
-- في `factory.default_permissions` — واتفرّقوا. التطبيق اتغيّر وأضاف
-- `export` للمشرف في الأقسام اللي هو شغّال فيها أصلًا، والقاعدة فضلت على
-- القديم.
--
-- **إيه اللي كان هيحصل على السيرفر:** المشرف يشوف زرار «تصدير وطباعة»
-- في شاشة الإنتاج، يدوس، والـAPI يرفض. يعني ورقة الإنتاج وإذن صرف
-- الخامات — الورق اللي شغلته كلها قايمة عليه — مش هتطلع، والرسالة
-- هتبقى «مالكش صلاحية» عن حاجة الواجهة بتقوله إن له صلاحية فيها.
--
-- والسبب اللي خلّى التطبيق يزوّد `export` للمشرف (من تعليق
-- `ROLE_DEFAULTS`): وقت ما المحرّك اتكتب ماكانش فيه تصدير ولا مستندات في
-- النظام أصلًا، فـ`export` ماكانش ليها معنى. بعد ما بقى فيه، «مشرف مش
-- بيطبع» معناها مشرف مش بيقدر يشغّل خط.
--
-- والمالية والعملاء والتكلفة فاضلين مقفولين على المشرف زي ما هم.
--
-- الفرق بيتّمسك بعد كده أوتوماتيك: `node tests/perm-parity.mjs` بيقرا
-- المصفوفة من الملفين ويفشل لو اختلفوا في خانة واحدة.

create or replace function factory.default_permissions(p_role text)
returns jsonb
language sql
immutable
as $$
  select case p_role
    when 'owner' then jsonb_build_object(
      'production',  '["view","create","edit","delete","export"]'::jsonb,
      'planning',    '["view","create","edit","delete","export"]'::jsonb,
      'inventory',   '["view","create","edit","delete","export"]'::jsonb,
      'purchasing',  '["view","create","edit","delete","export"]'::jsonb,
      'workers',     '["view","create","edit","delete","export"]'::jsonb,
      'parties',     '["view","create","edit","delete","export"]'::jsonb,
      'sales',       '["view","create","edit","delete","export"]'::jsonb,
      'finance',     '["view","create","edit","delete","export"]'::jsonb,
      'costing',     '["view","create","edit","delete","export"]'::jsonb,
      'quality',     '["view","create","edit","delete","export"]'::jsonb,
      'machines',    '["view","create","edit","delete","export"]'::jsonb,
      'reports',     '["view","create","edit","delete","export"]'::jsonb,
      'staff',       '["view","create","edit","delete","export"]'::jsonb,
      -- سجل التعديلات بيتقرأ ويتصدَّر، ومابيتمسحش — ولا من صاحب المصنع
      'audit',       '["view","export"]'::jsonb,
      'settings',    '["view","create","edit","delete","export"]'::jsonb
    )
    when 'accountant' then jsonb_build_object(
      'production',  '["view","create","edit","export"]'::jsonb,
      'planning',    '["view","create","edit","export"]'::jsonb,
      'inventory',   '["view","create","edit","export"]'::jsonb,
      'purchasing',  '["view","create","edit","export"]'::jsonb,
      'workers',     '["view","create","edit","export"]'::jsonb,
      'parties',     '["view","create","edit","export"]'::jsonb,
      'sales',       '["view","create","edit","export"]'::jsonb,
      'finance',     '["view","create","edit","export"]'::jsonb,
      'costing',     '["view","create","edit","export"]'::jsonb,
      'quality',     '["view","create","edit"]'::jsonb,
      'machines',    '["view"]'::jsonb,
      'reports',     '["view","export"]'::jsonb,
      -- الإعدادات عرض بس: قرارات زي أوزان السكور لصاحب المصنع لوحده
      'settings',    '["view"]'::jsonb
    )
    when 'supervisor' then jsonb_build_object(
      'production',  '["view","create","edit","export"]'::jsonb,
      'planning',    '["view","export"]'::jsonb,
      'inventory',   '["view","create","edit","export"]'::jsonb,
      'workers',     '["view","create","edit","export"]'::jsonb,
      'quality',     '["view","create","edit","export"]'::jsonb,
      'machines',    '["view"]'::jsonb,
      'settings',    '["view"]'::jsonb
    )
    else '{}'::jsonb
  end;
$$;
