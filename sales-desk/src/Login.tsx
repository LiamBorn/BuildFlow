import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Lock, Mail, Briefcase, LifeBuoy } from "lucide-react";
import { BrandMark } from "./Brand";
import { useHudMotion } from "./hud-primitives";
import { BUILDFLOW_URL, type Department } from "./api";

// Sales and Customer Support each have their OWN login. The selector picks which
// account you're signing into; that account decides what work routes to you
// (Sales → leads & sales inquiries; Support → general help requests). Demo auth,
// so any password works — but the two departments are separate sign-ins.
const DEMO_EMAIL: Record<Department, string> = {
  sales: "sales@buildflow.io",
  support: "support@buildflow.io"
};
const isDemoEmail = (value: string) => value === DEMO_EMAIL.sales || value === DEMO_EMAIL.support;

export function Login({ onAuthed, initialDepartment }: { onAuthed: (email: string, department: Department) => void; initialDepartment: Department }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useHudMotion(rootRef);
  const [department, setDepartment] = useState<Department>(initialDepartment);
  const [email, setEmail] = useState(DEMO_EMAIL[initialDepartment]);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Switching the selector swaps to that department's account (unless the user
  // typed a custom email of their own).
  const pickDepartment = (dept: Department) => {
    setDepartment(dept);
    setError("");
    setEmail((cur) => (cur.trim() === "" || isDemoEmail(cur.trim()) ? DEMO_EMAIL[dept] : cur));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Enter an email and password to continue.");
      return;
    }
    onAuthed(email.trim(), department);
  };

  const deptLabel = department === "support" ? "Customer Support" : "Sales";

  return (
    <div className={`dash-rx admin-auth dept-${department}`} ref={rootRef}>
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
              BuildFlow <em>Sales &amp; Support</em>
            </span>
          </div>
          <h1 className="auth-title">Sign in to the desk</h1>
          <p className="auth-sub">Sales and Customer Support each have their own login — choose yours.</p>

          <div className="auth-dept" role="radiogroup" aria-label="Choose your login">
            <button
              type="button"
              role="radio"
              aria-checked={department === "sales"}
              className={`auth-dept-card ${department === "sales" ? "on" : ""}`}
              onClick={() => pickDepartment("sales")}
            >
              <Briefcase size={18} />
              <b>Sales</b>
              <i>Leads &amp; sales inquiries</i>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={department === "support"}
              className={`auth-dept-card ${department === "support" ? "on" : ""}`}
              onClick={() => pickDepartment("support")}
            >
              <LifeBuoy size={18} />
              <b>Customer Support</b>
              <i>General help requests</i>
            </button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            <label className="auth-field">
              <span>{deptLabel} email</span>
              <div className="auth-input">
                <Mail size={16} />
                <input
                  type="email"
                  autoComplete="username"
                  placeholder={DEMO_EMAIL[department]}
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
              Sign in to {deptLabel}
              <ArrowRight size={17} />
            </button>
          </form>

          <p className="auth-demo">
            Demo {deptLabel} login — use <b>{DEMO_EMAIL[department]}</b> and any password.
          </p>
          <a className="auth-back" href={BUILDFLOW_URL} target="_blank" rel="noreferrer">
            ← Back to BuildFlow
          </a>
        </div>
        <p className="auth-foot">BuildFlow Sales &amp; Support Desk · internal team console</p>
      </div>
    </div>
  );
}
