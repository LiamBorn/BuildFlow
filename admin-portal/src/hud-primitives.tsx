import { useEffect, useRef, type ReactNode, type RefObject } from "react";

// ============================================================================
// HUD motion primitives — ported verbatim from the BuildFlow HUD so the admin
// panel keeps the exact same animations & tweens: cursor-parallax aurora,
// scroll reveals, card tilt, sparklines, and progress rings.
// ============================================================================

export type CcTone = "blue" | "green" | "amber" | "red" | "violet" | "orange";

export function DxTilt({ children, max = 7 }: { children: ReactNode; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const handleMove = (event: { clientX: number; clientY: number }) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    el.style.setProperty("--rx", `${(px - 0.5) * 2 * max}deg`);
    el.style.setProperty("--ry", `${(0.5 - py) * 2 * max}deg`);
  };
  const handleLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };
  return (
    <div className="dx-tilt" ref={ref} onPointerMove={handleMove} onPointerLeave={handleLeave}>
      {children}
    </div>
  );
}

// Cursor parallax (aurora + tint) + scroll reveals. Progressive enhancement:
// `dx-ready` turns on the hidden start state only once JS runs.
export function useHudMotion(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let raf = 0;
    const handleMove = (event: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const nx = event.clientX / window.innerWidth;
        const ny = event.clientY / window.innerHeight;
        root.style.setProperty("--mx", `${event.clientX}px`);
        root.style.setProperty("--my", `${event.clientY}px`);
        root.style.setProperty("--px", `${(nx - 0.5) * 2}`);
        root.style.setProperty("--py", `${(ny - 0.5) * 2}`);
      });
    };
    window.addEventListener("pointermove", handleMove);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      cancelAnimationFrame(raf);
    };
  }, [rootRef]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.classList.add("dx-ready");
    const targets = root.querySelectorAll("[data-reveal], [data-reveal-stagger]");
    const reduce =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") {
      targets.forEach((el) => el.classList.add("in"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -5% 0px" }
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [rootRef]);
}

// Lightweight inline SVG sparkline — colored via a `tone-*` class (currentColor).
export function Sparkline({ data, tone = "blue" }: { data: number[]; tone?: CcTone }) {
  const w = 100;
  const h = 30;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const step = w / (data.length - 1);
  const points = data.map((value, index) => {
    const x = index * step;
    const y = h - ((value - min) / span) * (h - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M${points.join(" L")}`;
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg className={`cc-spark tone-${tone}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path className="cc-spark-fill" d={area} />
      <path className="cc-spark-line" d={line} />
    </svg>
  );
}

// Circular progress ring — colored via a `tone-*` class (currentColor).
export function ProgressRing({ value, tone = "blue", size = 46 }: { value: number; tone?: CcTone; size?: number }) {
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference * (1 - clamped / 100);
  const center = size / 2;
  return (
    <span className={`cc-ring tone-${tone}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="cc-ring-track" cx={center} cy={center} r={radius} strokeWidth={stroke} fill="none" />
        <circle
          className="cc-ring-bar"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      <b>{Math.round(clamped)}%</b>
    </span>
  );
}

// Soft floating card panel (used by the "Platform Context" grid).
export function Panel({
  title,
  action,
  onAction,
  children,
  className = "",
  reveal = false
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
  className?: string;
  reveal?: boolean;
}) {
  return (
    <section className={`panel ${className}`} data-reveal={reveal ? "" : undefined}>
      <header className="panel-header">
        <h2>{title}</h2>
        {action && (
          <button type="button" onClick={onAction}>
            {action}
          </button>
        )}
      </header>
      {children}
    </section>
  );
}
