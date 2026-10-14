import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CurrencySelect } from "../../components/CurrencySelect";
import { FormActions } from "../../components/FormActions";
import { LoadState } from "../../components/LoadState";
import { MoneyInput } from "../../components/MoneyInput";
import { PageHeader } from "../../components/PageHeader";
import {
  cardBodyClass,
  cardClass,
  errorClass,
  hintClass,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
  textareaClass,
  textareaRows,
} from "../../components/ui";
import { createItem, errorMessage, getSettings, listItems, updateItem, type ItemInput } from "../../lib/api";
import { useAuth } from "../../lib/auth";

const blank = (currency: string): ItemInput => ({ name: "", description: "", rate: 0, currency, archived: false });

export function ItemForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const copyId = params.get("copy");
  const navigate = useNavigate();
  const { can } = useAuth();
  const [item, setItem] = useState<ItemInput | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canWrite = can("items.write");
  const update = (patch: Partial<ItemInput>) => item && setItem({ ...item, ...patch });

  useEffect(() => {
    const wanted = id ?? copyId;
    Promise.all([getSettings(), wanted ? listItems() : null])
      .then(([settings, items]) => {
        if (!wanted) return setItem(blank(settings.currency));
        const found = items?.find((i) => i.id === wanted);
        if (!found) return setError("Item not found.");
        // A copy is a new item, so it carries no archived flag and says it is one.
        setItem(
          copyId && !id
            ? { ...found, name: `${found.name} (copy)`, currency: found.currency || settings.currency, archived: false }
            : { ...found, currency: found.currency || settings.currency },
        );
      })
      .catch((err) => setError(errorMessage(err)));
  }, [id, copyId]);

  if (!item) return <LoadState error={error} />;

  async function save(next: ItemInput) {
    setBusy(true);
    setError("");
    try {
      if (id) await updateItem(id, next);
      else await createItem(next);
      navigate("/items");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const title = id ? (canWrite ? "Edit item" : item.name) : copyId ? "Copy item" : "New item";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(item);
      }}
      className="mx-auto max-w-2xl space-y-5"
    >
      <PageHeader title={title} backTo="/items" backLabel="Items">
        {id && canWrite && (
          <Link to={`/items/new?copy=${id}`} className={secondaryButton}>
            Copy
          </Link>
        )}
      </PageHeader>

      <div className={cardClass}>
        <fieldset disabled={!canWrite} className={`${cardBodyClass} space-y-4`}>
          <label className={labelClass}>
            Name
            <input required className={inputClass} value={item.name} onChange={(e) => update({ name: e.target.value })} />
          </label>
          <label className={labelClass}>
            Description
            <span className={hintClass}>One per line. Copied onto the line item, where it can be edited.</span>
            <textarea
              rows={textareaRows(item.description, 5, 20)}
              placeholder="* One shard handles up to 1,000 concurrent users"
              className={textareaClass}
              value={item.description}
              onChange={(e) => update({ description: e.target.value })}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Rate
              <MoneyInput value={item.rate} min={0} onChange={(rate) => update({ rate })} />
            </label>
            <label className={labelClass}>
              Currency
              <CurrencySelect className={inputClass} value={item.currency} onChange={(currency) => update({ currency })} />
            </label>
          </div>
        </fieldset>
      </div>

      {error && <p className={errorClass}>{error}</p>}

      {canWrite && (
        <FormActions cancelTo="/items">
          <button type="submit" disabled={busy} className={primaryButton}>
            {id ? "Save item" : "Create item"}
          </button>
          {id && (
            <button type="button" disabled={busy} onClick={() => save({ ...item, archived: !item.archived })} className={secondaryButton}>
              {item.archived ? "Unarchive" : "Archive"}
            </button>
          )}
        </FormActions>
      )}
    </form>
  );
}
