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

  it("redacts field names with variant casing and separators recursively", () => {
    const event = {
      extra: {
        Authorization: "Bearer secret",
        nested: {
          "access-token": "secret",
          reply_to: "sender@other.com",
          "text plain": "private email body",
          messages: [{ "Decoded-Snippet": "private preview" }],
        },
      },
    };

    const result = scrubSentryEvent(event as never) as typeof event;

    expect(result.extra.Authorization).toBe("[redacted]");
    expect(result.extra.nested["access-token"]).toBe("[redacted]");
    expect(result.extra.nested.reply_to).toBe("[redacted]");
    expect(result.extra.nested["text plain"]).toBe("[redacted]");
    expect(result.extra.nested.messages[0]["Decoded-Snippet"]).toBe(
      "[redacted]",
    );
  });

  it("redacts actual email content fields in rich extra objects", () => {
    const event = {
      extra: {
        thread: {
          messages: [
            {
              subject: "Private invoice details",
              textPlain: "Plain private body",
              textHtml: "<p>HTML private body</p>",
              snippet: "Private preview",
              decodedSnippet: "Decoded private preview",
              metadata: { id: "message-1" },
            },
          ],
        },
      },
      user: { email: "me@own.com", id: "user-1" },
    };

    const result = scrubSentryEvent(event as never) as typeof event;
    const message = result.extra.thread.messages[0];

    expect(message.subject).toBe("[redacted]");
    expect(message.textPlain).toBe("[redacted]");
    expect(message.textHtml).toBe("[redacted]");
    expect(message.snippet).toBe("[redacted]");
    expect(message.decodedSnippet).toBe("[redacted]");
    expect(message.metadata.id).toBe("message-1");
    expect(result.user.email).toBe("me@own.com");
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
