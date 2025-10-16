-- Delete TRACK_THREAD records before removing enum value
DELETE FROM "DigestItem" 
WHERE "actionId" IN (
  SELECT id FROM "ExecutedAction" WHERE "type" = 'TRACK_THREAD'
);

DELETE FROM "ScheduledAction" 
WHERE "actionType" = 'TRACK_THREAD' 
   OR "executedActionId" IN (
     SELECT id FROM "ExecutedAction" WHERE "type" = 'TRACK_THREAD'
   );

DELETE FROM "Action" WHERE "type" = 'TRACK_THREAD';
DELETE FROM "ExecutedAction" WHERE "type" = 'TRACK_THREAD';

-- Remove TRACK_THREAD from ActionType enum
BEGIN;
CREATE TYPE "ActionType_new" AS ENUM ('ARCHIVE', 'LABEL', 'REPLY', 'SEND_EMAIL', 'FORWARD', 'DRAFT_EMAIL', 'MARK_SPAM', 'CALL_WEBHOOK', 'MARK_READ', 'DIGEST', 'MOVE_FOLDER');
ALTER TABLE "Action" ALTER COLUMN "type" TYPE "ActionType_new" USING ("type"::text::"ActionType_new");
ALTER TABLE "ExecutedAction" ALTER COLUMN "type" TYPE "ActionType_new" USING ("type"::text::"ActionType_new");
ALTER TABLE "ScheduledAction" ALTER COLUMN "actionType" TYPE "ActionType_new" USING ("actionType"::text::"ActionType_new");
ALTER TYPE "ActionType" RENAME TO "ActionType_old";
ALTER TYPE "ActionType_new" RENAME TO "ActionType";
DROP TYPE "ActionType_old";
COMMIT;
