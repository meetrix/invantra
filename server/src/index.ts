import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { bootstrapAdmin, sessionUser } from "./auth.ts";
import { config } from "./config.ts";
import { migrate, pool } from "./db.ts";
import { HttpError, type Env } from "./http.ts";
import { authRoutes } from "./routes/auth.ts";
import { customerRoutes } from "./routes/customers.ts";
import { documentRoutes } from "./routes/documents.ts";
import { itemRoutes } from "./routes/items.ts";
import { settingsRoutes } from "./routes/settings.ts";
import { userRoutes } from "./routes/users.ts";

const app = new Hono<Env>();

app.use(secureHeaders());
app.use("/api/*", bodyLimit({ maxSize: 6 * 1024 * 1024 }));

app.onError((error, c) => {
  if (error instanceof HttpError) {
    return c.json({ error: error.message, code: error.code }, error.status as 400);
  }
  console.error(error);
  return c.json({ error: "Something went wrong on the server." }, 500);
});

app.get("/api/health", async (c) => {
  await pool.query("select 1");
  return c.json({ ok: true });
});

/*
 * Cross-site request forgery: the session cookie is SameSite=Lax, and on top of
 * that a request that changes anything must come from this origin. Browsers say
 * so themselves in Sec-Fetch-Site, but only on HTTPS and localhost; elsewhere
 * the Origin header, which they always send on cross-site POSTs, is compared
 * with the host the browser addressed. Behind a proxy that rewrites Host, that
 * is X-Forwarded-Host.
 */
app.use("/api/*", async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    const site = c.req.header("sec-fetch-site");
    const origin = c.req.header("origin");
    const hosts = [c.req.header("host"), c.req.header("x-forwarded-host")];
    const sameOrigin = site ? site === "same-origin" || site === "none" : !origin || hosts.includes(new URL(origin).host);
    if (!sameOrigin) throw new HttpError(403, "Cross-site request refused.");
  }
  await next();
});

// Everything below needs a session, except checking for one, signing in, and choosing a password from a link.
const PUBLIC = [/^\/api\/auth\/me$/, /^\/api\/auth\/login$/, /^\/api\/auth\/logout$/, /^\/api\/auth\/link\/[^/]+$/, /^\/api\/auth\/set-password$/];

app.use("/api/*", async (c, next) => {
  if (PUBLIC.some((path) => path.test(c.req.path))) return next();
  const user = await sessionUser(c);
  if (!user) throw new HttpError(401, "Sign in to continue.", "unauthenticated");
  // Until the password they were handed is replaced, the account can do nothing else.
  if (user.mustChangePassword && !c.req.path.startsWith("/api/auth/")) {
    throw new HttpError(403, "Change your password to continue.", "password_change_required");
  }
  c.set("user", user);
  await next();
});

authRoutes(app);
userRoutes(app);
settingsRoutes(app);
customerRoutes(app);
itemRoutes(app);
documentRoutes(app);

app.all("/api/*", (c) => c.json({ error: "Not found." }, 404));

// ---------- the built frontend ----------

const staticDir = resolve(config.staticDir);
const indexPath = join(staticDir, "index.html");

if (existsSync(indexPath)) {
  const indexHtml = readFileSync(indexPath, "utf8");
  app.use("*", serveStatic({ root: staticDir }));
  // A missing asset stays a real 404, so a stale build fails loudly instead of returning HTML.
  app.get("/assets/*", (c) => c.text("Not found", 404));
  // Routes like /invoices/:id exist only in the client.
  app.get("*", (c) => c.html(indexHtml));
} else {
  console.warn(`No frontend build at ${staticDir}: serving the API only. Run "npm run build" first.`);
}

await migrate();
await bootstrapAdmin();

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Listening on http://localhost:${info.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}
