/**
 * The command-center pages' motion: the cursor position as CSS variables on the page
 * root, and reveal-on-scroll for [data-reveal] blocks (all at once under reduced motion).
 */
import type { RefObject } from "react";
import { useEffect } from "react";

/**
 * Defaults to false when matchMedia is absent — a server render, an old browser, or
 * jsdom before test/setup.ts installs its stub. Never assume the query is answerable.
 * Every media-gated helper in this redesign uses this exact shape.
 */
function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useHudMotion(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // The pointer loop publishes --px/--py for the aurora parallax. It used to publish
    // --mx/--my too, which positioned a 480px glow on the cursor (.dx-cursor) on every
    // command-center page; that glow was removed on request (2026-09-16, skin §51), so
    // the loop no longer writes those two and nothing reads them inside the program.
    // The parallax is decoration, so a reduced-motion reader gets neither it nor the rAF
    // loop that feeds it. This guard used to be missing while the reveal effect below had
    // it — same file, same hook, one guard.
    if (prefersReducedMotion()) return;
    let raf = 0;
    const handleMove = (event: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const nx = event.clientX / window.innerWidth;
        const ny = event.clientY / window.innerHeight;
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
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
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
      // The documented reveal contract, shared with the Welcome Page so a new surface
      // can join it without guessing: one-shot, then unobserve.
      { threshold: 0.16, rootMargin: "0px 0px -6% 0px" }
    );
    targets.forEach((el) => observer.observe(el));
    // Panels that mount after their own fetch resolves — the three Sales tables and the
    // schedule status band are the live cases — miss that first query, and without this
    // they stay at opacity 0 for the life of the page. Observe reveal targets as they
    // arrive. Ported verbatim from the Dashboard's inlined copy of this effect, which
    // has had the watcher since it was written; every other root using this hook did not.
    const watch = (node: Node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.matches("[data-reveal], [data-reveal-stagger]")) observer.observe(node);
      node.querySelectorAll("[data-reveal], [data-reveal-stagger]").forEach((el) => observer.observe(el));
    };
    const mutations = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach(watch)));
    mutations.observe(root, { childList: true, subtree: true });
    return () => {
      mutations.disconnect();
      observer.disconnect();
    };
    // Deps are [rootRef] and a ref object is stable, so this runs once per mount. That is
    // load-bearing for Settings: .settings-panel-inner is React-keyed by the active
    // category, so if its children ever gained data-reveal they would be queried once,
    // never re-queried after a key change, and the panel would go permanently blank on the
    // first category switch. Settings keeps sx-rise instead. Do not add the key to these deps.
  }, [rootRef]);
}
