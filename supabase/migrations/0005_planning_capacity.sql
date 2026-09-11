-- صنعة — Migration 0005: التخطيط والطاقة (M3)
-- إضافية بالكامل: أعمدة على factory_settings + Views للقراءة.
-- مفيش DROP ولا RENAME، ومفيش تعديل على بيانات قائمة.
--
-- مبدأ الموديول: **مفيش جدول إنتاج بيتخزَّن**. الجدول بيتحسب من أوامر الإنتاج
-- ومراحلها وقت العرض، فأي حركة إنتاج بتعيد الجدولة لوحدها.
-- اللي بيتخزّن هو **قرار الطاقة** بس: ساعات اليوم، أيام الأسبوع، نسبة الاستغلال،
-- وعدد العمالة المعتمد — لأنها قرارات إدارية مش نتيجة حساب.

-- ─────────────────────────────────────────────────────────────
-- 1) قرار الطاقة
-- ─────────────────────────────────────────────────────────────

alter table factory.factory_settings
  add column if not exists work_hours_per_day numeric not null default 8,
  add column if not exists work_days_per_week smallint not null default 6,
  add column if not exists utilization_pct numeric not null default 85,
  -- null معناها: اعتمد عدد العمال المسجّلين
  add column if not exists crew_size integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'factory_settings_capacity_sane') then
    alter table factory.factory_settings add constraint factory_settings_capacity_sane
      check (
        work_hours_per_day > 0 and work_hours_per_day <= 24
        and work_days_per_week between 1 and 7
        and utilization_pct > 0 and utilization_pct <= 100
        and (crew_size is null or crew_size > 0)
      );
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 2) Views للقراءة: نفس الأرقام اللي الواجهة بتحسبها محليًا
-- ─────────────────────────────────────────────────────────────

-- الدقايق الباقية في كل أمر مفتوح، لكل عملية على حدة:
-- (كمية الأمر − اللي خلص في العملية) × الزمن المعياري.
-- العمليات الخارجية مفصولة لأنها مش بتاخد من طاقة المصنع.
create or replace view factory.v_order_operation_load as
select
  o.factory_id,
  o.id as order_id,
  o.code,
  o.line,
  o.due_date,
  o.status,
  r.operation_id,
  r.seq,
  op.name as operation_name,
  op.is_outsourced,
  r.std_minutes,
  greatest(0, o.quantity - coalesce(se.good, 0)) as pieces_left,
  greatest(0, o.quantity - coalesce(se.good, 0)) * r.std_minutes as minutes_left
from factory.orders o
join factory.routing_steps r
  on r.factory_id = o.factory_id and r.product_id = o.product_id
join factory.operations op
  on op.factory_id = r.factory_id and op.id = r.operation_id
left join (
  select factory_id, order_id, operation_id, sum(qty_good) as good
  from factory.production_stage_entries
  group by factory_id, order_id, operation_id
) se
  on se.factory_id = o.factory_id and se.order_id = o.id and se.operation_id = r.operation_id
where o.status in ('running', 'late');

-- حمل كل أمر مفتوح: الدقايق الداخلية الباقية والخارجية، جاهزة للجدولة بالأولوية.
create or replace view factory.v_order_load as
select
  factory_id,
  order_id,
  code,
  line,
  due_date,
  sum(case when is_outsourced then 0 else minutes_left end) as internal_minutes,
  sum(case when is_outsourced then minutes_left else 0 end) as outsourced_minutes,
  max(pieces_left) as pieces_left
from factory.v_order_operation_load
group by factory_id, order_id, code, line, due_date;

-- احتياج الخامات عبر كل الأوامر المفتوحة مقابل الرصيد الحالي (أساس MRP).
create or replace view factory.v_material_requirements as
with need as (
  select
    o.factory_id,
    bi.material_id,
    sum(bi.qty_per_unit * (1 + bi.waste_pct / 100.0) * o.quantity) as gross_required,
    min(o.due_date) as first_due
  from factory.orders o
  join factory.boms b
    on b.factory_id = o.factory_id
   and b.product_id = o.product_id
   and b.status = 'active'
  join factory.bom_items bi
    on bi.factory_id = b.factory_id and bi.bom_id = b.id
  where o.status in ('running', 'late')
  group by o.factory_id, bi.material_id
),
issued as (
  select factory_id, item_id as material_id, sum(abs(qty)) as issued
  from factory.stock_movements
  where item_type = 'material' and kind in ('issue', 'waste') and ref_type = 'order'
  group by factory_id, item_id
),
on_hand as (
  select factory_id, item_id as material_id, sum(qty) as qty
  from factory.stock_movements
  where item_type = 'material'
  group by factory_id, item_id
)
select
  n.factory_id,
  n.material_id,
  m.name,
  n.first_due,
  m.lead_time_days,
  greatest(0, n.gross_required - coalesce(i.issued, 0)) as required,
  coalesce(h.qty, 0) as on_hand,
  greatest(0, greatest(0, n.gross_required - coalesce(i.issued, 0)) - coalesce(h.qty, 0)) as shortage
from need n
join factory.materials m on m.factory_id = n.factory_id and m.id = n.material_id
left join issued i on i.factory_id = n.factory_id and i.material_id = n.material_id
left join on_hand h on h.factory_id = n.factory_id and h.material_id = n.material_id;
