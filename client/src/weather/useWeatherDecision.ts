/**
 * What a person can do about one job day WeatherIQ flagged, wherever the day is shown: the
 * WeatherIQ drawer on the Dashboard, and the WeatherIQ card in the job panel every schedule page
 * opens (2026-09-23). One set of rules in two places — call the day off or keep it on, then decide
 * the reschedule the call-off raised — so the two can never offer different things for the same day.
 *
 * Calling a day off answers with the reschedule it raised. That variance is held here until the
 * page's own data has it, so the suggestion shows the moment the day is called off, not a reload
 * later.
 */
import { useState } from "react";
import type { BootstrapPayload, ScheduleVariance, WeatherConflict } from "@buildflow/shared";
import { acceptVariance, cancelWeatherConflict, keepWeatherConflict, rejectVariance } from "../api";
import { rowState, uncheckedReason } from "./weatherIQ";

export type DecisionBusy = "" | "cancel" | "keep" | "accept" | "reject";

export function useWeatherDecision(
  conflict: WeatherConflict,
  data: Pick<BootstrapPayload, "users" | "variances" | "activeUser">,
  /** Read the page's data and the forecast again, so everything showing the day shows what changed. */
  onChanged: () => Promise<void>
) {
  const [busy, setBusy] = useState<DecisionBusy>("");
  const [error, setError] = useState("");
  // the reschedule a call-off raised, until the page's own data has it
  const [raised, setRaised] = useState<ScheduleVariance | null>(null);

  const variances = raised && !data.variances.some((item) => item.id === raised.id) ? [...data.variances, raised] : data.variances;
  const variance = conflict.varianceId ? variances.find((item) => item.id === conflict.varianceId) : undefined;
  const proposal = variance?.proposal;
  const person = (id?: string) => (id ? data.users.find((user) => user.id === id) : undefined);
  const inCharge = person(conflict.assigneeId);
  const decider = person(conflict.decidedBy);

  async function run(kind: DecisionBusy, work: () => Promise<void>) {
    if (busy) return;
    setBusy(kind);
    setError("");
    try {
      await work();
      await onChanged();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That could not be saved. Try again.");
    } finally {
      setBusy("");
    }
  }

  return {
    busy,
    error,
    state: rowState(conflict, variances),
    variance,
    proposal,
    /** Why the reschedule's dates were never checked against the forecast, or "" when they were. */
    unchecked: proposal ? uncheckedReason(proposal, conflict.date) : "",
    inCharge,
    /** Who decided it, as a sentence names them: "you", a name, or "someone". */
    who: decider ? (decider.id === data.activeUser?.id ? "you" : decider.name) : "someone",
    /** What someone who cannot decide it is told instead of the buttons. */
    nobody: `Only the Workspace Owner or an Admin can decide this${inCharge ? `; ${inCharge.name} is in charge of the job` : ""}.`,
    callOff: () =>
      run("cancel", async () => {
        const result = await cancelWeatherConflict(conflict.id);
        setRaised(result.variance);
      }),
    keepOn: () => run("keep", async () => void (await keepWeatherConflict(conflict.id))),
    reschedule: () => run("accept", async () => void (variance && (await acceptVariance(variance.id, data.activeUser.id)))),
    notNow: () => run("reject", async () => void (variance && (await rejectVariance(variance.id, data.activeUser.id))))
  };
}
