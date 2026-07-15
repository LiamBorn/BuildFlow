import { useEffect, useState } from "react";
import { ExternalLink, LogOut } from "lucide-react";
import { BrandMark } from "./Brand";
import { Login } from "./Login";
import { DeveloperAdminPanel } from "./DeveloperAdminPanel";
import { fetchBuildFlowData, BUILDFLOW_URL, type BootstrapData } from "./api";

const AUTH_KEY = "bf-admin-portal-auth";
const EMPTY: BootstrapData = { projects: [], jobs: [], crews: [], equipment: [], materials: [] };

export function AdminApp() {
  const [email, setEmail] = useState<string | null>(() => localStorage.getItem(AUTH_KEY));
  const [data, setData] = useState<BootstrapData>(EMPTY);
  const [live, setLive] = useState(false);

  // Once signed in, pull live object counts from the BuildFlow backend.
  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    fetchBuildFlowData().then((result) => {
      if (cancelled) return;
      setData(result.data);
      setLive(result.live);
    });
    return () => {
      cancelled = true;
    };
  }, [email]);

  const signIn = (value: string) => {
    localStorage.setItem(AUTH_KEY, value);
    setEmail(value);
  };
  const signOut = () => {
    localStorage.removeItem(AUTH_KEY);
    setEmail(null);
    setData(EMPTY);
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
        <span className={`portal-linkstate ${live ? "on" : "off"}`}>
          <i />
          {live ? "Linked to BuildFlow" : "BuildFlow offline — sample data"}
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
        <DeveloperAdminPanel data={data} onOpenBuildFlow={openBuildFlow} />
      </main>
    </div>
  );
}
