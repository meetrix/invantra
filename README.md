<img src="branding/invantra-symbol.svg" alt="" width="72">

# Invantra

A small, self-hosted tool for estimates and invoices. A team signs in, writes estimates, gets them
approved, converts them to invoices, records payments, and prints any of it to a polished PDF.

It is one Node.js process and one PostgreSQL database: the server provides the API and also serves
the web app, so there is a single thing to deploy.

## Features

- **Users and roles**: admins, members and viewers, each signing in with their own password.
  See [Users, roles and sign-in](#users-roles-and-sign-in).
- **Approval**: every estimate and invoice is a draft until it is submitted and an admin approves
  it. See [Document workflow](#document-workflow).
- **Activity history**: each document has an Activity tab listing who created, edited, submitted,
  approved, rejected or reopened it, and when, with the reason where one was given.
- **Customers**: a list you pick from, each with its own currency and country. A new customer can
  be added from inside an estimate or invoice without leaving it.
- **Items**: a catalogue of reusable line items. Typing an item's name on a line fills in its
  description and rate, which can then be edited for that document.
- **Estimates → invoices**: an approved estimate converts to an invoice through the invoice form,
  so the terms, lines and dates can be adjusted before it is saved. The conversion *copies* the
  line items, so the two documents never share rows.
- **Payments**: record payments against an approved invoice, with the mode, reference and any bank
  charges. The balance due updates, and the invoice becomes Paid when it reaches zero. Every
  payment gets a running number and is listed under **Payments received**. Up to five files of
  5 MB each (a remittance advice, a bank slip) can be attached to a payment; they are stored in
  the database.
- **Reference, project and subject**: optional fields on every estimate and invoice. Converting an
  estimate carries the project and subject over and sets the invoice's reference to the
  estimate number unless the estimate had its own.
- **Status ribbon**: each estimate and invoice shows its status across its top-left corner on
  screen. The ribbon never prints.
- **Home**: what is owed on approved invoices, split into current and overdue and kept separate per
  currency, the estimates waiting on someone, and what changed recently.
- **Print-ready PDFs**: a dedicated print view with A4 page margins, a repeating table header, page
  numbers, and a rule at the foot of every page. Save it with the browser's own **Print → Save as
  PDF**; the file name defaults to the document number. A document that is not yet approved prints
  with a faint "Yet to be Approved" watermark on every page.
- **CSV import**: admins can import customers and items from CSV exports of another system.
- **Custom numbering**: a format per document type, such as `INV-{seq}` or `EST-{YYYY}{MM}-{seq:2}`.
- **Discounts and charges**: a flat discount per line, plus any number of named charges added to the
  subtotal (e.g. "Bank Charges"). A negative charge works as a whole-document discount.
- **Bold text**: wrap words in `**double asterisks**` in any multi-line field to print them bold,
  e.g. `* **Account number**: 12345678`.

## Stack

| Layer | Choice |
| --- | --- |
| Web app | Vite + React + TypeScript, Tailwind CSS, react-router-dom |
| Server | Node.js 24 + [Hono](https://hono.dev), TypeScript run directly by Node (no build step) |
| Database | PostgreSQL 13 or newer, plain SQL migrations, `pg` |
| Auth | Email and password, scrypt hashes, server-side sessions in an HttpOnly cookie |
| PDF | The browser's print-to-PDF, from a dedicated print view |

```
src/      the web app
server/   the API: src/routes/*.ts, and migrations/*.sql
shared/   types, money maths, numbering and the role table, used by both
```

## Getting started

You need Node.js 24 or newer and a PostgreSQL database.

```bash
npm install
cp .env.example .env     # then set ADMIN_EMAIL and ADMIN_PASSWORD

npm run dev:db           # start a local PostgreSQL (see below)
npm run dev:server       # the API, on http://localhost:8787
npm run dev              # the web app, on the URL Vite prints
```

Open the web app and sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`. You are asked to choose a new
password straight away. Then start in **Settings**: enter your business details, logo, number
formats, and the default notes, payment details, and terms that new documents copy.

**The database.** `npm run dev:db` starts a private PostgreSQL on port 5433 from the PostgreSQL
binaries installed on your machine, without Docker or root; `scripts/dev-db.sh stop` stops it and
`scripts/dev-db.sh reset` deletes its data. If you prefer Docker, run `docker compose up -d db`
and use `DATABASE_URL=postgres://invoice:invoice@localhost:5433/invoice`. Any other PostgreSQL works
too: point `DATABASE_URL` at an empty database. The server creates its tables on startup.

## Users, roles and sign-in

| Role | Can do |
| --- | --- |
| **Admin** | Everything a member can, plus approve or reject documents, manage users, change settings, import CSVs |
| **Member** | Create and edit customers, items, estimates and invoices; submit them for approval; record payments |
| **Viewer** | Read and print everything; change nothing |

The table lives in `shared/permissions.ts`. The server enforces it on every request; the web app
reads the same table only to decide which buttons to show.

- **The first admin** is created on startup from `ADMIN_EMAIL` and `ADMIN_PASSWORD`, but only while
  no user exists. That password must be changed at first login, and until it is, the account can do
  nothing else.
- **Adding a user**: an admin enters their email, name and role on the **Users** page and gets a
  one-time invite link to pass on. The user opens it and chooses their own password, so the admin
  never knows it. The link works once and expires after 7 days.
- **Forgotten password**: an admin issues a reset link from the same page (valid 24 hours). No email
  is sent by the app, so it needs no mail server.
- **Disabling a user** signs them out everywhere at once. Users are disabled rather than deleted, so
  the activity history keeps their name.
- **Protection**: passwords are stored as salted scrypt hashes and must be at least 10 characters.
  Five failed sign-ins lock the account for 15 minutes. Sessions last 7 days, live in an HttpOnly,
  SameSite cookie, and are stored hashed in the database. Requests that change anything must come
  from the app's own origin.

## Document workflow

Estimates and invoices move through the same states:

```
Draft ──submit──▶ Pending approval ──approve──▶ Approved ──▶ Invoiced (estimate, once converted)
  ▲                     │                         │      └─▶ Paid     (invoice, once paid in full)
  └──reject (reason)────┘                         │
  └──────────────convert to draft (reason)────────┘
```

- **Only a draft can be edited.** Members submit; an admin approves or rejects with a reason. An
  admin can submit and approve their own documents.
- **Convert to draft** reopens a submitted or approved document. It keeps its number and must be
  approved again. Undoing an approval requires a reason, which is kept in the activity history. An
  estimate that has been invoiced, and an invoice with payments, can no longer be reopened.
- **Only an approved estimate converts to an invoice**, and only once. Voiding that invoice frees
  the estimate to be converted again.
- **An invoice's status follows its payments**: "Approved" until a payment is recorded; "Due in
  12 days" or "Due today" once part of it is paid; "Overdue by 40 days" when the due date has
  passed with a balance left; then "Paid".
- **Approval freezes the business and customer details** onto the document. Editing a customer's
  address later doesn't change a document that was already approved.

## Importing customers and items

Admins see an **Import CSV** button on the Customers and Items pages. The first row must be a header;
column names are matched ignoring case, spaces and underscores.

| | Columns read |
| --- | --- |
| Customers | `Display Name` (or `Name`), `First Name`, `Last Name`, `EmailID` (or `Email`), `Phone` / `Work Phone` / `MobilePhone`, `Billing Address`, `Billing Street2`, `Billing City`, `Billing State`, `Billing Code`, `Billing Country`, `Currency Code`, `Notes`, `Contact ID` |
| Items | `Item Name` (or `Name`), `Description`, `Rate`, `Item ID` |

Rows that carry an id (`Contact ID`, `Item ID`) update the record imported earlier under that id, so
the same file can be imported again without creating duplicates. A customer field is only
overwritten when the file has a column for it.

## Development

```bash
npm run dev          # the web app, with /api proxied to the server
npm run dev:server   # the API, restarting on changes
npm run build        # type-check everything and build the web app into dist/
npm run start        # the server, which also serves dist/ when it exists
npm run lint         # oxlint
```

The data model is in `shared/types.ts` and `server/migrations/`, the API in `server/src/routes/`, and
the printed layout in `src/pages/documents/DocumentPrint.tsx` plus the print section of
`src/index.css`.

**Schema changes** are numbered SQL files in `server/migrations/`. Each is applied once, in name
order, in its own transaction, when the server starts. Add a new file; never edit an applied one.

### Troubleshooting

**Blank page in dev, with `504 (Outdated Optimize Dep)` in the console.** Vite's pre-bundled
dependency cache is stale, usually because a second `vite` process started against the same folder
(Vite rebuilds the cache before it checks whether the port is free). Stop the dev server and run
`npm run dev -- --force`.

**Running under WSL with a Windows browser.** If `http://localhost:5173` refuses to connect, start
the server with `npm run dev -- --host` and open the `Network:` address Vite prints. If the project
lives on a Windows drive (`/mnt/c/...`), file changes don't reach the watchers: restart the dev
server and the API after editing, or keep the project in the Linux filesystem.

## How it works

**Money is plain numbers, not integer cents.** Amounts are ordinary JavaScript numbers rounded to 2
decimals at each step (`shared/money.ts`) and stored as `numeric(14,2)`. Each line is rounded before
summing, so the printed total always equals the sum of the printed lines. The server recomputes
every total itself; it never trusts one sent by the browser.

**There is no tax.** Lines are priced as `Amount = Qty × Rate − Discount`, and
`Total = Σ Amount + Σ charges`. Adding tax later means a new field and a migration.

**A document is priced in its customer's currency.** Settings holds the default currency, used for
new customers and for any customer without one.

**Estimates show no total.** An estimate lists its line items without a subtotal or total, because
the customer chooses which items to take. Invoices print Sub Total, charges, Total, and Balance Due.

**Numbers are assigned when a document is first saved.** Leaving the number field blank takes the
next one from a per-type counter, inside the same transaction as the save, so two people saving at
once cannot get the same number. A number can also be typed in; that leaves the counter alone. The
counters are editable in Settings, so you can continue an existing series.

### Print layout notes

- **Page numbers use CSS page margin boxes** (`@page { @bottom-right { content: counter(page) } }`).
  Defining margin boxes also stops Chromium from printing its own date, title, and URL in the page
  margins.
- **Chromium keeps printed content inside the page area.** It shrinks the whole page to fit anything
  wider, and moves a fixed-position element that pokes into the margin onto the next page. The
  page-foot rule therefore sits at the very bottom of the page area, and the watermark is clipped to
  it.
- **Colors print exactly** (`print-color-adjust: exact` on the root). Without it, Chrome drops
  background colors when "Background graphics" is off, and darkens light text such as page numbers.
- **The Discount column only appears when a line has a discount**, and line items never split across
  pages.
- **Generating PDFs with headless Chrome on Linux?** Launch it with `--font-render-hinting=none`.
  By default it rounds glyph widths to whole pixels, which widens small text by up to ~5% and moves
  line breaks. Desktop Chrome on Windows and macOS already positions text fractionally.

## Deploying

The `Dockerfile` builds one image containing the server and the built web app:

```bash
docker build -t invantra .
docker run -p 8787:8787 \
  -e DATABASE_URL=postgres://user:password@host:5432/invoice \
  -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD=change-me-at-first-login \
  invantra
```

Or run the app and a database together with `docker compose --profile app up -d --build`.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. Required. |
| `PORT` | Port to listen on. Default `8787`. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | The first admin; only read while no user exists. |
| `COOKIE_SECURE` | Defaults to `true` when `NODE_ENV=production`. Set `false` only to serve plain HTTP, or `auto` behind a proxy that sets `X-Forwarded-Proto` and serves both. |
| `STATIC_DIR` | Where the built web app is. Default `dist`. |

- **Serve it over HTTPS.** In production the session cookie is marked Secure, so sign-in does not
  work over plain HTTP unless `COOKIE_SECURE=false`.
- **Keep the `Host` header intact** in any reverse proxy, since the server compares it with the
  request's `Origin` to refuse cross-site requests.
- **Health check**: `GET /api/health` returns 200 once the database is reachable.
- **Migrations run on startup** under a database lock, so several replicas can start together.
- **Back up the database.** Everything the app stores, the logo included, is in PostgreSQL.

## Out of scope

Email delivery, recurring invoices, tax, single sign-on, custom roles, and a template editor
(branding is customizable; the layout is not).

## License

[MIT](LICENSE) © Meetrix Pty Ltd
