import { describe, it, expect } from "vitest";
import { LLM_OPERATIONS } from "./operations";

describe("LLM Operations Registry", () => {
  describe("registry integrity", () => {
    it("all operations have required fields", () => {
      for (const [id, config] of Object.entries(LLM_OPERATIONS)) {
        expect(config.description, `${id} missing description`).toBeTruthy();
        expect(config.frequency, `${id} missing frequency`).toBeTruthy();
        expect(config.defaultTier, `${id} missing defaultTier`).toBeTruthy();
        expect(config.rationale, `${id} missing rationale`).toBeTruthy();
      }
    });

    it("all frequencies are valid", () => {
      const validFrequencies = [
        "per-email",
        "per-batch",
        "per-action",
        "one-time",
      ];
      for (const [id, config] of Object.entries(LLM_OPERATIONS)) {
        expect(
          validFrequencies,
          `${id} has invalid frequency: ${config.frequency}`,
        ).toContain(config.frequency);
      }
    });

    it("all tiers are valid", () => {
      const validTiers = ["reasoning", "fast", "economy"];
      for (const [id, config] of Object.entries(LLM_OPERATIONS)) {
        expect(
          validTiers,
          `${id} has invalid tier: ${config.defaultTier}`,
        ).toContain(config.defaultTier);
      }
    });
  });

  describe("cost optimization invariants", () => {
    // High-consequence per-email operations that justify reasoning tier despite volume
    const HIGH_CONSEQUENCE_PER_EMAIL_OPS = [
      "rule.match-email", // complex rule matching with negation logic, catch-all fallback
      "reply.determine-thread-status", // core Reply Zero feature with 9 interdependent rules
      "clean.decide-archive", // data loss risk, trust critical
    ];

    // This test catches expensive mistakes: per-email operations should use economy tier
    // UNLESS they are high-consequence operations where accuracy is critical
    it("per-email operations use economy tier unless high-consequence", () => {
      const perEmailOps = Object.entries(LLM_OPERATIONS).filter(
        ([_, config]) => config.frequency === "per-email",
      );

      expect(perEmailOps.length).toBeGreaterThan(0);

      for (const [id, config] of perEmailOps) {
        if (HIGH_CONSEQUENCE_PER_EMAIL_OPS.includes(id)) {
          expect(
            config.defaultTier,
            `${id} is high-consequence and should use reasoning tier.`,
          ).toBe("reasoning");
        } else {
          expect(
            config.defaultTier,
            `${id} is per-email but uses ${config.defaultTier} tier. ` +
              "Per-email operations should use economy tier for cost efficiency. " +
              "If accuracy is critical, add to HIGH_CONSEQUENCE_PER_EMAIL_OPS.",
          ).toBe("economy");
        }
      }
    });

    // This test ensures we don't accidentally downgrade quality-critical operations
    it("user-visible draft operations use reasoning tier", () => {
      const draftOps = [
        "reply.draft",
        "meeting.generate-briefing",
        "report.generate-summary",
      ];

      for (const id of draftOps) {
        const config = LLM_OPERATIONS[id as keyof typeof LLM_OPERATIONS];
        expect(
          config.defaultTier,
          `${id} is user-visible output but uses ${config.defaultTier} tier. ` +
            "User-visible drafts should use reasoning tier for quality.",
        ).toBe("reasoning");
      }
    });

    // Ensure rarely-called setup operations use reasoning since cost is negligible
    it("rule creation uses reasoning tier", () => {
      const config = LLM_OPERATIONS["rule.create-from-prompt"];
      expect(
        config.defaultTier,
        "Rule creation is rare and result is persisted. Should use reasoning.",
      ).toBe("reasoning");
    });
  });

  describe("operation categories", () => {
    it("has rule operations", () => {
      const ruleOps = Object.keys(LLM_OPERATIONS).filter((id) =>
        id.startsWith("rule."),
      );
      expect(ruleOps.length).toBeGreaterThan(0);
    });

    it("has reply operations", () => {
      const replyOps = Object.keys(LLM_OPERATIONS).filter((id) =>
        id.startsWith("reply."),
      );
      expect(replyOps.length).toBeGreaterThan(0);
    });

    it("has categorization operations", () => {
      const catOps = Object.keys(LLM_OPERATIONS).filter((id) =>
        id.startsWith("categorize."),
      );
      expect(catOps.length).toBeGreaterThan(0);
    });
  });
});
