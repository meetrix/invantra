import type { Context } from "hono";
import { can, type Permission } from "../../shared/permissions.ts";
import type { Role } from "../../shared/types.ts";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
  /** Identifies the session this request came in on. */
  tokenHash: string;
}

export type Env = { Variables: { user: SessionUser } };
export type Ctx = Context<Env>;

export class HttpError extends Error {
  status: number;
  code: string | undefined;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function requirePermission(c: Ctx, permission: Permission): SessionUser {
  const user = c.get("user");
  if (!can(user.role, permission)) throw new HttpError(403, "Your role does not allow this.");
  return user;
}

/** The name recorded against activity: the user's name, or their email until they have one. */
export function displayName(user: { name: string; email: string }): string {
  return user.name.trim() || user.email;
}

// ---------- request bodies ----------

export type Body = Record<string, unknown>;

export async function readBody(c: Ctx): Promise<Body> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HttpError(400, "Expected a JSON body.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Expected a JSON object.");
  return body as Body;
}

export function text(body: Body, key: string, max = 500): string {
  const value = body[key];
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new HttpError(400, `${key} must be text.`);
  if (value.length > max) throw new HttpError(400, `${key} is too long (max ${max} characters).`);
  return value;
}

export function requiredText(body: Body, key: string, max = 500): string {
  const value = text(body, key, max).trim();
  if (!value) throw new HttpError(400, `${key} is required.`);
  return value;
}

export function number(body: Body, key: string): number {
  const value = body[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new HttpError(400, `${key} must be a number.`);
  return value;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function date(body: Body, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !DATE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, `${key} must be a date (YYYY-MM-DD).`);
  }
  return value;
}

export function dateOrNull(body: Body, key: string): string | null {
  const value = body[key];
  return value === null || value === undefined || value === "" ? null : date(body, key);
}

export function list(body: Body, key: string, max: number): Body[] {
  const value = body[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => !v || typeof v !== "object")) {
    throw new HttpError(400, `${key} must be a list.`);
  }
  if (value.length > max) throw new HttpError(400, `${key} has too many entries (max ${max}).`);
  return value as Body[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route ids reach the database as uuid parameters, which error on anything else. */
export function idParam(c: Ctx, name = "id"): string {
  const value = c.req.param(name) ?? "";
  if (!UUID.test(value)) throw new HttpError(404, "Not found.");
  return value;
}

export function uuid(body: Body, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !UUID.test(value)) throw new HttpError(400, `${key} is required.`);
  return value;
}
