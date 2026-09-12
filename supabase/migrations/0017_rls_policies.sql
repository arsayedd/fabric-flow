-- صنعة — Migration 0017: سياسات RLS للجداول كلها
--
-- **ليه الملف ده موجود:** الـmigrations اللي قبله بتشغّل
-- `enable row level security` على ٥٧ جدول، لكن ٧ جداول بس هي اللي ليها
-- سياسات. وفي Postgres، جدول عليه RLS ومن غير سياسة معناه **ممنوع على
-- الكل** — مش مفتوح. يعني السكيما زي ما هي كانت هتطلع للتطبيق صفر
-- صفوف من كل جدول، وكل إضافة كانت هترفض، والسبب مش باين في أي رسالة
-- خطأ مفهومة.
--
-- الاكتشاف اتحصل أول مرة الـmigrations اتشغّلت فعلًا على Postgres
-- (`node tests/rls-check.mjs`). قبل كده ماكانتش اتشغّلت ولا مرة.
--
-- **الخريطة مش تخمين:** كل جدول تحت نفس موديول الصلاحية اللي شاشته
-- تحته في `guarded()` في App.tsx، وبنفس الفعل اللي `need()` بتطلبه في
-- `context.tsx`. يعني المشرف اللي مايشوفش المالية في الواجهة مايقدرش
-- يقراها من الـAPI كمان — وده الفرق بين «إخفاء زرار» و«صلاحية».
--
-- الملف إضافي بالكامل: `create policy` جوه `if not exists`، مافيش
-- `drop` ولا تعديل على بيانات قائمة.


-- orders — production
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'orders' and policyname = 'orders_read') then
    create policy orders_read on factory.orders
      for select using (factory.has_perm(factory_id, 'production', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'orders' and policyname = 'orders_insert') then
    create policy orders_insert on factory.orders
      for insert with check (factory.has_perm(factory_id, 'production', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'orders' and policyname = 'orders_update') then
    create policy orders_update on factory.orders
      for update using (factory.has_perm(factory_id, 'production', 'edit'))
      with check (factory.has_perm(factory_id, 'production', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'orders' and policyname = 'orders_delete') then
    create policy orders_delete on factory.orders
      for delete using (factory.has_perm(factory_id, 'production', 'delete'));
  end if;
end;
$$;

-- production_lines — production
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'production_lines' and policyname = 'production_lines_read') then
    create policy production_lines_read on factory.production_lines
      for select using (factory.has_perm(factory_id, 'production', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'production_lines' and policyname = 'production_lines_insert') then
    create policy production_lines_insert on factory.production_lines
      for insert with check (factory.has_perm(factory_id, 'production', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'production_lines' and policyname = 'production_lines_update') then
    create policy production_lines_update on factory.production_lines
      for update using (factory.has_perm(factory_id, 'production', 'edit'))
      with check (factory.has_perm(factory_id, 'production', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'production_lines' and policyname = 'production_lines_delete') then
    create policy production_lines_delete on factory.production_lines
      for delete using (factory.has_perm(factory_id, 'production', 'delete'));
  end if;
end;
$$;

-- production_stage_entries — production
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'production_stage_entries' and policyname = 'production_stage_entries_read') then
    create policy production_stage_entries_read on factory.production_stage_entries
      for select using (factory.has_perm(factory_id, 'production', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'production_stage_entries' and policyname = 'production_stage_entries_insert') then
    create policy production_stage_entries_insert on factory.production_stage_entries
      for insert with check (factory.has_perm(factory_id, 'production', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'production_stage_entries' and policyname = 'production_stage_entries_update') then
    create policy production_stage_entries_update on factory.production_stage_entries
      for update using (factory.has_perm(factory_id, 'production', 'edit'))
      with check (factory.has_perm(factory_id, 'production', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'production_stage_entries' and policyname = 'production_stage_entries_delete') then
    create policy production_stage_entries_delete on factory.production_stage_entries
      for delete using (factory.has_perm(factory_id, 'production', 'delete'));
  end if;
end;
$$;

-- floor_issues — production
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'floor_issues' and policyname = 'floor_issues_read') then
    create policy floor_issues_read on factory.floor_issues
      for select using (factory.has_perm(factory_id, 'production', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'floor_issues' and policyname = 'floor_issues_insert') then
    create policy floor_issues_insert on factory.floor_issues
      for insert with check (factory.has_perm(factory_id, 'production', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'floor_issues' and policyname = 'floor_issues_update') then
    create policy floor_issues_update on factory.floor_issues
      for update using (factory.has_perm(factory_id, 'production', 'edit'))
      with check (factory.has_perm(factory_id, 'production', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'floor_issues' and policyname = 'floor_issues_delete') then
    create policy floor_issues_delete on factory.floor_issues
      for delete using (factory.has_perm(factory_id, 'production', 'delete'));
  end if;
end;
$$;

-- cut_lays — production
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'cut_lays' and policyname = 'cut_lays_read') then
    create policy cut_lays_read on factory.cut_lays
      for select using (factory.has_perm(factory_id, 'production', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'cut_lays' and policyname = 'cut_lays_insert') then
    create policy cut_lays_insert on factory.cut_lays
      for insert with check (factory.has_perm(factory_id, 'production', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'cut_lays' and policyname = 'cut_lays_update') then
    create policy cut_lays_update on factory.cut_lays
      for update using (factory.has_perm(factory_id, 'production', 'edit'))
      with check (factory.has_perm(factory_id, 'production', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'cut_lays' and policyname = 'cut_lays_delete') then
    create policy cut_lays_delete on factory.cut_lays
      for delete using (factory.has_perm(factory_id, 'production', 'delete'));
  end if;
end;
$$;

-- cut_lay_lines — production
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'cut_lay_lines' and policyname = 'cut_lay_lines_read') then
    create policy cut_lay_lines_read on factory.cut_lay_lines
      for select using (factory.has_perm(factory_id, 'production', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'cut_lay_lines' and policyname = 'cut_lay_lines_insert') then
    create policy cut_lay_lines_insert on factory.cut_lay_lines
      for insert with check (factory.has_perm(factory_id, 'production', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'cut_lay_lines' and policyname = 'cut_lay_lines_update') then
    create policy cut_lay_lines_update on factory.cut_lay_lines
      for update using (factory.has_perm(factory_id, 'production', 'edit'))
      with check (factory.has_perm(factory_id, 'production', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'cut_lay_lines' and policyname = 'cut_lay_lines_delete') then
    create policy cut_lay_lines_delete on factory.cut_lay_lines
      for delete using (factory.has_perm(factory_id, 'production', 'delete'));
  end if;
end;
$$;

-- bundles — production
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'bundles' and policyname = 'bundles_read') then
    create policy bundles_read on factory.bundles
      for select using (factory.has_perm(factory_id, 'production', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'bundles' and policyname = 'bundles_insert') then
    create policy bundles_insert on factory.bundles
      for insert with check (factory.has_perm(factory_id, 'production', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'bundles' and policyname = 'bundles_update') then
    create policy bundles_update on factory.bundles
      for update using (factory.has_perm(factory_id, 'production', 'edit'))
      with check (factory.has_perm(factory_id, 'production', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'bundles' and policyname = 'bundles_delete') then
    create policy bundles_delete on factory.bundles
      for delete using (factory.has_perm(factory_id, 'production', 'delete'));
  end if;
end;
$$;

-- bundle_ops — production
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'bundle_ops' and policyname = 'bundle_ops_read') then
    create policy bundle_ops_read on factory.bundle_ops
      for select using (factory.has_perm(factory_id, 'production', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'bundle_ops' and policyname = 'bundle_ops_insert') then
    create policy bundle_ops_insert on factory.bundle_ops
      for insert with check (factory.has_perm(factory_id, 'production', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'bundle_ops' and policyname = 'bundle_ops_update') then
    create policy bundle_ops_update on factory.bundle_ops
      for update using (factory.has_perm(factory_id, 'production', 'edit'))
      with check (factory.has_perm(factory_id, 'production', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'bundle_ops' and policyname = 'bundle_ops_delete') then
    create policy bundle_ops_delete on factory.bundle_ops
      for delete using (factory.has_perm(factory_id, 'production', 'delete'));
  end if;
end;
$$;

-- operations — production
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'operations' and policyname = 'operations_read') then
    create policy operations_read on factory.operations
      for select using (factory.has_perm(factory_id, 'production', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'operations' and policyname = 'operations_insert') then
    create policy operations_insert on factory.operations
      for insert with check (factory.has_perm(factory_id, 'production', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'operations' and policyname = 'operations_update') then
    create policy operations_update on factory.operations
      for update using (factory.has_perm(factory_id, 'production', 'edit'))
      with check (factory.has_perm(factory_id, 'production', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'operations' and policyname = 'operations_delete') then
    create policy operations_delete on factory.operations
      for delete using (factory.has_perm(factory_id, 'production', 'delete'));
  end if;
end;
$$;

-- units — inventory
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'units' and policyname = 'units_read') then
    create policy units_read on factory.units
      for select using (factory.has_perm(factory_id, 'inventory', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'units' and policyname = 'units_insert') then
    create policy units_insert on factory.units
      for insert with check (factory.has_perm(factory_id, 'inventory', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'units' and policyname = 'units_update') then
    create policy units_update on factory.units
      for update using (factory.has_perm(factory_id, 'inventory', 'edit'))
      with check (factory.has_perm(factory_id, 'inventory', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'units' and policyname = 'units_delete') then
    create policy units_delete on factory.units
      for delete using (factory.has_perm(factory_id, 'inventory', 'delete'));
  end if;
end;
$$;

-- categories — inventory
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'categories' and policyname = 'categories_read') then
    create policy categories_read on factory.categories
      for select using (factory.has_perm(factory_id, 'inventory', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'categories' and policyname = 'categories_insert') then
    create policy categories_insert on factory.categories
      for insert with check (factory.has_perm(factory_id, 'inventory', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'categories' and policyname = 'categories_update') then
    create policy categories_update on factory.categories
      for update using (factory.has_perm(factory_id, 'inventory', 'edit'))
      with check (factory.has_perm(factory_id, 'inventory', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'categories' and policyname = 'categories_delete') then
    create policy categories_delete on factory.categories
      for delete using (factory.has_perm(factory_id, 'inventory', 'delete'));
  end if;
end;
$$;

-- warehouses — inventory
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'warehouses' and policyname = 'warehouses_read') then
    create policy warehouses_read on factory.warehouses
      for select using (factory.has_perm(factory_id, 'inventory', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'warehouses' and policyname = 'warehouses_insert') then
    create policy warehouses_insert on factory.warehouses
      for insert with check (factory.has_perm(factory_id, 'inventory', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'warehouses' and policyname = 'warehouses_update') then
    create policy warehouses_update on factory.warehouses
      for update using (factory.has_perm(factory_id, 'inventory', 'edit'))
      with check (factory.has_perm(factory_id, 'inventory', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'warehouses' and policyname = 'warehouses_delete') then
    create policy warehouses_delete on factory.warehouses
      for delete using (factory.has_perm(factory_id, 'inventory', 'delete'));
  end if;
end;
$$;

-- materials — inventory
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'materials' and policyname = 'materials_read') then
    create policy materials_read on factory.materials
      for select using (factory.has_perm(factory_id, 'inventory', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'materials' and policyname = 'materials_insert') then
    create policy materials_insert on factory.materials
      for insert with check (factory.has_perm(factory_id, 'inventory', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'materials' and policyname = 'materials_update') then
    create policy materials_update on factory.materials
      for update using (factory.has_perm(factory_id, 'inventory', 'edit'))
      with check (factory.has_perm(factory_id, 'inventory', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'materials' and policyname = 'materials_delete') then
    create policy materials_delete on factory.materials
      for delete using (factory.has_perm(factory_id, 'inventory', 'delete'));
  end if;
end;
$$;

-- stock_movements — inventory
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'stock_movements' and policyname = 'stock_movements_read') then
    create policy stock_movements_read on factory.stock_movements
      for select using (factory.has_perm(factory_id, 'inventory', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'stock_movements' and policyname = 'stock_movements_insert') then
    create policy stock_movements_insert on factory.stock_movements
      for insert with check (factory.has_perm(factory_id, 'inventory', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'stock_movements' and policyname = 'stock_movements_update') then
    create policy stock_movements_update on factory.stock_movements
      for update using (factory.has_perm(factory_id, 'inventory', 'edit'))
      with check (factory.has_perm(factory_id, 'inventory', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'stock_movements' and policyname = 'stock_movements_delete') then
    create policy stock_movements_delete on factory.stock_movements
      for delete using (factory.has_perm(factory_id, 'inventory', 'delete'));
  end if;
end;
$$;

-- material_batches — inventory
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'material_batches' and policyname = 'material_batches_read') then
    create policy material_batches_read on factory.material_batches
      for select using (factory.has_perm(factory_id, 'inventory', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'material_batches' and policyname = 'material_batches_insert') then
    create policy material_batches_insert on factory.material_batches
      for insert with check (factory.has_perm(factory_id, 'inventory', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'material_batches' and policyname = 'material_batches_update') then
    create policy material_batches_update on factory.material_batches
      for update using (factory.has_perm(factory_id, 'inventory', 'edit'))
      with check (factory.has_perm(factory_id, 'inventory', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'material_batches' and policyname = 'material_batches_delete') then
    create policy material_batches_delete on factory.material_batches
      for delete using (factory.has_perm(factory_id, 'inventory', 'delete'));
  end if;
end;
$$;

-- supply_orders — purchasing
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'supply_orders' and policyname = 'supply_orders_read') then
    create policy supply_orders_read on factory.supply_orders
      for select using (factory.has_perm(factory_id, 'purchasing', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'supply_orders' and policyname = 'supply_orders_insert') then
    create policy supply_orders_insert on factory.supply_orders
      for insert with check (factory.has_perm(factory_id, 'purchasing', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'supply_orders' and policyname = 'supply_orders_update') then
    create policy supply_orders_update on factory.supply_orders
      for update using (factory.has_perm(factory_id, 'purchasing', 'edit'))
      with check (factory.has_perm(factory_id, 'purchasing', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'supply_orders' and policyname = 'supply_orders_delete') then
    create policy supply_orders_delete on factory.supply_orders
      for delete using (factory.has_perm(factory_id, 'purchasing', 'delete'));
  end if;
end;
$$;

-- supply_order_lines — purchasing
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'supply_order_lines' and policyname = 'supply_order_lines_read') then
    create policy supply_order_lines_read on factory.supply_order_lines
      for select using (factory.has_perm(factory_id, 'purchasing', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'supply_order_lines' and policyname = 'supply_order_lines_insert') then
    create policy supply_order_lines_insert on factory.supply_order_lines
      for insert with check (factory.has_perm(factory_id, 'purchasing', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'supply_order_lines' and policyname = 'supply_order_lines_update') then
    create policy supply_order_lines_update on factory.supply_order_lines
      for update using (factory.has_perm(factory_id, 'purchasing', 'edit'))
      with check (factory.has_perm(factory_id, 'purchasing', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'supply_order_lines' and policyname = 'supply_order_lines_delete') then
    create policy supply_order_lines_delete on factory.supply_order_lines
      for delete using (factory.has_perm(factory_id, 'purchasing', 'delete'));
  end if;
end;
$$;

-- supply_receipts — purchasing
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'supply_receipts' and policyname = 'supply_receipts_read') then
    create policy supply_receipts_read on factory.supply_receipts
      for select using (factory.has_perm(factory_id, 'purchasing', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'supply_receipts' and policyname = 'supply_receipts_insert') then
    create policy supply_receipts_insert on factory.supply_receipts
      for insert with check (factory.has_perm(factory_id, 'purchasing', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'supply_receipts' and policyname = 'supply_receipts_update') then
    create policy supply_receipts_update on factory.supply_receipts
      for update using (factory.has_perm(factory_id, 'purchasing', 'edit'))
      with check (factory.has_perm(factory_id, 'purchasing', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'supply_receipts' and policyname = 'supply_receipts_delete') then
    create policy supply_receipts_delete on factory.supply_receipts
      for delete using (factory.has_perm(factory_id, 'purchasing', 'delete'));
  end if;
end;
$$;

-- supply_receipt_lines — purchasing
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'supply_receipt_lines' and policyname = 'supply_receipt_lines_read') then
    create policy supply_receipt_lines_read on factory.supply_receipt_lines
      for select using (factory.has_perm(factory_id, 'purchasing', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'supply_receipt_lines' and policyname = 'supply_receipt_lines_insert') then
    create policy supply_receipt_lines_insert on factory.supply_receipt_lines
      for insert with check (factory.has_perm(factory_id, 'purchasing', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'supply_receipt_lines' and policyname = 'supply_receipt_lines_update') then
    create policy supply_receipt_lines_update on factory.supply_receipt_lines
      for update using (factory.has_perm(factory_id, 'purchasing', 'edit'))
      with check (factory.has_perm(factory_id, 'purchasing', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'supply_receipt_lines' and policyname = 'supply_receipt_lines_delete') then
    create policy supply_receipt_lines_delete on factory.supply_receipt_lines
      for delete using (factory.has_perm(factory_id, 'purchasing', 'delete'));
  end if;
end;
$$;

-- subcontracts — purchasing
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'subcontracts' and policyname = 'subcontracts_read') then
    create policy subcontracts_read on factory.subcontracts
      for select using (factory.has_perm(factory_id, 'purchasing', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'subcontracts' and policyname = 'subcontracts_insert') then
    create policy subcontracts_insert on factory.subcontracts
      for insert with check (factory.has_perm(factory_id, 'purchasing', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'subcontracts' and policyname = 'subcontracts_update') then
    create policy subcontracts_update on factory.subcontracts
      for update using (factory.has_perm(factory_id, 'purchasing', 'edit'))
      with check (factory.has_perm(factory_id, 'purchasing', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'subcontracts' and policyname = 'subcontracts_delete') then
    create policy subcontracts_delete on factory.subcontracts
      for delete using (factory.has_perm(factory_id, 'purchasing', 'delete'));
  end if;
end;
$$;

-- sub_receipts — purchasing
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'sub_receipts' and policyname = 'sub_receipts_read') then
    create policy sub_receipts_read on factory.sub_receipts
      for select using (factory.has_perm(factory_id, 'purchasing', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'sub_receipts' and policyname = 'sub_receipts_insert') then
    create policy sub_receipts_insert on factory.sub_receipts
      for insert with check (factory.has_perm(factory_id, 'purchasing', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'sub_receipts' and policyname = 'sub_receipts_update') then
    create policy sub_receipts_update on factory.sub_receipts
      for update using (factory.has_perm(factory_id, 'purchasing', 'edit'))
      with check (factory.has_perm(factory_id, 'purchasing', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'sub_receipts' and policyname = 'sub_receipts_delete') then
    create policy sub_receipts_delete on factory.sub_receipts
      for delete using (factory.has_perm(factory_id, 'purchasing', 'delete'));
  end if;
end;
$$;

-- sub_payments — purchasing
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'sub_payments' and policyname = 'sub_payments_read') then
    create policy sub_payments_read on factory.sub_payments
      for select using (factory.has_perm(factory_id, 'purchasing', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'sub_payments' and policyname = 'sub_payments_insert') then
    create policy sub_payments_insert on factory.sub_payments
      for insert with check (factory.has_perm(factory_id, 'purchasing', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'sub_payments' and policyname = 'sub_payments_update') then
    create policy sub_payments_update on factory.sub_payments
      for update using (factory.has_perm(factory_id, 'purchasing', 'edit'))
      with check (factory.has_perm(factory_id, 'purchasing', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'sub_payments' and policyname = 'sub_payments_delete') then
    create policy sub_payments_delete on factory.sub_payments
      for delete using (factory.has_perm(factory_id, 'purchasing', 'delete'));
  end if;
end;
$$;

-- cost_items — purchasing
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'cost_items' and policyname = 'cost_items_read') then
    create policy cost_items_read on factory.cost_items
      for select using (factory.has_perm(factory_id, 'purchasing', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'cost_items' and policyname = 'cost_items_insert') then
    create policy cost_items_insert on factory.cost_items
      for insert with check (factory.has_perm(factory_id, 'purchasing', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'cost_items' and policyname = 'cost_items_update') then
    create policy cost_items_update on factory.cost_items
      for update using (factory.has_perm(factory_id, 'purchasing', 'edit'))
      with check (factory.has_perm(factory_id, 'purchasing', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'cost_items' and policyname = 'cost_items_delete') then
    create policy cost_items_delete on factory.cost_items
      for delete using (factory.has_perm(factory_id, 'purchasing', 'delete'));
  end if;
end;
$$;

-- cost_entries — purchasing
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'cost_entries' and policyname = 'cost_entries_read') then
    create policy cost_entries_read on factory.cost_entries
      for select using (factory.has_perm(factory_id, 'purchasing', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'cost_entries' and policyname = 'cost_entries_insert') then
    create policy cost_entries_insert on factory.cost_entries
      for insert with check (factory.has_perm(factory_id, 'purchasing', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'cost_entries' and policyname = 'cost_entries_update') then
    create policy cost_entries_update on factory.cost_entries
      for update using (factory.has_perm(factory_id, 'purchasing', 'edit'))
      with check (factory.has_perm(factory_id, 'purchasing', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'cost_entries' and policyname = 'cost_entries_delete') then
    create policy cost_entries_delete on factory.cost_entries
      for delete using (factory.has_perm(factory_id, 'purchasing', 'delete'));
  end if;
end;
$$;

-- cost_payments — purchasing
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'cost_payments' and policyname = 'cost_payments_read') then
    create policy cost_payments_read on factory.cost_payments
      for select using (factory.has_perm(factory_id, 'purchasing', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'cost_payments' and policyname = 'cost_payments_insert') then
    create policy cost_payments_insert on factory.cost_payments
      for insert with check (factory.has_perm(factory_id, 'purchasing', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'cost_payments' and policyname = 'cost_payments_update') then
    create policy cost_payments_update on factory.cost_payments
      for update using (factory.has_perm(factory_id, 'purchasing', 'edit'))
      with check (factory.has_perm(factory_id, 'purchasing', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'cost_payments' and policyname = 'cost_payments_delete') then
    create policy cost_payments_delete on factory.cost_payments
      for delete using (factory.has_perm(factory_id, 'purchasing', 'delete'));
  end if;
end;
$$;

-- recalls — quality
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'recalls' and policyname = 'recalls_read') then
    create policy recalls_read on factory.recalls
      for select using (factory.has_perm(factory_id, 'quality', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'recalls' and policyname = 'recalls_insert') then
    create policy recalls_insert on factory.recalls
      for insert with check (factory.has_perm(factory_id, 'quality', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'recalls' and policyname = 'recalls_update') then
    create policy recalls_update on factory.recalls
      for update using (factory.has_perm(factory_id, 'quality', 'edit'))
      with check (factory.has_perm(factory_id, 'quality', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'recalls' and policyname = 'recalls_delete') then
    create policy recalls_delete on factory.recalls
      for delete using (factory.has_perm(factory_id, 'quality', 'delete'));
  end if;
end;
$$;

-- workers — workers
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'workers' and policyname = 'workers_read') then
    create policy workers_read on factory.workers
      for select using (factory.has_perm(factory_id, 'workers', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'workers' and policyname = 'workers_insert') then
    create policy workers_insert on factory.workers
      for insert with check (factory.has_perm(factory_id, 'workers', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'workers' and policyname = 'workers_update') then
    create policy workers_update on factory.workers
      for update using (factory.has_perm(factory_id, 'workers', 'edit'))
      with check (factory.has_perm(factory_id, 'workers', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'workers' and policyname = 'workers_delete') then
    create policy workers_delete on factory.workers
      for delete using (factory.has_perm(factory_id, 'workers', 'delete'));
  end if;
end;
$$;

-- worker_earnings — workers
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'worker_earnings' and policyname = 'worker_earnings_read') then
    create policy worker_earnings_read on factory.worker_earnings
      for select using (factory.has_perm(factory_id, 'workers', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'worker_earnings' and policyname = 'worker_earnings_insert') then
    create policy worker_earnings_insert on factory.worker_earnings
      for insert with check (factory.has_perm(factory_id, 'workers', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'worker_earnings' and policyname = 'worker_earnings_update') then
    create policy worker_earnings_update on factory.worker_earnings
      for update using (factory.has_perm(factory_id, 'workers', 'edit'))
      with check (factory.has_perm(factory_id, 'workers', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'worker_earnings' and policyname = 'worker_earnings_delete') then
    create policy worker_earnings_delete on factory.worker_earnings
      for delete using (factory.has_perm(factory_id, 'workers', 'delete'));
  end if;
end;
$$;

-- worker_payments — workers
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'worker_payments' and policyname = 'worker_payments_read') then
    create policy worker_payments_read on factory.worker_payments
      for select using (factory.has_perm(factory_id, 'workers', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'worker_payments' and policyname = 'worker_payments_insert') then
    create policy worker_payments_insert on factory.worker_payments
      for insert with check (factory.has_perm(factory_id, 'workers', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'worker_payments' and policyname = 'worker_payments_update') then
    create policy worker_payments_update on factory.worker_payments
      for update using (factory.has_perm(factory_id, 'workers', 'edit'))
      with check (factory.has_perm(factory_id, 'workers', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'worker_payments' and policyname = 'worker_payments_delete') then
    create policy worker_payments_delete on factory.worker_payments
      for delete using (factory.has_perm(factory_id, 'workers', 'delete'));
  end if;
end;
$$;

-- parties — parties
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'parties' and policyname = 'parties_read') then
    create policy parties_read on factory.parties
      for select using (factory.has_perm(factory_id, 'parties', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'parties' and policyname = 'parties_insert') then
    create policy parties_insert on factory.parties
      for insert with check (factory.has_perm(factory_id, 'parties', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'parties' and policyname = 'parties_update') then
    create policy parties_update on factory.parties
      for update using (factory.has_perm(factory_id, 'parties', 'edit'))
      with check (factory.has_perm(factory_id, 'parties', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'parties' and policyname = 'parties_delete') then
    create policy parties_delete on factory.parties
      for delete using (factory.has_perm(factory_id, 'parties', 'delete'));
  end if;
end;
$$;

-- party_roles — parties
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'party_roles' and policyname = 'party_roles_read') then
    create policy party_roles_read on factory.party_roles
      for select using (factory.has_perm(factory_id, 'parties', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'party_roles' and policyname = 'party_roles_insert') then
    create policy party_roles_insert on factory.party_roles
      for insert with check (factory.has_perm(factory_id, 'parties', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'party_roles' and policyname = 'party_roles_update') then
    create policy party_roles_update on factory.party_roles
      for update using (factory.has_perm(factory_id, 'parties', 'edit'))
      with check (factory.has_perm(factory_id, 'parties', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'party_roles' and policyname = 'party_roles_delete') then
    create policy party_roles_delete on factory.party_roles
      for delete using (factory.has_perm(factory_id, 'parties', 'delete'));
  end if;
end;
$$;

-- party_contacts — parties
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'party_contacts' and policyname = 'party_contacts_read') then
    create policy party_contacts_read on factory.party_contacts
      for select using (factory.has_perm(factory_id, 'parties', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'party_contacts' and policyname = 'party_contacts_insert') then
    create policy party_contacts_insert on factory.party_contacts
      for insert with check (factory.has_perm(factory_id, 'parties', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'party_contacts' and policyname = 'party_contacts_update') then
    create policy party_contacts_update on factory.party_contacts
      for update using (factory.has_perm(factory_id, 'parties', 'edit'))
      with check (factory.has_perm(factory_id, 'parties', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'party_contacts' and policyname = 'party_contacts_delete') then
    create policy party_contacts_delete on factory.party_contacts
      for delete using (factory.has_perm(factory_id, 'parties', 'delete'));
  end if;
end;
$$;

-- party_addresses — parties
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'party_addresses' and policyname = 'party_addresses_read') then
    create policy party_addresses_read on factory.party_addresses
      for select using (factory.has_perm(factory_id, 'parties', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'party_addresses' and policyname = 'party_addresses_insert') then
    create policy party_addresses_insert on factory.party_addresses
      for insert with check (factory.has_perm(factory_id, 'parties', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'party_addresses' and policyname = 'party_addresses_update') then
    create policy party_addresses_update on factory.party_addresses
      for update using (factory.has_perm(factory_id, 'parties', 'edit'))
      with check (factory.has_perm(factory_id, 'parties', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'party_addresses' and policyname = 'party_addresses_delete') then
    create policy party_addresses_delete on factory.party_addresses
      for delete using (factory.has_perm(factory_id, 'parties', 'delete'));
  end if;
end;
$$;

-- party_communications — parties
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'party_communications' and policyname = 'party_communications_read') then
    create policy party_communications_read on factory.party_communications
      for select using (factory.has_perm(factory_id, 'parties', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'party_communications' and policyname = 'party_communications_insert') then
    create policy party_communications_insert on factory.party_communications
      for insert with check (factory.has_perm(factory_id, 'parties', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'party_communications' and policyname = 'party_communications_update') then
    create policy party_communications_update on factory.party_communications
      for update using (factory.has_perm(factory_id, 'parties', 'edit'))
      with check (factory.has_perm(factory_id, 'parties', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'party_communications' and policyname = 'party_communications_delete') then
    create policy party_communications_delete on factory.party_communications
      for delete using (factory.has_perm(factory_id, 'parties', 'delete'));
  end if;
end;
$$;

-- party_tasks — parties
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'party_tasks' and policyname = 'party_tasks_read') then
    create policy party_tasks_read on factory.party_tasks
      for select using (factory.has_perm(factory_id, 'parties', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'party_tasks' and policyname = 'party_tasks_insert') then
    create policy party_tasks_insert on factory.party_tasks
      for insert with check (factory.has_perm(factory_id, 'parties', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'party_tasks' and policyname = 'party_tasks_update') then
    create policy party_tasks_update on factory.party_tasks
      for update using (factory.has_perm(factory_id, 'parties', 'edit'))
      with check (factory.has_perm(factory_id, 'parties', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'party_tasks' and policyname = 'party_tasks_delete') then
    create policy party_tasks_delete on factory.party_tasks
      for delete using (factory.has_perm(factory_id, 'parties', 'delete'));
  end if;
end;
$$;

-- clients — parties
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'clients' and policyname = 'clients_read') then
    create policy clients_read on factory.clients
      for select using (factory.has_perm(factory_id, 'parties', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'clients' and policyname = 'clients_insert') then
    create policy clients_insert on factory.clients
      for insert with check (factory.has_perm(factory_id, 'parties', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'clients' and policyname = 'clients_update') then
    create policy clients_update on factory.clients
      for update using (factory.has_perm(factory_id, 'parties', 'edit'))
      with check (factory.has_perm(factory_id, 'parties', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'clients' and policyname = 'clients_delete') then
    create policy clients_delete on factory.clients
      for delete using (factory.has_perm(factory_id, 'parties', 'delete'));
  end if;
end;
$$;

-- products — sales
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'products' and policyname = 'products_read') then
    create policy products_read on factory.products
      for select using (factory.has_perm(factory_id, 'sales', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'products' and policyname = 'products_insert') then
    create policy products_insert on factory.products
      for insert with check (factory.has_perm(factory_id, 'sales', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'products' and policyname = 'products_update') then
    create policy products_update on factory.products
      for update using (factory.has_perm(factory_id, 'sales', 'edit'))
      with check (factory.has_perm(factory_id, 'sales', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'products' and policyname = 'products_delete') then
    create policy products_delete on factory.products
      for delete using (factory.has_perm(factory_id, 'sales', 'delete'));
  end if;
end;
$$;

-- product_variants — sales
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'product_variants' and policyname = 'product_variants_read') then
    create policy product_variants_read on factory.product_variants
      for select using (factory.has_perm(factory_id, 'sales', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'product_variants' and policyname = 'product_variants_insert') then
    create policy product_variants_insert on factory.product_variants
      for insert with check (factory.has_perm(factory_id, 'sales', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'product_variants' and policyname = 'product_variants_update') then
    create policy product_variants_update on factory.product_variants
      for update using (factory.has_perm(factory_id, 'sales', 'edit'))
      with check (factory.has_perm(factory_id, 'sales', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'product_variants' and policyname = 'product_variants_delete') then
    create policy product_variants_delete on factory.product_variants
      for delete using (factory.has_perm(factory_id, 'sales', 'delete'));
  end if;
end;
$$;

-- boms — sales
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'boms' and policyname = 'boms_read') then
    create policy boms_read on factory.boms
      for select using (factory.has_perm(factory_id, 'sales', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'boms' and policyname = 'boms_insert') then
    create policy boms_insert on factory.boms
      for insert with check (factory.has_perm(factory_id, 'sales', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'boms' and policyname = 'boms_update') then
    create policy boms_update on factory.boms
      for update using (factory.has_perm(factory_id, 'sales', 'edit'))
      with check (factory.has_perm(factory_id, 'sales', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'boms' and policyname = 'boms_delete') then
    create policy boms_delete on factory.boms
      for delete using (factory.has_perm(factory_id, 'sales', 'delete'));
  end if;
end;
$$;

-- bom_items — sales
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'bom_items' and policyname = 'bom_items_read') then
    create policy bom_items_read on factory.bom_items
      for select using (factory.has_perm(factory_id, 'sales', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'bom_items' and policyname = 'bom_items_insert') then
    create policy bom_items_insert on factory.bom_items
      for insert with check (factory.has_perm(factory_id, 'sales', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'bom_items' and policyname = 'bom_items_update') then
    create policy bom_items_update on factory.bom_items
      for update using (factory.has_perm(factory_id, 'sales', 'edit'))
      with check (factory.has_perm(factory_id, 'sales', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'bom_items' and policyname = 'bom_items_delete') then
    create policy bom_items_delete on factory.bom_items
      for delete using (factory.has_perm(factory_id, 'sales', 'delete'));
  end if;
end;
$$;

-- routing_steps — sales
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'routing_steps' and policyname = 'routing_steps_read') then
    create policy routing_steps_read on factory.routing_steps
      for select using (factory.has_perm(factory_id, 'sales', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'routing_steps' and policyname = 'routing_steps_insert') then
    create policy routing_steps_insert on factory.routing_steps
      for insert with check (factory.has_perm(factory_id, 'sales', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'routing_steps' and policyname = 'routing_steps_update') then
    create policy routing_steps_update on factory.routing_steps
      for update using (factory.has_perm(factory_id, 'sales', 'edit'))
      with check (factory.has_perm(factory_id, 'sales', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'routing_steps' and policyname = 'routing_steps_delete') then
    create policy routing_steps_delete on factory.routing_steps
      for delete using (factory.has_perm(factory_id, 'sales', 'delete'));
  end if;
end;
$$;

-- deliveries — sales
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'deliveries' and policyname = 'deliveries_read') then
    create policy deliveries_read on factory.deliveries
      for select using (factory.has_perm(factory_id, 'sales', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'deliveries' and policyname = 'deliveries_insert') then
    create policy deliveries_insert on factory.deliveries
      for insert with check (factory.has_perm(factory_id, 'sales', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'deliveries' and policyname = 'deliveries_update') then
    create policy deliveries_update on factory.deliveries
      for update using (factory.has_perm(factory_id, 'sales', 'edit'))
      with check (factory.has_perm(factory_id, 'sales', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'deliveries' and policyname = 'deliveries_delete') then
    create policy deliveries_delete on factory.deliveries
      for delete using (factory.has_perm(factory_id, 'sales', 'delete'));
  end if;
end;
$$;

-- collections — finance
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'collections' and policyname = 'collections_read') then
    create policy collections_read on factory.collections
      for select using (factory.has_perm(factory_id, 'finance', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'collections' and policyname = 'collections_insert') then
    create policy collections_insert on factory.collections
      for insert with check (factory.has_perm(factory_id, 'finance', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'collections' and policyname = 'collections_update') then
    create policy collections_update on factory.collections
      for update using (factory.has_perm(factory_id, 'finance', 'edit'))
      with check (factory.has_perm(factory_id, 'finance', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'collections' and policyname = 'collections_delete') then
    create policy collections_delete on factory.collections
      for delete using (factory.has_perm(factory_id, 'finance', 'delete'));
  end if;
end;
$$;

-- accounts — finance
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'accounts' and policyname = 'accounts_read') then
    create policy accounts_read on factory.accounts
      for select using (factory.has_perm(factory_id, 'finance', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'accounts' and policyname = 'accounts_insert') then
    create policy accounts_insert on factory.accounts
      for insert with check (factory.has_perm(factory_id, 'finance', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'accounts' and policyname = 'accounts_update') then
    create policy accounts_update on factory.accounts
      for update using (factory.has_perm(factory_id, 'finance', 'edit'))
      with check (factory.has_perm(factory_id, 'finance', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'accounts' and policyname = 'accounts_delete') then
    create policy accounts_delete on factory.accounts
      for delete using (factory.has_perm(factory_id, 'finance', 'delete'));
  end if;
end;
$$;

-- manual_tx — finance
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'manual_tx' and policyname = 'manual_tx_read') then
    create policy manual_tx_read on factory.manual_tx
      for select using (factory.has_perm(factory_id, 'finance', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'manual_tx' and policyname = 'manual_tx_insert') then
    create policy manual_tx_insert on factory.manual_tx
      for insert with check (factory.has_perm(factory_id, 'finance', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'manual_tx' and policyname = 'manual_tx_update') then
    create policy manual_tx_update on factory.manual_tx
      for update using (factory.has_perm(factory_id, 'finance', 'edit'))
      with check (factory.has_perm(factory_id, 'finance', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'manual_tx' and policyname = 'manual_tx_delete') then
    create policy manual_tx_delete on factory.manual_tx
      for delete using (factory.has_perm(factory_id, 'finance', 'delete'));
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- الحالات الخاصة
-- ─────────────────────────────────────────────────────────────

--
-- المصنع نفسه: مفتاحه `id` مش `factory_id`، والقراءة لأي عضو.
--
-- القراءة مش مربوطة بصلاحية «الإعدادات» بقصد: المشرف لازم يشوف اسم
-- المصنع اللي هو فيه، وإلا الواجهة بتفتح على مصنع بلا اسم.
--
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'factories' and policyname = 'factories_read') then
    create policy factories_read on factory.factories
      for select using (factory.my_role(id) is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'factories' and policyname = 'factories_insert') then
    create policy factories_insert on factory.factories
      for insert with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'factories' and policyname = 'factories_update') then
    create policy factories_update on factory.factories
      for update using (factory.has_perm(id, 'settings', 'edit'))
      with check (factory.has_perm(id, 'settings', 'edit'));
  end if;
end;
$$;

--
-- إعدادات المصنع: بيقراها أي عضو، وبيعدّلها صاحب الصلاحية.
--
-- نفس السبب: تحميل القطعة ونسبة الهامش المستهدف بتدخل في حسابات
-- بتظهر لكل الأدوار، فالقراءة لازم تكون مفتوحة للأعضاء.
--
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'factory_settings' and policyname = 'factory_settings_read') then
    create policy factory_settings_read on factory.factory_settings
      for select using (factory.my_role(factory_id) is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'factory_settings' and policyname = 'factory_settings_write') then
    create policy factory_settings_write on factory.factory_settings
      for insert with check (factory.has_perm(factory_id, 'settings', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'factory_settings' and policyname = 'factory_settings_update') then
    create policy factory_settings_update on factory.factory_settings
      for update using (factory.has_perm(factory_id, 'settings', 'edit'))
      with check (factory.has_perm(factory_id, 'settings', 'edit'));
  end if;
end;
$$;

--
-- الأعضاء: كل واحد بيشوف نفسه دايمًا، وشوفان الباقي بصلاحية الموظفين.
--
-- «بيشوف نفسه» مش رفاهية: الواجهة محتاجة سجل العضوية عشان تعرف
-- المستخدم داخل بأي دور. وبرضه الدعوات مربوطة بصلاحية الموظفين لأنها
-- إضافة ناس للمصنع.
--
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'members' and policyname = 'members_read') then
    create policy members_read on factory.members
      for select using (user_id = auth.uid() or factory.has_perm(factory_id, 'staff', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'members' and policyname = 'members_insert') then
    create policy members_insert on factory.members
      for insert with check (factory.has_perm(factory_id, 'staff', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'members' and policyname = 'members_update') then
    create policy members_update on factory.members
      for update using (factory.has_perm(factory_id, 'staff', 'edit'))
      with check (factory.has_perm(factory_id, 'staff', 'edit'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'members' and policyname = 'members_delete') then
    create policy members_delete on factory.members
      for delete using (factory.has_perm(factory_id, 'staff', 'delete'));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'invites' and policyname = 'invites_read') then
    create policy invites_read on factory.invites
      for select using (factory.has_perm(factory_id, 'staff', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'invites' and policyname = 'invites_insert') then
    create policy invites_insert on factory.invites
      for insert with check (factory.has_perm(factory_id, 'staff', 'create'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'invites' and policyname = 'invites_update') then
    create policy invites_update on factory.invites
      for update using (factory.has_perm(factory_id, 'staff', 'edit'))
      with check (factory.has_perm(factory_id, 'staff', 'edit'));
  end if;
end;
$$;

--
-- سجل التعديلات: بيتكتب، بيتقرا بصلاحية، **ومابيتعدّلش ومابيتمسحش**.
--
-- مافيش سياسة `update` ولا `delete` هنا، وده مقصود ومكتوب: سجل يمكن
-- تعديله مش سجل. وحتى صاحب المصنع مالوش `delete` على `audit` في
-- مصفوفة الأدوار — الافتراضي عرض وتصدير بس.
--
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'audit_log' and policyname = 'audit_log_read') then
    create policy audit_log_read on factory.audit_log
      for select using (factory.has_perm(factory_id, 'audit', 'view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'audit_log' and policyname = 'audit_log_append') then
    create policy audit_log_append on factory.audit_log
      for insert with check (factory.my_role(factory_id) is not null);
  end if;
end;
$$;

--
-- جداول المرجع العامة: قراءة لأي مستخدم داخل، وتعديل بـmigration بس.
--
alter table factory.perm_modules enable row level security;
alter table factory.reserved_subdomains enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'perm_modules' and policyname = 'perm_modules_read') then
    create policy perm_modules_read on factory.perm_modules
      for select using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'factory' and tablename = 'reserved_subdomains' and policyname = 'reserved_subdomains_read') then
    create policy reserved_subdomains_read on factory.reserved_subdomains
      for select using (true);
  end if;
end;
$$;

--
-- آخر حاجة: فحص إن مافيش جدول فاضل من غير سياسة.
--
-- الفحص ده جوه الـmigration بقصد. لو حد ضاف جدول جديد بـRLS ونسي
-- السياسة، الـmigration بيفشل هنا — بدل ما الجدول يطلع صفر صفوف على
-- السيرفر وحد يقعد يدوّر إسبوع.
--
do $$
declare
  v_missing text;
begin
  select string_agg(t.tablename, ', ')
  into v_missing
  from pg_tables t
  where t.schemaname = 'factory'
    and t.rowsecurity
    and not exists (
      select 1 from pg_policies p
      where p.schemaname = 'factory' and p.tablename = t.tablename
    );

  if v_missing is not null then
    raise exception 'جداول عليها RLS ومن غير سياسة (يعني مقفولة على الكل): %', v_missing;
  end if;
end;
$$;
