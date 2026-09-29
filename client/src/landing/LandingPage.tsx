/**
 * The landing page at `/` (2026-09-27): linear.app/homepage, rebuilt for BuildFlow in light mode.
 *
 * The Top Drawer Navigation (a frosted drawer of categories; a Menu list on phones), hero, logo
 * row, the Platform section (every feature, after Attio's), four feature sections whose "Features"
 * rows open a details sheet, the
 * changelog (the Updates page's newest entries), two quote cards, the closing call to action and
 * the footer. Every picture and video is a blank white placeholder until LANDING_MEDIA in
 * ./content.ts names a file for its slot.
 *
 * Styles: landing.css, scoped to `.lp`, and drawer-nav.css for the navigation.
 */
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject
} from "react";
import { createPortal } from "react-dom";
import { businessTypeOptions, tradeProfiles } from "@buildflow/shared";
import { Pause, Play } from "lucide-react";
import { TRADE_ICONS } from "../onboarding/OnboardingPreview";
import { GradientBackground } from "../components/ui/pipo";
import { navigation04 } from "./drawerNav";
import {
  COMPANIES_LABEL,
  CTA,
  CUSTOMERS,
  DRAWER_CATEGORIES,
  FEATURE_SECTIONS,
  FOOTER_COLUMNS,
  HERO,
  INTRO,
  LANDING_MEDIA,
  LEGAL_LINKS,
  LOGO_CAPTION,
  PLATFORM,
  QUOTES,
  DOWNLOAD,
  type LandingFeature,
  type LandingSection,
  type PlatformCategory
} from "./content";

/** One entry of the Updates page, as the changelog shows it. */
export type LandingUpdate = {
  /** The entry's anchor on the Updates page, e.g. `update-2026-09-08`. */
  anchor: string;
  title: string;
  summary: string;
  /** ISO date, e.g. `2026-09-08`. */
  dateTime: string;
};

export type LandingPageProps = {
  logo: ReactNode;
  onLogin: () => void;
  /** Open a marketing page by its hash — one of App.tsx's `welcomeRoutes`. */
  onNavigate: (hash: string) => void;
  /** The Updates page's newest entries, newest first. */
  updates: LandingUpdate[];
  /** Open the Updates page, at one entry when given its anchor. */
  onOpenUpdate: (anchor?: string) => void;
};

/** How long a closing menu, sheet or phone menu takes to fade before it unmounts (landing.css). */
const EXIT_MS = 180;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Keeps something mounted for its exit fade after `open` turns false.
 * `closing` is true for that last stretch, so the markup can say `data-state="closing"`.
 */
function usePresence(open: boolean) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), prefersReducedMotion() ? 0 : EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);
  return { mounted: open || mounted, closing: !open && mounted };
}

/** Stops the page scrolling behind a sheet or the phone menu while `locked`. */
function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}

/** A plain click that should stay in the page, rather than open a new tab or window. */
const isPlainClick = (event: MouseEvent) =>
  !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/**
 * A link to a marketing page. It is a real `<a href="#…">`, so it can be opened in a new tab or
 * copied, and a plain click navigates in place through `onNavigate` (which also scrolls the new
 * page to its top, as every other marketing link does).
 */
function PageLink({
  hash,
  onNavigate,
  onFollow,
  className,
  children,
  ...rest
}: {
  hash: string;
  onNavigate: (hash: string) => void;
  /** Runs before navigating, e.g. to close the menu the link sits in. */
  onFollow?: () => void;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <a
      {...rest}
      href={hash}
      className={className}
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        onFollow?.();
        onNavigate(hash);
      }}
    >
      {children}
    </a>
  );
}

function Arrow() {
  return (
    <span className="lp-arrow" aria-hidden="true">
      →
    </span>
  );
}

/**
 * A picture or video slot. With no file named for it in LANDING_MEDIA it is a blank white
 * picture; `data-slot` says which one, so it is easy to find when the real one arrives. Pictures
 * load as they come near the screen; only the hero's is `eager`.
 */
function Media({ slot, className = "", label = "", eager = false }: { slot: string; className?: string; label?: string; eager?: boolean }) {
  const src = LANDING_MEDIA[slot];
  const classes = `lp-media ${className}`.trim();
  if (!src) return <div className={`${classes} is-blank`} data-slot={slot} aria-hidden="true" />;
  if (isVideoFile(src)) {
    return <video className={classes} data-slot={slot} src={src} autoPlay muted loop playsInline aria-label={label || undefined} aria-hidden={label ? undefined : true} />;
  }
  return <img className={classes} data-slot={slot} src={src} alt={label} loading={eager ? undefined : "lazy"} decoding="async" />;
}

const isVideoFile = (src: string | undefined) => Boolean(src && /\.(mp4|webm)$/i.test(src));

/**
 * Plays a muted, looping video only while it is on screen: it starts once `playRatio` of it is
 * showing, from wherever it stands (its first frame, the first time), and stops again once it has
 * left the screen entirely. Anything that moves on its own this long needs a way to stop it
 * (WCAG 2.2.2), so `toggle` is the reader's pause button; and for someone who asked for reduced
 * motion it starts paused, showing its poster, until they play it.
 */
function useScreenPlayback(videoRef: RefObject<HTMLVideoElement | null>, playRatio: number, active: boolean) {
  // `wanted`: whether it should play (the reader's choice). `inView`: whether enough of it is showing.
  const [wanted, setWanted] = useState(() => !prefersReducedMotion());
  const wantedRef = useRef(wanted);
  const inView = useRef(false);
  wantedRef.current = wanted;

  useEffect(() => {
    const video = videoRef.current;
    if (!active || !video) return;
    const play = () => void video.play()?.catch?.(() => undefined);
    if (typeof IntersectionObserver === "undefined") {
      inView.current = true;
      if (wantedRef.current) play();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry.intersectionRatio >= playRatio) {
          inView.current = true;
          if (wantedRef.current && video.paused) play();
        } else if (!entry.isIntersecting) {
          inView.current = false;
          video.pause();
        }
      },
      { threshold: [0, playRatio] }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [videoRef, playRatio, active]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (wanted) video.pause();
    else if (inView.current) void video.play()?.catch?.(() => undefined);
    setWanted(!wanted);
  };
  return { wanted, toggle };
}

/** The pause / play button over a looping video. */
function PlaybackToggle({ className, label, wanted, onToggle }: { className: string; label: string; wanted: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={className} aria-label={label} aria-pressed={!wanted} onClick={onToggle}>
      {wanted ? <Pause aria-hidden="true" size={12} strokeWidth={2} /> : <Play aria-hidden="true" size={12} strokeWidth={2} />}
    </button>
  );
}

/** How much of the hero video must be on screen before it starts: where its fade-in has finished. */
const HERO_PLAY_RATIO = 0.45;

const HERO_LABEL =
  "A walk through BuildFlow: the Dashboard, a job dragged from Ready to In Progress on the Kanban, and BuildFlow AI answering which materials still need chasing";

/**
 * The hero's video of someone using BuildFlow (LANDING_MEDIA.hero). It plays muted and on a loop,
 * showing its poster (the first frame, so nothing flashes blank) until it is reached — so someone
 * who scrolls down to it sees the first clip from the beginning, as it fades in (landing.css,
 * lp-shot-in) — and a button in the frame's corner pauses it.
 */
function HeroShot() {
  const src = LANDING_MEDIA.hero;
  const isVideo = isVideoFile(src);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { wanted, toggle } = useScreenPlayback(videoRef, HERO_PLAY_RATIO, isVideo);

  if (!isVideo) return <Media slot="hero" className="lp-hero-shot" label={HERO_LABEL} eager />;
  return (
    <div className="lp-hero-video">
      <video
        ref={videoRef}
        className="lp-media lp-hero-shot"
        data-slot="hero"
        src={src}
        poster={LANDING_MEDIA["hero-poster"]}
        muted
        loop
        playsInline
        preload="auto"
        aria-label={HERO_LABEL}
      />
      <PlaybackToggle className="lp-hero-toggle" label="Pause the video" wanted={wanted} onToggle={toggle} />
    </div>
  );
}

/** A feature's slot name: `feature-` and its name in lowercase words joined by dashes. */
const featureSlot = (feature: LandingFeature) => `feature-${feature.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;

// ---------------------------------------------------------------------------------------------
// Header: the Top Drawer Navigation (2026-09-27)
// ---------------------------------------------------------------------------------------------

/** Where a category's columns start their stagger (drawer-nav.css): first, second, third. */
const GROUP_STEPS = [0, 1, 1.5];

const stagger = (row: number, reverseRow: number) => ({ "--row": row, "--reverse-row": reverseRow }) as CSSProperties;

/**
 * The bar and its drawer. The markup is the supplied Top Drawer Navigation's, filled from
 * DRAWER_CATEGORIES: a button per category in the bar (and again in the phone list), a panel per
 * category in the drawer, with the inline stagger indices the stylesheet reads — a heading on
 * row 0 with its link count as its reverse row, links from row 2 counting down to 0.
 *
 * `navigation04` (./drawerNav.ts) runs once on mount and owns every state change after that
 * (aria-expanded, inert, the panel classes, data-open / data-submenu / data-motion), so the
 * component never re-renders with different props: it is memoised on props that do not change.
 */
const DrawerNav = memo(function DrawerNav({ logo, onLogin, onNavigate }: Pick<LandingPageProps, "logo" | "onLogin" | "onNavigate">) {
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => (rootRef.current ? navigation04(rootRef.current) : undefined), []);

  const phoneRows = DRAWER_CATEGORIES.length + 2; // the categories, then Download and Log in
  return (
    <nav data-drawer-nav="" data-theme="light" aria-label="Main navigation" ref={rootRef}>
      <div className="bar">
        <div className="bar-content">
          <a
            className="lp-brand"
            href="/"
            aria-label="BuildFlow home"
            onClick={(event) => {
              if (!isPlainClick(event)) return;
              event.preventDefault();
              window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
            }}
          >
            {logo}
            <span className="lp-brand-name">BuildFlow</span>
          </a>
          <ul className="nav-list">
            {DRAWER_CATEGORIES.map((category) => (
              <li key={category.id}>
                <button
                  className="nav-item"
                  type="button"
                  data-menu={category.id}
                  aria-expanded="false"
                  aria-controls={`drawer-${category.id}`}
                >
                  {category.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="lp-drawer-actions">
            <button type="button" className="lp-drawer-login" onClick={onLogin} aria-label="Login from welcome navigation">
              Log in
            </button>
            <PageLink className="contact" hash={DOWNLOAD.hash} onNavigate={onNavigate}>
              {DOWNLOAD.label}
            </PageLink>
          </div>
          <button className="toggle" type="button" data-toggle="" aria-label="Open menu" aria-expanded="false" aria-controls="navigation-drawer">
            <span className="toggle-label">Menu</span>
            <span className="toggle-icon" aria-hidden="true">
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>

      <button className="back" type="button" data-back="" aria-label="Back to main menu" inert>
        <svg width="14" height="18" viewBox="0 0 16 20" fill="none" aria-hidden="true">
          <path d="m10 4-6 6 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="curtain" data-curtain="" aria-hidden="true" />

      <div className="drawer" id="navigation-drawer" data-drawer="" inert>
        <div className="sheet">
          <div className="panel menu-panel" id="drawer-menu" data-panel="menu" inert>
            <div className="content">
              <ul className="menu-list">
                {DRAWER_CATEGORIES.map((category, row) => (
                  <li key={category.id} style={stagger(row, phoneRows - 1 - row)}>
                    <button type="button" data-menu={category.id} aria-expanded="false" aria-controls={`drawer-${category.id}`}>
                      {category.label}
                      <svg width="12" height="20" viewBox="0 0 12 20" fill="none" aria-hidden="true">
                        <path d="m3 4 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </li>
                ))}
                <li style={stagger(phoneRows - 2, 1)}>
                  <PageLink hash={DOWNLOAD.hash} onNavigate={onNavigate}>
                    {DOWNLOAD.label}
                  </PageLink>
                </li>
                <li style={stagger(phoneRows - 1, 0)}>
                  <button type="button" onClick={onLogin}>
                    Log in
                  </button>
                </li>
              </ul>
            </div>
          </div>
          {DRAWER_CATEGORIES.map((category) => (
            <div
              className="panel"
              id={`drawer-${category.id}`}
              data-panel={category.id}
              role="region"
              aria-label={category.label}
              inert
              key={category.id}
            >
              <div className="content">
                {category.columns.map((column, index) => {
                  const headingId = `heading-${category.id}-${index}`;
                  const count = column.links.length;
                  return (
                    <section
                      className="group"
                      style={{ "--group-step": GROUP_STEPS[index] ?? GROUP_STEPS[GROUP_STEPS.length - 1] } as CSSProperties}
                      aria-labelledby={headingId}
                      key={column.title}
                    >
                      <h2 id={headingId} style={stagger(0, count)}>
                        {column.title}
                      </h2>
                      <ul>
                        {column.links.map((link, i) => (
                          <li key={link.hash + link.label} style={stagger(i + 2, count - 1 - i)}>
                            <PageLink hash={link.hash} onNavigate={onNavigate}>
                              {link.label}
                            </PageLink>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
});

// ---------------------------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------------------------

function Hero({ onNavigate }: { onNavigate: (hash: string) => void }) {
  return (
    <section className="lp-hero" aria-labelledby="lp-hero-title">
      <div className="lp-container">
        <h1 className="lp-hero-title" id="lp-hero-title">
          <span className="lp-hero-line" style={{ "--lp-d": "0ms" } as CSSProperties}>
            {HERO.title[0]}
          </span>{" "}
          <span className="lp-hero-line" style={{ "--lp-d": "90ms" } as CSSProperties}>
            {HERO.title[1]}
          </span>
        </h1>
        <div className="lp-hero-row lp-enter" style={{ "--lp-d": "220ms" } as CSSProperties}>
          <p className="lp-hero-sub">{HERO.sub}</p>
          <PageLink className="lp-news" hash={HERO.news.hash} onNavigate={onNavigate}>
            <span className="lp-news-tag">{HERO.news.tag}</span>
            <span className="lp-news-label">
              {HERO.news.label} <Arrow />
            </span>
          </PageLink>
        </div>
      </div>
      {/* The Dashboard, as a picture, on the "Pipo" gradient (components/ui/pipo.tsx) — set up
          like the reference's app window on its stage */}
      <div className="lp-hero-stage lp-enter" style={{ "--lp-d": "360ms" } as CSSProperties}>
        <GradientBackground className="lp-hero-gradient" />
        <HeroShot />
      </div>
    </section>
  );
}

/**
 * The companies BuildFlow is made for (2026-09-28): the fourteen kinds of construction business its
 * own signup offers (`businessTypeOptions`), each with the icon its trade picker draws. They are
 * the trades BuildFlow is built around, not customers — there are none to name yet.
 */
const COMPANIES = businessTypeOptions.map((id) => tradeProfiles[id]);

/**
 * Those companies in a slow carousel over the caption. The list is drawn twice and the track slides
 * one copy's width, so the loop never shows a seam; the second copy is aria-hidden. It pauses under
 * the pointer, and the button beside the caption stops it: anything that moves on its own for more
 * than five seconds needs a way to be stopped (WCAG 2.2.2). With reduced motion it stands still.
 */
function Logos() {
  const [paused, setPaused] = useState(false);
  const list = (copy: boolean) => (
    <ul className="lp-marquee-list" aria-label={copy ? undefined : COMPANIES_LABEL} aria-hidden={copy || undefined}>
      {COMPANIES.map((trade) => {
        const Icon = TRADE_ICONS[trade.icon];
        return (
          <li className="lp-company" key={trade.label}>
            <Icon aria-hidden="true" size={20} strokeWidth={1.75} />
            {trade.label}
          </li>
        );
      })}
    </ul>
  );
  return (
    <section className="lp-logos" aria-label="Who BuildFlow is for">
      <div className="lp-container">
        <div className="lp-marquee" data-paused={paused || undefined}>
          <div className="lp-marquee-track">
            {list(false)}
            {list(true)}
          </div>
        </div>
        <div className="lp-logo-foot">
          <p className="lp-caption">{LOGO_CAPTION}</p>
          <button
            type="button"
            className="lp-marquee-toggle"
            aria-label="Pause the company carousel"
            aria-pressed={paused}
            onClick={() => setPaused((now) => !now)}
          >
            {paused ? <Play aria-hidden="true" size={12} strokeWidth={2} /> : <Pause aria-hidden="true" size={12} strokeWidth={2} />}
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * Where a category counts as the one being read: a band a little above the middle of the screen.
 * The side list marks whichever category crosses it.
 */
const PLATFORM_SPY_MARGIN = "-40% 0px -55% 0px";

/** How much of a category's clip must be on screen before it plays: most of what its stage shows. */
const PLATFORM_PLAY_RATIO = 0.5;

/**
 * A category's clip of someone using that part of BuildFlow (`platform-<category>`): muted, looping,
 * on its poster until it is reached, and loaded only then (`preload="none"`: six clips must not all
 * download with the page). Its pause button sits in the stage's corner.
 */
function PlatformClip({ category }: { category: PlatformCategory }) {
  const slot = `platform-${category.id}`;
  const src = LANDING_MEDIA[slot];
  const isVideo = isVideoFile(src);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { wanted, toggle } = useScreenPlayback(videoRef, PLATFORM_PLAY_RATIO, isVideo);
  if (!isVideo) return <Media slot={slot} className="lp-plat-shot" label={category.clip} />;
  return (
    <>
      <video
        ref={videoRef}
        className="lp-media lp-plat-shot"
        data-slot={slot}
        src={src}
        poster={LANDING_MEDIA[`${slot}-poster`]}
        muted
        loop
        playsInline
        preload="none"
        aria-label={category.clip}
      />
      <PlaybackToggle className="lp-plat-toggle" label={`Pause the video: ${category.nav}`} wanted={wanted} onToggle={toggle} />
    </>
  );
}

/**
 * Every feature BuildFlow has (2026-09-28), laid out after Attio's Platform section: the statement,
 * then a list of the six categories that stays beside the reader and marks the one on screen, and
 * for each category its statement, a clip of it in use and its features, each a caption over a picture
 * of that screen (`platform-<category>` and `platform-<category>-<n>` in LANDING_MEDIA). Text and
 * pictures rise into place as they scroll in (landing.css, where the browser can drive that from
 * the scroll); the marker slides to the category being read.
 */
function Platform() {
  const { categories } = PLATFORM;
  const [active, setActive] = useState(categories[0].id);
  const listRef = useRef<HTMLOListElement>(null);
  const [marker, setMarker] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const crossing = entries.find((entry) => entry.isIntersecting);
        if (crossing) setActive(crossing.target.getAttribute("data-category") ?? categories[0].id);
      },
      { rootMargin: PLATFORM_SPY_MARGIN }
    );
    categories.forEach((category) => {
      const node = document.getElementById(`lp-plat-${category.id}`);
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [categories]);

  useLayoutEffect(() => {
    const item = listRef.current?.querySelector<HTMLElement>(`[data-category="${active}"]`);
    if (item) setMarker({ top: item.offsetTop, height: item.offsetHeight });
  }, [active]);

  const jumpTo = (id: string) => {
    const heading = document.getElementById(`lp-plat-${id}-title`);
    if (!heading) return;
    setActive(id);
    heading.focus({ preventScroll: true });
    heading.closest(".lp-plat-cat")?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  };

  return (
    <section className="lp-plat" aria-labelledby="lp-plat-title">
      <div className="lp-container">
        <div className="lp-plat-frame">
          <header className="lp-plat-head">
            <p className="lp-plat-eyebrow">{PLATFORM.eyebrow}</p>
            <h2 className="lp-plat-title lp-plat-reveal" id="lp-plat-title">
              <strong>{INTRO.lead}</strong> {INTRO.rest}
            </h2>
          </header>
          <div className="lp-plat-body">
            <nav className="lp-plat-nav" aria-label="Platform categories">
              <div className="lp-plat-nav-inner">
                {marker ? (
                  <span className="lp-plat-marker" aria-hidden="true" style={{ "--lp-mark-y": `${marker.top}px`, "--lp-mark-h": `${marker.height}px` } as CSSProperties} />
                ) : null}
                <ol className="lp-plat-nav-list" ref={listRef}>
                  {categories.map((category) => (
                    <li key={category.id} data-category={category.id}>
                      <button
                        type="button"
                        className="lp-plat-nav-item"
                        aria-current={active === category.id ? "true" : undefined}
                        onClick={() => jumpTo(category.id)}
                      >
                        {category.nav}
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            </nav>
            <div className="lp-plat-content">
              {categories.map((category) => (
                <section
                  className="lp-plat-cat"
                  id={`lp-plat-${category.id}`}
                  data-category={category.id}
                  aria-labelledby={`lp-plat-${category.id}-title`}
                  key={category.id}
                >
                  <div className="lp-plat-intro">
                    <p className="lp-caption lp-plat-kicker lp-plat-reveal">{category.nav}</p>
                    <h3 className="lp-plat-statement lp-plat-reveal" id={`lp-plat-${category.id}-title`} tabIndex={-1}>
                      <strong>{category.title}</strong> {category.text}
                    </h3>
                  </div>
                  <div className="lp-plat-stage is-lead">
                    <PlatformClip category={category} />
                  </div>
                  <div className="lp-plat-features">
                    {category.features.map((feature, index) => (
                      <article className="lp-plat-feature" key={feature.title}>
                        <div className="lp-plat-caption lp-plat-reveal">
                          <h4 className="lp-plat-feature-title">{feature.title}</h4>
                          <p className="lp-plat-feature-text">{feature.text}</p>
                        </div>
                        <div className="lp-plat-stage">
                          <Media slot={`platform-${category.id}-${index + 1}`} className="lp-plat-shot" />
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** A section's picture, composed of white placeholders the way the reference composes its own. */
function SectionVisual({ section }: { section: LandingSection }) {
  const s = section.id;
  switch (section.visual) {
    case "board":
      return (
        <div className="lp-visual lp-visual-board">
          <Media slot={`${s}-board`} className="lp-frame lp-frame-main" />
          <Media slot={`${s}-thread`} className="lp-frame lp-frame-float" />
        </div>
      );
    case "timeline":
      return (
        <div className="lp-visual lp-visual-timeline">
          <Media slot="field-timeline" className="lp-frame lp-frame-main" />
          <Media slot="field-chart" className="lp-frame lp-frame-float" />
        </div>
      );
    case "agents":
      return (
        <div className="lp-visual lp-visual-agents">
          {[1, 2, 3, 4].map((n) => (
            <Media key={n} slot={`ai-${n}`} className="lp-frame lp-frame-card" />
          ))}
        </div>
      );
    case "review":
      return (
        <div className="lp-visual lp-visual-review">
          <Media slot="reports-list" className="lp-frame lp-frame-main" />
          <Media slot="reports-detail" className="lp-frame lp-frame-float" />
        </div>
      );
  }
}

function FeatureSection({
  section,
  onNavigate,
  onOpenFeature
}: {
  section: LandingSection;
  onNavigate: (hash: string) => void;
  onOpenFeature: (feature: LandingFeature, from: HTMLElement) => void;
}) {
  const titleId = `lp-${section.id}-title`;
  const half = Math.ceil(section.features.length / 2);
  const featureColumns = [section.features.slice(0, half), section.features.slice(half)];
  return (
    <section className="lp-feature" id={`lp-${section.id}`} aria-labelledby={titleId}>
      <div className="lp-container">
        <div className="lp-feature-head">
          <h2 className="lp-feature-title" id={titleId}>
            <span>{section.title[0]}</span> <span>{section.title[1]}</span>
          </h2>
          <div className="lp-feature-copy">
            <p className="lp-feature-desc">{section.description}</p>
            <PageLink className="lp-more" hash={section.link.hash} onNavigate={onNavigate} aria-label={`${section.link.label}: ${section.title.join(" ")}`}>
              {section.link.label} <Arrow />
            </PageLink>
          </div>
        </div>
      </div>
      <div className="lp-bleed">
        <SectionVisual section={section} />
      </div>
      <div className="lp-container">
        <div className="lp-feature-foot">
          <p className="lp-feature-label">Features</p>
          <div className="lp-chips">
            {featureColumns.map((column, index) => (
              <ul className="lp-chip-col" key={index}>
                {column.map((feature) => (
                  <li key={feature.name}>
                    <button
                      type="button"
                      className="lp-chip"
                      aria-haspopup="dialog"
                      onClick={(event) => onOpenFeature(feature, event.currentTarget)}
                    >
                      {feature.name}
                      <span className="lp-chip-plus" aria-hidden="true">
                        +
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const shortDate = (dateTime: string) => {
  const date = new Date(`${dateTime}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateTime;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

function Changelog({ updates, onOpenUpdate }: { updates: LandingUpdate[]; onOpenUpdate: (anchor?: string) => void }) {
  if (updates.length === 0) return null;
  return (
    <section className="lp-changelog" aria-labelledby="lp-changelog-title">
      <div className="lp-container">
        <h2 className="lp-section-title" id="lp-changelog-title">
          Changelog
        </h2>
        <ol className="lp-log">
          {updates.slice(0, 4).map((update, index) => (
            <li className="lp-log-item" key={update.anchor} data-latest={index === 0 || undefined}>
              <span className="lp-log-dot" aria-hidden="true" />
              <a
                className="lp-log-link"
                href="#updates"
                onClick={(event) => {
                  if (!isPlainClick(event)) return;
                  event.preventDefault();
                  onOpenUpdate(update.anchor);
                }}
              >
                <span className="lp-log-title">{update.title}</span>
                <span className="lp-log-text">{update.summary}</span>
                <time className="lp-caption lp-log-date" dateTime={update.dateTime}>
                  {shortDate(update.dateTime)}
                </time>
              </a>
            </li>
          ))}
        </ol>
        <a
          className="lp-more lp-log-all"
          href="#updates"
          onClick={(event) => {
            if (!isPlainClick(event)) return;
            event.preventDefault();
            onOpenUpdate();
          }}
        >
          View all <Arrow />
        </a>
      </div>
    </section>
  );
}

function Quotes({ onNavigate }: { onNavigate: (hash: string) => void }) {
  return (
    <section className="lp-quotes" aria-label="Customers">
      <div className="lp-bleed">
        <div className="lp-quote-row">
          {QUOTES.map((q, index) => (
            <figure className={`lp-quote lp-quote-${q.tone}`} key={index}>
              <blockquote className="lp-quote-text">
                <p>“{q.quote}”</p>
              </blockquote>
              <figcaption className="lp-quote-by">
                <Media slot={q.slot} className="lp-quote-logo" />
                <span className="lp-quote-rule" aria-hidden="true" />
                <span className="lp-quote-who">
                  <span className="lp-quote-name">{q.name}</span>
                  <span className="lp-quote-role">{q.role}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
      <div className="lp-container">
        <div className="lp-customers">
          <p>{CUSTOMERS.text}</p>
          <PageLink className="lp-more" hash={CUSTOMERS.link.hash} onNavigate={onNavigate}>
            {CUSTOMERS.link.label} <Arrow />
          </PageLink>
        </div>
      </div>
    </section>
  );
}

function ClosingCta({ onNavigate }: { onNavigate: (hash: string) => void }) {
  return (
    <section className="lp-cta" aria-labelledby="lp-cta-title">
      <div className="lp-container">
        <h2 className="lp-cta-title" id="lp-cta-title">
          <span>{CTA.title[0]}</span> <span>{CTA.title[1]}</span>
        </h2>
        <div className="lp-cta-actions">
          <PageLink className="lp-pill lp-pill-lg" hash={CTA.primary.hash} onNavigate={onNavigate}>
            {CTA.primary.label}
          </PageLink>
          <PageLink className="lp-pill lp-pill-lg lp-pill-quiet" hash={CTA.secondary.hash} onNavigate={onNavigate}>
            {CTA.secondary.label}
          </PageLink>
        </div>
      </div>
    </section>
  );
}

function Footer({ logo, onNavigate }: { logo: ReactNode; onNavigate: (hash: string) => void }) {
  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <div className="lp-footer-grid">
          <div className="lp-footer-mark">{logo}</div>
          {FOOTER_COLUMNS.map((column) => (
            <nav className="lp-footer-col" key={column.title} aria-labelledby={`lp-footer-${column.title.toLowerCase()}`}>
              <h3 className="lp-footer-title" id={`lp-footer-${column.title.toLowerCase()}`}>
                {column.title}
              </h3>
              <ul>
                {column.links.map((link) => (
                  <li key={link.hash + link.label}>
                    <PageLink className="lp-footer-link" hash={link.hash} onNavigate={onNavigate}>
                      {link.label}
                    </PageLink>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <ul className="lp-legal">
          {LEGAL_LINKS.map((link) => (
            <li key={link.hash}>
              <PageLink className="lp-legal-link" hash={link.hash} onNavigate={onNavigate}>
                {link.label}
              </PageLink>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------------------------
// The details sheet a "Features" entry opens
// ---------------------------------------------------------------------------------------------

function FeatureSheet({
  feature,
  closing,
  onClose,
  onNavigate
}: {
  feature: LandingFeature;
  closing: boolean;
  onClose: () => void;
  onNavigate: (hash: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useLayoutEffect(() => {
    closeRef.current?.focus();
  }, [feature]);

  // Tab and Shift+Tab stay inside the sheet while it is open.
  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !panelRef.current) return;
    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="lp-portal lp-sheet-layer" data-state={closing ? "closing" : "open"}>
      <div className="lp-sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="lp-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
        onKeyDown={trapFocus}
      >
        <div className="lp-sheet-top">
          <span className="lp-caption">Feature</span>
          <button type="button" className="lp-sheet-close" ref={closeRef} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="lp-sheet-body">
          <h2 className="lp-sheet-title" id={titleId}>
            {feature.name}
          </h2>
          <p className="lp-sheet-summary">{feature.summary}</p>
          <figure className="lp-sheet-figure">
            <Media slot={featureSlot(feature)} className="lp-sheet-media" />
            <figcaption className="lp-caption">{feature.caption}</figcaption>
          </figure>
          <h3 className="lp-sheet-subtitle">Details</h3>
          <dl className="lp-sheet-table">
            {feature.details.map(([label, value]) => (
              <div className="lp-sheet-row" key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <PageLink
            className="lp-more lp-sheet-more"
            hash={feature.link.hash}
            onNavigate={onNavigate}
            onFollow={onClose}
          >
            Learn more about {feature.link.label} <Arrow />
          </PageLink>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------------------------

export default function LandingPage({ logo, onLogin, onNavigate, updates, onOpenUpdate }: LandingPageProps) {
  const [feature, setFeature] = useState<LandingFeature | null>(null);
  const shownFeature = useRef<LandingFeature | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const sheet = usePresence(feature !== null);
  useScrollLock(feature !== null);
  if (feature) shownFeature.current = feature;

  const closeSheet = useCallback(() => {
    setFeature(null);
    returnFocus.current?.focus();
  }, []);

  useEffect(() => {
    if (!feature) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeSheet();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [feature, closeSheet]);

  const openFeature = (next: LandingFeature, from: HTMLElement) => {
    returnFocus.current = from;
    setFeature(next);
  };

  return (
    <div className="lp">
      <a
        className="lp-skip"
        href="#lp-main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("lp-main")?.focus();
        }}
      >
        Skip to content
      </a>
      <DrawerNav logo={logo} onLogin={onLogin} onNavigate={onNavigate} />
      <main className="lp-main" id="lp-main" tabIndex={-1}>
        <Hero onNavigate={onNavigate} />
        <Logos />
        <Platform />
        {FEATURE_SECTIONS.map((section) => (
          <FeatureSection key={section.id} section={section} onNavigate={onNavigate} onOpenFeature={openFeature} />
        ))}
        <Changelog updates={updates} onOpenUpdate={onOpenUpdate} />
        <Quotes onNavigate={onNavigate} />
        <ClosingCta onNavigate={onNavigate} />
      </main>
      <Footer logo={logo} onNavigate={onNavigate} />
      {sheet.mounted && shownFeature.current && (
        <FeatureSheet feature={shownFeature.current} closing={sheet.closing} onClose={closeSheet} onNavigate={onNavigate} />
      )}
    </div>
  );
}
