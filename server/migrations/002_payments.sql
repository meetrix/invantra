-- Payments get their own running number, a reference and the bank's cut,
-- so they can be listed and found on their own page.
create sequence payment_number_seq;

alter table payments
  add column number integer,
  add column reference text not null default '',
  add column bank_charges numeric(14, 2) not null default 0 check (bank_charges >= 0);

-- Number what is already there in the order it was recorded.
update payments p
   set number = n.number
  from (select id, nextval('payment_number_seq') as number
          from (select id from payments order by created_at, id) ordered) n
 where n.id = p.id;

alter table payments
  alter column number set default nextval('payment_number_seq'),
  alter column number set not null;
alter sequence payment_number_seq owned by payments.number;
create unique index payments_number_idx on payments (number);
