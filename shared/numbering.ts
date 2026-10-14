/**
 * Number formats are templates like "INV-{YYYY}-{seq}".
 *   {YYYY} {YY} {MM} {DD}  issue date parts
 *   {seq}                  the counter, allocated when the document is first saved
 *   {seq:3}                the counter, zero-padded to 3 digits
 *
 * The counter restarts with each period the format names. "MTX{YYYY}{MM}{seq:2}"
 * counts within one month and starts again at 01 in the next; "INV-{seq}" names
 * no period, so it runs on for ever. numberScope() is what tells those apart:
 * it is the format with the counter removed, so it changes exactly when the
 * fixed part of the number changes. One counter row per (kind, scope),
 * incremented inside the transaction that saves the document (see
 * server/src/routes/documents.ts).
 */

function dateParts(date: Date) {
  const yyyy = String(date.getFullYear());
  return {
    YYYY: yyyy,
    YY: yyyy.slice(-2),
    MM: String(date.getMonth() + 1).padStart(2, "0"),
    DD: String(date.getDate()).padStart(2, "0"),
  };
}

export function renderNumber(format: string, seq: number, issueDate: Date): string {
  const d = dateParts(issueDate);
  return format
    .replace(/\{YYYY\}/g, d.YYYY)
    .replace(/\{YY\}/g, d.YY)
    .replace(/\{MM\}/g, d.MM)
    .replace(/\{DD\}/g, d.DD)
    .replace(/\{seq(?::(\d+))?\}/g, (_, width) => String(seq).padStart(Number(width ?? 0), "0"));
}

/**
 * The counter's scope for a document issued on this date: the rendered number
 * without the counter. "MTX{YYYY}{MM}{seq:2}" on 2 October 2026 gives
 * "MTX202610", so October's estimates share a counter and November's start
 * afresh; "INV-{seq}" gives "INV-" on every date, one counter for all time.
 */
export function numberScope(format: string, issueDate: Date): string {
  return renderNumber(format.replace(/\{seq(?::\d+)?\}/g, ""), 0, issueDate);
}
