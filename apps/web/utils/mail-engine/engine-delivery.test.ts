import { describe, expect, it } from "vitest";
import {
  canEditEngineSend,
  engineDeliveryLabel,
  engineSendCommandsForThread,
  shouldShowEngineDeliveryStatus,
} from "./engine-delivery";

describe("engine send delivery status", () => {
  it("keeps send commands for the matching conversation", () => {
    expect(
      engineSendCommandsForThread(
        [
          {
            conversationIds: ["thread"],
            kind: "send",
            messageIds: [],
            operationId: "one",
            status: "queued",
          },
          {
            conversationIds: ["other"],
            kind: "send",
            messageIds: [],
            operationId: "two",
            status: "queued",
          },
          {
            conversationIds: ["thread"],
            kind: "archive",
            messageIds: [],
            operationId: "three",
            status: "queued",
          },
        ],
        "thread",
      ).map((command) => command.operationId),
    ).toEqual(["one"]);
  });

  it("hides happy-path sending while online", () => {
    expect(
      shouldShowEngineDeliveryStatus({ online: true, status: "queued" }),
    ).toBe(false);
    expect(
      shouldShowEngineDeliveryStatus({ online: true, status: "failed" }),
    ).toBe(true);
    expect(
      shouldShowEngineDeliveryStatus({ online: false, status: "queued" }),
    ).toBe(true);
  });

  it("labels blocked and failed sends", () => {
    expect(engineDeliveryLabel("blocked_auth", true)).toBe(
      "Reconnect your account to send this reply",
    );
    expect(engineDeliveryLabel("queued", false)).toBe("Waiting for connection");
    expect(canEditEngineSend("queued", true)).toBe(true);
    expect(canEditEngineSend("executing", true)).toBe(false);
  });
});
