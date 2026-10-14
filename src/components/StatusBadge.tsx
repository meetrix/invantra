import type { Document } from "../../shared/types";
import { displayStatus, type StatusTone } from "../lib/status";

const STYLES: Record<StatusTone, string> = {
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  green: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  red: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export function StatusBadge({ document }: { document: Document }) {
  const { label, tone } = displayStatus(document);
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STYLES[tone]}`}>
      {label}
    </span>
  );
}
