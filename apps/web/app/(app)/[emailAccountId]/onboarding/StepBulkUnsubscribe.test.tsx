// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StepBulkUnsubscribe } from "./StepBulkUnsubscribe";

const mocks = vi.hoisted(() => ({
  swr: {
    data: undefined as any,
    isLoading: true,
    mutate: vi.fn(),
  },
  posthog: {
    capture: vi.fn(),
  },
  onBulkUnsubscribe: vi.fn(),
  refetchPremium: vi.fn(),
}));

vi.mock("swr", () => ({
  default: () => mocks.swr,
}));

vi.mock("posthog-js/react", () => ({
  usePostHog: () => mocks.posthog,
}));

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ emailAccountId: "account-test" }),
}));

vi.mock("@/hooks/usePremium", () => ({
  usePremium: () => ({
    hasUnsubscribeAccess: true,
    mutate: mocks.refetchPremium,
  }),
}));

vi.mock("@/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks", () => ({
  useBulkUnsubscribe: () => ({
    onBulkUnsubscribe: mocks.onBulkUnsubscribe,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.swr.data = undefined;
  mocks.swr.isLoading = true;
});

afterEach(cleanup);

describe("StepBulkUnsubscribe", () => {
  it("renders a Skip for now button while loading and proceeds on click", async () => {
    const onNext = vi.fn();
    const { getByText } = render(<StepBulkUnsubscribe onNext={onNext} />);

    const skipButton = getByText("Skip for now");
    expect(skipButton).toBeDefined();

    await act(async () => {
      skipButton.click();
    });

    expect(onNext).toHaveBeenCalledOnce();
    expect(mocks.posthog.capture).toHaveBeenCalledWith(
      "onboarding_unsubscribe_skipped",
      expect.objectContaining({
        selectedCount: 0,
      }),
    );
  });

  it("renders static marketing content and allows continuing when data is empty", async () => {
    mocks.swr.isLoading = false;
    mocks.swr.data = { newsletters: [] };

    const onNext = vi.fn();
    const { getByText } = render(<StepBulkUnsubscribe onNext={onNext} />);

    const continueButton = getByText("Continue");
    expect(continueButton).toBeDefined();

    await act(async () => {
      continueButton.click();
    });

    expect(onNext).toHaveBeenCalledOnce();
  });
});
