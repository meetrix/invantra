# Changelog

Notable changes to Invantra. Versions follow [Semantic Versioning](https://semver.org).

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
