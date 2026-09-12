-- صنعة — Migration 0012: دفتر المسح (QR والباركود)
-- إضافية بالكامل: جدول واحد جديد، فهارس، سياسات، وview. مفيش DROP ولا
-- RENAME ولا تعديل على عمود قائم، فالنشر مايأثرش على أي بيانات موجودة.
--
-- القاعدة الحاكمة هنا: **الكود مؤشّر، مش بيانات.**
-- مفيش عمود في الملف ده بيخزّن نص الـQR كمصدر للحقيقة. الكود اللي
-- بيتطبع صيغته `SANAA://<النوع>/<المعرّف>?f=<المصنع>`، والباك إند بيحلّه
-- لـ(المصنع → النوع → المعرّف) ويقرا الباقي من جداوله. اللي بيتخزّن في
-- `scan_events.code` هو **اللي اتقرا فعلًا** — كأثر للحركة، مش كبيانات
-- بنعتمد عليها. عشان كده مفيش FK عليه: الكود ممكن يكون رابط تحقق كامل،
-- أو رقم مكتوب بإيد العامل من تيكت اتكرمش.
--
-- والقاعدة التانية: **دفتر المسح مابيتعدّلش.** المسح واقعة حصلت في وقت
-- معروف من شخص معروف. لو اتعملت بالغلط، بيتسجّل مسح تاني بالصح؛
-- والغلط يفضل في الدفتر. عشان كده السياسة `insert` و`select` بس —
-- مفيش `update` ولا `delete` حتى للمالك.

-- ─────────────────────────────────────────────────────────────
-- 1) الجدول
-- ─────────────────────────────────────────────────────────────

create table if not exists factory.scan_events (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  at timestamptz not null default now(),
  -- اللي مسح: عضو في المصنع. مابنحفظش اسمه كـFK بس كمان بنسجّله نصًا،
  -- لأن العضو ممكن يتشال من المصنع والحركة لازم تفضل مقروءة
  actor_id uuid,
  actor_name text not null default '',
  kind text not null check (kind in (
    'material', 'product', 'warehouse', 'order', 'lay', 'bundle',
    'subcontract', 'party', 'worker', 'operation', 'document'
  )),
  -- السجل اللي الكود شاور عليه. بلا FK عن قصد: النوع بيحدّد الجدول،
  -- وFK لأحد عشر جدول محتاج أحد عشر عمود يفضلوا فاضيين
  ref_id uuid not null,
  code text not null default '',
  action text not null check (action in (
    'open', 'start', 'finish', 'issue', 'receive', 'report', 'verify'
  )),
  -- إزاي جه الكود. الجهاز نفسه وموقعه **مش** متسجّلين: المتصفح
  -- مابيدّي موديل الجهاز بشكل يعتمد عليه، والموقع محتاج إذن من
  -- العامل — فبنسجّل اللي نعرفه بس
  source text not null default 'manual' check (source in ('camera', 'manual', 'link')),
  qty numeric,
  -- منين ولحد فين: مخزن، خط، ورشة. اسم مقروء وقت المسح مش FK،
  -- لأن الطرف ممكن يكون حاجة مش في جدول (محطة في الصالة مثلًا)
  from_name text not null default '',
  to_name text not null default '',
  note text not null default '',
  primary key (factory_id, id)
);

-- ─────────────────────────────────────────────────────────────
-- 2) الفهارس
-- ─────────────────────────────────────────────────────────────
--    الاستعلام الغالب سؤالين: «إيه اللي حصل على السجل ده؟» (سلسلة
--    التتبع) و«إيه اللي اتمسح النهارده؟» (الدفتر والتصدير).

create index if not exists scan_events_ref_idx
  on factory.scan_events (factory_id, kind, ref_id, at desc);

create index if not exists scan_events_at_idx
  on factory.scan_events (factory_id, at desc);

create index if not exists scan_events_actor_idx
  on factory.scan_events (factory_id, actor_id, at desc);

-- ─────────────────────────────────────────────────────────────
-- 3) آخر مسح لكل سجل
-- ─────────────────────────────────────────────────────────────
--    الشاشات بتسأل «الحاجة دي آخر مرة اتمسحت فين وإمتى؟» وده أسرع من
--    `order by at desc limit 1` لكل سطر في القايمة.

create or replace view factory.v_last_scan as
select distinct on (factory_id, kind, ref_id)
  factory_id, kind, ref_id, at, actor_name, action, from_name, to_name, qty
from factory.scan_events
order by factory_id, kind, ref_id, at desc;

-- ─────────────────────────────────────────────────────────────
-- 4) RLS — عزل المصنع، ودفتر بيتزاد عليه بس
-- ─────────────────────────────────────────────────────────────

alter table factory.scan_events enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'scan_events' and policyname = 'scan_events_read') then
    create policy scan_events_read on factory.scan_events
      for select using (factory.my_role(factory_id) is not null);
  end if;

  -- إضافة بس. مفيش policy لـupdate ولا delete، فالدفتر مابيتغيّرش من
  -- التطبيق أصلًا — مش محتاجين نعتمد على الواجهة إنها ماتطلبش
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'scan_events' and policyname = 'scan_events_insert') then
    create policy scan_events_insert on factory.scan_events
      for insert with check (factory.my_role(factory_id) is not null);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 5) اللي مش في الملف ده عن قصد
-- ─────────────────────────────────────────────────────────────
--    * **جدول أكواد** فيه سطر لكل كود مطبوع: مش محتاجينه. الكود بيتبني
--      من (النوع + المعرّف + المصنع) وقت الطباعة، وبيتحلّ بنفس المعادلة
--      وقت المسح. جدول تاني معناه حالة تانية تسيب مع الوقت.
--    * **رول القماش واللوط والكرتونة والبالتة والرف والماكينة**: كلهم
--      أنواع طلبها المصنع فعلًا، ومافيش واحد فيهم كيان في الدفتر لسه.
--      الكود لازم يفتح سجل، فالنوع بيتضاف لـ`kind` بعد ما جدوله يتبني
--      — والإضافة دي سطر واحد في الـcheck.
--    * **الجهاز والموقع الجغرافي** على الحركة: مكتوب فوق ليه.
--      `source` هو اللي نعرفه بصدق.
--    * **صلاحية «مسح» منفصلة**: المسح مش قسم، هو **طريق** لسجل. فالتحقق
--      بيحصل على صلاحية القسم اللي السجل تحته (الباندل تحت الإنتاج،
--      الخامة تحت المخزن، المستند تحت التقارير) — زي ما الشاشة بتعمل
--      بالضبط في `KIND_MODULE`.
--    * تحويل الـpolicy دي لتسأل `has_perm` بدل العضويّة: نفس الملاحظة
--      المكتوبة في آخر 0009 و0011 — بيتعمل في migration لوحده.
