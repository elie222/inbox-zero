import { describe, expect, it } from "vitest";
import { z } from "zod";
import { publicContactContextSchema } from "@/utils/ai/public-contact-context-schema";

describe("publicContactContextSchema", () => {
  // OpenAI strict structured outputs reject string formats such as "uri",
  // which failed every research call routed to OpenAI models.
  it("emits no string format keywords in the model-facing JSON schema", () => {
    expect(
      JSON.stringify(z.toJSONSchema(publicContactContextSchema)),
    ).not.toContain('"format"');
  });
});
