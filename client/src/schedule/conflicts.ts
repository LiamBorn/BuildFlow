/**
 * "Concrete Crew 1 is on Riverside that day — book anyway?": the server refuses
 * to double-book a crew unless the planner chooses to. A write that answers 409
 * with the clashes is retried with `force` after the planner says yes.
 */
import type { CrewClash } from "@buildflow/shared";
import { ApiError } from "../api";

/** The clashes a 409 carried, or null when the error is something else. */
export function clashesOf(error: unknown): CrewClash[] | null {
  if (!(error instanceof ApiError) || error.status !== 409 || error.code !== "conflict") return null;
  const clashes = error.details?.clashes;
  return Array.isArray(clashes) ? (clashes as CrewClash[]) : [];
}

/** "Concrete Crew 1 is on Riverside that day" (and how many more). */
export function clashSentence(clashes: CrewClash[]): string {
  const [first] = clashes;
  if (!first) return "That crew is already booked that day";
  const more = clashes.length > 1 ? ` (and ${clashes.length - 1} more)` : "";
  return `${first.crewName} is on ${first.jobName} that day${more}`;
}

/**
 * Runs `write(false)`; when the server answers with clashes, asks, and runs
 * `write(true)` on a yes. Resolves null when the planner chose not to.
 */
export async function withConflictAsk<T>(
  write: (force: boolean) => Promise<T>,
  ask: (clashes: CrewClash[]) => Promise<boolean>
): Promise<T | null> {
  try {
    return await write(false);
  } catch (error) {
    const clashes = clashesOf(error);
    if (!clashes) throw error;
    if (!(await ask(clashes))) return null;
    return write(true);
  }
}
