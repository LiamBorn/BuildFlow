/**
 * The "Give feedback" tab on the Dashboard.
 *
 * What is asserted is what the user asked for: the tab is there, the form sends the words with
 * their kind, and the person is told which company it goes out as. Who actually wrote is stamped
 * by the server (server/test/feedback.test.ts proves that); the client only shows it.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import { enterDashboard, installAppHarness } from "../test/appHarness";

type Call = { url: string; init?: RequestInit };

/** Routes the feedback and session calls; everything else keeps going to the harness's fetch. */
function interceptFeedback(reply: () => Response, session?: unknown) {
  const calls: Call[] = [];
  const base = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/feedback")) {
        calls.push({ url, init });
        return reply();
      }
      if (session && url.includes("/api/auth/me")) return new Response(JSON.stringify(session), { status: 200 });
      return base(input, init);
    })
  );
  return calls;
}

/* jsdom's file input has no picker, so the chosen list is put on the element directly —
   which is all the real picker does before it fires a change. */
const pick = (input: HTMLElement, ...chosen: File[]) => {
  Object.defineProperty(input, "files", { value: chosen, configurable: true });
  fireEvent.change(input);
};

const openForm = () => {
  fireEvent.click(screen.getByRole("button", { name: "Give feedback" }));
  return screen.getByRole("dialog", { name: /Tell us what would make BuildFlow better/ });
};

describe("the Give feedback tab", () => {
  installAppHarness();

  it("is on the Dashboard and opens a form with the kinds, the box and a disabled Send", async () => {
    render(<App />);
    await enterDashboard();

    const dialog = openForm();
    expect(within(dialog).getByRole("radiogroup", { name: "What kind of feedback is this?" })).toBeInTheDocument();
    expect(
      within(dialog)
        .getAllByRole("radio")
        .map((node) => node.textContent)
    ).toEqual(["An idea", "Something's broken", "Praise", "Other"]);
    expect(within(dialog).getByLabelText("Your feedback")).toBeInTheDocument();
    // nothing to send yet
    expect(within(dialog).getByRole("button", { name: /Send feedback/ })).toBeDisabled();
    // and it says who it goes out as, even before the session answers
    expect(within(dialog).getByText(/Sending as/)).toBeInTheDocument();
  });

  it("sends the words with their kind and the page, and says which company it went as", async () => {
    render(<App />);
    await enterDashboard();
    const calls = interceptFeedback(() => new Response(JSON.stringify({ ok: true, mode: "log" }), { status: 201 }), {
      account: { email: "matt@asphaltco.com" },
      org: { id: "org-1", name: "Asphalt Co", plan: "Free" }
    });

    const dialog = openForm();
    await waitFor(() => expect(within(dialog).getByText(/Sending as/)).toHaveTextContent("Sending as Asphalt Co"));
    fireEvent.click(within(dialog).getByRole("radio", { name: "Praise" }));
    fireEvent.change(within(dialog).getByLabelText("Your feedback"), { target: { value: "The Week board saved our Monday." } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Send feedback/ }));

    // scoped: the board keeps a live region of its own with the same role
    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent(/on its way/));
    expect(calls).toHaveLength(1);
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      category: "praise",
      message: "The Week board saved our Monday.",
      page: "dashboard"
    });
    expect(within(dialog).getByRole("status")).toHaveTextContent("Sent from Asphalt Co");

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    // by name: the "What's new" modal that greets a login is a dialog of its own
    expect(screen.queryByRole("dialog", { name: /Tell us what would make BuildFlow better/ })).toBeNull();
    // the tab is still there for next time
    expect(screen.getByRole("button", { name: "Give feedback" })).toBeInTheDocument();
  });

  it("attaches a file, lists it, and sends it alongside the words", async () => {
    render(<App />);
    await enterDashboard();
    const calls = interceptFeedback(() => new Response(JSON.stringify({ ok: true, mode: "log" }), { status: 201 }));

    const dialog = openForm();
    pick(within(dialog).getByLabelText("Attach a file"), new File(["hello"], "screenshot.png", { type: "image/png" }));

    // the person can see what is going with it, and how big it is
    expect(await within(dialog).findByText("screenshot.png")).toBeInTheDocument();
    expect(within(dialog).getByText("5 B")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Your feedback"), { target: { value: "The Week board clips here." } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Send feedback/ }));

    await waitFor(() => expect(calls).toHaveLength(1));
    // the file travels as a data URL; the server decodes it back out (server/test/feedback.test.ts)
    expect(JSON.parse(String(calls[0].init?.body)).attachments).toEqual([
      { name: "screenshot.png", type: "image/png", dataUrl: "data:image/png;base64,aGVsbG8=" }
    ]);
  });

  it("takes one back off again", async () => {
    render(<App />);
    await enterDashboard();

    const dialog = openForm();
    pick(
      within(dialog).getByLabelText("Attach a file"),
      new File(["one"], "before.png", { type: "image/png" }),
      new File(["two"], "after.png", { type: "image/png" })
    );

    expect(await within(dialog).findByText("before.png")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove before.png" }));
    expect(within(dialog).queryByText("before.png")).toBeNull();
    expect(within(dialog).getByText("after.png")).toBeInTheDocument();
  });

  it("takes three files at the most, and says so rather than dropping one quietly", async () => {
    render(<App />);
    await enterDashboard();

    const dialog = openForm();
    pick(
      within(dialog).getByLabelText("Attach a file"),
      ...["a", "b", "c", "d"].map((letter) => new File([letter], `${letter}.png`, { type: "image/png" }))
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/up to 3 files/i);
    expect(within(dialog).getAllByRole("button", { name: /^Remove / })).toHaveLength(3);
    // and there is no way to reach for a fourth
    expect(within(dialog).getByRole("button", { name: /Add another/ })).toBeDisabled();
  });

  it("keeps the words in the box when the send fails", async () => {
    render(<App />);
    await enterDashboard();
    interceptFeedback(() => new Response(JSON.stringify({ error: "Your feedback could not be sent right now." }), { status: 502 }));

    const dialog = openForm();
    fireEvent.change(within(dialog).getByLabelText("Your feedback"), { target: { value: "Keep this." } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Send feedback/ }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/could not be sent/);
    expect(within(dialog).getByLabelText("Your feedback")).toHaveValue("Keep this.");
    expect(within(dialog).getByRole("button", { name: /Send feedback/ })).toBeEnabled();
  });
});
