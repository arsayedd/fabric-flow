-- صنعة — Migration 0002: نواة التصنيع (Manufacturing Core)
-- إضافية بالكامل (Additive): مفيش DROP ولا RENAME ولا تعديل على أي جدول موجود.
-- الجداول القديمة في schema.sql (يُعتبر 0001) تفضل شغالة زي ما هي.
-- الأعمدة الوحيدة اللي بتتضاف على جدول قائم هي أعمدة nullable على factory.orders.

-- ─────────────────────────────────────────────────────────────
-- 1) القوالب والوحدات والفئات
-- ─────────────────────────────────────────────────────────────

-- قالب الصناعة اللي المصنع اختاره — عشان النظام مش مربوط بالملابس
create table if not exists factory.factory_settings (
  factory_id uuid primary key references factory.factories(id) on delete cascade,
  industry text not null default 'custom'
    check (industry in ('apparel', 'bags', 'shoes', 'furniture', 'accessories', 'food', 'custom')),
  valuation_method text not null default 'wavg' check (valuation_method in ('wavg', 'fifo')),
  overhead_method text not null default 'per_piece'
    check (overhead_method in ('per_piece', 'per_hour', 'pct_direct')),
  overhead_rate numeric not null default 0,
  currency text not null default 'EGP',
  created_at timestamptz not null default now()
);

create table if not exists factory.units (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null,
  primary key (factory_id, id),
  unique (factory_id, name)
);

create table if not exists factory.categories (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('product', 'material')),
  primary key (factory_id, id),
  unique (factory_id, kind, name)
);

create table if not exists factory.warehouses (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null,
  kind text not null default 'material' check (kind in ('material', 'finished', 'wip')),
  is_default boolean not null default false,
  primary key (factory_id, id),
  unique (factory_id, name)
);

-- ─────────────────────────────────────────────────────────────
-- 2) الخامات والمنتجات
-- ─────────────────────────────────────────────────────────────

create table if not exists factory.materials (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  sku text not null,
  name text not null check (char_length(name) > 0),
  category_id uuid,
  unit_id uuid,
  avg_cost numeric not null default 0 check (avg_cost >= 0),
  min_level numeric not null default 0 check (min_level >= 0),
  reorder_point numeric not null default 0 check (reorder_point >= 0),
  lead_time_days integer not null default 0 check (lead_time_days >= 0),
  default_vendor text not null default '',
  tracks_batches boolean not null default false,
  archived_at timestamptz,
  primary key (factory_id, id),
  unique (factory_id, sku),
  foreign key (factory_id, category_id) references factory.categories (factory_id, id),
  foreign key (factory_id, unit_id) references factory.units (factory_id, id)
);

create table if not exists factory.products (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  sku text not null,
  name text not null check (char_length(name) > 0),
  category_id uuid,
  unit_id uuid,
  sell_price numeric not null default 0 check (sell_price >= 0),
  min_stock numeric not null default 0 check (min_stock >= 0),
  image_path text,
  archived_at timestamptz,
  primary key (factory_id, id),
  unique (factory_id, sku),
  foreign key (factory_id, category_id) references factory.categories (factory_id, id),
  foreign key (factory_id, unit_id) references factory.units (factory_id, id)
);

-- مقاسات/ألوان/أحجام — اسم عام مش مرتبط بصناعة معينة
create table if not exists factory.product_variants (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  name text not null,
  sku text not null,
  sell_price numeric,
  primary key (factory_id, id),
  unique (factory_id, sku),
  foreign key (factory_id, product_id) references factory.products (factory_id, id)
);

create table if not exists factory.material_batches (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  material_id uuid not null,
  code text not null,
  received_at date not null default current_date,
  unit_cost numeric not null default 0 check (unit_cost >= 0),
  notes text not null default '',
  primary key (factory_id, id),
  unique (factory_id, material_id, code),
  foreign key (factory_id, material_id) references factory.materials (factory_id, id)
);

-- ─────────────────────────────────────────────────────────────
-- 3) قوائم الخامات (BOM) بنُسَخ
-- ─────────────────────────────────────────────────────────────

create table if not exists factory.boms (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  variant_id uuid,
  version integer not null default 1 check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  primary key (factory_id, id),
  unique (factory_id, product_id, variant_id, version),
  foreign key (factory_id, product_id) references factory.products (factory_id, id),
  foreign key (factory_id, variant_id) references factory.product_variants (factory_id, id)
);

create table if not exists factory.bom_items (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  bom_id uuid not null,
  material_id uuid not null,
  qty_per_unit numeric not null check (qty_per_unit > 0),
  waste_pct numeric not null default 0 check (waste_pct >= 0 and waste_pct <= 100),
  -- خامة بديلة لو الأصلية خلصت
  alt_material_id uuid,
  notes text not null default '',
  primary key (factory_id, id),
  foreign key (factory_id, bom_id) references factory.boms (factory_id, id),
  foreign key (factory_id, material_id) references factory.materials (factory_id, id),
  foreign key (factory_id, alt_material_id) references factory.materials (factory_id, id)
);

-- ─────────────────────────────────────────────────────────────
-- 4) العمليات ومسار التصنيع (Routing) وخطوط الإنتاج
-- ─────────────────────────────────────────────────────────────

create table if not exists factory.operations (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null,
  default_rate numeric not null default 0 check (default_rate >= 0),
  default_minutes numeric not null default 0 check (default_minutes >= 0),
  is_outsourced boolean not null default false,
  primary key (factory_id, id),
  unique (factory_id, name)
);

create table if not exists factory.routing_steps (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  operation_id uuid not null,
  seq integer not null check (seq > 0),
  rate numeric not null default 0 check (rate >= 0),
  std_minutes numeric not null default 0 check (std_minutes >= 0),
  primary key (factory_id, id),
  unique (factory_id, product_id, seq),
  foreign key (factory_id, product_id) references factory.products (factory_id, id),
  foreign key (factory_id, operation_id) references factory.operations (factory_id, id)
);

create table if not exists factory.production_lines (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null,
  daily_capacity numeric not null default 0 check (daily_capacity >= 0),
  active boolean not null default true,
  primary key (factory_id, id),
  unique (factory_id, name)
);

-- ─────────────────────────────────────────────────────────────
-- 5) دفتر المخزون — مصدر الحقيقة الوحيد للأرصدة
--    الرصيد = SUM(qty). مفيش عمود رصيد مخزّن في أي جدول.
-- ─────────────────────────────────────────────────────────────

create table if not exists factory.stock_movements (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  date date not null default current_date,
  item_type text not null check (item_type in ('material', 'product')),
  item_id uuid not null,
  warehouse_id uuid,
  batch_id uuid,
  kind text not null check (kind in (
    'purchase', 'issue', 'return', 'adjust', 'waste',
    'receipt_fg', 'delivery', 'transfer_in', 'transfer_out', 'opening'
  )),
  -- موجب = دخول، سالب = خروج
  qty numeric not null check (qty <> 0),
  unit_cost numeric not null default 0 check (unit_cost >= 0),
  ref_type text not null default '' ,
  ref_id uuid,
  notes text not null default '',
  -- مفتاح تكرار العمليات الجاية من الموبايل بعد انقطاع النت
  client_op_id text,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (factory_id, id),
  unique (factory_id, client_op_id),
  foreign key (factory_id, warehouse_id) references factory.warehouses (factory_id, id),
  foreign key (factory_id, batch_id) references factory.material_batches (factory_id, id)
);

create index if not exists stock_movements_item_idx
  on factory.stock_movements (factory_id, item_type, item_id, date);

create index if not exists stock_movements_ref_idx
  on factory.stock_movements (factory_id, ref_type, ref_id);

create or replace view factory.v_stock_balance as
select
  factory_id,
  item_type,
  item_id,
  warehouse_id,
  sum(qty) as qty,
  sum(qty * unit_cost) as value
from factory.stock_movements
group by factory_id, item_type, item_id, warehouse_id;

-- ─────────────────────────────────────────────────────────────
-- 6) ربط أوامر الإنتاج بالنواة — أعمدة nullable فقط
--    الأوامر القديمة تفضل صالحة بدون أي تعديل.
-- ─────────────────────────────────────────────────────────────

alter table factory.orders add column if not exists product_id uuid;
alter table factory.orders add column if not exists variant_id uuid;
alter table factory.orders add column if not exists bom_id uuid;
alter table factory.orders add column if not exists line_id uuid;
alter table factory.orders add column if not exists start_date date;
alter table factory.orders add column if not exists materials_issued_at timestamptz;
alter table factory.orders add column if not exists cancelled_at timestamptz;
alter table factory.orders add column if not exists cancel_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_product_fk'
  ) then
    alter table factory.orders
      add constraint orders_product_fk
      foreign key (factory_id, product_id) references factory.products (factory_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_bom_fk'
  ) then
    alter table factory.orders
      add constraint orders_bom_fk
      foreign key (factory_id, bom_id) references factory.boms (factory_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_line_fk'
  ) then
    alter table factory.orders
      add constraint orders_line_fk
      foreign key (factory_id, line_id) references factory.production_lines (factory_id, id);
  end if;
end $$;

-- متابعة المراحل بالكميات، مش بنسبة مئوية مكتوبة بالإيد
create table if not exists factory.production_stage_entries (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  order_id uuid not null,
  operation_id uuid not null,
  date date not null default current_date,
  worker_id uuid,
  qty_good numeric not null default 0 check (qty_good >= 0),
  qty_rework numeric not null default 0 check (qty_rework >= 0),
  qty_scrap numeric not null default 0 check (qty_scrap >= 0),
  rate numeric not null default 0 check (rate >= 0),
  notes text not null default '',
  client_op_id text,
  created_at timestamptz not null default now(),
  primary key (factory_id, id),
  unique (factory_id, client_op_id),
  foreign key (factory_id, order_id) references factory.orders (factory_id, id),
  foreign key (factory_id, operation_id) references factory.operations (factory_id, id),
  foreign key (factory_id, worker_id) references factory.workers (factory_id, id)
);

create index if not exists stage_entries_order_idx
  on factory.production_stage_entries (factory_id, order_id, operation_id);

-- ─────────────────────────────────────────────────────────────
-- 7) RLS على كل جدول جديد
-- ─────────────────────────────────────────────────────────────

alter table factory.factory_settings enable row level security;
alter table factory.units enable row level security;
alter table factory.categories enable row level security;
alter table factory.warehouses enable row level security;
alter table factory.materials enable row level security;
alter table factory.products enable row level security;
alter table factory.product_variants enable row level security;
alter table factory.material_batches enable row level security;
alter table factory.boms enable row level security;
alter table factory.bom_items enable row level security;
alter table factory.operations enable row level security;
alter table factory.routing_steps enable row level security;
alter table factory.production_lines enable row level security;
alter table factory.stock_movements enable row level security;
alter table factory.production_stage_entries enable row level security;
