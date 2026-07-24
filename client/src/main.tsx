import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initAnalytics } from "./analytics";
import "./styles.css";
import "./schedule-account-overrides.css";
import "./schedule-job-overrides.css";
import "./redesign.css";
import "./timecard.css";
import "./welcome-redesign.css";
import "./updates-redesign.css";
import "./reviews-redesign.css";
import "./help-redesign.css";
import "./about-redesign.css";
import "./customers-redesign.css";
import "./careers-redesign.css";
import "./apply-redesign.css";
import "./weather-redesign.css";
import "./dashboard-redesign.css";
import "./schedule-redesign.css";
import "./projects-redesign.css";
import "./equipment-redesign.css";
import "./materials-redesign.css";
import "./field-updates-redesign.css";
import "./delayIQs-redesign.css";
import "./sidebar-redesign.css";
import "./hud-redesign.css";
import "./assistant-global.css";
import "./command-center.css";
import "./settings-redesign.css";
import "./schedule-calendar.css";
import "./schedule-views.css";
import "./field-variance.css";
import "./topbar-redesign.css";
import "./ai-film-redesign.css";
import "./crew-scheduling-redesign.css";
import "./account-redesign.css";
import "./compare-plans-redesign.css";
import "./contact-sales-redesign.css";
import "./legal-redesign.css";
import "./templates-partners-redesign.css";
import "./integrations-redesign.css";
import "./map-field-ops-redesign.css";
import "./field-updates-delayIQs-redesign.css";
import "./materials-readiness-redesign.css";
import "./equipment-tracking-redesign.css";
import "./production-reports-redesign.css";
import "./schedule-import.css";
import "./delayiq.css";
import "./waitlist.css"; // waitlist (removable feature — safe to delete this line)

initAnalytics();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
