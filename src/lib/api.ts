import type {
  Customer,
  Document,
  DocumentInput,
  DocumentKind,
  ImportResult,
  Item,
  PaymentInput,
  ReceivedPayment,
  Role,
  Settings,
  User,
} from "../../shared/types";

export class ApiError extends Error {
  status: number;
  code: string | undefined;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Fired when the server says the session is gone or must change its password; the auth provider re-checks. */
export const SESSION_EVENT = "session-changed";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new ApiError(response.status, data?.error ?? `Request failed (${response.status}).`, data?.code);
    if (error.code === "unauthenticated" || error.code === "password_change_required") {
      window.dispatchEvent(new Event(SESSION_EVENT));
    }
    throw error;
  }
  return data as T;
}

/** The message to show for anything a request threw. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Could not reach the server. Check your connection and try again.";
}

// ---------- auth ----------

/** The signed-in user, or null when there is no session. */
export const getMe = () => request<{ user: User | null }>("GET", "/auth/me").then((r) => r.user);
export const login = (email: string, password: string) =>
  request<{ user: User }>("POST", "/auth/login", { email, password }).then((r) => r.user);
export const logout = () => request<unknown>("POST", "/auth/logout", {});
export const changePassword = (currentPassword: string, newPassword: string) =>
  request<{ user: User }>("POST", "/auth/change-password", { currentPassword, newPassword }).then((r) => r.user);
export const getPasswordLink = (token: string) =>
  request<{ email: string; name: string; purpose: "invite" | "reset" }>("GET", `/auth/link/${encodeURIComponent(token)}`);
export const setPassword = (token: string, password: string) =>
  request<{ user: User }>("POST", "/auth/set-password", { token, password }).then((r) => r.user);

// ---------- users ----------

export const listUsers = () => request<{ users: User[] }>("GET", "/users").then((r) => r.users);
export const createUser = (input: { email: string; name: string; role: Role }) =>
  request<{ user: User; linkPath: string }>("POST", "/users", input);
export const updateUser = (id: string, patch: { name?: string; role?: Role; disabled?: boolean }) =>
  request<{ user: User }>("PATCH", `/users/${id}`, patch).then((r) => r.user);
export const createUserLink = (id: string) =>
  request<{ linkPath: string }>("POST", `/users/${id}/link`, {}).then((r) => r.linkPath);

// ---------- settings ----------

export const getSettings = () => request<{ settings: Settings }>("GET", "/settings").then((r) => r.settings);
export const saveSettings = (settings: Settings) =>
  request<{ settings: Settings }>("PUT", "/settings", settings).then((r) => r.settings);

// ---------- customers ----------

export type CustomerInput = Omit<Customer, "id" | "createdAt" | "updatedAt">;

export const listCustomers = () => request<{ customers: Customer[] }>("GET", "/customers").then((r) => r.customers);
export const getCustomer = (id: string) =>
  request<{ customer: Customer }>("GET", `/customers/${id}`).then((r) => r.customer);
export const createCustomer = (input: CustomerInput) =>
  request<{ customer: Customer }>("POST", "/customers", input).then((r) => r.customer);
export const updateCustomer = (id: string, input: CustomerInput) =>
  request<{ customer: Customer }>("PUT", `/customers/${id}`, input).then((r) => r.customer);
export const importCustomers = (csv: string) =>
  request<{ result: ImportResult }>("POST", "/customers/import", { csv }).then((r) => r.result);

// ---------- items ----------

export type ItemInput = Omit<Item, "id" | "createdAt" | "updatedAt">;

export const listItems = () => request<{ items: Item[] }>("GET", "/items").then((r) => r.items);
export const createItem = (input: ItemInput) => request<{ item: Item }>("POST", "/items", input).then((r) => r.item);
export const updateItem = (id: string, input: ItemInput) =>
  request<{ item: Item }>("PUT", `/items/${id}`, input).then((r) => r.item);
export const importItems = (csv: string) =>
  request<{ result: ImportResult }>("POST", "/items/import", { csv }).then((r) => r.result);

// ---------- documents ----------

const document = (promise: Promise<{ document: Document }>) => promise.then((r) => r.document);

export const listDocuments = (kind?: DocumentKind) =>
  request<{ documents: Document[] }>("GET", `/documents${kind ? `?kind=${kind}` : ""}`).then((r) => r.documents);
export const getDocument = (id: string) => document(request("GET", `/documents/${id}`));
export const getNextNumber = (kind: DocumentKind, date: string) =>
  request<{ number: string }>("GET", `/documents/next-number?kind=${kind}&date=${date}`).then((r) => r.number);
export const createDocument = (input: DocumentInput) => document(request("POST", "/documents", input));
export const updateDocument = (id: string, input: DocumentInput) => document(request("PUT", `/documents/${id}`, input));
export const submitDocument = (id: string) => document(request("POST", `/documents/${id}/submit`, {}));
export const approveDocument = (id: string) => document(request("POST", `/documents/${id}/approve`, {}));
export const rejectDocument = (id: string, reason: string) =>
  document(request("POST", `/documents/${id}/reject`, { reason }));
export const convertToDraft = (id: string, reason: string) =>
  document(request("POST", `/documents/${id}/to-draft`, { reason }));
export const voidDocument = (id: string) => document(request("POST", `/documents/${id}/void`, {}));
export const recordPayment = (id: string, payment: PaymentInput) =>
  document(request("POST", `/documents/${id}/payments`, payment));
/** Attaches a file to a payment; resolves to the invoice it belongs to. */
export async function uploadPaymentAttachment(paymentId: string, file: File): Promise<Document> {
  const response = await fetch(`/api/payments/${paymentId}/attachments?name=${encodeURIComponent(file.name)}`, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data?.error ?? `Could not upload ${file.name}.`, data?.code);
  return data.document;
}
export const deletePaymentAttachment = (id: string) => document(request("DELETE", `/attachments/${id}`));
export const attachmentUrl = (id: string) => `/api/attachments/${id}`;
export const listPayments = () =>
  request<{ payments: ReceivedPayment[] }>("GET", "/payments").then((r) => r.payments);
