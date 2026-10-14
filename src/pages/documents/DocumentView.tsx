import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { formatDate, formatDateTime, todayIso } from "../../../shared/date";
import { computeDocumentTotals, formatMoney, round2 } from "../../../shared/money";
import { MAX_ATTACHMENT_BYTES, MAX_PAYMENT_ATTACHMENTS } from "../../../shared/types";
import type { Customer, Document, DocumentKind, Item, Payment, Settings } from "../../../shared/types";
import { DocumentForm } from "../../components/DocumentForm";
import { LineItemsEditor } from "../../components/LineItemsEditor";
import { LoadState } from "../../components/LoadState";
import { Modal } from "../../components/Modal";
import { ReasonDialog } from "../../components/ReasonDialog";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { StatusRibbon } from "../../components/StatusRibbon";
import { dangerButton, errorClass, inputClass, labelClass, primaryButton, secondaryButton } from "../../components/ui";
import {
  approveDocument,
  attachmentUrl,
  convertToDraft,
  deletePaymentAttachment,
  errorMessage,
  getDocument,
  getSettings,
  listCustomers,
  listItems,
  recordPayment,
  rejectDocument,
  submitDocument,
  updateDocument,
  uploadPaymentAttachment,
  voidDocument,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { inputFromDocument, KIND_LABEL } from "../../lib/documents";
import { isEditable, paidAmount } from "../../lib/status";
import { useLoad } from "../../lib/useLoad";

type Tab = "details" | "activity";

/** Lets the action row above the form own a submit button for it. */
const DRAFT_FORM_ID = "draft-form";

export function DocumentView({ kind }: { kind: DocumentKind }) {
  const { id = "" } = useParams();
  const { can } = useAuth();
  const { data, error: loadError, setData } = useLoad(
    () => Promise.all([getDocument(id), listCustomers(), listItems(), getSettings()]),
    [id],
  );
  const [tab, setTab] = useState<Tab>("details");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<"to-draft" | "reject" | "payment" | null>(null);

  if (!data) return <LoadState error={loadError} />;
  const [document, customers, items, settings] = data;
  // /estimates/<an invoice's id> still finds the document; send it to its own address.
  if (document.kind !== kind) return <Navigate to={`/${document.kind}s/${document.id}`} replace />;

  const setDocument = (next: Document) => setData([next, customers, items, settings]);
  const label = KIND_LABEL[kind];
  const customer = customers.find((c) => c.id === document.customerId);
  const canWrite = can("documents.write");
  const canApprove = can("documents.approve");
  const hasPayments = document.payments.length > 0;
  const { status } = document;
  const editable = isEditable(document);
  // The reason an approver gave, shown while the document sits rejected.
  const rejection =
    status === "rejected" ? [...(document.events ?? [])].reverse().find((e) => e.type === "rejected") : undefined;

  /** Runs a status change and shows its result; returns the error message if it failed. */
  async function run(action: () => Promise<Document>): Promise<string | void> {
    setBusy(true);
    setError("");
    try {
      setDocument(await action());
    } catch (err) {
      setBusy(false);
      return errorMessage(err);
    }
    setBusy(false);
  }

  /** For buttons, which show a failure in the page's error line. */
  const act = (action: () => Promise<Document>) => run(action).then((message) => message && setError(message));

  const people = [
    document.createdByName && `Created by ${document.createdByName}`,
    document.submittedByName && `Submitted by ${document.submittedByName}`,
    document.approvedByName && `Approved by ${document.approvedByName}`,
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <PageHeader
        title={document.number}
        subtitle={customer?.name ?? "Unknown customer"}
        backTo={`/${kind}s`}
        backLabel={kind === "invoice" ? "Invoices" : "Estimates"}
      >
        <StatusBadge document={document} />
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        <Link to={`/documents/${document.id}/print`} target="_blank" rel="noreferrer" className={secondaryButton}>
          PDF / Print
        </Link>
        {status === "pending_approval" && canApprove && (
          <>
            <button type="button" disabled={busy} onClick={() => act(() => approveDocument(document.id))} className={primaryButton}>
              Approve
            </button>
            <button type="button" disabled={busy} onClick={() => setDialog("reject")} className={secondaryButton}>
              Reject
            </button>
          </>
        )}
        {/* The same button as the one under the form, so a long draft need not be scrolled to submit. */}
        {editable && canWrite && tab === "details" && (
          <button type="submit" form={DRAFT_FORM_ID} value="submit" disabled={busy} className={primaryButton}>
            {status === "rejected" ? "Resubmit for approval" : "Submit for approval"}
          </button>
        )}
        {status === "approved" && kind === "invoice" && can("payments.write") && (
          <button type="button" disabled={busy} onClick={() => setDialog("payment")} className={primaryButton}>
            Record payment
          </button>
        )}
        {status === "approved" && kind === "estimate" && canWrite && (
          <Link to={`/invoices/new?from=${document.id}`} className={primaryButton}>
            Convert to invoice
          </Link>
        )}
        {/* Any document can be copied, in any state: most are a small edit away from the last one. */}
        {canWrite && (
          <Link to={`/${kind}s/new?copy=${document.id}`} className={secondaryButton}>
            Copy
          </Link>
        )}
        {(status === "pending_approval" || status === "approved") && canWrite && !hasPayments && (
          <button
            type="button"
            disabled={busy}
            // Withdrawing a submission needs no explanation; undoing an approval does.
            onClick={() => (status === "approved" ? setDialog("to-draft") : act(() => convertToDraft(document.id, "")))}
            className={secondaryButton}
          >
            Convert to draft
          </button>
        )}
        {["draft", "rejected", "pending_approval", "approved"].includes(status) && canWrite && !hasPayments && (
          <button
            type="button"
            disabled={busy}
            onClick={() => confirm(`Void this ${kind}? This cannot be undone.`) && act(() => voidDocument(document.id))}
            className={dangerButton}
          >
            Void
          </button>
        )}
      </div>

      {error && <p className={errorClass}>{error}</p>}
      {status === "draft" && canWrite && (
        <p className="text-sm text-gray-500">
          This {kind} is a draft. Submit it for approval when it is ready
          {kind === "estimate" ? "; once approved it can be converted to an invoice." : "."}
        </p>
      )}
      {status === "rejected" && (
        <p className="text-sm text-red-700 dark:text-red-300">
          {rejection?.reason
            ? `Rejected by ${rejection.userName}: ${rejection.reason}`
            : `This ${kind} was rejected.`}
          {canWrite ? " Change what is needed and submit it again." : ""}
        </p>
      )}
      {status === "pending_approval" && !canApprove && (
        <p className="text-sm text-gray-500">Waiting for an admin to approve this {kind}.</p>
      )}

      <div className="text-sm text-gray-500">
        {people.length > 0 && <p>{people.join(" · ")}</p>}
        {document.convertedFromId && (
          <p>
            Converted from{" "}
            <Link to={`/estimates/${document.convertedFromId}`} className="underline">
              estimate
            </Link>
          </p>
        )}
        {document.convertedToId && (
          <p>
            Converted to{" "}
            <Link to={`/invoices/${document.convertedToId}`} className="underline">
              invoice
            </Link>
          </p>
        )}
      </div>

      <div role="tablist" className="flex gap-6 border-b border-gray-200 text-sm dark:border-gray-800">
        {(["details", "activity"] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            className={`-mb-px border-b-2 pb-2 ${
              tab === name
                ? "border-blue-600 font-medium text-gray-900 dark:text-gray-100"
                : "border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
            }`}
          >
            {name === "details" ? `${label} details` : "Activity"}
          </button>
        ))}
      </div>

      {tab === "activity" ? (
        <Activity document={document} />
      ) : (
        // Laid out as a sheet, with the status across its corner like a stamp.
        <div className="relative rounded border border-gray-200 p-6 dark:border-gray-800">
          <StatusRibbon document={document} />
          <div className="mb-4 min-h-20 text-right">
            <p className="text-2xl">{label}</p>
            <p className="text-sm font-semibold"># {document.number}</p>
          </div>
          {editable && canWrite ? (
            <DraftEditor
              document={document}
              customers={customers}
              items={items}
              settings={settings}
              onSaved={setDocument}
              onCustomerCreated={(created) => setData([document, [...customers, created], items, settings])}
            />
          ) : (
            <Details document={document} onChanged={setDocument} />
          )}
        </div>
      )}

      {dialog === "payment" && (
        <PaymentDialog
          document={document}
          onClose={() => setDialog(null)}
          onPaid={(next, warning) => {
            setDocument(next);
            setError(warning);
            setDialog(null);
          }}
        />
      )}

      {dialog === "to-draft" && (
        <ReasonDialog
          title="Convert to draft"
          prompt={`Enter a reason for converting this approved ${kind} to a draft. Once it is a draft, it has to be submitted for approval again.`}
          confirmLabel="Convert to draft"
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            const message = await run(() => convertToDraft(document.id, reason));
            if (message) return message;
            setDialog(null);
          }}
        />
      )}
      {dialog === "reject" && (
        <ReasonDialog
          title={`Reject ${kind}`}
          prompt={`Say what needs to change. The ${kind} goes back to draft and this note is kept in its activity.`}
          confirmLabel="Reject"
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            const message = await run(() => rejectDocument(document.id, reason));
            if (message) return message;
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

/** The editable form, shown while the document is a draft. */
function DraftEditor({
  document,
  customers,
  items,
  settings,
  onSaved,
  onCustomerCreated,
}: {
  document: Document;
  customers: Customer[];
  items: Item[];
  settings: Settings;
  onSaved: (document: Document) => void;
  onCustomerCreated: (customer: Customer) => void;
}) {
  const [draft, setDraft] = useState(() => inputFromDocument(document));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  /** Saves the form; with `submit`, also sends the saved draft for approval. */
  async function save(submit: boolean) {
    setBusy(true);
    setError("");
    try {
      // Submitting an untouched draft skips the save, which would only add an empty "updated" to its activity.
      if (dirty || !submit) {
        // Shown straight away, so a failed submit still leaves the saved draft on screen.
        onSaved(await updateDocument(document.id, draft));
        setDirty(false);
        setSaved(true);
      }
      if (submit) onSaved(await submitDocument(document.id));
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    // The button that was pressed decides; pressing Enter in a field only saves.
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    save(submitter?.value === "submit");
  }

  return (
    <form id={DRAFT_FORM_ID} onSubmit={handleSave} className="space-y-6">
      <DocumentForm
        document={draft}
        customers={customers}
        items={items}
        settings={settings}
        onChange={(next) => {
          setDraft(next);
          setDirty(true);
          setSaved(false);
        }}
        onCustomerCreated={onCustomerCreated}
      />
      {error && <p className={errorClass}>{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" value="save" disabled={busy} className={secondaryButton}>
          Save draft
        </button>
        <button type="submit" value="submit" disabled={busy || draft.lineItems.length === 0} className={primaryButton}>
          {dirty ? "Save and submit for approval" : "Submit for approval"}
        </button>
        {saved && (
          <span role="status" className="text-sm text-green-600">
            Saved.
          </span>
        )}
      </div>
    </form>
  );
}

/** The read-only view of anything past draft, plus payments on an invoice. */
function Details({ document, onChanged }: { document: Document; onChanged: (document: Document) => void }) {
  const { can } = useAuth();
  const isInvoice = document.kind === "invoice";
  const totals = computeDocumentTotals(document.lineItems, document.adjustments);
  const paid = paidAmount(document);
  const balance = round2(document.total - paid);
  const cur = document.currency;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 text-sm text-gray-500">
        <div>
          {KIND_LABEL[document.kind]} date {formatDate(document.issueDate)}
        </div>
        <div>
          {isInvoice
            ? document.dueDate && `Due ${formatDate(document.dueDate)}`
            : document.validUntil && `Expires ${formatDate(document.validUntil)}`}
        </div>
      </div>

      {(document.reference || document.projectName || document.subject) && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {(
            [
              ["Reference#", document.reference],
              ["Project", document.projectName],
              ["Subject", document.subject],
            ] as const
          ).map(
            ([name, value]) =>
              value && (
                <div key={name} className="contents">
                  <dt className="text-gray-500">{name}</dt>
                  <dd>{value}</dd>
                </div>
              ),
          )}
        </dl>
      )}

      <LineItemsEditor lines={document.lineItems} currency={cur} readOnly onChange={() => {}} />

      <div className="ml-auto w-64 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Sub Total</span>
          <span className="tabular-nums">{formatMoney(totals.subtotal, cur)}</span>
        </div>
        {document.adjustments.map((adj) => (
          <div key={adj.id} className="flex justify-between">
            <span className="text-gray-500">{adj.label || "Charge"}</span>
            <span className="tabular-nums">{formatMoney(adj.amount, cur)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-gray-200 pt-1 font-medium dark:border-gray-800">
          <span>Total</span>
          <span className="tabular-nums">{formatMoney(totals.total, cur)}</span>
        </div>
        {isInvoice && (
          <>
            <div className="flex justify-between">
              <span className="text-gray-500">Paid</span>
              <span className="tabular-nums">{formatMoney(paid, cur)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Balance</span>
              <span className="tabular-nums">{formatMoney(balance, cur)}</span>
            </div>
          </>
        )}
      </div>

      {(document.notes || document.terms) && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          {document.notes && (
            <div>
              <p className="font-medium text-gray-500">Notes</p>
              <p className="whitespace-pre-wrap">{document.notes}</p>
            </div>
          )}
          {document.terms && (
            <div>
              <p className="font-medium text-gray-500">Terms &amp; Conditions</p>
              <p className="whitespace-pre-wrap">{document.terms}</p>
            </div>
          )}
        </div>
      )}

      {isInvoice && document.payments.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-gray-500">Payments</h2>
          <ul className="divide-y divide-gray-100 rounded border border-gray-200 text-sm dark:divide-gray-800 dark:border-gray-800">
            {document.payments.map((p) => (
              <PaymentRow key={p.id} payment={p} currency={cur} canWrite={can("payments.write")} onChanged={onChanged} />
            ))}
          </ul>
        </div>
      )}

    </div>
  );
}

const tooBig = (file: File) => file.size > MAX_ATTACHMENT_BYTES;
const FILE_LIMITS = `Up to ${MAX_PAYMENT_ATTACHMENTS} files, 5 MB each.`;

/** One recorded payment with its files; files can be added or removed afterwards. */
function PaymentRow({
  payment: p,
  currency,
  canWrite,
  onChanged,
}: {
  payment: Payment;
  currency: string;
  canWrite: boolean;
  onChanged: (document: Document) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<Document>) {
    setBusy(true);
    setError("");
    try {
      onChanged(await action());
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  function attach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (tooBig(file)) return setError(`${file.name} is larger than 5 MB.`);
    run(() => uploadPaymentAttachment(p.id, file));
  }

  return (
    <li className="space-y-1 px-3 py-2">
      <div className="flex justify-between gap-4">
        <span>
          {[
            `#${p.number}`,
            formatDate(p.date),
            p.method,
            p.reference && `Ref ${p.reference}`,
            p.bankCharges > 0 && `Bank charges ${formatMoney(p.bankCharges, currency)}`,
            p.note,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="tabular-nums">{formatMoney(p.amount, currency)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {p.attachments.map((file) => (
          <span key={file.id} className="flex items-center gap-1">
            <a href={attachmentUrl(file.id)} className="text-blue-700 hover:underline dark:text-blue-400">
              {file.name}
            </a>
            {canWrite && (
              <button
                type="button"
                disabled={busy}
                aria-label={`Remove ${file.name}`}
                onClick={() => confirm(`Remove ${file.name}?`) && run(() => deletePaymentAttachment(file.id))}
                className="text-gray-400 hover:text-red-600"
              >
                ×
              </button>
            )}
          </span>
        ))}
        {canWrite && p.attachments.length < MAX_PAYMENT_ATTACHMENTS && (
          <label className="cursor-pointer text-gray-500 hover:text-gray-900 dark:hover:text-gray-100">
            {busy ? "Working…" : "+ Attach file"}
            <input type="file" disabled={busy} onChange={attach} className="sr-only" />
          </label>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </li>
  );
}

const PAYMENT_MODES = ["Bank transfer", "Wise", "Card", "Cash", "Cheque", "PayPal", "Payoneer", "Other"];

/** Records a payment against an approved invoice; paying the whole balance marks it paid. */
function PaymentDialog({
  document,
  onClose,
  onPaid,
}: {
  document: Document;
  onClose: () => void;
  /** `warning` names any file that could not be attached; the payment itself is saved. */
  onPaid: (document: Document, warning: string) => void;
}) {
  const balance = round2(document.total - paidAmount(document));
  const [amount, setAmount] = useState(balance);
  const [bankCharges, setBankCharges] = useState(0);
  const [date, setDate] = useState(todayIso());
  const [method, setMethod] = useState(PAYMENT_MODES[0]);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const filesError =
    files.length > MAX_PAYMENT_ATTACHMENTS
      ? `Choose at most ${MAX_PAYMENT_ATTACHMENTS} files.`
      : files.filter(tooBig).map((f) => `${f.name} is larger than 5 MB.`)[0] ?? "";
  const settles = amount === balance;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let saved = await recordPayment(document.id, { amount, bankCharges, date, method, reference, note });
      // The payment just recorded is the one with the highest number.
      const payment = saved.payments.reduce((a, b) => (b.number > a.number ? b : a));
      const failed: string[] = [];
      for (const file of files) {
        try {
          saved = await uploadPaymentAttachment(payment.id, file);
        } catch {
          failed.push(file.name);
        }
      }
      onPaid(
        saved,
        failed.length ? `The payment was saved, but these files could not be attached: ${failed.join(", ")}.` : "",
      );
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={`Payment for ${document.number}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-500">Balance due {formatMoney(balance, document.currency)}</p>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Amount received ({document.currency})
            <input
              type="number"
              step={0.01}
              min={0.01}
              max={balance}
              required
              value={amount || ""}
              onChange={(e) => setAmount(e.target.valueAsNumber || 0)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Bank charges (if any)
            <input
              type="number"
              step={0.01}
              min={0}
              max={amount}
              value={bankCharges || ""}
              onChange={(e) => setBankCharges(e.target.valueAsNumber || 0)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Payment date
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            Payment mode
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass}>
              {PAYMENT_MODES.map((mode) => (
                <option key={mode}>{mode}</option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Reference#
            <input value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            Notes
            <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={inputClass} />
          </label>
        </div>
        <label className={labelClass}>
          Attachments
          <input
            type="file"
            multiple
            onChange={(e) => setFiles([...(e.target.files ?? [])])}
            className="text-sm file:mr-3 file:rounded file:border file:border-gray-300 file:bg-transparent file:px-3 file:py-1 file:text-sm dark:file:border-gray-700"
          />
          <span className="text-xs text-gray-500">{FILE_LIMITS}</span>
        </label>
        {(filesError || error) && <p className={errorClass}>{filesError || error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={busy || Boolean(filesError)} className={primaryButton}>
            {settles ? "Save as paid" : "Save payment"}
          </button>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Who did what and when, newest first. */
function Activity({ document }: { document: Document }) {
  const events = document.events ?? [];
  if (events.length === 0) return <p className="text-sm text-gray-500">No activity yet.</p>;
  return (
    <ul className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
      {events.map((event) => (
        <li key={event.id} className="flex gap-6 py-3">
          <span className="w-40 shrink-0 text-gray-500 tabular-nums">{formatDateTime(event.createdAt)}</span>
          <div>
            <p>{event.message}</p>
            <p className="text-gray-500">by {event.userName || "a removed user"}</p>
            {event.reason && <p className="mt-1 whitespace-pre-wrap text-gray-700 dark:text-gray-300">Reason: {event.reason}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
