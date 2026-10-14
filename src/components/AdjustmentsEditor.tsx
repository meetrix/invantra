import type { Adjustment } from "../../shared/types";
import { createId } from "../lib/id";
import { MoneyInput } from "./MoneyInput";

interface AdjustmentsEditorProps {
  adjustments: Adjustment[];
  readOnly?: boolean;
  onChange: (adjustments: Adjustment[]) => void;
}

/**
 * Named amounts added to the subtotal — "Wise Charges", "Bank Charges".
 * Amounts may be negative, which is how a whole-document discount is expressed.
 */
export function AdjustmentsEditor({ adjustments, readOnly, onChange }: AdjustmentsEditorProps) {
  function update(id: string, patch: Partial<Adjustment>) {
    onChange(adjustments.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  if (readOnly && adjustments.length === 0) return null;

  return (
    <div className="space-y-2">
      {adjustments.map((adj) => (
        <div key={adj.id} className="flex items-center gap-2">
          <input
            type="text"
            disabled={readOnly}
            value={adj.label}
            onChange={(e) => update(adj.id, { label: e.target.value })}
            placeholder="Charge label, e.g. Wise Charges"
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:disabled:bg-gray-800"
          />
          <MoneyInput
            value={adj.amount}
            disabled={readOnly}
            onChange={(amount) => update(adj.id, { amount })}
            className="w-28"
          />
          {!readOnly && (
            <button
              type="button"
              onClick={() => onChange(adjustments.filter((a) => a.id !== adj.id))}
              aria-label="Remove charge"
              className="text-gray-400 hover:text-red-600"
            >
              ×
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={() => onChange([...adjustments, { id: createId(), label: "", amount: 0 }])}
          className="rounded border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:text-gray-100"
        >
          + Add charge
        </button>
      )}
    </div>
  );
}
