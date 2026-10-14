import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateLocalPasswordAction } from "./local-password";
import { updateLocalPassword } from "@/utils/auth/update-local-password";

vi.mock("@/utils/actions/safe-action", () => ({
  actionClientUser: {
    metadata: () => ({
      inputSchema: () => ({ action: (handler: unknown) => handler }),
    }),
  },
}));
vi.mock("@/utils/auth/update-local-password", () => ({
  updateLocalPassword: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-test": "session" }),
}));

const run = updateLocalPasswordAction as unknown as (input: {
  ctx: { userId: string; session: { session: { emailOtp: boolean } } };
  parsedInput: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  };
}) => Promise<unknown>;
const parsedInput = {
  currentPassword: "old-password",
  newPassword: "new-password-long",
  confirmPassword: "new-password-long",
};

beforeEach(() => vi.clearAllMocks());

describe("local password action authorization", () => {
  it("rejects email-code sessions before changing credentials", async () => {
    await expect(
      run({
        ctx: { userId: "owner", session: { session: { emailOtp: true } } },
        parsedInput,
      }),
    ).rejects.toThrow("Sign in with your password or connected provider");
    expect(updateLocalPassword).not.toHaveBeenCalled();
  });
  it("uses the authenticated owner and session headers", async () => {
    await run({
      ctx: { userId: "owner", session: { session: { emailOtp: false } } },
      parsedInput,
    });
    expect(updateLocalPassword).toHaveBeenCalledWith({
      userId: "owner",
      requestHeaders: new Headers({ "x-test": "session" }),
      currentPassword: parsedInput.currentPassword,
      newPassword: parsedInput.newPassword,
    });
  });
});
