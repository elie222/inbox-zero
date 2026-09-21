-- Update the stock receipt instructions; preserve customized instructions.
UPDATE "Rule"
SET "updatedAt" = CURRENT_TIMESTAMP,
    "instructions" = 'Receipts: Purchase confirmations, payment receipts, card charge notices, invoices or other records of money I paid'
WHERE "systemType" = 'RECEIPT'
  AND "instructions" = 'Receipts: Purchase confirmations, payment receipts, transaction records or invoices';
