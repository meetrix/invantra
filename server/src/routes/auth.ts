import type { Hono } from "hono";
import {
  burnPasswordCheck,
  checkNewPassword,
  endSession,
  getUser,
  hashPassword,
  hashToken,
  sessionUser,
  startSession,
  verifyPassword,
} from "../auth.ts";
import { pool, tx } from "../db.ts";
import { HttpError, readBody, text, type Env } from "../http.ts";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

const BAD_LOGIN = "Incorrect email or password.";

async function findLink(token: string) {
  const { rows } = await pool.query(
    `select t.user_id, t.purpose, u.email, u.name
       from password_tokens t join users u on u.id = t.user_id
      where t.token_hash = $1 and t.used_at is null and t.expires_at > now() and not u.disabled`,
    [hashToken(token)],
  );
  if (!rows[0]) throw new HttpError(410, "This link has expired or was already used. Ask an admin for a new one.");
  return rows[0] as { user_id: string; purpose: "invite" | "reset"; email: string; name: string };
}

export function authRoutes(app: Hono<Env>) {
  app.post("/api/auth/login", async (c) => {
    const body = await readBody(c);
    const email = text(body, "email").trim();
    const password = text(body, "password", 200);

    const { rows } = await pool.query(
      "select id, password_hash, disabled, locked_until from users where lower(email) = lower($1)",
      [email],
    );
    const user = rows[0];
    if (!user || user.disabled || !user.password_hash) {
      await burnPasswordCheck(password);
      throw new HttpError(401, BAD_LOGIN);
    }
    if (user.locked_until && user.locked_until > new Date()) {
      const minutes = Math.ceil((user.locked_until.getTime() - Date.now()) / 60_000);
      throw new HttpError(429, `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
    }

    if (!(await verifyPassword(password, user.password_hash))) {
      // Counted in the database, so the limit holds across replicas and restarts.
      await pool.query(
        `update users set
           failed_logins = case when failed_logins + 1 >= $2 then 0 else failed_logins + 1 end,
           locked_until = case when failed_logins + 1 >= $2 then now() + make_interval(mins => $3) else null end
         where id = $1`,
        [user.id, MAX_FAILED_LOGINS, LOCK_MINUTES],
      );
      throw new HttpError(401, BAD_LOGIN);
    }

    await pool.query("update users set failed_logins = 0, locked_until = null where id = $1", [user.id]);
    await startSession(c, user.id);
    return c.json({ user: await getUser(pool, user.id) });
  });

  app.post("/api/auth/logout", async (c) => {
    await endSession(c);
    return c.json({ ok: true });
  });

  /** Who is signed in, or null. Answers 200 either way so a signed-out visit logs no failed request. */
  app.get("/api/auth/me", async (c) => {
    const session = await sessionUser(c);
    return c.json({ user: session ? await getUser(pool, session.id) : null });
  });

  app.post("/api/auth/change-password", async (c) => {
    const session = c.get("user");
    const body = await readBody(c);
    const current = text(body, "currentPassword", 200);
    const next = checkNewPassword(body.newPassword);

    const { rows } = await pool.query("select password_hash from users where id = $1", [session.id]);
    if (!(await verifyPassword(current, rows[0].password_hash))) {
      throw new HttpError(400, "Your current password is not correct.");
    }
    if (next === current) throw new HttpError(400, "Choose a password different from the current one.");

    await pool.query(
      "update users set password_hash = $2, must_change_password = false, updated_at = now() where id = $1",
      [session.id, await hashPassword(next)],
    );
    // Any other browser still signed in with the old password is signed out.
    await pool.query("delete from sessions where user_id = $1 and token_hash <> $2", [session.id, session.tokenHash]);
    return c.json({ user: await getUser(pool, session.id) });
  });

  /** Lets the set-password page greet the user and reject a dead link before they type anything. */
  app.get("/api/auth/link/:token", async (c) => {
    const link = await findLink(c.req.param("token"));
    return c.json({ email: link.email, name: link.name, purpose: link.purpose });
  });

  app.post("/api/auth/set-password", async (c) => {
    const body = await readBody(c);
    const token = text(body, "token");
    const password = checkNewPassword(body.password);
    const link = await findLink(token);
    const hash = await hashPassword(password);

    await tx(async (client) => {
      // The used_at guard makes the link single-use even if two requests race.
      const used = await client.query(
        "update password_tokens set used_at = now() where token_hash = $1 and used_at is null",
        [hashToken(token)],
      );
      if (used.rowCount !== 1) throw new HttpError(410, "This link was already used.");
      await client.query(
        `update users set password_hash = $2, must_change_password = false, failed_logins = 0,
                          locked_until = null, updated_at = now()
          where id = $1`,
        [link.user_id, hash],
      );
      await client.query("delete from sessions where user_id = $1", [link.user_id]);
    });

    await startSession(c, link.user_id);
    return c.json({ user: await getUser(pool, link.user_id) });
  });
}
