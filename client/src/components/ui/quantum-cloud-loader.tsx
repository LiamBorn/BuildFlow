/**
 * Quantum Cloud Loader — the 21st.dev component ported to plain CSS
 * (quantum-cloud-loader.css): four glowing particles on long, smooth orbits at
 * different speeds, so they seem to interact. Shown in the BuildFlow AI thread
 * while a reply is being generated. Decorative: the caller keeps the text that
 * screen readers announce.
 */
export type CloudLoaderProps = {
  /** Shorter stage for inline use, such as inside a chat bubble. */
  compact?: boolean;
  className?: string;
};

export default function CloudLoader({ compact = false, className }: CloudLoaderProps) {
  const classes = ["qc-loader", compact ? "is-compact" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <div className={classes} aria-hidden="true">
      <div className="qc-stage">
        {/* red — fast inner particle */}
        <div className="qc-particle qc-red">
          <div className="qc-dot" />
        </div>
        {/* blue — large outer particle */}
        <div className="qc-particle qc-blue">
          <div className="qc-dot" />
        </div>
        {/* yellow — centre particle */}
        <div className="qc-particle qc-yellow">
          <div className="qc-dot" />
        </div>
        {/* green — slow orbital particle */}
        <div className="qc-particle qc-green">
          <div className="qc-dot" />
        </div>
      </div>
    </div>
  );
}
