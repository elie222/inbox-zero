import { describe, expect, it } from "vitest";
import {
  createMailSplitBody,
  updateMailSplitBody,
} from "@/utils/actions/mail-split.validation";

describe("split conjunction validation", () => {
  it.each([
    createMailSplitBody,
    updateMailSplitBody,
  ])("rejects conditions that a flat provider query would silently overwrite", (schema) => {
    for (const kind of ["FROM", "TO"]) {
      const input = {
        id: "split",
        name: "Addresses",
        matchAll: true,
        filters: [
          { kind, value: "one@example.com" },
          { kind, value: "@two.example.com" },
        ],
      };
      expect(schema.safeParse(input).success).toBe(false);
      expect(schema.safeParse({ ...input, matchAll: false }).success).toBe(
        true,
      );
    }
    const input = {
      id: "split",
      name: "Senders",
      matchAll: true,
      filters: [
        { kind: "FROM", value: "one@example.com" },
        { kind: "FROM", value: "two@example.com" },
      ],
    };
    expect(schema.safeParse(input).success).toBe(false);
    expect(schema.safeParse({ ...input, matchAll: false }).success).toBe(true);
    expect(
      schema.safeParse({
        ...input,
        filters: [input.filters[0], input.filters[0]],
      }).success,
    ).toBe(true);
  });
});

it("accepts a recipient address or @domain and rejects a bare domain", () => {
  const split = (value: string) => ({
    name: "Rakazo",
    filters: [{ kind: "TO", value }],
  });
  expect(createMailSplitBody.safeParse(split("@rakazo.com")).success).toBe(
    true,
  );
  expect(createMailSplitBody.safeParse(split("hello@rakazo.com")).success).toBe(
    true,
  );
  expect(createMailSplitBody.safeParse(split("rakazo.com")).success).toBe(
    false,
  );
});
