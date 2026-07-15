import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Design system, copied verbatim from the BuildFlow HUD so the panel is pixel-
// identical: dashboard-redesign (tokens + aurora + reveals + panels) → command
// -center (cc-* components) → admin-redesign (adm-* widgets). base/portal/login
// add the standalone shell + auth screen on top.
import "./styles/base.css";
import "./styles/dashboard-redesign.css";
import "./styles/command-center.css";
import "./styles/admin-redesign.css";
import "./styles/reference-layout.css";
import "./styles/portal.css";
import "./styles/login.css";
import { AdminApp } from "./AdminApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>
);
