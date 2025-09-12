-- CreateTable
CREATE TABLE "public"."CalendarConnection" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "provider" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "isConnected" BOOLEAN NOT NULL DEFAULT true,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Calendar" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "calendarId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "primary" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT,
    "connectionId" TEXT NOT NULL,

    CONSTRAINT "Calendar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarConnection_emailAccountId_provider_email_key" ON "public"."CalendarConnection"("emailAccountId", "provider", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Calendar_connectionId_calendarId_key" ON "public"."Calendar"("connectionId", "calendarId");

-- AddForeignKey
ALTER TABLE "public"."CalendarConnection" ADD CONSTRAINT "CalendarConnection_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "public"."EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Calendar" ADD CONSTRAINT "Calendar_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "public"."CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
