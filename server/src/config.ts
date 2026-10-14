function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}

function cookieSecure(value: string): boolean | "auto" {
  return value === "auto" ? "auto" : value === "true";
}

export const config = {
  databaseUrl: required("DATABASE_URL"),
  port: Number(process.env.PORT ?? 8787),
  /** The first admin, created on startup only while the users table is empty. */
  adminEmail: process.env.ADMIN_EMAIL ?? "",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  /** The built frontend. Served by this process so the app and its API share one origin. */
  staticDir: process.env.STATIC_DIR ?? "dist",
  /**
   * Browsers drop Secure cookies on plain HTTP, so this is off outside production.
   * "auto" decides per request from X-Forwarded-Proto, for a server reached over
   * plain HTTP by IP until its certificate is issued.
   */
  cookieSecure: cookieSecure(process.env.COOKIE_SECURE ?? String(process.env.NODE_ENV === "production")),
};
