/**
 * A write that failed must not look like one that saved.
 *
 * This console had the opposite behaviour in three places, and all three were invisible. A reply
 * whose POST failed kept its optimistic bubble in the thread, so the agent saw their message
 * sitting there looking delivered while the customer got nothing. A lead whose POST failed was
 * replaced by a fabricated local one, which the list showed as saved and a refresh erased. A
 * to-do did the same.
 *
 * None of it was reckless: the console falls back to SAMPLE data when the backend is unreachable
 * and says so in the header ("Sample data" rather than "Linked to BuildFlow"), and inventing a
 * local record is that demo working as intended. The bug was that the WRITE paths never consulted
 * `live`, so the same fabrication ran while the header still claimed a live connection.
 *
 * So the rule these tests hold is narrow and specific: in sample mode, fabricate freely; while
 * linked, a failure must reach the person, keep their typed text, and leave the record alone.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type * as ApiModule from "./api";
import type { Conversation, Message } from "./api";
import type { Desk } from "./SalesApp";
import { fetchMessages, sendMessage } from "./api";
import { Conversations } from "./views/Conversations";
import { NewLeadModal } from "./NewLeadModal";
import { Tasks } from "./views/Tasks";

// vi.mock is hoisted above these imports, so the components below receive the mocked module.
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, fetchMessages: vi.fn(), sendMessage: vi.fn() };
});

const conversation: Conversation = {
  id: "c1",
  name: "Dana Reyes",
  email: "dana@asphaltco.com",
  company: "Asphalt Co",
  subject: "Scheduling question",
  status: "open",
  priority: "normal" as Conversation["priority"],
  department: "support",
  createdAt: "2026-09-01T10:00:00.000Z",
  lastMessageAt: "2026-09-01T10:00:00.000Z"
};

const deskStub = (over: Partial<Desk> = {}): Desk =>
  ({
    data: { leads: [], tasks: [], activities: [], conversations: [conversation] },
    live: true,
    department: "support",
    go: vi.fn(),
    createLead: vi.fn(),
    moveLead: vi.fn(),
    addTask: vi.fn(),
    toggleTask: vi.fn(),
    removeTask: vi.fn(),
    reply: vi.fn().mockResolvedValue(undefined),
    setConversation: vi.fn(),
    ...over
  }) as unknown as Desk;

const sent: Message = {
  id: "m1",
  conversationId: "c1",
  author: "agent",
  body: "On it — I'll take a look today.",
  createdAt: "2026-09-01T11:00:00.000Z"
};

// jsdom implements no Element.scrollTo, and the thread scrolls itself whenever a message
// arrives -- the same family of gap as its missing scrollIntoView.
beforeEach(() => {
  Element.prototype.scrollTo = vi.fn();
  vi.mocked(fetchMessages).mockResolvedValue([]);
  vi.mocked(sendMessage).mockReset();
});

async function typeAndSend(body: string) {
  const desk = deskStub();
  render(<Conversations desk={desk} onRefresh={vi.fn()} />);
  const box = await screen.findByPlaceholderText(/Reply to/i);
  fireEvent.change(box, { target: { value: body } });
  fireEvent.click(screen.getByRole("button", { name: /send/i }));
  return { desk, box: box as HTMLTextAreaElement };
}

describe("a reply that did not send", () => {
  it("takes the message back out of the thread rather than leaving it looking delivered", async () => {
    vi.mocked(sendMessage).mockRejectedValue(new Error("network"));
    const body = "We can get a crew there Thursday.";
    await typeAndSend(body);

    await waitFor(() => expect(screen.getByText(/didn't send/i)).toBeInTheDocument());
    // The bubble must be gone: the whole defect was that it stayed.
    const bubbles = screen.queryAllByText(body, { selector: ".sd-msg-bubble" });
    expect(bubbles, "the unsent reply must not remain in the thread").toHaveLength(0);
  });

  it("gives the agent their text back instead of discarding it", async () => {
    vi.mocked(sendMessage).mockRejectedValue(new Error("network"));
    const body = "Sending the quote over now.";
    const { box } = await typeAndSend(body);
    await waitFor(() => expect(box.value).toBe(body));
  });

  it("leaves the conversation unreplied", async () => {
    vi.mocked(sendMessage).mockRejectedValue(new Error("network"));
    const { desk } = await typeAndSend("Anything else I can help with?");
    await waitFor(() => expect(screen.getByText(/didn't send/i)).toBeInTheDocument());
    // desk.reply marks it replied-to; a failed send must not.
    expect(desk.reply).not.toHaveBeenCalled();
  });
});

describe("a reply that did send", () => {
  it("keeps the message, says nothing about failure, and marks the conversation", async () => {
    vi.mocked(sendMessage).mockResolvedValue(sent);
    const { desk } = await typeAndSend(sent.body);

    await waitFor(() => expect(desk.reply).toHaveBeenCalledWith("c1", sent.body));
    expect(screen.getByText(sent.body)).toBeInTheDocument();
    expect(screen.queryByText(/didn't send/i)).not.toBeInTheDocument();
  });
});

describe("a lead that did not save", () => {
  const fill = () => {
    fireEvent.change(screen.getByPlaceholderText("Jane Foreman"), { target: { value: "Dana Reyes" } });
    fireEvent.change(screen.getByPlaceholderText("jane@company.com"), { target: { value: "dana@asphaltco.com" } });
    fireEvent.change(screen.getByPlaceholderText("Company Inc."), { target: { value: "Asphalt Co" } });
  };

  it("keeps the form open with the details still in it, and says so", async () => {
    const onClose = vi.fn();
    render(<NewLeadModal onClose={onClose} onCreate={vi.fn().mockRejectedValue(new Error("network"))} />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /add lead/i }));

    await waitFor(() => expect(screen.getByText(/didn't save/i)).toBeInTheDocument());
    // Closing would strand the typed lead with nothing saved anywhere.
    expect(onClose, "the modal must not close on a lead that was lost").not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Asphalt Co")).toBeInTheDocument();
  });

  it("closes as usual when it does save", async () => {
    const onClose = vi.fn();
    render(<NewLeadModal onClose={onClose} onCreate={vi.fn().mockResolvedValue(undefined)} />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /add lead/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByText(/didn't save/i)).not.toBeInTheDocument();
  });
});

describe("a to-do that did not save", () => {
  it("leaves the text in the form and says so, rather than listing a to-do that is not there", async () => {
    const desk = deskStub({ addTask: vi.fn().mockRejectedValue(new Error("network")) });
    render(<Tasks desk={desk} />);
    fireEvent.click(screen.getByRole("button", { name: /add task/i }));
    const box = screen.getByPlaceholderText(/what needs doing/i) as HTMLInputElement;
    fireEvent.change(box, { target: { value: "Call Dana back" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(screen.getByText(/didn't save/i)).toBeInTheDocument());
    expect(box.value, "the typed to-do must survive the failure").toBe("Call Dana back");
  });

  it("clears the form when it does save", async () => {
    const desk = deskStub({ addTask: vi.fn().mockResolvedValue(undefined) });
    render(<Tasks desk={desk} />);
    fireEvent.click(screen.getByRole("button", { name: /add task/i }));
    fireEvent.change(screen.getByPlaceholderText(/what needs doing/i), { target: { value: "Call Dana back" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(desk.addTask).toHaveBeenCalled());
    expect(screen.queryByText(/didn't save/i)).not.toBeInTheDocument();
  });
});
