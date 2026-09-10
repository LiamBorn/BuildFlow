import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initAnalytics } from "./analytics";
import "./design-tokens.css"; // the redesign's scale: additive --bf-* tokens, read by everything, overridden by nothing
import "./styles.css";
import "./redesign.css";
import "./timecard.css";
import "./welcome-redesign.css";
import "./updates-redesign.css";
import "./updates-ascent.css";
import "./reviews-redesign.css";
import "./help-redesign.css";
import "./about-redesign.css";
import "./customers-redesign.css";
import "./careers-redesign.css";
import "./apply-redesign.css";
import "./weather-redesign.css";
import "./dashboard-redesign.css";
import "./projects-redesign.css";
import "./project-dialog-redesign.css";
import "./crews-redesign.css";
import "./equipment-redesign.css";
import "./materials-redesign.css";
import "./field-updates-redesign.css";
import "./delayIQs-redesign.css";
import "./sidebar-redesign.css";
import "./assistant-global.css";
import "./settings-redesign.css";
import "./field-variance.css";
import "./topbar-redesign.css";
import "./ai-film-redesign.css";
import "./crew-scheduling-redesign.css";
import "./glyph-portal.css";
import "./crew-scheduling-apple.css";
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
import "./delayiq.css";
import "./ai-overview-redesign.css";
import "./waitlist.css"; // waitlist (removable feature — safe to delete this line)
import "./hs-index.css"; // HubSpot-style index (list/table) pages
import "./hs-home.css"; // HubSpot "Home" treatment for the Dashboard
import "./hs-update-modal.css"; // "What's new" product-update modal shown on login
import "./hs-contacts.css"; // Sales hub → Contacts index + contact record panel
import "./hs-breeze.css"; // BuildFlow AI panel (HubSpot Breeze-style)
import "./schedule.css"; // the Schedule category: landing, six views, status band, dialogs, import, the ported Gantt
import "./schedule-phone.css"; // the Schedule category on phones: scrolling boards, stacked rows, touch
import "./expand-map.css"; // Map & Field Ops job-site cards (ported LocationMap)
import "./bookmarks-page.css"; // Bookmarks page (starred pages by category)
import "./quantum-cloud-loader.css"; // BuildFlow AI "thinking" particles (ported Quantum Cloud Loader)
import "./interactive-hover-links.css"; // landing side-menu section heads (ported 21st.dev interactive hover links)
import "./command-palette.css"; // the ⌘K palette (components/CommandPalette.tsx)
import "./app-shell-hubspot.css"; // HubSpot-style app shell (top bar + icon rail + flyouts) — loads last so it wins

initAnalytics();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
