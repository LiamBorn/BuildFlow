/**
 * The Dashboard banner's button, still life and quote — part of a TRIAL (2026-09-28).
 *
 * Asked for with a screenshot of an e-learning dashboard ("EduLearn"): "Redesign the dashboard as a
 * test". The reference's greeting sits in a pale periwinkle banner that holds a button carrying on
 * from where you left off ("Continue Learning →"), a soft 3D still life and a short quote on a
 * glass card. Here the button opens the Schedule, the still life is a hard hat on the plan binders
 * with a plant and the week on a laptop (public/dashboard/hero-site.svg), and the quote is the
 * planner's old rule. Skin §87 lays the three into the greeting's banner beside the text.
 *
 * TAKING THE TRIAL OUT: this file, its line in App.tsx's Dashboard header, the SVG, and skin §87.
 */
import { ArrowRight } from "lucide-react";

export function DashboardHeroArt({ onOpenSchedule }: { onOpenSchedule: () => void }) {
  return (
    <>
      <button type="button" className="hs-home-cta" onClick={onOpenSchedule}>
        Open the Schedule
        <ArrowRight size={16} aria-hidden="true" />
      </button>
      <img className="hs-home-art" src="/dashboard/hero-site.svg" alt="" width={360} height={210} decoding="async" />
      <figure className="hs-home-quote">
        <blockquote>&ldquo;Plan the work, then work the plan.&rdquo;</blockquote>
      </figure>
    </>
  );
}
