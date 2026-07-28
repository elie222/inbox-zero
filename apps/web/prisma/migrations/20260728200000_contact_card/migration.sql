-- The user's own digital business card, plus per-view rows so the card can
-- report total views, unique visitors, and a daily trend.
CREATE TABLE "ContactCard" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayName" TEXT NOT NULL,
    "headline" TEXT,
    "title" TEXT,
    "companyName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "photoUrl" TEXT,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "ContactCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContactCardView" (
    "id" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "day" DATE NOT NULL,
    "visitorHash" TEXT NOT NULL,
    "referrer" TEXT,
    "cardId" TEXT NOT NULL,

    CONSTRAINT "ContactCardView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactCard_slug_key" ON "ContactCard"("slug");

CREATE UNIQUE INDEX "ContactCard_emailAccountId_key" ON "ContactCard"("emailAccountId");

-- One counted view per visitor per day, so a refresh doesn't inflate stats
CREATE UNIQUE INDEX "ContactCardView_cardId_visitorHash_day_key" ON "ContactCardView"("cardId", "visitorHash", "day");

CREATE INDEX "ContactCardView_cardId_day_idx" ON "ContactCardView"("cardId", "day");

ALTER TABLE "ContactCard" ADD CONSTRAINT "ContactCard_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContactCardView" ADD CONSTRAINT "ContactCardView_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "ContactCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
