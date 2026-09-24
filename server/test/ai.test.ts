/**
 * BuildFlow AI.
 *
 * Two things are worth holding down here, and neither is "does it call Claude".
 *
 * The first is the same invariant the admin portal got wrong and the sales desk got right
 * (both consoles have since left the repo):
 * when the model is not reachable, say so — never hand back an answer that did not come from
 * it. askBuildFlowAI's contract is that `answer` exists only alongside mode "live".
 *
 * The second is what leaves the building. buildAiContext decides which of a customer's
 * workspace goes into a prompt sent to a third party, so it is worth asserting what it
 * carries (operations) and what it does not (anything about the account), and that it stays
 * bounded when the workspace is large.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BootstrapPayload } from "@buildflow/shared";
import { aiConnection, askBuildFlowAI, buildAiContext, importScheduleFromImages, isAiConfigured } from "../src/ai.js";

const KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "AI_INTEGRATIONS_ANTHROPIC_API_KEY",
  "AI_INTEGRATIONS_ANTHROPIC_BASE_URL"
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** Enough of a workspace to render; every field the context reads is present. */
const workspace = (over: Partial<BootstrapPayload> = {}): BootstrapPayload =>
  ({
    projects: [
      {
        name: "Riverside Bridge Deck",
        type: "Concrete",
        percentComplete: 40,
        scheduleHealth: "At Risk",
        status: "Active",
        targetCompletion: "2026-08-01"
      }
    ],
    crews: [{ name: "Concrete Crew 1", specialty: "Concrete", lead: "Ana Lopez", size: 6, utilization: 80, status: "Active" }],
    jobs: [
      {
        name: "Pour deck",
        phase: "Pour",
        status: "At Risk",
        priority: "High",
        materialsStatus: "Missing",
        startDate: "2026-06-15",
        endDate: "2026-06-17"
      }
    ],
    ...over
  }) as unknown as BootstrapPayload;

describe("whether Claude is reachable at all", () => {
  it("is configured by either credential, and by neither when both are absent", () => {
    expect(isAiConfigured()).toBe(false);
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(isAiConfigured()).toBe(true);
    delete process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_AUTH_TOKEN = "oauth-token";
    expect(isAiConfigured(), "an OAuth token is a credential too").toBe(true);
  });

  /** Replit AI Integrations: a key for Replit's endpoint, and that endpoint's address. */
  it("is configured by Replit AI Integrations only when both its key and its address are there", () => {
    process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY = "replit-key";
    expect(isAiConfigured(), "the key alone would be sent to Anthropic, which does not know it").toBe(false);
    delete process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
    process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL = "https://replit.example/anthropic";
    expect(isAiConfigured(), "an address with no key is not a credential").toBe(false);
    process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY = "replit-key";
    expect(aiConnection()).toEqual({
      via: "replit",
      options: { apiKey: "replit-key", baseURL: "https://replit.example/anthropic" }
    });
  });

  it("prefers the operator's own Anthropic credential over the integration", () => {
    process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY = "replit-key";
    process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL = "https://replit.example/anthropic";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(aiConnection(), "the SDK reads the operator's key itself, so nothing is passed").toEqual({
      via: "anthropic",
      options: {}
    });
  });
});

/**
 * The integration's key only works at the integration's address, so both requests Claude
 * serves have to be built with the pair. Seen from the SDK's side: the options its client is
 * constructed with.
 */
describe("calling Claude through Replit AI Integrations", () => {
  it("builds the client with the integration's key and address, for questions and for imports", async () => {
    process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY = "replit-key";
    process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL = "https://replit.example/anthropic";
    const constructed: unknown[] = [];
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class {
        constructor(options: unknown) {
          constructed.push(options);
        }
        messages = {
          stream: () => ({
            finalMessage: async () => ({ content: [{ type: "text", text: '{"projects":[]}' }] })
          })
        };
      }
    }));
    vi.resetModules();
    const fresh = await import("../src/ai.js");

    const answer = await fresh.askBuildFlowAI("Which crews are free on Thursday?", "SNAPSHOT");
    await fresh.importScheduleFromImages(["data:image/png;base64,iVBORw0KGgo="], workspace());

    expect(answer.mode, "the question reached the (mocked) model").toBe("live");
    expect(constructed).toEqual([
      { apiKey: "replit-key", baseURL: "https://replit.example/anthropic" },
      { apiKey: "replit-key", baseURL: "https://replit.example/anthropic" }
    ]);
    vi.doUnmock("@anthropic-ai/sdk");
    vi.resetModules();
  });
});

describe("never answering for Claude", () => {
  /** The regression the admin portal shipped for weeks: a plausible answer from nowhere. */
  it("returns demo mode with NO answer when there is no credential", async () => {
    const result = await askBuildFlowAI("Which crews are free on Thursday?", "SNAPSHOT");
    expect(result.mode).toBe("demo");
    expect(result.answer, "a demo result must not carry text that reads as Claude's").toBeUndefined();
    expect(result).not.toHaveProperty("answer");
  });

  it("returns demo mode with no answer when the SDK call fails", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    // The module imports the SDK lazily, so the mock has to be in place before the call.
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class {
        messages = {
          stream: () => {
            throw new Error("upstream is down");
          }
        };
      }
    }));
    vi.resetModules();
    const { askBuildFlowAI: fresh } = await import("../src/ai.js");
    const result = await fresh("Anything", "SNAPSHOT");
    expect(result.mode).toBe("demo");
    expect(result.answer).toBeUndefined();
    vi.doUnmock("@anthropic-ai/sdk");
    vi.resetModules();
  });

  it("does not try to read a schedule out of nothing", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    // A video, or a paste with no image in it: there is nothing for vision to read.
    const result = await importScheduleFromImages([], workspace());
    expect(result.mode).toBe("demo");
    expect(result.plan, "an empty plan is not the same as a plan with nothing in it").toBeUndefined();
  });

  it("imports nothing without a credential", async () => {
    const result = await importScheduleFromImages(["data:image/png;base64,iVBORw0KGgo="], workspace());
    expect(result.mode).toBe("demo");
    expect(result.plan).toBeUndefined();
  });
});

describe("what the workspace snapshot carries", () => {
  it("describes the work: projects, crews, and the jobs actually in trouble", () => {
    const context = buildAiContext(workspace());
    expect(context).toContain("Riverside Bridge Deck");
    expect(context).toContain("Concrete Crew 1");
    expect(context).toContain("Pour deck");
    expect(context, "the at-risk count is the point of the jobs line").toMatch(/1 at-risk/);
    // in the words the screen uses: the job panel calls a stored High "Mandatory"
    expect(context).toContain("priority Mandatory");
  });

  /**
   * This text is sent to a third party. Operations are the point; the account behind them
   * is not, and nothing in the payload should drag one along.
   */
  it("carries nothing about the account", () => {
    const context = buildAiContext(
      workspace({
        account: { email: "dana@asphaltco.com", name: "Dana" },
        users: [{ email: "dana@asphaltco.com", name: "Dana" }]
      } as unknown as Partial<BootstrapPayload>)
    );
    expect(context).not.toContain("dana@asphaltco.com");
    expect(context).not.toMatch(/password|token|sk-ant/i);
  });

  it("stays bounded on a large workspace, while still reporting the true total", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      name: `Project ${i}`,
      type: "Concrete",
      percentComplete: 10,
      scheduleHealth: "On Track",
      status: "Active",
      targetCompletion: "2026-08-01"
    }));
    const context = buildAiContext(workspace({ projects: many } as unknown as Partial<BootstrapPayload>));

    expect(context, "the count must be honest even though the list is capped").toContain("Projects (60)");
    expect(context).toContain("Project 0");
    expect(context, "the fiftieth project is past the cap").not.toContain("Project 59");
  });

  it("renders an empty workspace instead of throwing at a brand-new account", () => {
    const context = buildAiContext({} as BootstrapPayload);
    expect(context).toContain("WORKSPACE SNAPSHOT");
    expect(context).toContain("Projects (0)");
    expect(context).toContain("Crews (0)");
  });
});
