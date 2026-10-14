import { Link } from "react-router-dom";

/**
 * The top of a page: an optional way back, the title, and the actions that
 * belong to the whole page. Every page uses it, so the first line of each one
 * sits in the same place and nothing has to be read twice to be found.
 */
export function PageHeader({
  title,
  subtitle,
  backTo,
  backLabel = "Back",
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  /** Where the arrow goes. A page reached by a link should always offer one. */
  backTo?: string;
  backLabel?: string;
  /** Buttons for the page, laid out at the right on a wide screen. */
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      {backTo && (
        <Link
          to={backTo}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M10 3 5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {backLabel}
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">{title}</h1>
          {subtitle && <div className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{subtitle}</div>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
