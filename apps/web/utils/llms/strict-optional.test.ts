import { describe, expect, it } from "vitest";
import { z } from "zod";
import { strictOptional } from "@/utils/llms/strict-optional";

describe("strictOptional", () => {
  it("accepts omitted values while generating a required nullable property", () => {
    const schema = z.object({
      rationale: strictOptional(z.string()),
      category: z.string(),
    });

    expect(schema.parse({ category: "Newsletter" })).toEqual({
      rationale: null,
      category: "Newsletter",
    });
    expect(z.toJSONSchema(schema)).toMatchObject({
      properties: {
        rationale: {
          anyOf: [{ type: "string" }, { type: "null" }],
        },
      },
      required: ["rationale", "category"],
    });
  });
});
