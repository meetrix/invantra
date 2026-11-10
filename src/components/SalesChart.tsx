import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatAmount, formatMoney, round2 } from "../../shared/money";
import type { Document } from "../../shared/types";

interface Month {
  key: string; // YYYY-MM
  label: string; // "Nov"
  long: string; // "November 2026"
  invoiced: number;
  received: number;
}

/** The last twelve months up to `today`, oldest first. */
function lastTwelveMonths(today: string): { key: string; label: string; long: string }[] {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const date = new Date(Date.UTC(y, m - 1 - (11 - i), 1));
    return {
      key: date.toISOString().slice(0, 7),
      label: date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
      long: date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    };
  });
}

/**
 * Invoiced (approved and paid invoices, by invoice date) and received (payments,
 * by payment date) per month, for each currency that had any in the period.
 */
function monthlyTotals(invoices: Document[], today: string): Map<string, Month[]> {
  const months = lastTwelveMonths(today);
  const keys = new Set(months.map((m) => m.key));
  const byCurrency = new Map<string, Month[]>();
  const series = (currency: string) => {
    if (!byCurrency.has(currency)) byCurrency.set(currency, months.map((m) => ({ ...m, invoiced: 0, received: 0 })));
    return byCurrency.get(currency)!;
  };
  for (const invoice of invoices) {
    if (invoice.status !== "approved" && invoice.status !== "paid") continue;
    const issued = invoice.issueDate.slice(0, 7);
    if (keys.has(issued)) {
      const month = series(invoice.currency).find((m) => m.key === issued)!;
      month.invoiced = round2(month.invoiced + invoice.total);
    }
    for (const payment of invoice.payments) {
      const paid = payment.date.slice(0, 7);
      if (!keys.has(paid)) continue;
      const month = series(invoice.currency).find((m) => m.key === paid)!;
      month.received = round2(month.received + payment.amount);
    }
  }
  return byCurrency;
}

/** A round number at or above `value`: 1, 2, 2.5 or 5 times a power of ten. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 2.5, 5, 10].find((step) => step * power >= value) ?? 10) * power;
}

const compact = (value: number) =>
  value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });

const SERIES = [
  { key: "invoiced" as const, label: "Invoiced", color: "var(--series-1)" },
  { key: "received" as const, label: "Received", color: "var(--series-2)" },
];

/**
 * Invoiced against received, month by month for the last year, one currency
 * at a time: amounts in different currencies are never added together.
 */
export function SalesChart({ invoices, today }: { invoices: Document[]; today: string }) {
  const data = useMemo(() => monthlyTotals(invoices, today), [invoices, today]);
  // The currency with the most invoiced comes first.
  const currencies = [...data.keys()].sort(
    (a, b) => data.get(b)!.reduce((s, m) => s + m.invoiced, 0) - data.get(a)!.reduce((s, m) => s + m.invoiced, 0),
  );
  const [chosen, setChosen] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const currency = chosen && data.has(chosen) ? chosen : currencies[0];

  if (!currency) return <p className="text-sm text-gray-500">No invoices or payments in the last twelve months.</p>;

  const months = data.get(currency)!;
  const max = niceMax(Math.max(...months.flatMap((m) => [m.invoiced, m.received])));
  const height = (value: number) => `${(value / max) * 100}%`;
  const totals = { invoiced: round2(months.reduce((s, m) => s + m.invoiced, 0)), received: round2(months.reduce((s, m) => s + m.received, 0)) };

  return (
    <div className="viz-root space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* The legend, with each series' total for the year. */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-xs" style={{ background: s.color }} />
              <span className="text-gray-500">{s.label}</span>
              <span className="font-medium tabular-nums">{formatMoney(totals[s.key], currency)}</span>
            </span>
          ))}
        </div>
        {currencies.length > 1 && (
          <div role="group" aria-label="Currency" className="flex gap-1 text-xs">
            {currencies.map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={code === currency}
                onClick={() => setChosen(code)}
                className={`rounded-md px-2 py-1 font-medium ${
                  code === currency
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                }`}
              >
                {code}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {/* The value axis: zero, half and the top, recessive. */}
        <div className="relative h-44 w-12 shrink-0 text-right text-[11px] text-gray-400 tabular-nums">
          {[1, 0.5, 0].map((f) => (
            <span key={f} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - f) * 100}%` }}>
              {compact(max * f)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-44">
            {[0, 0.5, 1].map((f) => (
              <div
                key={f}
                className={`absolute inset-x-0 border-t ${f === 1 ? "border-gray-300 dark:border-gray-700" : "border-dashed border-gray-200 dark:border-gray-800"}`}
                style={{ top: `${f * 100}%` }}
              />
            ))}
            <div className="absolute inset-0 flex">
              {months.map((m, i) => (
                <div
                  key={m.key}
                  tabIndex={0}
                  role="img"
                  aria-label={`${m.long}: invoiced ${formatMoney(m.invoiced, currency)}, received ${formatMoney(m.received, currency)}`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  // The whole month column is the hit target, wider than its bars.
                  className={`relative flex flex-1 items-end justify-center gap-[2px] rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${hover === i ? "bg-gray-100/70 dark:bg-gray-800/50" : ""}`}
                >
                  {SERIES.map((s) => (
                    <div
                      key={s.key}
                      className="w-[30%] max-w-3.5 rounded-t-[4px]"
                      style={{ height: height(m[s.key]), background: s.color, minHeight: m[s.key] > 0 ? 2 : 0 }}
                    />
                  ))}
                  {hover === i && (
                    <div
                      className={`pointer-events-none absolute bottom-full z-10 mb-2 w-52 rounded-lg border border-gray-200 bg-white p-2.5 text-xs shadow-lg dark:border-gray-700 dark:bg-gray-900 ${
                        i < 3 ? "left-0" : i > 8 ? "right-0" : "left-1/2 -translate-x-1/2"
                      }`}
                    >
                      <p className="mb-1 font-medium">{m.long}</p>
                      {SERIES.map((s) => (
                        <p key={s.key} className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5 text-gray-500">
                            <span className="h-2 w-2 rounded-xs" style={{ background: s.color }} />
                            {s.label}
                          </span>
                          <span className="tabular-nums">{formatMoney(m[s.key], currency)}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-1 flex text-[11px] text-gray-400">
            {months.map((m) => (
              <span key={m.key} className="flex-1 text-center">
                {m.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <details className="group">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-900 dark:hover:text-gray-100">Show as a table</summary>
          <table className="mt-2 text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="py-1 pr-6 font-medium">Month</th>
                <th className="py-1 pr-6 text-right font-medium">Invoiced</th>
                <th className="py-1 text-right font-medium">Received</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.key} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="py-1 pr-6">{m.long}</td>
                  <td className="py-1 pr-6 text-right tabular-nums">{formatAmount(m.invoiced)}</td>
                  <td className="py-1 text-right tabular-nums">{formatAmount(m.received)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
        <Link to="/reports" className="text-blue-700 hover:underline dark:text-blue-400">
          All reports
        </Link>
      </div>
    </div>
  );
}
