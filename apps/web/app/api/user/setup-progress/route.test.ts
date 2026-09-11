import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const { mockEnv, mockLogger } = vi.hoisted(() => ({
  mockEnv: {
    meetingBriefsEnabled: false,
    bookingLinksEnabled: false,
  },
  mockLogger: {
    error: vi.fn(),
  },
}));

vi.mock("@/env", () => ({
  env: {
    get NEXT_PUBLIC_MEETING_BRIEFS_ENABLED() {
      return mockEnv.meetingBriefsEnabled;
    },
    get NEXT_PUBLIC_BOOKING_LINKS_ENABLED() {
      return mockEnv.bookingLinksEnabled;
    },
  },
}));

vi.mock("@/utils/prisma");

vi.mock("@/utils/middleware", () => ({
  withEmailAccount:
    (_name: string, handler: (request: any) => Promise<Response>) =>
    (request: NextRequest) =>
      handler(
        Object.assign(request, {
          auth: { emailAccountId: "email-account-1", userId: "user-1" },
          logger: mockLogger,
        }),
      ),
}));

import { GET } from "./route";

describe("GET /api/user/setup-progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.meetingBriefsEnabled = false;
    mockEnv.bookingLinksEnabled = false;
  });

  it("omits the calendar setup step when calendar features are disabled", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(
      createEmailAccount({ calendarConnections: [{ id: "connection-1" }] }),
    );

    const response = await GET(createRequest());
    const body = await response.json();

    expect(body).toMatchObject({
      steps: {
        aiAssistant: false,
        bulkUnsubscribe: false,
        calendarConnected: true,
      },
      completed: 0,
      total: 2,
      isComplete: false,
      showCalendarStep: false,
    });
  });

  it("includes the calendar setup step when a calendar feature is enabled", async () => {
    mockEnv.meetingBriefsEnabled = true;
    prisma.emailAccount.findUnique.mockResolvedValue(
      createEmailAccount({ calendarConnections: [] }),
    );

    const response = await GET(createRequest());
    const body = await response.json();

    expect(body).toMatchObject({
      steps: {
        aiAssistant: false,
        bulkUnsubscribe: false,
        calendarConnected: false,
      },
      completed: 0,
      total: 3,
      isComplete: false,
      showCalendarStep: true,
    });
  });
});

function createEmailAccount({
  calendarConnections,
}: {
  calendarConnections: { id: string }[];
}) {
  return {
    rules: [],
    newsletters: [],
    calendarConnections,
    user: { dismissedHints: [] },
    members: [
      {
        role: "member",
        organizationId: "organization-1",
        organization: {
          _count: {
            members: 1,
            invitations: 0,
          },
        },
      },
    ],
  };
}

function createRequest() {
  return new NextRequest("http://localhost/api/user/setup-progress");
}
