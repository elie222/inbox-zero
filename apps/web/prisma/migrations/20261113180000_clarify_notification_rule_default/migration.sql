-- Update the stock notification prompt; preserve customized instructions.
UPDATE "Rule"
SET "updatedAt" = CURRENT_TIMESTAMP,
    "instructions" = 'Notifications: Alerts, status updates, or system messages sent automatically by a platform or service. A message a person wrote and sent to me, like a colleague''s status update, is not a notification.'
WHERE "systemType" = 'NOTIFICATION'
  AND "instructions" = 'Notifications: Alerts, status updates, or system messages';
