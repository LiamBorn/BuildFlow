/**
 * The assistant asks before it changes anything (components/ui/aiProposal.tsx).
 *
 * The ask, with a reference image: when BuildFlow AI is about to make a suggestion that
 * needs the reader's confirmation, it should put a prompt in front of it — the state as
 * it is now, the proposal under it with the changed words marked where they sit, and one
 * row of actions: amend it, refuse it, accept it.
 *
 * The case that matters most is the last one. The schedule import — "switch from another
 * scheduler", a photo of someone's old schedule — used to create the projects, jobs and
 * bookings it read the moment it finished reading. So the load-bearing assertion here is
 * a negative one: with the card on screen the workspace has not been written to, and it
 * is the Accept press that writes.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AiProposalCard, ProposalFailed, type AiProposal } from "../components/ui/aiProposal";
import App from "../App";
import { enterDashboard, installAppHarness, respondToBuildflowApi } from "../test/appHarness";

/** A proposal shaped like the reference: one word out, one word in. */
const redline = (apply: () => void | Promise<void>, onEdit?: () => void): AiProposal => ({
  id: "p-1",
  before: {
    label: "Original vendor draft",
    runs: [{ text: "Pour the slab " }, { text: "Thursday", mark: "removed" }, { text: "." }]
  },
  after: {
    label: "AI suggested redline",
    runs: [{ text: "Pour the slab " }, { text: "Monday", mark: "added" }, { text: "." }]
  },
  acceptLabel: "Accept Edit",
  apply,
  onEdit
});

const card = () => screen.getByRole("region", { name: /Suggested change/ });

describe("the assistant's confirmation prompt", () => {
  it("shows what stands now beside what it proposes, with the changed words marked in place", () => {
    const { container } = render(<AiProposalCard proposal={redline(() => {})} />);

    expect(within(card()).getByText("Original vendor draft")).toBeInTheDocument();
    expect(within(card()).getByText("AI suggested redline")).toBeInTheDocument();
    /* Real removals and insertions, so a screen reader announces them as deleted and
       inserted text rather than reading out a colour it cannot see. */
    expect(container.querySelector("del")).toHaveTextContent("Thursday");
    expect(container.querySelector("ins")).toHaveTextContent("Monday");
  });

  it("changes nothing until the reader accepts, then keeps the record of it", async () => {
    const apply = vi.fn();
    render(<AiProposalCard proposal={redline(apply)} />);
    expect(apply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Accept Edit/ }));

    await screen.findByText("Accepted — the change is in.");
    expect(apply).toHaveBeenCalledTimes(1);
    // and the buttons are gone, so an applied change cannot be accepted twice
    expect(screen.queryByRole("button", { name: /Accept Edit/ })).toBeNull();
  });

  it("leaves the change unmade on Reject, and says so where the buttons were", () => {
    const apply = vi.fn();
    render(<AiProposalCard proposal={redline(apply)} />);

    fireEvent.click(screen.getByRole("button", { name: /Reject/ }));

    expect(apply).not.toHaveBeenCalled();
    expect(screen.getByText("Rejected — nothing changed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accept Edit/ })).toBeNull();
  });

  it("hands Edit back to the caller and stays open, because nothing has been decided", () => {
    const onEdit = vi.fn();
    render(<AiProposalCard proposal={redline(() => {}, onEdit)} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Accept Edit/ })).toBeInTheDocument();
  });

  it("offers no Edit when the caller has nothing for it to do", () => {
    render(<AiProposalCard proposal={redline(() => {})} />);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  /* A failed apply must not leave "Accepted — the change is in." over a workspace that
     was never written to, and the reader has to be able to try again or refuse. */
  it("reopens with the caller's own words when the change could not be applied", async () => {
    const apply = vi.fn(() => {
      throw new ProposalFailed("I couldn't reach the schedule service to finish the import.");
    });
    render(<AiProposalCard proposal={redline(apply)} />);

    fireEvent.click(screen.getByRole("button", { name: /Accept Edit/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("I couldn't reach the schedule service to finish the import.");
    expect(screen.queryByText("Accepted — the change is in.")).toBeNull();
    expect(screen.getByRole("button", { name: /Accept Edit/ })).toBeInTheDocument();
  });

  it("keeps a raw failure to itself and says what happened in its own terms", async () => {
    render(
      <AiProposalCard
        proposal={redline(() => {
          throw new TypeError("Failed to fetch");
        })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Accept Edit/ }));

    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("I couldn't apply that — nothing was changed.");
    expect(notice).not.toHaveTextContent("Failed to fetch");
  });
});

describe("the schedule import", () => {
  installAppHarness();

  it("proposes the plan it read and writes nothing until the import is accepted", async () => {
    /* jsdom has no object URLs; the composer makes one per attachment and the import
       reads it back to get the bytes for vision. */
    const urls = URL as unknown as { createObjectURL: (blob: Blob) => string; revokeObjectURL: (url: string) => void };
    urls.createObjectURL = () => "blob:old-schedule";
    urls.revokeObjectURL = () => {};

    const writes: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("blob:")) return new Response(new Blob(["schedule"], { type: "image/png" }));
        const method = init?.method ?? "GET";
        if (method !== "GET") writes.push(`${method} ${url}`);
        return respondToBuildflowApi(input);
      })
    );
    const created = () => writes.filter((call) => call.includes("/api/projects") || call.includes("/api/jobs"));

    render(<App />);
    await enterDashboard();
    fireEvent.click(document.querySelector(".hs-ai-button") as HTMLButtonElement);

    fireEvent.change(document.querySelector(".bf-breeze-file") as HTMLInputElement, {
      target: { files: [new File(["schedule"], "old-schedule.png", { type: "image/png" })] }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Ask BuildFlow AI" }), { target: { value: "Import my schedule" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    // it reads the photo (three staged passes, ~3s) and then asks
    const proposal = await screen.findByRole("region", { name: /Suggested change/ }, { timeout: 12_000 });
    expect(within(proposal).getByText("Your schedule now")).toBeInTheDocument();
    expect(within(proposal).getByText("AI suggested import")).toBeInTheDocument();
    expect(created()).toHaveLength(0); // THE POINT: nothing has been written

    fireEvent.click(within(proposal).getByRole("button", { name: /Accept import/ }));

    await waitFor(() => expect(created().length).toBeGreaterThan(0), { timeout: 12_000 });
    await screen.findByText("Accepted — the change is in.", undefined, { timeout: 12_000 });
  });
});
