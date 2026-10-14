import { Link } from "react-router-dom";
import { daysBetween, todayIso } from "../../shared/date";
import { formatMoney, round2 } from "../../shared/money";
import type { Document } from "../../shared/types";
import { LoadState } from "../components/LoadState";
import { cardClass } from "../components/ui";
import { StatusBadge } from "../components/StatusBadge";
import { getSettings, listCustomers, listDocuments } from "../lib/api";
import { useAuth } from "../lib/auth";
import { paidAmount } from "../lib/status";
import { useLoad } from "../lib/useLoad";

interface Receivable {
  currency: string;
  /** Not yet due, and past due: together they are everything still owed. */
  current: number;
  overdue: number;
  total: number;
}

/**
 * What approved invoices are still owed. Amounts in different currencies are
 * never added together, so each currency gets its own figure.
 */
function receivables(invoices: Document[], today: string): Receivable[] {
  const byCurrency = new Map<string, Receivable>();
  for (const invoice of invoices) {
    // Draft, pending, paid and void invoices are not owed anything.
    if (invoice.status !== "approved") continue;
    const owed = round2(invoice.total - paidAmount(invoice));
    if (owed <= 0) continue;
    const entry = byCurrency.get(invoice.currency) ?? { currency: invoice.currency, current: 0, overdue: 0, total: 0 };
    const overdue = invoice.dueDate !== null && daysBetween(today, invoice.dueDate) < 0;
    entry[overdue ? "overdue" : "current"] = round2(entry[overdue ? "overdue" : "current"] + owed);
    entry.total = round2(entry.total + owed);
    byCurrency.set(invoice.currency, entry);
  }
  return [...byCurrency.values()].sort((a, b) => b.total - a.total);
}

export function Home() {
  const { user, can } = useAuth();
  const { data, error } = useLoad(() => Promise.all([listCustomers(), listDocuments(), getSettings()]), []);

  if (!data) return <LoadState error={error} />;
  const [customers, documents, settings] = data;

  const today = todayIso();
  const estimates = documents.filter((d) => d.kind === "estimate");
  const invoices = documents.filter((d) => d.kind === "invoice");
  const owed = receivables(invoices, today);
  const awaitingApproval = documents.filter((d) => d.status === "pending_approval");
  const readyToInvoice = estimates.filter((d) => d.status === "approved");
  // A rejected estimate is a draft that also needs attention, so it counts here.
  const draftEstimates = estimates.filter((d) => d.status === "draft" || d.status === "rejected");
  const rejected = documents.filter((d) => d.status === "rejected");
  const recent = [...documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const canWrite = can("documents.write");
  const firstName = (user?.name || user?.email || "").split(/[\s@]/)[0];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        {settings.logoDataUrl ? (
          <img src={settings.logoDataUrl} alt="" className="h-12 w-12 rounded-lg object-contain" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-lg font-semibold text-gray-500 dark:bg-gray-800">
            {(firstName[0] ?? "?").toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-xl font-semibold">Hello, {user?.name || user?.email}</h1>
          <p className="text-sm text-gray-500">{settings.businessName || "Your business"}</p>
        </div>
      </div>

      {!settings.businessName && can("settings.write") && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Set up your business details in{" "}
          <Link to="/settings" className="underline">
            Settings
          </Link>{" "}
          before approving documents.
        </div>
      )}

      <div className="grid items-start gap-4 md:grid-cols-2">
        <Card title="Total receivables" action={canWrite ? { to: "/invoices/new", label: "New invoice" } : undefined}>
          <p className="text-xs text-gray-500">Total unpaid invoices</p>
          {owed.length === 0 ? (
            <p className="mt-1 text-sm text-gray-500">Nothing outstanding.</p>
          ) : (
            <div className="mt-1 space-y-4">
              {owed.map((entry) => (
                <ReceivableBar key={entry.currency} entry={entry} />
              ))}
            </div>
          )}
        </Card>

        <Card title="Estimates" action={canWrite ? { to: "/estimates/new", label: "New estimate" } : undefined}>
          <dl className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
            <Count label="Waiting for approval" value={awaitingApproval.length} to="/estimates" />
            <Count label="Approved, not yet invoiced" value={readyToInvoice.length} to="/estimates" />
            <Count label="Drafts" value={draftEstimates.length} to="/estimates" />
            {rejected.length > 0 && <Count label="Rejected" value={rejected.length} to="/estimates" />}
            <Count label="Customers" value={customers.filter((c) => !c.archived).length} to="/customers" />
          </dl>
        </Card>
      </div>

      {awaitingApproval.length > 0 && can("documents.approve") && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-gray-500">Waiting for your approval</h2>
          <DocumentRows documents={awaitingApproval} customerName={customerName} />
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-medium text-gray-500">Recent</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nothing yet.{" "}
            {canWrite && (
              <Link to="/estimates/new" className="underline">
                Create your first estimate
              </Link>
            )}
          </p>
        ) : (
          <DocumentRows documents={recent} customerName={customerName} />
        )}
      </div>
    </div>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: { to: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className={cardClass}>
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5 dark:border-gray-800">
        <h2 className="font-medium">{title}</h2>
        {action && (
          <Link to={action.to} className="text-sm text-blue-700 hover:underline dark:text-blue-400">
            + {action.label}
          </Link>
        )}
      </div>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

/** One currency's unpaid total, with the share of it that is past its due date. */
function ReceivableBar({ entry }: { entry: Receivable }) {
  const currentShare = entry.total > 0 ? (entry.current / entry.total) * 100 : 0;
  return (
    <div>
      <p className="text-2xl font-semibold tabular-nums">{formatMoney(entry.total, entry.currency)}</p>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div className="bg-blue-600" style={{ width: `${currentShare}%` }} />
        <div className="flex-1 bg-orange-500" />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <Legend color="bg-blue-600" label="Current" value={formatMoney(entry.current, entry.currency)} />
        <Legend color="bg-orange-500" label="Overdue" value={formatMoney(entry.overdue, entry.currency)} />
      </div>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-xs ${color}`} />
      <span className="text-gray-500">{label} :</span>
      <span className="tabular-nums">{value}</span>
    </span>
  );
}

function Count({ label, value, to }: { label: string; value: number; to: string }) {
  return (
    <div className="flex justify-between py-2">
      <dt>
        <Link to={to} className="text-gray-500 hover:text-gray-900 dark:hover:text-gray-100">
          {label}
        </Link>
      </dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function DocumentRows({ documents, customerName }: { documents: Document[]; customerName: (id: string) => string }) {
  return (
    <ul className={`${cardClass} divide-y divide-gray-100 overflow-hidden dark:divide-gray-800`}>
      {documents.map((doc) => (
        <li key={doc.id}>
          <Link
            to={`/${doc.kind}s/${doc.id}`}
            className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900"
          >
            <div>
              <p className="font-medium">
                {doc.number} <span className="text-xs text-gray-400">({doc.kind})</span>
              </p>
              <p className="text-sm text-gray-500">{customerName(doc.customerId)}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="tabular-nums">{formatMoney(doc.total, doc.currency)}</span>
              <StatusBadge document={doc} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
