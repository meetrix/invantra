import { inputClass } from "./ui";

interface MoneyInputProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  min?: number;
  step?: number;
  disabled?: boolean;
}

export function MoneyInput({ value, onChange, className = "", min, step = 0.01, disabled }: MoneyInputProps) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      disabled={disabled}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(e.target.valueAsNumber || 0)}
      className={`${inputClass} text-right tabular-nums ${className}`}
    />
  );
}
