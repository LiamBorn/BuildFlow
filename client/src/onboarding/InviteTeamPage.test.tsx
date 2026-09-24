/**
 * "Who runs the work with you?" — the signup flow's last step, on the flow's design (2026-09-22).
 *
 * What is recorded here: that it reads as the END of the flow (the progress block, full); that
 * nothing is sent until the button says so; that the card fills with the people as they are
 * typed; that bad and repeated addresses are refused per row before anything leaves; and that
 * the answer screen says what actually happened to each address rather than a blanket "sent".
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { InviteTeamPage } from "./InviteTeamPage";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, fetchSession: vi.fn(), sendInvites: vi.fn() };
});

const SESSION = {
  account: { id: "acct-1", email: "jordan@reyespaving.com", name: "Jordan Reyes", role: "owner" },
  org: { id: "org-1", name: "Reyes Paving" }
} as Awaited<ReturnType<typeof api.fetchSession>>;

const typeInto = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  vi.mocked(api.fetchSession).mockResolvedValue(SESSION);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the signup flow's last step", () => {
  it("ends the flow: its progress block, full, over the workspace just made", async () => {
    const { container } = render(<InviteTeamPage onDone={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Who runs the work with you?" })).toBeInTheDocument();
    // the flow's own progress block, finished — not numbered as a sixth step
    expect(screen.getByText("Last step")).toBeInTheDocument();
    expect(container.querySelector<HTMLElement>(".onb-progress-bar i")?.style.getPropertyValue("--onb-fill")).toBe("100%");
    expect(container.querySelector(".onb-solo"), "a screen that carries the progress block is not a solo screen").toBeNull();
    // the card: the workspace, named from the session, over its Projects page
    expect(container.querySelector(".onb-shot.is-on")?.getAttribute("src")).toBe("/onboarding/projects.jpg");
    await waitFor(() => expect(container.querySelector(".onb-mock-name")?.textContent).toBe("Reyes Paving"));
  });

  it("sends nothing from an empty form: its one button skips", () => {
    const onDone = vi.fn();
    render(<InviteTeamPage onDone={onDone} />);
    // three rows to start, and the first is offered as an Admin
    expect(screen.getByLabelText("Access level 1")).toHaveValue("admin");
    expect(screen.getByLabelText("Access level 2")).toHaveValue("member");
    expect(screen.queryByRole("button", { name: "Send invites" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(onDone).toHaveBeenCalled();
    expect(api.sendInvites).not.toHaveBeenCalled();
  });

  it("offers to send once an address is in, and queues the person onto the card", () => {
    const { container } = render(<InviteTeamPage onDone={vi.fn()} />);
    expect(container.querySelector(".onb-mock-invites"), "no tray before anyone is typed").toBeNull();
    typeInto("Email 1", "carlos@reyespaving.com");
    expect(screen.getByRole("button", { name: "Send invites" })).toBeInTheDocument();
    // skipping is still one click away, as the second button
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
    const tray = container.querySelector(".onb-mock-invites") as HTMLElement;
    expect(within(tray).getByText("Invited · 1")).toBeInTheDocument();
    expect(within(tray).getByText("carlos@reyespaving.com")).toBeInTheDocument();
    expect(within(tray).getByText("Admin")).toBeInTheDocument();
  });

  it("refuses a bad or repeated address on its own row, and sends nothing", () => {
    render(<InviteTeamPage onDone={vi.fn()} />);
    typeInto("Email 1", "carlos@reyespaving");
    typeInto("Email 2", "dana@reyespaving.com");
    typeInto("Email 3", "DANA@reyespaving.com");
    fireEvent.click(screen.getByRole("button", { name: "Send invites" }));
    expect(screen.getAllByRole("alert").map((node) => node.textContent)).toEqual(["Enter a valid email address.", "Already in the list."]);
    expect(api.sendInvites).not.toHaveBeenCalled();
  });

  it("sends the filled rows only, then says what happened to each address", async () => {
    vi.mocked(api.sendInvites).mockResolvedValue({
      results: [
        { email: "carlos@reyespaving.com", status: "sent" },
        { email: "dana@reyespaving.com", status: "skipped", reason: "Already on the team" }
      ],
      invites: [],
      emailVerified: true
    });
    const onDone = vi.fn();
    render(<InviteTeamPage onDone={onDone} />);
    typeInto("Email 1", "  Carlos@ReyesPaving.com ");
    typeInto("Email 3", "dana@reyespaving.com");
    fireEvent.click(screen.getByRole("button", { name: "Send invites" }));

    // the blank middle row is not sent, and the addresses go lower-cased and trimmed
    await waitFor(() =>
      expect(api.sendInvites).toHaveBeenCalledWith([
        { email: "carlos@reyespaving.com", permission: "admin" },
        { email: "dana@reyespaving.com", permission: "member" }
      ])
    );
    expect(await screen.findByRole("heading", { name: "Invites sent." })).toBeInTheDocument();
    expect(screen.getByText("Invite sent")).toBeInTheDocument();
    expect(screen.getByText("Already on the team")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open BuildFlow" }));
    expect(onDone).toHaveBeenCalled();
  });

  it("says the invites are waiting on the owner when their own address is not confirmed yet", async () => {
    vi.mocked(api.sendInvites).mockResolvedValue({
      results: [{ email: "carlos@reyespaving.com", status: "held" }],
      invites: [],
      emailVerified: false
    });
    render(<InviteTeamPage onDone={vi.fn()} />);
    typeInto("Email 1", "carlos@reyespaving.com");
    fireEvent.click(screen.getByRole("button", { name: "Send invites" }));
    expect(await screen.findByRole("heading", { name: "Your invites are waiting on you." })).toBeInTheDocument();
    expect(screen.getByText("Sends once you confirm your email")).toBeInTheDocument();
  });

  it("keeps the other rows' addresses when one is removed from the middle", () => {
    render(<InviteTeamPage onDone={vi.fn()} />);
    typeInto("Email 1", "a@reyespaving.com");
    typeInto("Email 2", "b@reyespaving.com");
    typeInto("Email 3", "c@reyespaving.com");
    fireEvent.click(screen.getByRole("button", { name: "Remove row 2" }));
    expect(screen.getByLabelText("Email 1")).toHaveValue("a@reyespaving.com");
    expect(screen.getByLabelText("Email 2")).toHaveValue("c@reyespaving.com");
    expect(screen.queryByLabelText("Email 3")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+ Add another" }));
    expect(screen.getByLabelText("Email 3")).toHaveValue("");
    expect(screen.getByLabelText("Access level 3")).toHaveValue("member");
  });

  /* 2026-09-22: "change the dropdown to match the design". The access level opens the program's
     own list (components/ui/selectMenu.tsx) rather than the system panel, and the choice still
     lands on the native control the form reads. */
  it("opens the program's own list for the access level, and the choice reaches the row", () => {
    const { container } = render(<InviteTeamPage onDone={vi.fn()} />);
    typeInto("Email 2", "dana@reyespaving.com");
    fireEvent.pointerDown(screen.getByLabelText("Access level 2"), { bubbles: true });

    const list = screen.getByRole("listbox", { name: "Access level 2" });
    expect(
      within(list)
        .getAllByRole("option")
        .map((row) => row.textContent)
    ).toEqual(["Admin", "Member"]);
    expect(within(list).getByRole("option", { name: "Member" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(within(list).getByRole("option", { name: "Admin" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Access level 2")).toHaveValue("admin");
    // and the card's tray follows the row
    expect(within(container.querySelector(".onb-mock-invites") as HTMLElement).getByText("Admin")).toBeInTheDocument();
  });

  it("keeps the form, and the addresses in it, when sending fails", async () => {
    vi.mocked(api.sendInvites).mockRejectedValue(new api.ApiError("Invites are paused while your trial is being set up.", 503));
    render(<InviteTeamPage onDone={vi.fn()} />);
    typeInto("Email 1", "carlos@reyespaving.com");
    fireEvent.click(screen.getByRole("button", { name: "Send invites" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invites are paused while your trial is being set up.");
    expect(screen.getByLabelText("Email 1")).toHaveValue("carlos@reyespaving.com");
    expect(screen.getByRole("button", { name: "Send invites" })).toBeEnabled();
  });
});
