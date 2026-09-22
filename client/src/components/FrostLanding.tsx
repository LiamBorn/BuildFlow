/**
 * The landing page — "Frost" hero rebuild (2026-09-16).
 * Ported from a Vite + Tailwind v4 + framer-motion one-shot prompt. Everything the
 * prompt styled inline is reproduced inline; the two Tailwind utilities it used
 * (`w-full min-h-screen`) and its `@layer base` rules are plain CSS in
 * src/frost-landing.css, because this app has no Tailwind and its preflight
 * would reset the rest of the product. What changed from the prompt on purpose:
 * the logo is BuildFlow's, the centered links are the five site categories, a
 * Login button joins the waitlist pill on the right, and the email pill posts to
 * the real waitlist endpoint instead of preventDefault-ing.
 */
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const ARROW_BG = "#4c1d95";
const avatars = [
  "linear-gradient(135deg, #f0abfc, #a855f7)",
  "linear-gradient(135deg, #fda4af, #e11d48)",
  "linear-gradient(135deg, #fcd34d, #f59e0b)"
];
/** The five site categories, names only — their pages are gone. */
const NAV_LINKS = ["Product", "Plans", "Resources", "Company", "AI"];

/** What each category's dropdown lists (the old mega-menu's entries, names only). */
const CATEGORY_MENUS: Record<string, Array<{ heading: string; items: string[] }>> = {
  Product: [
    {
      heading: "Products",
      items: [
        "Crew Scheduling",
        "Schedule AI",
        "Map & Field Ops",
        "Field Updates & DelayIQs",
        "Materials Readiness",
        "Equipment Tracking",
        "Production Reports"
      ]
    }
  ],
  Plans: [{ heading: "Plans", items: ["Free", "Pro", "Business", "Enterprise"] }],
  Resources: [{ heading: "Discover", items: ["Updates", "Customer Reviews", "Help Center", "Integrations"] }],
  Company: [
    { heading: "About", items: ["About BuildFlow", "Customers", "Careers"] },
    { heading: "Connect", items: ["Contact Sales", "Partner Program"] }
  ],
  AI: [
    { heading: "Assistants", items: ["BuildFlow AI"] },
    {
      heading: "Automation",
      items: ["Weather Integration", "Schedule Suggestions", "Crew Suggestions", "DelayIQ Detection", "Route Optimization"]
    }
  ]
};
/** Pointer must rest on a category name this long before its menu drops. */
const MENU_OPEN_DELAY = 80;
/** A hover-opened category menu closes this long after the pointer leaves it. */
const MENU_CLOSE_DELAY = 180;

export type FrostLandingProps = {
  logo: React.ReactNode;
  onLogin: () => void;
  onJoinWaitlist: () => void;
};

/** The black frame around the page while the drawer is open, in px per side. */
const FRAME_INSET = 12;
/** Pointer must rest on the right edge this long before the drawer opens. */
const HOVER_OPEN_DELAY = 140;
/** A hover-opened drawer closes this long after the pointer leaves it. */
const HOVER_CLOSE_DELAY = 260;

/** Per-character delay of the staggered label slide (the prompt's 0.01s). */
const STAGGER_DELAY = 0.01;

/**
 * The hover-animated label ("button-01"): on hover every `.span-text` slides up
 * 2em and its `text-shadow` copy, 2em below, takes its place inside the
 * clipping `.span-wrapper`. Pure CSS (frost-landing.css); `stagger` splits the
 * label into characters with a rising transition delay. A visually hidden copy
 * carries the accessible name, so the animated characters are aria-hidden.
 */
function SlideLabel({ text, stagger = false }: { text: string; stagger?: boolean }) {
  let charIndex = 0;
  return (
    <>
      <span className="frost-sr">{text}</span>
      <span className="frost-slide" aria-hidden="true">
        {stagger ? (
          text.split(/\s+/).map((word, wordIndex) => (
            <Fragment key={`${wordIndex}-${word}`}>
              {wordIndex > 0 ? <span className="word-space"> </span> : null}
              <span className="span-wrapper">
                {[...word].map((char, index) => (
                  <span
                    key={`${index}-${char}`}
                    className="span-text"
                    style={{ transitionDelay: `${charIndex++ * STAGGER_DELAY}s` }}
                  >
                    {char}
                  </span>
                ))}
              </span>
            </Fragment>
          ))
        ) : (
          <span className="span-wrapper">
            <span className="span-text">{text}</span>
          </span>
        )}
      </span>
    </>
  );
}

/** The accent the drawer's hover uses — the orange of the BuildFlow mark. */

type FrostNavbarProps = FrostLandingProps & {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Pointer arrives on / leaves the drawer panel (hover-open bookkeeping). */
  onDrawerEnter: () => void;
  onDrawerLeave: () => void;
  /** A category band opened or closed — the stage steps into its frame with it. */
  onBandChange: (open: boolean) => void;
};

function FrostNavbar({
  logo,
  onLogin,
  onJoinWaitlist,
  open,
  setOpen,
  onDrawerEnter,
  onDrawerLeave,
  onBandChange
}: FrostNavbarProps) {
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();

  // The category dropdowns: one open at a time, on hover (with a short intent
  // delay either way) or on click for keyboard and touch.
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const megaContent = useRef<HTMLDivElement>(null);
  // The band's height follows its content; its columns line up with the names.
  const [megaHeight, setMegaHeight] = useState(0);
  const [megaInset, setMegaInset] = useState({ left: 40, top: 84 });
  useLayoutEffect(() => {
    if (activeMenu === null) return;
    const measure = () => {
      const nav = navRef.current;
      const content = megaContent.current;
      if (!nav || !content) return;
      setMegaHeight(content.offsetHeight);
      const navBox = nav.getBoundingClientRect();
      const linksBox = linksRef.current?.getBoundingClientRect();
      setMegaInset({ left: linksBox ? linksBox.left - navBox.left : 40, top: nav.offsetHeight + 12 });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeMenu]);
  const menuTimer = useRef<number | null>(null);
  const clearMenuTimer = () => {
    if (menuTimer.current !== null) {
      window.clearTimeout(menuTimer.current);
      menuTimer.current = null;
    }
  };
  const hoverMenu = (label: string) => {
    clearMenuTimer();
    menuTimer.current = window.setTimeout(() => {
      menuTimer.current = null;
      setActiveMenu(label);
    }, MENU_OPEN_DELAY);
  };
  const leaveMenu = () => {
    clearMenuTimer();
    menuTimer.current = window.setTimeout(() => {
      menuTimer.current = null;
      setActiveMenu(null);
    }, MENU_CLOSE_DELAY);
  };
  const toggleMenu = (label: string) => {
    clearMenuTimer();
    setActiveMenu((current) => (current === label ? null : label));
  };
  useEffect(() => clearMenuTimer, []);
  useEffect(() => {
    if (activeMenu === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveMenu(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setActiveMenu(null);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [activeMenu]);
  // The drawer takes over: any open dropdown closes with it.
  useEffect(() => {
    if (open) setActiveMenu(null);
  }, [open]);
  useEffect(() => {
    onBandChange(activeMenu !== null);
  }, [activeMenu, onBandChange]);

  // Escape closes; the page behind cannot scroll while the drawer is open; focus
  // lands on the close control and returns to the Menu pill afterwards.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    closeButton.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      menuButton.current?.focus();
    };
  }, [open]);

  const slide = reduced ? { duration: 0 } : { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <>
    <motion.nav
      initial={{ opacity: 0, y: -14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      aria-label="Welcome"
      className="frost-nav"
      ref={navRef}
      onMouseLeave={activeMenu !== null ? leaveMenu : undefined}
    >
      {/* Page dim + the full-width band behind the bar (the reference recording):
          the band grows to its content's height under the names and the hero
          darkens beneath it. Both sit under the bar's own row (z-index). */}
      <motion.div
        className="frost-mega-dim"
        aria-hidden="true"
        initial={false}
        animate={{ opacity: activeMenu !== null ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : 0.4 }}
      />
      <motion.div
        className="frost-mega"
        aria-hidden={activeMenu === null}
        initial={false}
        animate={{ height: activeMenu !== null ? megaHeight : 0, opacity: activeMenu !== null ? 1 : 0 }}
        transition={reduced ? { duration: 0 } : { height: slide, opacity: { duration: 0.3 } }}
        style={{ pointerEvents: activeMenu !== null ? "auto" : "none" }}
      >
        <div
          ref={megaContent}
          className="frost-mega-content"
          style={{ paddingLeft: megaInset.left, paddingTop: megaInset.top }}
        >
          {activeMenu !== null ? (
            <motion.div
              key={activeMenu}
              id={`frost-menu-${activeMenu.toLowerCase()}`}
              className="frost-mega-columns"
              role="region"
              aria-label={`${activeMenu} menu`}
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              {CATEGORY_MENUS[activeMenu].map((column) => (
                <div key={column.heading} className="frost-mega-column">
                  <p className="frost-mega-heading">{column.heading}</p>
                  <ul className="frost-mega-list">
                    {column.items.map((item) => (
                      <li key={item}>
                        <button type="button" className="frost-mega-item" onClick={() => setActiveMenu(null)}>
                          {item}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </motion.div>
          ) : null}
        </div>
      </motion.div>
      {/* Logo */}
      <div className="frost-brand">
        {logo}
        <span className="frost-brand-name">BuildFlow</span>
      </div>

      {/* Centered category names */}
      <div className="frost-links" ref={linksRef} data-menu-open={activeMenu !== null}>
        {NAV_LINKS.map((label) => {
          const isOpen = activeMenu === label;
          return (
            <button
              key={label}
              type="button"
              className="frost-link button-01 ghost"
              aria-haspopup="true"
              aria-expanded={isOpen}
              aria-controls={`frost-menu-${label.toLowerCase()}`}
              onMouseEnter={() => hoverMenu(label)}
              onClick={() => toggleMenu(label)}
            >
              <SlideLabel text={label} stagger />
            </button>
          );
        })}
      </div>

      <div className="frost-nav-right">
      {/* CTA + Login (hidden on narrow windows — the drawer carries them) */}
      <div className="frost-nav-actions">
        <button
          type="button"
          className="frost-join button-01"
          onClick={onJoinWaitlist}
          aria-label="Join the waitlist from welcome navigation"
        >
          <SlideLabel text="Join the Waitlist" />
        </button>
        <button type="button" className="frost-login button-01 ghost" onClick={onLogin} aria-label="Login from welcome navigation">
          <SlideLabel text="Log in" />
        </button>
      </div>

      {/* The side drawer, at every width; on narrow windows it is all that is left of the bar. */}
      <button
        ref={menuButton}
        type="button"
        className="frost-menu-btn button-01"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="frost-drawer"
        aria-label="Open menu"
      >
        <SlideLabel text="Menu" />
        <span className="frost-menu-plus" aria-hidden="true">+</span>
      </button>
      </div>
    </motion.nav>

    {/* The drawer lives on <body>, outside the stage, so the page can shrink
        into its black frame behind it without taking the drawer along. */}
    {createPortal(
    <AnimatePresence>
      {open ? (
        <div key="drawer" className="frost-drawer-root">
          <motion.div
            className="frost-drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.35 }}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <motion.aside
            id="frost-drawer"
            onMouseEnter={onDrawerEnter}
            onMouseLeave={onDrawerLeave}
            className="frost-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={slide}
          >
            <button
              ref={closeButton}
              type="button"
              className="frost-drawer-close"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
            <p className="frost-drawer-label">Navigation</p>
            <nav aria-label="Categories">
              <ul className="frost-drawer-list">
                {NAV_LINKS.map((label, index) => (
                  <motion.li
                    key={label}
                    initial={reduced ? false : { opacity: 0, x: 18 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.45, delay: reduced ? 0 : 0.18 + index * 0.06, ease: "easeOut" }}
                  >
                    <button type="button" className="frost-drawer-link button-01 ghost" onClick={() => setOpen(false)}>
                      <span className="frost-drawer-dash" aria-hidden="true" />
                      <SlideLabel text={label} stagger />
                    </button>
                  </motion.li>
                ))}
              </ul>
            </nav>
            <div className="frost-drawer-rule" aria-hidden="true" />
            <motion.div
              className="frost-drawer-secondary"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: reduced ? 0 : 0.5 }}
            >
              <button
                type="button"
                className="button-01 ghost"
                onClick={() => {
                  setOpen(false);
                  onJoinWaitlist();
                }}
              >
                <SlideLabel text="Join the Waitlist" />
              </button>
              <button
                type="button"
                className="button-01 ghost"
                onClick={() => {
                  setOpen(false);
                  onLogin();
                }}
              >
                <SlideLabel text="Log in" />
              </button>
            </motion.div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
    )}
    </>
  );
}

function FrostHero() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "joined" | "error">("idle");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setState("error");
      return;
    }
    setState("sending");
    try {
      // The same endpoint the waitlist page posts to: it saves the signup and
      // sends the confirmation email. A 400 is the server rejecting the address.
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value })
      });
      if (response.status === 400) {
        setState("error");
        return;
      }
    } catch {
      // Backend unreachable — still confirm; the waitlist page does the same.
    }
    setState("joined");
  };

  return (
    <section style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden" }}>
      <video
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        src="/hero.mp4"
        autoPlay
        muted
        loop
        playsInline
      />
      {/* Overlays — opacity reduced by 70% */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.13)" }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.17) 0%, transparent 22%, transparent 60%, rgba(0,0,0,0.25) 100%)"
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "-14%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "1000px",
          height: "720px",
          background: "radial-gradient(ellipse at 50% 30%, rgba(165,180,252,0.05) 0%, transparent 68%)",
          pointerEvents: "none"
        }}
      />

      {/* Centered content */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "0 24px"
        }}
      >
        {/* Social-proof badge */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "5px 12px 5px 7px",
            borderRadius: "999px",
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.2)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            marginBottom: "20px"
          }}
        >
          <div style={{ display: "flex" }}>
            {avatars.map((bg, i) => (
              <span
                key={i}
                style={{
                  width: "17px",
                  height: "17px",
                  borderRadius: "999px",
                  background: bg,
                  border: "2px solid rgba(30,25,45,0.6)",
                  marginLeft: i === 0 ? 0 : "-6px"
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.9)", fontWeight: 400 }}>4,900+ people already on the waitlist</span>
        </motion.div>

        {/* Headline — heavy + thin contrast */}
        <motion.h1
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.85, delay: 0.22, ease: "easeOut" }}
          style={{ margin: 0, color: "#fff", textShadow: "0 2px 40px rgba(0,0,0,0.4)" }}
        >
          <span style={{ display: "block", fontWeight: 800, fontSize: "clamp(1.8rem, 4.95vw, 3.7rem)", lineHeight: 1, letterSpacing: "-0.035em" }}>
            Precision by Default.
          </span>
          <span style={{ display: "block", fontWeight: 200, fontSize: "clamp(1.95rem, 5.2vw, 3.9rem)", lineHeight: 1.08, letterSpacing: "-0.025em" }}>
            Clarity in Everything.
          </span>
        </motion.h1>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
          style={{
            margin: "18px 0 0",
            maxWidth: "400px",
            fontSize: "10.5px",
            lineHeight: 1.65,
            color: "rgba(255,255,255,0.72)",
            textShadow: "0 1px 16px rgba(0,0,0,0.4)"
          }}
        >
          A minimal, precise toolkit for teams who sweat the small stuff. Design, build, and ship with confidence &mdash; every detail
          accounted for, nothing left to chance.
        </motion.p>

        {/* Email capture */}
        <motion.form
          onSubmit={submit}
          aria-label="Join the waitlist"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.55, ease: "easeOut" }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            width: "min(350px, 94vw)",
            marginTop: "24px",
            padding: "5px 5px 5px 16px",
            borderRadius: "999px",
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.18)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            boxShadow: "0 16px 44px rgba(0,0,0,0.28)"
          }}
        >
          {state === "joined" ? (
            <span role="status" style={{ flex: 1, padding: "9px 0", fontSize: "10px", color: "#fff" }}>
              You&rsquo;re on the list &mdash; check your inbox.
            </span>
          ) : (
            <>
              <input
                className="frost-input"
                type="email"
                placeholder="Enter your email"
                aria-label="Email address"
                aria-invalid={state === "error" || undefined}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (state === "error") setState("idle");
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontSize: "10px",
                  color: state === "error" ? "#fecaca" : "#fff",
                  fontFamily: "'Inter', sans-serif"
                }}
              />
              <motion.button
                type="submit"
                disabled={state === "sending"}
                className="frost-submit button-01"
                style={{
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "5px 5px 5px 16px",
                  borderRadius: "999px",
                  border: "none",
                  cursor: "pointer"
                }}
              >
                <span className="frost-submit-label" style={{ fontSize: "9.5px", fontWeight: 600, color: "#14111f", whiteSpace: "nowrap" }}>
                  <SlideLabel text={state === "sending" ? "Joining…" : "Join the Waitlist"} />
                </span>
                <span
                  style={{
                    width: "25px",
                    height: "25px",
                    borderRadius: "999px",
                    background: ARROW_BG,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </motion.button>
            </>
          )}
        </motion.form>
      </div>

      {/* Footer strip */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.75, ease: "easeOut" }}
        style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10, padding: "20px 48px 26px" }}
      >
        <div style={{ height: "1px", width: "100%", background: "rgba(255,255,255,0.14)", marginBottom: "18px" }} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "32px",
            maxWidth: "1100px",
            margin: "0 auto",
            flexWrap: "wrap"
          }}
        >
          <p style={{ margin: 0, flex: 1, minWidth: "260px", textAlign: "center", fontSize: "12.5px", lineHeight: 1.6, color: "rgba(255,255,255,0.55)" }}>
            We believe great tools should feel invisible. Explore the ideas, details, and small decisions we&rsquo;ve obsessed over to help
            your team do its best work.
          </p>
          <a
            href="#learn"
            className="button-01 ghost"
            style={{ fontSize: "13px", fontWeight: 500, color: "rgba(255,255,255,0.85)", textDecoration: "none", whiteSpace: "nowrap" }}
          >
            <SlideLabel text="Learn more →" />
          </a>
        </div>
      </motion.div>
    </section>
  );
}

export default function FrostLanding(props: FrostLandingProps) {
  const [menuOpen, setMenuOpenState] = useState(false);
  // The category band frames the page exactly like the drawer does.
  const [bandOpen, setBandOpen] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const framed = menuOpen || bandOpen;

  // How the drawer was opened. A click keeps it open until it is dismissed; a
  // hover-open closes itself again once the pointer leaves the drawer.
  const openedBy = useRef<"click" | "hover" | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const clearHoverTimer = () => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };
  const setMenuOpen = (open: boolean) => {
    clearHoverTimer();
    openedBy.current = open ? "click" : null;
    setMenuOpenState(open);
  };
  // Resting the pointer on the right edge slides the drawer out after a short
  // intent delay, so a cursor merely passing the edge does not open it.
  const edgeEnter = () => {
    if (menuOpen) return;
    clearHoverTimer();
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      openedBy.current = "hover";
      setMenuOpenState(true);
    }, HOVER_OPEN_DELAY);
  };
  const scheduleHoverClose = () => {
    clearHoverTimer();
    if (openedBy.current !== "hover") return;
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      openedBy.current = null;
      setMenuOpenState(false);
    }, HOVER_CLOSE_DELAY);
  };
  const edgeLeave = () => {
    // Leaving the edge before the drawer opened cancels the open; leaving it
    // after a hover-open (without reaching the drawer) closes again.
    if (openedBy.current === "hover") scheduleHoverClose();
    else clearHoverTimer();
  };
  const drawerEnter = () => clearHoverTimer();
  useEffect(() => clearHoverTimer, []);

  // While the drawer is open the page steps back into a black frame (the
  // reference recording's inset): a 12px margin on every side, so the stage
  // scales by a different amount horizontally and vertically. The two factors
  // are recomputed on resize and read by frost-landing.css.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const fit = () => {
      const inset = FRAME_INSET * 2;
      el.style.setProperty("--frost-sx", String(Math.max(0.5, (window.innerWidth - inset) / window.innerWidth)));
      el.style.setProperty("--frost-sy", String(Math.max(0.5, (window.innerHeight - inset) / window.innerHeight)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <div className="frost-page">
      <div ref={stage} className={framed ? "frost-stage is-open" : "frost-stage"} data-testid="frost-stage">
        <FrostNavbar
          {...props}
          open={menuOpen}
          setOpen={setMenuOpen}
          onDrawerEnter={drawerEnter}
          onDrawerLeave={scheduleHoverClose}
          onBandChange={setBandOpen}
        />
        <FrostHero />
      </div>
      {/* Hover zone along the right edge of the window (mouse only; hidden on
          touch devices by frost-landing.css). Sits outside the stage so it
          stays on the viewport edge while the stage shrinks. */}
      <div
        className="frost-edge-zone"
        data-testid="frost-edge-zone"
        aria-hidden="true"
        onMouseEnter={edgeEnter}
        onMouseLeave={edgeLeave}
      />
    </div>
  );
}
