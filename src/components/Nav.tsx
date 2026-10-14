import { NavLink } from "react-router-dom";
import { ROLE_LABELS } from "../../shared/permissions";
import { useAuth } from "../lib/auth";

export function Nav() {
  const { user, logout, can } = useAuth();

  const links = [
    { to: "/", label: "Home", end: true },
    { to: "/customers", label: "Customers" },
    { to: "/items", label: "Items" },
    { to: "/estimates", label: "Estimates" },
    { to: "/invoices", label: "Invoices" },
    { to: "/payments", label: "Payments received" },
    ...(can("users.manage") ? [{ to: "/users", label: "Users" }] : []),
    ...(can("settings.write") ? [{ to: "/settings", label: "Settings" }] : []),
  ];

  return (
    <header className="no-print sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-gray-950/90">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
        <img src="/favicon.svg" alt="Invantra" className="h-6 w-6" />
        <nav className="flex flex-wrap gap-1 text-sm">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  isActive
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        {user && (
          <div className="ml-auto flex items-center gap-3 text-sm">
            <NavLink
              to="/account"
              className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white dark:bg-gray-100 dark:text-gray-900">
                {(user.name || user.email).trim().charAt(0).toUpperCase()}
              </span>
              <span className="hidden sm:inline">
                {user.name || user.email} <span className="text-xs text-gray-400">({ROLE_LABELS[user.role]})</span>
              </span>
            </NavLink>
            <button type="button" onClick={logout} className="text-gray-500 hover:text-gray-900 dark:hover:text-gray-100">
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
