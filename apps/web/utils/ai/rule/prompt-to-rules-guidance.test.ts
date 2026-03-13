import { describe, expect, it } from "vitest";
import { PROMPT_TO_RULES_SHARED_GUIDANCE } from "./prompt-to-rules-guidance";

describe("prompt-to-rules guidance", () => {
  it("keeps the prompt-to-rules specific guardrails", () => {
    expect(PROMPT_TO_RULES_SHARED_GUIDANCE).toContain(
      "Use static conditions for exact deterministic matching, but keep them short and specific.",
    );
    expect(PROMPT_TO_RULES_SHARED_GUIDANCE).toContain(
      'In most cases, you should use the "aiInstructions" and sometimes you will use other fields in addition.',
    );
    expect(PROMPT_TO_RULES_SHARED_GUIDANCE).toContain(
      "If a rule can be handled fully with static conditions, do so, but this is rarely possible.",
    );
  });
});
