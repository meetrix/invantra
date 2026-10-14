import { useState } from "react";
import { Link } from "react-router-dom";
import { formatMoney } from "../../../shared/money";
import { ImportCsvButton } from "../../components/ImportCsvButton";
import { LoadState } from "../../components/LoadState";
import { PageHeader } from "../../components/PageHeader";
import { cardClass, inputClass, primaryButton, smallButton } from "../../components/ui";
import { getSettings, importItems, listItems } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useLoad } from "../../lib/useLoad";

/** The catalogue: reusable line items picked by name when writing an estimate or invoice. */
export function ItemsList() {
  const { can } = useAuth();
  const { data: items, error, reload } = useLoad(listItems, []);
  const { data: settings } = useLoad(getSettings, []);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");

  if (!items) return <LoadState error={error} />;

  const term = search.trim().toLowerCase();
  const visible = items.filter(
    (i) => (showArchived || !i.archived) && (!term || `${i.name}\n${i.description}`.toLowerCase().includes(term)),
  );
  const archivedCount = items.filter((i) => i.archived).length;

  return (
    <div className="space-y-5">
      <PageHeader title="Items" subtitle={`${visible.length} of ${items.length} in the catalogue`}>
        {can("data.import") && <ImportCsvButton importCsv={importItems} onImported={reload} />}
        {can("items.write") && (
          <Link to="/items/new" className={primaryButton}>
            New item
          </Link>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-4">
        <input
          type="search"
          placeholder="Search items"
          aria-label="Search items"
          className={`${inputClass} w-64`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {archivedCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived ({archivedCount})
          </label>
        )}
      </div>

      {visible.length === 0 ? (
        <div className={`${cardClass} p-10 text-center`}>
          <p className="text-sm text-gray-500 dark:text-gray-400">{items.length === 0 ? "No items yet." : "No items match."}</p>
          {items.length === 0 && can("items.write") && (
            <Link to="/items/new" className={`${primaryButton} mt-4`}>
              New item
            </Link>
          )}
        </div>
      ) : (
        <ul className={`${cardClass} divide-y divide-gray-100 overflow-hidden dark:divide-gray-800`}>
          {visible.map((item) => (
            <li key={item.id} className="group flex items-start hover:bg-gray-50 dark:hover:bg-gray-900/60">
              <Link to={`/items/${item.id}`} className="flex min-w-0 flex-1 items-start justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {item.name}
                    {item.archived && (
                      <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                        Archived
                      </span>
                    )}
                  </p>
                  {item.description && (
                    <p className="mt-0.5 line-clamp-2 text-sm whitespace-pre-line text-gray-500 dark:text-gray-400">{item.description}</p>
                  )}
                </div>
                <span className="shrink-0 pt-0.5 font-medium tabular-nums text-gray-900 dark:text-gray-100">
                  {formatMoney(item.rate, item.currency || settings?.currency || "USD")}
                </span>
              </Link>
              {/* Shown on hover, so copying a rate card is one click from the list. */}
              {can("items.write") && (
                <div className="shrink-0 py-3.5 pr-4 pl-3">
                  <Link
                    to={`/items/new?copy=${item.id}`}
                    className={`${smallButton} opacity-0 group-hover:opacity-100 focus:opacity-100`}
                  >
                    Copy
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
