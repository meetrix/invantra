-- Estimates print no total unless asked: the customer often picks which lines
-- to take. Ticking "Show the total on the PDF" sets this. Invoices always print
-- their totals and ignore it.
alter table documents add column if not exists show_total boolean not null default false;
