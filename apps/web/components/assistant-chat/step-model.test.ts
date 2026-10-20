import { describe, expect, it } from "vitest";
import {
  buildSegments,
  formatRunFooter,
  getFoldedSteps,
  type RailStep,
} from "./step-model";
import type { ChatMessage } from "./types";

type Parts = ChatMessage["parts"];

function tool(
  type: string,
  state: string,
  extra: { input?: unknown; output?: unknown; errorText?: string } = {},
  id = `${type}-${state}`,
) {
  return { type, toolCallId: id, state, ...extra } as unknown as Parts[number];
}

function build(parts: Parts, isStreaming = false) {
  return buildSegments(parts, { messageId: "m1", isStreaming });
}

function stepsOf(parts: Parts, isStreaming = false) {
  const [segment] = build(parts, isStreaming);
  return segment?.type === "rail" ? segment.steps : [];
}

describe("step states", () => {
  it("maps both pre-result tool states to running with a present-progressive label", () => {
    const streaming = stepsOf([
      tool("tool-searchInbox", "input-streaming", {}, "a"),
    ]);
    const available = stepsOf([
      tool("tool-searchInbox", "input-available", {
        input: { query: "Chase" },
      }),
    ]);

    expect(streaming[0]).toMatchObject({
      status: "running",
      label: "Searching inbox…",
    });
    expect(available[0]).toMatchObject({
      status: "running",
      label: "Searching inbox for Chase…",
    });
  });

  it("maps a finished tool to done with a past-tense label and a result", () => {
    const [step] = stepsOf([
      tool("tool-searchInbox", "output-available", {
        input: { query: "Chase" },
        output: { messages: new Array(6).fill({}) },
      }),
    ]);

    expect(step).toMatchObject({
      status: "done",
      label: "Searched inbox for Chase",
      meta: "6 emails",
    });
  });

  it.each([
    ["an error in the output", { error: "Failed to search inbox" }, undefined],
    ["a success:false output", { success: false, message: "Nope" }, undefined],
  ])("maps %s to failed with the reason", (_name, output) => {
    const [step] = stepsOf([
      tool("tool-searchInbox", "output-available", {
        input: { query: "Chase" },
        output,
      }),
    ]);

    expect(step.status).toBe("failed");
    expect(step.label).toBe("Couldn't search inbox for Chase");
    expect(step.meta).toBe(
      "error" in output ? "Failed to search inbox" : "Nope",
    );
  });

  it("maps the output-error state to failed", () => {
    const [step] = stepsOf([
      tool("tool-readEmail", "output-error", {
        errorText: "Message not found",
      }),
    ]);

    expect(step).toMatchObject({
      status: "failed",
      label: "Couldn't read email",
      meta: "Message not found",
    });
  });

  it("keeps a failed step without a reason when the error is hidden from the user", () => {
    const [step] = stepsOf([
      tool("tool-readEmail", "output-available", {
        output: { error: "boom", toolErrorVisibility: "hidden" },
      }),
    ]);

    expect(step).toMatchObject({
      status: "failed",
      label: "Couldn't read email",
      meta: undefined,
    });
  });

  it("names the subject of a read email", () => {
    const [step] = stepsOf([
      tool("tool-readEmail", "output-available", {
        output: { subject: "Statement ready" },
      }),
    ]);

    expect(step.label).toBe('Read email "Statement ready"');
  });

  it.each([
    [
      { apply: false },
      { results: [{ ruleName: "Bills" }] },
      "Previewed your rules",
      "matched Bills",
    ],
    [
      { apply: true },
      { results: [{ ruleName: "Bills" }] },
      "Ran your rules",
      "matched Bills",
    ],
    [
      { apply: false },
      { results: [{ ruleName: null }] },
      "Previewed your rules",
      "no rule matched",
    ],
  ])("labels runRulesOnEmail %j", (input, output, label, meta) => {
    const [step] = stepsOf([
      tool("tool-runRulesOnEmail", "output-available", { input, output }),
    ]);

    expect(step).toMatchObject({ status: "done", label, meta });
  });

  it("labels a running runRulesOnEmail by whether it applies", () => {
    const preview = stepsOf([
      tool("tool-runRulesOnEmail", "input-available", {
        input: { apply: false },
      }),
    ]);
    const apply = stepsOf([
      tool("tool-runRulesOnEmail", "input-available", {
        input: { apply: true },
      }),
    ]);

    expect(preview[0].label).toBe("Previewing your rules…");
    expect(apply[0].label).toBe("Running your rules…");
  });

  it("falls back to a readable label for tools without one", () => {
    const [running] = stepsOf([tool("tool-getFooBar", "input-available")]);
    const [done] = stepsOf([tool("tool-getFooBar", "output-available")]);

    expect(running.label).toBe("Running get foo bar…");
    expect(done.label).toBe("Completed get foo bar");
  });

  it("flags a pending confirmation so the step is never folded away", () => {
    const [step] = stepsOf([
      tool("tool-sendEmail", "output-available", {
        output: {
          success: true,
          requiresConfirmation: true,
          confirmationState: "pending",
        },
      }),
    ]);

    expect(step).toMatchObject({
      status: "done",
      needsAction: true,
      meta: "waiting for you",
    });
  });
});

describe("rails and segments", () => {
  const text = { type: "text", text: "Here you go" } as Parts[number];

  it("groups consecutive tool and reasoning parts into one rail", () => {
    const segments = build([
      {
        type: "reasoning",
        text: "Let me look",
        state: "done",
      } as Parts[number],
      tool("tool-searchInbox", "output-available", {}, "a"),
      tool("tool-readEmail", "output-available", {}, "b"),
    ]);

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ type: "rail" });
    expect(
      stepsOf([
        {
          type: "reasoning",
          text: "Let me look",
          state: "done",
        } as Parts[number],
        tool("tool-searchInbox", "output-available", {}, "a"),
      ]).map((step) => step.kind),
    ).toEqual(["reasoning", "tool"]);
  });

  it("starts a new rail after a text part", () => {
    const segments = build([
      tool("tool-searchInbox", "output-available", {}, "a"),
      text,
      tool("tool-readEmail", "output-available", {}, "b"),
    ]);

    expect(segments.map((segment) => segment.type)).toEqual([
      "rail",
      "part",
      "rail",
    ]);
  });

  it("skips empty reasoning and step-start parts without breaking the rail", () => {
    const segments = build([
      tool("tool-searchInbox", "output-available", {}, "a"),
      { type: "step-start" } as Parts[number],
      { type: "reasoning", text: "", state: "done" } as Parts[number],
      tool("tool-readEmail", "output-available", {}, "b"),
    ]);

    expect(segments).toHaveLength(1);
    expect(segments[0].type === "rail" && segments[0].steps).toHaveLength(2);
  });

  it("shows a live reasoning step as running, and as done once it is over", () => {
    const part = (state: "streaming" | "done") =>
      ({ type: "reasoning", text: "Hmm", state }) as Parts[number];

    expect(stepsOf([part("streaming")], true)[0]).toMatchObject({
      status: "running",
      label: "Thinking…",
    });
    expect(stepsOf([part("done")], false)[0]).toMatchObject({
      status: "done",
      label: "Thought",
    });
  });

  it("adds 'Deciding next step…' while streaming after a finished tool", () => {
    const parts = [tool("tool-searchInbox", "output-available", {}, "a")];

    expect(stepsOf(parts, true).at(-1)).toMatchObject({
      status: "running",
      label: "Deciding next step…",
    });
    expect(stepsOf(parts, false)).toHaveLength(1);
  });

  it("also decides after a failed tool, but not while a tool is still running or text follows", () => {
    const failed = [
      tool(
        "tool-searchInbox",
        "output-available",
        { output: { error: "x" } },
        "a",
      ),
    ];
    const running = [tool("tool-searchInbox", "input-available", {}, "a")];

    expect(stepsOf(failed, true).at(-1)?.label).toBe("Deciding next step…");
    expect(stepsOf(running, true)).toHaveLength(1);

    const withText = build(
      [tool("tool-searchInbox", "output-available", {}, "a"), text],
      true,
    );
    expect(
      withText.flatMap((segment) =>
        segment.type === "rail" ? segment.steps : [],
      ),
    ).toHaveLength(1);
  });
});

describe("folding", () => {
  const done = (index: number, needsAction = false): RailStep => ({
    key: `s${index}`,
    kind: "tool",
    status: "done",
    label: `Step ${index}`,
    needsAction,
  });

  it("leaves a rail of six or fewer completed steps alone", () => {
    expect(
      getFoldedSteps(Array.from({ length: 6 }, (_, i) => done(i))).size,
    ).toBe(0);
  });

  it("folds the earlier completed steps once there are more than six", () => {
    const steps = Array.from({ length: 8 }, (_, i) => done(i));
    const folded = getFoldedSteps(steps);

    expect([...folded].map((step) => step.key)).toEqual([
      "s0",
      "s1",
      "s2",
      "s3",
      "s4",
    ]);
  });

  it("never folds running, failed or action-needing steps", () => {
    const steps: RailStep[] = [
      { ...done(0), status: "failed" },
      { ...done(1), status: "running" },
      done(2, true),
      ...Array.from({ length: 8 }, (_, i) => done(i + 3)),
    ];
    const keys = [...getFoldedSteps(steps)].map((step) => step.key);

    expect(keys).not.toContain("s0");
    expect(keys).not.toContain("s1");
    expect(keys).not.toContain("s2");
    expect(keys.length).toBeGreaterThan(0);
  });
});

describe("formatRunFooter", () => {
  it("joins model, thinking mode and seconds", () => {
    expect(
      formatRunFooter({
        model: "gemma4 12B",
        thinking: "off",
        durationMs: 8400,
      }),
    ).toBe("gemma4 12B · Thinking off · 8.4 s");
  });

  it("says thinking was on when the message holds reasoning, whatever the setting", () => {
    const parts = [
      { type: "reasoning", text: "Let me look.", state: "done" },
    ] as unknown as Parts;
    expect(
      formatRunFooter({ model: "gemma4 12B", thinking: "off" }, parts),
    ).toBe("gemma4 12B · Thinking on");
    expect(formatRunFooter({ thinking: "off" }, [])).toBe("Thinking off");
  });

  it("leaves out what the run did not report", () => {
    expect(formatRunFooter({ model: "claude-sonnet", durationMs: 2000 })).toBe(
      "claude-sonnet · 2.0 s",
    );
    expect(formatRunFooter({})).toBeNull();
    expect(formatRunFooter(undefined)).toBeNull();
  });
});
