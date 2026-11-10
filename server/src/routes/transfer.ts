import type { Hono } from "hono";
import type pg from "pg";
import { computeDocumentTotals, formatMoney, round2 } from "../../../shared/money.ts";
import { snapshotBusiness, snapshotCustomer } from "../../../shared/snapshot.ts";
import type { CsvDataset, DocumentKind, DocumentStatus, ImportResult } from "../../../shared/types.ts";
import { CsvTable, csvAmount, parseAmount, Problems, safeText, toCsv, unsafeText } from "../csv.ts";
import { pool, tx } from "../db.ts";
import { displayName, HttpError, readBody, requiredText, requirePermission, type Env, type SessionUser } from "../http.ts";
import { getCustomer, importCustomers } from "./customers.ts";
import { importItems } from "./items.ts";
import { getSettings } from "./settings.ts";

/*
 * CSV export and import of everything the app holds.
 *
 * The columns use the names of a common invoicing system's export, so a business
 * moving here can import those files as they are, and a file exported here
 * imports back unchanged. A few columns only this app writes: "Charges" (any
 * number of named charges, where that format has one "Adjustment"), "Show Total",
 * "Payment Details Title" and "Payment Details".
 *
 * Estimates and invoices have one row per line item; the header columns repeat
 * on every row of the same document.
 */

const DATASETS: CsvDataset[] = ["customers", "items", "estimates", "invoices", "payments"];

// ---------- export ----------

const yesNo = (value: boolean) => (value ? "Yes" : "No");

async function exportCustomers(): Promise<string> {
  const { rows } = await pool.query("select * from customers order by lower(name), id");
  return toCsv(
    ["Contact ID", "Display Name", "First Name", "EmailID", "Phone", "Billing Address", "Billing Country", "Currency Code", "Tax ID", "Notes", "Status"],
    rows.map((r) => [
      r.external_id ?? r.id,
      safeText(r.name),
      safeText(r.contact_person),
      safeText(r.email),
      safeText(r.phone),
      safeText(r.address),
      safeText(r.country),
      r.currency,
      safeText(r.tax_id),
      safeText(r.notes),
      r.archived ? "Inactive" : "Active",
    ]),
  );
}

async function exportItems(): Promise<string> {
  const { rows } = await pool.query("select * from items order by lower(name), id");
  return toCsv(
    ["Item ID", "Item Name", "Description", "Rate", "Currency Code", "Status"],
    rows.map((r) => [
      r.external_id ?? r.id,
      safeText(r.name),
      safeText(r.description),
      csvAmount(r.rate),
      r.currency,
      r.archived ? "Inactive" : "Active",
    ]),
  );
}

/** Each charge on its own line as "label | amount". */
function formatCharges(charges: { label: string; amount: number }[]): string {
  return charges.map((c) => `${c.label} | ${csvAmount(c.amount)}`).join("\n");
}

const STATUS_OUT: Record<DocumentStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending",
  rejected: "Rejected",
  approved: "Approved",
  invoiced: "Invoiced",
  paid: "Paid",
  void: "Void",
};

async function exportDocuments(kind: DocumentKind): Promise<string> {
  const isInvoice = kind === "invoice";
  const label = isInvoice ? "Invoice" : "Estimate";
  const { rows: documents } = await pool.query(
    `select d.*, c.name as customer_name, coalesce(c.external_id, c.id::text) as customer_ref,
            e.number as estimate_number,
            (select coalesce(sum(p.amount), 0) from payments p where p.document_id = d.id) as paid
       from documents d
       join customers c on c.id = d.customer_id
       left join documents e on e.id = d.converted_from_id
      where d.kind = $1
      order by d.issue_date, d.number`,
    [kind],
  );
  const ids = documents.map((d) => d.id);
  const [lines, charges] = await Promise.all([
    pool.query("select * from document_lines where document_id = any($1) order by document_id, position", [ids]),
    pool.query("select * from document_adjustments where document_id = any($1) order by document_id, position", [ids]),
  ]);
  const group = <T extends { document_id: string }>(list: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of list) map.set(row.document_id, [...(map.get(row.document_id) ?? []), row]);
    return map;
  };
  const linesByDoc = group(lines.rows);
  const chargesByDoc = group(charges.rows);

  const header = [
    `${label} Date`,
    `${label} ID`,
    `${label} Number`,
    `${label} Status`,
    "Customer ID",
    "Customer Name",
    isInvoice ? "Due Date" : "Expiry Date",
    "PurchaseOrder",
    "Currency Code",
    "SubTotal",
    "Total",
    ...(isInvoice ? ["Balance"] : []),
    "Adjustment",
    "Adjustment Description",
    "Charges",
    "Notes",
    "Terms & Conditions",
    "Subject",
    "Project Name",
    ...(isInvoice ? ["Estimate Number", "Payment Details Title", "Payment Details"] : ["Show Total"]),
    "Item Name",
    "Item Desc",
    "Quantity",
    "Item Price",
    "Discount Amount",
    "Item Total",
  ];

  const out: string[][] = [];
  for (const d of documents) {
    const docCharges = (chargesByDoc.get(d.id) ?? []).map((c) => ({ label: c.label, amount: c.amount }));
    const single = docCharges.length === 1 ? docCharges[0] : null;
    const head = [
      d.issue_date,
      d.external_id ?? d.id,
      safeText(d.number),
      STATUS_OUT[d.status as DocumentStatus],
      d.customer_ref,
      safeText(d.customer_name),
      (isInvoice ? d.due_date : d.valid_until) ?? "",
      safeText(d.reference),
      d.currency,
      csvAmount(d.subtotal),
      csvAmount(d.total),
      ...(isInvoice ? [csvAmount(round2(d.total - d.paid))] : []),
      // The one-adjustment columns can only hold a single charge; "Charges" holds them all.
      single ? csvAmount(single.amount) : "",
      single ? safeText(single.label) : "",
      safeText(formatCharges(docCharges)),
      safeText(d.notes),
      safeText(d.terms),
      safeText(d.subject),
      safeText(d.project_name),
      ...(isInvoice
        ? [safeText(d.estimate_number ?? ""), safeText(d.bank_details_title), safeText(d.bank_details)]
        : [yesNo(d.show_total)]),
    ];
    const docLines = linesByDoc.get(d.id) ?? [];
    if (docLines.length === 0) out.push([...head, "", "", "", "", "", ""]);
    for (const l of docLines) {
      const amount = round2(round2(l.qty * l.rate) - l.discount);
      out.push([...head, safeText(l.name), safeText(l.description), String(l.qty), csvAmount(l.rate), csvAmount(l.discount), csvAmount(amount)]);
    }
  }
  return toCsv(header, out);
}

async function exportPayments(): Promise<string> {
  const { rows } = await pool.query(
    `select p.*, d.number as invoice_number, d.issue_date as invoice_date, d.currency,
            c.name as customer_name, coalesce(c.external_id, c.id::text) as customer_ref,
            (select string_agg(a.name, '; ' order by a.created_at) from payment_attachments a where a.payment_id = p.id) as files
       from payments p
       join documents d on d.id = p.document_id
       join customers c on c.id = d.customer_id
      order by p.date, p.number`,
  );
  return toCsv(
    [
      "Payment Number",
      "CustomerPayment ID",
      "Date",
      "Mode",
      "CustomerID",
      "Customer Name",
      "Currency Code",
      "Amount",
      "Bank Charges",
      "Reference Number",
      "Description",
      "Invoice Number",
      "Invoice Date",
      "Amount Applied to Invoice",
      "Attachments",
    ],
    rows.map((r) => [
      String(r.number),
      r.external_id ?? r.id,
      r.date,
      safeText(r.method),
      r.customer_ref,
      safeText(r.customer_name),
      r.currency,
      csvAmount(r.amount),
      csvAmount(r.bank_charges),
      safeText(r.reference),
      safeText(r.note),
      safeText(r.invoice_number),
      r.invoice_date,
      csvAmount(r.amount),
      safeText(r.files ?? ""),
    ]),
  );
}

// ---------- import: estimates and invoices ----------

const ESTIMATE_STATUS: Record<string, DocumentStatus> = {
  draft: "draft",
  pending: "pending_approval",
  pendingapproval: "pending_approval",
  submitted: "pending_approval",
  rejected: "rejected",
  declined: "rejected",
  approved: "approved",
  accepted: "approved",
  sent: "approved",
  open: "approved",
  expired: "approved",
  invoiced: "invoiced",
  void: "void",
};

const INVOICE_STATUS: Record<string, DocumentStatus> = {
  draft: "draft",
  pending: "pending_approval",
  pendingapproval: "pending_approval",
  submitted: "pending_approval",
  rejected: "rejected",
  void: "void",
  // Anything that went out is approved here; recorded payments then make it paid.
  approved: "approved",
  sent: "approved",
  open: "approved",
  unpaid: "approved",
  overdue: "approved",
  partiallypaid: "approved",
  paid: "approved",
  closed: "approved",
};

/** The statuses a document only reaches through approval, so it carries frozen party details. */
const APPROVED_STATES: DocumentStatus[] = ["approved", "invoiced", "paid", "void"];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** "2026-11-10" or "2026-11-10 17:44:43" as YYYY-MM-DD; anything else is null. */
function isoDate(value: string): string | null {
  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  return Number.isNaN(Date.parse(date)) ? null : date;
}

function parseCharges(value: string): { label: string; amount: number }[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cut = line.lastIndexOf("|");
      return cut < 0
        ? { label: "Charge", amount: parseAmount(line) }
        : { label: line.slice(0, cut).trim() || "Charge", amount: parseAmount(line.slice(cut + 1)) };
    });
}

/** Finds the customer a row belongs to: by the id in the file, then by an unambiguous name. */
async function findCustomer(client: pg.PoolClient, ref: string, name: string): Promise<string | null> {
  if (ref) {
    const { rows } = await client.query(
      "select id from customers where external_id = $1 or (external_id is null and id::text = $1) limit 1",
      [ref],
    );
    if (rows[0]) return rows[0].id;
  }
  if (name) {
    const { rows } = await client.query("select id from customers where lower(name) = lower($1) limit 2", [name]);
    if (rows.length === 1) return rows[0].id;
  }
  return null;
}

async function addEvent(client: pg.PoolClient, documentId: string, user: SessionUser, type: string, message: string) {
  await client.query(
    "insert into document_events (document_id, type, message, user_id, user_name) values ($1, $2, $3, $4, $5)",
    [documentId, type, message, user.id, displayName(user)],
  );
}

/** Marks an invoice paid when its payments cover it, and approved again when they no longer do. */
export async function settleInvoice(client: pg.PoolClient, documentId: string): Promise<void> {
  await client.query(
    `update documents d set status = case when p.paid >= d.total and d.total > 0 then 'paid' else 'approved' end,
            updated_at = now()
       from (select coalesce(sum(amount), 0) as paid from payments where document_id = $1) p
      where d.id = $1 and d.kind = 'invoice' and d.status in ('approved', 'paid')`,
    [documentId],
  );
}

async function importDocuments(kind: DocumentKind, csv: string, user: SessionUser): Promise<ImportResult> {
  const isInvoice = kind === "invoice";
  const label = isInvoice ? "Invoice" : "Estimate";
  const table = new CsvTable(csv);
  if (!table.has(`${label} Number`)) {
    throw new HttpError(400, `This doesn't look like a file of ${kind}s: it needs a "${label} Number" column.`);
  }
  const result = { created: 0, updated: 0, skipped: 0 };
  const problems = new Problems();

  // Rows of the same document share its id (or, without an id column, its number).
  const groups = new Map<string, { first: number; rows: string[][] }>();
  for (const [index, row] of table.rows.entries()) {
    const key = table.get(row, `${label} ID`) || `#${table.get(row, `${label} Number`)}`;
    const group = groups.get(key) ?? { first: index + 2, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  const settings = await getSettings(pool);
  const statusMap = isInvoice ? INVOICE_STATUS : ESTIMATE_STATUS;

  for (const [key, { first, rows }] of groups) {
    const row = rows[0];
    const number = unsafeText(table.get(row, `${label} Number`));
    const where = `Row ${first}${number ? ` (${number})` : ""}`;
    const skip = (why: string) => {
      result.skipped++;
      problems.add(`${where}: ${why}`);
    };
    if (!number) {
      skip(`no ${kind} number.`);
      continue;
    }
    const rawStatus = table.get(row, `${label} Status`).toLowerCase().replace(/[\s_-]/g, "");
    const status = rawStatus ? statusMap[rawStatus] : "draft";
    if (!status) {
      skip(`unknown status "${table.get(row, `${label} Status`)}".`);
      continue;
    }
    const issueDate = isoDate(table.get(row, `${label} Date`, "Date"));
    if (!issueDate) {
      skip(`the ${kind} date is missing or not YYYY-MM-DD.`);
      continue;
    }
    const secondDate = table.get(row, isInvoice ? "Due Date" : "Expiry Date");
    const otherDate = secondDate ? isoDate(secondDate) : null;
    if (secondDate && !otherDate) {
      skip(`the ${isInvoice ? "due" : "expiry"} date "${secondDate}" is not YYYY-MM-DD.`);
      continue;
    }

    const lineItems = rows
      .filter((r) => table.get(r, "Item Name", "Item Desc", "Item Price"))
      .map((r) => ({
        name: unsafeText(table.get(r, "Item Name")),
        description: unsafeText(table.get(r, "Item Desc", "Item Description")),
        qty: Number(table.get(r, "Quantity") || "1") || 0,
        rate: round2(parseAmount(table.get(r, "Item Price", "Rate"))),
        discount: round2(parseAmount(table.get(r, "Discount Amount"))),
      }));
    if (lineItems.some((l) => l.qty < 0 || l.rate < 0 || l.discount < 0)) {
      skip("a line has a negative quantity, price or discount.");
      continue;
    }
    const chargesText = unsafeText(table.get(row, "Charges"));
    const adjustment = parseAmount(table.get(row, "Adjustment"));
    const adjustments = chargesText
      ? parseCharges(chargesText)
      : adjustment
        ? [{ label: unsafeText(table.get(row, "Adjustment Description")) || "Adjustment", amount: round2(adjustment) }]
        : [];
    let totals = computeDocumentTotals(lineItems, adjustments);
    // The other system allows prices with three decimals, which this one rounds to
    // two, so a line can come out a cent or two away from the total the customer
    // was sent. A small difference is kept as a "Rounding" charge so the document
    // still adds up to that total; a larger one is imported as it is and reported.
    const fileTotalText = table.get(row, "Total");
    const fileTotal = fileTotalText ? parseAmount(fileTotalText) : null;
    const difference = fileTotal === null ? 0 : round2(fileTotal - totals.total);
    let note = "";
    if (difference !== 0 && Math.abs(difference) <= 1) {
      adjustments.push({ label: "Rounding", amount: difference });
      totals = computeDocumentTotals(lineItems, adjustments);
      note = `imported with a Rounding charge of ${csvAmount(difference)}, so it adds up to ${csvAmount(fileTotal!)} as in the file.`;
    } else if (difference !== 0) {
      note = `imported, but its lines add up to ${csvAmount(totals.total)} while the file says ${csvAmount(fileTotal!)}. Check it.`;
    }

    try {
      const outcome = await tx(async (client) => {
        const customerId = await findCustomer(
          client,
          table.get(row, "Customer ID", "CustomerID"),
          unsafeText(table.get(row, "Customer Name")),
        );
        if (!customerId) {
          return `the customer "${table.get(row, "Customer Name")}" was not found. Import customers first.`;
        }
        const customer = await getCustomer(client, customerId);
        const currency = (table.get(row, "Currency Code").toUpperCase().match(/^[A-Z]{3}$/)?.[0] ?? "") ||
          customer.currency || settings.currency;

        let convertedFrom: string | null = null;
        const estimateNumber = isInvoice ? unsafeText(table.get(row, "Estimate Number")) : "";
        if (estimateNumber) {
          const found = await client.query("select id from documents where kind = 'estimate' and number = $1", [estimateNumber]);
          convertedFrom = found.rows[0]?.id ?? null;
        }
        const approvedish = APPROVED_STATES.includes(status);
        const fields = {
          number,
          customer_id: customerId,
          currency,
          issue_date: issueDate,
          due_date: isInvoice ? otherDate : null,
          valid_until: isInvoice ? null : otherDate,
          reference: unsafeText(table.get(row, "PurchaseOrder", "Reference", "Reference#")).slice(0, 100),
          project_name: unsafeText(table.get(row, "Project Name")).slice(0, 200),
          subject: unsafeText(table.get(row, "Subject")).slice(0, 500),
          notes: unsafeText(table.get(row, "Notes")),
          terms: unsafeText(table.get(row, "Terms & Conditions", "Terms")),
          bank_details_title: isInvoice ? unsafeText(table.get(row, "Payment Details Title")) : "",
          bank_details: isInvoice ? unsafeText(table.get(row, "Payment Details")) : "",
          show_total: !isInvoice && /^(yes|true|1)$/i.test(table.get(row, "Show Total")),
          converted_from_id: convertedFrom,
          subtotal: totals.subtotal,
          total: totals.total,
          status,
          submitted_by: status === "draft" || status === "rejected" ? null : user.id,
          approved_by: approvedish ? user.id : null,
          approved_at: approvedish ? new Date() : null,
          business_snapshot: approvedish ? JSON.stringify(snapshotBusiness(settings)) : null,
          customer_snapshot: approvedish ? JSON.stringify(snapshotCustomer(customer)) : null,
        };

        // The same document imported before, or (for our own exports) the document with that id.
        // A file without an id column matches on the number instead.
        const externalId = key.startsWith("#") ? null : key;
        const existing = externalId
          ? await client.query(
              `select id, status from documents
                where kind = $1 and (external_id = $2 or (external_id is null and id::text = $2)) for update`,
              [kind, externalId],
            )
          : await client.query("select id, status from documents where kind = $1 and number = $2 for update", [kind, number]);

        const columns = Object.keys(fields);
        const values = Object.values(fields);
        let documentId: string;
        if (existing.rows[0]) {
          documentId = existing.rows[0].id;
          const paid = await client.query("select 1 from payments where document_id = $1 limit 1", [documentId]);
          if (paid.rowCount && !["approved", "paid"].includes(status)) {
            return `it has payments recorded here, so its status can't become "${STATUS_OUT[status]}".`;
          }
          await client.query(
            `update documents set ${columns.map((c, i) => `${c} = $${i + 2}`).join(", ")}, updated_at = now() where id = $1`,
            [documentId, ...values],
          );
          await client.query("delete from document_lines where document_id = $1", [documentId]);
          await client.query("delete from document_adjustments where document_id = $1", [documentId]);
        } else {
          const inserted = await client.query(
            `insert into documents (kind, external_id, created_by, ${columns.join(", ")})
             values ($1, $2, $3, ${columns.map((_, i) => `$${i + 4}`).join(", ")}) returning id`,
            [kind, externalId, user.id, ...values],
          );
          documentId = inserted.rows[0].id;
        }
        for (const [position, line] of lineItems.entries()) {
          await client.query(
            `insert into document_lines (document_id, position, name, description, qty, rate, discount)
             values ($1, $2, $3, $4, $5, $6, $7)`,
            [documentId, position, line.name, line.description, line.qty, line.rate, line.discount],
          );
        }
        for (const [position, charge] of adjustments.entries()) {
          await client.query(
            "insert into document_adjustments (document_id, position, label, amount) values ($1, $2, $3, $4)",
            [documentId, position, charge.label.slice(0, 200), charge.amount],
          );
        }
        if (isInvoice) await settleInvoice(client, documentId);
        await addEvent(
          client,
          documentId,
          user,
          "imported",
          `${existing.rows[0] ? "Updated" : "Imported"} from a CSV file as ${STATUS_OUT[status]}, total ${formatMoney(totals.total, currency)}`,
        );
        return existing.rows[0] ? "updated" : "created";
      });
      if (outcome === "created" || outcome === "updated") {
        result[outcome]++;
        if (note) problems.add(`${where}: ${note}`);
      } else {
        skip(outcome);
      }
    } catch (error) {
      if ((error as { code?: string }).code === "23505") skip(`${label.toLowerCase()} number ${number} is already used by another ${kind}.`);
      else throw error;
    }
  }
  return { ...result, problems: problems.list };
}

// ---------- import: payments ----------

async function importPayments(csv: string, user: SessionUser): Promise<ImportResult> {
  const table = new CsvTable(csv);
  if (!table.has("Invoice Number")) {
    throw new HttpError(400, 'This doesn\'t look like a file of payments: it needs an "Invoice Number" column.');
  }
  const result = { created: 0, updated: 0, skipped: 0 };
  const problems = new Problems();

  for (const [index, row] of table.rows.entries()) {
    const invoiceNumber = unsafeText(table.get(row, "Invoice Number"));
    const where = `Row ${index + 2}${invoiceNumber ? ` (${invoiceNumber})` : ""}`;
    const skip = (why: string) => {
      result.skipped++;
      problems.add(`${where}: ${why}`);
    };
    if (!invoiceNumber) {
      skip("no invoice number.");
      continue;
    }
    const date = isoDate(table.get(row, "Date", "Payment Date"));
    if (!date) {
      skip("the payment date is missing or not YYYY-MM-DD.");
      continue;
    }
    const amount = round2(parseAmount(table.get(row, "Amount Applied to Invoice", "Amount")));
    if (amount <= 0) {
      skip("the amount is zero or missing.");
      continue;
    }
    const bankCharges = round2(parseAmount(table.get(row, "Bank Charges")));
    if (bankCharges < 0 || bankCharges > amount) {
      skip("the bank charges are negative or more than the amount.");
      continue;
    }
    // One payment can settle several invoices; each application has its own id.
    const externalId = table.get(row, "InvoicePayment ID", "CustomerPayment ID", "Payment ID") || null;
    const paymentNumber = Number(table.get(row, "Payment Number"));

    const outcome = await tx(async (client) => {
      const found = await client.query(
        "select id, status, total, currency from documents where kind = 'invoice' and number = $1 for update",
        [invoiceNumber],
      );
      const invoice = found.rows[0];
      if (!invoice) return `invoice ${invoiceNumber} is not here. Import invoices first.`;
      if (!["approved", "paid"].includes(invoice.status)) {
        return `invoice ${invoiceNumber} is ${invoice.status.replace("_", " ")}; payments need an approved invoice.`;
      }
      const existing = externalId
        ? await client.query(
            "select id, document_id from payments where external_id = $1 or (external_id is null and id::text = $1)",
            [externalId],
          )
        : { rows: [] as { id: string; document_id: string }[] };
      const current = existing.rows[0];
      if (current && current.document_id !== invoice.id) return "that payment belongs to a different invoice here.";

      const paidElsewhere = await client.query(
        "select coalesce(sum(amount), 0) as paid from payments where document_id = $1 and id <> coalesce($2::uuid, '00000000-0000-0000-0000-000000000000')",
        [invoice.id, current?.id ?? null],
      );
      const balance = round2(invoice.total - paidElsewhere.rows[0].paid);
      if (amount > balance) {
        return `the payment of ${csvAmount(amount)} is more than the invoice's balance of ${csvAmount(balance)}.`;
      }
      const fields = [
        amount,
        bankCharges,
        date,
        unsafeText(table.get(row, "Mode", "Payment Mode")).slice(0, 100),
        unsafeText(table.get(row, "Reference Number", "Reference")).slice(0, 100),
        unsafeText(table.get(row, "Description", "Notes")).slice(0, 500),
      ];
      if (current) {
        await client.query(
          "update payments set amount = $2, bank_charges = $3, date = $4, method = $5, reference = $6, note = $7 where id = $1",
          [current.id, ...fields],
        );
      } else {
        // Keep the old payment number when it is free, so receipts still match.
        const free =
          Number.isInteger(paymentNumber) && paymentNumber > 0 &&
          !(await client.query("select 1 from payments where number = $1", [paymentNumber])).rowCount;
        await client.query(
          `insert into payments (document_id, external_id, created_by, amount, bank_charges, date, method, reference, note${free ? ", number" : ""})
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9${free ? ", $10" : ""})`,
          [invoice.id, externalId, user.id, ...fields, ...(free ? [paymentNumber] : [])],
        );
      }
      await settleInvoice(client, invoice.id);
      await addEvent(
        client,
        invoice.id,
        user,
        "imported",
        `Payment of ${formatMoney(amount, invoice.currency)} ${current ? "updated" : "imported"} from a CSV file`,
      );
      return current ? "updated" : "created";
    });
    if (outcome === "created" || outcome === "updated") result[outcome]++;
    else skip(outcome);
  }
  // New payments continue after the highest number imported.
  await pool.query("select setval('payment_number_seq', greatest((select coalesce(max(number), 0) from payments), 1))");
  return { ...result, problems: problems.list };
}

// ---------- routes ----------

function dataset(value: string | undefined): CsvDataset {
  if (!DATASETS.includes(value as CsvDataset)) throw new HttpError(404, "Not found.");
  return value as CsvDataset;
}

export function transferRoutes(app: Hono<Env>) {
  app.get("/api/export/:dataset", async (c) => {
    requirePermission(c, "data.export");
    const what = dataset(c.req.param("dataset"));
    const csv =
      what === "customers"
        ? await exportCustomers()
        : what === "items"
          ? await exportItems()
          : what === "payments"
            ? await exportPayments()
            : await exportDocuments(what === "estimates" ? "estimate" : "invoice");
    const today = new Date().toISOString().slice(0, 10);
    return c.body(csv, 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${what}-${today}.csv"`,
      "Cache-Control": "private, no-store",
    });
  });

  app.post("/api/import/:dataset", async (c) => {
    const user = requirePermission(c, "data.import");
    const what = dataset(c.req.param("dataset"));
    const csv = requiredText(await readBody(c), "csv", 20_000_000);
    const result =
      what === "customers"
        ? await importCustomers(csv)
        : what === "items"
          ? await importItems(csv)
          : what === "payments"
            ? await importPayments(csv, user)
            : await importDocuments(what === "estimates" ? "estimate" : "invoice", csv, user);
    return c.json({ result });
  });
}
