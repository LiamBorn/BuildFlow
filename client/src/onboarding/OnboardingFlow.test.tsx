/**
 * The five-step signup and setup (2026-09-22).
 *
 * jsdom runs no animations, so what is recorded here is the part that is this program's
 * decision: which step follows which, what each one needs before it will go on, what the
 * preview shows while the answers are typed, what the plan rule puts on the card — and the
 * one measured ordering of the transition that IS visible in the DOM, the preview and the
 * progress moving before the form has left.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import * as api from "../api";
import { PILL_GROUPS } from "../motion/SegmentPill";
import { OnboardingFlow, type OnboardingFlowProps } from "./OnboardingFlow";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    fetchOauthStatus: vi.fn(async () => ({ providers: { google: false, microsoft: false } })),
    fetchSession: vi.fn(async () => null)
  };
});

const PLANS: OnboardingFlowProps["plans"] = [
  { id: "free", name: "Free", priceMonthly: 0, features: ["Full Calendar: every crew", "Work Orders: the basics"] },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 20,
    features: ["Everything in Free: all of it", "Unlimited Seats: everyone", "Readiness Rules: hold work"]
  },
  { id: "business", name: "Business", priceMonthly: 48, features: ["Everything in Pro: all of it", "Cross-Project Dispatch: one board"] },
  { id: "enterprise", name: "Enterprise", priceMonthly: null, features: ["Custom Seat Count: agreed with you"] }
];

const props = (over: Partial<OnboardingFlowProps> = {}): OnboardingFlowProps => ({
  entry: "create-account",
  plans: PLANS,
  onSignup: vi.fn(async () => undefined),
  onTradeChosen: vi.fn(),
  onBackToTrade: vi.fn(),
  onFinish: vi.fn(async () => undefined),
  onLogIn: vi.fn(),
  onBack: vi.fn(),
  onContactSales: vi.fn(),
  ...over
});

const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
const fillAccount = (password = "Reyes-Paving-2026") => {
  type("First name", "Jordan");
  type("Last name", "Reyes");
  type("Work email", "ops@reyespaving.com");
  type("Password", password);
  fireEvent.click(screen.getByLabelText("I agree to the"));
};

/** test/setup.ts stubs matchMedia to `matches: false`; the reduced-motion case needs to choose. */
const setReduce = (matches: boolean) => {
  window.matchMedia = ((query: string) =>
    ({
      matches,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false
    }) as MediaQueryList) as typeof window.matchMedia;
};

beforeEach(() => setReduce(false));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the five-step signup and setup", () => {
  it("asks for the person first, and holds Next until there is something to go on", () => {
    render(<OnboardingFlow {...props()} />);
    expect(screen.getByRole("heading", { name: "Let's start with you." })).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toHaveAttribute("placeholder", "name@company.com");
    expect(screen.getByLabelText("I agree to the")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fillAccount();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("shows the Dashboard itself, with the account row written as the name is typed", () => {
    const { container } = render(<OnboardingFlow {...props()} />);
    // the picture is the program's own Dashboard (public/onboarding/), not a sketch of one
    expect(container.querySelector(".onb-shot.is-on")?.getAttribute("src")).toBe("/onboarding/dashboard.jpg");
    const account = () => container.querySelector(".onb-mock-user-text b")?.textContent;
    expect(account()).toBe("Your name");
    type("First name", "Jordan");
    type("Last name", "Reyes");
    expect(account()).toBe("Jordan Reyes");
    expect(container.querySelector(".onb-mock-avatar")?.textContent).toBe("JR");
  });

  it("keeps the first step for a weak password, and never asks the server", () => {
    const p = props();
    render(<OnboardingFlow {...p} />);
    fillAccount("short");
    next();
    expect(screen.getByRole("alert")).toHaveTextContent("Password must be at least 8 characters.");
    expect(screen.getByRole("heading", { name: "Let's start with you." })).toBeInTheDocument();
    expect(p.onSignup).not.toHaveBeenCalled();
  });

  it("moves to the business's name with the preview and the progress leading the form", async () => {
    const { container } = render(<OnboardingFlow {...props()} />);
    fillAccount();
    expect(container.querySelector(".onb-frame")?.getAttribute("data-variant")).toBe("rose");
    next();
    /* Measured on the recording: the next card is already on the right, and the counter has
       moved, while the outgoing form is still fading — frames 36.52–36.64. */
    expect(container.querySelector(".onb-frame")?.getAttribute("data-variant")).toBe("mint");
    expect(screen.getByText("Step 2 of 5")).toBeInTheDocument();
    expect(container.querySelector(".onb-pane")?.classList.contains("is-leaving")).toBe(true);
    expect(screen.getByRole("heading", { name: "Let's start with you." })).toBeInTheDocument();
    // …and then the next step arrives, with the person's name in it
    expect(await screen.findByRole("heading", { name: "Nice to meet you, Jordan!" })).toBeInTheDocument();
    expect(container.querySelector(".onb-pane")?.classList.contains("is-leaving")).toBe(false);
    // the business's initial and name go onto the card's header as they are typed, over the Projects page
    expect(container.querySelector(".onb-shot.is-on")?.getAttribute("src")).toBe("/onboarding/projects.jpg");
    type("Business name", "Reyes Paving");
    expect(container.querySelector(".onb-mock-tile")?.textContent).toBe("R");
    expect(container.querySelector(".onb-mock-name")?.textContent).toBe("Reyes Paving");
  });

  it("creates the account from the business name, and takes a server fault back to its field", async () => {
    const onSignup = vi.fn(async () => undefined);
    const onLogIn = vi.fn();
    render(<OnboardingFlow {...props({ onSignup, onLogIn })} />);
    fillAccount();
    next();
    fireEvent.change(await screen.findByLabelText("Business name"), { target: { value: "Reyes Paving" } });
    next();
    await waitFor(() => expect(onSignup).toHaveBeenCalledTimes(1));
    expect(onSignup).toHaveBeenCalledWith({
      email: "ops@reyespaving.com",
      password: "Reyes-Paving-2026",
      name: "Jordan Reyes",
      orgName: "Reyes Paving",
      acceptTerms: true,
      remember: true
    });

    // the email is taken: that field is on the first step, so that is where this goes
    onSignup.mockRejectedValueOnce(new ApiError("That email already has an account.", 409, "email", "email_taken"));
    next();
    expect(await screen.findByRole("heading", { name: "Let's start with you." })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("That email already has an account.");
    fireEvent.click(screen.getByRole("button", { name: "Log in instead" }));
    expect(onLogIn).toHaveBeenCalled();
  });

  it("makes the trade a radio group of the fourteen trades, and needs one to go on", () => {
    const onTradeChosen = vi.fn();
    const { container } = render(<OnboardingFlow {...props({ entry: "business-type", onTradeChosen })} />);
    expect(screen.getByRole("heading", { name: "What type of construction business do you own?" })).toBeInTheDocument();
    expect(screen.getByText("Step 3 of 5")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Business type" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(14);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(container.querySelector(".onb-mock-chip")?.textContent).toBe("Your trade");
    // the trade's page: the Schedule's Month calendar
    expect(container.querySelector(".onb-shot.is-on")?.getAttribute("src")).toBe("/onboarding/schedule-month.jpg");
    fireEvent.click(screen.getByRole("radio", { name: "Roofing" }));
    expect(container.querySelector(".onb-mock-chip")?.textContent).toBe("Roofing");
    next();
    expect(onTradeChosen).toHaveBeenCalledWith("Roofing");
  });

  it("marks the chosen tile for the travelling ring, and lands a check on it", () => {
    /* The ring itself is the group's ::before, placed by motion/SegmentPill.tsx — an engine with
       its own tests, which reads `.is-active` and needs the group named in PILL_GROUPS. jsdom has
       no layout for it to place against, so what is checked here is the contract: the group is
       served, the chosen tile wears the mark, and only the chosen tile carries the badge. */
    expect(PILL_GROUPS).toContain(".onb-tiles");
    const { container } = render(<OnboardingFlow {...props({ entry: "business-type" })} />);
    expect(container.querySelectorAll(".onb-tile.is-active")).toHaveLength(0);
    expect(container.querySelectorAll(".onb-tile-check")).toHaveLength(0);
    fireEvent.click(screen.getByRole("radio", { name: "Roofing" }));
    const chosen = container.querySelector(".onb-tile.is-active");
    expect(chosen?.textContent).toBe("Roofing");
    expect(container.querySelectorAll(".onb-tile-check")).toHaveLength(1);
    expect(chosen?.querySelector(".onb-tile-check")).not.toBeNull();
    // choosing another moves the mark and the badge with it
    fireEvent.click(screen.getByRole("radio", { name: "Asphalt" }));
    expect(container.querySelectorAll(".onb-tile.is-active")).toHaveLength(1);
    expect(container.querySelector(".onb-tile.is-active")?.textContent).toBe("Asphalt");
    expect(container.querySelectorAll(".onb-tile-check")).toHaveLength(1);
  });

  it("asks the size as two rows of chips and puts the plan they point at on the card", async () => {
    const onFinish = vi.fn(async () => undefined);
    render(<OnboardingFlow {...props({ entry: "additional-products", onFinish })} />);
    expect(screen.getByRole("radiogroup", { name: "Monthly revenue" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Total employees" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "$500k – $2M / month" }));
    fireEvent.click(screen.getByRole("radio", { name: "51 – 200" }));
    next();

    expect(await screen.findByRole("heading", { name: "Business" })).toBeInTheDocument();
    expect(screen.getByText("$48")).toBeInTheDocument();
    expect(screen.getByText("/ user / month")).toBeInTheDocument();
    expect(screen.getByText(/With 51 to 200 people/)).toBeInTheDocument();
    // the features show their labels, not their explanations
    expect(screen.getByText("Cross-Project Dispatch")).toBeInTheDocument();
    expect(screen.queryByText(/one board/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue with Business" }));
    expect(onFinish).toHaveBeenCalledWith("business", 75);
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue for free" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Continue for free" }));
    expect(onFinish).toHaveBeenLastCalledWith("free", 75);
  });

  it("recommends Pro, on a trial, when the size is skipped", async () => {
    render(<OnboardingFlow {...props({ entry: "additional-products" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(await screen.findByRole("heading", { name: "Pro" })).toBeInTheDocument();
    expect(screen.getByText(/Most crews start on Pro/)).toBeInTheDocument();
    expect(screen.getByText(/Starts a 14-day trial/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Pro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue for free" })).toBeInTheDocument();
  });

  it("sends an Enterprise-sized business to sales rather than to a checkout", async () => {
    const onContactSales = vi.fn();
    render(<OnboardingFlow {...props({ entry: "additional-products", onContactSales })} />);
    fireEvent.click(screen.getByRole("radio", { name: "$2M+ / month" }));
    fireEvent.click(screen.getByRole("radio", { name: "200+" }));
    next();
    expect(await screen.findByRole("heading", { name: "Enterprise" })).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Talk to sales" }));
    expect(onContactSales).toHaveBeenCalled();
  });

  it("follows the hash from one group of steps to the next", async () => {
    const p = props();
    const { rerender } = render(<OnboardingFlow {...p} />);
    expect(screen.getByRole("heading", { name: "Let's start with you." })).toBeInTheDocument();
    // the signup finished: the parent moved the hash to #business-type
    rerender(<OnboardingFlow {...p} entry="business-type" />);
    expect(await screen.findByRole("heading", { name: "What type of construction business do you own?" })).toBeInTheDocument();
    // a trade was chosen: #additional-products
    rerender(<OnboardingFlow {...p} entry="additional-products" />);
    expect(await screen.findByRole("heading", { name: /How big is/ })).toBeInTheDocument();
    // and the browser's Back button: #business-type again
    rerender(<OnboardingFlow {...p} entry="business-type" />);
    expect(await screen.findByRole("heading", { name: "What type of construction business do you own?" })).toBeInTheDocument();
  });

  it("goes straight to the next step when less motion is asked for", () => {
    setReduce(true);
    const { container } = render(<OnboardingFlow {...props()} />);
    fillAccount();
    next();
    // no fade, no empty beat: the next step is simply there
    expect(screen.getByRole("heading", { name: "Nice to meet you, Jordan!" })).toBeInTheDocument();
    expect(container.querySelector(".onb-pane")?.classList.contains("is-leaving")).toBe(false);
  });

  it("resumes with the workspace's own name when nothing was typed here", async () => {
    vi.mocked(api.fetchSession).mockResolvedValueOnce({
      account: { id: "acct-1", email: "casey@leepaving.com", name: "Casey Lee", role: "owner" },
      org: { id: "org-1", name: "Lee Paving" }
    } as Awaited<ReturnType<typeof api.fetchSession>>);
    const { container } = render(<OnboardingFlow {...props({ entry: "additional-products" })} />);
    expect(await screen.findByRole("heading", { name: "How big is Lee Paving today?" })).toBeInTheDocument();
    expect(container.querySelector(".onb-mock-name")?.textContent).toBe("Lee Paving");
    expect(container.querySelector(".onb-shot.is-on")?.getAttribute("src")).toBe("/onboarding/reports.jpg");
  });
});
