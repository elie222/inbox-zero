import { describe, expect, it } from "vitest";
import { decodeTeamsTargetId, encodeTeamsTargetId } from "./target-id";

describe("teams target id", () => {
  it("encodes and decodes a target id", () => {
    const encoded = encodeTeamsTargetId({
      teamId: "team-123",
      channelId: "19:abc@thread.tacv2",
    });

    expect(decodeTeamsTargetId(encoded)).toEqual({
      teamId: "team-123",
      channelId: "19:abc@thread.tacv2",
    });
  });

  it("returns null for malformed values", () => {
    expect(decodeTeamsTargetId("missing-separator")).toBeNull();
    expect(decodeTeamsTargetId("::channel")).toBeNull();
    expect(decodeTeamsTargetId("team::")).toBeNull();
  });
});
