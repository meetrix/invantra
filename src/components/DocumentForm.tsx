import { useMemo, useState } from "react";
import { computeDocumentTotals, formatMoney } from "../../shared/money";
import type { Customer, DocumentInput, Item, PaymentAccount, Settings } from "../../shared/types";
import { createCustomer, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { AdjustmentsEditor } from "./AdjustmentsEditor";
import { blankCustomer, CustomerFields } from "./CustomerFields";
import { LineItemsEditor } from "./LineItemsEditor";
import { Modal } from "./Modal";
import {
  errorClass,
  hintClass,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
  textareaClass,
  textareaRows,
} from "./ui";

interface DocumentFormProps {
  document: DocumentInput;
  customers: Customer[];
  items: Item[];
  settings: Settings;
  /** The number the server will assign if the field is left blank; only for a new document. */
  nextNumber?: string;
  onChange: (document: DocumentInput) => void;
  /** Called after a customer is added from the form, so the list can include it. */
  onCustomerCreated: (customer: Customer) => void;
}

export function DocumentForm({
  document,
  customers,
  items,
  settings,
  nextNumber,
  onChange,
  onCustomerCreated,
}: DocumentFormProps) {
  const { can } = useAuth();
  const [addingCustomer, setAddingCustomer] = useState(false);

  const totals = useMemo(
    () => computeDocumentTotals(document.lineItems, document.adjustments),
    [document.lineItems, document.adjustments],
  );

  function update<K extends keyof DocumentInput>(key: K, value: DocumentInput[K]) {
    onChange({ ...document, [key]: value });
  }

  const isInvoice = document.kind === "invoice";
  const kindLabel = isInvoice ? "Invoice" : "Estimate";
  const dateField = isInvoice
    ? { key: "dueDate" as const, label: "Due date" }
    : { key: "validUntil" as const, label: "Expiry date" };

  const customer = customers.find((c) => c.id === document.customerId);
  // A document is priced in its customer's currency.
  const currency = customer?.currency || settings.currency;
  // An archived customer stays selectable on the document that already uses it.
  const selectable = customers.filter((c) => !c.archived || c.id === document.customerId);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 flex flex-col gap-1 text-sm">
          <label htmlFor="document-customer">Customer</label>
          <div className="flex gap-2">
            <select
              id="document-customer"
              required
              className={`${inputClass} min-w-0 flex-1`}
              value={document.customerId}
              onChange={(e) => update("customerId", e.target.value)}
            >
              <option value="" disabled>
                Select a customer…
              </option>
              {selectable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {can("customers.write") && (
              <button type="button" onClick={() => setAddingCustomer(true)} className={secondaryButton.replace("px-4 py-2", "px-3 py-1")}>
                + New customer
              </button>
            )}
          </div>
          {customer && <span className="text-xs text-gray-500">Priced in {currency}</span>}
        </div>
        <label className={labelClass}>
          {kindLabel}#
          <input
            type="text"
            required={!nextNumber}
            placeholder={nextNumber}
            title={nextNumber ? "Leave blank to use the next number" : undefined}
            className={inputClass}
            value={document.number}
            onChange={(e) => update("number", e.target.value)}
          />
        </label>
        <label className={labelClass}>
          Reference#
          <input
            type="text"
            maxLength={100}
            className={inputClass}
            value={document.reference}
            onChange={(e) => update("reference", e.target.value)}
          />
        </label>
        <label className={labelClass}>
          {kindLabel} date
          <input
            type="date"
            required
            className={inputClass}
            value={document.issueDate}
            onChange={(e) => update("issueDate", e.target.value)}
          />
        </label>
        <label className={labelClass}>
          {dateField.label}
          <input
            type="date"
            className={inputClass}
            value={document[dateField.key] ?? ""}
            onChange={(e) => update(dateField.key, e.target.value || null)}
          />
        </label>
        <label className={`${labelClass} col-span-2`}>
          Project name
          <input
            type="text"
            maxLength={200}
            className={inputClass}
            value={document.projectName}
            onChange={(e) => update("projectName", e.target.value)}
          />
        </label>
        <label className={`${labelClass} col-span-2 sm:col-span-4`}>
          Subject
          <input
            type="text"
            maxLength={500}
            placeholder={`Let your customer know what this ${kindLabel.toLowerCase()} is for`}
            className={inputClass}
            value={document.subject}
            onChange={(e) => update("subject", e.target.value)}
          />
        </label>
      </div>

      <LineItemsEditor
        lines={document.lineItems}
        currency={currency}
        items={items.filter((i) => !i.archived)}
        onChange={(lineItems) => update("lineItems", lineItems)}
      />

      <div className="flex flex-col gap-6 sm:flex-row sm:justify-between">
        <div className="sm:w-1/2">
          <h3 className="mb-2 text-sm font-medium text-gray-500">Charges</h3>
          <AdjustmentsEditor
            adjustments={document.adjustments}
            onChange={(adjustments) => update("adjustments", adjustments)}
          />
        </div>

        <div className="w-full space-y-1 text-sm sm:w-64">
          <div className="flex justify-between">
            <span className="text-gray-500">Sub Total</span>
            <span className="tabular-nums">{formatMoney(totals.subtotal, currency)}</span>
          </div>
          {document.adjustments.map((adj) => (
            <div key={adj.id} className="flex justify-between">
              <span className="text-gray-500">{adj.label || "Charge"}</span>
              <span className="tabular-nums">{formatMoney(adj.amount, currency)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-gray-200 pt-1 font-medium dark:border-gray-800">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(totals.total, currency)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Notes
          <textarea
            rows={textareaRows(document.notes, 5)}
            className={textareaClass}
            value={document.notes}
            onChange={(e) => update("notes", e.target.value)}
          />
        </label>
        <label className={labelClass}>
          Terms &amp; Conditions
          <textarea
            rows={textareaRows(document.terms, 5)}
            className={textareaClass}
            value={document.terms}
            onChange={(e) => update("terms", e.target.value)}
          />
        </label>
      </div>

      {/* Where to send the money belongs on an invoice; an estimate only quotes. */}
      {document.kind === "invoice" && (
        <PaymentDetailsPicker
          accounts={settings.bankAccounts}
          title={document.bankDetailsTitle}
          details={document.bankDetails}
          onChange={(title, details) => onChange({ ...document, bankDetailsTitle: title, bankDetails: details })}
        />
      )}

      {addingCustomer && (
        <NewCustomerDialog
          currency={settings.currency}
          onClose={() => setAddingCustomer(false)}
          onCreated={(created) => {
            onCustomerCreated(created);
            onChange({ ...document, customerId: created.id });
            setAddingCustomer(false);
          }}
        />
      )}
    </div>
  );
}

/** Adds a customer without leaving the document being written. */
function NewCustomerDialog({
  currency,
  onClose,
  onCreated,
}: {
  currency: string;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
}) {
  const [customer, setCustomer] = useState(() => blankCustomer(currency));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // The dialog sits inside the document form in React's tree, so without this the
    // submit would bubble up and save the document too.
    e.stopPropagation();
    setBusy(true);
    setError("");
    try {
      onCreated(await createCustomer(customer));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal title="New customer" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <CustomerFields customer={customer} onChange={setCustomer} />
        {error && <p className={errorClass}>{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={busy} className={primaryButton}>
            Save and select
          </button>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Which account this invoice asks to be paid into. The accounts come from
 * Settings, but the invoice keeps its own copy of the text it was sent with, so
 * an account edited later never rewrites an invoice already out.
 *
 * "Written here" covers the two cases a list cannot: an invoice raised before
 * the account was added, and a one-off set of instructions for one customer.
 */
function PaymentDetailsPicker({
  accounts,
  title,
  details,
  onChange,
}: {
  accounts: PaymentAccount[];
  title: string;
  details: string;
  onChange: (title: string, details: string) => void;
}) {
  const matching = accounts.find((a) => a.title === title && a.details === details);
  // Writing it here is a mode, not something the values can be read back from:
  // derived, the picker would snap back to an account the moment what was typed
  // happened to match one, and choosing it while an account was selected would
  // appear to do nothing at all.
  const [writingHere, setWritingHere] = useState(Boolean((title || details) && !matching));
  const selected = writingHere ? "custom" : !title && !details ? "" : (matching?.id ?? "custom");

  return (
    <div className="grid gap-3 sm:grid-cols-[18rem_1fr]">
      <label className={labelClass}>
        Payment details
        <select
          className={inputClass}
          value={selected}
          onChange={(e) => {
            const choice = e.target.value;
            setWritingHere(choice === "custom");
            // Switching away from an account gives empty boxes to type into
            // rather than that account's text to delete first.
            if (choice === "custom") return matching || !title ? onChange("", "") : undefined;
            if (choice === "") return onChange("", "");
            const account = accounts.find((a) => a.id === choice);
            if (account) onChange(account.title, account.details);
          }}
        >
          <option value="">None — do not print any</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.title}
            </option>
          ))}
          <option value="custom">Written here, just for this invoice</option>
        </select>
        <span className={hintClass}>
          {accounts.length === 0 ? "Add accounts in Settings to pick between them." : "Printed under this heading on the invoice."}
        </span>
      </label>

      {selected === "custom" ? (
        <div className="space-y-2">
          <input
            type="text"
            aria-label="Payment details heading"
            placeholder="Account Information for USD Wise Transaction"
            className={`${inputClass} w-full`}
            value={title}
            onChange={(e) => onChange(e.target.value, details)}
          />
          <textarea
            rows={textareaRows(details, 5)}
            aria-label="Payment details"
            placeholder="* **Name**: Acme Pty Ltd&#10;* **Account number**: 12345678"
            className={`${textareaClass} w-full`}
            value={details}
            onChange={(e) => onChange(title, e.target.value)}
          />
        </div>
      ) : (
        <div className="min-h-24 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm whitespace-pre-line text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
          {details ? (
            <>
              <p className="font-medium text-gray-900 dark:text-gray-100">{title}</p>
              <p className="mt-1">{details}</p>
            </>
          ) : (
            <p className="text-gray-400 dark:text-gray-500">Nothing about payment will be printed on this invoice.</p>
          )}
        </div>
      )}
    </div>
  );
}
