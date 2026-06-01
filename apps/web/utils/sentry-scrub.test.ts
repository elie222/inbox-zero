import { describe, it, expect } from "vitest";
import { scrubSentryEvent } from "./sentry-scrub";

describe("scrubSentryEvent", () => {
  it("redacts correspondent address fields in extra, preserving non-sensitive keys", () => {
    const event = {
      extra: { from: "sender@other.com", to: "rcpt@other.com", scope: "reply" },
    };

    const result = scrubSentryEvent(event as never) as typeof event;

    expect(result.extra.from).toBe("[redacted]");
    expect(result.extra.to).toBe("[redacted]");
    expect(result.extra.scope).toBe("reply");
  });

  it("redacts tokens and content fields recursively", () => {
    const event = {
      extra: {
        nested: { access_token: "secret", body: "private email body" },
      },
    };

    const result = scrubSentryEvent(event as never) as typeof event;

    expect(result.extra.nested.access_token).toBe("[redacted]");
    expect(result.extra.nested.body).toBe("[redacted]");
  });

  it("redacts sensitive request data and headers", () => {
    const event = {
      request: {
        data: { from: "sender@other.com" },
        headers: { authorization: "Bearer secret" },
      },
    };

    const result = scrubSentryEvent(event as never) as typeof event;

    expect(result.request.data.from).toBe("[redacted]");
    expect(result.request.headers.authorization).toBe("[redacted]");
  });

  it("preserves the authenticated user's own email on event.user", () => {
    const event = { user: { email: "me@own.com", id: "user-1" } };

    const result = scrubSentryEvent(event as never) as typeof event;

    expect(result.user.email).toBe("me@own.com");
  });
});
