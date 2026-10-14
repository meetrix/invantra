import type { Hono } from "hono";
import { numberScope } from "../../../shared/numbering.ts";
import { MAX_PAYMENT_ACCOUNTS, type DocumentKind, type PaymentAccount, type Settings } from "../../../shared/types.ts";
import { pool, tx, type Db } from "../db.ts";
import { HttpError, number, readBody, requirePermission, text, type Body, type Env } from "../http.ts";

type Stored = Omit<Settings, "nextInvoiceSeq" | "nextEstimateSeq">;

const DEFAULTS: Stored = {
  businessName: "",
  businessEmail: "",
  businessPhone: "",
  businessAddress: "",
  businessTaxId: "",
  businessWebsite: "",
  logoDataUrl: null,
  currency: "USD",
  defaultPaymentTermsDays: 30,
  estimateValidityDays: 30,
  invoiceNumberFormat: "INV-{seq}",
  // The counter, not the day: two estimates raised on one day would otherwise
  // be given the same number, and the second save is refused.
  estimateNumberFormat: "MTX{YYYY}{MM}{seq:2}",
  defaultNotes: "Thanks for your business.",
  defaultTerms: "",
  bankAccounts: [],
};

/**
 * The counter a document of this kind and issue date would use next. Counters
 * are kept per scope, so a format naming the month has one per month and the
 * first estimate of November is 01 again; see shared/numbering.ts.
 */
export async function nextSeq(db: Db, kind: DocumentKind, format: string, issueDate: Date): Promise<number> {
  const { rows } = await db.query("select next_seq from number_sequences where kind = $1 and scope = $2", [
    kind,
    numberScope(format, issueDate),
  ]);
  return rows[0]?.next_seq ?? 1;
}

/**
 * Payment details used to be a single heading and block of text. A business
 * with a USD account and a EUR one had to paste the right one in by hand, so
 * they are now a named list; the old pair becomes the first entry.
 */
function withAccounts(stored: Stored & { bankDetails?: string; bankDetailsTitle?: string }): Stored {
  if (stored.bankAccounts?.length || !stored.bankDetails?.trim()) return { ...stored, bankAccounts: stored.bankAccounts ?? [] };
  return {
    ...stored,
    bankAccounts: [{ id: "legacy", title: stored.bankDetailsTitle || "Payment Details", details: stored.bankDetails }],
  };
}

export async function getSettings(db: Db): Promise<Settings> {
  const { rows } = await db.query("select data from settings");
  const stored: Stored = withAccounts({ ...DEFAULTS, ...(rows[0]?.data as Partial<Stored>) });
  // The settings page edits the counters for today, which is the period a
  // document raised now would fall in.
  const today = new Date();
  const [nextInvoiceSeq, nextEstimateSeq] = await Promise.all([
    nextSeq(db, "invoice", stored.invoiceNumberFormat, today),
    nextSeq(db, "estimate", stored.estimateNumberFormat, today),
  ]);
  return { ...stored, nextInvoiceSeq, nextEstimateSeq };
}

// A logo is stored inline as a data: URL; 1.5 MB of base64 is about a 1 MB image.
const MAX_LOGO_LENGTH = 1_500_000;

/** Reads the named payment accounts, dropping any that are entirely blank. */
function paymentAccounts(body: Body): PaymentAccount[] {
  const raw = body.bankAccounts;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, "bankAccounts must be a list.");
  if (raw.length > MAX_PAYMENT_ACCOUNTS) throw new HttpError(400, `Keep to ${MAX_PAYMENT_ACCOUNTS} sets of payment details or fewer.`);

  const accounts: PaymentAccount[] = [];
  for (const entry of raw as Body[]) {
    const title = text(entry, "title", 200).trim();
    const details = text(entry, "details", 20_000);
    if (!title && !details.trim()) continue;
    if (!title) throw new HttpError(400, "Give every set of payment details a title.");
    accounts.push({ id: text(entry, "id", 64) || crypto.randomUUID(), title, details });
  }
  if (new Set(accounts.map((a) => a.title.toLowerCase())).size !== accounts.length) {
    throw new HttpError(400, "Two sets of payment details share a title; they are picked by name, so each needs its own.");
  }
  return accounts;
}

export function settingsRoutes(app: Hono<Env>) {
  app.get("/api/settings", async (c) => c.json({ settings: await getSettings(pool) }));

  app.put("/api/settings", async (c) => {
    requirePermission(c, "settings.write");
    const body = await readBody(c);

    const logo = body.logoDataUrl === null || body.logoDataUrl === undefined ? null : text(body, "logoDataUrl", MAX_LOGO_LENGTH);
    if (logo && !/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/.test(logo)) {
      throw new HttpError(400, "The logo must be a PNG, JPEG, GIF, WebP or SVG image.");
    }
    const currency = text(body, "currency", 3).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, "Currency must be a 3-letter code such as USD.");

    const wholeNumber = (key: string, min: number) => {
      const value = number(body, key);
      if (!Number.isInteger(value) || value < min) throw new HttpError(400, `${key} must be a whole number of at least ${min}.`);
      return value;
    };

    const data: Stored = {
      businessName: text(body, "businessName"),
      businessEmail: text(body, "businessEmail"),
      businessPhone: text(body, "businessPhone"),
      businessAddress: text(body, "businessAddress", 2000),
      businessTaxId: text(body, "businessTaxId"),
      businessWebsite: text(body, "businessWebsite"),
      logoDataUrl: logo,
      currency,
      defaultPaymentTermsDays: wholeNumber("defaultPaymentTermsDays", 0),
      estimateValidityDays: wholeNumber("estimateValidityDays", 0),
      invoiceNumberFormat: text(body, "invoiceNumberFormat", 100),
      estimateNumberFormat: text(body, "estimateNumberFormat", 100),
      defaultNotes: text(body, "defaultNotes", 20_000),
      defaultTerms: text(body, "defaultTerms", 20_000),
      bankAccounts: paymentAccounts(body),
    };
    const nextInvoiceSeq = wholeNumber("nextInvoiceSeq", 1);
    const nextEstimateSeq = wholeNumber("nextEstimateSeq", 1);

    const today = new Date();
    await tx(async (client) => {
      await client.query("update settings set data = $1", [JSON.stringify(data)]);
      // Written against the scope the new format gives today: changing the
      // format and the counter together sets the counter for the new scheme.
      for (const [kind, seq, format] of [
        ["invoice", nextInvoiceSeq, data.invoiceNumberFormat],
        ["estimate", nextEstimateSeq, data.estimateNumberFormat],
      ] as const) {
        await client.query(
          `insert into number_sequences (kind, scope, next_seq) values ($1, $2, $3)
           on conflict (kind, scope) do update set next_seq = excluded.next_seq`,
          [kind, numberScope(format, today), seq],
        );
      }
    });
    return c.json({ settings: await getSettings(pool) });
  });
}
