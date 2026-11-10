import { Link } from "react-router-dom";
import { REPORTS, type ReportInfo } from "../../../shared/reports";
import { PageHeader } from "../../components/PageHeader";
import { cardClass } from "../../components/ui";

const GROUPS: ReportInfo["group"][] = ["Sales", "Receivables", "Payments", "Business overview", "Activity"];

/** The list of reports, grouped the way people look for them. */
export function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Worked out from your estimates, invoices and payments. Each currency is reported on its own."
      />
      <div className="grid gap-5 md:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group} className={`${cardClass} p-5`}>
            <h2 className="text-sm font-semibold tracking-wide text-gray-500 uppercase">{group}</h2>
            <ul className="mt-3 space-y-3">
              {REPORTS.filter((r) => r.group === group).map((report) => (
                <li key={report.name}>
                  <Link
                    to={`/reports/${report.name}`}
                    className="font-medium text-blue-700 hover:underline dark:text-blue-400"
                  >
                    {report.title}
                  </Link>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{report.description}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
