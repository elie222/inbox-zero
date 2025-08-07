-- Better Auth Migration
-- Update provider values to match Better Auth expectations
UPDATE "Account" 
SET "provider" = 'microsoft' 
WHERE "provider" = 'microsoft-entra-id';

-- Add default value to type column in Account table
ALTER TABLE "Account" ALTER COLUMN "type" SET DEFAULT 'oidc';

-- Change expires_at from Int to DateTime with default
ALTER TABLE "Account" ALTER COLUMN "expires_at" TYPE TIMESTAMP(3) USING 
  CASE WHEN "expires_at" IS NOT NULL 
    THEN to_timestamp("expires_at") 
    ELSE NULL 
  END;
ALTER TABLE "Account" ALTER COLUMN "expires_at" SET DEFAULT now();

-- Add new columns to Session table
ALTER TABLE "Session" ADD COLUMN "ipAddress" TEXT;
ALTER TABLE "Session" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "Session" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Session" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL;

-- Change emailVerified from DateTime to Boolean
ALTER TABLE "User" ALTER COLUMN "emailVerified" TYPE BOOLEAN USING 
  CASE WHEN "emailVerified" IS NOT NULL 
    THEN true 
    ELSE false 
  END;
ALTER TABLE "User" ALTER COLUMN "emailVerified" SET DEFAULT false;

-- Add new columns to VerificationToken table
ALTER TABLE "VerificationToken"
  ADD COLUMN "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  ADD PRIMARY KEY ("id");
ALTER TABLE "VerificationToken" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "VerificationToken" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL; 