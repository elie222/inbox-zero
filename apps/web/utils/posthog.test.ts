import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/prisma";

const mockEnv = vi.hoisted(() => ({
  NEXT_PUBLIC_POSTHOG_KEY: "phc_test_key",
  NEXT_PUBLIC_POSTHOG_API_HOST: undefined as string | undefined,
  POSTHOG_API_SECRET: "posthog-secret",
  POSTHOG_PROJECT_ID: "project-1",
  POSTHOG_FEEDBACK_SURVEY_ID: "survey-1" as string | undefined,
  POSTHOG_FEEDBACK_SURVEY_QUESTION_ID: "question-1" as string | undefined,
  NODE_ENV: "test",
}));

vi.mock("@/env", () => ({
  env: mockEnv,
}));

const captureMock = vi.fn();
const shutdownMock = vi.fn().mockResolvedValue(undefined);

vi.mock("posthog-node", () => ({
  PostHog: class PostHogMock {
    capture = captureMock;
    shutdown = shutdownMock;
  },
}));

vi.mock("@/utils/redis", () => ({
  redis: {
    set: vi.fn(),
  },
}));

vi.mock("@/utils/prisma");

import {
  FIRST_TIME_EVENTS,
  deletePosthogUser,
  trackFirstTimeEvent,
  trackProductFeedback,
  trackUserDeleted,
  trackUserDeletionRequested,
} from "./posthog";
import { redis } from "@/utils/redis";

describe("trackFirstTimeEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captures PostHog once when Redis grants the NX lock and user email exists", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");

    prisma.emailAccount.findUnique.mockResolvedValue({
      user: { email: "person@example.com" },
    } as any);

    await trackFirstTimeEvent({
      emailAccountId: "acct-1",
      event: FIRST_TIME_EVENTS.FIRST_CHAT_MESSAGE,
      properties: { source: "test" },
    });

    expect(redis.set).toHaveBeenCalledWith(
      `first-event:acct-1:${FIRST_TIME_EVENTS.FIRST_CHAT_MESSAGE}`,
      "1",
      { nx: true },
    );
    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(captureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: "person@example.com",
        event: FIRST_TIME_EVENTS.FIRST_CHAT_MESSAGE,
        properties: expect.objectContaining({
          emailAccountId: "acct-1",
          source: "test",
        }),
      }),
    );
    expect(shutdownMock).toHaveBeenCalledTimes(1);
  });

  it("does not capture when Redis reports the dedupe key already exists", async () => {
    vi.mocked(redis.set).mockResolvedValue(null);

    await trackFirstTimeEvent({
      emailAccountId: "acct-2",
      event: FIRST_TIME_EVENTS.FIRST_AUTOMATED_RULE_RUN,
    });

    expect(prisma.emailAccount.findUnique).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("does not hit Redis on a second call for the same account and event in-process", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");

    prisma.emailAccount.findUnique.mockResolvedValue({
      user: { email: "repeat@example.com" },
    } as any);

    await trackFirstTimeEvent({
      emailAccountId: "acct-3",
      event: FIRST_TIME_EVENTS.FIRST_DRAFT_SENT,
    });
    await trackFirstTimeEvent({
      emailAccountId: "acct-3",
      event: FIRST_TIME_EVENTS.FIRST_DRAFT_SENT,
    });

    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(captureMock).toHaveBeenCalledTimes(1);
  });

  it("evicts older in-process dedupe keys so the cache stays bounded", async () => {
    vi.mocked(redis.set).mockResolvedValue(null);

    await trackFirstTimeEvent({
      emailAccountId: "bounded-cache-first-account",
      event: FIRST_TIME_EVENTS.FIRST_CHAT_MESSAGE,
    });

    for (let i = 0; i < 1000; i++) {
      await trackFirstTimeEvent({
        emailAccountId: `bounded-cache-account-${i}`,
        event: FIRST_TIME_EVENTS.FIRST_CHAT_MESSAGE,
      });
    }

    await trackFirstTimeEvent({
      emailAccountId: "bounded-cache-first-account",
      event: FIRST_TIME_EVENTS.FIRST_CHAT_MESSAGE,
    });

    expect(redis.set).toHaveBeenCalledTimes(1002);
    expect(redis.set).toHaveBeenLastCalledWith(
      `first-event:bounded-cache-first-account:${FIRST_TIME_EVENTS.FIRST_CHAT_MESSAGE}`,
      "1",
      { nx: true },
    );
  });

  it("does not capture when the email account has no user email", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");

    prisma.emailAccount.findUnique.mockResolvedValue({
      user: { email: null },
    } as any);

    await trackFirstTimeEvent({
      emailAccountId: "orphan-acct",
      event: FIRST_TIME_EVENTS.FIRST_CHAT_MESSAGE,
    });

    expect(captureMock).not.toHaveBeenCalled();
  });
});

describe("user deletion events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("encodes email special characters when looking up the PostHog user", async () => {
    const email = "person+tag&team#100%@example.com";
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        json: async () => ({
          results: [{ id: "person-id", distinct_ids: [email] }],
        }),
      } as Response)
      .mockResolvedValueOnce({} as Response);

    await deletePosthogUser({ email });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "https://app.posthog.com/api/projects/project-1/persons/?distinct_id=person%2Btag%26team%23100%25%40example.com",
      {
        headers: {
          Authorization: "Bearer posthog-secret",
        },
      },
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "https://app.posthog.com/api/projects/project-1/persons/person-id/?delete_events=true",
      {
        method: "DELETE",
        headers: {
          Authorization: "Bearer posthog-secret",
        },
      },
    );
  });

  it("captures deletion requested with an anonymous distinct id", async () => {
    await trackUserDeletionRequested("user-1");

    expect(captureMock).toHaveBeenCalledWith({
      distinctId: "anonymous",
      event: "User deletion requested",
      properties: { userId: "user-1" },
      sendFeatureFlags: false,
    });
    expect(shutdownMock).toHaveBeenCalledTimes(1);
  });

  it("captures deletion completed with an anonymous distinct id", async () => {
    await trackUserDeleted("user-1");

    expect(captureMock).toHaveBeenCalledWith({
      distinctId: "anonymous",
      event: "User deleted",
      properties: { userId: "user-1" },
      sendFeatureFlags: false,
    });
    expect(shutdownMock).toHaveBeenCalledTimes(1);
  });
});

describe("trackProductFeedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.POSTHOG_FEEDBACK_SURVEY_ID = "survey-1";
    mockEnv.POSTHOG_FEEDBACK_SURVEY_QUESTION_ID = "question-1";
  });

  it("captures a regular event and an ID-based survey sent event", async () => {
    await trackProductFeedback("user@example.com", "Love the assistant");

    expect(captureMock).toHaveBeenCalledTimes(2);
    expect(captureMock).toHaveBeenNthCalledWith(1, {
      distinctId: "user@example.com",
      event: "Product feedback submitted",
      properties: { feedback: "Love the assistant" },
      sendFeatureFlags: undefined,
    });
    expect(captureMock).toHaveBeenNthCalledWith(2, {
      distinctId: "user@example.com",
      event: "survey sent",
      properties: {
        $survey_id: "survey-1",
        "$survey_response_question-1": "Love the assistant",
        $survey_questions: [
          {
            id: "question-1",
            question: "What's your feedback?",
          },
        ],
        $survey_completed: true,
      },
      sendFeatureFlags: undefined,
    });
  });
  it("still captures the regular event when survey env vars are missing", async () => {
    mockEnv.POSTHOG_FEEDBACK_SURVEY_ID = undefined;
    mockEnv.POSTHOG_FEEDBACK_SURVEY_QUESTION_ID = undefined;

    await trackProductFeedback("user@example.com", "Still useful");

    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(captureMock).toHaveBeenCalledWith({
      distinctId: "user@example.com",
      event: "Product feedback submitted",
      properties: { feedback: "Still useful" },
      sendFeatureFlags: undefined,
    });
  });
});
