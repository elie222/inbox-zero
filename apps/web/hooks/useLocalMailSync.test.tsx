// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLocalMailSync } from "./useLocalMailSync";
import {
  retainLocalMailSync,
  setLocalMailSyncPriority,
} from "@/utils/email-cache/local-mail-sync-runtime";

vi.mock("@/utils/email-cache/local-mail-sync-runtime", () => ({
  retainLocalMailSync: vi.fn(),
  setLocalMailSyncPriority: vi.fn(),
}));

describe("local mail runtime lifetime", () => {
  it("changes active account priority without replacing an in-flight account runtime", () => {
    const release = vi.fn();
    vi.mocked(retainLocalMailSync).mockReturnValue(release);
    const { rerender, unmount } = renderHook(
      (props) => useLocalMailSync(props),
      {
        initialProps: {
          emailAccountId: "account",
          enabled: true,
          priority: false,
        },
      },
    );
    rerender({ emailAccountId: "account", enabled: true, priority: true });
    expect(retainLocalMailSync).toHaveBeenCalledOnce();
    expect(release).not.toHaveBeenCalled();
    expect(setLocalMailSyncPriority).toHaveBeenLastCalledWith("account", true);
    unmount();
    expect(release).toHaveBeenCalledOnce();
  });
});
