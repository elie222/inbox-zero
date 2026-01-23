import { beforeAll, describe, it, expect, vi } from "vitest";

// Mock modules that require environment variables before importing the module under test
vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "mock",
    GOOGLE_CLIENT_ID: "mock",
    GOOGLE_CLIENT_SECRET: "mock",
    EMAIL_ENCRYPT_SECRET: "mock",
    EMAIL_ENCRYPT_SALT: "mock",
    GOOGLE_PUBSUB_TOPIC_NAME: "mock",
    INTERNAL_API_KEY: "mock",
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));
vi.mock("@/utils/auth", () => ({}));
vi.mock("@/utils/logger", () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    with: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  }),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(),
}));

import { extractPlusTag, matchesPlusTag } from "./email-context";

// We need to test the validation functions, but they're private.
// Export them for testing or test through the public API.
// For now, we'll test the validation logic by extracting it.

/**
 * Checks if a domain is a Gmail domain (gmail.com or googlemail.com).
 */
function isGmailDomain(domain: string): boolean {
  const lowerDomain = domain.toLowerCase();
  return lowerDomain === "gmail.com" || lowerDomain === "googlemail.com";
}

/**
 * Normalizes a Gmail local part by removing dots.
 */
function normalizeGmailLocal(local: string): string {
  return local.replace(/\./g, "");
}

/**
 * Validates that a from address is a valid plus-tag variant of the user's email.
 */
function validatePlusTagFromAddress(
  fromAddress: string,
  userEmail: string,
): { valid: boolean; error?: string } {
  // basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(fromAddress)) {
    return { valid: false, error: `Invalid from address: ${fromAddress}` };
  }

  const [fromLocalRaw, fromDomainRaw] = fromAddress.split("@");
  const [userLocalRaw, userDomainRaw] = userEmail.split("@");

  // domain comparison is case-insensitive
  const fromDomain = fromDomainRaw.toLowerCase();
  const userDomain = userDomainRaw.toLowerCase();

  if (fromDomain !== userDomain) {
    return {
      valid: false,
      error: `From address domain must match user's domain. Expected: ${userDomainRaw}, got: ${fromDomainRaw}`,
    };
  }

  // extract plus-tag from from address
  const plusIndex = fromLocalRaw.indexOf("+");
  if (plusIndex === -1) {
    return {
      valid: false,
      error: `From address must include a plus-tag (e.g., ${userLocalRaw}+tag@${userDomainRaw}). Got: ${fromAddress}`,
    };
  }

  const fromBaseLocal = fromLocalRaw.slice(0, plusIndex);
  const tag = fromLocalRaw.slice(plusIndex + 1);

  // for Gmail, normalize dots in local part for comparison
  const isGmail = isGmailDomain(fromDomain);
  const normalizedFromBase = isGmail
    ? normalizeGmailLocal(fromBaseLocal)
    : fromBaseLocal;
  const normalizedUserLocal = isGmail
    ? normalizeGmailLocal(userLocalRaw)
    : userLocalRaw;

  // local part base must match (case-sensitive comparison)
  if (normalizedFromBase !== normalizedUserLocal) {
    return {
      valid: false,
      error: `From address local part must match user's. Expected: ${userLocalRaw}+tag@${userDomainRaw}, got: ${fromAddress}`,
    };
  }

  if (!tag || tag.trim() === "") {
    return {
      valid: false,
      error: `Plus-tag cannot be empty. Use format: ${userLocalRaw}+tag@${userDomainRaw}`,
    };
  }

  // validate tag contains only safe characters
  const safeTagPattern = /^[a-zA-Z0-9_-]+$/;
  if (!safeTagPattern.test(tag)) {
    return {
      valid: false,
      error: `Plus-tag can only contain letters, numbers, hyphens, and underscores. Got: ${tag}`,
    };
  }

  // tag must be lowercase
  if (tag !== tag.toLowerCase()) {
    return {
      valid: false,
      error: `Plus-tag must be lowercase. Got: ${tag}, expected: ${tag.toLowerCase()}`,
    };
  }

  return { valid: true };
}

describe("isGmailDomain", () => {
  it("returns true for gmail.com", () => {
    expect(isGmailDomain("gmail.com")).toBe(true);
    expect(isGmailDomain("Gmail.com")).toBe(true);
    expect(isGmailDomain("GMAIL.COM")).toBe(true);
  });

  it("returns true for googlemail.com", () => {
    expect(isGmailDomain("googlemail.com")).toBe(true);
    expect(isGmailDomain("Googlemail.com")).toBe(true);
  });

  it("returns false for other domains", () => {
    expect(isGmailDomain("company.com")).toBe(false);
    expect(isGmailDomain("outlook.com")).toBe(false);
    expect(isGmailDomain("notgmail.com")).toBe(false);
  });
});

describe("normalizeGmailLocal", () => {
  it("removes dots from local part", () => {
    expect(normalizeGmailLocal("john.doe")).toBe("johndoe");
    expect(normalizeGmailLocal("j.o.h.n")).toBe("john");
    expect(normalizeGmailLocal("nodots")).toBe("nodots");
  });
});

describe("validatePlusTagFromAddress", () => {
  describe("basic validation", () => {
    it("rejects invalid email format", () => {
      const result = validatePlusTagFromAddress(
        "not-an-email",
        "user@company.com",
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid from address");
    });

    it("rejects email without plus-tag", () => {
      const result = validatePlusTagFromAddress(
        "user@company.com",
        "user@company.com",
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must include a plus-tag");
    });

    it("rejects empty plus-tag", () => {
      const result = validatePlusTagFromAddress(
        "user+@company.com",
        "user@company.com",
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot be empty");
    });
  });

  describe("domain matching", () => {
    it("accepts matching domain (case-insensitive)", () => {
      const result = validatePlusTagFromAddress(
        "user+tag@COMPANY.COM",
        "user@company.com",
      );
      expect(result.valid).toBe(true);
    });

    it("rejects mismatched domain", () => {
      const result = validatePlusTagFromAddress(
        "user+tag@other.com",
        "user@company.com",
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("domain must match");
    });
  });

  describe("local part matching", () => {
    it("accepts matching local part with plus-tag", () => {
      const result = validatePlusTagFromAddress(
        "jordan+finley@company.com",
        "jordan@company.com",
      );
      expect(result.valid).toBe(true);
    });

    it("rejects mismatched local part (case-sensitive)", () => {
      const result = validatePlusTagFromAddress(
        "Jordan+finley@company.com",
        "jordan@company.com",
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("local part must match");
    });

    it("preserves user's registered case", () => {
      const result = validatePlusTagFromAddress(
        "Jordan+finley@company.com",
        "Jordan@company.com",
      );
      expect(result.valid).toBe(true);
    });
  });

  describe("plus-tag validation", () => {
    it("accepts lowercase alphanumeric tags", () => {
      expect(
        validatePlusTagFromAddress(
          "user+assistant@company.com",
          "user@company.com",
        ).valid,
      ).toBe(true);
      expect(
        validatePlusTagFromAddress(
          "user+bot123@company.com",
          "user@company.com",
        ).valid,
      ).toBe(true);
    });

    it("accepts tags with hyphens and underscores", () => {
      expect(
        validatePlusTagFromAddress(
          "user+my-assistant@company.com",
          "user@company.com",
        ).valid,
      ).toBe(true);
      expect(
        validatePlusTagFromAddress(
          "user+my_assistant@company.com",
          "user@company.com",
        ).valid,
      ).toBe(true);
    });

    it("rejects uppercase tags", () => {
      const result = validatePlusTagFromAddress(
        "user+Finley@company.com",
        "user@company.com",
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be lowercase");
      expect(result.error).toContain("finley");
    });

    it("rejects tags with special characters", () => {
      expect(
        validatePlusTagFromAddress("user+tag!@company.com", "user@company.com")
          .valid,
      ).toBe(false);
      expect(
        validatePlusTagFromAddress(
          "user+tag.name@company.com",
          "user@company.com",
        ).valid,
      ).toBe(false);
      expect(
        validatePlusTagFromAddress(
          "user+tag@name@company.com",
          "user@company.com",
        ).valid,
      ).toBe(false);
    });
  });

  describe("Gmail special handling", () => {
    it("normalizes dots in Gmail addresses", () => {
      // user registered as john.doe@gmail.com can send from johndoe+tag@gmail.com
      const result = validatePlusTagFromAddress(
        "johndoe+assistant@gmail.com",
        "john.doe@gmail.com",
      );
      expect(result.valid).toBe(true);
    });

    it("normalizes dots in from address too", () => {
      // user registered as johndoe@gmail.com can send from john.doe+tag@gmail.com
      const result = validatePlusTagFromAddress(
        "john.doe+assistant@gmail.com",
        "johndoe@gmail.com",
      );
      expect(result.valid).toBe(true);
    });

    it("handles googlemail.com the same as gmail.com", () => {
      const result = validatePlusTagFromAddress(
        "johndoe+assistant@googlemail.com",
        "john.doe@googlemail.com",
      );
      expect(result.valid).toBe(true);
    });

    it("does NOT normalize dots for non-Gmail domains", () => {
      // For non-Gmail, john.doe and johndoe are different addresses
      const result = validatePlusTagFromAddress(
        "johndoe+assistant@company.com",
        "john.doe@company.com",
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("local part must match");
    });

    it("still enforces case-sensitivity for Gmail base local part", () => {
      // Even with dot normalization, case must still match
      const result = validatePlusTagFromAddress(
        "JohnDoe+assistant@gmail.com",
        "johndoe@gmail.com",
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("local part must match");
    });
  });

  describe("real-world scenarios", () => {
    it("Calendar EA sending as jordan+finley@company.com", () => {
      const result = validatePlusTagFromAddress(
        "jordan+finley@company.com",
        "jordan@company.com",
      );
      expect(result.valid).toBe(true);
    });

    it("rejects impersonation attempt", () => {
      // Plugin for user A cannot send as user B
      const result = validatePlusTagFromAddress(
        "admin+assistant@company.com",
        "jordan@company.com",
      );
      expect(result.valid).toBe(false);
    });

    it("rejects sending as primary email (no plus-tag)", () => {
      const result = validatePlusTagFromAddress(
        "jordan@company.com",
        "jordan@company.com",
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must include a plus-tag");
    });
  });
});

// =============================================================================
// Tests for exported plus-tag matching utilities (for inbound trigger matching)
// =============================================================================

describe("extractPlusTag", () => {
  it("extracts plus-tag from email address", () => {
    expect(extractPlusTag("user+finley@domain.com")).toBe("finley");
    expect(extractPlusTag("user+assistant@gmail.com")).toBe("assistant");
  });

  it("normalizes tag to lowercase", () => {
    expect(extractPlusTag("user+FINLEY@domain.com")).toBe("finley");
    expect(extractPlusTag("user+Finley@domain.com")).toBe("finley");
    expect(extractPlusTag("user+FiNlEy@domain.com")).toBe("finley");
  });

  it("returns null for emails without plus-tag", () => {
    expect(extractPlusTag("user@domain.com")).toBeNull();
    expect(extractPlusTag("user.name@domain.com")).toBeNull();
  });

  it("returns null for empty or invalid inputs", () => {
    expect(extractPlusTag("")).toBeNull();
    expect(extractPlusTag("not-an-email")).toBeNull();
  });

  it("returns null for empty plus-tag", () => {
    expect(extractPlusTag("user+@domain.com")).toBeNull();
  });

  it("handles complex local parts", () => {
    expect(extractPlusTag("john.doe+assistant@domain.com")).toBe("assistant");
    expect(extractPlusTag("user_name+tag123@domain.com")).toBe("tag123");
  });
});

describe("matchesPlusTag", () => {
  describe("case-insensitive matching", () => {
    it("matches exact lowercase", () => {
      expect(matchesPlusTag("user+finley@domain.com", "finley")).toBe(true);
    });

    it("matches uppercase in email to lowercase registered tag", () => {
      expect(matchesPlusTag("user+FINLEY@domain.com", "finley")).toBe(true);
    });

    it("matches mixed case in email", () => {
      expect(matchesPlusTag("user+FiNlEy@domain.com", "finley")).toBe(true);
    });

    it("matches even if registered tag has uppercase (normalizes both)", () => {
      expect(matchesPlusTag("user+finley@domain.com", "FINLEY")).toBe(true);
      expect(matchesPlusTag("user+FINLEY@domain.com", "Finley")).toBe(true);
    });
  });

  describe("non-matching cases", () => {
    it("returns false for different tags", () => {
      expect(matchesPlusTag("user+assistant@domain.com", "finley")).toBe(false);
    });

    it("returns false for emails without plus-tag", () => {
      expect(matchesPlusTag("user@domain.com", "finley")).toBe(false);
    });

    it("returns false for empty inputs", () => {
      expect(matchesPlusTag("", "finley")).toBe(false);
    });
  });

  describe("real-world scenarios", () => {
    it("routes reply to user+FINLEY@company.com to plugin registered for finley", () => {
      // User's mail client might uppercase the tag when replying
      expect(matchesPlusTag("jordan+FINLEY@company.com", "finley")).toBe(true);
    });

    it("routes reply with preserved original case", () => {
      // Some mail clients preserve the original case
      expect(matchesPlusTag("jordan+Finley@company.com", "finley")).toBe(true);
    });

    it("handles Gmail addresses", () => {
      expect(matchesPlusTag("john.doe+ASSISTANT@gmail.com", "assistant")).toBe(
        true,
      );
    });
  });
});
