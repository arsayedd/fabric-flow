-- صنعة — Migration 0014: الجودة والمرتجعات
-- إضافية بالكامل: أعمدة جديدة على `returns` بقيم افتراضية، جدول
-- `repairs` جديد، فهارس، سياسات، وview. مفيش DROP ولا RENAME ولا تغيير
-- في نوع عمود قائم، فالنشر مايكسرش بيانات ولا كود شغّال.
--
-- والقاعدة الحاكمة في الملف ده: **العيب اللي اتمسك جوه والعيب اللي رجع
-- من برّه نفس المشكلة.** قبل كده كان فيه قايمتين مختلفتين — نص حر على
-- الباندل (`bundle_ops.defect`) وقايمة `reason` على المرتجع — فسؤال
-- «أكتر مشكلة عندنا إيه؟» كان ليه إجابتين، وكل واحدة صح لوحدها
    10|-- ومالهاش لازمة. بقى فيه تصنيف واحد (`problem`) بيوصل الاتنين، فباريتو
-- واحد يقدر يجمعهم.
--
-- والتفرقة التانية، وهي أهم حاجة في الملف: **تلات أسئلة مختلفة، تلات
-- أعمدة.**
--   `problem`    المشكلة إيه — «عيب خياطة»، «عيب قماش»
--   `origin`     جات منين — المورّد، الخامة، الخط، العامل، النقل، العميل
--   `root_cause` وليه حصلت — ضبط ماكينة، تدريب، جودة خامة، شد قماش
-- «مشكلة من المورّد» و«مشكلة من العميل» مش أنواع مشاكل، دول **مصدر**.
-- ولو خلطناهم في عمود واحد، المرتجع اللي فيه عيب قماش جاي من مورّد
    20|-- بيضطر يختار واحد ويسيب التاني — وبعدها لا تحليل المشكلة ولا تحليل
-- المورّد يبقى مكتمل.

-- ─────────────────────────────────────────────────────────────
-- 1) المشكلة ومصدرها وجذرها على المرتجع
-- ─────────────────────────────────────────────────────────────

alter table factory.returns
  -- فاضي مسموح، لأن **مش كل مرتجع فيه عيب**: العميل اللي غيّر رأيه
  -- رجّع قطعة سليمة. والفاضي معناه «لسه مافُحصتش أو مافيهاش مشكلة» —
  -- والشاشة بتعرضه فاضي، مش «مش معروف»
    30|  add column if not exists problem text check (problem in (
    'sewing', 'cutting', 'finishing', 'ironing', 'printing', 'embroidery',
    'fabric', 'accessory', 'tear', 'size', 'color', 'wrong_item',
    'shortage', 'packing', 'transit', 'other_problem'
  )),
  -- `unknown` موجودة في القايمة عن قصد: المشكلة اللي مصدرها مش معروف
  -- لازم يبقى لها خانة صريحة، لأن البديل إن المستخدم يختار أقرب حاجة
  -- فيطلع باريتو بيتّهم العامل في مشاكل محدش عارف مصدرها
  add column if not exists origin text check (origin in (
    'supplier', 'material', 'machine', 'line', 'operation', 'worker',
    40|    'qc', 'transport', 'customer', 'unknown'
  )),
  add column if not exists root_cause text check (root_cause in (
    'calibration', 'training', 'material_quality', 'tension',
    'spec_unclear', 'rush', 'storage', 'unknown_cause'
  )),
  add column if not exists color text not null default '',
  add column if not exists size text not null default '',
  add column if not exists line text not null default '',
  add column if not exists operation_id uuid,
    50|  -- ربط العامل بالمشكلة **ادّعاء** له نتيجة على ملف جودته، فبيفضل
  -- فاضي لحد ما حد يقرر بصراحة إنه هو
  add column if not exists worker_id uuid,
  -- المسؤول عن متابعة الحالة — عضو في المصنع مش عامل
  add column if not exists owner_id uuid,
  -- تكلفة المرتجع **سطور** مش رقم: شحن رجوع، فحص، أجر إصلاح، خامات،
  -- إعادة تشغيل، تغليف، شحن إرسال، هالك، مصاريف إدارية. «رجع ١٠٠
  -- قطعة» مابيقولش حاجة، لكن مجموع البنود بيقول المشكلة كلّفت كام وفين
  add column if not exists costs jsonb not null default '[]'::jsonb,
  -- صور «قبل» و«بعد». الإثبات هو اللي بيخلي المطالبة على المورّد أو
    60|  -- الرد على العميل ممكن بعد شهرين، و«اتصلحت» جملة عليها دليل
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- نقل `extra_cost` القديم لبند «مصاريف إدارية» داخل `costs`.
--
-- العمود القديم **مابيتشالش**: أي نسخة قديمة من التطبيق لسه بتقرا منه،
-- والحذف كان هيكسرها. بيفضل موجود وبيتجاهله الكود الجديد، ويتشال في
-- migration لوحده بعد ما كل النسخ تتحدّث.
update factory.returns
set costs = jsonb_build_array(
      jsonb_build_object(
    70|        'id', gen_random_uuid(),
        'kind', 'admin',
        'amount', extra_cost,
        'note', coalesce(nullif(extra_note, ''), 'منقول من مصاريف المرتجع')
      )
    )
where extra_cost > 0
  and costs = '[]'::jsonb;

create index if not exists returns_problem_idx on factory.returns (factory_id, problem, date desc) where problem is not null;
    80|create index if not exists returns_origin_idx on factory.returns (factory_id, origin, date desc) where origin is not null;
create index if not exists returns_worker_idx on factory.returns (factory_id, worker_id, date desc) where worker_id is not null;
create index if not exists returns_line_idx on factory.returns (factory_id, line, date desc) where line <> '';

-- المرتجع التالف لازم يقول المشكلة إيه.
--
-- الشرط ده **مش على الإدخال كله**، هو على الحالة المفحوصة بس: المرتجع
-- وقت الوصول ممكن ييجي وهو تالف ومحدش بصّ عليه لسه، لكن بعد الفحص
-- «تالف بدون مشكلة مكتوبة» سطر ضايع من تحليل الجودة — رجع ومحدش هيعرف
-- ليه، وبعد شهر بيرجع تاني.
    90|alter table factory.returns
  drop constraint if exists returns_defective_has_problem;
alter table factory.returns
  add constraint returns_defective_has_problem check (
    status in ('open', 'cancelled') or condition = 'good' or problem is not null
  ) not valid;
-- `not valid` عن قصد: بيسري على الجديد وبيسيب الصفوف القديمة زي ما هي،
-- عشان النشر مايفشلش على مصنع عنده مرتجعات قديمة بدون مشكلة مكتوبة.
-- تصحيحها شغل بيانات مش شغل schema.

   100|-- ─────────────────────────────────────────────────────────────
-- 2) أوامر الإصلاح
-- ─────────────────────────────────────────────────────────────
--    المرتجع اللي قراره «إصلاح» بيفتح أمر إصلاح بدل ما تتكتب تكلفة
--    تقديرية في خانة. والسبب إن الإصلاح **شغل حقيقي**: قطع بتتصلح،
--    عامل بيقعد عليها وقت، خامات بتتصرف من المخزن، وفحص بيقرر عدّت ولا
--    لأ. لو كتبنا «تكلفة الإصلاح ٩٠٠» ملهاش سند، الخيط والزراير
--    بيفضلوا في الرصيد على الورق وهم مصروفين فعلًا.
--
--    ودورة الحياة هنا **منفصلة عن حالة المرتجع** عن قصد: المرتجع دفتر
   110|--    تجاري (رجع → اتفحص → اتسوّى)، وأمر الإصلاح دفتر تشغيلي (في
--    الطابور → بيتصلح → فحص → جاهز → اترجّع). لو دمجناهم في عمود حالة
--    واحد كنا هنحتاج اتناشر حالة، والحالة اللي معناها «اتسوّى تجاريًا
--    وبيتصلح تشغيليًا» مكانت هتلاقي خانة.

create table if not exists factory.repairs (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  code text not null,
  return_id uuid not null,
   120|  date date not null,
  qty numeric not null check (qty > 0),
  problem text check (problem in (
    'sewing', 'cutting', 'finishing', 'ironing', 'printing', 'embroidery',
    'fabric', 'accessory', 'tear', 'size', 'color', 'wrong_item',
    'shortage', 'packing', 'transit', 'other_problem'
  )),
  worker_id uuid,
  operation_id uuid,
  -- أجر إصلاح القطعة **قرار وقت فتح الأمر** فبيتخزّن، زي `rate` في
   130|  -- `bundle_ops` بالظبط: السعر بيتغير، والأمر القديم لازم يفضل
  -- بتكلفته وقتها
  rate numeric not null default 0 check (rate >= 0),
  -- الوقت من الساعة مش من الكيبورد: بيتحسب من `started_at` و
  -- `finished_at`، فمفيش حد بيكتب «خدت عشر دقايق» بعد ما يخلّص
  minutes numeric not null default 0 check (minutes >= 0),
  -- خامات الإصلاح مع تكلفة وحدتها **وقت الصرف**، مش سعر النهارده
  materials jsonb not null default '[]'::jsonb,
  status text not null default 'queued' check (status in (
    'queued', 'repairing', 'qc', 'ready', 'shipped', 'scrapped', 'cancelled'
   140|  )),
  started_at timestamptz,
  finished_at timestamptz,
  qty_passed numeric not null default 0 check (qty_passed >= 0),
  qty_failed numeric not null default 0 check (qty_failed >= 0),
  qc_at timestamptz,
  qc_by uuid,
  qc_note text not null default '',
  shipped_at timestamptz,
  cancel_reason text,
   150|  created_at timestamptz not null default now(),
  created_by uuid,
  notes text not null default '',
  primary key (factory_id, id),
  unique (factory_id, code),
  foreign key (factory_id, return_id) references factory.returns (factory_id, id) on delete cascade,

  -- نتيجة الفحص لازم تجمع كل الكمية: مافيش قطعة تختفي من الدفتر
  constraint repairs_qc_totals check (
    qc_at is null or qty_passed + qty_failed = qty
   160|  ),
  -- القطع اللي سقطت لازم يتكتب ليه. دي المعلومة اللي بتقول إن الإصلاح
  -- نفسه مش شغّال — من غيرها بنكرّر نفس الإصلاح الفاشل
  constraint repairs_failed_has_note check (
    qty_failed = 0 or qc_note <> ''
  ),
  constraint repairs_cancel_has_reason check (
    status <> 'cancelled' or coalesce(cancel_reason, '') <> ''
  )
);
   170|
create index if not exists repairs_return_idx on factory.repairs (factory_id, return_id);
create index if not exists repairs_open_idx on factory.repairs (factory_id, status)
  where status in ('queued', 'repairing', 'qc', 'ready');
create index if not exists repairs_worker_idx on factory.repairs (factory_id, worker_id, date desc) where worker_id is not null;
create index if not exists repairs_date_idx on factory.repairs (factory_id, date desc);

-- ─────────────────────────────────────────────────────────────
-- 3) تكلفة الحالة — مصدر واحد للمجموع
-- ─────────────────────────────────────────────────────────────
   180|--    المجموع **مابيتخزّنش** في عمود. بيتحسب من بندين: السطور المكتوبة
--    في `costs`، وأمر الإصلاح اللي بيحسب أجره وخاماته لوحده. والبندين
--    `repair_labor` و`spare_materials` ممنوعين من الكتابة بالإيد لما
--    يبقى فيه أمر إصلاح — عشان نفس الجنيه مايتعدّش مرتين. والرقم
--    المضخّم بيوقف قرار صح زي الرقم الناقص بالظبط.

create or replace view factory.v_return_cost as
with manual as (
  select
    r.factory_id,
   190|    r.id as return_id,
    coalesce(sum((c ->> 'amount')::numeric), 0) as manual_cost
  from factory.returns r
  left join lateral jsonb_array_elements(r.costs) as c on true
  where (c ->> 'kind') is null
     or (c ->> 'kind') not in ('repair_labor', 'spare_materials')
  group by r.factory_id, r.id
),
repair as (
  select
   200|    p.factory_id,
    p.return_id,
    coalesce(sum(
      p.qty * p.rate
      + coalesce((
          select sum((m ->> 'qty')::numeric * (m ->> 'unitCost')::numeric)
          from jsonb_array_elements(p.materials) as m
        ), 0)
    ), 0) as repair_cost
  from factory.repairs p
   210|  where p.status <> 'cancelled'
  group by p.factory_id, p.return_id
)
select
  r.factory_id,
  r.id as return_id,
  r.code,
  r.problem,
  r.origin,
  r.root_cause,
   220|  coalesce(m.manual_cost, 0) as manual_cost,
  coalesce(p.repair_cost, 0) as repair_cost,
  coalesce(m.manual_cost, 0) + coalesce(p.repair_cost, 0) as total_cost
from factory.returns r
left join manual m on m.factory_id = r.factory_id and m.return_id = r.id
left join repair p on p.factory_id = r.factory_id and p.return_id = r.id
where r.status <> 'cancelled';

-- ─────────────────────────────────────────────────────────────
-- 4) RLS — عزل المصنع
   230|-- ─────────────────────────────────────────────────────────────
--    أمر الإصلاح بياخد صلاحية **الجودة**، مش صلاحية الطرف زي المرتجع.
--    والسبب إن الإصلاح شغل داخلي: هو بيصرف خامات وبيدخّل بضاعة بعد
--    الفحص، ومالوش علاقة بمين رجّع القطعة.

alter table factory.repairs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'repairs' and policyname = 'repairs_rw') then
   240|    create policy repairs_rw on factory.repairs
      for all using (factory.my_role(factory_id) is not null)
      with check (factory.my_role(factory_id) is not null);
  end if;
end $$;

-- ملف جودة العامل بيتقرا من الview دي، مش من الجدول مباشرة.
--
-- والسبب مكتوب في التطبيق كمان: الأرقام دي بتاعة **أشخاص**، فمابتظهرش
-- غير لصلاحية العمال. والرقم نفسه **قياس مش تقييم**: بيقول العيب في
   250|-- شغله كام في المية، مش بيقول هو كويس ولا وحش — والعامل اللي على
-- عملية صعبة نسبة عيبه أعلى بطبيعتها، وعشان كده العملية بتتعرض جنب
-- الرقم دايمًا.
create or replace view factory.v_worker_quality as
select
  r.factory_id,
  r.worker_id,
  count(*) as cases,
  sum(r.qty) as qty,
  jsonb_object_agg(coalesce(r.problem, 'other_problem'), 1) as problems
   260|from factory.returns r
where r.status <> 'cancelled'
  and r.worker_id is not null
  and r.origin = 'worker'
group by r.factory_id, r.worker_id;

-- ─────────────────────────────────────────────────────────────
-- 5) اللي مش في الملف ده عن قصد
-- ─────────────────────────────────────────────────────────────
--    * **تصنيفات مشاكل يعرّفها المصنع بنفسه**: القايمة مقفولة دلوقتي.
   270|--      التخصيص محتاج جدول `problem_categories` بـ`factory_id` وربط
--      بالتصنيف الأب، وترحيل القيم المقفولة له كبيانات افتراضية. مش
--      عملناه لأن أول قيمة للسيستم إن كل المصانع تتكلم نفس اللغة —
--      والتخصيص قبل ما تبقى فيه بيانات كفاية بيرجّعنا للنص الحر.
--    * **CAPA كـكيان**: الإجراء التصحيحي دلوقتي سطر في الملاحظات.
--      تحويله لكيان معناه: إجراء له مسؤول وميعاد ومتابعة وإثبات إنه
--      اتعمل، وبعده قياس هل المشكلة قلّت فعلًا. ده module لوحده
--      وبيحتاج المهام تبقى كيان أول.
--    * **ربط `origin = 'machine'` بماكينة**: مافيش جدول ماكينات لسه،
--      فالمصدر ده بيتسجّل بدون ربط. الربط بيتعمل مع CMMS.
   280|--    * **فيديو وملفات كبيرة**: `attachments` صور مصغّرة inline
--      بحد ست صور، لأن الدفتر المحلي مساحته محدودة. الأصل الكامل
--      والفيديو محتاجين Supabase Storage.
--    * **توقيع على الحالة**: التوقيع موجود في المستندات
--      (`issued_docs`)، والحالة بتطلع مستند. ربط التوقيع بالحالة نفسها
--      مش متعمل.
--    * **مطالبة شركة الشحن**: `transit` مصدر معروف، لكن مافيش كيان
--      «ناقل» يتعمل عليه مطالبة. محتاج الناقل يبقى جهة تعامل بدور
--      جديد.
--    * **تحويل الـpolicy دي لتسأل `has_perm`**: نفس الملاحظة المكتوبة
   290|--      في آخر 0009 و0011 و0012 و0013 — بيتعمل في migration لوحده لكل
--      الجداول مرة واحدة.
