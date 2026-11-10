import type { Hono } from "hono";
import { round2 } from "../../../shared/money.ts";
import type { ImportResult, Item } from "../../../shared/types.ts";
import { CsvTable, parseAmount, Problems, unsafeText } from "../csv.ts";
import { pool, tx } from "../db.ts";
import { HttpError, idParam, number, readBody, requiredText, requirePermission, text, type Body, type Env } from "../http.ts";

function toItem(row: Record<string, unknown>): Item {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    rate: row.rate as number,
    currency: row.currency as string,
    archived: row.archived as boolean,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

function itemValues(body: Body) {
  const rate = number(body, "rate");
  if (rate < 0) throw new HttpError(400, "rate cannot be negative.");
  // Blank is allowed and means "the business currency", which is what every
  // item imported before the field existed carries.
  const currency = text(body, "currency", 3).toUpperCase();
  if (currency && !/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, "Currency must be a 3-letter code such as USD.");
  return [requiredText(body, "name", 500), text(body, "description", 10_000), round2(rate), currency, body.archived === true];
}

/** Creates or updates catalogue items from an items CSV; see importCustomers for the update rule. */
export async function importItems(csv: string): Promise<ImportResult> {
  const table = new CsvTable(csv);
  if (!table.has("Item Name", "Name")) throw new HttpError(400, "The file needs an Item Name or Name column.");
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, problems: [] };
  const problems = new Problems();
  const hasStatus = table.has("Status");

  await tx(async (client) => {
    for (const [index, row] of table.rows.entries()) {
      const name = unsafeText(table.get(row, "Item Name", "Name"));
      if (!name) {
        result.skipped++;
        problems.add(`Row ${index + 2}: no item name.`);
        continue;
      }
      const description = unsafeText(table.get(row, "Description"));
      // "Inactive" in the file's Status column archives the item; without the column, archiving is left alone.
      const archived = hasStatus ? table.get(row, "Status").toLowerCase() === "inactive" : null;
      const rate = parseAmount(table.get(row, "Rate", "Price"));
      const currency = table.get(row, "Currency", "Currency Code").trim().toUpperCase();
      const externalId = table.get(row, "Item ID", "ID");

      if (externalId) {
        const updated = await client.query(
          `update items set name = $2, description = $3, rate = $4, currency = $5,
                  archived = coalesce($6, archived), updated_at = now()
            where external_id = $1 or (external_id is null and id::text = $1)`,
          [externalId, name, description, rate, /^[A-Z]{3}$/.test(currency) ? currency : "", archived],
        );
        if (updated.rowCount) {
          result.updated++;
          continue;
        }
      }
      await client.query(
        "insert into items (external_id, name, description, rate, currency, archived) values ($1, $2, $3, $4, $5, $6)",
        [externalId || null, name, description, rate, /^[A-Z]{3}$/.test(currency) ? currency : "", archived ?? false],
      );
      result.created++;
    }
  });
  return { ...result, problems: problems.list };
}

export function itemRoutes(app: Hono<Env>) {
  app.get("/api/items", async (c) => {
    const { rows } = await pool.query("select * from items order by lower(name)");
    return c.json({ items: rows.map(toItem) });
  });

  app.post("/api/items", async (c) => {
    requirePermission(c, "items.write");
    const { rows } = await pool.query(
      "insert into items (name, description, rate, currency, archived) values ($1, $2, $3, $4, $5) returning *",
      itemValues(await readBody(c)),
    );
    return c.json({ item: toItem(rows[0]) }, 201);
  });

  app.put("/api/items/:id", async (c) => {
    requirePermission(c, "items.write");
    const { rows } = await pool.query(
      `update items set name = $2, description = $3, rate = $4, currency = $5, archived = $6, updated_at = now()
        where id = $1 returning *`,
      [idParam(c), ...itemValues(await readBody(c))],
    );
    if (!rows[0]) throw new HttpError(404, "Item not found.");
    return c.json({ item: toItem(rows[0]) });
  });

}
