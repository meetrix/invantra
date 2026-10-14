import { StatusRibbon } from "../../components/StatusRibbon";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { formatDateNumeric } from "../../../shared/date";
import { computeDocumentTotals, formatAmount, formatMoney, formatQuantity } from "../../../shared/money";
import { snapshotBusiness, snapshotCustomer } from "../../../shared/snapshot";
import type { Document, PartySnapshot } from "../../../shared/types";
import { errorMessage, getCustomer, getDocument, getSettings } from "../../lib/api";
import { isAwaitingApproval, paidAmount } from "../../lib/status";

/*
 * Layout values below are in points, measured against reference PDFs of this
 * layout. Line pitch is 11.9pt for 9pt and 8pt text, 13.5pt for 10pt
 * headings, 10.5pt for notes and terms.
 */

/** Prints **double-asterisk** spans bold, e.g. the labels in bank details. */
function InlineBold({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
        /^\*\*[^*]+\*\*$/.test(part) ? (
          <strong key={i} className="font-bold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}

/**
 * Renders user-entered text one line per newline. Blank lines at either end are
 * trimmed, but blank lines in between are kept as a line of space — the source
 * documents use them to separate a description's summary from its spec list.
 * Wrapped lines run flush left, bullets included.
 */
function TextLines({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

  return (
    <>
      {lines.map((line, i) => (
        // A non-breaking space keeps an empty row at the full line height.
        <div key={i} className={className}>
          {line.trim() ? <InlineBold text={line} /> : " "}
        </div>
      ))}
    </>
  );
}

function LabelledValue({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-end">
      <span className="text-[10pt] leading-[13.5pt]">{label} :</span>
      <span className="w-[111.1pt] text-right">{value}</span>
    </div>
  );
}

function TotalRow({ label, value, bold, shaded }: { label: string; value: string; bold?: boolean; shaded?: boolean }) {
  return (
    <div className={`flex ${bold ? "font-bold" : ""} ${shaded ? "bg-[#f5f4f3] py-[9pt]" : "py-[7.5pt]"}`}>
      <span className="w-[156.3pt] pr-[7.4pt] text-right">{label}</span>
      <span className="flex-1 pr-[7.5pt] text-right">{value}</span>
    </div>
  );
}

const headCell = "py-[6pt] font-normal";
const bodyCell = "pt-[7.45pt] pb-[7.3pt]";

export function DocumentPrint() {
  const { id } = useParams();
  const [document, setDocument] = useState<Document | null | undefined>(undefined);
  const [business, setBusiness] = useState<PartySnapshot | null>(null);
  const [customer, setCustomer] = useState<PartySnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      const doc = await getDocument(id);
      // An approved document prints the details frozen onto it; before that, the live ones.
      setBusiness(doc.businessSnapshot ?? snapshotBusiness(await getSettings()));
      setCustomer(doc.customerSnapshot ?? snapshotCustomer(await getCustomer(doc.customerId)));
      setDocument(doc);
    })().catch((err) => {
      setError(errorMessage(err));
      setDocument(null);
    });
  }, [id]);

  useEffect(() => {
    if (!document) return;
    const timer = setTimeout(() => window.print(), 300);
    return () => clearTimeout(timer);
  }, [document]);

  // `document` here is the invoice, so the global needs an explicit window.
  const docNumber = document?.number ?? null;
  useEffect(() => {
    const previous = window.document.title;
    if (docNumber) window.document.title = docNumber;
    return () => {
      window.document.title = previous;
    };
  }, [docNumber]);

  if (document === undefined) return <p className="p-8 text-gray-500">Loading…</p>;
  if (document === null) return <p className="p-8 text-gray-500">{error || "Not found."}</p>;

  const totals = computeDocumentTotals(document.lineItems, document.adjustments);
  const paid = paidAmount(document);
  const balance = totals.total - paid;
  const isInvoice = document.kind === "invoice";
  const kindLabel = isInvoice ? "Invoice" : "Estimate";
  const cur = document.currency;
  // The Discount column only appears when some line has a discount (zeros are shown then).
  const showDiscount = document.lineItems.some((l) => l.discount > 0);
  const hasContactLines = Boolean(customer?.phone || customer?.email);
  // Where to send the money belongs on an invoice; estimates saved before that
  // rule may still carry the text, so the check is on the kind, not the field.
  const showBankDetails = isInvoice && Boolean(document.bankDetails);
  const hasAddress = Boolean(customer?.address.trim() || customer?.country);

  return (
    <div className="print-page mx-auto max-w-4xl bg-white p-10 text-[9pt] leading-[11.9pt]">
      {/* Printed once per sheet: position:fixed repeats on every page in print. */}
      <div className="print-page-rule" aria-hidden="true" />
      {isAwaitingApproval(document) && (
        <div className="print-watermark" aria-hidden="true">
          <span>Yet to be Approved</span>
        </div>
      )}

      <StatusRibbon document={document} />
      <div className="no-print mb-6 flex justify-end">
        <button
          onClick={() => window.print()}
          className="rounded bg-gray-900 px-4 py-2 font-sans text-sm text-white"
        >
          Print / Save as PDF
        </button>
      </div>

      {/* ── Header: business on the left, document identity on the right ── */}
      <header className="mb-[23.9pt] flex items-start justify-between gap-8 pl-[0.8pt]">
        <div className="pt-[6.75pt]">
          {/* Invoices draw the logo larger than estimates. */}
          {business?.logoDataUrl && (
            <img
              src={business.logoDataUrl}
              alt=""
              className={`mb-[2.6pt] ${isInvoice ? "h-[68.18pt]" : "h-[61.35pt]"}`}
            />
          )}
          <p className="text-[10pt] leading-[13.5pt] font-bold">{business?.name}</p>
          <TextLines text={business?.address ?? ""} />
          {business?.phone && <div>Phone : {business.phone}</div>}
          {business?.website && <div>Website : {business.website}</div>}
          {business?.email && <div>{business.email}</div>}
        </div>
        <div className="shrink-0 text-right">
          {/* The title and number stop 1.2pt short of the right edge. */}
          <h1 className="mt-[11.2pt] mr-[1.2pt] text-[28pt] leading-[28pt] font-normal text-black">{kindLabel}</h1>
          <p className="mt-[4.5pt] mr-[1.2pt] text-[10pt] leading-[13.5pt] font-bold"># {document.number}</p>
          {/* Estimates show no total anywhere: the customer picks which line items to take. */}
          {isInvoice && (
            <>
              <p className="mt-[15.5pt] text-[8pt] font-bold">Balance Due</p>
              <p className="text-[12pt] leading-[16pt] font-bold">{formatMoney(balance, cur)}</p>
            </>
          )}
        </div>
      </header>

      {/* ── Bill To, with the dates bottom-aligned in the opposite column ── */}
      <section className="mb-[15.7pt] flex items-end justify-between gap-8 pl-[0.8pt]">
        <div>
          <p className="text-[10pt] leading-[13.5pt]">Bill To</p>
          <p className="font-bold">{customer?.name}</p>
          {customer?.contactPerson && <div>{customer.contactPerson}</div>}
          <TextLines text={customer?.address ?? ""} />
          {customer?.country && <div>{customer.country}</div>}
          {/* A blank line separates the postal address from phone and email. */}
          {hasContactLines && hasAddress && <div aria-hidden="true">{" "}</div>}
          {customer?.phone && <div>{customer.phone}</div>}
          {customer?.email && <div>{customer.email}</div>}
        </div>
        <div className="shrink-0 space-y-[7.3pt] pb-[3.6pt]">
          <LabelledValue
            label={isInvoice ? "Invoice Date" : "Estimate Date"}
            value={formatDateNumeric(document.issueDate)}
          />
          <LabelledValue
            label={isInvoice ? "Due Date" : "Expiry Date"}
            value={formatDateNumeric(isInvoice ? document.dueDate : document.validUntil)}
          />
          <LabelledValue label="Tax ID" value={customer?.taxId ?? ""} />
        </div>
      </section>

      {/* ── Line items ── */}
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr className="bg-[#3c3d3a] text-white">
            <th className={`${headCell} w-[25.7pt] pr-[8.3pt] text-right`}>#</th>
            <th className={`${headCell} pl-[15pt] text-left`}>Item &amp; Description</th>
            <th className={`${headCell} w-[56.6pt] pr-[8.4pt] text-right`}>Qty</th>
            <th className={`${headCell} w-[56.7pt] pr-[8.4pt] text-right`}>Rate</th>
            {showDiscount && <th className={`${headCell} w-[56.6pt] pr-[8.4pt] text-right`}>Discount</th>}
            <th className={`${headCell} w-[77.2pt] pr-[8.4pt] text-right`}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {document.lineItems.map((line, i) => (
            <tr key={line.id} className="break-inside-avoid border-b-[0.7pt] border-[#adadad] align-top text-black">
              <td className={`${bodyCell} pr-[8.3pt] text-right`}>{i + 1}</td>
              <td className={`${bodyCell} pl-[15pt]`}>
                <div>{line.name}</div>
                {/*
                  A description line is kept even when it's empty. Estimates print it 8pt #333,
                  invoices in the name's 9pt black.
                */}
                <div className={`min-h-[11.9pt] ${isInvoice ? "" : "text-[8pt] text-[#333333]"}`}>
                  <TextLines text={line.description} />
                </div>
              </td>
              <td className={`${bodyCell} pr-[7.4pt] text-right`}>{formatQuantity(line.qty)}</td>
              <td className={`${bodyCell} pr-[7.4pt] text-right`}>{formatAmount(line.rate)}</td>
              {showDiscount && (
                <td className={`${bodyCell} pr-[7.4pt] text-right`}>{formatAmount(line.discount)}</td>
              )}
              <td className={`${bodyCell} pr-[7.4pt] text-right`}>{formatAmount(totals.lines[i].amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Totals (invoices only — see the header) ── */}
      {isInvoice && (
        <div className="ml-auto w-[257.5pt] break-inside-avoid text-black">
          <TotalRow label="Sub Total" value={formatAmount(totals.subtotal)} />
          {document.adjustments.map((adj) => (
            <TotalRow key={adj.id} label={adj.label || "Charge"} value={formatAmount(adj.amount)} />
          ))}
          <TotalRow bold label="Total" value={formatMoney(totals.total, cur)} />
          {paid > 0 && <TotalRow label="Payment Made" value={`(-) ${formatAmount(paid)}`} />}
          <TotalRow bold shaded label="Balance Due" value={formatMoney(balance, cur)} />
        </div>
      )}

      {document.notes && (
        <section className={isInvoice ? "mt-[37.4pt]" : "mt-[28.7pt]"}>
          <p className="text-[10pt] leading-[13.5pt]">Notes</p>
          <div className="mt-[5.2pt] text-[8pt] leading-[10.5pt]">
            <TextLines text={document.notes} />
          </div>
        </section>
      )}

      {showBankDetails && (
        // Unlike line items, this section may split across pages.
        <section className={document.notes ? "mt-[8.8pt]" : isInvoice ? "mt-[37.4pt]" : "mt-[28.7pt]"}>
          <p className="text-[9.75pt] leading-[13.5pt] font-bold underline decoration-[0.9pt] underline-offset-[2.4pt]">
            {document.bankDetailsTitle || "Payment Details"}
          </p>
          <div className="mt-[13.2pt] text-[9.75pt] leading-[13.33pt]">
            <TextLines text={document.bankDetails} />
          </div>
        </section>
      )}

      {document.terms && (
        <section
          className={
            showBankDetails
              ? "mt-[45.9pt]"
              : document.notes
                ? "mt-[8.7pt]"
                : isInvoice
                  ? "mt-[37.4pt]"
                  : "mt-[28.7pt]"
          }
        >
          <p className="text-[10pt] leading-[13.5pt]">Terms &amp; Conditions</p>
          <div className="mt-[5.2pt] text-[8pt] leading-[10.5pt]">
            <TextLines text={document.terms} />
          </div>
        </section>
      )}
    </div>
  );
}
