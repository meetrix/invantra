import { useState } from "react";
import { errorClass, inputClass, labelClass, primaryButton } from "../../components/ui";
import { changePassword, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { AuthCard } from "./AuthCard";
import { NewPasswordFields } from "./NewPasswordFields";

function ChangePasswordForm({ onChanged }: { onChanged?: () => void }) {
  const { user, setUser } = useAuth();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setUser(await changePassword(current, password));
      setCurrent("");
      setPassword("");
      setConfirm("");
      onChanged?.();
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="email" autoComplete="username" value={user?.email ?? ""} readOnly hidden />
      <label className={labelClass}>
        Current password
        <input
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          className={inputClass}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </label>
      <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
      {error && <p className={errorClass}>{error}</p>}
      <button type="submit" disabled={busy} className={primaryButton}>
        Change password
      </button>
    </form>
  );
}

/** Shown instead of the app while the account still has the password it was created with. */
export function ForcedPasswordChange() {
  const { logout } = useAuth();
  return (
    <AuthCard title="Change your password">
      <p className="text-sm text-gray-500">
        This account is still using the password it was set up with. Choose your own before continuing.
      </p>
      <ChangePasswordForm />
      <button type="button" onClick={logout} className="text-sm text-gray-500 hover:underline">
        Sign out
      </button>
    </AuthCard>
  );
}

export function AccountPage() {
  const { user } = useAuth();
  const [changed, setChanged] = useState(false);
  return (
    <div className="max-w-sm space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Your account</h1>
        <p className="text-sm text-gray-500">{user?.email}</p>
      </div>
      <ChangePasswordForm onChanged={() => setChanged(true)} />
      {changed && (
        <p role="status" className="text-sm text-green-600">
          Password changed. Other devices have been signed out.
        </p>
      )}
    </div>
  );
}
