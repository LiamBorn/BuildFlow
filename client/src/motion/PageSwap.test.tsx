/**
 * The page you are leaving — docs/motion-spec.md §4's route transition.
 *
 * The whole difficulty is the 180ms when the document holds TWO pages. These
 * cases are about the one that is leaving counting for nothing while it goes:
 * unreachable, unannounced, and eventually gone.
 */
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PageSwap } from "./PageSwap";
import { DUR, ms } from "./tokens";

const Page = ({ page }: { page: string }) => (
  <PageSwap page={page}>
    <h1>{page}</h1>
    <button type="button">act on {page}</button>
  </PageSwap>
);

afterEach(cleanup);

describe("PageSwap", () => {
  it("shows the page it is given", () => {
    render(<Page page="dashboard" />);
    expect(screen.getByRole("heading", { name: "dashboard" })).toBeInTheDocument();
  });

  it("keeps the page it is leaving, but takes it out of everyone's reach", async () => {
    const { rerender } = render(<Page page="dashboard" />);
    rerender(<Page page="projects" />);

    // both are in the document for the length of the exit...
    const wrappers = document.querySelectorAll(".bfm-page");
    expect(wrappers).toHaveLength(2);
    const leaving = [...wrappers].find((w) => w.textContent?.includes("dashboard"))!;
    const arriving = [...wrappers].find((w) => w.textContent?.includes("projects"))!;

    // ...but only one of them is a page anyone can reach
    expect(leaving.getAttribute("aria-hidden"), "hidden from the accessibility tree").toBe("true");
    expect(leaving.hasAttribute("inert"), "and out of the tab order").toBe(true);
    expect(arriving.getAttribute("aria-hidden")).toBeNull();
    expect(arriving.hasAttribute("inert")).toBe(false);

    // which is why a query for "the heading" finds exactly one. Before this,
    // every such query in the suite found two and threw.
    expect(screen.getByRole("heading", { name: "projects" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "dashboard" }), "the leaving page answers nothing").toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("lets the page it is leaving go, rather than piling them up", async () => {
    const { rerender } = render(<Page page="dashboard" />);
    rerender(<Page page="projects" />);
    expect(document.querySelectorAll(".bfm-page")).toHaveLength(2);

    await waitFor(() => expect(document.querySelectorAll(".bfm-page")).toHaveLength(1), { timeout: ms(DUR.exit) + 800 });
    expect(document.querySelector(".bfm-page")?.textContent).toContain("projects");
  });

  it("never holds the arriving page back — it is there in the same tick", () => {
    // §9.6: motion may not delay interactivity. `mode="wait"` would have been
    // simpler and would have left no page at all for the length of the exit.
    const { rerender } = render(<Page page="dashboard" />);
    rerender(<Page page="projects" />);
    expect(screen.getByRole("button", { name: "act on projects" })).toBeInTheDocument();
  });
});
