import { useEffect, useState } from "react";
import { MAX_PAYMENT_ACCOUNTS, type PaymentAccount, type Settings } from "../../../shared/types";
import { CurrencySelect } from "../../components/CurrencySelect";
import { LoadState } from "../../components/LoadState";
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
  smallButton,
  textareaClass,
  textareaRows,
} from "../../components/ui";
import { errorMessage, getSettings, saveSettings } from "../../lib/api";
import { createId } from "../../lib/id";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (!settings) return <LoadState error={error} />;

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
    setSaved(false);
  }

  function updateAccount(index: number, patch: Partial<PaymentAccount>) {
    setSettings((s) =>
      s ? { ...s, bankAccounts: s.bankAccounts.map((a, i) => (i === index ? { ...a, ...patch } : a)) } : s,
    );
    setSaved(false);
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // The logo is stored inline with the settings and copied onto every approved document.
    if (file.size > 1_000_000) {
      setError("Choose a logo image smaller than 1 MB.");
      return;
    }
    setError("");
    const dataUrl = await readFileAsDataUrl(file);
    update("logoDataUrl", dataUrl);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setError("");
    try {
      setSettings(await saveSettings(settings));
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={handleSave} className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" subtitle="Business details, numbering and the defaults every document starts from" />

      <section className={`${cardClass} ${cardBodyClass} space-y-4`}>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Business details</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className={`${labelClass} col-span-2`}>
            Business name
            <input
              className={inputClass}
              value={settings.businessName}
              onChange={(e) => update("businessName", e.target.value)}
            />
          </label>
          <label className={labelClass}>
            Email
            <input
              className={inputClass}
              value={settings.businessEmail}
              onChange={(e) => update("businessEmail", e.target.value)}
            />
          </label>
          <label className={labelClass}>
            Phone
            <input
              className={inputClass}
              value={settings.businessPhone}
              onChange={(e) => update("businessPhone", e.target.value)}
            />
          </label>
          <label className={`${labelClass} col-span-2`}>
            Address
            <textarea
              rows={textareaRows(settings.businessAddress, 4)}
              className={textareaClass}
              value={settings.businessAddress}
              onChange={(e) => update("businessAddress", e.target.value)}
            />
          </label>
          <label className={labelClass}>
            Tax ID
            <input
              className={inputClass}
              value={settings.businessTaxId}
              onChange={(e) => update("businessTaxId", e.target.value)}
            />
          </label>
          <label className={labelClass}>
            Website
            <input
              placeholder="www.example.com"
              className={inputClass}
              value={settings.businessWebsite}
              onChange={(e) => update("businessWebsite", e.target.value)}
            />
          </label>
        </div>
        <div className={labelClass}>
          Logo
          <div className="flex items-center gap-4">
            {settings.logoDataUrl && (
              <img
                src={settings.logoDataUrl}
                alt="Logo preview"
                className="h-12 w-12 rounded-lg border border-gray-200 object-contain p-1 dark:border-gray-800"
              />
            )}
            {/* The browser's own file control reads "Choose File  No file chosen",
                which says nothing useful and cannot be styled; the real input is
                hidden behind a label that looks like every other button. */}
            <label className={`${secondaryButton} cursor-pointer`}>
              {settings.logoDataUrl ? "Replace logo" : "Upload logo"}
              <input type="file" accept="image/*" onChange={handleLogoChange} className="sr-only" />
            </label>
            {settings.logoDataUrl && (
              <button type="button" onClick={() => update("logoDataUrl", null)} className="text-sm text-gray-500 hover:text-red-600">
                Remove
              </button>
            )}
            <span className={hintClass}>PNG, JPEG, GIF, WebP or SVG, under 1 MB.</span>
          </div>
        </div>
      </section>

      <section className={`${cardClass} ${cardBodyClass} space-y-4`}>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Defaults</h2>
        <div className="grid grid-cols-3 gap-3">
          <label className={labelClass}>
            Default currency
            <CurrencySelect
              className={inputClass}
              value={settings.currency}
              onChange={(code) => update("currency", code)}
            />
          </label>
          <label className={labelClass}>
            Payment terms (days)
            <input
              type="number"
              min={0}
              className={inputClass}
              value={settings.defaultPaymentTermsDays}
              onChange={(e) => update("defaultPaymentTermsDays", e.target.valueAsNumber || 0)}
            />
          </label>
          <label className={labelClass}>
            Estimate validity (days)
            <input
              type="number"
              min={0}
              className={inputClass}
              value={settings.estimateValidityDays}
              onChange={(e) => update("estimateValidityDays", e.target.valueAsNumber || 0)}
            />
          </label>
        </div>
      </section>

      <section className={`${cardClass} ${cardBodyClass} space-y-4`}>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Document boilerplate</h2>
        <p className="text-xs text-gray-500">
          Copied onto each new estimate and invoice, then editable per document. Wrap words in{" "}
          <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">**double asterisks**</code> to print them bold.
        </p>
        <label className={labelClass}>
          Notes
          <textarea
            rows={textareaRows(settings.defaultNotes, 4)}
            className={textareaClass}
            value={settings.defaultNotes}
            onChange={(e) => update("defaultNotes", e.target.value)}
          />
        </label>
        <label className={labelClass}>
          Terms &amp; Conditions
          <textarea
            rows={textareaRows(settings.defaultTerms, 6)}
            className={textareaClass}
            value={settings.defaultTerms}
            onChange={(e) => update("defaultTerms", e.target.value)}
          />
        </label>
      </section>

      <section className={`${cardClass} ${cardBodyClass} space-y-4`}>
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Payment details</h2>
          <p className={`${hintClass} mt-1`}>
            One set per account or currency. An invoice picks one by its title and keeps its own copy of the text, so editing
            an account here never changes an invoice already sent.
          </p>
        </div>

        {settings.bankAccounts.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">No payment details yet.</p>
        )}

        {settings.bankAccounts.map((account, index) => (
          <div key={account.id} className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <div className="flex items-start gap-3">
              <label className={`${labelClass} flex-1`}>
                Title
                <input
                  placeholder="Account Information for USD Wise Transaction"
                  className={inputClass}
                  value={account.title}
                  onChange={(e) => updateAccount(index, { title: e.target.value })}
                />
              </label>
              <button
                type="button"
                onClick={() => update("bankAccounts", settings.bankAccounts.filter((_, i) => i !== index))}
                className={`${smallButton} mt-7 text-red-600 dark:text-red-400`}
              >
                Remove
              </button>
            </div>
            <label className={labelClass}>
              Details
              <textarea
                rows={textareaRows(account.details, 5)}
                placeholder="* **Name**: Acme Pty Ltd&#10;* **Account number**: 12345678"
                className={textareaClass}
                value={account.details}
                onChange={(e) => updateAccount(index, { details: e.target.value })}
              />
            </label>
          </div>
        ))}

        {settings.bankAccounts.length < MAX_PAYMENT_ACCOUNTS && (
          <button
            type="button"
            onClick={() =>
              update("bankAccounts", [...settings.bankAccounts, { id: createId(), title: "", details: "" }])
            }
            className={secondaryButton}
          >
            + Add payment details
          </button>
        )}
      </section>

      <section className={`${cardClass} ${cardBodyClass} space-y-4`}>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Numbering</h2>
        <p className="text-xs text-gray-500">
          Use <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">{"{seq}"}</code> for the counter, and{" "}
          <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">{"{YYYY}"}</code>/
          <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">{"{MM}"}</code>/
          <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">{"{DD}"}</code> for the document date.{" "}
          <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">{"{seq:3}"}</code> pads the counter to 3 digits.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Invoice number format
            <input
              className={`${inputClass} font-mono`}
              value={settings.invoiceNumberFormat}
              onChange={(e) => update("invoiceNumberFormat", e.target.value)}
            />
          </label>
          <label className={labelClass}>
            Estimate number format
            <input
              className={`${inputClass} font-mono`}
              value={settings.estimateNumberFormat}
              onChange={(e) => update("estimateNumberFormat", e.target.value)}
            />
          </label>
          <label className={labelClass}>
            Next invoice number
            <input
              type="number"
              min={1}
              className={inputClass}
              value={settings.nextInvoiceSeq}
              onChange={(e) => update("nextInvoiceSeq", Math.max(1, e.target.valueAsNumber || 1))}
            />
          </label>
          <label className={labelClass}>
            Next estimate number
            <input
              type="number"
              min={1}
              className={inputClass}
              value={settings.nextEstimateSeq}
              onChange={(e) => update("nextEstimateSeq", Math.max(1, e.target.valueAsNumber || 1))}
            />
          </label>
        </div>
        <p className="text-xs text-gray-500">
          Set the counters to carry on from an existing numbering series when migrating in.
        </p>
      </section>

      {error && <p className={errorClass}>{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" className={primaryButton}>
          Save settings
        </button>
        {saved && <span className="text-sm text-green-600">Saved.</span>}
      </div>
    </form>
  );
}
