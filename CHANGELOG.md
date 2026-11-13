# Changelog

Notable changes to Invantra. Versions follow [Semantic Versioning](https://semver.org).

## [1.1.0] - 2026-11-14

### Added

- CSV export and import for customers, items, estimates, invoices and payments. Importing the same
  file again updates the records instead of duplicating them. Admins and members can use it;
  viewers cannot.
- Reports, each with date presets, CSV export and one total per currency: sales by customer, sales by
  item, estimate conversion, aging summary and details, customer balances, payments received, time
  to get paid, income summary (accrual or cash basis) and activity.
- A chart of the last 12 months on the home page: invoiced against received.
- Admins can delete estimates, invoices and payments. An invoice with payments can be deleted only
  once its payments are.
- Line items can be reordered by dragging, or with the arrow keys.
- An estimate can show its total on the PDF, with a tick box per estimate. It is off by default.

### Changed

- Payment attachments can be up to 15 MB each (was 5 MB).
- A content security policy is sent with every page.
- Updated Hono, its Node server and Vite.

### Fixed

- Browser extensions that add elements to the page no longer appear in printed PDFs, or add a blank
  page.
- A request with the origin `null` is refused instead of causing a server error.

## [1.0.0] - 2026-10-14

First public release.

- Estimates and invoices with custom numbering, per-line discounts and named charges.
- Approval workflow: draft, pending approval, approved or rejected, then invoiced or paid, with an
  activity history on every document.
- Users with admin, member and viewer roles; invite and reset links, so no mail server is needed.
- Customers, each with their own currency and country, and a reusable items catalogue. Both can be
  imported from CSV.
- Payments against approved invoices, with references, bank charges and file attachments.
- A home page with receivables per currency, split into current and overdue.
- A print view for saving any document as a PDF, named after the document number.
- One Docker image serving the API and the web app, with a health check, plus a Compose file that
  runs it with PostgreSQL.
