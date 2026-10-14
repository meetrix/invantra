import type { CustomerInput } from "../lib/api";
import { CurrencySelect } from "./CurrencySelect";
import { inputClass, labelClass, textareaClass, textareaRows } from "./ui";

// eslint-disable-next-line react/only-export-components
export function blankCustomer(currency: string): CustomerInput {
  return {
    name: "",
    contactPerson: "",
    email: "",
    phone: "",
    address: "",
    country: "",
    currency,
    taxId: "",
    notes: "",
    archived: false,
  };
}

interface CustomerFieldsProps {
  customer: CustomerInput;
  onChange: (customer: CustomerInput) => void;
  disabled?: boolean;
}

/** The customer form's fields, shared by the customer page and the quick-add dialog on a document. */
export function CustomerFields({ customer, onChange, disabled }: CustomerFieldsProps) {
  function update<K extends keyof CustomerInput>(key: K, value: CustomerInput[K]) {
    onChange({ ...customer, [key]: value });
  }

  return (
    <fieldset disabled={disabled} className="space-y-4">
      <label className={labelClass}>
        Name
        <input
          required
          placeholder="Company name"
          className={inputClass}
          value={customer.name}
          onChange={(e) => update("name", e.target.value)}
        />
      </label>
      <label className={labelClass}>
        Contact person
        <input
          placeholder="Shown under the company name on documents"
          className={inputClass}
          value={customer.contactPerson}
          onChange={(e) => update("contactPerson", e.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Email
          <input type="email" className={inputClass} value={customer.email} onChange={(e) => update("email", e.target.value)} />
        </label>
        <label className={labelClass}>
          Phone
          <input className={inputClass} value={customer.phone} onChange={(e) => update("phone", e.target.value)} />
        </label>
      </div>
      <label className={labelClass}>
        Billing address
        <textarea
          rows={textareaRows(customer.address, 4)}
          className={textareaClass}
          value={customer.address}
          onChange={(e) => update("address", e.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Country
          <input
            placeholder="Printed as the last line of the address"
            className={inputClass}
            value={customer.country}
            onChange={(e) => update("country", e.target.value)}
          />
        </label>
        <label className={labelClass}>
          Currency
          <CurrencySelect className={inputClass} value={customer.currency} onChange={(code) => update("currency", code)} />
        </label>
      </div>
      <label className={labelClass}>
        Tax ID
        <input className={inputClass} value={customer.taxId} onChange={(e) => update("taxId", e.target.value)} />
      </label>
      <label className={labelClass}>
        Notes
        <textarea
          rows={textareaRows(customer.notes, 3)}
          className={textareaClass}
          value={customer.notes}
          onChange={(e) => update("notes", e.target.value)}
        />
      </label>
    </fieldset>
  );
}
