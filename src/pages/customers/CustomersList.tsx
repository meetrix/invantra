import { useState } from "react";
import { Link } from "react-router-dom";
import { ImportCsvButton } from "../../components/ImportCsvButton";
import { LoadState } from "../../components/LoadState";
import { PageHeader } from "../../components/PageHeader";
import { cardClass, inputClass, primaryButton } from "../../components/ui";
import { importCustomers, listCustomers } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useLoad } from "../../lib/useLoad";

export function CustomersList() {
  const { can } = useAuth();
  const { data: customers, error, reload } = useLoad(listCustomers, []);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");

  if (!customers) return <LoadState error={error} />;

  const term = search.trim().toLowerCase();
  const visible = customers.filter(
    (c) =>
      (showArchived || !c.archived) &&
      (!term || [c.name, c.contactPerson, c.email, c.country].some((v) => v.toLowerCase().includes(term))),
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Customers" subtitle={`${visible.length} of ${customers.length}`}>
        {can("data.import") && <ImportCsvButton importCsv={importCustomers} onImported={reload} />}
        {can("customers.write") && (
          <Link to="/customers/new" className={primaryButton}>
            New customer
          </Link>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-4">
        <input
          type="search"
          placeholder="Search customers"
          aria-label="Search customers"
          className={`${inputClass} w-64`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-gray-500">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      </div>

      {visible.length === 0 ? (
        <div className={`${cardClass} p-10 text-center`}>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {customers.length === 0 ? "No customers yet." : "No customers match."}
          </p>
          {customers.length === 0 && can("customers.write") && (
            <Link to="/customers/new" className={`${primaryButton} mt-4`}>
              New customer
            </Link>
          )}
        </div>
      ) : (
        <ul className={`${cardClass} divide-y divide-gray-100 overflow-hidden dark:divide-gray-800`}>
          {visible.map((customer) => (
            <li key={customer.id}>
              <Link
                to={`/customers/${customer.id}`}
                className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-900/60"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900 dark:text-gray-100">{customer.name}</p>
                  <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                    {[customer.contactPerson, customer.email].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="shrink-0 text-right text-sm text-gray-500 dark:text-gray-400">
                  <p>{customer.country}</p>
                  <p>
                    {customer.currency}
                    {customer.archived && " · Archived"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
