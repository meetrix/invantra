import type { Hono } from "hono";
import type pg from "pg";
import { computeDocumentTotals, formatMoney, round2 } from "../../../shared/money.ts";
import { numberScope, renderNumber } from "../../../shared/numbering.ts";
import { snapshotBusiness, snapshotCustomer } from "../../../shared/snapshot.ts";
import { MAX_ATTACHMENT_BYTES, MAX_PAYMENT_ATTACHMENTS } from "../../../shared/types.ts";
import type {
  Adjustment,
  Document,
  DocumentEvent,
  DocumentEventType,
  DocumentKind,
  DocumentStatus,
  LineItem,
  Payment,
  PaymentAttachment,
  ReceivedPayment,
  Settings,
} from "../../../shared/types.ts";
import { pool, tx, type Db } from "../db.ts";
import {
  date,
  dateOrNull,
  displayName,
  HttpError,
  idParam,
  list,
  number,
  readBody,
  requirePermission,
  text,
  uuid,
  type Body,
  type Env,
  type SessionUser,
} from "../http.ts";
import { getCustomer } from "./customers.ts";
import { getSettings, nextSeq } from "./settings.ts";

const KIND_LABEL: Record<DocumentKind, string> = { estimate: "Estimate", invoice: "Invoice" };

// ---------- reading ----------

const USER_NAME = (alias: string) => `coalesce(nullif(${alias}.name, ''), ${alias}.email, '')`;

const SELECT = `
  select d.*,
         ${USER_NAME("cu")} as created_by_name,
         ${USER_NAME("su")} as submitted_by_name,
         ${USER_NAME("au")} as approved_by_name,
         (select i.id from documents i
           where i.converted_from_id = d.id and i.status <> 'void'
           order by i.created_at desc limit 1) as converted_to_id
    from documents d
    left join users cu on cu.id = d.created_by
    left join users su on su.id = d.submitted_by
    left join users au on au.id = d.approved_by`;

/** The files attached to each of the given payments, without their contents. */
async function attachmentsByPayment(db: Db, paymentIds: string[]): Promise<Map<string, PaymentAttachment[]>> {
  const grouped = new Map<string, PaymentAttachment[]>();
  if (paymentIds.length === 0) return grouped;
  const { rows } = await db.query(
    "select id, payment_id, name, size from payment_attachments where payment_id = any($1) order by created_at, id",
    [paymentIds],
  );
  for (const r of rows) {
    grouped.set(r.payment_id, [...(grouped.get(r.payment_id) ?? []), { id: r.id, name: r.name, size: r.size }]);
  }
  return grouped;
}

function paymentFromRow(r: Record<string, unknown>, attachments: Map<string, PaymentAttachment[]>): Payment {
  return {
    attachments: attachments.get(r.id as string) ?? [],
    id: r.id as string,
    number: r.number as number,
    amount: r.amount as number,
    bankCharges: r.bank_charges as number,
    date: r.date as string,
    method: r.method as string,
    reference: r.reference as string,
    note: r.note as string,
  };
}

function groupByDocument<T>(rows: Record<string, unknown>[], map: (row: Record<string, unknown>) => T): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.document_id as string;
    grouped.set(key, [...(grouped.get(key) ?? []), map(row)]);
  }
  return grouped;
}

async function loadDocuments(db: Db, where: string, params: unknown[]): Promise<Document[]> {
  const { rows } = await db.query(`${SELECT} where ${where} order by d.created_at desc`, params);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [lines, adjustments, payments] = await Promise.all([
    db.query("select * from document_lines where document_id = any($1) order by position", [ids]),
    db.query("select * from document_adjustments where document_id = any($1) order by position", [ids]),
    db.query("select * from payments where document_id = any($1) order by date, created_at", [ids]),
  ]);
  const linesByDoc = groupByDocument<LineItem>(lines.rows, (r) => ({
    id: r.id as string,
    name: r.name as string,
    description: r.description as string,
    qty: r.qty as number,
    rate: r.rate as number,
    discount: r.discount as number,
  }));
  const adjustmentsByDoc = groupByDocument<Adjustment>(adjustments.rows, (r) => ({
    id: r.id as string,
    label: r.label as string,
    amount: r.amount as number,
  }));
  const attachments = await attachmentsByPayment(db, payments.rows.map((r) => r.id));
  const paymentsByDoc = groupByDocument<Payment>(payments.rows, (r) => paymentFromRow(r, attachments));

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    number: r.number,
    customerId: r.customer_id,
    currency: r.currency,
    issueDate: r.issue_date,
    dueDate: r.due_date,
    validUntil: r.valid_until,
    reference: r.reference,
    projectName: r.project_name,
    subject: r.subject,
    notes: r.notes,
    terms: r.terms,
    bankDetailsTitle: r.bank_details_title,
    bankDetails: r.bank_details,
    lineItems: linesByDoc.get(r.id) ?? [],
    adjustments: adjustmentsByDoc.get(r.id) ?? [],
    payments: paymentsByDoc.get(r.id) ?? [],
    businessSnapshot: r.business_snapshot,
    customerSnapshot: r.customer_snapshot,
    convertedFromId: r.converted_from_id,
    convertedToId: r.converted_to_id,
    subtotal: r.subtotal,
    total: r.total,
    createdByName: r.created_by_name,
    submittedByName: r.submitted_by_name,
    approvedByName: r.approved_by_name,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
}

/** One document with its activity history. */
async function getDocument(db: Db, id: string): Promise<Document> {
  const [document] = await loadDocuments(db, "d.id = $1", [id]);
  if (!document) throw new HttpError(404, "Document not found.");
  const { rows } = await db.query(
    "select id, type, message, reason, user_name, created_at from document_events where document_id = $1 order by created_at desc, id",
    [id],
  );
  const events: DocumentEvent[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    message: r.message,
    reason: r.reason,
    userName: r.user_name,
    createdAt: r.created_at.toISOString(),
  }));
  return { ...document, events };
}

// ---------- writing ----------

interface DraftInput {
  number: string;
  customerId: string;
  issueDate: string;
  dueDate: string | null;
  validUntil: string | null;
  reference: string;
  projectName: string;
  subject: string;
  notes: string;
  terms: string;
  bankDetailsTitle: string;
  bankDetails: string;
  lineItems: Omit<LineItem, "id">[];
  adjustments: Omit<Adjustment, "id">[];
}

function nonNegative(body: Body, key: string): number {
  const value = number(body, key);
  if (value < 0) throw new HttpError(400, `${key} cannot be negative.`);
  return value;
}

function draftInput(body: Body): DraftInput {
  return {
    number: text(body, "number", 60).trim(),
    customerId: uuid(body, "customerId"),
    issueDate: date(body, "issueDate"),
    dueDate: dateOrNull(body, "dueDate"),
    validUntil: dateOrNull(body, "validUntil"),
    reference: text(body, "reference", 100).trim(),
    projectName: text(body, "projectName", 200).trim(),
    subject: text(body, "subject", 500).trim(),
    notes: text(body, "notes", 20_000),
    terms: text(body, "terms", 20_000),
    bankDetailsTitle: text(body, "bankDetailsTitle"),
    bankDetails: text(body, "bankDetails", 20_000),
    lineItems: list(body, "lineItems", 200).map((line) => ({
      name: text(line, "name", 500),
      description: text(line, "description", 10_000),
      qty: nonNegative(line, "qty"),
      rate: round2(nonNegative(line, "rate")),
      discount: round2(nonNegative(line, "discount")),
    })),
    adjustments: list(body, "adjustments", 50).map((adjustment) => ({
      label: text(adjustment, "label", 200),
      amount: round2(number(adjustment, "amount")),
    })),
  };
}

async function addEvent(
  client: pg.PoolClient,
  documentId: string,
  user: SessionUser,
  type: DocumentEventType,
  message: string,
  reason = "",
): Promise<void> {
  await client.query(
    `insert into document_events (document_id, type, message, reason, user_id, user_name)
     values ($1, $2, $3, $4, $5, $6)`,
    [documentId, type, message, reason, user.id, displayName(user)],
  );
}

/**
 * The statuses that can still be changed and submitted: a rejected document is
 * as editable as a draft, it simply carries why it came back.
 */
const EDITABLE: DocumentStatus[] = ["draft", "rejected"];

function numberFormat(settings: Settings, kind: DocumentKind): string {
  return kind === "invoice" ? settings.invoiceNumberFormat : settings.estimateNumberFormat;
}

function renderNext(settings: Settings, kind: DocumentKind, seq: number, issueDate: string): string {
  return renderNumber(numberFormat(settings, kind), seq, new Date(`${issueDate}T00:00:00`));
}

/**
 * The first number from this counter that nothing else holds, with the counter
 * it came from. Numbers already in use are stepped over rather than offered and
 * refused: they exist whenever one has been typed by hand, and whenever a
 * counter starts afresh in a period that already has documents — as every month
 * did the day numbering became monthly.
 */
async function freeNumber(
  db: Db,
  settings: Settings,
  kind: DocumentKind,
  seq: number,
  issueDate: string,
): Promise<{ number: string; seq: number }> {
  for (let guard = 0; guard < 1000; guard++) {
    const number = renderNext(settings, kind, seq, issueDate);
    const taken = await db.query("select 1 from documents where kind = $1 and number = $2", [kind, number]);
    if (!taken.rowCount) return { number, seq };
    seq += 1;
  }
  throw new HttpError(409, "No free number could be found. Change the number format in Settings.");
}

/**
 * Picks the number for a new document. A blank request, or one equal to the
 * number the counter would give, takes the next number and advances the
 * counter; anything else is used as typed and leaves the counter alone.
 *
 * The counter belongs to a scope rather than to the kind alone, so estimates
 * numbered MTX{YYYY}{MM}{seq:2} restart at 01 each month. The insert creates
 * the month's row the first time it is needed; the row lock then makes two
 * simultaneous saves queue rather than share a number.
 */
async function allocateNumber(
  client: pg.PoolClient,
  settings: Settings,
  kind: DocumentKind,
  requested: string,
  issueDate: string,
): Promise<string> {
  const scope = numberScope(numberFormat(settings, kind), new Date(`${issueDate}T00:00:00`));
  await client.query(
    "insert into number_sequences (kind, scope) values ($1, $2) on conflict (kind, scope) do nothing",
    [kind, scope],
  );
  const { rows } = await client.query(
    "select next_seq from number_sequences where kind = $1 and scope = $2 for update",
    [kind, scope],
  );

  const { number: next, seq } = await freeNumber(client, settings, kind, rows[0].next_seq, issueDate);
  if (requested && requested !== next) return requested;
  await client.query("update number_sequences set next_seq = $3 where kind = $1 and scope = $2", [kind, scope, seq + 1]);
  return next;
}

/** Turns the unique (kind, number) violation into a message the form can show. */
async function savingNumber<T>(kind: DocumentKind, number: string, save: () => Promise<T>): Promise<T> {
  try {
    return await save();
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new HttpError(409, `${KIND_LABEL[kind]} number ${number} is already in use. Enter a different number.`);
    }
    throw error;
  }
}

async function replaceLines(client: pg.PoolClient, documentId: string, input: DraftInput): Promise<void> {
  await client.query("delete from document_lines where document_id = $1", [documentId]);
  await client.query("delete from document_adjustments where document_id = $1", [documentId]);
  for (const [position, line] of input.lineItems.entries()) {
    await client.query(
      `insert into document_lines (document_id, position, name, description, qty, rate, discount)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [documentId, position, line.name, line.description, line.qty, line.rate, line.discount],
    );
  }
  for (const [position, adjustment] of input.adjustments.entries()) {
    await client.query(
      "insert into document_adjustments (document_id, position, label, amount) values ($1, $2, $3, $4)",
      [documentId, position, adjustment.label, adjustment.amount],
    );
  }
}

/** Locks the document row for the rest of the transaction, so two actions on it cannot interleave. */
async function lockDocument(client: pg.PoolClient, id: string) {
  const { rows } = await client.query(
    "select id, kind, status, number, customer_id, total, currency from documents where id = $1 for update",
    [id],
  );
  if (!rows[0]) throw new HttpError(404, "Document not found.");
  return rows[0] as {
    id: string;
    kind: DocumentKind;
    status: Document["status"];
    number: string;
    customer_id: string;
    total: number;
    currency: string;
  };
}

export function documentRoutes(app: Hono<Env>) {
  app.get("/api/documents", async (c) => {
    const kind = c.req.query("kind");
    const documents =
      kind === "estimate" || kind === "invoice"
        ? await loadDocuments(pool, "d.kind = $1", [kind])
        : await loadDocuments(pool, "true", []);
    return c.json({ documents });
  });

  /** The number a new document would get, shown in the form before anything is saved. */
  app.get("/api/documents/next-number", async (c) => {
    const kind = c.req.query("kind");
    if (kind !== "estimate" && kind !== "invoice") throw new HttpError(400, "kind must be estimate or invoice.");
    const issueDate = date({ date: c.req.query("date") }, "date");
    const settings = await getSettings(pool);
    const format = numberFormat(settings, kind);
    const seq = await nextSeq(pool, kind, format, new Date(`${issueDate}T00:00:00`));
    const { number } = await freeNumber(pool, settings, kind, seq, issueDate);
    return c.json({ number });
  });

  app.get("/api/documents/:id", async (c) => c.json({ document: await getDocument(pool, idParam(c)) }));

  /**
   * Creates a draft. With convertedFromId it is the invoice made from an
   * approved estimate, which is marked invoiced in the same transaction.
   */
  app.post("/api/documents", async (c) => {
    const user = requirePermission(c, "documents.write");
    const body = await readBody(c);
    const kind = body.kind;
    if (kind !== "estimate" && kind !== "invoice") throw new HttpError(400, "kind must be estimate or invoice.");
    const input = draftInput(body);
    const convertedFromId = body.convertedFromId ? uuid(body, "convertedFromId") : null;
    if (convertedFromId && kind !== "invoice") throw new HttpError(400, "Only an invoice can be made from an estimate.");

    const id = await savingNumber(kind, input.number, () =>
      tx(async (client) => {
        const settings = await getSettings(client);
        const customer = await getCustomer(client, input.customerId);

        let estimate: Awaited<ReturnType<typeof lockDocument>> | null = null;
        if (convertedFromId) {
          estimate = await lockDocument(client, convertedFromId);
          if (estimate.kind !== "estimate") throw new HttpError(400, "Only an estimate can be converted to an invoice.");
          if (estimate.status !== "approved") {
            throw new HttpError(409, "Only an approved estimate can be converted to an invoice.");
          }
        }

        const totals = computeDocumentTotals(input.lineItems, input.adjustments);
        const currency = customer.currency || settings.currency;
        const docNumber = await allocateNumber(client, settings, kind, input.number, input.issueDate);
        input.number = docNumber;

        const { rows } = await client.query(
          `insert into documents (kind, number, customer_id, currency, issue_date, due_date, valid_until, notes, terms,
                                  bank_details_title, bank_details, converted_from_id, subtotal, total, created_by,
                                  reference, project_name, subject)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) returning id`,
          [
            kind,
            docNumber,
            input.customerId,
            currency,
            input.issueDate,
            kind === "invoice" ? input.dueDate : null,
            kind === "estimate" ? input.validUntil : null,
            input.notes,
            input.terms,
            input.bankDetailsTitle,
            input.bankDetails,
            convertedFromId,
            totals.subtotal,
            totals.total,
            user.id,
            input.reference,
            input.projectName,
            input.subject,
          ],
        );
        const documentId = rows[0].id as string;
        await replaceLines(client, documentId, input);

        const amount = formatMoney(totals.total, currency);
        if (estimate) {
          await client.query("update documents set status = 'invoiced', updated_at = now() where id = $1", [estimate.id]);
          await addEvent(client, estimate.id, user, "converted", `Estimate converted to invoice ${docNumber}`);
          await addEvent(client, documentId, user, "created", `Invoice created for ${amount} from estimate ${estimate.number}`);
        } else {
          await addEvent(client, documentId, user, "created", `${KIND_LABEL[kind]} created for ${amount}`);
        }
        return documentId;
      }),
    );
    return c.json({ document: await getDocument(pool, id) }, 201);
  });

  /** Saves a draft. Anything past draft is read-only until it is converted back. */
  app.put("/api/documents/:id", async (c) => {
    const user = requirePermission(c, "documents.write");
    const id = idParam(c);
    const input = draftInput(await readBody(c));
    if (!input.number) throw new HttpError(400, "number is required.");

    const current = await pool.query("select kind from documents where id = $1", [id]);
    if (!current.rows[0]) throw new HttpError(404, "Document not found.");

    await savingNumber(current.rows[0].kind, input.number, () =>
      tx(async (client) => {
        const document = await lockDocument(client, id);
        if (!EDITABLE.includes(document.status)) {
          throw new HttpError(409, "Only a draft can be edited. Convert it to a draft first.");
        }
        const settings = await getSettings(client);
        const customer = await getCustomer(client, input.customerId);
        const totals = computeDocumentTotals(input.lineItems, input.adjustments);
        const currency = customer.currency || settings.currency;

        await client.query(
          `update documents set number = $2, customer_id = $3, currency = $4, issue_date = $5, due_date = $6,
                  valid_until = $7, notes = $8, terms = $9, bank_details_title = $10, bank_details = $11,
                  subtotal = $12, total = $13, reference = $14, project_name = $15, subject = $16, updated_at = now()
            where id = $1`,
          [
            id,
            input.number,
            input.customerId,
            currency,
            input.issueDate,
            document.kind === "invoice" ? input.dueDate : null,
            document.kind === "estimate" ? input.validUntil : null,
            input.notes,
            input.terms,
            input.bankDetailsTitle,
            input.bankDetails,
            totals.subtotal,
            totals.total,
            input.reference,
            input.projectName,
            input.subject,
          ],
        );
        await replaceLines(client, id, input);

        const label = KIND_LABEL[document.kind];
        const changed = totals.total !== document.total || currency !== document.currency;
        await addEvent(
          client,
          id,
          user,
          "updated",
          changed ? `${label} updated; total is now ${formatMoney(totals.total, currency)}` : `${label} updated`,
        );
      }),
    );
    return c.json({ document: await getDocument(pool, id) });
  });

  app.post("/api/documents/:id/submit", async (c) => {
    const user = requirePermission(c, "documents.write");
    const id = idParam(c);
    await tx(async (client) => {
      const document = await lockDocument(client, id);
      if (!EDITABLE.includes(document.status)) {
        throw new HttpError(409, "Only a draft can be submitted for approval.");
      }
      const lines = await client.query("select 1 from document_lines where document_id = $1 limit 1", [id]);
      if (!lines.rowCount) throw new HttpError(400, "Add at least one line item before submitting.");
      await client.query(
        "update documents set status = 'pending_approval', submitted_by = $2, updated_at = now() where id = $1",
        [id, user.id],
      );
      await addEvent(client, id, user, "submitted", `${KIND_LABEL[document.kind]} submitted for approval`);
    });
    return c.json({ document: await getDocument(pool, id) });
  });

  /** Approving freezes the business and customer details onto the document. */
  app.post("/api/documents/:id/approve", async (c) => {
    const user = requirePermission(c, "documents.approve");
    const id = idParam(c);
    await tx(async (client) => {
      const document = await lockDocument(client, id);
      if (document.status !== "pending_approval") {
        throw new HttpError(409, "Only a document that is pending approval can be approved.");
      }
      const settings = await getSettings(client);
      const customer = await getCustomer(client, document.customer_id);
      await client.query(
        `update documents set status = 'approved', approved_by = $2, approved_at = now(),
                business_snapshot = $3, customer_snapshot = $4, updated_at = now()
          where id = $1`,
        [id, user.id, JSON.stringify(snapshotBusiness(settings)), JSON.stringify(snapshotCustomer(customer))],
      );
      await addEvent(client, id, user, "approved", `${KIND_LABEL[document.kind]} approved`);
    });
    return c.json({ document: await getDocument(pool, id) });
  });

  app.post("/api/documents/:id/reject", async (c) => {
    const user = requirePermission(c, "documents.approve");
    const id = idParam(c);
    const reason = text(await readBody(c), "reason", 2000).trim();
    if (!reason) throw new HttpError(400, "Say why it is being rejected.");
    await tx(async (client) => {
      const document = await lockDocument(client, id);
      if (document.status !== "pending_approval") {
        throw new HttpError(409, "Only a document that is pending approval can be rejected.");
      }
      await client.query("update documents set status = 'rejected', submitted_by = null, updated_at = now() where id = $1", [id]);
      await addEvent(client, id, user, "rejected", `${KIND_LABEL[document.kind]} rejected`, reason);
    });
    return c.json({ document: await getDocument(pool, id) });
  });

  /**
   * Reopens a submitted or approved document for editing; it keeps its number
   * and must be approved again. Undoing an approval needs a reason.
   */
  app.post("/api/documents/:id/to-draft", async (c) => {
    const user = requirePermission(c, "documents.write");
    const id = idParam(c);
    const reason = text(await readBody(c), "reason", 2000).trim();
    await tx(async (client) => {
      const document = await lockDocument(client, id);
      if (document.status === "invoiced") {
        throw new HttpError(409, "This estimate has been invoiced, so it can no longer be changed.");
      }
      if (document.status !== "pending_approval" && document.status !== "approved") {
        throw new HttpError(409, "Only a submitted or approved document can be converted to a draft.");
      }
      if (document.status === "approved" && !reason) {
        throw new HttpError(400, "Enter a reason for converting an approved document to a draft.");
      }
      const payments = await client.query("select 1 from payments where document_id = $1 limit 1", [id]);
      if (payments.rowCount) throw new HttpError(409, "This invoice has payments recorded, so it can no longer be changed.");

      await client.query(
        `update documents set status = 'draft', submitted_by = null, approved_by = null, approved_at = null,
                business_snapshot = null, customer_snapshot = null, updated_at = now()
          where id = $1`,
        [id],
      );
      await addEvent(client, id, user, "to_draft", `${KIND_LABEL[document.kind]} converted to draft`, reason);
    });
    return c.json({ document: await getDocument(pool, id) });
  });

  app.post("/api/documents/:id/void", async (c) => {
    const user = requirePermission(c, "documents.write");
    const id = idParam(c);
    await tx(async (client) => {
      const document = await lockDocument(client, id);
      if (!["draft", "rejected", "pending_approval", "approved"].includes(document.status)) {
        throw new HttpError(409, "This document can no longer be voided.");
      }
      const payments = await client.query("select 1 from payments where document_id = $1 limit 1", [id]);
      if (payments.rowCount) throw new HttpError(409, "This invoice has payments recorded, so it cannot be voided.");
      await client.query("update documents set status = 'void', updated_at = now() where id = $1", [id]);
      await addEvent(client, id, user, "voided", `${KIND_LABEL[document.kind]} voided`);

      // Voiding the invoice made from an estimate frees the estimate to be invoiced again.
      const { rows } = await client.query(
        `update documents e set status = 'approved', updated_at = now()
           from documents i
          where i.id = $1 and e.id = i.converted_from_id and e.status = 'invoiced'
        returning e.id`,
        [id],
      );
      if (rows[0]) {
        await addEvent(client, rows[0].id, user, "updated", `Invoice ${document.number} was voided; estimate is approved again`);
      }
    });
    return c.json({ document: await getDocument(pool, id) });
  });

  /** Every payment received, newest first, for the Payments Received page. */
  app.get("/api/payments", async (c) => {
    const { rows } = await pool.query(
      `select p.*, d.number as document_number, d.currency, c.name as customer_name
         from payments p
         join documents d on d.id = p.document_id
         join customers c on c.id = d.customer_id
        order by p.date desc, p.number desc`,
    );
    const attachments = await attachmentsByPayment(pool, rows.map((r) => r.id));
    const payments: ReceivedPayment[] = rows.map((r) => ({
      ...paymentFromRow(r, attachments),
      documentId: r.document_id,
      documentNumber: r.document_number,
      customerName: r.customer_name,
      currency: r.currency,
    }));
    return c.json({ payments });
  });

  app.post("/api/documents/:id/payments", async (c) => {
    const user = requirePermission(c, "payments.write");
    const id = idParam(c);
    const body = await readBody(c);
    const amount = round2(number(body, "amount"));
    if (amount <= 0) throw new HttpError(400, "amount must be more than zero.");
    const paidOn = date(body, "date");
    const method = text(body, "method", 100).trim();
    const reference = text(body, "reference", 100).trim();
    const note = text(body, "note", 500).trim();
    const bankCharges = body.bankCharges === undefined ? 0 : round2(nonNegative(body, "bankCharges"));
    if (bankCharges > amount) throw new HttpError(400, "Bank charges cannot be more than the amount received.");

    await tx(async (client) => {
      const document = await lockDocument(client, id);
      if (document.kind !== "invoice" || document.status !== "approved") {
        throw new HttpError(409, "Payments can only be recorded against an approved, unpaid invoice.");
      }
      const { rows } = await client.query("select coalesce(sum(amount), 0) as paid from payments where document_id = $1", [id]);
      const balance = round2(document.total - rows[0].paid);
      if (amount > balance) {
        throw new HttpError(400, `The payment is more than the balance due (${formatMoney(balance, document.currency)}).`);
      }
      await client.query(
        `insert into payments (document_id, amount, bank_charges, date, method, reference, note, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, amount, bankCharges, paidOn, method, reference, note, user.id],
      );
      if (amount === balance) {
        await client.query("update documents set status = 'paid', updated_at = now() where id = $1", [id]);
      }
      await addEvent(client, id, user, "payment", `Payment of ${formatMoney(amount, document.currency)} recorded`);
    });
    return c.json({ document: await getDocument(pool, id) });
  });

  /**
   * Attaches one file to a payment. The file is the request body as it is,
   * with its name in the query string, so nothing has to be encoded.
   */
  app.post("/api/payments/:id/attachments", async (c) => {
    const user = requirePermission(c, "payments.write");
    const paymentId = idParam(c);
    // Only the last path segment is kept, in case a browser sends a full path.
    const name = (c.req.query("name") ?? "").split(/[\\/]/).pop()!.trim().slice(0, 200);
    if (!name) throw new HttpError(400, "name is required.");
    const data = Buffer.from(await c.req.arrayBuffer());
    if (data.length === 0) throw new HttpError(400, "The file is empty.");
    if (data.length > MAX_ATTACHMENT_BYTES) throw new HttpError(400, "A file can be at most 5 MB.");
    const contentType = (c.req.header("content-type") ?? "application/octet-stream").slice(0, 100);

    const documentId = await tx(async (client) => {
      const { rows } = await client.query("select document_id, number from payments where id = $1 for update", [paymentId]);
      if (!rows[0]) throw new HttpError(404, "Payment not found.");
      const count = await client.query("select count(*)::int as n from payment_attachments where payment_id = $1", [paymentId]);
      if (count.rows[0].n >= MAX_PAYMENT_ATTACHMENTS) {
        throw new HttpError(409, `A payment can have at most ${MAX_PAYMENT_ATTACHMENTS} files.`);
      }
      await client.query(
        "insert into payment_attachments (payment_id, name, content_type, size, data, created_by) values ($1, $2, $3, $4, $5, $6)",
        [paymentId, name, contentType, data.length, data, user.id],
      );
      await addEvent(client, rows[0].document_id, user, "payment", `File "${name}" attached to payment #${rows[0].number}`);
      return rows[0].document_id as string;
    });
    return c.json({ document: await getDocument(pool, documentId) }, 201);
  });

  /** Always sent as a download, never shown inline: an uploaded file must not run as a page of this site. */
  app.get("/api/attachments/:id", async (c) => {
    const { rows } = await pool.query("select name, content_type, data from payment_attachments where id = $1", [idParam(c)]);
    if (!rows[0]) throw new HttpError(404, "File not found.");
    return c.body(rows[0].data, 200, {
      "Content-Type": rows[0].content_type,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(rows[0].name)}`,
      "Cache-Control": "private, no-store",
    });
  });

  app.delete("/api/attachments/:id", async (c) => {
    const user = requirePermission(c, "payments.write");
    const id = idParam(c);
    const documentId = await tx(async (client) => {
      const { rows } = await client.query(
        `delete from payment_attachments a using payments p
          where a.id = $1 and p.id = a.payment_id
        returning a.name, p.number, p.document_id`,
        [id],
      );
      if (!rows[0]) throw new HttpError(404, "File not found.");
      await addEvent(client, rows[0].document_id, user, "payment", `File "${rows[0].name}" removed from payment #${rows[0].number}`);
      return rows[0].document_id as string;
    });
    return c.json({ document: await getDocument(pool, documentId) });
  });
}
