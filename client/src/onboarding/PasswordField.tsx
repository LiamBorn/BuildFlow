/**
 * The one password field the auth pages share (2026-09-22) — label, input, the reveal toggle,
 * and either its hint or its error underneath.
 *
 * All of that lives INSIDE the field, which is not a detail: the cascade wrapper keys its
 * children by position, so an error appearing as a new sibling would remount every element
 * below it and drop the cursor. See Beats.tsx.
 *
 * THE STRENGTH METER is shown where a password is being CHOSEN — resetting one, accepting an
 * invite — and not where one is merely being typed back in. It is the shared policy's own
 * reading (`passwordStrength`), not a second opinion about it.
 */
import { Eye, EyeOff } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { PasswordStrength } from "@buildflow/shared";

export function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  autoFocus,
  error,
  hint,
  strength,
  action
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: "current-password" | "new-password";
  autoFocus?: boolean;
  error?: string;
  hint?: string;
  /** Given, the meter is drawn once there is something to measure. */
  strength?: PasswordStrength;
  /** Something on the label's right — "Forgot password?" on the sign-in page. */
  action?: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="onb-field">
      {action ? (
        <div className="onb-label-row">
          <label htmlFor={id}>{label}</label>
          {action}
        </div>
      ) : (
        <label htmlFor={id}>{label}</label>
      )}
      <div className="onb-pw">
        <input
          id={id}
          className={`onb-input${error ? " is-invalid" : ""}`}
          type={shown ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          autoFocus={autoFocus}
        />
        <button
          type="button"
          className="onb-pw-eye"
          aria-label={shown ? "Hide password" : "Show password"}
          onClick={() => setShown((current) => !current)}
        >
          {shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
      {strength && value.length > 0 && (
        <div className="onb-strength" data-score={strength.score}>
          <div className="onb-strength-bar" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <p className="onb-strength-label" aria-live="polite">
            <span>Password strength</span>
            <b>{strength.label}</b>
          </p>
        </div>
      )}
      {error ? (
        <p className="onb-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="onb-hint">{hint}</p>
      ) : null}
    </div>
  );
}
