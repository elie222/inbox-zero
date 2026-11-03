import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleMessagingWebhookRoute } from "@/utils/messaging/chat-sdk/webhook-route";
import { sendTeamsInstallationWelcome } from "@/utils/messaging/providers/teams/welcome";
import { POST } from "./route";

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");
  return createWithErrorTestMiddleware();
});
vi.mock("@/utils/messaging/chat-sdk/teams-config", () => ({
  isTeamsBotConfigured: () => true,
}));
vi.mock("@/utils/messaging/chat-sdk/webhook-route", () => ({
  handleMessagingWebhookRoute: vi.fn(),
}));
vi.mock("@/utils/messaging/providers/teams/welcome", () => ({
  sendTeamsInstallationWelcome: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe("Teams installation webhook authentication", () => {
  it.each([
    401, 403, 500, 503,
  ])("does not welcome when the adapter returns %i", async (status) => {
    vi.mocked(handleMessagingWebhookRoute).mockResolvedValue(
      new Response(null, { status }),
    );
    const response = await POST(createRequest() as never);
    expect(response.status).toBe(status);
    expect(sendTeamsInstallationWelcome).not.toHaveBeenCalled();
  });

  it("uses the original activity only after the adapter consumes and authenticates it", async () => {
    vi.mocked(handleMessagingWebhookRoute).mockImplementation(
      async ({ request }) => {
        await request.json();
        expect(sendTeamsInstallationWelcome).not.toHaveBeenCalled();
        return new Response(null, { status: 200 });
      },
    );
    const response = await POST(createRequest() as never);
    expect(response.status).toBe(200);
    expect(sendTeamsInstallationWelcome).toHaveBeenCalledWith({
      type: "installationUpdate",
    });
  });
});

function createRequest() {
  return new Request("https://example.com/api/teams/events", {
    method: "POST",
    body: JSON.stringify({ type: "installationUpdate" }),
    headers: { "content-type": "application/json" },
  });
}
