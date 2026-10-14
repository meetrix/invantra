import { Link, useNavigate } from "react-router-dom";
import { formatDateNumeric } from "../../../shared/date";
import { formatMoney } from "../../../shared/money";
import { LoadState } from "../../components/LoadState";
import { PageHeader } from "../../components/PageHeader";
import { cardClass, tableHeadClass, tableRowClass } from "../../components/ui";
import { listPayments } from "../../lib/api";
import { useLoad } from "../../lib/useLoad";

/** Every payment recorded against an invoice. Payments are recorded from the invoice itself. */
export function PaymentsList() {
  const navigate = useNavigate();
  const { data: payments, error } = useLoad(listPayments, []);

  if (!payments) return <LoadState error={error} />;
  const cell = "px-4 py-3";

  return (
    <div className="space-y-4">
      <PageHeader title="Payments received" subtitle={payments.length ? `${payments.length} recorded` : undefined} />

      {payments.length === 0 ? (
        <p className="text-sm text-gray-500">
          No payments yet. Open an approved invoice and choose Record payment.
        </p>
      ) : (
        <div className={`${cardClass} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className={`${tableHeadClass} text-left`}>
                <th className={`${cell} font-medium`}>Date</th>
                <th className={`${cell} font-medium`}>Payment#</th>
                <th className={`${cell} font-medium`}>Reference#</th>
                <th className={`${cell} font-medium`}>Customer</th>
                <th className={`${cell} font-medium`}>Invoice#</th>
                <th className={`${cell} font-medium`}>Mode</th>
                <th className={`${cell} font-medium`}>Files</th>
                <th className={`${cell} text-right font-medium`}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr
                  key={payment.id}
                  onClick={() => navigate(`/invoices/${payment.documentId}`)}
                  className={`${tableRowClass} cursor-pointer`}
                >
                  <td className={`${cell} tabular-nums`}>{formatDateNumeric(payment.date)}</td>
                  <td className={`${cell} tabular-nums`}>{payment.number}</td>
                  <td className={cell}>{payment.reference}</td>
                  <td className={cell}>{payment.customerName}</td>
                  <td className={cell}>
                    <Link
                      to={`/invoices/${payment.documentId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-blue-700 hover:underline dark:text-blue-400"
                    >
                      {payment.documentNumber}
                    </Link>
                  </td>
                  <td className={cell}>{payment.method}</td>
                  <td className={`${cell} tabular-nums`}>{payment.attachments.length || ""}</td>
                  <td className={`${cell} text-right tabular-nums`}>{formatMoney(payment.amount, payment.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
