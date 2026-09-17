// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";
import { readLocalMailSettings } from "./local-mail-settings";

vi.mock("@/utils/desktop-app", () => ({ getInboxZeroDesktopApp: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

it("gives the desktop app a larger storage budget than the browser", () => {
  const MIB = 1024 * 1024;
  vi.mocked(getInboxZeroDesktopApp).mockReturnValue(undefined);
  expect(readLocalMailSettings()).toEqual({
    budgetBytes: 500 * MIB,
    attachmentBudgetBytes: 50 * MIB,
  });
  vi.mocked(getInboxZeroDesktopApp).mockReturnValue({} as never);
  expect(readLocalMailSettings()).toEqual({
    budgetBytes: 2048 * MIB,
    attachmentBudgetBytes: 250 * MIB,
  });
});
