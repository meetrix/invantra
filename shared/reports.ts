/*
 * The reports, described once for the server that computes them and the page
 * that shows them. Amounts in different currencies are never added together:
 * each report has one section per currency.
 */

export type ReportName =
  | "sales-by-customer"
  | "sales-by-item"
  | "income-summary"
  | "aging-summary"
  | "aging-details"
  | "customer-balances"
  | "payments-received"
  | "time-to-get-paid"
  | "estimate-conversion"
  | "activity";

export type ColumnType = "text" | "money" | "number" | "date" | "percent";

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
  /** The row's link is put on this column. */
  link?: boolean;
}

/** One row: values by column key, plus where clicking it goes. */
export interface ReportRow {
  values: Record<string, string | number | null>;
  link?: string;
}

export interface ReportSection {
  /** Null for reports that hold no money, such as the activity log. */
  currency: string | null;
  rows: ReportRow[];
  total?: ReportRow;
}

export interface Report {
  name: ReportName;
  title: string;
  /** The period, or for an "as of" report only `to`. */
  from: string | null;
  to: string;
  basis?: "accrual" | "cash";
  columns: ReportColumn[];
  sections: ReportSection[];
  /** How the figures were worked out, shown under the title. */
  note: string;
}

export interface ReportInfo {
  name: ReportName;
  title: string;
  group: "Sales" | "Receivables" | "Payments" | "Business overview" | "Activity";
  description: string;
  /** "range" takes a period; "asOf" takes a single date. */
  period: "range" | "asOf";
  /** Offers accrual (invoice date) or cash (payment date). */
  basis?: boolean;
}

export const REPORTS: ReportInfo[] = [
  {
    name: "sales-by-customer",
    title: "Sales by customer",
    group: "Sales",
    description: "Invoiced amount and invoice count per customer.",
    period: "range",
  },
  {
    name: "sales-by-item",
    title: "Sales by item",
    group: "Sales",
    description: "Quantity and amount invoiced per item.",
    period: "range",
  },
  {
    name: "estimate-conversion",
    title: "Estimate conversion",
    group: "Sales",
    description: "How many estimates were approved and turned into invoices, and how fast.",
    period: "range",
  },
  {
    name: "aging-summary",
    title: "Receivables aging summary",
    group: "Receivables",
    description: "What each customer owes, by how long it has been overdue.",
    period: "asOf",
  },
  {
    name: "aging-details",
    title: "Receivables aging details",
    group: "Receivables",
    description: "Every open invoice with its balance and days overdue.",
    period: "asOf",
  },
  {
    name: "customer-balances",
    title: "Customer balances",
    group: "Receivables",
    description: "Invoiced, received and still owed per customer.",
    period: "asOf",
  },
  {
    name: "payments-received",
    title: "Payments received",
    group: "Payments",
    description: "Every payment received in the period.",
    period: "range",
  },
  {
    name: "time-to-get-paid",
    title: "Time to get paid",
    group: "Payments",
    description: "How long invoices paid in the period took to be paid in full.",
    period: "range",
  },
  {
    name: "income-summary",
    title: "Income summary",
    group: "Business overview",
    description: "Sales, discounts and charges for the period, by invoice date or by payment date.",
    period: "range",
    basis: true,
  },
  {
    name: "activity",
    title: "Activity log",
    group: "Activity",
    description: "Everything done to estimates, invoices and payments, by whom and when.",
    period: "range",
  },
];

export const reportInfo = (name: string): ReportInfo | undefined => REPORTS.find((r) => r.name === name);

/** The overdue buckets the aging reports use, in days past the due date. */
export const AGING_BUCKETS = [
  { key: "current", label: "Current", min: -Infinity, max: 0 },
  { key: "d1_15", label: "1–15 days", min: 1, max: 15 },
  { key: "d16_30", label: "16–30 days", min: 16, max: 30 },
  { key: "d31_45", label: "31–45 days", min: 31, max: 45 },
  { key: "d45", label: "Over 45 days", min: 46, max: Infinity },
] as const;

export function agingBucket(daysOverdue: number): (typeof AGING_BUCKETS)[number]["key"] {
  return AGING_BUCKETS.find((b) => daysOverdue >= b.min && daysOverdue <= b.max)!.key;
}
