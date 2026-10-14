import type { Hono } from "hono";
import { ROLES } from "../../../shared/permissions.ts";
import type { Role } from "../../../shared/types.ts";
import { createPasswordLink, getUser, toUser, USER_COLUMNS } from "../auth.ts";
import { pool, tx } from "../db.ts";
import { HttpError, idParam, readBody, requiredText, requirePermission, text, type Body, type Env } from "../http.ts";

function role(body: Body): Role {
  if (!ROLES.includes(body.role as Role)) throw new HttpError(400, "role must be admin, member or viewer.");
  return body.role as Role;
}

export function userRoutes(app: Hono<Env>) {
  app.get("/api/users", async (c) => {
    requirePermission(c, "users.manage");
    const { rows } = await pool.query(`select ${USER_COLUMNS} from users order by created_at`);
    return c.json({ users: rows.map(toUser) });
  });

  /** Creates the account without a password and returns a one-time link for the admin to pass on. */
  app.post("/api/users", async (c) => {
    requirePermission(c, "users.manage");
    const body = await readBody(c);
    const email = requiredText(body, "email", 254);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
    const name = text(body, "name", 120).trim();
    const userRole = role(body);

    const result = await tx(async (client) => {
      const existing = await client.query("select 1 from users where lower(email) = lower($1)", [email]);
      if (existing.rowCount) throw new HttpError(409, "A user with that email already exists.");
      const { rows } = await client.query(
        `insert into users (email, name, role) values ($1, $2, $3) returning id`,
        [email, name, userRole],
      );
      const linkPath = await createPasswordLink(client, rows[0].id, "invite");
      return { user: await getUser(client, rows[0].id), linkPath };
    });
    return c.json(result, 201);
  });

  app.patch("/api/users/:id", async (c) => {
    const admin = requirePermission(c, "users.manage");
    const id = idParam(c);
    const body = await readBody(c);
    const current = await getUser(pool, id);

    const name = body.name === undefined ? current.name : text(body, "name", 120).trim();
    const userRole = body.role === undefined ? current.role : role(body);
    const disabled = body.disabled === undefined ? current.disabled : body.disabled === true;

    // An admin cannot lock themselves out, which also guarantees one admin always remains.
    if (id === admin.id && (disabled || userRole !== "admin")) {
      throw new HttpError(400, "You cannot disable your own account or remove your own admin role.");
    }

    await pool.query("update users set name = $2, role = $3, disabled = $4, updated_at = now() where id = $1", [
      id,
      name,
      userRole,
      disabled,
    ]);
    if (disabled) await pool.query("delete from sessions where user_id = $1", [id]);
    return c.json({ user: await getUser(pool, id) });
  });

  /** A fresh invite (no password chosen yet) or reset link; replaces any earlier unused one. */
  app.post("/api/users/:id/link", async (c) => {
    requirePermission(c, "users.manage");
    const user = await getUser(pool, idParam(c));
    if (user.disabled) throw new HttpError(400, "Enable the user before sending them a link.");
    const linkPath = await createPasswordLink(pool, user.id, user.hasPassword ? "reset" : "invite");
    return c.json({ linkPath });
  });
}
