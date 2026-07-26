import { describe, expect, it } from "vitest";
import { SEND_READY_SYSTEM_PROMPT } from "@/__tests__/eval/harness/send-ready-judge";
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
