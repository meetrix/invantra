import { useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { formatDateNumeric, todayIso } from "../../../shared/date";
import { formatAmount } from "../../../shared/money";
import { reportInfo, type ReportColumn, type ReportRow } from "../../../shared/reports";
import { LoadState } from "../../components/LoadState";
import { PageHeader } from "../../components/PageHeader";
import { cardClass, inputClass, primaryButton, secondaryButton, tableHeadClass } from "../../components/ui";
import { getReport, getSettings, reportCsvUrl } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { PERIODS, periodRange, type PeriodKey } from "../../lib/periods";
import { useLoad } from "../../lib/useLoad";

const small = secondaryButton.replace("px-4 py-2", "px-3 py-1.5");

function formatCell(column: ReportColumn, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  switch (column.type) {
    case "money":
      return formatAmount(Number(value));
    case "number":
      return Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
    case "percent":
      return `${value}%`;
    case "date":
      return formatDateNumeric(String(value));
    default:
      return String(value);
  }
}

const alignRight = (column: ReportColumn) => column.type !== "text" && column.type !== "date";

/** Starts each report afresh, so one report's filters do not carry into the next. */
export function ReportRoute() {
  const { name = "" } = useParams();
  return <ReportView key={name} />;
}

/**
 * One report: a filter bar (the period, and the basis where it applies) that
 * runs the report into the address, so a report can be bookmarked or shared,
 * then one table per currency.
 */
function ReportView() {
  const { name = "" } = useParams();
  const info = reportInfo(name);
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();

  const today = todayIso();
  const initialPeriod = (params.get("period") as PeriodKey | null) ?? (info?.period === "asOf" ? "custom" : "this-year");
  const [period, setPeriod] = useState<PeriodKey>(initialPeriod);
  const defaults = initialPeriod === "custom" ? { from: today, to: today } : periodRange(initialPeriod);
  const [from, setFrom] = useState(params.get("from") ?? defaults.from);
  const [to, setTo] = useState(params.get("to") ?? (info?.period === "asOf" ? today : defaults.to));
  const [basis, setBasis] = useState<"accrual" | "cash">(params.get("basis") === "cash" ? "cash" : "accrual");

  // What was last run: the address holds it.
  const query = {
    from: params.get("from") ?? defaults.from,
    to: params.get("to") ?? (info?.period === "asOf" ? today : defaults.to),
    basis: params.get("basis") === "cash" ? ("cash" as const) : ("accrual" as const),
  };
  const { data, error } = useLoad(
    () => Promise.all([getReport(name, query), getSettings()]),
    [name, query.from, query.to, query.basis],
  );

  if (!info) return <Navigate to="/reports" replace />;

  function choosePeriod(key: PeriodKey) {
    setPeriod(key);
    if (key !== "custom") {
      const range = periodRange(key);
      setFrom(range.from);
      setTo(range.to);
    }
  }

  function run(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = { to };
    if (info!.period === "range") Object.assign(next, { period, from });
    if (info!.basis) next.basis = basis;
    setParams(next);
  }

  const invalid = info.period === "range" && from > to;

  return (
    <div className="space-y-5">
      <PageHeader title={info.title} subtitle={info.description} backTo="/reports" backLabel="Reports">
        {can("data.export") && (
          <a href={reportCsvUrl(name, query)} download className={small}>
            Export CSV
          </a>
        )}
        <button type="button" onClick={() => window.print()} className={small}>
          Print
        </button>
      </PageHeader>

      <form onSubmit={run} className="no-print flex flex-wrap items-end gap-3 text-sm">
        {info.period === "range" ? (
          <>
            <label className="flex flex-col gap-1">
              Date range
              <select value={period} onChange={(e) => choosePeriod(e.target.value as PeriodKey)} className={inputClass}>
                {PERIODS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              From
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPeriod("custom");
                }}
                className={inputClass}
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              To
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPeriod("custom");
                }}
                className={inputClass}
                required
              />
            </label>
          </>
        ) : (
          <label className="flex flex-col gap-1">
            As of
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} required />
          </label>
        )}
        {info.basis && (
          <label className="flex flex-col gap-1">
            Report basis
            <select value={basis} onChange={(e) => setBasis(e.target.value as "accrual" | "cash")} className={inputClass}>
              <option value="accrual">Accrual (invoice date)</option>
              <option value="cash">Cash (payment date)</option>
            </select>
          </label>
        )}
        <button type="submit" disabled={invalid} className={primaryButton}>
          Run report
        </button>
        {invalid && <p className="basis-full text-red-600">The start date is after the end date.</p>}
      </form>

      {!data ? (
        <LoadState error={error} />
      ) : (
        <ReportBody report={data[0]} businessName={data[1].businessName} />
      )}
    </div>
  );
}

function ReportBody({ report, businessName }: { report: Awaited<ReturnType<typeof getReport>>; businessName: string }) {
  const empty = report.sections.every((s) => s.rows.length === 0);
  const showCurrency = report.sections.some((s) => s.currency);
  return (
    <div className={`${cardClass} space-y-6 p-6`}>
      <div className="text-center">
        {businessName && <p className="text-sm text-gray-500">{businessName}</p>}
        <h2 className="mt-1 text-xl font-semibold">{report.title}</h2>
        {report.basis && <p className="text-sm text-gray-500">Basis: {report.basis === "cash" ? "Cash" : "Accrual"}</p>}
        <p className="text-sm text-gray-500">
          {report.from
            ? `From ${formatDateNumeric(report.from)} to ${formatDateNumeric(report.to)}`
            : `As of ${formatDateNumeric(report.to)}`}
        </p>
        <p className="mx-auto mt-2 max-w-2xl text-xs text-gray-400">{report.note}</p>
      </div>
      {empty ? (
        <p className="py-6 text-center text-sm text-gray-500">Nothing to report for this period.</p>
      ) : (
        report.sections.map((section) => (
          <div key={section.currency ?? "all"} className="overflow-x-auto break-inside-avoid">
            {showCurrency && <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{section.currency}</h3>}
            {/* Fixed widths, so the columns of each currency's table line up with the others. */}
            <table className="w-full min-w-[640px] table-fixed text-sm">
              <thead>
                <tr className={tableHeadClass}>
                  {report.columns.map((column, i) => (
                    <th
                      key={column.key}
                      style={i === 0 && report.columns.length > 2 ? { width: report.columns.length > 4 ? "28%" : "40%" } : undefined}
                      className={`px-3 py-2 font-medium ${alignRight(column) ? "text-right" : "text-left"}`}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row, i) => (
                  <Row key={i} row={row} columns={report.columns} />
                ))}
                {section.total && <Row row={section.total} columns={report.columns} total />}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}

function Row({ row, columns, total }: { row: ReportRow; columns: ReportColumn[]; total?: boolean }) {
  return (
    <tr className={total ? "border-t-2 border-gray-300 font-semibold dark:border-gray-700" : "border-b border-gray-100 dark:border-gray-800"}>
      {columns.map((column) => {
        const value = formatCell(column, row.values[column.key]);
        return (
          <td key={column.key} className={`px-3 py-2 break-words tabular-nums ${alignRight(column) ? "text-right" : ""}`}>
            {column.link && row.link && !total ? (
              <Link to={row.link} className="text-blue-700 hover:underline dark:text-blue-400">
                {value}
              </Link>
            ) : (
              value
            )}
          </td>
        );
      })}
    </tr>
  );
}
