/**
 * Everything the landing page says, and everywhere it links.
 *
 * The page is laid out on linear.app/homepage (2026-09-27): header, hero, logo row, the three
 * "FIG" cards, four feature sections, changelog, customer quotes, closing call to action and
 * footer. The words are BuildFlow's own; none of Linear's copy is reused.
 *
 * Every `hash` is a route in App.tsx's `welcomeRoutes`. tests/landing-page.test.tsx reads this
 * file and that table and fails on a link that goes nowhere, because a hash SPA gives no other
 * sign of one: the URL changes and the page stays put.
 */

/** A link to one of the marketing pages. */
export type LandingLink = { label: string; hash: string };

/** One column of a drawer category: a heading over its links. */
export type DrawerColumn = { title: string; links: LandingLink[] };

/** A category of the top drawer navigation: its button in the bar and its panel in the drawer. */
export type DrawerCategory = {
  /** The panel key (`data-menu` / `data-panel`). "menu" is reserved for the phone list. */
  id: string;
  label: string;
  /** Two or three columns, drawn left to right. */
  columns: DrawerColumn[];
};

/** A feature named in a section's "Features" row; clicking it opens its details sheet. */
export type LandingFeature = {
  name: string;
  summary: string;
  /** The line under the sheet's picture. */
  caption: string;
  details: Array<[label: string, value: string]>;
  /** Where "Learn more" in the sheet goes. */
  link: LandingLink;
};

/** How a section's picture is composed, after the reference's own compositions. */
export type LandingVisual = "board" | "timeline" | "agents" | "review";

export type LandingSection = {
  id: string;
  /** The heading, as its two lines. */
  title: [string, string];
  description: string;
  link: LandingLink;
  visual: LandingVisual;
  features: LandingFeature[];
};

/**
 * The Platform section's pictures, from how many features each category has: its clip
 * (`platform-<category>`, an .mp4 with a `-poster` first frame) and a still per feature
 * (`platform-<category>-<n>`, a .webp), all in client/public/landing/platform/.
 */
function platformMedia(features: Record<string, number>) {
  const media: Record<string, string> = {};
  for (const [id, count] of Object.entries(features)) {
    media[`platform-${id}`] = `/landing/platform/platform-${id}.mp4`;
    media[`platform-${id}-poster`] = `/landing/platform/platform-${id}-poster.jpg`;
    for (let n = 1; n <= count; n++) media[`platform-${id}-${n}`] = `/landing/platform/platform-${id}-${n}.webp`;
  }
  return media;
}

/**
 * The pictures and videos, by slot. An empty slot draws a blank white picture in its place.
 * To fill one, give its slot a path under `client/public` — an image, or an .mp4/.webm for a
 * video:
 *
 *     hero: "/landing/hero.png",
 *
 * The slots: hero · platform-<category>-<n> (the Platform section) · scheduling-board · scheduling-thread ·
 * field-timeline · field-chart · ai-1 … ai-4 · reports-list · reports-detail ·
 * quote-1-logo · quote-2-logo · and feature-<name> for each details sheet (e.g.
 * feature-crew-scheduling).
 */
export const LANDING_MEDIA: Partial<Record<string, string>> = {
  // A user working in the real program (2026-09-28): the demo workspace on a throwaway server,
  // driven by a script — the Schedule menu, a Kanban card dragged from Ready to In Progress, a
  // question to BuildFlow AI, home again — and recorded from Chrome at 1760×960 (the frame's 11:6),
  // 26.6s, looping. The poster is its first frame, shown until it plays and to reduced motion.
  hero: "/landing/hero-demo.mp4",
  "hero-poster": "/landing/hero-demo-poster.jpg",
  // The Platform section (2026-09-28), from the same throwaway demo workspace (kit and how to redo
  // them: BuildFlow-PlatformMedia/): each category's clip is someone doing that part of the job in
  // the real program, ~10–20s, looping; each feature's picture is that screen at 2×.
  ...platformMedia({ plan: 4, field: 4, warn: 4, ai: 4, resources: 3, workspace: 4 })
};

/**
 * The top drawer navigation's categories (2026-09-27). Between them they reach every page the
 * site has, so the bar needs nothing else but Log in and the waitlist pill.
 */
export const DRAWER_CATEGORIES: DrawerCategory[] = [
  {
    id: "product",
    label: "Product",
    columns: [
      {
        title: "Product",
        links: [
          { label: "Crew Scheduling", hash: "#crew-scheduling" },
          { label: "Schedule AI", hash: "#schedule-ai" },
          { label: "Map & Field Ops", hash: "#map-field-ops" },
          { label: "Field Updates & DelayIQs", hash: "#field-updates-delayIQs" },
          { label: "Materials Readiness", hash: "#materials-readiness" },
          { label: "Equipment Tracking", hash: "#equipment-tracking" },
          { label: "Production Reports", hash: "#production-reports" }
        ]
      },
      {
        title: "Quick Links",
        links: [
          { label: "Product overview", hash: "#overview" },
          { label: "Integrations", hash: "#integrations" },
          { label: "BuildFlow for Mac", hash: "#mac" },
          { label: "Updates", hash: "#updates" }
        ]
      },
      {
        title: "Plans",
        links: [
          { label: "Free", hash: "#free-plan" },
          { label: "Pro", hash: "#pro-plan" },
          { label: "Business", hash: "#business-plan" },
          { label: "Enterprise", hash: "#enterprise-plan" },
          { label: "Compare plans", hash: "#compare-plans" }
        ]
      }
    ]
  },
  {
    id: "ai",
    label: "AI",
    columns: [
      {
        title: "Assistants",
        links: [
          { label: "BuildFlow AI", hash: "#buildflow-ai" },
          { label: "AI overview", hash: "#ai-overview" }
        ]
      },
      {
        title: "Automation",
        links: [
          { label: "Weather Integration", hash: "#weather-integration" },
          { label: "Schedule Suggestions", hash: "#schedule-suggestions" },
          { label: "Crew Suggestions", hash: "#crew-suggestions" },
          { label: "DelayIQ Detection", hash: "#delayIQ-detection" },
          { label: "Route Optimization", hash: "#route-optimization" }
        ]
      }
    ]
  },
  {
    id: "resources",
    label: "Resources",
    columns: [
      {
        title: "Resources",
        links: [
          { label: "Help Center", hash: "#help-center" },
          { label: "Customer Reviews", hash: "#customer-reviews" },
          { label: "Templates", hash: "#templates" },
          { label: "Updates", hash: "#updates" }
        ]
      },
      {
        title: "Solutions",
        links: [
          { label: "Scheduling", hash: "#solutions-schedule" },
          { label: "Field updates", hash: "#solutions-field-updates-delayIQs" },
          { label: "Map & field ops", hash: "#solutions-map-field-ops" },
          { label: "Reports", hash: "#solutions-reports" }
        ]
      },
      {
        title: "By company size",
        links: [
          { label: "Startups", hash: "#solutions-startups" },
          { label: "Small businesses", hash: "#solutions-small-businesses" },
          { label: "Enterprise", hash: "#solutions-enterprise" }
        ]
      }
    ]
  },
  {
    id: "company",
    label: "Company",
    columns: [
      {
        title: "Company",
        links: [
          { label: "About", hash: "#about" },
          { label: "Customers", hash: "#customers" },
          { label: "Careers", hash: "#careers" }
        ]
      },
      {
        title: "Connect",
        links: [
          { label: "Contact sales", hash: "#contact-sales" },
          { label: "Partners", hash: "#partners" },
          { label: "Security", hash: "#security" }
        ]
      }
    ]
  }
];

/** The pill at the end of the navigation bar (and its twin in the phone list): the BuildFlow for Mac download page. */
export const DOWNLOAD: LandingLink = { label: "Download", hash: "#mac" };

export const HERO = {
  title: ["The construction scheduling", "system for crews and the field"] as [string, string],
  sub: "One board for booking crews, planning jobs and keeping every site on schedule.",
  news: { tag: "New", label: "BuildFlow for Mac", hash: "#mac" }
};

export const LOGO_CAPTION = "Made for general contractors, specialty trades and field crews";

/** What the carousel above that caption lists (its accessible name): BuildFlow's own trade list. */
export const COMPANIES_LABEL = "Kinds of companies BuildFlow is made for";

/** The Platform section's opening statement: the lead in ink, the rest in grey. */
export const INTRO = {
  lead: "One schedule for the office and the field.",
  rest: "BuildFlow keeps every job, crew and delivery in step, so the plan made at 6 a.m. is the plan the field works all day."
};

/** One feature in the Platform section: a caption over a picture. */
export type PlatformFeature = { title: string; text: string };

/**
 * One of the Platform section's categories: its name in the side list, its statement, what its
 * clip shows (the video's accessible name) and its features.
 */
export type PlatformCategory = { id: string; nav: string; title: string; text: string; clip: string; features: PlatformFeature[] };

/**
 * The Platform section (2026-09-28, after Attio's): every feature BuildFlow has, in six categories.
 * Each category's clip is `platform-<category>` in LANDING_MEDIA, each feature's picture `platform-<category>-<n>`.
 */
export const PLATFORM: { eyebrow: string; categories: PlatformCategory[] } = {
  eyebrow: "Platform",
  categories: [
    {
      id: "plan",
      nav: "Plan the schedule",
      title: "Every crew on the right job.",
      text: "See the whole plan on one page, then open it the way you think about it: by day, by status or on a timeline.",
      clip: "On the Month calendar, a job is dragged two days later, then opened in its job panel",
      features: [
        { title: "Schedule overview.", text: "Status, alerts, crew availability and the jobs still to book, together on one page." },
        { title: "Month calendar.", text: "Every job on the month. Click an empty day to add work there, or drag a job to its new date." },
        { title: "Kanban by status.", text: "Planned, Ready, In Progress, Blocked, Complete. Move a card along and the job's status moves with it." },
        { title: "Gantt chart.", text: "Every job as a bar, grouped by project, with the critical path and a baseline to measure the plan against." }
      ]
    },
    {
      id: "field",
      nav: "Run the field",
      title: "Hear from the jobsite as it happens.",
      text: "Check-ins, photos and progress arrive the moment the crew posts them, on the job they belong to.",
      clip: "A field update posted with its percent complete, which then joins the Field Updates list",
      features: [
        { title: "Field updates.", text: "Crews check in with progress, photos and notes, straight from the site." },
        { title: "The job panel.", text: "Open any job for its crews, progress, materials and weather, and change its dates or status right there." },
        { title: "Time cards.", text: "Members put in their own hours. Owners and admins approve each person's week, or reopen it for a fix." },
        { title: "Progress that moves the plan.", text: "Report a percent complete and BuildFlow works out the new finish and the ripple, for you to accept or keep the plan." }
      ]
    },
    {
      id: "warn",
      nav: "Catch delays early",
      title: "Know before it slips.",
      text: "BuildFlow watches the plan, the weather and the field, and says what is at risk while there is still time to act.",
      clip: "WeatherIQ's week on the Dashboard, and two jobs' rain conflicts opened one after the other",
      features: [
        { title: "DelayIQ.", text: "Flags the jobs trending behind, early enough to do something about it." },
        { title: "WeatherIQ.", text: "Reads the forecast at every job's location and marks the outdoor work the weather will stop." },
        { title: "Schedule status.", text: "Ahead or behind, the forecast finish, and a snapshot of the plan every week to compare against." },
        { title: "Notifications.", text: "The changes that matter, by email and in the app, each one opening straight to its record." }
      ]
    },
    {
      id: "ai",
      nav: "Work with AI",
      title: "An assistant that asks first.",
      text: "Ask about the schedule in plain language. Every change it suggests arrives as a proposal you accept, edit or reject.",
      clip: "A photo of a printed schedule given to BuildFlow AI, which reads it and proposes an import that is then accepted",
      features: [
        { title: "BuildFlow AI.", text: "Answers from your own jobs, crews and materials, not from guesses." },
        { title: "Optimize my week.", text: "Ask for suggestions and it reads your delays, crews and materials, and says what to tackle first." },
        { title: "Crew capacity.", text: "Ask who is stretched and who has room, worked out from the week's bookings." },
        { title: "Import from anywhere.", text: "A photo of a printed schedule, a Primavera P6 file or Microsoft Project XML, turned into projects and jobs." }
      ]
    },
    {
      id: "resources",
      nav: "Materials & equipment",
      title: "Nothing shows up late.",
      text: "Every delivery and every machine in one list, so the office can see what is ready and what still needs chasing.",
      clip: "The Inventory list shown as materials, as items needing attention and as equipment, then searched",
      features: [
        { title: "Materials readiness.", text: "Quantity, delivery date, project and status for every material line." },
        { title: "Equipment tracking.", text: "What is free to send, what is in use and what is in the shop." },
        { title: "Production reports.", text: "Schedule movement, backlog and utilization for the weekly review, ready to export." }
      ]
    },
    {
      id: "workspace",
      nav: "Make it yours",
      title: "Built around your trade.",
      text: "BuildFlow sets itself up for the work you do and fits the way your team already works.",
      clip: "Trades picked one after another at signup, with the workspace preview beside them",
      features: [
        { title: "Trade profiles.", text: "Fourteen trades, from asphalt to painting, each with its own crews, phases and readiness checks." },
        { title: "A dashboard you arrange.", text: "Add, move and reset its sections until the morning view is yours." },
        { title: "Workspaces and roles.", text: "One login for every company you work with, with Owner, Admin and Member access." },
        { title: "Calendars and the Mac.", text: "Google and Microsoft calendars beside the schedule, and your notifications in the Mac's notch." }
      ]
    }
  ]
};

export const FEATURE_SECTIONS: LandingSection[] = [
  {
    id: "scheduling",
    title: ["Scheduling", "and dispatch"],
    description:
      "Book crews to jobs on one live board. Match work to capacity, trade and location, and catch double-bookings before the plan goes out.",
    link: { label: "Learn more", hash: "#crew-scheduling" },
    visual: "board",
    features: [
      {
        name: "Crew Scheduling",
        summary:
          "Plan the whole week on one board: crews down the side, days across the top, and every job where it belongs. Drag a job to another crew or day and the plan updates for everyone.",
        caption: "Crew board, week view",
        details: [
          ["Views", "Week board, Month, Kanban and Gantt"],
          ["Checks", "Double-bookings and crew capacity"],
          ["Moves", "Drag a job to another crew or day"]
        ],
        link: { label: "Crew Scheduling", hash: "#crew-scheduling" }
      },
      {
        name: "Map & Field Ops",
        summary: "See crews, trucks and jobs on one live map, so dispatch knows who is closest before anyone gets a call.",
        caption: "Live map",
        details: [
          ["Shows", "Crews, trucks and job sites"],
          ["Helps with", "Dispatch, routes and site access"]
        ],
        link: { label: "Map & Field Ops", hash: "#map-field-ops" }
      },
      {
        name: "Time Cards",
        summary:
          "Members put in their own hours for the week. Owners and admins review each person’s time, then approve it or reopen it for a fix.",
        caption: "Team’s time, this week",
        details: [
          ["Entered by", "Each member, for their own week"],
          ["Approved by", "Owners and admins, person by person"],
          ["Available", "As a plan add-on"]
        ],
        link: { label: "Plans", hash: "#compare-plans" }
      },
      {
        name: "Month calendar",
        summary: "Every job on a month you can drag across. Click an empty day to add work, or drag a job to its new date.",
        caption: "Month view",
        details: [
          ["Adds", "Click any day to add a job"],
          ["Moves", "Drag a job to a new date"]
        ],
        link: { label: "Crew Scheduling", hash: "#crew-scheduling" }
      }
    ]
  },
  {
    id: "field",
    title: ["Field updates", "and delays"],
    description:
      "Check-ins, jobsite photos and delay causes arrive the moment they happen, while the office still has time to adjust the plan.",
    link: { label: "Learn more", hash: "#field-updates-delayIQs" },
    visual: "timeline",
    features: [
      {
        name: "Field Updates",
        summary: "Crews check in from the jobsite with progress, photos and notes, and each update lands on the job it belongs to.",
        caption: "Field feed, today",
        details: [
          ["Captures", "Check-ins, progress, photos and notes"],
          ["Lands on", "The job’s own record"]
        ],
        link: { label: "Field Updates & DelayIQs", hash: "#field-updates-delayIQs" }
      },
      {
        name: "DelayIQ",
        summary: "Watches progress against the plan and flags the jobs trending behind, early enough to do something about it.",
        caption: "Early warning",
        details: [
          ["Watches", "Progress against the schedule"],
          ["Flags", "Jobs trending behind"]
        ],
        link: { label: "DelayIQ Detection", hash: "#delayIQ-detection" }
      },
      {
        name: "WeatherIQ",
        summary: "Reads the forecast for every job’s location and warns you when rain, wind or cold will clash with outdoor work.",
        caption: "Forecast conflicts",
        details: [
          ["Reads", "The forecast at each job’s location"],
          ["Flags", "Weather that clashes with outdoor work"],
          ["Records", "Weather call-offs on every schedule view"]
        ],
        link: { label: "Weather Integration", hash: "#weather-integration" }
      },
      {
        name: "Notifications",
        summary:
          "Hear about the changes that matter by email, and open any notification straight to its record. On a Mac, they drop down from the notch.",
        caption: "Notifications",
        details: [
          ["Email", "The changes that affect your jobs"],
          ["In the app", "Each notification opens its record"],
          ["On a Mac", "The same notifications in the notch"]
        ],
        link: { label: "BuildFlow for Mac", hash: "#mac" }
      }
    ]
  },
  {
    id: "ai",
    title: ["AI and", "automations"],
    description:
      "Ask BuildFlow to draft the week, move a crew or explain a slip. Every change arrives as a proposal you accept, edit or reject.",
    link: { label: "Learn more", hash: "#buildflow-ai" },
    visual: "agents",
    features: [
      {
        name: "BuildFlow AI",
        summary:
          "Ask about your schedule in plain language. When it suggests a change you see it as a redline first, then accept, edit or reject it.",
        caption: "A proposed change",
        details: [
          ["Asks first", "Every change waits for your answer"],
          ["Knows", "Your jobs, crews and schedule"]
        ],
        link: { label: "BuildFlow AI", hash: "#buildflow-ai" }
      },
      {
        name: "Schedule Suggestions",
        summary:
          "A first draft of the week that reads crew capacity, job readiness and the weather, then suggests the moves that keep the plan intact.",
        caption: "Suggested moves",
        details: [
          ["Reads", "Capacity, readiness and weather"],
          ["Suggests", "Moves that keep the plan intact"]
        ],
        link: { label: "Schedule Suggestions", hash: "#schedule-suggestions" }
      },
      {
        name: "Crew Suggestions",
        summary: "Recommends the crew that fits each job by trade, capacity and location, so the best match is one click away.",
        caption: "Best-fit crews",
        details: [["Matches on", "Trade, capacity and location"]],
        link: { label: "Crew Suggestions", hash: "#crew-suggestions" }
      },
      {
        name: "Schedule import",
        summary:
          "Take a photo of a printed schedule, or bring in a Primavera P6 or Microsoft Project file, and BuildFlow turns it into projects and jobs.",
        caption: "Import",
        details: [
          ["From a photo", "A picture of a printed schedule"],
          ["From a file", "Primavera P6 (.xer) or Microsoft Project (XML)"]
        ],
        link: { label: "Schedule AI", hash: "#schedule-ai" }
      }
    ]
  },
  {
    id: "reports",
    title: ["Materials, equipment", "and reports"],
    description:
      "Know what’s been delivered, which machines are free to send and what the week actually cost, without chasing a spreadsheet.",
    link: { label: "Learn more", hash: "#production-reports" },
    visual: "review",
    features: [
      {
        name: "Materials Readiness",
        summary:
          "Every material line with its quantity, delivery date, project and status, so the office can see what’s ready and what still needs chasing.",
        caption: "Materials by status",
        details: [["Tracks", "Quantity, delivery date, project and status"]],
        link: { label: "Materials Readiness", hash: "#materials-readiness" }
      },
      {
        name: "Equipment Tracking",
        summary: "Every machine with its type, status and project, so you know what’s free to send and what’s in the shop.",
        caption: "Equipment by status",
        details: [["Tracks", "Type, status and project"]],
        link: { label: "Equipment Tracking", hash: "#equipment-tracking" }
      },
      {
        name: "Production Reports",
        summary: "Schedule movement, field updates, backlog and utilization in one workspace built for the weekly review.",
        caption: "Weekly review",
        details: [
          ["Reports on", "Schedule movement, backlog and utilization"],
          ["Keeps", "A snapshot of the schedule every week"]
        ],
        link: { label: "Production Reports", hash: "#production-reports" }
      },
      {
        name: "Integrations",
        summary: "Connect BuildFlow to the calendars and scheduling tools your office already uses.",
        caption: "Integrations",
        details: [
          ["Calendars", "Google Calendar and Microsoft 365"],
          ["Schedules", "Primavera P6 and Microsoft Project"]
        ],
        link: { label: "Integrations", hash: "#integrations" }
      }
    ]
  }
];

/**
 * The two quote cards. There are no customer quotes to show yet, so these say so plainly and
 * wait to be replaced — like the pictures, they are placeholders, not testimonials.
 */
export const QUOTES = [
  {
    quote: "A customer’s words go here: a line or two on what changed for their crews.",
    name: "Customer name",
    role: "Title, Company",
    slot: "quote-1-logo",
    tone: "soft" as const
  },
  {
    quote: "A second customer’s words go here.",
    name: "Customer name",
    role: "Title, Company",
    slot: "quote-2-logo",
    tone: "bright" as const
  }
];

export const CUSTOMERS = {
  text: "BuildFlow is made for general contractors and specialty trades, from a single crew to a regional builder.",
  link: { label: "Customer stories", hash: "#customers" }
};

export const CTA = {
  title: ["Plan the work.", "Work the plan."] as [string, string],
  primary: { label: "Join the waitlist", hash: "#waitlist" },
  secondary: { label: "Contact sales", hash: "#contact-sales" }
};

export const FOOTER_COLUMNS: Array<{ title: string; links: LandingLink[] }> = [
  {
    title: "Product",
    links: [
      { label: "Crew Scheduling", hash: "#crew-scheduling" },
      { label: "Schedule AI", hash: "#schedule-ai" },
      { label: "Map & Field Ops", hash: "#map-field-ops" },
      { label: "Field Updates", hash: "#field-updates-delayIQs" },
      { label: "Materials", hash: "#materials-readiness" },
      { label: "Equipment", hash: "#equipment-tracking" },
      { label: "Reports", hash: "#production-reports" }
    ]
  },
  {
    title: "AI",
    links: [
      { label: "BuildFlow AI", hash: "#buildflow-ai" },
      { label: "WeatherIQ", hash: "#weather-integration" },
      { label: "Schedule Suggestions", hash: "#schedule-suggestions" },
      { label: "Crew Suggestions", hash: "#crew-suggestions" },
      { label: "DelayIQ Detection", hash: "#delayIQ-detection" },
      { label: "Route Optimization", hash: "#route-optimization" }
    ]
  },
  {
    title: "Company",
    links: [
      { label: "About", hash: "#about" },
      { label: "Customers", hash: "#customers" },
      { label: "Careers", hash: "#careers" },
      { label: "Partners", hash: "#partners" },
      { label: "Contact sales", hash: "#contact-sales" }
    ]
  },
  {
    title: "Resources",
    links: [
      { label: "Updates", hash: "#updates" },
      { label: "Help Center", hash: "#help-center" },
      { label: "Customer Reviews", hash: "#customer-reviews" },
      { label: "Integrations", hash: "#integrations" },
      { label: "Templates", hash: "#templates" },
      { label: "BuildFlow for Mac", hash: "#mac" }
    ]
  },
  {
    title: "Plans",
    links: [
      { label: "Free", hash: "#free-plan" },
      { label: "Pro", hash: "#pro-plan" },
      { label: "Business", hash: "#business-plan" },
      { label: "Enterprise", hash: "#enterprise-plan" },
      { label: "Compare plans", hash: "#compare-plans" }
    ]
  }
];

export const LEGAL_LINKS: LandingLink[] = [
  { label: "Privacy", hash: "#privacy" },
  { label: "Terms", hash: "#terms" },
  { label: "Security", hash: "#security" }
];
