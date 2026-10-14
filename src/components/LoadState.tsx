import { errorClass } from "./ui";

/** The placeholder shown while a page's data loads, or the reason it could not. */
export function LoadState({ error }: { error: string }) {
  return error ? <p className={errorClass}>{error}</p> : <p className="text-gray-500">Loading…</p>;
}
