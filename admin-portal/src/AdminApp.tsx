import { useEffect, useState } from "react";
import { ExternalLink, LogOut } from "lucide-react";
import { BrandMark } from "./Brand";
import { Login } from "./Login";
import { DeveloperAdminPanel } from "./DeveloperAdminPanel";
import { fetchPlatformMetrics, BUILDFLOW_URL, type MetricsState } from "./api";

const AUTH_KEY = "bf-admin-portal-auth";

export function AdminApp() {
  const [email, setEmail] = useState<string | null>(() => localStorage.getItem(AUTH_KEY));
  const [metrics, setMetrics] = useState<MetricsState>({ status: "loading" });
  // Bumped to re-run the fetch after the operator supplies an ops token.
  const [reloads, setReloads] = useState(0);

  // Once signed in, pull real platform counts from the BuildFlow backend. There is no
  // fallback: if this fails, the panel shows that it failed instead of a stand-in number.
  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    setMetrics({ status: "loading" });
    fetchPlatformMetrics().then((result) => {
      if (!cancelled) setMetrics(result);
    });
    return () => {
      cancelled = true;
    };
  }, [email, reloads]);

  const signIn = (value: string) => {
    localStorage.setItem(AUTH_KEY, value);
    setEmail(value);
  };
  const signOut = () => {
    localStorage.removeItem(AUTH_KEY);
    setEmail(null);
    setMetrics({ status: "loading" });
  };
  const openBuildFlow = () => window.open(BUILDFLOW_URL, "_blank", "noopener");

  if (!email) {
    return <Login onAuthed={signIn} />;
  }

  const initials =
    email
      .replace(/@.*/, "")
      .split(/[.\-_]/)
      .map((part) => part.charAt(0).toUpperCase())
      .join("")
      .slice(0, 2) || "AD";

  return (
    <div className="portal">
      <header className="portal-top">
        <div className="portal-brand">
          <BrandMark size={28} />
          <span>
            BuildFlow <em>Admin</em>
          </span>
        </div>
        <span
          className={`portal-linkstate ${
            metrics.status === "live" ? "on" : metrics.status === "loading" ? "wait" : "off"
          }`}
        >
          <i />
          {metrics.status === "live"
            ? "Linked to BuildFlow"
            : metrics.status === "loading"
              ? "Reading platform counts…"
              : "Platform counts unavailable"}
        </span>
        <div className="portal-spacer" />
        <button type="button" className="portal-open" onClick={openBuildFlow}>
          <ExternalLink size={15} />
          Open BuildFlow
        </button>
        <div className="portal-user">
          <span className="portal-avatar">{initials}</span>
          <span className="portal-email">{email}</span>
        </div>
        <button type="button" className="portal-signout" onClick={signOut} title="Sign out">
          <LogOut size={16} />
        </button>
      </header>

      <main className="portal-main">
        <DeveloperAdminPanel
          metrics={metrics}
          onOpenBuildFlow={openBuildFlow}
          onRetryMetrics={() => setReloads((n) => n + 1)}
        />
      </main>
    </div>
  );
}
