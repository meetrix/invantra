import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Role, User } from "../../shared/types.ts";
import { config } from "./config.ts";
import { pool, type Db } from "./db.ts";
import { HttpError, type Ctx, type SessionUser } from "./http.ts";

// ---------- passwords ----------

// scrypt from Node's own crypto: no native dependency to build. The parameters
// are stored with each hash, so they can be raised later without a migration.
const SCRYPT = { N: 32768, r: 8, p: 1 };
const KEY_LENGTH = 32;

function derive(password: string, salt: Buffer, params: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { ...params, maxmem: 128 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, N, r, p, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"), { N: Number(N), r: Number(r), p: Number(p) });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Spent on a login for an unknown email, so it takes as long as one for a real account. */
const DUMMY_HASH = await hashPassword(randomBytes(16).toString("hex"));

export async function burnPasswordCheck(password: string): Promise<void> {
  await verifyPassword(password, DUMMY_HASH);
}

export const MIN_PASSWORD_LENGTH = 10;

export function checkNewPassword(password: unknown): string {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > 200) throw new HttpError(400, "That password is too long.");
  return password;
}

// ---------- tokens ----------

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ---------- sessions ----------

const SESSION_COOKIE = "session";
const SESSION_DAYS = 7;

export async function startSession(c: Ctx, userId: string): Promise<void> {
  const token = newToken();
  await pool.query(
    `insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))`,
    [hashToken(token), userId, SESSION_DAYS],
  );
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: config.cookieSecure === "auto" ? overHttps(c) : config.cookieSecure,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

// Only trustworthy behind a proxy that sets X-Forwarded-Proto itself, as nginx does with $scheme.
function overHttps(c: Ctx): boolean {
  const proto = c.req.header("x-forwarded-proto") ?? new URL(c.req.url).protocol.replace(":", "");
  return proto.split(",")[0].trim() === "https";
}

export async function endSession(c: Ctx): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await pool.query("delete from sessions where token_hash = $1", [hashToken(token)]);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export async function sessionUser(c: Ctx): Promise<SessionUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = hashToken(token);
  const { rows } = await pool.query(
    `select u.id, u.email, u.name, u.role, u.must_change_password
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now() and not u.disabled`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as Role,
    mustChangePassword: row.must_change_password,
    tokenHash,
  };
}

// ---------- users ----------

export const USER_COLUMNS = "id, email, name, role, must_change_password, disabled, password_hash is not null as has_password, created_at";

export function toUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string,
    role: row.role as Role,
    mustChangePassword: row.must_change_password as boolean,
    disabled: row.disabled as boolean,
    hasPassword: row.has_password as boolean,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

export async function getUser(db: Db, id: string): Promise<User> {
  const { rows } = await db.query(`select ${USER_COLUMNS} from users where id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, "User not found.");
  return toUser(rows[0]);
}

const INVITE_DAYS = 7;
const RESET_HOURS = 24;

/**
 * Issues a one-time link for choosing a password and returns its path. Any
 * earlier unused link for the user stops working, so only the newest is live.
 */
export async function createPasswordLink(db: Db, userId: string, purpose: "invite" | "reset"): Promise<string> {
  const token = newToken();
  await db.query("delete from password_tokens where user_id = $1 and used_at is null", [userId]);
  await db.query(
    `insert into password_tokens (token_hash, user_id, purpose, expires_at)
     values ($1, $2, $3, now() + make_interval(hours => $4))`,
    [hashToken(token), userId, purpose, purpose === "invite" ? INVITE_DAYS * 24 : RESET_HOURS],
  );
  return `/set-password?token=${token}`;
}

/** Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD while no user exists yet. */
export async function bootstrapAdmin(): Promise<void> {
  const { rows } = await pool.query("select count(*)::int as count from users");
  if (rows[0].count > 0) return;
  if (!config.adminEmail || !config.adminPassword) {
    console.warn("No users exist. Set ADMIN_EMAIL and ADMIN_PASSWORD and restart to create the first admin.");
    return;
  }
  // Two replicas starting together both see an empty table, so the second
  // insert must be a no-op rather than a crash on the unique index.
  const created = await pool.query(
    `insert into users (email, name, role, password_hash, must_change_password)
     values ($1, 'Admin', 'admin', $2, true)
     on conflict (lower(email)) do nothing`,
    [config.adminEmail.trim(), await hashPassword(config.adminPassword)],
  );
  if (created.rowCount) {
    console.log(`Created the first admin, ${config.adminEmail}. They must change the password on first login.`);
  }
}
