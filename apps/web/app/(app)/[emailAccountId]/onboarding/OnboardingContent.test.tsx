// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingContent } from "./OnboardingContent";

const mocks = vi.hoisted(() => ({
  analyzePersona: vi.fn(),
  mutate: vi.fn(),
  analytics: { onStart: vi.fn(), onStepViewed: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
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
  useCompleteOnboarding: () => ({ destination: "welcome-upgrade" }),
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
vi.mock("./StepInboxProcessed", () => ({ StepInboxProcessed: () => null }));
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
