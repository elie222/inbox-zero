vi.mock("server-only", () => ({}));

import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");
vi.mock("@/utils/middleware", () => ({
  withEmailAccount:
    (
      _scope: string,
      handler: (
        request: Request & {
          auth: { emailAccountId: string };
          logger: { error: ReturnType<typeof vi.fn> };
        },
      ) => Promise<Response>,
    ) =>
    async (request: Request) =>
      handler(
        Object.assign(request, {
          auth: { emailAccountId: "email-account-1" },
          logger: { error: vi.fn() },
        }),
      ),
}));

import { getSetupProgress } from "./route";

describe("getSetupProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks dismissed setup hints as completed for the current account", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      rules: [],
      newsletters: [],
      calendarConnections: [],
      user: {
        dismissedHints: [
          "setup:aiAssistant:email-account-1",
          "setup:bulkUnsubscribe:email-account-1",
          "setup:calendarConnected:email-account-1",
          "setup:teamInvite:email-account-1",
          "setup:tabsExtension:email-account-1",
        ],
      },
      members: [
        {
          role: "owner",
          organizationId: "org-1",
          organization: {
            _count: {
              members: 1,
              invitations: 0,
            },
          },
        },
      ],
    } as never);

    const result = await getSetupProgress({
      emailAccountId: "email-account-1",
    });

    expect(result).toEqual({
      steps: {
        aiAssistant: true,
        bulkUnsubscribe: true,
        calendarConnected: true,
      },
      completed: 4,
      total: 4,
      isComplete: true,
      tabsExtensionCompleted: true,
      teamInvite: {
        completed: true,
        organizationId: "org-1",
      },
    });
  });

  it("ignores dismissed setup hints saved for a different account", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      rules: [],
      newsletters: [],
      calendarConnections: [],
      user: {
        dismissedHints: [
          "setup:aiAssistant:other-account",
          "setup:bulkUnsubscribe:other-account",
          "setup:calendarConnected:other-account",
          "setup:teamInvite:other-account",
          "setup:tabsExtension:other-account",
        ],
      },
      members: [
        {
          role: "owner",
          organizationId: "org-1",
          organization: {
            _count: {
              members: 1,
              invitations: 0,
            },
          },
        },
      ],
    } as never);

    const result = await getSetupProgress({
      emailAccountId: "email-account-1",
    });

    expect(result).toEqual({
      steps: {
        aiAssistant: false,
        bulkUnsubscribe: false,
        calendarConnected: false,
      },
      completed: 0,
      total: 4,
      isComplete: false,
      tabsExtensionCompleted: false,
      teamInvite: {
        completed: false,
        organizationId: "org-1",
      },
    });
  });
});
