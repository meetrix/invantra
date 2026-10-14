import { addDays, todayIso } from "../../shared/date";
import type { Document, DocumentInput, DocumentKind, Settings } from "../../shared/types";
import { createId } from "./id";

export const KIND_LABEL: Record<DocumentKind, string> = { estimate: "Estimate", invoice: "Invoice" };

/** A new document, carrying the defaults from Settings. */
export function blankInput(kind: DocumentKind, settings: Settings): DocumentInput {
  const today = todayIso();
  return {
    kind,
    number: "",
    customerId: "",
    issueDate: today,
    dueDate: kind === "invoice" ? addDays(today, settings.defaultPaymentTermsDays) : null,
    // Zero validity days means estimates carry no expiry date.
    validUntil: kind === "estimate" && settings.estimateValidityDays > 0 ? addDays(today, settings.estimateValidityDays) : null,
    reference: "",
    projectName: "",
    subject: "",
    notes: settings.defaultNotes,
    terms: settings.defaultTerms,
    // Estimates quote for work; where to send the money belongs on the invoice,
    // which starts with the first set of payment details and can be switched.
    bankDetailsTitle: kind === "invoice" ? (settings.bankAccounts[0]?.title ?? "") : "",
    bankDetails: kind === "invoice" ? (settings.bankAccounts[0]?.details ?? "") : "",
    lineItems: [],
    adjustments: [],
    convertedFromId: null,
  };
}

/** The editable fields of a saved document, for the draft form. */
export function inputFromDocument(document: Document): DocumentInput {
  return {
    kind: document.kind,
    number: document.number,
    customerId: document.customerId,
    issueDate: document.issueDate,
    dueDate: document.dueDate,
    validUntil: document.validUntil,
    reference: document.reference,
    projectName: document.projectName,
    subject: document.subject,
    notes: document.notes,
    terms: document.terms,
    bankDetailsTitle: document.bankDetailsTitle,
    bankDetails: document.bankDetails,
    lineItems: document.lineItems,
    adjustments: document.adjustments,
    convertedFromId: document.convertedFromId,
  };
}

/**
 * The invoice form as it opens when converting an estimate: the estimate's
 * customer, lines, charges, notes and terms are copied in, all still editable.
 * The lines are copies, so the invoice never shares rows with the estimate.
 */
export function invoiceFromEstimate(estimate: Document, settings: Settings): DocumentInput {
  return {
    ...blankInput("invoice", settings),
    customerId: estimate.customerId,
    // The invoice points back at the estimate it bills for.
    reference: estimate.reference || estimate.number,
    projectName: estimate.projectName,
    subject: estimate.subject,
    notes: estimate.notes,
    terms: estimate.terms,
    bankDetailsTitle: estimate.bankDetailsTitle,
    bankDetails: estimate.bankDetails,
    lineItems: estimate.lineItems.map((line) => ({ ...line, id: createId() })),
    adjustments: estimate.adjustments.map((adjustment) => ({ ...adjustment, id: createId() })),
    convertedFromId: estimate.id,
  };
}

/**
 * A copy of a document as a fresh draft, whatever state the original is in: the
 * next one is usually the last one with a detail or two changed. The number is
 * left blank for the server to allocate, and nothing about approval, payment or
 * where it came from is carried over.
 */
export function copyOfDocument(document: Document, settings: Settings): DocumentInput {
  return {
    ...inputFromDocument(document),
    number: "",
    issueDate: todayIso(),
    dueDate: document.kind === "invoice" ? addDays(todayIso(), settings.defaultPaymentTermsDays) : null,
    validUntil:
      document.kind === "estimate" && settings.estimateValidityDays > 0
        ? addDays(todayIso(), settings.estimateValidityDays)
        : null,
    lineItems: document.lineItems.map((line) => ({ ...line, id: createId() })),
    adjustments: document.adjustments.map((adjustment) => ({ ...adjustment, id: createId() })),
    convertedFromId: null,
  };
}
