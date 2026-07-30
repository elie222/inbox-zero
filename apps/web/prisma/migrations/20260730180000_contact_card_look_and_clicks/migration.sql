-- Look & feel chosen in the My Card drawer
ALTER TABLE "ContactCard" ADD COLUMN "avatarMode" TEXT NOT NULL DEFAULT 'initials';
ALTER TABLE "ContactCard" ADD COLUMN "avatarShape" TEXT NOT NULL DEFAULT 'circle';
ALTER TABLE "ContactCard" ADD COLUMN "nameFont" TEXT NOT NULL DEFAULT 'serif';
ALTER TABLE "ContactCard" ADD COLUMN "accentColor" TEXT;
ALTER TABLE "ContactCard" ADD COLUMN "accentStripe" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ContactCard" ADD COLUMN "logoUrl" TEXT;

-- Cards that already show a photo keep showing it
UPDATE "ContactCard" SET "avatarMode" = 'photo' WHERE "photoUrl" IS NOT NULL;

-- Visitor taps on the public card (phone, email, save…)
CREATE TABLE "ContactCardClick" (
    "id" TEXT NOT NULL,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "day" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "visitorHash" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,

    CONSTRAINT "ContactCardClick_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContactCardClick_cardId_day_idx" ON "ContactCardClick"("cardId", "day");

ALTER TABLE "ContactCardClick" ADD CONSTRAINT "ContactCardClick_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "ContactCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
