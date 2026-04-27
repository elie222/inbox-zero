import { describe, expect, it } from "vitest";
import { webhookBodySchema } from "@/app/api/outlook/webhook/types";

describe("webhookBodySchema", () => {
  it("accepts lifecycle notifications with null resource data", () => {
    const result = webhookBodySchema.safeParse({
      value: [
        {
          subscriptionId: "subscription-id",
          lifecycleEvent: "missed",
          resourceData: null,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects change notifications with null resource data", () => {
    const result = webhookBodySchema.safeParse({
      value: [
        {
          subscriptionId: "subscription-id",
          changeType: "updated",
          resourceData: null,
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
