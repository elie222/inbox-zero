import { describe, it, expect } from "vitest";
import { getUserInfoPrompt, getUserRulesPrompt } from "./helpers";
import { getEmailAccount } from "@/__tests__/helpers";

describe("getUserInfoPrompt", () => {
  it("should format user info with all fields", () => {
    const emailAccount = {
      ...getEmailAccount(),
      email: "test@example.com",
      name: "Test User",
      about: "Test description",
    };

    const result = getUserInfoPrompt({ emailAccount });

    expect(result).toBe(`<user_info>
<email>test@example.com</email>
<name>Test User</name>
<about>Test description</about>
</user_info>`);
  });

  it("should format user info with only email when other fields are null", () => {
    const emailAccount = {
      ...getEmailAccount(),
      email: "test@example.com",
      name: null,
      about: null,
    };

    const result = getUserInfoPrompt({ emailAccount });

    expect(result).toBe(`<user_info>
<email>test@example.com</email>
</user_info>`);
  });

  it("should format user info with email and name when about is missing", () => {
    const emailAccount = {
      ...getEmailAccount(),
      email: "test@example.com",
      name: "Test User",
      about: null,
    };

    const result = getUserInfoPrompt({ emailAccount });

    expect(result).toBe(`<user_info>
<email>test@example.com</email>
<name>Test User</name>
</user_info>`);
  });

  it("should handle empty strings by filtering them out", () => {
    const emailAccount = {
      ...getEmailAccount(),
      email: "test@example.com",
      name: "",
      about: "",
    };

    const result = getUserInfoPrompt({ emailAccount });

    expect(result).toBe(`<user_info>
<email>test@example.com</email>
</user_info>`);
  });
});

describe("getUserRulesPrompt", () => {
  it("should format single rule", () => {
    const rules = [
      {
        name: "Test Rule",
        instructions: "Test instructions",
      },
    ];

    const result = getUserRulesPrompt({ rules });

    expect(result).toBe(`<user_rules>
<rule>
  <name>Test Rule</name>
  <criteria>Test instructions</criteria>
</rule>
</user_rules>`);
  });

  it("should format multiple rules", () => {
    const rules = [
      {
        name: "Rule 1",
        instructions: "First rule instructions",
      },
      {
        name: "Rule 2",
        instructions: "Second rule instructions",
      },
    ];

    const result = getUserRulesPrompt({ rules });

    expect(result).toBe(`<user_rules>
<rule>
  <name>Rule 1</name>
  <criteria>First rule instructions</criteria>
</rule>
<rule>
  <name>Rule 2</name>
  <criteria>Second rule instructions</criteria>
</rule>
</user_rules>`);
  });

  it("should format empty rules array", () => {
    const rules: { name: string; instructions: string }[] = [];

    const result = getUserRulesPrompt({ rules });

    expect(result).toBe(`<user_rules>

</user_rules>`);
  });

  it("should handle rules with special characters", () => {
    const rules = [
      {
        name: "Rule & Test",
        instructions: "Instructions with <special> characters",
      },
    ];

    const result = getUserRulesPrompt({ rules });

    expect(result).toBe(`<user_rules>
<rule>
  <name>Rule & Test</name>
  <criteria>Instructions with <special> characters</criteria>
</rule>
</user_rules>`);
  });
});
