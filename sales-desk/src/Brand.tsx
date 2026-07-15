// BuildFlow brand mark — the orange cube, inline so the portal has no asset deps.
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="bf-mark" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0" stopColor="#fb923c" />
          <stop offset="1" stopColor="#ea580c" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="url(#bf-mark)" />
      <path d="M16 6.5 L24.5 11.25 L24.5 20.75 L16 25.5 L7.5 20.75 L7.5 11.25 Z" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M16 6.5 L16 16 M16 16 L24.5 11.25 M16 16 L7.5 11.25" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round" opacity="0.9" />
    </svg>
  );
}
