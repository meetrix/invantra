/** A key for a row that has not been saved yet; the server assigns the stored ids. */
export function createId(): string {
  // crypto.randomUUID() is only defined in a secure context, so it exists on
  // localhost and HTTPS but is undefined when the app is served from a plain
  // http://<ip> host. crypto.getRandomValues() carries no such restriction.
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
