--
-- اختبار العزل بين المصانع والصلاحيات على السكيما الحقيقية.
--
-- كل تأكيد هنا بيحاول يعمل حاجة **ممنوعة** ويتأكد إنها اتمنعت. اختبار
-- بيتأكد إن المسموح شغّال بس مش اختبار أمان — الأمان هو اللي بيتمنع.
--
-- وكله بدور `authenticated`، مش بمالك القاعدة: المالك بيعدّي على RLS،
-- فلو اختبرنا بيه كل حاجة كانت هتنجح والسياسات تبان سليمة وهي مسايبة.
--
-- التشغيل: `node tests/rls-check.mjs`
--

set client_min_messages = notice;

create or replace function tst(label text, got boolean, want boolean default true)
returns void language plpgsql as $$
begin
  if got is not distinct from want then
    raise notice '  ✓ %', label;
  else
    raise exception '  ✗ %  (طلع % والمفروض %)', label, coalesce(got::text, 'null'), want;
  end if;
end;
$$;

create or replace function as_user(p uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p)::text, false);
  perform set_config('role', 'authenticated', false);
end;
$$;

create or replace function as_admin()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', false);
  perform set_config('request.jwt.claims', '', false);
end;
$$;

-- ── تجهيز: مصنعين، تلات مستخدمين ───────────────────────────────────
select as_admin();

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner.a@test'),
  ('22222222-2222-2222-2222-222222222222', 'owner.b@test'),
  ('33333333-3333-3333-3333-333333333333', 'super.a@test');

insert into factory.factories (id, name, subdomain, owner_user_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'مصنع أ', 'factory-a', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'مصنع ب', 'factory-b', '22222222-2222-2222-2222-222222222222');

insert into factory.members (factory_id, user_id, email, name, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner.a@test', 'صاحب أ', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'super.a@test', 'مشرف أ', 'supervisor'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'owner.b@test', 'صاحب ب', 'owner');

-- بيانات جوه كل مصنع: عميل، وتحصيل، وأمر إنتاج
insert into factory.parties (factory_id, id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', 'عميل مصنع أ'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b1111111-1111-1111-1111-111111111111', 'عميل مصنع ب');

insert into factory.accounts (factory_id, id, name, kind) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', 'درج أ', 'cash'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b2222222-2222-2222-2222-222222222222', 'درج ب', 'cash');

-- ── ١) العزل: مصنع ب مايشوفش حرف من مصنع أ ─────────────────────────
select as_user('22222222-2222-2222-2222-222222222222');
do $$ begin
  perform tst('صاحب ب بيشوف مصنعه',
    (select count(*) from factory.factories where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') = 1);
  perform tst('وماشايفش مصنع أ — ولا بالـid',
    (select count(*) from factory.factories where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 0);
  perform tst('بيشوف عميله',
    (select count(*) from factory.parties) = 1);
  perform tst('وماشايفش عملاء مصنع أ',
    (select count(*) from factory.parties
     where factory_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 0);
  perform tst('وماشايفش حسابات مصنع أ',
    (select count(*) from factory.accounts
     where factory_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 0);
  perform tst('وماشايفش أعضاء مصنع أ',
    (select count(*) from factory.members
     where factory_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 0);
end $$;

-- ── ٢) الكتابة في مصنع تاني بترفض ──────────────────────────────────
do $$
declare blocked boolean := false;
begin
  begin
    insert into factory.parties (factory_id, id, name)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), 'عميل مزروع');
  exception when insufficient_privilege then blocked := true;
  end;
  perform tst('إضافة سجل في مصنع تاني بترفض', blocked);
end $$;

do $$
declare n integer;
begin
  update factory.parties set name = 'اسم متغيّر'
  where factory_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  get diagnostics n = row_count;
  perform tst('وتعديل سجل في مصنع تاني مابيلمسش صف', n = 0);

  delete from factory.parties where factory_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  get diagnostics n = row_count;
  perform tst('ومسحه كمان مابيلمسش صف', n = 0);
end $$;

select as_admin();
do $$ begin
  perform tst('وعميل مصنع أ زي ما هو بالاسم الأصلي',
    (select name from factory.parties
     where factory_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 'عميل مصنع أ');
end $$;

-- ── ٣) الصلاحيات: المشرف مايشوفش المالية ───────────────────────────
select as_user('33333333-3333-3333-3333-333333333333');
do $$ begin
  perform tst('المشرف دوره مقروء', factory.my_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 'supervisor');
  perform tst('المشرف بيشوف مصنعه',
    (select count(*) from factory.factories where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 1);
  perform tst('وبيشوف نفسه في الأعضاء',
    (select count(*) from factory.members where user_id = '33333333-3333-3333-3333-333333333333') = 1);
  perform tst('وماشايفش باقي الأعضاء',
    (select count(*) from factory.members) = 1);

  perform tst('له إنتاج: عرض', factory.has_perm('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'production', 'view'));
  perform tst('له إنتاج: تصدير', factory.has_perm('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'production', 'export'));
  perform tst('مابيمسحش إنتاج', factory.has_perm('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'production', 'delete'), false);
  perform tst('مالوش مالية', factory.has_perm('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'finance', 'view'), false);
  perform tst('مالوش عملاء', factory.has_perm('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parties', 'view'), false);
  perform tst('مالوش تكلفة', factory.has_perm('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'costing', 'view'), false);
  perform tst('ومالوش صلاحية في مصنع ب أصلًا',
    factory.has_perm('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'production', 'view'), false);
end $$;

--
-- والأهم: الصلاحية بتمنع فعلًا على مستوى الصفوف، مش بس بترجع false.
--
do $$ begin
  perform tst('المشرف ماشايفش حسابات الخزينة خالص',
    (select count(*) from factory.accounts) = 0);
  perform tst('وماشايفش العملاء خالص',
    (select count(*) from factory.parties) = 0);
end $$;

do $$
declare blocked boolean := false;
begin
  begin
    insert into factory.accounts (factory_id, id, name, kind)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), 'درج مزروع', 'cash');
  exception when insufficient_privilege then blocked := true;
  end;
  perform tst('والمشرف مابيضيفش حساب خزينة', blocked);
end $$;

-- المشرف بيحاول يرقّي نفسه
do $$
declare n integer; blocked boolean := false;
begin
  begin
    update factory.members set role = 'owner'
    where user_id = '33333333-3333-3333-3333-333333333333';
    get diagnostics n = row_count;
    blocked := n = 0;
  exception when others then blocked := true;
  end;
  perform tst('المشرف مابيرقّيش نفسه', blocked);
end $$;

-- والمشرف بيحاول يضيف عامل — ده مسموح له
do $$ begin
  insert into factory.workers (factory_id, id, name, pay_type, rate)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), 'عامل جديد', 'daily', 200);
  perform tst('والمسموح بيعدّي: المشرف بيضيف عامل',
    (select count(*) from factory.workers) = 1);
end $$;

-- ── ٤) المالك بيشوف كل حاجة في مصنعه بس ────────────────────────────
select as_user('11111111-1111-1111-1111-111111111111');
do $$ begin
  perform tst('المالك بيشوف حسابات مصنعه',
    (select count(*) from factory.accounts) = 1);
  perform tst('وبيشوف عملاء مصنعه',
    (select count(*) from factory.parties) = 1);
  perform tst('وبيشوف أعضاء مصنعه كلهم',
    (select count(*) from factory.members) = 2);
  perform tst('وماشايفش أي حاجة من مصنع ب',
    (select count(*) from factory.parties
     where factory_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') = 0);
end $$;

-- ── ٥) سجل التعديلات: بيتقرا، ومابيتمسحش ───────────────────────────
select as_admin();
insert into factory.audit_log (factory_id, id, actor_name, action, table_name, record_id)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), 'صاحب أ', 'update', 'orders', gen_random_uuid());

select as_user('11111111-1111-1111-1111-111111111111');
do $$
declare n integer;
begin
  perform tst('المالك بيقرا السجل', (select count(*) from factory.audit_log) = 1);
  delete from factory.audit_log;
  get diagnostics n = row_count;
  perform tst('ومابيمسحوش — ولا المالك', n = 0);
  update factory.audit_log set action = 'حاجة تانية';
  get diagnostics n = row_count;
  perform tst('ومابيعدّلوش كمان', n = 0);
end $$;

select as_user('33333333-3333-3333-3333-333333333333');
do $$ begin
  perform tst('والمشرف ماشايف السجل أصلًا', (select count(*) from factory.audit_log) = 0);
end $$;

-- ── ٦) مستخدم مش داخل: ممنوع من السكيما كلها ───────────────────────
--
-- الحالة دي أقوى من «بيشوف صفر صفوف»: دور `anon` مالوش `usage` على
-- سكيما `factory` من الأصل، فالطلب بيترفض قبل ما يوصل لأي سياسة. يعني
-- لو سياسة اتكتبت غلط بكرة، `anon` برضه مش شايف حاجة.
--
select set_config('request.jwt.claims', '', false);
select set_config('role', 'anon', false);
do $$
declare blocked boolean;
begin
  begin
    perform count(*) from factory.factories;
    blocked := false;
  exception when insufficient_privilege then blocked := true;
  end;
  perform tst('مستخدم مش داخل ممنوع من السكيما كلها', blocked);

  begin
    perform count(*) from factory.collections;
    blocked := false;
  exception when insufficient_privilege then blocked := true;
  end;
  perform tst('ولا التحصيلات', blocked);
end $$;

--
-- ٧) ومستخدم داخل بحساب مش عضو في أي مصنع: بيوصل للسكيما وماشايفش صف
--
select as_user('99999999-9999-9999-9999-999999999999');
do $$ begin
  perform tst('حساب مش عضو ماشايفش مصانع', (select count(*) from factory.factories) = 0);
  perform tst('ولا عملاء', (select count(*) from factory.parties) = 0);
  perform tst('ولا تحصيلات', (select count(*) from factory.collections) = 0);
  perform tst('ودوره مش موجود', factory.my_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') is null);
end $$;

select as_admin();
