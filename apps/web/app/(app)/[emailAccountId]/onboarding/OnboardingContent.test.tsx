// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingContent } from "./OnboardingContent";

const mocks = vi.hoisted(() => ({
  analyzePersona: vi.fn(),
  mutate: vi.fn(),
  push: vi.fn(),
  completeAndRedirect: vi.fn(),
  inboxOnNext: undefined as (() => Promise<void> | void) | undefined,
  analytics: {
    onStart: vi.fn(),
    onStepViewed: vi.fn(),
    onNext: vi.fn(),
    onComplete: vi.fn(),
    onSkip: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/hooks/usePersona", () => ({
  usePersona: () => ({ data: undefined, mutate: mocks.mutate }),
}));
vi.mock("@/utils/actions/email-account", () => ({
  analyzePersonaAction: mocks.analyzePersona,
}));
vi.mock("@/hooks/useAnalytics", () => ({
  useOnboardingAnalytics: () => mocks.analytics,
}));
vi.mock("@/hooks/useSignupEvent", () => ({ useSignUpEvent: vi.fn() }));
vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ emailAccountId: "account-test", provider: "google" }),
}));
vi.mock("@/hooks/useOrganizationMembership", () => ({
  useOrganizationMembership: () => ({ data: {} }),
}));
vi.mock("@/hooks/useRules", () => ({ useRules: () => ({ data: [] }) }));
vi.mock("./useCompleteOnboarding", () => ({
  useCompleteOnboarding: () => ({
    destination: "welcome-upgrade",
    completeAndRedirect: mocks.completeAndRedirect,
  }),
}));
vi.mock("@/components/EmailStatsPreloader", () => ({
  EmailStatsPreloader: () => null,
}));
vi.mock("./StepWho", () => ({ StepWho: () => null }));
vi.mock("./StepChat", () => ({ StepChat: () => null }));
vi.mock("./StepEmailsSorted", () => ({ StepEmailsSorted: () => null }));
vi.mock("./StepDraftReplies", () => ({ StepDraftReplies: () => null }));
vi.mock("./StepBulkUnsubscribe", () => ({ StepBulkUnsubscribe: () => null }));
vi.mock("./StepLabels", () => ({ StepLabels: () => null }));
vi.mock("./StepDraft", () => ({ StepDraft: () => null }));
vi.mock("./StepCustomRules", () => ({ StepCustomRules: () => null }));
vi.mock("./StepInboxProcessed", () => ({
  StepInboxProcessed: ({ onNext }: { onNext: () => Promise<void> | void }) => {
    mocks.inboxOnNext = onNext;
    return null;
  },
}));
vi.mock("./StepCompanySize", () => ({ StepCompanySize: () => null }));
vi.mock("./StepHowYouHeard", () => ({ StepHowYouHeard: () => null }));
vi.mock("./StepInviteTeam", () => ({ StepInviteTeam: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("onboarding persona analysis", () => {
  it("does not access the disposed cache when analysis finishes after navigation", async () => {
    const analysis = Promise.withResolvers<void>();
    mocks.analyzePersona.mockReturnValue(analysis.promise);
    const { unmount } = render(<OnboardingContent />);
    expect(mocks.analyzePersona).toHaveBeenCalledWith("account-test");

    unmount();
    await act(async () => analysis.resolve());

    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("refreshes persona data when analysis finishes while onboarding is mounted", async () => {
    const analysis = Promise.withResolvers<void>();
    mocks.analyzePersona.mockReturnValue(analysis.promise);
    render(<OnboardingContent />);

    await act(async () => analysis.resolve());

    expect(mocks.mutate).toHaveBeenCalledOnce();
  });
});

describe("onboarding completion", () => {
  it("retries completion when the final step fails", async () => {
    mocks.completeAndRedirect
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    render(<OnboardingContent step="inboxProcessed" />);

    await act(async () => {
      await mocks.inboxOnNext?.();
    });
    await act(async () => {
      await mocks.inboxOnNext?.();
    });

    expect(mocks.completeAndRedirect).toHaveBeenCalledTimes(2);
  });
});
