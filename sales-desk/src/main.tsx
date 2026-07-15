import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Design system, copied verbatim from the BuildFlow HUD so the desk is pixel-
// identical: dashboard-redesign (tokens + aurora + reveals) → command-center
// (--cc-* tokens). login + sales-desk add the standalone shell, auth screen,
// and the Sales-Point console layout on top — same --wx-*/--cc-* tokens + the
// same motion hooks (data-reveal / dx-tilt / aurora), so every tween matches.
import "./styles/base.css";
import "./styles/dashboard-redesign.css";
import "./styles/command-center.css";
import "./styles/login.css";
import "./styles/sales-desk.css";
import { SalesApp } from "./SalesApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SalesApp />
  </StrictMode>
);
