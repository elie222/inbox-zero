import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const { mockEnv, mockLogger } = vi.hoisted(() => ({
  mockEnv: {
    meetingBriefsEnabled: false,
    bookingLinksEnabled: false,
    emailSendEnabled: false,
    mailAppEnabled: true,
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
    get NEXT_PUBLIC_EMAIL_SEND_ENABLED() {
      return mockEnv.emailSendEnabled;
    },
    get NEXT_PUBLIC_MAIL_APP_ENABLED() {
      return mockEnv.mailAppEnabled;
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
    mockEnv.emailSendEnabled = false;
    mockEnv.mailAppEnabled = true;
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

  it("asks users to try the email app until they have opened it", async () => {
    mockEnv.emailSendEnabled = true;
    prisma.emailAccount.findUnique.mockResolvedValue(
      createEmailAccount({ calendarConnections: [], mailSetup: "PENDING" }),
    );

    const response = await GET(createRequest());
    const body = await response.json();

    expect(body).toMatchObject({
      steps: { emailApp: false },
      completed: 0,
      total: 3,
      showEmailAppStep: true,
    });
  });

  it("omits the email app step when the email app is disabled", async () => {
    mockEnv.emailSendEnabled = true;
    mockEnv.mailAppEnabled = false;
    prisma.emailAccount.findUnique.mockResolvedValue(
      createEmailAccount({ calendarConnections: [], mailSetup: "PENDING" }),
    );

    const response = await GET(createRequest());
    const body = await response.json();

    expect(body).toMatchObject({ total: 2, showEmailAppStep: false });
  });

  it("counts the email app step as done once mail has been set up", async () => {
    mockEnv.emailSendEnabled = true;
    prisma.emailAccount.findUnique.mockResolvedValue(
      createEmailAccount({ calendarConnections: [], mailSetup: "DONE" }),
    );

    const response = await GET(createRequest());
    const body = await response.json();

    expect(body).toMatchObject({
      steps: { emailApp: true },
      completed: 1,
      total: 3,
    });
  });

  it("counts the email app step as done once the user skips it", async () => {
    mockEnv.emailSendEnabled = true;
    prisma.emailAccount.findUnique.mockResolvedValue(
      createEmailAccount({
        calendarConnections: [],
        mailSetup: "PENDING",
        dismissedHints: ["setup:emailApp:email-account-1"],
      }),
    );

    const response = await GET(createRequest());
    const body = await response.json();

    expect(body).toMatchObject({ steps: { emailApp: true }, completed: 1 });
  });
});

function createEmailAccount({
  calendarConnections,
  mailSetup = "PENDING",
  dismissedHints = [],
}: {
  calendarConnections: { id: string }[];
  mailSetup?: "PENDING" | "SUGGESTED" | "DONE";
  dismissedHints?: string[];
}) {
  return {
    rules: [],
    newsletters: [],
    calendarConnections,
    mailSetup,
    user: { dismissedHints },
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
