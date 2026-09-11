import { describe, expect, it } from "vitest";
import { buildPendingEmailPreview } from "./pending-email-preview";

describe("buildPendingEmailPreview", () => {
  it("converts send-email HTML into plain text preview", () => {
    const preview = buildPendingEmailPreview({
      type: "tool-sendEmail",
      output: {
        pendingAction: {
          messageHtml:
            "<p>Hello team,</p><p>We received your request and are reviewing it now.</p>",
        },
      },
    });

    expect(preview).toContain("Hello team,");
    expect(preview).toContain(
      "We received your request and are reviewing it now.",
    );
  });

  it("normalizes whitespace in reply-email content preview", () => {
    const preview = buildPendingEmailPreview({
      type: "tool-replyEmail",
      output: {
        pendingAction: {
          content:
            "  Thanks for the follow-up.  \n\n\n  I will take care of it. ",
        },
      },
    });

    expect(preview).toBe(
      "Thanks for the follow-up.\n\nI will take care of it.",
    );
  });

  it("returns null when forward-email has no content", () => {
    const preview = buildPendingEmailPreview({
      type: "tool-forwardEmail",
      output: {
        pendingAction: {
          content: null,
        },
      },
    });

    expect(preview).toBeNull();
  });

  it("truncates very long previews", () => {
    const preview = buildPendingEmailPreview({
      type: "tool-replyEmail",
      output: {
        pendingAction: {
          content: "x".repeat(2000),
        },
      },
    });

    expect(preview).not.toBeNull();
    expect(preview!.length).toBeLessThan(2000);
    expect(preview).toMatch(/\.\.\.$/);
  });
});
