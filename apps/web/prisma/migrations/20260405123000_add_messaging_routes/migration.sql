-- CreateEnum
CREATE TYPE "MessagingRoutePurpose" AS ENUM (
  'RULE_NOTIFICATIONS',
  'MEETING_BRIEFS',
  'DOCUMENT_FILINGS'
);

-- CreateEnum
CREATE TYPE "MessagingRouteTargetType" AS ENUM (
  'CHANNEL',
  'DIRECT_MESSAGE'
);

-- CreateTable
CREATE TABLE "MessagingRoute" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "purpose" "MessagingRoutePurpose" NOT NULL,
    "targetType" "MessagingRouteTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "messagingChannelId" TEXT NOT NULL,

    CONSTRAINT "MessagingRoute_pkey" PRIMARY KEY ("id")
);

-- Backfill the current per-channel destination as the rules route.
INSERT INTO "MessagingRoute" (
    "id",
    "createdAt",
    "updatedAt",
    "purpose",
    "targetType",
    "targetId",
    "messagingChannelId"
)
SELECT
    'mr_' || md5(mc.id || ':RULE_NOTIFICATIONS'),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    'RULE_NOTIFICATIONS'::"MessagingRoutePurpose",
    CASE
      WHEN mc.provider = 'SLACK' AND mc."channelId" = 'DM' THEN 'DIRECT_MESSAGE'::"MessagingRouteTargetType"
      WHEN mc.provider = 'SLACK' THEN 'CHANNEL'::"MessagingRouteTargetType"
      ELSE 'DIRECT_MESSAGE'::"MessagingRouteTargetType"
    END,
    CASE
      WHEN mc.provider = 'SLACK' AND mc."channelId" = 'DM' THEN mc."providerUserId"
      WHEN mc.provider = 'SLACK' THEN mc."channelId"
      WHEN mc.provider = 'TEAMS' THEN mc."providerUserId"
      ELSE COALESCE(NULLIF(mc."teamId", ''), mc."providerUserId")
    END,
    mc.id
FROM "MessagingChannel" AS mc
WHERE (
    mc.provider = 'SLACK'
    AND mc."channelId" IS NOT NULL
    AND (
      mc."channelId" <> 'DM'
      OR mc."providerUserId" IS NOT NULL
    )
  )
  OR (
    mc.provider = 'TEAMS'
    AND mc."providerUserId" IS NOT NULL
  )
  OR (
    mc.provider = 'TELEGRAM'
    AND COALESCE(NULLIF(mc."teamId", ''), mc."providerUserId") IS NOT NULL
  );

-- Backfill meeting brief routes from the currently enabled channels.
INSERT INTO "MessagingRoute" (
    "id",
    "createdAt",
    "updatedAt",
    "purpose",
    "targetType",
    "targetId",
    "messagingChannelId"
)
SELECT
    'mr_' || md5(mc.id || ':MEETING_BRIEFS'),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    'MEETING_BRIEFS'::"MessagingRoutePurpose",
    CASE
      WHEN mc.provider = 'SLACK' AND mc."channelId" = 'DM' THEN 'DIRECT_MESSAGE'::"MessagingRouteTargetType"
      WHEN mc.provider = 'SLACK' THEN 'CHANNEL'::"MessagingRouteTargetType"
      ELSE 'DIRECT_MESSAGE'::"MessagingRouteTargetType"
    END,
    CASE
      WHEN mc.provider = 'SLACK' AND mc."channelId" = 'DM' THEN mc."providerUserId"
      WHEN mc.provider = 'SLACK' THEN mc."channelId"
      WHEN mc.provider = 'TEAMS' THEN mc."providerUserId"
      ELSE COALESCE(NULLIF(mc."teamId", ''), mc."providerUserId")
    END,
    mc.id
FROM "MessagingChannel" AS mc
WHERE mc."sendMeetingBriefs" = true
  AND (
    (
      mc.provider = 'SLACK'
      AND mc."channelId" IS NOT NULL
      AND (
        mc."channelId" <> 'DM'
        OR mc."providerUserId" IS NOT NULL
      )
    )
    OR (
      mc.provider = 'TEAMS'
      AND mc."providerUserId" IS NOT NULL
    )
    OR (
      mc.provider = 'TELEGRAM'
      AND COALESCE(NULLIF(mc."teamId", ''), mc."providerUserId") IS NOT NULL
    )
  );

-- Backfill document filing routes from the currently enabled channels.
INSERT INTO "MessagingRoute" (
    "id",
    "createdAt",
    "updatedAt",
    "purpose",
    "targetType",
    "targetId",
    "messagingChannelId"
)
SELECT
    'mr_' || md5(mc.id || ':DOCUMENT_FILINGS'),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    'DOCUMENT_FILINGS'::"MessagingRoutePurpose",
    CASE
      WHEN mc.provider = 'SLACK' AND mc."channelId" = 'DM' THEN 'DIRECT_MESSAGE'::"MessagingRouteTargetType"
      WHEN mc.provider = 'SLACK' THEN 'CHANNEL'::"MessagingRouteTargetType"
      ELSE 'DIRECT_MESSAGE'::"MessagingRouteTargetType"
    END,
    CASE
      WHEN mc.provider = 'SLACK' AND mc."channelId" = 'DM' THEN mc."providerUserId"
      WHEN mc.provider = 'SLACK' THEN mc."channelId"
      WHEN mc.provider = 'TEAMS' THEN mc."providerUserId"
      ELSE COALESCE(NULLIF(mc."teamId", ''), mc."providerUserId")
    END,
    mc.id
FROM "MessagingChannel" AS mc
WHERE mc."sendDocumentFilings" = true
  AND (
    (
      mc.provider = 'SLACK'
      AND mc."channelId" IS NOT NULL
      AND (
        mc."channelId" <> 'DM'
        OR mc."providerUserId" IS NOT NULL
      )
    )
    OR (
      mc.provider = 'TEAMS'
      AND mc."providerUserId" IS NOT NULL
    )
    OR (
      mc.provider = 'TELEGRAM'
      AND COALESCE(NULLIF(mc."teamId", ''), mc."providerUserId") IS NOT NULL
    )
  );

-- CreateIndex
CREATE UNIQUE INDEX "MessagingRoute_messagingChannelId_purpose_key"
ON "MessagingRoute"("messagingChannelId", "purpose");

-- AddForeignKey
ALTER TABLE "MessagingRoute"
ADD CONSTRAINT "MessagingRoute_messagingChannelId_fkey"
FOREIGN KEY ("messagingChannelId") REFERENCES "MessagingChannel"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "MessagingChannel"
DROP COLUMN "channelId",
DROP COLUMN "channelName",
DROP COLUMN "sendMeetingBriefs",
DROP COLUMN "sendDocumentFilings";
