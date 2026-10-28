import { describe, expect, it } from "vitest";
import { getThreadParticipantNames } from "./thread-participants";

describe("getThreadParticipantNames", () => {
  it("lists each sender once and labels the account owner as me", () => {
    expect(
      getThreadParticipantNames(
        [
          message({
            from: "Bah <bah@example.com>",
            to: "owner@example.com",
          }),
          message({
            from: "owner@example.com",
            to: "Bah <bah@example.com>",
          }),
          message({
            from: "Bah Updated <BAH@example.com>",
            to: "owner@example.com",
          }),
        ],
        "OWNER@example.com",
      ),
    ).toEqual(["Bah", "me"]);
  });

  it("does not add me to a received-only thread", () => {
    expect(
      getThreadParticipantNames(
        [
          message({
            from: "Bah <bah@example.com>",
            to: "owner@example.com",
          }),
        ],
        "owner@example.com",
      ),
    ).toEqual(["Bah"]);
  });

  it("does not count an unsent draft as participation by the account owner", () => {
    expect(
      getThreadParticipantNames(
        [
          message({
            from: "Bah <bah@example.com>",
            to: "owner@example.com",
          }),
          message({
            from: "owner@example.com",
            to: "Bah <bah@example.com>",
            labelIds: ["DRAFT"],
          }),
        ],
        "owner@example.com",
      ),
    ).toEqual(["Bah"]);
  });

  it("keeps recipient names for an outgoing-only thread", () => {
    expect(
      getThreadParticipantNames(
        [
          message({
            from: "owner@example.com",
            to: "Jordan <jordan@example.com>, Taylor <taylor@example.com>",
          }),
        ],
        "owner@example.com",
      ),
    ).toEqual(["Jordan", "Taylor"]);
  });

  it("keeps recipient names for a draft-only thread", () => {
    expect(
      getThreadParticipantNames(
        [
          message({
            from: "owner@example.com",
            to: "Jordan <jordan@example.com>",
            labelIds: ["DRAFT"],
          }),
        ],
        "owner@example.com",
      ),
    ).toEqual(["Jordan"]);
  });
});

function message({
  from,
  to,
  labelIds,
}: {
  from: string;
  to: string;
  labelIds?: string[];
}) {
  return { headers: { from, to }, labelIds };
}
