/**
 * The assistant asks before it changes anything.
 *
 * WHY THIS EXISTS. BuildFlow AI could already rewrite a workspace — "switch from
 * another scheduler" reads a photo of someone's old schedule and creates the projects,
 * jobs and bookings it finds — and it did that the moment it finished reading, with no
 * way to see the change first or to say no. This is the prompt that stands in front of
 * it: the assistant posts what is there now beside what it proposes, marks what would
 * change, and waits. Nothing is written until the reader accepts.
 *
 * WHAT IT LOOKS LIKE. The reference the user gave: the current state in a plain block,
 * the proposal underneath it in a block with the assistant's mark on it, the changed
 * words highlighted inside the sentence rather than described above it, and one row of
 * actions — amend it, refuse it, or accept it.
 *
 * WHY `del` AND `ins`. The marked runs are real removals and additions, so they are the
 * elements HTML has for exactly that: a screen reader announces them as deleted and
 * inserted text instead of reading a colour it cannot see. The skin (section 62) gives
 * them the program's bad and ok tones.
 */
import { useState } from "react";
import { CheckSquare, PencilLine, Sparkles, SquareMinus } from "lucide-react";

/** A stretch of the sentence: unchanged, or marked as taken out / put in. */
export type ProposalRun = { text: string; mark?: "removed" | "added" };
export type AiProposalSide = { label: string; runs: ProposalRun[] };

export type AiProposal = {
  id: string;
  /** What the workspace says today. */
  before: AiProposalSide;
  /** What the assistant would make it say. */
  after: AiProposalSide;
  /** The accept button's words, which name the change rather than agreeing in the abstract. */
  acceptLabel: string;
  /** Run only when the reader accepts. Anything it throws is the caller's to report. */
  apply: () => void | Promise<void>;
  /** What "Edit" should do — usually put the proposal back in the composer to amend. */
  onEdit?: () => void;
};

/**
 * What an `apply` throws when it wants its OWN words on the card — "I couldn't reach the
 * schedule service", not a stack. Anything else it throws is reported in the card's
 * general terms, so a raw `TypeError: Failed to fetch` never reaches a reader.
 */
export class ProposalFailed extends Error {}

function Sentence({ side }: { side: AiProposalSide }) {
  return (
    <p className="bfai-prop-text">
      {side.runs.map((run, index) => {
        if (run.mark === "removed") return <del key={index}>{run.text}</del>;
        if (run.mark === "added") return <ins key={index}>{run.text}</ins>;
        return <span key={index}>{run.text}</span>;
      })}
    </p>
  );
}

/**
 * The card, with its own resolved state: once a proposal is accepted or refused it stays
 * in the thread as a record of what was decided, because the thread IS the record — the
 * buttons would otherwise invite a second accept on a change already made.
 */
export function AiProposalCard({ proposal }: { proposal: AiProposal }) {
  const [state, setState] = useState<"open" | "working" | "accepted" | "rejected">("open");
  const [failed, setFailed] = useState<string | null>(null);

  const accept = async () => {
    if (state !== "open") return;
    setState("working");
    setFailed(null);
    try {
      await proposal.apply();
      setState("accepted");
    } catch (error) {
      /* The change did not land, so the proposal goes back to open: a reader who sees
         "couldn't apply" has to be able to try again or refuse. An apply that throws a
         ProposalFailed is telling the reader something specific; say that instead. */
      setFailed(
        error instanceof ProposalFailed
          ? error.message
          : "I couldn't apply that — nothing was changed. Try again, or reject it."
      );
      setState("open");
    }
  };

  return (
    <section className="bfai-prop" aria-label="Suggested change, waiting for you">
      <div className="bfai-prop-block">
        <h4>{proposal.before.label}</h4>
        <Sentence side={proposal.before} />
      </div>
      <div className="bfai-prop-block is-suggested">
        <h4>
          <Sparkles size={14} aria-hidden="true" />
          {proposal.after.label}
        </h4>
        <Sentence side={proposal.after} />
        {state === "open" && (
          <div className="bfai-prop-actions">
            {proposal.onEdit && (
              <button type="button" className="bfai-prop-edit" onClick={proposal.onEdit}>
                <PencilLine size={15} aria-hidden="true" /> Edit
              </button>
            )}
            <button type="button" className="bfai-prop-reject" onClick={() => setState("rejected")}>
              <SquareMinus size={15} aria-hidden="true" /> Reject
            </button>
            <button type="button" className="bfai-prop-accept" onClick={() => void accept()}>
              <CheckSquare size={15} aria-hidden="true" /> {proposal.acceptLabel}
            </button>
          </div>
        )}
        {state === "working" && (
          <p className="bfai-prop-state" role="status">
            Applying it…
          </p>
        )}
        {state === "accepted" && (
          <p className="bfai-prop-state is-accepted" role="status">
            Accepted — the change is in.
          </p>
        )}
        {state === "rejected" && (
          <p className="bfai-prop-state" role="status">
            Rejected — nothing changed.
          </p>
        )}
        {failed && (
          <p className="bfai-prop-state is-failed" role="alert">
            {failed}
          </p>
        )}
      </div>
    </section>
  );
}
