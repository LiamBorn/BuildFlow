/**
 * "Who runs the work with you?" — the signup flow's last step (2026-09-22), `#invite-team`, on the
 * same page as the five steps before it and the four single screens beside them.
 *
 * It is the tail of the flow, so it carries the flow's progress block — full, and labelled "Last
 * step" — rather than the single screens' offset: the bar the person watched fill across the five
 * steps finishes here. It is not numbered as a sixth; the flow is five steps and this comes after
 * the workspace already exists.
 *
 * THE CARD mirrors the one an invitee sees on `#accept-invite`: the workspace's own name over its
 * Projects page — the work the question is about — and here the people being invited queue into
 * a tray at its foot as their addresses are typed. The name comes from the session, because the
 * workspace was created two steps ago and is not on the bootstrap payload.
 *
 * Nothing is sent until the button says so: an empty form's primary button is "Skip for now", and
 * it becomes "Send invites" only once an address is in.
 */
import { useEffect, useState, type FormEvent } from "react";
import { ChevronDown, X } from "lucide-react";
import { invitablePermissionLevels, permissionLevelLabels, type PermissionLevel } from "@buildflow/shared";
import { fetchSession, sendInvites, type InviteResult } from "../api";
import { EVENTS, track } from "../analytics";
import { SelectMenuLayer } from "../components/ui/selectMenu";
import { checkInviteRows } from "../invites";
import { AuthShell } from "./AuthShell";
import { Beats } from "./Beats";
import { OnboardingPreview } from "./OnboardingPreview";
import { usePaneSwap } from "./usePaneSwap";

/** A draft row. The id is only for React: a row removed from the middle must not hand its
    DOM — and the cursor in it — to the row that slides up into its place. */
type Row = { id: number; email: string; permission: PermissionLevel };
const MAX_ROWS = 20;

type Stage = "form" | "sent";

/** What the answer screen says, from what actually happened to each address. */
function outcome(results: InviteResult[]): { title: string; lede: string } {
  const sent = results.filter((r) => r.status === "sent").length;
  const held = results.filter((r) => r.status === "held").length;
  if (sent + held === 0) {
    return { title: "No one new to invite.", lede: "Every address was already on the team or couldn't be invited. The reasons are below." };
  }
  if (sent === 0) {
    return {
      title: "Your invites are waiting on you.",
      lede: "They go out the moment you confirm your email — the link is in the message we sent you at signup."
    };
  }
  return { title: "Invites sent.", lede: "Each person gets an email with a link that puts them straight into this workspace." };
}

export function InviteTeamPage({ onDone }: { onDone: () => void }) {
  const [rows, setRows] = useState<Row[]>(() => [
    { id: 1, email: "", permission: "admin" },
    { id: 2, email: "", permission: "member" },
    { id: 3, email: "", permission: "member" }
  ]);
  const [nextId, setNextId] = useState(4);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<InviteResult[] | null>(null);
  const { current: stage, leaving, go } = usePaneSwap<Stage>("form");

  /* The workspace was created two steps ago; its name is the session's, not the payload's. */
  const [org, setOrg] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetchSession()
      .then((session) => {
        if (!cancelled && session?.org?.name) setOrg(session.org.name);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (id: number, patch: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    // an edited row's complaint no longer applies; the others' still do
    const index = rows.findIndex((row) => row.id === id);
    if (errors[index] || formError) {
      setErrors((current) => {
        const next = { ...current };
        delete next[index];
        return next;
      });
      setFormError("");
    }
  };
  const remove = (id: number) => {
    setRows((current) => current.filter((row) => row.id !== id));
    setErrors({});
  };
  const add = () => {
    setRows((current) => [...current, { id: nextId, email: "", permission: "member" }]);
    setNextId((id) => id + 1);
  };

  const anyTyped = rows.some((row) => row.email.trim());

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const { valid, errors: problems } = checkInviteRows(rows.map(({ email, permission }) => ({ email, permission })));
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    if (valid.length === 0) {
      onDone();
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const response = await sendInvites(valid);
      track(EVENTS.invitesSent, {
        count: valid.length,
        held: response.results.filter((result) => result.status === "held").length,
        source: "onboarding"
      });
      setResults(response.results);
      go("sent");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  /* The tray on the card: the addresses typed so far, or — once sent — the ones that went. */
  const tray =
    results?.filter((result) => result.status !== "skipped").map((result) => {
      const row = rows.find((r) => r.email.trim().toLowerCase() === result.email);
      return { email: result.email, level: permissionLevelLabels[row?.permission ?? "member"] };
    }) ??
    rows.filter((row) => row.email.trim()).map((row) => ({ email: row.email.trim(), level: permissionLevelLabels[row.permission] }));

  const said = results ? outcome(results) : null;
  return (
    <AuthShell
      id="invite-team"
      /* the logo goes home, and home is the workspace now — it was made two steps ago. Its own
         name, not "Open BuildFlow": the answer screen's button already has that one, and two
         controls sharing a name are one control to anyone navigating by them. */
      onBack={onDone}
      backLabel="Go to your workspace"
      paneKey={stage}
      leaving={leaving}
      progress={{ label: "Last step", fill: 1 }}
      preview={<OnboardingPreview step={2} firstName="" lastName="" businessName={org} trade={null} revenueLabel={null} teamLabel={null} invites={tray} />}
    >
      {/* Each row's access level opens the program's own list, not the system's. The shell mounts
          this layer beside its other overlays, but the shell is not on the welcome page, so the
          step carries one — the way the five-step flow carries its own travelling pill. */}
      <SelectMenuLayer />
      {stage === "sent" && said && results ? (
        <Beats>
          <h1 className="onb-h1" id="onb-title">
            {said.title}
          </h1>
          <p className="onb-sub">{said.lede}</p>
          <ul className="onb-results">
            {results.map((result) => (
              <li key={result.email} data-status={result.status}>
                <b>{result.email}</b>
                <span>
                  {result.status === "sent" ? "Invite sent" : result.status === "held" ? "Sends once you confirm your email" : (result.reason ?? "Skipped")}
                </span>
              </li>
            ))}
          </ul>
          <div className="onb-actions">
            <button type="button" className="onb-btn onb-btn-primary" onClick={onDone}>
              Open BuildFlow
            </button>
          </div>
        </Beats>
      ) : (
        <form className="onb-form" onSubmit={submit} noValidate>
          <Beats>
            <h1 className="onb-h1" id="onb-title">
              Who runs the work with you?
            </h1>
            <p className="onb-sub">
              Invite your supers and crew leads now, or later from Settings. Each gets an email with a link straight into this workspace.
            </p>
            {/* one beat for the whole list, so adding or removing a row never re-keys the cascade */}
            <div className="onb-invites">
              {rows.map((row, index) => (
                <div className="onb-invite-row" key={row.id}>
                  <label className="onb-sr-only" htmlFor={`invite-email-${row.id}`}>
                    Email {index + 1}
                  </label>
                  <input
                    id={`invite-email-${row.id}`}
                    className={`onb-input${errors[index] ? " is-invalid" : ""}`}
                    type="email"
                    value={row.email}
                    placeholder="teammate@company.com"
                    autoComplete="off"
                    onChange={(event) => update(row.id, { email: event.target.value })}
                    aria-invalid={errors[index] ? true : undefined}
                  />
                  <label className="onb-sr-only" htmlFor={`invite-level-${row.id}`}>
                    Access level {index + 1}
                  </label>
                  <div className="onb-select">
                    <select
                      id={`invite-level-${row.id}`}
                      className="onb-input"
                      value={row.permission}
                      onChange={(event) => update(row.id, { permission: event.target.value as PermissionLevel })}
                    >
                      {invitablePermissionLevels.map((level) => (
                        <option key={level} value={level}>
                          {permissionLevelLabels[level]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown aria-hidden="true" />
                  </div>
                  {rows.length > 1 ? (
                    <button type="button" className="onb-invite-remove" aria-label={`Remove row ${index + 1}`} onClick={() => remove(row.id)}>
                      <X aria-hidden="true" />
                    </button>
                  ) : (
                    <span className="onb-invite-remove is-spacer" aria-hidden="true" />
                  )}
                  {errors[index] && (
                    <p className="onb-error onb-invite-error" role="alert">
                      {errors[index]}
                    </p>
                  )}
                </div>
              ))}
              {rows.length < MAX_ROWS && (
                <button type="button" className="onb-link onb-invite-add" onClick={add}>
                  + Add another
                </button>
              )}
            </div>
            <div className="onb-form-note">
              {formError && (
                <p className="onb-error" role="alert">
                  {formError}
                </p>
              )}
            </div>
            <div className="onb-actions">
              <button type="submit" className="onb-btn onb-btn-primary" disabled={busy}>
                {busy ? "Sending…" : anyTyped ? "Send invites" : "Skip for now"}
              </button>
              {anyTyped && (
                <button type="button" className="onb-link" onClick={onDone} disabled={busy}>
                  Skip for now
                </button>
              )}
            </div>
          </Beats>
        </form>
      )}
    </AuthShell>
  );
}
