-- Delete all records with TRACK_THREAD type before removing the enum value
DELETE FROM "Action" WHERE "type" = 'TRACK_THREAD';
DELETE FROM "ExecutedAction" WHERE "type" = 'TRACK_THREAD';
DELETE FROM "ScheduledAction" WHERE "actionType" = 'TRACK_THREAD';

/* - The values [TRACK_THREAD] on the enum `ActionType` will be removed. If these variants are still used in the database, this will fail. */

-- AlterEnum
BEGIN;
CREATE TYPE "ActionType_new" AS ENUM ('ARCHIVE', 'LABEL', 'REPLY', 'SEND_EMAIL', 'FORWARD', 'DRAFT_EMAIL', 'MARK_SPAM', 'CALL_WEBHOOK', 'MARK_READ', 'DIGEST', 'MOVE_FOLDER');
ALTER TABLE "Action" ALTER COLUMN "type" TYPE "ActionType_new" USING ("type"::text::"ActionType_new");
ALTER TABLE "ExecutedAction" ALTER COLUMN "type" TYPE "ActionType_new" USING ("type"::text::"ActionType_new");
ALTER TABLE "ScheduledAction" ALTER COLUMN "actionType" TYPE "ActionType_new" USING ("actionType"::text::"ActionType_new");
ALTER TYPE "ActionType" RENAME TO "ActionType_old";
ALTER TYPE "ActionType_new" RENAME TO "ActionType";
DROP TYPE "ActionType_old";
COMMIT;
