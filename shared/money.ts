/**
 * Money here is plain JS numbers (dollars, not cents), stored as numeric(14,2)
 * in the database. Every amount is rounded to 2 decimal places as it's
 * computed, so totals never carry stray floating-point noise.
 *
 * There is no tax: these documents price per line and take a flat discount off
 * it, then add named charges (bank fees and the like) to the subtotal.
 */

export interface LineInput {
  qty: number;
  rate: number;
  discount: number;
}

export interface AdjustmentInput {
  amount: number;
}

export interface LineTotals {
  /** qty × rate, before the discount. */
  gross: number;
  discount: number;
  /** What lands in the Amount column: gross − discount. */
  amount: number;
}

export interface DocumentTotals {
  lines: LineTotals[];
  /** Sum of the line amounts. */
  subtotal: number;
  /** Sum of the named adjustments. */
  adjustments: number;
  total: number;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function computeLineTotals(line: LineInput): LineTotals {
  const gross = round2(line.qty * line.rate);
  const discount = round2(line.discount);
  return { gross, discount, amount: round2(gross - discount) };
}

/** Each line is rounded before summing, so the total agrees with the printed rows. */
export function computeDocumentTotals(
  lines: LineInput[],
  adjustments: AdjustmentInput[] = [],
): DocumentTotals {
  const computed = lines.map(computeLineTotals);
  const subtotal = round2(computed.reduce((sum, l) => sum + l.amount, 0));
  const adjTotal = round2(adjustments.reduce((sum, a) => sum + (a.amount || 0), 0));
  return {
    lines: computed,
    subtotal,
    adjustments: adjTotal,
    total: round2(subtotal + adjTotal),
  };
}

export function formatMoney(amount: number, currency: string, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}

/** Bare 2-decimal figure for table cells, which carry no currency symbol. */
export function formatAmount(amount: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Quantities print as 1.00, matching the source documents. */
export function formatQuantity(qty: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(qty);
}
