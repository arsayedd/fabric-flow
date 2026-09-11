-- صنعة — Migration 0003: جهات التعامل (Parties Core)
-- إضافية بالكامل. جدول clients القديم فاضل زي ما هو وبيتربط بـparty_id.
-- القرار المعماري في docs/parties.md (ADR-001): جدول واحد للجهات وأدوار فوقه.

create table if not exists factory.parties (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  kind text not null default 'company' check (kind in ('person', 'company')),
  name text not null check (char_length(name) > 0),
  trade_name text not null default '',
  legal_name text not null default '',
  code text not null default '',
  tax_id text not null default '',
  commercial_reg text not null default '',
  industry text not null default '',
  website text not null default '',
  email text not null default '',
  phone text not null default '',
  whatsapp text not null default '',
  address text not null default '',
  governorate text not null default '',
  city text not null default '',
  area text not null default '',
  notes text not null default '',
  -- ملاحظات داخلية لا تظهر في أي بورتال للعميل
  internal_notes text not null default '',
  tags text[] not null default '{}',
  credit_limit numeric not null default 0 check (credit_limit >= 0),
  payment_term_days integer not null default 0 check (payment_term_days >= 0),
  owner_member_id uuid,
  sales_rep_id uuid,
  collection_rep_id uuid,
  -- الدمج: السجل المكرر بيتأرشف ويشاور على الأساسي بدل ما يتحذف
  merged_into_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (factory_id, id),
  foreign key (factory_id, sales_rep_id) references factory.parties (factory_id, id),
  foreign key (factory_id, collection_rep_id) references factory.parties (factory_id, id),
  foreign key (factory_id, merged_into_id) references factory.parties (factory_id, id)
);

create index if not exists parties_phone_idx on factory.parties (factory_id, phone);
create index if not exists parties_tax_idx on factory.parties (factory_id, tax_id);

create table if not exists factory.party_roles (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  party_id uuid not null,
  role text not null check (role in (
    'customer', 'merchant', 'wholesale', 'retail', 'supplier', 'distributor', 'agent',
    'workshop', 'sales_rep', 'collection_rep', 'partner', 'service', 'shipping',
    'maintenance', 'contractor', 'worker', 'employee', 'other'
  )),
  primary key (factory_id, party_id, role),
  foreign key (factory_id, party_id) references factory.parties (factory_id, id) on delete cascade
);

create table if not exists factory.party_contacts (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  party_id uuid not null,
  name text not null,
  title text not null default '',
  phone text not null default '',
  email text not null default '',
  is_primary boolean not null default false,
  notes text not null default '',
  primary key (factory_id, id),
  foreign key (factory_id, party_id) references factory.parties (factory_id, id) on delete cascade
);

create table if not exists factory.party_addresses (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  party_id uuid not null,
  kind text not null default 'head_office'
    check (kind in ('head_office', 'warehouse', 'billing', 'shipping', 'branch', 'factory')),
  line text not null default '',
  governorate text not null default '',
  city text not null default '',
  notes text not null default '',
  primary key (factory_id, id),
  foreign key (factory_id, party_id) references factory.parties (factory_id, id) on delete cascade
);

create table if not exists factory.party_communications (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  party_id uuid not null,
  date date not null default current_date,
  channel text not null check (channel in ('call', 'whatsapp', 'email', 'sms', 'meeting', 'note')),
  subject text not null default '',
  body text not null default '',
  -- ملاحظة داخلية: متظهرش في أي بورتال خارجي
  internal boolean not null default false,
  actor_member_id uuid,
  actor_name text not null default '',
  next_action text not null default '',
  next_date date,
  created_at timestamptz not null default now(),
  primary key (factory_id, id),
  foreign key (factory_id, party_id) references factory.parties (factory_id, id) on delete cascade
);

create table if not exists factory.party_tasks (
  factory_id uuid not null references factory.factories(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  party_id uuid,
  title text not null check (char_length(title) > 0),
  due_date date not null,
  assignee_member_id uuid,
  assignee_name text not null default '',
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (factory_id, id),
  foreign key (factory_id, party_id) references factory.parties (factory_id, id) on delete cascade
);

create index if not exists party_tasks_due_idx on factory.party_tasks (factory_id, status, due_date);

-- ─────────────────────────────────────────────────────────────
-- الربط بالجداول القائمة — أعمدة nullable فقط، والبيانات القديمة تفضل صالحة
-- ─────────────────────────────────────────────────────────────

alter table factory.clients add column if not exists party_id uuid;
alter table factory.cost_entries add column if not exists party_id uuid;
alter table factory.orders add column if not exists party_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_party_fk') then
    alter table factory.clients add constraint clients_party_fk
      foreign key (factory_id, party_id) references factory.parties (factory_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cost_entries_party_fk') then
    alter table factory.cost_entries add constraint cost_entries_party_fk
      foreign key (factory_id, party_id) references factory.parties (factory_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_party_fk') then
    alter table factory.orders add constraint orders_party_fk
      foreign key (factory_id, party_id) references factory.parties (factory_id, id);
  end if;
end $$;

-- خطة الترحيل: كل عميل قائم بيتحوّل لجهة بنفس الـid ودور 'customer'،
-- فكل التوريدات والتحصيلات والأوامر تفضل مربوطة من غير أي تحويل للمفاتيح.
insert into factory.parties (factory_id, id, kind, name, phone, notes, created_at)
select c.factory_id, c.id, 'company', c.name, c.phone, c.notes, now()
from factory.clients c
where not exists (
  select 1 from factory.parties p where p.factory_id = c.factory_id and p.id = c.id
);

insert into factory.party_roles (factory_id, party_id, role)
select c.factory_id, c.id, 'customer'
from factory.clients c
on conflict do nothing;

update factory.clients c set party_id = c.id where c.party_id is null;

-- الموردون: كل اسم مورّد متكرر في بنود التكلفة يتحوّل لجهة بدور 'supplier'
insert into factory.parties (factory_id, id, kind, name, created_at)
select distinct e.factory_id, gen_random_uuid(), 'company', e.vendor, now()
from factory.cost_entries e
where char_length(trim(e.vendor)) > 0
  and not exists (
    select 1 from factory.parties p
    where p.factory_id = e.factory_id and p.name = e.vendor
  );

insert into factory.party_roles (factory_id, party_id, role)
select p.factory_id, p.id, 'supplier'
from factory.parties p
where exists (
  select 1 from factory.cost_entries e where e.factory_id = p.factory_id and e.vendor = p.name
)
on conflict do nothing;

update factory.cost_entries e
set party_id = p.id
from factory.parties p
where e.party_id is null and p.factory_id = e.factory_id and p.name = e.vendor;

alter table factory.parties enable row level security;
alter table factory.party_roles enable row level security;
alter table factory.party_contacts enable row level security;
alter table factory.party_addresses enable row level security;
alter table factory.party_communications enable row level security;
alter table factory.party_tasks enable row level security;
