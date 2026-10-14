import { useState } from "react";
import { errorClass, inputClass, labelClass, primaryButton } from "../../components/ui";
import { errorMessage, login } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { AuthCard } from "./AuthCard";

export function LoginPage() {
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      // Setting the user swaps this page for the app at the address they asked for.
      setUser(await login(email, password));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Sign in">
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className={labelClass}>
          Email
          <input
            type="email"
            required
            autoFocus
            autoComplete="username"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className={labelClass}>
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className={errorClass}>{error}</p>}
        <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>
          Sign in
        </button>
        <p className="text-xs text-gray-500">Forgot your password? Ask an admin for a reset link.</p>
      </form>
    </AuthCard>
  );
}
