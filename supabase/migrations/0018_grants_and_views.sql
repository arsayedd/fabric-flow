-- صنعة — Migration 0018: صلاحيات الوصول للسكيما، وقفل الـViews على RLS
--
-- الملف ده بيسدّ حاجتين اتكشفوا أول مرة الـmigrations اتشغّلت فعلًا على
-- Postgres (`node tests/rls-check.mjs`). الاتنين كانوا هيظهروا على السيرفر
-- بس، ومحدش كان هيعرف السبب:
--
-- ١) **مافيش `grant` واحد على السكيما ولا على أي جدول.** الـAPI بتاع
--    Supabase بيتكلم بدور `authenticated`، والدور ده ماكان عندهوش حتى
--    `usage` على سكيما `factory`. النتيجة على السيرفر: كل طلب يرجع
--    `permission denied for schema factory` — والتطبيق يبان مكسور بالكامل
--    من غير سبب واضح. (الـRLS لوحدها مش كفاية: الـ`grant` بيقول «تقدر
--    تلمس الجدول»، والـRLS بتقول «تشوف أنهي صفوف». محتاجين الاتنين.)
--
-- ٢) **٢٣ view من ٢٦ كانوا بيعدّوا على الـRLS.** الـview في Postgres
--    بتقرا بصلاحيات **صاحبها** بشكل افتراضي، مش بصلاحيات اللي بيسأل. يعني
--    `v_customer_metrics` و`v_order_costing` و`v_stock_balance` كانوا
--    هيرجّعوا بيانات **كل المصانع** لأي مستخدم داخل — أكبر ثغرة ممكنة في
--    نظام multi-tenant، ومن غير أي رسالة خطأ. `security_invoker = on`
--    بتخلي الـview تقرا بصلاحيات السائل، فالـRLS بتشتغل جواها.
--
-- إضافي بالكامل: مافيش `drop` ولا تعديل على بيانات.

-- ─────────────────────────────────────────────────────────────
-- ١) الوصول للسكيما
-- ─────────────────────────────────────────────────────────────

grant usage on schema factory to authenticated;

grant select, insert, update, delete on all tables in schema factory to authenticated;
grant usage, select on all sequences in schema factory to authenticated;

-- أي جدول أو تسلسل جديد بعد كده بياخد نفس الوصول من غير ما حد يفتكر
alter default privileges in schema factory
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema factory
  grant usage, select on sequences to authenticated;

--
-- `anon` مابياخدش حاجة.
--
-- المستخدم المش داخل مالوش أي شغل في بيانات مصنع. ولو احتجنا بعدين
-- صفحة تحقق مستند عامة (QR) بتتعمل بدالة `security definer` محدودة
-- على المستند المطلوب — مش بفتح السكيما لـ`anon`.
--
revoke all on all tables in schema factory from anon;
revoke all on schema factory from anon;

-- ─────────────────────────────────────────────────────────────
-- ٢) كل View تقرا بصلاحيات السائل
-- ─────────────────────────────────────────────────────────────
--
-- بنلفّ على الموجود بدل ما نكتب ٢٦ سطر بالاسم، عشان أي view اتضافت في
-- migration قديم أو جديد تتقفل هي كمان.
--
do $$
declare
  v record;
begin
  for v in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'factory' and c.relkind = 'v'
  loop
    execute format('alter view factory.%I set (security_invoker = true)', v.relname);
  end loop;
end;
$$;

-- الـviews داخلة في `all tables` فوق — Postgres مالوش `all views`

-- ─────────────────────────────────────────────────────────────
-- ٣) فحوص بتفشل الـmigration بدل ما تسيب ثغرة
-- ─────────────────────────────────────────────────────────────
--
-- الفحوص دي جوه الـmigration بقصد: الحاجات اللي بتسكت هي اللي بتوجع.
--

do $$
declare
  v_open text;
begin
  -- view بتقرا بصلاحيات صاحبها = view بتعدّي على عزل المصانع
  select string_agg(c.relname, ', ')
  into v_open
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'factory'
    and c.relkind = 'v'
    -- Postgres بيخزّنها 'on' أو 'true' حسب اللي اتكتب، والاتنين نفس المعنى
    and coalesce(
      (select option_value from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'),
      'off'
    ) not in ('true', 'on');

  if v_open is not null then
    raise exception 'views بتعدّي على الـRLS: %', v_open;
  end if;
end;
$$;

do $$
declare
  v_missing text;
begin
  -- جدول عليه RLS ومن غير سياسة = جدول مقفول على الكل
  select string_agg(t.tablename, ', ')
  into v_missing
  from pg_tables t
  where t.schemaname = 'factory'
    and t.rowsecurity
    and not exists (
      select 1 from pg_policies p
      where p.schemaname = 'factory' and p.tablename = t.tablename
    );

  if v_missing is not null then
    raise exception 'جداول عليها RLS ومن غير سياسة: %', v_missing;
  end if;
end;
$$;

do $$
declare
  v_naked text;
begin
  -- وجدول من غير RLS خالص في سكيما فيها بيانات مصنع = مقروء لكل مستخدم
  -- داخل، أي مصنع كان
  select string_agg(t.tablename, ', ')
  into v_naked
  from pg_tables t
  where t.schemaname = 'factory' and not t.rowsecurity;

  if v_naked is not null then
    raise exception 'جداول من غير RLS: %', v_naked;
  end if;
end;
$$;
