import { beforeEach, describe, expect, it, vi } from "vitest";
import AcceptInvitationPage from "./page";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@/utils/auth", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/utils/actions/organization", () => ({
  handleInvitationAction: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("accept invitation page", () => {
  it("sends signed-out users to login and back to the invitation", async () => {
    mocks.auth.mockResolvedValue(null);

    await expect(
      AcceptInvitationPage({
        params: Promise.resolve({ invitationId: "invite-1" }),
      }),
    ).rejects.toThrow(
      "redirect:/login?next=%2Forganizations%2Finvitations%2Finvite-1%2Faccept",
    );
  });

  it("does not redirect signed-in users to login", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });

    await AcceptInvitationPage({
      params: Promise.resolve({ invitationId: "invite-1" }),
    });

    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
