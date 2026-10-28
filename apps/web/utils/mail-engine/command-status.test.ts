import { describe, expect, it } from "vitest";
import {
  engineCommandKind,
  engineCommandPayload,
  engineCommandStatus,
} from "./command-status";

describe("engineCommandStatus", () => {
  it("maps in-flight metadata work to reconciling", () => {
    expect(engineCommandStatus("queued")).toBe("reconciling");
    expect(engineCommandStatus("executing")).toBe("reconciling");
    expect(engineCommandStatus("verifying")).toBe("reconciling");
    expect(engineCommandStatus("uncertain")).toBe("reconciling");
    expect(engineCommandStatus("blocked_auth")).toBe("reconciling");
    expect(engineCommandStatus("succeeded")).toBe("succeeded");
    expect(engineCommandStatus("failed")).toBe("failed");
  });
});

describe("engineCommandKind", () => {
  it("maps engine change kinds onto mail mutation kinds", () => {
    expect(
      engineCommandKind({ kind: "conversations", changeKind: "set_read" }),
    ).toBe("set_read_state");
    expect(engineCommandKind({ kind: "send", changeKind: null })).toBe("reply");
    expect(
      engineCommandKind({
        kind: "conversations",
        changeKind: "restore_from_trash",
      }),
    ).toBe("untrash");
  });
});

describe("engineCommandPayload", () => {
  it("exposes read and membership payloads", () => {
    expect(engineCommandPayload({ kind: "set_read", read: true })).toEqual({
      read: true,
    });
    expect(
      engineCommandPayload({
        kind: "set_membership",
        membership: "label",
        id: "Label_project",
        present: true,
      }),
    ).toEqual({
      membership: "label",
      id: "Label_project",
      present: true,
    });
  });
});
