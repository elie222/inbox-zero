import { type NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { isAdmin } from "@/utils/admin";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdmin({ email: session.user.email })) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const where: any = {};

    // Filter by email
    if (email) {
      where.emailAccount = {
        email: {
          contains: email,
          mode: "insensitive",
        },
      };
    }

    // Filter by status
    if (status) {
      where.status = status;
    }

    // Search by rule name only
    if (search && search !== "all") {
      where.executedRule = {
        rule: {
          name: {
            contains: search,
            mode: "insensitive",
          },
        },
      };
    }

    // Create a where clause without status filter for total count
    const whereWithoutStatus: any = {};
    if (email) {
      whereWithoutStatus.emailAccount = {
        email: {
          contains: email,
          mode: "insensitive",
        },
      };
    }
    if (search && search !== "all") {
      whereWithoutStatus.executedRule = {
        rule: {
          name: {
            contains: search,
            mode: "insensitive",
          },
        },
      };
    }

    const [scheduledActions, allRules, totalCount, statusCounts] =
      await Promise.all([
        prisma.scheduledAction.findMany({
          where,
          include: {
            emailAccount: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
            executedRule: {
              include: {
                rule: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 100, // Limit results
        }),
        // Fetch all rules for the dropdown
        prisma.rule.findMany({
          select: {
            id: true,
            name: true,
          },
          orderBy: {
            name: "asc",
          },
        }),
        // Get total count without status filter
        prisma.scheduledAction.count({
          where: whereWithoutStatus,
        }),
        // Get status counts for all statuses (without status filter)
        prisma.scheduledAction.groupBy({
          by: ["status"],
          where: whereWithoutStatus,
          _count: {
            status: true,
          },
        }),
      ]);

    // Format status counts into an object
    const statusCountsObj = statusCounts.reduce(
      (acc, item) => {
        acc[item.status] = item._count.status;
        return acc;
      },
      {} as Record<string, number>,
    );

    return NextResponse.json({
      scheduledActions,
      allRules,
      total: scheduledActions.length,
      totalCount,
      statusCounts: statusCountsObj,
    });
  } catch (error) {
    console.error("Error fetching scheduled actions:", error);
    return NextResponse.json(
      { error: "Failed to fetch scheduled actions" },
      { status: 500 },
    );
  }
}
