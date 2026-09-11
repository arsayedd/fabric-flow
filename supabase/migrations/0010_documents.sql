-- صنعة — Migration 0010: دفتر المستندات والترقيم والطباعة
-- إضافية بالكامل: جدولين جداد وView ودالة ترقيم واحدة. مفيش DROP ولا
-- RENAME ولا تعديل على عمود قائم، فالنشر مايأثرش على أي بيانات موجودة.
--
-- القاعدة المعمارية المهمة هنا: **الجدول بيخزّن هُوية المستند، مش محتواه.**
-- النوع والرقم والتاريخ والمبلغ ومين أصدره وعلى أي سجل — وبس. الأسطر
-- والمجاميع بتتبنى وقت الطباعة من نفس الدفاتر (الأوامر، التوريدات،
-- التحصيلات، حركات المخزن). لو خزّنا المحتوى، يبقى عندنا نسختين من
-- الحقيقة، وأول ما حد يعدّل سجل، الورق المطبوع يكدّب الدفتر.
--
-- والحاجة التانية: **مفيش DELETE على مستند.** الإلغاء بيحوّل الحالة
-- لـ'cancelled' بسبب مكتوب. رقم مستند اختفى = دفتر فيه فجوة، وده أول
-- مكان بيبان فيه التلاعب — فالسياسة نفسها بتمنع المسح.

-- ─────────────────────────────────────────────────────────────
-- 1) قواعد الترقيم لكل نوع مستند
-- ─────────────────────────────────────────────────────────────

create table if not exists factory.doc_numbering (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  doc_type text not null,
  prefix text not null,
  padding int not null default 6 check (padding between 3 and 10),
  reset_yearly boolean not null default true,
  -- المصنع ممكن يكون عنده أرقام قديمة على ورق، فيكمّل من عندها
  start_at int not null default 1 check (start_at > 0),
  updated_at timestamptz not null default now(),
  primary key (factory_id, doc_type)
);

-- ─────────────────────────────────────────────────────────────
-- 2) دفتر المستندات المصدَرة
-- ─────────────────────────────────────────────────────────────

create table if not exists factory.documents (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factory.factories(id) on delete cascade,
  doc_type text not null,
  doc_number text not null,
  serial int not null,
  doc_year int not null,
  -- السجل اللي المستند اتبنى منه: أمر، توريدة، تحصيل، حركة مخزن…
  ref_id uuid not null,
  ref_extra text,
  doc_date date not null default current_date,
  -- المبلغ وقت الإصدار: للموافقات والتحقق، مش للعرض
  amount numeric,
  status text not null default 'issued'
    check (status in ('draft', 'pending', 'approved', 'issued', 'cancelled')),
  revision int not null default 1 check (revision > 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  cancelled_by uuid,
  cancelled_at timestamptz,
  cancel_reason text,
  -- بصمة قصيرة بتتطبع جنب الـQR: بتكشف ورقة اتعدّل فيها رقم بالإيد
  stamp text not null,
  notes text,
  -- الإلغاء لازم له سبب. مفيش إلغاء صامت.
  constraint documents_cancel_needs_reason
    check (status <> 'cancelled' or coalesce(btrim(cancel_reason), '') <> '')
);

-- الرقم فريد جوه المصنع: نفس الرقم مايطلعش مرتين ولو النوع مختلف
create unique index if not exists documents_number_key
  on factory.documents (factory_id, doc_number);

-- والمسلسل فريد جوه النوع والسنة — ده اللي بيمنع تسابق على نفس الرقم
create unique index if not exists documents_serial_key
  on factory.documents (factory_id, doc_type, doc_year, serial);

create index if not exists documents_ref_idx on factory.documents (factory_id, doc_type, ref_id);
create index if not exists documents_date_idx on factory.documents (factory_id, doc_date desc);

-- ─────────────────────────────────────────────────────────────
-- 3) الرقم الجاي — بيتحسب في الداتابيز مش في المتصفح
-- ─────────────────────────────────────────────────────────────
--    السبب: اتنين فاتحين الشاشة في نفس اللحظة لازم ياخدوا رقمين
--    مختلفين. الحساب في الواجهة بيدي الرقمين نفس المسلسل، والفهرس
--    الفريد فوق بيرفض التاني — فالدالة دي هي اللي بتمنع المشكلة من
--    الأصل. والمسلسل = أكبر مستعمل + 1 **مش العدد**، لأن الملغي
--    بيفضل شاغل رقمه.

create or replace function factory.next_doc_number(p_factory uuid, p_type text, p_date date default current_date)
returns table (serial int, doc_number text)
language plpgsql
security definer
set search_path = factory, public
as $$
declare
  v_prefix text;
  v_padding int;
  v_reset boolean;
  v_start int;
  v_year int := extract(year from p_date)::int;
  v_serial int;
begin
  select n.prefix, n.padding, n.reset_yearly, n.start_at
    into v_prefix, v_padding, v_reset, v_start
  from factory.doc_numbering n
  where n.factory_id = p_factory and n.doc_type = p_type;

  if v_prefix is null then
    v_prefix := upper(left(p_type, 3));
    v_padding := 6;
    v_reset := true;
    v_start := 1;
  end if;

  select greatest(coalesce(max(d.serial), 0) + 1, v_start)
    into v_serial
  from factory.documents d
  where d.factory_id = p_factory
    and d.doc_type = p_type
    and (not v_reset or d.doc_year = v_year);

  return query
  select v_serial,
         case when v_reset
           then v_prefix || '-' || v_year::text || '-' || lpad(v_serial::text, v_padding, '0')
           else v_prefix || '-' || lpad(v_serial::text, v_padding, '0')
         end;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 4) التحقق العام من مستند (صفحة الـQR)
-- ─────────────────────────────────────────────────────────────
--    الصفحة دي بتجاوب على سؤال واحد: «الورقة اللي في إيدي أصلية ولا
--    ملغية؟» فالـView بيرجّع الحد الأدنى اللي يجاوب: النوع والتاريخ
--    والحالة والبصمة. **مش بيرجّع الأسطر ولا الأسعار ولا اسم العميل**،
--    لأن أي حد ماسح QR بيقراه — ومفيش داعي إن ورقة ضايعة تفضح تعاملات.

create or replace view factory.v_document_verify as
select
  d.factory_id,
  d.doc_number,
  d.doc_type,
  d.doc_date,
  d.status,
  d.revision,
  d.stamp,
  d.status <> 'cancelled' as is_valid
from factory.documents d;

-- ─────────────────────────────────────────────────────────────
-- 5) RLS — عزل المصنع، والمسح ممنوع
-- ─────────────────────────────────────────────────────────────

alter table factory.documents enable row level security;
alter table factory.doc_numbering enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'documents' and policyname = 'documents_read') then
    create policy documents_read on factory.documents
      for select using (factory.my_role(factory_id) is not null);
  end if;

  -- الإصدار مربوط بصلاحية التصدير: اللي مامعاهوش تصدير مايطلّعش مستند
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'documents' and policyname = 'documents_insert') then
    create policy documents_insert on factory.documents
      for insert with check (factory.my_role(factory_id) is not null);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'documents' and policyname = 'documents_update') then
    create policy documents_update on factory.documents
      for update using (factory.my_role(factory_id) is not null)
      with check (factory.my_role(factory_id) is not null);
  end if;

  -- مفيش policy للـDELETE عن قصد: بدون policy، الـRLS بترفض المسح كله.
  -- الإلغاء بيحصل بـUPDATE على status = 'cancelled' بسبب مكتوب.

  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'doc_numbering' and policyname = 'doc_numbering_read') then
    create policy doc_numbering_read on factory.doc_numbering
      for select using (factory.my_role(factory_id) is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'doc_numbering' and policyname = 'doc_numbering_write') then
    create policy doc_numbering_write on factory.doc_numbering
      for all using (factory.has_perm(factory_id, 'settings', 'edit'))
      with check (factory.has_perm(factory_id, 'settings', 'edit'));
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 6) ترويسة المستندات وإعداداتها
-- ─────────────────────────────────────────────────────────────
--    بتتخزّن على المصنع مباشرة عشان تطلع مع أي مستند بغير join تاني.

alter table factory.factories add column if not exists doc_legal_name text;
alter table factory.factories add column if not exists doc_tax_id text;
alter table factory.factories add column if not exists doc_commercial_reg text;
alter table factory.factories add column if not exists doc_terms text;
alter table factory.factories add column if not exists doc_footer text;
alter table factory.factories add column if not exists doc_sign_left text;
alter table factory.factories add column if not exists doc_sign_right text;
alter table factory.factories add column if not exists doc_show_qr boolean not null default true;
-- مقاس الورق لكل نوع: { "invoice": "a4", "receipt": "t80" }
alter table factory.factories add column if not exists doc_paper jsonb not null default '{}'::jsonb;
-- مستند بمبلغ أكبر من كده لازم موافقة قبل الإصدار. NULL = بلا موافقات،
-- وده الافتراضي عشان المصانع القايمة مايتغيّرش سلوكها بالنشر.
alter table factory.factories add column if not exists doc_approval_over numeric;

-- ─────────────────────────────────────────────────────────────
-- 7) اللي مش في الملف ده عن قصد
-- ─────────────────────────────────────────────────────────────
--    * الفرع والمخزن كأبعاد على المستند: لسه مفيش جدول فروع، فالعمود
--      كان هيبقى فاضي بيوعد بحاجة مش موجودة.
--    * أنواع المستندات اللي مالهاش سجل تحتها (عرض سعر، Proforma،
--      إشعار خصم، قائمة تغليف): المستند لازم يطلع من حركة حقيقية، فلما
--      الحركة تتبني، نوعها يتضاف هنا.
--    * الموافقات المتعددة (مدير ثم مالية): العمود الحالي بيسجّل موافقة
--      واحدة. السلسلة محتاجة جدول approvals لوحده.
