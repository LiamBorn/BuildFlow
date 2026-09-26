/**
 * BuildFlow for Mac (#mac): what the Mac app does, what it needs, and the download.
 *
 * The Download button reads /downloads/mac/latest.json, which mac/scripts/release.sh writes next to
 * the disk image and the Sparkle feed in server/downloads/mac/ (served by server/src/macDownloads.ts).
 * So the page never names a version itself: a release changes the button without touching the site.
 * Before the first release that file is not there (a 404), and the page says the download is on its
 * way instead of offering a link that goes nowhere.
 *
 * It says plainly that the app is not signed by Apple yet, and exactly how to open it anyway; that
 * section goes when release.sh starts signing with a Developer ID and notarizing.
 *
 * Built on the site's `.cs-page` / `.cpx-*` system (crew-scheduling-apple.css) like the Integrations
 * page, with its own `.mdl-*` pieces in mac-download.css. App.tsx routes #mac here and hands in the
 * site's shared footer.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CheckCircle2, Download, Inbox, Laptop, Mic, ShieldAlert, Sunrise } from "lucide-react";
import "./mac-download.css";

export const MAC_LATEST_URL = "/downloads/mac/latest.json";

/** One release, as latest.json describes it. */
export type MacRelease = {
  version: string;
  build: number;
  file: string;
  length: number;
  sha256: string;
  minimumSystemVersion: string;
  /** "universal" (Apple silicon and Intel) or "arm64" (Apple silicon only). */
  hardware: string;
};

const DMG_FILE = /^BuildFlow-\d+\.\d+\.\d+\.dmg$/;

/** latest.json, checked: anything malformed is treated as no release rather than a broken link. */
export function parseMacRelease(value: unknown): MacRelease | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version !== "string" || !/^\d+\.\d+\.\d+$/.test(v.version)) return null;
  if (typeof v.file !== "string" || !DMG_FILE.test(v.file)) return null;
  if (typeof v.length !== "number" || !(v.length > 0)) return null;
  return {
    version: v.version,
    build: typeof v.build === "number" ? v.build : 0,
    file: v.file,
    length: v.length,
    sha256: typeof v.sha256 === "string" && /^[0-9a-f]{64}$/.test(v.sha256) ? v.sha256 : "",
    minimumSystemVersion: typeof v.minimumSystemVersion === "string" ? v.minimumSystemVersion : "13.0",
    hardware: v.hardware === "arm64" ? "arm64" : "universal"
  };
}

/** "4.8 MB", the way Finder counts (1 MB = 1,000,000 bytes). */
export function formatDownloadSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

type LatestState = { kind: "loading" } | { kind: "ready"; release: MacRelease } | { kind: "none" } | { kind: "error" };

const FEATURES: Array<{ icon: typeof Inbox; title: string; text: string }> = [
  {
    icon: Sunrise,
    title: "A greeting",
    text: "Open the lid or unlock and the notch says good morning, by name, with one line about your day: jobs, the next meeting, rain at your sites."
  },
  {
    icon: Inbox,
    title: "Your inbox",
    text: "Press Control + Option (left side), or hover the notch: notifications, the week's jobs, today's meetings with a Join button, and what's waiting on you."
  },
  {
    icon: Mic,
    title: "Voice",
    text: "Hold Control + Option to talk, and ask about your schedule. The answer is spoken back, and nothing changes until you press Accept."
  }
];

export function MacDownloadPage({ footer }: { footer?: ReactNode }) {
  const rootRef = useRef<HTMLElement>(null);
  const [latest, setLatest] = useState<LatestState>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    fetch(MAC_LATEST_URL, { cache: "no-cache", headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (response.status === 404) return { kind: "none" } as const;
        if (!response.ok) return { kind: "error" } as const;
        const release = parseMacRelease(await response.json());
        return release ? ({ kind: "ready", release } as const) : ({ kind: "none" } as const);
      })
      .catch(() => ({ kind: "error" }) as const)
      .then((next) => {
        if (live) setLatest(next);
      });
    return () => {
      live = false;
    };
  }, []);

  // The site's scroll reveal, as on the other `.cpx-page` pages.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    root.querySelectorAll("[data-reveal]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const release = latest.kind === "ready" ? latest.release : null;
  const chips = release?.hardware === "arm64" ? "A Mac with Apple silicon" : "Apple silicon or Intel";

  return (
    <main className="cs-page cpx-page mdl-page" id="mac" ref={rootRef}>
      <div className="wx-bg" aria-hidden="true">
        <div className="wx-aurora wx-aurora-1" />
        <div className="wx-aurora wx-aurora-2" />
        <div className="wx-aurora wx-aurora-3" />
      </div>

      {/* 1 · The download */}
      <section className="cpx-section mdl-hero cpx-light" aria-labelledby="mdl-title" data-reveal>
        <div className="cpx-inner mdl-hero-grid">
          <div className="mdl-hero-copy">
            <span className="wx-eyebrow">
              <span className="wx-dot" /> BuildFlow for Mac
            </span>
            <h1 className="pov-title" id="mdl-title">
              Your day, in the notch.
            </h1>
            <p className="cpx-body mdl-lede">
              BuildFlow for Mac turns the notch at the top of your MacBook into a small BuildFlow window. It greets you, keeps your inbox
              one hover away, and answers when you ask it something.
            </p>
            <div className="mdl-download" aria-live="polite">
              {release ? (
                <>
                  <a className="wx-btn wx-btn-ink" href={`/downloads/mac/${encodeURIComponent(release.file)}`} download={release.file}>
                    <Download size={18} aria-hidden="true" /> Download for Mac
                  </a>
                  <p className="mdl-download-meta">
                    Version {release.version} · {formatDownloadSize(release.length)} · macOS{" "}
                    {release.minimumSystemVersion.replace(/\.0$/, "")} or later
                  </p>
                </>
              ) : (
                <>
                  <button type="button" className="wx-btn wx-btn-line" disabled>
                    <Download size={18} aria-hidden="true" />{" "}
                    {latest.kind === "loading" ? "Finding the latest version…" : "Download coming soon"}
                  </button>
                  {latest.kind === "none" && <p className="mdl-download-meta">The first release is on its way. Check back soon.</p>}
                  {latest.kind === "error" && (
                    <p className="mdl-download-meta">We couldn't reach the download just now. Reload the page to try again.</p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* The notch, drawn: example data, as on the plan's mock-up. */}
          <figure className="mdl-screen" aria-label="The BuildFlow notch, showing example data">
            <div className="mdl-menubar" aria-hidden="true">
              <span className="mdl-menubar-left">Finder&nbsp;&nbsp;File&nbsp;&nbsp;Edit&nbsp;&nbsp;View</span>
              <span className="mdl-menubar-right">Sat 8:12 AM</span>
            </div>
            <div className="mdl-notch" aria-hidden="true">
              <p className="mdl-hello">Good morning, Liam</p>
              <p className="mdl-day">3 jobs today · Standup at 9:30 · Rain after 2 PM</p>
              <ul className="mdl-rows">
                <li>
                  <span className="mdl-dot is-amber" /> Rebar delivery slipping 2 days <em>12m</em>
                </li>
                <li>
                  <span className="mdl-dot" /> Footings pour · Crew 2 <em>7:00</em>
                </li>
                <li>
                  <span className="mdl-dot is-green" /> Standup in 25 min <b>Join</b>
                </li>
              </ul>
            </div>
            <figcaption className="mdl-example">Example data</figcaption>
          </figure>
        </div>
      </section>

      {/* 2 · What it does */}
      <section className="cpx-section mdl-features cpx-paper-bg" aria-labelledby="mdl-features-title" data-reveal>
        <div className="cpx-inner">
          <div className="cpx-inner-narrow">
            <span className="wx-eyebrow-2">What it does</span>
            <h2 className="cpx-statement-sm" id="mdl-features-title">
              Three things, one glance away.
            </h2>
          </div>
          <div className="mdl-feature-grid">
            {FEATURES.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <article className="mdl-feature" key={feature.title} data-reveal style={{ "--i": index } as CSSProperties}>
                  <span className="mdl-feature-ic">
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </article>
              );
            })}
          </div>
          <p className="mdl-footnote mdl-keys">Press Control + Option (left side) to open BuildFlow in the notch. Hold them to talk.</p>
          <p className="mdl-footnote">
            Speech is turned into text on your Mac, so your voice never leaves it. The notch appears only in the downloaded app; a website
            can&rsquo;t draw over the menu bar.
          </p>
        </div>
      </section>

      {/* 3 · What it needs, and the first open */}
      <section className="cpx-section mdl-setup cpx-light" aria-labelledby="mdl-setup-title" data-reveal>
        <div className="cpx-inner">
          <div className="cpx-inner-narrow">
            <span className="wx-eyebrow-2">Before you install</span>
            <h2 className="cpx-statement-sm" id="mdl-setup-title">
              What you need, and how to open it.
            </h2>
          </div>
          <div className="mdl-setup-grid">
            <article className="mdl-card" aria-labelledby="mdl-req-title">
              <span className="mdl-feature-ic">
                <Laptop size={22} aria-hidden="true" />
              </span>
              <h3 id="mdl-req-title">Requirements</h3>
              <ul className="mdl-checks">
                <li>
                  <CheckCircle2 size={16} aria-hidden="true" /> macOS 13 Ventura or later
                </li>
                <li>
                  <CheckCircle2 size={16} aria-hidden="true" /> {chips}
                </li>
                <li>
                  <CheckCircle2 size={16} aria-hidden="true" /> A Mac with a notch works best. On other Macs, BuildFlow draws its own at the
                  top of the screen.
                </li>
                <li>
                  <CheckCircle2 size={16} aria-hidden="true" /> A BuildFlow account. The first time it opens, the app asks you to connect
                  it: sign in to BuildFlow in your browser and choose Connect this Mac. You can disconnect a Mac at any time in Settings ›
                  Devices.
                </li>
              </ul>
            </article>

            <article className="mdl-card mdl-first-open" aria-labelledby="mdl-open-title">
              <span className="mdl-feature-ic is-warn">
                <ShieldAlert size={22} aria-hidden="true" />
              </span>
              <h3 id="mdl-open-title">The first time you open it</h3>
              <p>
                BuildFlow for Mac isn&rsquo;t signed by Apple yet, so the first time you open it macOS says it can&rsquo;t check the app and
                won&rsquo;t open it. That&rsquo;s expected for now. To open it:
              </p>
              <ol className="mdl-steps">
                <li>Open the downloaded disk image and drag BuildFlow into Applications.</li>
                <li>
                  In Applications, Control-click (or right-click) BuildFlow, choose <b>Open</b>, then choose <b>Open</b> again.
                </li>
                <li>
                  No Open button? (macOS 15 and later.) Try to open BuildFlow once, then go to{" "}
                  <b>System Settings › Privacy &amp; Security</b>, find the message about BuildFlow under Security, click <b>Open Anyway</b>
                  , and confirm.
                </li>
              </ol>
              <p className="mdl-once">
                You only do this once: macOS remembers. When BuildFlow is signed and notarized by Apple, this step goes away.
              </p>
              {release?.sha256 && (
                <p className="mdl-sha">
                  To check your download, run <code>shasum -a 256 ~/Downloads/{release.file}</code> in Terminal. It should print{" "}
                  <code className="mdl-hash">{release.sha256}</code>
                </p>
              )}
            </article>
          </div>
        </div>
      </section>

      {footer}
    </main>
  );
}
