-- صنعة — Migration 0004: SANAA Customer Intelligence
-- إضافية بالكامل: عمود واحد على factory_settings + Views للقراءة.
-- مفيش DROP ولا RENAME، ومفيش تعديل على بيانات قائمة.
--
-- مبدأ الموديول: **مفيش سكور بيتخزَّن**. كل الدرجات بتتحسب من الحركات وقت العرض،
-- عشان ميحصلش إن رقم قديم يفضل معروض بعد ما البيانات تتغير.
-- اللي بيتخزّن هو **الأوزان** بس، لأنها قرار إداري مش نتيجة حساب.

-- ─────────────────────────────────────────────────────────────
-- 1) أوزان سكور العميل — قابلة للتعديل من صاحب المصنع
-- ─────────────────────────────────────────────────────────────

alter table factory.factory_settings
  add column if not exists score_weights jsonb not null default jsonb_build_object(
    'purchase', 20,
    'payment', 25,
    'growth', 15,
    'frequency', 10,
    'profit', 20,
    'quality', 5,
    'relationship', 5
  );

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'factory_settings_score_weights_obj') then
    alter table factory.factory_settings add constraint factory_settings_score_weights_obj
      check (jsonb_typeof(score_weights) = 'object');
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 2) Views للقراءة: أساس الحساب في الواجهة والتقارير
-- ─────────────────────────────────────────────────────────────

-- توزيع التحصيلات على التوريدات بالأقدم أولًا (FIFO) مع تاريخ كل دفعة،
-- وده اللي بيخلينا نعرف العميل بيدفع في كام يوم وبيتأخر قد إيه.
create or replace view factory.v_delivery_settlements as
with paid as (
  select
    d.factory_id,
    d.id as delivery_id,
    d.client_id,
    d.date as delivery_date,
    d.due_date,
    d.amount,
    coalesce(sum(c.amount) over (
      partition by d.factory_id, d.client_id
      order by c.date, c.id
      rows between unbounded preceding and current row
    ), 0) as running_paid
  from factory.deliveries d
  left join factory.collections c
    on c.factory_id = d.factory_id
   and c.client_id = d.client_id
   and c.status = 'confirmed'
)
select
  factory_id,
  delivery_id,
  client_id,
  delivery_date,
  due_date,
  amount,
  least(amount, greatest(0, running_paid)) as allocated,
  greatest(0, amount - greatest(0, running_paid)) as remaining
from paid;

-- مؤشرات العميل الخام — الواجهة بتحسب نفس الأرقام دي محليًا،
-- والـview موجود للتقارير والاستعلامات المباشرة.
create or replace view factory.v_customer_metrics as
select
  p.factory_id,
  p.id as party_id,
  p.name,
  count(distinct d.id) as orders_count,
  coalesce(sum(d.amount), 0) as sales,
  case when count(distinct d.id) > 0 then coalesce(sum(d.amount), 0) / count(distinct d.id) else 0 end as avg_order,
  coalesce(max(d.amount), 0) as biggest_order,
  min(d.date) as first_date,
  max(d.date) as last_date,
  (
    select coalesce(sum(c.amount), 0)
    from factory.collections c
    where c.factory_id = p.factory_id and c.client_id = p.id and c.status = 'confirmed'
  ) as collected
from factory.parties p
left join factory.deliveries d
  on d.factory_id = p.factory_id and d.client_id = p.id
where p.merged_into_id is null
group by p.factory_id, p.id, p.name;
