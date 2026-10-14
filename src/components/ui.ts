/**
 * Class strings shared by every page, so one change here changes the whole app.
 *
 * The shapes are deliberately few: a control is 36px tall with an 8px radius, a
 * card is a white panel with a hairline border, and focus is always the same
 * ring. Anything that needs to look different should be built from these rather
 * than inventing its own padding and colour.
 */

/** 36px tall, matching the buttons, so a field and a button sit level. */
export const inputClass =
  "h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 " +
  "focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 focus:outline-none " +
  "disabled:bg-gray-50 disabled:text-gray-500 " +
  "dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-600 " +
  "dark:focus:border-gray-400 dark:focus:ring-gray-100/10 dark:disabled:bg-gray-800";

/** A textarea grows, so it takes the input's look without the fixed height. */
export const textareaClass = inputClass.replace("h-9 ", "") + " py-2 leading-relaxed";

export const labelClass = "flex flex-col gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300";

/** The quiet line under a field, for the detail that would clutter the label. */
export const hintClass = "text-xs font-normal text-gray-500 dark:text-gray-400";

const buttonBase =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors " +
  "focus-visible:ring-2 focus-visible:ring-gray-900/20 focus-visible:outline-none disabled:opacity-50 " +
  "dark:focus-visible:ring-gray-100/20";

export const primaryButton =
  `${buttonBase} bg-gray-900 text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white`;

export const secondaryButton =
  `${buttonBase} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 ` +
  "dark:border-gray-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-900";

/** For the one destructive action on a page; never the default. */
export const dangerButton =
  `${buttonBase} border border-red-200 bg-white text-red-600 hover:bg-red-50 ` +
  "dark:border-red-900 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-950";

/** Inside a table row or a list, where a full-height button would crowd. */
export const smallButton =
  "inline-flex h-7 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 text-xs font-medium text-gray-700 " +
  "hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-900";

/** A link that behaves like a button but carries no weight of its own. */
export const quietButton =
  "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 " +
  "dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100";

/** The panel every page's content sits in. */
export const cardClass =
  "rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950";

/** Padding for a card's body; separate so a table can fill its card edge to edge. */
export const cardBodyClass = "p-5";

export const errorClass =
  "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300";

/** Table parts, so every list reads the same. */
export const tableHeadClass =
  "border-b border-gray-200 text-xs font-medium tracking-wide text-gray-500 uppercase dark:border-gray-800 dark:text-gray-400";

export const tableRowClass =
  "border-b border-gray-100 last:border-0 hover:bg-gray-50 dark:border-gray-900 dark:hover:bg-gray-900/60";

/**
 * How many rows a textarea should show: enough for what is in it, within
 * bounds. Boilerplate like Terms & Conditions runs to a dozen lines and should
 * not be read through a two-line slot, while an empty box should not leave a
 * crater in the form.
 */
export function textareaRows(value: string, min = 3, max = 16): number {
  return Math.min(Math.max(value.split("\n").length + 1, min), max);
}
