/**
 * "Give feedback" — the tab on the Dashboard's right edge, the way monday.com places its own,
 * and the form it opens.
 *
 * The form asks for the words and nothing else. Who is writing is not a field: the server
 * reads the workspace and the signed-in person off the session and puts them in the mail, so
 * the inbox always knows which company a message came from and a body cannot claim otherwise.
 * The dialog still SAYS who it will be sent as, because a person should know that before they
 * press send.
 *
 * Everything visible is BuildFlow's own: the `.pdx` modal system every other dialog uses (its
 * backdrop, aurora, head and field entrance), the ink and surface tokens, the app font, and the
 * hover/entrance durations. Only the placement is the reference's.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Check, MessageSquareText, Send, X } from "lucide-react";
import type { BootstrapPayload } from "@buildflow/shared";
import { fetchSession, sendFeedback, type FeedbackCategory } from "./api";

const KINDS: Array<{ id: FeedbackCategory; label: string }> = [
  { id: "idea", label: "An idea" },
  { id: "bug", label: "Something's broken" },
  { id: "praise", label: "Praise" },
  { id: "other", label: "Other" }
];

export function FeedbackTab({ data, page = "dashboard" }: { data: BootstrapPayload; page?: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackCategory>("idea");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* Who this goes out as. The workspace name lives on the session, not the bootstrap payload,
     so it is fetched the first time the form opens; until it arrives, or if it never does, the
     line falls back to the account. The server does its own lookup either way. */
  useEffect(() => {
    if (!open || company) return undefined;
    let cancelled = false;
    fetchSession()
      .then((session) => {
        if (!cancelled && session?.org?.name) setCompany(session.org.name);
      })
      .catch(() => {
        /* the line falls back to the account; the mail is still stamped by the server */
      });
    return () => {
      cancelled = true;
    };
  }, [open, company]);

  useEffect(() => {
    if (!open) return undefined;
    textareaRef.current?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close is stable for the life of an open dialog
  }, [open]);

  function close() {
    setOpen(false);
    setError(null);
    if (status === "sent") {
      // a sent message is done with; the next open starts clean
      setStatus("idle");
      setMessage("");
      setKind("idea");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const words = message.trim();
    if (!words || status === "sending") return;
    setStatus("sending");
    setError(null);
    try {
      await sendFeedback({ category: kind, message: words, page });
      setStatus("sent");
    } catch (failure) {
      // the words stay in the box: a failed send must never cost someone what they wrote
      setStatus("idle");
      setError(failure instanceof Error ? failure.message : "Your feedback could not be sent. Please try again.");
    }
  }

  const sender = company ?? data.account?.email ?? data.activeUser.name;

  return (
    <>
      <button type="button" className="bffb-tab" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
        <MessageSquareText size={16} aria-hidden="true" />
        Give feedback
      </button>

      {open &&
        createPortal(
          <div className="project-dialog-backdrop pdx bffb" role="presentation">
            <section
              className="project-dialog pdx-dialog pdx-confirm bffb-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="feedback-dialog-title"
              aria-describedby="feedback-dialog-description"
            >
              <div className="pdx-glow" aria-hidden="true">
                <span className="pdx-aurora pdx-aurora-1" />
                <span className="pdx-aurora pdx-aurora-2" />
              </div>
              <header className="pdx-head">
                <div>
                  <span className="pdx-eyebrow">
                    <span className="pdx-dot" />
                    Give feedback
                  </span>
                  <h2 id="feedback-dialog-title" className="pdx-title">
                    Tell us what would make BuildFlow <em>better</em>
                  </h2>
                  <p className="pdx-sub" id="feedback-dialog-description">
                    Ideas, rough edges, praise — it goes straight to the BuildFlow team, with your company's name on it, so we
                    know who to thank and who to get back to.
                  </p>
                </div>
                <button className="pdx-close" aria-label="Close Give feedback" type="button" onClick={close}>
                  <X size={18} />
                </button>
              </header>

              {status === "sent" ? (
                <div className="bffb-sent" role="status">
                  <span className="bffb-sent-mark" aria-hidden="true">
                    <Check size={22} />
                  </span>
                  <strong>Thanks — it's on its way.</strong>
                  <p>
                    Sent from <b>{sender}</b> to the BuildFlow team. Every message is read.
                  </p>
                  <div className="pdx-actions">
                    <button className="pdx-save" type="button" onClick={close}>
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form className="pdx-form bffb-form" onSubmit={submit}>
                  <div className="bffb-kinds" role="radiogroup" aria-label="What kind of feedback is this?">
                    {KINDS.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        role="radio"
                        aria-checked={kind === entry.id}
                        className="bffb-kind"
                        onClick={() => setKind(entry.id)}
                      >
                        {entry.label}
                      </button>
                    ))}
                  </div>
                  <label>
                    <span>Your feedback</span>
                    <textarea
                      ref={textareaRef}
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      placeholder="What happened, what you expected, or what you wish BuildFlow did…"
                      rows={5}
                      maxLength={4000}
                    />
                  </label>
                  <p className="bffb-sender">
                    Sending as <strong>{sender}</strong>
                    {company ? ` · ${data.activeUser.name}` : ""}
                  </p>
                  {error && (
                    <p className="form-error" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="pdx-actions">
                    <button className="pdx-cancel" type="button" onClick={close}>
                      Cancel
                    </button>
                    <button className="pdx-save" type="submit" disabled={!message.trim() || status === "sending"}>
                      <Send size={16} /> {status === "sending" ? "Sending…" : "Send feedback"}
                    </button>
                  </div>
                </form>
              )}
            </section>
          </div>,
          document.body
        )}
    </>
  );
}
