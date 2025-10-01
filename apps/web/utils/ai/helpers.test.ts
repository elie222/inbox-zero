import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getUserInfoPrompt,
  getUserRulesPrompt,
  getEmailListPrompt,
} from "./helpers";
import { getEmailAccount, getEmail } from "@/__tests__/helpers";
import { stringifyEmail } from "@/utils/stringify-email";

vi.mock("@/utils/stringify-email", () => ({
  stringifyEmail: vi.fn(),
}));

describe("getUserInfoPrompt", () => {
  it("should format user info with all fields", () => {
    const emailAccount = {
      ...getEmailAccount(),
      email: "test@example.com",
      name: "Test User",
      about: "Test description",
    };

    const result = getUserInfoPrompt({ emailAccount, prefix: "" });

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

    const result = getUserInfoPrompt({ emailAccount, prefix: "" });

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

    const result = getUserInfoPrompt({ emailAccount, prefix: "" });

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

    const result = getUserInfoPrompt({ emailAccount, prefix: "" });

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

describe("getEmailListPrompt", () => {
  const mockStringifyEmail = vi.mocked(stringifyEmail);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should format single email", () => {
    const messages = [getEmail()];
    const messageMaxLength = 1000;

    mockStringifyEmail.mockReturnValue("Stringified email content");

    const result = getEmailListPrompt({ messages, messageMaxLength });

    expect(result).toBe("<email>Stringified email content</email>");
    expect(mockStringifyEmail).toHaveBeenCalledWith(
      messages[0],
      messageMaxLength,
    );
  });

  it("should format multiple emails", () => {
    const messages = [getEmail(), getEmail()];
    const messageMaxLength = 500;

    mockStringifyEmail
      .mockReturnValueOnce("First email content")
      .mockReturnValueOnce("Second email content");

    const result = getEmailListPrompt({ messages, messageMaxLength });

    expect(result).toBe(
      "<email>First email content</email>\n<email>Second email content</email>",
    );
    expect(mockStringifyEmail).toHaveBeenCalledTimes(2);
    expect(mockStringifyEmail).toHaveBeenNthCalledWith(
      1,
      messages[0],
      messageMaxLength,
    );
    expect(mockStringifyEmail).toHaveBeenNthCalledWith(
      2,
      messages[1],
      messageMaxLength,
    );
  });

  it("should handle empty messages array", () => {
    const messages: any[] = [];
    const messageMaxLength = 1000;

    const result = getEmailListPrompt({ messages, messageMaxLength });

    expect(result).toBe("");
    expect(mockStringifyEmail).not.toHaveBeenCalled();
  });

  it("should pass messageMaxLength parameter correctly", () => {
    const messages = [getEmail()];
    const messageMaxLength = 250;

    mockStringifyEmail.mockReturnValue("Short email");

    getEmailListPrompt({ messages, messageMaxLength });

    expect(mockStringifyEmail).toHaveBeenCalledWith(messages[0], 250);
  });

  it("should return all messages when maxMessages is not provided", () => {
    const messages = [getEmail(), getEmail(), getEmail()];
    const messageMaxLength = 1000;

    mockStringifyEmail
      .mockReturnValueOnce("Email 1")
      .mockReturnValueOnce("Email 2")
      .mockReturnValueOnce("Email 3");

    const result = getEmailListPrompt({ messages, messageMaxLength });

    expect(result).toBe(
      "<email>Email 1</email>\n<email>Email 2</email>\n<email>Email 3</email>",
    );
    expect(mockStringifyEmail).toHaveBeenCalledTimes(3);
  });

  it("should return the last maxMessages when maxMessages is provided", () => {
    const messages = [
      getEmail(),
      getEmail(),
      getEmail(),
      getEmail(),
      getEmail(),
    ];
    const messageMaxLength = 1000;
    const maxMessages = 3;

    mockStringifyEmail
      .mockReturnValueOnce("Email 3")
      .mockReturnValueOnce("Email 4")
      .mockReturnValueOnce("Email 5");

    const result = getEmailListPrompt({
      messages,
      messageMaxLength,
      maxMessages,
    });

    expect(result).toBe(
      "<email>Email 3</email>\n<email>Email 4</email>\n<email>Email 5</email>",
    );
    expect(mockStringifyEmail).toHaveBeenCalledTimes(3);
    // Verify it called with the last 3 messages (indices 2, 3, 4)
    expect(mockStringifyEmail).toHaveBeenNthCalledWith(
      1,
      messages[2],
      messageMaxLength,
    );
    expect(mockStringifyEmail).toHaveBeenNthCalledWith(
      2,
      messages[3],
      messageMaxLength,
    );
    expect(mockStringifyEmail).toHaveBeenNthCalledWith(
      3,
      messages[4],
      messageMaxLength,
    );
  });

  it("should return all messages when maxMessages is greater than array length", () => {
    const messages = [getEmail(), getEmail()];
    const messageMaxLength = 1000;
    const maxMessages = 5;

    mockStringifyEmail
      .mockReturnValueOnce("Email 1")
      .mockReturnValueOnce("Email 2");

    const result = getEmailListPrompt({
      messages,
      messageMaxLength,
      maxMessages,
    });

    expect(result).toBe("<email>Email 1</email>\n<email>Email 2</email>");
    expect(mockStringifyEmail).toHaveBeenCalledTimes(2);
    expect(mockStringifyEmail).toHaveBeenNthCalledWith(
      1,
      messages[0],
      messageMaxLength,
    );
    expect(mockStringifyEmail).toHaveBeenNthCalledWith(
      2,
      messages[1],
      messageMaxLength,
    );
  });

  it("should return single last message when maxMessages is 1", () => {
    const messages = [getEmail(), getEmail(), getEmail()];
    const messageMaxLength = 1000;
    const maxMessages = 1;

    mockStringifyEmail.mockReturnValue("Last email");

    const result = getEmailListPrompt({
      messages,
      messageMaxLength,
      maxMessages,
    });

    expect(result).toBe("<email>Last email</email>");
    expect(mockStringifyEmail).toHaveBeenCalledTimes(1);
    expect(mockStringifyEmail).toHaveBeenCalledWith(
      messages[2],
      messageMaxLength,
    );
  });
});
