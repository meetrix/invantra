import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Customer, Document, DocumentInput, DocumentKind, Item, Settings } from "../../../shared/types";
import { DocumentForm } from "../../components/DocumentForm";
import { LoadState } from "../../components/LoadState";
import { PageHeader } from "../../components/PageHeader";
import { errorClass, primaryButton, secondaryButton } from "../../components/ui";
import { createDocument, errorMessage, getDocument, getNextNumber, getSettings, listCustomers, listItems } from "../../lib/api";
import { blankInput, copyOfDocument, invoiceFromEstimate } from "../../lib/documents";

interface Loaded {
  customers: Customer[];
  items: Item[];
  settings: Settings;
  /** The estimate being converted, when this is /invoices/new?from=<id>. */
  estimate: Document | null;
  /** The document being copied, when this is ?copy=<id>. */
  copied: Document | null;
}

export function DocumentEditor({ kind }: { kind: DocumentKind }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fromId = kind === "invoice" ? params.get("from") : null;
  // /estimates/new?copy=<id> and /invoices/new?copy=<id>: start from an existing one.
  const copyId = params.get("copy");

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [document, setDocument] = useState<DocumentInput | null>(null);
  const [nextNumber, setNextNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoaded(null);
    Promise.all([
      listCustomers(),
      listItems(),
      getSettings(),
      fromId ? getDocument(fromId) : null,
      copyId ? getDocument(copyId) : null,
    ])
      .then(([customers, items, settings, estimate, copied]) => {
        setLoaded({ customers, items, settings, estimate, copied });
        setDocument(
          estimate
            ? invoiceFromEstimate(estimate, settings)
            : copied
              ? copyOfDocument(copied, settings)
              : blankInput(kind, settings),
        );
      })
      .catch((err) => setError(errorMessage(err)));
  }, [kind, fromId, copyId]);

  // The number format can include the date, so the number follows the date
  // field. It is filled in rather than merely suggested, so it can be edited;
  // a number the user has typed is left alone.
  const issueDate = document?.issueDate;
  useEffect(() => {
    if (!issueDate) return;
    getNextNumber(kind, issueDate)
      .then((number) => {
        setNextNumber(number);
        setDocument((current) => (current && (!current.number || current.number === nextNumber) ? { ...current, number } : current));
      })
      .catch(() => setNextNumber(""));
    // nextNumber is read to recognise the value this effect filled in last time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, issueDate]);

  if (!loaded || !document) return <LoadState error={error} />;
  const { customers, items, settings, estimate, copied } = loaded;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!document) return;
    setSaving(true);
    setError("");
    try {
      const saved = await createDocument(document);
      navigate(`/${kind}s/${saved.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
      // Someone else took this number while the form was open: offer the next
      // one rather than leaving a number that can never be saved.
      if (document.number) {
        getNextNumber(kind, document.issueDate)
          .then((number) => {
            if (number === document.number) return;
            setNextNumber(number);
            setDocument({ ...document, number });
            setError(`That number has just been used. This ${kind} has been renumbered ${number}; check it and save again.`);
          })
          .catch(() => undefined);
      }
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <PageHeader
        title={copied ? `Copy ${kind}` : `New ${kind}`}
        backTo={estimate ? `/estimates/${estimate.id}` : `/${kind}s`}
        backLabel={estimate ? estimate.number : kind === "invoice" ? "Invoices" : "Estimates"}
      />
      <div>
        {estimate && (
          <p className="text-sm text-gray-500">
            From estimate{" "}
            <Link to={`/estimates/${estimate.id}`} className="underline">
              {estimate.number}
            </Link>
            . Review the details below; saving creates the invoice as a draft and marks the estimate invoiced.
          </p>
        )}
        {copied && (
          <p className="text-sm text-gray-500">
            Copied from{" "}
            <Link to={`/${copied.kind}s/${copied.id}`} className="underline">
              {copied.number}
            </Link>
            . Change what is different and save; the original is untouched.
          </p>
        )}
      </div>
      <DocumentForm
        document={document}
        customers={customers}
        items={items}
        settings={settings}
        nextNumber={nextNumber}
        onChange={setDocument}
        onCustomerCreated={(customer) => setLoaded({ ...loaded, customers: [...customers, customer] })}
      />
      {error && <p className={errorClass}>{error}</p>}
      <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
        <button type="submit" disabled={saving || !document.customerId} className={primaryButton}>
          Save as draft
        </button>
        <Link to={estimate ? `/estimates/${estimate.id}` : `/${kind}s`} className={secondaryButton}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
