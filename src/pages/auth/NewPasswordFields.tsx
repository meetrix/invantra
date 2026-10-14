import { useEffect, useRef } from "react";
import { inputClass, labelClass } from "../../components/ui";

// Kept in step with MIN_PASSWORD_LENGTH in server/src/auth.ts, which is what enforces it.
const MIN_LENGTH = 10;

interface NewPasswordFieldsProps {
  password: string;
  confirm: string;
  onPassword: (value: string) => void;
  onConfirm: (value: string) => void;
}

/** New password plus confirmation. The browser blocks the submit until both are valid and equal. */
export function NewPasswordFields({ password, confirm, onPassword, onConfirm }: NewPasswordFieldsProps) {
  const confirmInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    confirmInput.current?.setCustomValidity(confirm === password ? "" : "The passwords do not match.");
  }, [password, confirm]);

  return (
    <>
      <label className={labelClass}>
        New password
        <input
          type="password"
          required
          minLength={MIN_LENGTH}
          autoComplete="new-password"
          className={inputClass}
          value={password}
          onChange={(e) => onPassword(e.target.value)}
        />
        <span className="text-xs text-gray-500">At least {MIN_LENGTH} characters.</span>
      </label>
      <label className={labelClass}>
        Confirm new password
        <input
          type="password"
          required
          autoComplete="new-password"
          className={inputClass}
          value={confirm}
          ref={confirmInput}
          onChange={(e) => onConfirm(e.target.value)}
        />
      </label>
    </>
  );
}
