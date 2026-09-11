-- صنعة — schema مستقلة تتنقل لمشروع Supabase لوحده
-- لو هتستخدم مشروع الجيم: نفّذ الملف بعد ما تضيف factory في Exposed schemas

create schema if not exists factory;

create table factory.factories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) > 0),
  created_at timestamptz not null default now()
);

create table factory.members (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  email text not null,
  name text not null,
  role text not null check (role in ('owner', 'accountant', 'supervisor')),
  primary key (factory_id, id),
  unique (factory_id, email)
);

create table factory.invites (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  email text not null,
  role text not null check (role in ('owner', 'accountant', 'supervisor')),
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (factory_id, id)
);

create table factory.accounts (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('cash', 'bank', 'instapay', 'wallet')),
  primary key (factory_id, id)
);

create table factory.cost_items (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null,
  unit text not null default 'بند',
  primary key (factory_id, id)
);

create table factory.cost_entries (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  cost_item_id uuid not null,
  date date not null,
  vendor text not null default '',
  quantity numeric,
  amount numeric not null check (amount > 0),
  notes text not null default '',
  primary key (factory_id, id),
  foreign key (factory_id, cost_item_id) references factory.cost_items (factory_id, id)
);

create table factory.cost_payments (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  cost_entry_id uuid not null,
  date date not null,
  amount numeric not null check (amount > 0),
  account_id uuid not null,
  method text not null check (method in ('cash', 'bank', 'instapay', 'wallet', 'cheque')),
  primary key (factory_id, id),
  foreign key (factory_id, cost_entry_id) references factory.cost_entries (factory_id, id),
  foreign key (factory_id, account_id) references factory.accounts (factory_id, id)
);

create table factory.clients (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null check (char_length(name) > 0),
  phone text not null default '',
  notes text not null default '',
  primary key (factory_id, id)
);

create table factory.deliveries (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  client_id uuid not null,
  date date not null,
  due_date date not null,
  amount numeric not null check (amount > 0),
  model text not null default '',
  quantity numeric,
  notes text not null default '',
  primary key (factory_id, id),
  foreign key (factory_id, client_id) references factory.clients (factory_id, id)
);

create table factory.collections (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  client_id uuid not null,
  date date not null,
  amount numeric not null check (amount > 0),
  method text not null check (method in ('cash', 'bank', 'instapay', 'wallet', 'cheque')),
  account_id uuid not null,
  receipt_path text,
  status text not null check (status in ('confirmed', 'pending')),
  cheque_date date,
  notes text not null default '',
  primary key (factory_id, id),
  foreign key (factory_id, client_id) references factory.clients (factory_id, id),
  foreign key (factory_id, account_id) references factory.accounts (factory_id, id)
);

create table factory.workers (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null,
  pay_type text not null check (pay_type in ('daily', 'monthly', 'piece')),
  rate numeric not null default 0,
  phone text not null default '',
  primary key (factory_id, id)
);

create table factory.worker_earnings (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  worker_id uuid not null,
  date date not null,
  kind text not null check (kind in ('attendance', 'piece', 'bonus')),
  amount numeric not null default 0,
  notes text not null default '',
  primary key (factory_id, id),
  foreign key (factory_id, worker_id) references factory.workers (factory_id, id)
);

create table factory.worker_payments (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  worker_id uuid not null,
  date date not null,
  kind text not null check (kind in ('pay', 'advance', 'deduction')),
  amount numeric not null check (amount > 0),
  account_id uuid,
  notes text not null default '',
  primary key (factory_id, id),
  foreign key (factory_id, worker_id) references factory.workers (factory_id, id)
);

create table factory.orders (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  code text not null,
  client_id uuid,
  model text not null,
  line text not null default '',
  quantity numeric not null default 0,
  progress numeric not null default 0 check (progress between 0 and 100),
  piece_cost numeric not null default 0,
  piece_price numeric not null default 0,
  due_date date not null,
  status text not null default 'running' check (status in ('running', 'done', 'late', 'stopped')),
  notes text not null default '',
  primary key (factory_id, id),
  unique (factory_id, code)
);

create table factory.manual_tx (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  date date not null,
  account_id uuid not null,
  amount numeric not null,
  notes text not null default '',
  primary key (factory_id, id),
  foreign key (factory_id, account_id) references factory.accounts (factory_id, id)
);

create table factory.audit_log (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  actor_id uuid,
  actor_name text not null,
  action text not null check (action in ('create', 'update', 'delete', 'restore')),
  table_name text not null,
  record_id uuid,
  before jsonb,
  after jsonb,
  at timestamptz not null default now(),
  primary key (factory_id, id)
);

alter table factory.factories enable row level security;
alter table factory.members enable row level security;
alter table factory.invites enable row level security;
alter table factory.accounts enable row level security;
alter table factory.cost_items enable row level security;
alter table factory.cost_entries enable row level security;
alter table factory.cost_payments enable row level security;
alter table factory.clients enable row level security;
alter table factory.deliveries enable row level security;
alter table factory.collections enable row level security;
alter table factory.workers enable row level security;
alter table factory.worker_earnings enable row level security;
alter table factory.worker_payments enable row level security;
alter table factory.orders enable row level security;
alter table factory.manual_tx enable row level security;
alter table factory.audit_log enable row level security;
