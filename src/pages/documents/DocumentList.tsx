import { Link, useNavigate } from "react-router-dom";
import { formatDateNumeric } from "../../../shared/date";
import { formatMoney } from "../../../shared/money";
import type { DocumentKind } from "../../../shared/types";
import { LoadState } from "../../components/LoadState";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { cardClass, primaryButton, tableHeadClass, tableRowClass } from "../../components/ui";
import { listCustomers, listDocuments } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useLoad } from "../../lib/useLoad";

const TITLE: Record<DocumentKind, string> = { estimate: "Estimates", invoice: "Invoices" };

export function DocumentList({ kind }: { kind: DocumentKind }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const { data, error } = useLoad(() => Promise.all([listDocuments(kind), listCustomers()]), [kind]);

  if (!data) return <LoadState error={error} />;
  const [documents, customers] = data;
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const isInvoice = kind === "invoice";
  const cell = "px-4 py-3";

  return (
    <div className="space-y-5">
      <PageHeader title={TITLE[kind]} subtitle={documents.length ? `${documents.length} in total` : undefined}>
        {can("documents.write") && (
          <Link to={`/${kind}s/new`} className={primaryButton}>
            New {kind}
          </Link>
        )}
      </PageHeader>

      {documents.length === 0 ? (
        <div className={`${cardClass} p-10 text-center`}>
          <p className="text-sm text-gray-500 dark:text-gray-400">No {kind}s yet.</p>
          {can("documents.write") && (
            <Link to={`/${kind}s/new`} className={`${primaryButton} mt-4`}>
              New {kind}
            </Link>
          )}
        </div>
      ) : (
        <div className={`${cardClass} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className={`${tableHeadClass} text-left`}>
                <th className={`${cell} font-medium`}>Date</th>
                <th className={`${cell} font-medium`}>{isInvoice ? "Invoice#" : "Estimate#"}</th>
                <th className={`${cell} font-medium`}>Customer</th>
                <th className={`${cell} font-medium`}>Status</th>
                {isInvoice && <th className={`${cell} font-medium`}>Due date</th>}
                <th className={`${cell} text-right font-medium`}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr
                  key={doc.id}
                  onClick={() => navigate(`/${kind}s/${doc.id}`)}
                  className={`${tableRowClass} cursor-pointer`}
                >
                  <td className={`${cell} tabular-nums`}>{formatDateNumeric(doc.issueDate)}</td>
                  <td className={cell}>
                    <Link to={`/${kind}s/${doc.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-blue-700 hover:underline dark:text-blue-400">
                      {doc.number}
                    </Link>
                  </td>
                  <td className={cell}>{customerName(doc.customerId)}</td>
                  <td className={cell}>
                    <StatusBadge document={doc} />
                  </td>
                  {isInvoice && <td className={`${cell} tabular-nums`}>{formatDateNumeric(doc.dueDate)}</td>}
                  <td className={`${cell} text-right tabular-nums`}>{formatMoney(doc.total, doc.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
