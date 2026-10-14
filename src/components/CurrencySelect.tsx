import { CURRENCIES } from "../../shared/types";

/**
 * The currency picker. A code saved before it was on the list — or from an
 * import — is added to the options so editing a record cannot silently change
 * what it is priced in.
 */
export function CurrencySelect({
  value,
  onChange,
  className,
  id,
}: {
  value: string;
  onChange: (code: string) => void;
  className?: string;
  id?: string;
}) {
  const known = CURRENCIES.some((c) => c.code === value);
  return (
    <select id={id} className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      {!known && value && <option value={value}>{value}</option>}
      {CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.code} — {c.name}
        </option>
      ))}
    </select>
  );
}
