import { useEffect, useState } from 'react';

/**
 * Two-step button. Forge runs Custom UI in a sandboxed frame where window.confirm() is unavailable,
 * so destructive actions ask for a second click in place.
 */
export function ConfirmButton({ label, confirmLabel, onConfirm, disabled, className = 'btn btn-ghost' }: { label: string; confirmLabel: string; onConfirm: () => void; disabled?: boolean; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(t);
  }, [armed]);
  if (!armed)
    return (
      <button className={className} disabled={disabled} onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  return (
    <span className="confirm" role="group" aria-label={confirmLabel}>
      <button
        className="btn btn-danger"
        disabled={disabled}
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button className="btn btn-ghost" onClick={() => setArmed(false)}>
        Cancel
      </button>
    </span>
  );
}
