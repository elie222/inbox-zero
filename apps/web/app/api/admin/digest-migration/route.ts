import { type NextRequest, NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import {
  runDigestMigrationAction,
  getDigestMigrationStatusAction,
} from "@/utils/actions/digest-migration";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("api/digest-migration");

export const GET = withError(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dryRun") === "true";

  logger.info("Running digest migration", { dryRun });

  try {
    const result = await runDigestMigrationAction({ dryRun });

    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(
        { error: result.error, message: result.message },
        { status: 500 },
      );
    }
  } catch (error) {
    logger.error("Migration API failed", { error });
    return NextResponse.json(
      {
        error: "Migration failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
});

export const POST = withError(async (request: NextRequest) => {
  const body = await request.json();
  const { dryRun = false } = body;

  logger.info("Running digest migration via POST", { dryRun });

  try {
    const result = await runDigestMigrationAction({ dryRun });

    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(
        { error: result.error, message: result.message },
        { status: 500 },
      );
    }
  } catch (error) {
    logger.error("Migration API failed", { error });
    return NextResponse.json(
      {
        error: "Migration failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
});

// Status endpoint
export const PUT = withError(async () => {
  logger.info("Getting migration status");

  try {
    const result = await getDigestMigrationStatusAction({});

    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
  } catch (error) {
    logger.error("Status API failed", { error });
    return NextResponse.json(
      {
        error: "Failed to get status",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
});
