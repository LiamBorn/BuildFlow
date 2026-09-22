/**
 * The right-hand preview: the actual product, in the card, with what is being typed on the
 * left written into the card's own chrome (2026-09-22; the pictures replaced a sketch the
 * same day — "the images included within the signup isn't from BuildFlow").
 *
 * THE PICTURES are captures of the running program in `public/onboarding/` — the Dashboard,
 * Projects, the Schedule's Month calendar and Reports — taken from the demo workspace at
 * 1440×900 (the Month at 1440×1300 so its calendar is in frame) with the shell at scale 1,
 * rasterised in the browser itself (modern-screenshot's foreignObject render, which is the
 * browser's own painter, not a re-implementation) and cut to the top-left slice the card
 * shows: 1338×1800 of the 2880×1800 capture, resized to 880×1184 — twice the card's largest
 * size, so they are crisp on a retina display. The Dashboard's greeting was captured as
 * "Good morning" without the demo user's name: a stranger's name in a signup preview reads
 * as a bug. Recapture when the product's look changes; a picture of the program is a claim
 * about it.
 *
 * WHAT STAYS LIVE. The reference redraws its card from what is typed, and that is kept where
 * it is honest: the Dashboard's account row carries the name and initials as they are typed
 * (step 1), and from step 2 the card wears a header — the business's initial and name, then
 * the trade, the team and the revenue as chips — over the page for that step.
 *
 * The frame's gradient is the page's colour: rose while it is about the person, mint once it
 * is about the business, peach for the size questions. Measured off the recording
 * (px.swift, frame column x=850): rose #fde9ee → #fceddc → #fce1d1 → #fdc0de, mint #ddfad6 →
 * #e8f5d2 → #f4e4d1 → #dabedc, peach #fdebda → #f9e3ef → #c9d0f5. A gradient cannot
 * transition, so the old one is kept underneath for one beat and fades out; the pictures
 * cross-fade the same way, all four mounted and one of them showing.
 *
 * The frame swaps BEFORE the form leaves: on the recording the preview already shows the
 * next step's card while the outgoing form is still fading (frames 36.52–36.64). So this
 * takes the step the flow is GOING TO, not the one it is on.
 */
import { useEffect, useRef, useState } from "react";
import {
  BrickWall,
  Building2,
  Construction,
  Droplets,
  Fan,
  Hammer,
  HardHat,
  Layers,
  Paintbrush,
  Shovel,
  Trees,
  Users,
  Warehouse,
  Wrench,
  Zap
} from "lucide-react";
import type { TradeIcon, TradeProfile, TradeTone } from "@buildflow/shared";
import { DUR, ms } from "../motion/tokens";

/** The same lucide glyph per trade that the app's own trade picker and banner use. */
export const TRADE_ICONS: Record<TradeIcon, typeof Hammer> = {
  road: Construction,
  concrete: Layers,
  roof: Warehouse,
  gc: HardHat,
  excavation: Shovel,
  utilities: Droplets,
  framing: Hammer,
  electrical: Zap,
  plumbing: Wrench,
  hvac: Fan,
  masonry: BrickWall,
  drywall: Building2,
  landscaping: Trees,
  painting: Paintbrush
};

/**
 * The trade's tint on a selected tile and its chip in the preview. No blue anywhere
 * (skin §46): the two cool tones go to plum, the product's information colour.
 */
export const toneColor = (tone: TradeTone): string =>
  ({ blue: "#7a3d8a", violet: "#a0367a", green: "#1b7f3b", teal: "#0f766e", orange: "#c2410c" })[tone];

export type PreviewStep = 1 | 2 | 3 | 4;
/** How many invitees the tray lists before it says "+N more" — four fit under the Projects page. */
const TRAY_ROWS = 4;
type Gradient = "rose" | "mint" | "peach";
const GRADIENT: Record<PreviewStep, Gradient> = { 1: "rose", 2: "mint", 3: "mint", 4: "peach" };

/** The page each step shows: the home for the person, then the business's projects, the trade's calendar, the numbers. */
export const PREVIEW_SHOTS: Record<PreviewStep, { src: string; page: string }> = {
  1: { src: "/onboarding/dashboard.jpg", page: "Dashboard" },
  2: { src: "/onboarding/projects.jpg", page: "Projects" },
  3: { src: "/onboarding/schedule-month.jpg", page: "Schedule — Month" },
  4: { src: "/onboarding/reports.jpg", page: "Reports" }
};

export function OnboardingPreview({
  step,
  firstName,
  lastName,
  businessName,
  trade,
  revenueLabel,
  teamLabel,
  signingInAs,
  invites
}: {
  step: PreviewStep;
  firstName: string;
  lastName: string;
  businessName: string;
  trade: TradeProfile | null;
  revenueLabel: string | null;
  teamLabel: string | null;
  /** Signing IN rather than up: the address typed so far goes in the account row, since the
      name is not known yet and inventing one from the local part would be a small lie. */
  signingInAs?: string;
  /** The people being invited, as their addresses are typed — a tray at the card's foot. */
  invites?: Array<{ email: string; level: string }>;
}) {
  const variant = GRADIENT[step];
  /* The gradient it is leaving, kept underneath while the new one fades over it. A counter
     keys it, not Date.now(): the test clock is frozen, and a frozen nonce fires once. */
  const [old, setOld] = useState<{ variant: Gradient; key: number } | null>(null);
  const shown = useRef(variant);
  const swaps = useRef(0);
  useEffect(() => {
    if (shown.current === variant) return;
    const previous = shown.current;
    shown.current = variant;
    swaps.current += 1;
    setOld({ variant: previous, key: swaps.current });
    const timer = window.setTimeout(() => setOld(null), ms(DUR.slow));
    return () => window.clearTimeout(timer);
  }, [variant]);

  const typedName = `${firstName} ${lastName}`.trim();
  const name = signingInAs === undefined ? typedName : signingInAs;
  const initials =
    signingInAs === undefined
      ? `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase()
      : signingInAs.charAt(0).toUpperCase();
  const emptyName = signingInAs === undefined ? "Your name" : "Your workspace";
  const business = businessName.trim();
  const Icon = trade ? TRADE_ICONS[trade.icon] : null;

  return (
    <div className="onb-frame" data-variant={variant} data-step={step}>
      {old && <div key={old.key} className="onb-frame-old" data-variant={old.variant} aria-hidden="true" />}
      <div className="onb-mock" aria-hidden="true">
        <div className="onb-shot-wrap">
          {step >= 2 && (
            <div className="onb-mock-head">
              <span className={`onb-mock-tile${business ? "" : " is-empty"}`}>{business.charAt(0).toUpperCase() || "B"}</span>
              <span className={`onb-mock-name${business ? "" : " is-empty"}`}>{business || "Your business"}</span>
              {step >= 3 && (
                <span className="onb-mock-chips">
                  <span
                    key={trade?.id ?? "none"}
                    className={`onb-mock-chip is-live${trade ? "" : " is-empty"}`}
                    style={trade ? { color: toneColor(trade.tone) } : undefined}
                  >
                    {Icon && <Icon />}
                    <span>{trade ? trade.label : "Your trade"}</span>
                  </span>
                  {step === 4 && teamLabel && (
                    <span className="onb-mock-chip">
                      <Users />
                      <span>{teamLabel === "Just me" ? "Just you" : `${teamLabel} people`}</span>
                    </span>
                  )}
                  {step === 4 && revenueLabel && (
                    <span className="onb-mock-chip">
                      <span>{revenueLabel}</span>
                    </span>
                  )}
                </span>
              )}
            </div>
          )}
          <div className="onb-shots">
            {(Object.keys(PREVIEW_SHOTS) as unknown as PreviewStep[]).map((key) => {
              const shot = PREVIEW_SHOTS[key];
              return (
                <img
                  key={shot.src}
                  className={`onb-shot${Number(key) === step ? " is-on" : ""}`}
                  src={shot.src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  data-page={shot.page}
                />
              );
            })}
          </div>
          {invites && invites.length > 0 && (
            <div className="onb-mock-invites">
              <span className="onb-mock-invites-head">Invited · {invites.length}</span>
              {invites.slice(0, TRAY_ROWS).map((invite, index) => (
                <span className="onb-mock-invite" key={`${index}-${invite.email}`}>
                  <span className="onb-mock-avatar">{invite.email.charAt(0).toUpperCase()}</span>
                  <b>{invite.email}</b>
                  <i>{invite.level}</i>
                </span>
              ))}
              {invites.length > TRAY_ROWS && <span className="onb-mock-invites-more">+{invites.length - TRAY_ROWS} more</span>}
            </div>
          )}
          {step === 1 && (
            <div className="onb-mock-user">
              <span className="onb-mock-avatar">{initials || "•"}</span>
              <span className="onb-mock-user-text">
                <b className={name ? undefined : "is-empty"}>{name || emptyName}</b>
                <i>{signingInAs === undefined ? "Owner" : "Signing in"}</i>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
