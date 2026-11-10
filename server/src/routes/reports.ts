import type { Hono } from "hono";
import { daysBetween } from "../../../shared/date.ts";
import { round2 } from "../../../shared/money.ts";
import {
  AGING_BUCKETS,
  agingBucket,
  reportInfo,
  type Report,
  type ReportColumn,
  type ReportName,
  type ReportRow,
  type ReportSection,
} from "../../../shared/reports.ts";
import { csvAmount, safeText, toCsv } from "../csv.ts";
import { pool } from "../db.ts";
import { date, HttpError, requirePermission, type Env } from "../http.ts";

/*
 * Reports are worked out from the documents and payments as they are now; they
 * store nothing. An invoice counts as a sale once it is approved (or paid):
 * drafts, pending, rejected and void invoices are not sales. Each currency is
 * reported on its own.
 */

const SOLD = ["approved", "paid"];

interface Period {
  from: string;
  to: string;
}

const money = (key: string, label: string): ReportColumn => ({ key, label, type: "money" });
const text = (key: string, label: string): ReportColumn => ({ key, label, type: "text" });
const linked = (column: ReportColumn): ReportColumn => ({ ...column, link: true });
const num = (key: string, label: string): ReportColumn => ({ key, label, type: "number" });
const day = (key: string, label: string): ReportColumn => ({ key, label, type: "date" });

/** Groups rows by currency, sorted by code, each turned into a section by `build`. */
function byCurrency<T extends { currency: string }>(items: T[], build: (items: T[]) => Omit<ReportSection, "currency">): ReportSection[] {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(item.currency, [...(groups.get(item.currency) ?? []), item]);
  return [...groups.keys()].sort().map((currency) => ({ currency, ...build(groups.get(currency)!) }));
}

/** Sums the named number columns of `rows` into a Total row. */
function totalRow(rows: ReportRow[], keys: string[], label: string, labelKey: string): ReportRow {
  const values: ReportRow["values"] = { [labelKey]: label };
  for (const key of keys) values[key] = round2(rows.reduce((sum, r) => sum + Number(r.values[key] ?? 0), 0));
  return { values };
}

interface InvoiceRow {
  id: string;
  number: string;
  status: string;
  currency: string;
  issue_date: string;
  due_date: string | null;
  total: number;
  customer_id: string;
  customer_name: string;
}

async function soldInvoices(where: string, params: unknown[]): Promise<InvoiceRow[]> {
  const { rows } = await pool.query(
    `select d.id, d.number, d.status, d.currency, d.issue_date, d.due_date, d.total, d.customer_id, c.name as customer_name
       from documents d join customers c on c.id = d.customer_id
      where d.kind = 'invoice' and d.status = any($1) and ${where}
      order by d.issue_date, d.number`,
    [SOLD, ...params],
  );
  return rows;
}

/** Payments made on or before `asOf`, per invoice. */
async function paidByInvoice(asOf: string): Promise<Map<string, number>> {
  const { rows } = await pool.query(
    "select document_id, sum(amount) as paid from payments where date <= $1 group by document_id",
    [asOf],
  );
  return new Map(rows.map((r) => [r.document_id, Number(r.paid)]));
}

// ---------- sales ----------

async function salesByCustomer({ from, to }: Period): Promise<Omit<Report, "name" | "title" | "from" | "to">> {
  const invoices = await soldInvoices("d.issue_date between $2 and $3", [from, to]);
  const columns = [linked(text("customer", "Customer")), num("count", "Invoices"), money("sales", "Sales")];
  const sections = byCurrency(invoices, (list) => {
    const perCustomer = new Map<string, ReportRow>();
    for (const inv of list) {
      const row = perCustomer.get(inv.customer_id) ?? {
        values: { customer: inv.customer_name, count: 0, sales: 0 },
        link: `/customers/${inv.customer_id}`,
      };
      row.values.count = Number(row.values.count) + 1;
      row.values.sales = round2(Number(row.values.sales) + inv.total);
      perCustomer.set(inv.customer_id, row);
    }
    const rows = [...perCustomer.values()].sort((a, b) => Number(b.values.sales) - Number(a.values.sales));
    return { rows, total: totalRow(rows, ["count", "sales"], "Total", "customer") };
  });
  return { columns, sections, note: "Approved and paid invoices dated in the period, at their full total including charges." };
}

async function salesByItem({ from, to }: Period) {
  const { rows: lines } = await pool.query(
    `select d.currency, l.name, l.qty, l.rate, l.discount, d.id as document_id
       from document_lines l join documents d on d.id = l.document_id
      where d.kind = 'invoice' and d.status = any($1) and d.issue_date between $2 and $3`,
    [SOLD, from, to],
  );
  const columns = [text("item", "Item"), num("quantity", "Quantity"), num("invoices", "Invoices"), money("amount", "Amount"), money("average", "Average price")];
  const sections = byCurrency(lines as { currency: string; name: string; qty: number; rate: number; discount: number; document_id: string }[], (list) => {
    const perItem = new Map<string, { name: string; qty: number; amount: number; invoices: Set<string> }>();
    for (const l of list) {
      const key = l.name.trim().toLowerCase() || "(no name)";
      const entry = perItem.get(key) ?? { name: l.name.trim() || "(no name)", qty: 0, amount: 0, invoices: new Set<string>() };
      entry.qty += l.qty;
      entry.amount = round2(entry.amount + round2(round2(l.qty * l.rate) - l.discount));
      entry.invoices.add(l.document_id);
      perItem.set(key, entry);
    }
    const rows = [...perItem.values()]
      .sort((a, b) => b.amount - a.amount)
      .map((e) => ({
        values: { item: e.name, quantity: round2(e.qty), invoices: e.invoices.size, amount: e.amount, average: e.qty ? round2(e.amount / e.qty) : 0 },
      }));
    return { rows, total: { values: { item: "Total", amount: round2(rows.reduce((s, r) => s + r.values.amount, 0)) } } };
  });
  return { columns, sections, note: "Line items of approved and paid invoices dated in the period, grouped by item name, after line discounts. Charges are not included." };
}

async function estimateConversion({ from, to }: Period) {
  const { rows: estimates } = await pool.query(
    `select e.id, e.status, e.issue_date,
            (select min(i.issue_date) from documents i where i.converted_from_id = e.id and i.status <> 'void') as invoiced_on
       from documents e
      where e.kind = 'estimate' and e.status <> 'void' and e.issue_date between $1 and $2`,
    [from, to],
  );
  const count = (statuses: string[]) => estimates.filter((e) => statuses.includes(e.status)).length;
  const created = estimates.length;
  const decided = count(["approved", "invoiced"]);
  const invoiced = estimates.filter((e) => e.status === "invoiced");
  const days = invoiced.filter((e) => e.invoiced_on).map((e) => daysBetween(e.issue_date, e.invoiced_on));
  const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");
  const rows: ReportRow[] = [
    ["Estimates created", String(created)],
    ["Approved (including invoiced)", `${decided} (${pct(decided, created)})`],
    ["Turned into invoices", `${invoiced.length} (${pct(invoiced.length, created)})`],
    ["Approved, not yet invoiced", String(count(["approved"]))],
    ["Rejected", String(count(["rejected"]))],
    ["Still draft or pending approval", String(count(["draft", "pending_approval"]))],
    ["Average days from estimate to invoice", days.length ? String(Math.round(days.reduce((a, b) => a + b, 0) / days.length)) : "—"],
  ].map(([measure, value]) => ({ values: { measure, value } }));
  return {
    columns: [text("measure", "Measure"), text("value", "Value")],
    sections: [{ currency: null, rows }],
    note: "Estimates dated in the period, except void ones.",
  };
}

// ---------- receivables ----------

async function openInvoices(asOf: string) {
  const invoices = await soldInvoices("d.issue_date <= $2", [asOf]);
  const paid = await paidByInvoice(asOf);
  return invoices
    .map((inv) => ({
      ...inv,
      balance: round2(inv.total - (paid.get(inv.id) ?? 0)),
      daysOverdue: daysBetween(inv.due_date ?? inv.issue_date, asOf),
    }))
    .filter((inv) => inv.balance > 0);
}

async function agingSummary({ to }: Period) {
  const open = await openInvoices(to);
  const keys = AGING_BUCKETS.map((b) => b.key as string);
  const columns = [linked(text("customer", "Customer")), ...AGING_BUCKETS.map((b) => money(b.key, b.label)), money("total", "Total")];
  const sections = byCurrency(open, (list) => {
    const perCustomer = new Map<string, ReportRow>();
    for (const inv of list) {
      const row = perCustomer.get(inv.customer_id) ?? {
        values: { customer: inv.customer_name, ...Object.fromEntries(keys.map((k) => [k, 0])), total: 0 },
        link: `/customers/${inv.customer_id}`,
      };
      const bucket = agingBucket(inv.daysOverdue);
      row.values[bucket] = round2(Number(row.values[bucket]) + inv.balance);
      row.values.total = round2(Number(row.values.total) + inv.balance);
      perCustomer.set(inv.customer_id, row);
    }
    const rows = [...perCustomer.values()].sort((a, b) => Number(b.values.total) - Number(a.values.total));
    return { rows, total: totalRow(rows, [...keys, "total"], "Total", "customer") };
  });
  return { columns, sections, note: "Balances still owed on approved invoices as of the date, by days past the due date (invoices without a due date count from their invoice date)." };
}

async function agingDetails({ to }: Period) {
  const open = await openInvoices(to);
  const columns = [day("date", "Invoice date"), linked(text("number", "Invoice#")), text("customer", "Customer"), day("due", "Due date"), num("days", "Days overdue"), money("total", "Total"), money("balance", "Balance due")];
  const sections = byCurrency(open, (list) => {
    const rows = [...list]
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .map((inv) => ({
        values: { date: inv.issue_date, number: inv.number, customer: inv.customer_name, due: inv.due_date, days: Math.max(inv.daysOverdue, 0), total: inv.total, balance: inv.balance },
        link: `/invoices/${inv.id}`,
      }));
    return { rows, total: totalRow(rows, ["total", "balance"], "Total", "date") };
  });
  return { columns, sections, note: "Approved invoices with a balance as of the date. Days overdue is 0 for invoices not yet due." };
}

async function customerBalances({ to }: Period) {
  const invoices = await soldInvoices("d.issue_date <= $2", [to]);
  const paid = await paidByInvoice(to);
  const columns = [linked(text("customer", "Customer")), num("count", "Invoices"), money("invoiced", "Invoiced"), money("received", "Received"), money("balance", "Balance")];
  const sections = byCurrency(invoices, (list) => {
    const perCustomer = new Map<string, ReportRow>();
    for (const inv of list) {
      const row = perCustomer.get(inv.customer_id) ?? {
        values: { customer: inv.customer_name, count: 0, invoiced: 0, received: 0, balance: 0 },
        link: `/customers/${inv.customer_id}`,
      };
      const received = paid.get(inv.id) ?? 0;
      row.values.count = Number(row.values.count) + 1;
      row.values.invoiced = round2(Number(row.values.invoiced) + inv.total);
      row.values.received = round2(Number(row.values.received) + received);
      row.values.balance = round2(Number(row.values.balance) + inv.total - received);
      perCustomer.set(inv.customer_id, row);
    }
    const rows = [...perCustomer.values()].sort((a, b) => Number(b.values.balance) - Number(a.values.balance) || String(a.values.customer).localeCompare(String(b.values.customer)));
    return { rows, total: totalRow(rows, ["count", "invoiced", "received", "balance"], "Total", "customer") };
  });
  return { columns, sections, note: "All approved and paid invoices up to the date, and the payments received on them by then." };
}

// ---------- payments ----------

async function paymentsReceived({ from, to }: Period) {
  const { rows: payments } = await pool.query(
    `select p.id, p.number, p.date, p.method, p.reference, p.amount, d.id as invoice_id, d.number as invoice_number,
            d.currency, c.name as customer_name
       from payments p join documents d on d.id = p.document_id join customers c on c.id = d.customer_id
      where p.date between $1 and $2
      order by p.date, p.number`,
    [from, to],
  );
  const columns = [day("date", "Date"), num("number", "Payment#"), text("customer", "Customer"), linked(text("invoice", "Invoice#")), text("mode", "Mode"), text("reference", "Reference#"), money("amount", "Amount")];
  const sections = byCurrency(payments, (list) => {
    const rows = list.map((p) => ({
      values: { date: p.date, number: p.number, customer: p.customer_name, invoice: p.invoice_number, mode: p.method, reference: p.reference, amount: p.amount },
      link: `/invoices/${p.invoice_id}`,
    }));
    return { rows, total: totalRow(rows, ["amount"], "Total", "date") };
  });
  return { columns, sections, note: "Payments recorded with a date in the period." };
}

async function timeToGetPaid({ from, to }: Period) {
  const { rows: invoices } = await pool.query(
    `select d.id, d.currency, d.issue_date, d.total, max(p.date) as paid_on
       from documents d join payments p on p.document_id = d.id
      where d.kind = 'invoice' and d.status = 'paid'
      group by d.id
     having max(p.date) between $1 and $2`,
    [from, to],
  );
  const buckets = [
    { label: "0–15 days", min: -Infinity, max: 15 },
    { label: "16–30 days", min: 16, max: 30 },
    { label: "31–45 days", min: 31, max: 45 },
    { label: "Over 45 days", min: 46, max: Infinity },
  ];
  const columns = [text("bucket", "Paid within"), num("count", "Invoices"), { key: "share", label: "Share", type: "percent" as const }, money("amount", "Amount")];
  const sections = byCurrency(invoices, (list) => {
    const rows = buckets.map((b) => {
      const hits = list.filter((inv) => {
        const days = daysBetween(inv.issue_date, inv.paid_on);
        return days >= b.min && days <= b.max;
      });
      return {
        values: {
          bucket: b.label,
          count: hits.length,
          share: list.length ? Math.round((hits.length / list.length) * 1000) / 10 : 0,
          amount: round2(hits.reduce((s, inv) => s + inv.total, 0)),
        },
      };
    });
    return { rows, total: { values: { bucket: "Total", count: list.length, share: list.length ? 100 : 0, amount: round2(list.reduce((s, inv) => s + inv.total, 0)) } } };
  });
  return { columns, sections, note: "Invoices paid in full whose last payment falls in the period, by days from invoice date to that payment." };
}

// ---------- business overview ----------

async function incomeSummary({ from, to }: Period, basis: "accrual" | "cash") {
  // The parts of each invoice: line amounts before discount, discounts, and charges.
  const { rows: parts } = await pool.query(
    `select d.id, d.currency, d.total,
            coalesce((select sum(round(l.qty * l.rate, 2)) from document_lines l where l.document_id = d.id), 0) as gross,
            coalesce((select sum(l.discount) from document_lines l where l.document_id = d.id), 0) as discount,
            coalesce((select sum(a.amount) from document_adjustments a where a.document_id = d.id), 0) as charges
       from documents d
      where d.kind = 'invoice' and d.status = any($1)
        and ${basis === "accrual" ? "d.issue_date between $2 and $3" : "exists (select 1 from payments p where p.document_id = d.id and p.date between $2 and $3)"}`,
    [SOLD, from, to],
  );
  // Cash basis: each invoice counts in proportion to what was received on it in the period.
  const share = new Map<string, number>();
  if (basis === "cash") {
    const { rows } = await pool.query(
      `select p.document_id, sum(p.amount) as received from payments p where p.date between $1 and $2 group by p.document_id`,
      [from, to],
    );
    for (const r of rows) share.set(r.document_id, Number(r.received));
  }
  const columns = [text("account", "Account"), money("amount", "Amount")];
  const sections = byCurrency(parts as { id: string; currency: string; total: number; gross: number; discount: number; charges: number }[], (list) => {
    let sales = 0, discount = 0, charges = 0, total = 0;
    for (const inv of list) {
      const factor = basis === "cash" ? (inv.total ? (share.get(inv.id) ?? 0) / inv.total : 0) : 1;
      sales += Number(inv.gross) * factor;
      discount += Number(inv.discount) * factor;
      charges += Number(inv.charges) * factor;
      total += (basis === "cash" ? share.get(inv.id) ?? 0 : inv.total);
    }
    const rows = [
      { values: { account: "Sales", amount: round2(sales) } },
      { values: { account: "Discount", amount: -round2(discount) } },
      { values: { account: "Other charges", amount: round2(charges) } },
    ];
    return { rows, total: { values: { account: "Total income", amount: round2(total) } } };
  });
  return {
    columns,
    sections,
    basis,
    note:
      basis === "accrual"
        ? "Accrual basis: approved and paid invoices dated in the period. Sales are line amounts before discount; other charges are the named charges on the invoices."
        : "Cash basis: payments received in the period, each split into sales, discount and charges in the same proportions as its invoice.",
  };
}

// ---------- activity ----------

const ACTIVITY_LIMIT = 2000;

async function activity({ from, to }: Period) {
  const { rows } = await pool.query(
    `select e.created_at, e.user_name, e.message, e.reason, d.id, d.kind, d.number
       from document_events e join documents d on d.id = e.document_id
      where e.created_at >= $1::date and e.created_at < $2::date + 1
      order by e.created_at desc, e.id
      limit ${ACTIVITY_LIMIT + 1}`,
    [from, to],
  );
  const more = rows.length > ACTIVITY_LIMIT;
  return {
    columns: [{ key: "when", label: "When", type: "text" as const }, text("user", "By"), linked(text("document", "Document")), text("event", "What happened"), text("reason", "Reason")],
    sections: [
      {
        currency: null,
        rows: rows.slice(0, ACTIVITY_LIMIT).map((r) => ({
          values: {
            when: (r.created_at as Date).toISOString().slice(0, 16).replace("T", " ") + " UTC",
            user: r.user_name,
            document: `${r.kind === "invoice" ? "Invoice" : "Estimate"} ${r.number}`,
            event: r.message,
            reason: r.reason,
          },
          link: `/${r.kind}s/${r.id}`,
        })),
      },
    ],
    note: more
      ? `The newest ${ACTIVITY_LIMIT} events in the period are shown; choose a shorter period to see the rest. Deleted documents leave no activity.`
      : "Every change to estimates, invoices and their payments in the period. Deleted documents leave no activity.",
  };
}

// ---------- routes ----------

async function buildReport(name: ReportName, period: Period, basis: "accrual" | "cash") {
  switch (name) {
    case "sales-by-customer": return salesByCustomer(period);
    case "sales-by-item": return salesByItem(period);
    case "estimate-conversion": return estimateConversion(period);
    case "aging-summary": return agingSummary(period);
    case "aging-details": return agingDetails(period);
    case "customer-balances": return customerBalances(period);
    case "payments-received": return paymentsReceived(period);
    case "time-to-get-paid": return timeToGetPaid(period);
    case "income-summary": return incomeSummary(period, basis);
    case "activity": return activity(period);
  }
}

/** The report as CSV: one row per line, with the currency in front when there is one. */
function reportCsv(report: Report): string {
  const withCurrency = report.sections.some((s) => s.currency);
  const header = [...(withCurrency ? ["Currency"] : []), ...report.columns.map((c) => c.label)];
  const rows: string[][] = [];
  const cell = (column: ReportColumn, value: string | number | null | undefined) =>
    value === null || value === undefined ? "" : column.type === "money" ? csvAmount(Number(value)) : column.type === "text" ? safeText(String(value)) : String(value);
  for (const section of report.sections) {
    for (const row of [...section.rows, ...(section.total ? [section.total] : [])]) {
      rows.push([...(withCurrency ? [section.currency ?? ""] : []), ...report.columns.map((c) => cell(c, row.values[c.key]))]);
    }
  }
  return toCsv(header, rows);
}

export function reportRoutes(app: Hono<Env>) {
  app.get("/api/reports/:name", async (c) => {
    const info = reportInfo(c.req.param("name"));
    if (!info) throw new HttpError(404, "Not found.");
    const to = date({ to: c.req.query("to") }, "to");
    const from = info.period === "range" ? date({ from: c.req.query("from") }, "from") : null;
    if (from && from > to) throw new HttpError(400, "The start date is after the end date.");
    const basis = c.req.query("basis") === "cash" ? "cash" : "accrual";
    const body = await buildReport(info.name, { from: from ?? to, to }, basis);
    const report: Report = { name: info.name, title: info.title, from, to, ...body };

    if (c.req.query("format") === "csv") {
      requirePermission(c, "data.export");
      const period = from ? `${from}-to-${to}` : `as-of-${to}`;
      return c.body(reportCsv(report), 200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${info.name}-${period}.csv"`,
        "Cache-Control": "private, no-store",
      });
    }
    return c.json({ report });
  });
}
