import { describe, expect, it } from "vitest";
import {
  applyConsistencyGuards,
  SEND_READY_SYSTEM_PROMPT,
} from "@/__tests__/eval/harness/send-ready-judge-contract";
import { USABILITY_OUTCOMES } from "@/__tests__/eval/harness/taxonomy";

/**
 * A markdown backtick inside this template literal silently terminates the
 * string: the file still parses, every other test still passes, and the judge
 * quietly runs on a truncated prompt. That happened once. These assertions
 * check the prompt survives end to end rather than checking its wording, so
 * they do not fight normal edits.
 */
describe("SEND_READY_SYSTEM_PROMPT", () => {
  it("reaches its last line, so the template literal was not cut short", () => {
    expect(SEND_READY_SYSTEM_PROMPT).toContain(
      "usability: one of the three outcomes above",
    );
  });

  it("defines every usability outcome the schema accepts", () => {
    for (const outcome of USABILITY_OUTCOMES) {
      expect(SEND_READY_SYSTEM_PROMPT).toContain(outcome);
    }
  });

  it("still carries the sections the calibration run was scored against", () => {
    expect(SEND_READY_SYSTEM_PROMPT).toContain("## Calibration");
    expect(SEND_READY_SYSTEM_PROMPT).toContain(
      "## The three usability outcomes",
    );
    expect(SEND_READY_SYSTEM_PROMPT).toContain("## What is NOT a failure");
  });

  /**
   * The prompt was recalibrated after it failed 95% of text real people wrote
   * and sent. The production base rate it used to quote is what drove that, so
   * its return would invalidate the calibration without any other signal.
   */
  it("does not reintroduce the production base-rate prior", () => {
    expect(SEND_READY_SYSTEM_PROMPT).not.toContain("9.8%");
    expect(SEND_READY_SYSTEM_PROMPT.toLowerCase()).not.toContain("base rate");
  });
});

/**
 * The three usability outcomes exist so a draft that leaves an honest blank is
 * not scored the same as one that invented the missing value. That only holds
 * if needs-fill really means "complete apart from one slot", so the guards
 * reconcile the model's own findings against the label it chose.
 */
describe("usability guards", () => {
  it("keeps needs-fill when the draft only leaves a slot to fill", () => {
    expect(guardedUsability({ usability: "needs-fill" })).toBe("needs-fill");
  });

  it("demotes needs-fill when the draft asserted something unsupported", () => {
    expect(
      guardedUsability({
        usability: "needs-fill",
        unsupportedClaims: ["the renewal was cancelled on 1 June"],
      }),
    ).toBe("not-usable");
  });

  /**
   * A silently unanswered ask is not one slot to fill: the sender has to notice
   * the omission first, which is the work needs-fill claims to have done.
   */
  it("demotes needs-fill when an ask went unanswered", () => {
    expect(
      guardedUsability({
        usability: "needs-fill",
        unaddressedAsks: ["what is the SLA for P1 tickets"],
      }),
    ).toBe("not-usable");
  });

  it("forces send-ready to agree with the sendReady flag", () => {
    expect(guardedUsability({ sendReady: true, usability: "not-usable" })).toBe(
      "send-ready",
    );
    expect(
      guardedUsability({
        usability: "send-ready",
        unaddressedAsks: ["confirm the address"],
      }),
    ).toBe("not-usable");
  });
});

function guardedUsability(overrides: {
  sendReady?: boolean;
  unaddressedAsks?: string[];
  unsupportedClaims?: string[];
  usability: "send-ready" | "needs-fill" | "not-usable";
}) {
  return applyConsistencyGuards({
    distinctAsks: [],
    unaddressedAsks: [],
    unsupportedClaims: [],
    deletableWithoutLoss: [],
    reasoning: "test",
    sendReady: false,
    primaryIssue: "MISSED_ASK",
    severity: "major",
    ...overrides,
  }).usability;
}
