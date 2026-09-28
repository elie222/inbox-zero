DROP TABLE "MailboxPushDevice";

DROP TYPE "MailboxPushPlatform";
DROP TYPE "MailboxPushEnvironment";

CREATE TYPE "ApnsEnvironment" AS ENUM ('sandbox', 'production');

ALTER TABLE "MobilePushToken"
ADD COLUMN "appVersion" TEXT,
ADD COLUMN "environment" "ApnsEnvironment";

CREATE TABLE "_EmailAccountToMobilePushToken" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EmailAccountToMobilePushToken_AB_pkey" PRIMARY KEY ("A", "B")
);

CREATE INDEX "_EmailAccountToMobilePushToken_B_index" ON "_EmailAccountToMobilePushToken"("B");

ALTER TABLE "_EmailAccountToMobilePushToken"
ADD CONSTRAINT "_EmailAccountToMobilePushToken_A_fkey"
FOREIGN KEY ("A") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_EmailAccountToMobilePushToken"
ADD CONSTRAINT "_EmailAccountToMobilePushToken_B_fkey"
FOREIGN KEY ("B") REFERENCES "MobilePushToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
