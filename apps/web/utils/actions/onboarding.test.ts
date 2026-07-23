import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  saveOnboardingAnswersAction,
  saveOnboardingChatAnswersAction,
} from "./onboarding";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));
vi.mock("@sentry/nextjs", () => import("@/__tests__/mocks/sentry-nextjs.mock"));

const { updateContactRoleMock, updateContactCompanySizeMock } = vi.hoisted(
  () => ({
    updateContactRoleMock: vi.fn().mockResolvedValue(undefined),
    updateContactCompanySizeMock: vi.fn().mockResolvedValue(undefined),
  }),
);

vi.mock("@inboxzero/loops", async (importActual) => {
  const actual = await importActual<typeof import("@inboxzero/loops")>();

  return {
    ...actual,
    updateContactRole: updateContactRoleMock,
    updateContactCompanySize: updateContactCompanySizeMock,
  };
});

const { trackOnboardingAnswerMock } = vi.hoisted(() => ({
  trackOnboardingAnswerMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/posthog", async (importActual) => {
  const actual = await importActual<typeof import("@/utils/posthog")>();

  return {
    ...actual,
    trackOnboardingAnswer: trackOnboardingAnswerMock,
  };
});

describe("saveOnboardingAnswersAction", () => {
  const questions = [{ key: "role" }, { key: "company_size" }] as any;
  const answers = {
    $survey_response: "Founder",
    $survey_response_1: "10",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("schedules side effects when the DB update succeeds", async () => {
    prisma.user.update.mockResolvedValue({ id: "user-1" } as any);

    const result = await saveOnboardingAnswersAction({
      surveyId: "s1",
      questions,
      answers,
    });

    expect(result?.serverError).toBeUndefined();
    expect(updateContactRoleMock).toHaveBeenCalledWith({
      email: "user@example.com",
      role: "Founder",
    });
    expect(updateContactCompanySizeMock).toHaveBeenCalledWith({
      email: "user@example.com",
      companySize: 10,
    });
    expect(trackOnboardingAnswerMock).toHaveBeenCalled();
  });

  it("does not schedule side effects when the DB update fails", async () => {
    prisma.user.update.mockRejectedValue(new Error("db down"));

    const result = await saveOnboardingAnswersAction({
      surveyId: "s1",
      questions,
      answers,
    });

    expect(result?.serverError).toBeDefined();
    expect(updateContactRoleMock).not.toHaveBeenCalled();
    expect(updateContactCompanySizeMock).not.toHaveBeenCalled();
    expect(trackOnboardingAnswerMock).not.toHaveBeenCalled();
  });
});

describe("saveOnboardingChatAnswersAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.update.mockResolvedValue({ id: "user-1" } as any);
  });

  it("tracks the chat survey goal only when the struggle answer is first saved", async () => {
    const result = await saveOnboardingChatAnswersAction({
      answers: [
        {
          key: "role",
          question: "What do you do?",
          answer: "Founder",
          isFreeform: false,
        },
        {
          key: "struggle",
          question: "What about your inbox is driving you up the wall?",
          answer: "Too many newsletters",
          isFreeform: false,
        },
      ],
    });

    expect(result?.serverError).toBeUndefined();
    expect(trackOnboardingAnswerMock).toHaveBeenCalledTimes(1);
    expect(trackOnboardingAnswerMock).toHaveBeenCalledWith("user@example.com", {
      surveyGoal: "Too many newsletters",
    });
  });

  it("does not re-track the chat survey goal on later transcript saves", async () => {
    const result = await saveOnboardingChatAnswersAction({
      answers: [
        {
          key: "role",
          question: "What do you do?",
          answer: "Founder",
          isFreeform: false,
        },
        {
          key: "struggle",
          question: "What about your inbox is driving you up the wall?",
          answer: "Too many newsletters",
          isFreeform: false,
        },
        {
          key: "volume",
          question: "How much email hits your inbox on a normal day?",
          answer: "50-100",
          isFreeform: false,
        },
      ],
    });

    expect(result?.serverError).toBeUndefined();
    expect(trackOnboardingAnswerMock).not.toHaveBeenCalled();
  });
});
