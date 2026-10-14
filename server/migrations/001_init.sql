-- Users, sessions and one-time password links.

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null default '',
  role text not null check (role in ('admin', 'member', 'viewer')),
  -- Null until the user opens their invite link and chooses a password.
  password_hash text,
  must_change_password boolean not null default false,
  disabled boolean not null default false,
  failed_logins integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_email_key on users (lower(email));

-- Only a hash of the cookie value is stored, so a database leak yields no usable sessions.
create table sessions (
  token_hash text primary key,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user_id_idx on sessions (user_id);

create table password_tokens (
  token_hash text primary key,
  user_id uuid not null references users (id) on delete cascade,
  purpose text not null check (purpose in ('invite', 'reset')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index password_tokens_user_id_idx on password_tokens (user_id);

-- Business details and defaults: a single row of JSON.
create table settings (
  id boolean primary key default true check (id),
  data jsonb not null default '{}'
);
insert into settings default values;

-- One counter per document kind, incremented in the transaction that uses it.
create table number_sequences (
  kind text primary key check (kind in ('estimate', 'invoice')),
  next_seq integer not null default 1 check (next_seq >= 1)
);
insert into number_sequences (kind) values ('estimate'), ('invoice');

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  country text not null default '',
  currency text not null default '',
  tax_id text not null default '',
  notes text not null default '',
  archived boolean not null default false,
  -- The id this row had in the system it was imported from, so re-importing updates instead of duplicating.
  external_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  rate numeric(14, 2) not null default 0,
  archived boolean not null default false,
  external_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('estimate', 'invoice')),
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'approved', 'invoiced', 'paid', 'void')),
  number text not null,
  customer_id uuid not null references customers (id),
  currency text not null,
  issue_date date not null,
  due_date date,
  valid_until date,
  notes text not null default '',
  terms text not null default '',
  bank_details_title text not null default '',
  bank_details text not null default '',
  -- Business and customer details as they were when the document was approved.
  business_snapshot jsonb,
  customer_snapshot jsonb,
  converted_from_id uuid references documents (id),
  subtotal numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  created_by uuid references users (id),
  submitted_by uuid references users (id),
  approved_by uuid references users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, number)
);
create index documents_customer_id_idx on documents (customer_id);
create index documents_converted_from_id_idx on documents (converted_from_id);

create table document_lines (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  position integer not null,
  name text not null default '',
  description text not null default '',
  qty numeric(14, 4) not null default 1,
  rate numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0
);
create index document_lines_document_id_idx on document_lines (document_id, position);

create table document_adjustments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  position integer not null,
  label text not null default '',
  amount numeric(14, 2) not null default 0
);
create index document_adjustments_document_id_idx on document_adjustments (document_id, position);

create table payments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  date date not null,
  method text not null default '',
  note text not null default '',
  created_by uuid references users (id),
  created_at timestamptz not null default now()
);
create index payments_document_id_idx on payments (document_id);

-- The Activity tab. user_name is copied in so history survives a renamed or removed user.
create table document_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  type text not null,
  message text not null,
  reason text not null default '',
  user_id uuid references users (id) on delete set null,
  user_name text not null default '',
  created_at timestamptz not null default now()
);
create index document_events_document_id_idx on document_events (document_id, created_at);
