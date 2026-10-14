import type { Document } from "../../shared/types";
import { displayStatus, type StatusTone } from "../lib/status";

const STYLES: Record<StatusTone, string> = {
  gray: "bg-gray-500",
  amber: "bg-amber-500",
  blue: "bg-blue-600",
  green: "bg-green-600",
  orange: "bg-orange-600",
  red: "bg-red-600",
};

/**
 * The status as a band across the top-left corner of a document. It is for
 * the screen only and never prints. The parent must be `position: relative`.
 */
export function StatusRibbon({ document }: { document: Document }) {
  const { short, tone } = displayStatus(document);
  return (
    <div className="no-print pointer-events-none absolute top-0 left-0 h-36 w-36 overflow-hidden" data-testid="status-ribbon">
      <div
        className={`absolute top-[36px] left-[-42px] w-[180px] -rotate-45 py-1 text-center font-sans text-[11px] leading-4 font-semibold tracking-wide text-white uppercase shadow ${STYLES[tone]}`}
      >
        {short}
      </div>
    </div>
  );
}
