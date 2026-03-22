import { describe, it, expect } from "vitest";
import { shouldAutoGroup } from "./client-grouper";

describe("shouldAutoGroup", () => {
  it("returns true when same domain and same last name", () => {
    expect(
      shouldAutoGroup(
        { email: "john.smith@acme.com", name: "John Smith" },
        { email: "jane.smith@acme.com", name: "Jane Smith" },
      ),
    ).toBe(true);
  });

  it("returns false when different domains", () => {
    expect(
      shouldAutoGroup(
        { email: "john.smith@acme.com", name: "John Smith" },
        { email: "jane.smith@other.com", name: "Jane Smith" },
      ),
    ).toBe(false);
  });

  it("returns false when different last names", () => {
    expect(
      shouldAutoGroup(
        { email: "john.smith@acme.com", name: "John Smith" },
        { email: "jane.jones@acme.com", name: "Jane Jones" },
      ),
    ).toBe(false);
  });

  it("returns false when either name is single-word (no last name)", () => {
    expect(
      shouldAutoGroup(
        { email: "john@acme.com", name: "John" },
        { email: "jane.smith@acme.com", name: "Jane Smith" },
      ),
    ).toBe(false);
  });

  it("returns false when both names are single-word", () => {
    expect(
      shouldAutoGroup(
        { email: "john@acme.com", name: "John" },
        { email: "jane@acme.com", name: "Jane" },
      ),
    ).toBe(false);
  });

  it("is case-insensitive for domain comparison", () => {
    expect(
      shouldAutoGroup(
        { email: "john.smith@ACME.COM", name: "John Smith" },
        { email: "jane.smith@acme.com", name: "Jane Smith" },
      ),
    ).toBe(true);
  });

  it("is case-insensitive for last name comparison", () => {
    expect(
      shouldAutoGroup(
        { email: "john.smith@acme.com", name: "John SMITH" },
        { email: "jane.smith@acme.com", name: "Jane smith" },
      ),
    ).toBe(true);
  });

  it("returns false when domain is missing", () => {
    expect(
      shouldAutoGroup(
        { email: "invalidemail", name: "John Smith" },
        { email: "jane.smith@acme.com", name: "Jane Smith" },
      ),
    ).toBe(false);
  });
});
