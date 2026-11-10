import { useState, type DragEvent, type KeyboardEvent } from "react";
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

  /** Moves the line at `from` so that it ends up at index `to`. */
  function moveLine(from: number, to: number) {
    if (from === to || to < 0 || to >= lines.length) return;
    const next = [...lines];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  // Only the handle is draggable, so selecting text in the inputs still works.
  // `dropIndex` is the gap the dragged line would land in, 0 to lines.length.
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  function endDrag() {
    setDragging(null);
    setDropIndex(null);
  }

  function dragStart(event: DragEvent<HTMLSpanElement>, index: number) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", lines[index].id);
    // Show the whole row under the pointer, not just the handle.
    const row = event.currentTarget.closest("tr");
    if (row) event.dataTransfer.setDragImage(row, 16, 16);
    setDragging(index);
  }

  function dragOver(event: DragEvent<HTMLTableRowElement>, index: number) {
    if (dragging === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const box = event.currentTarget.getBoundingClientRect();
    setDropIndex(event.clientY < box.top + box.height / 2 ? index : index + 1);
  }

  function drop(event: DragEvent<HTMLTableRowElement>) {
    event.preventDefault();
    if (dragging !== null && dropIndex !== null) {
      // Removing the line first shifts every gap after it up by one.
      moveLine(dragging, dropIndex > dragging ? dropIndex - 1 : dropIndex);
    }
    endDrag();
  }

  /** The keyboard way to reorder: arrow keys on the handle. */
  function handleKey(event: KeyboardEvent<HTMLSpanElement>, index: number) {
    const to = event.key === "ArrowUp" ? index - 1 : event.key === "ArrowDown" ? index + 1 : null;
    if (to === null) return;
    event.preventDefault();
    moveLine(index, to);
    // Keep focus on the handle of the line that moved.
    const id = lines[index].id;
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-line-handle="${id}"]`)?.focus());
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
            <th className="w-10 py-2 pr-2 font-medium">#</th>
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
            const dropLine =
              dropIndex === index && dragging !== index && dragging !== index - 1
                ? "[&>td]:shadow-[inset_0_2px_0_0_var(--color-blue-500)]"
                : dropIndex === index + 1 && index === lines.length - 1 && dragging !== index
                  ? "[&>td]:shadow-[inset_0_-2px_0_0_var(--color-blue-500)]"
                  : "";
            return (
              <tr
                key={line.id}
                onDragOver={(e) => dragOver(e, index)}
                onDrop={drop}
                className={`border-b border-gray-100 align-top dark:border-gray-800 ${dragging === index ? "opacity-40" : ""} ${dropLine}`}
              >
                <td className="py-2 pr-2 pt-3 text-gray-400 tabular-nums">
                  {readOnly || lines.length < 2 ? (
                    index + 1
                  ) : (
                    // A span, not a <button>: Firefox will not start a drag from a button.
                    <span
                      role="button"
                      tabIndex={0}
                      draggable
                      data-line-handle={line.id}
                      onDragStart={(e) => dragStart(e, index)}
                      onDragEnd={endDrag}
                      onKeyDown={(e) => handleKey(e, index)}
                      aria-label={`Line ${index + 1}. Drag to move it, or use the arrow keys.`}
                      title="Drag to move this line, or focus it and use the arrow keys"
                      className="-ml-1 inline-flex cursor-grab items-center gap-0.5 rounded px-1 select-none hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-blue-500 active:cursor-grabbing dark:hover:bg-gray-800 dark:hover:text-gray-200"
                    >
                      <span aria-hidden="true" className="text-[10px] leading-none tracking-[-2px]">
                        ⋮⋮
                      </span>
                      <span className="pl-0.5">{index + 1}</span>
                    </span>
                  )}
                </td>
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
