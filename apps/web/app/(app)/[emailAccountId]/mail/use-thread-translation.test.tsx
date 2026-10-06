// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMessageTranslation,
  useThreadTranslation,
  useTranslateThread,
} from "@/app/(app)/[emailAccountId]/mail/use-thread-translation";

const { mockTranslateThreadAction } = vi.hoisted(() => ({
  mockTranslateThreadAction: vi.fn(),
}));

vi.mock("@/utils/actions/translate", () => ({
  translateThreadAction: mockTranslateThreadAction,
}));

describe("useTranslateThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
    mockTranslateThreadAction.mockResolvedValue({
      data: {
        subject: "Thanks for your message",
        messages: [
          { id: "m1", text: "Hello", sourceLanguage: "de" },
          { id: "m2", text: "Thanks", sourceLanguage: "en" },
        ],
      },
    });
  });

  it("translates foreign messages and toggles back without refetching", async () => {
    const { result } = renderHook(
      () => ({
        translate: useTranslateThread(),
        translation: useThreadTranslation("account-1", "thread-1"),
      }),
      { wrapper },
    );
    const translate = () =>
      result.current.translate({
        emailAccountId: "account-1",
        threadId: "thread-1",
        messageIds: ["m1", "m2"],
      });

    await act(translate);

    expect(mockTranslateThreadAction).toHaveBeenCalledWith("account-1", {
      messageIds: ["m1", "m2"],
      targetLanguage: "en-US",
    });
    expect(result.current.translation?.subject).toBe("Thanks for your message");
    expect(getMessageTranslation(result.current.translation, "m1")).toEqual({
      text: "Hello",
      languageName: "German",
      showOriginal: false,
    });
    expect(getMessageTranslation(result.current.translation, "m2")).toBeNull();

    await act(translate);

    expect(mockTranslateThreadAction).toHaveBeenCalledTimes(1);
    expect(
      getMessageTranslation(result.current.translation, "m1")?.showOriginal,
    ).toBe(true);
  });

  it("only requests messages that arrived after the last translation", async () => {
    const { result } = renderHook(() => useTranslateThread(), { wrapper });

    await act(() =>
      result.current({
        emailAccountId: "account-1",
        threadId: "thread-1",
        messageIds: ["m1", "m2"],
      }),
    );
    await act(() =>
      result.current({
        emailAccountId: "account-1",
        threadId: "thread-1",
        messageIds: ["m1", "m2", "m3"],
      }),
    );

    expect(mockTranslateThreadAction).toHaveBeenLastCalledWith("account-1", {
      messageIds: ["m3"],
      targetLanguage: "en-US",
    });
  });
});

function wrapper({ children }: { children: ReactNode }) {
  return <Provider>{children}</Provider>;
}
