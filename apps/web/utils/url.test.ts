import { describe, it, expect } from "vitest";
import {
  createSearchParams,
  getEmailDraftUrl,
  getEmailUrl,
  getEmailUrlForMessage,
  getEmailUrlForOptionalMessage,
  getEmailSearchUrl,
  getGmailUrl,
  getGmailSearchUrl,
  getGmailBasicSearchUrl,
  getGmailFilterSettingsUrl,
} from "./url";

describe("createSearchParams", () => {
  it("coerces primitive and array values to URLSearchParams strings", () => {
    const after = new Date("2026-07-01T00:00:00.000Z");
    const params = createSearchParams({
      query: "inbox",
      limit: 25,
      includeRead: false,
      labelIds: ["Label_1", "Label_2"],
      after,
    });

    expect(params.get("query")).toBe("inbox");
    expect(params.get("limit")).toBe("25");
    expect(params.get("includeRead")).toBe("false");
    expect(params.get("labelIds")).toBe("Label_1,Label_2");
    expect(params.get("after")).toBe(String(after));
  });

  it("omits nullish values", () => {
    const params = createSearchParams({
      keep: "value",
      empty: "",
      zero: 0,
      missing: null,
      unset: undefined,
    });

    expect(params.toString()).toBe("keep=value&empty=&zero=0");
  });
});

describe("getEmailUrl", () => {
  it.each([
    {
      name: "Google provider with email address",
      messageOrThreadId: "msg123",
      emailAddress: "user@gmail.com",
      provider: "google",
      expected:
        "https://mail.google.com/mail/u/?authuser=user%40gmail.com#all/msg123",
    },
    {
      name: "Google provider without email address",
      messageOrThreadId: "msg123",
      emailAddress: null,
      provider: "google",
      expected: "https://mail.google.com/mail/u/0/#all/msg123",
    },
    {
      name: "Google provider with undefined email address",
      messageOrThreadId: "msg123",
      emailAddress: undefined,
      provider: "google",
      expected: "https://mail.google.com/mail/u/0/#all/msg123",
    },
    {
      name: "Microsoft provider with personal email",
      messageOrThreadId: "msg123",
      emailAddress: "user@outlook.com",
      provider: "microsoft",
      expected: "https://outlook.live.com/mail/0/inbox/id/msg123",
    },
    {
      name: "Microsoft provider with hotmail email",
      messageOrThreadId: "msg123",
      emailAddress: "user@hotmail.com",
      provider: "microsoft",
      expected: "https://outlook.live.com/mail/0/inbox/id/msg123",
    },
    {
      name: "Microsoft provider with business email",
      messageOrThreadId: "msg123",
      emailAddress: "user@contoso.com",
      provider: "microsoft",
      expected: "https://outlook.office.com/mail/inbox/id/msg123",
    },
    {
      name: "Microsoft provider with country-coded personal email",
      messageOrThreadId: "msg123",
      emailAddress: "user@outlook.fr",
      provider: "microsoft",
      expected: "https://outlook.live.com/mail/0/inbox/id/msg123",
    },
    {
      name: "Microsoft provider with live.co.uk email",
      messageOrThreadId: "msg123",
      emailAddress: "user@live.co.uk",
      provider: "microsoft",
      expected: "https://outlook.live.com/mail/0/inbox/id/msg123",
    },
    {
      name: "Microsoft provider with uppercase personal email",
      messageOrThreadId: "msg123",
      emailAddress: "User@Outlook.com",
      provider: "microsoft",
      expected: "https://outlook.live.com/mail/0/inbox/id/msg123",
    },
    {
      name: "Microsoft provider with no email defaults to office host",
      messageOrThreadId: "msg123",
      emailAddress: null,
      provider: "microsoft",
      expected: "https://outlook.office.com/mail/inbox/id/msg123",
    },
    {
      name: "Microsoft provider with special characters in message ID",
      messageOrThreadId: "msg+123/abc",
      emailAddress: null,
      provider: "microsoft",
      expected: "https://outlook.office.com/mail/inbox/id/msg%2B123%2Fabc",
    },
    {
      name: "Microsoft provider with spaces and special chars in message ID",
      messageOrThreadId: "msg id=abc",
      emailAddress: null,
      provider: "microsoft",
      expected: "https://outlook.office.com/mail/inbox/id/msg%20id%3Dabc",
    },
    {
      name: "undefined provider",
      messageOrThreadId: "msg123",
      emailAddress: "user@gmail.com",
      provider: undefined,
      expected:
        "https://mail.google.com/mail/u/?authuser=user%40gmail.com#all/msg123",
    },
    {
      name: "unknown provider",
      messageOrThreadId: "msg123",
      emailAddress: "user@gmail.com",
      provider: "unknown",
      expected:
        "https://mail.google.com/mail/u/?authuser=user%40gmail.com#all/msg123",
    },
    {
      name: "empty provider",
      messageOrThreadId: "msg123",
      emailAddress: "user@gmail.com",
      provider: "",
      expected:
        "https://mail.google.com/mail/u/?authuser=user%40gmail.com#all/msg123",
    },
  ])("builds email URL for $name", ({
    messageOrThreadId,
    emailAddress,
    provider,
    expected,
  }) => {
    expect(getEmailUrl(messageOrThreadId, emailAddress, provider)).toBe(
      expected,
    );
  });
});

describe("getEmailDraftUrl", () => {
  // Outlook on the web addresses items by its own id format, which a Graph id
  // cannot be converted into locally. Graph hands us the ready-made deeplink as
  // `webLink`, so prefer it over anything assembled here.
  it.each([
    {
      name: "a business mailbox",
      emailAddress: "user@contoso.com",
      webLink: "https://outlook.office.com/mail/deeplink/read/AAMkAG-owa_id%3D",
      expected:
        "https://outlook.office.com/mail/deeplink/read/AAMkAG-owa_id%3D?ispopout=0",
    },
    {
      name: "a personal mailbox",
      emailAddress: "user@outlook.com",
      webLink: "https://outlook.live.com/mail/0/deeplink/read/AAMkAG-owa_id%3D",
      expected:
        "https://outlook.live.com/mail/0/deeplink/read/AAMkAG-owa_id%3D?ispopout=0",
    },
  ])("opens the draft itself within the full Outlook client for $name", ({
    emailAddress,
    webLink,
    expected,
  }) => {
    expect(
      getEmailDraftUrl(
        { id: "AAMkAG-synthetic_id=", externalUrl: webLink },
        emailAddress,
        "microsoft",
      ),
    ).toBe(expected);
  });

  // Without this the link opens a bare popout window instead of the draft in
  // the reading pane of the full client.
  it("renders the Outlook draft in the reading pane rather than a popout", () => {
    expect(
      getEmailDraftUrl(
        {
          id: "AAMkAG-synthetic_id=",
          externalUrl:
            "https://outlook.office.com/mail/deeplink/read/AAMkAG-owa_id%3D?ispopout=1",
        },
        "user@contoso.com",
        "microsoft",
      ),
    ).toBe(
      "https://outlook.office.com/mail/deeplink/read/AAMkAG-owa_id%3D?ispopout=0",
    );
  });

  // The link is redirected to, so it must not be able to send the user off to
  // an arbitrary host.
  it.each([
    {
      name: "a host outside Outlook on the web",
      externalUrl: "https://evil.example.com/mail/deeplink/read/AAMkAG",
    },
    {
      name: "a non-https link",
      externalUrl: "javascript:alert(1)",
    },
    {
      name: "an unparseable link",
      externalUrl: "not a url",
    },
  ])("falls back to the Drafts folder when Graph reports $name", ({
    externalUrl,
  }) => {
    expect(
      getEmailDraftUrl(
        { id: "AAMkAG-synthetic_id=", externalUrl },
        "user@contoso.com",
        "microsoft",
      ),
    ).toBe("https://outlook.office.com/mail/drafts/id/AAMkAG-synthetic_id%3D");
  });

  it("falls back to the Drafts folder when Graph omits the web link", () => {
    expect(
      getEmailDraftUrl(
        { id: "AAMkAG-synthetic_id=" },
        "user@outlook.com",
        "microsoft",
      ),
    ).toBe("https://outlook.live.com/mail/0/drafts/id/AAMkAG-synthetic_id%3D");
  });

  it("returns null when the Outlook draft has no id to address it by", () => {
    expect(
      getEmailDraftUrl({ id: "" }, "user@outlook.com", "microsoft"),
    ).toBeNull();
  });

  it.each([
    {
      name: "Google account",
      draft: { id: "draft-message-123", threadId: "thread-123" },
      emailAddress: "user@gmail.com",
      provider: "google",
      expected:
        "https://mail.google.com/mail/u/?authuser=user%40gmail.com#drafts/thread-123",
    },
    {
      name: "Google account without a thread",
      draft: { id: "draft-message-123" },
      emailAddress: "user@gmail.com",
      provider: "google",
      expected:
        "https://mail.google.com/mail/u/?authuser=user%40gmail.com#drafts/draft-message-123",
    },
  ])("opens the draft for a $name", ({
    draft,
    emailAddress,
    provider,
    expected,
  }) => {
    expect(getEmailDraftUrl(draft, emailAddress, provider)).toBe(expected);
  });
});

describe("getEmailUrlForMessage", () => {
  it.each([
    {
      name: "Google provider",
      emailAddress: "user@gmail.com",
      provider: "google",
      expected:
        "https://mail.google.com/mail/u/?authuser=user%40gmail.com#all/messageId123",
    },
    {
      name: "Microsoft provider with personal email",
      emailAddress: "user@outlook.com",
      provider: "microsoft",
      expected: "https://outlook.live.com/mail/0/inbox/id/messageId123",
    },
    {
      name: "Microsoft provider with business email",
      emailAddress: "user@contoso.com",
      provider: "microsoft",
      expected: "https://outlook.office.com/mail/inbox/id/messageId123",
    },
    {
      name: "default provider",
      emailAddress: "user@example.com",
      provider: undefined,
      expected:
        "https://mail.google.com/mail/u/?authuser=user%40example.com#all/threadId456",
    },
  ])("selects the expected id for $name", ({
    emailAddress,
    provider,
    expected,
  }) => {
    expect(
      getEmailUrlForMessage(
        "messageId123",
        "threadId456",
        emailAddress,
        provider,
      ),
    ).toBe(expected);
  });
});

describe("getEmailUrlForOptionalMessage", () => {
  it.each([
    {
      name: "Microsoft without messageId",
      options: {
        threadId: "threadId456",
        emailAddress: "user@outlook.com",
        provider: "microsoft",
      },
      expected: null,
    },
    {
      name: "default provider without messageId",
      options: {
        threadId: "threadId456",
        emailAddress: "user@example.com",
      },
      expected:
        "https://mail.google.com/mail/u/?authuser=user%40example.com#all/threadId456",
    },
    {
      name: "Google with messageId",
      options: {
        messageId: "messageId123",
        threadId: "threadId456",
        emailAddress: "user@gmail.com",
        provider: "google",
      },
      expected:
        "https://mail.google.com/mail/u/?authuser=user%40gmail.com#all/messageId123",
    },
  ])("returns expected URL for $name", ({ options, expected }) => {
    expect(getEmailUrlForOptionalMessage(options)).toBe(expected);
  });
});

describe("getGmailUrl", () => {
  it.each([
    {
      name: "with email address",
      emailAddress: "user@gmail.com",
      expected:
        "https://mail.google.com/mail/u/?authuser=user%40gmail.com#all/msg123",
    },
    {
      name: "without email address",
      emailAddress: undefined,
      expected: "https://mail.google.com/mail/u/0/#all/msg123",
    },
  ])("builds Gmail URL $name", ({ emailAddress, expected }) => {
    expect(getGmailUrl("msg123", emailAddress)).toBe(expected);
  });
});

describe("getGmailSearchUrl", () => {
  it.each([
    {
      name: "sender email and authenticated user",
      from: "sender@example.com",
      emailAddress: "user@gmail.com",
      expected:
        "https://mail.google.com/mail/u/?authuser=user%40gmail.com#advanced-search/from=sender%40example.com",
    },
    {
      name: "sender with special characters",
      from: "test+user@example.com",
      emailAddress: null,
      expected:
        "https://mail.google.com/mail/u/0/#advanced-search/from=test%2Buser%40example.com",
    },
    {
      name: "sender with display name",
      from: "John Doe <john@example.com>",
      emailAddress: "user@gmail.com",
      expected:
        "https://mail.google.com/mail/u/?authuser=user%40gmail.com#advanced-search/from=John%20Doe%20%3Cjohn%40example.com%3E",
    },
  ])("builds advanced search URL for $name", ({
    from,
    emailAddress,
    expected,
  }) => {
    expect(getGmailSearchUrl(from, emailAddress)).toBe(expected);
  });
});

describe("getEmailSearchUrl", () => {
  it.each([
    {
      name: "Google provider",
      emailAddress: "user@gmail.com",
      provider: "google",
      expected:
        "https://mail.google.com/mail/u/?authuser=user%40gmail.com#advanced-search/from=sender%40example.com",
    },
    {
      name: "Microsoft provider with personal email",
      emailAddress: "user@outlook.com",
      provider: "microsoft",
      expected:
        "https://outlook.live.com/mail/0/search/q/from%3Asender%40example.com",
    },
    {
      name: "Microsoft provider with business email",
      emailAddress: "user@contoso.com",
      provider: "microsoft",
      expected:
        "https://outlook.office.com/mail/search/q/from%3Asender%40example.com",
    },
    {
      name: "empty provider",
      emailAddress: "user@gmail.com",
      provider: "",
      expected:
        "https://mail.google.com/mail/u/?authuser=user%40gmail.com#advanced-search/from=sender%40example.com",
    },
    {
      name: "unknown provider",
      emailAddress: "user@gmail.com",
      provider: "unknown-provider",
      expected:
        "https://mail.google.com/mail/u/?authuser=user%40gmail.com#advanced-search/from=sender%40example.com",
    },
  ])("builds sender search URL for $name", ({
    emailAddress,
    provider,
    expected,
  }) => {
    expect(
      getEmailSearchUrl("sender@example.com", emailAddress, provider),
    ).toBe(expected);
  });
});

describe("getGmailBasicSearchUrl", () => {
  it.each([
    {
      name: "simple query",
      query: "is:unread",
      expected:
        "https://mail.google.com/mail/u/?authuser=user%40gmail.com#search/is%3Aunread",
    },
    {
      name: "complex query",
      query: "from:sender@test.com subject:hello",
      expected:
        "https://mail.google.com/mail/u/?authuser=user%40gmail.com#search/from%3Asender%40test.com%20subject%3Ahello",
    },
    {
      name: "query with special characters",
      query: "label:inbox/important",
      expected:
        "https://mail.google.com/mail/u/?authuser=user%40gmail.com#search/label%3Ainbox%2Fimportant",
    },
  ])("builds search URL for $name", ({ query, expected }) => {
    expect(getGmailBasicSearchUrl("user@gmail.com", query)).toBe(expected);
  });
});

describe("getGmailFilterSettingsUrl", () => {
  it.each([
    {
      name: "with email address",
      emailAddress: "user@gmail.com",
      expected:
        "https://mail.google.com/mail/u/?authuser=user%40gmail.com#settings/filters",
    },
    {
      name: "without email address",
      emailAddress: undefined,
      expected: "https://mail.google.com/mail/u/0/#settings/filters",
    },
    {
      name: "with null email",
      emailAddress: null,
      expected: "https://mail.google.com/mail/u/0/#settings/filters",
    },
  ])("builds filter settings URL $name", ({ emailAddress, expected }) => {
    expect(getGmailFilterSettingsUrl(emailAddress)).toBe(expected);
  });
});
