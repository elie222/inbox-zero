/** @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StepRail } from "@/components/assistant-chat/step-rail";
import type { RailStep } from "@/components/assistant-chat/step-model";

afterEach(cleanup);

function step(index: number, overrides: Partial<RailStep> = {}): RailStep {
  return {
    key: `s${index}`,
    kind: "tool",
    status: "done",
    label: `Did thing ${index}`,
    ...overrides,
  };
}

describe("StepRail", () => {
  it("renders an ordered list of steps, announced politely", () => {
    render(<StepRail steps={[step(1), step(2)]} />);

    const list = screen.getByRole("list", { name: "Assistant steps" });
    expect(list.tagName).toBe("OL");
    expect(list.getAttribute("aria-live")).toBe("polite");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  });

  it("tells running, done and failed steps apart in words as well as shape", () => {
    render(
      <StepRail
        steps={[
          step(1, {
            status: "done",
            label: "Searched inbox",
            meta: "6 emails",
          }),
          step(2, {
            status: "failed",
            label: "Couldn't read email",
            meta: "it was deleted",
          }),
          step(3, { status: "running", label: "Archiving emails…" }),
        ]}
      />,
    );

    const [done, failed, running] = screen.getAllByRole("listitem");
    expect(done.textContent).toContain("Done: Searched inbox · 6 emails");
    expect(failed.textContent).toContain(
      "Failed: Couldn't read email · it was deleted",
    );
    expect(running.textContent).toContain("Running: Archiving emails…");
    expect(done.getAttribute("data-status")).toBe("done");
    expect(failed.getAttribute("data-status")).toBe("failed");
    expect(running.getAttribute("data-status")).toBe("running");
  });

  it("renders each step's detail under its own node, outside the live region", () => {
    render(
      <StepRail
        steps={[step(1)]}
        renderDetail={() => <button type="button">Confirm</button>}
      />,
    );

    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm.closest("[aria-live='off']")).not.toBeNull();
  });

  it("shows a running 'Deciding next step…' node", () => {
    render(
      <StepRail
        steps={[
          step(1),
          {
            key: "deciding",
            kind: "transient",
            status: "running",
            label: "Deciding next step…",
          },
        ]}
      />,
    );

    expect(screen.getByText("Deciding next step…")).toBeTruthy();
  });

  it("folds earlier completed steps behind a toggle and reveals them on demand", () => {
    const steps = [
      ...Array.from({ length: 8 }, (_, i) => step(i)),
      step(8, { status: "running", label: "Archiving emails…" }),
    ];
    render(<StepRail steps={steps} />);

    const toggle = screen.getByRole("button", { name: /5 earlier steps/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/Did thing 0/)).toBeNull();
    expect(screen.getByText(/Did thing 7/)).toBeTruthy();
    expect(screen.getByText("Archiving emails…")).toBeTruthy();

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/Did thing 0/)).toBeTruthy();
  });

  it("keeps a failed step visible when the rail folds", () => {
    const steps = [
      step(0, { status: "failed", label: "Couldn't read email" }),
      ...Array.from({ length: 8 }, (_, i) => step(i + 1)),
    ];
    render(<StepRail steps={steps} />);

    expect(screen.getByText(/Couldn't read email/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /earlier steps/ })).toBeTruthy();
  });

  it("does not show a fold toggle for a short rail", () => {
    render(<StepRail steps={[step(1), step(2), step(3)]} />);

    expect(screen.queryByRole("button")).toBeNull();
  });
});
