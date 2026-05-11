import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { saveOnboardingAnswersAction } from "./onboarding";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();

  return {
    ...actual,
    after: vi.fn((callback: () => Promise<void> | void) => callback()),
  };
});
vi.mock("@sentry/nextjs", () => ({
  setTag: vi.fn(),
  setUser: vi.fn(),
  captureException: vi.fn(),
  withServerActionInstrumentation: vi.fn(
    async (_name: string, callback: () => Promise<unknown>) => callback(),
  ),
}));

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
