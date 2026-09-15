-- New messages can be scheduled before they belong to a thread. The thread is
-- recorded once the provider accepts the send.
ALTER TABLE "ScheduledEmail" ALTER COLUMN "threadId" DROP NOT NULL;
