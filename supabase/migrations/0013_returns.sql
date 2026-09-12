-- صنعة — Migration 0013: المرتجعات والشكاوى
-- إضافية بالكامل: جدولين جديدين، فهارس، سياسات، وview. مفيش DROP ولا
-- RENAME ولا تعديل على عمود قائم، فالنشر مايأثرش على أي بيانات موجودة.
--
-- والقاعدة الحاكمة هنا: **الأثر بيتحرك وقت القرار، مش وقت الوصول.**
-- المرتجع بيمشي على تلات حالات — `open` وصل، `inspected` اتفحص،
-- `settled` اتسوّى — والفلوس والمخزون مابيتغيروش غير في التالتة. السبب
-- إن أثر المرتجع مايتحددش قبل ما حد يبصّ على القطعة: نفس الكمية لو
-- رجعت سليمة تدخل المخزن، ولو رجعت تالفة تبقى خسارة. ولو سجّلنا الأثر
-- وقت الوصول، كل مرتجع كان هيدخل المخزون غلط ويطلع منه بعدين.
--
-- والتفرقة التانية المهمة: **مين رجّع** (`source`) سؤال مختلف عن **رجع
-- بأي حال** (`condition`). فعشان كده «مرتجع تالف» مش نوع رابع جنب
-- العميل والمورّد — هو حالة بتقع على أي واحد منهم. لو عملناه نوع
-- مستقل، المرتجع اللي جه من عميل وهو تالف مكانش هيلاقي خانة.

-- ─────────────────────────────────────────────────────────────
-- 1) المرتجعات
-- ─────────────────────────────────────────────────────────────

create table if not exists factory.returns (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  code text not null,
  source text not null check (source in ('customer', 'supplier', 'production')),
  date date not null,
  -- العميل أو المورّد. فاضي في رجوع الخط للمخزن، لأن مافيش طرف تاني
  party_id uuid,
  item_type text not null check (item_type in ('product', 'material')),
  item_id uuid not null,
  qty numeric not null check (qty > 0),
  condition text not null default 'defective' check (condition in ('good', 'defective')),
  -- السبب من قايمة مقفولة، مش نص حر. «تحليل أكثر الموديلات إرجاعًا»
  -- مالوش أي معنى لو السبب مكتوب بخمس صيغ مختلفة — والتفاصيل بتتكتب
  -- في `reason_note` جنبه فمحدش بيخسر معلومة
  reason text not null check (reason in (
    'quality', 'wrong_item', 'wrong_size', 'wrong_color', 'shortage',
    'excess', 'damaged_transit', 'late', 'spec_mismatch', 'changed_mind',
    'leftover', 'other'
  )),
  reason_note text not null default '',
  -- الربط: كل واحد بيجاوب سؤال مختلف عن مصدر المشكلة
  delivery_id uuid,
  order_id uuid,
  bundle_id uuid,
  cost_entry_id uuid,
  issue_id uuid,
  status text not null default 'open' check (status in ('open', 'inspected', 'settled', 'cancelled')),
  resolution text check (resolution in ('replacement', 'credit', 'refund', 'repair', 'scrap', 'reject')),
  -- قيمة القطعة المتفق عليها وقت المرتجع. بتتخزّن لأنها **قرار** مش
  -- حساب: السعر بيتغير بعد كده، والمرتجع لازم يفضل بقيمته وقتها —
  -- نفس منطق `rate` في `bundle_ops` و`subcontracts`
  unit_value numeric not null default 0,
  settle_amount numeric not null default 0,
  account_id uuid,
  method text check (method in ('cash', 'bank', 'instapay', 'wallet', 'cheque')),
  extra_cost numeric not null default 0,
  extra_note text not null default '',
  restock boolean not null default false,
  warehouse_id uuid,
  replacement_qty numeric not null default 0,
  inspected_at timestamptz,
  inspected_by uuid,
  settled_at timestamptz,
  settled_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text,
  created_at timestamptz not null default now(),
  created_by uuid,
  notes text not null default '',
  primary key (factory_id, id),
  unique (factory_id, code),

  -- القرار لازم يكون موجود لما الحالة تبقى `settled`، ومايكونش موجود
  -- قبل كده. الشرط ده هو اللي بيمنع مرتجع «متسوّى» بدون قرار — وهو
  -- السطر اللي بيخلّي حساب الأثر يقدر يعتمد على الحالة
  constraint returns_settled_has_resolution check (
    (status = 'settled') = (resolution is not null)
  ),
  -- الرد النقدي لازم يطلع من خزنة معروفة بطريقة معروفة
  constraint returns_refund_needs_account check (
    resolution is distinct from 'refund' or (account_id is not null and method is not null)
  ),
  -- التالف مايرجعش المخزون. ده الفرق بين مخزون بيتصرّف فعلًا ومخزون
  -- على الورق: لو سمحنا بيها، الرصيد هيقول إن فيه قطع للبيع وهي تالفة
  -- في الرف
  constraint returns_defective_no_restock check (
    not (restock and condition = 'defective')
  ),
  constraint returns_cancel_has_reason check (
    status <> 'cancelled' or coalesce(cancel_reason, '') <> ''
  )
);

create index if not exists returns_date_idx on factory.returns (factory_id, date desc);
create index if not exists returns_party_idx on factory.returns (factory_id, party_id, date desc);
create index if not exists returns_item_idx on factory.returns (factory_id, item_type, item_id, date desc);
create index if not exists returns_status_idx on factory.returns (factory_id, status) where status <> 'settled';
create index if not exists returns_delivery_idx on factory.returns (factory_id, delivery_id);
create index if not exists returns_entry_idx on factory.returns (factory_id, cost_entry_id);

-- ─────────────────────────────────────────────────────────────
-- 2) الشكاوى
-- ─────────────────────────────────────────────────────────────
--    منفصلة عن المرتجع لأن **مش كل شكوى معاها قطعة راجعة**: التأخير
--    والفاتورة والتعامل شكاوى بدون كمية، وهي بالظبط اللي بتسبق فقدان
--    العميل. ولو حبسناها جوه المرتجع، النوع ده كله كان هيضيع.

create table if not exists factory.complaints (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  code text not null,
  party_id uuid not null,
  date date not null,
  kind text not null check (kind in ('quality', 'delay', 'shortage', 'price', 'service', 'other')),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  subject text not null,
  detail text not null default '',
  delivery_id uuid,
  order_id uuid,
  -- علاقة مش دمج: لو الشكوى طلع منها مرتجع، ده بيربطهم
  return_id uuid,
  owner_id uuid,
  due_date date,
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'closed')),
  claim_amount numeric not null default 0,
  resolution text not null default '',
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (factory_id, id),
  unique (factory_id, code),

  -- الشكوى مابتتقفلش بدون سطر بيقول اتعمل إيه. ده اللي بيخلّي الشكوى
  -- القديمة تفيد لما تتكرر، بدل «تم الحل» اللي مابيعلّمش حد حاجة
  constraint complaints_closed_has_resolution check (
    status not in ('resolved', 'closed') or resolution <> ''
  )
);

create index if not exists complaints_party_idx on factory.complaints (factory_id, party_id, date desc);
create index if not exists complaints_open_idx on factory.complaints (factory_id, status) where status in ('open', 'investigating');
create index if not exists complaints_due_idx on factory.complaints (factory_id, due_date) where due_date is not null;

-- ─────────────────────────────────────────────────────────────
-- 3) إشعارات الخصم — مصدر واحد للأثر المالي
-- ─────────────────────────────────────────────────────────────
--    إشعار الخصم للعميل بيتعامل زي التحصيل بالظبط في حساب المديونية:
--    بيقلّل المطلوب منه بدون ما فلوس تتحرك. والرد النقدي فلوس بتطلع من
--    خزنة. والاتنين بيتقراوا من الview دي بس، فمافيش مبلغ يتعدّ مرتين.

create or replace view factory.v_return_credits as
select
  factory_id,
  id as return_id,
  code,
  source,
  party_id,
  coalesce(settled_at::date, date) as date,
  resolution,
  settle_amount,
  account_id
from factory.returns
where status = 'settled'
  and resolution in ('credit', 'refund')
  and settle_amount > 0
  and party_id is not null;

-- ─────────────────────────────────────────────────────────────
-- 4) RLS — عزل المصنع
-- ─────────────────────────────────────────────────────────────
--    والمرتجع بياخد صلاحية **الطرف اللي جه منه**، مش صلاحية واحدة
--    اسمها «مرتجعات»: مرتجع العميل شغل مبيعات، ومرتجع المورّد شغل
--    مشتريات، ورجوع الخامة من الخط شغل مخازن. فاللي معاه المخزن
--    مايقدرش يعمل إشعار خصم لعميل — زي ما `RETURN_MODULE` بتعمل
--    بالضبط في التطبيق.

alter table factory.returns enable row level security;
alter table factory.complaints enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'returns' and policyname = 'returns_rw') then
    create policy returns_rw on factory.returns
      for all using (factory.my_role(factory_id) is not null)
      with check (factory.my_role(factory_id) is not null);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'complaints' and policyname = 'complaints_rw') then
    create policy complaints_rw on factory.complaints
      for all using (factory.my_role(factory_id) is not null)
      with check (factory.my_role(factory_id) is not null);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 5) اللي مش في الملف ده عن قصد
-- ─────────────────────────────────────────────────────────────
--    * **مسح المرتجع المتسوّى**: مافيش. فلوسه اتحركت ومخزونه اتغيّر،
--      والمسح كان هيسيب حركة مخزون ورصيد عميل بدون سند. اللي بيتعمل في
--      الحالة دي مرتجع مضاد — والتطبيق بيقولها بالصريح.
--    * **أسطر متعددة في المرتجع الواحد**: المرتجع سطر واحد بصنف واحد،
--      زي `deliveries` بالظبط. لو المرتجع فيه تلات موديلات، بيبقى تلات
--      سطور بنفس التاريخ والتوريد — والتحليل بالموديل بيشتغل لوحده
--      ساعتها. جدول أسطر كان هيزوّد جدول ومايزوّدش معلومة.
--    * **أمر إنتاج تلقائي للبديل**: `replacement_qty` بيسجّل الالتزام،
--      بس مافيش أمر بيتفتح لوحده. لأن البديل محتاج قرار تخطيط (أي خط،
--      أي ميعاد، مع أي أمر) والنظام مايعرفهوش.
--    * **حالة «مرفوض» منفصلة**: الرفض قرار (`resolution = 'reject'`)
--      مش حالة. المرتجع وصل واتفحص فعلًا، واللي اتقرر إنه مايستحقش
--      خصم — فحالته `settled` وأثره صفر.
--    * **تتبع الرول للهالك**: طبقة الاستنتاجات بتحمّل الهالك على مورّد
--      واحد بس لما يكون هو الوحيد اللي بيورد الخامة. تحميل أدق من كده
--      محتاج هوية للرول — وهي مش موجودة لسه (مكتوبة في آخر 0012).
--    * تحويل الـpolicy دي لتسأل `has_perm` بدل العضويّة: نفس الملاحظة
--      المكتوبة في آخر 0009 و0011 و0012 — بيتعمل في migration لوحده.
