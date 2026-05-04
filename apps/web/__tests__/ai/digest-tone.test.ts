import { describe, it, expect } from "vitest";

const RUN_AI = process.env.RUN_AI_TESTS === "true";
const maybe = RUN_AI ? it : it.skip;

describe("Tone guardrail (D-04)", () => {
  maybe("drops humor when any item references grief/funeral language", () => {
    expect.fail("implemented in 04-04");
  });
  maybe(
    "drops humor when any item references legal threat / lawsuit / subpoena",
    () => {
      expect.fail("implemented in 04-04");
    },
  );
  maybe(
    "drops humor when any item references medical emergency / surgery / ICU",
    () => {
      expect.fail("implemented in 04-04");
    },
  );
  maybe("retains personality when no triggering content is present", () => {
    expect.fail("implemented in 04-04");
  });
});
