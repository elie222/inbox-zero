/**
 * Tests for the Plugin Context Factory
 *
 * These tests verify that the context factory properly enforces capability-based
 * security boundaries. Plugins should only have access to APIs they've declared
 * in their capabilities array.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PluginManifest } from "@/packages/plugin-sdk/src/schemas/plugin-manifest";
import type { PluginCalendar } from "@/packages/plugin-sdk/src/types/contexts";
import {
  createEmailContext,
  createDraftContext,
  createRuleContext,
  createCalendarContext,
  createTriggeredEmailContext,
  createScheduledTriggerContext,
  PluginCapabilityError,
  type Email,
  type EmailAccount,
  type ContextFactoryOptions,
} from "./context-factory";

// -----------------------------------------------------------------------------
// Mock Dependencies
// -----------------------------------------------------------------------------

vi.mock("@/utils/prisma", () => ({
  default: {
    pluginAccountSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    pluginUserSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    calendarConnection: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("@/utils/llms/index", () => ({
  createGenerateText: vi.fn(() =>
    vi.fn().mockResolvedValue({ text: "generated text" }),
  ),
  createGenerateObject: vi.fn(() =>
    vi.fn().mockResolvedValue({ object: { test: true } }),
  ),
}));

vi.mock("@/utils/llms/model", () => ({
  getModel: vi.fn(() => ({ model: "test-model", provider: "test" })),
}));

const mockStorage = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
  getUserSettings: vi.fn().mockResolvedValue(null),
  setUserSettings: vi.fn().mockResolvedValue(undefined),
  getAccountSettings: vi.fn().mockResolvedValue(null),
  setAccountSettings: vi.fn().mockResolvedValue(undefined),
};

vi.mock("./storage-context", () => ({
  createPluginStorage: vi.fn(() => mockStorage),
}));

// track what calendar was returned to dynamically control behavior
let mockCalendarBehavior: "working" | "read-only" | "no-op" = "no-op";

function createWorkingCalendar(): PluginCalendar {
  return {
    listCalendars: vi
      .fn()
      .mockResolvedValue([
        { id: "cal-1", name: "Calendar", primary: true, canEdit: true },
      ]),
    listEvents: vi.fn().mockResolvedValue([
      {
        id: "event-1",
        calendarId: "cal-1",
        summary: "Event",
        start: { dateTime: "" },
        end: { dateTime: "" },
      },
    ]),
    listEventsWithAttendee: vi.fn().mockResolvedValue([]),
    getEvent: vi.fn().mockResolvedValue({
      id: "event-1",
      calendarId: "cal-1",
      summary: "Event",
      start: { dateTime: "" },
      end: { dateTime: "" },
    }),
    getBusyPeriods: vi.fn().mockResolvedValue([]),
    createEvent: vi.fn().mockResolvedValue({
      id: "new-event",
      calendarId: "cal-1",
      summary: "Created",
      start: { dateTime: "" },
      end: { dateTime: "" },
    }),
    updateEvent: vi.fn().mockResolvedValue({
      id: "updated-event",
      calendarId: "cal-1",
      summary: "Updated",
      start: { dateTime: "" },
      end: { dateTime: "" },
    }),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
    respondToEvent: vi.fn().mockResolvedValue(undefined),
  };
}

function createReadOnlyCalendar(): PluginCalendar {
  return {
    listCalendars: vi
      .fn()
      .mockResolvedValue([
        { id: "cal-1", name: "Calendar", primary: true, canEdit: false },
      ]),
    listEvents: vi.fn().mockResolvedValue([
      {
        id: "event-1",
        calendarId: "cal-1",
        summary: "Event",
        start: { dateTime: "" },
        end: { dateTime: "" },
      },
    ]),
    listEventsWithAttendee: vi.fn().mockResolvedValue([]),
    getEvent: vi.fn().mockResolvedValue({
      id: "event-1",
      calendarId: "cal-1",
      summary: "Event",
      start: { dateTime: "" },
      end: { dateTime: "" },
    }),
    getBusyPeriods: vi.fn().mockResolvedValue([]),
    createEvent: vi
      .fn()
      .mockRejectedValue(
        new PluginCapabilityError(
          "calendar:write",
          "ctx.calendar.createEvent()",
        ),
      ),
    updateEvent: vi
      .fn()
      .mockRejectedValue(
        new PluginCapabilityError(
          "calendar:write",
          "ctx.calendar.updateEvent()",
        ),
      ),
    deleteEvent: vi
      .fn()
      .mockRejectedValue(
        new PluginCapabilityError(
          "calendar:write",
          "ctx.calendar.deleteEvent()",
        ),
      ),
    respondToEvent: vi
      .fn()
      .mockRejectedValue(
        new PluginCapabilityError(
          "calendar:write",
          "ctx.calendar.respondToEvent()",
        ),
      ),
  };
}

function createNoOpCalendar(): PluginCalendar {
  return {
    listCalendars: vi
      .fn()
      .mockRejectedValue(
        new PluginCapabilityError(
          "calendar:list",
          "ctx.calendar.listCalendars()",
        ),
      ),
    listEvents: vi
      .fn()
      .mockRejectedValue(
        new PluginCapabilityError("calendar:read", "ctx.calendar.listEvents()"),
      ),
    listEventsWithAttendee: vi
      .fn()
      .mockRejectedValue(
        new PluginCapabilityError(
          "calendar:read",
          "ctx.calendar.listEventsWithAttendee()",
        ),
      ),
    getEvent: vi
      .fn()
      .mockRejectedValue(
        new PluginCapabilityError("calendar:read", "ctx.calendar.getEvent()"),
      ),
    getBusyPeriods: vi
      .fn()
      .mockRejectedValue(
        new PluginCapabilityError(
          "calendar:read",
          "ctx.calendar.getBusyPeriods()",
        ),
      ),
    createEvent: vi
      .fn()
      .mockRejectedValue(
        new PluginCapabilityError(
          "calendar:write",
          "ctx.calendar.createEvent()",
        ),
      ),
    updateEvent: vi
      .fn()
      .mockRejectedValue(
        new PluginCapabilityError(
          "calendar:write",
          "ctx.calendar.updateEvent()",
        ),
      ),
    deleteEvent: vi
      .fn()
      .mockRejectedValue(
        new PluginCapabilityError(
          "calendar:write",
          "ctx.calendar.deleteEvent()",
        ),
      ),
    respondToEvent: vi
      .fn()
      .mockRejectedValue(
        new PluginCapabilityError(
          "calendar:write",
          "ctx.calendar.respondToEvent()",
        ),
      ),
  };
}

vi.mock("./calendar-context", () => ({
  createPluginCalendar: vi.fn().mockImplementation(() => {
    if (mockCalendarBehavior === "working") {
      return Promise.resolve(createWorkingCalendar());
    }
    if (mockCalendarBehavior === "read-only") {
      return Promise.resolve(createReadOnlyCalendar());
    }
    return Promise.resolve(createNoOpCalendar());
  }),
  createNoOpPluginCalendar: vi.fn(() => createNoOpCalendar()),
}));

vi.mock("./email-context", () => ({
  createPluginEmail: vi.fn(() => ({
    send: vi.fn().mockResolvedValue({ messageId: "msg-123" }),
    reply: vi.fn().mockResolvedValue({ messageId: "reply-123" }),
  })),
}));

vi.mock("./email-operations-context", () => ({
  createPluginEmailOperations: vi.fn().mockResolvedValue({
    applyLabel: vi.fn().mockResolvedValue({ success: true }),
    removeLabel: vi.fn().mockResolvedValue({ success: true }),
    moveToFolder: vi.fn().mockResolvedValue({ success: true }),
    archive: vi.fn().mockResolvedValue({ success: true }),
    unarchive: vi.fn().mockResolvedValue({ success: true }),
    markAsRead: vi.fn().mockResolvedValue({ success: true }),
    markAsUnread: vi.fn().mockResolvedValue({ success: true }),
    star: vi.fn().mockResolvedValue({ success: true }),
    unstar: vi.fn().mockResolvedValue({ success: true }),
    markAsImportant: vi.fn().mockResolvedValue({ success: true }),
    markAsNotImportant: vi.fn().mockResolvedValue({ success: true }),
    trash: vi.fn().mockResolvedValue({ success: true }),
    markAsSpam: vi.fn().mockResolvedValue({ success: true }),
    createLabel: vi.fn().mockResolvedValue("label-123"),
    deleteLabel: vi.fn().mockResolvedValue({ success: true }),
    listLabels: vi.fn().mockResolvedValue([{ id: "label-1", name: "Test" }]),
  }),
}));

vi.mock("@/utils/logger", () => ({
  createScopedLogger: vi.fn(() => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// -----------------------------------------------------------------------------
// Test Fixtures
// -----------------------------------------------------------------------------

function createTestEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: "email-123",
    threadId: "thread-456",
    subject: "Test Subject",
    from: "sender@example.com",
    to: [{ email: "recipient@example.com" }],
    snippet: "This is a preview snippet...",
    body: "Full email body content here",
    headers: { "X-Custom": "header-value" },
    date: "2024-01-15T10:00:00Z",
    ...overrides,
  };
}

function createTestEmailAccount(
  overrides: Partial<EmailAccount> = {},
): EmailAccount {
  return {
    id: "account-789",
    email: "user@example.com",
    provider: "google",
    userId: "user-001",
    user: {
      aiProvider: "openai",
      aiModel: "gpt-4",
      aiApiKey: "test-key",
    },
    ...overrides,
  };
}

function createTestManifest(
  capabilities: PluginManifest["capabilities"],
  overrides: Partial<PluginManifest> = {},
): PluginManifest {
  return {
    id: "test-plugin",
    name: "Test Plugin",
    version: "1.0.0",
    description: "A test plugin",
    author: "Test Author",
    entry: "index.ts",
    capabilities,
    ...overrides,
  };
}

function createTestContextOptions(
  capabilities: PluginManifest["capabilities"],
  overrides: Partial<ContextFactoryOptions> = {},
): ContextFactoryOptions {
  return {
    email: createTestEmail(),
    emailAccount: createTestEmailAccount(),
    manifest: createTestManifest(capabilities),
    userId: "user-001",
    pluginId: "test-plugin",
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("PluginCapabilityError", () => {
  it("creates error with correct properties", () => {
    const error = new PluginCapabilityError("email:send", "ctx.email.send()");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("PluginCapabilityError");
    expect(error.code).toBe("capability-not-declared");
    expect(error.capability).toBe("email:send");
    expect(error.operation).toBe("ctx.email.send()");
    expect(error.message).toContain("email:send");
    expect(error.message).toContain("ctx.email.send()");
    expect(error.message).toContain("plugin.json");
  });

  it("provides helpful guidance in error message", () => {
    const error = new PluginCapabilityError(
      "calendar:write",
      "ctx.calendar.createEvent()",
    );

    expect(error.message).toContain(
      'Add "calendar:write" to your capabilities array',
    );
  });
});

describe("createEmailContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCalendarBehavior = "no-op";
  });

  it("requires email to be provided", async () => {
    const options = createTestContextOptions(["email:classify"]);
    (options as Partial<ContextFactoryOptions>).email = undefined;

    await expect(createEmailContext(options)).rejects.toThrow(
      "Email is required",
    );
  });

  describe("Email Data Scoping", () => {
    it("provides full email body when capability implies full access", async () => {
      const options = createTestContextOptions(["email:draft"]);
      const ctx = await createEmailContext(options);

      expect(ctx.email.id).toBe("email-123");
      expect(ctx.email.subject).toBe("Test Subject");
      expect(ctx.email.from).toBe("sender@example.com");
      expect(ctx.email.snippet).toBe("This is a preview snippet...");
      expect(ctx.email.body).toBe("Full email body content here");
    });

    it("provides full email body for email:send capability", async () => {
      const options = createTestContextOptions(["email:send"]);
      const ctx = await createEmailContext(options);

      expect(ctx.email.body).toBe("Full email body content here");
    });

    it("provides full email body for automation:rule capability", async () => {
      const options = createTestContextOptions(["automation:rule"]);
      const ctx = await createEmailContext(options);

      expect(ctx.email.body).toBe("Full email body content here");
    });

    it("provides full email body for followup:detect capability", async () => {
      const options = createTestContextOptions(["followup:detect"]);
      const ctx = await createEmailContext(options);

      expect(ctx.email.body).toBe("Full email body content here");
    });

    it("provides only metadata for email:classify capability", async () => {
      const options = createTestContextOptions(["email:classify"]);
      const ctx = await createEmailContext(options);

      expect(ctx.email.id).toBe("email-123");
      expect(ctx.email.subject).toBe("Test Subject");
      expect(ctx.email.from).toBe("sender@example.com");
      expect(ctx.email.snippet).toBe("This is a preview snippet...");
      expect(ctx.email.body).toBeUndefined();
    });

    it("provides only metadata for email:signal capability", async () => {
      const options = createTestContextOptions(["email:signal"]);
      const ctx = await createEmailContext(options);

      expect(ctx.email.body).toBeUndefined();
    });

    it("provides only metadata for email:trigger capability", async () => {
      const options = createTestContextOptions(["email:trigger"]);
      const ctx = await createEmailContext(options);

      expect(ctx.email.body).toBeUndefined();
    });

    it("provides only metadata for email:modify capability", async () => {
      const options = createTestContextOptions(["email:modify"]);
      const ctx = await createEmailContext(options);

      expect(ctx.email.body).toBeUndefined();
    });

    it("provides minimal data for schedule:cron capability (no email capabilities)", async () => {
      const options = createTestContextOptions(["schedule:cron"]);
      const ctx = await createEmailContext(options);

      expect(ctx.email.id).toBe("email-123");
      expect(ctx.email.subject).toBe("");
      expect(ctx.email.from).toBe("");
      expect(ctx.email.snippet).toBe("");
      expect(ctx.email.body).toBeUndefined();
    });

    it("full access wins when multiple capabilities declared", async () => {
      const options = createTestContextOptions([
        "email:classify",
        "email:draft",
      ]);
      const ctx = await createEmailContext(options);

      expect(ctx.email.body).toBe("Full email body content here");
    });

    it("always provides headers", async () => {
      const options = createTestContextOptions(["email:classify"]);
      const ctx = await createEmailContext(options);

      expect(ctx.email.headers).toEqual({ "X-Custom": "header-value" });
    });
  });

  describe("Email Account", () => {
    it("provides safe email account info", async () => {
      const options = createTestContextOptions(["email:classify"]);
      const ctx = await createEmailContext(options);

      expect(ctx.emailAccount.email).toBe("user@example.com");
      expect(ctx.emailAccount.provider).toBe("google");
      // should not expose sensitive data
      expect(
        (ctx.emailAccount as unknown as Record<string, unknown>).id,
      ).toBeUndefined();
      expect(
        (ctx.emailAccount as unknown as Record<string, unknown>).userId,
      ).toBeUndefined();
    });
  });

  describe("LLM Access", () => {
    it("always provides LLM access regardless of capabilities", async () => {
      const options = createTestContextOptions(["schedule:cron"]);
      const ctx = await createEmailContext(options);

      expect(ctx.llm).toBeDefined();
      expect(typeof ctx.llm.generateText).toBe("function");
      expect(typeof ctx.llm.generateObject).toBe("function");
    });

    it("provides LLM for email:classify capability", async () => {
      const options = createTestContextOptions(["email:classify"]);
      const ctx = await createEmailContext(options);

      expect(ctx.llm).toBeDefined();
    });

    it("provides LLM for calendar:read capability", async () => {
      mockCalendarBehavior = "read-only";
      const options = createTestContextOptions(["calendar:read"]);
      const ctx = await createEmailContext(options);

      expect(ctx.llm).toBeDefined();
    });
  });

  describe("Storage Access", () => {
    it("always provides storage access regardless of capabilities", async () => {
      const options = createTestContextOptions(["schedule:cron"]);
      const ctx = await createEmailContext(options);

      expect(ctx.storage).toBeDefined();
      expect(typeof ctx.storage.get).toBe("function");
      expect(typeof ctx.storage.set).toBe("function");
      expect(typeof ctx.storage.delete).toBe("function");
      expect(typeof ctx.storage.getUserSettings).toBe("function");
      expect(typeof ctx.storage.setUserSettings).toBe("function");
      expect(typeof ctx.storage.getAccountSettings).toBe("function");
      expect(typeof ctx.storage.setAccountSettings).toBe("function");
    });
  });
});

describe("createDraftContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCalendarBehavior = "no-op";
  });

  it("extends email context with thread information", async () => {
    const threadMessages = [
      createTestEmail({ id: "msg-1", body: "First message" }),
      createTestEmail({ id: "msg-2", body: "Second message" }),
    ];

    const options = {
      ...createTestContextOptions(["email:draft"]),
      thread: threadMessages,
      preferences: { tone: "professional", language: "en" },
    };

    const ctx = await createDraftContext(options);

    expect(ctx.thread).toBeDefined();
    expect(ctx.thread?.messages).toHaveLength(2);
    expect(ctx.preferences?.tone).toBe("professional");
    expect(ctx.preferences?.language).toBe("en");
  });

  it("includes thread message bodies when capability allows", async () => {
    const threadMessages = [
      createTestEmail({ id: "msg-1", body: "First message body" }),
    ];

    const options = {
      ...createTestContextOptions(["email:draft"]),
      thread: threadMessages,
    };

    const ctx = await createDraftContext(options);

    expect(ctx.thread?.messages[0].body).toBe("First message body");
  });

  it("excludes thread message bodies when capability only allows metadata", async () => {
    const threadMessages = [
      createTestEmail({ id: "msg-1", body: "First message body" }),
    ];

    const options = {
      ...createTestContextOptions(["email:classify"]),
      thread: threadMessages,
    };

    const ctx = await createDraftContext(options);

    expect(ctx.thread?.messages[0].body).toBeUndefined();
  });
});

describe("createRuleContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires email to be provided", async () => {
    const options = createTestContextOptions(["automation:rule"]);
    (options as Partial<ContextFactoryOptions>).email = undefined;

    await expect(createRuleContext(options)).rejects.toThrow(
      "Email is required",
    );
  });

  it("provides rule data when supplied", async () => {
    const options = {
      ...createTestContextOptions(["automation:rule"]),
      ruleData: { threshold: 10, category: "test" },
    };

    const ctx = await createRuleContext(options);

    expect(ctx.ruleData).toEqual({ threshold: 10, category: "test" });
  });

  it("includes full email body for automation:rule capability", async () => {
    const options = createTestContextOptions(["automation:rule"]);
    const ctx = await createRuleContext(options);

    expect(ctx.email.body).toBe("Full email body content here");
  });
});

describe("createCalendarContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCalendarBehavior = "working";
  });

  it("provides calendar event data", async () => {
    const event = {
      id: "event-1",
      calendarId: "primary",
      summary: "Team Meeting",
      start: { dateTime: "2024-01-15T10:00:00Z" },
      end: { dateTime: "2024-01-15T11:00:00Z" },
    };

    const baseOptions = createTestContextOptions(["calendar:read"]);
    const options = {
      emailAccount: baseOptions.emailAccount,
      manifest: baseOptions.manifest,
      userId: baseOptions.userId,
      pluginId: baseOptions.pluginId,
      event,
    };

    const ctx = await createCalendarContext(options);

    expect(ctx.event.id).toBe("event-1");
    expect(ctx.event.summary).toBe("Team Meeting");
  });
});

describe("createTriggeredEmailContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCalendarBehavior = "no-op";
  });

  describe("Email Sender Capability Gating", () => {
    it("provides working email sender when email:send declared", async () => {
      const options = {
        ...createTestContextOptions(["email:trigger", "email:send"]),
        triggerId: "trigger-1",
        triggerType: "plus-tag" as const,
        matchedValue: "newsletter",
      };

      const ctx = await createTriggeredEmailContext(options);

      expect(ctx.emailSender).toBeDefined();
      // should not throw when calling
      await expect(
        ctx.emailSender.send({
          to: ["test@example.com"],
          subject: "Test",
          body: "Hello",
        }),
      ).resolves.toBeDefined();
    });

    it("throws PluginCapabilityError when email:send not declared", async () => {
      const options = {
        ...createTestContextOptions(["email:trigger"]),
        triggerId: "trigger-1",
        triggerType: "plus-tag" as const,
        matchedValue: "newsletter",
      };

      const ctx = await createTriggeredEmailContext(options);

      // throws synchronously when the capability is not declared
      expect(() =>
        ctx.emailSender.send({
          to: ["test@example.com"],
          subject: "Test",
          body: "Hello",
        }),
      ).toThrow(PluginCapabilityError);
    });

    it("throws for reply operation without email:send capability", async () => {
      const options = {
        ...createTestContextOptions(["email:trigger"]),
        triggerId: "trigger-1",
        triggerType: "plus-tag" as const,
        matchedValue: "newsletter",
      };

      const ctx = await createTriggeredEmailContext(options);

      // throws synchronously when the capability is not declared
      expect(() =>
        ctx.emailSender.reply({
          threadId: "thread-1",
          body: "Reply content",
        }),
      ).toThrow(PluginCapabilityError);
    });

    it("error message includes helpful capability guidance", async () => {
      const options = {
        ...createTestContextOptions(["email:trigger"]),
        triggerId: "trigger-1",
        triggerType: "plus-tag" as const,
        matchedValue: "newsletter",
      };

      const ctx = await createTriggeredEmailContext(options);

      try {
        await ctx.emailSender.send({
          to: ["test@example.com"],
          subject: "Test",
          body: "Hello",
        });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PluginCapabilityError);
        const capError = error as PluginCapabilityError;
        expect(capError.capability).toBe("email:send");
        expect(capError.message).toContain("email:send");
      }
    });
  });

  describe("Email Operations Capability Gating", () => {
    it("provides working email operations when email:modify declared", async () => {
      const options = {
        ...createTestContextOptions(["email:trigger", "email:modify"]),
        triggerId: "trigger-1",
        triggerType: "plus-tag" as const,
        matchedValue: "newsletter",
      };

      const ctx = await createTriggeredEmailContext(options);

      expect(ctx.emailOperations).toBeDefined();
      await expect(
        ctx.emailOperations.applyLabel("thread-1", "Test"),
      ).resolves.toBeDefined();
    });

    it("throws PluginCapabilityError for applyLabel without email:modify", async () => {
      const options = {
        ...createTestContextOptions(["email:trigger"]),
        triggerId: "trigger-1",
        triggerType: "plus-tag" as const,
        matchedValue: "newsletter",
      };

      const ctx = await createTriggeredEmailContext(options);

      // throws synchronously when the capability is not declared
      expect(() => ctx.emailOperations.applyLabel("thread-1", "Test")).toThrow(
        PluginCapabilityError,
      );
    });

    it("throws PluginCapabilityError for removeLabel without email:modify", async () => {
      const options = {
        ...createTestContextOptions(["email:trigger"]),
        triggerId: "trigger-1",
        triggerType: "plus-tag" as const,
        matchedValue: "newsletter",
      };

      const ctx = await createTriggeredEmailContext(options);

      // throws synchronously when the capability is not declared
      expect(() => ctx.emailOperations.removeLabel("thread-1", "Test")).toThrow(
        PluginCapabilityError,
      );
    });

    it("throws PluginCapabilityError for archive without email:modify", async () => {
      const options = {
        ...createTestContextOptions(["email:trigger"]),
        triggerId: "trigger-1",
        triggerType: "plus-tag" as const,
        matchedValue: "newsletter",
      };

      const ctx = await createTriggeredEmailContext(options);

      // throws synchronously when the capability is not declared
      expect(() => ctx.emailOperations.archive("thread-1")).toThrow(
        PluginCapabilityError,
      );
    });

    it("throws PluginCapabilityError for markAsSpam without email:modify", async () => {
      const options = {
        ...createTestContextOptions(["email:trigger"]),
        triggerId: "trigger-1",
        triggerType: "plus-tag" as const,
        matchedValue: "newsletter",
      };

      const ctx = await createTriggeredEmailContext(options);

      // throws synchronously when the capability is not declared
      expect(() => ctx.emailOperations.markAsSpam("thread-1")).toThrow(
        PluginCapabilityError,
      );
    });

    it("throws PluginCapabilityError for trash without email:modify", async () => {
      const options = {
        ...createTestContextOptions(["email:trigger"]),
        triggerId: "trigger-1",
        triggerType: "plus-tag" as const,
        matchedValue: "newsletter",
      };

      const ctx = await createTriggeredEmailContext(options);

      // throws synchronously when the capability is not declared
      expect(() => ctx.emailOperations.trash("thread-1")).toThrow(
        PluginCapabilityError,
      );
    });

    it("throws PluginCapabilityError for star without email:modify", async () => {
      const options = {
        ...createTestContextOptions(["email:trigger"]),
        triggerId: "trigger-1",
        triggerType: "plus-tag" as const,
        matchedValue: "newsletter",
      };

      const ctx = await createTriggeredEmailContext(options);

      // throws synchronously when the capability is not declared
      expect(() => ctx.emailOperations.star("thread-1")).toThrow(
        PluginCapabilityError,
      );
    });

    it("throws PluginCapabilityError for markAsRead without email:modify", async () => {
      const options = {
        ...createTestContextOptions(["email:trigger"]),
        triggerId: "trigger-1",
        triggerType: "plus-tag" as const,
        matchedValue: "newsletter",
      };

      const ctx = await createTriggeredEmailContext(options);

      // throws synchronously when the capability is not declared
      expect(() => ctx.emailOperations.markAsRead("thread-1")).toThrow(
        PluginCapabilityError,
      );
    });
  });

  it("provides trigger context data", async () => {
    const options = {
      ...createTestContextOptions(["email:trigger"]),
      triggerId: "trigger-1",
      triggerType: "from-pattern" as const,
      matchedValue: "*@newsletter.com",
    };

    const ctx = await createTriggeredEmailContext(options);

    expect(ctx.triggerId).toBe("trigger-1");
    expect(ctx.triggerType).toBe("from-pattern");
    expect(ctx.matchedValue).toBe("*@newsletter.com");
  });
});

describe("createScheduledTriggerContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCalendarBehavior = "no-op";
  });

  describe("Email Sender Capability Gating", () => {
    it("provides working email sender when email:send declared", async () => {
      const baseOptions = createTestContextOptions([
        "schedule:cron",
        "email:send",
      ]);
      const options = {
        emailAccount: baseOptions.emailAccount,
        manifest: baseOptions.manifest,
        userId: baseOptions.userId,
        pluginId: baseOptions.pluginId,
        scheduleId: "schedule-1",
        scheduleName: "Daily Digest",
        scheduledAt: new Date("2024-01-15T07:00:00Z"),
      };

      const ctx = await createScheduledTriggerContext(options);

      expect(ctx.emailSender).toBeDefined();
      await expect(
        ctx.emailSender.send({
          to: ["test@example.com"],
          subject: "Daily Digest",
          body: "Your daily summary",
        }),
      ).resolves.toBeDefined();
    });

    it("throws PluginCapabilityError when email:send not declared", async () => {
      const baseOptions = createTestContextOptions(["schedule:cron"]);
      const options = {
        emailAccount: baseOptions.emailAccount,
        manifest: baseOptions.manifest,
        userId: baseOptions.userId,
        pluginId: baseOptions.pluginId,
        scheduleId: "schedule-1",
        scheduleName: "Daily Digest",
        scheduledAt: new Date("2024-01-15T07:00:00Z"),
      };

      const ctx = await createScheduledTriggerContext(options);

      // throws synchronously when the capability is not declared
      expect(() =>
        ctx.emailSender.send({
          to: ["test@example.com"],
          subject: "Test",
          body: "Hello",
        }),
      ).toThrow(PluginCapabilityError);
    });
  });

  describe("Email Operations Capability Gating", () => {
    it("provides working email operations when email:modify declared", async () => {
      const baseOptions = createTestContextOptions([
        "schedule:cron",
        "email:modify",
      ]);
      const options = {
        emailAccount: baseOptions.emailAccount,
        manifest: baseOptions.manifest,
        userId: baseOptions.userId,
        pluginId: baseOptions.pluginId,
        scheduleId: "schedule-1",
        scheduleName: "Cleanup",
        scheduledAt: new Date("2024-01-15T07:00:00Z"),
      };

      const ctx = await createScheduledTriggerContext(options);

      expect(ctx.emailOperations).toBeDefined();
      await expect(
        ctx.emailOperations.applyLabel("thread-1", "Archived"),
      ).resolves.toBeDefined();
    });

    it("throws PluginCapabilityError without email:modify", async () => {
      const baseOptions = createTestContextOptions(["schedule:cron"]);
      const options = {
        emailAccount: baseOptions.emailAccount,
        manifest: baseOptions.manifest,
        userId: baseOptions.userId,
        pluginId: baseOptions.pluginId,
        scheduleId: "schedule-1",
        scheduleName: "Cleanup",
        scheduledAt: new Date("2024-01-15T07:00:00Z"),
      };

      const ctx = await createScheduledTriggerContext(options);

      // throws synchronously when the capability is not declared
      expect(() => ctx.emailOperations.applyLabel("thread-1", "Test")).toThrow(
        PluginCapabilityError,
      );
    });
  });

  it("provides schedule context data", async () => {
    const baseOptions = createTestContextOptions(["schedule:cron"]);
    const scheduledAt = new Date("2024-01-15T07:00:00Z");
    const options = {
      emailAccount: baseOptions.emailAccount,
      manifest: baseOptions.manifest,
      userId: baseOptions.userId,
      pluginId: baseOptions.pluginId,
      scheduleId: "schedule-1",
      scheduleName: "Daily Digest",
      scheduledAt,
      data: { reportType: "weekly" },
    };

    const ctx = await createScheduledTriggerContext(options);

    expect(ctx.scheduleId).toBe("schedule-1");
    expect(ctx.scheduleName).toBe("Daily Digest");
    expect(ctx.scheduledAt).toBe(scheduledAt);
    expect(ctx.data).toEqual({ reportType: "weekly" });
  });

  it("always provides LLM and storage", async () => {
    const baseOptions = createTestContextOptions(["schedule:cron"]);
    const options = {
      emailAccount: baseOptions.emailAccount,
      manifest: baseOptions.manifest,
      userId: baseOptions.userId,
      pluginId: baseOptions.pluginId,
      scheduleId: "schedule-1",
      scheduleName: "Test",
      scheduledAt: new Date(),
    };

    const ctx = await createScheduledTriggerContext(options);

    expect(ctx.llm).toBeDefined();
    expect(ctx.storage).toBeDefined();
  });
});

describe("Calendar API Capability Gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Without Calendar Capability", () => {
    beforeEach(() => {
      mockCalendarBehavior = "no-op";
    });

    it("throws PluginCapabilityError for listCalendars", async () => {
      const options = createTestContextOptions(["email:classify"]);
      const ctx = await createEmailContext(options);

      await expect(ctx.calendar.listCalendars()).rejects.toThrow(
        PluginCapabilityError,
      );
    });

    it("throws PluginCapabilityError for listEvents", async () => {
      const options = createTestContextOptions(["email:classify"]);
      const ctx = await createEmailContext(options);

      await expect(
        ctx.calendar.listEvents({ calendarId: "cal-1" }),
      ).rejects.toThrow(PluginCapabilityError);
    });

    it("throws PluginCapabilityError for getEvent", async () => {
      const options = createTestContextOptions(["email:classify"]);
      const ctx = await createEmailContext(options);

      await expect(ctx.calendar.getEvent("event-1")).rejects.toThrow(
        PluginCapabilityError,
      );
    });

    it("throws PluginCapabilityError for createEvent", async () => {
      const options = createTestContextOptions(["email:classify"]);
      const ctx = await createEmailContext(options);

      await expect(
        ctx.calendar.createEvent({
          summary: "Test Event",
          start: { dateTime: "2024-01-15T10:00:00Z" },
          end: { dateTime: "2024-01-15T11:00:00Z" },
        }),
      ).rejects.toThrow(PluginCapabilityError);
    });

    it("throws PluginCapabilityError for updateEvent", async () => {
      const options = createTestContextOptions(["email:classify"]);
      const ctx = await createEmailContext(options);

      await expect(
        ctx.calendar.updateEvent("event-1", { summary: "Updated" }),
      ).rejects.toThrow(PluginCapabilityError);
    });

    it("throws PluginCapabilityError for deleteEvent", async () => {
      const options = createTestContextOptions(["email:classify"]);
      const ctx = await createEmailContext(options);

      await expect(ctx.calendar.deleteEvent("event-1")).rejects.toThrow(
        PluginCapabilityError,
      );
    });

    it("throws PluginCapabilityError for respondToEvent", async () => {
      const options = createTestContextOptions(["email:classify"]);
      const ctx = await createEmailContext(options);

      await expect(
        ctx.calendar.respondToEvent("event-1", { response: "accepted" }),
      ).rejects.toThrow(PluginCapabilityError);
    });
  });

  describe("With calendar:read Capability", () => {
    beforeEach(() => {
      mockCalendarBehavior = "read-only";
    });

    it("allows listCalendars", async () => {
      const options = createTestContextOptions(["calendar:read"]);
      const ctx = await createEmailContext(options);

      await expect(ctx.calendar.listCalendars()).resolves.toEqual([
        { id: "cal-1", name: "Calendar", primary: true, canEdit: false },
      ]);
    });

    it("allows listEvents", async () => {
      const options = createTestContextOptions(["calendar:read"]);
      const ctx = await createEmailContext(options);

      const events = await ctx.calendar.listEvents({ calendarId: "cal-1" });
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe("event-1");
    });

    it("allows getEvent", async () => {
      const options = createTestContextOptions(["calendar:read"]);
      const ctx = await createEmailContext(options);

      const event = await ctx.calendar.getEvent("event-1");
      expect(event.id).toBe("event-1");
    });

    it("denies createEvent", async () => {
      const options = createTestContextOptions(["calendar:read"]);
      const ctx = await createEmailContext(options);

      await expect(
        ctx.calendar.createEvent({
          summary: "Test",
          start: { dateTime: "2024-01-15T10:00:00Z" },
          end: { dateTime: "2024-01-15T11:00:00Z" },
        }),
      ).rejects.toThrow(PluginCapabilityError);
    });

    it("denies updateEvent", async () => {
      const options = createTestContextOptions(["calendar:read"]);
      const ctx = await createEmailContext(options);

      await expect(
        ctx.calendar.updateEvent("event-1", { summary: "Updated" }),
      ).rejects.toThrow(PluginCapabilityError);
    });

    it("denies deleteEvent", async () => {
      const options = createTestContextOptions(["calendar:read"]);
      const ctx = await createEmailContext(options);

      await expect(ctx.calendar.deleteEvent("event-1")).rejects.toThrow(
        PluginCapabilityError,
      );
    });
  });

  describe("With calendar:list Capability", () => {
    beforeEach(() => {
      mockCalendarBehavior = "read-only";
    });

    it("allows listCalendars", async () => {
      const options = createTestContextOptions(["calendar:list"]);
      const ctx = await createEmailContext(options);

      await expect(ctx.calendar.listCalendars()).resolves.toBeDefined();
    });
  });

  describe("With calendar:write Capability", () => {
    beforeEach(() => {
      mockCalendarBehavior = "working";
    });

    it("allows all read operations", async () => {
      const options = createTestContextOptions(["calendar:write"]);
      const ctx = await createEmailContext(options);

      await expect(ctx.calendar.listCalendars()).resolves.toBeDefined();
      await expect(
        ctx.calendar.listEvents({ calendarId: "cal-1" }),
      ).resolves.toBeDefined();
      await expect(ctx.calendar.getEvent("event-1")).resolves.toBeDefined();
    });

    it("allows createEvent", async () => {
      const options = createTestContextOptions(["calendar:write"]);
      const ctx = await createEmailContext(options);

      const created = await ctx.calendar.createEvent({
        summary: "Test",
        start: { dateTime: "2024-01-15T10:00:00Z" },
        end: { dateTime: "2024-01-15T11:00:00Z" },
      });
      expect(created.id).toBe("new-event");
    });

    it("allows updateEvent", async () => {
      const options = createTestContextOptions(["calendar:write"]);
      const ctx = await createEmailContext(options);

      const updated = await ctx.calendar.updateEvent("event-1", {
        summary: "Updated",
      });
      expect(updated.summary).toBe("Updated");
    });

    it("allows deleteEvent", async () => {
      const options = createTestContextOptions(["calendar:write"]);
      const ctx = await createEmailContext(options);

      await expect(
        ctx.calendar.deleteEvent("event-1"),
      ).resolves.toBeUndefined();
    });

    it("allows respondToEvent", async () => {
      const options = createTestContextOptions(["calendar:write"]);
      const ctx = await createEmailContext(options);

      await expect(
        ctx.calendar.respondToEvent("event-1", { response: "accepted" }),
      ).resolves.toBeUndefined();
    });
  });
});

describe("Security Boundary Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCalendarBehavior = "no-op";
  });

  it("plugin with only email:classify cannot access email body", async () => {
    const options = createTestContextOptions(["email:classify"]);
    const ctx = await createEmailContext(options);

    expect(ctx.email.body).toBeUndefined();
  });

  it("plugin with only email:classify cannot send emails", async () => {
    const options = {
      ...createTestContextOptions(["email:classify"]),
      triggerId: "trigger-1",
      triggerType: "plus-tag" as const,
      matchedValue: "test",
    };

    const ctx = await createTriggeredEmailContext(options);

    // throws synchronously when the capability is not declared
    expect(() =>
      ctx.emailSender.send({
        to: ["test@example.com"],
        subject: "Test",
        body: "Hello",
      }),
    ).toThrow(PluginCapabilityError);
  });

  it("plugin with only email:classify cannot modify emails", async () => {
    const options = {
      ...createTestContextOptions(["email:classify"]),
      triggerId: "trigger-1",
      triggerType: "plus-tag" as const,
      matchedValue: "test",
    };

    const ctx = await createTriggeredEmailContext(options);

    // throws synchronously when the capability is not declared
    expect(() => ctx.emailOperations.applyLabel("thread-1", "Test")).toThrow(
      PluginCapabilityError,
    );
  });

  it("plugin with only email:classify cannot access calendar", async () => {
    const options = createTestContextOptions(["email:classify"]);
    const ctx = await createEmailContext(options);

    await expect(ctx.calendar.listCalendars()).rejects.toThrow(
      PluginCapabilityError,
    );
  });

  it("plugin with only schedule:cron gets minimal email data", async () => {
    const options = createTestContextOptions(["schedule:cron"]);
    const ctx = await createEmailContext(options);

    expect(ctx.email.id).toBe("email-123");
    expect(ctx.email.subject).toBe("");
    expect(ctx.email.from).toBe("");
    expect(ctx.email.snippet).toBe("");
    expect(ctx.email.body).toBeUndefined();
  });

  it("plugin always has access to LLM regardless of other capabilities", async () => {
    const options = createTestContextOptions(["schedule:cron"]);
    const ctx = await createEmailContext(options);

    expect(ctx.llm).toBeDefined();
    expect(typeof ctx.llm.generateText).toBe("function");
    expect(typeof ctx.llm.generateObject).toBe("function");
  });

  it("plugin always has access to storage regardless of other capabilities", async () => {
    const options = createTestContextOptions(["schedule:cron"]);
    const ctx = await createEmailContext(options);

    expect(ctx.storage).toBeDefined();
    expect(typeof ctx.storage.get).toBe("function");
    expect(typeof ctx.storage.set).toBe("function");
    expect(typeof ctx.storage.delete).toBe("function");
  });

  it("multiple capabilities combine correctly", async () => {
    // plugin with both email:classify and email:draft should get full email body
    const options = createTestContextOptions(["email:classify", "email:draft"]);
    const ctx = await createEmailContext(options);

    expect(ctx.email.body).toBe("Full email body content here");
  });

  describe("Capability Isolation Between Plugins", () => {
    it("different plugin IDs get isolated storage", async () => {
      const { createPluginStorage } = await import("./storage-context");

      const options1 = createTestContextOptions(["email:classify"], {
        pluginId: "plugin-a",
      });
      const options2 = createTestContextOptions(["email:classify"], {
        pluginId: "plugin-b",
      });

      await createEmailContext(options1);
      await createEmailContext(options2);

      // verify createPluginStorage was called with different plugin IDs
      expect(createPluginStorage).toHaveBeenCalledWith(
        "plugin-a",
        expect.any(String),
        expect.any(String),
      );
      expect(createPluginStorage).toHaveBeenCalledWith(
        "plugin-b",
        expect.any(String),
        expect.any(String),
      );
    });
  });
});

describe("Provider Support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCalendarBehavior = "no-op";
  });

  it("works with Google provider", async () => {
    const options = createTestContextOptions(["email:classify"], {
      emailAccount: createTestEmailAccount({ provider: "google" }),
    });

    const ctx = await createEmailContext(options);

    expect(ctx.emailAccount.provider).toBe("google");
  });

  it("works with Microsoft provider", async () => {
    const options = createTestContextOptions(["email:classify"], {
      emailAccount: createTestEmailAccount({ provider: "microsoft" }),
    });

    const ctx = await createEmailContext(options);

    expect(ctx.emailAccount.provider).toBe("microsoft");
  });
});
