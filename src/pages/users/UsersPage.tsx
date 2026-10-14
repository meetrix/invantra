import { useRef, useState } from "react";
import { ROLE_LABELS, ROLES } from "../../../shared/permissions";
import type { Role, User } from "../../../shared/types";
import { LoadState } from "../../components/LoadState";
import { PageHeader } from "../../components/PageHeader";
import {
  cardBodyClass,
  cardClass,
  errorClass,
  inputClass,
  labelClass,
  primaryButton,
  smallButton,
  tableHeadClass,
  tableRowClass,
} from "../../components/ui";
import { createUser, createUserLink, errorMessage, listUsers, updateUser } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useLoad } from "../../lib/useLoad";

const ROLE_HELP: Record<Role, string> = {
  admin: "Everything, including approving documents, managing users and settings.",
  member: "Create and edit customers, items, estimates and invoices; record payments.",
  viewer: "Read and print only.",
};

interface IssuedLink {
  email: string;
  url: string;
  /** "invite" for a user who has not chosen a password yet. */
  kind: "invite" | "reset";
}

export function UsersPage() {
  const { user: me } = useAuth();
  const { data: users, error: loadError, reload } = useLoad(listUsers, []);
  const [error, setError] = useState("");
  const [link, setLink] = useState<IssuedLink | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [busy, setBusy] = useState(false);

  if (!users) return <LoadState error={loadError} />;

  /** Runs a change, then refreshes the list; failures land in the page's error line. */
  async function change(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  const showLink = (user: { email: string; hasPassword: boolean }, linkPath: string) =>
    setLink({ email: user.email, url: window.location.origin + linkPath, kind: user.hasPassword ? "reset" : "invite" });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    change(async () => {
      const created = await createUser({ email, name, role });
      showLink(created.user, created.linkPath);
      setEmail("");
      setName("");
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Users" subtitle="Who can sign in, and what each of them may do" />

      {link && <LinkBox link={link} onClose={() => setLink(null)} />}
      {error && <p className={errorClass}>{error}</p>}

      <div className={`${cardClass} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr className={`${tableHeadClass} text-left`}>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                isMe={user.id === me?.id}
                busy={busy}
                onRole={(next) => change(() => updateUser(user.id, { role: next }))}
                onDisabled={(disabled) => change(() => updateUser(user.id, { disabled }))}
                onLink={() => change(async () => showLink(user, await createUserLink(user.id)))}
              />
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={handleAdd} className={`${cardClass} ${cardBodyClass} max-w-2xl space-y-3`}>
        <h2 className="text-sm font-medium text-gray-500">Add a user</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className={labelClass}>
            Email
            <input type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className={labelClass}>
            Name
            <input required className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className={labelClass}>
            Role
            <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-gray-500">{ROLE_HELP[role]}</p>
        <button type="submit" disabled={busy} className={primaryButton}>
          Add user and get invite link
        </button>
        <p className="text-xs text-gray-500">
          No email is sent. You get a one-time link to pass on; the user opens it and chooses their own password.
        </p>
      </form>
    </div>
  );
}

function UserRow({
  user,
  isMe,
  busy,
  onRole,
  onDisabled,
  onLink,
}: {
  user: User;
  isMe: boolean;
  busy: boolean;
  onRole: (role: Role) => void;
  onDisabled: (disabled: boolean) => void;
  onLink: () => void;
}) {
  const status = user.disabled ? "Disabled" : user.hasPassword ? "Active" : "Invited";
  return (
    <tr className={`${tableRowClass} ${user.disabled ? "text-gray-400" : ""}`}>
      <td className="px-4 py-3">
        <p className="font-medium">
          {user.name || "—"} {isMe && <span className="text-xs font-normal text-gray-400">(you)</span>}
        </p>
        <p className="text-gray-500">{user.email}</p>
      </td>
      <td className="px-4 py-3">
        <select
          aria-label={`Role for ${user.email}`}
          // Changing your own role could leave no admin, so the server refuses it too.
          disabled={busy || isMe}
          className={inputClass}
          value={user.role}
          onChange={(e) => onRole(e.target.value as Role)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">{status}</td>
      <td className="px-4 py-3">
        {!isMe && (
          <div className="flex justify-end gap-2">
            {!user.disabled && (
              <button type="button" disabled={busy} onClick={onLink} className={smallButton}>
                {user.hasPassword ? "Reset link" : "New invite link"}
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => onDisabled(!user.disabled)} className={smallButton}>
              {user.disabled ? "Enable" : "Disable"}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

/** Shows a freshly issued link once; it cannot be fetched again, only replaced. */
function LinkBox({ link, onClose }: { link: IssuedLink; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    input.current?.select();
    try {
      // The clipboard API only exists on HTTPS and localhost; the selection-based copy works anywhere.
      if (navigator.clipboard) await navigator.clipboard.writeText(link.url);
      else document.execCommand("copy");
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-blue-300 bg-blue-50 p-4 text-sm dark:border-blue-900 dark:bg-blue-950">
      <p>
        {link.kind === "invite" ? "Invite link" : "Password reset link"} for <span className="font-medium">{link.email}</span>. Send
        it to them yourself. It works once and expires in {link.kind === "invite" ? "7 days" : "24 hours"}; it will not be shown again.
      </p>
      <div className="flex gap-2">
        <input
          ref={input}
          readOnly
          aria-label="One-time link"
          value={link.url}
          onFocus={(e) => e.target.select()}
          className={`${inputClass} min-w-0 flex-1 bg-white font-mono text-xs`}
        />
        <button type="button" onClick={copy} className={smallButton}>
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" onClick={onClose} className={smallButton}>
          Done
        </button>
      </div>
    </div>
  );
}
