/**
 * The landing page's Top Drawer Navigation (2026-09-27): the supplied `navigation04` script,
 * typed for this project. Measurement, panel states, interruption, input handling and cleanup are
 * the original's, with one fix: the curtain dismisses on hover only after the pointer has moved
 * (see its pointerenter handler).
 *
 * Markup: DrawerNav in LandingPage.tsx. Styles: landing/drawer-nav.css. It runs once per mount
 * from a useEffect and the cleanup it returns runs on unmount, so it never touches the DOM
 * during rendering. React renders the initial state (aria-expanded="false", inert panels) and
 * then leaves these attributes alone, because the component's props never change after mount.
 */
export function navigation04(scope: ParentNode & Partial<Pick<Element, "matches">> = document): (() => void) | undefined {
  const root = (scope.matches?.("[data-drawer-nav]") ? scope : scope.querySelector("[data-drawer-nav]")) as DrawerRoot | null;
  if (!root) return;
  root.navigation04Cleanup?.();

  const drawer = root.querySelector<HTMLElement>("[data-drawer]")!;
  const bar = root.querySelector<HTMLElement>(".bar")!;
  const toggle = root.querySelector<HTMLButtonElement>("[data-toggle]")!;
  const back = root.querySelector<HTMLButtonElement>("[data-back]")!;
  const curtain = root.querySelector<HTMLElement>("[data-curtain]")!;
  const panels = [...drawer.querySelectorAll<HTMLElement>("[data-panel]")];
  const triggers = [...root.querySelectorAll<HTMLElement>("[data-menu]")];
  const contents = panels.map((panel) => panel.querySelector<HTMLElement>(".content")!);
  const mobile = matchMedia("(max-width: 833px)");
  const hover = matchMedia("(hover: hover) and (pointer: fine)");
  const controller = new AbortController();
  const { signal } = controller;
  const heights = new Map<Element | null, number>();
  const style = getComputedStyle(root);
  // CSS may say 500ms or .5s; both come out as milliseconds.
  const duration = (name: string) => {
    const value = style.getPropertyValue(name).trim().toLowerCase();
    return parseFloat(value) * (value.endsWith("ms") ? 1 : 1000);
  };
  const motion = {
    hover: 122,
    hoverSwitch: 40,
    height: duration("--height-time"),
    mobileHeight: duration("--mobile-height-time"),
    switch: duration("--switch-time"),
    closeDelay: 122
  };
  let active: HTMLElement | null = null;
  let hoverTimer: number | undefined;
  let finishTimer: number | undefined;
  let lastTrigger: HTMLElement | null = null;
  let open = false;
  let savedOverflow: string | null = null;
  let availableHeight = 0;
  // Whether the pointer has moved since the drawer opened (see the curtain's pointerenter below).
  let pointerMoved = false;

  // Measure content independently from the fixed-size reveal and scroll containers.
  contents.forEach((content) => heights.set(content.parentElement, content.getBoundingClientRect().height));
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const size = entry.borderBoxSize?.[0];
      heights.set(entry.target.parentElement, size ? size.blockSize : entry.target.getBoundingClientRect().height);
    }
    resize();
  });
  contents.forEach((content) => observer.observe(content));
  resize();

  function resize() {
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const barHeight = bar.offsetHeight;
    const viewportLimit = Math.max(0, viewportHeight - barHeight - (mobile.matches ? 0 : 24));
    const contentLimit = mobile.matches ? viewportLimit : Math.ceil(Math.max(0, ...heights.values()));
    availableHeight = Math.min(viewportLimit, contentLimit);
    root!.style.setProperty("--reveal-size", `${barHeight + availableHeight}px`);
    if (open) setSize(active);
  }

  function setSize(panel: HTMLElement | null) {
    const time = mobile.matches ? motion.mobileHeight : motion.height;
    const height = mobile.matches ? availableHeight : Math.min(availableHeight, heights.get(panel) ?? 0);
    root!.style.setProperty("--height-time", `${time}ms`);
    root!.style.setProperty("--drawer-height", `${Math.max(0, height)}px`);
    return time;
  }

  function setPanelState(panel: HTMLElement, state: "active" | "leaving" | "closing" | "idle") {
    panel.classList.toggle("is-active", state === "active");
    panel.classList.toggle("is-leaving", state === "leaving");
    panel.classList.toggle("is-closing", state === "closing");
    panel.inert = state !== "active";
  }

  function updateControls() {
    triggers.forEach((trigger) => {
      trigger.setAttribute("aria-expanded", String(open && trigger.dataset.menu === active?.dataset.panel));
    });
    toggle.setAttribute("aria-expanded", String(open && mobile.matches));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    toggle.querySelector(".toggle-label")!.textContent = open ? "Close" : "Menu";
    const submenu = mobile.matches && open && active?.dataset.panel !== "menu";
    root!.toggleAttribute("data-submenu", submenu);
    back.inert = !submenu;
  }

  function lockPage() {
    if (!mobile.matches || savedOverflow !== null) return;
    savedOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    root!.setAttribute("role", "dialog");
    root!.setAttribute("aria-modal", "true");
  }

  function unlockPage() {
    if (savedOverflow !== null) document.documentElement.style.overflow = savedOverflow;
    savedOverflow = null;
    root!.removeAttribute("role");
    root!.removeAttribute("aria-modal");
  }

  function focusFirst(panel: HTMLElement | null) {
    panel?.querySelector<HTMLElement>("a[href], button")?.focus({ preventScroll: true });
  }

  function select(key: string | undefined, trigger: HTMLElement | null, focus = false) {
    const next = panels.find((panel) => panel.dataset.panel === key);
    if (!next) return;
    clearTimeout(hoverTimer);
    if (open && next === active) {
      if (focus) focusFirst(next);
      return;
    }
    clearTimeout(finishTimer);

    const previous = active;
    const switching = open && previous !== next;
    if (!switching) pointerMoved = false;
    root!.dataset.motion = switching ? "swap" : "reveal";
    root!.style.setProperty("--height-delay", "0ms");
    panels.forEach((panel) => {
      if (panel !== next && (panel === previous || panel.classList.contains("is-leaving") || panel.classList.contains("is-closing"))) {
        setPanelState(panel, switching ? "leaving" : "idle");
      }
    });
    active = next;
    open = true;
    lastTrigger = trigger || lastTrigger;
    drawer.inert = false;
    root!.setAttribute("data-open", "");
    setPanelState(next, "active");
    lockPage();
    updateControls();
    const heightTime = setSize(next);
    const time = switching ? motion.switch : heightTime;
    finishTimer = window.setTimeout(() => {
      panels.forEach((panel) => {
        if (panel !== active) {
          setPanelState(panel, "idle");
          panel.scrollTop = 0;
        }
      });
      if (focus) {
        if (key === "menu" && previous) {
          next.querySelector<HTMLElement>(`[data-menu="${previous.dataset.panel}"]`)?.focus({ preventScroll: true });
        } else focusFirst(next);
      }
    }, time);
  }

  function close(restoreFocus = false, immediate = false) {
    clearTimeout(hoverTimer);
    if (!open && !immediate) return;
    clearTimeout(finishTimer);
    const wasMobile = savedOverflow !== null;
    const returnTo = wasMobile ? toggle : lastTrigger;
    if (restoreFocus || active?.contains(document.activeElement)) returnTo?.focus({ preventScroll: true });
    open = false;
    root!.dataset.motion = "close";
    root!.removeAttribute("data-open");
    drawer.inert = true;
    panels.forEach((panel) => setPanelState(panel, panel === active && !immediate ? "closing" : "idle"));
    active = null;
    updateControls();
    const time = mobile.matches ? motion.mobileHeight : motion.height;
    root!.style.setProperty("--height-time", `${immediate ? 0 : time}ms`);
    root!.style.setProperty("--height-delay", `${immediate ? 0 : motion.closeDelay}ms`);
    root!.style.setProperty("--drawer-height", "0px");
    const finish = () => {
      panels.forEach((panel) => {
        setPanelState(panel, "idle");
        panel.scrollTop = 0;
      });
      unlockPage();
      root!.dataset.motion = "closed";
    };
    if (immediate) finish();
    else finishTimer = window.setTimeout(finish, time + motion.closeDelay);
  }

  triggers.forEach((trigger) => {
    trigger.addEventListener(
      "pointerenter",
      (event) => {
        if (mobile.matches || !hover.matches || event.pointerType !== "mouse") return;
        clearTimeout(hoverTimer);
        hoverTimer = window.setTimeout(() => select(trigger.dataset.menu, trigger), open ? motion.hoverSwitch : motion.hover);
      },
      { signal }
    );
    trigger.addEventListener("pointerleave", () => clearTimeout(hoverTimer), { signal });
    trigger.addEventListener(
      "click",
      (event) => {
        const pointerType = (event as PointerEvent).pointerType;
        const hoverClick = !mobile.matches && hover.matches && event.detail > 0 && (!pointerType || pointerType === "mouse");
        if (open && active?.dataset.panel === trigger.dataset.menu && !hoverClick) close(true);
        else select(trigger.dataset.menu, trigger, mobile.matches);
      },
      { signal }
    );
    trigger.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          select(trigger.dataset.menu, trigger, true);
        }
      },
      { signal }
    );
  });

  toggle.addEventListener("click", () => (open ? close(true) : select("menu", toggle, true)), { signal });
  curtain.addEventListener("click", () => close(true), { signal });
  curtain.addEventListener(
    "pointerenter",
    (event) => {
      // The one change from the supplied script. Opening from the keyboard with the mouse resting
      // over the page puts the curtain under a cursor that never moved, and Chrome still fires
      // pointerenter for it, so the drawer closed the moment it opened. Only a pointer that has
      // actually moved since then is taken to have left the menu.
      if (!mobile.matches && hover.matches && event.pointerType === "mouse" && pointerMoved) close();
    },
    { signal }
  );
  document.addEventListener(
    "pointermove",
    () => {
      pointerMoved = true;
    },
    { signal, passive: true }
  );
  root.addEventListener(
    "pointerleave",
    (event) => {
      clearTimeout(hoverTimer);
      if (!mobile.matches && hover.matches && event.pointerType === "mouse") close();
    },
    { signal }
  );
  root.querySelector(".contact")!.addEventListener(
    "pointerenter",
    () => {
      if (!mobile.matches && hover.matches) close();
    },
    { signal }
  );
  root.addEventListener(
    "click",
    (event) => {
      const target = event.target as Element;
      if (target.closest("[data-back]")) select("menu", toggle, true);
      else if (target.closest("a[href]")) close();
    },
    { signal }
  );
  root.addEventListener(
    "focusout",
    (event) => {
      const next = event.relatedTarget as Node | null;
      if (open && next && !root.contains(next)) {
        if (mobile.matches) toggle.focus({ preventScroll: true });
        else close();
      }
    },
    { signal }
  );
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (open && !root.contains(event.target as Node)) close();
    },
    { signal }
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (!open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      } else if (event.key === "Tab" && mobile.matches) {
        const focusable = [...root.querySelectorAll<HTMLElement>("button, a[href]")].filter((element) => {
          return !element.closest("[inert]") && element.getClientRects().length;
        });
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
          event.preventDefault();
          first?.focus();
        }
      }
    },
    { signal }
  );
  document.addEventListener(
    "scroll",
    () => {
      if (open && !mobile.matches && hover.matches) close();
    },
    { signal, passive: true }
  );
  mobile.addEventListener(
    "change",
    () => {
      const hadFocus = root.contains(document.activeElement);
      close(false, true);
      resize();
      if (hadFocus) (mobile.matches ? toggle : triggers[0]).focus({ preventScroll: true });
    },
    { signal }
  );
  window.addEventListener("resize", resize, { signal, passive: true });
  window.visualViewport?.addEventListener("resize", resize, { signal, passive: true });
  window.addEventListener("pagehide", () => close(false, true), { signal });

  root.navigation04Cleanup = () => {
    close(false, true);
    controller.abort();
    observer.disconnect();
    root.style.removeProperty("--height-time");
    root.style.removeProperty("--height-delay");
    root.style.removeProperty("--drawer-height");
    root.style.removeProperty("--reveal-size");
    delete root.navigation04Cleanup;
  };
  return root.navigation04Cleanup;
}

type DrawerRoot = HTMLElement & { navigation04Cleanup?: () => void };
