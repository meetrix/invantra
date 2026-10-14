import { useNavigate } from "react-router-dom";
import { secondaryButton } from "./ui";

/**
 * The bar at the foot of a form. Cancel is always there and always goes
 * somewhere definite rather than through the browser's history, because a form
 * reached after a failed save or a redirect has a history that leads nowhere
 * useful.
 */
export function FormActions({ cancelTo, children }: { cancelTo: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
      {children}
      <button type="button" onClick={() => navigate(cancelTo)} className={secondaryButton}>
        Cancel
      </button>
    </div>
  );
}
