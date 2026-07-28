-- The card gains an HQ row and social links, and gains somewhere to hold
-- details a visitor hands back through the Exchange form. Those land as
-- PENDING and only become a Contact once the card's owner accepts them, so an
-- anonymous stranger can never write straight into an address book.
CREATE TYPE "ContactCardExchangeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'IGNORED');

ALTER TABLE "ContactCard" ADD COLUMN "location" TEXT;
ALTER TABLE "ContactCard" ADD COLUMN "linkedinUrl" TEXT;
ALTER TABLE "ContactCard" ADD COLUMN "xUrl" TEXT;
ALTER TABLE "ContactCard" ADD COLUMN "instagramUrl" TEXT;

CREATE TABLE "ContactCardExchange" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "companyTitle" TEXT,
    "note" TEXT,
    "status" "ContactCardExchangeStatus" NOT NULL DEFAULT 'PENDING',
    "cardId" TEXT NOT NULL,

    CONSTRAINT "ContactCardExchange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContactCardExchange_cardId_status_idx" ON "ContactCardExchange"("cardId", "status");

ALTER TABLE "ContactCardExchange" ADD CONSTRAINT "ContactCardExchange_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "ContactCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
