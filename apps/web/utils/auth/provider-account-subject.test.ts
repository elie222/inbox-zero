import { describe, expect, it } from "vitest";
import { socialProviders } from "better-auth/social-providers";

/**
 * Which claim better-auth keys `Account.providerAccountId` on is an upstream
 * detail this app has to match: the linking callbacks write the same key, and
 * stored accounts are only found again while the two agree.
 *
 * v1.7 moved Microsoft from `sub` to `oid`, which silently locked every
 * existing Microsoft user out of sign-in until their rows were re-keyed. Pin
 * the claim so the next upgrade fails here instead of in production.
 */
describe("social provider account subjects", () => {
  const profile = { oid: "entra-object-id", sub: "pairwise-subject" };

  it.each([
    ["microsoft", "entra-object-id"],
    ["google", "pairwise-subject"],
    ["apple", "pairwise-subject"],
  ] as const)("keys %s accounts on the expected claim", (id, expected) => {
    const provider = socialProviders[id]({
      clientId: "client-id",
      clientSecret: "client-secret",
    });

    expect(provider.accountSubject({ profile, tokens: {} } as never)).toBe(
      expected,
    );
  });
});
