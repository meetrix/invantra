alter table documents
  add column reference text not null default '',
  add column project_name text not null default '',
  add column subject text not null default '';

-- Proof of payment: remittance advice, bank slips. Kept in the database so a backup covers them.
create table payment_attachments (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments (id) on delete cascade,
  name text not null,
  content_type text not null default 'application/octet-stream',
  size integer not null check (size > 0),
  data bytea not null,
  created_by uuid references users (id),
  created_at timestamptz not null default now()
);
create index payment_attachments_payment_id_idx on payment_attachments (payment_id);
