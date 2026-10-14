export type DocumentKind = "estimate" | "invoice";

export type DocumentStatus =
  | "draft"
  | "pending_approval"
  | "rejected" // sent back by an approver, editable and resubmittable
  | "approved"
  | "invoiced" // estimates only: converted to an invoice
  | "paid" // invoices only
  | "void";

export type Role = "admin" | "member" | "viewer";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Set for the bootstrap admin until they replace the password they were given. */
  mustChangePassword: boolean;
  disabled: boolean;
  /** False until the user has opened their invite link and chosen a password. */
  hasPassword: boolean;
  createdAt: string;
}

export interface Customer {
  id: string;
  /** Company name, shown first in the Bill To block. */
  name: string;
  /** Individual contact, shown under the company name. */
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  /** Printed as the last line of the address. */
  country: string;
  /** Documents for this customer are priced in this currency. */
  currency: string;
  taxId: string;
  notes: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A catalogue entry that fills in a line item's name, description and rate. */
export interface Item {
  id: string;
  name: string;
  description: string;
  rate: number;
  /** The currency the rate is in. Blank means the business currency in Settings. */
  currency: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LineItem {
  id: string;
  /** Short title, rendered at the top of the Item & Description cell. */
  name: string;
  /** Optional detail below the name. Each line renders as its own row. */
  description: string;
  qty: number;
  rate: number;
  /** Flat amount taken off this line, not a percentage. */
  discount: number;
}

/**
 * A named amount added to the subtotal — bank fees, shipping, a rebate.
 * Negative amounts are allowed so this can express a whole-document discount.
 */
export interface Adjustment {
  id: string;
  label: string;
  amount: number;
}

export interface Payment {
  id: string;
  /** Running payment number, allocated by the server. */
  number: number;
  amount: number;
  /** The part of `amount` the bank kept; recorded for reference only. */
  bankCharges: number;
  date: string;
  method: string;
  reference: string;
  note: string;
  attachments: PaymentAttachment[];
}

/** A file kept with a payment, such as a remittance advice. */
export interface PaymentAttachment {
  id: string;
  name: string;
  size: number;
}

export const MAX_PAYMENT_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export type PaymentInput = Omit<Payment, "id" | "number" | "attachments">;

/** A payment as listed on the Payments Received page, with the invoice it belongs to. */
export interface ReceivedPayment extends Payment {
  documentId: string;
  documentNumber: string;
  customerName: string;
  currency: string;
}

export interface PartySnapshot {
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  country: string;
  taxId: string;
  website: string;
  logoDataUrl: string | null;
}

export type DocumentEventType =
  | "created"
  | "updated"
  | "submitted"
  | "approved"
  | "rejected"
  | "to_draft"
  | "converted"
  | "payment"
  | "voided";

/** One row of a document's Activity tab. */
export interface DocumentEvent {
  id: string;
  type: DocumentEventType;
  message: string;
  /** Why it was rejected or sent back to draft. */
  reason: string;
  userName: string;
  createdAt: string;
}

export interface Document {
  id: string;
  kind: DocumentKind;
  status: DocumentStatus;
  number: string;
  customerId: string;
  currency: string;
  issueDate: string;
  dueDate: string | null;
  validUntil: string | null;
  /** The customer's own reference, such as a purchase order number. */
  reference: string;
  projectName: string;
  /** One line saying what the document is for. */
  subject: string;
  notes: string;
  terms: string;
  /** Payment/bank instructions, printed below the notes. */
  bankDetailsTitle: string;
  bankDetails: string;
  lineItems: LineItem[];
  adjustments: Adjustment[];
  payments: Payment[];
  /** Frozen business/customer details, populated on approval. */
  businessSnapshot: PartySnapshot | null;
  customerSnapshot: PartySnapshot | null;
  /** On an invoice: the estimate it was converted from. */
  convertedFromId: string | null;
  /** On an invoiced estimate: the invoice it became. */
  convertedToId: string | null;
  subtotal: number;
  total: number;
  createdByName: string;
  submittedByName: string;
  approvedByName: string;
  createdAt: string;
  updatedAt: string;
  /** Only present on a single-document fetch. */
  events?: DocumentEvent[];
}

/** The editable part of a document, as sent when creating or saving a draft. */
export interface DocumentInput {
  kind: DocumentKind;
  /** Blank asks the server to allocate the next number. */
  number: string;
  customerId: string;
  issueDate: string;
  dueDate: string | null;
  validUntil: string | null;
  /** The customer's own reference, such as a purchase order number. */
  reference: string;
  projectName: string;
  /** One line saying what the document is for. */
  subject: string;
  notes: string;
  terms: string;
  bankDetailsTitle: string;
  bankDetails: string;
  lineItems: LineItem[];
  adjustments: Adjustment[];
  convertedFromId: string | null;
}

export interface Settings {
  businessName: string;
  businessEmail: string;
  businessPhone: string;
  businessAddress: string;
  businessTaxId: string;
  businessWebsite: string;
  logoDataUrl: string | null;
  /** Used when a customer has no currency of its own. */
  currency: string;
  defaultPaymentTermsDays: number;
  estimateValidityDays: number;
  invoiceNumberFormat: string;
  estimateNumberFormat: string;
  nextInvoiceSeq: number;
  nextEstimateSeq: number;
  /** Copied onto each new document, then editable per document. */
  defaultNotes: string;
  defaultTerms: string;
  /**
   * The bank accounts invoices can be paid into, one per currency or method.
   * An invoice picks one by name and keeps its own copy of the text, so later
   * edits here never change an invoice that has already gone out.
   */
  bankAccounts: PaymentAccount[];
}

/** One named block of payment instructions, as printed on an invoice. */
export interface PaymentAccount {
  id: string;
  /** What it is called in the picker and printed as the heading. */
  title: string;
  details: string;
}

/** More than this and the picker stops being a picker. */
export const MAX_PAYMENT_ACCOUNTS = 20;

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
}

/**
 * The currencies offered in the pickers. Anything already saved still works —
 * a document keeps the code it was raised in — so adding to this list is safe
 * and removing from it only hides the code from new work.
 */
export const CURRENCIES: { code: string; name: string }[] = [
  { code: "USD", name: "US dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "Pound sterling" },
  { code: "AUD", name: "Australian dollar" },
  { code: "LKR", name: "Sri Lankan rupee" },
  { code: "SGD", name: "Singapore dollar" },
  { code: "INR", name: "Indian rupee" },
  { code: "AED", name: "UAE dirham" },
  { code: "CAD", name: "Canadian dollar" },
  { code: "NZD", name: "New Zealand dollar" },
];
