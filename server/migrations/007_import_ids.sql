-- Estimates, invoices and payments can now be imported from CSV. Like customers
-- and items, each keeps the id it had in the file, so importing the same file
-- again updates instead of duplicating.
alter table documents add column if not exists external_id text;
create unique index if not exists documents_kind_external_id_key on documents (kind, external_id);

alter table payments add column if not exists external_id text;
create unique index if not exists payments_external_id_key on payments (external_id);
