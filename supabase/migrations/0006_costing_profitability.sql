-- صنعة — Migration 0006: التكلفة والربحية (M-C1)
-- إضافية بالكامل: عمود واحد على factory_settings + Views للقراءة.
-- مفيش DROP ولا RENAME، ومفيش تعديل على بيانات قائمة.
--
-- مبدأ الموديول: **مفيش تكلفة بتتخزَّن**. تكلفة الموديل بتتحسب من قائمة الخامات
-- ومسار العمليات وأسعار الخامات الحالية وقت العرض، فأي تغيير في سعر خامة أو
-- مصنعية بيحدّث تكلفة كل الموديلات المتأثرة في نفس اللحظة.
-- اللي بيتخزّن قرارات بس: سعر البيع (على المنتج)، وهامش الهدف (هنا).

-- ─────────────────────────────────────────────────────────────
-- 1) هامش الربح المستهدف
-- ─────────────────────────────────────────────────────────────

alter table factory.factory_settings
  add column if not exists target_margin_pct numeric not null default 40;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'factory_settings_target_margin_range') then
    alter table factory.factory_settings add constraint factory_settings_target_margin_range
      check (target_margin_pct > 0 and target_margin_pct < 100);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 2) Views للقراءة: نفس الأرقام اللي الواجهة بتحسبها محليًا
-- ─────────────────────────────────────────────────────────────

-- بنود تكلفة الخامات للقطعة الواحدة، مجمّعة بفئة الخامة:
-- التكلفة الأساسية والهالك المخطط مفصولين عشان يبانوا كسطرين في الورقة.
create or replace view factory.v_product_material_cost as
select
  b.factory_id,
  b.product_id,
  coalesce(c.name, 'بدون فئة') as category,
  sum(bi.qty_per_unit * m.avg_cost) as base_cost,
  sum(bi.qty_per_unit * (bi.waste_pct / 100.0) * m.avg_cost) as waste_cost,
  sum(bi.qty_per_unit * (1 + bi.waste_pct / 100.0) * m.avg_cost) as total_cost
from factory.boms b
join factory.bom_items bi on bi.factory_id = b.factory_id and bi.bom_id = b.id
join factory.materials m on m.factory_id = bi.factory_id and m.id = bi.material_id
left join factory.categories c on c.factory_id = m.factory_id and c.id = m.category_id
where b.status = 'active'
group by b.factory_id, b.product_id, coalesce(c.name, 'بدون فئة');

-- ورقة تكلفة القطعة: خامات + هالك + مصنعية + تشغيل خارجي + أوفرهيد،
-- ومعاها الهامش والـMarkup وسعر التعادل وأقل سعر مقبول وتكلفة الهدف.
create or replace view factory.v_product_costing as
with mat as (
  select factory_id, product_id, sum(base_cost) as materials, sum(waste_cost) as waste
  from factory.v_product_material_cost
  group by factory_id, product_id
),
ops as (
  select
    r.factory_id,
    r.product_id,
    sum(case when op.is_outsourced then 0 else r.rate end) as labor,
    sum(case when op.is_outsourced then r.rate else 0 end) as outsourced,
    sum(r.std_minutes) as std_minutes
  from factory.routing_steps r
  join factory.operations op on op.factory_id = r.factory_id and op.id = r.operation_id
  group by r.factory_id, r.product_id
)
select
  p.factory_id,
  p.id as product_id,
  p.name,
  p.sell_price,
  coalesce(m.materials, 0) as materials,
  coalesce(m.waste, 0) as waste,
  coalesce(o.labor, 0) as labor,
  coalesce(o.outsourced, 0) as outsourced,
  coalesce(s.overhead_rate, 0) as overhead,
  coalesce(o.std_minutes, 0) as std_minutes,
  coalesce(m.materials, 0) + coalesce(m.waste, 0) + coalesce(o.labor, 0)
    + coalesce(o.outsourced, 0) + coalesce(s.overhead_rate, 0) as total_cost,
  p.sell_price - (coalesce(m.materials, 0) + coalesce(m.waste, 0) + coalesce(o.labor, 0)
    + coalesce(o.outsourced, 0) + coalesce(s.overhead_rate, 0)) as profit_per_piece,
  case when p.sell_price > 0 then
    (p.sell_price - (coalesce(m.materials, 0) + coalesce(m.waste, 0) + coalesce(o.labor, 0)
      + coalesce(o.outsourced, 0) + coalesce(s.overhead_rate, 0))) / p.sell_price * 100
  end as margin_pct,
  -- سعر التعادل = التكلفة الكاملة للقطعة
  coalesce(m.materials, 0) + coalesce(m.waste, 0) + coalesce(o.labor, 0)
    + coalesce(o.outsourced, 0) + coalesce(s.overhead_rate, 0) as break_even_price,
  -- أقل سعر يحقّق هامش الهدف
  (coalesce(m.materials, 0) + coalesce(m.waste, 0) + coalesce(o.labor, 0)
    + coalesce(o.outsourced, 0) + coalesce(s.overhead_rate, 0))
    / (1 - coalesce(s.target_margin_pct, 40) / 100.0) as min_selling_price,
  -- تكلفة الهدف عند سعر البيع الحالي
  p.sell_price * (1 - coalesce(s.target_margin_pct, 40) / 100.0) as target_cost,
  coalesce(s.target_margin_pct, 40) as target_margin_pct
from factory.products p
left join mat m on m.factory_id = p.factory_id and m.product_id = p.id
left join ops o on o.factory_id = p.factory_id and o.product_id = p.id
left join factory.factory_settings s on s.factory_id = p.factory_id;

-- الفعلي مقابل المتوقع لكل أمر إنتاج:
-- الفعلي من الخامات المصروفة والهالك والأجور المسجّلة، والمتوقع من ورقة التكلفة.
create or replace view factory.v_order_costing as
with done as (
  select
    se.factory_id,
    se.order_id,
    sum(se.qty_good * se.rate) as actual_labor,
    sum(se.qty_rework) as rework,
    sum(se.qty_scrap) as scrap
  from factory.production_stage_entries se
  group by se.factory_id, se.order_id
),
issued as (
  select
    factory_id,
    ref_id as order_id,
    sum(abs(qty) * unit_cost) as actual_materials
  from factory.stock_movements
  where ref_type = 'order' and item_type = 'material' and kind in ('issue', 'waste')
  group by factory_id, ref_id
),
final_stage as (
  select se.factory_id, se.order_id, sum(se.qty_good) as produced
  from factory.production_stage_entries se
  join factory.routing_steps r
    on r.factory_id = se.factory_id and r.operation_id = se.operation_id
  join factory.orders o
    on o.factory_id = se.factory_id and o.id = se.order_id and o.product_id = r.product_id
  where r.seq = (select max(r2.seq) from factory.routing_steps r2
                 where r2.factory_id = r.factory_id and r2.product_id = r.product_id)
  group by se.factory_id, se.order_id
)
select
  o.factory_id,
  o.id as order_id,
  o.code,
  o.product_id,
  o.quantity,
  coalesce(f.produced, 0) as produced,
  coalesce(d.scrap, 0) as scrap,
  coalesce(d.rework, 0) as rework,
  c.total_cost as est_per_piece,
  c.total_cost * o.quantity as est_total,
  coalesce(i.actual_materials, 0) as actual_materials,
  coalesce(d.actual_labor, 0) as actual_labor,
  coalesce(s.overhead_rate, 0) * coalesce(f.produced, 0) as actual_overhead,
  coalesce(i.actual_materials, 0) + coalesce(d.actual_labor, 0)
    + coalesce(s.overhead_rate, 0) * coalesce(f.produced, 0) as actual_total,
  o.piece_price * coalesce(f.produced, 0) as revenue
from factory.orders o
left join factory.v_product_costing c on c.factory_id = o.factory_id and c.product_id = o.product_id
left join done d on d.factory_id = o.factory_id and d.order_id = o.id
left join issued i on i.factory_id = o.factory_id and i.order_id = o.id
left join final_stage f on f.factory_id = o.factory_id and f.order_id = o.id
left join factory.factory_settings s on s.factory_id = o.factory_id;
