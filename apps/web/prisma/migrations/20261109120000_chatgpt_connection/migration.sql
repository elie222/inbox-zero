CREATE TABLE "ChatGptConnection" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hostId" TEXT NOT NULL,
    "clientId" TEXT,
    "subject" TEXT,
    "email" TEXT,
    "scope" TEXT,
    "idToken" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "importedTokenHash" TEXT,
    CONSTRAINT "ChatGptConnection_pkey" PRIMARY KEY ("id")
);
