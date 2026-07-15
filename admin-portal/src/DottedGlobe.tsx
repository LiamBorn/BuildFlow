// Decorative dotted wireframe globe (à la the Soft UI reference), drawn as an
// SVG of dashed meridians + parallels so it needs no library or assets. Tinted
// with the BuildFlow blue; the grid slowly "flows" and the location pins pulse
// (animations added via reference-layout.css).
export function DottedGlobe() {
  return (
    <div className="adm-globe" aria-hidden="true">
      <svg className="adm-globe-svg" viewBox="0 0 200 200">
        <defs>
          <radialGradient id="admGlobeSphere" cx="38%" cy="32%" r="78%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#eef2fb" />
            <stop offset="100%" stopColor="#dae2f1" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="92" fill="url(#admGlobeSphere)" />
        <g
          className="adm-globe-grid"
          stroke="#2f6bff"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeDasharray="0.1 6.4"
          fill="none"
        >
          {/* rim + meridians (longitude) */}
          <circle cx="100" cy="100" r="92" />
          <line x1="100" y1="8" x2="100" y2="192" />
          <ellipse cx="100" cy="100" rx="26" ry="92" />
          <ellipse cx="100" cy="100" rx="52" ry="92" />
          <ellipse cx="100" cy="100" rx="78" ry="92" />
          {/* parallels (latitude) */}
          <line x1="45.3" y1="26" x2="154.7" y2="26" />
          <line x1="24.1" y1="48" x2="175.9" y2="48" />
          <line x1="11.8" y1="74" x2="188.2" y2="74" />
          <line x1="8" y1="100" x2="192" y2="100" />
          <line x1="11.8" y1="126" x2="188.2" y2="126" />
          <line x1="24.1" y1="152" x2="175.9" y2="152" />
          <line x1="45.3" y1="174" x2="154.7" y2="174" />
        </g>
      </svg>
      <span className="adm-globe-pin" style={{ top: "33%", left: "43%" }} />
      <span className="adm-globe-pin p2" style={{ top: "56%", left: "60%" }} />
      <span className="adm-globe-pin p3" style={{ top: "47%", left: "28%" }} />
    </div>
  );
}
