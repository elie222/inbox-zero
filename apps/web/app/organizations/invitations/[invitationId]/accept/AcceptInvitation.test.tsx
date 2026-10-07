// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleInvitationAction } from "@/utils/actions/organization";
import { AcceptInvitation } from "./AcceptInvitation";

vi.mock("@/utils/actions/organization", () => ({
  handleInvitationAction: vi.fn(),
}));
vi.mock("@/env", () => ({ env: {} }));

describe("AcceptInvitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it("accepts the invitation once and confirms membership", async () => {
    vi.mocked(handleInvitationAction).mockResolvedValue({
      data: { success: true },
    } as never);

    render(<AcceptInvitation invitationId="invite-1" />);

    expect(await screen.findByText("Welcome!")).toBeTruthy();
    expect(handleInvitationAction).toHaveBeenCalledOnce();
    expect(handleInvitationAction).toHaveBeenCalledWith({
      invitationId: "invite-1",
    });
  });

  it("shows the server's reason when the invitation cannot be accepted", async () => {
    vi.mocked(handleInvitationAction).mockResolvedValue({
      serverError: "Invitation has expired",
    } as never);

    render(<AcceptInvitation invitationId="invite-1" />);

    expect(await screen.findByText("Invitation has expired")).toBeTruthy();
    expect(screen.queryByText("Welcome!")).toBeNull();
  });
});
