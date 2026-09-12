-- صنعة — Migration 0011: القص والباندلات وتتبع العملية والورش الخارجية
-- إضافية بالكامل: تمن جداول جديدة، فهارس، وسياسات. مفيش DROP ولا RENAME
-- ولا تعديل على عمود قائم، فالنشر مايأثرش على أي بيانات موجودة، والمصنع
-- اللي مش هيستعمل الطبقة دي مايتغيّرش عنده حاجة.
--
-- القاعدة المعمارية الحاكمة هنا: **الكميات مالهاش دفترين.**
-- الجدول اللي بيحمل الكميات المنتَجة فاضل `production_stage_entries` زي
-- ما هو. الباندل والعملية بيضيفوا **الهوية والوقت** فوق التسجيل ده:
-- مين شغّل، على أنهي ربطة، بدأ إمتى، ووقف قد إيه. عشان كده
-- `bundle_ops.stage_entry_id` بيشاور على تسجيل الإنتاج، ومش بيكرّره —
-- لو كرّرناه، التقدّم والتكلفة والأجور هيبقى لكل واحد فيهم رقمين.
--
-- والقاعدة التانية: **تشغيل الورشة مش فاتورة مشتريات.** المستحق للورشة
-- بيتحسب من الاستلامات الفعلية (`sub_receipts`) مضروبة في أجر القطعة،
-- مش من الكمية اللي طلعت. الفاقد مابيتدفعش عليه، والدفع بيتسجّل في
-- `sub_payments` — لو سجّلناه كمان في `cost_entries` كان المصروف
-- هيتعدّ مرتين في قايمة الأرباح.

-- ─────────────────────────────────────────────────────────────
-- 1) الفرشة وسطورها
-- ─────────────────────────────────────────────────────────────
--    الفرشة بتتخزّن بمدخلاتها بس: الطبقات وطول الماركر وفاقد الأطراف
--    وقطع كل مقاس في الطبقة. القطع والقماش والاستغلال **محسوبين**
--    ومش بيتخزّنوا — الاستثناء الوحيد هو `fabric_used_m`، لأنه قياس
--    فعلي من الترابيزة مش نتيجة معادلة.

create table if not exists factory.cut_lays (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  order_id uuid not null,
  material_id uuid not null,
  -- العملية اللي القص بيتسجّل عليها في المسار (عادة «قص»)
  operation_id uuid,
  color text not null default '',
  date date not null default current_date,
  plies int not null check (plies > 0),
  marker_length_m numeric not null check (marker_length_m > 0),
  end_allowance_m numeric not null default 0 check (end_allowance_m >= 0),
  marker_width_m numeric not null default 0 check (marker_width_m >= 0),
  status text not null default 'planned' check (status in ('planned', 'cut', 'cancelled')),
  cut_at timestamptz,
  -- المستهلك فعلًا — بيتملى ساعة القص، وقبلها NULL معناها «لسه متوقع»
  fabric_used_m numeric check (fabric_used_m >= 0),
  cancel_reason text,
  notes text not null default '',
  client_op_id text,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (factory_id, id),
  unique (factory_id, client_op_id),
  foreign key (factory_id, order_id) references factory.orders (factory_id, id),
  foreign key (factory_id, material_id) references factory.materials (factory_id, id),
  foreign key (factory_id, operation_id) references factory.operations (factory_id, id),
  -- الفرشة المقصوصة لازم يكون معاها وقت قص. «مقصوصة» بلا وقت = سطر مش مكتمل.
  constraint cut_lays_cut_needs_time check (status <> 'cut' or cut_at is not null),
  constraint cut_lays_cancel_needs_reason
    check (status <> 'cancelled' or coalesce(btrim(cancel_reason), '') <> '')
);

create index if not exists cut_lays_order_idx on factory.cut_lays (factory_id, order_id, date desc);

create table if not exists factory.cut_lay_lines (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  lay_id uuid not null,
  size text not null,
  per_ply int not null check (per_ply > 0),
  primary key (factory_id, id),
  -- المقاس مايتكرّرش في نفس الفرشة: سطرين لنفس المقاس معناهم رقمين للحقيقة
  unique (factory_id, lay_id, size),
  foreign key (factory_id, lay_id) references factory.cut_lays (factory_id, id) on delete cascade
);

-- ─────────────────────────────────────────────────────────────
-- 2) الباندل — الوحدة اللي بتتحرك جوه المصنع
-- ─────────────────────────────────────────────────────────────
--    الباندل بيتولد من الفرشة، ومقاسه واحد: مابنخلطش مقاسين في ربطة،
--    عشان التيكت يقرا لوحده على الترابيزة.

create table if not exists factory.bundles (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  code text not null,
  order_id uuid not null,
  lay_id uuid,
  size text not null default '',
  color text not null default '',
  qty int not null check (qty > 0),
  created_at timestamptz not null default now(),
  primary key (factory_id, id),
  -- الكود هو اللي بيتمسح من التيكت، فلازم يبقى فريد جوه المصنع
  unique (factory_id, code),
  foreign key (factory_id, order_id) references factory.orders (factory_id, id),
  foreign key (factory_id, lay_id) references factory.cut_lays (factory_id, id)
);

create index if not exists bundles_order_idx on factory.bundles (factory_id, order_id);

-- ─────────────────────────────────────────────────────────────
-- 3) العملية على الباندل — الهوية والوقت فوق دفتر الإنتاج
-- ─────────────────────────────────────────────────────────────

create table if not exists factory.bundle_ops (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  bundle_id uuid not null,
  order_id uuid not null,
  operation_id uuid not null,
  seq int not null,
  worker_id uuid,
  state text not null default 'running' check (state in ('running', 'paused', 'done')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  -- دقايق التوقف المتراكمة. لما تكون واقفة، `paused_at` بيمشي معاها.
  paused_minutes numeric not null default 0 check (paused_minutes >= 0),
  paused_at timestamptz,
  pause_note text not null default '',
  qty_good numeric not null default 0 check (qty_good >= 0),
  qty_rework numeric not null default 0 check (qty_rework >= 0),
  qty_scrap numeric not null default 0 check (qty_scrap >= 0),
  rate numeric not null default 0 check (rate >= 0),
  -- الزمن المعياري للقطعة وقت التسجيل. لو اتغيّر في المسار بعدين،
  -- الكفاءة القديمة تفضل محسوبة بالمعياري اللي كان ساري ساعتها.
  std_minutes numeric not null default 0 check (std_minutes >= 0),
  defect text not null default '',
  -- المؤشر على دفتر الإنتاج: الكميات هناك، مش هنا مرة تانية
  stage_entry_id uuid,
  notes text not null default '',
  client_op_id text,
  created_at timestamptz not null default now(),
  primary key (factory_id, id),
  unique (factory_id, client_op_id),
  foreign key (factory_id, bundle_id) references factory.bundles (factory_id, id) on delete cascade,
  foreign key (factory_id, order_id) references factory.orders (factory_id, id),
  foreign key (factory_id, operation_id) references factory.operations (factory_id, id),
  foreign key (factory_id, worker_id) references factory.workers (factory_id, id),
  foreign key (factory_id, stage_entry_id) references factory.production_stage_entries (factory_id, id),
  -- الخالصة لازم يكون ليها وقت نهاية وتسجيل في دفتر الإنتاج
  constraint bundle_ops_done_needs_end check (state <> 'done' or ended_at is not null),
  -- الواقفة لازم يكون معروف وقفت إمتى، وإلا التوقف مش هيتخصم من الوقت
  constraint bundle_ops_paused_needs_time check (state <> 'paused' or paused_at is not null)
);

create index if not exists bundle_ops_bundle_idx on factory.bundle_ops (factory_id, bundle_id, seq);
create index if not exists bundle_ops_worker_idx on factory.bundle_ops (factory_id, worker_id, ended_at desc);
create index if not exists bundle_ops_state_idx on factory.bundle_ops (factory_id, state);

-- الباندل ماينفعش يكون شغّال في عمليتين في نفس الوقت: اللي بيمنع ده
-- فهرس جزئي، مش شرط في الواجهة — الواجهة ممكن تتفتح على تليفونين.
create unique index if not exists bundle_ops_one_active
  on factory.bundle_ops (factory_id, bundle_id)
  where state in ('running', 'paused');

-- ─────────────────────────────────────────────────────────────
-- 4) بلاغات أرض المصنع
-- ─────────────────────────────────────────────────────────────
--    عطل ماكينة، طلب خامة، مشكلة جودة. البلاغ بيتقفل مش بيتمسح، عشان
--    عدد الأعطال على مدار الشهر يفضل مقروء.

create table if not exists factory.floor_issues (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  kind text not null check (kind in ('machine', 'material', 'quality', 'other')),
  line text not null default '',
  order_id uuid,
  bundle_id uuid,
  worker_id uuid,
  note text not null default '',
  at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_at timestamptz,
  resolved_by uuid,
  primary key (factory_id, id),
  foreign key (factory_id, order_id) references factory.orders (factory_id, id),
  foreign key (factory_id, bundle_id) references factory.bundles (factory_id, id),
  foreign key (factory_id, worker_id) references factory.workers (factory_id, id),
  constraint floor_issues_resolved_needs_time check (status <> 'resolved' or resolved_at is not null)
);

create index if not exists floor_issues_open_idx
  on factory.floor_issues (factory_id, status, at desc);

-- ─────────────────────────────────────────────────────────────
-- 5) الورش الخارجية
-- ─────────────────────────────────────────────────────────────
--    الورشة **مش جدول جديد**: هي جهة تعامل بدور `workshop` في
--    `party_roles`، زي العميل والمورد بالظبط. اللي جديد هنا هو الأعمال
--    اللي بتطلع لها، والاستلامات، والدفعات.
--
--    ومافيش موديول صلاحية جديد كمان: الورش بتتحكم فيها صلاحية
--    `purchasing` — لأن اللي بيبعت شغل برّه بفلوس هو نفسه اللي بيشتري.

create table if not exists factory.subcontracts (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  code text not null,
  party_id uuid not null,
  order_id uuid,
  operation_id uuid,
  date date not null default current_date,
  expected_date date not null,
  qty_sent numeric not null check (qty_sent > 0),
  rate numeric not null default 0 check (rate >= 0),
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  closed_at timestamptz,
  cancel_reason text,
  notes text not null default '',
  client_op_id text,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (factory_id, id),
  unique (factory_id, code),
  unique (factory_id, client_op_id),
  foreign key (factory_id, party_id) references factory.parties (factory_id, id),
  foreign key (factory_id, order_id) references factory.orders (factory_id, id),
  foreign key (factory_id, operation_id) references factory.operations (factory_id, id),
  constraint subcontracts_cancel_needs_reason
    check (status <> 'cancelled' or coalesce(btrim(cancel_reason), '') <> '')
);

create index if not exists subcontracts_party_idx on factory.subcontracts (factory_id, party_id, date desc);
create index if not exists subcontracts_open_idx on factory.subcontracts (factory_id, status, expected_date);

create table if not exists factory.sub_receipts (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  subcontract_id uuid not null,
  date date not null default current_date,
  qty_good numeric not null default 0 check (qty_good >= 0),
  qty_rework numeric not null default 0 check (qty_rework >= 0),
  qty_lost numeric not null default 0 check (qty_lost >= 0),
  -- الشغل الراجع من الورشة بيدخل دفتر الإنتاج زي أي شغل تاني
  stage_entry_id uuid,
  notes text not null default '',
  client_op_id text,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (factory_id, id),
  unique (factory_id, client_op_id),
  foreign key (factory_id, subcontract_id) references factory.subcontracts (factory_id, id) on delete cascade,
  foreign key (factory_id, stage_entry_id) references factory.production_stage_entries (factory_id, id),
  -- استلامة بصفر في كل الخانات مش حركة، دي سطر فاضي
  constraint sub_receipts_needs_qty check (qty_good + qty_rework + qty_lost > 0)
);

create index if not exists sub_receipts_sub_idx on factory.sub_receipts (factory_id, subcontract_id, date);

create table if not exists factory.sub_payments (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  party_id uuid not null,
  -- الدفعة ممكن تكون على إذن بعينه أو على الحساب كله
  subcontract_id uuid,
  date date not null default current_date,
  amount numeric not null check (amount > 0),
  -- من غير foreign key: حسابات الخزينة لسه في جدول الميراث القديم،
  -- فالربط بيتعمل لما الخزينة تتنقل للـschema ده
  account_id uuid not null,
  method text not null default 'cash',
  notes text not null default '',
  client_op_id text,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (factory_id, id),
  unique (factory_id, client_op_id),
  foreign key (factory_id, party_id) references factory.parties (factory_id, id),
  foreign key (factory_id, subcontract_id) references factory.subcontracts (factory_id, id)
);

create index if not exists sub_payments_party_idx on factory.sub_payments (factory_id, party_id, date);

-- ─────────────────────────────────────────────────────────────
-- 6) مستحق الورش — محسوب من الاستلامات، مش مخزّن
-- ─────────────────────────────────────────────────────────────

create or replace view factory.v_workshop_charges as
select
  r.factory_id,
  s.party_id,
  s.id as subcontract_id,
  r.date,
  (r.qty_good + r.qty_rework) * s.rate as amount
from factory.sub_receipts r
join factory.subcontracts s
  on s.factory_id = r.factory_id and s.id = r.subcontract_id
where s.status <> 'cancelled';

create or replace view factory.v_workshop_balance as
select
  coalesce(c.factory_id, p.factory_id) as factory_id,
  coalesce(c.party_id, p.party_id) as party_id,
  coalesce(c.charge, 0) as charge,
  coalesce(p.paid, 0) as paid,
  coalesce(c.charge, 0) - coalesce(p.paid, 0) as due
from (
  select factory_id, party_id, sum(amount) as charge
  from factory.v_workshop_charges group by factory_id, party_id
) c
full outer join (
  select factory_id, party_id, sum(amount) as paid
  from factory.sub_payments group by factory_id, party_id
) p on p.factory_id = c.factory_id and p.party_id = c.party_id;

-- ─────────────────────────────────────────────────────────────
-- 7) RLS — عزل المصنع على كل جدول جديد
-- ─────────────────────────────────────────────────────────────

alter table factory.cut_lays enable row level security;
alter table factory.cut_lay_lines enable row level security;
alter table factory.bundles enable row level security;
alter table factory.bundle_ops enable row level security;
alter table factory.floor_issues enable row level security;
alter table factory.subcontracts enable row level security;
alter table factory.sub_receipts enable row level security;
alter table factory.sub_payments enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'cut_lays', 'cut_lay_lines', 'bundles', 'bundle_ops',
    'floor_issues', 'subcontracts', 'sub_receipts', 'sub_payments'
  ] loop
    if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = t and policyname = t || '_read') then
      execute format(
        'create policy %I on factory.%I for select using (factory.my_role(factory_id) is not null)',
        t || '_read', t
      );
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = t and policyname = t || '_write') then
      execute format(
        'create policy %I on factory.%I for all using (factory.my_role(factory_id) is not null) with check (factory.my_role(factory_id) is not null)',
        t || '_write', t
      );
    end if;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 8) اللي مش في الملف ده عن قصد
-- ─────────────────────────────────────────────────────────────
--    * **الرول كوحدة مخزون** (باركود لكل توب قماش، وأي فرشة اتقصّت من
--      أنهي رول): محتاج جدول `material_rolls` وحركة مخزن على مستوى
--      الرول. حاسبة الرول الحالية بتجاوب على «الرول ده يطلع كام قطعة»
--      من غير ما تدّعي إنها بتتبّع رول بعينه.
--    * **الماكينة على العملية**: `bundle_ops.machine_id` مش موجود لأن
--      مفيش جدول ماكينات لسه. لما CMMS يتبني، العمود بيتضاف nullable.
--    * **الصندوق والبالتة** فوق الباندل: التغليف لسه مابيتسجّلش كوحدة،
--      فالتسلسل بيقف عند الباندل.
--    * **البث اللحظي** لشاشة أرض المصنع: الشاشة دلوقتي بتعيد الحساب كل
--      ٢٠ ثانية. التحديث اللحظي محتاج Realtime على الجداول دي، وده
--      قرار تشغيل مش سطر SQL.
--    * تحويل الـpolicies دي لتسأل `has_perm` بدل العضويّة: نفس الملاحظة
--      المكتوبة في آخر 0009 — بيتعمل في migration لوحده بعد ما المصفوفة
--      تكون متخزّنة للمصانع القايمة، عشان مانقفلش وصول حد لحظة النشر.
