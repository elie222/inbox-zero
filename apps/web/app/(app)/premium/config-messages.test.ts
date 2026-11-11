import { describe, expect, it } from "vitest";
import { tiers } from "@/app/(app)/premium/config";
import { TIER_MESSAGES } from "@/app/(app)/premium/config-messages";

// The pricing UI looks translations up by tier name and English feature text,
// and falls back to English on a miss. Editing config.ts copy without updating
// config-messages.ts would silently show English to every other locale.
describe("TIER_MESSAGES", () => {
  it.each(
    tiers.map((tier) => [tier.name, tier] as const),
  )("has translatable copy for every %s description, CTA and feature", (_name, tier) => {
    const messages = TIER_MESSAGES[tier.name];
    expect(messages).toBeDefined();
    expect(messages.description.message).toBe(tier.description);
    expect(messages.cta.message).toBe(tier.cta);
    for (const feature of tier.features) {
      const featureMessages = messages.features[feature.text];
      expect(featureMessages?.text.message).toBe(feature.text);
      expect(featureMessages?.tooltip?.message).toBe(feature.tooltip);
    }
  });
});
