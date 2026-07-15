// Pipeline-by-stage donut. Classic 100-unit circumference technique: each
// segment is a circle whose dasharray is [len, 100-len], rotated by the running
// offset. Colours come from the design-system --cc-* tokens via a tone class.
export type Segment = { label: string; value: number; tone: string };

export function Donut({ segments, size = 190 }: { segments: Segment[]; size?: number }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  let offset = 0;
  const R = 15.915_49; // circumference = 100
  return (
    <svg className="sd-donut" viewBox="0 0 42 42" width={size} height={size} role="img" aria-label="Pipeline by stage">
      <circle className="sd-donut-track" cx="21" cy="21" r={R} fill="none" strokeWidth="4.4" />
      {segments.map((seg) => {
        const len = (seg.value / total) * 100;
        const dash = `${len} ${100 - len}`;
        // start at 12 o'clock: base rotation -90deg → dashoffset 25
        const dashoffset = 25 - offset;
        offset += len;
        return (
          <circle
            key={seg.label}
            className={`sd-donut-seg tone-${seg.tone}`}
            cx="21"
            cy="21"
            r={R}
            fill="none"
            strokeWidth="4.4"
            strokeLinecap="round"
            strokeDasharray={dash}
            strokeDashoffset={dashoffset}
          />
        );
      })}
    </svg>
  );
}
