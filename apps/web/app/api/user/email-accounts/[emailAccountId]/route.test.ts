import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteEmailAccountAction } = vi.hoisted(() => ({
  deleteEmailAccountAction: vi.fn(),
}));

vi.mock("@/utils/actions/user", () => ({
  deleteEmailAccountAction,
}));
vi.mock("@/utils/middleware", async () => {
  const { createWithAuthTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithAuthTestMiddleware();
});

import { DELETE } from "./route";

describe("DELETE /api/user/email-accounts/[emailAccountId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes the email account through the settings action", async () => {
    deleteEmailAccountAction.mockResolvedValue({ data: undefined });

    const response = await DELETE(
      new NextRequest(
        "http://localhost:3000/api/user/email-accounts/email-account-2",
        { method: "DELETE" },
      ),
      { params: Promise.resolve({ emailAccountId: "email-account-2" }) },
    );

    expect(deleteEmailAccountAction).toHaveBeenCalledWith({
      emailAccountId: "email-account-2",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
  });

  it("returns the action error when the account cannot be removed", async () => {
    deleteEmailAccountAction.mockResolvedValue({
      serverError:
        "Cannot delete your only email account. Go to the Settings page to delete your entire account.",
    });

    const response = await DELETE(
      new NextRequest(
        "http://localhost:3000/api/user/email-accounts/email-account-1",
        { method: "DELETE" },
      ),
      { params: Promise.resolve({ emailAccountId: "email-account-1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error:
        "Cannot delete your only email account. Go to the Settings page to delete your entire account.",
      isKnownError: true,
    });
  });
});
