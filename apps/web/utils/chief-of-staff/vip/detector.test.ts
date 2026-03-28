import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkVipStatus } from "./detector";

vi.mock("../acuity/actions", () => ({
  getClientAppointments: vi.fn(),
}));

import { getClientAppointments } from "../acuity/actions";

const mockGetClientAppointments = vi.mocked(getClientAppointments);

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    vipCache: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    clientGroup: {
      findUnique: vi.fn(),
    },
    clientGroupMember: {
      findUnique: vi.fn(),
    },
    ...overrides,
  } as unknown as import("@/generated/prisma/client").PrismaClient;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkVipStatus", () => {
  it("returns cached VIP status if cache is fresh (< 24h)", async () => {
    const prisma = makePrisma();
    const recentTime = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago

    (prisma.vipCache.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      clientEmail: "client@example.com",
      isVip: true,
      bookingCount: 7,
      lastChecked: recentTime,
      clientGroupId: null,
    });

    const result = await checkVipStatus("client@example.com", prisma);

    expect(result.isVip).toBe(true);
    expect(result.bookingCount).toBe(7);
    expect(result.groupName).toBeNull();
    expect(mockGetClientAppointments).not.toHaveBeenCalled();
  });

  it("returns cached VIP status with group name if cache is fresh and group exists", async () => {
    const prisma = makePrisma();
    const recentTime = new Date(Date.now() - 1000 * 60 * 30); // 30 minutes ago

    (prisma.vipCache.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      clientEmail: "client@example.com",
      isVip: true,
      bookingCount: 6,
      lastChecked: recentTime,
      clientGroupId: "group-1",
    });

    (
      prisma.clientGroup.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: "group-1",
      primaryName: "The Smith Family",
    });

    const result = await checkVipStatus("client@example.com", prisma);

    expect(result.isVip).toBe(true);
    expect(result.groupName).toBe("The Smith Family");
    expect(mockGetClientAppointments).not.toHaveBeenCalled();
  });

  it("queries Acuity when cache is stale (> 24h) and counts non-cancelled appointments", async () => {
    const prisma = makePrisma();
    const staleTime = new Date(Date.now() - 1000 * 60 * 60 * 25); // 25 hours ago

    (prisma.vipCache.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      clientEmail: "client@example.com",
      isVip: false,
      bookingCount: 2,
      lastChecked: staleTime,
      clientGroupId: null,
    });

    (
      prisma.clientGroupMember.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);

    mockGetClientAppointments.mockResolvedValue([
      {
        id: 1,
        canceled: false,
        email: "client@example.com",
        appointmentTypeID: 1,
        datetime: "2026-01-01",
        firstName: "Jane",
        lastName: "Doe",
      },
      {
        id: 2,
        canceled: false,
        email: "client@example.com",
        appointmentTypeID: 1,
        datetime: "2026-01-08",
        firstName: "Jane",
        lastName: "Doe",
      },
      {
        id: 3,
        canceled: true,
        email: "client@example.com",
        appointmentTypeID: 1,
        datetime: "2026-01-15",
        firstName: "Jane",
        lastName: "Doe",
      },
      {
        id: 4,
        canceled: false,
        email: "client@example.com",
        appointmentTypeID: 1,
        datetime: "2026-01-22",
        firstName: "Jane",
        lastName: "Doe",
      },
      {
        id: 5,
        canceled: false,
        email: "client@example.com",
        appointmentTypeID: 1,
        datetime: "2026-01-29",
        firstName: "Jane",
        lastName: "Doe",
      },
      {
        id: 6,
        canceled: false,
        email: "client@example.com",
        appointmentTypeID: 1,
        datetime: "2026-02-05",
        firstName: "Jane",
        lastName: "Doe",
      },
    ]);

    (prisma.vipCache.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await checkVipStatus("client@example.com", prisma);

    // 5 non-cancelled out of 6 → meets VIP_THRESHOLD (5)
    expect(result.isVip).toBe(true);
    expect(result.bookingCount).toBe(5);
    expect(prisma.vipCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientEmail: "client@example.com" },
        create: expect.objectContaining({ bookingCount: 5, isVip: true }),
        update: expect.objectContaining({ bookingCount: 5, isVip: true }),
      }),
    );
  });

  it("queries Acuity when no cache entry exists", async () => {
    const prisma = makePrisma();

    (prisma.vipCache.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    (
      prisma.clientGroupMember.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);

    mockGetClientAppointments.mockResolvedValue([
      {
        id: 1,
        canceled: false,
        email: "new@example.com",
        appointmentTypeID: 1,
        datetime: "2026-01-01",
        firstName: "New",
        lastName: "Client",
      },
      {
        id: 2,
        canceled: false,
        email: "new@example.com",
        appointmentTypeID: 1,
        datetime: "2026-01-08",
        firstName: "New",
        lastName: "Client",
      },
    ]);

    (prisma.vipCache.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await checkVipStatus("new@example.com", prisma);

    expect(result.isVip).toBe(false);
    expect(result.bookingCount).toBe(2);
    expect(mockGetClientAppointments).toHaveBeenCalledWith("new@example.com");
  });

  it("aggregates bookings across all client group members", async () => {
    const prisma = makePrisma();

    (prisma.vipCache.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );

    (
      prisma.clientGroupMember.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      email: "parent@family.com",
      clientGroupId: "group-2",
      clientGroup: {
        id: "group-2",
        primaryName: "The Johnson Family",
        members: [
          { email: "parent@family.com", name: "John Johnson" },
          { email: "spouse@family.com", name: "Jane Johnson" },
        ],
      },
    });

    mockGetClientAppointments
      .mockResolvedValueOnce([
        {
          id: 1,
          canceled: false,
          email: "parent@family.com",
          appointmentTypeID: 1,
          datetime: "2026-01-01",
          firstName: "John",
          lastName: "Johnson",
        },
        {
          id: 2,
          canceled: false,
          email: "parent@family.com",
          appointmentTypeID: 1,
          datetime: "2026-01-08",
          firstName: "John",
          lastName: "Johnson",
        },
        {
          id: 3,
          canceled: true,
          email: "parent@family.com",
          appointmentTypeID: 1,
          datetime: "2026-01-15",
          firstName: "John",
          lastName: "Johnson",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 4,
          canceled: false,
          email: "spouse@family.com",
          appointmentTypeID: 1,
          datetime: "2026-01-22",
          firstName: "Jane",
          lastName: "Johnson",
        },
        {
          id: 5,
          canceled: false,
          email: "spouse@family.com",
          appointmentTypeID: 1,
          datetime: "2026-01-29",
          firstName: "Jane",
          lastName: "Johnson",
        },
        {
          id: 6,
          canceled: false,
          email: "spouse@family.com",
          appointmentTypeID: 1,
          datetime: "2026-02-05",
          firstName: "Jane",
          lastName: "Johnson",
        },
      ]);

    (prisma.vipCache.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await checkVipStatus("parent@family.com", prisma);

    // 2 non-cancelled from parent + 3 from spouse = 5 total → VIP
    expect(result.isVip).toBe(true);
    expect(result.bookingCount).toBe(5);
    expect(result.groupName).toBe("The Johnson Family");
    expect(mockGetClientAppointments).toHaveBeenCalledTimes(2);
    expect(mockGetClientAppointments).toHaveBeenCalledWith("parent@family.com");
    expect(mockGetClientAppointments).toHaveBeenCalledWith("spouse@family.com");
  });
});
