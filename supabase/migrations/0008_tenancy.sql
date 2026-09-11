-- صنعة — Migration 0008: المصنع كـTenant (الـWorkspace والـSubdomain)
-- إضافية بالكامل: أعمدة جديدة nullable أو بـdefault، جدول واحد جديد، Views،
-- ودالة تحويل واحدة. مفيش DROP ولا RENAME ولا تعديل على بيانات قائمة.
--
-- القاعدة المعمارية: **الـSubdomain مش اسم في الـURL؛ ده مفتاح تحديد المصنع.**
-- فالـslug متخزّن في سجل مربوط بـfactory_id، والتحويل دايمًا
--   hostname → subdomain → factory_id → بيانات المصنع
-- والـRLS بتقرأ الـfactory_id من العضويّة، مش من اللي الـFrontend باعته.
-- تغيير الـslug بيغيّر العنوان بس؛ البيانات مكانها ما بيتغيّرش.

-- ─────────────────────────────────────────────────────────────
-- 1) بيانات المصنع اللي بتتجمّع في التسجيل
-- ─────────────────────────────────────────────────────────────

alter table factory.factories add column if not exists subdomain text;
alter table factory.factories add column if not exists owner_user_id uuid;
alter table factory.factories add column if not exists industry text;
alter table factory.factories add column if not exists types text[] not null default '{}';
alter table factory.factories add column if not exists website text;
alter table factory.factories add column if not exists country text;
alter table factory.factories add column if not exists city text;
alter table factory.factories add column if not exists address text;
-- الأرقام دي NULL لما تكون مش مسجّلة — «مش معروف» مش صفر
alter table factory.factories add column if not exists employees_band text;
alter table factory.factories add column if not exists employees_exact int;
alter table factory.factories add column if not exists monthly_capacity numeric;
alter table factory.factories add column if not exists production_lines int;
alter table factory.factories add column if not exists branches int;
alter table factory.factories add column if not exists logo_url text;
-- الموديولات المختارة: فاضية = وَرّي كل حاجة (المصانع القديمة ما تتأثرش)
alter table factory.factories add column if not exists modules text[] not null default '{}';

-- الـslug: حروف صغيرة وأرقام وشرطة، وميبدأش أو يخلص بشرطة، وفريد على المنصة
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'factories_subdomain_format') then
    alter table factory.factories
      add constraint factories_subdomain_format
      check (subdomain is null or subdomain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$');
  end if;
end $$;

create unique index if not exists factories_subdomain_key on factory.factories (subdomain)
  where subdomain is not null;

-- ─────────────────────────────────────────────────────────────
-- 2) الكلمات المحجوزة — مسارات المنصة نفسها
-- ─────────────────────────────────────────────────────────────

create table if not exists factory.reserved_subdomains (
  slug text primary key
);

insert into factory.reserved_subdomains (slug)
values ('www'), ('app'), ('api'), ('admin'), ('dashboard'), ('login'), ('signup'), ('auth'),
       ('account'), ('billing'), ('help'), ('support'), ('docs'), ('status'), ('mail'),
       ('static'), ('cdn'), ('assets'), ('sanaa'), ('factory'), ('demo'), ('test'), ('new')
on conflict (slug) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 3) العضويّة: المستخدم الواحد يقدر يملك أكتر من مصنع
-- ─────────────────────────────────────────────────────────────

alter table factory.members add column if not exists last_access_at timestamptz;
alter table factory.members add column if not exists job_title text;
alter table factory.invites add column if not exists name text;
alter table factory.invites add column if not exists job_title text;
alter table factory.invites add column if not exists phone text;

-- مستخدم واحد مايبقاش له أكتر من عضويّة في نفس المصنع
create unique index if not exists members_factory_user_key on factory.members (factory_id, user_id)
  where user_id is not null;

-- فهرس للسؤال العكسي: المستخدم ده عنده أنهي مصانع؟
create index if not exists members_user_idx on factory.members (user_id) where user_id is not null;

-- ─────────────────────────────────────────────────────────────
-- 4) تحديد الـTenant من الـhostname — ده اللي الـbackend بينادي عليه
-- ─────────────────────────────────────────────────────────────

-- بياخد الـhostname كامل وبيرجّع factory_id. أول label هو الـslug.
-- SECURITY DEFINER عشان الـresolve يشتغل قبل الدخول (صفحة تسجيل الدخول
-- بتحتاج تعرف المصنع)، وبيرجّع الـid بس — مفيش أي بيانات مصنع بتتسرّب.
create or replace function factory.resolve_tenant(hostname text)
returns uuid
language sql
stable
security definer
set search_path = factory, public
as $$
  select f.id
  from factory.factories f
  where f.subdomain = lower(split_part(hostname, '.', 1))
  limit 1;
$$;

revoke all on function factory.resolve_tenant(text) from public;
grant execute on function factory.resolve_tenant(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5) مصانع المستخدم الحالي — شاشة «اختار المصنع»
-- ─────────────────────────────────────────────────────────────

create or replace view factory.v_my_factories as
select
  f.id as factory_id,
  f.name,
  f.subdomain,
  f.industry,
  f.logo_url,
  m.role,
  m.last_access_at,
  f.created_at
from factory.factories f
join factory.members m on m.factory_id = f.id
where m.user_id = auth.uid();

-- ─────────────────────────────────────────────────────────────
-- 6) تقدّم تجهيز المصنع — محسوب، مش متخزّن
-- ─────────────────────────────────────────────────────────────

-- نفس منطق الواجهة: كل خطوة سؤال على البيانات الحقيقية، فالنسبة بتتظبّط
-- لوحدها أول ما المستخدم يسجّل حاجة من أي شاشة.
create or replace view factory.v_factory_setup as
select
  f.id as factory_id,
  true as has_account,
  true as has_factory,
  f.subdomain is not null as has_workspace,
  exists (select 1 from factory.workers w where w.factory_id = f.id) as has_workers,
  exists (select 1 from factory.party_roles r
          where r.factory_id = f.id and r.role = 'supplier') as has_suppliers,
  exists (select 1 from factory.stock_movements sm
          where sm.factory_id = f.id and sm.item_type = 'material' and sm.kind = 'purchase') as has_material_stock,
  exists (select 1 from factory.products pr where pr.factory_id = f.id) as has_products,
  exists (select 1 from factory.party_roles r
          where r.factory_id = f.id and r.role = 'customer') as has_customers,
  exists (select 1 from factory.orders o where o.factory_id = f.id) as has_orders
from factory.factories f;
