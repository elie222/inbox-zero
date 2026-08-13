import { describe, expect, it } from "vitest";
import { canManageBilling } from "./billing-access";

describe("canManageBilling", () => {
  it("does not use an admin role from an unrelated organization", () => {
    const result = canManageBilling("user-1", {
      premium: {
        id: "premium-1",
        admins: [
          {
            id: "premium-owner",
            emailAccounts: [
              {
                members: [{ organizationId: "billing-org", role: "owner" }],
              },
            ],
          },
        ],
      },
      emailAccounts: [
        {
          members: [{ organizationId: "other-org", role: "admin" }],
        },
        {
          members: [{ organizationId: "billing-org", role: "member" }],
        },
      ],
    });

    expect(result).toBe(false);
  });
});
