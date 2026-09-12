-- ═════════════════════════════════════════════════════════════
-- صنعة — ملف العميل ٣٦٠ (M-B1)
-- ═════════════════════════════════════════════════════════════
--
-- الملف ده **مافيهوش جدول جديد ولا عمود جديد**، وده مقصود.
--
-- السؤال اللي القسم ده بيرد عليه — «العميل ده عملنا له إيه، وكلّفنا
-- كام، وكسبنا منه كام» — إجابته كلها موجودة في الحركات المسجّلة
-- بالفعل: التوريدات، أوامر الإنتاج، تسجيل المراحل، المرتجعات،
-- والتحصيلات. اللي كان ناقص هو **الربط**، والربط اتقفل في 0015 لما
-- `deliveries.order_id` اتضاف. فكل اللي هنا views بتقرا، مش تخزين.
--
-- والسبب إن ده مايتخزّنش: الربحية بتتغير كل ما سعر خامة يتغير أو
-- مرتجع يتقفل. عمود `net_contribution` على جدول العميل كان هيبقى
-- صح يوم ما اتكتب وغلط بعده، والأسوأ إن محدش هيعرف إمتى بقى غلط.
--
-- ═════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1) موديل التوريد: بالمعرّف الأول، وبالاسم لما مافيش
-- ─────────────────────────────────────────────────────────────
--    الترتيب ده هو نفسه اللي في `deliveryProduct` في التطبيق، مكتوب
--    مرة واحدة هنا عشان التصدير من السيرفر مايختلفش عن الشاشة.
--
--    و`link_kind` بيتحفظ في الناتج عن قصد: الرقم اللي مبني على
--    مطابقة اسم لازم يقول إنه كده. مطابقة الاسم بتغلط — عميلين ليهم
--    «قميص قطني» من موديلين مختلفين — والعمود ده هو اللي بيخلي
--    الغلط قابل للرؤية بدل ما يتخبى جوه إجمالي.

--    و`deliveries.client_id` بيشاور على `factory.clients`، والجدول ده
--    بقى `party_id = id` بعد 0003 — يعني نفس المعرّف بتاع الجهة. فربطه
--    بـ`returns.party_id` صحيح من غير تحويل.

create or replace view factory.v_delivery_product as
select
  d.factory_id,
  d.id as delivery_id,
  d.client_id,
  d.order_id,
  d.date,
  d.amount,
  d.quantity,
  coalesce(o.product_id, p.id) as product_id,
  case
    when o.product_id is not null then 'order'
    when p.id is not null then 'name'
    else 'none'
  end as link_kind,
  coalesce(po.name, p.name, nullif(btrim(d.model), ''), 'بدون موديل') as product_name
from factory.deliveries d
left join factory.orders o
  on o.factory_id = d.factory_id and o.id = d.order_id
left join factory.products po
  on po.factory_id = d.factory_id and po.id = o.product_id
left join factory.products p
  on p.factory_id = d.factory_id
 and o.product_id is null
 and btrim(p.name) = btrim(d.model);

-- ─────────────────────────────────────────────────────────────
-- 2) مصفوفة موديلات العميل
-- ─────────────────────────────────────────────────────────────
--    صف لكل (عميل × موديل). والصف مفتاحه المنتج لو مربوط، والاسم لو
--    مش مربوط — ومابنجمّعش الاتنين حتى لو الاسم متشابه: الأول له SKU
--    وتكلفة، والتاني لأ، وجمعهم بيطلّع صف نصه معروف ونصه مجهول.
--
--    التكلفة **مش هنا**: ورقة تكلفة القطعة محتاجة قائمة الخامات
--    ومسار التشغيل ونِسَب الهالك، وده منطق التطبيق (`costSheet`).
--    الview دي بتقول الكميات والإيراد والراجع، والتكلفة بتتضرب فوقها.

create or replace view factory.v_client_products as
with del as (
  select
    v.factory_id,
    v.client_id,
    coalesce(v.product_id::text, 'name:' || v.product_name) as row_key,
    v.product_id,
    v.product_name,
    count(*) as deliveries,
    sum(coalesce(v.quantity, 0)) as delivered_qty,
    sum(v.amount) as revenue,
    sum(v.amount) filter (where v.link_kind = 'order') as exact_revenue,
    bool_or(v.quantity is null) as missing_qty
  from factory.v_delivery_product v
  group by 1, 2, 3, 4, 5
),
prod as (
  -- المنتَج من آخر مرحلة على الأمر، مش من نسبة التقدم.
  --
  -- و«آخر» هنا **بالتاريخ**، بينما التطبيق بياخدها بترتيب مسار
  -- التشغيل (`orderStages`). الترتيبين بيتفقوا لما المراحل تتسجّل
  -- بترتيبها — وده الحاصل عمليًا — لكنهم مش نفس التعريف. تطبيق
  -- ترتيب المسار هنا محتاج join على `routing_steps` بالـ`seq`، وده
  -- بيتعمل مع ترحيل حساب المراحل كله للسيرفر مش قبله.
  select
    o.factory_id,
    o.client_id,
    o.product_id,
    sum(coalesce(s.good, 0)) as produced_qty
  from factory.orders o
  left join lateral (
    select e.qty_good as good
    from factory.production_stage_entries e
    where e.factory_id = o.factory_id and e.order_id = o.id
    order by e.date desc, e.id desc
    limit 1
  ) s on true
  where o.product_id is not null
  group by 1, 2, 3
),
ret as (
  select
    r.factory_id,
    r.party_id as client_id,
    r.item_id as product_id,
    sum(r.qty) as returned_qty,
    count(*) as return_cases
  from factory.returns r
  where r.item_type = 'product' and r.status <> 'cancelled'
  group by 1, 2, 3
)
select
  d.factory_id,
  d.client_id,
  d.product_id,
  d.product_name,
  d.deliveries,
  d.delivered_qty,
  d.revenue,
  coalesce(d.exact_revenue, 0) as exact_revenue,
  coalesce(p.produced_qty, 0) as produced_qty,
  coalesce(r.returned_qty, 0) as returned_qty,
  coalesce(r.return_cases, 0) as return_cases,
  -- نسبة الرجوع بتبقى فاضية لو فيه توريد اتسجّل بلا كمية: نسبة على
  -- مقام ناقص رقم بيدّعي دقة مش عنده
  case
    when d.missing_qty or d.delivered_qty <= 0 then null
    else coalesce(r.returned_qty, 0)::numeric / d.delivered_qty
  end as return_rate
from del d
left join prod p
  on p.factory_id = d.factory_id and p.client_id = d.client_id and p.product_id = d.product_id
left join ret r
  on r.factory_id = d.factory_id and r.client_id = d.client_id and r.product_id = d.product_id;

-- ─────────────────────────────────────────────────────────────
-- 3) من الأمر للتحصيل
-- ─────────────────────────────────────────────────────────────
--    الأمر → الإنتاج → التسليم → الفاتورة → التحصيل، كل خطوة من
--    دفترها. والسلسلة دي **مش timeline بيتخزّن**: لو اتخزّنت، تعديل
--    تحصيل قديم مكانش هيرجّع يصلّحها.
--
--    والمحصّل بيتحسب بالأقدمية على مستوى التوريد — نفس توزيع FIFO
--    اللي في `fifoRemain`. تعريف تاني للمحصّل على مستوى الأمر كان
--    هيدّي رقمين مختلفين لنفس الفلوس.

create or replace view factory.v_order_cash as
with del as (
  select
    d.factory_id,
    d.order_id,
    count(*) as invoices,
    sum(coalesce(d.quantity, 0)) as delivered,
    sum(d.amount) as invoiced,
    min(d.due_date) filter (where d.due_date is not null) as due_date
  from factory.deliveries d
  where d.order_id is not null
  group by 1, 2
),
paid as (
  -- التحصيل بيتوزّع على العميل مش على الأمر، فبنوزّعه بالأقدمية على
  -- توريدات العميل وناخد نصيب توريدات الأمر من التوزيع ده
  select
    x.factory_id,
    x.order_id,
    sum(least(x.amount, greatest(0, x.paid_pool - x.prior))) as collected
  from (
    select
      d.factory_id,
      d.order_id,
      d.amount,
      sum(d.amount) over (
        partition by d.factory_id, d.client_id order by d.date, d.id
        rows between unbounded preceding and 1 preceding
      ) as prior,
      c.pool as paid_pool
    from factory.deliveries d
    join lateral (
      select coalesce(sum(k.amount), 0) as pool
      from factory.collections k
      where k.factory_id = d.factory_id
        and k.client_id = d.client_id
        and k.status = 'confirmed'
    ) c on true
    where d.order_id is not null
  ) x
  group by 1, 2
)
select
  o.factory_id,
  o.id as order_id,
  o.code,
  o.client_id,
  o.product_id,
  o.quantity as ordered_qty,
  coalesce(s.good, 0) as produced_qty,
  coalesce(d.delivered, 0) as delivered_qty,
  greatest(0, o.quantity - coalesce(d.delivered, 0)) as remaining_qty,
  coalesce(d.invoices, 0) as invoices,
  coalesce(d.invoiced, 0) as invoiced,
  coalesce(p.collected, 0) as collected,
  coalesce(d.invoiced, 0) - coalesce(p.collected, 0) as remaining,
  d.due_date,
  case
    when d.due_date is not null
     and d.due_date < current_date
     and coalesce(d.invoiced, 0) - coalesce(p.collected, 0) > 0.5
    then current_date - d.due_date
  end as overdue_days
from factory.orders o
left join lateral (
  select e.qty_good as good
  from factory.production_stage_entries e
  where e.factory_id = o.factory_id and e.order_id = o.id
  order by e.date desc, e.id desc
  limit 1
) s on true
left join del d
  on d.factory_id = o.factory_id and d.order_id = o.id
left join paid p
  on p.factory_id = o.factory_id and p.order_id = o.id;

-- ─────────────────────────────────────────────────────────────
-- 4) العزل
-- ─────────────────────────────────────────────────────────────
--    الviews دي مالهاش RLS بتاعها: هي بتقرا من جداول كلها عليها RLS
--    بالفعل، و`security_invoker` بيخلي سياسات الجداول دي تتطبّق على
--    اللي بيسأل الview مش على اللي عملها. من غير السطر ده الview
--    بتبقى ثغرة عزل — بتشوف كل المصانع لأنها بتتنفّذ بصلاحية مالكها.

alter view factory.v_delivery_product set (security_invoker = true);
alter view factory.v_client_products set (security_invoker = true);
alter view factory.v_order_cash set (security_invoker = true);

-- ─────────────────────────────────────────────────────────────
-- 5) اللي مش في الملف ده عن قصد
-- ─────────────────────────────────────────────────────────────
--    * **البراند ككيان أب**: الطلب إن البراند يبقى Parent فوق
--      Collections → Categories → Products → SKUs. ده محتاج دور
--      `brand` على الجهة، و`products.party_id`، وشجرة مجموعات
--      وتصنيفات. دلوقتي المنتج مالوش مالك، والعميل بيتعرف على
--      موديلاته من حركته عليها — وده أضعف من ملكية صريحة.
--    * **متغيّرات المنتج** (لون × مقاس = SKU): الجدول موجود من 0002
--      (`product_variants`) و`orders.variant_id` كمان — لكن **التطبيق
--      مابيستخدمهمش**. المنتج في الشاشة لسه صف واحد بـSKU واحد،
--      واللون والمقاس بيتسجّلوا على الباندل والفرشة والمرتجع بس.
--      فمصفوفة «مقاس M أبيض باع كام» بتتبني من الإنتاج والمرتجع مش
--      من كتالوج متغيّرات. الناقص شغل تطبيق مش schema: كتالوج
--      للمتغيّرات، و`variant_id` على التوريد والمرتجع، وورقة تكلفة
--      لكل متغيّر.
--    * **تكلفة فعلية منسوبة للعميل**: الاستهلاك الفعلي متسجّل على
--      الأمر (حركات الصرف وتسجيل المراحل)، والربحية في الشاشة
--      معيارية (ورقة التكلفة × المتسلّم). ربط الفعلي بالإيراد محتاج
--      إن **كل** توريد يبقى مربوط بأمر، وده لسه مش متحقق. فالنسبة
--      المربوطة بتتعرض جنب الرقم بدل ما الاتنين يتخلطوا.
--    * **الشحن والخصومات كبنود**: التوريد بيتسجّل بقيمة صافية ومفيهوش
--      سطر شحن. عشان يدخلوا في صافي المساهمة لازم يبقوا سطور على
--      التوريد نفسه، مش مصروف عام بيتوزّع بنسبة.
--    * **حد الائتمان للمورّد**: حد العميل موجود (`parties.credit_limit`)،
--      لكن حدنا عند المورّد — إحنا مديونينله بكام وسقفنا كام — لسه لأ.
--    * **فلاتر محفوظة**: «Brand ABC — شتاء ٢٠٢٦» كفلتر ليه اسم
--      بيتحفظ ويتشارك محتاج جدول `saved_filters` بصاحبه ونطاقه.
--      دلوقتي الفلتر بيعيش في الشاشة وبيضيع مع الريفريش.
