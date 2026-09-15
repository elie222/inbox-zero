-- Validate existing owners separately so the scan permits authentication writes.
ALTER TABLE "ssoProvider" VALIDATE CONSTRAINT "ssoProvider_userId_fkey";
