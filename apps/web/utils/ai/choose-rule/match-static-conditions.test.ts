import { describe, expect, it } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import type { RuleWithActions } from "@/utils/types";
import { matchesStaticRule } from "./match-static-conditions";
import { getHeaders, getMessage } from "./match-rules-test-utils";

const logger = createTestLogger();

describe("matchesStaticRule", () => {
  it("should match wildcard pattern at start of email", () => {
    const rule = getStaticRule({ from: "*@gmail.com" });
    const message = getMessage({
      headers: getHeaders({ from: "test@gmail.com" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("should not match when wildcard pattern doesn't match domain", () => {
    const rule = getStaticRule({ from: "*@gmail.com" });
    const message = getMessage({
      headers: getHeaders({ from: "test@yahoo.com" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(false);
  });

  it("should handle multiple wildcards in pattern", () => {
    const rule = getStaticRule({ subject: "*important*" });
    const message = getMessage({
      headers: getHeaders({ subject: "This is important message" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("should handle invalid regex patterns gracefully", () => {
    const rule = getStaticRule({ from: "[invalid(regex" });
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(false);
  });

  it("matches wildcard-heavy patterns in linear time (no regex backtracking)", () => {
    // The old `.*`-regex implementation hung for minutes on this shape:
    // many wildcards + an almost-matching body any sender could craft
    const rule = getStaticRule({
      body: "a*a*a*a*a*a*a*a*a*a*a*a*never-present",
    });
    const message = getMessage({
      headers: getHeaders(),
      textPlain: `${"a".repeat(10_000)}!`,
    });

    const start = Date.now();
    expect(matchesStaticRule(rule, message, logger)).toBe(false);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it("wildcard segments must appear in order", () => {
    const rule = getStaticRule({ subject: "alpha*beta*gamma" });

    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ subject: "x alpha y beta z gamma w" }),
        }),
        logger,
      ),
    ).toBe(true);
    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ subject: "gamma beta alpha" }),
        }),
        logger,
      ),
    ).toBe(false);
  });

  it("should return false when no conditions are provided", () => {
    const rule = getStaticRule({});
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(false);
  });

  it("should match body content with wildcard", () => {
    const rule = getStaticRule({ body: "*unsubscribe*" });
    const message = getMessage({
      headers: getHeaders(),
      textPlain: "Click here to unsubscribe from our newsletter",
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("should match @domain.com", () => {
    const rule = getStaticRule({ from: "@domain.com" });
    const message = getMessage({
      headers: getHeaders({ from: "test@domain.com" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("does not match @domain.com against a different domain with the same suffix", () => {
    const rule = getStaticRule({ from: "@example.com" });
    const message = getMessage({
      headers: getHeaders({ from: "test@myexample.com" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(false);
  });

  it("does not match a full-address pattern against a spoofed suffix domain", () => {
    const rule = getStaticRule({ from: "boss@company.com" });
    const message = getMessage({
      headers: getHeaders({ from: "boss@company.com.evil.com" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(false);
  });

  it("does not match a full-address pattern against a prefixed local part", () => {
    const rule = getStaticRule({ from: "boss@company.com" });
    const message = getMessage({
      headers: getHeaders({ from: "xboss@company.com" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(false);
  });

  it("does not match a domain pattern against a spoofed suffix domain", () => {
    const rule = getStaticRule({ from: "@company.com" });
    const message = getMessage({
      headers: getHeaders({ from: "user@company.com.evil.com" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(false);
  });

  it("does not match a wildcard-local pattern against a spoofed suffix domain", () => {
    const rule = getStaticRule({ from: "*@gmail.com" });
    const message = getMessage({
      headers: getHeaders({ from: "test@gmail.com.evil.com" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(false);
  });

  it("does not match a bare-domain pattern against a lookalike domain", () => {
    const rule = getStaticRule({ from: "example.com" });
    const message = getMessage({
      headers: getHeaders({ from: "user@myexample.com" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(false);
  });

  it("still matches a bare-domain pattern against an address at that domain", () => {
    const rule = getStaticRule({ from: "example.com" });
    const message = getMessage({
      headers: getHeaders({ from: "user@example.com" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("still matches a bare-domain pattern against a subdomain of that domain", () => {
    const rule = getStaticRule({ from: "example.com" });
    const message = getMessage({
      headers: getHeaders({ from: "user@mail.example.com" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("treats the @domain form as an exact domain (no subdomain match)", () => {
    const rule = getStaticRule({ from: "@example.com" });
    const message = getMessage({
      headers: getHeaders({ from: "user@mail.example.com" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(false);
  });

  it("matches from against the sender address, not the display name", () => {
    const rule = getStaticRule({ from: "@trusted.com" });
    const message = getMessage({
      headers: getHeaders({
        from: '"Trusted trusted@trusted.com" <attacker@evil.com>',
      }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(false);
  });

  it("matches from display names when the pattern is name-only", () => {
    const rule = getStaticRule({ from: "Elie Steinbock" });
    const message = getMessage({
      headers: getHeaders({
        from: "Elie Steinbock <ele@gmail.com>",
      }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("matches wildcard from display names when the pattern is name-like", () => {
    const rule = getStaticRule({ from: "Team *" });
    const message = getMessage({
      headers: getHeaders({
        from: "Team Billing <billing@example.com>",
      }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("matches from domains regardless of casing or leading @", () => {
    const message = getMessage({
      headers: getHeaders({ from: "User@Example.com" }),
    });

    expect(
      matchesStaticRule(
        getStaticRule({ from: "@EXAMPLE.COM" }),
        message,
        logger,
      ),
    ).toBe(true);
    expect(
      matchesStaticRule(
        getStaticRule({ from: "EXAMPLE.COM" }),
        message,
        logger,
      ),
    ).toBe(true);
  });

  it("matches to against extracted recipient addresses across multiple recipients", () => {
    const rule = getStaticRule({ to: "team@company.com" });
    const message = getMessage({
      headers: getHeaders({
        to: '"VIP vip@vip.com" <actual@company.com>, Team <team@company.com>',
      }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("does not match to against email-like text in a display name", () => {
    const rule = getStaticRule({ to: "@vip.com" });
    const message = getMessage({
      headers: getHeaders({
        to: '"VIP vip@vip.com" <actual@company.com>, Team <team@company.com>',
      }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(false);
  });

  it("matches to display names when the pattern is name-only", () => {
    const rule = getStaticRule({ to: "Elie Steinbock" });
    const message = getMessage({
      headers: getHeaders({
        to: '"Elie Steinbock" <ele@gmail.com>, Team <team@company.com>',
      }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("matches wildcard to display names when the pattern is name-like", () => {
    const rule = getStaticRule({ to: "Team *" });
    const message = getMessage({
      headers: getHeaders({
        to: '"Elie Steinbock" <ele@gmail.com>, Team Billing <team@company.com>',
      }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("matches to addresses regardless of casing", () => {
    const rule = getStaticRule({ to: "TEAM@COMPANY.COM" });
    const message = getMessage({
      headers: getHeaders({
        to: '"VIP vip@vip.com" <actual@company.com>, Team <team@company.com>',
      }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("starts-with subject mode matches only at the beginning", () => {
    const rule = getStaticRule({
      subject: "Invoice",
      subjectMatchMode: "STARTS_WITH",
    });

    expect(
      matchesStaticRule(
        rule,
        getMessage({ headers: getHeaders({ subject: "Invoice #123" }) }),
        logger,
      ),
    ).toBe(true);
    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ subject: "Your Invoice is ready" }),
        }),
        logger,
      ),
    ).toBe(false);
  });

  it("starts-with subject mode ignores reply/forward prefixes", () => {
    const rule = getStaticRule({
      subject: "Daily Report",
      subjectMatchMode: "STARTS_WITH",
    });

    for (const subject of [
      "Re: Daily Report",
      "RE: RE: Daily Report",
      "Fwd: Daily Report",
      "FW: Daily Report",
      "Re[2]: Daily Report",
    ]) {
      expect(
        matchesStaticRule(
          rule,
          getMessage({ headers: getHeaders({ subject }) }),
          logger,
        ),
      ).toBe(true);
    }

    // A non-prefix lead-in still fails starts-with
    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ subject: "About the Daily Report" }),
        }),
        logger,
      ),
    ).toBe(false);
  });

  it("does not treat reply-like words mid-subject as prefixes", () => {
    const rule = getStaticRule({
      subject: "Daily Report",
      subjectMatchMode: "STARTS_WITH",
    });

    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ subject: "Summary re: Daily Report" }),
        }),
        logger,
      ),
    ).toBe(false);
  });

  it("negated from matches senders NOT in the list", () => {
    const rule = getStaticRule({ from: "@nucar.com", fromExclude: true });

    expect(
      matchesStaticRule(
        rule,
        getMessage({ headers: getHeaders({ from: "vendor@elsewhere.com" }) }),
        logger,
      ),
    ).toBe(true);
    expect(
      matchesStaticRule(
        rule,
        getMessage({ headers: getHeaders({ from: "shawn@nucar.com" }) }),
        logger,
      ),
    ).toBe(false);
  });

  it("negated subject matches emails whose subject lacks the text", () => {
    const rule = getStaticRule({
      subject: "Daily Report",
      subjectExclude: true,
    });

    expect(
      matchesStaticRule(
        rule,
        getMessage({ headers: getHeaders({ subject: "Lunch plans" }) }),
        logger,
      ),
    ).toBe(true);
    // Reply-prefix stripping applies to the underlying match, so a reply to
    // the excluded topic is still excluded
    expect(
      matchesStaticRule(
        rule,
        getMessage({ headers: getHeaders({ subject: "Re: Daily Report" }) }),
        logger,
      ),
    ).toBe(false);
  });

  it("combines a positive from with a negated subject", () => {
    const rule = getStaticRule({
      from: "@nucar.com",
      subject: "auto-report",
      subjectExclude: true,
    });

    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({
            from: "shawn@nucar.com",
            subject: "Quick question",
          }),
        }),
        logger,
      ),
    ).toBe(true);
    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({
            from: "shawn@nucar.com",
            subject: "auto-report for Monday",
          }),
        }),
        logger,
      ),
    ).toBe(false);
  });

  it("negated to matches when the recipient is NOT in the list", () => {
    const rule = getStaticRule({ to: "team@nucar.com", toExclude: true });

    expect(
      matchesStaticRule(
        rule,
        getMessage({ headers: getHeaders({ to: "chris@nucar.com" }) }),
        logger,
      ),
    ).toBe(true);
    expect(
      matchesStaticRule(
        rule,
        getMessage({ headers: getHeaders({ to: "team@nucar.com" }) }),
        logger,
      ),
    ).toBe(false);
  });

  it("contains subject mode still matches mid-string", () => {
    const rule = getStaticRule({
      subject: "Invoice",
      subjectMatchMode: "CONTAINS",
    });

    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ subject: "Your Invoice is ready" }),
        }),
        logger,
      ),
    ).toBe(true);
  });

  it("should match Creator Message subject pattern", () => {
    const rule = getStaticRule({ subject: "[Creator Message]*" });
    const message = getMessage({
      headers: getHeaders({
        subject: "[Creator Message] Contact - new submission",
      }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("should match exact Creator Message subject", () => {
    const rule = getStaticRule({
      subject: "[Creator Message] Contact - new submission",
    });
    const message = getMessage({
      headers: getHeaders({
        subject: "[Creator Message] Contact - new submission",
      }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("should match parentheses in subject", () => {
    const rule = getStaticRule({ subject: "Invoice (PDF)" });
    const message = getMessage({
      headers: getHeaders({ subject: "Invoice (PDF)" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("should match plus sign in email address", () => {
    const rule = getStaticRule({ from: "user+tag@gmail.com" });
    const message = getMessage({
      headers: getHeaders({ from: "user+tag@gmail.com" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("should match dots in subject", () => {
    const rule = getStaticRule({ subject: "Order #123.456" });
    const message = getMessage({
      headers: getHeaders({ subject: "Order #123.456" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("should match dollar signs in subject", () => {
    const rule = getStaticRule({ subject: "Payment $100" });
    const message = getMessage({
      headers: getHeaders({ subject: "Payment $100" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("should match curly braces in subject", () => {
    const rule = getStaticRule({ subject: "Template {name}" });
    const message = getMessage({
      headers: getHeaders({ subject: "Template {name}" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("should match pipe symbol in subject", () => {
    const rule = getStaticRule({ subject: "Alert | System" });
    const message = getMessage({
      headers: getHeaders({ subject: "Alert | System" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("should match question mark in subject", () => {
    const rule = getStaticRule({ subject: "Are you ready?" });
    const message = getMessage({
      headers: getHeaders({ subject: "Are you ready?" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("should match caret symbol in subject", () => {
    const rule = getStaticRule({ subject: "Version ^1.0" });
    const message = getMessage({
      headers: getHeaders({ subject: "Version ^1.0" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("should match wildcards with special characters", () => {
    const rule = getStaticRule({ subject: "*[Important]*" });
    const message = getMessage({
      headers: getHeaders({ subject: "URGENT [Important] Notice" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("should match common notification patterns", () => {
    const rule = getStaticRule({ from: "*notification*@*" });
    const message = getMessage({
      headers: getHeaders({ from: "noreply-notification@company.com" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("should match receipt patterns", () => {
    const rule = getStaticRule({ subject: "*receipt*" });
    const message = getMessage({
      headers: getHeaders({ subject: "Your receipt from store" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("matches subjects regardless of casing", () => {
    const rule = getStaticRule({ subject: "URGENT" });
    const message = getMessage({
      headers: getHeaders({ subject: "urgent" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("matches a pattern that itself includes a reply prefix", () => {
    // The user typed the condition from what they saw in their mailbox
    const rule = getStaticRule({
      subject: "RE: Daily",
      subjectMatchMode: "STARTS_WITH",
    });

    for (const subject of [
      "Re: Daily Report - Automall St Albans - July 24, 2026",
      "RE: RE: Daily Report",
      "Daily Report - Nissan Keene", // the original, unprefixed email
    ]) {
      expect(
        matchesStaticRule(
          rule,
          getMessage({ headers: getHeaders({ subject }) }),
          logger,
        ),
      ).toBe(true);
    }

    expect(
      matchesStaticRule(
        rule,
        getMessage({ headers: getHeaders({ subject: "Weekly Summary" }) }),
        logger,
      ),
    ).toBe(false);
  });

  it("should handle empty header values gracefully", () => {
    const rule = getStaticRule({ from: "test@example.com" });
    const message = getMessage({
      headers: getHeaders({ from: "" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(false);
  });

  it("should match backslash characters", () => {
    const rule = getStaticRule({ subject: "Path: C:\\Users\\Name" });
    const message = getMessage({
      headers: getHeaders({ subject: "Path: C:\\Users\\Name" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("should match multiple domains separated by pipe characters", () => {
    const rule = getStaticRule({
      from: "@company-a.com|@company-b.org|@startup-x.io|@agency-y.net|@brand-z.co",
    });

    // Should match first domain
    const message1 = getMessage({
      headers: getHeaders({ from: "user@company-a.com" }),
    });
    expect(matchesStaticRule(rule, message1, logger)).toBe(true);

    // Should match middle domain
    const message2 = getMessage({
      headers: getHeaders({ from: "contact@startup-x.io" }),
    });
    expect(matchesStaticRule(rule, message2, logger)).toBe(true);

    // Should match last domain
    const message3 = getMessage({
      headers: getHeaders({ from: "info@brand-z.co" }),
    });
    expect(matchesStaticRule(rule, message3, logger)).toBe(true);

    // Should not match domain not in list
    const message4 = getMessage({
      headers: getHeaders({ from: "test@other-company.com" }),
    });
    expect(matchesStaticRule(rule, message4, logger)).toBe(false);
  });

  it("should treat pipes as OR operator in 'to' field", () => {
    const rule = getStaticRule({
      to: "support@company.com|help@company.com|contact@company.com",
    });

    // Should match first email
    const message1 = getMessage({
      headers: getHeaders({ to: "support@company.com" }),
    });
    expect(matchesStaticRule(rule, message1, logger)).toBe(true);

    // Should match second email
    const message2 = getMessage({
      headers: getHeaders({ to: "help@company.com" }),
    });
    expect(matchesStaticRule(rule, message2, logger)).toBe(true);

    // Should match third email
    const message3 = getMessage({
      headers: getHeaders({ to: "contact@company.com" }),
    });
    expect(matchesStaticRule(rule, message3, logger)).toBe(true);

    // Should not match other email
    const message4 = getMessage({
      headers: getHeaders({ to: "sales@company.com" }),
    });
    expect(matchesStaticRule(rule, message4, logger)).toBe(false);
  });

  it("should combine wildcards with pipe OR logic in from field", () => {
    const rule = getStaticRule({
      from: "*@newsletter.com|*@marketing.org|notifications@*",
    });

    // Should match wildcard + first domain
    const message1 = getMessage({
      headers: getHeaders({ from: "weekly@newsletter.com" }),
    });
    expect(matchesStaticRule(rule, message1, logger)).toBe(true);

    // Should match wildcard + second domain
    const message2 = getMessage({
      headers: getHeaders({ from: "campaign@marketing.org" }),
    });
    expect(matchesStaticRule(rule, message2, logger)).toBe(true);

    // Should match third pattern with wildcard
    const message3 = getMessage({
      headers: getHeaders({ from: "notifications@example.com" }),
    });
    expect(matchesStaticRule(rule, message3, logger)).toBe(true);

    // Should not match pattern not in list
    const message4 = getMessage({
      headers: getHeaders({ from: "test@other.com" }),
    });
    expect(matchesStaticRule(rule, message4, logger)).toBe(false);
  });

  it("should treat pipes as literal characters in subject field", () => {
    const rule = getStaticRule({
      subject: "Status: Active | Pending | Completed",
    });
    const message = getMessage({
      headers: getHeaders({ subject: "Status: Active | Pending | Completed" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);

    // Should not match partial pipe patterns
    const message2 = getMessage({
      headers: getHeaders({ subject: "Status: Active" }),
    });
    expect(matchesStaticRule(rule, message2, logger)).toBe(false);
  });

  it("should treat pipes as literal characters in body field", () => {
    const rule = getStaticRule({
      body: "Choose option A | B | C from the menu",
    });
    const message = getMessage({
      headers: getHeaders(),
      textPlain: "Please choose option A | B | C from the menu to continue",
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);

    // Should not match partial pipe patterns
    const message2 = getMessage({
      headers: getHeaders(),
      textPlain: "Please choose option A to continue",
    });
    expect(matchesStaticRule(rule, message2, logger)).toBe(false);
  });

  it("should handle empty patterns between pipes gracefully", () => {
    const rule = getStaticRule({ from: "@domain1.com||@domain2.com" });

    // Should still match valid domains
    const message1 = getMessage({
      headers: getHeaders({ from: "test@domain1.com" }),
    });
    expect(matchesStaticRule(rule, message1, logger)).toBe(true);

    const message2 = getMessage({
      headers: getHeaders({ from: "test@domain2.com" }),
    });
    expect(matchesStaticRule(rule, message2, logger)).toBe(true);
  });

  it("should handle single pattern without pipes in from field", () => {
    const rule = getStaticRule({ from: "@single-domain.com" });
    const message = getMessage({
      headers: getHeaders({ from: "user@single-domain.com" }),
    });

    expect(matchesStaticRule(rule, message, logger)).toBe(true);
  });

  it("should handle pipes at beginning and end of from pattern", () => {
    const rule = getStaticRule({ from: "|@domain1.com|@domain2.com|" });

    // Should still match valid domains despite leading/trailing pipes
    const message1 = getMessage({
      headers: getHeaders({ from: "test@domain1.com" }),
    });
    expect(matchesStaticRule(rule, message1, logger)).toBe(true);

    const message2 = getMessage({
      headers: getHeaders({ from: "test@domain2.com" }),
    });
    expect(matchesStaticRule(rule, message2, logger)).toBe(true);
  });

  it("should handle mixed conditions with pipes in from and literal pipes in subject", () => {
    const rule = getStaticRule({
      from: "@company1.com|@company2.com",
      subject: "Alert | System Status",
    });

    // Should match when both conditions are met
    const message1 = getMessage({
      headers: getHeaders({
        from: "admin@company1.com",
        subject: "Alert | System Status",
      }),
    });
    expect(matchesStaticRule(rule, message1, logger)).toBe(true);

    // Should match with second domain
    const message2 = getMessage({
      headers: getHeaders({
        from: "admin@company2.com",
        subject: "Alert | System Status",
      }),
    });
    expect(matchesStaticRule(rule, message2, logger)).toBe(true);

    // Should not match with wrong domain
    const message3 = getMessage({
      headers: getHeaders({
        from: "admin@company3.com",
        subject: "Alert | System Status",
      }),
    });
    expect(matchesStaticRule(rule, message3, logger)).toBe(false);

    // Should not match with partial subject
    const message4 = getMessage({
      headers: getHeaders({
        from: "admin@company1.com",
        subject: "Alert",
      }),
    });
    expect(matchesStaticRule(rule, message4, logger)).toBe(false);
  });

  it("should handle complex email patterns with pipes", () => {
    const rule = getStaticRule({
      from: "noreply@*|*-notifications@company.com|alerts+*@service.io",
    });

    // Should match first pattern with wildcard
    const message1 = getMessage({
      headers: getHeaders({ from: "noreply@newsletter.com" }),
    });
    expect(matchesStaticRule(rule, message1, logger)).toBe(true);

    // Should match second pattern
    const message2 = getMessage({
      headers: getHeaders({ from: "system-notifications@company.com" }),
    });
    expect(matchesStaticRule(rule, message2, logger)).toBe(true);

    // Should match third pattern with plus and wildcard
    const message3 = getMessage({
      headers: getHeaders({ from: "alerts+billing@service.io" }),
    });
    expect(matchesStaticRule(rule, message3, logger)).toBe(true);

    // Should not match unrelated pattern
    const message4 = getMessage({
      headers: getHeaders({ from: "user@other.com" }),
    });
    expect(matchesStaticRule(rule, message4, logger)).toBe(false);
  });

  it("should support comma as separator in from field", () => {
    const rule = getStaticRule({
      from: "@company-a.com, @company-b.org, @startup-x.io",
    });

    // Should match first domain
    const message1 = getMessage({
      headers: getHeaders({ from: "user@company-a.com" }),
    });
    expect(matchesStaticRule(rule, message1, logger)).toBe(true);

    // Should match second domain
    const message2 = getMessage({
      headers: getHeaders({ from: "contact@company-b.org" }),
    });
    expect(matchesStaticRule(rule, message2, logger)).toBe(true);

    // Should match third domain
    const message3 = getMessage({
      headers: getHeaders({ from: "info@startup-x.io" }),
    });
    expect(matchesStaticRule(rule, message3, logger)).toBe(true);

    // Should not match unlisted domain
    const message4 = getMessage({
      headers: getHeaders({ from: "test@other.com" }),
    });
    expect(matchesStaticRule(rule, message4, logger)).toBe(false);
  });

  it("should support comma as separator in to field", () => {
    const rule = getStaticRule({
      to: "support@company.com, help@company.com, contact@company.com",
    });

    // Should match each email
    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ to: "support@company.com" }),
        }),
        logger,
      ),
    ).toBe(true);

    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ to: "help@company.com" }),
        }),
        logger,
      ),
    ).toBe(true);

    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ to: "contact@company.com" }),
        }),
        logger,
      ),
    ).toBe(true);
  });

  it("should support OR as separator (case insensitive)", () => {
    const rule = getStaticRule({
      from: "@company1.com OR @company2.com or @company3.com",
    });

    // Should match first domain
    const message1 = getMessage({
      headers: getHeaders({ from: "admin@company1.com" }),
    });
    expect(matchesStaticRule(rule, message1, logger)).toBe(true);

    // Should match second domain
    const message2 = getMessage({
      headers: getHeaders({ from: "admin@company2.com" }),
    });
    expect(matchesStaticRule(rule, message2, logger)).toBe(true);

    // Should match third domain
    const message3 = getMessage({
      headers: getHeaders({ from: "admin@company3.com" }),
    });
    expect(matchesStaticRule(rule, message3, logger)).toBe(true);

    // Should not match unlisted domain
    const message4 = getMessage({
      headers: getHeaders({ from: "admin@company4.com" }),
    });
    expect(matchesStaticRule(rule, message4, logger)).toBe(false);
  });

  it("should support mixed separators (pipe, comma, OR)", () => {
    const rule = getStaticRule({
      from: "@company1.com | @company2.com, @company3.com OR @company4.com",
    });

    // Should match all domains regardless of separator used
    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ from: "user@company1.com" }),
        }),
        logger,
      ),
    ).toBe(true);

    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ from: "user@company2.com" }),
        }),
        logger,
      ),
    ).toBe(true);

    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ from: "user@company3.com" }),
        }),
        logger,
      ),
    ).toBe(true);

    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ from: "user@company4.com" }),
        }),
        logger,
      ),
    ).toBe(true);
  });

  it("should handle OR with various spacing", () => {
    const rule = getStaticRule({
      from: "@company1.com  OR  @company2.com OR@company3.com",
    });

    // Should match despite irregular spacing
    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ from: "user@company1.com" }),
        }),
        logger,
      ),
    ).toBe(true);

    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ from: "user@company2.com" }),
        }),
        logger,
      ),
    ).toBe(true);
  });

  it("should combine wildcards with comma separator", () => {
    const rule = getStaticRule({
      from: "*@newsletter.com, *@marketing.org, notifications@*",
    });

    // Should match wildcard patterns
    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ from: "weekly@newsletter.com" }),
        }),
        logger,
      ),
    ).toBe(true);

    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ from: "campaign@marketing.org" }),
        }),
        logger,
      ),
    ).toBe(true);

    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ from: "notifications@example.com" }),
        }),
        logger,
      ),
    ).toBe(true);
  });

  it("should trim whitespace from patterns with comma separator", () => {
    const rule = getStaticRule({
      from: "  @company1.com  ,   @company2.com  ,  @company3.com  ",
    });

    // Should match despite extra whitespace
    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ from: "user@company1.com" }),
        }),
        logger,
      ),
    ).toBe(true);

    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ from: "user@company2.com" }),
        }),
        logger,
      ),
    ).toBe(true);
  });

  it("should not treat comma as separator in subject field", () => {
    const rule = getStaticRule({
      subject: "Option A, Option B, Option C",
    });

    // Should require exact match including commas
    const message1 = getMessage({
      headers: getHeaders({ subject: "Option A, Option B, Option C" }),
    });
    expect(matchesStaticRule(rule, message1, logger)).toBe(true);

    // Should not match partial
    const message2 = getMessage({
      headers: getHeaders({ subject: "Option A" }),
    });
    expect(matchesStaticRule(rule, message2, logger)).toBe(false);
  });

  it("should not treat OR as separator in subject field", () => {
    const rule = getStaticRule({
      subject: "Status: Active OR Pending",
    });

    // Should require exact match including OR
    const message1 = getMessage({
      headers: getHeaders({ subject: "Status: Active OR Pending" }),
    });
    expect(matchesStaticRule(rule, message1, logger)).toBe(true);

    // Should not match partial
    const message2 = getMessage({
      headers: getHeaders({ subject: "Status: Active" }),
    });
    expect(matchesStaticRule(rule, message2, logger)).toBe(false);
  });
});

function getStaticRule(
  rule: Partial<
    Pick<
      RuleWithActions,
      | "from"
      | "to"
      | "subject"
      | "body"
      | "subjectMatchMode"
      | "fromExclude"
      | "toExclude"
      | "subjectExclude"
    >
  >,
) {
  return {
    from: null,
    to: null,
    subject: null,
    body: null,
    ...rule,
  };
}
