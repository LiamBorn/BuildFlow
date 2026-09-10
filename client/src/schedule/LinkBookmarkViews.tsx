/** The bookmarked views as the star menu and the Bookmarks page show them. */
import { Link2, Star } from "lucide-react";
import type { ScheduleLink } from "./linkBookmarks";

export function ScheduleLinkMenu({
  links,
  onOpen,
  onRemove
}: {
  links: ScheduleLink[];
  onOpen: (link: ScheduleLink) => void;
  onRemove: (link: ScheduleLink) => void;
}) {
  if (links.length === 0) return null;
  return (
    <>
      {links.map((link) => (
        <div key={link.hash} className="hs-bookmark-row">
          <button type="button" role="menuitem" className="hs-menu-item" onClick={() => onOpen(link)} title={link.detail}>
            <Link2 size={16} />
            <span>{link.label}</span>
            <em className="hs-bookmark-hub">{link.detail}</em>
          </button>
          <button
            type="button"
            className="hs-bookmark-remove"
            aria-label={`Remove ${link.label} from bookmarks`}
            title="Remove bookmark"
            onClick={() => onRemove(link)}
          >
            ×
          </button>
        </div>
      ))}
    </>
  );
}

export function ScheduleLinkTiles({
  links,
  onOpen,
  onRemove
}: {
  links: ScheduleLink[];
  onOpen: (link: ScheduleLink) => void;
  onRemove: (link: ScheduleLink) => void;
}) {
  if (links.length === 0) return null;
  return (
    <div className="bm-groups">
      <section className="bm-group" aria-label="Schedule views">
        <h2>
          <Link2 size={15} />
          Schedule views
        </h2>
        <div className="bm-tiles">
          {links.map((link) => (
            <div className="bm-tile is-starred" key={link.hash}>
              <button type="button" className="bm-tile-open" onClick={() => onOpen(link)} title={`Open ${link.label} · ${link.detail}`}>
                <span className="bm-tile-icon">
                  <Link2 size={17} />
                </span>
                <span className="bm-tile-label">
                  {link.label}
                  <small>{link.detail}</small>
                </span>
              </button>
              <button
                type="button"
                className="bm-tile-star is-on"
                aria-pressed="true"
                aria-label={`Remove ${link.label} from bookmarks`}
                title="Remove bookmark"
                onClick={() => onRemove(link)}
              >
                <Star size={15} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
