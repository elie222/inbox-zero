-- CreateTable
CREATE TABLE "CarddavExchange" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "depth" TEXT,
    "status" INTEGER NOT NULL,
    "responseBytes" INTEGER NOT NULL,
    "userAgent" TEXT,
    "detail" JSONB,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "CarddavExchange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CarddavExchange_emailAccountId_createdAt_idx" ON "CarddavExchange"("emailAccountId", "createdAt");

-- AddForeignKey
ALTER TABLE "CarddavExchange" ADD CONSTRAINT "CarddavExchange_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
