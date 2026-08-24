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

  it("allows the recorded purchaser without an organization", () => {
    const result = canManageBilling("user-1", {
      premium: {
        id: "premium-1",
        admins: [{ id: "user-1" }],
      },
      emailAccounts: [],
    });

    expect(result).toBe(true);
  });

  it("allows the legacy premium owner without an organization", () => {
    const result = canManageBilling("legacy-owner", {
      premium: {
        id: "legacy-owner",
        admins: [],
      },
      emailAccounts: [],
    });

    expect(result).toBe(true);
  });

  it.each([
    "member",
    "admin",
    "owner",
  ])("denies an organization %s when no purchaser is recorded for the premium", (role) => {
    const result = canManageBilling("user-1", {
      premium: {
        id: "premium-1",
        admins: [],
      },
      emailAccounts: [
        {
          members: [
            getMockOrganizationMembership({
              role,
              ownerUserId: "org-owner",
              ownerPremiumId: "premium-1",
            }),
          ],
        },
      ],
    });

    expect(result).toBe(false);
  });

  it.each([
    "admin",
    "owner",
  ])("allows an organization %s of the organization owned by the plan admin", (role) => {
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
              ownerUserId: "premium-admin",
              ownerPremiumId: "premium-1",
            }),
          ],
        },
      ],
    });

    expect(result).toBe(true);
  });

  it.each([
    "admin",
    "owner",
  ])("allows an organization %s when a plan admin belongs to the organization", (role) => {
    const result = canManageBilling("user-1", {
      premium: {
        id: "premium-1",
        admins: [{ id: "premium-admin" }],
      },
      emailAccounts: [
        {
          members: [
            {
              role,
              organization: {
                members: [
                  {
                    emailAccount: {
                      user: { id: "org-owner", premiumId: "premium-1" },
                    },
                  },
                  {
                    emailAccount: {
                      user: { id: "premium-admin", premiumId: "premium-1" },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(result).toBe(true);
  });

  it("allows an organization admin when the owner holds a legacy premium", () => {
    const result = canManageBilling("user-1", {
      premium: {
        id: "legacy-owner",
        admins: [],
      },
      emailAccounts: [
        {
          members: [
            getMockOrganizationMembership({
              role: "admin",
              ownerUserId: "legacy-owner",
              ownerPremiumId: "legacy-owner",
            }),
          ],
        },
      ],
    });

    expect(result).toBe(true);
  });

  it("denies a premium seat member who owns an organization of their own", () => {
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
              role: "member",
              ownerUserId: "premium-admin",
              ownerPremiumId: "premium-1",
            }),
          ],
        },
        {
          members: [
            getMockOrganizationMembership({
              role: "owner",
              ownerUserId: "user-1",
              ownerPremiumId: "premium-1",
            }),
          ],
        },
      ],
    });

    expect(result).toBe(false);
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
              ownerUserId: "premium-owner",
              ownerPremiumId: "premium-1",
            }),
          ],
        },
      ],
    });

    expect(result).toBe(false);
  });
});
