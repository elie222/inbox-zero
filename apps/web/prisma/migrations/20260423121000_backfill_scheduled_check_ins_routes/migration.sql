WITH scheduled_check_in_routes AS (
  SELECT DISTINCT ON (aj."messagingChannelId")
    'mr_' || md5(aj."messagingChannelId" || ':SCHEDULED_CHECK_INS') AS "id",
    CURRENT_TIMESTAMP AS "createdAt",
    CURRENT_TIMESTAMP AS "updatedAt",
    'SCHEDULED_CHECK_INS'::"MessagingRoutePurpose" AS "purpose",
    rn."targetType",
    rn."targetId",
    aj."messagingChannelId"
  FROM "AutomationJob" aj
  INNER JOIN "MessagingRoute" rn
    ON rn."messagingChannelId" = aj."messagingChannelId"
   AND rn."purpose" = 'RULE_NOTIFICATIONS'::"MessagingRoutePurpose"
)
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
  "id",
  "createdAt",
  "updatedAt",
  "purpose",
  "targetType",
  "targetId",
  "messagingChannelId"
FROM scheduled_check_in_routes
ON CONFLICT ("messagingChannelId", "purpose") DO NOTHING;
