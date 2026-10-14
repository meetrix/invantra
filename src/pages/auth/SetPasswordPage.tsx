import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { errorClass, primaryButton } from "../../components/ui";
import { errorMessage, getPasswordLink, setPassword as apiSetPassword } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { AuthCard } from "./AuthCard";
import { NewPasswordFields } from "./NewPasswordFields";

/** Where an invite or reset link lands: the user chooses their own password and is signed in. */
export function SetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [link, setLink] = useState<{ email: string; name: string; purpose: "invite" | "reset" } | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getPasswordLink(token)
      .then(setLink)
      .catch((err) => setError(errorMessage(err)));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const user = await apiSetPassword(token, password);
      // Leave the token's address before the app renders, so it isn't left in the history entry.
      navigate("/", { replace: true });
      setUser(user);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (!link) {
    return <AuthCard title="Set your password">{error ? <p className={errorClass}>{error}</p> : <p className="text-sm text-gray-500">Checking your link…</p>}</AuthCard>;
  }

  return (
    <AuthCard title={link.purpose === "invite" ? "Welcome" : "Reset your password"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-500">
          {link.purpose === "invite" ? "Choose a password for" : "Choose a new password for"}{" "}
          <span className="font-medium text-gray-900 dark:text-gray-100">{link.email}</span>.
        </p>
        {/* Lets a password manager save the new password against the right account. */}
        <input type="email" autoComplete="username" value={link.email} readOnly hidden />
        <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
        {error && <p className={errorClass}>{error}</p>}
        <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>
          Save password and sign in
        </button>
      </form>
    </AuthCard>
  );
}
