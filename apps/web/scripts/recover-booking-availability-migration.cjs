"use strict";
const { execFileSync } = require("node:child_process");
require("dotenv/config");
const { Client } = require("pg");

const MIGRATION_NAME = "20260621140000_booking_availability_schedules";

const migrationUrl =
  process.env.PREVIEW_DATABASE_URL_UNPOOLED ||
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL;

if (!migrationUrl) {
  console.log("[migration-recovery] No migration database URL configured.");
  process.exit(0);
}

async function main() {
  const client = new Client({ connectionString: migrationUrl });
  await client.connect();

  try {
    const failedMigration = await getFailedMigration(client);
    if (!failedMigration) {
      console.log("[migration-recovery] No failed booking migration found.");
      return;
    }

    const state = await getSchemaState(client);

    if (!state.availabilitySchedule && state.bookingWindow) {
      console.log(
        "[migration-recovery] Failed migration did not partially apply; marking rolled back.",
      );
      await resolveMigration("rolled-back");
      return;
    }

    if (
      state.availabilitySchedule &&
      state.bookingWindow &&
      !state.bookingLinkAvailabilityScheduleId
    ) {
      const availabilityScheduleCount =
        await getAvailabilityScheduleCount(client);
      if (availabilityScheduleCount !== 0) {
        throw new Error(
          `Unexpected non-empty AvailabilitySchedule table before ${MIGRATION_NAME}: ${availabilityScheduleCount} rows`,
        );
      }

      console.log(
        "[migration-recovery] Dropping empty AvailabilitySchedule table from failed retry.",
      );
      await client.query('DROP TABLE "AvailabilitySchedule"');
      await resolveMigration("rolled-back");
      return;
    }

    if (
      !state.availabilitySchedule ||
      !state.availabilityWindow ||
      !state.bookingLinkAvailabilityScheduleId
    ) {
      throw new Error(
        `Unexpected schema state for failed ${MIGRATION_NAME}: ${JSON.stringify(
          state,
        )}`,
      );
    }

    console.log(
      "[migration-recovery] Completing partially applied booking migration.",
    );
    await completePartialMigration(client, state);
    await resolveMigration("applied");
  } finally {
    await client.end();
  }
}

async function getFailedMigration(client) {
  try {
    const result = await client.query(
      `
        SELECT migration_name
        FROM "_prisma_migrations"
        WHERE migration_name = $1
          AND finished_at IS NULL
          AND rolled_back_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1
      `,
      [MIGRATION_NAME],
    );
    return result.rows[0] ?? null;
  } catch (error) {
    if (error.code === "42P01") return null;
    throw error;
  }
}

async function getSchemaState(client) {
  const result = await client.query(`
    SELECT
      to_regclass('"AvailabilitySchedule"') IS NOT NULL AS "availabilitySchedule",
      to_regclass('"AvailabilityWindow"') IS NOT NULL AS "availabilityWindow",
      to_regclass('"BookingWindow"') IS NOT NULL AS "bookingWindow",
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'BookingLink'
          AND column_name = 'availabilityScheduleId'
      ) AS "bookingLinkAvailabilityScheduleId",
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'BookingLink'
          AND column_name = 'timezone'
      ) AS "bookingLinkTimezone"
  `);
  return result.rows[0];
}

async function getAvailabilityScheduleCount(client) {
  const result = await client.query(
    'SELECT COUNT(*)::integer AS count FROM "AvailabilitySchedule"',
  );
  return result.rows[0]?.count ?? 0;
}

async function completePartialMigration(client, state) {
  await client.query("BEGIN");
  try {
    await client.query(`
      UPDATE "AvailabilityWindow" availability_window
      SET "availabilityScheduleId" = booking_link."availabilityScheduleId"
      FROM "BookingLink" booking_link
      WHERE availability_window."availabilityScheduleId" = booking_link.id
    `);

    await client.query(`
      DO $$
      BEGIN
        IF to_regclass('"AvailabilityWindow_bookingLinkId_idx"') IS NOT NULL THEN
          ALTER INDEX "AvailabilityWindow_bookingLinkId_idx"
            RENAME TO "AvailabilityWindow_availabilityScheduleId_idx";
        END IF;
      END $$;
    `);

    if (state.bookingLinkTimezone) {
      await client.query('ALTER TABLE "BookingLink" DROP COLUMN "timezone"');
    }

    await client.query(`
      CREATE INDEX IF NOT EXISTS "AvailabilitySchedule_emailAccountId_idx"
        ON "AvailabilitySchedule"("emailAccountId")
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS "AvailabilitySchedule_emailAccountId_isDefault_idx"
        ON "AvailabilitySchedule"("emailAccountId", "isDefault")
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "AvailabilitySchedule_emailAccountId_default_key"
        ON "AvailabilitySchedule"("emailAccountId")
        WHERE "isDefault" = true
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "AvailabilitySchedule_id_emailAccountId_key"
        ON "AvailabilitySchedule"("id", "emailAccountId")
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS "BookingLink_availabilityScheduleId_idx"
        ON "BookingLink"("availabilityScheduleId")
    `);

    await addConstraintIfMissing(
      client,
      "AvailabilitySchedule_emailAccountId_fkey",
      `ALTER TABLE "AvailabilitySchedule"
         ADD CONSTRAINT "AvailabilitySchedule_emailAccountId_fkey"
         FOREIGN KEY ("emailAccountId")
         REFERENCES "EmailAccount"("id")
         ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await addConstraintIfMissing(
      client,
      "BookingLink_availabilityScheduleId_emailAccountId_fkey",
      `ALTER TABLE "BookingLink"
         ADD CONSTRAINT "BookingLink_availabilityScheduleId_emailAccountId_fkey"
         FOREIGN KEY ("availabilityScheduleId", "emailAccountId")
         REFERENCES "AvailabilitySchedule"("id", "emailAccountId")
         ON DELETE NO ACTION ON UPDATE CASCADE`,
    );
    await addConstraintIfMissing(
      client,
      "AvailabilityWindow_availabilityScheduleId_fkey",
      `ALTER TABLE "AvailabilityWindow"
         ADD CONSTRAINT "AvailabilityWindow_availabilityScheduleId_fkey"
         FOREIGN KEY ("availabilityScheduleId")
         REFERENCES "AvailabilitySchedule"("id")
         ON DELETE CASCADE ON UPDATE CASCADE`,
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function addConstraintIfMissing(client, constraintName, sql) {
  const result = await client.query(
    "SELECT 1 FROM pg_constraint WHERE conname = $1",
    [constraintName],
  );
  if (result.rowCount === 0) {
    await client.query(sql);
  }
}

async function resolveMigration(status) {
  execFileSync(
    "pnpm",
    [
      "exec",
      "prisma",
      "migrate",
      "resolve",
      `--${status}`,
      MIGRATION_NAME,
      "--schema",
      "prisma/schema.prisma",
    ],
    {
      cwd: `${__dirname}/..`,
      stdio: "inherit",
    },
  );
}

main().catch((error) => {
  console.error("[migration-recovery] Failed to recover migration.");
  console.error(error);
  process.exit(1);
});
