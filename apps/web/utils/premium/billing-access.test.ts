import { describe, expect, it } from "vitest";
import { getMockOrganizationMembership } from "@/__tests__/helpers";
import { canManageBilling } from "./billing-access";

describe("canManageBilling", () => {
  it("denies an organization member without a premium record", () => {
    const result = canManageBilling("user-1", {
      premium: null,
      emailAccounts: [
        {
          members: [getMockOrganizationMembership({ role: "member" })],
        },
      ],
    });

    expect(result).toBe(false);
  });

  it("allows an individual user without a premium record", () => {
    const result = canManageBilling("user-1", {
      premium: null,
      emailAccounts: [],
    });

    expect(result).toBe(true);
  });

  it.each([
    "admin",
    "owner",
  ])("allows an organization %s when the plan admin has no organization membership", (role) => {
    const result = canManageBilling("user-1", {
      premium: {
        id: "premium-1",
        admins: [
          {
            id: "premium-admin",
          },
        ],
      },
      emailAccounts: [
        {
          members: [
            getMockOrganizationMembership({
              role,
              ownerPremiumId: "premium-1",
            }),
          ],
        },
      ],
    });

    expect(result).toBe(true);
  });

  it("does not use an admin role from an unrelated organization", () => {
    const result = canManageBilling("user-1", {
      premium: {
        id: "premium-1",
        admins: [
          {
            id: "premium-owner",
          },
        ],
      },
      emailAccounts: [
        {
          members: [
            getMockOrganizationMembership({
              role: "admin",
              ownerPremiumId: "other-premium",
            }),
          ],
        },
        {
          members: [
            getMockOrganizationMembership({
              role: "member",
              ownerPremiumId: "premium-1",
            }),
          ],
        },
      ],
    });

    expect(result).toBe(false);
  });
});
