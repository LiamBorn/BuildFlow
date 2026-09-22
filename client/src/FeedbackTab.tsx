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
import { Check, MessageSquareText, Paperclip, Send, X } from "lucide-react";
import type { BootstrapPayload } from "@buildflow/shared";
import { fetchSession, sendFeedback, type FeedbackCategory } from "./api";

/**
 * What may come with a message. Three files and 10MB between them: base64 inflates
 * a payload by about a third, so 10MB arrives as ~13.3MB against the server's 25MB
 * body limit, and lands well inside the 25MB most inboxes accept. The TYPE is not
 * restricted — a screen recording is as good a bug report as a screenshot, and a
 * declared MIME type is the sender's claim anyway, so size and count are the real
 * controls.
 */
const MAX_FILES = 3;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

type Attachment = { id: string; name: string; type: string; size: number; dataUrl: string };

const readAsDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });

const fileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  // a round number reads as "10 MB", not "10.0 MB" — the cap in the hint is always round
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
};

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
  const [files, setFiles] = useState<Attachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
      setFiles([]);
    }
  }

  /** Take what the picker gave us, as far as the budget goes, and say so if it does not all fit. */
  async function addFiles(chosen: FileList | null) {
    if (!chosen?.length) return;
    setError(null);
    const room = MAX_FILES - files.length;
    if (room <= 0) {
      setError(`You can attach up to ${MAX_FILES} files.`);
      return;
    }
    let total = files.reduce((sum, file) => sum + file.size, 0);
    const added: Attachment[] = [];
    let refused: string | null = null;
    for (const file of Array.from(chosen).slice(0, room)) {
      if (total + file.size > MAX_TOTAL_BYTES) {
        refused = `“${file.name}” would take this over ${fileSize(MAX_TOTAL_BYTES)}.`;
        continue;
      }
      try {
        added.push({
          id: `${file.name}-${file.size}-${file.lastModified}`,
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          dataUrl: await readAsDataUrl(file)
        });
        total += file.size;
      } catch {
        refused = `“${file.name}” could not be read.`;
      }
    }
    if (chosen.length > room) refused = `You can attach up to ${MAX_FILES} files.`;
    // the id keeps the same file from being attached twice
    if (added.length) setFiles((current) => [...current, ...added.filter((one) => !current.some((had) => had.id === one.id))]);
    if (refused) setError(refused);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const words = message.trim();
    if (!words || status === "sending") return;
    setStatus("sending");
    setError(null);
    try {
      await sendFeedback({
        category: kind,
        message: words,
        page,
        // left off the body entirely when there is nothing attached, so the common
        // message is the same request it has always been
        ...(files.length ? { attachments: files.map(({ name, type, dataUrl }) => ({ name, type, dataUrl })) } : {})
      });
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
                    Ideas, rough edges, praise — it goes straight to the BuildFlow team, with your company's name on it, so we know who to
                    thank and who to get back to.
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
                  <div className="bffb-attach">
                    <input
                      ref={fileRef}
                      className="bffb-file-input"
                      type="file"
                      multiple
                      aria-label="Attach a file"
                      onChange={(event) => {
                        void addFiles(event.target.files);
                        // cleared so picking the SAME file again still fires a change
                        event.target.value = "";
                      }}
                    />
                    <div className="bffb-attach-row">
                      <button
                        type="button"
                        className="bffb-attach-btn"
                        onClick={() => fileRef.current?.click()}
                        disabled={files.length >= MAX_FILES}
                      >
                        <Paperclip size={15} aria-hidden="true" />
                        {files.length ? "Add another" : "Add an attachment"}
                      </button>
                      <span className="bffb-attach-hint">
                        A screenshot or a recording helps · up to {MAX_FILES} files, {fileSize(MAX_TOTAL_BYTES)} in all
                      </span>
                    </div>
                    {files.length > 0 && (
                      <ul className="bffb-files">
                        {files.map((file) => (
                          <li key={file.id} className="bffb-file-chip">
                            <span className="bffb-file-name" title={file.name}>
                              {file.name}
                            </span>
                            <span className="bffb-file-size">{fileSize(file.size)}</span>
                            <button
                              type="button"
                              aria-label={`Remove ${file.name}`}
                              onClick={() => setFiles((current) => current.filter((one) => one.id !== file.id))}
                            >
                              <X size={13} aria-hidden="true" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
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
