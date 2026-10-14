-- A rejected document is no longer silently returned to draft: it keeps a
-- status of its own so the list shows what happened and it can be resubmitted.
alter table documents drop constraint if exists documents_status_check;
alter table documents add constraint documents_status_check
  check (status in ('draft', 'pending_approval', 'rejected', 'approved', 'invoiced', 'paid', 'void'));

-- Numbers can now restart with each period. A format carrying the date, such as
-- MTX{YYYY}{MM}{seq:2}, counts within its month; one without, such as INV-{seq},
-- keeps a single running counter under the empty scope. The scope is the number
-- format with the counter removed, so it changes exactly when the prefix does.
alter table number_sequences add column if not exists scope text not null default '';

alter table number_sequences drop constraint if exists number_sequences_pkey;
alter table number_sequences add primary key (kind, scope);
