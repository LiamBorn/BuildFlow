/* Where signing in lands you.
   The answer is the Dashboard, and the interesting case is the one that used to
   break it: a schedule link sitting in the hash. */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "../App";
import { ACCOUNT, installAppHarness, state } from "../test/appHarness";
import { bootstrapFixture } from "../test/fixture";
import { consumeScheduleDeepLink, noteScheduleDeepLink } from "../schedule/useScheduleContext";

/** Sign in through the real login form, which is the path `enterAfterAuth` runs. */
async function signIn() {
  fireEvent.click(await screen.findByRole("button", { name: /^Login from welcome navigation$/ }));
  fireEvent.change(await screen.findByLabelText("Email"), { target: { value: ACCOUNT.email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: ACCOUNT.password } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByLabelText("Search BuildFlow");
}

describe("signing in", () => {
  installAppHarness();

  beforeEach(() => {
    state.bootstrapPayload = bootstrapFixture;
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("lands on the Dashboard", async () => {
    render(<App />);
    await signIn();

    expect(await screen.findByRole("heading", { name: "Pending Approvals" })).toBeInTheDocument();
  });

  it("lands on the Dashboard even with a schedule link pending", async () => {
    /* This is the regression. A schedule page writes its own link into the hash so it can be
       shared, and that hash survives a reload — so the pending "deep link" is usually this
       tab's OWN leftover rather than one the person followed. `openAppPage("dashboard")`
       consumes it, so every later sign-in opened on whatever schedule page was last visited
       instead of the Dashboard. Signing in now drains it first.

       The link is armed through `noteScheduleDeepLink`, which is exactly how the bootstrap
       arms it, and then the hash is put back: the module captures the hash once at import,
       so setting it inside a test would never reach that capture. Arming it directly tests
       the condition the fix is about — a link pending at the moment someone signs in —
       without depending on import order.

       The trade-off this locks in: following a shared schedule link while signed out now
       also lands on the Dashboard. That was the deliberate choice — a predictable landing
       beat carrying the link through the login wall — and the link is still in the hash. */
    window.history.replaceState(null, "", "/#schedule?w=2026-06-15&project=p-harborview");
    expect(noteScheduleDeepLink()).toEqual({ page: "schedule" });
    window.history.replaceState(null, "", "/");

    render(<App />);
    await signIn();

    expect(await screen.findByRole("heading", { name: "Pending Approvals" })).toBeInTheDocument();
    // and the link is spent, so it cannot redirect a later navigation either
    expect(consumeScheduleDeepLink()).toBeNull();
  });
});
