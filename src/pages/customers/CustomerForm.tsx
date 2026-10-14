import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { blankCustomer, CustomerFields } from "../../components/CustomerFields";
import { FormActions } from "../../components/FormActions";
import { LoadState } from "../../components/LoadState";
import { PageHeader } from "../../components/PageHeader";
import { cardBodyClass, cardClass, errorClass, primaryButton, secondaryButton } from "../../components/ui";
import { createCustomer, errorMessage, getCustomer, getSettings, updateCustomer, type CustomerInput } from "../../lib/api";
import { useAuth } from "../../lib/auth";

export function CustomerForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [customer, setCustomer] = useState<CustomerInput | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canWrite = can("customers.write");

  useEffect(() => {
    // A new customer starts in the business's own currency.
    const load = id ? getCustomer(id) : getSettings().then((s) => blankCustomer(s.currency));
    load.then(setCustomer).catch((err) => setError(errorMessage(err)));
  }, [id]);

  if (!customer) return <LoadState error={error} />;

  async function save(next: CustomerInput) {
    setBusy(true);
    setError("");
    try {
      if (id) await updateCustomer(id, next);
      else await createCustomer(next);
      navigate("/customers");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(customer);
      }}
      className="mx-auto max-w-2xl space-y-5"
    >
      <PageHeader title={id ? (canWrite ? "Edit customer" : customer.name) : "New customer"} backTo="/customers" backLabel="Customers" />
      <div className={cardClass}>
        <div className={cardBodyClass}>
          <CustomerFields customer={customer} onChange={setCustomer} disabled={!canWrite} />
        </div>
      </div>
      {error && <p className={errorClass}>{error}</p>}
      {canWrite && (
        <FormActions cancelTo="/customers">
          <button type="submit" disabled={busy} className={primaryButton}>
            {id ? "Save customer" : "Create customer"}
          </button>
          {id && (
            <button
              type="button"
              disabled={busy}
              onClick={() => save({ ...customer, archived: !customer.archived })}
              className={secondaryButton}
            >
              {customer.archived ? "Unarchive" : "Archive"}
            </button>
          )}
        </FormActions>
      )}
    </form>
  );
}
