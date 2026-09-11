-- صنعة — Migration 0007: لوحة الإدارة وصحة المصنع (M-A1)
-- إضافية بالكامل: Views للقراءة بس. مفيش أعمدة جديدة، مفيش DROP، مفيش RENAME،
-- ومفيش تعديل على بيانات قائمة.
--
-- مبدأ الموديول: **مفيش درجة بتتخزَّن**. صحة المصنع والاستثناءات بتتحسب من نفس
-- الحركات المسجّلة وقت العرض، فتسجيل مرحلة أو تأكيد تحصيل بيغيّر الصورة فورًا.
-- والمؤشر اللي مفيش له بيانات بيرجع NULL — مش صفر. الفرق بين «وحش» و«مش مسجّل»
-- قرار مختلف تمامًا، وده السبب إن الأعمدة دي nullable بدل coalesce(...,0).

-- ─────────────────────────────────────────────────────────────
-- 1) الإنتاج اليومي — كمية آخر مرحلة عشان القطعة متتعدّش مرتين
-- ─────────────────────────────────────────────────────────────

create or replace view factory.v_daily_production as
with last_step as (
  select r.factory_id, r.product_id, r.operation_id
  from factory.routing_steps r
  where r.seq = (select max(r2.seq) from factory.routing_steps r2
                 where r2.factory_id = r.factory_id and r2.product_id = r.product_id)
)
select
  se.factory_id,
  se.date,
  sum(se.qty_good) as produced,
  sum(se.qty_scrap) as scrap,
  sum(se.qty_rework) as rework
from factory.production_stage_entries se
join factory.orders o on o.factory_id = se.factory_id and o.id = se.order_id
join last_step ls
  on ls.factory_id = se.factory_id and ls.product_id = o.product_id and ls.operation_id = se.operation_id
group by se.factory_id, se.date;

-- ─────────────────────────────────────────────────────────────
-- 2) مسار القطع في المصنع كله — وصل / خرج / واقف
-- ─────────────────────────────────────────────────────────────

-- «وصل» لأول مرحلة = كمية الأمر، ولأي مرحلة بعدها = اللي خرج من اللي قبلها.
-- الترتيب متوسط مرجّح بالكمية لأن الموديلات مش لازم يكون مسارها واحد.
create or replace view factory.v_factory_funnel as
with steps as (
  select
    o.factory_id,
    o.id as order_id,
    o.quantity,
    r.operation_id,
    op.name,
    r.seq,
    lag(r.operation_id) over (partition by o.id order by r.seq) as prev_operation_id
  from factory.orders o
  join factory.routing_steps r on r.factory_id = o.factory_id and r.product_id = o.product_id
  join factory.operations op on op.factory_id = r.factory_id and op.id = r.operation_id
  where o.status in ('running', 'late')
),
done as (
  select factory_id, order_id, operation_id,
         sum(qty_good) as good, sum(qty_scrap) as scrap, sum(qty_rework) as rework
  from factory.production_stage_entries
  group by factory_id, order_id, operation_id
)
select
  s.factory_id,
  s.operation_id,
  s.name,
  sum(s.seq * s.quantity) / nullif(sum(s.quantity), 0) as seq,
  sum(case when s.prev_operation_id is null then s.quantity else coalesce(pd.good, 0) end) as arrived,
  sum(coalesce(d.good, 0)) as done,
  greatest(
    sum(case when s.prev_operation_id is null then s.quantity else coalesce(pd.good, 0) end)
      - sum(coalesce(d.good, 0)),
    0
  ) as waiting,
  sum(coalesce(d.scrap, 0)) as scrap,
  sum(coalesce(d.rework, 0)) as rework
from steps s
left join done d on d.factory_id = s.factory_id and d.order_id = s.order_id and d.operation_id = s.operation_id
left join done pd
  on pd.factory_id = s.factory_id and pd.order_id = s.order_id and pd.operation_id = s.prev_operation_id
group by s.factory_id, s.operation_id, s.name;

-- ─────────────────────────────────────────────────────────────
-- 3) مدخلات صحة المصنع — الأرقام الخام لكل مؤشر
-- ─────────────────────────────────────────────────────────────

-- NULL معناه «مفيش بيانات للمؤشر ده»، والواجهة بتشيله وبتوزّع وزنه على الباقي.
create or replace view factory.v_factory_health_inputs as
with q as (
  select factory_id,
         sum(qty_good) as good,
         sum(qty_scrap + qty_rework) as bad
  from factory.production_stage_entries
  where date >= current_date - interval '30 days'
  group by factory_id
),
work as (
  select se.factory_id, sum(se.qty_good * r.std_minutes) as earned_minutes
  from factory.production_stage_entries se
  join factory.orders o on o.factory_id = se.factory_id and o.id = se.order_id
  join factory.routing_steps r
    on r.factory_id = se.factory_id and r.product_id = o.product_id and r.operation_id = se.operation_id
  where se.date >= current_date - interval '30 days'
  group by se.factory_id
),
stock as (
  select m.factory_id,
         count(*) filter (where m.reorder_point > 0) as tracked,
         count(*) filter (where m.reorder_point > 0 and coalesce(b.qty, 0) >= m.reorder_point) as above_reorder
  from factory.materials m
  left join (
    select factory_id, item_id, sum(qty) as qty
    from factory.stock_movements
    where item_type = 'material'
    group by factory_id, item_id
  ) b on b.factory_id = m.factory_id and b.item_id = m.id
  group by m.factory_id
),
margin as (
  select factory_id, avg(margin_pct) as avg_margin_pct, max(target_margin_pct) as target_margin_pct
  from factory.v_product_costing
  where margin_pct is not null
  group by factory_id
)
select
  f.id as factory_id,
  w.earned_minutes,
  -- الطاقة المتاحة قرار إداري محفوظ في الإعدادات
  s.crew_size,
  s.work_hours_per_day,
  s.work_days_per_week,
  s.utilization_pct,
  q.good as good_30d,
  q.bad as bad_30d,
  case when coalesce(q.good, 0) + coalesce(q.bad, 0) > 0
       then q.good::numeric / (q.good + q.bad) * 100 end as quality_pct,
  st.tracked as materials_tracked,
  st.above_reorder as materials_above_reorder,
  case when st.tracked > 0 then st.above_reorder::numeric / st.tracked * 100 end as inventory_pct,
  mg.avg_margin_pct,
  mg.target_margin_pct
from factory.factories f
left join factory.factory_settings s on s.factory_id = f.id
left join work w on w.factory_id = f.id
left join q on q.factory_id = f.id
left join stock st on st.factory_id = f.id
left join margin mg on mg.factory_id = f.id;
