import { readdir, readFile } from "node:fs/promises";
import pg from "pg";
import { config } from "./config.ts";

// numeric comes back as a string by default; amounts here fit a double exactly at 2 decimals.
pg.types.setTypeParser(1700, (value) => Number(value));
// Keep dates as YYYY-MM-DD rather than a Date at local midnight, which shifts across time zones.
pg.types.setTypeParser(1082, (value) => value);

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

/** Either the pool or a transaction's client: anything a query can run on. */
export type Db = Pick<pg.Pool, "query">;

export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Applies server/migrations/*.sql in name order, each in its own transaction, once. */
export async function migrate(): Promise<void> {
  const dir = new URL("../migrations/", import.meta.url);
  const client = await pool.connect();
  try {
    // Two replicas starting together must not both run the same migration.
    await client.query("select pg_advisory_lock(727274)");
    await client.query(
      "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const applied = new Set((await client.query("select name from schema_migrations")).rows.map((r) => r.name));
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const name of files) {
      if (applied.has(name)) continue;
      const sql = await readFile(new URL(name, dir), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (name) values ($1)", [name]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
      console.log(`Applied migration ${name}`);
    }
  } finally {
    await client.query("select pg_advisory_unlock(727274)").catch(() => {});
    client.release();
  }
}
