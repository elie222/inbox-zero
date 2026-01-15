-- AlterTable: Change follow-up days columns from INTEGER to DOUBLE PRECISION to support fractional days
ALTER TABLE "EmailAccount" ALTER COLUMN "followUpAwaitingReplyDays" TYPE DOUBLE PRECISION;
ALTER TABLE "EmailAccount" ALTER COLUMN "followUpNeedsReplyDays" TYPE DOUBLE PRECISION;
