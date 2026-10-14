import { useRef, useState } from "react";
import type { ImportResult } from "../../shared/types";
import { errorMessage } from "../lib/api";
import { secondaryButton } from "./ui";

interface ImportCsvButtonProps {
  /** Sends the file's text to the server. */
  importCsv: (csv: string) => Promise<ImportResult>;
  onImported: () => void;
}

export function ImportCsvButton({ importCsv, onImported }: ImportCsvButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so choosing the same file again still fires a change
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await importCsv(await file.text());
      setMessage(`Imported: ${result.created} added, ${result.updated} updated, ${result.skipped} skipped.`);
      onImported();
    } catch (error) {
      setMessage(errorMessage(error));
    }
    setBusy(false);
  }

  return (
    <>
      <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className={secondaryButton.replace("px-4 py-2", "px-3 py-1.5")}>
        {busy ? "Importing…" : "Import CSV"}
      </button>
      {message && (
        <span role="status" className="basis-full text-right text-sm text-gray-500">
          {message}
        </span>
      )}
    </>
  );
}
