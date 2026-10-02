// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StepDraft } from "./StepDraft";

const CUSTOM_RULES = "/account-1/onboarding?step=customRules";

/**
 * Models the Next.js App Router path that rewrote the address bar in
 * production, not a second click:
 *
 * - `server-action-reducer` resolves the action promise, then — because
 *   `enableDraftRepliesAction` calls `revalidatePath` — navigates to
 *   `state.canonicalUrl` captured when that action started.
 * - `HistoryUpdater` writes that canonical URL with pushState/replaceState.
 *   `$pageview` follows `useSearchParams`, so this shows up as a load of
 *   `?step=draft` with no `onboarding_next`.
 * - `dispatchAction` discards only `actionQueue.pending` when `router.push`
 *   starts. Actions already bound to `?step=draft` still commit it later.
 */
function createRevalidatingRouter() {
  let canonicalUrl = "/account-1/onboarding?step=draft";
  let pending: { discarded: boolean } | null = null;
  const commits: Array<() => void> = [];

  const enableDraftRepliesAction = vi.fn(() => {
    const capturedUrl = canonicalUrl;
    const action = { discarded: false };
    if (!pending) pending = action;

    let resolveAction: (value: { serverError?: string }) => void = () => {};
    const result = new Promise<{ serverError?: string }>((resolve) => {
      resolveAction = resolve;
    });

    return Object.assign(result, {
      settle() {
        resolveAction({});
        // The revalidation navigation is applied after the awaited action
        // continues into onNext, matching resolve() before the reducer returns.
        commits.push(() => {
          if (!action.discarded) canonicalUrl = capturedUrl;
        });
      },
    });
  });

  return {
    enableDraftRepliesAction,
    push(href: string) {
      if (pending) pending.discarded = true;
      pending = null;
      canonicalUrl = href;
    },
    applyRevalidationCommits() {
      for (const commit of commits.splice(0)) commit();
    },
    get canonicalUrl() {
      return canonicalUrl;
    },
  };
}

const mocks = vi.hoisted(() => ({
  enableDraftRepliesAction: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // biome-ignore lint/performance/noImgElement: test double for next/image
    <img {...props} alt={props.alt || ""} width={1} height={1} />
  ),
}));

vi.mock("@/utils/actions/rule", () => ({
  enableDraftRepliesAction: (...args: unknown[]) =>
    mocks.enableDraftRepliesAction(...args),
}));

describe("StepDraft overlapping choices", () => {
  beforeEach(() => {
    mocks.enableDraftRepliesAction.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("stays on the next step when overlapping draft actions settle late", async () => {
    const router = createRevalidatingRouter();
    mocks.enableDraftRepliesAction.mockImplementation(
      router.enableDraftRepliesAction,
    );

    render(
      <StepDraft
        emailAccountId="account-1"
        provider="google"
        onNext={() => router.push(CUSTOM_RULES)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Yes, please" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, please" }));
    fireEvent.click(screen.getByRole("button", { name: "No, thanks" }));

    const actions = mocks.enableDraftRepliesAction.mock.results.map(
      (result) =>
        result.value as ReturnType<typeof router.enableDraftRepliesAction>,
    );

    await act(async () => {
      for (const action of actions) action.settle();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(router.canonicalUrl).toBe(CUSTOM_RULES);

    await act(async () => {
      router.applyRevalidationCommits();
    });

    expect(router.canonicalUrl).toBe(CUSTOM_RULES);
  });
});
