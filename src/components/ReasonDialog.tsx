import { useState } from "react";
import { Modal } from "./Modal";
import { errorClass, inputClass, primaryButton, secondaryButton } from "./ui";

interface ReasonDialogProps {
  title: string;
  prompt: string;
  confirmLabel: string;
  /** Returns an error message to show, or nothing once it has gone through. */
  onConfirm: (reason: string) => Promise<string | void>;
  onClose: () => void;
}

/** Asks why before an action that undoes someone's approval or sends work back. */
export function ReasonDialog({ title, prompt, confirmLabel, onConfirm, onClose }: ReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const message = await onConfirm(reason.trim());
    if (message) {
      setError(message);
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="flex flex-col gap-2 text-sm">
          {prompt}
          <textarea
            autoFocus
            required
            rows={5}
            aria-label="Reason"
            className={inputClass}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {error && <p className={errorClass}>{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={busy || !reason.trim()} className={primaryButton}>
            {confirmLabel}
          </button>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
