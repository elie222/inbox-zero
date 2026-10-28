-- Update the stock marketing prompt; preserve customized instructions.
UPDATE "Rule"
SET "updatedAt" = CURRENT_TIMESTAMP,
    "instructions" = 'Marketing: Promotions, sales, and offers that can be safely archived. Exclude emails whose main purpose is account access, a transaction, or a service update, even if they include promotional content.'
WHERE "systemType" = 'MARKETING'
  AND "instructions" = 'Marketing: Promotional emails about products, services, sales, or offers';
