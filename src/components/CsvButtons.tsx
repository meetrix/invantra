import { useRef, useState } from "react";
import type { CsvDataset, ImportResult } from "../../shared/types";
import { errorMessage, exportUrl, importCsv } from "../lib/api";
import { useAuth } from "../lib/auth";
import { secondaryButton } from "./ui";

const small = secondaryButton.replace("px-4 py-2", "px-3 py-1.5");

/** What a person must import first for this file to find what it refers to. */
const ORDER_HINT: Partial<Record<CsvDataset, string>> = {
  estimates: "Import customers first: each estimate is matched to its customer.",
  invoices: "Import customers and estimates first: each invoice is matched to its customer and estimate.",
  payments: "Import invoices first: each payment is matched to its invoice by number.",
};

/**
 * Export CSV and Import CSV for a list page. Both use the same columns, so an
 * exported file can be edited and imported back; importing the same file again
 * updates what it imported before instead of adding it twice.
 */
export function CsvButtons({ dataset, onImported }: { dataset: CsvDataset; onImported: () => void }) {
  const { can } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so choosing the same file again still fires a change
    if (!file) return;
    setBusy(true);
    setResult(null);
    setError("");
    try {
      setResult(await importCsv(dataset, await file.text()));
      onImported();
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  if (!can("data.export") && !can("data.import")) return null;

  return (
    // The result opens as a panel under the buttons, so the page header does not reflow.
    <div className="relative flex items-center gap-2">
      {can("data.export") && (
        <a href={exportUrl(dataset)} download className={small}>
          Export CSV
        </a>
      )}
      {can("data.import") && (
        <>
          <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            title={ORDER_HINT[dataset]}
            className={small}
          >
            {busy ? "Importing…" : "Import CSV"}
          </button>
        </>
      )}
      {(result || error) && (
        <div
          role="status"
          className="absolute top-full right-0 z-20 mt-2 w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700 shadow-lg dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"
        >
          <div className="flex items-start justify-between gap-3">
            <p className={error ? "text-red-600 dark:text-red-400" : ""}>
              {error || `Imported: ${result!.created} added, ${result!.updated} updated, ${result!.skipped} skipped.`}
            </p>
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setError("");
              }}
              aria-label="Close"
              className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              ×
            </button>
          </div>
          {result && result.problems.length > 0 && (
            <>
              <p className="mt-2 font-medium text-amber-700 dark:text-amber-400">
                {result.problems.length === 100 ? "The first 100 things to check:" : `${result.problems.length} to check:`}
              </p>
              <ul className="mt-1 max-h-64 list-disc space-y-1 overflow-y-auto pl-5">
                {result.problems.map((problem, i) => (
                  <li key={i}>{problem}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
