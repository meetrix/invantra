-- A catalogue item's rate is a figure in some currency; which one was never
-- recorded, so a USD rate and an LKR rate looked alike in the list. Existing
-- items are left blank rather than guessed at, and the forms fall back to the
-- business currency from Settings when the field is empty.
alter table items add column if not exists currency text not null default '';
