-- صنعة — Migration 0009: محرّك الصلاحيات على السيرفر
-- إضافية بالكامل: جدول واحد جديد، دوال، وView. مفيش DROP ولا RENAME،
-- ومفيش تعديل على أي policy قايمة — السلوك الحالي مايتغيّرش بتطبيق الملف ده.
--
-- القاعدة: **الصلاحية مش إخفاء زر.** الواجهة بتخفي وبترفض، بس اللي بيمنع
-- فعلًا هو الـbackend. عشان كده نفس المصفوفة اللي في الواجهة متخزّنة هنا،
-- والدالة `factory.has_perm` هي الجواب الوحيد لسؤال «الشخص ده يعمل الفعل ده
-- في القسم ده؟» — والـpolicies بعد كده بتسأل الدالة دي بدل ما كل policy
-- تكتب شرطها بإيدها وتختلف عن الواجهة.
--
-- الأدوار التلاتة قيم افتراضية مش أسوار: الجدول بيخزّن **الاستثناء** بس،
-- واللي مالوش سجل بيشتغل بالافتراضي. فمصنع مافتحش شاشة الصلاحيات عمره
-- مابيتخزّن له أي صف، وبيفضل شغّال بنفس السلوك بالحرف.

-- ─────────────────────────────────────────────────────────────
-- 1) الأقسام والأفعال — نفس القوائم اللي في الواجهة بالحرف
-- ─────────────────────────────────────────────────────────────

create table if not exists factory.perm_modules (
  module text primary key,
  label text not null,
  sort int not null default 0
);

insert into factory.perm_modules (module, label, sort) values
  ('production',  'الإنتاج',                 1),
  ('planning',    'التخطيط والطاقة',         2),
  ('inventory',   'المخزون والخامات',        3),
  ('purchasing',  'المشتريات والموردين',     4),
  ('workers',     'العمال والحضور',          5),
  ('parties',     'العملاء والتجار',         6),
  ('sales',       'المنتجات والبيع',         7),
  ('finance',     'الخزينة والتحصيل',        8),
  ('costing',     'التكلفة والربحية',        9),
  ('quality',     'الجودة',                 10),
  ('machines',    'الماكينات',              11),
  ('reports',     'التقارير واللوحة',       12),
  ('staff',       'الموظفين والصلاحيات',    13),
  ('audit',       'سجل التعديلات',          14),
  ('settings',    'الإعدادات',              15)
on conflict (module) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 2) الافتراضي لكل دور
--    مكتوب في الداتابيز نفسها عشان مايكونش عايش في الواجهة بس،
--    وإلا يبقى عندنا مصدرين للحقيقة وواحد فيهم هيتأخر عن التاني.
-- ─────────────────────────────────────────────────────────────

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
      'settings',    '["view"]'::jsonb
    )
    when 'supervisor' then jsonb_build_object(
      'production',  '["view","create","edit"]'::jsonb,
      'planning',    '["view"]'::jsonb,
      'inventory',   '["view","create","edit"]'::jsonb,
      'workers',     '["view","create","edit"]'::jsonb,
      'quality',     '["view","create","edit"]'::jsonb,
      'machines',    '["view"]'::jsonb,
      'settings',    '["view"]'::jsonb
    )
    else '{}'::jsonb
  end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3) الاستثناءات: صف لكل دور عدّله صاحب المصنع
-- ─────────────────────────────────────────────────────────────

create table if not exists factory.role_permissions (
  factory_id uuid not null,
  role text not null,
  -- نفس شكل المصفوفة في الواجهة: { "finance": ["view","create"], ... }
  permissions jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (factory_id, role)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'role_permissions_role_check') then
    alter table factory.role_permissions
      add constraint role_permissions_role_check
      check (role in ('owner', 'accountant', 'supervisor'));
  end if;
end $$;

-- صلاحيات صاحب المصنع مابتتقلّصش: لازم يفضل فيه حد يقدر يفتح الباب تاني
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'role_permissions_not_owner') then
    alter table factory.role_permissions
      add constraint role_permissions_not_owner check (role <> 'owner');
  end if;
end $$;

alter table factory.role_permissions enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 4) الجواب الوحيد: has_perm
-- ─────────────────────────────────────────────────────────────

create or replace function factory.my_role(p_factory uuid)
returns text
language sql
stable
security definer
set search_path = factory, public
as $$
  select m.role
  from factory.members m
  where m.factory_id = p_factory and m.user_id = auth.uid()
  limit 1;
$$;

/*
 * المصفوفة الفعلية لدور: الاستثناء لو موجود، وإلا الافتراضي.
 * ملاحظة مقصودة: الاستثناء **بيحل محل** الافتراضي بالكامل ومابيتدمجش معاه،
 * لأن الدمج معناه إن صاحب المصنع مايقدرش يقفل خانة مفتوحة بالافتراضي.
 */
create or replace function factory.role_matrix(p_factory uuid, p_role text)
returns jsonb
language sql
stable
security definer
set search_path = factory, public
as $$
  select coalesce(
    (select rp.permissions from factory.role_permissions rp
      where rp.factory_id = p_factory and rp.role = p_role),
    factory.default_permissions(p_role)
  );
$$;

create or replace function factory.has_perm(p_factory uuid, p_module text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = factory, public
as $$
  select coalesce(
    factory.role_matrix(p_factory, factory.my_role(p_factory)) -> p_module @> to_jsonb(p_action),
    false
  );
$$;

grant execute on function factory.has_perm(uuid, text, text) to authenticated;
grant execute on function factory.role_matrix(uuid, text) to authenticated;
grant execute on function factory.my_role(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5) سياسات جدول الصلاحيات نفسه
--    اللي يعدّل الصلاحيات لازم يكون معاه صلاحية «تعديل الموظفين».
-- ─────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'role_permissions' and policyname = 'role_permissions_read') then
    create policy role_permissions_read on factory.role_permissions
      for select using (factory.my_role(factory_id) is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'role_permissions' and policyname = 'role_permissions_write') then
    create policy role_permissions_write on factory.role_permissions
      for all using (factory.has_perm(factory_id, 'staff', 'edit'))
      with check (factory.has_perm(factory_id, 'staff', 'edit'));
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 6) صلاحيتي أنا — اللي الواجهة بتقرأ منه بدل ما تحسب بنفسها
-- ─────────────────────────────────────────────────────────────

create or replace view factory.v_my_permissions as
select
  f.id as factory_id,
  factory.my_role(f.id) as role,
  factory.role_matrix(f.id, factory.my_role(f.id)) as permissions
from factory.factories f
where factory.my_role(f.id) is not null;

-- ─────────────────────────────────────────────────────────────
-- 7) الخطوة الجاية (مش في الملف ده عن قصد)
--    الـpolicies القايمة على جداول البيانات بتتحقق من العضويّة في المصنع
--    (عزل الـtenant) وده شغّال. تحويلها لتسأل has_perm كمان لازم يبقى
--    migration لوحده بعد ما المصفوفة تكون متخزّنة فعلًا للمصانع القايمة،
--    عشان مانقفلش وصول حد بالغلط في نفس لحظة النشر. مثال الشكل النهائي:
--
--      alter policy orders_write on factory.orders
--        using (factory.has_perm(factory_id, 'production', 'edit'));
--
--    ولحد ساعتها، عزل المصنع هو الضمانة، والصلاحية بتتحقق في الواجهة
--    وفي كل عملية تسجيل — وده مكتوب صريح في docs/shell.md.
