import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteAccountAction } = vi.hoisted(() => ({
  deleteAccountAction: vi.fn(),
}));

vi.mock("@/utils/actions/user", () => ({
  deleteAccountAction,
}));
vi.mock("@/utils/middleware", async () => {
  const { createWithAuthTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithAuthTestMiddleware();
});

import { DELETE } from "./route";

describe("DELETE /api/user/account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the authenticated user through the settings action", async () => {
    deleteAccountAction.mockResolvedValue({ data: undefined });

    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/user/account", {
        method: "DELETE",
      }),
    );

    expect(deleteAccountAction).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
  });

  it("returns the action error when deletion is blocked", async () => {
    deleteAccountAction.mockResolvedValue({
      serverError:
        "Transfer organization ownership before deleting your account.",
    });

    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/user/account", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Transfer organization ownership before deleting your account.",
      isKnownError: true,
    });
  });
});
