import { describe, expect, it } from "vitest";
import { ActionType } from "@/generated/prisma/enums";
import { isAddingDigestAction, shouldIncludeDigestAction } from "./digest";

describe("isAddingDigestAction", () => {
  it("is false when the request does not include digest", () => {
    expect(
      isAddingDigestAction({
        requestedActions: [{ type: ActionType.ARCHIVE }],
        existingActions: [{ type: ActionType.DIGEST }],
      }),
    ).toBe(false);
  });

  it("is false when an existing rule already includes digest", () => {
    expect(
      isAddingDigestAction({
        requestedActions: [
          { type: ActionType.ARCHIVE },
          { type: ActionType.DIGEST },
        ],
        existingActions: [{ type: ActionType.DIGEST }],
      }),
    ).toBe(false);
  });

  it("is true when digest is being added to a rule that did not have it", () => {
    expect(
      isAddingDigestAction({
        requestedActions: [{ type: ActionType.DIGEST }],
        existingActions: [{ type: ActionType.ARCHIVE }],
      }),
    ).toBe(true);
  });

  it("is true when creating a rule with digest and there are no existing actions", () => {
    expect(
      isAddingDigestAction({
        requestedActions: [{ type: ActionType.DIGEST }],
      }),
    ).toBe(true);
  });
});

describe("shouldIncludeDigestAction", () => {
  it("preserves an existing digest when the digest feature is hidden", () => {
    expect(
      shouldIncludeDigestAction({
        digestFeatureEnabled: false,
        hasDigestAccess: false,
        wantsDigest: false,
        hasExistingDigest: true,
      }),
    ).toBe(true);
  });

  it("follows the user's choice when they have digest access", () => {
    expect(
      shouldIncludeDigestAction({
        digestFeatureEnabled: true,
        hasDigestAccess: true,
        wantsDigest: true,
        hasExistingDigest: false,
      }),
    ).toBe(true);

    expect(
      shouldIncludeDigestAction({
        digestFeatureEnabled: true,
        hasDigestAccess: true,
        wantsDigest: false,
        hasExistingDigest: true,
      }),
    ).toBe(false);
  });

  it("lets a user without digest access turn an existing digest off", () => {
    expect(
      shouldIncludeDigestAction({
        digestFeatureEnabled: true,
        hasDigestAccess: false,
        wantsDigest: false,
        hasExistingDigest: true,
      }),
    ).toBe(false);
  });

  it("does not let a user without digest access add digest", () => {
    expect(
      shouldIncludeDigestAction({
        digestFeatureEnabled: true,
        hasDigestAccess: false,
        wantsDigest: true,
        hasExistingDigest: false,
      }),
    ).toBe(false);
  });

  it("keeps an existing digest when a user without access leaves it enabled", () => {
    expect(
      shouldIncludeDigestAction({
        digestFeatureEnabled: true,
        hasDigestAccess: false,
        wantsDigest: true,
        hasExistingDigest: true,
      }),
    ).toBe(true);
  });
});
