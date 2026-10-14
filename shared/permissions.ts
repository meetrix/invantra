import type { Role } from "./types.ts";

/**
 * Every signed-in user can read everything; these are the things only some
 * roles may do. The server enforces this table; the UI reads the same one to
 * decide which buttons to show.
 */
export type Permission =
  | "customers.write"
  | "items.write"
  | "documents.write" // create, edit drafts, submit, send back to draft, convert, void
  | "documents.approve" // approve or reject what was submitted
  | "payments.write"
  | "settings.write"
  | "users.manage"
  | "data.import";

const MEMBER: Permission[] = ["customers.write", "items.write", "documents.write", "payments.write"];

const PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: [...MEMBER, "documents.approve", "settings.write", "users.manage", "data.import"],
  member: MEMBER,
  viewer: [],
};

export const ROLES: readonly Role[] = ["admin", "member", "viewer"];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export function can(role: Role | undefined, permission: Permission): boolean {
  return role ? PERMISSIONS[role].includes(permission) : false;
}
