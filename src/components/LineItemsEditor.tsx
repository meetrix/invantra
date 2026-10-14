import { computeLineTotals, formatMoney } from "../../shared/money";
import type { Item, LineItem } from "../../shared/types";
import { createId } from "../lib/id";
import { MoneyInput } from "./MoneyInput";
import { inputClass, tableHeadClass, textareaClass } from "./ui";

interface LineItemsEditorProps {
  lines: LineItem[];
  currency: string;
  /** The catalogue offered as suggestions for a line's name. */
  items?: Item[];
  readOnly?: boolean;
  onChange: (lines: LineItem[]) => void;
}

function emptyLine(): LineItem {
  return { id: createId(), name: "", description: "", qty: 1, rate: 0, discount: 0 };
}

const ITEM_LIST_ID = "catalogue-items";

export function LineItemsEditor({ lines, currency, items = [], readOnly, onChange }: LineItemsEditorProps) {
  function updateLine(id: string, patch: Partial<LineItem>) {
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  /** Typing or picking a catalogue item's exact name fills in its description and rate. */
  function updateName(id: string, name: string) {
    const item = items.find((i) => i.name === name);
    updateLine(id, item ? { name, description: item.description, rate: item.rate } : { name });
  }

  function removeLine(id: string) {
    onChange(lines.filter((l) => l.id !== id));
  }

  return (
    <div className="overflow-x-auto">
      {!readOnly && (
        <datalist id={ITEM_LIST_ID}>
          {items.map((item) => (
            <option key={item.id} value={item.name} />
          ))}
        </datalist>
      )}
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className={`${tableHeadClass} text-left`}>
            <th className="w-8 py-2 pr-2 font-medium">#</th>
            <th className="py-2 pr-2 font-medium">Item &amp; Description</th>
            <th className="w-20 py-2 pr-2 font-medium">Qty</th>
            <th className="w-28 py-2 pr-2 font-medium">Rate</th>
            <th className="w-28 py-2 pr-2 font-medium">Discount</th>
            <th className="w-28 py-2 pr-2 text-right font-medium">Amount</th>
            {!readOnly && <th className="w-8 py-2" />}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const totals = computeLineTotals(line);
            return (
              <tr key={line.id} className="border-b border-gray-100 align-top dark:border-gray-800">
                <td className="py-2 pr-2 pt-3 text-gray-400 tabular-nums">{index + 1}</td>
                {/* Read-only is a document, not a form full of greyed-out boxes. */}
                {readOnly ? (
                  <>
                    <td className="py-3 pr-2">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{line.name}</p>
                      {line.description && (
                        <p className="mt-1 whitespace-pre-line text-gray-600 dark:text-gray-400">{line.description}</p>
                      )}
                    </td>
                    <td className="py-3 pr-2 tabular-nums">{line.qty}</td>
                    <td className="py-3 pr-2 tabular-nums">{formatMoney(line.rate, currency)}</td>
                    <td className="py-3 pr-2 tabular-nums">{line.discount ? formatMoney(line.discount, currency) : "—"}</td>
                  </>
                ) : (
                  <>
                <td className="space-y-1 py-2 pr-2">
                  <input
                    type="text"
                    list={ITEM_LIST_ID}
                    value={line.name}
                    onChange={(e) => updateName(line.id, e.target.value)}
                    placeholder={items.length ? "Type to search items, or enter a new one" : "Item or service"}
                    aria-label="Item"
                    className={`${inputClass} w-full`}
                  />
                  {/* Detail lines print underneath the name, one row each. */}
                  <textarea
                    value={line.description}
                    onChange={(e) => updateLine(line.id, { description: e.target.value })}
                    placeholder="Details — one per line, e.g. * 8 vCPU, 12 GB RAM"
                    aria-label="Description"
                    rows={line.description ? Math.min(line.description.split("\n").length + 1, 12) : 2}
                    className={`${textareaClass} w-full resize-y font-normal text-gray-600 dark:text-gray-400`}
                  />
                </td>
                <td className="py-2 pr-2">
                  <MoneyInput value={line.qty} step={1} min={0} onChange={(qty) => updateLine(line.id, { qty })} className="w-full" />
                </td>
                <td className="py-2 pr-2">
                  <MoneyInput value={line.rate} min={0} onChange={(rate) => updateLine(line.id, { rate })} className="w-full" />
                </td>
                <td className="py-2 pr-2">
                  <MoneyInput
                    value={line.discount}
                    min={0}
                    onChange={(discount) => updateLine(line.id, { discount })}
                    className="w-full"
                  />
                </td>
                  </>
                )}
                <td className="py-3 pr-2 text-right font-medium tabular-nums text-gray-900 dark:text-gray-100">
                  {formatMoney(totals.amount, currency)}
                </td>
                {!readOnly && (
                  <td className="py-2 pt-3 text-right">
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      aria-label="Remove line"
                      className="text-gray-400 hover:text-red-600"
                    >
                      ×
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!readOnly && (
        <button
          type="button"
          onClick={() => onChange([...lines, emptyLine()])}
          className="mt-3 rounded border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:text-gray-100"
        >
          + Add line
        </button>
      )}
    </div>
  );
}
