import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Lock, Mail } from "lucide-react";
import { BrandMark } from "./Brand";
import { useHudMotion } from "./hud-primitives";
import { BUILDFLOW_URL } from "./api";

// Demo login gate — matches BuildFlow's credential-free demo pattern. Any
// non-empty email + password unlocks the console; there is no real auth backend.
export function Login({ onAuthed }: { onAuthed: (email: string) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useHudMotion(rootRef);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Enter any email and password to continue.");
      return;
    }
    onAuthed(email.trim());
  };

  return (
    <div className="dash-rx admin-auth" ref={rootRef}>
      <div className="dx-bg" aria-hidden="true">
        <span className="dx-aurora dx-aurora-1" />
        <span className="dx-aurora dx-aurora-2" />
        <span className="dx-aurora dx-aurora-3" />
      </div>
      <div className="dx-cursor" aria-hidden="true" />

      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-brand">
            <BrandMark size={34} />
            <span>
              BuildFlow <em>Admin</em>
            </span>
          </div>
          <h1 className="auth-title">Sign in to the console</h1>
          <p className="auth-sub">Developer &amp; operator access to BuildFlow — revenue, growth, and platform health.</p>

          <form className="auth-form" onSubmit={submit}>
            <label className="auth-field">
              <span>Email</span>
              <div className="auth-input">
                <Mail size={16} />
                <input
                  type="email"
                  autoComplete="username"
                  placeholder="you@buildflow.io"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError("");
                  }}
                />
              </div>
            </label>
            <label className="auth-field">
              <span>Password</span>
              <div className="auth-input">
                <Lock size={16} />
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError("");
                  }}
                />
              </div>
            </label>

            {error && <p className="auth-error">{error}</p>}

            <button type="submit" className="auth-submit">
              Sign in
              <ArrowRight size={17} />
            </button>
          </form>

          <p className="auth-demo">
            Demo access — use <b>admin@buildflow.io</b> and any password.
          </p>
          <a className="auth-back" href={BUILDFLOW_URL} target="_blank" rel="noreferrer">
            ← Back to BuildFlow
          </a>
        </div>
        <p className="auth-foot">BuildFlow Admin · internal operator console</p>
      </div>
    </div>
  );
}
