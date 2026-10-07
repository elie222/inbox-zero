import { APIError } from "loops";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createContact, startedTrial, completedTrial } from "./loops";

const client = vi.hoisted(() => ({
  createContact: vi.fn(),
  sendEvent: vi.fn(),
}));

vi.mock("loops", async (importOriginal) => ({
  ...(await importOriginal<typeof import("loops")>()),
  LoopsClient: class {
    createContact = client.createContact;
    sendEvent = client.sendEvent;
  },
}));

describe("Loops lifecycle events", () => {
  beforeEach(() => {
    vi.stubEnv("LOOPS_API_SECRET", "test-key");
    vi.resetAllMocks();
    client.sendEvent.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    new APIError(409, { success: false, message: "Conflict" }),
    new APIError(409, {
      success: false,
      message: "Email or userId already exists/is already on list",
    }),
    { statusCode: "409" },
    { status: 409 },
    new Error("Email or userId already exists/is already on list"),
    new Error("Email already on list"),
  ])("treats an existing contact as success: %s", async (error) => {
    client.createContact.mockRejectedValueOnce(error);

    await expect(createContact("user@example.com", "John")).resolves.toEqual({
      success: true,
    });
    await startedTrial("user@example.com", "PLUS_MONTHLY");

    expect(client.sendEvent).toHaveBeenCalledExactlyOnceWith({
      eventName: "upgraded",
      email: "user@example.com",
      contactProperties: { tier: "PLUS_MONTHLY" },
      eventProperties: { tier: "PLUS_MONTHLY" },
    });
  });

  it("preserves unexpected contact creation errors", async () => {
    const error = new APIError(500, {
      success: false,
      message: "Internal server error",
    });
    client.createContact.mockRejectedValueOnce(error);

    await expect(createContact("user@example.com")).rejects.toBe(error);
  });

  it("sets tier when a trial converts to paid", async () => {
    await completedTrial("user@example.com", "PLUS_MONTHLY");

    expect(client.sendEvent).toHaveBeenCalledExactlyOnceWith({
      eventName: "completed_trial",
      email: "user@example.com",
      contactProperties: { tier: "PLUS_MONTHLY" },
      eventProperties: { tier: "PLUS_MONTHLY" },
    });
  });
});
