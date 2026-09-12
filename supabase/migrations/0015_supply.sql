-- صنعة — Migration 0015: التوريد والاستلام الجزئي والدفعات والاستدعاء
-- إضافية بالكامل: جداول جديدة، وأعمدة جديدة بقيم افتراضية على جداول
-- قايمة، وفهارس وسياسات. مفيش DROP table ولا RENAME ولا تغيير في نوع
-- عمود موجود. التغيير الوحيد اللي بيوسّع قاعدة قديمة مكتوب بصراحة في
-- القسم الأخير (`material_batches.material_id` بقى يقبل فاضي).
--
-- والفتحة اللي الملف ده بيقفلها أقدم فتحة في الـschema: **الشراء كان
-- بيتسجّل كنتيجة بس.** حركة مخزن بتقول «دخل ٩٧٠ متر» — ومابتقولش إن
-- المطلوب كان ١٠٠٠، ولا إن الميعاد كان امتى، ولا إن ٢٠ منهم نزلوا
-- تالفين و١٠ مكتوبين في ورقة المورّد ومش موجودين. فأربع أسئلة كانت
-- بلا إجابة في الدفتر:
--   * في عجز؟            محتاج **المطلوب** جنب الواصل
--   * المورّد بيتأخر؟      محتاج **الميعاد المتفق عليه**
--   * الخامة دي جات منين؟  محتاج **الدفعة** على الحركة
--   * المشكلة وصلت لمين؟   محتاج السلسلة من الدفعة للعميل
--
-- والأربعة مش أربع تقارير، دول **أربع أعمدة ناقصة**. الملف ده بيحطهم.

-- ─────────────────────────────────────────────────────────────
-- 1) أمر التوريد — الاتفاق منفصل عن التنفيذ
-- ─────────────────────────────────────────────────────────────
--    الفكرة الحاكمة: **الاتفاق كيان، والتنفيذ كيان تاني، والفرق بينهم
--    هو العجز.** لو خلطناهم في جدول واحد (زي ما كان: حركة مخزن بس)،
--    الفرق مالوش مكان يتسجّل فيه، فبيتحوّل لحاجة الناس تفتكرها.
--
--    و`status` هنا **مشتقّة** من الكميات في التطبيق (`deriveStatus`)،
--    والعمود بيتحدّث مع كل استلام. بيتخزّن عشان الفهرسة والفلترة بس،
--    والحقيقة تفضل في سطور الاستلام. الاستثناء الوحيد: `closed` و
--    `cancelled` **قرار إنسان** مافيش كمية توصل له، وعشان كده كل واحد
--    منهم عليه سبب إجباري تحت.

create table if not exists factory.supply_orders (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  code text not null,
  -- المورّد **جهة تعامل**، مش جدول موردين لوحده. نفس قرار 0003
  party_id uuid not null,
  date date not null,
  -- الرقم اللي بيخلّي «المورّد بيتأخر؟» سؤال ليه إجابة. بنقارنه بتاريخ
  -- آخر استلام، مش بإحساس
  expected_date date not null,
  status text not null default 'open' check (status in (
    'open', 'partial', 'received', 'closed', 'cancelled'
  )),
  closed_at timestamptz,
  close_reason text,
  cancel_reason text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (factory_id, id),
  unique (factory_id, code),
  foreign key (factory_id, party_id) references factory.parties (factory_id, id),

  -- قفل الأمر بعجز قرار بيعترف بخسارة، والإلغاء قرار بيلغي التزام.
  -- الاتنين لازم سبب، لأن الرقم من غير سبب بيرجع في المراجعة سؤال
  constraint supply_orders_close_has_reason check (
    status <> 'closed' or coalesce(close_reason, '') <> ''
  ),
  constraint supply_orders_cancel_has_reason check (
    status <> 'cancelled' or coalesce(cancel_reason, '') <> ''
  ),
  constraint supply_orders_expected_after_date check (expected_date >= date)
);

create index if not exists supply_orders_party_idx
  on factory.supply_orders (factory_id, party_id, date desc);
-- الفهرس الجزئي ده هو اللي شاشة «المتأخر» بتقرا منه: الأوامر المقفولة
-- والملغية مش بتتسأل عن ميعادها تاني
create index if not exists supply_orders_open_idx
  on factory.supply_orders (factory_id, expected_date)
  where status in ('open', 'partial');

create table if not exists factory.supply_order_lines (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  supply_order_id uuid not null,
  item_type text not null check (item_type in ('material', 'product')),
  item_id uuid not null,
  qty_ordered numeric not null check (qty_ordered > 0),
  -- السعر المتفق عليه: **قرار وقت الاتفاق** فبيتخزّن. السعر بيتغير،
  -- والأمر القديم لازم يفضل بسعره — نفس قاعدة `rate` في `bundle_ops`
  unit_price numeric not null default 0 check (unit_price >= 0),
  notes text not null default '',
  primary key (factory_id, id),
  foreign key (factory_id, supply_order_id)
    references factory.supply_orders (factory_id, id) on delete cascade
);

create index if not exists supply_order_lines_order_idx
  on factory.supply_order_lines (factory_id, supply_order_id);
create index if not exists supply_order_lines_item_idx
  on factory.supply_order_lines (factory_id, item_type, item_id);

-- ─────────────────────────────────────────────────────────────
-- 2) الاستلام — التوريد مش حركة واحدة
-- ─────────────────────────────────────────────────────────────
--    أمر بعشرة آلاف متر بيوصل على تلات شحنات، وكل شحنة ليها تاريخها
--    وورقتها ونتيجة فحصها. عشان كده الاستلام كيان بحياته، والأمر
--    بيفضل مفتوح لحد ما يخلص أو يتقفل بعجز.

create table if not exists factory.supply_receipts (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  code text not null,
  supply_order_id uuid not null,
  date date not null,
  warehouse_id uuid,
  -- رقم إذن المورّد: **ورقته مش ورقتنا**. بيتخزّن نص حر عن قصد، لأن كل
  -- مورّد بيرقّم بطريقته، وأي تحقّق هنا هيرفض ورق صحيح
  supplier_doc_no text not null default '',
  -- فاتورة المورّد في دفتر المصروفات، لو اتسجّلت. فاضي مسموح: الشحنة
  -- بتنزل قبل الفاتورة كتير
  cost_entry_id uuid,
  notes text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (factory_id, id),
  unique (factory_id, code),
  foreign key (factory_id, supply_order_id)
    references factory.supply_orders (factory_id, id) on delete cascade,
  foreign key (factory_id, warehouse_id) references factory.warehouses (factory_id, id),
  foreign key (factory_id, cost_entry_id) references factory.cost_entries (factory_id, id)
);

create index if not exists supply_receipts_order_idx
  on factory.supply_receipts (factory_id, supply_order_id, date);
create index if not exists supply_receipts_date_idx
  on factory.supply_receipts (factory_id, date desc);

-- سطر الاستلام: تفصيل الكمية.
--
-- التلات كميات اللي بتتخزّن هنا **حاضرة ومعدودة**: اتقبلت، أو اترفضت
-- بالمواصفة، أو نزلت تالفة. واللي غير كده **بيتحسب ولا يتخزّن**:
--   الواصل = مقبول + مرفوض + تالف
--   الباقي = المطلوب − الواصل، طالما الأمر مفتوح
--   العجز  = نفس الرقم، بس **بعد** ما الأمر يتقفل
--   المرتجع = في دفتر المرتجعات (`returns` بمصدر `supplier`)
--
-- والفرق بين «باقي» و«عجز» مش لعب بالكلام: الأول انتظار، والتاني خسارة
-- بقيمة وبتتحسب على المورّد في درجته. عشان كده مافيش عمود `shortage`
-- هنا: لو اتخزّن، أي أمر مفتوح كان هيبان مشكلة.

create table if not exists factory.supply_receipt_lines (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  receipt_id uuid not null,
  supply_order_line_id uuid not null,
  -- اتقبل ودخل المخزن
  qty_accepted numeric not null default 0 check (qty_accepted >= 0),
  -- وصل سليم الشكل بس مرفوض بالمواصفة
  qty_rejected numeric not null default 0 check (qty_rejected >= 0),
  -- وصل تالف — تلف نقل أو تخزين
  qty_damaged numeric not null default 0 check (qty_damaged >= 0),
  -- مكتوب في ورقة المورّد ومش موجود في الشحنة.
  --
  -- ده **مش العجز**: العجز في الأمر كله، وده تعارض في ورقة الشحنة دي
  -- بالذات — المورّد كاتب ١٠٠٠ ونزل ٩٩٠. بيتسجّل عشان المطالبة تبقى
  -- على ورقة، ومابيدخلش المخزن ولا بيتحسب واصل
  qty_missing numeric not null default 0 check (qty_missing >= 0),
  -- الدفعة اللي اتعملت للكمية المقبولة
  batch_id uuid,
  notes text not null default '',
  primary key (factory_id, id),
  foreign key (factory_id, receipt_id)
    references factory.supply_receipts (factory_id, id) on delete cascade,
  foreign key (factory_id, supply_order_line_id)
    references factory.supply_order_lines (factory_id, id),
  foreign key (factory_id, batch_id)
    references factory.material_batches (factory_id, id),

  -- سطر استلام كل كمياته أصفار سطر بلا معنى: الشحنة نزلت ومحدش سجّل
  -- إيه اللي نزل. بنمنعه عشان مايبقاش فيه «استلام» بيثبت مفيش حاجة
  constraint supply_receipt_lines_has_qty check (
    qty_accepted + qty_rejected + qty_damaged + qty_missing > 0
  ),
  -- الكمية المقبولة لازم يبقى لها دفعة.
  --
  -- ده الشرط اللي بيخلّي الاستدعاء ممكن: من غيره، طاقة قماش بتدخل
  -- المخزن بلا هوية، وبعد شهر «الخامة دي فيها مشكلة» يرجع سؤال مالوش
  -- إجابة. `not valid` تحت عشان الصفوف القديمة (لو فيه) ماتوقّفش النشر
  constraint supply_receipt_lines_accepted_has_batch check (
    qty_accepted = 0 or batch_id is not null
  )
);

create index if not exists supply_receipt_lines_receipt_idx
  on factory.supply_receipt_lines (factory_id, receipt_id);
create index if not exists supply_receipt_lines_order_line_idx
  on factory.supply_receipt_lines (factory_id, supply_order_line_id);
create index if not exists supply_receipt_lines_batch_idx
  on factory.supply_receipt_lines (factory_id, batch_id) where batch_id is not null;

-- ─────────────────────────────────────────────────────────────
-- 3) الدفعة — توسيع `material_batches` القديم
-- ─────────────────────────────────────────────────────────────
--    الجدول موجود من 0002، لكنه كان **قوقعة**: كود وتاريخ وتكلفة وحدة
--    وبس. مافيش كمية داخلة، ولا مورّد، ولا رقم لوط المورّد، ولا حالة،
--    ولا تاريخ انتهاء، ولا ربط بسطر الاستلام. فالدفعة كانت اسم مالوش
--    استخدام: مينفعش توقف دفعة، ولا تعرف جات منين، ولا تعرف فاضل منها
--    كام.
--
--    والرصيد **مش عمود هنا** ومش هيبقى: بيتحسب من حركات المخزن اللي
--    عليها `batch_id`، زي أي رصيد تاني في النظام. عمود رصيد معناه رقمين
--    للحقيقة، وواحد فيهم هيغلط.

alter table factory.material_batches
  -- الدفعة بقت تنفع للمنتج التام كمان، مش للخامة بس. والافتراضي
  -- `material` عشان كل صف قديم يفضل صح من غير تحديث
  add column if not exists item_type text not null default 'material'
    check (item_type in ('material', 'product')),
  add column if not exists product_id uuid,
  -- المورّد اللي جابها. فاضي مسموح: دفعة رصيد افتتاحي أو تصنيع داخلي
  add column if not exists party_id uuid,
  -- سطر الاستلام اللي عملها. فاضي = دفعة اتسجّلت بالإيد
  add column if not exists receipt_line_id uuid,
  -- الكمية اللي دخلت: **قياس وقت الاستلام** فبيتخزّن. وده مش الرصيد —
  -- الرصيد بيتحسب من الحركات. ده اللي نزل من العربية يوم كذا
  add column if not exists qty_in numeric not null default 0 check (qty_in >= 0),
  -- رقم اللوط المكتوب على الرول من المورّد: **ورقه مش ورقنا**، فنص حر
  add column if not exists supplier_lot text not null default '',
  -- للخامات اللي بتنتهي: غرا، دهان، صبغة. فاضي للقماش
  add column if not exists expiry_date date,
  -- `hold` موقوفة للفحص، `recalled` متستدعاة، `blocked` موقوفة نهائي.
  -- التلاتة بيمنعوا الصرف في التطبيق (`issuableBatches`)، والفرق بينهم
  -- إن كل واحد بيحكي قصة مختلفة في المراجعة
  add column if not exists status text not null default 'active'
    check (status in ('active', 'hold', 'recalled', 'blocked'));

-- المفاتيح بتتضاف في بلوك عشان `add constraint` مالهاش `if not exists`
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'material_batches_party_fk'
  ) then
    alter table factory.material_batches
      add constraint material_batches_party_fk
      foreign key (factory_id, party_id) references factory.parties (factory_id, id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'material_batches_product_fk'
  ) then
    alter table factory.material_batches
      add constraint material_batches_product_fk
      foreign key (factory_id, product_id) references factory.products (factory_id, id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'material_batches_item_shape'
  ) then
    -- الشكل الصح لكل نوع: دفعة خامة ليها خامة، ودفعة منتج ليها منتج.
    -- `not valid` عشان الصفوف القديمة ماتمنعش النشر
    alter table factory.material_batches
      add constraint material_batches_item_shape check (
        (item_type = 'material' and material_id is not null and product_id is null)
        or (item_type = 'product' and product_id is not null and material_id is null)
      ) not valid;
  end if;
end $$;

-- دفعة المنتج التام مالهاش `material_id`، فالعمود لازم يقبل فاضي.
--
-- ده **أوسع تغيير في الملف** وبيتكتب بصراحة: أي كود قديم بيقرا
-- `material_id` على إنه مضمون هيلاقي فاضي في دفعات المنتج. الكود
-- الحالي بيقرا من `item_type` الأول، لكن أي تقرير خارجي قديم محتاج
-- يتراجع. البديل كان جدول دفعات تاني للمنتج — ودفترين للدفعة معناه
-- إن الاستدعاء يدور في الاتنين وينسى واحد.
alter table factory.material_batches
  alter column material_id drop not null;

-- الكود كان فريد لكل (مصنع، خامة). مع دفعات المنتج ده مايكفيش، وكمان
-- الكود بقى تسلسل عام (`LOT-2026-000005`) فالفريد الصح على المصنع
create unique index if not exists material_batches_code_key
  on factory.material_batches (factory_id, code);

create index if not exists material_batches_item_idx
  on factory.material_batches (factory_id, item_type, coalesce(material_id, product_id));
create index if not exists material_batches_party_idx
  on factory.material_batches (factory_id, party_id) where party_id is not null;
-- الدفعات اللي لازم حد يبص عليها: موقوفة أو قربت تنتهي
create index if not exists material_batches_watch_idx
  on factory.material_batches (factory_id, status, expiry_date)
  where status <> 'active' or expiry_date is not null;

-- ─────────────────────────────────────────────────────────────
-- 4) الاستدعاء — «المشكلة وصلت لمين؟»
-- ─────────────────────────────────────────────────────────────
--    لما دفعة تطلع فيها مشكلة، السؤال مش «إيه المشكلة» — ده متسجّل في
--    الجودة (0014). السؤال **«وصلت لمين؟»**، وإجابته سلسلة: الدفعة →
--    حركات الصرف → أوامر الإنتاج → التوريدات → العملاء → الفواتير.
--
--    ومدى الاستدعاء **مابيتخزّنش**. لا عدد أوامر، ولا عدد عملاء، ولا
--    كمية خرجت، ولا تكلفة. الأربعة بيتحسبوا من الدفتر وقت العرض
--    (`recallScope`)، لأن أول مرتجع جديد بيخلي أي رقم مخزّن قديم —
--    والاستدعاء برقم قديم أسوأ من مفيش استدعاء.
--
--    واللي **بيرجع** فعلًا بيتسجّل في دفتر المرتجعات بـ`recall_id`، مش
--    في جدول جديد، عشان تكلفة الرجوع تمشي في نفس حسابات المرتجعات.

create table if not exists factory.recalls (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  code text not null,
  -- الدفعات المتأثرة. مصفوفة عن قصد: مشكلة واحدة عند مورّد بتطلع في
  -- أكتر من دفعة، والاستدعاء اللي بيغطي واحدة بس بيسيب الباقي بره
  batch_ids uuid[] not null default '{}',
  date date not null,
  severity text not null check (severity in ('low', 'high', 'critical')),
  status text not null default 'open' check (status in (
    'open', 'contained', 'closed', 'cancelled'
  )),
  reason text not null,
  -- الإجراء المتخذ: وقف صرف، إبلاغ عملاء، سحب من السوق…
  action text not null default '',
  cancel_reason text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (factory_id, id),
  unique (factory_id, code),
  -- الاستدعاء بلا سبب مكتوب مش استدعاء. السبب هو اللي بيتقرا بعد سنة
  constraint recalls_has_reason check (length(trim(reason)) > 0),
  constraint recalls_has_batches check (array_length(batch_ids, 1) > 0),
  constraint recalls_cancel_has_reason check (
    status <> 'cancelled' or coalesce(cancel_reason, '') <> ''
  )
);

create index if not exists recalls_open_idx
  on factory.recalls (factory_id, date desc) where status in ('open', 'contained');
create index if not exists recalls_batches_idx
  on factory.recalls using gin (batch_ids);

-- ربط المرتجع بالاستدعاء
alter table factory.returns
  add column if not exists recall_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'returns_recall_fk'
  ) then
    alter table factory.returns
      add constraint returns_recall_fk
      foreign key (factory_id, recall_id) references factory.recalls (factory_id, id);
  end if;
end $$;

create index if not exists returns_recall_idx
  on factory.returns (factory_id, recall_id) where recall_id is not null;

-- ─────────────────────────────────────────────────────────────
-- 5) التوريد للعميل بيعرف أمره
-- ─────────────────────────────────────────────────────────────
--    `deliveries` كان بيربط بالعميل بس، فسلسلة الاستدعاء كانت بتوصل
--    لأمر الإنتاج وتقف: «الأمر ده اتسلّم لمين؟» كانت بتتخمّن بمطابقة
--    اسم الموديل وتاريخ قريب.
--
--    والتخمين في الاستدعاء تكلفته إننا **نكلّم العميل الغلط** ونسيب
--    اللي فعلًا عنده المشكلة. فالربط بقى بالمعرّف، والتوريد اللي مش
--    مربوط بأمر مابيتخمّنش — التطبيق بيقول «تقريبي» بصراحة بدل ما
--    يدّعي.
--
--    وفاضي مسموح: توريد بضاعة جاهزة من المخزن مالهوش أمر إنتاج أصلًا.

alter table factory.deliveries
  add column if not exists order_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'deliveries_order_fk'
  ) then
    alter table factory.deliveries
      add constraint deliveries_order_fk
      foreign key (factory_id, order_id) references factory.orders (factory_id, id);
  end if;
end $$;

create index if not exists deliveries_order_idx
  on factory.deliveries (factory_id, order_id) where order_id is not null;

-- ─────────────────────────────────────────────────────────────
-- 6) المتاح فعلًا — view واحد للفرق بين الموجود والمتاح
-- ─────────────────────────────────────────────────────────────
--    «عندنا ١٠٠٠٠ متر» جملة بتبيع حاجة مش موجودة. الرصيد الموجود فيه
--    محجوز لأوامر مفتوحة، وفيه موقوف في دفعات مامتاحةش للصرف.
--
--    والview دي **مشتقّة بالكامل**، مفيش عمود منها بيتخزّن في أي جدول.
--    وموجودة هنا عشان التقارير الخارجية تقرا نفس التعريف اللي التطبيق
--    بيحسبه في `availability` — تعريفين للمتاح أسوأ من واحد ناقص.

create or replace view factory.v_stock_availability as
with on_hand as (
  select factory_id, item_type, item_id, sum(qty) as on_hand
  from factory.stock_movements
  group by factory_id, item_type, item_id
),
held as (
  -- الموقوف: رصيد دفعات مش متاحة للصرف. بيتحسب من الحركات بتاعة
  -- الدفعة، مش من `qty_in`، عشان اللي اتصرف منها قبل الوقف ماينعدّش
  select
    m.factory_id,
    b.item_type,
    coalesce(b.material_id, b.product_id) as item_id,
    sum(m.qty) as held
  from factory.stock_movements m
  join factory.material_batches b
    on b.factory_id = m.factory_id and b.id = m.batch_id
  where b.status <> 'active'
     or (b.expiry_date is not null and b.expiry_date < current_date)
  group by m.factory_id, b.item_type, coalesce(b.material_id, b.product_id)
),
incoming as (
  -- الجاي: المطلوب ناقص الواصل على الأوامر المفتوحة بس
  select
    l.factory_id,
    l.item_type,
    l.item_id,
    sum(greatest(0, l.qty_ordered - coalesce(r.received, 0))) as incoming
  from factory.supply_order_lines l
  join factory.supply_orders o
    on o.factory_id = l.factory_id and o.id = l.supply_order_id
  left join lateral (
    select sum(x.qty_accepted + x.qty_rejected + x.qty_damaged) as received
    from factory.supply_receipt_lines x
    where x.factory_id = l.factory_id and x.supply_order_line_id = l.id
  ) r on true
  where o.status in ('open', 'partial')
  group by l.factory_id, l.item_type, l.item_id
)
select
  h.factory_id,
  h.item_type,
  h.item_id,
  h.on_hand,
  coalesce(d.held, 0) as held,
  coalesce(i.incoming, 0) as incoming,
  -- المحجوز لأوامر الإنتاج مش هنا: حسابه محتاج قوائم الخامات ونِسَبها
  -- وتقدّم كل أمر، وده منطق التطبيق (`orderRequirements`). الview دي
  -- بتقول الموجود والموقوف والجاي، والتطبيق بيخصم المحجوز فوقها
  h.on_hand - coalesce(d.held, 0) as unheld
from on_hand h
left join held d
  on d.factory_id = h.factory_id and d.item_type = h.item_type and d.item_id = h.item_id
left join incoming i
  on i.factory_id = h.factory_id and i.item_type = h.item_type and i.item_id = h.item_id;

-- ─────────────────────────────────────────────────────────────
-- 7) RLS — عزل المصنع
-- ─────────────────────────────────────────────────────────────
--    نفس قاعدة كل الجداول: مفيش صف بيتقرا بره مصنعه. والصلاحية
--    التفصيلية (مين ينفع يفتح أمر توريد) بتتحقق في طبقة التطبيق
--    والـRPC، وتحويل السياسات دي لتسأل `has_perm` بيتعمل في migration
--    لوحده لكل الجداول مرة واحدة — نفس الملاحظة المكتوبة في 0009
--    و0011 و0012 و0013 و0014.

alter table factory.supply_orders enable row level security;
alter table factory.supply_order_lines enable row level security;
alter table factory.supply_receipts enable row level security;
alter table factory.supply_receipt_lines enable row level security;
alter table factory.recalls enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'supply_orders', 'supply_order_lines', 'supply_receipts',
    'supply_receipt_lines', 'recalls'
  ]
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'factory' and tablename = t and policyname = t || '_rw'
    ) then
      execute format(
        'create policy %I on factory.%I for all using (factory.my_role(%I) is not null) with check (factory.my_role(%I) is not null)',
        t || '_rw', t, 'factory_id', 'factory_id'
      );
    end if;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 8) اللي مش في الملف ده عن قصد
-- ─────────────────────────────────────────────────────────────
--    * **مواقع جوه المخزن** (Warehouse → Zone → Rack → Shelf → Bin):
--      المخزن لسه وحدة واحدة. المواقع محتاجة جدول شجري بكود موقع
--      وليبل لكل موقع وحركة نقل بين موقعين — وده module لوحده،
--      ومن غيره «الخامة فين» بتوقف عند اسم المخزن.
--    * **طبقات FIFO حقيقية في التقييم**: التقييم دلوقتي متوسط مرجّح
--      للرصيد غير المتتبّع، وتكلفة دفعة للمتتبّع، والصرف بياخد أقدم
--      دفعة (`allocateFifo`). لكن مافيش جدول طبقات بيقول «الرصيد ده
--      تكلفته موزّعة كذا» — وده اللي FIFO المحاسبي بالمعنى الدقيق
--      عايزه، ومعاه إعادة تقييم عند كل حركة.
--    * **عمر المخزون والراكد** (Stock Aging / Dead Stock): البيانات
--      كلها بقت موجودة (تاريخ الدفعة وحركاتها)، فده تقرير مش schema.
--      مكتوب في الخريطة ولسه مابنيناهوش.
--    * **مطالبة المورّد كيان**: العجز والمرفوض والتالف بيتحسبوا
--      بقيمتهم، لكن «مطالبة» ليها دورة حياة (اتقدّمت → المورّد وافق →
--      خصم من فاتورة → اتقفلت) لسه مش كيان. دلوقتي بتتسجّل مرتجع
--      مورّد أو خصم في الفاتورة.
--    * **الضمان ومدّته**: الدفعة عندها `expiry_date` للخامة، لكن ضمان
--      المنتج عند العميل حاجة تانية — محتاج مدة ضمان على الموديل
--      وتاريخ بدايته على التوريد وتنبيه قرب انتهائه.
--    * **هوية الرول**: القماش لسه بيتحرّك بالمتر. الدفعة بقت موجودة،
--      لكن «الرول رقم ٣ من الدفعة دي» محتاج جدول رولات بطولها. وده
--      اللي مكتوب في `CODES_NOT_YET`.
--    * **RPC للاستلام**: الاستلام دلوقتي بيتعمل في التطبيق في ميوتيشن
--      واحدة (سطور + دفعات + حركات مخزن). على Supabase لازم يبقى
--      دالة واحدة `receive_supply` عشان الذرّية تبقى في قاعدة البيانات
--      مش في المتصفح — ده أول حاجة في ترحيل القسم ده للسيرفر.
