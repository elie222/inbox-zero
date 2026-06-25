import { describe, expect, it } from "vitest";
import {
  createMarketingAnonymousId,
  isValidMarketingAnonymousId,
  withCookieValue,
} from "@/utils/marketing/identity";

describe("marketing identity", () => {
  it("validates generated anonymous ids", () => {
    expect(
      isValidMarketingAnonymousId("7b0a0a23-8fa8-48f3-9d6e-6a73c8c8d9cc"),
    ).toBe(true);
    expect(isValidMarketingAnonymousId("not-a-uuid")).toBe(false);
    expect(isValidMarketingAnonymousId(undefined)).toBe(false);
  });

  it("creates ids with the provided uuid generator", () => {
    expect(
      createMarketingAnonymousId(() => "7b0a0a23-8fa8-48f3-9d6e-6a73c8c8d9cc"),
    ).toBe("7b0a0a23-8fa8-48f3-9d6e-6a73c8c8d9cc");
  });

  it("adds a marketing cookie to an empty cookie header", () => {
    expect(withCookieValue(null, "iz_marketing_id", "visitor-1")).toBe(
      "iz_marketing_id=visitor-1",
    );
  });

  it("replaces an existing marketing cookie without changing other cookies", () => {
    expect(
      withCookieValue(
        "theme=dark; iz_marketing_id=old-value; locale=en",
        "iz_marketing_id",
        "new-value",
      ),
    ).toBe("theme=dark; locale=en; iz_marketing_id=new-value");
  });
});
