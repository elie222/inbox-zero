import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSettingActionErrorHandler,
  showSettingActionError,
} from "@/utils/actions/error-handling";
import { toastError } from "@/components/Toast";

vi.mock("@/components/Toast", () => ({
  toastError: vi.fn(),
}));

describe("setting action error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls mutate and shows prefixed server error", () => {
    const mutate = vi.fn();
    const onError = createSettingActionErrorHandler({
      mutate,
      prefix: "Failed to update setting",
    });

    onError({
      error: {
        serverError: "Request failed",
      },
    });

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith({
      description: "Failed to update setting. Request failed",
    });
  });

  it("uses default fallback when no error details are available", () => {
    showSettingActionError({
      error: {},
      defaultMessage: "Fallback message",
    });

    expect(toastError).toHaveBeenCalledWith({
      description: "Fallback message",
    });
  });
});
