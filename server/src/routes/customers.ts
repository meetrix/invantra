import type { Hono } from "hono";
import type { Customer, ImportResult } from "../../../shared/types.ts";
import { CsvTable } from "../csv.ts";
import { pool, tx, type Db } from "../db.ts";
import { HttpError, idParam, readBody, requiredText, requirePermission, text, type Body, type Env } from "../http.ts";

function toCustomer(row: Record<string, unknown>): Customer {
  return {
    id: row.id as string,
    name: row.name as string,
    contactPerson: row.contact_person as string,
    email: row.email as string,
    phone: row.phone as string,
    address: row.address as string,
    country: row.country as string,
    currency: row.currency as string,
    taxId: row.tax_id as string,
    notes: row.notes as string,
    archived: row.archived as boolean,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

export async function getCustomer(db: Db, id: string): Promise<Customer> {
  const { rows } = await db.query("select * from customers where id = $1", [id]);
  if (!rows[0]) throw new HttpError(404, "Customer not found.");
  return toCustomer(rows[0]);
}

function currencyCode(body: Body): string {
  const currency = text(body, "currency", 3).trim().toUpperCase();
  if (currency && !/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, "Currency must be a 3-letter code such as USD.");
  return currency;
}

/** Column values in the order the insert and update statements below expect them. */
function customerValues(body: Body) {
  return [
    requiredText(body, "name", 300),
    text(body, "contactPerson", 300).trim(),
    text(body, "email", 254).trim(),
    text(body, "phone", 100).trim(),
    text(body, "address", 2000),
    text(body, "country", 100).trim(),
    currencyCode(body),
    text(body, "taxId", 100).trim(),
    text(body, "notes", 5000),
    body.archived === true,
  ];
}

// Column names as they appear in a contacts export; the first one present wins.
const COLUMNS = {
  externalId: ["Contact ID", "Customer ID", "ID"],
  name: ["Display Name", "Customer Name", "Contact Name", "Name", "Company Name"],
  email: ["EmailID", "Email"],
  phone: ["Phone", "Work Phone", "MobilePhone", "Mobile"],
  country: ["Billing Country", "Country"],
  currency: ["Currency Code", "Currency"],
  notes: ["Notes"],
  street: ["Billing Address", "Address"],
};

/**
 * Creates or updates customers from a contacts CSV. Rows carrying an id update
 * the customer imported earlier under that id; a field is only overwritten when
 * the file has a column for it, so a short export cannot blank out a fuller one.
 */
async function importCustomers(csv: string): Promise<ImportResult> {
  const table = new CsvTable(csv);
  if (!table.has(...COLUMNS.name)) throw new HttpError(400, "The file needs a Display Name or Name column.");
  const result: ImportResult = { created: 0, updated: 0, skipped: 0 };

  await tx(async (client) => {
    for (const row of table.rows) {
      const name = table.get(row, ...COLUMNS.name);
      if (!name) {
        result.skipped++;
        continue;
      }
      const fields: Record<string, string> = { name };

      if (table.has("First Name", "Last Name")) {
        const person = [table.get(row, "First Name"), table.get(row, "Last Name")].filter(Boolean).join(" ");
        // A customer named after the person would print the same name twice.
        fields.contact_person = name.toLowerCase().includes(person.toLowerCase()) ? "" : person;
      }
      if (table.has(...COLUMNS.email)) fields.email = table.get(row, ...COLUMNS.email);
      // Spreadsheet exports prefix phone numbers with an apostrophe to stop them being read as formulas.
      if (table.has(...COLUMNS.phone)) fields.phone = table.get(row, ...COLUMNS.phone).replace(/^'/, "");
      if (table.has(...COLUMNS.street)) {
        const cityLine = [table.get(row, "Billing City"), table.get(row, "Billing State"), table.get(row, "Billing Code")]
          .filter(Boolean)
          .join(" ");
        fields.address = [table.get(row, ...COLUMNS.street), table.get(row, "Billing Street2"), cityLine]
          .filter(Boolean)
          .join("\n");
      }
      if (table.has(...COLUMNS.country)) fields.country = table.get(row, ...COLUMNS.country);
      if (table.has(...COLUMNS.currency)) {
        const currency = table.get(row, ...COLUMNS.currency).toUpperCase();
        fields.currency = /^[A-Z]{3}$/.test(currency) ? currency : "";
      }
      if (table.has(...COLUMNS.notes)) fields.notes = table.get(row, ...COLUMNS.notes);

      const externalId = table.get(row, ...COLUMNS.externalId);
      const names = Object.keys(fields);
      const values = Object.values(fields);

      if (externalId) {
        const assignments = names.map((column, i) => `${column} = $${i + 2}`).join(", ");
        const updated = await client.query(
          `update customers set ${assignments}, updated_at = now() where external_id = $1`,
          [externalId, ...values],
        );
        if (updated.rowCount) {
          result.updated++;
          continue;
        }
      }
      await client.query(
        `insert into customers (external_id, ${names.join(", ")})
         values ($1, ${names.map((_, i) => `$${i + 2}`).join(", ")})`,
        [externalId || null, ...values],
      );
      result.created++;
    }
  });
  return result;
}

export function customerRoutes(app: Hono<Env>) {
  app.get("/api/customers", async (c) => {
    const { rows } = await pool.query("select * from customers order by lower(name)");
    return c.json({ customers: rows.map(toCustomer) });
  });

  app.get("/api/customers/:id", async (c) => c.json({ customer: await getCustomer(pool, idParam(c)) }));

  app.post("/api/customers", async (c) => {
    requirePermission(c, "customers.write");
    const { rows } = await pool.query(
      `insert into customers (name, contact_person, email, phone, address, country, currency, tax_id, notes, archived)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
      customerValues(await readBody(c)),
    );
    return c.json({ customer: toCustomer(rows[0]) }, 201);
  });

  app.put("/api/customers/:id", async (c) => {
    requirePermission(c, "customers.write");
    const { rows } = await pool.query(
      `update customers set name = $2, contact_person = $3, email = $4, phone = $5, address = $6, country = $7,
              currency = $8, tax_id = $9, notes = $10, archived = $11, updated_at = now()
        where id = $1 returning *`,
      [idParam(c), ...customerValues(await readBody(c))],
    );
    if (!rows[0]) throw new HttpError(404, "Customer not found.");
    return c.json({ customer: toCustomer(rows[0]) });
  });

  app.post("/api/customers/import", async (c) => {
    requirePermission(c, "data.import");
    const body = await readBody(c);
    return c.json({ result: await importCustomers(requiredText(body, "csv", 5_000_000)) });
  });
}
